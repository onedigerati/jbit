// Tests for the host package build (`hosts/build.mjs`): determinism, the drift check, the leak check, the tested
// substitutions and rewrites, and the generated Copilot hook running on its own. Sources are copied to temp dirs before
// any change; `plugins/jbit/` is only read. Run: node --test hosts/
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync, execFileSync } from 'node:child_process'
import { cpSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync, appendFileSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { findLeaks, gapBlock, generate, loadCapability } from './build.mjs'

const HOSTS = dirname(fileURLToPath(import.meta.url))
const ROOT = dirname(HOSTS)
const BUILD = join(HOSTS, 'build.mjs')

const temps = []
process.on('exit', () => temps.forEach(d => rmSync(d, { recursive: true, force: true })))
const temp = (tag = 'jbit-build-') => {
  const d = realpathSync(mkdtempSync(join(tmpdir(), tag)))
  temps.push(d)
  return d
}

/** A copy of everything the Copilot build reads, so a test can change a source without touching the repo. */
function sources() {
  const dir = temp('jbit-build-src-')
  for (const p of ['plugins/jbit/.claude-plugin/plugin.json', 'plugins/jbit/LICENSE', 'plugins/jbit/skills', 'plugins/jbit/hooks', 'hosts/copilot', 'hosts/core', 'README.md']) {
    cpSync(join(ROOT, p), join(dir, p), { recursive: true, filter: s => !s.endsWith('.test.mjs') })
  }
  return dir
}

const build = (...args) => spawnSync(process.execPath, [BUILD, 'copilot', ...args], { encoding: 'utf8', timeout: 60000 })

/** Every file under `dir`, as relative path → bytes. */
function snapshot(dir) {
  const out = {}
  const walk = d => {
    for (const name of readdirSync(d).sort()) {
      const p = join(d, name)
      if (statSync(p).isDirectory()) walk(p)
      else out[relative(dir, p)] = readFileSync(p).toString('base64')
    }
  }
  walk(dir)
  return out
}

// ---- determinism ----

test('building twice gives identical bytes, and the second run writes nothing', () => {
  const out = temp()
  const a = build('--out', out)
  assert.equal(a.status, 0, a.stderr)
  const first = snapshot(out)
  assert.ok(first['plugins/jbit-copilot/plugin.json'] && first['.github/plugin/marketplace.json'])
  const b = build('--out', out)
  assert.equal(b.status, 0, b.stderr)
  assert.match(b.stdout, /wrote 0\b/)
  assert.deepEqual(snapshot(out), first)
  // and in memory: two generations agree byte for byte
  const g1 = generate({ src: ROOT, host: 'copilot' }).files
  const g2 = generate({ src: ROOT, host: 'copilot' }).files
  assert.deepEqual([...g1], [...g2])
  assert.deepEqual([...g1.keys()], [...g1.keys()].sort())
})

test('the committed package is current: --check passes on the repo', () => {
  const r = build('--check')
  assert.equal(r.status, 0, r.stdout + r.stderr)
})

// ---- what it generates ----

test('plugin.json, marketplace and hooks.json follow the spike\'s working layout', () => {
  const { files } = generate({ src: ROOT, host: 'copilot' })
  const src = JSON.parse(readFileSync(join(ROOT, 'plugins/jbit/.claude-plugin/plugin.json'), 'utf8'))
  const plugin = JSON.parse(files.get('plugins/jbit-copilot/plugin.json'))
  assert.equal(plugin.name, 'jbit')
  assert.equal(plugin.version, src.version)
  assert.equal(plugin.license, src.license)
  assert.equal(plugin.skills, 'skills/')
  assert.equal(plugin.hooks, 'hooks/hooks.json')
  const mkt = JSON.parse(files.get('.github/plugin/marketplace.json'))
  assert.deepEqual(mkt.plugins.map(p => [p.name, p.source, p.version]), [['jbit', './plugins/jbit-copilot', src.version]])
  const hooks = JSON.parse(files.get('plugins/jbit-copilot/hooks/hooks.json'))
  assert.equal(hooks.version, 1)
  assert.deepEqual(Object.keys(hooks.hooks).sort(), ['agentStop', 'postToolUse', 'preToolUse', 'sessionStart', 'userPromptTransformed'])
  for (const [event, list] of Object.entries(hooks.hooks)) {
    assert.deepEqual(list, [{ type: 'command', bash: `node "\${PLUGIN_ROOT}/scripts/hook.mjs" ${event}`, timeoutSec: 30 }])
  }
})

test('skills keep bare names and get one mapping section at the end', () => {
  const { files } = generate({ src: ROOT, host: 'copilot' })
  const names = readdirSync(join(ROOT, 'plugins/jbit/skills')).sort()
  for (const name of names) {
    const text = files.get(`plugins/jbit-copilot/skills/${name}/SKILL.md`)
    assert.ok(text, name)
    assert.match(text, new RegExp(`^---\\nname: ${name}\\n`))
    assert.equal(text.split('\n## On GitHub Copilot CLI\n').length, 2, name)
    assert.match(text.split('## On GitHub Copilot CLI')[1], /`task`/)
  }
})

test('scripts are copied with their imports rewritten inside the package, and a source hash manifest', () => {
  const { files } = generate({ src: ROOT, host: 'copilot' })
  assert.match(files.get('plugins/jbit-copilot/scripts/hook.mjs'), /import\('\.\/core\/index\.mjs'\)/)
  assert.match(files.get('plugins/jbit-copilot/scripts/core/dispatch.mjs'), /'\.\.\/hooks\/register\.ts'/)
  assert.equal(files.get('plugins/jbit-copilot/scripts/hooks/shell.ts'), readFileSync(join(ROOT, 'plugins/jbit/hooks/shell.ts'), 'utf8'))
  const manifest = JSON.parse(files.get('plugins/jbit-copilot/GENERATED.json'))
  assert.match(manifest.sources['plugins/jbit/hooks/register.ts'], /^[0-9a-f]{64}$/)
  assert.match(manifest.sources['hosts/copilot/capability.json'], /^[0-9a-f]{64}$/)
  for (const [path, text] of files) if (path.includes('/scripts/')) assert.doesNotMatch(text, /['"](\.\.\/)+plugins\//, path)
})

test('frontmatter scalars a strict YAML parser would reject are quoted (Copilot failed on `: ` in a description)', () => {
  const { files } = generate({ src: ROOT, host: 'copilot' })
  let quoted = 0
  for (const [path, text] of files) {
    if (!path.endsWith('SKILL.md')) continue
    const front = text.split('\n---\n')[0].split('\n').slice(1)
    for (const line of front) {
      const [, key, value] = /^([a-z-]+): (.*)$/.exec(line) ?? []
      assert.ok(key, `${path}: ${line}`)
      if (value.startsWith('"')) {
        quoted++
        assert.equal(typeof JSON.parse(value), 'string', path)
      } else assert.doesNotMatch(value, /: | #|^[\[{&*!|>'%@`]/, `${path}: ${key}`)
    }
  }
  assert.ok(quoted >= 3, `quoted ${quoted}`)
  // the text itself is unchanged
  const src = readFileSync(join(ROOT, 'plugins/jbit/skills/plan/SKILL.md'), 'utf8')
  const desc = /^description: (.*)$/m.exec(src)[1]
  assert.equal(JSON.parse(/^description: (.*)$/m.exec(files.get('plugins/jbit-copilot/skills/plan/SKILL.md'))[1]), desc)
})

// ---- drift ----

for (const [what, change] of [
  ['a skill', src => appendFileSync(join(src, 'plugins/jbit/skills/fix/SKILL.md'), '\nOne more line.\n')],
  ['a hook module', src => appendFileSync(join(src, 'plugins/jbit/hooks/shell.ts'), '\n// changed\n')],
  ['a core module', src => appendFileSync(join(src, 'hosts/core/engine.mjs'), '\n// changed\n')],
  [
    'the capability file',
    src => {
      const p = join(src, 'hosts/copilot/capability.json')
      const cap = JSON.parse(readFileSync(p, 'utf8'))
      cap.hooks.timeoutSec = 20
      writeFileSync(p, JSON.stringify(cap, null, 2))
    },
  ],
]) {
  test(`drift: --check fails when ${what} changed, and passes after a rebuild`, () => {
    const src = sources()
    const out = temp()
    assert.equal(build('--src', src, '--out', out).status, 0)
    assert.equal(build('--src', src, '--out', out, '--check').status, 0)
    change(src)
    const r = build('--src', src, '--out', out, '--check')
    assert.notEqual(r.status, 0)
    assert.match(r.stderr, /drift/)
    assert.equal(build('--src', src, '--out', out).status, 0)
    const again = build('--src', src, '--out', out, '--check')
    assert.equal(again.status, 0, again.stderr)
  })
}

test('drift: a stray file in the package, or an edited generated file, fails --check', () => {
  const out = temp()
  assert.equal(build('--out', out).status, 0)
  writeFileSync(join(out, 'plugins/jbit-copilot/skills/stray.md'), 'x')
  let r = build('--out', out, '--check')
  assert.notEqual(r.status, 0)
  assert.match(r.stderr, /extra: plugins\/jbit-copilot\/skills\/stray\.md/)
  assert.equal(build('--out', out).status, 0)
  appendFileSync(join(out, 'plugins/jbit-copilot/skills/plan/SKILL.md'), 'hand edit\n')
  r = build('--out', out, '--check')
  assert.notEqual(r.status, 0)
  assert.match(r.stderr, /differs: plugins\/jbit-copilot\/skills\/plan\/SKILL\.md/)
})

// ---- README gap list ----

/** The README's generated block, between its markers. */
function readmeBlock(text, cap) {
  const { start, end } = cap.readme
  const a = text.indexOf(start)
  const b = text.indexOf(end)
  assert.ok(a !== -1 && b > a, 'README.md lacks the gap block markers')
  return text.slice(a + start.length, b)
}

test('README gap list: the root README\'s block lists every capability.json gap, in order, and nothing else', () => {
  const cap = loadCapability(ROOT, 'copilot')
  const block = readmeBlock(readFileSync(join(ROOT, 'README.md'), 'utf8'), cap)
  assert.equal(block, `\n${gapBlock(cap)}\n`)
  const items = block.split('\n').filter(l => l.startsWith('- '))
  assert.equal(items.length, cap.gaps.length)
  cap.gaps.forEach((g, i) => {
    assert.ok(items[i].includes(g.what), `item ${i + 1} lacks ${g.what}`)
    assert.ok(items[i].includes(g.why), `item ${i + 1} lacks the why of ${g.id}`)
  })
  // the stage-4 gaps the README must carry: present in capability.json, so present in the block by the loop above
  for (const id of ['hook-crash', 'subagent-hold-unproven']) assert.ok(cap.gaps.some(g => g.id === id), `capability.json lacks the ${id} gap`)
  // the build owns only the block: the rest of the README is the repo's own text
  const { files } = generate({ src: ROOT, host: 'copilot' })
  assert.equal(files.get('README.md'), readFileSync(join(ROOT, 'README.md'), 'utf8'))
})

test('README gap list: a gap changed in capability.json fails --check naming README.md, and a rebuild fixes it', () => {
  const src = sources()
  const out = temp()
  assert.equal(build('--src', src, '--out', out).status, 0)
  assert.equal(build('--src', src, '--out', out, '--check').status, 0)
  const p = join(src, 'hosts/copilot/capability.json')
  const cap = JSON.parse(readFileSync(p, 'utf8'))
  cap.gaps[0].why = 'A changed reason.'
  writeFileSync(p, JSON.stringify(cap, null, 2))
  const r = build('--src', src, '--out', out, '--check')
  assert.notEqual(r.status, 0)
  assert.match(r.stderr, /differs: README\.md/)
  const outside = text => {
    const a = text.indexOf(cap.readme.start)
    const b = text.indexOf(cap.readme.end)
    return [text.slice(0, a), text.slice(b)]
  }
  const before = outside(readFileSync(join(out, 'README.md'), 'utf8'))
  assert.equal(build('--src', src, '--out', out).status, 0)
  assert.equal(build('--src', src, '--out', out, '--check').status, 0)
  const after = readFileSync(join(out, 'README.md'), 'utf8')
  assert.ok(readmeBlock(after, cap).includes('A changed reason.'))
  // only the block changed: the text before and after it is byte-identical
  assert.deepEqual(outside(after), before)
})

test('README gap list: a hand edit inside the block fails --check; prose outside it is the README\'s own', () => {
  const src = sources()
  const cap = loadCapability(src, 'copilot')
  const readme = join(src, 'README.md')
  const text = readFileSync(readme, 'utf8')
  writeFileSync(readme, text.replace(cap.readme.end, `- a hand-added gap\n${cap.readme.end}`))
  let r = build('--src', src, '--out', src, '--check')
  assert.notEqual(r.status, 0)
  assert.match(r.stderr, /differs: README\.md/)
  assert.equal(build('--src', src, '--out', src).status, 0)
  assert.equal(readFileSync(readme, 'utf8'), text)
  const edited = text.replace('## Install', 'Some new prose.\n\n## Install')
  assert.notEqual(edited, text, 'the prose edit must change the README')
  writeFileSync(readme, edited)
  r = build('--src', src, '--out', src, '--check')
  assert.equal(r.status, 0, r.stderr)
})

for (const bad of ['/etc/README.md', '../README.md', 'docs/../../README.md']) {
  test(`README gap list: readme.path ${bad} (absolute or with ..) fails the build`, () => {
    const src = sources()
    const p = join(src, 'hosts/copilot/capability.json')
    const cap = JSON.parse(readFileSync(p, 'utf8'))
    cap.readme.path = bad
    writeFileSync(p, JSON.stringify(cap, null, 2))
    const out = temp()
    const r = build('--src', src, '--out', out)
    assert.notEqual(r.status, 0)
    assert.match(r.stderr, /readme\.path must be a relative path inside the repo/)
    assert.deepEqual(readdirSync(out), [])
  })
}

test('README gap list: a README without the markers fails the build', () => {
  const src = sources()
  const cap = loadCapability(src, 'copilot')
  const readme = join(src, 'README.md')
  writeFileSync(readme, readFileSync(readme, 'utf8').replace(cap.readme.start, ''))
  const r = build('--src', src, '--out', temp())
  assert.notEqual(r.status, 0)
  assert.match(r.stderr, /README\.md/)
})

// ---- leaks ----

test('leak check: the real output has no leak', () => {
  const { files } = generate({ src: ROOT, host: 'copilot' })
  assert.deepEqual(findLeaks(files, loadCapability(ROOT, 'copilot')), [])
})

test('leak check: a Claude-only name planted outside the mapping section fails the build and --check', () => {
  const src = sources()
  const out = temp()
  assert.equal(build('--src', src, '--out', out).status, 0)
  appendFileSync(join(src, 'plugins/jbit/skills/resume/SKILL.md'), '\nAsk with AskUserQuestion, or set CLAUDE_PLUGIN_ROOT.\n')
  for (const r of [build('--src', src, '--out', out), build('--src', src, '--out', out, '--check')]) {
    assert.notEqual(r.status, 0)
    assert.match(r.stderr, /leak: plugins\/jbit-copilot\/skills\/resume\/SKILL\.md:\d+ AskUserQuestion/)
    assert.match(r.stderr, /CLAUDE_PLUGIN_ROOT/)
  }
  // the failed build wrote nothing
  assert.doesNotMatch(readFileSync(join(out, 'plugins/jbit-copilot/skills/resume/SKILL.md'), 'utf8'), /CLAUDE_PLUGIN_ROOT/)
})

test('leak check: the same names inside the mapping section are allowed', () => {
  const cap = loadCapability(ROOT, 'copilot')
  const files = new Map([['plugins/jbit-copilot/skills/x/SKILL.md', `---\nname: x\n---\nok\n\n${cap.mapping.heading}\n\nAskUserQuestion and the Agent tool.\n`]])
  assert.deepEqual(findLeaks(files, cap), [])
  files.set('plugins/jbit-copilot/skills/y/SKILL.md', '---\nname: y\n---\nThe Agent tool.\n')
  assert.deepEqual(findLeaks(files, cap).map(l => l.file), ['plugins/jbit-copilot/skills/y/SKILL.md'])
})

test('--check also leak-scans the files on disk: a hand-planted term outside the mapping section reports leak:', () => {
  const out = temp()
  assert.equal(build('--out', out).status, 0)
  const skill = join(out, 'plugins/jbit-copilot/skills/plan/SKILL.md')
  writeFileSync(skill, readFileSync(skill, 'utf8').replace('\n## On GitHub Copilot CLI\n', '\nAsk with AskUserQuestion.\n\n## On GitHub Copilot CLI\n'))
  const mkt = join(out, '.github/plugin/marketplace.json')
  writeFileSync(mkt, readFileSync(mkt, 'utf8').replace('JBIT for GitHub Copilot CLI', 'JBIT for Claude Code'))
  const r = build('--out', out, '--check')
  assert.notEqual(r.status, 0)
  assert.match(r.stderr, /leak: plugins\/jbit-copilot\/skills\/plan\/SKILL\.md:\d+ AskUserQuestion/)
  assert.match(r.stderr, /leak: \.github\/plugin\/marketplace\.json:\d+ Claude/)
  assert.match(r.stderr, /differs: plugins\/jbit-copilot\/skills\/plan\/SKILL\.md/)
  // a term inside the mapping section on disk is not a leak (only drift)
  assert.equal(build('--out', out).status, 0)
  appendFileSync(skill, 'AskUserQuestion again.\n')
  const r2 = build('--out', out, '--check')
  assert.notEqual(r2.status, 0)
  assert.doesNotMatch(r2.stderr, /leak:/)
})

test('Copilot wording: no compaction promise, lowercase explore agents, security-review marked as listed but unseen', () => {
  const { files } = generate({ src: ROOT, host: 'copilot' })
  const cap = loadCapability(ROOT, 'copilot')
  const autopilot = files.get('plugins/jbit-copilot/skills/autopilot/SKILL.md')
  assert.doesNotMatch(autopilot, /compacts the context/)
  assert.match(autopilot.split(cap.mapping.heading)[0], /doesn't compact the context on Copilot, which manages its own context/)
  assert.ok(cap.gaps.some(g => g.id === 'compaction'))
  const plan = files.get('plugins/jbit-copilot/skills/plan/SKILL.md')
  assert.doesNotMatch(plan, /`Explore`/)
  assert.match(plan, /`explore` agents/)
  const section = plan.split(cap.mapping.heading)[1]
  assert.match(section, /`security-review` is listed in the `task` tool's agent types but wasn't seen called/)
})

// ---- substitutions, rewrites, self-containment ----

test('a substitution that no longer matches its source fails the build', () => {
  const src = sources()
  const p = join(src, 'plugins/jbit/skills/approve/SKILL.md')
  writeFileSync(p, readFileSync(p, 'utf8').replace('The hook ignores a skill Claude invoked', 'The hook ignores a skill you invoked'))
  const r = build('--src', src, '--out', temp())
  assert.notEqual(r.status, 0)
  assert.match(r.stderr, /substitution matches nothing: The hook ignores a skill Claude invoked/)
})

test('a rewrite that no longer matches fails the build', () => {
  const src = sources()
  const p = join(src, 'hosts/core/dispatch.mjs')
  writeFileSync(p, readFileSync(p, 'utf8').replace("'../../plugins/jbit/hooks/register.ts'", "'../../plugins/jbit/hooks/register2.ts'"))
  const r = build('--src', src, '--out', temp())
  assert.notEqual(r.status, 0)
  assert.match(r.stderr, /rewrite/)
})

test('an import that leaves the package fails the build', () => {
  const src = sources()
  appendFileSync(join(src, 'hosts/core/index.mjs'), "\nimport '../../outside.mjs'\n")
  const r = build('--src', src, '--out', temp())
  assert.notEqual(r.status, 0)
  assert.match(r.stderr, /outside the package|not in the package/)
})

test('a hooks.json event the hook does not handle fails the build', () => {
  const src = sources()
  const p = join(src, 'hosts/copilot/capability.json')
  const cap = JSON.parse(readFileSync(p, 'utf8'))
  cap.hooks.events.push('subagentStop')
  writeFileSync(p, JSON.stringify(cap))
  const r = build('--src', src, '--out', temp())
  assert.notEqual(r.status, 0)
  assert.match(r.stderr, /subagentStop/)
})

// ---- the generated hook runs on its own ----

const GIT_ENV = { GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' }
function repo() {
  const dir = temp('jbit-build-repo-')
  const git = (...a) => execFileSync('git', a, { cwd: dir, env: { ...process.env, ...GIT_ENV } })
  git('init', '-q', '-b', 'main')
  mkdirSync(join(dir, 'docs'))
  writeFileSync(join(dir, 'docs/PLAN.md'), '# Plan\n\n## Now\nStage 1 of 2 · Thing\nMode: autopilot\n\n## Stages\n- [ ] 1. Thing — a\n- [ ] 2. Other — b\n')
  git('add', '-A')
  git('commit', '-q', '-m', 'init')
  return dir
}

function runHook(script, cwd, event, payload, env) {
  const baseEnv = { ...process.env }
  delete baseEnv.COPILOT_PROJECT_DIR
  delete baseEnv.CLAUDE_PROJECT_DIR
  const r = spawnSync(process.execPath, [script, event], { cwd, input: JSON.stringify(payload), env: { ...baseEnv, ...env }, encoding: 'utf8', timeout: 30000 })
  assert.equal(r.status, 0, r.stderr)
  return r.stdout.trim() ? JSON.parse(r.stdout) : {}
}

test('the generated hook, copied alone outside the repo, denies `git push` under armed autopilot', () => {
  const out = temp()
  assert.equal(build('--out', out).status, 0)
  const pkg = join(temp('jbit-build-pkg-'), 'jbit')
  cpSync(join(out, 'plugins/jbit-copilot'), pkg, { recursive: true })
  const script = join(pkg, 'scripts/hook.mjs')
  for (const cwd of [pkg, tmpdir(), join(pkg, 'scripts')]) {
    const project = repo()
    const env = { COPILOT_PLUGIN_DATA: temp('jbit-build-data-') }
    const session = 's-' + Math.random().toString(36).slice(2)
    runHook(script, cwd, 'userPromptTransformed', { sessionId: session, cwd: project, prompt: '/jbit:autopilot unattended', transformedPrompt: '/jbit:autopilot unattended' }, env)
    const out2 = runHook(script, cwd, 'preToolUse', { sessionId: session, cwd: project, toolName: 'bash', toolArgs: { command: 'git push origin main' } }, env)
    assert.equal(out2.permissionDecision, 'deny', JSON.stringify(out2))
    assert.match(out2.permissionDecisionReason, /outward/)
    const ls = runHook(script, cwd, 'preToolUse', { sessionId: session, cwd: project, toolName: 'bash', toolArgs: { command: 'ls' } }, env)
    assert.deepEqual(ls, {})
  }
})

test('the repo\'s own generated hook denies `git push` under armed autopilot', () => {
  const script = join(ROOT, 'plugins/jbit-copilot/scripts/hook.mjs')
  const project = repo()
  const env = { COPILOT_PLUGIN_DATA: temp('jbit-build-data-') }
  runHook(script, tmpdir(), 'userPromptTransformed', { sessionId: 'r', cwd: project, prompt: '/jbit:autopilot unattended', transformedPrompt: '/jbit:autopilot unattended' }, env)
  const out = runHook(script, tmpdir(), 'preToolUse', { sessionId: 'r', cwd: project, toolName: 'bash', toolArgs: { command: 'git push origin main' } }, env)
  assert.equal(out.permissionDecision, 'deny', JSON.stringify(out))
})

// ---- codex ----
// The Codex build reads the real adapter (hosts/codex/), plus the Copilot map it reuses, from a temp copy of the sources.

/** A copy of everything the Codex build reads. */
function codexSources() {
  const dir = temp('jbit-build-codex-src-')
  for (const p of ['plugins/jbit/.claude-plugin/plugin.json', 'plugins/jbit/LICENSE', 'plugins/jbit/skills', 'plugins/jbit/hooks', 'hosts/core', 'hosts/codex', 'hosts/copilot/map.mjs', 'README.md']) {
    cpSync(join(ROOT, p), join(dir, p), { recursive: true, filter: s => !s.endsWith('.test.mjs') })
  }
  return dir
}
const codex = (...args) => spawnSync(process.execPath, [BUILD, 'codex', ...args], { encoding: 'utf8', timeout: 60000 })
const PKG = 'plugins/jbit-codex'

test('codex: building twice gives identical bytes, and the second run writes nothing', () => {
  const src = codexSources()
  const out = temp()
  const a = codex('--src', src, '--out', out)
  assert.equal(a.status, 0, a.stderr)
  const first = snapshot(out)
  const b = codex('--src', src, '--out', out)
  assert.equal(b.status, 0, b.stderr)
  assert.match(b.stdout, /wrote 0\b/)
  assert.deepEqual(snapshot(out), first)
  const g1 = generate({ src, host: 'codex' }).files
  const g2 = generate({ src, host: 'codex' }).files
  assert.deepEqual([...g1], [...g2])
  assert.deepEqual([...g1.keys()], [...g1.keys()].sort())
  assert.equal(codex('--src', src, '--out', out, '--check').status, 0)
})

test('codex: .codex-plugin/plugin.json names the plugin jbit at the source version, with LICENSE and GENERATED.json', () => {
  const src = codexSources()
  const { files } = generate({ src, host: 'codex' })
  const srcPlugin = JSON.parse(readFileSync(join(ROOT, 'plugins/jbit/.claude-plugin/plugin.json'), 'utf8'))
  const plugin = JSON.parse(files.get(`${PKG}/.codex-plugin/plugin.json`))
  assert.equal(plugin.name, 'jbit')
  assert.equal(plugin.version, srcPlugin.version)
  assert.equal(plugin.skills, './skills/')
  assert.equal(files.has(`${PKG}/plugin.json`), false)
  assert.ok(files.has(`${PKG}/LICENSE`))
  const manifest = JSON.parse(files.get(`${PKG}/GENERATED.json`))
  assert.equal(manifest.host, 'codex')
  assert.match(manifest.sources['hosts/codex/capability.json'], /^[0-9a-f]{64}$/)
  assert.ok(![...files.keys()].some(k => k.includes('.claude-plugin')), 'the package must not carry a .claude-plugin folder')
})

test('codex: 9 skills with bare names, no Claude-only frontmatter, and one "On Codex CLI" section', () => {
  const src = codexSources()
  const { files, cap } = generate({ src, host: 'codex' })
  const names = readdirSync(join(ROOT, 'plugins/jbit/skills')).sort()
  assert.equal(names.length, 9)
  for (const name of names) {
    const text = files.get(`${PKG}/skills/${name}/SKILL.md`)
    assert.ok(text, name)
    assert.match(text, new RegExp(`^---\\nname: ${name}\\n`))
    const front = text.split('\n---\n')[0].split('\n').slice(1)
    assert.deepEqual(front.map(l => l.split(':')[0]), ['name', 'description'], name)
    const desc = /^description: (.*)$/m.exec(text)[1]
    if (desc.startsWith('"')) assert.equal(typeof JSON.parse(desc), 'string')
    const parts = text.split(`\n${cap.mapping.heading}\n`)
    assert.equal(parts.length, 2, name)
    const section = parts[1]
    assert.match(section, /`\$jbit:<name>`/)
    assert.match(section, /`spawn_agent`/)
    assert.match(section, /`task_name`.*`message`/)
    assert.match(section, /`model`.*only as the plan's Models line sets them/)
    assert.match(section, /Bash → `exec_command`/)
    assert.match(section, /`apply_patch`/)
  }
})

test('codex: approve alone gets agents/openai.yaml with allow_implicit_invocation false, and the gap is listed', () => {
  const src = codexSources()
  const { files, cap } = generate({ src, host: 'codex' })
  const yamls = [...files.keys()].filter(k => k.endsWith('openai.yaml'))
  assert.deepEqual(yamls, [`${PKG}/skills/approve/agents/openai.yaml`])
  assert.match(files.get(yamls[0]), /^policy:\n {2}allow_implicit_invocation: false\n$/)
  assert.doesNotMatch(files.get(`${PKG}/skills/approve/SKILL.md`), /disable-model-invocation/)
  assert.ok(cap.gaps.some(g => g.id === 'approve-implicit' && /visible to the model/.test(g.what)))
})

test('codex: hooks.json runs the hook on the four events, PreToolUse on every tool, with raised context limits', () => {
  const src = codexSources()
  const { files } = generate({ src, host: 'codex' })
  const { hooks, ...rest } = JSON.parse(files.get(`${PKG}/hooks/hooks.json`))
  assert.deepEqual(rest, {})
  assert.deepEqual(Object.keys(hooks).sort(), ['PreToolUse', 'SessionStart', 'Stop', 'UserPromptSubmit'])
  for (const [event, groups] of Object.entries(hooks)) {
    assert.equal(groups.length, 1)
    const [group] = groups
    assert.equal(group.matcher, event === 'PreToolUse' ? '*' : undefined, event)
    assert.equal(group.hooks.length, 1)
    const [h] = group.hooks
    assert.equal(h.type, 'command')
    assert.equal(h.command, `node "\${PLUGIN_ROOT}/scripts/hook.mjs" ${event}`)
    assert.ok(h.timeout > 25, `${event}: timeout ${h.timeout} must outlast the hook's 25 s watchdog`)
    if (event === 'UserPromptSubmit' || event === 'Stop') assert.ok(h.additionalContextLimit >= 16000, event)
    else assert.equal(h.additionalContextLimit, undefined, event)
  }
})

test('codex: .agents/plugins/marketplace.json points at the package under its own name', () => {
  const src = codexSources()
  const { files } = generate({ src, host: 'codex' })
  const mkt = JSON.parse(files.get('.agents/plugins/marketplace.json'))
  assert.equal(mkt.name, 'jbit-local')
  assert.ok(mkt.interface.displayName)
  assert.equal(mkt.plugins.length, 1)
  const [p] = mkt.plugins
  assert.equal(p.name, 'jbit')
  assert.deepEqual(p.source, { source: 'local', path: './plugins/jbit-codex' })
  assert.deepEqual(p.policy, { installation: 'AVAILABLE', authentication: 'ON_INSTALL' })
})

test('codex: scripts are globbed from hosts/core and hosts/codex, with imports repointed inside the package', () => {
  const src = codexSources()
  // a module added to hosts/core later is picked up with no capability change; tests are never shipped
  writeFileSync(join(src, 'hosts/core/extra.mjs'), 'export const x = 1\n')
  writeFileSync(join(src, 'hosts/codex/hook.test.mjs'), 'not shipped\n')
  const { files } = generate({ src, host: 'codex' })
  const scripts = [...files.keys()].filter(k => k.startsWith(`${PKG}/scripts/`)).map(k => k.slice(PKG.length + 9))
  assert.deepEqual(scripts, [
    'copilot/map.mjs', 'core/dispatch.mjs', 'core/engine.mjs', 'core/extra.mjs', 'core/index.mjs', 'core/patch.mjs', 'hook.mjs',
    'hooks/models.ts', 'hooks/project.ts', 'hooks/register.ts', 'hooks/secrets.ts', 'hooks/shell.ts',
    'map.mjs', 'package.json',
  ])
  const hook = files.get(`${PKG}/scripts/hook.mjs`)
  assert.match(hook, /import\('\.\/core\/index\.mjs'\)/)
  assert.match(hook, /from '\.\/map\.mjs'/)
  assert.match(files.get(`${PKG}/scripts/map.mjs`), /from '\.\/copilot\/map\.mjs'/)
  assert.match(files.get(`${PKG}/scripts/copilot/map.mjs`), /from '\.\.\/core\/patch\.mjs'/)
  assert.match(files.get(`${PKG}/scripts/core/dispatch.mjs`), /'\.\.\/hooks\/register\.ts'/)
  for (const [path, text] of files) if (path.includes('/scripts/')) assert.doesNotMatch(text, /['"](\.\.\/)+(plugins|hosts)\//, path)
})

test('codex: a missing hook.mjs fails the build with a clear message and writes nothing', () => {
  const src = codexSources()
  rmSync(join(src, 'hosts/codex/hook.mjs'))
  const out = temp()
  for (const r of [codex('--src', src, '--out', out), codex('--src', src, '--out', out, '--check')]) {
    assert.equal(r.status, 1)
    assert.match(r.stderr, /missing script hosts\/codex\/hook\.mjs/)
  }
  assert.deepEqual(readdirSync(out), [])
})

for (const [what, change] of [
  ['a skill', src => appendFileSync(join(src, 'plugins/jbit/skills/fix/SKILL.md'), '\nOne more line.\n')],
  ['a core module', src => appendFileSync(join(src, 'hosts/core/engine.mjs'), '\n// changed\n')],
  ['the hook', src => appendFileSync(join(src, 'hosts/codex/hook.mjs'), '\n// changed\n')],
  [
    'the capability file',
    src => {
      const p = join(src, 'hosts/codex/capability.json')
      const cap = JSON.parse(readFileSync(p, 'utf8'))
      cap.hooks.additionalContextLimit.Stop = 12000
      writeFileSync(p, JSON.stringify(cap, null, 2))
    },
  ],
]) {
  test(`codex drift: --check fails when ${what} changed, and passes after a rebuild`, () => {
    const src = codexSources()
    const out = temp()
    assert.equal(codex('--src', src, '--out', out).status, 0)
    assert.equal(codex('--src', src, '--out', out, '--check').status, 0)
    change(src)
    const r = codex('--src', src, '--out', out, '--check')
    assert.equal(r.status, 1)
    assert.match(r.stderr, /drift: plugins\/jbit-codex/)
    assert.equal(codex('--src', src, '--out', out).status, 0)
    const again = codex('--src', src, '--out', out, '--check')
    assert.equal(again.status, 0, again.stderr)
  })
}

test('codex drift: a stray file in the package or a hand-edited marketplace fails --check', () => {
  const src = codexSources()
  const out = temp()
  assert.equal(codex('--src', src, '--out', out).status, 0)
  writeFileSync(join(out, PKG, 'skills/stray.md'), 'x')
  let r = codex('--src', src, '--out', out, '--check')
  assert.equal(r.status, 1)
  assert.match(r.stderr, /extra: plugins\/jbit-codex\/skills\/stray\.md/)
  assert.equal(codex('--src', src, '--out', out).status, 0)
  const mkt = join(out, '.agents/plugins/marketplace.json')
  writeFileSync(mkt, readFileSync(mkt, 'utf8').replace('jbit-local', 'other'))
  r = codex('--src', src, '--out', out, '--check')
  assert.equal(r.status, 1)
  assert.match(r.stderr, /differs: \.agents\/plugins\/marketplace\.json/)
})

test('codex leak check: the output has none, and a Claude-only name planted outside the mapping section fails', () => {
  const src = codexSources()
  const { files, cap } = generate({ src, host: 'codex' })
  assert.deepEqual(findLeaks(files, cap), [])
  const out = temp()
  assert.equal(codex('--src', src, '--out', out).status, 0)
  appendFileSync(join(src, 'plugins/jbit/skills/resume/SKILL.md'), '\nAsk with AskUserQuestion, or run /security-review.\n')
  for (const r of [codex('--src', src, '--out', out), codex('--src', src, '--out', out, '--check')]) {
    assert.equal(r.status, 1)
    assert.match(r.stderr, /leak: plugins\/jbit-codex\/skills\/resume\/SKILL\.md:\d+ AskUserQuestion/)
    assert.match(r.stderr, /security-review/)
  }
  // on disk too: a term planted in the generated yaml is caught by --check
  const src2 = codexSources()
  const out2 = temp()
  assert.equal(codex('--src', src2, '--out', out2).status, 0)
  appendFileSync(join(out2, PKG, 'skills/approve/agents/openai.yaml'), '# disable-model-invocation\n')
  const r = codex('--src', src2, '--out', out2, '--check')
  assert.equal(r.status, 1)
  assert.match(r.stderr, /leak: plugins\/jbit-codex\/skills\/approve\/agents\/openai\.yaml:\d+ disable-model-invocation/)
})

test('codex gaps: the capability lists the gaps the stage-7 README must carry', () => {
  const cap = loadCapability(ROOT, 'codex')
  const ids = cap.gaps.map(g => g.id)
  assert.equal(ids[0], 'hook-trust', 'hook trust comes first')
  for (const id of ['hook-trust', 'role-agents', 'dollar-invocation', 'approve-implicit', 'hook-timeout-unproven', 'stall-detection', 'lean-agent-count', 'background-agents', 'compaction']) {
    assert.ok(ids.includes(id), `missing gap ${id}`)
  }
  assert.equal(new Set(ids).size, ids.length)
  for (const g of cap.gaps) assert.ok(g.what && g.why, g.id)
  assert.match(gapBlock(cap), /^- \*\*Hooks need trusting after every install and update\.\*\*/)
})

test('codex: the committed package is current (once the adapter has landed)', t => {
  if (!readdirSync(join(HOSTS, 'codex')).includes('hook.mjs')) {
    t.skip('hosts/codex/hook.mjs is not in this tree yet')
    return
  }
  const r = codex('--check')
  assert.equal(r.status, 0, r.stdout + r.stderr)
})
