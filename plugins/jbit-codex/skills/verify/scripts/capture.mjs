#!/usr/bin/env node
// JBIT capture: screenshots of a page at given widths and themes, with its console log, and a pixel compare of two
// folders of screenshots. Node built-ins only. Playwright is found at run time (the project's own, else a JBIT cache)
// and loaded by dynamic import of a resolved absolute path, never by bare package name, so host builds can copy this file.
// Run `node capture.mjs --help` for usage.
import { createRequire } from 'node:module'
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, writeFileSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const SELF = fileURLToPath(import.meta.url)
const PIN = '1.65.0'
const PACKAGE = 'playwright-core'
const DOWNLOAD = 'about 130 MB download, about 290 MB on disk'

/** Exit codes, also listed in --help. */
export const EXIT = { ok: 0, failed: 1, usage: 2, noPlaywright: 3, launch: 4, install: 5 }

const HELP = `JBIT capture — screenshots and pixel compare with Playwright (Chromium headless shell).

Usage:
  node capture.mjs shot <url|file> --name <name> --out <dir> [options]
  node capture.mjs compare <before-dir> <after-dir> [--threshold <fraction>]
  node capture.mjs where              which Playwright would be used
  node capture.mjs install            install playwright-core@${PIN} + Chromium headless shell into the JBIT cache
  node capture.mjs --help
  (--install, --where and --compare <before> <after> work as the commands above)

shot writes <out>/<name>-<width>-<theme>.png for every width x theme, and <out>/<name>-console.txt holding console
messages, page errors and failed requests. URLs must be http, https or file (a local path is taken as a file).
  --name <name>          file name stem: letters, digits, '.', '_' or '-'
  --out <dir>            output folder (created)
  --widths <list>        viewport widths in CSS px, default 390,1280
  --height <px>          viewport height, default 800
  --themes <list>        light, dark or both (prefers-color-scheme emulation), default light,dark
  --wait-for <selector>  wait for this selector to be visible before the shot
  --steps <file.json>    actions to reach the state, run after load: a JSON array of
                         {"click": sel} {"fill": sel, "value": text} {"press": key, "selector"?: sel}
                         {"waitFor": sel} {"goto": url}
  --mask <selector>      cover matching elements in the shot (repeatable), for hiding data
  --viewport-only        shoot the viewport only, not the full page
  --timeout <ms>         load, wait and step timeout, default 30000
  --compare <dir>        after the shots, compare this run's shots in <out> with the same names in <dir>
  --threshold <fraction> for --compare and compare: largest fraction of differing pixels that still passes, default 0.001

compare reports, for each PNG in both folders, changed or unchanged and the fraction of pixels that differ (a size
change counts as fully changed). A before file missing from after fails; files only in after are listed.

Options for every command:
  --project <dir>        project whose Playwright is looked up first, default the current directory

Playwright lookup, in order: the project's playwright-core or playwright (resolved from --project), then the JBIT
cache: $JBIT_CAPTURE_CACHE, else \${XDG_CACHE_HOME:-~/.cache}/jbit/capture (macOS ~/Library/Caches/jbit/capture,
Windows %LOCALAPPDATA%\\jbit\\capture). With neither, nothing is downloaded: install needs the user's yes.

Exit codes: 0 ok; 1 page failed to load, logged a console error or page error, a compare change over the threshold, or a before shot missing from after;
2 usage error or refused URL; 3 no Playwright found; 4 the browser would not launch; 5 install failed.`

class Exit extends Error {
  constructor(code, message) { super(message); this.code = code }
}

// ---------- arguments

const VALUE_FLAGS = new Set(['--name', '--out', '--widths', '--height', '--themes', '--wait-for', '--steps', '--mask', '--timeout', '--compare', '--threshold', '--project'])
const BOOL_FLAGS = new Set(['--viewport-only', '--help', '-h'])

