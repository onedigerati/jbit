// Tests for the Codex CLI command hook: tool mapping, the $CODEX_HOME guard, and the hook run as Codex runs it (a
// subprocess fed the stage-5 spike's stdin shapes) against temp git repos with a docs/PLAN.md fixture.
// Run: node --test 'hosts/**/*.test.mjs'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawn, spawnSync, execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, mkdirSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parsePatch } from '../core/patch.mjs'
import { mapTool, writesCodexHome } from './map.mjs'

const HOOK = join(dirname(fileURLToPath(import.meta.url)), 'hook.mjs')
const temps = []
process.on('exit', () => temps.forEach(d => rmSync(d, { recursive: true, force: true })))
const temp = (tag = 'jbit-codex-') => {
  const d = realpathSync(mkdtempSync(join(tmpdir(), tag)))
  temps.push(d)
  return d
}

const GIT_ENV = { GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' }
const git = (dir, ...args) => execFileSync('git', args, { cwd: dir, env: { ...process.env, ...GIT_ENV }, encoding: 'utf8' })

function planWith(mode, { risk, checks = [], tick1 = true } = {}) {
  return [
    '# Plan',
    '',
    '## Now',
    'Stage 2 of 3 · Share mode',
    ...(risk ? [`Risk: ${risk}`] : []),
    ...(mode ? [mode] : []),
    ...(checks.length ? ['Checks:', ...checks.map(c => `- [ ] ${c}`)] : []),
    '',
    '## Stages',
    `- [${tick1 ? 'x' : ' '}] 1. Foundation — engine`,
    '- [ ] 2. Share mode — viewer controls',
    '- [ ] 3. Polish — copy and layout',
    '',
  ].join('\n')
}

function repo(plan, files = {}) {
  const dir = temp()
  git(dir, 'init', '-q', '-b', 'main')
  if (plan !== undefined) files = { 'docs/PLAN.md': plan, ...files }
  files = { 'README.md': 'hi\n', ...files }
  for (const [p, text] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, p)), { recursive: true })
    writeFileSync(join(dir, p), text)
  }
  git(dir, 'add', '-A')
  git(dir, 'commit', '-q', '-m', 'init')
  return dir
}

const CODEX_HOME = temp('jbit-codex-home-')

let calls = 0
/** Runs the hook as Codex does: `node hook.mjs <Event>`, the event JSON on stdin, cwd the project. Never exit 1. */
function hook(event, payload = {}, { project, session, env = {}, raw } = {}) {
  const data = env.PLUGIN_DATA ?? (project ? join(project, '.git', 'jbit-data') : temp('jbit-data-'))
  const input =
    raw ??
    JSON.stringify({
      session_id: session ?? '01a1fae4-d9a6-7061-9a87-ec4553a263e2',
      transcript_path: null,
      ...(project ? { cwd: project } : {}),
      hook_event_name: event,
      model: 'gpt-6-luna',
      permission_mode: 'bypassPermissions',
      ...payload,
    })
  const baseEnv = { ...process.env }
  for (const k of ['PLUGIN_DATA', 'CLAUDE_PLUGIN_DATA', 'COPILOT_PLUGIN_DATA', 'CLAUDE_PROJECT_DIR', 'COPILOT_PROJECT_DIR']) delete baseEnv[k]
  const r = spawnSync(process.execPath, [HOOK, event], {
    input,
    cwd: project ?? dirname(HOOK),
    env: { ...baseEnv, CODEX_HOME, PLUGIN_DATA: data, ...env },
    encoding: 'utf8',
    timeout: 30000,
  })
  assert.equal(r.status, 0, `hook exited ${r.status}: ${r.stderr}`)
  assert.ok(!/\n\s+at .+:\d+:\d+/.test(r.stdout), `stack on stdout: ${r.stdout}`)
  const out = r.stdout.trim()
  return { out: out ? JSON.parse(out) : {}, stdout: r.stdout, stderr: r.stderr }
}

const pre = (tool_name, tool_input, opts) => hook('PreToolUse', { turn_id: 't', tool_name, tool_input, tool_use_id: `call_${++calls}` }, opts).out
const denied = out => out?.hookSpecificOutput?.hookEventName === 'PreToolUse' && out.hookSpecificOutput.permissionDecision === 'deny'
const why = out => out.hookSpecificOutput.permissionDecisionReason
const prompt = (text, opts) => hook('UserPromptSubmit', { turn_id: 't', prompt: text }, opts).out
const stop = (opts, active = false) => hook('Stop', { turn_id: 't', stop_hook_active: active, last_assistant_message: 'done' }, opts).out
const patch = files => `*** Begin Patch\n${files}\n*** End Patch\n`

