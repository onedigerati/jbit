// Maps a Codex CLI tool call (PreToolUse `tool_name` and `tool_input`) to the Claude tool calls the hook core judges.
// `apply_patch` carries its patch in `tool_input.command` (the grammar Copilot uses, `hosts/core/patch.mjs`), and the
// shell is `Bash` with `tool_input.command` a string. A call whose input this can't read is denied, and so is any write
// under `$CODEX_HOME` or a `.codex` folder: an edit there (config, hooks.json, the plugin cache) turns the hooks off.
import { homedir } from 'node:os'
import { join, sep } from 'node:path'
import { mapTool as copilotMap, resolveInProject } from '../copilot/map.mjs'

/** Tools that only read or report: allowed whatever their input. */
export const READ_ONLY = new Set(['view_image', 'update_plan', 'web_search', 'list_agents', 'wait_agent', 'interrupt_agent'])

/** Codex's agent tools, which it may name with a `collaboration` prefix (`collaborationspawn_agent`, seen live). */
const AGENT_TOOLS = new Set(['spawn_agent', 'wait_agent', 'send_message', 'followup_task', 'list_agents', 'interrupt_agent'])

/** An agent tool's bare name, with or without a `collaboration`, `collaboration.` or `collaboration__` prefix. */
export function agentToolName(tool) {
  const m = /^collaboration(?:\.|__)?(.+)$/.exec(tool)
  return m && AGENT_TOOLS.has(m[1]) ? m[1] : tool
}

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

const HOME_VAR = '\u0000CODEX_HOME\u0000'

/**
 * A command's words when it is nothing but plain words (bare, '…' or "…"), or null: no operators, redirects, globs,
 * braces, substitution, escapes or comments. `$CODEX_HOME`/`${CODEX_HOME}` may only open a word, and becomes HOME_VAR.
 */
