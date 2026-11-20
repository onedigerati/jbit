#!/usr/bin/env node
// JBIT's Copilot CLI command hook. argv[2] is the Copilot event name; the event's JSON comes on stdin. It runs the Claude
// hook's handlers through the host-neutral core (`hosts/core/`) and answers in Copilot's words on stdout:
// - userPromptTransformed → {"modifiedTransformedPrompt"}: the plan's `## Now` (and what the handlers add) appended
// - sessionStart          → {"additionalContext"}
// - preToolUse            → {"permissionDecision":"deny","permissionDecisionReason"} or nothing (Copilot decides)
// - postToolUse           → {"additionalContext"}: what a tool call's handlers added once it was allowed
// - agentStop             → {"decision":"block","reason"} while autopilot carries on
// It fails closed: no project directory or a crash denies a guarded tool and adds no context. Nothing but the answer
// goes to stdout.
import { realpathSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { isAbsolute, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { GUARDED, mapTool } from './map.mjs'

const CRASH = "JBIT's hook failed on this call, so the call doesn't run (its guard fails closed). Retry it; if it keeps failing, tell the user."
const NO_PROJECT = tool =>
  `JBIT blocked \`${tool}\`: the hook couldn't tell which project this is (no \`cwd\` on the event and no COPILOT_PROJECT_DIR), so it can't check the plan's gates and fails closed.`
const WATCHDOG_MS = 25000
const POST_KEEP = 200

const deny = reason => ({ permissionDecision: 'deny', permissionDecisionReason: reason })

/** The project: the event's `cwd`, then COPILOT_PROJECT_DIR; never the process's own directory. Its real path, or undefined. */
export function projectDir(input, env = process.env) {
  for (const dir of [input?.cwd, env.COPILOT_PROJECT_DIR]) {
    if (typeof dir !== 'string' || !dir || !isAbsolute(dir)) continue
    try {
      const real = realpathSync(dir)
      if (statSync(real).isDirectory()) return real
    } catch {
      // a directory that isn't there is no project
    }
  }
  return undefined
}

const dataDir = (env = process.env) => env.COPILOT_PLUGIN_DATA || env.CLAUDE_PLUGIN_DATA || join(homedir(), '.copilot', 'jbit-data')

async function core(input, project) {
  const { createCore } = await import('../core/index.mjs')
  return createCore({ projectDir: project, dataDir: dataDir(), sessionId: typeof input.sessionId === 'string' ? input.sessionId : 'unknown' })
}

/** Notices an earlier call raised that no answer could carry yet. */
async function takeNotices(c) {
  const pending = (await c.host.get('notices')) ?? []
  if (pending.length) await c.host.set('notices', undefined)
  return Array.isArray(pending) ? pending.filter(n => typeof n === 'string') : []
}

async function keepNotices(c, notices) {
  if (!notices.length) return
  const pending = (await c.host.get('notices')) ?? []
  await c.host.set('notices', [...(Array.isArray(pending) ? pending : []), ...notices].slice(-20))
}

async function preToolUse(input, project) {
  const tool = input.toolName
  if (typeof tool !== 'string' || !tool) return deny(CRASH)
  if (!project) {
    const r = mapTool(tool, input.toolArgs, '/')
    // reading, and a skill (which only loads instructions), need no project; anything guarded does
    if (r.kind === 'allow' || (tool === 'skill' && r.kind === 'calls')) return {}
    return deny(r.kind === 'deny' ? r.reason : NO_PROJECT(tool))
  }
  const r = mapTool(tool, input.toolArgs, project)
  if (r.kind === 'allow') return {}
  if (r.kind === 'deny') return deny(r.reason)
  const c = await core(input, project)
  const context = []
  for (const call of r.calls) {
    const res = await c.run({ kind: 'tool', call })
    if (res.decision === 'deny') {
      await keepNotices(c, res.notices)
      return deny(res.reason || CRASH)
    }
    context.push(...res.context, ...res.notices)
  }
  // what an allowed call's handlers add rides on its postToolUse
  if (context.length && typeof input.toolCallId === 'string') {
    await c.host.set(`post:${input.toolCallId}`, context)
    // a call whose postToolUse never came leaves its key: only the newest are kept
    await c.host.prune('post:', POST_KEEP)
  }
  return {}
}

async function postToolUse(input, project) {
  if (!project || typeof input.toolCallId !== 'string' || !GUARDED.has(input.toolName)) return {}
  const c = await core(input, project)
  const key = `post:${input.toolCallId}`
  const context = (await c.host.get(key)) ?? []
  if (!context.length) return {}
  await c.host.set(key, undefined)
  return { additionalContext: context.join('\n\n') }
}

async function userPromptTransformed(input, project) {
  if (!project || typeof input.transformedPrompt !== 'string') return {}
  const c = await core(input, project)
  const text = typeof input.prompt === 'string' ? input.prompt : ''
  // the prompt an agentStop block sent is autopilot's own, not the user's: it sets no level and approves nothing
  const block = await c.host.get('lastBlock')
  const ours = typeof block === 'string' && block && text.trim().startsWith(block.trim())
  if (ours) await c.host.set('lastBlock', undefined)
  const res = await c.run({ kind: 'prompt', text, origin: ours ? 'plugin' : 'composer' })
  const context = [...res.context, ...(await takeNotices(c)), ...res.notices]
  if (!context.length) return {}
  return { modifiedTransformedPrompt: `${input.transformedPrompt}\n\n${context.join('\n\n')}` }
}

async function sessionStart(input, project) {
  if (!project) return {}
  const c = await core(input, project)
  const res = await c.run({ kind: 'compose' })
  return res.context.length ? { additionalContext: res.context.join('\n\n') } : {}
}

async function agentStop(input, project) {
  if (!project) return {}
  const c = await core(input, project)
  const reason = input.stopReason === undefined || input.stopReason === 'end_turn' ? 'answer' : String(input.stopReason)
  const res = await c.run({ kind: 'stop', reason })
  await keepNotices(c, res.notices)
  if (res.decision !== 'block') return {}
  await c.host.set('lastBlock', res.reason)
  return { decision: 'block', reason: res.reason }
}

const EVENTS = { preToolUse, postToolUse, userPromptTransformed, sessionStart, agentStop }

async function readStdin() {
  const chunks = []
  for await (const chunk of process.stdin) chunks.push(chunk)
  return Buffer.concat(chunks).toString('utf8')
}

/** The answer for one event, as the object to print; throws on anything it can't handle. */
export async function handle(event, raw) {
  const fn = EVENTS[event]
  if (!fn) return {}
  const input = JSON.parse(raw)
  if (input === null || typeof input !== 'object' || Array.isArray(input)) throw new Error('event is not an object')
  return fn(input, projectDir(input))
}

/** A Node that can't load the hook: a guarded call is refused and a prompt is told why, in the hook's words. */
function nodeTooOld(event, raw, message) {
  if (event === 'preToolUse') return deny(message)
  let input
  try {
    input = JSON.parse(raw)
  } catch {
    return {}
  }
  if (event === 'userPromptTransformed' && typeof input?.transformedPrompt === 'string') return { modifiedTransformedPrompt: `${input.transformedPrompt}\n\n${message}` }
  if (event === 'sessionStart') return { additionalContext: message }
  return {}
}

function answer(out) {
  const text = out && Object.keys(out).length ? `${JSON.stringify(out)}\n` : ''
  process.stdout.write(text, () => process.exit(0))
}

async function main() {
  const event = process.argv[2]
  const failed = () => (event === 'preToolUse' ? deny(CRASH) : {})
  let done = false
  const finish = out => {
    if (done) return
    done = true
    answer(out)
  }
  // a hook that hangs fails closed before the host's own timeout decides for it
  setTimeout(() => finish(failed()), WATCHDOG_MS)
  process.on('uncaughtException', () => finish(failed()))
  process.on('unhandledRejection', () => finish(failed()))
  let raw = ''
  try {
    raw = await readStdin()
    finish(await handle(event, raw))
  } catch (err) {
    process.stderr.write(`jbit hook: ${event}: ${String(err?.message ?? err).split('\n')[0].slice(0, 200)}\n`)
    finish(err?.code === 'JBIT_NODE' ? nodeTooOld(event, raw, err.message) : failed())
  }
}

const invoked = (() => {
  try {
    return !!process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))
  } catch {
    return false
  }
})()
if (invoked) main()
