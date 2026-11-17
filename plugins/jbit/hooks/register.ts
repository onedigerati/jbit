import type { EngineInterface, Register } from 'claude-code'
import { findSecrets, type Finding } from './secrets.ts'
import { addScope, commitScope, gitCall, joinPath, parseCommands, type Command } from './shell.ts'

/** Where a project's plan can live; the first that exists wins. */
const PLAN_PATHS = ['docs/PLAN.md', 'PLAN.md', 'docs/BUILD_PLAN.md']

/** The most of the plan's "Now" section that rides in every request. */
const NOW_MAX_LINES = 40

/** Where standing decisions live, when the project keeps them apart from the plan. */
const DECISIONS_PATH = 'docs/decisions.md'

/** The one fixed line beside the plan's `## Now`: how stages run, with the skills holding the details. */
export const WORKING_RULES =
  "Working rules: build in stages; a stage is done when its checks pass against the running product and the suite is green; save each stage's evidence to `docs/evidence/stage-<n>/`; risky stages get `/code-review` and `/security-review`; commit per stage. The JBIT skills (plan, charter, stage, verify, autopilot, resume) hold the details."

interface Plan {
  path: string
  /** The `## Now` section as written (its first `NOW_MAX_LINES` lines, trimmed); undefined without one. */
  now: string | undefined
  stages: { number: string; name: string; done: boolean }[]
}

/**
 * A `## ` heading's text, exactly what `/^##\s+(.+?)\s*$/` captures, in linear time: that lazy pattern backtracks
 * quadratically on a heading padded with spaces, and the plan is read on every request.
 * The text runs to the first line terminator (as `.` does), and only whitespace (a CRLF file's `\r`, say) may follow it.
 */
function headingText(line: string): string | undefined {
  const m = /^##\s+(.+)/.exec(line)
  if (!m) return undefined
  if (!/^\s*$/.test(line.slice(m[0].length))) return undefined
  const text = m[1] ?? ''
  // a heading of only blanks: the lazy pattern kept its first one
  return text.trimEnd() || text[0]
}

/** The `## Now` section, as written: nothing in it is parsed, so old Mode, Agents or Models lines are only text. */
export function nowSection(text: string): string | undefined {
  const lines: string[] = []
  let inNow = false
  for (const line of text.split('\n')) {
    const h = headingText(line)
    if (h !== undefined) {
      if (inNow) break
      inNow = h.toLowerCase() === 'now'
      continue
    }
    if (inNow) lines.push(line)
  }
  return lines.join('\n').trim() ? lines.slice(0, NOW_MAX_LINES).join('\n').trim() : undefined
}

/** The `## Stages` checklist: each line's number, its name (the part before ` — `) and whether it's ticked. */
export function stageList(text: string): { number: string; name: string; done: boolean }[] {
  const list: { number: string; name: string; done: boolean }[] = []
  let heading = ''
  for (const line of text.split('\n')) {
    const h = headingText(line)
    if (h !== undefined) {
      // the first heading naming stages is the checklist
      if (heading.includes('stage')) break
      heading = h.toLowerCase()
      continue
    }
    if (!heading.includes('stage')) continue
    const m = line.match(/^[-*]\s+\[([ xX])\]\s+(?:\*\*)?(?:stage\s+)?(\d+)[.:]?\s*(.*)$/i)
    if (!m) continue
    const name = (m[3] ?? '').replace(/\*\*/g, '').split(/\s+[—–-]\s+/)[0]?.trim() ?? ''
    list.push({ number: m[2] ?? '', name, done: m[1] !== ' ' })
  }
  return list
}

async function readPlan($: EngineInterface): Promise<Plan | undefined> {
  for (const path of PLAN_PATHS) {
    if (!(await $.fs.exists(path))) continue
    const text = await $.fs.read(path)
    return { path, now: nowSection(text), stages: stageList(text) }
  }
  return undefined
}

/** The status band: the current stage, or that every stage is done; the plan's path when it lists no stages. */
export function statusText(plan: Pick<Plan, 'path' | 'stages'>): string {
  if (!plan.stages.length) return `jbit · ${plan.path}`
  const open = plan.stages.find(s => !s.done)
  return open ? `jbit · stage ${open.number} of ${plan.stages.length} · ${open.name}` : 'jbit · all stages done'
}

/** The system prompt's JBIT section: where the plan is, its `## Now` as written, and the working rules. */
export function planSection(plan: Pick<Plan, 'path' | 'now'>, decisionsFile: boolean): string {
  const standing = decisionsFile ? ` (standing decisions in \`${DECISIONS_PATH}\`)` : ''
  return [
    `# JBIT`,
    `This project keeps its plan in \`${plan.path}\`: the source of truth for goal, decisions and stages${standing}. Reread it before acting on anything it covers, and update it in the same change when a decision or stage changes. Subagents: treat this as background and stay inside your brief.`,
    ``,
    `Current position (the plan's \`## Now\`, as written):`,
    plan.now ?? 'The plan has no `## Now` section.',
    ``,
    WORKING_RULES,
  ].join('\n')
}

/** What the summarizer must keep, whoever asked for the compaction. */
const KEEP =
  "Keep the project-plan state exactly: the plan's `## Now` (the active stage, its acceptance checks and which have passed), decisions made since the plan file was last updated, and any uncommitted work in progress with its file paths."

// ---- the commit secret guard ----

async function git($: EngineInterface, args: string[], cwd: string) {
  const r = await $.process.run(['git', ...args], { cwd })
  if (r.exitCode !== 0) throw new Error(`git ${args[0]} failed: ${r.stderr.slice(0, 200)}`)
  return r.stdout
}

