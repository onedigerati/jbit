// Maps a Codex CLI tool call (PreToolUse `tool_name` and `tool_input`) to the Claude tool calls the hook core judges.
// `apply_patch` carries its patch in `tool_input.command` (the grammar Copilot uses, `hosts/core/patch.mjs`), and the
// shell is `Bash` with `tool_input.command` a string. A call whose input this can't read is denied, and so is any write
// under `$CODEX_HOME` or a `.codex` folder: an edit there (config, hooks.json, the plugin cache) turns the hooks off.
import { homedir } from 'node:os'
import { join, sep } from 'node:path'
import { mapTool as copilotMap, resolveInProject } from './copilot/map.mjs'

/** Tools that only read or report: allowed whatever their input. */
export const READ_ONLY = new Set(['view_image', 'update_plan', 'web_search', 'list_agents', 'wait_agent', 'interrupt_agent'])

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

/** A path or a name a command could use to reach $CODEX_HOME or a `.codex` folder. */
function homeNames(codexHome) {
  const homes = [codexHome, ...(() => {
    try {
      return [resolveInProject(codexHome, '/')]
    } catch {
      return []
    }
  })()].filter(str)
  return new RegExp(['\\$\\{?CODEX_HOME\\b', '\\.codex(?![\\w.-])', ...homes.map(h => `${escape(h.replace(/\/+$/, ''))}(?![\\w.-])`)].join('|'))
}

/** Commands that write, delete, fetch into or extract into a path they name, or run code that could: best-effort. */
const WRITES = new RegExp(
  [
    '[>]',
    '\\b(?:tee|cp|mv|rm|rmdir|chmod|chown|ln|install|truncate|dd|touch|mkdir|unlink|rsync|wget|unzip|patch)\\b',
    '\\bsed\\b[^|;&]*\\s(?:-[a-zA-Z]*i|--in-place)',
    '\\bfind\\b[^|;&]*\\s-(?:delete|exec|execdir|ok|okdir|fprint0?|fprintf|fls)\\b',
    '\\bcurl\\b[^|;&]*\\s(?:-[a-zA-Z]*[oO]\\b|--output\\b|--remote-name)',
    '\\btar\\s+[a-zA-Z]*x',
    '\\btar\\b[^|;&]*\\s(?:-[a-zA-Z]*x|--extract\\b|--get\\b|-C\\b|--directory\\b)',
    '\\bgit\\s+(?:-\\S+\\s+)*-C\\b',
    // an interpreter whose code names the folder can write anything there
    '\\b(?:python[\\d.]*|node|nodejs|perl|ruby|php|deno|bun|lua)\\b',
    '\\b(?:ba|z|da|k)?sh\\s+(?:-[a-zA-Z]+\\s+)*-[a-zA-Z]*c\\b',
  ].join('|'),
)

