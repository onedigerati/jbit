// Text checks on the skills, READMEs and manifests: `node --test plugins/jbit/tests/docs.check.mjs`.
// `claude plugin test` runs hooks code in a sandbox with no file access, so the words Claude and users read are checked
// here, against the files themselves, with Node's own test runner.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'

const plugin = join(dirname(fileURLToPath(import.meta.url)), '..')
const repo = join(plugin, '..', '..')
const read = path => readFileSync(path, 'utf8')
const skills = readdirSync(join(plugin, 'skills')).sort()
const skill = name => read(join(plugin, 'skills', name, 'SKILL.md'))
const description = name => skill(name).split('\n').find(l => l.startsWith('description: ')) ?? ''
const readmes = { root: read(join(repo, 'README.md')), plugin: read(join(plugin, 'README.md')) }
const manifest = JSON.parse(read(join(plugin, '.claude-plugin', 'plugin.json')))
const marketplace = JSON.parse(read(join(repo, '.claude-plugin', 'marketplace.json')))
const hook = read(join(plugin, 'hooks', 'register.ts'))
const guide = read(join(repo, 'docs', 'field-guide.html'))
const manifests = { 'plugin.json': manifest.description, 'marketplace.json': `${marketplace.description}\n${marketplace.plugins[0].description}` }

/** The field guide as prose: scripts, styles and code spans dropped, tags turned to spaces, entities decoded. */
const guideProse = guide
  .replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, ' ')
  .replace(/<code\b[\s\S]*?<\/code>/gi, ' ')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#39;|&rsquo;/g, "'").replace(/&quot;|&ldquo;|&rdquo;/g, '"')

/** Markdown as prose: fenced blocks and code spans dropped. */
const markdownProse = text => text.replace(/```[\s\S]*?```/g, '').replace(/`[^`\n]*`/g, '')

test('every skill says "JBIT <command>" triggers it', () => {
  for (const name of skills)
    assert.ok(description(name).includes(`opens with "JBIT ${name}"`), `${name}'s description lacks "JBIT ${name}"`)
})

// 1.0.0 stage 2: six short skills, no Agents/Models/Mode lines, no approval or holds; the habits each keeps.
const SIX = ['autopilot', 'charter', 'plan', 'resume', 'stage', 'verify']
const words = text => text.split(/\s+/).filter(Boolean).length

test('skills/ holds exactly autopilot, charter, plan, resume, stage, verify; no skill names jbit:approve, jbit:fix or jbit:review', () => {
  assert.deepEqual(skills, SIX)
  for (const name of skills) assert.doesNotMatch(skill(name), /jbit:(?:approve|fix|review)\b/, `skills/${name} names a removed skill`)
})

test('the six skills together are at most 5,000 words, none over 1,500', () => {
  const counts = Object.fromEntries(skills.map(s => [s, words(skill(s))]))
  for (const [name, n] of Object.entries(counts)) assert.ok(n <= 1500, `skills/${name} is ${n} words, over 1,500`)
  const total = Object.values(counts).reduce((a, b) => a + b, 0)
  assert.ok(total <= 5000, `the skills total ${total} words, over 5,000 (${JSON.stringify(counts)})`)
})

