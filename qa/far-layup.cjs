const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
function load(before = false) {
  const ctx = vm.createContext({ console, performance: { now: () => 0 }, setTimeout() {}, clearTimeout() {} });
  ctx.window = ctx; ctx.PH = { input: { endTick() {}, read: () => ({}) } };
  for (const name of ['render', 'tune', 'roster', 'game']) {
    let src = before && name === 'game' ? execFileSync('git', ['show', 'main:js/game.js'], { cwd: root, encoding: 'utf8' }) : fs.readFileSync(path.join(root, 'js', name + '.js'), 'utf8');
    if (name === 'game') src = src.replace('PH.game = {', 'PH.farQA = { laySide, buildSteps, releaseShot, LVR }; PH.game = {');
    vm.runInContext(src, ctx, { filename: name + '.js' });
  }
  return ctx;
}
function setup(ctx, distance = 3.4, rating = 0.9, mode = '2p', cpu = false) {
  const gm = ctx.PH.game;
  gm.newGame({ mode: '2p', arch0: 'joe', arch1: 'joe', target: 9999 });
  Object.assign(gm.G, { mode, phase: 'live', needClear: false });
  const [p, d] = gm.G.players, H = ctx.PH.render.HOOP;
  Object.assign(p, { x: 0, y: H.y - distance, vx: 0, vy: 4, speed: 4, face: Math.PI / 2, hasBall: true, ctrl: cpu ? 'cpu' : 'p1' });
  Object.assign(p.r, { lay: rating, close: rating, str: 0.6, badges: [] });
  Object.assign(d, { x: 0.3, y: p.y + 0.5, off: false, stance: true, action: null });
  Object.assign(d.r, { intD: 0.85, str: 0.6, badges: [] });
  for (const pl of [p, d]) pl.arch = { ...pl.arch, key: 'qa', _bt: {} };
  if (mode === 't5') { p.tm = 0; d.tm = 1; p.opp = d; }
  gm.CFG.blockMul = 0;
  return { gm, p, d, H, P: gm._dbg.finPlan(p) };
}
function action(ctx, f, seed) {
  f.gm.seed(seed);
  const a = { type: 'layup', v: 'normal', sty: 'normal', hand: -1, V: { ...ctx.PH.farQA.LVR.normal }, pts: 2, hzL: 0, t: 0.34, meter: {} };
  ctx.PH.farQA.laySide(f.p, a, f.P, f.d, false);
  a.wp = ctx.PH.farQA.buildSteps(f.p, a, f.P, a.v, 0);
  return a;
}
const before = load(true), after = load();
let count = 0, min = Infinity, max = 0;
for (const mode of ['2p', 't5']) for (const cpu of [false, true]) {
  for (const distance of [2, 2.6, 3, 3.4, 4, 4.1, 5, 6]) {
    const f = setup(after, distance, 0.9, mode, cpu);
    for (let i = 1; i <= 200; i++) {
      const a = action(after, f, i * 100003);
      if (distance < f.gm.K.lvFarMin || distance > f.gm.K.lvFarMax) assert.notEqual(a.lsv, 'far');
      if (a.lsv !== 'far') continue;
      count++; assert.equal(a.wp.length, 2);
      assert(a.wp.every(w => w.T >= f.gm.K.stepT && Math.hypot(w.x - w.fx, w.y - w.fy) > 0.1));
      assert(a.tk <= f.gm.K.lvFarTk * f.gm.K.layK + 1e-9);
      min = Math.min(min, a.tk); max = Math.max(max, a.tk);
    }
  }
}
assert(count > 100);
console.log(`PASS distance gates and two moving gather steps: ${count} far layups; takeoff ${min.toFixed(3)}–${max.toFixed(3)}m (cap ${(after.PH.game.K.lvFarTk * after.PH.game.K.layK).toFixed(3)}m)`);
function rate(ctx, rating, contested, mode, cpu, error) {
  const f = setup(ctx, 3.4, rating, mode, cpu);
  let made = 0, prob = 0, n = 0;
  for (let i = 1; n < 1500; i++) {
    const a = action(ctx, f, i * 100003);
    if (a.lsv !== 'far') continue;
    const w = a.wp.at(-1);
    Object.assign(f.p, { x: 0, y: f.H.y - 1.7, z: 0.15, hasBall: true, action: a });
    Object.assign(f.d, { x: 0, y: f.p.y + 0.3, off: !contested });
    ctx.PH.farQA.releaseShot(f.p, error, 'lay');
    const info = f.gm.G.ball.shot.info;
    made += info.made; prob += info.prob; n++;
    Object.assign(f.p, { x: 0, y: f.H.y - 3.4 });
    Object.assign(f.d, { x: 0.3, y: f.p.y + 0.5, off: false });
  }
  return { made: made / n, prob: prob / n };
}
console.log('Seeded make rates (1500 attempts/cell), before -> after; mean probability in parentheses');
for (const mode of ['2p', 't5']) for (const error of [0, 0.7]) {
  const values = [];
  for (const rating of [0.9, 0.4]) for (const contested of [false, true]) {
    const old = rate(before, rating, contested, mode, false, error);
    const now = rate(after, rating, contested, mode, false, error);
    assert(now.made < old.made); assert(now.prob < old.prob);
    assert.equal(rate(after, rating, contested, mode, true, error).prob, now.prob);
    values.push(now);
    console.log(`${mode} error=${error} ${rating === 0.9 ? 'good' : 'poor'} ${contested ? 'contested' : 'open'}: ${(old.made * 100).toFixed(1)}% -> ${(now.made * 100).toFixed(1)}% (${(old.prob * 100).toFixed(1)}% -> ${(now.prob * 100).toFixed(1)}%)`);
  }
  assert(values[0].made > values[1].made && values[2].made > values[3].made);
  assert(values[0].made > values[2].made && values[1].made > values[3].made);
}
console.log('PASS baseline nerf, contest sensitivity, rating separation, green/late timing and CPU/shared-team release parity');
