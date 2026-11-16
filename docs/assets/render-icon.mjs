// Renders the JBIT icon (the dark-mode JBIT. wordmark on a square) to plugins/jbit/.claude-plugin/icon.png (plugin listings)
// and favicon.png at the repo root (the project logo T3 Code and similar tools pick up).
// Run: PLAYWRIGHT_MODULES=<playwright node_modules> CHROMIUM_PATH=<chromium> node docs/assets/render-icon.mjs
import { createRequire } from 'module'
const require = createRequire(process.env.PLAYWRIGHT_MODULES ?? import.meta.url)
const { chromium } = require('playwright')
const out = new URL('../../plugins/jbit/.claude-plugin/icon.png', import.meta.url).pathname
const html = `<!doctype html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,800&display=swap">
<style>
  html,body{margin:0;width:512px;height:512px;background:#0E1A22}
  body{display:flex;align-items:center;justify-content:center}
  .mark{font-family:"Bricolage Grotesque",system-ui,sans-serif;font-weight:800;font-size:250px;letter-spacing:-.04em;line-height:1;color:#E3ECF1;margin:0 0 0 12px}
  .dot{color:#EE9450}
</style></head><body><h1 class="mark">JBIT<span class="dot">.</span></h1></body></html>`
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH })
const p = await browser.newPage({ viewport: { width: 512, height: 512 }, deviceScaleFactor: 2 })
await p.setContent(html, { waitUntil: 'networkidle' })
await p.evaluate(() => document.fonts.ready)
await p.screenshot({ path: out })
await p.screenshot({ path: new URL('../../favicon.png', import.meta.url).pathname })
await browser.close()
