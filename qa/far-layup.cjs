const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
function load(before = false) {
  const ctx = vm.createContext({ console, performance: { now: () => 0 }, setTimeout() {}, clearTimeout() {} });
  ctx.window = ctx; ctx.PH = { input: { endTick() {}, read: () => ({}) } };
  for (const name of ['render', 'tune', 'roster', 'r5', 'game', 'b5', 'team5']) {
    let src = before && ['game', 'render'].includes(name) ? execFileSync('git', ['show', `main:js/${name}.js`], { cwd: root, encoding: 'utf8' }) : fs.readFileSync(path.join(root, 'js', name + '.js'), 'utf8');
    if (name === 'game') src = src.replace('PH.game = {', 'PH.farQA = { laySide, buildSteps, releaseShot, LVR, poseTarget, updatePlayer, stepPose, cvSet }; PH.game = {');
    if (name === 'team5') src = src.replace('PH.T5 = {', 'PH.farTeamQA = (g) => { G = g; T.tm = [0, 1].map(tm => ({ on: g.players.filter(p => p.tm === tm) })); shotAdj(); }; PH.T5 = {');
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
{
  const f = setup(after, 3.4, 0.9, 't5');
  let a;
  for (let i = 1; !a || a.lsv !== 'far'; i++) a = action(after, f, i * 100003);
  Object.assign(f.p, { x: 0, y: f.H.y - 1.7, z: 0.15, action: a });
  f.d.off = true;
  f.gm.G.off = 0;
  const initial = a.V.p;
  after.PH.farTeamQA(f.gm.G);
  assert(Math.abs(a.V.p / initial - 1.7) < 1e-9, 'exercise real team5 shotAdj');
  after.PH.farQA.releaseShot(f.p, 0, 'lay');
  const prob = f.gm.G.ball.shot.info.prob, cap = f.gm.K.lvFarP + f.gm.K.lvFarLay * (f.p.r.lay - 0.75);
  console.log(`5V5 calibrated open green: prob=${prob.toFixed(4)}, far cap=${cap.toFixed(4)}`);
  assert(prob <= cap + 1e-9, 'team5 saturation cannot bypass the far-hand multiplier');
}
{
  const f = setup(after), Q = after.PH.farQA;
  let a;
  for (let i = 1; !a || a.lsv !== 'far'; i++) a = action(after, f, i * 100003);
  Q.cvSet(f.p, a, 'scoop');
  assert.equal(a.lsv, '', 'CV conversion clears the visual variant');
  Object.assign(f.p, { y: f.H.y - 1.7, z: 0.15, action: a });
  f.d.off = true;
  Q.releaseShot(f.p, 0, 'lay');
  const prob = f.gm.G.ball.shot.info.prob, cap = f.gm.K.lvFarP + f.gm.K.lvFarLay * (f.p.r.lay - 0.75);
  console.log(`CV-converted far scoop: prob=${prob.toFixed(4)}, far cap=${cap.toFixed(4)}`);
  assert(prob <= cap + 1e-9, 'CV conversion must preserve the originating far-hand penalty');
}
{
  const f = setup(after), Q = after.PH.farQA, tune = after.PH.TUNE;
  Object.assign(f.p, { anim: 'layup', speed: 0, action: { type: 'layup', v: 'normal', sty: 'high', lsv: 'far', side: 1, hand: 1, ideal: 0.34, t: 0.2 } });
  const original = tune.get('l1_lvFarKnee'), knees = [];
  try {
    for (const value of [0.35, 0.8]) {
      tune.set('l1_lvFarKnee', value);
      assert.equal(f.gm.K.lvFarKnee, value, 'slider updates the cached game tunable');
      const T = Q.poseTarget(f.p);
      knees.push(Math.max(T.lA, T.rA));
    }
  } finally { tune.set('l1_lvFarKnee', original); }
  console.log(`Airborne knee slider 0.35 -> 0.80: ${knees.map(k => k.toFixed(3)).join(' -> ')}rad`);
  assert(Math.abs(knees[0] - 0.35) < 1e-9 && Math.abs(knees[1] - 0.8) < 1e-9, 'airborne pose follows the live slider');
}
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

function poseMetrics(ctx) {
  const f = setup(ctx), Q = ctx.PH.farQA;
  let peak = 0, gatherPeak = 0, recovery = 0;
  let a;
  for (let i = 1; !a || a.lsv !== 'far'; i++) a = action(ctx, f, i * 100003);
  Object.assign(a, { lsv: 'far', side: 1, hand: 1, sty: 'high', ideal: 0.34, si: 0, st: 0 });
  Object.assign(f.p, { action: a, anim: 'layup', speed: 0 });
  for (let si = 0; si < a.wp.length; si++) for (let j = 0; j <= 100; j++) {
    Object.assign(a, { si, st: a.wp[si].T * j / 100 });
    const T = Q.stepPose(a); gatherPeak = Math.max(gatherPeak, T.lA, T.rA);
  }
  for (const side of [-1, 1]) for (const lsv of ['far', 'reach']) {
    Object.assign(a, { side, hand: side, lsv, inSteps: false });
    for (let j = 0; j <= 90; j++) {
      Object.assign(a, { t: j / 120, released: j >= 58, relT: 0.48 });
      const T = Q.poseTarget(f.p); peak = Math.max(peak, T.lA, T.rA);
    }
    recovery = Math.max(recovery, Q.poseTarget(f.p).lA, Q.poseTarget(f.p).rA);
  }
  return { peak, gatherPeak, recovery, duration: a.wp.reduce((s, w) => s + w.T, 0) };
}
const oldPose = poseMetrics(before), newPose = poseMetrics(after);
console.log(`Pose before -> after: peak thigh ${oldPose.peak.toFixed(3)} -> ${newPose.peak.toFixed(3)}rad; gather ${oldPose.gatherPeak.toFixed(3)} -> ${newPose.gatherPeak.toFixed(3)}rad; late-release thigh at 0.75s ${oldPose.recovery.toFixed(3)} -> ${newPose.recovery.toFixed(3)}rad; gather time ${oldPose.duration.toFixed(3)} -> ${newPose.duration.toFixed(3)}s`);
assert(oldPose.recovery > 1 && newPose.recovery < 0.3, 'late release must not expose the held high-style keyframe');
assert(newPose.peak <= after.PH.game.K.lvFarKnee + 1e-9);
assert(newPose.gatherPeak <= after.PH.game.K.lvFarKnee + 1e-9);
assert(newPose.duration >= 2 * after.PH.game.K.lvFarStep + after.PH.game.K.gathT);
for (const scenario of ['open', 'contested', 'light block', 'heavy block', 'interrupted', 'possession change']) {
  const f = setup(after), Q = after.PH.farQA;
  const a = action(after, f, 100003);
  Object.assign(a, { lsv: 'far', side: 1, hand: 1, sty: 'high', inSteps: false, t: 0.48, ideal: 0.34, relT: 0.48, released: true });
  Object.assign(f.p, { action: a, anim: 'layup', x: 0, y: f.H.y - 1.7, z: 0.8, vz: -1, vx: 0, vy: 0, speed: 0, hasBall: false });
  f.p.pose = Q.poseTarget(f.p);
  f.d.off = scenario === 'open';
  if (scenario.includes('block')) f.gm.blkReact(f.d, f.p, 'lay', scenario === 'light block' ? 1 : 3);
  if (scenario === 'interrupted') f.p.action = null;
  if (scenario === 'possession change') { f.d.hasBall = true; f.gm.G.ball.holder = f.d.id; }
  const samples = [];
  for (let i = 0; i < 240; i++) {
    f.gm.G.time += 1 / 120;
    Q.updatePlayer(f.p, f.gm.t5.zeroInp(), 1 / 120);
    if ([0, 35, 119, 239].includes(i)) samples.push(`${((i + 1) / 120).toFixed(2)}s:${Math.max(f.p.pose.lA, f.p.pose.rA).toFixed(3)}`);
  }
  assert(!f.p.action, `${scenario}: action clears within 2s`);
  assert.equal(f.p.z, 0);
  const target = Q.poseTarget(f.p);
  for (const k of ['lA', 'rA', 'lB', 'rB', 'aRp', 'aLp', 'tilt', 'yaw']) assert(Math.abs(f.p.pose[k] - target[k]) < 0.06, `${scenario}: ${k} blends back to current normal pose`);
  console.log(`PASS ${scenario} recovery (time:thigh rad): ${samples.join(', ')}`);
}
