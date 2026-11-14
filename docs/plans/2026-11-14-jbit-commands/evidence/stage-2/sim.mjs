import { createRequire } from 'module';
const require = createRequire(process.env.PLAYWRIGHT_MODULES ?? import.meta.url);
const { chromium } = require('playwright');
const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
for (const say of ['plain', 'jbit']) {
  const p = await b.newPage(); const errs = [];
  p.on('pageerror', e => errs.push(e.message)); p.on('console', m => m.type() === 'error' && errs.push(m.text()));
  await p.goto(new URL('../../field-guide.html', import.meta.url).href);
  await p.click(`#segSay button[data-v="${say}"]`); await p.click('#segSpeed button[data-v="2.5"]'); await p.click('#sPlay');
  if (say === 'plain') { await p.waitForSelector('#reply.on', { timeout: 60000 }); await p.click('#reply button[data-r="jbi"]'); }
  await p.waitForFunction(() => document.querySelector('#sPlay').disabled, null, { timeout: 90000 });
  const held = await p.evaluate(() => [...document.querySelectorAll('#log div')].some(d => d.textContent.includes('Stage 3 is held')));
  const dec = await p.evaluate(() => [...document.querySelectorAll('#planfile .ln')].map(d => d.textContent).filter(t => t.includes('2026-11-10')));
  console.log(`sim "${say}": finished; stage 3 held=${held}; decisions=${JSON.stringify(dec)}; errors=${errs.length ? errs.join(' | ') : 'none'}`);
  await p.close();
}
await b.close();
