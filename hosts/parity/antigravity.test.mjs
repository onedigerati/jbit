// Runs the shared parity scenarios against the Antigravity CLI (`agy`) command hook (hosts/antigravity/hook.mjs), each
// step a subprocess fed the agy event shapes the stage-1 spike captured (hosts/antigravity/fixtures/).
// Run: node --test 'hosts/**/*.test.mjs'
//
// agy has no prompt-submit event: a prompt's text arrives as `lastUserInput` on PreInvocation, and the first model call
// of a prompt has `invocationNum` 0. So a scenario's prompt step is a PreInvocation with invocationNum 0 and that text,
// and every later event of the same prompt carries the same `lastUserInput`.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { makeRepo } from './fixture.mjs'
import { runScenario } from './runner.mjs'
import { SCENARIOS } from './scenarios.mjs'

const HOOK = join(dirname(fileURLToPath(import.meta.url)), '..', 'antigravity', 'hook.mjs')

/** The agy tool call a host-neutral tool step stands for, with the argument names the spike's fixtures pin. */
function agyTool(tool, input, project) {
  const abs = p => join(project, p)
  switch (tool) {
    case 'Bash':
      return { name: 'run_command', args: { CommandLine: input.command, WaitMsBeforeAsync: 5000, toolSummary: 'run' } }
    case 'Edit':
      return { name: 'edit_file', args: { Path: abs(input.path), Target: input.old, Replacement: input.new } }
    case 'Write':
      return { name: 'write_file', args: { Path: abs(input.path), Content: input.content ?? '' } }
    case 'Agent':
      return { name: 'invoke_subagent', args: { Prompt: input.prompt, Role: input.description, TypeName: input.subagent_type ?? 'self' } }
  }
  throw new Error(`no Antigravity tool for ${tool}`)
}

/** Why a scenario can't be played on agy, or undefined when every step maps. */
function unmappable(scenario) {
  for (const step of scenario.steps) {
    if (step.kind === 'prompt' && !step.fromUser) return 'agy has no event for a plugin-sent prompt (a Stop "continue" carries on without a new prompt)'
    if (step.kind === 'tool' && !['Bash', 'Edit', 'Write', 'Agent'].includes(step.tool)) return `agy has no ${step.tool} tool the hook sees`
  }
  return undefined
}

const adapter = {
  name: 'antigravity',
  async open(scenario) {
    const repo = makeRepo(scenario.fixture)
    const project = realpathSync(repo.dir)
    const data = mkdtempSync(join(tmpdir(), 'jbit-parity-data-'))
    const home = mkdtempSync(join(tmpdir(), 'jbit-parity-agy-home-'))
    const conversationId = `parity-${Math.random().toString(36).slice(2)}`
    const base = {
      artifactDirectoryPath: join(home, '.gemini', 'antigravity-cli', 'brain', conversationId),
      conversationId,
      cwd: project,
      modelName: 'gemini-3.8-flash-low',
      transcriptPath: join(home, '.gemini', 'antigravity-cli', 'brain', conversationId, '.system_generated', 'logs', 'transcript_full.jsonl'),
      workspacePaths: [project],
    }
    let lastUserInput = ''
    let invocationNum = 0
    let stepIdx = 0
    let calls = 0
    let executionNum = 0
    const run = (hookEventName, payload) => {
      const r = spawnSync(process.execPath, [HOOK, hookEventName], {
        input: JSON.stringify({ ...base, hookEventName, lastUserInput, ...payload }),
        cwd: project,
        env: { ...process.env, PLUGIN_DATA: data, HOME: home },
        encoding: 'utf8',
        timeout: 30000,
      })
      if (r.status !== 0) throw new Error(`hook exited ${r.status}: ${r.stderr}`)
      const out = r.stdout.trim()
      return out ? JSON.parse(out) : {}
    }
    return {
      async step(step) {
        if (step.kind === 'prompt') {
          lastUserInput = step.text
          invocationNum = 0
          executionNum = 0
          const out = run('PreInvocation', { initialNumSteps: stepIdx + 1, invocationNum: invocationNum++ })
          const texts = (out.injectSteps ?? []).map(s => s?.systemMessage?.systemMessage).filter(t => typeof t === 'string' && t)
          return texts.length ? { kind: 'context', text: texts.join('\n') } : { kind: 'allow' }
        }
        if (step.kind === 'tool') {
          const out = run('PreToolUse', { stepIdx: ++stepIdx, toolCall: { ...agyTool(step.tool, step.input, project), id: `call_${++calls}` } })
          if (out.decision === 'deny') return { kind: 'deny', reason: out.reason }
          assert.deepEqual(out, { decision: 'allow' }, 'an allowed PreToolUse prints an explicit allow')
          return { kind: 'allow' }
        }
        if (step.kind === 'stop') {
          const out = run('Stop', { continuationActive: false, error: '', executionNum, fullyIdle: true, terminationReason: 'NO_TOOL_CALL' })
          if (out.decision === 'continue') {
            executionNum++
            return { kind: 'block', reason: out.reason }
          }
          return { kind: 'allow' }
        }
        throw new Error(`unknown step ${step.kind}`)
      },
      async close() {
        repo.remove()
        rmSync(data, { recursive: true, force: true })
        rmSync(home, { recursive: true, force: true })
      },
    }
  },
}

for (const scenario of SCENARIOS) {
  const why = unmappable(scenario)
  test(`antigravity parity: ${scenario.name}`, why ? { skip: why } : {}, async () => {
    const r = await runScenario(adapter, scenario)
    assert.ok(r.ok, `${r.name}:\n  ${r.problems.join('\n  ')}`)
  })
}