function parseArgs(argv) {
  const opts = { _: [], mask: [] }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (VALUE_FLAGS.has(a)) {
      if (i + 1 >= argv.length) throw new Exit(EXIT.usage, `${a} needs a value`)
      const v = argv[++i]
      if (a === '--mask') opts.mask.push(v)
      else opts[a.slice(2)] = v
    } else if (BOOL_FLAGS.has(a)) opts[a.replace(/^-+/, '')] = true
    else if (a.startsWith('-') && !['--install', '--where'].includes(a)) throw new Exit(EXIT.usage, `unknown option ${a} (see --help)`)
    else opts._.push(a)
  }
  return opts
}

function list(value, fallback) {
  return (value ?? fallback).split(',').map(s => s.trim()).filter(Boolean)
}

function number(value, fallback, name, min, max) {
  const n = value === undefined ? fallback : Number(value)
  if (!Number.isFinite(n) || n < min || n > max) throw new Exit(EXIT.usage, `${name} must be a number from ${min} to ${max}, got ${value}`)
  return n
}

/** A URL to open, or a refusal: only http, https and file. A Windows drive path or an existing local path is a file. */
export function checkUrl(input, base) {
  if (!base) {
    if (/^[a-zA-Z]:[\\/]/.test(input)) return new URL(`file:///${input.replace(/\\/g, '/')}`).href
    if (existsSync(input)) return pathToFileURL(resolve(input)).href
  }
  let url
  try { url = base ? new URL(input, base) : new URL(input) } catch {
    throw new Exit(EXIT.usage, `not a URL or an existing file: ${input}`)
  }
  if (!['http:', 'https:', 'file:'].includes(url.protocol)) throw new Exit(EXIT.usage, `refused URL scheme ${url.protocol} in ${input}: only http, https and file`)
  return url.href
}

