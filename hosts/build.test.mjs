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
import { findLeaks, generate, loadCapability } from './build.mjs'

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
  for (const p of ['plugins/jbit/.claude-plugin/plugin.json', 'plugins/jbit/LICENSE', 'plugins/jbit/skills', 'plugins/jbit/hooks', 'hosts/copilot', 'hosts/core']) {
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
