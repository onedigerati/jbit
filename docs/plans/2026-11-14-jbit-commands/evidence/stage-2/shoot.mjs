import { createRequire } from 'module';
const require = createRequire(process.env.PLAYWRIGHT_MODULES ?? import.meta.url);
const { chromium } = require('playwright');
const url = new URL('../../field-guide.html', import.meta.url).href;
const out = new URL('./', import.meta.url).pathname;
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
const lines = [];
async function page(opts, name){
  const ctx = await browser.newContext(opts);
  const p = await ctx.newPage();
  const errs = [];
  p.on('console', m => { if (m.type()==='error' || m.type()==='warning') errs.push(`${m.type()}: ${m.text()}`); });
  p.on('pageerror', e => errs.push('pageerror: ' + e.message));
  await p.goto(url, { waitUntil: 'networkidle' });
  await p.waitForTimeout(8000); // let the hero typing finish
  const m = await p.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth, innerWidth: window.innerWidth,
    cmd: document.querySelector('#heroCmd').textContent, status: document.querySelector('#heroSt').textContent.replace(/\s+/g,' '),
    hidden: document.querySelectorAll('#heroTerm .hid').length,
    fonts: document.fonts.check('800 16px "Bricolage Grotesque"'),
  }));
  lines.push(`${name}: viewport ${opts.viewport.width}x${opts.viewport.height} scheme=${opts.colorScheme} reducedMotion=${opts.reducedMotion||'no-preference'}`);
  lines.push(`  document.scrollWidth=${m.scrollWidth} innerWidth=${m.innerWidth} -> ${m.scrollWidth<=m.innerWidth?'no horizontal scroll':'HORIZONTAL SCROLL'}`);
  lines.push(`  hero command="${m.cmd}" status="${m.status}" hidden rows=${m.hidden} display font loaded=${m.fonts}`);
  lines.push(`  console errors/warnings: ${errs.length ? errs.join(' | ') : 'none'}`);
  return { p, ctx };
}
const desk = { viewport: { width: 1280, height: 800 } };
let r = await page({ ...desk, colorScheme: 'light' }, 'desktop light');
await r.p.locator('.hero').screenshot({ path: out + 'field-guide-hero-light.png' });
await r.p.locator('#autopilot').screenshot({ path: out + 'field-guide-autopilot.png' });
await r.ctx.close();
r = await page({ ...desk, colorScheme: 'dark' }, 'desktop dark');
await r.p.locator('.hero').screenshot({ path: out + 'field-guide-hero-dark.png' });
await r.p.locator('#autopilot').screenshot({ path: out + 'field-guide-autopilot-dark.png' });
await r.ctx.close();
r = await page({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: 'light' }, 'phone light');
{ const b = await r.p.locator('.hero').boundingBox(); await r.p.screenshot({ path: out + 'field-guide-hero-phone.png', fullPage: true, clip: { x: 0, y: 0, width: 390, height: Math.ceil(b.y + b.height) } }); }
await r.ctx.close();
r = await page({ viewport: { width: 390, height: 844 }, isMobile: true, colorScheme: 'dark', reducedMotion: 'reduce' }, 'phone dark reduced-motion');
await r.ctx.close();
await browser.close();
console.log(lines.join('\n'));
