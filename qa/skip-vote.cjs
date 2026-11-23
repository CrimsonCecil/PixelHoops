// 在线真人 1V1：进场动画要两人都按任意键才跳过；左上角「跳过 ○ n/2」计票
const assert = require('node:assert/strict');
const { chromium } = require('playwright');

const base = process.env.BASE_URL || 'http://127.0.0.1:8080';
const shots = process.env.SKIP_VOTE_SHOTS;

async function joinRoom(page, slot) {
  await page.goto(base);
  await page.waitForFunction(() => !!window.advanceTime);
  await page.evaluate(() => window.advanceTime(0));
  await page.getByTestId('home-online').click();
  await page.evaluate((slot) => {
    window.__out = [];
    PH.rooms.open = (code, mode, handlers) => {
      window.__h = handlers;
      Object.assign(PH.rooms.room, { role: slot ? 'guest' : 'host', active: true, code: 'ABCDE' });
      if (!slot) PH.rooms.room.links.set(1, { conn: { open: true, send() {} }, input: null, last: 0 });
      PH.rooms.broadcast = (msg) => window.__out.push(msg);
      PH.rooms.skip = (scene) => window.__out.push({ type: 'skip', scene });
      PH.rooms.input = () => {};
      handlers.joined(slot);
      handlers.start({ mode, arch0: 'wemby', arch1: 'sga', target: 21, clock: 24, glen: 0, diff: 1, fb: 'simple' });
    };
  }, slot);
  await page.locator('.front-direct summary:visible').click();
  await page.locator('#front-direct-mode').selectOption('online');
  await page.locator('#front-direct-code').fill('ABCDE');
  await page.locator('#front-direct-join').click();
}

// 房主 → 客机：skip 计票 + state；客机 → 房主：skip 投票
async function pump(host, guest) {
  const down = await host.evaluate(() => window.__out.splice(0));
  const up = await guest.evaluate(() => window.__out.splice(0));
  await guest.evaluate((msgs) => { for (const m of msgs) if (m.type === 'skip') window.__h.skip(m); else if (m.type === 'state') window.__h.state(m.state); }, down);
  await host.evaluate((msgs) => { for (const m of msgs) if (m.type === 'skip') window.__h.skip(m, 1); }, up);
}
async function press(page, key) {
  await page.bringToFront();
  await page.keyboard.press(key);
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
}
const step = (page, ms = 50) => page.evaluate((ms) => window.advanceTime(ms), ms);
const view = (page) => page.evaluate(() => {
  const el = document.getElementById('skipvote'), hint = document.getElementById('intro-skip');
  return { intro: !!PH.game.G.intro, shown: getComputedStyle(el).display !== 'none', n: el.textContent.trim(), cls: el.className,
    hint: getComputedStyle(hint).display !== 'none' };
});
async function shot(page, name) {
  if (shots) await page.screenshot({ path: `${shots}/${name}.png` });
}

(async () => {
  const browser = await chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) });
  const errors = [];
  try {
    const [host, guest] = await Promise.all([0, 1].map(() => browser.newPage({ viewport: { width: 1280, height: 720 } })));
    for (const page of [host, guest]) {
      page.on('pageerror', (e) => errors.push(e.message));
      await page.route('**/*', (route) => new URL(route.request().url()).origin === new URL(base).origin ? route.continue() : route.abort());
    }
    await joinRoom(host, 0);
    await joinRoom(guest, 1);
    await step(host, 800); await step(guest, 800);

    for (const page of [host, guest]) {
      const v = await view(page);
      assert.ok(v.intro, 'online intro plays');
      assert.ok(v.shown && !v.hint, 'vote chip replaces the single-player skip hint');
      assert.match(v.n, /跳过\s*0\/2/); assert.equal(v.cls, 's0');
    }
    await shot(host, 'vote-0');

    await press(host, 'Escape');
    await step(host); await pump(host, guest); await step(guest);
    for (const page of [host, guest]) assert.equal((await view(page)).cls, 's1', 'first vote shows 1/2 on both screens');
    await shot(host, 'vote-1');
    await press(host, 'Space');
    await step(host, 400); await pump(host, guest);
    assert.ok((await view(host)).intro && (await view(guest)).intro, 'one vote does not skip the intro');
    assert.match((await view(host)).n, /1\/2/, 'repeat presses count once');

    await press(guest, 'KeyA');
    await step(guest); await pump(host, guest); await step(host, 16); await pump(host, guest); await step(guest, 16);
    for (const page of [host, guest]) assert.equal((await view(page)).cls, 's2', 'second vote fills the circle green');
    await shot(guest, 'vote-2');
    assert.ok((await view(host)).intro, 'green 2/2 holds briefly before the skip');

    for (let i = 0; i < 6; i++) { await step(host, 100); await pump(host, guest); await step(guest, 16); }
    assert.ok(!(await view(host)).intro, 'host skips after both votes');
    assert.ok(!(await view(guest)).intro, 'guest follows the host out of the intro');
    for (const page of [host, guest]) assert.ok(!(await view(page)).shown, 'vote chip hides after the intro');
    await shot(guest, 'after-skip');

    // 本地 1V1 不投票：Esc 仍一键跳过
    const local = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    local.on('pageerror', (e) => errors.push(e.message));
    await local.goto(base);
    await local.waitForFunction(() => !!window.advanceTime);
    await local.evaluate(() => window.advanceTime(0));
    await local.getByTestId('home-solo').click();
    await local.getByTestId('solo-1v1').click();
    await local.getByTestId('mode-2p').click();
    await local.getByTestId('btn-start').click();
    await step(local, 500);
    let v = await view(local);
    assert.ok(v.intro && !v.shown && v.hint, 'local 1V1 keeps the old skip hint');
    await press(local, 'Escape'); await step(local);
    assert.ok(!(await view(local)).intro, 'local 1V1 Esc still skips at once');

    assert.deepEqual(errors, []);
    console.log('skip vote ok');
  } finally { await browser.close(); }
})().catch((e) => { console.error(e); process.exit(1); });
