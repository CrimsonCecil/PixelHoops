const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { chromium } = require('playwright');

const base = process.env.BASE_URL || 'http://127.0.0.1:8080';
const output = process.env.SCOREBOARD_OUTPUT;
const reference = process.env.SCOREBOARD_REFERENCE;
const label = process.env.SCOREBOARD_LABEL || 'after';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const metrics = [];
  try {
    for (const mode of ['cpu', '2p', 't3', 't5']) {
      const page = await browser.newPage({ viewport: { width: 1568, height: 900 } });
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await page.route('**/*', async (route) => {
        const url = new URL(route.request().url());
        if (url.origin !== new URL(base).origin && !url.hostname.endsWith('jsdelivr.net')) return route.abort();
        if (reference && url.pathname === '/style.css') {
          const body = execFileSync('git', ['show', reference + ':style.css'], { cwd: path.join(__dirname, '..') });
          return route.fulfill({ contentType: 'text/css', body });
        }
        return route.continue();
      });
      await page.addInitScript(() => {
        let seed = 13579;
        Math.random = () => ((seed = seed * 16807 % 2147483647) - 1) / 2147483646;
      });
      await page.goto(base);
      await page.waitForFunction(() => !!window.advanceTime);
      await page.evaluate(() => window.advanceTime(0));
      if (mode !== 'cpu') await page.getByTestId('mode-' + mode).click();
      await page.getByTestId('btn-start').click();
      await page.evaluate(() => { PH.game.introEnd(); window.advanceTime(4100); });
      await page.evaluate(() => document.fonts.ready);
      for (const width of [1568, 800, 390]) {
        await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
        await page.evaluate(() => { window.dispatchEvent(new Event('resize')); window.advanceTime(0); });
        const measure = () => page.evaluate((mode) => {
          const rect = (e) => {
            const r = e.getBoundingClientRect();
            return { x: r.x, y: r.y, width: r.width, height: r.height, right: r.right, bottom: r.bottom };
          };
          const bar = document.getElementById(mode === 't5' ? 'sb5' : 'scorebar');
          const cards = [0, 1].map((i) => document.getElementById((mode === 't5' ? 'pc5' : 'pc') + i));
          const text = (root) => [...root.querySelectorAll('*')].filter((e) =>
            [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()));
          const fonts = (elements) => elements.map((e) => ({ text: e.textContent, size: parseFloat(getComputedStyle(e).fontSize) }));
          const visibleText = text(bar).filter((e) => e.getClientRects().length);
          const overflow = visibleText.filter((e) => {
            const range = document.createRange(); range.selectNodeContents(e);
            return [...range.getClientRects()].some((r) => r.left < bar.getBoundingClientRect().left - 1 ||
              r.right > bar.getBoundingClientRect().right + 1 || r.top < bar.getBoundingClientRect().top - 1 ||
              r.bottom > bar.getBoundingClientRect().bottom + 1);
          }).map((e) => { const range = document.createRange(); range.selectNodeContents(e); return { text: e.textContent, box: rect(e), textBox: rect(range) }; });
          return { mode, stage: rect(document.getElementById('stage')), bar: rect(bar),
            cards: cards.filter((e) => e.offsetWidth).map(rect),
            fonts: { cards: fonts(cards.flatMap(text)), bar: fonts(visibleText) }, overflow };
        }, mode);
        const check = (m) => {
          assert(m.fonts.cards.length && m.fonts.bar.length, 'missing text measurements');
          assert(Math.min(...m.fonts.bar.map((t) => t.size)) > Math.max(...m.fonts.cards.map((t) => t.size)), `font hierarchy: ${mode}/${width}`);
          assert(m.bar.x >= m.stage.x - 1 && m.bar.right <= m.stage.right + 1, `clipped: ${mode}/${width}`);
          assert(Math.abs(m.bar.y - m.stage.y) < 1, `not at top: ${mode}/${width}`);
          assert.deepEqual(m.overflow, [], `text overflow: ${mode}/${width}`);
          for (const c of m.cards) assert(!(m.bar.x < c.right && m.bar.right > c.x && m.bar.y < c.bottom && m.bar.bottom > c.y), `card overlap: ${mode}/${width}`);
        };
        const m = await measure();
        if (!reference) check(m);
        metrics.push({ width, ...m });
        if (output) await page.screenshot({ path: path.join(output, `scoreboard_${mode}_${label}_${width}.png`) });
        if (!reference && mode !== 't5') {
          await page.evaluate(() => {
            window.scoreboardNames = ['n0', 'n1'].map((id) => document.getElementById(id).textContent);
            document.getElementById('n0').textContent = '玩家 1 · 文班亚马';
            document.getElementById('n1').textContent = '第 2 关 · 亚历山大';
          });
          check(await measure());
          await page.evaluate(() => ['n0', 'n1'].forEach((id, i) => { document.getElementById(id).textContent = window.scoreboardNames[i]; }));
        }
      }
      assert.deepEqual(errors, [], 'browser runtime errors');
      await page.close();
    }
    if (output) fs.writeFileSync(path.join(output, `scoreboard_${label}_metrics.json`), JSON.stringify(metrics, null, 2));
    for (const m of metrics) console.log(`${m.mode} ${m.width}: card max ${Math.max(...m.fonts.cards.map((t) => t.size)).toFixed(2)}px; scoreboard min ${Math.min(...m.fonts.bar.map((t) => t.size)).toFixed(2)}px; ${m.bar.width.toFixed(2)} × ${m.bar.height.toFixed(2)}px`);
    console.log(reference ? 'Recorded 12 reference scenes.' : 'PASS: 12 scenes; font hierarchy, bounds, top edge, text fit, HUD non-overlap, long names, and no browser errors');
  } finally {
    await browser.close();
  }
})().catch((e) => { console.error(e); process.exitCode = 1; });
