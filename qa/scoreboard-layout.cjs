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
              if ([...document.querySelectorAll('.scoreboard')].some(e => e.checkVisibility())) throw new Error('Failed playback exposed a scoreboard');
              if (!document.getElementById('tape-list-status').textContent.startsWith('播放失败：')) throw new Error('Missing playback error');
            }
          }
          PH.TAPE.get = async () => ({ name: '布局测试录像', tape });
          await PH.tapeView.load('layout-fixture', 0, false);
          window.advanceTime(0);
          if (!reference && !document.getElementById('tape-state').textContent.includes('比分 ' + tape.frames[0].s.score.join(' : ') + '　比赛时间 ')) throw new Error('Incorrect replay score');
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
            if (e.matches('.shot-tab')) return false;
            const style = getComputedStyle(e);
            if (style.textOverflow === 'ellipsis' && style.overflowX === 'hidden' && style.whiteSpace === 'nowrap') return false;
            const range = document.createRange(); range.selectNodeContents(e);
            return [...range.getClientRects()].some((r) => r.left < bar.getBoundingClientRect().left - 1 ||
              r.right > bar.getBoundingClientRect().right + 1 || r.top < bar.getBoundingClientRect().top - 1 ||
              r.bottom > bar.getBoundingClientRect().bottom + 1);
          }).map((e) => { const range = document.createRange(); range.selectNodeContents(e); return { text: e.textContent, box: rect(e), textBox: rect(range) }; });
          const tab = bar.querySelector('.shot-tab'), center = bar.querySelector('.t5m');
          const names = [...bar.querySelectorAll('.tname,.t5n')];
          return { mode, stage: rect(document.getElementById('stage')), bar: rect(bar), hidden: +getComputedStyle(bar).opacity < 0.01,
            content: bar.textContent, names: names.map(e => e.textContent),
            wrapped: names.some(e => getComputedStyle(e).whiteSpace !== 'nowrap'),
            tab: tab && rect(tab), center: center && rect(center),
            visibleScoreboards: [...document.querySelectorAll('.scoreboard')].filter(e => e.checkVisibility()).length,
            cards: mode === 't5-box' ? [] : cards.filter((e) => e.offsetWidth && +getComputedStyle(e).opacity > 0.01).map(rect),
            fonts: { cards: fonts(cards.flatMap(text)), bar: fonts(visibleText) }, overflow };
        }, mode);
        const check = (m) => {
          if (mode.startsWith('replay-')) {
            assert.equal(m.visibleScoreboards, 0, `scoreboard in playback: ${mode}/${width}`);
            assert(m.content.includes('比分 ') && m.content.includes('比赛时间 '), 'missing bottom-bar replay score');
            return;
          }
          assert(m.fonts.cards.length && m.fonts.bar.length, `missing text measurements: ${mode}/${width}`);
          assert(Math.min(...m.fonts.bar.map((t) => t.size)) > Math.max(...m.fonts.cards.map((t) => t.size)), `font hierarchy: ${mode}/${width}`);
          assert(m.bar.x >= m.stage.x - 1 && m.bar.right <= m.stage.right + 1, `clipped: ${mode}/${width}`);
          assert(Math.abs(m.bar.y - m.stage.y) < 1, `not at top: ${mode}/${width}`);
          assert(Math.abs(m.bar.x + m.bar.width / 2 - m.stage.x - m.stage.width / 2) < 1, `not centered: ${mode}/${width}`);
          assert(!m.content.includes('先到'), `target line: ${mode}/${width}`);
          assert(m.names.every(n => !/^(?:你|电脑|在线|玩家\s*[12]|第\s*\d+\s*关)\s*·/.test(n)), `name prefix: ${mode}/${width}`);
          assert(!m.wrapped, `wrapped names: ${mode}/${width}`);
          assert(m.bar.height <= Math.max(...m.fonts.bar.map(t => t.size)) * 1.5 + 10, `not single-line height: ${mode}/${width}`);
          if (mode.startsWith('t5')) {
            assert(m.tab && m.center, `missing shot tab: ${mode}/${width}`);
            assert(Math.abs(m.tab.y - m.bar.bottom) < 1, `detached shot tab: ${mode}/${width}`);
            assert(Math.abs(m.tab.x + m.tab.width / 2 - m.center.x - m.center.width / 2) < 1, `shot tab not centered: ${mode}/${width}`);
            assert(m.tab.x >= m.stage.x && m.tab.right <= m.stage.right, 'clipped shot tab');
          }
          assert.deepEqual(m.overflow, [], `text overflow: ${mode}/${width}`);
          if (!dimensions.has(width)) dimensions.set(width, { width: m.bar.width, height: m.bar.height });
          assert.deepEqual({ width: m.bar.width, height: m.bar.height }, dimensions.get(width), `unequal dimensions: ${mode}/${width}`);
          assert.equal(m.hidden, ['cpu-highlight', 't3-highlight'].includes(mode), `highlight visibility: ${mode}/${width}`);
          for (const c of m.cards) for (const r of [m.bar, m.tab].filter(Boolean)) assert(!(r.x < c.right && r.right > c.x && r.y < c.bottom && r.bottom > c.y), `card overlap: ${mode}/${width}`);
        };
        const m = await measure();
        if (!reference) check(m);
        metrics.push({ width, ...m });
        if (output) await page.screenshot({ path: path.join(output, `scoreboard_${mode}_${label}_${width}.png`) });
        if (!reference && !mode.startsWith('train') && !mode.startsWith('replay-')) {
          await page.evaluate((mode) => {
            const selector = mode === 't5-box' ? '#b5-head .t5n' : mode.startsWith('t5') ? '#sb5 .t5n' : '#scorebar .tname';
            window.scoreboardNames = [...document.querySelectorAll(selector)].map((element, i) => {
              const text = element.textContent;
              element.textContent = ['维克托文班亚马超长球员名称', '谢伊吉尔杰斯亚历山大超长名称'][i];
              return { element, text };
            });
          }, mode);
          check(await measure());
          await page.evaluate(() => window.scoreboardNames.forEach(({ element, text }) => { element.textContent = text; }));
        }
      }
      if (!reference && ['t5', 't5-box'].includes(mode)) {
        await page.evaluate((mode) => {
          const T = PH.T5.T;
          T.phase = 'live'; T.sclock = 4; PH.game.G.shotClock = 4;
          if (mode === 't5-box') { PH.box5.close(); PH.box5.open(); }
          else window.advanceTime(0);
        }, mode);
        const tab = page.locator(mode === 't5-box' ? '#b5-head .shot-tab' : '#h5sc');
        assert.equal(await tab.textContent(), '4', 'low shot-clock value');
        assert(await tab.evaluate(e => e.classList.contains('low')), 'low shot-clock color');
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
    for (const m of metrics) console.log(m.mode.startsWith('replay-') && !reference ? `${m.mode} ${m.width}: no scoreboard; score in bottom controls` : `${m.mode} ${m.width}: card max ${Math.max(...m.fonts.cards.map((t) => t.size)).toFixed(2)}px; scoreboard min ${Math.min(...m.fonts.bar.map((t) => t.size)).toFixed(2)}px; ${m.bar.width.toFixed(2)} × ${m.bar.height.toFixed(2)}px`);
    console.log(reference ? `Recorded ${metrics.length} reference scenes.` : `PASS: ${metrics.length} scenes across ${modes.length} modes; no prefixes/targets, single-line equal dimensions, attached 5V5 shot tabs, no playback scoreboard, font hierarchy, bounds, top edge, text fit, HUD non-overlap, long names, highlight visibility, empty/error playback, and no browser errors`);
  } finally {
    await browser.close();
  }
})().catch((e) => { console.error(e); process.exitCode = 1; });
