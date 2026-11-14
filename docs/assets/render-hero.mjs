// Renders the field guide's hero (wordmark, brand line, promise, terminal) to the README banner images.
// Run: PLAYWRIGHT_MODULES=<playwright node_modules> CHROMIUM_PATH=<chromium> node docs/assets/render-hero.mjs
import { createRequire } from 'module'
const require = createRequire(process.env.PLAYWRIGHT_MODULES ?? import.meta.url)
const { chromium } = require('playwright')
const url = new URL('../field-guide.html', import.meta.url).href
const out = new URL('./', import.meta.url).pathname
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH })
for (const scheme of ['light', 'dark']) {
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 800 }, deviceScaleFactor: 2, colorScheme: scheme, reducedMotion: 'reduce' })
  const p = await ctx.newPage()
  await p.goto(url, { waitUntil: 'networkidle' })
  await p.evaluate(() => document.fonts.ready)
  // the banner is the brand and the terminal: the lede and the note stay as README text
  await p.addStyleTag({ content: '.hero .lede, .hero .hero-note { display: none !important } .hero { padding: 40px 48px !important; margin: 0 !important; max-width: none !important; border: 0 !important }' })
  await p.waitForTimeout(500)
  // trim the top edge, which can catch the rule above the hero (as render-hero-animated.mjs does)
  const box = await p.locator('.hero').boundingBox()
  await p.screenshot({ path: `${out}jbit-hero-${scheme}.png`, animations: 'disabled', clip: { x: box.x, y: box.y + 3, width: box.width, height: box.height - 3 } })
  await ctx.close()
}
await browser.close()
