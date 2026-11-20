// Runs the shared parity scenarios against the Codex CLI command hook (hosts/codex/hook.mjs), each step a subprocess
// fed the Codex stdin shapes the stage-5 spike captured. Run: node --test 'hosts/**/*.test.mjs'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { makeRepo } from './fixture.mjs'
import { runScenarios } from './runner.mjs'
import { SCENARIOS } from './scenarios.mjs'

const HOOK = join(dirname(fileURLToPath(import.meta.url)), '..', 'codex', 'hook.mjs')

/** The Codex tool call a host-neutral tool step stands for: edits go through apply_patch, as Codex's models write. */
function codexTool(tool, input) {
  switch (tool) {
    case 'Bash':
      return ['Bash', { command: input.command }]
    case 'Edit':
      return ['apply_patch', { command: `*** Begin Patch\n*** Update File: ${input.path}\n@@\n-${input.old}\n+${input.new}\n*** End Patch\n` }]
    case 'Write':
      return ['apply_patch', { command: `*** Begin Patch\n*** Add File: ${input.path}\n${String(input.content ?? '').split('\n').map(l => `+${l}`).join('\n')}\n*** End Patch\n` }]
    case 'Agent':
      return ['spawn_agent', { task_name: input.description, message: input.prompt, ...(input.subagent_type ? { agent_type: input.subagent_type } : {}) }]
  }
  throw new Error(`no Codex tool for ${tool}`)
}

const adapter = {
  name: 'codex',
  async open(scenario) {
    const repo = makeRepo(scenario.fixture)
    const project = realpathSync(repo.dir)
    const data = mkdtempSync(join(tmpdir(), 'jbit-parity-data-'))
    const home = mkdtempSync(join(tmpdir(), 'jbit-parity-codex-home-'))
    const session_id = `parity-${Math.random().toString(36).slice(2)}`
    let calls = 0
    let stopActive = false
    const run = (event, payload) => {
      const r = spawnSync(process.execPath, [HOOK, event], {
        input: JSON.stringify({ session_id, transcript_path: null, cwd: project, hook_event_name: event, model: 'gpt-6-luna', permission_mode: 'bypassPermissions', ...payload }),
        cwd: project,
        env: { ...process.env, PLUGIN_DATA: data, CODEX_HOME: home },
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
          // Codex fires UserPromptSubmit for the user's prompts only: a Stop block continues the turn without one
          if (!step.fromUser) throw new Error('Codex has no event for a plugin-sent prompt')
          stopActive = false
          const out = run('UserPromptSubmit', { turn_id: 't', prompt: step.text })
          const text = out.hookSpecificOutput?.additionalContext
          return text ? { kind: 'context', text } : { kind: 'allow' }
        }
        if (step.kind === 'tool') {
          const [tool_name, tool_input] = codexTool(step.tool, step.input)
          const out = run('PreToolUse', { turn_id: 't', tool_name, tool_input, tool_use_id: `call_${++calls}` })
          const h = out.hookSpecificOutput
          if (h?.permissionDecision === 'deny') return { kind: 'deny', reason: h.permissionDecisionReason }
          assert.deepEqual(out, {}, 'an allowed PreToolUse prints nothing')
          return { kind: 'allow' }
        }
        if (step.kind === 'stop') {
          const out = run('Stop', { turn_id: 't', stop_hook_active: stopActive, last_assistant_message: 'done' })
          if (out.decision === 'block') {
            stopActive = true
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

test('codex parity: the shared scenarios through runScenarios', async () => {
  const results = await runScenarios(adapter)
  assert.equal(results.length, SCENARIOS.length)
  const failed = results.filter(r => !r.ok)
  assert.deepEqual(failed, [], failed.map(r => `${r.name}:\n  ${r.problems.join('\n  ')}`).join('\n'))
})
