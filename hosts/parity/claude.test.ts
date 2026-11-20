// The shared parity scenarios against the Claude hook. `hooks/` and `types/` here are byte copies of
// plugins/jbit/hooks/ and plugins/jbit/types/, made by run-claude.mjs before each run (the test kit loads only files
// under the folder it tests), so this is the plugin's own register.ts on a mocked engine, as plugins/jbit/tests drives it.
import type { On } from 'claude-code'
import { expect, mock, test, type Engine } from 'claude-code/testing'
import { ROOT, memoryRepo, runScenario } from './runner.mjs'
import { SCENARIOS } from './scenarios.mjs'

type Step = { kind: string; text?: string; fromUser?: boolean; tool?: string; input?: Record<string, string> }

/** A Claude session over the scenario's fixture: an adapter session for runner.mjs. */
function claudeSession($: Engine, on: On, scenario: { fixture: { committed: Record<string, string>; staged?: Record<string, string | null> } }) {
  const repo = memoryRepo(scenario.fixture)
  const clock = mock.clock(on)
  mock.store(on)
  // the hook asks for project files by repo path, which the test kit resolves against its own folder, and for the
  // session's files under ROOT: either way a path names the project file it ends with
  const dirs = (p: string) => p.split('/').slice(0, -1).map((_, i, a) => a.slice(0, i + 1).join('/'))
  const ends = (path: string, p: string) => path === p || path.endsWith(`/${p}`)
  const file = (path: string): string | undefined => Object.entries(repo.worktree).find(([p]) => ends(path, p))?.[1] as string | undefined
  const isDir = (path: string) => path === ROOT || Object.keys(repo.worktree).some(p => dirs(p).some(d => ends(path, d)))
  const carryOn: string[] = []
  let context: string[] = []
  let turn = 0

  on('session.cwd', () => ({ value: ROOT }))
  on('agent.list', () => ({ value: [] as never }))
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200_000, percent: 20 }, rateLimits: [] } }))
  on('session.compact', () => ({ messages: [{ role: 'user' as const, text: 'summary', toolUses: [] }] }))
  on('fs.exists', (_, e) => ({ value: file(e.path) !== undefined || isDir(e.path) }))
  on('fs.stat', (_, e) => {
    const realPath = e.resolve ? e.path : undefined
    if (isDir(e.path)) return { value: { kind: 'dir' as const, size: 4096, mtimeMs: 0, isLink: false, ...(realPath ? { realPath } : {}) } }
    const text = file(e.path)
    if (text === undefined) throw new Error(`ENOENT: no such file or directory, stat '${e.path}'`)
    return { value: { kind: 'file' as const, size: new TextEncoder().encode(text).length, mtimeMs: 0, isLink: false, ...(realPath ? { realPath } : {}) } }
  })
  on('fs.read', (_, e) => {
    const text = file(e.path)
    if (text === undefined) throw new Error(`ENOENT: no such file or directory, open '${e.path}'`)
    return { value: text }
  })
  on('process.run', (_, e) => {
    const r = e.argv[0] === 'git' ? repo.git(e.argv.slice(1)) : { code: 127, stdout: '', stderr: 'not found' }
    return { value: { exitCode: r.code, stdout: r.stdout, stderr: r.stderr, isStdoutTruncated: false, isStderrTruncated: false } }
  })
  on('prompt.submit', (_, e) => {
    context.push(...(e.context ?? []))
    if (e.text.startsWith('jbit autopilot:')) carryOn.push(e.text)
    return { text: e.text }
  })
  on('prompt.compose', () => ({ sections: [{ id: 'intro', text: 'You are Claude Code.', scope: 'shared' as const }] }))
  on('ui.notify', () => ({ value: { isSent: true, channel: 'terminal_bell' } as never }))
  on('ui.toast', () => ({ value: undefined }))
  on('ui.status', () => ({ value: undefined }))
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('turn.complete', (_, e) => ({ text: e.answer }))
  on('tool.call', () => ({ result: { text: 'ok' } }))

  const abs = (path: string) => `${ROOT}/${path}`
  const toolCall = (step: Step) => {
    const i = step.input ?? {}
    switch (step.tool) {
      case 'Bash':
        return { tool: 'Bash', command: i.command }
      case 'Edit':
        return { tool: 'Edit', file_path: abs(i.path), old_string: i.old, new_string: i.new }
      case 'Write':
        return { tool: 'Write', file_path: abs(i.path), content: i.content }
      case 'Agent':
        return { tool: 'Agent', description: i.description, prompt: i.prompt }
      case 'Skill':
        return { tool: 'Skill', skill: i.skill, args: i.args }
      default:
        throw new Error(`no Claude tool for ${step.tool}`)
    }
  }
  const input = { model: 'claude-opus-5-5', promptModel: 'claude-opus-5-5', surfaces: [], tools: [], outputStyle: null, traits: [] }

  return {
    async step(step: Step) {
      if (step.kind === 'prompt') {
        context = []
        await $.prompt.submit({ text: step.text!, origin: step.fromUser ? { kind: 'composer' } : { kind: 'plugin', name: 'other' } } as never)
        const { sections } = await $.prompt.compose(input as never)
        const plan = sections.find(s => s.id === 'jbit:plan')?.text ?? ''
        return { kind: 'context', text: [plan, ...context].join('\n') }
      }
      if (step.kind === 'tool') {
        const r = await $.tool.call(toolCall(step) as never)
        return r.deny ? { kind: 'deny', reason: r.deny } : { kind: 'allow' }
      }
      if (step.kind === 'stop') {
        const before = carryOn.length
        turn += 1
        await $.turn.complete({ turnId: `t${turn}`, answer: 'done', durationMs: 1, isAborted: false, reason: 'answer' })
        await clock.advance(2000)
        const sent = carryOn.slice(before)
        return sent.length ? { kind: 'block', reason: sent.join('\n') } : { kind: 'allow' }
      }
      throw new Error(`unknown step ${step.kind}`)
    },
  }
}

for (const scenario of SCENARIOS) {
  test(`parity · claude · ${scenario.name}`, async ($, on) => {
    const result = await runScenario({ name: 'claude', open: async () => claudeSession($, on, scenario) }, scenario)
    expect(result.problems).toEqual([])
  })
}

test('parity · the fixture diff is a -U0 diff git would print', () => {
  const repo = memoryRepo({ committed: { 'a.md': 'one\ntwo\nthree\n' }, staged: { 'a.md': 'one\n2\nthree\nfour\n', 'b.ts': 'x\n' } })
  expect(repo.git(['diff', '--cached', '-U0']).stdout).toBe(
    [
      'diff --git a/a.md b/a.md', '--- a/a.md', '+++ b/a.md', '@@ -2 +2 @@', '-two', '+2', '@@ -3,0 +4 @@', '+four',
      'diff --git a/b.ts b/b.ts', 'new file mode 100644', '--- /dev/null', '+++ b/b.ts', '@@ -0,0 +1 @@', '+x',
    ].join('\n'),
  )
})
