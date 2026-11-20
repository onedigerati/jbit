// Maps a Codex CLI tool call (PreToolUse `tool_name` and `tool_input`) to the Claude tool calls the hook core judges.
// `apply_patch` carries its patch in `tool_input.command` (the grammar Copilot uses, `hosts/core/patch.mjs`), and the
// shell is `Bash` with `tool_input.command` a string. A call whose input this can't read is denied, and so is any write
// under `$CODEX_HOME` or a `.codex` folder: an edit there (config, hooks.json, the plugin cache) turns the hooks off.
import { homedir } from 'node:os'
import { join, sep } from 'node:path'
import { mapTool as copilotMap, resolveInProject } from './copilot/map.mjs'

/** Tools that only read or report: allowed whatever their input. */
export const READ_ONLY = new Set(['view_image', 'update_plan', 'web_search', 'list_agents', 'wait_agent'])

/** An input key that carries a path or a command, at any depth. */
const PATHY = /path|file|dir|folder|cwd|command|cmd|script|patch|shell|exec/i

const isObj = x => x !== null && typeof x === 'object' && !Array.isArray(x)
const str = x => typeof x === 'string' && x.length > 0
const deny = reason => ({ kind: 'deny', reason })
const unreadable = (tool, what) => deny(`JBIT blocked this \`${tool}\` call: it couldn't read its input (${what}), and a call it can't check doesn't run. Retry with the documented input.`)

/** `$CODEX_HOME`, or `~/.codex` when it isn't set. */
export const codexHomeOf = (env = process.env) => (str(env.CODEX_HOME) ? env.CODEX_HOME : join(homedir(), '.codex'))

const HOME_REASON = what =>
  `JBIT blocked this call: it writes under \`$CODEX_HOME\` or a \`.codex\` folder (${what}), where Codex keeps its config, hooks.json and the plugin cache, and an edit there silently turns JBIT's hooks off. Ask the user to make that change themselves.`

const escape = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** A command that names $CODEX_HOME (or a `.codex` folder) and writes something: conservative on purpose. */
export function writesCodexHome(command, codexHome) {
  if (typeof command !== 'string') return false
  const homes = [codexHome, ...(() => {
    try {
      return [resolveInProject(codexHome, '/')]
    } catch {
      return []
    }
  })()].filter(str)
  const names = new RegExp(['\\$\\{?CODEX_HOME\\b', '\\.codex(?![\\w.-])', ...homes.map(h => `${escape(h.replace(/\/+$/, ''))}(?![\\w.-])`)].join('|'))
  if (!names.test(command)) return false
  // fd duplications and redirects to /dev/null write nothing
  const plain = command.replace(/\d*>&\d*-?/g, ' ').replace(/(?:\d|&)?>>?\s*\/dev\/null\b/g, ' ')
  return /[>]|\b(?:tee|cp|mv|rm|rmdir|chmod|chown|ln|install|truncate|dd|touch|mkdir|unlink|rsync)\b|\bsed\b[^|;&]*\s(?:-[a-zA-Z]*i|--in-place)|\bperl\b[^|;&]*\s-[a-zA-Z]*i/.test(plain)
}

/** Whether a resolved path lands under `$CODEX_HOME` or in any `.codex` folder. */
function underCodexHome(path, codexHome) {
  if (path.split(sep).includes('.codex')) return true
  for (const h of [codexHome, (() => { try { return resolveInProject(codexHome, '/') } catch { return undefined } })()]) {
    if (!str(h)) continue
    const base = h.replace(/\/+$/, '')
    if (path === base || path.startsWith(`${base}/`)) return true
  }
  return false
}

/** The patch text a shell command feeds `apply_patch`, or undefined when it doesn't run it. */
function shellPatch(command) {
  if (!/(?:^|[\s;&|(])apply_patch\b/.test(command)) return undefined
  const m = /\*\*\* Begin Patch[\s\S]*?\*\*\* End Patch/.exec(command)
  return m ? m[0] : ''
}

/** The first input key, at any depth, that carries a path or a command. */
function pathyKey(value, depth = 0) {
  if (depth > 6 || value === null || typeof value !== 'object') return undefined
  for (const [k, v] of Object.entries(value)) {
    if (!Array.isArray(value) && PATHY.test(k)) return k
    const inner = pathyKey(v, depth + 1)
    if (inner) return inner
  }
  return undefined
}

function patchCalls(text, root, codexHome) {
  const r = copilotMap('apply_patch', text, root)
  if (r.kind !== 'calls') return r
  const hit = r.calls.find(c => underCodexHome(c.file_path, codexHome))
  return hit ? deny(HOME_REASON(`\`${hit.file_path}\``)) : r
}

/**
 * `{ kind: 'calls', calls }` for the core to judge, `{ kind: 'allow' }`, or `{ kind: 'deny', reason }`. `root` is the
 * project's directory; `codexHome` the folder to keep writes out of.
 */
export function mapTool(tool, input, root, { codexHome = codexHomeOf() } = {}) {
  if (READ_ONLY.has(tool)) return { kind: 'allow' }
  switch (tool) {
    case 'apply_patch':
      if (!isObj(input) || typeof input.command !== 'string') return unreadable(tool, 'no `command` string holding the patch')
      return patchCalls(input.command, root, codexHome)
    case 'Bash': {
      if (!isObj(input) || !str(input.command)) return unreadable(tool, 'no `command` string')
      if (writesCodexHome(input.command, codexHome)) return deny(HOME_REASON('a shell write'))
      const p = shellPatch(input.command)
      if (p !== undefined) return patchCalls(p, root, codexHome)
      return { kind: 'calls', calls: [{ tool: 'Bash', command: input.command }] }
    }
    case 'write_stdin':
      // keystrokes into a running shell are a command too
      if (!isObj(input) || typeof input.chars !== 'string') return unreadable(tool, 'no `chars` string')
      if (writesCodexHome(input.chars, codexHome)) return deny(HOME_REASON('a shell write'))
      return { kind: 'calls', calls: [{ tool: 'Bash', command: input.chars }] }
    case 'spawn_agent': {
      if (!isObj(input)) return unreadable(tool, 'the input is not an object')
      const agent = { tool: 'Agent', description: typeof input.task_name === 'string' ? input.task_name : '', prompt: typeof input.message === 'string' ? input.message : '' }
      if (str(input.agent_type)) agent.subagent_type = input.agent_type
      if (str(input.model)) agent.model = input.model
      if (str(input.reasoning_effort)) agent.effort = input.reasoning_effort
      return { kind: 'calls', calls: [agent] }
    }
  }
  if (typeof input === 'string' && input.length) return deny(unknownReason(tool, 'its input is raw text'))
  const key = pathyKey(input)
  if (key) return deny(unknownReason(tool, `\`${key}\``))
  return { kind: 'allow' }
}

const unknownReason = (tool, what) =>
  `JBIT blocked \`${tool}\`: it doesn't know this tool, and its input carries a path or a command (${what}) that the plan's gates can't check. Use the shell or apply_patch instead, or ask the user.`
