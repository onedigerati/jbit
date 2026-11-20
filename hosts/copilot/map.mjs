// Maps a Copilot tool call to the Claude tool calls the hook core judges (`Bash`, `Edit`, `Write`, `Agent`, `Skill`).
// A call whose args this can't read is denied: a field it can't read never means allow.
import { lstatSync, readlinkSync, realpathSync } from 'node:fs'
import { dirname, isAbsolute, join } from 'node:path'
import { parsePatch } from '../core/patch.mjs'

/** Tools that only read, or only report: always allowed, whatever their args. */
export const READ_ONLY = new Set(['view', 'glob', 'grep', 'read_agent', 'list_agents', 'read_bash', 'list_bash', 'stop_bash', 'report_intent', 'web_fetch', 'web_search', 'fetch_copilot_cli_documentation'])

/** Tools the guard maps and judges. */
export const GUARDED = new Set(['bash', 'write_bash', 'apply_patch', 'edit', 'create', 'str_replace_editor', 'task', 'skill'])

/** An argument name that carries a path or a command, at any depth. */
const PATHY = /path|file|dir|folder|cwd|command|cmd|script|patch|shell|exec/i

const isObj = x => x !== null && typeof x === 'object' && !Array.isArray(x)
const str = x => typeof x === 'string' && x.length > 0
const deny = reason => ({ kind: 'deny', reason })
const calls = (...list) => ({ kind: 'calls', calls: list })
const unreadable = (tool, what) => deny(`JBIT blocked this \`${tool}\` call: it couldn't read its arguments (${what}), and a call it can't check doesn't run. Retry with the documented arguments.`)

const MAX_LINKS = 40

/**
 * Where a path a tool names lands: against the project's real root when relative, each step resolved as the OS would,
 * so `..` after a symlink climbs from the link's target, and a symlink (dangling or not) is followed to where a write
 * goes. A part that doesn't exist yet stays as written.
 */
export function resolveInProject(path, root, depth = 0) {
  if (depth > MAX_LINKS) throw new Error('too many symlinks')
  let cur = isAbsolute(path) ? '/' : real(root)
  for (const seg of path.split('/')) {
    if (!seg || seg === '.') continue
    if (seg === '..') {
      cur = dirname(cur)
      continue
    }
    const next = join(cur, seg)
    let st
    try {
      st = lstatSync(next)
    } catch {
      cur = next
      continue
    }
    if (st.isSymbolicLink()) {
      const target = readlinkSync(next)
      cur = resolveInProject(target, cur, depth + 1)
    } else cur = next
  }
  return cur
}

function real(p) {
  try {
    return realpathSync(p)
  } catch {
    return p
  }
}

/** Old and new text of an Update's hunks, for the Edit call it stands for. */
function edits(hunks = []) {
  const old = []
  const now = []
  for (const l of hunks) {
    if (l.startsWith('@@')) continue
    const body = l.slice(1)
    if (l.startsWith('-')) old.push(body)
    else if (l.startsWith('+')) now.push(body)
    else {
      old.push(body)
      now.push(body)
    }
  }
  return { old_string: old.join('\n'), new_string: now.join('\n') }
}

/** The first argument name, at any depth, that carries a path or a command. */
function pathyKey(value, depth = 0) {
  if (depth > 6 || value === null || typeof value !== 'object') return undefined
  for (const [k, v] of Object.entries(value)) {
    if (!Array.isArray(value) && PATHY.test(k)) return k
    const inner = pathyKey(v, depth + 1)
    if (inner) return inner
  }
  return undefined
}

/**
 * `{ kind: 'calls', calls }` for the core to judge, `{ kind: 'allow' }`, or `{ kind: 'deny', reason }`.
 * `root` is the project's directory.
 */
export function mapTool(tool, args, root) {
  if (READ_ONLY.has(tool)) return { kind: 'allow' }
  try {
    return mapped(tool, args, root)
  } catch (err) {
    if (err instanceof WindowsPath) return deny(err.message)
    throw err
  }
}

class WindowsPath extends Error {}

/** A backslash or a drive letter: a Windows path, which this POSIX resolver would read as one odd file name. */
const WINDOWS = /\\|^[A-Za-z]:/

