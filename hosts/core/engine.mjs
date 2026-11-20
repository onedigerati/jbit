// A shim of the engine surface `plugins/jbit/hooks/register.ts` uses, for a host that runs the hook as a command: one
// process per event, so state lives in a JSON file per session under the host's plugin data folder.
import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { access, lstat, mkdir, readFile, realpath, rename, stat, writeFile } from 'node:fs/promises'
import { isAbsolute, join, resolve } from 'node:path'

/** A file name for a session id: kept when plain, hashed otherwise, so an id never walks out of the folder. */
export function sessionFile(sessionId) {
  const id = typeof sessionId === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(sessionId) ? sessionId : `h-${createHash('sha256').update(String(sessionId)).digest('hex').slice(0, 32)}`
  return `${id}.json`
}

/** A JSON map on disk: every read goes to the file, every write is read-modify-write and lands by rename. */
function jsonFile(path) {
  const load = async () => {
    let text
    try {
      text = await readFile(path, 'utf8')
    } catch (err) {
      if (err.code === 'ENOENT') return { values: {}, versions: {} }
      throw err
    }
    const data = JSON.parse(text)
    return { values: data.values ?? {}, versions: data.versions ?? {} }
  }
  const save = async data => {
    const tmp = `${path}.${process.pid}.${Date.now()}.tmp`
    await writeFile(tmp, JSON.stringify(data), { mode: 0o600 })
    await rename(tmp, path)
  }
  return {
    load,
    async get(key) {
      const d = await load()
      return { value: d.values[key], version: d.versions[key] ?? 0 }
    },
    async set(key, value) {
      const d = await load()
      let version
      if (value === undefined) {
        version = (d.versions[key] ?? 0) + 1
        delete d.values[key]
        delete d.versions[key]
      } else {
        d.values[key] = value
        version = d.versions[key] = (d.versions[key] ?? 0) + 1
      }
      await save(d)
      return version
    },
    /** Keeps the newest `keep` keys starting with `prefix` (insertion order), dropping the rest. */
    async prune(prefix, keep) {
      const d = await load()
      const keys = Object.keys(d.values).filter(k => k.startsWith(prefix))
      if (keys.length <= keep) return
      for (const k of keys.slice(0, keys.length - keep)) {
        delete d.values[k]
        delete d.versions[k]
      }
      await save(d)
    },
  }
}

const refKey = ref => `${ref.plugin}:${ref.key}${ref.id !== undefined ? `:${ref.id}` : ''}`

const GIT_TIMEOUT_MS = 15000
/** The most git output a check reads; JBIT_HOOK_MAX_OUTPUT lowers it (tests). */
const MAX_OUTPUT = (() => {
  const n = Number(process.env.JBIT_HOOK_MAX_OUTPUT)
  return Number.isInteger(n) && n > 0 ? n : 64 * 1024 * 1024
})()

/**
 * The engine for one hook call. `projectDir` is the project's real path; `dataDir` the plugin's data folder.
 * What the handlers say to the person (`ui.notify`, `ui.toast`) and the prompts they submit are collected in `out`.
 */
