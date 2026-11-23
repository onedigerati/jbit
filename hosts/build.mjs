#!/usr/bin/env node
// Builds a host's generated JBIT package from the Claude plugin (the source) and `hosts/`:
//   node hosts/build.mjs <host> [--check] [--src DIR] [--out DIR]
// `hosts/<host>/capability.json` drives it: the format (`copilot`, the default, or `codex`: manifest path, hooks.json
// and marketplace shapes), the package folder, the marketplace file, the hook events, the scripts to copy (listed or
// globbed, some required) and the import rewrites (or `relink`) that keep them inside the package, frontmatter keys to
// drop and the `agents/openai.yaml` for a skill the model mustn't invoke, the skill substitutions (each must still match its
// source), the mapping section appended to every skill, and the leak terms: Claude-only names that must not be left
// outside that section, and the gap list: what the host can't do, written between two markers in the root README
// (`readme` in the capability file; the rest of the README is hand-written and kept as is). Output is deterministic (sorted, no timestamps), and only changed files are written.
// --check writes nothing and exits 1 when the files on disk differ from what the build would make (drift), or when the
// generated output or the files on disk (the package folder and the marketplace file) leak. --src reads sources from another root and --out writes under another root (both default to the repo), for tests.
import { createHash } from 'node:crypto'
import { chmodSync, existsSync, mkdirSync, readdirSync, readFileSync, rmdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, join, normalize, posix, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const SELF = fileURLToPath(import.meta.url)
const REPO = dirname(dirname(SELF))
const SOURCE_PLUGIN = 'plugins/jbit'

const sha = text => createHash('sha256').update(text).digest('hex')
const json = value => `${JSON.stringify(value, null, 2)}\n`
const read = (root, rel) => readFileSync(join(root, rel), 'utf8')

class BuildError extends Error {}
const fail = msg => {
  throw new BuildError(msg)
}

export function loadCapability(src, host) {
  const path = join(src, 'hosts', host, 'capability.json')
  if (!existsSync(path)) fail(`no capability file for host "${host}": ${relative(src, path)}`)
  return JSON.parse(readFileSync(path, 'utf8'))
}

/** Replaces every occurrence of each substitution across `texts` (name → text); one that matches nothing fails. */
function substitute(texts, subs) {
  const out = { ...texts }
  for (const { from, to } of subs) {
    let hits = 0
    for (const [k, text] of Object.entries(out)) {
      const parts = text.split(from)
      hits += parts.length - 1
      out[k] = parts.join(to)
    }
    if (!hits) fail(`substitution matches nothing: ${from}`)
  }
  return out
}

/**
 * Frontmatter with each plain scalar a strict YAML parser would reject (`: ` or ` #` inside it, or a leading indicator)
 * written as a double-quoted one. Claude Code reads such lines; Copilot CLI fails the whole skill.
 */
export function quoteFrontmatter(text, where) {
  const m = /^---\n([\s\S]*?)\n---\n/.exec(text)
  if (!m) fail(`${where} has no frontmatter`)
  const lines = m[1].split('\n').map(line => {
    const kv = /^([A-Za-z][\w-]*): (.*)$/.exec(line)
    if (!kv) fail(`${where}: frontmatter line isn't a plain \`key: value\`: ${line}`)
    const [, key, value] = kv
    if (/^["']/.test(value) || !/: | #|^[[{&*!|>%@`,?-]/.test(value)) return line
    return `${key}: ${JSON.stringify(value)}`
  })
  return `---\n${lines.join('\n')}\n---\n${text.slice(m[0].length)}`
}

function mappingSection(cap) {
  const tools = cap.tools.map(t => `${t.claude} → ${t[cap.host].map(n => `\`${n}\``).join(', ')}${t.note ? ` (${t.note})` : ''}`).join('; ')
  return [cap.mapping.heading, '', ...cap.mapping.lines.map(l => l.replace('{tools}', tools))].join('\n')
}

/** The README's gap list: one bullet per capability.json gap, in its order. */
export function gapBlock(cap) {
  return cap.gaps.map(g => `- **${g.what}.** ${g.why}`).join('\n')
}

/** `text` (the root README) with the block between the capability file's markers replaced by the gap list. */
function withGapBlock(text, cap) {
  const { path, start, end } = cap.readme
  const a = text.indexOf(start)
  const b = text.indexOf(end)
  if (a === -1 || b === -1 || b < a || text.indexOf(start, a + 1) !== -1 || text.indexOf(end, b + 1) !== -1) {
    fail(`${path} needs exactly one gap block: a line \`${start}\` followed by a line \`${end}\``)
  }
  return `${text.slice(0, a + start.length)}\n${gapBlock(cap)}\n${text.slice(b)}`
}

