#!/usr/bin/env node
// JBIT's Antigravity CLI (`agy`) command hook: the entry script, run as `node <this> <Event>` with the event's JSON on
// stdin. It imports nothing of the adapter statically: it reads the event, then loads the handler (`handler.mjs`, which
// loads map.mjs and the core) inside a try/catch, so a module that fails to load fails closed like any other crash.
// agy ALLOWS a tool call when a PreToolUse hook prints nothing, so this hook prints an explicit decision on every path
// of a guarded call: {"decision":"allow"} on a pass, {"decision":"deny","reason"} on a refusal, a crash, bad stdin, an
// unknown event or a Node too old to load the core. A call counts as guarded when argv or the payload's
// `hookEventName` says PreToolUse, or the event is unknown. A watchdog answers before agy's own timeout (HOOK_TIMEOUT_SEC
// in handler.mjs, 30 s in hooks.json) decides. Every answer is one JSON line; nothing else goes to stdout.

const CRASH = "JBIT's hook failed on this call, so the call doesn't run (its guard fails closed). Retry it; if it keeps failing, tell the user."
const KNOWN = new Set(['PreToolUse', 'PreInvocation', 'Stop', 'SessionStart', 'PostInvocation', 'PostToolUse'])
/** The watchdog: under the 30 s `timeout` the package's hooks.json sets (handler.mjs HOOK_TIMEOUT_SEC). */
const WATCHDOG_DEFAULT_MS = 25000
const WATCHDOG_MS = (() => {
  const n = Number(process.env.JBIT_HOOK_WATCHDOG_MS)
  return Number.isInteger(n) && n > 0 && n < WATCHDOG_DEFAULT_MS ? n : WATCHDOG_DEFAULT_MS
})()

const deny = reason => ({ decision: 'deny', reason })

function payloadOf(raw) {
  try {
    const v = JSON.parse(raw)
    return v !== null && typeof v === 'object' && !Array.isArray(v) ? v : undefined
  } catch {
    return undefined
  }
}

/** Whether this call gates a tool: an explicit decision is owed. */
const guarded = (event, payload) => event === 'PreToolUse' || payload?.hookEventName === 'PreToolUse' || !KNOWN.has(event)

/** A Node that can't load the core: a guarded call is refused and a prompt's first call is told why. */
function nodeTooOld(event, payload, message) {
  if (guarded(event, payload)) return deny(message)
  if (event === 'PreInvocation' && payload?.invocationNum === 0) return { injectSteps: [{ systemMessage: { systemMessage: message } }] }
  return {}
}

/** The line to print: a guarded call gets an allow or a deny with a reason, whatever `out` holds. */
function line(out, gate) {
  if (gate) {
    if (out?.decision === 'allow') return '{"decision":"allow"}\n'
    const reason = out?.decision === 'deny' && typeof out.reason === 'string' && out.reason ? out.reason : CRASH
    return `${JSON.stringify(deny(reason))}\n`
  }
  try {
    return `${JSON.stringify(out && typeof out === 'object' ? out : {})}\n`
  } catch {
    return '{}\n'
  }
}

async function readStdin() {
  const chunks = []
  for await (const chunk of process.stdin) chunks.push(chunk)
  return Buffer.concat(chunks).toString('utf8')
}

async function main() {
  const event = process.argv[2]
  let payload
  let done = false
  const finish = out => {
    if (done) return
    done = true
    process.stdout.write(line(out, guarded(event, payload)), () => process.exit(0))
  }
  const failed = reason => finish(deny(reason ?? CRASH))
  // a hook that hangs answers before agy's own timeout decides for it
  setTimeout(() => failed(), WATCHDOG_MS)
  process.on('uncaughtException', () => failed())
  process.on('unhandledRejection', () => failed())
  try {
    const raw = await readStdin()
    payload = payloadOf(raw)
    if (!KNOWN.has(event)) return failed(`JBIT blocked this call: its hook was run for an event it doesn't know (\`${String(event).slice(0, 40)}\`), so it fails closed. Tell the user JBIT's hooks.json is out of date; reinstall the plugin.`)
    if (!payload && guarded(event, payload)) return failed(`JBIT blocked this call: the hook couldn't read the event's input (not a JSON object), and a call it can't check doesn't run. Retry it; if it keeps failing, tell the user.`)
    const { handle } = await import('./handler.mjs')
    // the payload's own event name wins over argv when they disagree on a guarded call
    finish(await handle(payload?.hookEventName === 'PreToolUse' ? 'PreToolUse' : event, raw))
  } catch (err) {
    process.stderr.write(`jbit hook: ${event}: ${String(err?.message ?? err).split('\n')[0].slice(0, 200)}\n`)
    finish(err?.code === 'JBIT_NODE' ? nodeTooOld(event, payload, err.message) : guarded(event, payload) ? deny(CRASH) : {})
  }
}

main()
