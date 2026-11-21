const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const baseline = process.env.DEEP_BASE || '0243ec7^';

function load(before) {
  const ctx = vm.createContext({ console, performance: { now: () => 0 }, setTimeout() {}, clearTimeout() {} });
  ctx.window = ctx;
  ctx.PH = { input: { endTick() {}, read: () => ({}) } };
  for (const name of ['render', 'tune', 'roster', 'game']) {
    let source = before && name === 'game'
      ? execFileSync('git', ['show', `${baseline}:js/game.js`], { cwd: root, encoding: 'utf8' })
      : fs.readFileSync(path.join(root, 'js', name + '.js'), 'utf8');
    if (name === 'game') source = source.replace('PH.game = {', 'PH.deepQA = { startShot, releaseShot }; PH.game = {');
    vm.runInContext(source, ctx, { filename: name + '.js' });
  }
  return ctx;
}

function shot(ctx, rating, badge, distance, error, mode = '2p', variant = 'set', seed = 7, pullup = true) {
  const gm = ctx.PH.game;
  gm.seed(seed);
  gm.newGame({ mode: '2p', arch0: 'curry', arch1: 'gobert', target: 9999 });
  gm.G.mode = mode; gm.G.phase = 'live'; gm.G.needClear = false;
  const [pl, df] = gm.G.players;
  Object.assign(pl, { x: 0, y: ctx.PH.render.HOOP.y - distance, vx: 0, vy: 0, speed: 0, hasBall: true });
  Object.assign(pl.r, { three: rating / 100, badges: (badge ? ['limitless'] : []).concat(pullup ? ['pullup'] : []) });
  pl.arch = { ...pl.arch, key: 'qa', three: rating / 100, _bt: {} };
  pl.sk.ready = false;
  df.off = true;
  if (mode === 't5') { pl.tm = 0; df.tm = 1; pl.opp = df; }
  ctx.PH.deepQA.startShot(pl, { mx: 0, my: 0, dx: 0, dy: 0 }, 'a1', variant);
  pl.action.skill = null;
  gm.seed(seed);
  ctx.PH.deepQA.releaseShot(pl, error, 'shot');
  const info = gm.G.ball.shot.info;
  assert.equal(info.contest, 0);
  assert.equal(info.green, error === 0);
  return { ...info, tier: gm.btier(pl, 'limitless'), pops: (gm.G.bpops || []).map(x => x.key) };
}

