#!/usr/bin/env node
// JBIT's Codex CLI command hook. argv[2] is the Codex event name; the event's JSON comes on stdin. It runs the Claude
// hook's handlers through the host-neutral core (`hosts/core/`) and answers in Codex's words on stdout:
// - UserPromptSubmit → {"hookSpecificOutput":{"hookEventName":"UserPromptSubmit","additionalContext"}}: the plan's `## Now`
// - PreToolUse       → {"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny",…}} or nothing
// - Stop             → {"decision":"block","reason"} while autopilot carries on; the reason carries `## Now` too, since
//                      Codex runs no UserPromptSubmit on a continuation. Codex has no cap, so this hook keeps one.
// - SessionStart     → nothing: every prompt carries the plan
// It fails closed and never exits 1, which Codex reads as allow: a crash, unreadable stdin, no project or no data
// folder denies a PreToolUse; elsewhere it adds nothing. Nothing but the answer goes to stdout.
import { realpathSync, statSync } from 'node:fs'
import { isAbsolute } from 'node:path'
import { fileURLToPath } from 'node:url'
import { codexHomeOf, mapTool } from './map.mjs'

const CRASH = "JBIT's hook failed on this call, so the call doesn't run (its guard fails closed). Retry it; if it keeps failing, tell the user."
const NO_PROJECT = tool => `JBIT blocked \`${tool}\`: the hook couldn't tell which project this is (no usable \`cwd\` on the event), so it can't check the plan's gates and fails closed.`
const NO_DATA = tool => `JBIT blocked \`${tool}\`: the hook has no data folder (Codex sets PLUGIN_DATA for a plugin's hooks), so it can't keep the session's state and fails closed. Tell the user JBIT's hooks need to run from the installed plugin.`
const WATCHDOG_MS = (() => {
  const n = Number(process.env.JBIT_HOOK_WATCHDOG_MS)
  return Number.isInteger(n) && n > 0 && n < 25000 ? n : 25000
})()
/** Stop blocks per user prompt before the hook lets the turn end. */
export const STOP_CAP = 8

const deny = reason => ({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: reason } })

/** The project: the event's `cwd`, absolute and a directory. Its real path, or undefined. */
export function projectDir(input) {
  const dir = input?.cwd
  if (typeof dir !== 'string' || !dir || !isAbsolute(dir)) return undefined
  try {
    const real = realpathSync(dir)
    return statSync(real).isDirectory() ? real : undefined
  } catch {
    return undefined
  }
}

const dataDir = (env = process.env) => env.PLUGIN_DATA || env.CLAUDE_PLUGIN_DATA || undefined

async function core(input, project) {
  const { createCore } = await import('../core/index.mjs')
  return createCore({ projectDir: project, dataDir: dataDir(), sessionId: typeof input.session_id === 'string' ? input.session_id : 'unknown' })
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

async function PreToolUse(input, project) {
  const tool = input.tool_name
  if (typeof tool !== 'string' || !tool) return deny(CRASH)
  const r = mapTool(tool, input.tool_input, project ?? '/', { codexHome: codexHomeOf() })
  if (r.kind === 'allow') return {}
  if (r.kind === 'deny') return deny(r.reason)
  if (!project) return deny(NO_PROJECT(tool))
  if (!dataDir()) return deny(NO_DATA(tool))
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
  // Codex has no answer that adds context to an allowed call: it rides on the next prompt or continuation
  await keepNotices(c, context.filter(t => typeof t === 'string' && t))
  return {}
}

async function UserPromptSubmit(input, project) {
  if (!project || !dataDir()) return {}
  const c = await core(input, project)
  // a new prompt from the user: the continuation count starts again
  await c.host.set('stopBlocks', undefined)
  const res = await c.run({ kind: 'prompt', text: typeof input.prompt === 'string' ? input.prompt : '', origin: 'composer' })
  const context = [...res.context, ...(await takeNotices(c)), ...res.notices]
  if (!context.length) return {}
  return { hookSpecificOutput: { hookEventName: 'UserPromptSubmit', additionalContext: context.join('\n\n') } }
}

async function Stop(input, project) {
  if (!project || !dataDir()) return {}
  return stopWith(await core(input, project))
}

/** The Stop answer from a core: a block carrying `## Now`, counted only once it is the answer. */
export async function stopWith(c) {
  const res = await c.run({ kind: 'stop', reason: 'answer' })
  const notices = Array.isArray(res.notices) ? res.notices : []
  if (res.decision !== 'block') {
    await keepNotices(c, notices)
    return {}
  }
  const blocks = Number(await c.host.get('stopBlocks')) || 0
  if (blocks >= STOP_CAP) {
    await keepNotices(c, [...notices, `JBIT autopilot stopped carrying on by itself after ${STOP_CAP} continuations in one turn; a new prompt resumes it.`])
    return {}
  }
  const reason = typeof res.reason === 'string' ? res.reason : ''
  // the continuation is autopilot's own prompt: it goes through the prompt handlers as the plugin's, and what they add
  // (the plan's `## Now` first) rides in the reason, the only context a continuation gets
  const next = await c.run({ kind: 'prompt', text: reason, origin: 'plugin' })
  const taken = await takeNotices(c)
  const extra = [...(next.context ?? []), ...taken, ...notices, ...(next.notices ?? [])].filter(t => typeof t === 'string' && t && !reason.includes(t))
  const text = [reason, ...extra].filter(Boolean).join('\n\n')
  if (!text) {
    // nothing to carry on with: no block, so none counted, and the notices wait for the next prompt
    await keepNotices(c, taken)
    return {}
  }
  await c.host.set('stopBlocks', blocks + 1)
  return { decision: 'block', reason: text }
}

const SessionStart = async () => ({})

const EVENTS = { PreToolUse, UserPromptSubmit, Stop, SessionStart }

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
function nodeTooOld(event, message) {
  const text = message.replace("JBIT's Copilot hook", "JBIT's Codex hook")
  if (event === 'PreToolUse') return deny(text)
  if (event === 'UserPromptSubmit') return { hookSpecificOutput: { hookEventName: 'UserPromptSubmit', additionalContext: text } }
  return {}
}

function answer(out) {
  const text = out && Object.keys(out).length ? `${JSON.stringify(out)}\n` : ''
  process.stdout.write(text, () => process.exit(0))
}

async function main() {
  const event = process.argv[2]
  const failed = () => (event === 'PreToolUse' ? deny(CRASH) : {})
  let done = false
  const finish = out => {
    if (done) return
    done = true
    answer(out)
  }
  // a hook that hangs fails closed before Codex's own timeout decides for it
  setTimeout(() => finish(failed()), WATCHDOG_MS)
  process.on('uncaughtException', () => finish(failed()))
  process.on('unhandledRejection', () => finish(failed()))
  try {
    const raw = await readStdin()
    finish(await handle(event, raw))
  } catch (err) {
    process.stderr.write(`jbit hook: ${event}: ${String(err?.message ?? err).split('\n')[0].slice(0, 200)}\n`)
    finish(err?.code === 'JBIT_NODE' ? nodeTooOld(event, err.message) : failed())
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