/** The events the hook answers, read from the `EVENTS` table of `hook.mjs` (or `hooks.eventsFrom`); null when it has none and the capability allows that. */
function handledEvents(hookSource, required = true) {
  const m = /const EVENTS = \{([^}]*)\}/.exec(hookSource)
  if (!m && !required) return null
  if (!m) fail('the hook has no EVENTS table to check hooks.json against')
  return m[1].split(',').map(s => s.trim().split(':')[0].trim()).filter(Boolean).sort()
}

/** Relative module specifiers a script names (static, dynamic, or a quoted './x.ts'-style constant), and bare ones. */
function specifiers(source) {
  // a type-only import is erased when Node strips the types, so it loads nothing
  const text = source.replace(/^\s*import\s+type\s[^;\n]*\n/gm, '\n')
  const rel = new Set()
  const bare = new Set()
  for (const m of text.matchAll(/['"](\.{1,2}\/[^'"\s]*\.(?:mjs|js|ts))['"]/g)) rel.add(m[1])
  for (const m of text.matchAll(/^\s*(?:import|export)\s+()(?:[^'";]*?\sfrom\s+)?['"]([^'"]+)['"]/gm)) {
    if (!m[2].startsWith('.') && !m[2].startsWith('node:')) bare.add(m[2])
  }
  for (const m of text.matchAll(/import\(\s*['"]([^'"]+)['"]\s*\)/g)) if (!m[1].startsWith('.') && !m[1].startsWith('node:')) bare.add(m[1])
  return { rel: [...rel], bare: [...bare] }
}

/** Claude-only names left in the generated text, outside each skill's mapping section. Scripts are code, copied as is. */
export function findLeaks(files, cap) {
  const terms = cap.leakTerms.map(t => [t, new RegExp(t)])
  const leaks = []
  for (const [file, content] of files) {
    // the README is for people on every host, so it names Claude Code freely
    if (!/\.(md|json|yaml)$/.test(file) || /\/scripts\//.test(file) || file.endsWith('/GENERATED.json') || file === cap.readme?.path) continue
    const cut = file.endsWith('SKILL.md') ? content.indexOf(`\n${cap.mapping.heading}\n`) : -1
    const text = cut === -1 ? content : content.slice(0, cut)
    text.split('\n').forEach((line, i) => {
      for (const [term, re] of terms) if (re.test(line)) leaks.push({ file, line: i + 1, term: term.replace(/\\b|\\/g, '') })
    })
  }
  return leaks
}

/** `text` with the frontmatter keys in `drop` removed. */
function dropFrontmatter(text, drop) {
  if (!drop?.length) return text
  const m = /^---\n([\s\S]*?)\n---\n/.exec(text)
  const lines = []
  let dropping = false
  for (const l of m[1].split('\n')) {
    // an indented line continues the key above it, and goes with it
    if (/^\s/.test(l) && dropping) continue
    dropping = drop.includes(l.split(':')[0])
    if (!dropping) lines.push(l)
  }
  return `---\n${lines.join('\n')}\n---\n${text.slice(m[0].length)}`
}

/** A top-level frontmatter key's value as a plain string (quotes and a trailing comment removed), or undefined. */
function frontmatterValue(text, key) {
  const front = /^---\n([\s\S]*?)\n---\n/.exec(text)?.[1] ?? ''
  const line = front.split('\n').find(l => l.split(':')[0] === key)
  if (line === undefined) return undefined
  let v = line.slice(key.length + 1).trim()
  const q = /^(["'])(.*?)\1/.exec(v)
  if (q) return q[2]
  v = v.replace(/(?:^|\s)#.*$/, '').trim()
  return v
}

/**
 * The scripts the capability copies, as source path → package path: `files` as listed, every `globs` match (a folder's
 * files, read now, so a module added later is picked up), each `required` one present or the build fails.
 */
function scriptPlan(src, scripts) {
  const plan = { ...scripts.files }
  for (const g of scripts.globs ?? []) {
    const dir = join(src, g.dir)
    if (!existsSync(dir)) continue
    for (const name of readdirSync(dir).sort()) {
      if (!new RegExp(g.match).test(name) || (g.exclude && new RegExp(g.exclude).test(name))) continue
      if (statSync(join(dir, name)).isDirectory()) continue
      plan[`${g.dir}/${name}`] = `${g.to}${name}`
    }
  }
  for (const req of scripts.required ?? []) {
    if (!existsSync(join(src, req))) fail(`missing script ${req}: capability.json requires it, and the package can't be built without it`)
    if (!plan[req]) fail(`required script ${req} isn't copied by capability.json`)
  }
  const dests = Object.values(plan)
  const dup = dests.find((d, i) => dests.indexOf(d) !== i)
  if (dup) fail(`two scripts are copied to ${dup}`)
  return plan
}

/** `text` (copied from `from` to `to`) with each relative import of another copied script pointed at its package path. */
function relink(text, from, to, plan) {
  for (const spec of specifiers(text).rel) {
    const target = posix.normalize(posix.join(posix.dirname(from), spec))
    if (!plan[target]) continue
    let next = posix.relative(posix.dirname(to), plan[target])
    if (!next.startsWith('.')) next = `./${next}`
    if (next === spec) continue
    for (const q of ["'", '"']) text = text.split(`${q}${spec}${q}`).join(`${q}${next}${q}`)
  }
  return text
}

/** The package's hooks.json, in the host's format. */
function hooksFile(cap, events) {
  const h = cap.hooks
  if (cap.format === 'codex') {
    const hooks = {}
    for (const e of events) {
      const handler = { type: 'command', command: h.command.replace('<event>', e), timeout: h.timeoutSec }
      if (h.additionalContextLimit?.[e]) handler.additionalContextLimit = h.additionalContextLimit[e]
      hooks[e] = [{ ...(h.matchers?.[e] ? { matcher: h.matchers[e] } : {}), hooks: [handler] }]
    }
    return { hooks }
  }
  const hooks = {}
  for (const e of events) hooks[e] = [{ type: 'command', bash: h.command.replace('<event>', e), timeoutSec: h.timeoutSec }]
  return { version: 1, hooks }
}

/** The marketplace file, in the host's format. */
function marketplaceFile(cap, pkg, srcPlugin, description) {
  const m = cap.marketplace
  if (cap.format === 'codex') {
    return {
      name: m.name,
      interface: { displayName: m.displayName },
      plugins: [{ name: m.entry, source: { source: 'local', path: `./${pkg}` }, policy: m.policy, category: m.category }],
    }
  }
  return {
    name: m.name,
    owner: srcPlugin.author,
    description: m.description,
    plugins: [{ name: m.entry, source: `./${pkg}`, description, version: srcPlugin.version }],
  }
}

/** Every file the host's package is made of, as out-root-relative path → text, sorted by path. */
export function generate({ src = REPO, host }) {
  const cap = loadCapability(src, host)
  const pkg = cap.pluginDir
  const files = new Map()
  const sources = {}
  const source = rel => {
    const text = read(src, rel)
    sources[rel] = sha(text)
    return text
  }
  sources['hosts/build.mjs'] = sha(readFileSync(SELF, 'utf8'))
  source(`hosts/${host}/capability.json`)

  if (existsSync(join(src, SOURCE_PLUGIN, 'agents'))) fail(`${SOURCE_PLUGIN}/agents exists, and the ${host} build doesn't map role agents yet`)
  const srcPlugin = JSON.parse(source(`${SOURCE_PLUGIN}/.claude-plugin/plugin.json`))

  // skills (and the plugin's description) through the substitutions, then the mapping section
  const skillNames = readdirSync(join(src, SOURCE_PLUGIN, 'skills')).filter(n => existsSync(join(src, SOURCE_PLUGIN, 'skills', n, 'SKILL.md'))).sort()
  const texts = { '': srcPlugin.description }
  for (const n of skillNames) texts[n] = source(`${SOURCE_PLUGIN}/skills/${n}/SKILL.md`)
  const adapted = substitute(texts, cap.substitutions)
  const section = mappingSection(cap)
  for (const n of skillNames) {
    let text = adapted[n]
    if (!new RegExp(`^---\\nname: ${n}\\n`).test(text)) fail(`skills/${n}/SKILL.md must open with frontmatter naming it "${n}"`)
    if (text.includes(cap.mapping.heading)) fail(`skills/${n}/SKILL.md already has a "${cap.mapping.heading}" heading`)
    const ni = cap.frontmatter?.noImplicit
    const [niKey, niValue] = ni ? ni.when.split(':').map(x => x.trim()) : []
    const offered = ni && String(frontmatterValue(text, niKey)).toLowerCase() === niValue
    if (offered) files.set(`${pkg}/skills/${n}/${ni.file}`, ni.text)
    // a skill the model mustn't invoke loses that key: it must not lose the protection with it
    if (cap.frontmatter?.drop?.includes('disable-model-invocation') && String(frontmatterValue(text, 'disable-model-invocation')).toLowerCase() === 'true' && !(offered && niKey === 'disable-model-invocation')) {
      fail(`skills/${n}/SKILL.md sets disable-model-invocation: true, which the ${host} build drops, and no file keeps the skill from implicit use (capability.json frontmatter.noImplicit)`)
    }
    text = dropFrontmatter(text, cap.frontmatter?.drop)
    text = quoteFrontmatter(text, `skills/${n}/SKILL.md`)
    if (!text.endsWith('\n')) text += '\n'
    files.set(`${pkg}/skills/${n}/SKILL.md`, `${text}\n${section}\n`)
  }

  const manifest = cap.manifest
    ? { name: cap.marketplace.entry, version: srcPlugin.version, description: adapted[''], author: srcPlugin.author, license: srcPlugin.license, skills: cap.manifest.skills }
    : { name: cap.marketplace.entry, version: srcPlugin.version, description: adapted[''], author: srcPlugin.author, license: srcPlugin.license, skills: 'skills/', hooks: 'hooks/hooks.json' }
  files.set(`${pkg}/${cap.manifest?.path ?? 'plugin.json'}`, json(manifest))
  if (existsSync(join(src, SOURCE_PLUGIN, 'LICENSE'))) files.set(`${pkg}/LICENSE`, source(`${SOURCE_PLUGIN}/LICENSE`))

  // hooks.json: one command entry per event the hook answers
  const plan = scriptPlan(src, cap.scripts)
  const hookSrc = Object.keys(plan).find(k => plan[k] === 'scripts/hook.mjs')
  if (!hookSrc) fail('capability.json copies no scripts/hook.mjs')
  // the script holding the EVENTS table: hook.mjs, or the handler an entry script loads (`hooks.eventsFrom`)
  const eventsTo = cap.hooks.eventsFrom ?? 'scripts/hook.mjs'
  const eventsSrc = Object.keys(plan).find(k => plan[k] === eventsTo)
  if (!eventsSrc) fail(`capability.json copies no ${eventsTo}`)
  const events = [...cap.hooks.events].sort()
  const handled = handledEvents(read(src, eventsSrc), cap.hooks.requireEventsTable !== false)
  if (handled) {
    const unhandled = events.filter(e => !handled.includes(e))
    const unlisted = handled.filter(e => !events.includes(e))
    if (unhandled.length || unlisted.length) {
      fail(`hooks.json events and the hook disagree: not handled by ${eventsTo.replace(/^scripts\//, '')}: ${unhandled.join(', ') || 'none'}; handled but not listed: ${unlisted.join(', ') || 'none'}`)
    }
  }
  files.set(`${pkg}/hooks/hooks.json`, json(hooksFile(cap, events)))

  // scripts: copied, with the import rewrites (or, with `relink`, every import of another copied script repointed)
  // that keep them inside the package
  const scripts = {}
  for (const from of Object.keys(plan).sort()) scripts[plan[from]] = cap.scripts.relink ? relink(source(from), from, plan[from], plan) : source(from)
  for (const { file, from, to } of cap.scripts.rewrites ?? []) {
    if (scripts[file] === undefined) fail(`rewrite names a script that isn't copied: ${file}`)
    const n = scripts[file].split(from).length - 1
    if (n !== 1) fail(`rewrite in ${file} matches ${n} times, not once: ${from}`)
    scripts[file] = scripts[file].replace(from, to)
  }
  scripts['scripts/package.json'] = json({ type: 'module' })
  for (const [file, text] of Object.entries(scripts)) {
    if (!/\.(mjs|ts)$/.test(file)) continue
    const { rel, bare } = specifiers(text)
    for (const spec of rel) {
      const target = posix.normalize(posix.join(posix.dirname(file), spec))
      if (target.startsWith('../')) fail(`${file} imports ${spec}, outside the package`)
      if (scripts[target] === undefined) fail(`${file} imports ${spec}, which is not in the package`)
    }
    if (bare.length) fail(`${file} imports packages the plugin doesn't ship: ${bare.join(', ')}`)
  }
  for (const [file, text] of Object.entries(scripts)) files.set(`${pkg}/${file}`, text)

  files.set(cap.marketplace.path, json(marketplaceFile(cap, pkg, srcPlugin, adapted[''])))

  // the README's gap list; the README itself isn't a source of the package, so it stays out of GENERATED.json
  if (cap.readme) {
    const rp = cap.readme.path
    if (typeof rp !== 'string' || !rp || isAbsolute(rp) || rp.split(/[\\/]/).includes('..')) fail(`readme.path must be a relative path inside the repo, not ${JSON.stringify(rp)}`)
    if (!existsSync(join(src, cap.readme.path))) fail(`no ${cap.readme.path} to write the gap list into`)
    files.set(cap.readme.path, withGapBlock(read(src, cap.readme.path), cap))
  }

  const sorted = {}
  for (const k of Object.keys(sources).sort()) sorted[k] = sources[k]
  files.set(
    `${pkg}/GENERATED.json`,
    json({
      note: `Generated by \`node hosts/build.mjs ${host}\`; don't edit. \`node hosts/build.mjs ${host} --check\` fails when this package lags these sources.`,
      host,
      version: srcPlugin.version,
      sources: sorted,
    }),
  )

  const leaks = findLeaks(files, cap)
  if (leaks.length) fail(leaks.map(l => `leak: ${l.file}:${l.line} ${l.term}`).join('\n'))
  return { files: new Map([...files].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))), cap }
}

function walk(dir, base, out = []) {
  if (!existsSync(dir)) return out
  for (const name of readdirSync(dir).sort()) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, base, out)
    else out.push(relative(base, p).split('\\').join('/'))
  }
  return out
}

/** How the files under `out` differ from `files`: missing, differing, and extra files in the package folder. */
export function drift(files, out, cap) {
  const found = []
  for (const [rel, text] of files) {
    const p = join(out, rel)
    if (!existsSync(p)) found.push(`missing: ${rel}`)
    else if (readFileSync(p, 'utf8') !== text) found.push(`differs: ${rel}`)
    else if (modeOff(p, text)) found.push(`mode: ${rel}`)
  }
  for (const rel of walk(join(out, cap.pluginDir), out)) if (!files.has(rel)) found.push(`extra: ${rel}`)
  return found
}

/** A script with a `#!` line is executable; everything else is not. */
const EXEC = process.platform !== 'win32'
const wantsExec = text => text.startsWith('#!')
const modeOff = (p, text) => EXEC && Boolean(statSync(p).mode & 0o100) !== wantsExec(text)
const fixMode = (p, text) => {
  const mode = statSync(p).mode & 0o777
  if (EXEC) chmodSync(p, wantsExec(text) ? mode | 0o111 : mode & ~0o111)
}

function write(files, out, cap) {
  let wrote = 0
  let unchanged = 0
  let removed = 0
  for (const [rel, text] of files) {
    const p = join(out, rel)
    if (existsSync(p) && readFileSync(p, 'utf8') === text) {
      if (modeOff(p, text)) fixMode(p, text)
      unchanged++
      continue
    }
    mkdirSync(dirname(p), { recursive: true })
    writeFileSync(p, text)
    if (modeOff(p, text)) fixMode(p, text)
    wrote++
  }
  const pkgDir = join(out, cap.pluginDir)
  for (const rel of walk(pkgDir, out)) {
    if (files.has(rel)) continue
    rmSync(join(out, rel))
    removed++
  }
  const prune = d => {
    for (const name of readdirSync(d)) if (statSync(join(d, name)).isDirectory()) prune(join(d, name))
    if (d !== pkgDir && readdirSync(d).length === 0) rmdirSync(d)
  }
  if (existsSync(pkgDir)) prune(pkgDir)
  return { wrote, unchanged, removed }
}

function main(argv) {
  const args = argv.slice(2)
  const opt = name => {
    const i = args.indexOf(name)
    if (i === -1) return undefined
    const v = args[i + 1]
    args.splice(i, 2)
    return v
  }
  const src = normalize(opt('--src') ?? REPO)
  const out = normalize(opt('--out') ?? REPO)
  const check = args.includes('--check')
  const host = args.filter(a => a !== '--check')[0]
  if (!host || args.filter(a => a !== '--check').length !== 1) {
    process.stderr.write('usage: node hosts/build.mjs <host> [--check] [--src DIR] [--out DIR]\n')
    return 2
  }
  try {
    const { files, cap } = generate({ src, host })
    if (check) {
      const found = drift(files, out, cap)
      const onDisk = new Map()
      for (const rel of [...walk(join(out, cap.pluginDir), out), cap.marketplace.path]) {
        if (existsSync(join(out, rel))) onDisk.set(rel, readFileSync(join(out, rel), 'utf8'))
      }
      const leaks = findLeaks(onDisk, cap).map(l => `leak: ${l.file}:${l.line} ${l.term}`)
      if (leaks.length) process.stderr.write(`leak: files on disk name Claude-only terms outside the mapping section\n${leaks.join('\n')}\n`)
      if (found.length) {
        process.stderr.write(`drift: ${cap.pluginDir}${cap.readme ? ` or the ${cap.readme.path} gap list` : ""} lags its sources; run node hosts/build.mjs ${host}\n${found.join('\n')}\n`)
        return 1
      }
      if (leaks.length) return 1
      process.stdout.write(`${host}: up to date (${files.size} files)\n`)
      return 0
    }
    const r = write(files, out, cap)
    process.stdout.write(`${host}: wrote ${r.wrote}, removed ${r.removed}, unchanged ${r.unchanged} (${[cap.pluginDir, cap.marketplace.path, cap.readme?.path].filter(Boolean).join(", ")})\n`)
    return 0
  } catch (err) {
    if (!(err instanceof BuildError)) throw err
    process.stderr.write(`build ${host} failed:\n${err.message}\n`)
    return 1
  }
}

if (process.argv[1] && normalize(process.argv[1]) === SELF) process.exitCode = main(process.argv)
