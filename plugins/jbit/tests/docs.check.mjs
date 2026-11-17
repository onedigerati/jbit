// Text checks on the skills, READMEs and manifests: `node --test plugins/jbit/tests/docs.check.mjs`.
// `claude plugin test` runs hooks code in a sandbox with no file access, so the words Claude and users read are checked
// here, against the files themselves, with Node's own test runner.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

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

/** Phrases of the old opt-in design (2026-11-13): only the typed `unattended` word armed, a plain command ended it. */
const OLD_RULE = [
  /only `\/jbit:autopilot unattended`/i,
  /typing `\/jbit:autopilot unattended`/i,
  /types? `\/jbit:autopilot unattended`/i,
  /a plain `\/jbit:autopilot`/i,
  /armed again without the word/i,
  /doesn't open with `\/jbit:autopilot unattended`/i,
  /Only your own typed (?:message|command) arms/i,
]

test('plugin.json and the field guide are version 0.18.1', () => {
  assert.equal(manifest.version, '0.18.1')
  assert.ok(guide.includes('<span class="brand">JBIT 0.18.1</span>'), 'field guide header lacks JBIT 0.18.1')
  assert.ok(guide.includes('<footer>JBIT 0.18.1 ·'), 'field guide footer lacks JBIT 0.18.1')
  assert.doesNotMatch(guide, /JBIT 0\.(?:1[0-7]\.\d|18\.0)\b/, 'field guide still names an older version')
})

test('no skill, README or hook text describes the old opt-in arming rule', () => {
  const texts = { ...Object.fromEntries(skills.map(s => [`skills/${s}`, skill(s)])), ...readmes, hook, 'field-guide.html': guide, ...manifests }
  for (const [name, text] of Object.entries(texts))
    for (const old of OLD_RULE) assert.doesNotMatch(text, old, `${name} still says ${old}`)
})

test('every skill says "JBIT <command>" triggers it', () => {
  for (const name of skills)
    assert.ok(description(name).includes(`opens with "JBIT ${name}"`), `${name}'s description lacks "JBIT ${name}"`)
})

