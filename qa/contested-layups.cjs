const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');

function load(before = false) {
  const ctx = vm.createContext({ console, performance: { now: () => 0 }, setTimeout() {}, clearTimeout() {} });
  ctx.window = ctx;
  ctx.PH = { input: { endTick() {}, read: () => ({}), read5: () => ({}) } };
  for (const name of ['tune', 'render', 'roster', 'r5', 'game', 'b5', 'team5']) {
    const source = before && name === 'game' && process.env.LAYUP_BASE
      ? execFileSync('git', ['show', `${process.env.LAYUP_BASE}:js/game.js`], { cwd: root, encoding: 'utf8' })
      : fs.readFileSync(path.join(root, 'js', name + '.js'), 'utf8');
    vm.runInContext(source, ctx, { filename: name + '.js' });
  }
  if (before && !process.env.LAYUP_BASE) ctx.PH.game.K.ctLayCapStart = 1;
  return ctx;
}

function shot(ctx, { mode = '2p', defense = 0.9, rating = 0.7, gap = 0.3, cpu = false, error = 0, variant = 'normal', thru, helper = false } = {}) {
  const gm = ctx.PH.game, dbg = gm._dbg;
  gm.seed(7);
  gm.newGame({ mode: '2p', arch0: 'joe', arch1: 'joe', target: 9999 });
  const [p, d] = gm.G.players;
  Object.assign(gm.G, { mode, phase: 'live', needClear: false });
  Object.assign(p, { x: 0, y: 10, z: 0.15, face: Math.PI / 2, vx: 0, vy: 0, speed: 0, stam: 100, hasBall: true, ctrl: cpu ? 'cpu' : 'p1' });
  Object.assign(d, { x: 0, y: p.y + gap, z: 0, stance: true, stun: 0, off: false, stam: 100, action: null });
  Object.assign(p.r, { lay: rating, close: rating, flo: rating, str: 0.6, badges: [] });
  Object.assign(d.r, { intD: defense, str: 0.6, badges: [] });
  p.arch = { ...p.arch, key: 'qa', _bt: {} };
  d.arch = { ...d.arch, key: 'qa', _bt: {} };
  if (mode === 't5') { p.tm = 0; d.tm = 1; p.opp = d; }
  assert(dbg.startFinish(p, gm.t5.zeroInp(), 'lay'));
  const a = p.action;
  Object.assign(a, { v: variant, skill: null, hzL: 0, ky: false, bump: 0, thru, inSteps: false, t: 0.34 });
  a.V = { ...a.V, name: 'QA layup', c: mode === 't5' ? 0.56 * 1.4 : 1, p: mode === 't5' ? 1.7 : 1, g: 1, blk: 0, floater: variant === 'floater' };
  if (helper) {
    const h = gm.t5.makePlayer(1, 'joe', 'cpu');
    Object.assign(h, { id: 2, tm: 1, x: d.x, y: d.y, z: 0, stance: true, stun: 0, off: false, stam: 100 });
    Object.assign(h.r, { intD: defense, str: 0.6, badges: [] });
    h.arch = { ...h.arch, key: 'qa', _bt: {} };
    gm.G.players.push(h); gm.G.stats.push(gm.t5.newStats());
    d.y = 5;
  }
  gm.CFG.blockMul = 0;
  dbg.releaseShot(p, error, 'lay');
  const info = gm.G.ball.shot.info;
  assert(Number.isFinite(info.prob) && info.prob >= 0 && info.prob <= 1);
  return info;
}

const before = load(true), after = load();
console.log('70 layup/close, front hands-up contest, equal size, green timing; exact make probability');
console.log('Mode  Defense  Contest   Before   After');
for (const mode of ['2p', 't5']) {
  for (const defense of [0.6, 0.85, 0.9]) {
    const opts = { mode, defense }, old = shot(before, opts), now = shot(after, opts);
    console.log(`${mode.padEnd(5)} ${(defense * 100).toFixed(0).padStart(7)} ${(now.contest * 100).toFixed(1).padStart(7)}% ${(old.prob * 100).toFixed(1).padStart(7)}% ${(now.prob * 100).toFixed(1).padStart(6)}%`);
    assert(now.prob >= (defense === 0.6 ? 0.5 : 0.3) && now.prob <= (defense === 0.6 ? 0.6 : 0.45));
    assert.equal(shot(after, { ...opts, cpu: true }).prob, now.prob);
    assert(shot(after, { ...opts, rating: 0.9 }).prob > now.prob);
    for (const variant of ['normal', 'power', 'floater']) {
      assert(shot(after, { ...opts, variant }).prob <= now.prob + 1e-9);
      assert(shot(after, { ...opts, variant, error: 0.9 }).prob <= now.prob + 1e-9);
    }
    assert(shot(after, { ...opts, thru: 'fall' }).prob <= now.prob + 1e-9);
  }
  for (const gap of [2.5, 9]) {
    for (const error of [0, 0.9]) {
      const opts = { mode, gap, error };
      const old = shot(before, opts), now = shot(after, opts);
      assert.equal(now.prob, old.prob);
      if (error === 0) console.log(`${mode.padEnd(5)} ${gap === 9 ? 'open   ' : 'weak   '} ${(now.contest * 100).toFixed(1).padStart(7)}% ${(old.prob * 100).toFixed(1).padStart(7)}% ${(now.prob * 100).toFixed(1).padStart(6)}%`);
    }
  }
}
assert(shot(after, { mode: 't5', helper: true }).prob <= 0.45);
after.PH.game.K.ctLayCapSpan = 0;
assert(Number.isFinite(shot(after).prob));
console.log('PASS contested layups: target ranges, CPU/human parity, rating scaling, power/floater/late timing, through-contact, weak/open unchanged, 5V5 help defense, zero-span guard');