/** Text with every URL's user:password dropped and its query values masked, for logs. */
export function redact(text) {
  return String(text).replace(/\b([a-z][a-z0-9+.-]*:\/\/)(?:[^\s/?#@]*@)?([^\s?#)]*)(\?[^\s#)]*)?/gi, (_, scheme, rest, query) =>
    scheme + rest + (query ? '?' + query.slice(1).split('&').map(kv => kv.includes('=') ? `${kv.split('=')[0]}=[masked]` : kv && '[masked]').join('&') : ''))
}

// ---------- Playwright lookup

export function cacheDir(env = process.env, platform = process.platform) {
  if (env.JBIT_CAPTURE_CACHE) return resolve(env.JBIT_CAPTURE_CACHE)
  if (platform === 'darwin') return join(homedir(), 'Library', 'Caches', 'jbit', 'capture')
  if (platform === 'win32') return join(env.LOCALAPPDATA || join(homedir(), 'AppData', 'Local'), 'jbit', 'capture')
  return join(env.XDG_CACHE_HOME || join(homedir(), '.cache'), 'jbit', 'capture')
}

/** The folder holding the package.json of the package whose entry file this is. */
function packageRoot(file, name) {
  let dir = dirname(file)
  while (dir !== dirname(dir)) {
    const pj = join(dir, 'package.json')
    if (existsSync(pj)) {
      try { if (JSON.parse(readFileSync(pj, 'utf8')).name === name) return dir } catch { /* keep looking */ }
    }
    dir = dirname(dir)
  }
  return dirname(file)
}

function version(root) {
  try { return JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version } catch { return 'unknown' }
}

/** Which Playwright would be used: { source: 'project'|'cache', entry, root, name, version, browsers? } or a miss. */
export function findPlaywright(projectDir, cache = cacheDir()) {
  const req = createRequire(join(resolve(projectDir), '__jbit_capture__.js'))
  // only the project's own node_modules: not a parent folder's, NODE_PATH or a global folder (pnpm links resolve inside it)
  let own
  try { own = realpathSync(join(resolve(projectDir), 'node_modules')) + sep } catch { own = null }
  for (const name of own ? ['playwright-core', 'playwright', '@playwright/test'] : []) {
    let entry
    try { entry = req.resolve(name) } catch { continue }
    let real
    try { real = realpathSync(entry) } catch { continue }
    if (!real.startsWith(own)) continue
    const root = packageRoot(entry, name)
    return { source: 'project', name, entry, root, version: version(root) }
  }
  const lib = join(cache, 'lib')
  const root = join(lib, 'node_modules', PACKAGE)
  const browsers = join(cache, 'browsers')
  const hasLib = existsSync(join(root, 'package.json'))
  const hasShell = existsSync(browsers) && readdirSync(browsers).some(n => n.startsWith('chromium_headless_shell-'))
  if (hasLib && hasShell) {
    const entry = createRequire(join(lib, '__jbit_capture__.js')).resolve(PACKAGE)
    if (entry.startsWith(lib)) return { source: 'cache', name: PACKAGE, entry, root: packageRoot(entry, PACKAGE), version: version(root), browsers }
  }
  return { source: null, projectDir: resolve(projectDir), cache, hasLib, hasShell }
}

function missingMessage(found) {
  const partial = found.hasLib || found.hasShell ? ` (incomplete: ${found.hasLib ? '' : `no ${PACKAGE}`}${!found.hasLib && !found.hasShell ? ', ' : ''}${found.hasShell ? '' : 'no Chromium headless shell'})` : ''
  return [
    'No Playwright found: nothing was captured or compared.',
    `  project: no playwright-core, playwright or @playwright/test in ${join(found.projectDir, 'node_modules')}`,
    `  cache:   none at ${found.cache}${partial}`,
    `To take screenshots, \`install\` would download ${PACKAGE}@${PIN} and the Chromium headless shell`,
    `(${DOWNLOAD}) into ${found.cache} — nothing goes into the project.`,
    "That download needs the user's yes. Once they agree, run:",
    `  node ${sq(SELF)} install`,
    'Nothing was downloaded.',
  ].join('\n')
}

function describe(found) {
  if (!found.source) return missingMessage(found)
  const lines = [`playwright: ${found.source} — ${found.name}@${found.version}`, `  module:   ${found.entry}`]
  if (found.browsers) lines.push(`  browsers: ${found.browsers}`)
  else lines.push(`  browsers: the project's own (PLAYWRIGHT_BROWSERS_PATH, else Playwright's default cache)`)
  return lines.join('\n')
}

async function loadPlaywright(projectDir) {
  const found = findPlaywright(projectDir)
  if (!found.source) throw new Exit(EXIT.noPlaywright, missingMessage(found))
  if (found.browsers) process.env.PLAYWRIGHT_BROWSERS_PATH = found.browsers
  const mod = await import(pathToFileURL(found.entry).href)
  const pw = mod.chromium ? mod : mod.default
  if (!pw?.chromium) throw new Exit(EXIT.launch, `${found.entry} has no chromium export`)
  return { pw, found }
}

/** Single-quoted for a POSIX shell, so nothing in a folder name expands. */
const sq = text => `'${String(text).replace(/'/g, `'\\''`)}'`

/** The root command for missing system libraries, for the user to run: never the project's own node_modules code. */
function installDepsCommand() {
  const cli = join(cacheDir(), 'lib', 'node_modules', PACKAGE, 'cli.js')
  if (existsSync(cli)) return `sudo ${sq(process.execPath)} ${sq(cli)} install-deps chromium`
  return `sudo npx playwright@${PIN} install-deps chromium\n  (or first, with the user's yes, node ${sq(SELF)} install — then use the cache's own copy)`
}

async function launch(projectDir) {
  const { pw, found } = await loadPlaywright(projectDir)
  try {
    return { browser: await pw.chromium.launch({ headless: true }), found }
  } catch (err) {
    const msg = String(err?.message ?? err)
    if (/missing dependencies|shared libraries|install-deps/i.test(msg)) {
      throw new Exit(EXIT.launch, [
        `The browser would not launch: this system is missing libraries Chromium needs (${found.source} Playwright).`,
        'Installing them needs root, so this script does not do it. Ask the user to run:',
        `  ${installDepsCommand()}`,
        '',
        msg.split('\n').slice(0, 12).join('\n'),
      ].join('\n'))
    }
    if (/Executable doesn't exist|browserType\.launch.*not found|please run.*install/i.test(msg)) {
      const fix = found.source === 'cache'
        ? `the cache at ${dirname(found.browsers)} has no working browser; with the user's yes run: node ${sq(SELF)} install`
        : `the project's Playwright has no browser installed; the project's own setup installs it (e.g. \`npx playwright install chromium\` in the project), with the user's yes`
      throw new Exit(EXIT.launch, `The browser would not launch: ${fix}\n\n${msg.split('\n').slice(0, 8).join('\n')}`)
    }
    throw new Exit(EXIT.launch, `The browser would not launch (${found.source} Playwright, ${found.entry}):\n${msg}`)
  }
}

