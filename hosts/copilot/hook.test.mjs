// Tests for the Copilot command hook: patch parsing, tool mapping, and the hook run as Copilot runs it (a subprocess fed
// the stage-1 event shapes on stdin) against temp git repos with a docs/PLAN.md fixture. Run: node --test hosts/
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync, execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, mkdirSync, symlinkSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parsePatch } from '../core/patch.mjs'
import { mapTool, resolveInProject } from './map.mjs'

const HOOK = join(dirname(fileURLToPath(import.meta.url)), 'hook.mjs')
const temps = []
process.on('exit', () => temps.forEach(d => rmSync(d, { recursive: true, force: true })))
const temp = (tag = 'jbit-copilot-') => {
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

/** A temp git repo with the plan committed (when given) and its files. */
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

let sessions = 0
/** Runs the hook as Copilot does: the event name as argv[2], the event JSON on stdin, from the plugin folder. */
function hook(event, payload, { project, session, env = {}, raw, nodeArgs = [] } = {}) {
  const data = env.COPILOT_PLUGIN_DATA ?? (project ? join(project, '.git', 'jbit-data') : temp('jbit-data-'))
  const input = raw ?? JSON.stringify({ sessionId: session ?? 'sess-default', timestamp: Date.now(), ...(project ? { cwd: project } : {}), ...payload })
  const baseEnv = { ...process.env }
  delete baseEnv.COPILOT_PROJECT_DIR
  delete baseEnv.CLAUDE_PROJECT_DIR
  const r = spawnSync(process.execPath, [...nodeArgs, HOOK, event], {
    input,
    cwd: dirname(HOOK),
    env: { ...baseEnv, COPILOT_PLUGIN_DATA: data, ...env },
    encoding: 'utf8',
    timeout: 30000,
  })
  assert.equal(r.status, 0, `hook exited ${r.status}: ${r.stderr}`)
  assert.ok(!/\n\s+at .+:\d+:\d+/.test(r.stdout), `stack on stdout: ${r.stdout}`)
  const out = r.stdout.trim()
  return { out: out ? JSON.parse(out) : {}, stdout: r.stdout, stderr: r.stderr }
}

const pre = (toolName, toolArgs, opts) => hook('preToolUse', { toolCallId: `call_${++sessions}`, toolName, toolArgs }, opts).out
const denied = out => out.permissionDecision === 'deny'
const prompt = (text, opts, transformed = `<current_datetime>now</current_datetime>\n${text}`) =>
  hook('userPromptTransformed', { prompt: text, transformedPrompt: transformed }, opts).out

/** A repo whose stage 2 is risky, held under attended autopilot in its own session. */
function heldRepo(files = {}) {
  const project = repo(planWith('Mode: autopilot', { risk: 'auth' }), files)
  const session = `held-${++sessions}`
  prompt('/jbit:autopilot attended', { project, session })
  return { project, session }
}

// ---- apply_patch parsing ----

test('parsePatch reads Add, Update, Delete and Move to', () => {
  const r = parsePatch(
    [
      '*** Begin Patch',
      '*** Add File: a/new.txt',
      '+x',
      '*** Update File: old.txt',
      '*** Move to: moved/old.txt',
      '@@',
      '-hello',
      '+bye',
      '*** Delete File: gone.txt',
      '*** Update File: b.txt',
      '@@ ctx',
      ' keep',
      '-a',
      '+b',
      '*** End of File',
      '*** End Patch',
      '',
    ].join('\n'),
  )
  assert.equal(r.ok, true)
  assert.deepEqual(
    r.files.map(f => [f.op, f.path, f.moveTo]),
    [
      ['add', 'a/new.txt', undefined],
      ['update', 'old.txt', 'moved/old.txt'],
      ['delete', 'gone.txt', undefined],
      ['update', 'b.txt', undefined],
    ],
  )
  assert.equal(r.files[0].content, 'x\n')
})

test('parsePatch reads the captured spike patch', () => {
  const r = parsePatch('*** Begin Patch\n*** Update File: existing.txt\n@@\n-hello\n+bye\n*** End Patch\n')
  assert.equal(r.ok, true)
  assert.deepEqual(r.files.map(f => [f.op, f.path]), [['update', 'existing.txt']])
})

test('parsePatch refuses what it cannot read', () => {
  for (const bad of [
    '',
    'hello',
    '*** Add File: x.txt\n+x\n*** End Patch\n', // no Begin
    '*** Begin Patch\n*** End Patch\n', // no files
    '*** Begin Patch\n*** Add File: \n+x\n*** End Patch\n', // empty path
    '*** Begin Patch\n*** Rename File: a\n*** End Patch\n', // unknown directive
    '*** Begin Patch\n*** Move to: b.txt\n*** End Patch\n', // move with no file
    '*** Begin Patch\n*** Delete File: a.txt\n*** Move to: b.txt\n*** End Patch\n', // move after delete
    '*** Begin Patch\n*** Add File: a.txt\n+x\n', // no End
    '*** Begin Patch\n*** Add File: a.txt\n+x\n*** End Patch\n*** Add File: b.txt\n', // content after End
    '*** Begin Patch\n*** Add File: a.txt\n+x\n*** End Patch\n*** Begin Patch\n*** Add File: b.txt\n+y\n*** End Patch\n',
    '*** Begin Patch\n*** Add File: a\0b.txt\n+x\n*** End Patch\n', // NUL in a path
  ]) {
    assert.equal(parsePatch(bad).ok, false, JSON.stringify(bad))
  }
  for (const notString of [undefined, null, 1, {}, ['*** Begin Patch']]) assert.equal(parsePatch(notString).ok, false)
})

test('parsePatch tolerates CRLF and surrounding blank lines', () => {
  const r = parsePatch('\n*** Begin Patch\r\n*** Add File: a.txt\r\n+x\r\n*** End Patch\r\n\n')
  assert.equal(r.ok, true)
  assert.deepEqual(r.files.map(f => f.path), ['a.txt'])
})

// ---- path resolution ----

test('paths resolve against the project, normalising .., absolute paths and symlinks', () => {
  const root = temp()
  mkdirSync(join(root, 'docs/research'), { recursive: true })
  mkdirSync(join(root, 'src'), { recursive: true })
  symlinkSync(join(root, 'src'), join(root, 'docs/research/link'))
  writeFileSync(join(root, 'src/a.ts'), 'x')
  symlinkSync(join(root, 'src/a.ts'), join(root, 'docs/research/note.md'))
  assert.equal(resolveInProject('docs/research/../../src/x.ts', root), join(root, 'src/x.ts'))
  assert.equal(resolveInProject('../outside.txt', root), join(dirname(root), 'outside.txt'))
  assert.equal(resolveInProject('/etc/hosts', root), realpathSync('/etc/hosts'))
  assert.equal(resolveInProject(`${root}/./src//a.ts`, root), join(root, 'src/a.ts'))
  assert.equal(resolveInProject('docs/research/link/new.md', root), join(root, 'src/new.md'))
  assert.equal(resolveInProject('docs/research/note.md', root), join(root, 'src/a.ts'))
  assert.equal(resolveInProject('docs/research/new/deeper/x.md', root), join(root, 'docs/research/new/deeper/x.md'))
})

// ---- tool mapping ----

test('mapTool maps Copilot tools to the Claude tool calls the core judges', () => {
  const root = temp()
  assert.deepEqual(mapTool('bash', { command: 'git status', description: 'x' }, root), { kind: 'calls', calls: [{ tool: 'Bash', command: 'git status' }] })
  assert.deepEqual(mapTool('edit', { path: 'a.ts', old_str: 'a', new_str: 'b' }, root).calls, [{ tool: 'Edit', file_path: join(root, 'a.ts'), old_string: 'a', new_string: 'b' }])
  assert.deepEqual(mapTool('create', { path: 'b.ts', file_text: 'x' }, root).calls, [{ tool: 'Write', file_path: join(root, 'b.ts'), content: 'x' }])
  const task = mapTool('task', { description: 'd', prompt: 'p', agent_type: 'jbit:builder', name: 'n', mode: 'background', model: 'gpt-5' }, root).calls[0]
  assert.equal(task.tool, 'Agent')
  assert.equal(task.subagent_type, 'jbit:builder')
  assert.equal(task.prompt, 'p')
  assert.equal(task.model, 'gpt-5')
  assert.equal(task.run_in_background, true)
  assert.deepEqual(mapTool('skill', { skill: 'jbit:autopilot' }, root).calls, [{ tool: 'Skill', skill: 'jbit:autopilot' }])
  const patch = mapTool('apply_patch', '*** Begin Patch\n*** Add File: n.txt\n+x\n*** Update File: o.txt\n*** Move to: p.txt\n@@\n-a\n+b\n*** Delete File: d.txt\n*** End Patch\n', root)
  assert.deepEqual(
    patch.calls.map(c => [c.tool, c.file_path]),
    [
      ['Write', join(root, 'n.txt')],
      ['Edit', join(root, 'o.txt')],
      ['Write', join(root, 'p.txt')],
      ['Edit', join(root, 'd.txt')],
    ],
  )
  for (const t of ['view', 'glob', 'grep', 'read_agent']) assert.equal(mapTool(t, { path: '/etc/passwd', pattern: 'x' }, root).kind, 'allow', t)
})

test('mapTool: a toolArgs of the wrong type never means allow', () => {
  const root = temp()
  for (const [tool, args] of [
    ['bash', 'git commit -m x'],
    ['bash', { command: 42 }],
    ['bash', {}],
    ['bash', null],
    ['apply_patch', { patch: '*** Begin Patch\n*** Add File: a\n+x\n*** End Patch\n' }],
    ['apply_patch', '*** nonsense'],
    ['edit', '{"path":"a.ts"}'],
    ['edit', { file: 'a.ts' }],
    ['edit', { path: ['a.ts'] }],
    ['create', { path: '' }],
    ['create', null],
    ['task', 'do it'],
    ['skill', ['autopilot']],
  ])
    assert.equal(mapTool(tool, args, root).kind, 'deny', `${tool} ${JSON.stringify(args)}`)
})

test('mapTool: unknown tools carrying a path or a command are denied, naming the tool', () => {
  const root = temp()
  for (const [tool, args] of [
    ['powershell', { command: 'Remove-Item x' }],
    ['github-mcp-server-create_or_update_file', { owner: 'o', repo: 'r', path: 'a.ts', content: 'x' }],
    ['some_tool', { filePath: 'a.ts' }],
    ['some_tool', { target: { cwd: '/x' } }],
    ['some_tool', 'raw string args'],
  ]) {
    const r = mapTool(tool, args, root)
    assert.equal(r.kind, 'deny', tool)
    assert.match(r.reason, new RegExp(tool.replace(/[-]/g, '\\-')))
  }
  assert.equal(mapTool('report_intent', { intent: 'Exploring' }, root).kind, 'allow')
  assert.equal(mapTool('web_fetch', { url: 'https://example.com' }, root).kind, 'allow')
})

// ---- the hook, end to end ----

test('preToolUse: a commit with a secret staged is denied', () => {
  const project = repo(planWith(''))
  writeFileSync(join(project, 'config.ts'), 'export const key = "AKIAABCDEFGHIJKLMNOP"\n') // jbit:allow-secret (test fixture)
  git(project, 'add', 'config.ts')
  const out = pre('bash', { command: 'git commit -m "wire config"' }, { project })
  assert.ok(denied(out), JSON.stringify(out))
  assert.match(out.permissionDecisionReason, /AWS access key/)
  assert.ok(!denied(pre('bash', { command: 'git status' }, { project })))
})

test('preToolUse: a commit closing a stage with an unticked check is denied', () => {
  const plan = planWith('', { tick1: false, checks: ['the engine boots'] }).replace('Stage 2 of 3 · Share mode', 'Stage 1 of 3 · Foundation')
  const project = repo(plan)
  writeFileSync(join(project, 'docs/PLAN.md'), plan.replace('- [ ] 1. Foundation', '- [x] 1. Foundation'))
  git(project, 'add', 'docs/PLAN.md')
  const out = pre('bash', { command: 'git commit -m "Stage 1: Foundation"' }, { project })
  assert.ok(denied(out), JSON.stringify(out))
  assert.match(out.permissionDecisionReason, /closes stage 1/)
  assert.match(out.permissionDecisionReason, /the engine boots/)
})

test('preToolUse: in a held stage, writes and builder agents are denied through every Copilot tool', () => {
  const { project, session } = heldRepo()
  const o = { project, session }
  const patch = files => `*** Begin Patch\n${files}\n*** End Patch\n`
  for (const [tool, args] of [
    ['apply_patch', patch('*** Add File: src/x.ts\n+x')],
    ['apply_patch', patch('*** Update File: README.md\n@@\n-hi\n+bye')],
    ['apply_patch', patch('*** Delete File: README.md')],
    ['apply_patch', patch('*** Update File: docs/PLAN.md\n*** Move to: src/plan.ts\n@@\n-a\n+b')],
    ['apply_patch', patch('*** Add File: docs/research/../../src/evil.md\n+x')],
    ['edit', { path: 'README.md', old_str: 'hi', new_str: 'bye' }],
    ['create', { path: 'src/new.ts', file_text: 'x' }],
    ['task', { description: 'build', prompt: 'build stage 2', agent_type: 'jbit:builder', mode: 'background' }],
  ]) {
    const out = pre(tool, args, o)
    assert.ok(denied(out), `${tool} ${JSON.stringify(args)}: ${JSON.stringify(out)}`)
    assert.match(out.permissionDecisionReason, /holding/)
  }
  // the plan itself and a research note go through, by any spelling of their path
  assert.ok(!denied(pre('apply_patch', patch('*** Update File: docs/PLAN.md\n@@\n-a\n+b'), o)))
  assert.ok(!denied(pre('apply_patch', patch(`*** Add File: ${project}/docs/research/topic.md\n+x`), o)))
  assert.ok(!denied(pre('apply_patch', patch('*** Add File: src/../docs/research/topic.md\n+x'), o)))
  assert.ok(!denied(pre('edit', { path: 'docs/PLAN.md', old_str: 'a', new_str: 'b' }, o)))
  // a symlinked note that lands outside docs/research is no note
  mkdirSync(join(project, 'src'), { recursive: true })
  writeFileSync(join(project, 'src/a.ts'), 'x')
  mkdirSync(join(project, 'docs/research'), { recursive: true })
  symlinkSync(join(project, 'src/a.ts'), join(project, 'docs/research/sneaky.md'))
  assert.ok(denied(pre('apply_patch', patch('*** Update File: docs/research/sneaky.md\n@@\n-x\n+y'), o)))
  // reading stays open
  assert.ok(!denied(pre('view', { path: 'README.md' }, o)))
})

test('preToolUse: outside a held stage the same calls go through', () => {
  const project = repo(planWith(''))
  const o = { project }
  assert.ok(!denied(pre('apply_patch', '*** Begin Patch\n*** Add File: src/x.ts\n+x\n*** End Patch\n', o)))
  assert.ok(!denied(pre('edit', { path: 'README.md', old_str: 'hi', new_str: 'bye' }, o)))
  assert.ok(!denied(pre('create', { path: 'src/new.ts', file_text: 'x' }, o)))
  assert.ok(!denied(pre('task', { description: 'd', prompt: 'p', agent_type: 'general-purpose' }, o)))
  assert.ok(!denied(pre('skill', { skill: 'jbit:plan' }, o)))
})

test('preToolUse: an unparseable patch and wrong-typed args are denied even with no plan', () => {
  const project = repo(undefined)
  const o = { project }
  assert.ok(denied(pre('apply_patch', 'not a patch', o)))
  assert.ok(denied(pre('apply_patch', { input: '*** Begin Patch\n*** Add File: a\n+x\n*** End Patch\n' }, o)))
  assert.ok(denied(pre('bash', 'ls', o)))
  assert.ok(denied(pre('edit', { file_path: 'a.ts' }, o)))
})

test('preToolUse: unknown tools carrying a path or command are denied, naming the tool', () => {
  const project = repo(planWith(''))
  const out = pre('github-mcp-server-push_files', { owner: 'o', repo: 'r', files: [{ path: 'a', content: 'b' }] }, { project })
  assert.ok(denied(out))
  assert.match(out.permissionDecisionReason, /github-mcp-server-push_files/)
  assert.ok(denied(pre('powershell', { command: 'git commit -m x' }, { project })))
  assert.ok(!denied(pre('report_intent', { intent: 'x' }, { project })))
})

test('preToolUse: an outward command under autopilot is denied', () => {
  const project = repo(planWith('Mode: autopilot'))
  const session = 'outward'
  prompt('/jbit:autopilot unattended', { project, session })
  const out = pre('bash', { command: 'git push origin main' }, { project, session })
  assert.ok(denied(out), JSON.stringify(out))
  assert.match(out.permissionDecisionReason, /outward/)
})

test('no project dir: guarded tools are denied and prompts get no context', () => {
  const env = { COPILOT_PLUGIN_DATA: temp('jbit-data-') }
  for (const [tool, args] of [
    ['bash', { command: 'ls' }],
    ['apply_patch', '*** Begin Patch\n*** Add File: a\n+x\n*** End Patch\n'],
    ['edit', { path: 'a', old_str: 'a', new_str: 'b' }],
    ['create', { path: 'a', file_text: '' }],
    ['task', { prompt: 'p', agent_type: 'x' }],
  ]) {
    const out = pre(tool, args, { env })
    assert.ok(denied(out), tool)
    assert.match(out.permissionDecisionReason, /project/)
  }
  assert.ok(!denied(pre('view', { path: 'a' }, { env })))
  assert.deepEqual(prompt('hello', { env }), {})
  assert.deepEqual(hook('agentStop', { transcriptPath: '/x', stopReason: 'end_turn' }, { env }).out, {})
})

test('COPILOT_PROJECT_DIR stands in when stdin has no cwd', () => {
  const project = repo(planWith(''))
  writeFileSync(join(project, 'k.ts'), 'AKIAABCDEFGHIJKLMNOP\n') // jbit:allow-secret (test fixture)
  git(project, 'add', 'k.ts')
  const out = hook('preToolUse', { toolCallId: 'c', toolName: 'bash', toolArgs: { command: 'git commit -m x' } }, { env: { COPILOT_PROJECT_DIR: project } }).out
  assert.ok(denied(out), JSON.stringify(out))
})

test('a crash in the core fails closed for preToolUse and stays silent elsewhere', () => {
  const project = repo(planWith(''))
  const notADir = join(temp(), 'file')
  writeFileSync(notADir, 'x')
  const env = { COPILOT_PLUGIN_DATA: notADir }
  const r = hook('preToolUse', { toolCallId: 'c', toolName: 'bash', toolArgs: { command: 'ls' } }, { project, env })
  assert.ok(denied(r.out), r.stdout)
  assert.match(r.out.permissionDecisionReason, /JBIT/)
  assert.deepEqual(prompt('hi', { project, env }), {})
  assert.deepEqual(hook('agentStop', { stopReason: 'end_turn' }, { project, env }).out, {})
  // stdin that isn't JSON
  const bad = hook('preToolUse', {}, { project, raw: '{not json' })
  assert.ok(denied(bad.out))
  assert.deepEqual(hook('userPromptTransformed', {}, { project, raw: '{not json' }).out, {})
})

test('userPromptTransformed appends the plan to transformedPrompt, never replacing it', () => {
  const project = repo(planWith(''))
  const transformed = '<current_datetime>2026-11-20</current_datetime>\n<system-reminder>x</system-reminder>\nhello'
  const out = prompt('hello', { project }, transformed)
  assert.ok(out.modifiedTransformedPrompt.startsWith(`${transformed}\n\n`), out.modifiedTransformedPrompt)
  assert.match(out.modifiedTransformedPrompt.slice(transformed.length), /Share mode/)
  // no plan: nothing to add
  assert.deepEqual(prompt('hello', { project: repo(undefined) }), {})
})

test('sessionStart gives the plan as additionalContext', () => {
  const project = repo(planWith(''))
  const out = hook('sessionStart', { source: 'new', initialPrompt: 'hi' }, { project }).out
  assert.match(out.additionalContext, /Share mode/)
})

test('agentStop blocks while autopilot is armed with stages left, and not otherwise', () => {
  const project = repo(planWith('Mode: autopilot'))
  const stop = session => hook('agentStop', { transcriptPath: '/x', stopReason: 'end_turn', stop_hook_active: false }, { project, session }).out
  // a Mode line this session didn't arm never drives it
  assert.deepEqual(stop('unarmed'), {})
  const armed = prompt('/jbit:autopilot unattended', { project, session: 'armed' }).modifiedTransformedPrompt
  // the armed entry carries the plan's section, so it isn't added twice
  assert.equal(armed.split('Current position (from the plan)').length, 2, armed)
  const out = stop('armed')
  assert.equal(out.decision, 'block', JSON.stringify(out))
  assert.match(out.reason, /carry on/)
  assert.match(out.reason, /Share mode/)
  // the continuation prompt is the plugin's, not the user's: it sets no level
  const next = prompt(out.reason, { project, session: 'armed' })
  assert.ok(next.modifiedTransformedPrompt)
  assert.equal(stop('armed').decision, 'block')
  // all stages done: nothing left to carry on with
  const done = repo(planWith('Mode: autopilot').replace(/- \[ \]/g, '- [x]'))
  prompt('/jbit:autopilot unattended', { project: done, session: 'd' })
  assert.notEqual(hook('agentStop', { stopReason: 'end_turn' }, { project: done, session: 'd' }).out.decision, 'block')
})

// ---- review round 1: regressions ----

const post = (toolName, toolArgs, opts) => {
  const toolCallId = `call_${++sessions}`
  const first = hook('preToolUse', { toolCallId, toolName, toolArgs }, opts).out
  const after = denied(first) ? {} : hook('postToolUse', { toolCallId, toolName, toolArgs, toolResult: { resultType: 'success', textResultForLlm: '' } }, opts).out
  return { pre: first, context: after.additionalContext ?? '' }
}
const count = (text, phrase) => text.split(phrase).length - 1

test('S1: git output past the buffer limit fails the commit check closed', () => {
  const project = repo(planWith(''))
  writeFileSync(join(project, 'config.ts'), 'export const key = "AKIAABCDEFGHIJKLMNOP"\n') // jbit:allow-secret (test fixture)
  writeFileSync(join(project, 'filler.txt'), 'x'.repeat(64).concat('\n').repeat(400))
  git(project, 'add', '-A')
  const out = pre('bash', { command: 'git commit -m "wire config"' }, { project, env: { JBIT_HOOK_MAX_OUTPUT: '4096' } })
  assert.ok(denied(out), JSON.stringify(out))
  assert.match(out.permissionDecisionReason, /JBIT/)
})

test('S2: a lone carriage return or an indented directive makes a patch unparseable', () => {
  for (const bad of [
    '*** Begin Patch\n*** Add File: a.txt\r*** Add File: b.txt\n+x\n*** End Patch\n',
    '*** Begin Patch\n*** Update File: a.txt\n@@\n *** Add File: src/evil.ts\n+x\n*** End Patch\n',
    '*** Begin Patch\n*** Update File: a.txt\n\t*** Delete File: b.txt\n*** End Patch\n',
    ' *** Begin Patch\n*** Add File: a.txt\n+x\n*** End Patch\n',
  ])
    assert.equal(parsePatch(bad).ok, false, JSON.stringify(bad))
  const project = repo(planWith(''))
  assert.ok(denied(pre('apply_patch', '*** Begin Patch\n*** Update File: README.md\n@@\n *** Add File: src/evil.ts\n-hi\n+bye\n*** End Patch\n', { project })))
})

test('C1: the model starting jbit:autopilot after the user asked arms autopilot', () => {
  const project = repo(planWith('Mode: autopilot'))
  const o = { project, session: 'c1' }
  prompt('looks good, put it on autopilot', o)
  assert.ok(!denied(pre('skill', { skill: 'jbit:autopilot' }, o)))
  const out = hook('agentStop', { stopReason: 'end_turn' }, o).out
  assert.equal(out.decision, 'block', JSON.stringify(out))
})

test('C1: a skill call with no user prompt before it does not arm', () => {
  const project = repo(planWith('Mode: autopilot'))
  const o = { project, session: 'c1d' }
  hook('agentStop', { stopReason: 'end_turn' }, o)
  assert.ok(!denied(pre('skill', { skill: 'jbit:autopilot' }, o)))
  assert.deepEqual(hook('agentStop', { stopReason: 'end_turn' }, o).out, {})
})

test('C2: a run that pauses tells the user at the next prompt', () => {
  const plan = planWith('Mode: autopilot')
  const project = repo(plan)
  const o = { project, session: 'c2' }
  prompt('/jbit:autopilot', o)
  assert.equal(hook('agentStop', { stopReason: 'end_turn' }, o).out.decision, 'block')
  writeFileSync(join(project, 'docs/PLAN.md'), plan.replace('Mode: autopilot', 'Mode: paused — waiting on the API keys'))
  assert.deepEqual(hook('agentStop', { stopReason: 'end_turn' }, o).out, {})
  const next = prompt('what now?', o).modifiedTransformedPrompt
  assert.match(next, /Autopilot paused: waiting on the API keys/)
})

test('C3: a prompt composes before it submits, as Claude Code does', async () => {
  const { call, dispatch } = await import('../core/dispatch.mjs')
  const order = []
  const handlers = [
    { event: 'prompt.submit', fn: (_$, e, next) => (order.push('submit'), next(e)) },
    { event: 'prompt.compose', fn: (_$, e, next) => (order.push('compose'), next(e)) },
  ]
  await dispatch(handlers, { $: {}, out: { notices: [], toasts: [], prompts: [], timers: [] }, host: { get: async () => undefined, set: async () => {} } }, { kind: 'prompt', text: 'hi' })
  assert.deepEqual(order, ['compose', 'submit'])
  assert.equal(typeof call, 'function')
})

test('C4: on a Node without TypeScript stripping, the deny says what Node it needs', () => {
  const project = repo(planWith(''))
  const nodeArgs = ['--no-experimental-strip-types']
  const r = hook('preToolUse', { toolCallId: 'c', toolName: 'bash', toolArgs: { command: 'ls' } }, { project, nodeArgs }).out
  assert.ok(denied(r))
  assert.match(r.permissionDecisionReason, /Node 22\.18\+/)
  const p = hook('userPromptTransformed', { prompt: 'hi', transformedPrompt: 'hi' }, { project, nodeArgs }).out
  assert.match(p.modifiedTransformedPrompt, /^hi\n\n.*Node 22\.18\+/s)
})

test('C5: the held notice is said once per stage, not at every turn end', () => {
  const { project, session } = heldRepo()
  const o = { project, session }
  hook('agentStop', { stopReason: 'end_turn' }, o)
  hook('agentStop', { stopReason: 'end_turn' }, o)
  const next = prompt('status?', o).modifiedTransformedPrompt
  assert.equal(count(next, 'is holding before'), 1, next)
  hook('agentStop', { stopReason: 'end_turn' }, o)
  assert.equal(count(prompt('again?', o).modifiedTransformedPrompt, 'is holding before'), 0)
})

test('C5/C6: the unheld notice is said once, even across a multi-file patch and later calls', () => {
  const project = repo(planWith('Mode: autopilot', { risk: 'auth' }))
  const o = { project, session: 'c6' }
  prompt('/jbit:autopilot unattended', o)
  const first = post('apply_patch', '*** Begin Patch\n*** Add File: src/a.ts\n+x\n*** Add File: src/b.ts\n+y\n*** End Patch\n', o)
  assert.ok(!denied(first.pre))
  assert.equal(count(first.context, 'without a hold'), 1, first.context)
  const second = post('create', { path: 'src/c.ts', file_text: 'z' }, o)
  assert.equal(count(second.context, 'without a hold'), 0, second.context)
})

test('C7: removed keys drop their versions, and stale post: keys are pruned', async () => {
  const { createEngine } = await import('../core/engine.mjs')
  const { readFileSync } = await import('node:fs')
  const data = temp('jbit-data-')
  const eng = await createEngine({ projectDir: temp(), dataDir: data, sessionId: 's' })
  await eng.host.set('x', 1)
  await eng.host.set('x', undefined)
  const file = () => JSON.parse(readFileSync(join(data, 'sessions', 's.json'), 'utf8'))
  assert.equal(file().versions['host:x'], undefined)
  for (let i = 0; i < 230; i++) await eng.host.set(`post:${i}`, ['c'])
  await eng.host.prune('post:', 200)
  const keys = Object.keys(file().values).filter(k => k.startsWith('host:post:'))
  assert.equal(keys.length, 200)
  assert.ok(keys.includes('host:post:229') && !keys.includes('host:post:0'))
  assert.equal(Object.keys(file().versions).filter(k => k.startsWith('host:post:')).length, 200)
})

test('C8: Windows backslash and drive-letter paths are denied with a reason', () => {
  const root = temp()
  for (const [tool, args] of [
    ['edit', { path: 'C:\\repo\\a.ts', old_str: 'a', new_str: 'b' }],
    ['create', { path: 'src\\a.ts', file_text: '' }],
    ['create', { path: 'c:/repo/a.ts', file_text: '' }],
    ['apply_patch', '*** Begin Patch\n*** Add File: docs\\research\\..\\..\\src\\x.ts\n+x\n*** End Patch\n'],
    ['apply_patch', '*** Begin Patch\n*** Update File: a.ts\n*** Move to: D:\\x.ts\n@@\n-a\n+b\n*** End Patch\n'],
  ]) {
    const r = mapTool(tool, args, root)
    assert.equal(r.kind, 'deny', `${tool} ${JSON.stringify(args)}`)
    assert.match(r.reason, /Windows/)
  }
})