function plainWords(command) {
  const out = []
  let i = 0
  const s = command.trim()
  while (i < s.length) {
    let word = ''
    while (i < s.length && s[i] !== ' ' && s[i] !== '\t') {
      const c = s[i]
      if (c === "'") {
        const j = s.indexOf("'", i + 1)
        if (j < 0) return null
        word += s.slice(i + 1, j)
        i = j + 1
      } else if (c === '"') {
        const j = s.indexOf('"', i + 1)
        if (j < 0) return null
        let inner = s.slice(i + 1, j)
        if (!word) {
          const m = /^\$(?:CODEX_HOME|\{CODEX_HOME\})(?=\/)/.exec(inner)
          if (m) inner = HOME_VAR + inner.slice(m[0].length)
        }
        if (/[$`\\!"]/.test(inner)) return null
        word += inner
        i = j + 1
      } else if (c === '$' && !word) {
        const m = /^\$(?:CODEX_HOME|\{CODEX_HOME\})(?=\/)/.exec(s.slice(i))
        if (!m) return null
        word += HOME_VAR
        i += m[0].length
      } else if (c === '~' && !word && s[i + 1] === '/') {
        word += `${homedir()}/`
        i += 2
      } else if (/[A-Za-z0-9_@%+=:,./-]/.test(c)) {
        word += c
        i++
      } else return null
    }
    out.push(word)
    while (s[i] === ' ' || s[i] === '\t') i++
  }
  return out
}

const CAPTURE_TAIL = /^\/plugins\/cache\/[A-Za-z0-9][\w.+-]*\/jbit\/[A-Za-z0-9][\w.+-]*\/skills\/verify\/scripts\/capture\.mjs$/

const resolved = (path, base) => {
  try {
    return resolveInProject(path, base)
  } catch {
    return undefined
  }
}

/** The capture cache capture.mjs would use (its cacheDir), from the hook's own environment. */
function captureCacheDir(env = process.env, platform = process.platform) {
  if (str(env.JBIT_CAPTURE_CACHE)) return env.JBIT_CAPTURE_CACHE
  if (platform === 'darwin') return join(homedir(), 'Library', 'Caches', 'jbit', 'capture')
  if (platform === 'win32') return join(str(env.LOCALAPPDATA) ? env.LOCALAPPDATA : join(homedir(), 'AppData', 'Local'), 'jbit', 'capture')
  return join(str(env.XDG_CACHE_HOME) ? env.XDG_CACHE_HOME : join(homedir(), '.cache'), 'jbit', 'capture')
}

/**
 * The installed JBIT plugin running its own screenshot script from the plugin cache, and nothing else:
 * `node <$CODEX_HOME>/plugins/cache/<m>/jbit/<v>/skills/verify/scripts/capture.mjs <args>`, plain words only, no symlink
 * on the way to the script, run from a known folder outside $CODEX_HOME, and no argument that names or lands under it.
 */
export function runsOwnCapture(command, codexHome, cwd) {
  if (!str(command) || !str(codexHome) || !str(cwd)) return false
  const words = plainWords(command)
  if (!words || words.length < 2 || words[0] !== 'node') return false
  const home = codexHome.replace(/\/+$/, '')
  const script = words[1].startsWith(HOME_VAR) ? home + words[1].slice(HOME_VAR.length) : words[1]
  if (script.includes('..') || script.includes(HOME_VAR) || !script.startsWith(`${home}/`)) return false
  const tail = script.slice(home.length)
  if (!CAPTURE_TAIL.test(tail)) return false
  // the script is where its path says: no symlinked folder in the cache leads somewhere else
  const realHome = resolved(home, '/')
  if (!realHome || resolved(script, '/') !== realHome + tail) return false
  const realCwd = resolved(cwd, '/')
  if (!realCwd || underCodexHome(realCwd, codexHome) || underCodexHome(realCwd, realHome)) return false
  const names = homeNames(codexHome)
  for (const arg of words.slice(2)) {
    if (arg.includes(HOME_VAR) || names.test(arg)) return false
    for (const p of [arg, arg.slice(arg.indexOf('=') + 1)]) {
      if (!p) continue
      const at = resolved(p, realCwd)
      if (!at || underCodexHome(at, codexHome) || underCodexHome(at, realHome)) return false
    }
  }
  // the script takes its command from any word (`--timeout 1 install`, `--install`), so whatever the call, the cache it
  // would fill must lie outside $CODEX_HOME: the one the environment names, else the default as capture.mjs works it out
  const cache = resolved(captureCacheDir(), realCwd)
  if (!cache || underCodexHome(cache, codexHome) || underCodexHome(cache, realHome)) return false
  return true
}

/**
 * A command that names $CODEX_HOME (or a `.codex` folder) and writes something: conservative on purpose. `cwd` is
 * the folder a Bash command runs in, when known; only then can the installed capture script run (runsOwnCapture).
 */
export function writesCodexHome(command, codexHome, { cwd } = {}) {
  if (typeof command !== 'string') return false
  const names = homeNames(codexHome)
  if (!names.test(command)) return false
  if (runsOwnCapture(command, codexHome, cwd)) return false
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
  // a Bash call runs in its workdir, else the project; keystrokes into a running shell run wherever it is
  const cwd = tool !== 'Bash' ? undefined : input.workdir === undefined ? root : str(input.workdir) && !/\\|^[A-Za-z]:/.test(input.workdir) ? resolved(input.workdir, resolved(root, '/') ?? root) : undefined
  if (writesCodexHome(command, codexHome, { cwd })) return deny(HOME_REASON('a shell write'))
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
  if (typeof tool === 'string') tool = agentToolName(tool)
  // an agent tool Codex adds later, still under the `collaboration` prefix: judged as a spawn while it carries a brief
  if (typeof tool === 'string' && /^collaboration/.test(tool) && input !== null && typeof input === 'object' && typeof input.message === 'string' && !pathyKey(input)) tool = 'spawn_agent'
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