// ---------- shot

const STEP_KINDS = ['click', 'fill', 'press', 'waitFor', 'goto']

export function readSteps(file) {
  let steps
  try { steps = JSON.parse(readFileSync(file, 'utf8')) } catch (err) { throw new Exit(EXIT.usage, `can't read steps file ${file}: ${err.message}`) }
  if (!Array.isArray(steps)) throw new Exit(EXIT.usage, `steps file ${file} must hold a JSON array`)
  if (steps.length > 50) throw new Exit(EXIT.usage, `steps file ${file} has ${steps.length} steps; keep it to 50`)
  steps.forEach((s, i) => {
    const kinds = s && typeof s === 'object' ? STEP_KINDS.filter(k => k in s) : []
    if (kinds.length !== 1) throw new Exit(EXIT.usage, `step ${i + 1} must have exactly one of ${STEP_KINDS.join(', ')}: ${JSON.stringify(s)}`)
    const k = kinds[0]
    if (typeof s[k] !== 'string' || !s[k]) throw new Exit(EXIT.usage, `step ${i + 1}: ${k} needs a string`)
    if (k === 'fill' && typeof s.value !== 'string') throw new Exit(EXIT.usage, `step ${i + 1}: fill needs a string "value"`)
  })
  return steps
}

async function runStep(page, step, baseUrl, timeout) {
  if ('click' in step) return page.click(step.click, { timeout })
  if ('fill' in step) return page.fill(step.fill, step.value, { timeout })
  if ('press' in step) return step.selector ? page.press(step.selector, step.press, { timeout }) : page.keyboard.press(step.press)
  if ('waitFor' in step) return page.waitForSelector(step.waitFor, { state: 'visible', timeout })
  if ('goto' in step) {
    const r = await page.goto(checkUrl(step.goto, page.url() || baseUrl), { waitUntil: 'load', timeout })
    if (r && r.status() >= 400) throw new Error(`goto ${step.goto} answered HTTP ${r.status()}`)
  }
}