test('no skill carries Agents/Models/Mode-level, attended/unattended/outward, approval or hold text', () => {
  const banned = [
    [/^\s*(?:[-*]\s*)?`?(?:Agents|Models|Mode):/m, 'an Agents:/Models:/Mode: line'],
    [/`(?:lean|balanced|wide)`/, 'a `lean`/`balanced`/`wide` level'],
    [/\b(?:under|at|run(?:s|ning)?|level) (?:lean|balanced|wide)\b|\b(?:lean|balanced|wide) (?:level|mode|run)\b/i, 'lean/balanced/wide used as a level'],
    [/\b(?:un)?attended\b/i, 'attended/unattended'],
    [/`outward`|\boutward (?:check|mode|level|run|word)\b|autopilot outward\b/i, 'outward as a mode'],
    [/\bapproval\b|\bapprove\b/i, 'approval grammar'],
    [/\bheld\b|\bthe hold\b|\bhold(?:s|ing)? (?:the|a|this|that|every) (?:risky )?(?:stage|run)\b/i, 'held/hold stage text'],
  ]
  for (const name of skills)
    for (const [re, what] of banned) {
      const m = re.exec(skill(name))
      assert.equal(m, null, m ? `skills/${name} has ${what}: "${m[0]}"` : '')
    }
})

test('habits: stage rechecks the risk line, runs /code-review and /security-review, logs ## Fixes and pins untested code', () => {
  const stage = skill('stage')
  for (const words of ['Recheck the risk line against the diff', '`/code-review`', '`/security-review`', '## Fixes', 'write tests that pin what it does today'])
    assert.ok(stage.includes(words), `stage SKILL.md lacks: ${words}`)
})

test('habits: verify saves docs/evidence/stage-<n>/report.md and reports unproven checks', () => {
  for (const words of ['docs/evidence/stage-<n>/report.md', 'unproven']) assert.ok(skill('verify').includes(words), `verify SKILL.md lacks: ${words}`)
})

test('habits: plan points to jbit:charter and asks before writing one big plan', () => {
  for (const words of ['jbit:charter', 'Too big for one plan', 'ask the user before writing', 'even when told to assume defaults or not to ask']) assert.ok(skill('plan').includes(words), `plan SKILL.md lacks: ${words}`)
})

test('habits: plan checks the evidence reports before archiving and never corrects a failing one', () => {
  for (const words of ["Read each stage's `docs/evidence/stage-<n>/report.md`, not the plan's ticks", 'Never re-run, rewrite or "correct" a report to make it pass', 'the next plan takes the gap, not the next milestone']) assert.ok(skill('plan').includes(words), `plan SKILL.md lacks: ${words}`)
})

test('habits: a milestone with failing evidence stays open and is reported, even when told to assume defaults', () => {
  for (const words of ["the milestone doesn't close, even when told to assume defaults", 'never re-run, rewrite or "correct" an earlier report', "don't cut or start the next milestone's plan", 'tell the user plainly which requirement failed']) assert.ok(skill('charter').includes(words), `charter SKILL.md lacks: ${words}`)
})

test('every skill that starts a role agent starts it by its bare name, else as jbit:<role>, and never passes model or effort', () => {
  const starts = skills.filter(s => /Agent call|role agent|`(?:builder|verifier|researcher)` agent/.test(skill(s)))
  assert.deepEqual(starts, ['autopilot', 'plan', 'stage', 'verify'])
  const pattern = /by its bare name \(`([a-z]+)`\) when the session's agent list has it, else as `jbit:\1`/
  for (const name of starts) {
    assert.match(skill(name), pattern, `${name} SKILL.md lacks the bare-name rule`)
    assert.ok(skill(name).includes('never pass `model` or `effort` on the Agent call'), `${name} SKILL.md lacks the no model/effort rule`)
  }
})

test('stage, autopilot and plan tell each agent to read narrowly, stop when the brief is done, and hand back a short report', () => {
  for (const name of ['stage', 'autopilot', 'plan'])
    assert.ok(skill(name).includes('read narrowly, stop when the brief is done, and hand back a report of 20 lines at most'), `${name} SKILL.md lacks the brief rule`)
})

// 1.1.0: a limit the user writes in CLAUDE.md on agents at once or worktrees is followed; the README says how.
test('stage, autopilot and plan follow a CLAUDE.md limit on agents at once or worktrees', () => {
  const shared = ['`CLAUDE.md`', 'agents at once or worktrees', 'at most that many agents at a time', 'one after another', 'no `isolation: "worktree"`', 'worktrees off', 'with agents off, the work runs in the main session']
  const own = { stage: ['`~/.claude/CLAUDE.md` or the project\'s', 'builders work in the main tree on separate files'], autopilot: [], plan: ['research and survey agents'] }
  for (const [name, extra] of Object.entries(own))
    for (const words of [...shared, ...extra]) assert.ok(skill(name).includes(words), `${name} SKILL.md lacks: ${words}`)
})

test('the plugin README has a ## Slower machines section with CLAUDE.md lines for every repo and one project, and the Agent deny fallback', () => {
  const m = /\n## Slower machines\n([\s\S]*?)(?=\n## |$)/.exec(readmes.plugin)
  assert.ok(m, 'plugin README lacks a ## Slower machines section')
  assert.match(m[1], /project(?:'s)? `CLAUDE\.md`|`CLAUDE\.md` (?:at|in) the project|`\.\/CLAUDE\.md`/, 'Slower machines section lacks a project CLAUDE.md')
  for (const words of ['~/.claude/CLAUDE.md', 'permissions.deny', '"Agent"'])
    assert.ok(m[1].includes(words), `Slower machines section lacks ${words}`)
})

test('the product is JBIT in prose, not jbit', () => {
  // `jbit` stays in command names (`/jbit:plan`, `jbit:stage`), the status line (`jbit · …`) and code
  const prose = /(?<![/:`@\w-])jbit(?![:\w@-]| ·)/
  for (const name of skills) assert.doesNotMatch(markdownProse(skill(name)), prose, `skills/${name} says jbit in prose`)
  for (const [name, text] of Object.entries(readmes)) assert.doesNotMatch(markdownProse(text), prose, `${name} README says jbit in prose`)
  for (const [name, text] of Object.entries(manifests)) assert.doesNotMatch(text, prose, `${name} says jbit in prose`)
  const hit = prose.exec(guideProse)
  assert.equal(hit, null, hit ? `field guide says jbit in prose: "${guideProse.slice(Math.max(0, hit.index - 60), hit.index + 40).replace(/\s+/g, ' ')}"` : '')
})

