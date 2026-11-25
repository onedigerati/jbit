// JBIT's Antigravity CLI (`agy`) hook handler, loaded by the entry script (`hook.mjs`) inside its try/catch, so a
// module that fails to load (a syntax error here, in map.mjs or in the core) still fails closed. It runs the Claude
// hook's handlers through the host-neutral core (`hosts/core/`) and answers in agy's words (stage-1 spike):
// - PreInvocation → {"injectSteps":[{"systemMessage":{"systemMessage":"<text>"}}]}: the plan's `## Now` on a prompt's
//                   first model call only (`invocationNum` 0), since an injected step persists in the conversation;
//                   on later calls, only notices an earlier call raised
// - PreToolUse    → {"decision":"allow"} or {"decision":"deny","reason"}, always explicit: agy allows a call when the
//                   hook prints nothing
// - Stop          → {"decision":"continue","reason"} while autopilot carries on; agy honours 10 per prompt and its
//                   `continuationActive` never flips, so this hook counts its own (STOP_CAP), reset on a new prompt
// - SessionStart, PostInvocation, PostToolUse → {} (a subagent's SessionStart notes its parent: sessionFor)
// A crash, no project or no data folder denies a PreToolUse; elsewhere it adds nothing.
import { closeSync, openSync, readdirSync, readSync, realpathSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, isAbsolute, join } from 'node:path'
import { guardOf, mapTool } from './map.mjs'

const CRASH = "JBIT's hook failed on this call, so the call doesn't run (its guard fails closed). Retry it; if it keeps failing, tell the user."
const NO_PROJECT = tool => `JBIT blocked \`${tool}\`: the hook couldn't tell which project this is (no usable \`cwd\` on the event), so it can't check the plan's gates and fails closed.`
const NO_DATA = tool => `JBIT blocked \`${tool}\`: the hook has no data folder (Antigravity sets PLUGIN_DATA for a plugin's hooks), so it can't keep the session's state and fails closed. Tell the user JBIT's hooks need to run from the installed plugin.`
/** Stop continues per user prompt before the hook lets the turn end: under agy's own 10, as on Codex and Copilot. */
export const STOP_CAP = 8
/** The `timeout` (seconds) the package's hooks.json gives every hook; hook.mjs answers by its own watchdog first. */
export const HOOK_TIMEOUT_SEC = 30

export const allow = () => ({ decision: 'allow' })
export const deny = reason => ({ decision: 'deny', reason: typeof reason === 'string' && reason ? reason : CRASH })
const inject = text => ({ injectSteps: [{ systemMessage: { systemMessage: text } }] })

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

const dataDir = (env = process.env) => env.PLUGIN_DATA || undefined

/** The session is agy's conversation; a subagent runs as a conversation of its own (see sessionFor). */
const conversation = input => (typeof input.conversationId === 'string' && input.conversationId ? input.conversationId : 'unknown')

async function core(input, project, sessionId = conversation(input)) {
  const { createCore } = await import('../core/index.mjs')
  return createCore({ projectDir: project, dataDir: dataDir(), sessionId })
}

/** The payload carries the user's prompt: a subagent's carries `lastUserInput: ""` (stage-1 spike, finding 4). */
const fromUser = input => typeof input.lastUserInput === 'string' && input.lastUserInput !== ''
const ID = /^[A-Za-z0-9_-]{1,128}$/
/** How many parents up a nested subagent's chain is followed. */
const MAX_DEPTH = 4

/** The start of a file (up to `max` bytes), or undefined. */
function head(path, max = 1 << 20) {
  let fd
  try {
    fd = openSync(path, 'r')
    const buf = Buffer.alloc(max)
    return buf.toString('utf8', 0, readSync(fd, buf, 0, max, 0))
  } catch {
    return undefined
  } finally {
    if (fd !== undefined) closeSync(fd)
  }
}

/** A conversation id as agy writes one (a UUID); `sender=system` and the like name no conversation. */
const CONVERSATION = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
/** How many transcript lines are searched for agy's first message: JBIT's own injected step comes before it. */
const SCAN_LINES = 10
/**
 * agy's own message header, at the very start of a `source: "SYSTEM"` step's content: `<SYSTEM_MESSAGE>\n[Message]
 * timestamp=… sender=<id> priority=…`. Anchored, so a `sender=` inside the message's text (the parent's prompt, which
 * follows the header) never matches.
 */
const HEADER = /^The following is a <SYSTEM_MESSAGE> not actually sent by the user\.[^<]*<SYSTEM_MESSAGE>\n\[Message\] timestamp=[^\s]+ sender=([^\s]+) priority=/

/** The sender a transcript line names in agy's own message header, or undefined. Only agy's steps are trusted. */
function senderOf(line) {
  let step
  try {
    step = JSON.parse(line)
  } catch {
    return undefined
  }
  // JBIT's injection is `SYSTEM_SDK`, the user's prompt `USER_INPUT`, a model's `MODEL`: only agy's own `SYSTEM` counts
  if (step === null || typeof step !== 'object' || step.source !== 'SYSTEM' || step.type !== 'SYSTEM_MESSAGE' || typeof step.content !== 'string') return undefined
  return HEADER.exec(step.content)?.[1]
}

