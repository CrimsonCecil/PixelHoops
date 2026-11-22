const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { chromium } = require('playwright');

const base = process.env.BASE_URL || 'http://127.0.0.1:8080';
const output = process.env.SCOREBOARD_OUTPUT;
const reference = process.env.SCOREBOARD_REFERENCE;
const label = process.env.SCOREBOARD_LABEL || 'after';
const modes = ['cpu', '2p', 't3', 't5', 'king', 'train', 'train-def', 'online', 'online-t3',
  'replay-cpu', 'replay-2p', 'replay-t3', 'replay-t5', 'replay-train', 't5-box', 'cpu-highlight', 't3-highlight', 't5-highlight'];

(async () => {
  const browser = await chromium.launch({ headless: true });
  const metrics = [];
  const dimensions = new Map();
  const sourceFiles = new Map();
  try {
    for (const mode of modes) {
      const gameMode = mode.startsWith('replay-') ? mode.slice(7) : mode === 'online-t3' ? 't3' : mode === 'online' ? 'cpu' : mode.split('-')[0];
      const page = await browser.newPage({ viewport: { width: 1568, height: 900 } });
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await page.route('**/*', async (route) => {
        const url = new URL(route.request().url());
        if (url.origin !== new URL(base).origin && !url.hostname.endsWith('jsdelivr.net')) return route.abort();
        if (reference && url.origin === new URL(base).origin && (url.pathname === '/' || /\.(html|css|js)$/.test(url.pathname))) {
          const file = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
          if (!sourceFiles.has(file)) sourceFiles.set(file, execFileSync('git', ['show', reference + ':' + file], { cwd: path.join(__dirname, '..') }));
          return route.fulfill({ contentType: file.endsWith('.css') ? 'text/css' : file.endsWith('.js') ? 'application/javascript' : 'text/html', body: sourceFiles.get(file) });
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
      if (gameMode !== 'cpu') await page.getByTestId('mode-' + gameMode).click();
      if (mode.startsWith('online')) {
        if (mode === 'online') await page.getByTestId('mode-online').click();
        await page.evaluate(() => {
          PH.rooms.open = (code, mode, handlers) => {
            Object.assign(PH.rooms.room, { role: 'guest', active: true });
            handlers.joined(0);
            handlers.start({ mode, arch0: 'wemby', arch1: 'sga', target: 21, clock: 24, diff: 1, fb: 'simple',
              slots: ['wemby', 'curry', 'lebron', 'sga', 'durant', 'jokic'].map((arch, i) => ({ arch, role: i ? 'cpu' : 'human' })) });
          };
        });
        await page.locator('#room-code').fill('ABCDE');
        await page.locator('#btn-room-join').click();
      } else {
        await page.getByTestId('btn-start').click();
        if (mode === 'king') await page.getByTestId('king-go').click();
      }
      await page.evaluate(() => { PH.game.introEnd(); window.advanceTime(4100); });
      await page.evaluate(() => { for (let i = 0; i < 24; i++) window.advanceTime(0); });
      if (gameMode === 'train') {
        if (mode === 'train-def') await page.getByTestId('tr-role-def').click();
        await page.locator('#tr-fold').click();
        await page.evaluate(() => { for (let i = 0; i < 12; i++) window.advanceTime(0); });
      }
      if (mode.startsWith('replay-')) {
        await page.evaluate(async (reference) => {
          const tape = JSON.parse(JSON.stringify(PH.TAPE.finish()));
          if (!tape.frames.length) throw new Error('No recorded frames for playback fixture');
          if (!reference) {
            for (const get of [async () => ({ tape: { frames: [] } }), async () => { throw new Error('布局测试读取失败'); }]) {
              PH.TAPE.get = get;
              await PH.tapeView.load('invalid-layout-fixture', 0, false);
              if (!document.getElementById('tape-scorebar').classList.contains('hidden')) throw new Error('Failed playback exposed a scoreboard');
              if (!document.getElementById('tape-list-status').textContent.startsWith('播放失败：')) throw new Error('Missing playback error');
            }
          }
          PH.TAPE.get = async () => ({ name: '布局测试录像', tape });
          await PH.tapeView.load('layout-fixture', 0, false);
          window.advanceTime(0);
          if (!reference && [0, 1].some((i) => +document.getElementById('tape-s' + i).textContent !== tape.frames[0].s.score[i])) throw new Error('Incorrect replay score');
        }, !!reference);
      }
      if (mode === 't5-box') {
        await page.locator('#btn-pause5').click();
        await page.locator('#btn-box5').click();
      }
      if (mode.endsWith('-highlight')) {
        await page.evaluate((mode) => {
          const G = PH.game.G;
          if (mode === 't5-highlight') {
            const R = PH.render5.rpl;
            const tick = () => { R.rT = G.time; PH.T5.tick(1 / 60); };
            const a = G.players.find((p) => p.tm === G.off && !p.off), d = G.players.find((p) => p.tm !== G.off && !p.off);
            G.thruMk = { t: G.time, x: a.x, y: a.y, off: G.off, pid: a.id, did: d.id, k: 'fall' };
            for (let i = 0; i < 12; i++) tick();
            PH.game.t5.scoreBy(a.id, 2, 'dunk');
            for (let i = 0; i < 180 && !R.on; i++) tick();
            for (let i = 0; i < 50 && !R.view; i++) tick();
            if (!R.view) throw new Error('5V5 highlight did not start');
          } else {
            G.hlQ = { t: G.time - 1, pid: 0, k: 'fall' }; G.vopt.replay = true; G.phase = 'dead'; G.phaseT = 0.5;
            PH.game.t5.trackReplay(); window.advanceTime(900);
            if (!G.replay?.view) throw new Error('Highlight did not start');
          }
          window.advanceTime(0);
        }, mode);
        if (mode !== 't5-highlight') await page.waitForFunction(() => +getComputedStyle(document.getElementById('scorebar')).opacity < 0.01);
      }
      await page.evaluate(() => document.fonts.ready);
      for (const width of [1568, 800, 390]) {
        await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
        await page.evaluate(() => { window.dispatchEvent(new Event('resize')); window.advanceTime(0); });
        const measure = () => page.evaluate((mode) => {
          const rect = (e) => {
            const r = e.getBoundingClientRect();
            return { x: r.x, y: r.y, width: r.width, height: r.height, right: r.right, bottom: r.bottom };
          };
          const bar = document.getElementById(mode.startsWith('replay-') ? (document.getElementById('tape-scorebar') ? 'tape-scorebar' : 'tape-state') :
            mode.startsWith('train') ? 'trainbar' : mode === 't5-box' ? 'b5-head' : mode.startsWith('t5') ? 'sb5' : 'scorebar');
          const cards = [0, 1].map((i) => document.getElementById((mode.includes('t5') ? 'pc5' : 'pc') + i));
          const text = (root) => [root, ...root.querySelectorAll('*')].filter((e) =>
            [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()));
          const fonts = (elements) => elements.map((e) => ({ text: e.textContent, size: parseFloat(getComputedStyle(e).fontSize) }));
          const visibleText = text(bar).filter((e) => e.getClientRects().length);
          const overflow = visibleText.filter((e) => {
            const range = document.createRange(); range.selectNodeContents(e);
            return [...range.getClientRects()].some((r) => r.left < bar.getBoundingClientRect().left - 1 ||
              r.right > bar.getBoundingClientRect().right + 1 || r.top < bar.getBoundingClientRect().top - 1 ||
              r.bottom > bar.getBoundingClientRect().bottom + 1);
          }).map((e) => { const range = document.createRange(); range.selectNodeContents(e); return { text: e.textContent, box: rect(e), textBox: rect(range) }; });
          return { mode, stage: rect(document.getElementById('stage')), bar: rect(bar), hidden: +getComputedStyle(bar).opacity < 0.01,
            cards: mode === 't5-box' ? [] : cards.filter((e) => e.offsetWidth && +getComputedStyle(e).opacity > 0.01).map(rect),
            fonts: { cards: fonts(cards.flatMap(text)), bar: fonts(visibleText) }, overflow };
        }, mode);
        const check = (m) => {
          assert(m.fonts.cards.length && m.fonts.bar.length, `missing text measurements: ${mode}/${width}`);
          assert(Math.min(...m.fonts.bar.map((t) => t.size)) > Math.max(...m.fonts.cards.map((t) => t.size)), `font hierarchy: ${mode}/${width}`);
          assert(m.bar.x >= m.stage.x - 1 && m.bar.right <= m.stage.right + 1, `clipped: ${mode}/${width}`);
          assert(Math.abs(m.bar.y - m.stage.y) < 1, `not at top: ${mode}/${width}`);
          assert.deepEqual(m.overflow, [], `text overflow: ${mode}/${width}`);
          if (!dimensions.has(width)) dimensions.set(width, { width: m.bar.width, height: m.bar.height });
          assert.deepEqual({ width: m.bar.width, height: m.bar.height }, dimensions.get(width), `unequal dimensions: ${mode}/${width}`);
          assert.equal(m.hidden, ['cpu-highlight', 't3-highlight'].includes(mode), `highlight visibility: ${mode}/${width}`);
          for (const c of m.cards) assert(!(m.bar.x < c.right && m.bar.right > c.x && m.bar.y < c.bottom && m.bar.bottom > c.y), `card overlap: ${mode}/${width}`);
        };
        const m = await measure();
        if (!reference) check(m);
        metrics.push({ width, ...m });
        if (output) await page.screenshot({ path: path.join(output, `scoreboard_${mode}_${label}_${width}.png`) });
        if (!reference && !mode.startsWith('train')) {
          await page.evaluate((mode) => {
            const selector = mode.startsWith('replay-') ? '#tape-scorebar .tname' : mode === 't5-box' ? '#b5-head > span' : mode.startsWith('t5') ? '#sb5 .t5n' : '#scorebar .tname';
            window.scoreboardNames = [...document.querySelectorAll(selector)].map((element, i) => {
              const text = element.textContent;
              element.textContent = ['玩家 1 · 文班亚马', '第 2 关 · 亚历山大'][i];
              return { element, text };
            });
          }, mode);
          check(await measure());
          await page.evaluate(() => window.scoreboardNames.forEach(({ element, text }) => { element.textContent = text; }));
        }
      }
      if (!reference && mode.startsWith('replay-')) {
        await page.evaluate(async () => { PH.TAPE.list = async () => []; await PH.tapeView.list(); });
        assert(await page.locator('#tape-scorebar').isHidden(), 'playback scoreboard persists in replay list');
        await page.locator('#tape-list-close').click();
        assert(await page.locator('#tape-scorebar').isHidden(), 'playback scoreboard persists after exit');
      }
      assert.deepEqual(errors, [], 'browser runtime errors');
      await page.close();
    }
    if (output) fs.writeFileSync(path.join(output, `scoreboard_${label}_metrics.json`), JSON.stringify(metrics, null, 2));
    for (const m of metrics) console.log(`${m.mode} ${m.width}: card max ${Math.max(...m.fonts.cards.map((t) => t.size)).toFixed(2)}px; scoreboard min ${Math.min(...m.fonts.bar.map((t) => t.size)).toFixed(2)}px; ${m.bar.width.toFixed(2)} × ${m.bar.height.toFixed(2)}px`);
    console.log(reference ? `Recorded ${metrics.length} reference scenes.` : `PASS: ${metrics.length} scenes across ${modes.length} modes; equal dimensions, font hierarchy, bounds, top edge, text fit, HUD non-overlap, long names, replay visibility, empty/error playback, and no browser errors`);
  } finally {
    await browser.close();
  }
})().catch((e) => { console.error(e); process.exitCode = 1; });