test('READMEs, plugin.json and the marketplace lead with "Just build it." and the promise line', () => {
  const promise = 'Plans it. Proves it. Sees it through.'
  // each README opens with the hero banner: animated light and dark WebP (docs/assets/render-hero-animated.mjs),
  // still PNGs for reduced motion (docs/assets/render-hero.mjs), both rendered from the field guide, its alt text carrying the name, the brand line and the promise
  for (const [name, text] of Object.entries(readmes)) {
    assert.ok(text.startsWith('<h1 align="center">\n  <picture>'), `${name} README opens with the hero banner`)
    const head = text.slice(0, text.indexOf('</h1>'))
    assert.match(head, new RegExp(`alt="JBIT\\. Just build it\\. ${promise.replace(/\./g, '\\.')}`), `${name} README banner alt text`)
    const dir = name === 'root' ? repo : plugin
    const srcs = [...head.matchAll(/(?:src|srcset)="([^"]+)"/g)].map(m => m[1])
    assert.deepEqual(srcs.map(s => s.replace(/^(\.\.\/)*/, '')), ['docs/assets/jbit-hero-dark.png', 'docs/assets/jbit-hero-light.png', 'docs/assets/jbit-hero-dark.webp', 'docs/assets/jbit-hero-light.webp'], `${name} README banner images`)
    for (const src of srcs) assert.ok(existsSync(join(dir, src)), `${name} README banner image exists: ${src}`)
  }
  for (const desc of [manifest.description, marketplace.description, marketplace.plugins[0].description])
    assert.ok(desc.startsWith(`Just build it. ${promise}`), `description leads with: ${desc.slice(0, 60)}`)
  assert.equal(marketplace.plugins[0].description, manifest.description)
})

test('the plugin README says how to set a role agent\'s model and effort for one project or every repo', () => {
  const m = /\n### Role agents\n([\s\S]*?)\n##? /.exec(readmes.plugin)
  assert.ok(m, 'plugin README lacks a ### Role agents section')
  for (const words of ['.claude/agents/', '~/.claude/agents/', 'model:', 'effort:'])
    assert.ok(m[1].includes(words), `Role agents section lacks ${words}`)
})

// 1.0.0 stage 3: the hook only adds the plan's `## Now`, the working rules, a compaction note, the status line and the commit secret guard.
const hooks = join(plugin, 'hooks')
const shell = read(join(hooks, 'shell.ts'))
const WORKING_RULES = "Working rules: build in stages; a stage is done when its checks pass against the running product and the suite is green; save each stage's evidence to `docs/evidence/stage-<n>/`; risky stages get `/code-review` and `/security-review`; commit per stage. The JBIT skills (plan, charter, stage, verify, autopilot, resume) hold the details."