async function shot(opts) {
  const [target, ...rest] = opts._
  if (!target || rest.length) throw new Exit(EXIT.usage, 'shot takes one URL or file (see --help)')
  const url = checkUrl(target)
  if (!opts.name || !/^[\w.-]+$/.test(opts.name)) throw new Exit(EXIT.usage, '--name is required: letters, digits, ".", "_" or "-"')
  if (!opts.out) throw new Exit(EXIT.usage, '--out <dir> is required')
  const widths = list(opts.widths, '390,1280').map(w => number(w, 0, 'a width', 200, 4000))
  const themes = list(opts.themes, 'light,dark')
  for (const t of themes) if (!['light', 'dark'].includes(t)) throw new Exit(EXIT.usage, `theme must be light or dark, got ${t}`)
  const height = number(opts.height, 800, '--height', 200, 4000)
  const timeout = number(opts.timeout, 30000, '--timeout', 100, 600000)
  const steps = opts.steps ? readSteps(opts.steps) : []
  const threshold = number(opts.threshold, 0.001, '--threshold', 0, 1)
  const out = resolve(opts.out)
  mkdirSync(out, { recursive: true })

  const { browser, found } = await launch(opts.project ?? process.cwd())
  console.log(`Using ${found.source} Playwright ${found.name}@${found.version}`)
  const log = []
  const problems = []
  const written = []
  const note = text => log.push(redact(text))
  const problem = text => problems.push(redact(text))
  const firstLine = err => String(err?.message ?? err).split('\n')[0]
  const logFile = join(out, `${opts.name}-console.txt`)
  try {
    for (const width of widths) {
      for (const theme of themes) {
        const label = `${width} ${theme}`
        note(`== ${opts.name} ${width}px ${theme} — ${url}`)
        let context
        try {
          context = await browser.newContext({ viewport: { width, height }, colorScheme: theme, deviceScaleFactor: 1 })
          const page = await context.newPage()
          page.on('console', m => {
            const loc = m.location?.()
            note(`[console.${m.type()}] ${m.text()}${loc?.url ? ` (${loc.url}:${loc.lineNumber})` : ''}`)
            if (m.type() === 'error') problem(`${label}: console error: ${m.text()}`)
          })
          page.on('pageerror', e => {
            note(`[pageerror] ${e?.message ?? e}`)
            problem(`${label}: page error: ${e?.message ?? e}`)
          })
          page.on('requestfailed', r => note(`[requestfailed] ${r.method()} ${r.url()} — ${r.failure()?.errorText ?? 'failed'}`))
          page.on('response', r => { if (r.status() >= 400) note(`[http ${r.status()}] ${r.request().method()} ${r.url()}`) })
          let response
          try {
            response = await page.goto(url, { waitUntil: 'load', timeout })
          } catch (err) {
            note(`[load failed] ${firstLine(err)}`)
            problem(`${label}: page failed to load: ${firstLine(err)}`)
            continue
          }
          if (response && response.status() >= 400) {
            note(`[load failed] HTTP ${response.status()} for ${url}`)
            problem(`${label}: page failed to load: HTTP ${response.status()} for ${url}`)
            continue
          }
          try {
            for (const step of steps) await runStep(page, step, url, timeout)
            if (opts['wait-for']) await page.waitForSelector(opts['wait-for'], { state: 'visible', timeout })
          } catch (err) {
            note(`[state failed] ${firstLine(err)}`)
            problem(`${label}: couldn't reach the state: ${firstLine(err)}`)
            continue
          }
          const file = join(out, `${opts.name}-${width}-${theme}.png`)
          await page.screenshot({ path: file, fullPage: !opts['viewport-only'], animations: 'disabled', mask: opts.mask.map(sel => page.locator(sel)), timeout })
          written.push(file)
          console.log(`wrote ${file}`)
        } catch (err) {
          note(`[shot failed] ${firstLine(err)}`)
          problem(`${label}: shot failed: ${firstLine(err)}`)
        } finally {
          await context?.close().catch(() => {})
        }
      }
    }
  } finally {
    await browser.close().catch(() => {})
    writeFileSync(logFile, log.join('\n') + '\n')
    console.log(`wrote ${logFile}`)
  }
  console.log(`${written.length} of ${widths.length * themes.length} screenshots taken`)
  let code = EXIT.ok
  if (problems.length) {
    console.error(`FAILED: ${problems.length} problem(s) — see ${logFile}`)
    for (const p of problems) console.error(`  ${p}`)
    code = EXIT.failed
  } else console.log('No load failures, console errors or page errors.')
  if (opts.compare) {
    // only this run's shots: other names and sizes in either folder aren't this run's business
    const only = widths.flatMap(w => themes.map(t => `${opts.name}-${w}-${t}.png`))
    const c = await compare({ _: [opts.compare, out], threshold, project: opts.project, only })
    if (c !== EXIT.ok) code = c
  }
  return code
}

// ---------- compare

function pngs(dir) {
  if (!existsSync(dir) || !statSync(dir).isDirectory()) throw new Exit(EXIT.usage, `not a folder: ${dir}`)
  return readdirSync(dir).filter(n => n.toLowerCase().endsWith('.png')).sort()
}