const before = load(true), after = load(false);
console.log('Open set shot with pull-up immunity; non-green timing error = 0.35; probability %, before -> after');
console.log('Shooter       Dist    Green             Non-green');
for (const [label, rating, badge, tier] of [['75 none', 75, false, 0], ['Bronze', 84, true, 1], ['Silver', 86, true, 2], ['Gold', 90, true, 3], ['HOF', 95, true, 4]]) {
  for (const distance of [7, 8, 8.5, 9, 9.5]) {
    const old = [0, 0.35].map(e => shot(before, rating, badge, distance, e));
    const now = [0, 0.35].map(e => shot(after, rating, badge, distance, e));
    assert.equal(now[0].tier, tier);
    const fmt = i => `${(old[i].prob * 100).toFixed(1).padStart(5)} -> ${(now[i].prob * 100).toFixed(1).padStart(5)}`;
    console.log(`${label.padEnd(12)} ${distance.toFixed(1)}m  ${fmt(0)}      ${fmt(1)}`);
    if (distance <= 7.5 || tier >= 3 && distance <= 8.5) {
      for (let i = 0; i < 2; i++) assert.equal(now[i].prob, old[i].prob);
      assert.equal(now[0].gw, old[0].gw);
    }
    if (!badge && distance === 8.5) {
      assert(now[0].prob <= 0.45); assert(now[1].prob <= 0.2);
      assert(now[0].gw < old[0].gw);
    }
    for (const e of [0, 0.35]) assert.equal(shot(after, rating, badge, distance, e, 't5').prob, now[e === 0 ? 0 : 1].prob);
  }
}
const far = shot(after, 75, false, 15, 0);
assert.equal(far.prob, after.PH.game.K.smDeepGLo);
assert(far.gw >= 0.012);
const miss = Array.from({ length: 20 }, (_, i) => shot(after, 75, false, 15, 0, '2p', 'set', (i + 1) * 100000)).find(info => !info.made);
assert(miss, 'seed sweep must include a deep green miss');
assert.match(miss.reason, /距离太远/);
for (const e of [0, 0.35]) {
  assert.equal(shot(after, 75, false, 7.5, e, '2p', 'stepback').prob, shot(before, 75, false, 7.5, e, '2p', 'stepback').prob);
}
console.log('PASS deep-three targets, all badge tiers, normal-range/stepback preservation, floors, miss reason, and shared 5V5 release');
for (const distance of [7, 8.5, 15]) for (const error of [0, 0.35]) {
  const immune = shot(after, 75, false, distance, error);
  const ordinary = shot(after, 75, false, distance, error, '2p', 'set', 7, false);
  const expected = Math.max(after.PH.game.K.smMin, immune.prob - 0.05 * Math.min(1, immune.prob / 0.5));
  assert(Math.abs(ordinary.prob - expected) < 1e-9, 'pull-up penalty preserves deep-three scaling/floor');
  assert.equal(ordinary.gw, immune.gw);
}
console.log('PASS non-badge pull-up penalty layered over normal/deep shot probabilities without changing green widths');
for (const [distance, pops] of [[7, false], [7.7, false], [7.9, false], [8.1, true], [8.6, true], [9.5, true]]) {
  for (const rating of [84, 90, 95]) {
    for (const variant of ['set', 'stepback']) {
      assert.equal(shot(after, rating, true, distance, 0.35, '2p', variant).pops.includes('limitless'), pops, `limitless popup at ${distance}m (${variant}, ${rating})`);
    }
  }
  assert.equal(shot(after, 75, false, distance, 0.35).pops.includes('limitless'), false);
}
console.log('PASS infinite-range badge popup only on clearly deep threes (> ' + after.PH.game.K.bgLimPop + 'm), not just behind the arc');

const tune = after.PH.TUNE;
for (const k of ['smDeep', 'smDeepGNear', 'smDeepGRamp', 'smDeepG']) {
  assert.equal(tune.meta('l1_' + k).sub, '命中');
}
let previous = 1;
for (let i = 0; i <= 32; i++) {
  const d = (740 + i * 5) / 100;
  const green = shot(after, 75, false, d, 0), white = shot(after, 75, false, d, 0.35);
  assert(green.prob <= previous, 'green probability should not rise with distance');
  previous = green.prob;
  tune.set('l1_smDeepGRamp', 0);
  const legacyGreen = shot(after, 75, false, d, 0), legacyWhite = shot(after, 75, false, d, 0.35);
  tune.reset('l1_smDeepGRamp');
  assert.equal(white.prob, legacyWhite.prob, 'non-green shots keep the original curve');
  assert.equal(green.gw, legacyGreen.gw, 'timing window must not depend on the make-probability ramp');
  if (i <= 4 || i >= 22) assert.equal(green.prob, legacyGreen.prob);
  else assert(green.prob > legacyGreen.prob, 'only just-deep greens should improve');
}
for (const [d, target] of [[7.8, 0.9486], [8, 0.8449]]) {
  for (const mode of ['2p', 't3', 't5']) {
    const green = shot(after, 75, false, d, 0, mode);
    assert(Math.abs(green.prob - target) < 0.001);
    assert.equal(shot(after, 84, true, d, 0, mode).prob, 1, 'Limitless protects shots within its extended range');
  }
}
assert(Math.abs(shot(after, 84, true, 9.06, 0).prob - shot(after, 84, false, 7.8, 0).prob) < 1e-9,
  'the grace curve starts after the extended Limitless range');
tune.load({ l1_smDeep: 8, l1_smDeepGNear: 0.1 });
assert.equal(shot(after, 75, false, 8, 0).prob, 1, 'saved start-distance override applies');
assert(shot(after, 75, false, 8.01, 0).prob > 0.998, 'saved near-slope override applies');
tune.load({ l1_smDeepG: 0.1 });
assert(Math.abs(shot(after, 75, false, 7.8, 0).prob - 0.98) < 1e-9, 'gentler saved long slope is not overridden');
tune.reset();
console.log('PASS green ramp, saved tuning, unchanged timing windows and long-range odds, and Limitless protection across modes');