test('hooks/ has no project.ts or models.ts', () => {
  for (const gone of ['project.ts', 'models.ts']) assert.ok(!existsSync(join(hooks, gone)), `hooks/${gone} still exists`)
})

test('register.ts registers exactly prompt.compose, session.compact and a Bash-scoped tool.call', () => {
  const calls = [...hook.matchAll(/\bon\('([^']+)'(?:,\s*(\{[^}]*\}))?/g)].map(m => (m[2] ? `${m[1]} ${m[2].replace(/\s+/g, ' ')}` : m[1]))
  assert.deepEqual(calls.sort(), ['prompt.compose', 'session.compact', "tool.call { tool: 'Bash' }"])
  for (const gone of ['turn.complete', "{ tool: 'Agent' }", "{ tool: 'Skill' }"]) assert.ok(!hook.includes(gone), `register.ts still has ${gone}`)
})

test('register.ts has no text for removed features', () => {
  for (const gone of [/unattended/i, /COMMAND_VOCABULARY/, /PROGRESS_NOTE/, /\bModels:/, /\bAgents:/, /approve/i])
    assert.doesNotMatch(hook, gone, `register.ts still has ${gone}`)
})

test('the working-rules line names the six skills, and neither fix nor review as a skill', () => {
  assert.ok(hook.includes(WORKING_RULES), 'register.ts lacks the working-rules line')
  const named = /The JBIT skills \(([^)]*)\)/.exec(WORKING_RULES)[1].split(/,\s*/)
  assert.deepEqual([...named].sort(), ['autopilot', 'charter', 'plan', 'resume', 'stage', 'verify'])
  assert.doesNotMatch(hook, /jbit:(?:fix|review)\b/, 'register.ts names jbit:fix or jbit:review')
})

test('shell.ts has no outward code', () => {
  for (const gone of [/outward/i, /OUTWARD_TOOLS/, /\bnetworkReason\b/, /\brunnerless\b/, /\bSENDS\b/, /\bFEEDS\b/, /\bWRITES_CONFIG\b/])
    assert.doesNotMatch(shell, gone, `shell.ts still has ${gone}`)
})