/**
 * The one parent the subagent's `.system_generated/messages/*.json` name: agy writes each as `{id, recipient, sender,
 * …}` (stage-2 fixes/02-subagent-link.txt). Undefined with none, with several (a child's reply makes two), or when the
 * sender's own brain doesn't list this subagent as one it started (so a parent never reads its child's reply as a link).
 */
function senderFromMessages(dir, id) {
  let names
  try {
    names = readdirSync(dir).filter(f => f.endsWith('.json')).slice(0, 50)
  } catch {
    return undefined
  }
  const senders = new Set()
  for (const f of names) {
    try {
      const m = JSON.parse(head(join(dir, f)) ?? '')
      if (m?.recipient === id && typeof m.sender === 'string' && CONVERSATION.test(m.sender) && m.sender !== id) senders.add(m.sender)
    } catch {}
  }
  if (senders.size !== 1) return undefined
  const [sender] = senders
  return spawned(join(dir, '../../..', sender), id) ? sender : undefined
}

/** The conversation at `brain` (its brain folder) started subagent `id`: agy lists it in `.system_generated/subagents/`. */
function spawned(brain, id) {
  try {
    return JSON.parse(head(join(brain, '.system_generated/subagents', `${id}.json`)) ?? '')?.conversationId === id
  } catch {
    return false
  }
}

/**
 * The conversation that started a subagent, as agy names it: the `sender=<id>` of the first agy-authored message in
 * its transcript (`source: "SYSTEM"`, in the first SCAN_LINES lines: JBIT's own PreInvocation step, `SYSTEM_SDK`, comes
 * first), else the one `"sender"` its `.system_generated/messages/*.json` name. The payload has no parent link; the
 * transcript is the payload's `transcriptPath`, its `transcript.jsonl` sibling, or `~/.gemini/antigravity-cli/brain/
 * <conversationId>/.system_generated/logs/`. Undefined when none is found, and the caller fails closed.
 */
export function parentFromTranscript(input, home = homedir()) {
  const id = conversation(input)
  const paths = []
  const generated = []
  if (typeof input.transcriptPath === 'string' && isAbsolute(input.transcriptPath)) {
    paths.push(input.transcriptPath, join(dirname(input.transcriptPath), 'transcript.jsonl'))
    generated.push(dirname(dirname(input.transcriptPath)))
  }
  if (ID.test(id)) {
    const g = join(home, '.gemini/antigravity-cli/brain', id, '.system_generated')
    for (const f of ['transcript.jsonl', 'transcript_full.jsonl']) paths.push(join(g, 'logs', f))
    generated.push(g)
  }
  for (const p of paths) {
    for (const line of head(p)?.split('\n').slice(0, SCAN_LINES) ?? []) {
      const sender = senderOf(line)
      if (sender !== undefined && CONVERSATION.test(sender) && sender !== id) return sender
    }
  }
  for (const g of generated) {
    const sender = senderFromMessages(join(g, 'messages'), id)
    if (sender) return sender
  }
  return undefined
}

/**
 * The parent conversation whose session a subagent's calls are judged in: cached in the subagent's own state on first
 * sight (its SessionStart, before it has run a tool), and followed up a nested chain to a conversation the hook saw the
 * user prompt. Undefined when none is found.
 */
async function parentOf(input, mine, project) {
  let id = await mine.host.get('parent')
  if (typeof id !== 'string' || !ID.test(id)) {
    id = parentFromTranscript(input)
    if (!id) return undefined
  }
  const seen = new Set([conversation(input)])
  for (let p = id, depth = 0; p && depth < MAX_DEPTH && !seen.has(p); depth++) {
    seen.add(p)
    const c = await core(input, project, p)
    if ((await c.host.get('prompted')) === true) {
      if ((await mine.host.get('parent')) !== id) await mine.host.set('parent', id)
      return { id: p, core: c }
    }
    p = await c.host.get('parent')
  }
  return undefined
}

const STRICT =
  "(JBIT couldn't link this subagent to the conversation that started it, so it judges the subagent's calls by autopilot's strictest rules: armed, attended, no stage approved.)"

/**
 * Whose session judges a PreToolUse. A conversation with the user's input is its own. A subagent's (no user input
 * yet) is its parent's, judged as Claude Code judges a subagent's call (`agentId`: it reads the parent's session and
 * moves none of it). With no parent found it fails closed: a session armed attended with no stage approved, so an
 * outward command and a held stage's edits and spawns are refused whenever the plan's Mode line puts them under
 * autopilot, the strictest any real session could be.
 */
