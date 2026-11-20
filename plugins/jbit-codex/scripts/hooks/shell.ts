/**
 * Just enough shell parsing to tell what a Bash command line will do to git and the outside world:
 * words with quotes and escapes, command separators, `cd`, substitutions, heredoc bodies and redirections.
 *
 * It is a guardrail against an agent pushing by mistake, not a sandbox against one set on hiding it: where the
 * parser can't be sure what runs, it leans toward reporting a command, but a push from inside a script or an
 * interpreter is out of its sight.
 */

/**
 * One simple command: its words, and the directory it runs in (relative to the session's, `null` if unknowable).
 * `opaque` marks a command the parser can't see into (nested past its depth, a script read from standard input, a
 * command read from input or built at run time where it matters), which nothing can vouch for; `why` says which.
 * `dynamic` marks a command whose name, or `eval`/`-c` string, is built at run time (`$c`, `$(…) push`): it counts only
 * when the line names an outward command somewhere other than as a plain command's name, and `mentions` lists those
 * names (bare words of the line, less one per plain command head).
 */
export interface Command {
  words: string[]
  dir: string | null
  opaque?: true
  why?: string
  dynamic?: true
  mentions?: string[]
  /** The files its output redirections name (`> out.txt`, `>> docs/PLAN.md`, `&> log`, `<> f`), as written; `< in` is a read and isn't one. */
  targets?: string[]
  /** The text a heredoc or here-string feeds it, when it is the command the redirection was written on. */
  input?: string
  /** Its standard input is the previous command's output (`a | b`, `a |& b`). */
  fed?: true
  /**
   * Its words that may split or change before it runs: an unquoted variable expansion (`$URL`, `x${A}`), or an unquoted
   * glob or brace (`*`, `?`, `[`, `{a,b}`) in a word not led by a literal `http(s)://`. Each may become several words, flags among them.
   */
  unquoted?: string[]
  /** The line sets, before it or on it, a variable that changes where curl or wget read their config or which proxy they use (`HOME=.`, `https_proxy=…`). */
  configEnv?: true
  /**
   * Variables the line assigns, before it or on it, other than a literal http(s) URL: `text` (`X=-T/etc/passwd`), or
   * `computed` from a substitution, another variable or input (`S=$(cat f)`, `read -r x`).
   */
  assigned?: Record<string, 'text' | 'computed'>
}

/** How deep `bash -c`, `eval`, `watch` and `$(…)` strings are followed; past it a command is `opaque`. */
const MAX_DEPTH = 6
/** How deep substitutions are scanned for their end within one string; past it the rest of the string is one opaque command. */
const SCAN_DEPTH = 64

export const DEEP = 'a command nested too deep to check'
export const BUILT = 'a command built at run time'
export const STDIN = 'a shell reading its script from standard input'
export const FROM_INPUT = 'a command read from input'
export const ALIAS = 'a git alias set on the command line'

/**
 * Splits a command line into simple commands, following `cd` so each knows where it runs. Shell grouping and
 * keywords (`{ … }`, `if … then`, `! …`, `do …`, `case` patterns), wrappers with their options (`sudo -u bob`,
 * `timeout 60`, `xargs -n1`, `find -exec`), and the strings `sh -c`, `eval`, `trap`, `watch`, command and process
 * substitution and unquoted heredoc bodies run are looked through, so the commands that actually run are the ones
 * returned. Where a wrapper's option might take a value the parser can't be sure of, both readings are returned: a
 * guard that sees an extra command pauses, one that misses a command lets it through.
 */
export function parseCommands(line: string): Command[] {
  const commands = parseLine(line, '.', 0)
  if (commands.some(c => c.dynamic)) {
    const mentions = mentionsOf(line, commands)
    for (const c of commands) if (c.dynamic) c.mentions = mentions
  }
  return commands
}