/** Runs in the page: draw both images on canvases and count pixels whose RGBA differ. */
function diffInPage([a, b]) {
  const load = src => new Promise((ok, fail) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => fail(new Error('not a readable PNG')); i.src = src })
  return Promise.all([load(a), load(b)]).then(([x, y]) => {
    const size = { a: [x.naturalWidth, x.naturalHeight], b: [y.naturalWidth, y.naturalHeight] }
    if (size.a[0] !== size.b[0] || size.a[1] !== size.b[1]) return { sizeChanged: true, size, total: Math.max(size.a[0] * size.a[1], size.b[0] * size.b[1]) }
    const [w, h] = size.a
    const data = img => { const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); g.drawImage(img, 0, 0); return g.getImageData(0, 0, w, h).data }
    const p = data(x)
    const q = data(y)
    let diff = 0
    for (let i = 0; i < p.length; i += 4) if (p[i] !== q[i] || p[i + 1] !== q[i + 1] || p[i + 2] !== q[i + 2] || p[i + 3] !== q[i + 3]) diff++
    return { sizeChanged: false, size, total: w * h, diff }
  })
}

async function compare(opts) {
  const [beforeDir, afterDir, ...rest] = opts._
  if (!beforeDir || !afterDir || rest.length) throw new Exit(EXIT.usage, 'compare takes two folders: <before-dir> <after-dir>')
  const threshold = number(opts.threshold, 0.001, '--threshold', 0, 1)
  const keep = n => !opts.only || opts.only.includes(n)
  const before = pngs(beforeDir).filter(keep)
  const after = pngs(afterDir).filter(keep)
  const both = before.filter(n => after.includes(n))
  const onlyBefore = before.filter(n => !after.includes(n))
  const onlyAfter = after.filter(n => !before.includes(n))
  console.log(`Comparing ${resolve(beforeDir)} (before) with ${resolve(afterDir)} (after), threshold ${threshold}`)
  let over = 0
  if (both.length) {
    const { browser } = await launch(opts.project ?? process.cwd())
    try {
      const page = await browser.newPage()
      await page.setContent('<!doctype html><title>compare</title>')
      for (const name of both) {
        const url = dir => `data:image/png;base64,${readFileSync(join(dir, name)).toString('base64')}`
        let r
        try { r = await page.evaluate(diffInPage, [url(beforeDir), url(afterDir)]) } catch (err) {
          console.log(`error      ${name}: ${String(err?.message ?? err).split('\n')[0]}`)
          over++
          continue
        }
        const fraction = r.sizeChanged ? 1 : r.diff / r.total
        const changed = r.sizeChanged || r.diff > 0
        if (fraction > threshold) over++
        const detail = r.sizeChanged
          ? `size ${r.size.a.join('x')} -> ${r.size.b.join('x')}, fraction 1`
          : `fraction ${fraction.toFixed(6)} (${r.diff} of ${r.total} px)`
        console.log(`${(changed ? 'changed' : 'unchanged').padEnd(10)} ${name}: ${detail}${fraction > threshold ? ' — over threshold' : ''}`)
      }
    } finally {
      await browser.close()
    }
  }
  for (const n of onlyBefore) console.log(`missing from after: ${n}`)
  for (const n of onlyAfter) console.log(`only in after:  ${n}`)
  if (!both.length) console.log('No PNG is in both folders.')
  if (over || onlyBefore.length) {
    if (over) console.error(`FAILED: ${over} of ${both.length} image(s) changed more than the threshold ${threshold}`)
    if (onlyBefore.length) console.error(`FAILED: ${onlyBefore.length} image(s) in before are missing from after: ${onlyBefore.join(', ')}`)
    return EXIT.failed
  }
  console.log(`${both.length} image(s) compared; none over the threshold ${threshold}`)
  return EXIT.ok
}

// ---------- install

function run(cmd, args, env) {
  return new Promise(ok => {
    const child = spawn(cmd, args, { stdio: 'inherit', env: { ...process.env, ...env } })
    child.on('error', err => ok({ code: -1, error: err }))
    child.on('close', code => ok({ code }))
  })
}

