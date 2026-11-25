// Maps an Antigravity CLI (`agy`) tool call (PreToolUse `toolCall.name` and `toolCall.args`) to the Claude tool calls
// the hook core judges. The names and argument keys are the ones the stage-1 spike saw (hosts/antigravity/fixtures/;
// a test pins them there), not the web docs' older ones, which are mapped too in case a host version still sends them.
// A call whose input this can't read is denied, and so is any write to what keeps JBIT's hooks on: `~/.gemini/config/`
// (plugins, agents, MCP), `~/.gemini/antigravity-cli/settings.json`, and the plugins' data folders, where the hook keeps
// its own state (its Stop count); the rest of `~/.gemini/antigravity-cli/` stays writable, since every run writes there.
import { homedir } from 'node:os'
import { isAbsolute, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolveInProject } from '../copilot/map.mjs'

/** The tool names this adapter maps, by role: the spike's names first. */
export const TOOLS = {
  shell: ['run_command'],
  write: ['write_file', 'write_to_file'],
  edit: ['edit_file', 'replace_file_content', 'multi_replace_file_content'],
  // every tool in agy's live list that starts or schedules an agent: each one is an Agent call, so the hold applies
  agent: ['invoke_subagent', 'browser_subagent', 'define_subagent', 'manage_subagents', 'run_workflow', 'schedule'],
  keys: ['send_command_input'],
  // edits by sed expressions or by notebook cells: each an Edit of its target, so the path guards and the hold apply
  sed: ['sed_file'],
  notebook: ['notebook_edit'],
}

/**
 * Tools that only read or report: allowed whatever their input. `read_file` and `send_message` (an agent's message to
 * another conversation, how a subagent reports back) were seen live; the rest are the docs' read-only names.
 */
export const READ_ONLY = new Set(['read_file', 'send_message', 'view_file', 'list_dir', 'grep_search', 'find_by_name', 'codebase_search', 'view_code_item', 'search_web', 'read_url_content', 'command_status'])

/**
 * The rest of agy's live tool list (stage-1 `init.tools`) that writes no file and runs no command: browser driving, asking
 * the user, MCP calls (the Claude hook doesn't judge MCP either), the agent's own task and knowledge lists. Allowed
 * unless an argument carries a path or a command. Any tool on neither list is denied: a new tool is unknown, not safe.
 */
export const ALLOWED = new Set([
  'ask_custom_permission', 'ask_permission', 'ask_question', 'call_mcp_tool', 'delete_knowledge', 'finish', 'generate_image',
  'list_permissions', 'list_plugin_accounts', 'list_resources', 'read_resource', 'manage_inbox', 'manage_task',
  'search_marketplace', 'wait', 'wait_5_seconds', 'list_browser_pages', 'open_browser_url', 'read_browser_page',
  'capture_browser_console_logs', 'capture_browser_screenshot', 'click_browser_pixel', 'execute_browser_javascript',
  'browser_click_element', 'browser_drag_pixel_to_pixel', 'browser_get_dom', 'browser_get_network_request', 'browser_input',
  'browser_list_network_requests', 'browser_mouse_down', 'browser_mouse_up', 'browser_move_mouse', 'browser_press_key',
  'browser_refresh_page', 'browser_resize_window', 'browser_scroll', 'browser_scroll_dom', 'browser_select_option',
])

/** An input key that carries a path or a command, at any depth. */
const PATHY = /path|file|dir|folder|cwd|command|cmd|script|patch|shell|exec/i

const isObj = x => x !== null && typeof x === 'object' && !Array.isArray(x)
const str = x => typeof x === 'string' && x.length > 0
const deny = reason => ({ kind: 'deny', reason })
const calls = (...c) => ({ kind: 'calls', calls: c })
const unreadable = (tool, what) => deny(`JBIT blocked this \`${tool}\` call: it couldn't read its arguments (${what}), and a call it can't check doesn't run. Retry with the documented arguments.`)
const first = (args, keys) => keys.map(k => args[k]).find(v => typeof v === 'string')
/** The first of `keys` the input carries, whatever its type, or undefined. */
const present = (args, keys) => keys.map(k => args[k]).find(v => v !== undefined)