export async function createEngine({ projectDir, dataDir, sessionId, now = () => Date.now() }) {
  if (typeof dataDir !== 'string' || !dataDir) throw new Error('no plugin data folder')
  const sessions = join(dataDir, 'sessions')
  await mkdir(sessions, { recursive: true, mode: 0o700 })
  const state = jsonFile(join(sessions, sessionFile(sessionId)))
  const store = jsonFile(join(dataDir, 'store.json'))
  // a broken state file is a crash, not an empty session: the adapter fails closed on it
  await state.load()

  const out = { notices: [], toasts: [], status: undefined, prompts: [], timers: [] }
  const at = path => {
    if (typeof path !== 'string') throw new TypeError('path must be a string')
    return isAbsolute(path) ? resolve(path) : resolve(projectDir, path)
  }

  const $ = {
    state: {
      get: ref => state.get(refKey(ref)),
      set: async (ref, value) => ({ isSet: true, version: await state.set(refKey(ref), value) }),
    },
    store: {
      get: async key => (await store.get(`store:${key}`)).value,
      set: async (key, value) => void (await store.set(`store:${key}`, value)),
      delete: async key => void (await store.set(`store:${key}`, undefined)),
      keys: async () => Object.keys((await store.load()).values).map(k => k.slice('store:'.length)),
    },
    fs: {
      read: path => readFile(at(path), 'utf8'),
      exists: path =>
        access(at(path)).then(
          () => true,
          () => false,
        ),
      async stat(path, options) {
        const p = at(path)
        const [s, l] = await Promise.all([stat(p), lstat(p)])
        const kind = s.isFile() ? 'file' : s.isDirectory() ? 'dir' : 'other'
        return { kind, size: s.size, mtimeMs: s.mtimeMs, isLink: l.isSymbolicLink(), ...(options?.resolve ? { realPath: await realpath(p) } : {}) }
      },
    },
    session: {
      cwd: async () => {
        if (!projectDir) throw new Error('no project directory')
        return projectDir
      },
      id: async () => sessionId,
      // the host gives no context gauge: a 0% fill never asks autopilot to compact
      usage: async () => ({ context: { percent: 0, tokens: 0, window: 0 } }),
      compact: async () => ({ skip: 'unsupported' }),
    },
    ui: {
      notify: async text => {
        if (typeof text === 'string' && text) out.notices.push(text)
      },
      toast: text => {
        if (typeof text === 'string' && text) out.toasts.push(text)
      },
      status: text => {
        out.status = text
      },
    },
    settings: { read: async () => ({}) },
    prompt: {
      submit: async request => {
        if (request && typeof request.text === 'string') out.prompts.push(request.text)
        return {}
      },
    },
    // only git: the handlers run nothing else, and nothing else should run from a hook
    process: {
      run: (argv, init = {}) =>
        new Promise((done, fail) => {
          if (!Array.isArray(argv) || argv[0] !== 'git') return done({ exitCode: 127, stdout: '', stderr: 'only git runs here', isStdoutTruncated: false, isStderrTruncated: false })
          execFile(
            'git',
            argv.slice(1),
            { cwd: init.cwd ? at(init.cwd) : projectDir, encoding: 'utf8', maxBuffer: MAX_OUTPUT, timeout: GIT_TIMEOUT_MS, env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_OPTIONAL_LOCKS: '0' } },
            (err, stdout, stderr) => {
              // output cut short or a git that hung is no answer: the check can't stand aside on it, so the whole call fails
              if (err && (err.code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER' || err.killed || err.signal)) {
                const why = err.code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER' ? 'its output was too large to read' : 'it took too long'
                out.fatal ??= `JBIT blocked this call: its check couldn't finish reading the repository with git (\`git ${String(argv[1] ?? '')}\`: ${why}), and a check that can't finish doesn't let the call through. Commit in smaller parts, or ask the user.`
                return fail(new Error(out.fatal))
              }
              const exitCode = err ? (typeof err.code === 'number' ? err.code : 1) : 0
              done({ exitCode, stdout: stdout ?? '', stderr: stderr ?? String(err?.message ?? ''), isStdoutTruncated: false, isStderrTruncated: false })
            },
          )
        }),
    },
    // a timer runs once the handlers settle, with no wait: the hook process ends with the event
    clock: {
      now: async () => now(),
      after: (ms, fn) => {
        out.timers.push(fn)
        return { cancel() {} }
      },
    },
    // the host lists no agents to a hook
    agent: { list: async () => [] },
  }

  /** The adapter's own keys, beside the handlers' in the same session file. */
  const host = {
    get: async key => (await state.get(`host:${key}`)).value,
    set: (key, value) => state.set(`host:${key}`, value),
    prune: (prefix, keep) => state.prune(`host:${prefix}`, keep),
  }
  return { $, out, host }
}

/**
 * A throwaway engine on an in-memory project: nothing it does reaches disk, git or the person. The core uses it to put
 * the hook module's per-process memory back as an earlier event left it (`prime` in dispatch.mjs).
 */
export function memoryEngine(files = {}) {
  const state = new Map()
  const read = async path => {
    const key = String(path).replace(/^\/memory\//, '')
    if (!(key in files)) throw Object.assign(new Error(`ENOENT: ${path}`), { code: 'ENOENT' })
    return files[key]
  }
  const out = { notices: [], toasts: [], status: undefined, prompts: [], timers: [] }
  const $ = {
    state: {
      get: async ref => ({ value: state.get(refKey(ref)), version: 0 }),
      set: async (ref, value) => (state.set(refKey(ref), value), { isSet: true, version: 0 }),
    },
    store: { get: async () => undefined, set: async () => {}, delete: async () => {}, keys: async () => [] },
    fs: {
      read,
      exists: async path => String(path).replace(/^\/memory\//, '') in files,
      stat: async path => {
        const text = await read(path)
        return { kind: 'file', size: text.length, mtimeMs: 0, isLink: false, realPath: `/memory/${String(path).replace(/^\/memory\//, '')}` }
      },
    },
    session: { cwd: async () => '/memory', id: async () => 'memory', usage: async () => ({ context: { percent: 0 } }), compact: async () => ({ skip: 'unsupported' }) },
    ui: { notify: async () => {}, toast: () => {}, status: () => {} },
    settings: { read: async () => ({}) },
    prompt: { submit: async () => ({}) },
    process: { run: async () => ({ exitCode: 1, stdout: '', stderr: 'no git here', isStdoutTruncated: false, isStderrTruncated: false }) },
    clock: { now: async () => 0, after: () => ({ cancel() {} }) },
    agent: { list: async () => [] },
  }
  return { $, out }
}
