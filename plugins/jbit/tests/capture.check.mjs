// Checks on the verify skill's capture script: `node --test plugins/jbit/tests/capture.check.mjs`.
// `claude plugin test` runs in a sandbox with no file access, so it can't run a browser; these run with Node's own runner.
// Lookup, install and refusal checks use stub packages and need no browser. Browser checks need a real Playwright
// (the project's or the JBIT cache, e.g. JBIT_CAPTURE_CACHE=<dir> after `capture.mjs install`) and are skipped,
// with the reason, when there is none.
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { chmodSync, cpSync, symlinkSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { findPlaywright, cacheDir, checkUrl } from '../skills/verify/scripts/capture.mjs'

const plugin = join(dirname(fileURLToPath(import.meta.url)), '..')
const repo = join(plugin, '..', '..')
const SCRIPT = join(plugin, 'skills', 'verify', 'scripts', 'capture.mjs')
const tmp = mkdtempSync(join(tmpdir(), 'jbit-capture-'))
after(() => rmSync(tmp, { recursive: true, force: true }))
let n = 0
const dir = name => { const d = join(tmp, `${name}-${++n}`); mkdirSync(d, { recursive: true }); return d }

/** Run the script without blocking this process (the fixture server lives here). */
function run(args, { env = {}, cwd = tmp } = {}) {
  return new Promise(ok => {
    const child = spawn(process.execPath, [SCRIPT, ...args], { cwd, env: { ...process.env, ...env } })
    let out = ''
    child.stdout.on('data', d => { out += d })
    child.stderr.on('data', d => { out += d })
    child.on('close', code => ok({ code, out }))
  })
}

// ---------- stubs

/** A fake Playwright package: launch() records the call, and throws `launchError` when given. */
function stubPackage(root, name, { launchError, cli } = {}) {
  mkdirSync(root, { recursive: true })
  writeFileSync(join(root, 'package.json'), JSON.stringify({ name, version: '0.0.0-stub', main: 'index.js' }))
  writeFileSync(join(root, 'index.js'), `const fs = require('fs'), path = require('path')
module.exports = { chromium: { async launch() {
  fs.appendFileSync(path.join(__dirname, 'launched.txt'), 'launch\\n')
  ${launchError ? `throw new Error(${JSON.stringify(launchError)})` : 'return { async close() {} }'}
} } }\n`)
  if (cli) writeFileSync(join(root, 'cli.js'), cli)
}

function stubProject(name = 'playwright-core', opts) {
  const project = dir('project')
  stubPackage(join(project, 'node_modules', name), name, opts)
  return project
}

function stubCache({ lib = true, shell = true } = {}) {
  const cache = dir('cache')
  if (lib) stubPackage(join(cache, 'lib', 'node_modules', 'playwright-core'), 'playwright-core', { cli: '// stub cli\n' })
  if (shell) mkdirSync(join(cache, 'browsers', 'chromium_headless_shell-0'), { recursive: true })
  return cache
}

/** A fake `npm` first on PATH: records its args, and installs a stub playwright-core whose cli.js records its own. */
function fakeNpm() {
  const bin = dir('bin')
  const record = join(bin, 'npm-calls.txt')
  const cli = `const fs = require('fs'), path = require('path')
fs.writeFileSync(path.join(__dirname, 'cli-call.json'), JSON.stringify({ args: process.argv.slice(2), browsers: process.env.PLAYWRIGHT_BROWSERS_PATH }))
fs.mkdirSync(path.join(process.env.PLAYWRIGHT_BROWSERS_PATH, 'chromium_headless_shell-0'), { recursive: true })\n`
  const npm = `#!${process.execPath}
const fs = require('fs'), path = require('path')
const args = process.argv.slice(2)
fs.appendFileSync(${JSON.stringify(record)}, JSON.stringify(args) + '\\n')
const prefix = args[args.indexOf('--prefix') + 1]
const root = path.join(prefix, 'node_modules', 'playwright-core')
fs.mkdirSync(root, { recursive: true })
fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'playwright-core', version: '1.65.0', main: 'index.js' }))
fs.writeFileSync(path.join(root, 'index.js'), "module.exports = { chromium: { async launch() { return { async close() {} } } } }")
fs.writeFileSync(path.join(root, 'cli.js'), ${JSON.stringify(cli)})\n`
  writeFileSync(join(bin, 'npm'), npm)
  chmodSync(join(bin, 'npm'), 0o755)
  return { env: { PATH: `${bin}:${process.env.PATH}` }, record }
}

const unix = process.platform === 'win32' ? 'the fake npm is a POSIX executable' : false

// ---------- lookup, install, refusals (no browser)

test('lookup: the project\'s playwright-core comes before the cache', async () => {
  const project = stubProject()
  const r = await run(['where', '--project', project], { env: { JBIT_CAPTURE_CACHE: stubCache() } })
  assert.equal(r.code, 0, r.out)
  assert.match(r.out, /playwright: project — playwright-core@0\.0\.0-stub/)
  assert.ok(r.out.includes(join(project, 'node_modules', 'playwright-core')), r.out)
})

test('lookup: the project\'s playwright package counts too', async () => {
  const r = await run(['where', '--project', stubProject('playwright')], { env: { JBIT_CAPTURE_CACHE: stubCache() } })
  assert.equal(r.code, 0, r.out)
  assert.match(r.out, /playwright: project — playwright@/)
})

test('lookup: with none in the project, a complete cache install is used, with its own browsers path', async () => {
  const cache = stubCache()
  const r = await run(['where', '--project', dir('empty')], { env: { JBIT_CAPTURE_CACHE: cache } })
  assert.equal(r.code, 0, r.out)
  assert.match(r.out, /playwright: cache — playwright-core@/)
  assert.ok(r.out.includes(join(cache, 'browsers')), r.out)
})

test('lookup: a cache without the headless shell is not used', async () => {
  const r = await run(['where', '--project', dir('empty')], { env: { JBIT_CAPTURE_CACHE: stubCache({ shell: false }) } })
  assert.equal(r.code, 3, r.out)
  assert.match(r.out, /incomplete: no Chromium headless shell/)
})

test('cache location: JBIT_CAPTURE_CACHE, else XDG_CACHE_HOME or the platform cache folder', () => {
  assert.equal(cacheDir({ JBIT_CAPTURE_CACHE: '/x/y' }, 'linux'), '/x/y')
  assert.equal(cacheDir({ XDG_CACHE_HOME: '/xdg' }, 'linux'), join('/xdg', 'jbit', 'capture'))
  assert.match(cacheDir({}, 'darwin'), /Library[\\/]Caches[\\/]jbit[\\/]capture$/)
  assert.match(cacheDir({ LOCALAPPDATA: 'C:\\L' }, 'win32'), /jbit[\\/]capture$/)
})

test('no Playwright anywhere: exits 3, says what install would download and that it needs a yes, downloads nothing', { skip: unix }, async () => {
  const npm = fakeNpm()
  const cache = join(tmp, `absent-cache-${++n}`)
  const out = join(tmp, `out-${n}`)
  const a = dir('a'), b = dir('b')
  for (const d of [a, b]) writeFileSync(join(d, 'x.png'), '') // compare launches only for a PNG in both
  for (const args of [['shot', 'http://127.0.0.1:9/', '--name', 'x', '--out', out], ['compare', a, b]]) {
    const r = await run([...args, '--project', dir('empty')], { env: { ...npm.env, JBIT_CAPTURE_CACHE: cache } })
    assert.equal(r.code, 3, r.out)
    assert.match(r.out, /No Playwright found/)
    assert.match(r.out, /playwright-core@1\.65\.0/)
    assert.match(r.out, /about 130 MB/)
    assert.match(r.out, /needs the user's yes/)
    assert.match(r.out, /capture\.mjs' install/)
    assert.match(r.out, /Nothing was downloaded/)
  }
  assert.ok(!existsSync(npm.record), 'npm was run')
  assert.ok(!existsSync(cache), 'the cache was created')
  assert.ok(!existsSync(out) || readdirSync(out).length === 0, 'files were written')
})

test('install: npm into <cache>/lib with the pinned version, then the shell-only Chromium into <cache>/browsers', { skip: unix }, async () => {
  const npm = fakeNpm()
  const cache = join(tmp, `install-cache-${++n}`)
  const r = await run(['install'], { env: { ...npm.env, JBIT_CAPTURE_CACHE: cache } })
  assert.equal(r.code, 0, r.out)
  const calls = readFileSync(npm.record, 'utf8').trim().split('\n').map(l => JSON.parse(l))
  assert.equal(calls.length, 1)
  const args = calls[0]
  assert.deepEqual(args.slice(0, 3), ['i', '--prefix', join(cache, 'lib')])
  for (const a of ['--no-save', '--no-package-lock', '--ignore-scripts', 'playwright-core@1.65.0']) assert.ok(args.includes(a), `npm args lack ${a}: ${args}`)
  const cli = JSON.parse(readFileSync(join(cache, 'lib', 'node_modules', 'playwright-core', 'cli-call.json'), 'utf8'))
  assert.deepEqual(cli.args, ['install', '--only-shell', 'chromium'])
  assert.equal(cli.browsers, join(cache, 'browsers'))
  assert.match(r.out, /Installed and launched/)
  const w = await run(['where', '--project', dir('empty')], { env: { JBIT_CAPTURE_CACHE: cache } })
  assert.match(w.out, /playwright: cache/)
})

test('missing system libraries: the install-deps command is printed for the user, not run', async () => {
  const project = stubProject('playwright-core', {
    launchError: 'browserType.launch: \nHost system is missing dependencies to run browsers.\nPlease install them with: sudo npx playwright install-deps',
    cli: `require('fs').writeFileSync(require('path').join(__dirname, 'cli-ran.txt'), process.argv.join(' '))\n`,
  })
  const pkg = join(project, 'node_modules', 'playwright-core')
  const r = await run(['shot', 'http://127.0.0.1:9/', '--name', 'x', '--out', dir('out'), '--project', project], { env: { JBIT_CAPTURE_CACHE: join(tmp, 'no-cache') } })
  assert.equal(r.code, 4, r.out)
  assert.match(r.out, /missing libraries/)
  assert.ok(!r.out.includes(join(pkg, 'cli.js')), `suggests root running the project's own code: ${r.out}`)
  assert.ok(r.out.includes('npx playwright@1.65.0 install-deps chromium'), r.out)
  assert.doesNotMatch(r.out, /sudo [^\n]*"/, 'a double-quoted path in a sudo command')
  assert.match(r.out, /needs root, so this script does not do it/)
  assert.ok(!existsSync(join(pkg, 'cli-ran.txt')), 'the Playwright CLI was run')
  assert.equal(readFileSync(join(pkg, 'launched.txt'), 'utf8'), 'launch\n')
  assert.doesNotMatch(readFileSync(SCRIPT, 'utf8'), /run\([^)]*install-deps/, 'the script spawns install-deps')
})

test('missing system libraries with a cache: the cache\'s own cli, single-quoted, never the project\'s', async () => {
  const project = stubProject('playwright-core', { launchError: 'Host system is missing dependencies to run browsers.' })
  const cache = stubCache()
  const r = await run(['shot', 'http://127.0.0.1:9/', '--name', 'x', '--out', dir('out'), '--project', project], { env: { JBIT_CAPTURE_CACHE: cache } })
  assert.equal(r.code, 4, r.out)
  const cli = join(cache, 'lib', 'node_modules', 'playwright-core', 'cli.js')
  assert.ok(r.out.includes(`sudo '${process.execPath}' '${cli}' install-deps chromium`), r.out)
  assert.ok(!r.out.includes(join(project, 'node_modules')), r.out)
})

test('lookup: only the project\'s own node_modules counts, not a parent folder\'s or NODE_PATH', async () => {
  const parent = stubProject()
  const child = join(parent, 'app')
  mkdirSync(child)
  const elsewhere = stubProject()
  const r = await run(['where', '--project', child], { env: { JBIT_CAPTURE_CACHE: stubCache(), NODE_PATH: join(elsewhere, 'node_modules') } })
  assert.equal(r.code, 0, r.out)
  assert.match(r.out, /playwright: cache/)
})

test('lookup: @playwright/test in the project counts (pnpm projects)', async () => {
  const r = await run(['where', '--project', stubProject('@playwright/test')], { env: { JBIT_CAPTURE_CACHE: stubCache() } })
  assert.equal(r.code, 0, r.out)
  assert.match(r.out, /playwright: project — @playwright\/test@/)
})

test('lookup: a pnpm-style symlinked package under the project\'s node_modules counts', async () => {
  const project = dir('pnpm')
  const store = join(project, 'node_modules', '.pnpm', 'playwright-core@1.0.0', 'node_modules', 'playwright-core')
  stubPackage(store, 'playwright-core')
  symlinkSync(store, join(project, 'node_modules', 'playwright-core'), 'dir')
  const r = await run(['where', '--project', project], { env: { JBIT_CAPTURE_CACHE: stubCache() } })
  assert.match(r.out, /playwright: project/, r.out)
})

test('runs when reached through a symlink', async () => {
  const link = join(dir('link'), 'scripts')
  symlinkSync(dirname(SCRIPT), link, 'dir')
  const child = await new Promise(ok => {
    const c = spawn(process.execPath, [join(link, 'capture.mjs'), '--help'])
    let out = ''
    c.stdout.on('data', d => { out += d })
    c.on('close', code => ok({ code, out }))
  })
  assert.equal(child.code, 0)
  assert.match(child.out, /Usage:/)
})

test('local paths are files: Windows drive paths and existing paths with a colon', async () => {
  assert.equal(checkUrl('C:\\site\\index.html'), 'file:///C:/site/index.html')
  assert.equal(checkUrl('d:/a b/x.html'), 'file:///d:/a%20b/x.html')
  const cwd = dir('colon')
  writeFileSync(join(cwd, 'x:y.html'), '<p>hi</p>')
  const project = stubProject('playwright-core', { launchError: 'stub launch reached' })
  const r = await run(['shot', 'x:y.html', '--name', 'x', '--out', dir('out'), '--project', project], { cwd })
  assert.equal(r.code, 4, r.out) // got past the URL check to the (stub) launch
  assert.match(r.out, /stub launch reached/)
})

test('URL schemes other than http, https and file are refused before anything runs', async () => {
  const project = stubProject()
  for (const url of ['javascript:alert(1)', 'data:text/html,hi', 'ftp://example.com/', 'chrome://settings']) {
    const r = await run(['shot', url, '--name', 'x', '--out', dir('out'), '--project', project])
    assert.equal(r.code, 2, `${url}: ${r.out}`)
    assert.match(r.out, /refused URL scheme/)
  }
  assert.ok(!existsSync(join(project, 'node_modules', 'playwright-core', 'launched.txt')), 'a browser was launched')
})

test('steps files are checked: a JSON array of known actions', async () => {
  const project = stubProject()
  for (const steps of ['{}', '[{"click":"a","fill":"b"}]', '[{"hover":"a"}]', '[{"fill":"#a"}]', 'nope']) {
    const file = join(dir('steps'), 's.json')
    writeFileSync(file, steps)
    const r = await run(['shot', 'http://127.0.0.1:9/', '--name', 'x', '--out', dir('out'), '--steps', file, '--project', project])
    assert.equal(r.code, 2, `${steps}: ${r.out}`)
  }
})

test('the host build\'s import check finds no bare package import in the script', () => {
  const build = readFileSync(join(repo, 'hosts', 'build.mjs'), 'utf8')
  const src = build.match(/function specifiers\(source\) \{[\s\S]*?\n\}\n/)
  assert.ok(src, 'hosts/build.mjs no longer has function specifiers(source)')
  const specifiers = new Function(`${src[0]}; return specifiers`)()
  assert.deepEqual(specifiers(readFileSync(SCRIPT, 'utf8')).bare, [])
  // the check bites: a bare import, static or dynamic, is caught
  assert.deepEqual(specifiers("import { chromium } from 'playwright-core'\n").bare, ['playwright-core'])
  assert.deepEqual(specifiers("const p = await import('playwright')\n").bare, ['playwright'])
})

// ---------- browser checks

const realPw = findPlaywright(join(tmp, 'no-project'))
const noBrowser = realPw.source ? false : `no Playwright found (project or cache at ${realPw.cache}); run capture.mjs install with JBIT_CAPTURE_CACHE set to enable the browser checks`
const pwEnv = {}
const browserRun = (args, opts) => run([...args, '--project', join(tmp, 'no-project')], opts)

const PAGE = (body, script = '') => `<!doctype html><html><head><meta charset="utf-8"><title>fixture</title>
<style>
  :root { color-scheme: light dark; }
  body { margin: 0; font: 16px sans-serif; background: #ffffff; color: #111111; }
  @media (prefers-color-scheme: dark) { body { background: #000000; color: #eeeeee; } }
  .box { height: 600px; padding: 20px; }
  #secret { background: #c00; color: #fff; padding: 8px; }
  #done { display: none; }
</style></head><body><div class="box">${body}</div><script>${script}</script></body></html>`

const routes = {
  '/': PAGE('<h1>Fixture</h1><p id="secret">4111 1111 1111 1111</p>', "console.log('fixture ready')"),
  '/steps': PAGE('<button id="go">Go</button><p id="done">Done</p>', "document.getElementById('go').onclick = () => { document.getElementById('done').style.display = 'block' }"),
  '/console-error': PAGE('<p>errs</p>', "console.error('boom from fixture')"),
  '/leak?token=sekret&x=1': PAGE('<img src="/missing.png?key=apikey123">'),
  '/page-error': PAGE('<p>throws</p>', "throw new Error('uncaught in fixture')"),
}
let server
let base
before(async () => {
  server = createServer((req, res) => {
    const page = routes[req.url]
    res.writeHead(page ? 200 : 404, { 'content-type': page ? 'text/html' : 'text/plain' })
    res.end(page ?? 'not found')
  })
  await new Promise(ok => server.listen(0, '127.0.0.1', ok))
  base = `http://127.0.0.1:${server.address().port}`
})
after(() => server?.close())

const pngWidth = file => readFileSync(file).readUInt32BE(16)
const isPng = file => readFileSync(file).subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
let shots // the folder from the 2x2 capture, reused by the compare checks

test('capture: a local page at 2 widths x 2 themes, with PNGs and a console log', { skip: noBrowser }, async () => {
  shots = dir('shots')
  const r = await browserRun(['shot', `${base}/`, '--name', 'home', '--out', shots, '--widths', '390,1280', '--themes', 'light,dark'], { env: pwEnv })
  assert.equal(r.code, 0, r.out)
  assert.match(r.out, /4 of 4 screenshots taken/)
  for (const w of [390, 1280]) for (const t of ['light', 'dark']) {
    const f = join(shots, `home-${w}-${t}.png`)
    assert.ok(existsSync(f) && isPng(f), `${f} missing or not a PNG`)
    assert.equal(pngWidth(f), w)
  }
  const log = readFileSync(join(shots, 'home-console.txt'), 'utf8')
  assert.equal(log.match(/\[console\.log\] fixture ready/g)?.length, 4, log)
  for (const s of ['390px light', '390px dark', '1280px light', '1280px dark']) assert.ok(log.includes(s), `${s} not in log`)
})

test('capture: light and dark really differ (prefers-color-scheme)', { skip: noBrowser }, async () => {
  assert.ok(shots, 'the capture check did not run')
  const a = dir('light'), b = dir('dark')
  cpSync(join(shots, 'home-390-light.png'), join(a, 'x.png'))
  cpSync(join(shots, 'home-390-dark.png'), join(b, 'x.png'))
  const r = await browserRun(['compare', a, b], { env: pwEnv })
  assert.equal(r.code, 1, r.out)
  const m = r.out.match(/changed\s+x\.png: fraction ([\d.]+)/)
  assert.ok(m && Number(m[1]) > 0.5, r.out)
})

test('compare: identical folders pass and say unchanged; files in one folder are listed', { skip: noBrowser }, async () => {
  assert.ok(shots, 'the capture check did not run')
  const copy = dir('copy')
  cpSync(shots, copy, { recursive: true })
  rmSync(join(copy, 'home-1280-dark.png'))
  writeFileSync(join(copy, 'extra.png'), readFileSync(join(shots, 'home-390-light.png')))
  const r = await browserRun(['compare', shots, copy], { env: pwEnv })
  assert.equal(r.code, 1, r.out) // a before shot missing from after fails
  assert.equal(r.out.match(/^unchanged\s+home-\d+-\w+\.png: fraction 0\.000000/gm)?.length, 3, r.out)
  assert.match(r.out, /missing from after: home-1280-dark\.png/)
  assert.match(r.out, /only in after: +extra\.png/)
  const back = dir('back')
  cpSync(copy, back, { recursive: true })
  rmSync(join(back, 'extra.png'))
  const ok = await browserRun(['compare', back, copy], { env: pwEnv })
  assert.equal(ok.code, 0, ok.out) // only-in-after is informational
  assert.match(ok.out, /only in after: +extra\.png/)
})

test('compare: a change over the threshold fails, under it passes, and a size change counts as changed', { skip: noBrowser }, async () => {
  assert.ok(shots, 'the capture check did not run')
  const a = dir('a'), b = dir('b')
  cpSync(join(shots, 'home-390-light.png'), join(a, 'p.png'))
  cpSync(join(shots, 'home-390-dark.png'), join(b, 'p.png'))
  cpSync(join(shots, 'home-390-light.png'), join(a, 's.png'))
  cpSync(join(shots, 'home-1280-light.png'), join(b, 's.png'))
  const over = await browserRun(['--compare', a, b], { env: pwEnv })
  assert.equal(over.code, 1, over.out)
  assert.match(over.out, /FAILED: 2 of 2 image\(s\) changed more than the threshold 0\.001/)
  assert.match(over.out, /changed\s+s\.png: size 390x\d+ -> 1280x\d+, fraction 1/)
  rmSync(join(a, 's.png'))
  const under = await browserRun(['compare', a, b, '--threshold', '0.99'], { env: pwEnv })
  assert.equal(under.code, 0, under.out)
  assert.match(under.out, /^changed\s+p\.png: fraction/m)
})

test('capture: --compare checks the new shots against a before folder', { skip: noBrowser }, async () => {
  assert.ok(shots, 'the capture check did not run')
  const r = await browserRun(['shot', `${base}/`, '--name', 'home', '--out', dir('again'), '--widths', '390', '--themes', 'light', '--compare', shots], { env: pwEnv })
  assert.equal(r.code, 0, r.out)
  assert.match(r.out, /^unchanged\s+home-390-light\.png/m)
})

test('capture: steps, wait-for and mask reach a state and hide data', { skip: noBrowser }, async () => {
  const steps = join(dir('steps'), 'steps.json')
  writeFileSync(steps, JSON.stringify([{ click: '#go' }, { waitFor: '#done' }]))
  const out = dir('state')
  const r = await browserRun(['shot', `${base}/steps`, '--name', 'state', '--out', out, '--widths', '390', '--themes', 'light', '--steps', steps, '--wait-for', '#done'], { env: pwEnv })
  assert.equal(r.code, 0, r.out)
  assert.ok(existsSync(join(out, 'state-390-light.png')))
  const stuck = await browserRun(['shot', `${base}/`, '--name', 'stuck', '--out', dir('stuck'), '--widths', '390', '--themes', 'light', '--wait-for', '#never', '--timeout', '500'], { env: pwEnv })
  assert.equal(stuck.code, 1, stuck.out)
  assert.match(stuck.out, /couldn't reach the state/)
  const plain = dir('plain'), masked = dir('masked')
  for (const [o, extra] of [[plain, []], [masked, ['--mask', '#secret']]]) {
    const m = await browserRun(['shot', `${base}/`, '--name', 'm', '--out', o, '--widths', '390', '--themes', 'light', ...extra], { env: pwEnv })
    assert.equal(m.code, 0, m.out)
  }
  const c = await browserRun(['compare', plain, masked], { env: pwEnv })
  assert.match(c.out, /^changed\s+m-390-light\.png/m, 'the mask changed nothing')
})

test('failures are loud: HTTP 404 and a network error fail the load, with a non-zero exit', { skip: noBrowser }, async () => {
  const out = dir('fail')
  const r = await browserRun(['shot', `${base}/missing`, '--name', 'gone', '--out', out, '--widths', '390', '--themes', 'light'], { env: pwEnv })
  assert.equal(r.code, 1, r.out)
  assert.match(r.out, /page failed to load: HTTP 404/)
  assert.match(readFileSync(join(out, 'gone-console.txt'), 'utf8'), /\[load failed\] HTTP 404/)
  assert.ok(!existsSync(join(out, 'gone-390-light.png')))
  const closed = createServer()
  await new Promise(ok => closed.listen(0, '127.0.0.1', ok))
  const port = closed.address().port
  await new Promise(ok => closed.close(ok))
  const net = await browserRun(['shot', `http://127.0.0.1:${port}/`, '--name', 'down', '--out', dir('down'), '--widths', '390', '--themes', 'light'], { env: pwEnv })
  assert.equal(net.code, 1, net.out)
  assert.match(net.out, /page failed to load: .*ERR_CONNECTION_REFUSED/)
})

test('failures are loud: a console error or page error exits non-zero and is logged', { skip: noBrowser }, async () => {
  const out = dir('errs')
  const r = await browserRun(['shot', `${base}/console-error`, '--name', 'ce', '--out', out, '--widths', '390', '--themes', 'light'], { env: pwEnv })
  assert.equal(r.code, 1, r.out)
  assert.match(r.out, /console error: boom from fixture/)
  assert.match(readFileSync(join(out, 'ce-console.txt'), 'utf8'), /\[console\.error\] boom from fixture/)
  assert.ok(existsSync(join(out, 'ce-390-light.png')), 'the shot is still taken')
  const p = await browserRun(['shot', `${base}/page-error`, '--name', 'pe', '--out', out, '--widths', '390', '--themes', 'light'], { env: pwEnv })
  assert.equal(p.code, 1, p.out)
  assert.match(p.out, /page error: uncaught in fixture/)
  assert.match(readFileSync(join(out, 'pe-console.txt'), 'utf8'), /\[pageerror\] uncaught in fixture/)
})

test('a bad mask selector is a per-shot problem: console log still written, exit 1, no stack', { skip: noBrowser }, async () => {
  const out = dir('badmask')
  const r = await browserRun(['shot', `${base}/`, '--name', 'bm', '--out', out, '--widths', '390', '--themes', 'light,dark', '--mask', '[[[', '--timeout', '2000'], { env: pwEnv })
  assert.equal(r.code, 1, r.out)
  assert.match(r.out, /390 light: shot failed:/)
  assert.match(r.out, /390 dark: shot failed:/)
  assert.doesNotMatch(r.out, /^\s+at /m, 'a stack trace')
  assert.ok(existsSync(join(out, 'bm-console.txt')))
})

test('the console log hides credentials and query values in URLs', { skip: noBrowser }, async () => {
  const out = dir('leak')
  const url = base.replace('http://', 'http://alice:hunter2@') + '/leak?token=sekret&x=1'
  const r = await browserRun(['shot', url, '--name', 'lk', '--out', out, '--widths', '390', '--themes', 'light'], { env: pwEnv })
  const log = readFileSync(join(out, 'lk-console.txt'), 'utf8')
  for (const text of [log, r.out]) {
    assert.doesNotMatch(text, /hunter2|alice|sekret|apikey123/, text)
  }
  assert.match(log, /token=\[masked\]/)
  assert.match(log, /\[http 404\][^\n]*missing\.png\?key=\[masked\]/)
})

test('a file URL is captured', { skip: noBrowser }, async () => {
  const page = join(dir('file'), 'page.html')
  writeFileSync(page, routes['/'])
  const out = dir('fileout')
  const r = await browserRun(['shot', pathToFileURL(page).href, '--name', 'f', '--out', out, '--widths', '390', '--themes', 'dark'], { env: pwEnv })
  assert.equal(r.code, 0, r.out)
  assert.ok(existsSync(join(out, 'f-390-dark.png')))
})