const HOME_REASON = what =>
  `JBIT blocked this call: it writes to Antigravity's own config (${what}): \`~/.gemini/config/\` holds the plugins, agents and MCP servers, \`~/.gemini/antigravity-cli/settings.json\` the settings, and the plugins' data folders JBIT's hook state, so an edit there can silently turn JBIT's hooks off. Ask the user to make that change themselves.`

/** The guard's context from the hook's environment: the home, the plugin's data folder and its installed folder. */
export function guardOf(env = process.env) {
  return { home: homedir(), pluginData: str(env.PLUGIN_DATA) ? env.PLUGIN_DATA : undefined, pluginRoot: str(env.PLUGIN_ROOT) ? env.PLUGIN_ROOT : undefined }
}

const resolved = (path, base) => {
  try {
    return resolveInProject(path, base)
  } catch {
    return undefined
  }
}

const trim = p => (p.length > 1 ? p.replace(/\/+$/, '') : p)

/** Spellings of the plugin's data folder: as set, and its real path. */
function dataDirs(guard) {
  if (!str(guard.pluginData) || !isAbsolute(guard.pluginData)) return []
  return [...new Set([guard.pluginData, resolved(guard.pluginData, '/')].filter(str).map(trim))]
}

/** A resolved, absolute path that lands where the guard keeps writes out. Any `.gemini` folder counts, not only HOME's. */
export function protectedPath(path, guard = guardOf()) {
  if (!str(path)) return false
  if (/\/\.gemini\/+(?:config|antigravity-cli\/+plugin_data)(?:\/|$)|\/\.gemini\/+antigravity-cli\/+settings\.json$/.test(path)) return true
  return dataDirs(guard).some(d => path === d || path.startsWith(`${d}/`))
}