// 1.0.0 stage 4: the docs, manifests, evals and decisions describe 1.0.0 only.
/** Text that describes behaviour removed in 1.0.0. Bare "outward" stays allowed: autopilot still stops before outward steps. */
const REMOVED = [
  [/\/?jbit:(?:fix|approve|review)\b/i, 'a removed skill'],
  [/^\s*(?:[-*]\s*)?`?(?:Agents|Models|Mode):/m, 'an Agents:/Models:/Mode: line'],
  [/\b(?:Agents|Models|Mode) lines?\b|`(?:Agents|Models|Mode):`/, 'the Agents/Models/Mode line'],
  [/\bJBIT (?:models|approve|outward|risk)\b|\b(?:JBIT|Keel) (?:risk|outward):|\bhold words?\b/i, 'a removed command or CLAUDE.md line'],
  [/\b(?:un)?attended\b/i, 'attended/unattended'],
  [/`outward`|\boutward (?:check|mode|level|run|word|command)s?\b|autopilot outward\b|\boutward levels?\b/i, 'outward as a mode or check'],
  [/`(?:lean|balanced|wide)`|\b(?:lean|balanced|wide) (?:level|mode|run)\b/i, 'an Agents level'],
  [/\bapproval repl|\bapproval word|\breleases? the hold\b|\bthe hold\b|\bheld stage\b|\bstage is held\b|risky-stage holds?\b|\bholds? (?:the|a|this|that|every) (?:risky )?(?:stage|run)\b/i, 'approvals or holds'],
  [/\bcommit gate\b|\bworktree notice\b|\bbaseRef notice\b/i, 'a removed hook gate or notice'],
]
const removedHits = (name, text) => {
  const hits = []
  for (const [re, what] of REMOVED) {
    const m = re.exec(text)
    if (m) hits.push(`${name} has ${what}: "${text.slice(Math.max(0, m.index - 50), m.index + m[0].length + 30).replace(/\s+/g, ' ')}"`)
  }
  return hits
}
/** The READMEs minus their upgrade notes, which name the removed features on purpose: the plugin README's `## Upgrading from 0.18` section and the root README's `Upgrading from 0.18?` line. */
const pluginUpgrade = /\n## Upgrading from 0\.18\n[\s\S]*?(?=\n## |$)/
const rootUpgrade = /\nUpgrading from 0\.18\?[^\n]*/
const docsMinusUpgrade = { root: readmes.root.replace(rootUpgrade, '\n'), plugin: readmes.plugin.replace(pluginUpgrade, '\n') }
/** The field guide without its stylesheet (CSS class names such as `.held` aren't text a reader sees). */
const guideText = guide.replace(/<style\b[\s\S]*?<\/style>/gi, ' ')

test('the upgrade notes exist where the exemption expects them', () => {
  assert.match(readmes.plugin, pluginUpgrade, 'plugin README lacks ## Upgrading from 0.18')
  assert.match(readmes.root, rootUpgrade, 'root README lacks the "Upgrading from 0.18?" line')
})

test('READMEs (outside the upgrade notes), manifests and the field guide carry no removed-feature text', () => {
  const texts = { ...docsMinusUpgrade, 'field-guide.html': guideText, ...manifests }
  const hits = Object.entries(texts).flatMap(([name, text]) => removedHits(name, text))
  assert.deepEqual(hits, [])
})

test('plugin.json is 1.1.0, the field guide says JBIT 1.1.0, and the descriptions fit 1.x', () => {
  assert.equal(manifest.version, '1.1.0')
  assert.ok(guide.includes('<span class="brand">JBIT 1.1.0</span>'), 'field guide header lacks JBIT 1.1.0')
  assert.ok(guide.includes('<footer>JBIT 1.1.0 ·'), 'field guide footer lacks JBIT 1.1.0')
  assert.doesNotMatch(guide, /JBIT 0\.\d+\.\d+/, 'field guide still names a 0.x version')
  for (const [name, text] of Object.entries(manifests)) {
    assert.doesNotMatch(text, /\b0\.\d+\.\d+\b/, `${name} names a 0.x version`)
    assert.doesNotMatch(text, /\bapprov|\bAgents? levels?\b|\bModels\b/i, `${name} mentions approvals, Agents levels or Models`)
  }
})

test('READMEs and the field guide name the six skills, four role agents and how to override them, /code-review and /security-review, and a two-job hook', () => {
  const texts = { plugin: readmes.plugin, 'field-guide.html': guide }
  for (const [name, text] of Object.entries(texts)) {
    for (const s of SIX) assert.ok(text.includes(`/jbit:${s}`), `${name} lacks /jbit:${s}`)
    for (const role of ['builder', 'reviewer', 'verifier', 'researcher']) assert.match(text, new RegExp(`\\b${role}\\b`), `${name} lacks the ${role} role agent`)
    for (const words of ['.claude/agents/', 'model', 'effort', '/code-review', '/security-review', 'two jobs'])
      assert.ok(text.includes(words), `${name} lacks ${words}`)
  }
  for (const words of ['/code-review', '/security-review', 'plugins/jbit/README.md']) assert.ok(readmes.root.includes(words), `root README lacks ${words}`)
})

// The cases that tested removed behaviour (2026-11-17); stale-autopilot keeps an old `Mode:` line on purpose, to prove it's ignored.
const evals = join(plugin, 'evals')
const cases = readdirSync(evals).filter(d => existsSync(join(evals, d, 'case.yaml'))).sort()
const caseFiles = c => readdirSync(join(evals, c)).filter(f => /\.(?:ya?ml|sh|ts|md)$/.test(f)).map(f => [`evals/${c}/${f}`, read(join(evals, c, f))])

test('evals/ has no case for removed behaviour', () => {
  const gone = ['agents-lean', 'agents-wide', 'agents-wide-unconfirmed', 'models-line', 'models-my-default', 'jbit-hero-unattended', 'just-build-it-approves', 'just-build-it-attended', 'research-fetch', 'research-role', 'risky-stage-held']
  for (const c of gone) assert.ok(!existsSync(join(evals, c)), `evals/${c} still exists`)
  for (const c of cases) assert.doesNotMatch(c, /^(?:agents|models)-|attended|approv|\bheld\b|\bhold|outward|^(?:fix|review|approve)-/, `evals/${c} is named for removed behaviour`)
})

test('no eval case names jbit:fix, jbit:review or jbit:approve, or grades a Mode, Agents or Models line', () => {
  const hits = []
  for (const c of cases)
    for (const [name, text] of caseFiles(c)) {
      if (/jbit:(?:fix|review|approve)\b/.test(text)) hits.push(`${name} names a removed skill`)
      if (c === 'stale-autopilot') continue
      if (/\b(?:Mode|Agents|Models)(?::| lines?\b)/.test(text)) hits.push(`${name} has a Mode/Agents/Models line`)
      const h = removedHits(name, text).filter(x => !/a removed skill|Mode: line|Mode line/.test(x))
      hits.push(...h)
    }
  assert.deepEqual(hits, [])
})

test('stale-autopilot is the one case with an old Mode: line, and it grades that the line is ignored', () => {
  const text = read(join(evals, 'stale-autopilot', 'case.yaml'))
  assert.match(text, /`Mode: autopilot`/)
  assert.match(text, /does not drive the session/)
})

// docs/decisions.md: kept decisions first, retired ones under one heading with a why line, none deleted.
const decisions = read(join(repo, 'docs', 'decisions.md'))
const dated = text => text.split('\n').filter(l => /^- (?:~~)?(?:\*\*)?\d{4}-\d{2}-\d{2}/.test(l)).length
const DECISIONS_AT_1_0_CUT = 108
/** The dated decisions in the last commit's docs/decisions.md, or null where git or the file isn't there (the eval sandbox). */
const datedAtHead = (() => {
  try { return dated(execFileSync('git', ['show', 'HEAD:docs/decisions.md'], { cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })) } catch { return null }
})()

test('docs/decisions.md has a ## Retired in 1.0.0 heading with a line saying why', () => {
  const m = /\n## Retired in 1\.0\.0\n\n([^\n]+)\n/.exec(decisions)
  assert.ok(m, 'no ## Retired in 1.0.0 heading followed by a paragraph')
  assert.doesNotMatch(m[1], /^- /, 'the line under the heading is a decision, not the why')
  assert.match(m[1], /stopped holding|gone|retired/i, 'the line under the heading doesn\'t say why')
})

test('the kept decisions carry no removed-feature text', () => {
  const kept = decisions.slice(0, decisions.indexOf('\n## Retired in 1.0.0'))
  const hits = kept.split('\n').filter(l => l.startsWith('- ')).flatMap((l, i) =>
    // `(unattended)` was the tag autopilot put on its own calls before 1.0.0, and a `(from [plan](…))` link names the plan
    // a decision came from; both are its history, not a claim about 1.0.0
    removedHits(`kept decision ${i + 1} (${l.slice(2, 12)})`, l.replace(/\((?:unattended|defaulted)\)/g, '').replace(/\(from \[[^\]]*\]\([^)]*\)\)/g, '')))
  assert.deepEqual(hits, [])
})

test('no dated decision was deleted at the 1.0.0 cut, or since the last commit', () => {
  // retiring a decision moves it under the heading; the count only grows as decisions are added
  assert.ok(dated(decisions) >= DECISIONS_AT_1_0_CUT, `docs/decisions.md has ${dated(decisions)} dated decisions, fewer than the ${DECISIONS_AT_1_0_CUT} at the 1.0.0 cut`)
  if (datedAtHead !== null) assert.ok(dated(decisions) >= datedAtHead, `docs/decisions.md has ${dated(decisions)} dated decisions, fewer than the ${datedAtHead} at HEAD`)
})