/** The bare names a line holds beyond its plain commands' heads: each word's last path part, less one per head. */
function mentionsOf(line: string, commands: Command[]): string[] {
  const count = new Map<string, number>()
  for (const token of line.match(/[^\s'"`;&|()<>$={}\\,]+/g) ?? []) {
    const name = bare(token)
    count.set(name, (count.get(name) ?? 0) + 1)
  }
  // each distinct command once: a substitution `eval` reads twice still names its head once
  const seen = new Set<string>()
  for (const c of commands) {
    if (c.dynamic || c.opaque || !c.words.length) continue
    const key = `${c.dir}\0${c.words.join('\0')}`
    if (seen.has(key)) continue
    seen.add(key)
    const name = bare(c.words[0] ?? '')
    const n = count.get(name)
    if (n !== undefined) count.set(name, n - 1)
  }
  return [...count].filter(([, n]) => n > 0).map(([name]) => name)
}

function parseLine(line: string, start: string | null, depth: number): Command[] {
  return parseRecords(scanList(line, 0, false, 0, { dyn: new Set(), bare: new Set() }).recs, start, depth)
}

function parseRecords(recs: Rec[], start: string | null, depth: number): Command[] {
  const commands: Command[] = []
  let dir: string | null = start
  // once the line assigns a config or proxy variable (`HOME=.`, `export https_proxy=…`, `env CURL_HOME=.`), every command from there on may see it
  let configEnv = false
  const assigned: Record<string, 'text' | 'computed'> = {}
  for (const rec of recs) {
    configEnv ||= rec.words.some(w => CONFIG_ENV.test(w))
    for (const w of rec.words) {
      const m = /^([A-Za-z_][A-Za-z0-9_]*)\+?=(.*)$/s.exec(w)
      if (!m) continue
      const value = m[2] ?? ''
      if (/[$`]/.test(value)) assigned[m[1] ?? ''] = 'computed'
      else if (!/^https?:\/\//i.test(value)) assigned[m[1] ?? ''] = 'text'
      else delete assigned[m[1] ?? '']
    }
    // `read x`, `mapfile a`: a value from input
    const head = stripLeading(rec.words)
    if (['read', 'mapfile', 'readarray'].includes(head[0] ?? ''))
      for (const w of head.slice(1)) if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(w)) assigned[w] = 'computed'
    if (rec.opaque) {
      commands.push({ words: rec.words, dir, opaque: true, why: DEEP })
      continue
    }
    for (const sub of rec.subs) commands.push(...nestedRecs(sub, rec.words, dir, depth))
    for (const cmd of expand(rec.words, dir, depth, rec)) {
      if (rec.targets) cmd.targets = rec.targets
      // a heredoc's text belongs to the command it was written on, not to the commands a shell reading it runs
      if (rec.stdin !== undefined && cmd.words.every(w => rec.words.includes(w))) cmd.input = rec.stdin
      if (rec.fed) cmd.fed = true
      const loose = rec.bare?.size ? cmd.words.filter(w => rec.bare?.has(w)) : []
      if (loose.length) cmd.unquoted = loose
      if (configEnv) cmd.configEnv = true
      if (Object.keys(assigned).length) cmd.assigned = { ...assigned }
      const w = cmd.words
      if (!cmd.opaque && !cmd.dynamic && (w[0] === 'cd' || w[0] === 'pushd')) {
        const target = w.slice(1).find(a => !a.startsWith('-'))
        // a target built at run time (`cd "$(git rev-parse --show-toplevel)"`) is somewhere unknown
        const unknown = target === undefined || target.startsWith('~') || target === '-' || /[$`]/.test(target)
        dir = unknown || dir === null ? null : joinPath(dir, target)
        continue
      }
      commands.push(cmd)
    }
  }
  return commands
}

const opaque = (words: string[], dir: string | null, why = DEEP): Command => ({ words, dir, opaque: true, why })

/** The commands a string a shell will run holds, or one opaque command past the depth limit. */
function nested(text: string, words: string[], dir: string | null, depth: number): Command[] {
  return depth + 1 < MAX_DEPTH ? parseLine(text, dir, depth + 1) : [opaque(words.length ? words : [text], dir)]
}

/** The commands a substitution's body holds, likewise. */
function nestedRecs(recs: Rec[], words: string[], dir: string | null, depth: number): Command[] {
  return depth + 1 < MAX_DEPTH ? parseRecords(recs, dir, depth + 1) : [opaque(words.length ? words : ['$(…)'], dir)]
}

/** `a/b` + `../c` → `a/c`; an absolute right side wins. */
export function joinPath(base: string, rel: string): string {
  const absolute = rel.startsWith('/') || (base.startsWith('/') && !rel.startsWith('/'))
  const parts: string[] = []
  for (const p of [...(rel.startsWith('/') ? [] : base.split('/')), ...rel.split('/')]) {
    if (p === '' || p === '.') continue
    if (p === '..' && parts.length && parts[parts.length - 1] !== '..') parts.pop()
    else if (p !== '..' || !absolute) parts.push(p)
  }
  return absolute ? `/${parts.join('/')}` : parts.join('/') || '.'
}

const ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*\+?=/

/** Variables that move curl's or wget's config file or route their requests through a proxy. */
const CONFIG_ENV = /^(?:CURL_HOME|XDG_CONFIG_HOME|HOME|WGETRC|SYSTEM_WGETRC|[A-Za-z0-9]*_proxy)\+?=/i

/** Shell keywords and grouping that can lead a simple command without being it. */
const KEYWORDS = new Set(['{', '}', '!', 'if', 'then', 'elif', 'else', 'fi', 'do', 'done', 'while', 'until', 'in', 'esac'])
/** Keywords whose whole command is a header (`for x in a b`, `case $x in`), never a command that runs. */
const HEADERS = new Set(['for', 'select', 'case'])

/** Drops leading `VAR=value` assignments and shell keywords (and `coproc NAME {`); a `for`/`select`/`case` header is no command at all. */
function stripLeading(words: string[]): string[] {
  let i = 0
  while (i < words.length) {
    const w = words[i] ?? ''
    if (ASSIGNMENT.test(w) || KEYWORDS.has(w)) i++
    else if (w === 'coproc') i += words[i + 2] === '{' ? 2 : 1
    else if (w === 'function') i += 2
    else if (HEADERS.has(w)) return []
    else break
  }
  return words.slice(i)
}

/**
 * A command that runs the rest of its words as another command. `value`: short options that take a value; `flags`:
 * short options that don't; any other short option, or a long one not listed, might take one, so both readings are
 * kept. `positional`: words before the command (`timeout DURATION`). `split`: options whose value is itself
 * words of the command (`env -S`). `join`: the command is the rest joined into a shell string (`watch`), up to a
 * `stop` word (`parallel … ::: args`). `input`: the command may take words from standard input (`xargs`, `parallel`).
 */
interface Wrapper {
  value?: string
  flags?: string
  long?: string[]
  longFlags?: string[]
  positional?: number
  split?: string
  splitLong?: string
  join?: boolean
  stop?: string[]
  input?: boolean
}

const WRAPPERS: Record<string, Wrapper> = {
  sudo: {
    value: 'ugCDprtUTR',
    flags: 'AbBEeHiKklnNPSsVv',
    long: ['user', 'group', 'close-from', 'chdir', 'prompt', 'role', 'type', 'other-user', 'command-timeout', 'host'],
    longFlags: ['askpass', 'background', 'bell', 'preserve-env', 'edit', 'set-home', 'login', 'remove-timestamp', 'reset-timestamp', 'non-interactive', 'preserve-groups', 'stdin', 'shell', 'validate', 'list', 'no-update'],
  },
  doas: { value: 'uC', flags: 'nsL' },
  pkexec: { long: ['user'], longFlags: ['disable-internal-agent', 'keep-cwd'] },
  env: { value: 'uCS', flags: 'i0v', long: ['unset', 'chdir', 'split-string'], longFlags: ['ignore-environment', 'null', 'debug'], split: 'S', splitLong: 'split-string' },
  nice: { value: 'n', long: ['adjustment'] },
  exec: { value: 'a', flags: 'cl' },
  timeout: { value: 'ks', flags: 'fpv', long: ['kill-after', 'signal'], longFlags: ['foreground', 'preserve-status', 'verbose'], positional: 1 },
  xargs: {
    value: 'adEILnPs',
    flags: '0eilloprtx',
    long: ['arg-file', 'delimiter', 'max-args', 'max-procs', 'max-chars', 'process-slot-var'],
    longFlags: ['null', 'open-tty', 'interactive', 'no-run-if-empty', 'verbose', 'exit', 'show-limits', 'replace', 'max-lines', 'eof'],
    input: true,
  },
  parallel: {
    value: 'jaIdEnNsSlLP',
    flags: 'kvqueX0rgmDH',
    long: ['jobs', 'arg-file', 'delimiter', 'max-args', 'sshlogin', 'joblog', 'results', 'tmpdir', 'timeout', 'delay', 'colsep', 'max-procs'],
    longFlags: ['keep-order', 'verbose', 'quiet', 'ungroup', 'group', 'line-buffer', 'null', 'tag', 'dry-run', 'halt-on-error', 'progress', 'bar', 'eta', 'xargs', 'will-cite'],
    join: true,
    stop: [':::', '::::', ':::+', '::::+'],
    input: true,
  },
  stdbuf: { value: 'ioe', long: ['input', 'output', 'error'] },
  watch: { value: 'nq', flags: 'bcdegprtwx', long: ['interval', 'equexit'], longFlags: ['beep', 'color', 'no-color', 'differences', 'errexit', 'chgexit', 'precise', 'no-title', 'no-wrap', 'exec', 'no-rerun'], join: true },
  nohup: {},
  setsid: { flags: 'cfw' },
  unbuffer: { flags: 'p' },
  time: { value: 'fo', flags: 'apqv', long: ['format', 'output'], longFlags: ['append', 'portability', 'quiet', 'verbose'] },
  command: { flags: 'pvV' },
  builtin: {},
  ionice: { value: 'cnpPu', flags: 't', long: ['class', 'classdata', 'pid', 'pgid', 'uid'], longFlags: ['ignore'] },
  chrt: { value: 'TPD', flags: 'abdfimopRrv', positional: 1 },
  taskset: { flags: 'acp', positional: 1 },
  caffeinate: { value: 'tw', flags: 'dimsu' },
  busybox: {},
  flock: { value: 'wE', flags: 'sxunoFh', long: ['timeout', 'wait', 'conflict-exit-code'], longFlags: ['shared', 'exclusive', 'unlock', 'nonblock', 'nb', 'close', 'no-fork', 'verbose', 'help'], positional: 1 },
  runuser: { value: 'ugGsw', flags: 'lmpfP', long: ['user', 'group', 'supp-group', 'shell', 'whitelist-environment'], longFlags: ['login', 'preserve-environment', 'pty', 'fast'] },
  strace: { value: 'eoOpPsSuIXEbaU', flags: 'cCdDfFhiqrtTvVwxyzkZn', long: ['output', 'trace', 'signal', 'user', 'env', 'attach', 'string-limit', 'columns', 'status', 'quiet'], longFlags: ['follow-forks', 'summary-only', 'summary', 'output-separately'] },
  ltrace: { value: 'aeEnoplLsuxXwFAD', flags: 'bcCfhiStTrV', long: ['output', 'library', 'align', 'indent', 'user'], longFlags: ['demangle', 'help', 'version'] },
  valgrind: { flags: 'qvhd', longFlags: ['help', 'version', 'quiet', 'verbose', 'trace-children'] },
  'ssh-agent': { value: 'aEPt', flags: 'cDdksx' },
  'dbus-run-session': { long: ['config-file', 'dbus-daemon'] },
}

/**
 * Commands that take a shell string as an option's value (`su -c STR`, `flock FILE -c STR`, `nix-shell --run STR`,
 * `npx -c STR`): `short`/`long` name the option, `value` the other short options that take a value, `positional`
 * how many plain words may come before it (past that, the rest is a command, not options), `combine` whether the
 * option may end a cluster (`su -lc STR`).
 */
interface StringOption {
  short?: string
  long: string[]
  value?: string
  positional: number
  combine?: boolean
}

const STRING_OPTIONS: Record<string, StringOption> = {
  su: { short: 'c', long: ['command', 'session-command'], value: 'sgGw', positional: Infinity, combine: true },
  runuser: { short: 'c', long: ['command', 'session-command'], value: 'ugGsw', positional: 1, combine: true },
  script: { short: 'c', long: ['command'], value: 'IOBTEm', positional: Infinity },
  flock: { short: 'c', long: ['command'], value: 'wE', positional: 1 },
  'nix-shell': { long: ['run', 'command'], value: 'pAIE', positional: Infinity },
  npx: { short: 'c', long: ['call'], value: 'p', positional: 0 },
}

/** The shell string a `StringOption` command was given, or undefined. */
function stringOption(spec: StringOption, words: string[]): string | undefined {
  let plain = 0
  for (let i = 1; i < words.length; i++) {
    const a = words[i] ?? ''
    if (a === '--') return undefined
    if (!a.startsWith('-') || a === '-') {
      if (++plain > spec.positional) return undefined
      continue
    }
    if (a.startsWith('--')) {
      const eq = a.indexOf('=')
      const name = a.slice(2, eq < 0 ? undefined : eq)
      if (spec.long.includes(name)) return eq < 0 ? words[i + 1] : a.slice(eq + 1)
      continue
    }
    if (spec.short && (a === `-${spec.short}` || (spec.combine && /^-[A-Za-z]+$/.test(a) && a.endsWith(spec.short)))) return words[i + 1]
    if (spec.value?.includes(a[a.length - 1] ?? '') && a.length === 2) i++
  }
  return undefined
}

/** Shells whose `-c` string, or script argument, is what runs. */
const SHELLS = new Set(['sh', 'bash', 'zsh', 'dash', 'ksh', 'mksh', 'ash', 'fish'])

/** A script path that is standard input. */
const STDIN_PATH = /^(?:\/dev\/stdin|\/dev\/fd\/0|\/proc\/self\/fd\/0)$/
/** A script path that is another command's output: a process substitution or an open descriptor. */
const PIPED_PATH = /^(?:[<>]\(|\/dev\/fd\/|\/proc\/self\/fd\/)/
/** A string that is nothing but one variable: nothing in it can be read before it runs. */
const WHOLE_VARIABLE = /^\$(?:\{[^}]*\}|[A-Za-z_][A-Za-z0-9_]*|[0-9@*])$/

/**
 * A wrapper's options read one way: where its command starts, and any `env -S` words. `greedy` reads an option the
 * table doesn't know as taking a value; `unsure` says whether such an option was seen, so the other reading matters.
 */
function wrapped(spec: Wrapper, words: string[], greedy: boolean): { at: number; split?: string; unsure: boolean } {
  let i = 1
  let unsure = false
  let split: string | undefined
  while (i < words.length) {
    const a = words[i] ?? ''
    if (a === '--') {
      i++
      break
    }
    if (!a.startsWith('-') || a === '-') break
    if (/^-\d+$/.test(a)) {
      i++
      continue
    }
    if (a.startsWith('--')) {
      const eq = a.indexOf('=')
      const name = a.slice(2, eq < 0 ? undefined : eq)
      let value = eq < 0 ? undefined : a.slice(eq + 1)
      if (spec.long?.includes(name)) {
        if (value === undefined) value = words[++i]
      } else if (eq < 0 && !spec.longFlags?.includes(name)) {
        unsure = true
        if (greedy) i++
      }
      if (name === spec.splitLong) split = value
      i++
      continue
    }
    for (let j = 1; j < a.length; j++) {
      const c = a[j] ?? ''
      if (spec.value?.includes(c)) {
        const value = j < a.length - 1 ? a.slice(j + 1) : words[++i]
        if (spec.split?.includes(c)) split = value
        break
      }
      if (!spec.flags?.includes(c)) {
        unsure = true
        if (greedy) {
          if (j === a.length - 1) i++
          break
        }
      }
    }
    i++
  }
  return { at: i + (spec.positional ?? 0), split, unsure }
}

/** The text `xargs` replaces with input in its command (`-I R`, `-i`, `--replace`), `{}` by default. */
function replaceString(words: string[]): string {
  for (let i = 1; i < words.length; i++) {
    const a = words[i] ?? ''
    if (a === '-I') return words[i + 1] || '{}'
    if (a.startsWith('-I')) return a.slice(2)
    if (a.startsWith('--replace=')) return a.slice(10) || '{}'
    if (!a.startsWith('-')) break
  }
  return '{}'
}

/**
 * Where a shell's `-c` string or script is, whether it's a `-c` string, and whether the shell reads its script from
 * standard input (`-s`, or no script at all); `at` is -1 when no word follows the options.
 */
function shellArg(words: string[]): { at: number; string: boolean; stdin: boolean } {
  let i = 1
  let string = false
  let stdin = false
  while (i < words.length) {
    const a = words[i] ?? ''
    if (a === '--' || a === '-') {
      i++
      break
    }
    if (!/^[-+]./.test(a)) break
    if (a.startsWith('--')) {
      if (a === '--rcfile' || a === '--init-file') i++
    } else {
      if (a.startsWith('-') && a.includes('c')) string = true
      if (a.startsWith('-') && a.includes('s')) stdin = true
      if (/[oO]$/.test(a)) i++
    }
    i++
  }
  const at = i < words.length ? i : -1
  return { at, string, stdin: !string && (stdin || at < 0) }
}

const bare = (w: string) => w.split('/').pop() ?? w
/** A table's own entry for a command name (never `constructor` or another inherited property). */
const own = <T>(table: Record<string, T>, name: string): T | undefined => (Object.hasOwn(table, name) ? table[name] : undefined)

/** Tools whose subcommand word decides whether they reach outside (`git push`, `npm publish`): a subcommand built at run time or read from input isn't checkable. */
const SUB_TOOLS = new Set([
  'git', 'gh', 'npm', 'pnpm', 'yarn', 'bun', 'cargo', 'twine', 'gem', 'poetry', 'uv', 'docker', 'podman', 'vercel', 'netlify',
  'fly', 'flyctl', 'firebase', 'serverless', 'sls', 'wrangler', 'railway', 'cdk', 'terraform', 'tofu', 'pulumi', 'kubectl', 'helm',
])

/** Every command the built-in check knows by name: a line that names one beside a command built at run time is held. */
export const OUTWARD_TOOLS = new Set([...SUB_TOOLS, 'gcloud', 'az', 'aws', 'curl', 'wget'])

const FIND_EXEC = new Set(['-exec', '-execdir', '-ok', '-okdir'])

/** The commands one split command runs, looking through keywords, wrappers and shells (both readings of an unsure wrapper). */
function expand(words: string[], dir: string | null, depth: number, rec: Rec): Command[] {
  const out: Command[] = []
  const isDyn = (x: string | undefined) => x !== undefined && rec.dyn.has(x)
  const deeper = (ws: string[]) => (depth + 1 < MAX_DEPTH ? expand(ws, dir, depth + 1, rec) : [opaque(ws, dir)])
  /** A string a shell runs: parsed; one built at run time also leaves a `dynamic` marker, and one that is only a variable is opaque. */
  const shellString = (text: string, dyn: boolean, w: string[]): Command[] => {
    if (dyn && WHOLE_VARIABLE.test(text.trim())) return [opaque(w, dir, BUILT)]
    return [...(dyn ? [{ words: w, dir, dynamic: true as const }] : []), ...nested(text, w, dir, depth)]
  }
  /** A shell reading its script from standard input: the heredoc or here-string that feeds it, else nothing to read. */
  const fromStdin = (w: string[], input: string | undefined): Command[] =>
    input === undefined && rec.stdin !== undefined ? nested(rec.stdin, w, dir, depth) : [opaque(w, dir, input === undefined ? STDIN : FROM_INPUT)]

  let w = words
  // what `xargs` or `parallel` replaces with input, once the command runs under one
  let input: string | undefined
  for (let step = 0; ; step++) {
    // a run of wrappers too long to follow is nothing the parser can vouch for
    if (step === 64) return [opaque(w, dir), ...out]
    w = stripLeading(w)
    if (!w.length) return out
    const head = w[0] ?? ''
    if (input !== undefined && head.includes(input)) return [...out, opaque(w, dir, FROM_INPUT)]
    if (isDyn(head)) return [...out, { words: w, dir, dynamic: true }]
    const name = bare(head)
    if (name === 'eval') return [...out, ...shellString(w.slice(1).join(' '), w.slice(1).some(isDyn), w)]
    if (name === 'trap') {
      // `trap STRING SIGNAL…` runs STRING later; `trap -p`, `trap - INT` and `trap INT` run nothing
      const at = w[1] === '--' ? 2 : 1
      const action = w[at]
      if (action === undefined || w.length - at < 2 || action === '-' || /^-[pl]+$/.test(action)) return out
      return [...out, ...shellString(action, isDyn(action), w)]
    }
    if (name === 'find') {
      // `find … -exec CMD … ;` (or `{} +`) runs CMD
      const found: Command[] = [{ words: w, dir }]
      for (let i = 1; i < w.length; i++) {
        if (!FIND_EXEC.has(w[i] ?? '')) continue
        let j = i + 1
        while (j < w.length && w[j] !== ';' && !(w[j] === '+' && w[j - 1] === '{}')) j++
        if (j > i + 1) found.push(...deeper(w.slice(i + 1, j)))
        i = j
      }
      return [...out, ...found]
    }
    if (SHELLS.has(name) || name === 'source' || name === '.') {
      const arg = SHELLS.has(name) ? shellArg(w) : { at: w.length > 1 ? 1 : -1, string: false, stdin: false }
      if (arg.stdin) return [...out, ...fromStdin(w, input)]
      if (arg.at < 0) break
      const target = w[arg.at] ?? ''
      if (input !== undefined && target.includes(input)) return [...out, opaque(w, dir, FROM_INPUT)]
      if (arg.string) return [...out, ...shellString(target, isDyn(target), w)]
      if (STDIN_PATH.test(target)) return [...out, ...fromStdin(w, input)]
      if (PIPED_PATH.test(target)) return [...out, opaque(w, dir, STDIN)]
      if (isDyn(target)) return [...out, { words: w, dir, dynamic: true }]
      // a script: a bare name is a file in the directory before it is one on PATH
      w = [target.includes('/') ? target : `./${target}`, ...w.slice(arg.at + 1)]
      break
    }
    const runner = name === 'npm' && (w[1] === 'exec' || w[1] === 'x') ? STRING_OPTIONS.npx : own(STRING_OPTIONS, name)
    if (runner) {
      const text = stringOption(runner, name === 'npm' ? w.slice(1) : w)
      if (text !== undefined) return [...out, ...shellString(text, isDyn(text), w)]
    }
    const spec = own(WRAPPERS, name)
    if (!spec) break
    const read = wrapped(spec, w, false)
    if (read.unsure) {
      const other = wrapped(spec, w, true)
      if (other.at !== read.at) out.push(...deeper(w.slice(other.at)))
    }
    let rest = w.slice(read.at)
    if (spec.input) input = name === 'xargs' ? replaceString(w) : '{'
    if (spec.join) {
      const stop = spec.stop ? rest.findIndex(x => spec.stop?.includes(x)) : -1
      if (stop >= 0) rest = rest.slice(0, stop)
      // `parallel` with no command runs the lines of its input
      if (!rest.length) return spec.input ? [...out, opaque(w, dir, FROM_INPUT)] : out
      const ran = nested(rest.join(' '), w, dir, depth)
      if (spec.input && ran.some(c => /\{[^}\s]*\}/.test(c.words[0] ?? ''))) return [...out, opaque(w, dir, FROM_INPUT)]
      return [...out, ...ran]
    }
    w = read.split !== undefined ? [...read.split.split(/\s+/).filter(Boolean), ...rest] : rest
  }
  // a tool whose subcommand decides, with that subcommand built at run time or taken from input
  if (SUB_TOOLS.has(bare(w[0] ?? ''))) {
    // past options, and past a word right after an option, which may be its value (`kubectl -n "$NS" get`)
    const sub = bare(w[0] ?? '') === 'git' ? gitCall({ words: w, dir })?.sub : w.slice(1).find((a, k) => !a.startsWith('-') && !/^-[A-Za-z]$|^--[^=]+$/.test(w[k] ?? ''))
    if (input !== undefined && (sub === undefined || sub.includes(input))) return [opaque(w, dir, FROM_INPUT), ...out]
    if (isDyn(sub)) return [opaque(w, dir, BUILT), ...out]
  }
  return [{ words: w, dir }, ...out]
}

/**
 * One simple command as scanned: its words (quotes removed; variables and substitutions kept as written), the
 * substitutions in it, already scanned, which run before it does, and the text its heredoc or here-string feeds it.
 * `dyn` holds the words that had an expansion in them (shared by everything scanned from one string); `opaque`
 * marks the rest of a string nested too deep to scan.
 */
interface Rec {
  words: string[]
  subs: Rec[][]
  stdin?: string
  /** The targets of its redirections. */
  targets?: string[]
  dyn: Set<string>
  opaque?: true
  /** A heredoc of this command's body is still to be read. */
  waiting?: true
  /** Its standard input is the previous command's output. */
  fed?: true
  /** The words that had an unquoted expansion in them (shared like `dyn`). */
  bare?: Set<string>
}

interface Scan {
  dyn: Set<string>
  /** Words with an unquoted `$VAR` or `${…}` in them. */
  bare?: Set<string>
}

/** The commands in the `$(…)` or `<(…)` body starting at `i`, and where it ends (after its `)`); too deep, the rest is opaque. */
function substitution(s: string, i: number, level: number, scan: Scan): { recs: Rec[]; end: number } {
  if (level + 1 >= SCAN_DEPTH) return { recs: [{ words: [s.slice(i)], subs: [], dyn: scan.dyn, opaque: true }], end: s.length }
  return scanList(s, i, true, level + 1, scan)
}

/** The backtick substitution starting at `i`: its commands, and where it ends. */
function backtick(s: string, i: number, level: number, scan: Scan): { recs: Rec[]; end: number } {
  let end = i + 1
  let body = ''
  while (end < s.length && s[end] !== '`') {
    if (s[end] === '\\' && /[\\`$]/.test(s[end + 1] ?? '')) {
      body += s[end + 1]
      end += 2
    } else body += s[end++]
  }
  if (level + 1 >= SCAN_DEPTH) return { recs: [{ words: [body], subs: [], dyn: scan.dyn, opaque: true }], end: s.length }
  return { recs: scanList(body, 0, false, level + 1, scan).recs, end: Math.min(end + 1, s.length) }
}

/** The `${…}` starting at `i`: where it ends, with the substitutions inside it noted in `subs`. */
function braces(s: string, i: number, quoted: boolean, level: number, scan: Scan, subs: Rec[][]): number {
  let j = i + 2
  let depth = 1
  while (j < s.length) {
    const c = s[j]
    if (c === '\\') j += 2
    else if (c === '$' && s[j + 1] === '(') {
      const r = substitution(s, j + 2, level, scan)
      subs.push(r.recs)
      j = r.end
    } else if (c === '`') {
      const r = backtick(s, j, level, scan)
      subs.push(r.recs)
      j = r.end
    } else if (c === '$' && s[j + 1] === '{') {
      depth++
      j += 2
    } else if (c === '}') {
      j++
      if (--depth === 0) break
    } else if (c === "'" && !quoted) {
      const end = s.indexOf("'", j + 1)
      j = end < 0 ? s.length : end + 1
    } else j++
  }
  return Math.min(j, s.length)
}

const ANSI: Record<string, string> = { n: '\n', t: '\t', r: '\r', a: '\x07', b: '\b', e: '\x1b', E: '\x1b', f: '\f', v: '\v', '\\': '\\', "'": "'", '"': '"', '?': '?' }

/** The `$'…'` string whose body starts at `i`, its escapes decoded; returns the text and where it ends. */
function ansiC(s: string, i: number): { text: string; end: number } {
  let text = ''
  while (i < s.length && s[i] !== "'") {
    if (s[i] !== '\\' || i + 1 >= s.length) {
      text += s[i++]
      continue
    }
    const e = s[i + 1] ?? ''
    i += 2
    const digits = (re: RegExp, max: number) => {
      let d = ''
      while (d.length < max && re.test(s[i] ?? '')) d += s[i++]
      return d
    }
    if (e in ANSI) text += ANSI[e]
    else if (e === 'x' || e === 'u' || e === 'U') {
      const d = digits(/[0-9a-fA-F]/, e === 'x' ? 2 : e === 'u' ? 4 : 8)
      text += d ? String.fromCodePoint(Math.min(parseInt(d, 16), 0x10ffff)) : `\\${e}`
    } else if (/[0-7]/.test(e)) text += String.fromCharCode(parseInt(e + digits(/[0-7]/, 2), 8) & 0xff)
    else if (e === 'c' && i < s.length) text += String.fromCharCode((s[i++] ?? '').charCodeAt(0) & 0x1f)
    else text += `\\${e}`
  }
  return { text, end: i + 1 }
}

/** The substitutions an unquoted heredoc's body runs (`$(…)`, backticks, `${…}`), each scanned. */
function bodySubs(body: string, level: number, scan: Scan): Rec[][] {
  const subs: Rec[][] = []
  let j = 0
  while (j < body.length) {
    const c = body[j]
    if (c === '\\') j += 2
    else if (c === '$' && body[j + 1] === '(') {
      const r = substitution(body, j + 2, level, scan)
      subs.push(r.recs)
      j = r.end
    } else if (c === '$' && body[j + 1] === '{') j = braces(body, j, true, level, scan, subs)
    else if (c === '`') {
      const r = backtick(body, j, level, scan)
      subs.push(r.recs)
      j = r.end
    } else j++
  }
  return subs
}

/**
 * Tokenizes `s` from `i` into simple commands. Quotes (`'…'`, `"…"`, `$'…'`, `$"…"`), `\` and line continuations,
 * comments, redirections, heredocs and here-strings, `case` patterns, and `$(…)`, `<(…)`, `>(…)`, `${…}` and backtick
 * substitutions are handled (in double quotes too, and nested to any depth up to `SCAN_DEPTH`); globs and variables
 * are left as written. With `stop`, scanning is a substitution's body and ends at its unmatched `)`. Each character
 * is looked at once per level of substitution it sits in, so the scan is linear in the string.
 */
function scanList(s: string, i: number, stop: boolean, level: number, scan: Scan): { recs: Rec[]; end: number } {
  const recs: Rec[] = []
  const fresh = (): Rec => ({ words: [], subs: [], dyn: scan.dyn, bare: scan.bare })
  let rec = fresh()
  let word = ''
  let inWord = false
  let dynWord = false
  // the word has an unquoted variable expansion, so it may split into several
  let bareWord = false
  // the word has an unquoted glob or brace, so it may become several, unless a literal `http(s)://` leads it
  let globWord = false
  // the next word is a redirection's target, or a here-string's text
  let drop = false
  // the redirection being read writes (`>`, `>>`, `&>`, `<>`), so its target is kept
  let writes = false
  let here = false
  let parens = 0
  const heredocs: { tag: string; strip: boolean; quoted: boolean; rec: Rec }[] = []
  // open `case` statements: reading the subject, a pattern, or a clause's commands
  const cases: ('subject' | 'pattern' | 'body')[] = []
  // whether every word of the command so far is a keyword, so the next one leads it
  let leading = true
  const atStart = () => leading

  const endWord = () => {
    if (inWord) {
      if (here) {
        rec.stdin = word
        here = false
      } else if (drop) {
        if (writes) rec.targets = [...(rec.targets ?? []), word]
        drop = false
      } else {
        const top = cases.length - 1
        if (word === 'case' && atStart()) cases.push('subject')
        else if (word === 'esac' && cases[top] !== 'subject' && atStart()) cases.pop()
        rec.words.push(word)
        leading &&= KEYWORDS.has(word)
        if (dynWord) scan.dyn.add(word)
        if (bareWord || (globWord && !/^https?:\/\//i.test(word))) scan.bare?.add(word)
        if (cases[top] === 'subject' && word === 'in') {
          cases[top] = 'pattern'
          inWord = false
          word = ''
          dynWord = false
          bareWord = false
          globWord = false
          endCommand()
          return
        }
      }
    }
    word = ''
    inWord = false
    dynWord = false
    bareWord = false
    globWord = false
  }
  const endCommand = () => {
    endWord()
    const kept = rec.words.length || rec.subs.length || rec.waiting
    if (kept) recs.push(rec)
    // a pipe's reader may start past a newline or an opening parenthesis (`a |\n b`, `a | (b)`)
    const fed = !kept && rec.fed
    rec = fresh()
    if (fed) rec.fed = true
    leading = true
  }
  const take = (r: { recs: Rec[]; end: number }, from: number) => {
    rec.subs.push(r.recs)
    word += s.slice(from, r.end)
    inWord = true
    dynWord = true
    return r.end
  }

  while (i < s.length) {
    const c = s[i] ?? ''
    if (c === '\n') {
      endCommand()
      i++
      // heredoc bodies start after this newline; an unquoted one runs the substitutions in it
      for (const doc of heredocs.splice(0)) {
        let body = ''
        while (i < s.length) {
          const end = s.indexOf('\n', i)
          const row = s.slice(i, end === -1 ? s.length : end)
          i = end === -1 ? s.length : end + 1
          if ((doc.strip ? row.replace(/^\t+/, '') : row) === doc.tag) break
          body += `${row}\n`
        }
        doc.rec.stdin = body
        if (!doc.quoted) doc.rec.subs.push(...bodySubs(body, level, scan))
      }
      continue
    }
    if (c === ' ' || c === '\t' || c === '\r') {
      endWord()
      i++
      continue
    }
    if (c === '\\' && s[i + 1] === '\n') {
      // a line continuation is no character at all
      i += 2
      continue
    }
    if (c === '#' && !inWord) {
      while (i < s.length && s[i] !== '\n') i++
      continue
    }
    const top = cases.length - 1
    if (c === ';') {
      endCommand()
      i++
      // `;;`, `;&` and `;;&` end a case clause: a pattern comes next
      if (s[i] === ';' || s[i] === '&') {
        if (cases[top] === 'body') cases[top] = 'pattern'
        i++
        if (s[i] === '&') i++
      }
      continue
    }
    if (c === '|' && cases[top] === 'pattern') {
      endWord()
      i++
      continue
    }
    if (c === '(' && cases[top] === 'pattern' && !inWord && !rec.words.length) {
      // a pattern's optional opening parenthesis
      i++
      continue
    }
    if (c === ')' && cases[top] === 'pattern') {
      // the end of a pattern: its words are no command, its substitutions still run
      endWord()
      rec.words = []
      leading = true
      cases[top] = 'body'
      i++
      continue
    }
    if ((c === '<' || c === '>') && s[i + 1] === '(') {
      // process substitution: its body runs, and the word is a path
      i = take(substitution(s, i + 2, level, scan), i)
      continue
    }
    if (c === '&' && s[i + 1] === '>') {
      // `&>` and `&>>`: standard output and error to a file
      endWord()
      i += 2
      if (s[i] === '>') i++
      drop = true
      writes = true
      continue
    }
    if (c === ';' || c === '&' || c === '|' || c === '(' || c === ')') {
      if (c === '(') parens++
      if (c === ')') {
        if (stop && parens === 0) {
          endCommand()
          return { recs, end: i + 1 }
        }
        parens = Math.max(0, parens - 1)
      }
      // a pipe (not `||`) feeds the next command this one's output; `|&` feeds it standard error too
      const pipe = c === '|' && s[i + 1] !== '|' && s[i - 1] !== '|'
      endCommand()
      i++
      if (pipe) {
        rec.fed = true
        if (s[i] === '&') i++
      }
      continue
    }
    if (c === '<' && s[i + 1] === '<' && s[i + 2] === '<') {
      // here-string: its word is the command's standard input
      if (inWord && /^\d+$/.test(word)) {
        word = ''
        inWord = false
      } else endWord()
      i += 3
      here = true
      continue
    }
    if (c === '<' && s[i + 1] === '<') {
      // heredoc: remember its delimiter, drop it from the words
      endWord()
      i += 2
      const strip = s[i] === '-'
      if (strip) i++
      while (s[i] === ' ' || s[i] === '\t') i++
      let tag = ''
      let quoted = false
      while (i < s.length && !/[\s;&|()<>]/.test(s[i] ?? '')) {
        const ch = s[i] ?? ''
        if (ch === "'" || ch === '"' || ch === '\\') quoted = true
        else tag += ch
        i++
      }
      if (tag) {
        heredocs.push({ tag, strip, quoted, rec })
        rec.waiting = true
      }
      continue
    }
    if (c === '<' || c === '>') {
      // a redirection: drop a bare fd number before it, the operator, and its target
      if (inWord && /^\d+$/.test(word)) {
        word = ''
        inWord = false
      } else endWord()
      const from = i
      i++
      while (s[i] === '>' || s[i] === '<' || s[i] === '|') i++
      writes = s.slice(from, i).includes('>')
      if (s[i] === '&') {
        i++
        while (/\d|-/.test(s[i] ?? '')) i++
        continue
      }
      drop = true
      continue
    }
    inWord = true
    if (c === '\\') {
      word += s[i + 1] ?? ''
      i += 2
      continue
    }
    if (c === "'") {
      const end = s.indexOf("'", i + 1)
      word += s.slice(i + 1, end === -1 ? s.length : end)
      i = end === -1 ? s.length : end + 1
      continue
    }
    if (c === '$' && s[i + 1] === "'") {
      const r = ansiC(s, i + 2)
      word += r.text
      i = r.end
      continue
    }
    if (c === '$' && s[i + 1] === '"') {
      // a locale string reads as a double-quoted one
      i++
      continue
    }
    if (c === '"') {
      i++
      while (i < s.length && s[i] !== '"') {
        const d = s[i]
        if (d === '\\' && s[i + 1] === '\n') i += 2
        else if (d === '\\' && /["\\$`]/.test(s[i + 1] ?? '')) {
          word += s[i + 1]
          i += 2
        } else if (d === '$' && s[i + 1] === '(') i = take(substitution(s, i + 2, level, scan), i)
        else if (d === '$' && s[i + 1] === '{') {
          const end = braces(s, i, true, level, scan, rec.subs)
          word += s.slice(i, end)
          dynWord = true
          i = end
        } else if (d === '`') i = take(backtick(s, i, level, scan), i)
        else {
          if (d === '$' && /[A-Za-z0-9_@*#?!$-]/.test(s[i + 1] ?? '')) dynWord = true
          word += s[i++]
        }
      }
      i++
      continue
    }
    if (c === '$' && s[i + 1] === '(') {
      // command substitution stays inside the word it belongs to, and its body is a command line of its own
      i = take(substitution(s, i + 2, level, scan), i)
      continue
    }
    if (c === '$' && s[i + 1] === '{') {
      const end = braces(s, i, false, level, scan, rec.subs)
      word += s.slice(i, end)
      dynWord = true
      bareWord = true
      i = end
      continue
    }
    if (c === '`') {
      i = take(backtick(s, i, level, scan), i)
      continue
    }
    if (c === '$' && /[A-Za-z0-9_@*#?!$-]/.test(s[i + 1] ?? '')) dynWord = bareWord = true
    if (c === '*' || c === '?' || c === '[' || c === '{') globWord = true
    word += c
    i++
  }
  endCommand()
  return { recs, end: s.length }
}

/** A `git` invocation: the directory it acts on (after `-C`), its subcommand and that subcommand's arguments. */
export interface GitCall {
  dir: string | null
  sub: string
  args: string[]
  /** An alias defined on the command line (`git -c alias.x=… x`): the subcommand may run anything. */
  alias?: true
}

const GIT_VALUE_OPTS = new Set(['-c', '--git-dir', '--work-tree', '--namespace', '--super-prefix', '--config-env', '--exec-path'])

export function gitCall(cmd: Command): GitCall | undefined {
  const [head, ...rest] = cmd.words
  if (head !== 'git' && !head?.endsWith('/git')) return undefined
  let dir = cmd.dir
  let alias = false
  let i = 0
  while (i < rest.length) {
    const a = rest[i] ?? ''
    if (a === '-C') {
      const target = rest[i + 1] ?? '.'
      dir = dir === null ? null : joinPath(dir, target)
      i += 2
    } else if (GIT_VALUE_OPTS.has(a)) {
      if ((a === '-c' || a === '--config-env') && /^alias\./i.test(rest[i + 1] ?? '')) alias = true
      i += 2
    } else if (a.startsWith('-')) {
      if (/^--config-env=alias\./i.test(a)) alias = true
      i++
    } else break
  }
  const sub = rest[i]
  return sub ? { dir, sub, args: rest.slice(i + 1), ...(alias ? { alias: true as const } : {}) } : undefined
}

/** What a commit takes beyond the index: every tracked change (`-a`), or the named paths' working-tree content. */
export interface CommitScope {
  dir: string | null
  all: boolean
  paths: string[]
  dryRun: boolean
}

const COMMIT_SHORT_VALUE = new Set(['m', 'F', 'C', 'c', 't'])
const COMMIT_LONG_VALUE = new Set([
  '--message', '--file', '--author', '--date', '--template', '--reuse-message', '--reedit-message',
  '--fixup', '--squash', '--cleanup', '--trailer', '--gpg-sign',
])

export function commitScope(call: GitCall): CommitScope {
  const scope: CommitScope = { dir: call.dir, all: false, paths: [], dryRun: false }
  const args = call.args
  for (let i = 0; i < args.length; i++) {
    const a = args[i] ?? ''
    if (a === '--') {
      scope.paths.push(...args.slice(i + 1))
      break
    }
    if (a.startsWith('--')) {
      const name = a.split('=')[0] ?? a
      if (name === '--all') scope.all = true
      else if (name === '--dry-run') scope.dryRun = true
      else if (name === '--pathspec-from-file' || name === '--interactive' || name === '--patch') scope.all = true
      else if (COMMIT_LONG_VALUE.has(name) && !a.includes('=') && name !== '--gpg-sign') i++
      continue
    }
    if (a.startsWith('-') && a.length > 1) {
      for (let j = 1; j < a.length; j++) {
        const f = a[j] ?? ''
        if (f === 'a') scope.all = true
        if (f === 'p') scope.all = true
        if (COMMIT_SHORT_VALUE.has(f)) {
          if (j === a.length - 1) i++
          break
        }
      }
      continue
    }
    scope.paths.push(a)
  }
  return scope
}

/** What a `git add` (or `git stage`) stages: paths, whether untracked and ignored files come along. */
export interface AddScope {
  dir: string | null
  paths: string[]
  untracked: boolean
  ignored: boolean
}

export function addScope(call: GitCall): AddScope | undefined {
  if (call.sub !== 'add' && call.sub !== 'stage') return undefined
  const scope: AddScope = { dir: call.dir, paths: [], untracked: true, ignored: false }
  let every = false
  for (let i = 0; i < call.args.length; i++) {
    const a = call.args[i] ?? ''
    if (a === '--') {
      scope.paths.push(...call.args.slice(i + 1))
      break
    }
    if (a === '-A' || a === '--all' || a === '--no-ignore-removal') every = true
    else if (a === '-u' || a === '--update') {
      every = true
      scope.untracked = false
    } else if (a === '-f' || a === '--force') scope.ignored = true
    else if (a === '--chmod' || a === '--pathspec-from-file') i++
    else if (a.startsWith('-')) continue
    else scope.paths.push(a)
  }
  if (!scope.paths.length && every) scope.paths.push('.')
  if (scope.paths.includes('--pathspec-from-file')) scope.paths = ['.']
  return scope.paths.length ? scope : undefined
}

const LOCAL_HOST = /^(?:https?:\/\/)?(?:localhost|127\.\d+\.\d+\.\d+|0\.0\.0\.0|\[::1\]|[\w-]+\.localhost)(?::\d+)?(?:\/|$)/i

/** Package runners whose next word is the command: `npx [opts]`, `bunx`, `pnpm dlx|exec`, `yarn dlx|exec`, `npm exec|x [--]`. */
export function runnerless(words: string[]): string[] {
  const name = bare(words[0] ?? '')
  let i: number
  if (name === 'npx' || name === 'bunx') i = 1
  else if ((name === 'pnpm' || name === 'yarn') && (words[1] === 'dlx' || words[1] === 'exec')) i = 2
  else if (name === 'npm' && (words[1] === 'exec' || words[1] === 'x')) i = 2
  else return words
  while (i < words.length) {
    const a = words[i] ?? ''
    if (a === '--') {
      i++
      break
    }
    if (!a.startsWith('-')) break
    if (/^(?:-p|--package|-w|--workspace)$/.test(a)) i++
    i++
  }
  return i < words.length ? words.slice(i) : words
}

/** Package-manager options that take the next word as their value (`npm --registry x publish`, `pnpm -C dir publish`). */
const PM_VALUE = new Set([
  '--registry', '-w', '--workspace', '--prefix', '--userconfig', '--globalconfig', '-C', '--dir', '--cwd', '--filter', '-F',
  '--loglevel', '--cache', '--otp', '--tag', '--access', '--scope', '--reporter',
])

/**
 * A package manager's subcommand, read both ways where an unknown long option might take a value (`npm --foo x
 * publish`): either reading names it. `yarn npm publish` is `npm publish`.
 */
function pmSubs(args: string[]): string[] {
  const subs = new Set<string>()
  for (const greedy of [false, true]) {
    for (let i = 0; i < args.length; i++) {
      const a = args[i] ?? ''
      if (a === '--') {
        if (args[i + 1] !== undefined) subs.add(args[i + 1] ?? '')
        break
      }
      if (!a.startsWith('-') || a === '-') {
        subs.add(a)
        break
      }
      if (!a.includes('=') && (PM_VALUE.has(a) || (greedy && a.startsWith('--')))) i++
    }
  }
  return [...subs]
}

export const SENDS = 'a request that sends data to an outside service'
export const FEEDS = "another command's output sent to an outside service"
export const WRITES_CONFIG = 'a download that writes a config file or git hook'

/** Commands that talk to another machine: one fed a pipe, or given a substitution's output, sends that output. */
const NET_TOOLS = new Set(['curl', 'wget', 'nc', 'ncat', 'netcat', 'socat', 'telnet', 'ssh', 'sftp', 'ftp', 'http', 'https', 'xh'])

/** Whether a reason is one of the network ones, where a read could go through WebFetch instead. */
export const networkReason = (reason: string) => reason === SENDS || reason === FEEDS || reason === WRITES_CONFIG

/** A word holding a command substitution: its output is part of what the command sends. */
const SUBSTITUTED = /\$\(|`/

/** Header names that carry credentials or a session: an auth, cookie, token, key, secret, session or password header. */
const SECRET_HEADER = /auth|cookie|token|key|secret|session|passw|credential|signature/i

/**
 * The options a read-only fetch may use: `short` flags and `long` ones that take no value, `shortValue` and
 * `longValue` ones that take one (the value checked by `check` where it matters). Anything else, a body, an upload,
 * a method, credentials, cookies, a config file, a proxy, is a send.
 */
interface FetchOptions {
  short: string
  shortValue: string
  long: Set<string>
  longValue: Set<string>
  /** Whole words that look like a cluster but aren't one (`wget -nv`). */
  words?: Set<string>
  /** Options that send, and take a value: known only so their value isn't read as a URL (`curl -d '{}' localhost`). */
  sendShort: string
  sendLong: Set<string>
  /** Options that send the request somewhere other than its URL, or add URLs unseen: a call with one is never local. */
  rerouteShort: string
  reroute: RegExp
  /** Options whose value is a file the tool writes. */
  outShort: string
  outLong: Set<string>
}

const CURL: FetchOptions = {
  short: 'sSLfiIOkgGvN#46R',
  shortValue: 'oAmwHrDCzYyX',
  long: new Set([
    'silent', 'show-error', 'location', 'fail', 'fail-with-body', 'fail-early', 'include', 'head', 'remote-name', 'remote-name-all',
    'remote-time', 'insecure', 'globoff', 'get', 'verbose', 'no-buffer', 'progress-bar', 'no-progress-meter',
    'ipv4', 'ipv6', 'compressed', 'http1.0', 'http1.1', 'http2', 'http2-prior-knowledge', 'http3', 'create-dirs', 'raw',
    'tr-encoding', 'path-as-is', 'no-keepalive', 'parallel', 'parallel-immediate', 'retry-all-errors', 'retry-connrefused', 'version',
    'tlsv1', 'tlsv1.0', 'tlsv1.1', 'tlsv1.2', 'tlsv1.3', 'ssl-reqd',
  ]),
  longValue: new Set([
    'output', 'user-agent', 'max-time', 'connect-timeout', 'retry', 'retry-delay', 'retry-max-time', 'write-out', 'header', 'range',
    'max-redirs', 'max-filesize', 'time-cond', 'output-dir', 'dump-header', 'limit-rate', 'continue-at', 'speed-limit', 'speed-time',
    'stderr', 'trace', 'trace-ascii', 'request', 'url', 'parallel-max', 'keepalive-time', 'proto', 'proto-redir', 'tls-max',
  ]),
  sendShort: 'dFTuUbcKxeEQtP',
  sendLong: new Set([
    'data', 'data-raw', 'data-binary', 'data-urlencode', 'data-ascii', 'json', 'form', 'form-string', 'upload-file', 'user',
    'proxy-user', 'cookie', 'cookie-jar', 'config', 'proxy', 'referer', 'cert', 'key', 'cacert', 'oauth2-bearer', 'resolve',
    'connect-to', 'unix-socket', 'abstract-unix-socket', 'url-query', 'aws-sigv4', 'netrc-file', 'preproxy', 'interface',
    'variable', 'expand-data', 'proxy-header', 'header-file', 'mail-from', 'mail-rcpt', 'quote', 'request-target', 'login-options',
  ]),
  rerouteShort: 'xK:',
  reroute: /^(?:proxy|proxy1\.0|preproxy|socks.*|connect-to|resolve|config|next|doh-url)$/,
  outShort: 'oD',
  outLong: new Set(['output', 'dump-header', 'output-dir', 'trace', 'trace-ascii', 'stderr']),
}

const WGET: FetchOptions = {
  short: 'qvSNckEK46xV',
  shortValue: 'OoaPUTtwQ',
  long: new Set([
    'quiet', 'verbose', 'no-verbose', 'server-response', 'spider', 'timestamping', 'continue', 'no-check-certificate', 'convert-links',
    'adjust-extension', 'inet4-only', 'inet6-only', 'no-clobber', 'no-directories', 'no-host-directories', 'force-directories',
    'show-progress', 'no-cache', 'version', 'no-dns-cache', 'https-only', 'retry-connrefused', 'random-wait',
    'no-use-server-timestamps',
  ]),
  longValue: new Set([
    'output-document', 'output-file', 'append-output', 'directory-prefix', 'user-agent', 'timeout', 'tries', 'wait', 'waitretry',
    'read-timeout', 'connect-timeout', 'dns-timeout', 'limit-rate', 'quota', 'max-redirect', 'header', 'compression', 'progress',
    'retry-on-http-error',
  ]),
  words: new Set(['-nv', '-nc', '-nd', '-nH']),
  sendShort: 'eiBlI',
  sendLong: new Set([
    'post-data', 'post-file', 'body-data', 'body-file', 'method', 'user', 'password', 'http-user', 'http-password', 'proxy-user',
    'proxy-password', 'load-cookies', 'save-cookies', 'execute', 'config', 'input-file', 'base', 'certificate', 'private-key',
    'bind-address', 'referer',
  ]),
  rerouteShort: 'eiB',
  reroute: /^(?:execute|config|input-file|base)$/,
  outShort: 'OoaP',
  outLong: new Set(['output-document', 'output-file', 'append-output', 'directory-prefix']),
}

/** A path curl or wget would read as its config, or git would run or read: writing one is no read. */
const CONFIG_PATH = /(?:^|\/)(?:[._]curlrc|\.wgetrc)$|(?:^|\/)\.git\/+(?:hooks|config)(?:\/|$)/i

/** Whether one option's value keeps a fetch a read: a method of GET or HEAD, a header that carries no credentials or file. */
function harmlessValue(name: string, value: string): boolean {
  // a value from a variable may be anything; only the URL itself may be one
  if (value.includes('$')) return false
  if (name === 'X' || name === 'request') return /^(?:GET|HEAD)$/i.test(value)
  if (name === 'H' || name === 'header') return !value.startsWith('@') && !SECRET_HEADER.test(value.split(':')[0] ?? '')
  return true
}

/** curl's options whose values `-G` puts in the query string (`--url-query` puts its own there without it). */
const CURL_DATA = new Set(['data', 'data-ascii', 'data-raw', 'data-urlencode', 'url-query'])

/** Whether a data value reads a file: `@file` for `-d`, `@file` or `name@file` for `--data-urlencode` and `--url-query`. */
function readsFile(name: string, value: string): boolean {
  if (name === 'data-raw') return false
  if (name === 'data' || name === 'data-ascii') return value.startsWith('@')
  // `@file`, `name@file`, and `=@…` too, to be safe
  return /^=?[^=]*@/.test(name === 'url-query' ? value.replace(/^\+/, '') : value)
}

/** An http(s) URL with no user or password in it; any other scheme, or none, isn't a plain read. */
const READ_URL = /^https?:\/\/[^/?#@]+(?:[/?#]|$)/i
/** A word that is one variable expansion and nothing else (`"$URL"`, `"${ROUTES[i]}"`), read as a URL when quoted. */
const WHOLE_EXPANSION = /^\$(?:[A-Za-z_][A-Za-z0-9_]*|\{[A-Za-z_][A-Za-z0-9_]*(?:\[[^\]@*`]+\])?\})$/

/**
 * Why a `curl` or `wget` call counts as outward, or undefined. A call to local hosts only is never outward, unless an
 * option or a variable on the line sends it elsewhere or adds URLs unseen (a proxy, `--connect-to`, `--resolve`, a
 * config file, `--next`, `wget -i`, `-e`, `-B`, `https_proxy=…`). A variable that moves the config file or sets a
 * proxy (`HOME`, `CURL_HOME`, `XDG_CONFIG_HOME`, `WGETRC`, `*_proxy`) is a send anywhere, and so is a download written
 * to a curl or wget config file or into `.git/hooks` or `.git/config`. Elsewhere, a read passes: every option is on
 * the tool's list of harmless ones (combined short flags read one by one), no option's value holds a `$`, every URL
 * is http(s) with no credentials in it, no word holds a command substitution or may split (an unquoted expansion,
 * glob or brace), and it isn't fed a pipe. Anything else, a body, an upload, another method, credentials, an auth or
 * cookie header, a config file, an unknown option, is a send. A query string passes, though it can carry data, and
 * so do curl's data options under `-G` (and `--url-query`), which put their values in it, when none reads a file or
 * holds a `$`; and so does a URL in a double-quoted variable (`"$URL"`, `"${ROUTES[i]}"`,
 * `"https://en.wikipedia.org/wiki/$PAGE"`, never an operator, `!` or `[@]`), though it too can carry data, or even
 * hold a flag: the check is a guardrail, not a sandbox.
 */
function fetchReason(tool: 'curl' | 'wget', cmd: Command, args: string[]): string | undefined {
  const spec = tool === 'curl' ? CURL : WGET
  const urls: string[] = []
  const outputs: string[] = [...(cmd.targets ?? [])]
  let read = true
  // an option that sends the request elsewhere or adds URLs unseen: the call is no longer local
  let rerouted = false
  // curl's data options: a send, unless `-G` puts them in the query string (`--url-query` always does)
  let get = false
  let data = false
  const datum = (name: string, value: string | undefined) => {
    if (value === undefined || value.includes('$') || readsFile(name, value)) read = false
    if (name !== 'url-query') data = true
  }
  const valued = (name: string, value: string | undefined, out: boolean) => {
    if (value === undefined || !harmlessValue(name, value)) read = false
    if (out && value !== undefined) outputs.push(value)
  }
  for (let i = 0; i < args.length; i++) {
    const a = args[i] ?? ''
    if (a === '--') {
      urls.push(...args.slice(i + 1))
      break
    }
    if (!a.startsWith('-') || a === '-') {
      urls.push(a)
      continue
    }
    if (spec.words?.has(a)) continue
    if (a.startsWith('--')) {
      const eq = a.indexOf('=')
      const name = a.slice(2, eq < 0 ? undefined : eq)
      if (spec.reroute.test(name)) rerouted = true
      if (tool === 'curl' && name === 'get' && eq < 0) get = true
      if (tool === 'curl' && CURL_DATA.has(name)) datum(name, eq < 0 ? args[++i] : undefined)
      else if (spec.longValue.has(name)) {
        // curl takes no `--name=value`: that word is an unknown option
        const value = eq < 0 ? args[++i] : tool === 'wget' ? a.slice(eq + 1) : undefined
        valued(name, value, spec.outLong.has(name))
        if (name === 'url' && value !== undefined) urls.push(value)
      } else {
        if (eq < 0 && spec.sendLong.has(name)) i++
        if (eq >= 0 || !spec.long.has(name)) read = false
      }
      continue
    }
    for (let j = 1; j < a.length; j++) {
      const c = a[j] ?? ''
      if (spec.rerouteShort.includes(c)) rerouted = true
      if (tool === 'curl' && c === 'G') get = true
      if (tool === 'curl' && c === 'd') {
        datum('data', j < a.length - 1 ? a.slice(j + 1) : args[++i])
        break
      }
      if (spec.shortValue.includes(c)) {
        valued(c, j < a.length - 1 ? a.slice(j + 1) : args[++i], spec.outShort.includes(c))
        break
      }
      if (!spec.short.includes(c)) {
        read = false
        if (spec.sendShort.includes(c) && j === a.length - 1) i++
        break
      }
    }
  }
  // a file it writes, named or taken from the URL, that curl, wget or git would read back as config or run
  const named = urls.map(u => u.replace(/[?#].*$/, ''))
  if ([...outputs, ...named].some(p => CONFIG_PATH.test(p))) return WRITES_CONFIG
  if (cmd.configEnv) return SENDS
  if (!rerouted && urls.length && urls.every(u => LOCAL_HOST.test(u))) return undefined
  if (data && !get) read = false
  const unquoted = cmd.unquoted ?? []
  // a quoted variable is a URL only when the line gave it no other value (`X=-T/etc/passwd; curl "$X"` uploads), and
  // one inside a URL only when the line didn't fill it from a file, a command or input (`S=$(cat f); curl "…?q=$S"`)
  const kind = (name: string) => (cmd.assigned && Object.hasOwn(cmd.assigned, name) ? cmd.assigned[name] : undefined)
  const names = (u: string) => [...u.matchAll(/\$\{?([A-Za-z_][A-Za-z0-9_]*)/g)].map(m => m[1] ?? '')
  const goodUrl = (u: string) =>
    (READ_URL.test(u) && names(u).every(n => kind(n) !== 'computed')) || (WHOLE_EXPANSION.test(u) && names(u).every(n => !kind(n)))
  if (cmd.fed || args.some(a => SUBSTITUTED.test(a) || unquoted.includes(a)) || !urls.every(goodUrl)) read = false
  return read ? undefined : SENDS
}

/** Why a command reaches outside the machine or is hard to undo, or undefined. Not exhaustive: the common publish, deploy and push paths. */
export function outwardReason(cmd: Command): string | undefined {
  if (cmd.opaque) return cmd.why ?? DEEP
  // a command built at run time counts only when the line names an outward command it could be
  if (cmd.dynamic) return cmd.mentions?.some(m => OUTWARD_TOOLS.has(m)) ? BUILT : undefined
  // a package runner's command is checked as itself (`npx npm publish`, `npm exec -- npm publish`)
  const inner = runnerless(cmd.words)
  if (inner !== cmd.words) {
    const reason = outwardReason({ ...cmd, words: inner })
    if (reason) return reason
  }
  const [head = '', ...args] = cmd.words
  const tool = head.split('/').pop() ?? head
  const sub = args.find(a => !a.startsWith('-'))
  const has = (...words: string[]) => args.some(a => words.includes(a))

  // a network command fed a pipe or a substitution's output sends it (`curl … | nc host 80`); curl and wget are read below
  const substituted = args.some(a => SUBSTITUTED.test(a)) || SUBSTITUTED.test(cmd.input ?? '')
  if (NET_TOOLS.has(tool) && tool !== 'curl' && tool !== 'wget' && (cmd.fed || substituted)) return FEEDS

  const git = gitCall(cmd)
  if (git?.alias) return ALIAS
  if (git?.sub === 'push') return 'git push'
  if (git?.sub === 'send-email') return 'git send-email'
  if ((git?.sub === 'subtree' || git?.sub === 'lfs') && git.args.includes('push')) return `git ${git.sub} push`

  switch (tool) {
    case 'gh': {
      const [noun, verb] = args.filter(a => !a.startsWith('-'))
      if (noun === 'api') {
        const method = args.find((a, i) => args[i - 1] === '-X' || args[i - 1] === '--method') ?? (has('-f', '-F', '--field', '--raw-field', '--input') ? 'POST' : 'GET')
        return method.toUpperCase() === 'GET' ? undefined : `gh api ${method.toUpperCase()}`
      }
      const writes: Record<string, string[]> = {
        pr: ['create', 'merge', 'close', 'comment', 'review', 'edit', 'ready', 'reopen'],
        issue: ['create', 'comment', 'close', 'edit', 'delete', 'reopen', 'transfer'],
        release: ['create', 'upload', 'delete', 'edit'],
        repo: ['create', 'delete', 'edit', 'rename', 'archive', 'fork'],
        workflow: ['run', 'enable', 'disable'],
        secret: ['set', 'delete'],
        variable: ['set', 'delete'],
      }
      return noun && verb && writes[noun]?.includes(verb) ? `gh ${noun} ${verb}` : undefined
    }
    case 'npm':
    case 'pnpm':
    case 'yarn':
    case 'bun': {
      for (const s of pmSubs(args)) {
        if (s === 'publish' || s === 'unpublish' || s === 'deprecate') return `${tool} ${s}`
        if (s === 'npm' && tool === 'yarn') {
          const reason = outwardReason({ ...cmd, words: ['npm', ...args.slice(args.indexOf('npm') + 1)] })
          if (reason) return `yarn ${reason}`
        }
      }
      return undefined
    }
    case 'cargo':
      return sub === 'publish' || sub === 'yank' ? `cargo ${sub}` : undefined
    case 'twine':
      return sub === 'upload' ? 'twine upload' : undefined
    case 'gem':
      return sub === 'push' ? 'gem push' : undefined
    case 'poetry':
    case 'uv':
      return sub === 'publish' ? `${tool} publish` : undefined
    case 'docker':
    case 'podman':
      return sub === 'push' ? `${tool} push` : undefined
    case 'vercel': {
      const local = ['dev', 'env', 'login', 'logout', 'link', 'pull', 'build', 'whoami', 'ls', 'list', 'inspect', 'logs', 'help']
      return !sub || sub === 'deploy' || has('--prod') || !local.includes(sub) ? 'vercel deploy' : undefined
    }
    case 'netlify':
    case 'fly':
    case 'flyctl':
    case 'firebase':
    case 'serverless':
    case 'sls':
      return sub === 'deploy' ? `${tool} deploy` : undefined
    case 'wrangler':
      return sub === 'deploy' || sub === 'publish' ? `wrangler ${sub}` : undefined
    case 'railway':
      return sub === 'up' ? 'railway up' : undefined
    case 'cdk':
      return sub === 'deploy' || sub === 'destroy' ? `cdk ${sub}` : undefined
    case 'terraform':
    case 'tofu':
      return sub === 'apply' || sub === 'destroy' || sub === 'import' ? `${tool} ${sub}` : undefined
    case 'pulumi':
      return sub === 'up' || sub === 'destroy' || sub === 'update' ? `pulumi ${sub}` : undefined
    case 'kubectl':
      return sub && ['apply', 'delete', 'create', 'replace', 'patch', 'scale', 'rollout', 'set', 'edit', 'drain'].includes(sub) ? `kubectl ${sub}` : undefined
    case 'helm':
      return sub && ['install', 'upgrade', 'uninstall', 'delete', 'rollback'].includes(sub) ? `helm ${sub}` : undefined
    case 'gcloud':
    case 'az':
      return has('deploy', 'delete') ? `${tool} ${args.includes('deploy') ? 'deploy' : 'delete'}` : undefined
    case 'aws':
      if (args[0] === 's3' && ['cp', 'sync', 'mv', 'rm', 'rb'].includes(args[1] ?? '')) return `aws s3 ${args[1]}`
      return args.some(a => /^(deploy|delete-|update-function-code|put-|create-|terminate-)/.test(a)) ? 'aws write' : undefined
    case 'curl':
    case 'wget':
      return fetchReason(tool, cmd, args)
  }
  return undefined
}