const escape = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** A name a command could use to reach a protected path, or a folder above one (renaming it moves the config). */
function shellNames(guard) {
  return new RegExp(
    [
      '(?<![\\w-])\\.gemini/+config(?![\\w.-])',
      '(?<![\\w-])\\.gemini/+antigravity-cli/+(?:settings\\.json|plugin_data)(?![\\w.-])',
      '(?<![\\w-])\\.gemini/*(?![\\w./-])',
      '(?<![\\w-])\\.gemini/+antigravity-cli/*(?![\\w./-])',
      '\\$\\{?PLUGIN_DATA\\b',
      ...dataDirs(guard).map(d => `${escape(d)}(?![\\w.-])`),
    ].join('|'),
  )
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

const HOME_PREFIX = /^(?:~|\$HOME|\$\{HOME\})(?=\/)/

/**
 * A command's words when it is nothing but plain words (bare, '…' or "…"), or null: no operators, redirects, globs,
 * braces, substitution, escapes or comments. `~/`, `$HOME/` and `${HOME}/` may only open a word, and become the home.
 */
function plainWords(command, home) {
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
          const m = /^(?:\$HOME|\$\{HOME\})(?=\/)/.exec(inner)
          if (m) inner = home + inner.slice(m[0].length)
        }
        if (/[$`\\!"]/.test(inner)) return null
        word += inner
        i = j + 1
      } else if ((c === '$' || c === '~') && !word) {
        const m = HOME_PREFIX.exec(s.slice(i))
        if (!m) return null
        word += home
        i += m[0].length
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

const CAPTURE = '/skills/verify/scripts/capture.mjs'

/** The capture cache capture.mjs would use (its cacheDir), from the hook's own environment. */
function captureCacheDir(env = process.env, platform = process.platform) {
  if (str(env.JBIT_CAPTURE_CACHE)) return env.JBIT_CAPTURE_CACHE
  if (platform === 'darwin') return join(homedir(), 'Library', 'Caches', 'jbit', 'capture')
  if (platform === 'win32') return join(str(env.LOCALAPPDATA) ? env.LOCALAPPDATA : join(homedir(), 'AppData', 'Local'), 'jbit', 'capture')
  return join(str(env.XDG_CACHE_HOME) ? env.XDG_CACHE_HOME : join(homedir(), '.cache'), 'jbit', 'capture')
}

/**
 * The installed JBIT plugin running its own screenshot script, and nothing else: `node <PLUGIN_ROOT>/skills/verify/
 * scripts/capture.mjs <args>` (the plugin is installed under `~/.gemini/config/plugins/`, which the guard protects),
 * plain words only, no symlink inside the plugin on the way to the script, run from a folder outside the protected
 * ones, and no argument or capture cache that names or lands in one.
 */
export function runsOwnCapture(command, guard, cwd) {
  if (!str(command) || !str(guard?.pluginRoot) || !isAbsolute(guard.pluginRoot) || !str(cwd)) return false
  const words = plainWords(command, trim(guard.home))
  if (!words || words.length < 2 || words[0] !== 'node') return false
  const root = trim(guard.pluginRoot)
  const realRoot = resolved(root, '/')
  const script = words[1]
  if (!realRoot || script.includes('..') || (script !== root + CAPTURE && script !== realRoot + CAPTURE)) return false
  if (resolved(script, '/') !== realRoot + CAPTURE) return false
  const realCwd = resolved(cwd, '/')
  if (!realCwd || protectedPath(realCwd, guard)) return false
  const names = shellNames(guard)
  for (const arg of words.slice(2)) {
    if (names.test(arg)) return false
    for (const p of [arg, arg.slice(arg.indexOf('=') + 1)]) {
      if (!p) continue
      const at = resolved(p, realCwd)
      if (!at || protectedPath(at, guard)) return false
    }
  }
  const cache = resolved(captureCacheDir(), realCwd)
  return !!cache && !protectedPath(cache, guard)
}

/**
 * A command that names a protected path (or a folder above one) and writes something: conservative on purpose. `cwd`
 * is the folder the command runs in, when known; only then can the installed capture script run (runsOwnCapture).
 */
export function writesProtected(command, guard = guardOf(), { cwd } = {}) {
  if (typeof command !== 'string') return false
  const names = shellNames(guard)
  if (!names.test(command)) return false
  if (runsOwnCapture(command, guard, cwd)) return false
  // a cd into the folder followed by any command runs that command there
  for (const m of command.matchAll(/(?:^|[;\n|&('"])\s*(?:cd|pushd)\s+([^\s;&|)]+)([\s\S]*)/g)) {
    if (names.test(m[1]) && /[;\n|&]\s*[^\s;&|)]/.test(m[2])) return true
  }
  // fd duplications (`2>&1`, `>&-`) and redirects to /dev/null write nothing; `>&file` does
  const plain = command.replace(/\d*>&(?=[\d-])\d*-?/g, ' ').replace(/(?:\d|&)?>>?&?\s*\/dev\/null\b/g, ' ')
  return WRITES.test(plain)
}

/** `agy` subcommands that rewrite its own config, plugins or sign-in; `plugin list` and `plugin validate` only read. */
const AGY_CONFIG = new Set(['plugin', 'plugins', 'mcp', 'config', 'settings', 'login', 'logout', 'auth', 'update'])
const AGY_READS = new Set(['list', 'validate', 'help', '--help', '-h'])
/** `agy` options that take a value as the next word. */
const AGY_VALUE_FLAGS = new Set(['-p', '--prompt', '-m', '--model', '--mode', '--conversation', '--add-dir', '--output-format', '-c', '--cwd'])

/** The config-rewriting `agy` subcommand a command runs, or undefined. */
export function agyConfigCommand(command) {
  if (typeof command !== 'string') return undefined
  for (const m of command.matchAll(/(?:^|[\s;|&(/'"`])agy[ \t]+([^;\n|&)]*)/g)) {
    const words = m[1].trim().split(/\s+/).map(w => w.replace(/^['"]|['"]$/g, ''))
    for (let i = 0; i < words.length; i++) {
      const w = words[i]
      if (w.startsWith('-')) {
        if (AGY_VALUE_FLAGS.has(w)) i++
        continue
      }
      if (AGY_CONFIG.has(w) && !((w === 'plugin' || w === 'plugins') && AGY_READS.has(words[i + 1]))) return w
      break
    }
  }
  return undefined
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

/** A backslash or a drive letter: a Windows path, which this POSIX resolver would read as one odd file name. */
const WINDOWS = /\\|^[A-Za-z]:/

function shell(tool, command, root, guard, cwd) {
  if (writesProtected(command, guard, { cwd })) return deny(HOME_REASON('a shell write'))
  const sub = agyConfigCommand(command)
  if (sub) return deny(`JBIT blocked this call: \`agy ${sub}\` rewrites Antigravity's own config, plugins or sign-in under \`~/.gemini/\`, and a change there can silently turn JBIT's hooks off. Ask the user to run it themselves.`)
  return calls({ tool: 'Bash', command })
}

/**
 * `{ kind: 'calls', calls }` for the core to judge, `{ kind: 'allow' }`, or `{ kind: 'deny', reason }`. `root` is the
 * project's directory; `guard` what keeps writes out of Antigravity's config (guardOf()).
 */
export function mapTool(tool, args, root, guard = guardOf()) {
  if (READ_ONLY.has(tool)) return { kind: 'allow' }
  const at = p => {
    if (WINDOWS.test(p)) return { error: deny(`JBIT blocked this \`${tool}\` call: \`${p.slice(0, 80)}\` is a Windows-style path (a backslash or a drive letter), which the hook can't resolve against the project to check the plan's gates. Use a forward-slash path.`) }
    const path = resolveInProject(p, root)
    return protectedPath(path, guard) ? { error: deny(HOME_REASON(`\`${path}\``)) } : { path }
  }
  if (TOOLS.shell.includes(tool)) {
    if (!isObj(args) || !str(args.CommandLine)) return unreadable(tool, 'no `CommandLine` string')
    let cwd = root
    if (args.Cwd !== undefined) {
      const raw = str(args.Cwd) && !WINDOWS.test(args.Cwd) ? args.Cwd.replace(/^(?:~|\$HOME|\$\{HOME\})(?=\/|$)/, trim(guard.home)) : undefined
      cwd = raw === undefined ? undefined : resolved(raw, resolved(root, '/') ?? root)
      if (!str(cwd)) return unreadable(tool, 'no usable `Cwd`')
      // a command run inside the config runs there whatever its words name, as `cd <folder> && …` does
      if (protectedPath(cwd, guard) || /(?:^|\/)\.gemini(?:\/|$)/.test(cwd)) return deny(HOME_REASON(`a command run in \`${cwd}\``))
    }
    return shell(tool, args.CommandLine, root, guard, cwd)
  }
  if (TOOLS.keys.includes(tool)) {
    // keystrokes into a running command are a command too
    const input = isObj(args) ? first(args, ['Input', 'Text', 'Chars']) : undefined
    if (input === undefined) return unreadable(tool, 'no `Input` string')
    return shell(tool, input, root, guard, undefined)
  }
  if (TOOLS.write.includes(tool) || TOOLS.edit.includes(tool)) {
    const p = isObj(args) ? first(args, ['Path', 'TargetFile', 'AbsolutePath', 'FilePath', 'File']) : undefined
    if (!str(p)) return unreadable(tool, 'no `Path` string')
    const r = at(p)
    if (r.error) return r.error
    if (TOOLS.write.includes(tool)) {
      // `EmptyFile` (write_to_file) creates an empty file and carries no content
      const content = present(args, ['Content', 'CodeContent']) ?? (args.EmptyFile === true ? '' : undefined)
      if (typeof content !== 'string') return unreadable(tool, 'no `Content` string')
      return calls({ tool: 'Write', file_path: r.path, content })
    }
    // a multi-replace carries its edits in a chunk list: each chunk is an Edit of its own, so every change is judged
    const listKey = CHUNKS.find(k => args[k] !== undefined)
    if (listKey || tool === 'multi_replace_file_content') {
      const chunks = args[listKey]
      if (!Array.isArray(chunks) || !chunks.length) return unreadable(tool, 'no `ReplacementChunks` list')
      const edits = chunks.map(c => (isObj(c) ? edit(c) : undefined))
      if (edits.some(e => !e)) return unreadable(tool, 'a chunk without `TargetContent` and `ReplacementContent` strings')
      return calls(...edits.map(([old_string, new_string]) => ({ tool: 'Edit', file_path: r.path, old_string, new_string })))
    }
    const one = edit(args)
    if (!one) return unreadable(tool, 'no `Target` and `Replacement` strings')
    return calls({ tool: 'Edit', file_path: r.path, old_string: one[0], new_string: one[1] })
  }
  if (TOOLS.sed.includes(tool) || TOOLS.notebook.includes(tool)) {
    // sed_file (agy's schema: `target_file`, `expressions`, `file_content`); notebook_edit (its step: `absolute_path_uri`,
    // `operation`, `cells` of `{kind, content}`): the target is all the gates need, and the text goes along for the record
    const sed = TOOLS.sed.includes(tool)
    const keys = sed ? ['target_file', 'TargetFile', 'targetFile', 'Path', 'AbsolutePath'] : ['notebook_path', 'NotebookPath', 'notebookPath', 'absolute_path_uri', 'AbsolutePathUri', 'absolutePathUri', 'AbsolutePath', 'TargetFile', 'target_file', 'Path']
    let p = isObj(args) ? present(args, keys) : undefined
    if (str(p) && /^[a-z][a-z0-9+.-]*:/i.test(p) && !WINDOWS.test(p)) {
      try {
        p = p.startsWith('file:') ? fileURLToPath(p) : undefined
      } catch {
        p = undefined
      }
    }
    if (!str(p)) return unreadable(tool, sed ? 'no `target_file` string' : 'no notebook path string')
    const r = at(p)
    if (r.error) return r.error
    return calls({ tool: 'Edit', file_path: r.path, old_string: '', new_string: sed ? sedText(args) : cellText(args) })
  }
  if (TOOLS.agent.includes(tool)) {
    if (!isObj(args)) return unreadable(tool, 'the arguments are not an object')
    const description = first(args, ['Role', 'TaskName', 'Name']) ?? ''
    const agent = { tool: 'Agent', description, prompt: first(args, ['Prompt', 'Task', 'SystemPrompt', 'Name']) ?? '' }
    if (str(args.TypeName)) agent.subagent_type = args.TypeName
    return calls(agent)
  }
  if (!ALLOWED.has(tool)) return deny(`JBIT blocked \`${tool}\`: it isn't a tool JBIT knows, so it can't tell whether the call writes files, runs commands or starts an agent, and a call it can't check doesn't run. Use run_command, write_file, edit_file or invoke_subagent instead, or ask the user.`)
  if (typeof args === 'string' && args.length) return deny(unknownReason(tool, 'its arguments are raw text'))
  const key = pathyKey(args)
  if (key) return deny(unknownReason(tool, `\`${key}\``))
  return { kind: 'allow' }
}

/** A sed_file call's expressions and `r` blocks as one text, whatever their shape. */
const sedText = args => [args.expressions ?? args.Expressions, args.file_content ?? args.FileContent].map(v => (typeof v === 'string' ? v : JSON.stringify(v ?? ''))).join('\n')
/** A notebook_edit call's cell text, whatever its shape. */
const cellText = args => {
  const cells = present(args, ['cells', 'Cells', 'new_source', 'NewSource', 'content', 'Content'])
  return typeof cells === 'string' ? cells : JSON.stringify(cells ?? '')
}

/** The input keys a multi-replace may carry its chunk list under. */
const CHUNKS = ['ReplacementChunks', 'Chunks', 'Replacements', 'Edits']

/** An edit's [old, new] from its fields, or undefined when either is missing or not a string. */
function edit(o) {
  const old = present(o, ['Target', 'TargetContent'])
  const next = present(o, ['Replacement', 'ReplacementContent'])
  return typeof old === 'string' && typeof next === 'string' ? [old, next] : undefined
}

const unknownReason = (tool, what) =>
  `JBIT blocked \`${tool}\`: it doesn't know this tool, and its arguments carry a path or a command (${what}) that the plan's gates can't check. Use run_command, write_file or edit_file instead, or ask the user.`