function heldRepo() {
  const project = repo(planWith('Mode: autopilot', { risk: 'auth' }))
  const session = `held-${++calls}`
  prompt('/jbit:autopilot attended', { project, session })
  return { project, session }
}

// ---- parsing and mapping ----

test('the hoisted patch grammar reads the Codex spike patch', () => {
  const r = parsePatch('*** Begin Patch\n*** Update File: a.txt\n@@\n+gamma\n*** End Patch')
  assert.equal(r.ok, true)
  assert.deepEqual(r.files.map(f => [f.op, f.path]), [['update', 'a.txt']])
})

test('mapTool maps Codex apply_patch, Bash and spawn_agent to the Claude calls the core judges', () => {
  const root = temp()
  const o = { codexHome: CODEX_HOME }
  assert.deepEqual(mapTool('Bash', { command: 'git status' }, root, o), { kind: 'calls', calls: [{ tool: 'Bash', command: 'git status' }] })
  const p = mapTool('apply_patch', { command: patch('*** Add File: n.txt\n+x\n*** Update File: o.txt\n*** Move to: p.txt\n@@\n-a\n+b\n*** Delete File: d.txt') }, root, o)
  assert.deepEqual(
    p.calls.map(c => [c.tool, c.file_path]),
    [
      ['Write', join(root, 'n.txt')],
      ['Edit', join(root, 'o.txt')],
      ['Write', join(root, 'p.txt')],
      ['Edit', join(root, 'd.txt')],
    ],
  )
  const a = mapTool('spawn_agent', { task_name: 'build', message: 'build stage 2', agent_type: 'worker', model: 'gpt-5.6-luna' }, root, o).calls[0]
  assert.equal(a.tool, 'Agent')
  assert.equal(a.prompt, 'build stage 2')
  assert.equal(a.subagent_type, 'worker')
  // keystrokes into a running shell are a command too
  assert.deepEqual(mapTool('write_stdin', { session_id: 1, chars: 'git push\n' }, root, o).calls, [{ tool: 'Bash', command: 'git push\n' }])
  // apply_patch run through the shell is a patch
  const viaShell = mapTool('Bash', { command: `apply_patch <<'EOF'\n${patch('*** Add File: s.txt\n+x')}EOF` }, root, o)
  assert.deepEqual(viaShell.calls.map(c => [c.tool, c.file_path]), [['Write', join(root, 's.txt')]])
})

test('mapTool: a tool_input of the wrong type never means allow', () => {
  const root = temp()
  const o = { codexHome: CODEX_HOME }
  for (const [tool, input] of [
    ['Bash', 'git commit -m x'],
    ['Bash', { command: 42 }],
    ['Bash', { command: ['git', 'status'] }],
    ['Bash', {}],
    ['Bash', null],
    ['apply_patch', patch('*** Add File: a\n+x')],
    ['apply_patch', { command: 7 }],
    ['apply_patch', { patch: patch('*** Add File: a\n+x') }],
    ['apply_patch', { command: 'not a patch' }],
    ['apply_patch', undefined],
    ['spawn_agent', 'go'],
    ['write_stdin', { chars: 3 }],
  ])
    assert.equal(mapTool(tool, input, root, o).kind, 'deny', `${tool} ${JSON.stringify(input)}`)
})

test('mapTool: unknown tools carrying a path or a command are denied, naming the tool', () => {
  const root = temp()
  const o = { codexHome: CODEX_HOME }
  for (const [tool, input] of [
    ['exec_command', { cmd: 'rm -rf src' }],
    ['shell', { command: ['bash', '-lc', 'ls'] }],
    ['mcp__fs__write_file', { path: 'a.ts', content: 'x' }],
    ['some_tool', { target: { cwd: '/x' } }],
    ['some_tool', 'raw text'],
  ]) {
    const r = mapTool(tool, input, root, o)
    assert.equal(r.kind, 'deny', tool)
    assert.ok(r.reason.includes(tool), r.reason)
  }
  assert.equal(mapTool('update_plan', { plan: [{ step: 'x', status: 'pending' }] }, root, o).kind, 'allow')
  assert.equal(mapTool('web_search', { query: 'x' }, root, o).kind, 'allow')
  assert.equal(mapTool('view_image', { path: 'a.png' }, root, o).kind, 'allow')
})