async function sessionFor(input, project) {
  const mine = await core(input, project)
  if (fromUser(input) || (await mine.host.get('prompted')) === true) return { mine, judge: mine }
  const agentId = conversation(input)
  const parent = await parentOf(input, mine, project)
  if (parent) return { mine, judge: parent.core, agentId }
  const judge = await core(input, project, `strict-${agentId}`)
  const $ = judge.engine.$
  await $.state.set({ plugin: 'jbit', key: 'armed' }, true)
  await $.state.set({ plugin: 'jbit', key: 'unattended' }, 'off')
  await $.state.set({ plugin: 'jbit', key: 'cleared' }, [])
  return { mine, judge, agentId, strict: true }
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
  const call = input.toolCall
  const tool = call?.name
  if (typeof tool !== 'string' || !tool) return deny(CRASH)
  const r = mapTool(tool, call.args, project ?? '/', guardOf())
  if (r.kind === 'allow') return allow()
  if (r.kind === 'deny') return deny(r.reason)
  if (!project) return deny(NO_PROJECT(tool))
  if (!dataDir()) return deny(NO_DATA(tool))
  const { mine, judge, agentId, strict } = await sessionFor(input, project)
  const context = []
  for (const one of r.calls) {
    const res = await judge.run({ kind: 'tool', call: one, ...(agentId ? { agentId } : {}) })
    if (res.decision === 'deny') {
      await keepNotices(mine, res.notices)
      return deny(res.reason ? (strict ? `${res.reason}\n\n${STRICT}` : res.reason) : CRASH)
    }
    context.push(...res.context, ...res.notices)
  }
  // an allow carries no context on agy: it rides on the next model call's PreInvocation (the caller's own)
  await keepNotices(mine, context.filter(t => typeof t === 'string' && t))
  return allow()
}

/** A subagent's start: its parent is noted now, while its transcript holds only agy's own first message. */
async function SessionStart(input, project) {
  if (!project || !dataDir() || fromUser(input)) return {}
  try {
    await parentOf(input, await core(input, project), project)
  } catch {
    // noted later, or judged strictly
  }
  return {}
}

async function PreInvocation(input, project) {
  if (!project || !dataDir()) return {}
  const c = await core(input, project)
  const context = []
  if (input.invocationNum === 0) {
    // a new prompt from the user: the continuation count starts again
    await c.host.set('stopBlocks', undefined)
    const text = typeof input.lastUserInput === 'string' ? input.lastUserInput : ''
    // the user prompted this conversation: its tool calls are judged in its own session (sessionFor)
    if (text) await c.host.set('prompted', true)
    else await parentOf(input, c, project).catch(() => undefined)
    // a subagent's first call carries no user input: it gets the plan's section, as a session start would
    const res = await c.run(text ? { kind: 'prompt', text, origin: 'composer' } : { kind: 'compose' })
    if (res.decision === 'deny' && res.reason) context.push(res.reason)
    context.push(...res.context, ...(await takeNotices(c)), ...res.notices)
  } else context.push(...(await takeNotices(c)))
  const text = context.filter(t => typeof t === 'string' && t).join('\n\n')
  return text ? inject(text) : {}
}

async function Stop(input, project) {
  if (!project || !dataDir()) return {}
  return stopWith(await core(input, project))
}

/** The Stop answer from a core: a continue carrying `## Now`, counted only once it is the answer. */
export async function stopWith(c) {
  const res = await c.run({ kind: 'stop', reason: 'answer' })
  const notices = Array.isArray(res.notices) ? res.notices : []
  if (res.decision !== 'block') {
    await keepNotices(c, notices)
    return {}
  }
  const blocks = Number(await c.host.get('stopBlocks')) || 0
  if (blocks >= STOP_CAP) {
    await keepNotices(c, [...notices, `JBIT autopilot stopped carrying on by itself after ${STOP_CAP} continuations in one prompt; a new prompt resumes it.`])
    return {}
  }
  const reason = typeof res.reason === 'string' ? res.reason : ''
  // the continuation is autopilot's own prompt: it goes through the prompt handlers as the plugin's, and what they add
  // (the plan's `## Now` first, which may have moved since the prompt's first call) rides in the reason
  const next = await c.run({ kind: 'prompt', text: reason, origin: 'plugin' })
  const taken = await takeNotices(c)
  const extra = [...(next.context ?? []), ...taken, ...notices, ...(next.notices ?? [])].filter(t => typeof t === 'string' && t && !reason.includes(t))
  const text = [reason, ...extra].filter(Boolean).join('\n\n')
  if (!text) {
    await keepNotices(c, taken)
    return {}
  }
  await c.host.set('stopBlocks', blocks + 1)
  return { decision: 'continue', reason: text }
}

const nothing = async () => ({})

const EVENTS = { PreToolUse, PreInvocation, Stop, SessionStart, PostInvocation: nothing, PostToolUse: nothing }

/** The events the package's hooks.json registers. */
export const HOOK_EVENTS = Object.keys(EVENTS)

/** The answer for one event, as the object to print; throws on anything it can't handle. */
export async function handle(event, raw) {
  const fn = EVENTS[event]
  if (!fn) throw new Error(`unknown event: ${String(event).slice(0, 40)}`)
  const input = JSON.parse(raw)
  if (input === null || typeof input !== 'object' || Array.isArray(input)) throw new Error('event is not an object')
  return fn(input, projectDir(input))
}
