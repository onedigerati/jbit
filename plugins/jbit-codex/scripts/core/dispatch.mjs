// Runs a host-neutral event through the Claude hook's own handlers (`plugins/jbit/hooks/register.ts`, imported
// read-only), in register order with `next` chaining, as Claude Code's engine does.
import { memoryEngine } from './engine.mjs'

const REGISTER = '../hooks/register.ts'

/** What a Node that can't load the hook's TypeScript says, in place of a generic failure. */
export const NODE_TOO_OLD = "JBIT's hook needs Node 22.18+ (TypeScript type stripping), and this Node can't load it, so JBIT's checks can't run: guarded tool calls are refused. Tell the user to update Node."

let loaded

/** The hook module: `register` and `parsePlan`. A Node that can't strip types gets an error naming the Node it needs. */
async function hookModule() {
  if (loaded) return loaded
  try {
    loaded = await import(REGISTER)
  } catch (err) {
    if (!process.features?.typescript) throw Object.assign(new Error(NODE_TOO_OLD), { code: 'JBIT_NODE', cause: err })
    throw err
  }
  return loaded
}

/** The handlers `register` adds, in order: `{ event, filter, fn, fallback }`. */
export async function loadHandlers() {
  const { register } = await hookModule()
  const handlers = []
  register((event, a, b) => {
    const h = { event, filter: b === undefined ? undefined : a, fn: b === undefined ? a : b, fallback: undefined }
    handlers.push(h)
    const chain = {
      catch(fallback) {
        h.fallback = fallback
        return chain
      },
    }
    return chain
  })
  return handlers
}

const matches = (filter, e) => !filter || Object.entries(filter).every(([k, v]) => e[k] === v)

/**
 * Calls `event` through the handlers registered for it. `terminal` answers past the last handler. A handler that
 * throws goes to its `.catch` fallback, whose `next` is replay-safe (it carries `called` and `error`); one with no
 * fallback, or a fallback that throws, rejects the whole call.
 */
export function call(handlers, $, event, e, terminal) {
  const list = handlers.filter(h => h.event === event && matches(h.filter, e))
  const run = (i, ev) => {
    if (i >= list.length) return Promise.resolve().then(() => terminal(ev))
    const h = list[i]
    const ac = new AbortController()
    let called = false
    let memo
    const next = x => {
      called = true
      memo = run(i + 1, x === undefined ? ev : x)
      return memo
    }
    next.signal = ac.signal
    return (async () => {
      try {
        return await h.fn($, ev, next)
      } catch (error) {
        if (!h.fallback) throw error
        const replay = x => (called ? memo : run(i + 1, x === undefined ? ev : x))
        Object.defineProperties(replay, { called: { value: called }, error: { value: error }, signal: { value: ac.signal } })
        return await h.fallback($, ev, replay)
      } finally {
        ac.abort()
      }
    })()
  }
  return run(0, e)
}

/** What the timers the handlers set leave behind: run once the handlers settle, each failure its own. */
async function runTimers(out) {
  while (out.timers.length) {
    const fn = out.timers.shift()
    try {
      await fn()
    } catch {
      // a timer that fails says nothing; the handler's own fallback toasts when it has one
    }
  }
}

/** Where a plan can live, as the hook reads it: the first that exists wins. */
const PLAN_PATHS = ['docs/PLAN.md', 'PLAN.md', 'docs/BUILD_PLAN.md']

/** The plan's Mode, read as the hook reads it; undefined with no plan or a Mode line. */
async function modeNow($) {
  const { parsePlan } = await hookModule()
  for (const path of PLAN_PATHS) if (await $.fs.exists(path)) return parsePlan(path, await $.fs.read(path)).mode?.kind
  return undefined
}

/** Prompts a person sent, as the hook counts them. */
const USER_ORIGINS = new Set(['composer', 'bridge', 'sdk'])

/** A plan whose Mode is autopilot and whose stages are all done: a turn end over it sets the hook's last Mode and stops. */
const PRIME_PLAN = ['## Now', 'Stage 1 of 1 · prime', 'Mode: autopilot', '', '## Stages', '- [x] 1. prime — prime', ''].join('\n')

/**
 * The hook module keeps a little memory between events (`lastPromptFromUser`, `lastMode`), which a host that runs one
 * process per event loses. The core keeps it in the session's state (`memory`) and puts it back before an event that
 * reads it, by running the same handlers once on a throwaway in-memory engine: nothing reaches disk, git or the person.
 */
async function prime(handlers, host, kind) {
  const mem = (await host.get('memory')) ?? {}
  if (kind === 'tool' && mem.fromUser === true) {
    const m = memoryEngine({})
    await call(handlers, m.$, 'prompt.submit', { text: '', origin: { kind: 'composer' }, context: [] }, e => ({ context: e.context ?? [] }))
  }
  if (kind === 'stop' && mem.lastMode === 'autopilot') {
    const m = memoryEngine({ 'docs/PLAN.md': PRIME_PLAN })
    await call(handlers, m.$, 'turn.complete', { turnId: 'prime', answer: '', durationMs: 0, isAborted: false, reason: 'answer' }, () => ({}))
  }
}

