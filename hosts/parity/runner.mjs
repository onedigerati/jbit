// Parity runner: plays the shared scenarios (scenarios.mjs) through a host adapter and judges each answer.
// Pure JS, no Node built-ins, so the Claude test kit (claude.test.ts) can load it as well as a Node runner.
//
// Scenario  { name, fixture, steps }
//   fixture { committed: {path: text}   files in HEAD (and the working tree), paths relative to the project root
//             staged?:   {path: text|null}  changes `git add`ed on top of HEAD (null = deleted); the working tree matches the index }
// Step      { kind: 'prompt', text, fromUser }                   a prompt (fromUser false = sent by a plugin, not the user)
//           { kind: 'tool', tool: 'Bash'|'Edit'|'Write'|'Agent'|'Skill', input }
//               Bash {command} · Edit {path, old, new} · Write {path, content} · Agent {description, prompt} · Skill {skill, args}
//               (paths relative to the project root; the adapter makes them absolute and names the tool as its host does)
//           { kind: 'stop' }                                     the agent's turn ends
//           any step may carry `expect`, judged against the answer to that step
// Outcome   { kind: 'allow' }                                    let through, nothing added
//           { kind: 'deny', reason }                             a tool call refused (Copilot: permissionDecision "deny")
//           { kind: 'block', reason }                            a turn end kept going (Claude: autopilot's carry-on prompt;
//                                                                Copilot: agentStop {"decision":"block"})
//           { kind: 'context', text }                            a prompt's added context (Claude: the jbit:plan section and
//                                                                the prompt's context entries; Copilot: modifiedTransformedPrompt)
// Expect    { kind, has?: string[], lacks?: string[] }           kind must match; `has` phrases appear in reason/text, `lacks` don't
//
// Adapter   { name, open(scenario) -> Promise<Session> }
// Session   { step(step) -> Promise<Outcome>, close?() -> Promise<void> }
//   open materialises the fixture (makeRepo in fixture.mjs builds a real git repo for a command hook) and starts a session;
//   step turns a host-neutral step into the host's event and its answer back into an Outcome.

import { SCENARIOS } from './scenarios.mjs'

/** Problems with `outcome` against `expect`; empty when it passes. */
export function judge(expect, outcome) {
  if (!outcome || outcome.kind !== expect.kind) return [`expected ${expect.kind}, got ${outcome?.kind}: ${JSON.stringify(outcome?.reason ?? outcome?.text ?? '').slice(0, 400)}`]
  const said = outcome.reason ?? outcome.text ?? ''
  return [
    ...(expect.has ?? []).filter(p => !said.includes(p)).map(p => `missing "${p}" in: ${said.slice(0, 400)}`),
    ...(expect.lacks ?? []).filter(p => said.includes(p)).map(p => `should not contain "${p.slice(0, 12)}…"`),
  ]
}

/** Plays one scenario through `adapter`: { name, ok, problems }. */
export async function runScenario(adapter, scenario) {
  const problems = []
  const session = await adapter.open(scenario)
  try {
    for (const [i, step] of scenario.steps.entries()) {
      let outcome
      try {
        outcome = await session.step(step)
      } catch (err) {
        outcome = { kind: 'error', reason: String(err?.stack ?? err) }
      }
      if (step.expect) problems.push(...judge(step.expect, outcome).map(p => `step ${i + 1} (${step.kind}${step.tool ? ' ' + step.tool : ''}): ${p}`))
    }
  } finally {
    await session.close?.()
  }
  return { name: scenario.name, ok: problems.length === 0, problems }
}

/** Plays every scenario through `adapter`, one after another. */
export async function runScenarios(adapter, scenarios = SCENARIOS) {
  const list = scenarios
  const results = []
  for (const s of list) results.push(await runScenario(adapter, s))
  return results
}

// ---- an in-memory repo, for hosts whose engine is mocked (the Claude test kit) ----

const lines = text => {
  if (text === undefined || text === null || text === '') return []
  const l = text.split('\n')
  if (l.at(-1) === '') l.pop()
  return l
}
const range = (start, count) => (count === 1 ? `${start}` : `${start},${count}`)

/** A `git diff -U0` of one file, `before`/`after` undefined or null for a file that isn't there. */
export function fileDiff(path, before, after) {
  const a = lines(before)
  const b = lines(after)
  const head = [`diff --git a/${path} b/${path}`]
  if (before == null) head.push('new file mode 100644', '--- /dev/null', `+++ b/${path}`)
  else if (after == null) head.push('deleted file mode 100644', `--- a/${path}`, '+++ /dev/null')
  else head.push(`--- a/${path}`, `+++ b/${path}`)
  // longest common subsequence, then runs of changes become -U0 hunks
  const n = a.length
  const m = b.length
  const L = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0))
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i][j] = a[i] === b[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1])
  const hunks = []
  let i = 0
  let j = 0
  while (i < n || j < m) {
    if (i < n && j < m && a[i] === b[j]) {
      i++
      j++
      continue
    }
    const oi = i
    const oj = j
    while ((i < n || j < m) && !(i < n && j < m && a[i] === b[j])) {
      if (j < m && (i >= n || L[i][j + 1] >= L[i + 1][j])) j++
      else i++
    }
    const oc = i - oi
    const nc = j - oj
    hunks.push(`@@ -${range(oc ? oi + 1 : oi, oc)} +${range(nc ? oj + 1 : oj, nc)} @@`, ...a.slice(oi, i).map(l => `-${l}`), ...b.slice(oj, j).map(l => `+${l}`))
  }
  return hunks.length ? [...head, ...hunks].join('\n') : ''
}

/** The fixture as three trees (HEAD, index, working tree) and the git answers a hook asks for. */
export function memoryRepo(fixture) {
  const committed = { ...fixture.committed }
  const index = { ...committed }
  for (const [p, t] of Object.entries(fixture.staged ?? {})) {
    if (t === null) delete index[p]
    else index[p] = t
  }
  const worktree = { ...index }
  const diffOf = (from, to, only) =>
    [...new Set([...Object.keys(from), ...Object.keys(to)])]
      .filter(p => !only?.length || only.some(o => p === o || p.startsWith(o.replace(/\/$/, '') + '/')))
      .sort()
      .map(p => (from[p] === to[p] ? '' : fileDiff(p, from[p], to[p])))
      .filter(Boolean)
      .join('\n')
  /** Answers `git <args>` run at the repo root: { code, stdout, stderr }. */
  const git = args => {
    const ok = stdout => ({ code: 0, stdout, stderr: '' })
    const paths = args.includes('--') ? args.slice(args.indexOf('--') + 1) : []
    switch (args[0]) {
      case 'rev-parse':
        if (args.includes('--show-toplevel')) return ok(`${ROOT}\n`)
        if (args.includes('--show-prefix')) return ok('\n')
        return ok('0000000000000000000000000000000000000001\n')
      case 'show': {
        const [, path] = String(args[1]).split(':')
        return committed[path] === undefined ? { code: 128, stdout: '', stderr: `fatal: path '${path}' does not exist in 'HEAD'` } : ok(committed[path])
      }
      case 'ls-files':
        return ok('')
      case 'diff':
        if (args.includes('--cached')) return ok(diffOf(committed, index, paths))
        if (args[1] === 'HEAD') return ok(diffOf(committed, worktree, paths))
        return ok(diffOf(index, worktree, paths))
      default:
        return ok('')
    }
  }
  return { committed, index, worktree, git }
}

/** Where a mocked session's project lives. */
export const ROOT = '/repo'