/** A command that names $CODEX_HOME (or a `.codex` folder) and writes something: conservative on purpose. */
export function writesCodexHome(command, codexHome) {
  if (typeof command !== 'string') return false
  const names = homeNames(codexHome)
  if (!names.test(command)) return false
  // a cd into the folder followed by any command runs that command there
  for (const m of command.matchAll(/(?:^|[;\n|&('"])\s*(?:cd|pushd)\s+([^\s;&|)]+)([\s\S]*)/g)) {
    if (names.test(m[1]) && /[;\n|&]\s*[^\s;&|)]/.test(m[2])) return true
  }
  // fd duplications (`2>&1`, `>&-`) and redirects to /dev/null write nothing; `>&file` does
  const plain = command.replace(/\d*>&(?=[\d-])\d*-?/g, ' ').replace(/(?:\d|&)?>>?&?\s*\/dev\/null\b/g, ' ')
  return WRITES.test(plain)
}

/** `codex` subcommands that rewrite Codex's own config, plugins or sign-in. */
const CODEX_CONFIG = new Set(['mcp', 'plugin', 'plugins', 'marketplace', 'features', 'config', 'login', 'logout'])
/** `codex` options that take a value as the next word. */
const CODEX_VALUE_FLAGS = new Set(['-c', '--config', '-m', '--model', '-p', '--profile', '-C', '--cd', '-s', '--sandbox', '-a', '--ask-for-approval', '-i', '--image', '--enable', '--disable', '--local-provider'])

/** The config-rewriting `codex` subcommand a command runs, or undefined. */
export function codexConfigCommand(command) {
  if (typeof command !== 'string') return undefined
  for (const m of command.matchAll(/(?:^|[\s;|&(/'"`])codex[ \t]+([^;\n|&)]*)/g)) {
    const words = m[1].trim().split(/\s+/)
    for (let i = 0; i < words.length; i++) {
      const w = words[i].replace(/^['"]|['"]$/g, '')
      if (w.startsWith('-')) {
        if (CODEX_VALUE_FLAGS.has(w)) i++
        continue
      }
      if (CODEX_CONFIG.has(w)) return w
      break
    }
  }
  return undefined
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

const PATCH_BLOCK = /\*\*\* Begin Patch[\s\S]*?\*\*\* End Patch/g
/**
 * `apply_patch` as the command word: at the start, after `;`, `&&`, `||`, `|` or a newline (behind `env` and the
 * like), or as the script of `sh -c`. A mention anywhere else (`rg -n apply_patch`) is an argument.
 */
const APPLY_PATCH = /(?:(?:^|[;\n|&(])\s*(?:(?:env|command|exec|nohup|time|sudo)\s+)*|\b(?:ba|z|da|k)?sh\s+(?:-[a-zA-Z]+\s+)*-[a-zA-Z]*c\s+['"]\s*)apply_patch(?![\w.-])/
/** A change of directory: a patch's relative paths would land somewhere other than the project root. */
const CHDIR = /(?:^|[\s;|&('"])(?:cd|pushd|popd|chdir)(?:\s|$|;)|\s(?:-C|--chdir|--directory|--cwd|--workdir)(?:[\s=]|$)/

/**
 * A shell command (Bash, or keystrokes into a running shell): judged whole as Bash, plus each patch it feeds a real
 * `apply_patch` command, against `input.workdir` when it has one (inside the project, or denied).
 */
function shellCalls(tool, command, root, codexHome, input = {}) {
  if (writesCodexHome(command, codexHome)) return deny(HOME_REASON('a shell write'))
  const sub = codexConfigCommand(command)
  if (sub) return deny(`JBIT blocked this call: \`codex ${sub}\` rewrites Codex's own config, plugins or sign-in under \`$CODEX_HOME\`, and a change there can silently turn JBIT's hooks off. Ask the user to run it themselves.`)
  const bash = { tool: 'Bash', command }
  const outside = command.replace(PATCH_BLOCK, ' ')
  if (!APPLY_PATCH.test(outside)) return { kind: 'calls', calls: [bash] }
  if (CHDIR.test(outside)) return deny(`JBIT blocked this \`${tool}\` call: it changes directory before running \`apply_patch\`, so the patch's relative paths can't be checked against the project. Run \`apply_patch\` from the project root, or use the apply_patch tool.`)
  let base = root
  if (input.workdir !== undefined) {
    if (!str(input.workdir) || /\\|^[A-Za-z]:/.test(input.workdir)) return unreadable(tool, 'a `workdir` that is not a forward-slash path')
    const top = resolveInProject('.', root)
    base = resolveInProject(input.workdir, root)
    if (base !== top && !base.startsWith(`${top}/`)) return deny(`JBIT blocked this \`${tool}\` call: it runs \`apply_patch\` in \`${input.workdir.slice(0, 120)}\`, outside the project, where the plan's gates can't check it. Run it from the project.`)
  }
  const out = [bash]
  for (const text of command.match(PATCH_BLOCK) ?? ['']) {
    const r = patchCalls(text, base, codexHome)
    if (r.kind !== 'calls') return r
    out.push(...r.calls)
  }
  return { kind: 'calls', calls: out }
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
    case 'Bash':
      if (!isObj(input) || !str(input.command)) return unreadable(tool, 'no `command` string')
      return shellCalls(tool, input.command, root, codexHome, input)
    case 'write_stdin':
      // keystrokes into a running shell are a command too
      if (!isObj(input) || typeof input.chars !== 'string') return unreadable(tool, 'no `chars` string')
      return shellCalls(tool, input.chars, root, codexHome)
    case 'spawn_agent': {
      if (!isObj(input)) return unreadable(tool, 'the input is not an object')
      const agent = { tool: 'Agent', description: typeof input.task_name === 'string' ? input.task_name : '', prompt: typeof input.message === 'string' ? input.message : '' }
      if (str(input.agent_type)) agent.subagent_type = input.agent_type
      if (str(input.model)) agent.model = input.model
      if (str(input.reasoning_effort)) agent.effort = input.reasoning_effort
      return { kind: 'calls', calls: [agent] }
    }
    case 'send_message':
    case 'followup_task': {
      // more work handed to a running agent is an agent call too
      if (!isObj(input)) return unreadable(tool, 'the input is not an object')
      const name = [input.task_name, input.target, input.agent_id, input.id].find(str) ?? ''
      return { kind: 'calls', calls: [{ tool: 'Agent', description: name, prompt: typeof input.message === 'string' ? input.message : '' }] }
    }
  }
  if (typeof input === 'string' && input.length) return deny(unknownReason(tool, 'its input is raw text'))
  const key = pathyKey(input)
  if (key) return deny(unknownReason(tool, `\`${key}\``))
  return { kind: 'allow' }
}

const unknownReason = (tool, what) =>
  `JBIT blocked \`${tool}\`: it doesn't know this tool, and its input carries a path or a command (${what}) that the plan's gates can't check. Use the shell or apply_patch instead, or ask the user.`