/** npm as a command plus args, never through a shell: on Windows the npm-cli.js beside node. */
function npm() {
  if (process.platform !== 'win32') return ['npm', []]
  const cli = join(dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js')
  return [process.execPath, [cli]]
}

async function install() {
  const cache = cacheDir()
  const lib = join(cache, 'lib')
  const browsers = join(cache, 'browsers')
  mkdirSync(lib, { recursive: true })
  console.log(`Installing ${PACKAGE}@${PIN} into ${lib}`)
  const [npmCmd, npmArgs] = npm()
  const a = await run(npmCmd, [...npmArgs, 'i', '--prefix', lib, '--no-save', '--no-package-lock', '--ignore-scripts', '--no-audit', '--no-fund', `${PACKAGE}@${PIN}`])
  if (a.code !== 0) throw new Exit(EXIT.install, `npm install of ${PACKAGE}@${PIN} failed${a.error ? `: ${a.error.message}` : ` (exit ${a.code})`}`)
  const cli = join(lib, 'node_modules', PACKAGE, 'cli.js')
  if (!existsSync(cli)) throw new Exit(EXIT.install, `npm finished but ${cli} is missing`)
  console.log(`Installing the Chromium headless shell into ${browsers}`)
  const b = await run(process.execPath, [cli, 'install', '--only-shell', 'chromium'], { PLAYWRIGHT_BROWSERS_PATH: browsers })
  if (b.code !== 0) throw new Exit(EXIT.install, `the Chromium headless shell install failed${b.error ? `: ${b.error.message}` : ` (exit ${b.code})`}`)
  // the launch check runs against the cache, whatever the project holds
  const found = findPlaywright(join(cache, 'no-project'), cache)
  if (found.source !== 'cache') throw new Exit(EXIT.install, `install finished but the cache at ${cache} is incomplete`)
  process.env.PLAYWRIGHT_BROWSERS_PATH = browsers
  const mod = await import(pathToFileURL(found.entry).href)
  const pw = mod.chromium ? mod : mod.default
  let browser
  try { browser = await pw.chromium.launch({ headless: true }) } catch (err) {
    const msg = String(err?.message ?? err)
    if (/missing dependencies|shared libraries|install-deps/i.test(msg)) {
      throw new Exit(EXIT.launch, `Installed, but Chromium won't launch: this system is missing libraries it needs.\nInstalling them needs root, so this script does not do it. Ask the user to run:\n  ${installDepsCommand()}\n\n${msg.split('\n').slice(0, 12).join('\n')}`)
    }
    throw new Exit(EXIT.launch, `Installed, but Chromium won't launch:\n${msg}`)
  }
  await browser.close()
  console.log(`Installed and launched: ${PACKAGE}@${found.version}, browsers in ${browsers}`)
  return EXIT.ok
}

// ---------- main

export async function main(argv) {
  const opts = parseArgs(argv)
  if (opts.help || opts.h || !opts._.length) { console.log(HELP); return opts._.length || opts.help || opts.h ? EXIT.ok : EXIT.usage }
  const [cmd, ...args] = opts._
  opts._ = args
  if (cmd === 'shot') return shot(opts)
  if (cmd === 'compare' || cmd === '--compare') return compare(opts)
  if (cmd === 'install' || cmd === '--install') return install()
  if (cmd === 'where' || cmd === '--where') {
    const found = findPlaywright(opts.project ?? process.cwd())
    if (found.source) { console.log(describe(found)); return EXIT.ok }
    console.error(describe(found))
    return EXIT.noPlaywright
  }
  throw new Exit(EXIT.usage, `unknown command ${cmd} (see --help)`)
}

const realOrSame = file => { try { return realpathSync(file) } catch { return resolve(file) } }
if (process.argv[1] && realOrSame(process.argv[1]) === realOrSame(SELF)) {
  // `--compare a b` with no command means compare
  const argv = process.argv.slice(2)
  if (argv[0] === '--compare') argv[0] = 'compare'
  main(argv).then(code => { process.exitCode = code }, err => {
    if (err instanceof Exit) { console.error(err.message); process.exitCode = err.code } else { console.error(err?.stack ?? err); process.exitCode = EXIT.failed }
  })
}
