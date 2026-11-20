// Runs the shared parity scenarios against the Copilot command hook (hosts/copilot/hook.mjs), each step a subprocess
// fed the Copilot event shapes the stage-1 spike captured. Run: node --test 'hosts/**/*.test.mjs'
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

const HOOK = join(dirname(fileURLToPath(import.meta.url)), '..', 'copilot', 'hook.mjs')

/** The Copilot tool call a host-neutral tool step stands for: edits go through apply_patch, the path Copilot's models use. */
function copilotTool(tool, input) {
  switch (tool) {
    case 'Bash':
      return ['bash', { command: input.command, description: 'run' }]
    case 'Edit':
      return ['apply_patch', `*** Begin Patch\n*** Update File: ${input.path}\n@@\n-${input.old}\n+${input.new}\n*** End Patch\n`]
    case 'Write':
      return ['apply_patch', `*** Begin Patch\n*** Add File: ${input.path}\n${String(input.content ?? '').split('\n').map(l => `+${l}`).join('\n')}\n*** End Patch\n`]
    case 'Agent':
      return ['task', { description: input.description, prompt: input.prompt, ...(input.subagent_type ? { agent_type: input.subagent_type } : {}), mode: 'sync' }]
    case 'Skill':
      return ['skill', { skill: input.skill }]
  }
  throw new Error(`no Copilot tool for ${tool}`)
}

const adapter = {
  name: 'copilot',
  async open(scenario) {
    const repo = makeRepo(scenario.fixture)
    const project = realpathSync(repo.dir)
    const data = mkdtempSync(join(tmpdir(), 'jbit-parity-data-'))
    const sessionId = `parity-${Math.random().toString(36).slice(2)}`
    let calls = 0
    // the last block's reason: Copilot sends it back as the next prompt, which is how a continuation reaches the hook
    let lastBlock
    const run = (event, payload) => {
      const r = spawnSync(process.execPath, [HOOK, event], {
        input: JSON.stringify({ sessionId, timestamp: Date.now(), cwd: project, ...payload }),
        cwd: dirname(HOOK),
        env: { ...process.env, COPILOT_PLUGIN_DATA: data, COPILOT_PROJECT_DIR: '' },
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
          // a plugin's prompt reaches Copilot only as a stop-block continuation, whose text is the block's reason
          const text = step.fromUser ? step.text : (lastBlock ?? step.text)
          const transformed = `<current_datetime>2026-11-20T12:00:00Z</current_datetime>\n\n${text}`
          const out = run('userPromptTransformed', { prompt: text, transformedPrompt: transformed })
          if (!out.modifiedTransformedPrompt) return { kind: 'allow' }
          assert.ok(out.modifiedTransformedPrompt.startsWith(transformed), 'the hook replaced the prompt instead of appending')
          return { kind: 'context', text: out.modifiedTransformedPrompt.slice(transformed.length).replace(/^\n\n/, '') }
        }
        if (step.kind === 'tool') {
          const [toolName, toolArgs] = copilotTool(step.tool, step.input)
          const toolCallId = `call_${++calls}`
          const out = run('preToolUse', { toolCallId, toolName, toolArgs })
          if (out.permissionDecision === 'deny') return { kind: 'deny', reason: out.permissionDecisionReason }
          // an allowed call's added context arrives after it runs
          const post = run('postToolUse', { toolCallId, toolName, toolArgs, toolResult: { resultType: 'success', textResultForLlm: '' } })
          return post.additionalContext ? { kind: 'context', text: post.additionalContext } : { kind: 'allow' }
        }
        if (step.kind === 'stop') {
          const out = run('agentStop', { transcriptPath: join(data, 'transcript.jsonl'), stopReason: 'end_turn', stop_hook_active: false })
          if (out.decision === 'block') {
            lastBlock = out.reason
            return { kind: 'block', reason: out.reason }
          }
          return { kind: 'allow' }
        }
        throw new Error(`unknown step ${step.kind}`)
      },
      async close() {
        repo.remove()
        rmSync(data, { recursive: true, force: true })
      },
    }
  },
}

for (const scenario of SCENARIOS)
  test(`copilot parity: ${scenario.name}`, async () => {
    const result = await runScenario(adapter, scenario)
    assert.ok(result.ok, result.problems.join('\n'))
  })
