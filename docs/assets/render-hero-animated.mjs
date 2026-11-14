// Renders the field guide's hero animation (the command typed, stages ticking off) to animated WebP banners for the
// READMEs, light and dark. The page runs on Playwright's fake clock, so each frame is taken when the terminal changes
// and keeps the real timing; the end state holds with a blinking caret, then the loop starts again.
// Run: PLAYWRIGHT_MODULES=<playwright node_modules> SHARP_MODULES=<sharp node_modules> CHROMIUM_PATH=<chromium> \
//      node docs/assets/render-hero-animated.mjs
import { createRequire } from 'module'
const { chromium } = createRequire(process.env.PLAYWRIGHT_MODULES ?? import.meta.url)('playwright')
const sharp = createRequire(process.env.SHARP_MODULES ?? import.meta.url)('sharp')
const url = new URL('../field-guide.html', import.meta.url).href
const out = new URL('./', import.meta.url).pathname
const STEP = 5 // ms of page time per check for a change
const HOLD = 1100 // the end state: caret on, then off, this long each…
const BLINKS = 3 // …this many times before the loop restarts
const START_HOLD = 900 // the empty prompt before typing starts

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH })
for (const scheme of ['light', 'dark']) {
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 800 }, deviceScaleFactor: 2, colorScheme: scheme })
  const p = await ctx.newPage()
  await p.clock.install({ time: 0 })
  await p.clock.pauseAt(1) // time moves only when this script says, from before the page's first script
  await p.goto(url, { waitUntil: 'networkidle' })
  await p.evaluate(() => document.fonts.ready)
  // the banner is the brand and the terminal, as in render-hero.mjs; the caret's blink is drawn as frames below
  await p.addStyleTag({ content: '.hero .lede, .hero .hero-note { display: none !important } .hero { padding: 40px 48px !important; margin: 0 !important; max-width: none !important; border: 0 !important } .caret { animation: none !important }' })
  const hero = p.locator('.hero')
  const state = () => p.evaluate(() => document.querySelector('#heroTerm').innerHTML)
  const frames = [] // { buf, ms }
  const shot = () => hero.screenshot({ animations: 'disabled' })
  let last = await state(), since = 0
  frames.push({ buf: await shot(), ms: 0 })
  for (let t = 0; t < 15000; t += STEP) {
    await p.clock.runFor(STEP)
    since += STEP
    const now = await state()
    if (now === last) continue
    frames.at(-1).ms = since
    frames.push({ buf: await shot(), ms: 0 })
    last = now
    since = 0
  }
  frames[0].ms = Math.max(frames[0].ms, START_HOLD)
  // the end state: the last frame is the caret on; add caret-off frames to blink it
  frames.at(-1).ms = HOLD
  await p.addStyleTag({ content: '.caret { visibility: hidden !important }' })
  const off = await shot()
  const on = frames.at(-1).buf
  for (let i = 0; i < BLINKS; i++) frames.push({ buf: off, ms: HOLD }, ...(i < BLINKS - 1 ? [{ buf: on, ms: HOLD }] : []))
  const meta = await sharp(frames[0].buf).metadata()
  // the top few device pixels can catch the edge of the rule above the hero while the page settles: crop them
  const TRIM = 6, h = meta.height - TRIM
  const raws = await Promise.all(frames.map(f => sharp(f.buf).resize(meta.width, meta.height).extract({ left: 0, top: TRIM, width: meta.width, height: h }).raw().ensureAlpha().toBuffer()))
  const strip = Buffer.concat(raws)
  await sharp(strip, { raw: { width: meta.width, height: h * frames.length, channels: 4, pageHeight: h } })
    .webp({ lossless: true, effort: 6, loop: 0, delay: frames.map(f => Math.max(20, Math.round(f.ms))) })
    .toFile(`${out}jbit-hero-${scheme}.webp`)
  console.log(`${scheme}: ${frames.length} frames, ${frames.reduce((a, f) => a + f.ms, 0)} ms per loop`)
  await ctx.close()
}
await browser.close()