test('writesCodexHome: a write naming $CODEX_HOME or .codex/ is caught, a read is not', () => {
  const home = '/home/u/.codex'
  for (const cmd of [
    'echo x >> ~/.codex/config.toml',
    'printf "[hooks]" > $CODEX_HOME/config.toml',
    'sed -i s/true/false/ ${CODEX_HOME}/hooks.json',
    'rm -rf /home/u/.codex/plugins/cache',
    'cp hooks.json ~/.codex/hooks.json',
    'mv ~/.codex/hooks.json /tmp/x',
    'chmod 000 ~/.codex/plugins/cache/x/jbit/1/scripts/hook.mjs',
    'cat x | tee .codex/hooks.json',
    'cd ~/.codex && echo x > config.toml',
    'rm -rf ~/.codex',
  ])
    assert.equal(writesCodexHome(cmd, home), true, cmd)
  for (const cmd of ['cat ~/.codex/config.toml', 'ls $CODEX_HOME/plugins', 'echo x > notes.txt', 'git status 2>&1', 'cat .codex-plugin/plugin.json > /dev/null', 'grep -r hooks ~/.codex 2>/dev/null'])
    assert.equal(writesCodexHome(cmd, home), false, cmd)
})

// ---- the hook, end to end ----

test('UserPromptSubmit carries the plan as hookSpecificOutput additionalContext', () => {
  const project = repo(planWith(''))
  const out = prompt('what is next?', { project })
  assert.deepEqual(Object.keys(out), ['hookSpecificOutput'])
  assert.equal(out.hookSpecificOutput.hookEventName, 'UserPromptSubmit')
  assert.match(out.hookSpecificOutput.additionalContext, /Current position \(from the plan\):\nStage 2 of 3 · Share mode/)
  // no plan: nothing to add
  assert.deepEqual(prompt('hello', { project: repo(undefined) }), {})
})

test('SessionStart exits 0 and adds nothing (the prompt carries the plan)', () => {
  const project = repo(planWith(''))
  const r = hook('SessionStart', { source: 'startup' }, { project })
  assert.equal(r.stdout, '')
})

test('PreToolUse: a commit with a secret staged is denied, a plain one goes through', () => {
  const project = repo(planWith(''))
  writeFileSync(join(project, 'config.ts'), 'export const key = "AKIAABCDEFGHIJKLMNOP"\n') // jbit:allow-secret (test fixture)
  git(project, 'add', 'config.ts')
  const out = pre('Bash', { command: 'git commit -m "wire config"' }, { project })
  assert.ok(denied(out), JSON.stringify(out))
  assert.match(why(out), /AWS access key/)
  assert.deepEqual(pre('Bash', { command: 'git status' }, { project }), {})
})

test('PreToolUse: a commit closing a stage with an unticked check is denied', () => {
  const plan = planWith('', { tick1: false, checks: ['the engine boots'] }).replace('Stage 2 of 3 · Share mode', 'Stage 1 of 3 · Foundation')
  const project = repo(plan)
  writeFileSync(join(project, 'docs/PLAN.md'), plan.replace('- [ ] 1. Foundation', '- [x] 1. Foundation'))
  git(project, 'add', 'docs/PLAN.md')
  const out = pre('Bash', { command: 'git commit -m "Stage 1: Foundation"' }, { project })
  assert.ok(denied(out), JSON.stringify(out))
  assert.match(why(out), /closes stage 1/)
})

test('PreToolUse: in a held stage, apply_patch (Add, Update, Delete, Move to, .., absolute) and builder agents are denied', () => {
  const { project, session } = heldRepo()
  const o = { project, session }
  for (const [tool, input] of [
    ['apply_patch', { command: patch('*** Add File: src/x.ts\n+x') }],
    ['apply_patch', { command: patch('*** Update File: README.md\n@@\n-hi\n+bye') }],
    ['apply_patch', { command: patch('*** Delete File: README.md') }],
    ['apply_patch', { command: patch('*** Update File: docs/PLAN.md\n*** Move to: src/plan.ts\n@@\n-a\n+b') }],
    ['apply_patch', { command: patch('*** Add File: docs/research/../../src/evil.md\n+x') }],
    ['apply_patch', { command: patch(`*** Add File: ${project}/src/abs.ts\n+x`) }],
    ['spawn_agent', { task_name: 'build', message: 'build stage 2', agent_type: 'worker' }],
  ]) {
    const out = pre(tool, input, o)
    assert.ok(denied(out), `${tool} ${JSON.stringify(input)}: ${JSON.stringify(out)}`)
    assert.match(why(out), /holding/)
  }
  // the plan itself and a research note go through, by any spelling of their path
  assert.deepEqual(pre('apply_patch', { command: patch('*** Update File: docs/PLAN.md\n@@\n-a\n+b') }, o), {})
  assert.deepEqual(pre('apply_patch', { command: patch(`*** Add File: ${project}/docs/research/topic.md\n+x`) }, o), {})
  assert.deepEqual(pre('Bash', { command: 'git status' }, o), {})
})

