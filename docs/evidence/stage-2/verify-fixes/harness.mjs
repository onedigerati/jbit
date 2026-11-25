// Pipes events through the packaged hook (plugins/jbit-antigravity/scripts/hook.mjs) under a fake HOME.
import { spawnSync, execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, realpathSync, rmSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { tmpdir } from 'node:os'
const REPO = '<repo>'
const HOOK = join(REPO, 'plugins/jbit-antigravity/scripts/hook.mjs')
const { planOn2 } = await import(join(REPO, 'hosts/parity/scenarios.mjs'))
const SCR = realpathSync(mkdtempSync(join(tmpdir(), 'vf-')))
const HOME = join(SCR, 'home'); mkdirSync(HOME)
const PLUGIN_ROOT = join(HOME, '.gemini/config/plugins/jbit'); mkdirSync(PLUGIN_ROOT, { recursive: true })
const scrub = s => s.split(SCR).join('$T')
const GE = { GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' }
let k = 0
function repo(plan) {
  const d = join(SCR, `ws${++k}`); mkdirSync(join(d, 'docs'), { recursive: true }); mkdirSync(join(d, 'src'))
  writeFileSync(join(d, 'docs/PLAN.md'), plan); writeFileSync(join(d, 'src/a.ts'), 'a\n')
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: d }); execFileSync('git', ['add', '-A'], { cwd: d })
  execFileSync('git', ['commit', '-q', '-m', 'init'], { cwd: d, env: { ...process.env, ...GE } })
  return d
}
function hook(event, payload, project, session) {
  const input = JSON.stringify({ conversationId: session, cwd: project, workspacePaths: [project], hookEventName: event, modelName: 'gemini-3.8-flash-low', ...payload })
  const env = { ...process.env, HOME, PLUGIN_ROOT, PLUGIN_DATA: join(HOME, '.gemini/antigravity-cli/plugin_data/jbit') }
  for (const x of ['CLAUDE_PLUGIN_DATA', 'CLAUDE_PROJECT_DIR']) delete env[x]
  const r = spawnSync(process.execPath, [HOOK, event], { input, cwd: dirname(HOOK), env, encoding: 'utf8' })
  return { status: r.status, out: r.stdout.trim(), err: r.stderr.trim() }
}
let fails = 0
function show(label, event, payload, project, session, expect) {
  const r = hook(event, payload, project, session)
  const ok = expect ? expect(r.out) : true
  if (!ok) fails++
  console.log(`## ${ok ? 'PASS' : 'FAIL'} ${label}\n$ echo '${scrub(JSON.stringify(payload))}' | node plugins/jbit-antigravity/scripts/hook.mjs ${event}   # conversationId=${session}\n${scrub(r.out)}${r.err ? '\nstderr: ' + scrub(r.err) : ''}\n`)
  return r
}
const isDeny = re => o => { const j = JSON.parse(o); return j.decision === 'deny' && (!re || re.test(j.reason)) }
const isAllow = o => JSON.parse(o).decision === 'allow'
const pre = (name, args) => ({ toolCall: { name, args, id: 'call_' + (++k) }, lastUserInput: '' })
const prompt = text => ({ invocationNum: 0, initialNumSteps: 1, lastUserInput: text })
function transcript(sub, parent) {
  const dir = join(HOME, '.gemini/antigravity-cli/brain', sub, '.system_generated/logs'); mkdirSync(dir, { recursive: true })
  const first = { source: 'SYSTEM', type: 'SYSTEM_MESSAGE', content: `The following is a <SYSTEM_MESSAGE> not actually sent by the user. | <SYSTEM_MESSAGE> | [Message] timestamp=2026-11-25T15:34:01Z sender=${parent} | do the task` }
  writeFileSync(join(dir, 'transcript.jsonl'), JSON.stringify(first) + '\n')
}
export { HOME, SCR, repo, hook, show, isDeny, isAllow, pre, prompt, transcript, planOn2 }
export const done = () => { console.log(`fails: ${fails}`); rmSync(SCR, { recursive: true, force: true }); process.exitCode = fails ? 1 : 0 }