function mapped(tool, args, root) {
  const at = p => {
    if (WINDOWS.test(p)) throw new WindowsPath(`JBIT blocked this \`${tool}\` call: \`${p.slice(0, 80)}\` is a Windows-style path (a backslash or a drive letter), which the hook can't resolve against the project to check the plan's gates. Use a forward-slash path relative to the project.`)
    return resolveInProject(p, root)
  }
  switch (tool) {
    case 'bash':
      if (!isObj(args) || !str(args.command)) return unreadable(tool, 'no `command` string')
      return calls({ tool: 'Bash', command: args.command })
    case 'write_bash':
      // keystrokes into a running shell are a command too
      if (!isObj(args) || typeof args.input !== 'string') return unreadable(tool, 'no `input` string')
      return calls({ tool: 'Bash', command: args.input })
    case 'apply_patch': {
      if (typeof args !== 'string') return unreadable(tool, 'the patch is not a string')
      const patch = parsePatch(args)
      if (!patch.ok) return deny(`JBIT blocked this \`apply_patch\` call: it couldn't read the patch (${patch.reason}), and a patch it can't check doesn't run. Send a well-formed patch: \`*** Begin Patch\`, \`*** Add File:\`/\`*** Update File:\`/\`*** Delete File:\` headers, \`*** End Patch\`.`)
      const out = []
      for (const f of patch.files) {
        if (f.op === 'add') out.push({ tool: 'Write', file_path: at(f.path), content: f.content })
        else if (f.op === 'delete') out.push({ tool: 'Edit', file_path: at(f.path), old_string: '', new_string: '' })
        else {
          const e = edits(f.hunks)
          out.push({ tool: 'Edit', file_path: at(f.path), ...e })
          if (f.moveTo !== undefined) out.push({ tool: 'Write', file_path: at(f.moveTo), content: e.new_string })
        }
      }
      return calls(...out)
    }
    case 'edit':
      if (!isObj(args) || !str(args.path)) return unreadable(tool, 'no `path` string')
      return calls({ tool: 'Edit', file_path: at(args.path), old_string: typeof args.old_str === 'string' ? args.old_str : '', new_string: typeof args.new_str === 'string' ? args.new_str : '' })
    case 'create':
      if (!isObj(args) || !str(args.path)) return unreadable(tool, 'no `path` string')
      return calls({ tool: 'Write', file_path: at(args.path), content: typeof args.file_text === 'string' ? args.file_text : '' })
    case 'str_replace_editor':
      if (!isObj(args) || !str(args.path) || !str(args.command)) return unreadable(tool, 'no `command` and `path` strings')
      if (args.command === 'view') return { kind: 'allow' }
      if (args.command === 'create') return calls({ tool: 'Write', file_path: at(args.path), content: typeof args.file_text === 'string' ? args.file_text : '' })
      return calls({ tool: 'Edit', file_path: at(args.path), old_string: typeof args.old_str === 'string' ? args.old_str : '', new_string: typeof args.new_str === 'string' ? args.new_str : '' })
    case 'task': {
      if (!isObj(args)) return unreadable(tool, 'the arguments are not an object')
      const agent = { tool: 'Agent', description: typeof args.description === 'string' ? args.description : '', prompt: typeof args.prompt === 'string' ? args.prompt : '' }
      if (str(args.agent_type)) agent.subagent_type = args.agent_type
      if (str(args.name)) agent.name = args.name
      if (str(args.model)) agent.model = args.model
      if (str(args.reasoning_effort)) agent.effort = args.reasoning_effort
      agent.run_in_background = args.mode === 'background'
      return calls(agent)
    }
    case 'skill':
      if (!isObj(args) || !str(args.skill)) return unreadable(tool, 'no `skill` string')
      return calls({ tool: 'Skill', skill: args.skill })
  }
  if (typeof args === 'string' && args.length) return deny(unknownReason(tool, 'its arguments are raw text'))
  const key = pathyKey(args)
  if (key) return deny(unknownReason(tool, `\`${key}\``))
  return { kind: 'allow' }
}

const unknownReason = (tool, what) =>
  `JBIT blocked \`${tool}\`: it doesn't know this tool, and its arguments carry a path or a command (${what}) that the plan's gates can't check. Use bash, apply_patch, edit or create instead, or ask the user.`