async function remember(host, change) {
  const mem = (await host.get('memory')) ?? {}
  await host.set('memory', { ...mem, ...change })
}

/** Notices the hook says once per stage, by its module memory, which a fresh process forgets. */
const ONCE = /^Autopilot \((?:attended|unattended)\) is (?:holding before|building) /

/** This call's notices, without a once-per-stage notice an earlier call already said. */
async function fresh(host, notices) {
  if (!notices.some(n => ONCE.test(n))) return notices
  const said = (await host.get('said')) ?? []
  const kept = notices.filter(n => !ONCE.test(n) || !said.includes(n))
  const added = kept.filter(n => ONCE.test(n))
  if (added.length) await host.set('said', [...said, ...added].slice(-50))
  return kept
}

/**
 * Runs a host-neutral event and answers `{ decision: 'allow' | 'deny' | 'block', reason?, context: string[], notices }`.
 * - `{ kind: 'prompt', text, origin }`: `prompt.compose`, then `prompt.submit`, as Claude Code composes the request
 *   before the prompt's hooks run; context is the plan's section and what the submit hooks added. An entry carrying
 *   its own `# JBIT` section (the armed entry, which supersedes the composed one) stands in for the composed section.
 * - `{ kind: 'compose' }`: `prompt.compose` alone (a session's start).
 * - `{ kind: 'tool', call: { tool, ...input } }`: `tool.call`; a deny's reason is the handler's. A check whose git
 *   output was cut short or hung denies, whatever the handler's fallback did.
 * - `{ kind: 'stop', reason? }`: `turn.complete` for the main loop's answer; a prompt the handlers submit (autopilot
 *   carrying on) comes back as a block whose reason is that prompt.
 * `notices` are what the handlers told the person during this call. Anything that throws rejects: the adapter decides
 * how to fail.
 */
export async function dispatch(handlers, engine, event) {
  const { $, out, host } = engine
  const marks = [out.notices.length, out.toasts.length]
  const notices = () => fresh(host, [...out.notices.slice(marks[0]), ...out.toasts.slice(marks[1])])
  await prime(handlers, host, event.kind)
  if (event.kind === 'prompt' || event.kind === 'compose') {
    const composed = await call(handlers, $, 'prompt.compose', { sections: [] }, e => ({ sections: e.sections ?? [] }))
    const sections = (composed?.sections ?? []).map(s => s.text).filter(t => typeof t === 'string' && t)
    const context = []
    if (event.kind === 'prompt') {
      const origin = event.origin ?? 'composer'
      await remember(host, { fromUser: USER_ORIGINS.has(origin) })
      const submitted = await call(handlers, $, 'prompt.submit', { text: String(event.text ?? ''), origin: { kind: origin }, context: [] }, e => ({ context: e.context ?? [] }))
      if (submitted?.deny) return { decision: 'deny', reason: String(submitted.deny), context: [], notices: await notices() }
      context.push(...(submitted?.context ?? []).filter(c => typeof c === 'string'))
    }
    await runTimers(out)
    const supersedes = context.some(c => c.includes('# JBIT\n'))
    const kept = sections.filter(t => !(supersedes && t.startsWith('# JBIT')) && !context.some(c => c.includes(t)))
    return { decision: 'allow', context: [...kept, ...context], notices: await notices() }
  }
  if (event.kind === 'tool') {
    const result = await call(handlers, $, 'tool.call', { ...event.call, ...(event.agentId ? { agentId: event.agentId } : {}) }, () => ({}))
    await runTimers(out)
    if (out.fatal) return { decision: 'deny', reason: out.fatal, context: [], notices: await notices() }
    if (result?.deny) return { decision: 'deny', reason: String(result.deny), context: [], notices: await notices() }
    return { decision: 'allow', context: result?.context ?? [], notices: await notices() }
  }
  if (event.kind === 'stop') {
    const reason = event.reason ?? 'answer'
    await call(handlers, $, 'turn.complete', { turnId: event.turnId ?? 'turn', answer: '', durationMs: 0, isAborted: reason !== 'answer', reason }, () => ({}))
    await runTimers(out)
    // the hook's last Mode moves only on the main loop's answer
    if (reason === 'answer') await remember(host, { lastMode: (await modeNow($).catch(() => undefined)) ?? null })
    const prompt = out.prompts.shift()
    if (prompt) return { decision: 'block', reason: prompt, context: [], notices: await notices() }
    return { decision: 'allow', context: [], notices: await notices() }
  }
  throw new Error(`unknown event kind: ${event.kind}`)
}