test('the plugin README describes "JBIT approve" as releasing the hold', () => {
  const text = readmes.plugin
  assert.ok(text.includes('releases the hold as `/jbit:approve` does') || text.includes('releases the hold as /jbit:approve does') || text.includes('releases a held stage as `/jbit:approve` does'), 'plugin README doesn\'t say "JBIT approve" releases the hold as /jbit:approve does')
  assert.doesNotMatch(text, /"JBIT approve" is `\/jbit:approve`/, 'plugin README')
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
  for (const words of ['jbit:charter', 'Too big for one plan', 'ask the user before writing']) assert.ok(skill('plan').includes(words), `plan SKILL.md lacks: ${words}`)
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

test('no doc says plain words run attended without saying the level that stands', () => {
  // plain words never set the level: they run at the one that stands, attended only when no command of the user's
  // set one for this plan; a sentence that ties plain words to an attended run must carry that qualifier
  const qualifier = /stands|unless|no command|without a command/i
  const docs = { ...Object.fromEntries(skills.map(s => [`skills/${s}`, markdownProse(skill(s))])), root: markdownProse(readmes.root), plugin: markdownProse(readmes.plugin), 'field-guide.html': guideProse, ...manifests }
  for (const [name, text] of Object.entries(docs))
    for (const sentence of text.split(/(?<=[.!?])\s+|\n+/)) {
      if (!/plain words|"just build it[^"]*"|plain "just/i.test(sentence)) continue
      if (!/\b(?:runs?|starts?|start(?:ing)?|running)\b[^.]*\battended\b|\battended run\b|\brun it attended\b/i.test(sentence)) continue
      assert.match(sentence, qualifier, `${name}: "${sentence.trim()}"`)
    }
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

test('READMEs describe the arming rule', () => {
  for (const [name, text] of Object.entries(readmes)) {
    for (const words of ['JBIT, just build it. Autopilot, lean.', '`attended`', '`outward`', 'Plain words without the name'])
      assert.ok(text.includes(words), `${name} README lacks ${words}`)
  }
})

test('READMEs and the field guide describe research, spikes and progress updates', () => {
  const phrases = {
    root: [
      'one research agent answers the questions that would change the plan',
      'with dated sources, to `docs/research/<topic>.md`',
      'decisions resting on a finding link the note',
      'becomes a `Spike:` stage, answered by a throwaway prototype',
      'A goal with no such question skips research in one line.',
      'After each stage you get a notification and, when someone reads along, a short progress note',
      'A concern (a check failing again, a review finding being fixed, a risk line that grows) is told in one line when it happens.',
    ],
    plugin: [
      'With none, it says so in one line ("No research: nothing outside the repo changes this plan.")',
      'each answer goes to `docs/research/<topic>.md`: the question, the answer, its sources each with the date it read them',
      'A decision that rests on a finding links its note.',
      'becomes a stage named `Spike: <question>`',
      'the prototype isn\'t shipped',
      'A domain fact that turns up mid-build',
      'The reviewer gets the `docs/research/` notes the stage relies on',
      'Each commit that closes a stage sends a notification',
      'its concerns first, or `No concerns.`',
      '`Concern: <what> — <what Claude is doing about it>`',
    ],
    'field-guide.html': [
      '<h3>Research before the stages, spikes when paper can\'t settle it</h3>',
      'has one research agent answer them. Each answer goes to <code>docs/research/&lt;topic&gt;.md</code>',
      'A goal with no such question skips research in one line.',
      'becomes a stage named <code>Spike: &lt;question&gt;</code>',
      'Each commit that closes a stage sends a notification',
      'the manager gives a short progress note before going on: concerns first, or "No concerns."',
      'is told in one line when it happens',
    ],
  }
  const texts = { ...readmes, 'field-guide.html': guide }
  for (const [name, list] of Object.entries(phrases))
    for (const words of list) assert.ok(texts[name].includes(words), `${name} lacks: ${words}`)
})

test('READMEs and the field guide say the progress note is for when someone reads along, and a headless run leaves it to the final report', () => {
  const phrases = {
    root: [
      'After each stage you get a notification and, when someone reads along, a short progress note',
      'A headless run leaves the note to the final report.',
      'A headless run leaves the progress note between stages to the final report, which covers each stage.',
    ],
    plugin: [
      'when someone reads along, Claude gives a short progress note in the chat before going on (a headless run leaves it to the final report)',
      'After each stage it gives a short progress note when someone reads along',
      'a headless run leaves it to the final report. It tells a concern in one line when it happens.',
      'A headless run leaves the progress note between stages to the final report',
    ],
    'field-guide.html': [
      'when someone reads along, the manager gives a short progress note before going on',
      'A headless run leaves the note to the final report.',
      'After each stage it gives a progress note when someone reads along (concerns, proof, what\'s left); a headless run leaves it to the final report.',
    ],
  }
  const texts = { ...readmes, 'field-guide.html': guide }
  for (const [name, list] of Object.entries(phrases))
    for (const words of list) assert.ok(texts[name].includes(words), `${name} lacks: ${words}`)
  for (const [name, t] of Object.entries(texts))
    for (const old of ['you get a notification and a short progress note', 'and Claude gives a short progress note in the chat', 'and the manager gives a short progress note', 'After each stage it gives a short progress note (', 'After each stage it gives a progress note:'])
      assert.ok(!t.includes(old), `${name} still gives the progress note without the headless qualifier: ${old}`)
})

test('READMEs and the field guide describe the commit gate: a line that writes the plan and commits is refused under autopilot, a close found after the run is checked against its commit and flagged to reopen', () => {
  const phrases = {
    root: [
      'Under autopilot, a command line that writes the plan and commits is refused',
      'a close found only after a line ran is checked against its commit and flagged to reopen if it fails.',
    ],
    plugin: [
      'under autopilot a line that names the plan file and commits is refused before it runs (edit the plan, then commit on its own line)',
      'is told only if that commit passes the same gates',
      'Claude is told on the command\'s result to reopen the stage',
      'Under autopilot such a line is refused before it runs: a line that writes the plan and commits',
      'A close the hook only finds after a line ran is checked against the commit it landed in, and one that fails either gate isn\'t announced and is flagged to reopen',
    ],
    'field-guide.html': [
      'Under autopilot, a line that writes the plan and commits is refused before it runs.',
      'A close found only after a line ran is checked against its commit and, if it fails, flagged to reopen.',
    ],
  }
  const texts = { ...readmes, 'field-guide.html': guide }
  for (const [name, list] of Object.entries(phrases))
    for (const words of list) assert.ok(texts[name].includes(words), `${name} lacks: ${words}`)
  assert.ok(!readmes.plugin.includes("(`sed -i … && git commit`) isn't seen. The same goes"), 'plugin README still says a same-line plan edit is simply not seen')
})

test('the hold descriptions name the docs/research/ note exception, and the outward check is said to cover shell commands, not web searches', () => {
  const holds = {
    root: ['A held stage gets no file edits outside the plan and its `docs/research/` notes.'],
    plugin: [
      'The hook holds it, with no file edits outside the plan and its `docs/research/` notes and no builder agents',
      'gets no file edits outside the plan and its `docs/research/` notes (one level deep, a plain name, never `CLAUDE.md`) and no builder agents',
    ],
    'field-guide.html': [
      'gets no file edits outside the plan and its <code>docs/research/</code> notes, and no builders',
      'The hook blocks file edits outside the plan and its <code>docs/research/</code> notes, and builder agents',
    ],
  }
  const outward = {
    root: ['The outward check covers shell commands, not web searches'],
    plugin: ['The outward check reads shell commands only: web searches and fetches aren\'t covered', 'The hook blocks outward shell commands while autopilot is armed; it doesn\'t see web searches or fetches'],
    'field-guide.html': ['It covers shell commands, not web searches'],
  }
  const texts = { ...readmes, 'field-guide.html': guide }
  for (const set of [holds, outward])
    for (const [name, list] of Object.entries(set))
      for (const words of list) assert.ok(texts[name].includes(words), `${name} lacks: ${words}`)
  // no hold description left without the exception
  for (const [name, text] of Object.entries(texts))
    assert.doesNotMatch(text, /no file edits(?! outside the plan and its)/, `${name} describes the hold without the research-note exception`)
  assert.doesNotMatch(readmes.plugin, /no file edits or builder agents/, 'plugin README hold line lacks the exception')
})

test('the research and progress eval cases exist with a case.yaml, scaffold and graders, and the README lists them', () => {
  for (const name of ['research-domain', 'research-none', 'research-spike', 'progress-note']) {
    const dir = join(plugin, 'evals', name)
    assert.ok(existsSync(join(dir, 'case.yaml')), `evals/${name}/case.yaml is missing`)
    assert.ok(existsSync(join(dir, 'scaffold.sh')), `evals/${name}/scaffold.sh is missing`)
    const text = read(join(dir, 'case.yaml'))
    assert.ok(text.includes(`name: ${name}\n`), `evals/${name}/case.yaml names itself`)
    assert.match(text, /\ngraders:\n  - type: /, `evals/${name}/case.yaml has graders`)
    assert.ok(read(join(dir, 'scaffold.sh')).includes('git config user.email eval@example.com'), `evals/${name}/scaffold.sh sets a repo-local git author`)
    assert.ok(readmes.plugin.includes(`(\`${name}\``), `plugin README lacks the eval case ${name}`)
  }
  const domain = read(join(plugin, 'evals', 'research-domain', 'case.yaml'))
  assert.ok(domain.includes('path: "docs/research/*.md"'), 'research-domain checks for a note under docs/research/')
  assert.ok(read(join(plugin, 'evals', 'research-none', 'case.yaml')).includes('path: docs/research\n    exists: false'), 'research-none checks no note is written')
  assert.ok(read(join(plugin, 'evals', 'research-spike', 'case.yaml')).includes('Spike: '), 'research-spike checks for a Spike stage')
  assert.ok(read(join(plugin, 'evals', 'progress-note', 'case.yaml')).includes('prompt: "JBIT, just build it. Autopilot, lean."'), 'progress-note runs under the JBIT command, whose rules ride beside the prompt headless')
})

test('READMEs and the field guide describe the Models line, JBIT models, the CLAUDE.md default, what can\'t be set, and that only the user sets effort', () => {
  const phrases = {
    root: [
      '`Models: build sonnet/medium · review opus/high`',
      '`build`, `research`, `review` and `verify`, each `model/effort`',
      'A role the line leaves out takes your own default (or a confirmed project default) when there is one, else runs as the session.',
      '`JBIT models build sonnet/medium`',
      '`JBIT models default` goes back to the project default (a `JBIT models:` line in `CLAUDE.md`',
      '`JBIT models none` removes the line',
      'Planning and project management run in the main session, so they stay on the session\'s model: change that with `/model`.',
      'Only you set effort',
    ],
    plugin: [
      '### Models',
      'Models: build sonnet/medium · review opus/high · verify sonnet/medium',
      'A role the line leaves out takes your own default (or a confirmed project default) when there is one, else runs as the session; with no line and no default, every agent does.',
      '`JBIT models build sonnet/medium, review opus/high`',
      '`JBIT models default` goes back to the project default, `JBIT models none` (or `off`) removes the line',
      'A `JBIT models: build sonnet/medium · review opus/high` line in `CLAUDE.md`',
      'Planning and project management run in the main session, so they stay on the session\'s model and effort, set in Claude Code with `/model`.',
      '`JBIT models plan …` or `lead …` is refused with a pointer to `/model`',
      '**Only you set effort.** Claude passes the effort the line names and never picks one itself',
      'With a `build` setting, `/jbit:stage` hands building to one builder agent',
      'or it\'s denied with a message naming the roles\' settings',
    ],
    'field-guide.html': [
      '<section id="models">',
      '<a href="#models">Models</a>',
      '<code>Models: build sonnet/medium · review opus/high · verify sonnet/medium</code>',
      'A role the line leaves out takes your own default (or a confirmed project default) when there is one, else runs as the session.',
      '<code>JBIT models build sonnet/medium</code>',
      '<code>JBIT models default</code> goes back to the project default, a <code>JBIT models:</code> line in <code>CLAUDE.md</code>',
      '<code>JBIT models none</code> removes the line',
      'they stay on the session\'s model, set in Claude Code with <code>/model</code>',
      'Only you set effort: Claude passes the effort the line names and never picks one itself',
    ],
  }
  const texts = { ...readmes, 'field-guide.html': guide }
  for (const [name, list] of Object.entries(phrases))
    for (const words of list) assert.ok(texts[name].includes(words), `${name} lacks: ${words}`)
})

test('READMEs and the field guide give the research-fetch rule: a read-only curl or wget GET passes under autopilot, a send waits, WebFetch and WebSearch read', () => {
  const phrases = {
    root: ['Reading isn\'t held: a read-only `curl` or `wget` GET passes, while anything that sends (a body, an upload, credentials, an auth or cookie header) waits, and the hold points to WebFetch and WebSearch for reading pages.'],
    plugin: [
      'A research read isn\'t a send: a `curl` or `wget` GET to an outside host passes when every option is a known-harmless one',
      'still waits, and the hold points to WebFetch and WebSearch for reading pages',
      'Reading isn\'t held: a read-only `curl` or `wget` GET passes, a send waits, and research reads go through WebFetch and WebSearch.',
    ],
    'field-guide.html': ['Reading isn\'t held: a read-only <code>curl</code> or <code>wget</code> GET passes, while a send (a body, an upload, credentials, an auth or cookie header) waits, and the hold points to WebFetch and WebSearch for reading pages.'],
  }
  const texts = { ...readmes, 'field-guide.html': guide }
  for (const [name, list] of Object.entries(phrases))
    for (const words of list) assert.ok(texts[name].includes(words), `${name} lacks: ${words}`)
})

test('the models-line and research-fetch eval cases exist with a case.yaml, scaffold and graders, and the README lists them', () => {
  for (const name of ['models-line', 'research-fetch']) {
    const dir = join(plugin, 'evals', name)
    assert.ok(existsSync(join(dir, 'case.yaml')), `evals/${name}/case.yaml is missing`)
    assert.ok(existsSync(join(dir, 'scaffold.sh')), `evals/${name}/scaffold.sh is missing`)
    const text = read(join(dir, 'case.yaml'))
    assert.ok(text.includes(`name: ${name}\n`), `evals/${name}/case.yaml names itself`)
    assert.match(text, /\ngraders:\n  - type: /, `evals/${name}/case.yaml has graders`)
    assert.ok(text.includes('prompt: JBIT autopilot lean\n'), `evals/${name} runs under the user's own JBIT command`)
    assert.ok(read(join(dir, 'scaffold.sh')).includes('git config user.email eval@example.com'), `evals/${name}/scaffold.sh sets a repo-local git author`)
    assert.ok(readmes.plugin.includes(`(\`${name}\``), `plugin README lacks the eval case ${name}`)
  }
  assert.ok(read(join(plugin, 'evals', 'models-line', 'scaffold.sh')).includes('Models: build sonnet/medium · review opus/high'), 'models-line scaffold carries the Models line')
  const models = read(join(plugin, 'evals', 'models-line', 'case.yaml'))
  for (const g of ['builder-on-sonnet-medium', 'reviewer-on-opus-high', 'no-other-effort']) assert.ok(models.includes(`name: ${g}\n`), `models-line lacks the ${g} grader`)
  const fetch = read(join(plugin, 'evals', 'research-fetch', 'case.yaml'))
  for (const g of ['runs-the-get', 'post-held-with-webfetch-pointer']) assert.ok(fetch.includes(`name: ${g}\n`), `research-fetch lacks the ${g} grader`)
})

test('the plugin README says a CLAUDE.md default waits for the user\'s word, and describes the user\'s own default and its precedence', () => {
  for (const words of [
    'It counts only once you confirm it in the session, by naming its settings and roles in your own message',
    "so a cloned repo's committed default never raises spend unasked; until then the context tells Claude it is waiting for your word",
    '`JBIT models build sonnet/medium · research sonnet/high — my default` (or `- my default`, `, my default`)',
    'Only your own typed command saves it, never an agent, a plugin\'s prompt or a file. `JBIT models clear my default` removes it.',
    'Per role: the plan\'s line, then a confirmed project default, then your own default, then the session.',
    '`JBIT models` alone shows each role\'s setting and where it comes from (plan, CLAUDE.md, my default or session)',
  ])
    assert.ok(readmes.plugin.includes(words), `plugin README lacks: ${words}`)
  // the struck 2026-11-15 rule: a plan line matching the CLAUDE.md default is no longer honoured unasked
  assert.ok(!/matches (?:it|the (?:project )?default) is honoured/i.test(readmes.plugin), 'plugin README still says a line matching the default is honoured')
})

// 0.18.1 docs: subagent calls never move the main session's state, and the worktree baseRef notice.
test('the plugin README and the field guide say subagent calls never move the main session\'s state and describe the baseRef notice', () => {
  const phrases = {
    plugin: [
      'A subagent\'s tool calls never move the main session\'s state',
      'judge a subagent\'s calls by the main session\'s plan',
      'Worktree agents start from the remote\'s default branch, not your local `HEAD`',
      '`"worktree": {"baseRef": "head"}`',
      'With `"baseRef": "head"` set, nothing is said.',
      'A subagent\'s own Agent calls never give the notice.',
    ],
    'field-guide.html': [
      'A subagent\'s tool calls never move the main session\'s state',
      'judge its calls by the main session\'s plan',
      'Worktree agents start from the remote\'s default branch, not your local <code>HEAD</code>',
      '<code>"worktree": {"baseRef": "head"}</code>',
      'With <code>"baseRef": "head"</code>, nothing is said.',
    ],
  }
  const texts = { plugin: readmes.plugin, 'field-guide.html': guide }
  for (const [name, list] of Object.entries(phrases))
    for (const words of list) assert.ok(texts[name].includes(words), `${name} lacks: ${words}`)
})

// 0.18.0 docs: the research role, small agents, the user's own default, and a CLAUDE.md default waiting for the user's word.
test('READMEs and the field guide describe the research role, small agents, the user\'s own default and a CLAUDE.md default waiting for the user\'s word', () => {
  const phrases = {
    root: [
      'Research agents get the `research` setting, so the research that once ran on the session\'s model can run on a cheaper one.',
      'A project default counts only once you confirm it in the session, so a cloned repo\'s committed default never raises spend unasked.',
      '`JBIT models build sonnet/medium · research sonnet/high — my default` also saves the settings as your own default, kept outside every repo: a new plan in any repo starts from it. `JBIT models clear my default` removes it',
      '- **Small agents.** A fan-out gives each agent a small batch, a few items at most (a nine-item research list goes to agents of at most three each)',
      'read narrowly, stop when its brief is done and hand back a short report (20 lines at most, no diffs or dumps)',
    ],
    plugin: [
      'Builders, research agents, verifiers and reviewers start on the model and effort the plan\'s Models line sets for their role',
      'starts the Models line from your own default and a `CLAUDE.md` default you\'ve confirmed in the session',
      'or a role neither the line nor a default sets) runs as the session',
      '- **Small agents, at every level.** A fan-out, research or build, gives each agent a small batch, a few items at most: a nine-item research list goes to agents of at most three each.',
      'Every brief asks the agent to read narrowly (grep and read the lines it needs, not whole large files), stop when its brief is done, and hand back a short report, 20 lines at most with no diffs or file dumps.',
      'A single small item needs no split, and the rule adds no agent',
    ],
    'field-guide.html': [
      'Research agents get the <code>research</code> setting, so research can run on a cheaper model than the session\'s.',
      'A project default waits for your word: it counts only once you confirm it in the session',
      'Your own default follows you to every repo: <code>JBIT models build sonnet/medium · research sonnet/high — my default</code> sets the line and also saves those settings in JBIT\'s per-user store, outside every repo',
      '<code>JBIT models clear my default</code> removes it',
      'Per role, the plan\'s line wins, then a confirmed project default, then your own default, then the session',
      'At every level the agents stay small. A fan-out, research or build, gives each agent a few items at most (a nine-item research list goes to agents of at most three each)',
      'hand back a short report, 20 lines at most with no diffs or dumps',
    ],
  }
  const texts = { ...readmes, 'field-guide.html': guide }
  for (const [name, list] of Object.entries(phrases))
    for (const words of list) assert.ok(texts[name].includes(words), `${name} lacks: ${words}`)
  // the old phrasings: a role left out simply runs as the session, a new plan starts from an unconfirmed CLAUDE.md default
  const old = [
    /A role left out runs as the session/i,
    /a role the line leaves out\) runs as the session/i,
    /CLAUDE\.md(?:<\/code>)?`?,? (?:which|that) a new plan starts from/i,
    /starts the Models line from the `CLAUDE\.md` default/i,
  ]
  for (const [name, text] of Object.entries(texts))
    for (const re of old) assert.doesNotMatch(text, re, `${name} still says: ${re}`)
})

test('the research-role, research-batches and models-my-default eval cases exist with a case.yaml, scaffold and graders, and the README lists them', () => {
  for (const name of ['research-role', 'research-batches', 'models-my-default']) {
    const dir = join(plugin, 'evals', name)
    assert.ok(existsSync(join(dir, 'case.yaml')), `evals/${name}/case.yaml is missing`)
    assert.ok(existsSync(join(dir, 'scaffold.sh')), `evals/${name}/scaffold.sh is missing`)
    const text = read(join(dir, 'case.yaml'))
    assert.ok(text.includes(`name: ${name}\n`), `evals/${name}/case.yaml names itself`)
    assert.match(text, /\ngraders:\n  - type: /, `evals/${name}/case.yaml has graders`)
    assert.ok(read(join(dir, 'scaffold.sh')).includes('git config user.email eval@example.com'), `evals/${name}/scaffold.sh sets a repo-local git author`)
    assert.ok(readmes.plugin.includes(`(\`${name}\``), `plugin README lacks the eval case ${name}`)
  }
  assert.ok(read(join(plugin, 'evals', 'research-role', 'scaffold.sh')).includes('Models: build sonnet/medium · research sonnet/high · review opus/high'), 'research-role scaffold carries the Models line')
  const role = read(join(plugin, 'evals', 'research-role', 'case.yaml'))
  for (const g of ['research-on-sonnet-high', 'no-other-effort', 'no-agent-on-build-or-review-setting']) assert.ok(role.includes(`name: ${g}\n`), `research-role lacks the ${g} grader`)
  const batches = read(join(plugin, 'evals', 'research-batches', 'case.yaml'))
  for (const g of ['batches-of-at-most-three', 'briefs-ask-narrow-and-short']) assert.ok(batches.includes(`name: ${g}\n`), `research-batches lacks the ${g} grader`)
  const mine = read(join(plugin, 'evals', 'models-my-default', 'case.yaml'))
  assert.ok(mine.includes('prompt: "JBIT models build sonnet/medium · research sonnet/high — my default"\n'), 'models-my-default runs the user\'s own — my default command')
  for (const g of ['writes-models-line', 'reply-names-my-default']) assert.ok(mine.includes(`name: ${g}\n`), `models-my-default lacks the ${g} grader`)
  assert.ok(mine.includes('proven by a\n  headless run') || /proven by a\s+headless run/.test(mine), 'models-my-default says the cross-repo part is proven by a headless run')
})

test('the plugin README says how to set a role agent\'s model and effort for one project or every repo', () => {
  const m = /\n### Role agents\n([\s\S]*?)\n### /.exec(readmes.plugin)
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