test('PreToolUse: an unparseable patch and wrong-typed tool_input are denied even with no plan', () => {
  const project = repo(undefined)
  const o = { project }
  assert.ok(denied(pre('apply_patch', { command: 'not a patch' }, o)))
  assert.ok(denied(pre('apply_patch', patch('*** Add File: a\n+x'), o)))
  assert.ok(denied(pre('Bash', 'ls', o)))
  assert.ok(denied(pre('Bash', { command: 1 }, o)))
  assert.ok(denied(pre('Bash', undefined, o)))
  assert.ok(denied(hook('PreToolUse', { tool_input: { command: 'ls' } }, o).out), 'no tool_name')
})

test('PreToolUse: unknown tools carrying a path or command are denied, naming the tool', () => {
  const project = repo(planWith(''))
  const out = pre('mcp__fs__write_file', { path: 'a.ts', content: 'x' }, { project })
  assert.ok(denied(out))
  assert.match(why(out), /mcp__fs__write_file/)
  assert.ok(denied(pre('exec_command', { cmd: 'git commit -m x' }, { project })))
  assert.deepEqual(pre('update_plan', { plan: [] }, { project }), {})
})

test('PreToolUse: writes under $CODEX_HOME are denied through apply_patch and Bash, with or without a plan', () => {
  for (const project of [repo(planWith('')), repo(undefined)]) {
    const o = { project }
    for (const [tool, input] of [
      ['apply_patch', { command: patch(`*** Add File: ${CODEX_HOME}/hooks.json\n+{}`) }],
      ['apply_patch', { command: patch(`*** Update File: ${CODEX_HOME}/config.toml\n@@\n-a\n+b`) }],
      ['apply_patch', { command: patch('*** Delete File: .codex/hooks.json') }],
      ['apply_patch', { command: patch(`*** Update File: notes.md\n*** Move to: ${CODEX_HOME}/plugins/cache/x.mjs\n@@\n-a\n+b`) }],
      ['Bash', { command: `echo '[features]' >> ${CODEX_HOME}/config.toml` }],
      ['Bash', { command: 'sed -i s/x/y/ "$CODEX_HOME/hooks.json"' }],
      ['Bash', { command: 'rm -rf ~/.codex/plugins/cache' }],
    ]) {
      const out = pre(tool, input, o)
      assert.ok(denied(out), `${tool} ${JSON.stringify(input)}: ${JSON.stringify(out)}`)
      assert.match(why(out), /CODEX_HOME|\.codex/)
    }
    assert.deepEqual(pre('Bash', { command: `cat ${CODEX_HOME}/config.toml` }, o), {})
  }
})

test('PreToolUse: under autopilot, the shell fallback writing the plan and committing on one line is denied', () => {
  const project = repo(planWith('Mode: autopilot'))
  const o = { project, session: 'shell-plan' }
  prompt('/jbit:autopilot unattended', o)
  const out = pre('Bash', { command: "printf '\\n' >> docs/PLAN.md && git commit -am 'Stage 2: Share mode'" }, o)
  assert.ok(denied(out), JSON.stringify(out))
  assert.match(why(out), /names the plan file `docs\/PLAN.md`/)
})

test('PreToolUse: an outward command under autopilot is denied', () => {
  const project = repo(planWith('Mode: autopilot'))
  const session = 'outward'
  prompt('/jbit:autopilot unattended', { project, session })
  const out = pre('Bash', { command: 'git push origin main' }, { project, session })
  assert.ok(denied(out), JSON.stringify(out))
  assert.match(why(out), /outward/)
})

test('no project dir: guarded tools are denied, and prompts and stops add nothing', () => {
  for (const cwd of [undefined, '/no/such/dir', 'relative/dir']) {
    const extra = cwd === undefined ? {} : { cwd }
    for (const [tool, input] of [
      ['Bash', { command: 'ls' }],
      ['apply_patch', { command: patch('*** Add File: a\n+x') }],
    ]) {
      const out = hook('PreToolUse', { tool_name: tool, tool_input: input, ...extra }).out
      assert.ok(denied(out), `${cwd} ${tool}`)
      assert.match(why(out), /project/)
    }
    assert.deepEqual(hook('UserPromptSubmit', { prompt: 'hi', ...extra }).out, {})
    assert.deepEqual(hook('Stop', { stop_hook_active: false, ...extra }).out, {})
  }
})

