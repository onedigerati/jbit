#!/usr/bin/env node
// JBIT's Codex CLI command hook: the entry script. argv[2] is the Codex event name; the event's JSON comes on stdin.
// It imports nothing of the adapter statically: it reads the event, then loads the handler (`handler.mjs`, which loads
// map.mjs and the core) inside a try/catch, so a module that fails to load fails closed like any other crash. Codex
// reads a hook that exits 1 as allow, so this one never does: on any failure a PreToolUse is denied (exit 0), and other
// events add nothing. A watchdog answers first if the hook hangs; a hook Codex kills on its own timeout fails open,
// so the watchdog stays under it. Nothing but the answer goes to stdout.

const CRASH = "JBIT's hook failed on this call, so the call doesn't run (its guard fails closed). Retry it; if it keeps failing, tell the user."
const WATCHDOG_MS = (() => {
  const n = Number(process.env.JBIT_HOOK_WATCHDOG_MS)
  return Number.isInteger(n) && n > 0 && n < 25000 ? n : 25000
})()

const deny = reason => ({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: reason } })

/** A Node that can't load the hook: a guarded call is refused and a prompt is told why, in the hook's words. */
function nodeTooOld(event, text) {
  if (event === 'PreToolUse') return deny(text)
  if (event === 'UserPromptSubmit') return { hookSpecificOutput: { hookEventName: 'UserPromptSubmit', additionalContext: text } }
  return {}
}

function answer(out, event) {
  let text
  try {
    text = out && Object.keys(out).length ? `${JSON.stringify(out)}\n` : ''
  } catch {
    // an answer that can't be written still refuses a guarded call
    text = event === 'PreToolUse' ? `${JSON.stringify(deny(CRASH))}\n` : ''
  }
  process.stdout.write(text, () => process.exit(0))
}

async function readStdin() {
  const chunks = []
  for await (const chunk of process.stdin) chunks.push(chunk)
  return Buffer.concat(chunks).toString('utf8')
}

async function main() {
  const event = process.argv[2]
  const failed = () => (event === 'PreToolUse' ? deny(CRASH) : {})
  let done = false
  const finish = out => {
    if (done) return
    done = true
    answer(out, event)
  }
  // a hook that hangs fails closed before Codex's own timeout decides for it
  setTimeout(() => finish(failed()), WATCHDOG_MS)
  process.on('uncaughtException', () => finish(failed()))
  process.on('unhandledRejection', () => finish(failed()))
  try {
    const raw = await readStdin()
    const { handle } = await import('./handler.mjs')
    finish(await handle(event, raw))
  } catch (err) {
    process.stderr.write(`jbit hook: ${event}: ${String(err?.message ?? err).split('\n')[0].slice(0, 200)}\n`)
    finish(err?.code === 'JBIT_NODE' ? nodeTooOld(event, err.message) : failed())
  }
}

main()