const DIFF = ['-U0', '--no-color', '--no-ext-diff']

/** Everything a commit could carry: its repo's index, plus what it or a `git add` before it on the same line takes from the working tree. */
async function pendingChanges($: EngineInterface, root: string, commands: Command[], at: number) {
  const call = gitCall(commands[at]!)!
  const scope = commitScope(call)
  const dir = joinPath(root, scope.dir ?? '.')
  const diffs = [await git($, ['diff', '--cached', ...DIFF], dir)]
  const files: { path: string; text: string }[] = []

  if (scope.all) diffs.push(await git($, ['diff', ...DIFF], dir))
  if (scope.paths.length) {
    const against = await git($, ['diff', 'HEAD', ...DIFF, '--', ...scope.paths], dir).catch(() => git($, ['diff', ...DIFF, '--', ...scope.paths], dir))
    diffs.push(against)
  }

  // a `git add` earlier on this line hasn't run yet: scan what it will stage
  for (const cmd of commands.slice(0, at)) {
    const add = (() => {
      const c = gitCall(cmd)
      return c ? addScope(c) : undefined
    })()
    if (!add) continue
    const addDir = joinPath(root, add.dir ?? '.')
    diffs.push(await git($, ['diff', ...DIFF, '--', ...add.paths], addDir))
    if (!add.untracked) continue
    const listed = await git($, ['ls-files', '--others', ...(add.ignored ? [] : ['--exclude-standard']), '--', ...add.paths], addDir)
    const paths = listed.split('\n').filter(Boolean).slice(0, 500 - files.length)
    // ls-files prints paths relative to the directory it ran in; findSecrets judges them (the evidence rule) by their
    // repo-root path, so label each with the directory's prefix (`evidence/x.txt` from `docs/` is `docs/evidence/x.txt`)
    const prefix = paths.length ? (await git($, ['rev-parse', '--show-prefix'], addDir)).trim() : ''
    for (const path of paths) {
      const text = await $.fs.read(joinPath(addDir, path)).catch(() => undefined)
      if (typeof text === 'string' && !text.includes('\u0000')) files.push({ path: repoPath(prefix, path), text })
    }
  }
  return { diff: diffs.join('\n'), files, dir }
}

/** A path relative to a repo subdirectory (`../x`, `./y`), as a repo-root path, given the directory's prefix (`docs/`). */
function repoPath(prefix: string, path: string): string {
  const parts: string[] = []
  for (const part of `${prefix}/${path}`.split('/')) {
    if (part === '..') parts.pop()
    else if (part && part !== '.') parts.push(part)
  }
  return parts.join('/')
}

function secretDenial(found: Finding[]): string {
  const list = found
    .slice(0, 8)
    .map(f => `  - ${f.file}${f.line ? `:${f.line}` : ''}: ${f.kind}`)
    .join('\n')
  const more = found.length > 8 ? `\n  - …and ${found.length - 8} more` : ''
  const inEvidence = (f: Finding) => f.kind.endsWith(' header in evidence')
  const lines = [`JBIT blocked this commit: it would include what looks like a secret.`, list + more]
  if (found.some(inEvidence))
    lines.push(
      `For a header in evidence, replace the value with \`[masked]\`, as jbit:verify masks evidence, and commit again. Only if the line is a false positive, add the comment \`jbit:allow-secret\` on it.`,
    )
  if (!found.every(inEvidence))
    lines.push(
      `Move the value into an environment variable or an ignored file, and rotate it if it was ever pushed or shared.`,
      `If a line is a placeholder or a false positive, add the comment \`jbit:allow-secret\` on that line and commit again.`,
    )
  return lines.join('\n')
}

/** A line that names git anywhere; only such a line can commit. */
const PREFILTER = /\bgit\b/

export const register: Register = on => {
  // the plan's `## Now` rides in the system prompt, so it survives compaction and long runs
  on('prompt.compose', async ($, e, next) => {
    const composed = await next(e)
    const plan = await readPlan($).catch(() => undefined)
    $.ui.status(plan ? statusText(plan) : undefined)
    if (!plan) return composed
    let decisionsFile = false
    try {
      decisionsFile = await $.fs.exists(DECISIONS_PATH)
    } catch {
      // an exists check that fails adds nothing
    }
    return { sections: [...composed.sections, { id: 'jbit:plan', text: planSection(plan, decisionsFile), scope: 'session' as const }] }
  })

  // tell the summarizer what must survive
  on('session.compact', async ($, e, next) => {
    if (e.agentId || e.instructions?.includes(KEEP) || !(await readPlan($).catch(() => undefined))) return next(e)
    return next({ ...e, instructions: e.instructions ? `${e.instructions}\n\n${KEEP}` : KEEP })
  }).catch(($, e, next) => next(e))

  // every commit on the line is scanned for secrets before it runs
  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    if (!PREFILTER.test(e.command)) return next(e)
    const commands = parseCommands(e.command)
    const commits = commands.flatMap((c, i) => {
      const call = gitCall(c)
      return call?.sub === 'commit' && !commitScope(call).dryRun ? [i] : []
    })
    if (!commits.length) return next(e)
    const root = await $.session.cwd().catch(() => '.')
    for (const at of commits) {
      const pending = await pendingChanges($, root, commands, at)
      const found = findSecrets(pending.diff, pending.files)
      if (found.length) return { deny: secretDenial(found) }
    }
    return next(e)
  }).catch(($, e, next) => {
    if (next.called) return next(e)
    // a guard that cannot read the repository steps aside rather than block every commit
    $.ui.toast('JBIT: the commit check could not run on this command')
    return next(e)
  })
}