test('no PLUGIN_DATA: guarded tools are denied', () => {
  const project = repo(planWith(''))
  const out = pre('Bash', { command: 'ls' }, { project, env: { PLUGIN_DATA: '' } })
  assert.ok(denied(out), JSON.stringify(out))
})

test('a crash fails closed for PreToolUse, stays silent elsewhere, and never exits 1', () => {
  const project = repo(planWith(''))
  const notADir = join(temp(), 'file')
  writeFileSync(notADir, 'x')
  const env = { PLUGIN_DATA: notADir }
  const out = pre('Bash', { command: 'ls' }, { project, env })
  assert.ok(denied(out), JSON.stringify(out))
  assert.match(why(out), /JBIT/)
  assert.deepEqual(prompt('hi', { project, env }), {})
  assert.deepEqual(stop({ project, env }), {})
  for (const raw of ['{not json', '', '[]', 'null', '"str"']) {
    assert.ok(denied(hook('PreToolUse', {}, { project, raw }).out), JSON.stringify(raw))
    assert.deepEqual(hook('UserPromptSubmit', {}, { project, raw }).out, {})
    assert.deepEqual(hook('Stop', {}, { project, raw }).out, {})
  }
})

test('the watchdog denies a PreToolUse that hangs, with exit 0', async () => {
  const child = spawn(process.execPath, [HOOK, 'PreToolUse'], { env: { ...process.env, JBIT_HOOK_WATCHDOG_MS: '300' }, stdio: ['pipe', 'pipe', 'pipe'] })
  let stdout = ''
  child.stdout.on('data', d => (stdout += d))
  // stdin is never closed: the hook waits on it until the watchdog fires
  const code = await new Promise(done => child.on('exit', done))
  assert.equal(code, 0)
  assert.ok(denied(JSON.parse(stdout)), stdout)
})

test('Stop blocks under armed autopilot with a reason that carries the plan, and not otherwise', () => {
  const project = repo(planWith('Mode: autopilot'))
  assert.deepEqual(stop({ project, session: 'unarmed' }), {})
  prompt('/jbit:autopilot unattended', { project, session: 'armed' })
  const out = stop({ project, session: 'armed' })
  assert.deepEqual(Object.keys(out).sort(), ['decision', 'reason'])
  assert.equal(out.decision, 'block')
  assert.match(out.reason, /carry on/)
  // UserPromptSubmit doesn't run on a continuation, so the reason carries ## Now itself
  assert.match(out.reason, /Current position \(from the plan\):\nStage 2 of 3 · Share mode/)
  // all stages done: nothing left
  const done = repo(planWith('Mode: autopilot').replace(/- \[ \]/g, '- [x]'))
  prompt('/jbit:autopilot unattended', { project: done, session: 'd' })
  assert.deepEqual(stop({ project: done, session: 'd' }), {})
})

test('Stop blocks at most 8 times per prompt, and a new prompt resets the count', () => {
  const project = repo(planWith('Mode: autopilot'))
  const o = { project, session: 'cap' }
  prompt('/jbit:autopilot unattended', o)
  for (let i = 0; i < 8; i++) assert.equal(stop(o, i > 0).decision, 'block', `block ${i + 1}`)
  assert.deepEqual(stop(o, true), {})
  assert.deepEqual(stop(o, true), {})
  prompt('keep going', o)
  assert.equal(stop(o).decision, 'block')
})

test('on a Node without TypeScript stripping, the deny names the Node it needs', () => {
  const project = repo(planWith(''))
  const r = spawnSync(process.execPath, ['--no-experimental-strip-types', HOOK, 'PreToolUse'], {
    input: JSON.stringify({ session_id: 's', cwd: project, tool_name: 'Bash', tool_input: { command: 'ls' } }),
    env: { ...process.env, CODEX_HOME, PLUGIN_DATA: temp('jbit-data-') },
    encoding: 'utf8',
  })
  assert.equal(r.status, 0)
  const out = JSON.parse(r.stdout)
  assert.ok(denied(out))
  assert.match(why(out), /Node 22\.18\+/)
  assert.doesNotMatch(why(out), /Copilot/)
})
