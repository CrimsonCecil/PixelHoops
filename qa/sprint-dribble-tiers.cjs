const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ctx = vm.createContext({ console, performance: { now: () => 0 }, setTimeout() {} });
ctx.window = ctx;
for (const name of ['tune', 'ptype', 'render', 'roster', 'measurements', 'r5', 'game']) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../js', name + '.js'), 'utf8'), ctx);
}
const { game, gait, TUNE } = ctx.PH;
const tau = Math.PI * 2;
for (const [key, suffix, lean, roll, push, ratio] of [
  ['dmitchell', 'S', 0.30, 0.10, 0.35, 1],
  ['kobe', 'M', 0.26, 0.08, 0.45, 0.5],
  ['embiid', 'T', 0.22, 0.06, 0.55, 0.5],
]) {
  const p = game.t5.makePlayer(0, key, 'p1');
  Object.assign(p, { hasBall: true, anim: 'run', speed: 7, sprW: 1, z: 0, drib: 0 });
  for (const [name, expected] of [['Lean', lean], ['Roll', roll], ['Push', push], ['Step', ratio]]) {
    assert.equal(TUNE.get('l1_dr' + name + suffix), expected);
    const meta = TUNE.meta('l1_dr' + name + suffix);
    assert.equal(meta.cat, 'move'); assert.equal(meta.sub, '跑步与运球');
  }
  assert(Math.abs(gait.ballFwd(p) - (0.08 + push)) < 1e-10);
  const pose = () => {
    const T = { ...p.pose, tilt: 0, yaw: 0 };
    gait.run(p, T); gait.post(p, T, 'run', null); return T;
  };
  for (const hand of [-0.33, 0.33]) {
    p.handX = hand;
    for (let i = 0; i < 120; i++) {
      p.runPh = i / 120 * tau; p.drib = p.runPh * ratio;
      const T = pose();
      assert(Math.abs(T.lean - lean) < 1e-10);
      assert(Math.sign(T.tilt) === Math.sign(hand));
      assert(Math.abs(T.tilt) >= roll && Math.abs(T.tilt) <= roll * 1.15 + 1e-10);
      assert(Math.max(Math.abs(T.lA), Math.abs(T.rA)) < 0.8, 'upright thighs');
      assert(Math.abs(T[hand > 0 ? 'aLe' : 'aRe'] - Math.PI / 2) < 1e-10);
      assert(Math.abs(gait.drib(p) - gait.cad(p) * ratio) < 1e-10, 'footfall phase lock');
    }
  }
  const normal = pose();
  const hipMean = () => {
    let sum = 0;
    for (let i = 0; i < 120; i++) {
      p.runPh = i / 120 * tau;
      sum += ctx.PH.rig(p, pose(), false, p.col.body).pelvis[2];
    }
    return sum / 120;
  };
  const crouchedHip = hipMean();
  TUNE.set('l1_drCrouch', 0);
  assert(hipMean() > crouchedHip, 'speed crouch lowers sprint hips');
  assert(pose().lB < normal.lB, 'crouch still bends knees');
  TUNE.reset('l1_drCrouch');
  p.speed = 0; p.sprW = 0;
  const rate = gait.drib(p);
  TUNE.set('l1_drHeight', 0); assert(Number.isFinite(gait.drib(p)));
  TUNE.reset('l1_drHeight'); assert.equal(gait.drib(p), rate);
  assert.equal(gait.cad(p), 0);
  console.log(`PASS ${key}: ${suffix}, lean=${lean}, roll=${roll}, push=${push}, bounces/step=${ratio}; left/right, crouch, stopped input`);
}
for (const [height, expected, push] of [[1.9099, 1, 0.35], [1.91, 0.5, 0.45], [2.0599, 0.5, 0.45], [2.06, 0.5, 0.55]]) {
  const p = { h: height, anim: 'run', hasBall: true, speed: 7, sprW: 1, runPh: 0, drib: 0 };
  assert(Math.abs(gait.drib(p) / gait.cad(p) - expected) < 1e-10);
  assert(Number.isFinite(gait.ballFwd(p)), 'unmeasured height fallback');
  assert(Math.abs(gait.ballFwd(p) - (0.08 + push)) < 1e-10, 'discrete tier push');
}
for (const config of [{ hasBall: false, anim: 'run' }, { hasBall: true, anim: 'idle' }, { hasBall: true, anim: 'run', post: true }]) {
  const p = { h: 1.95, speed: 7, sprW: 1, drib: 0, runPh: 0, ...config };
  const before = [gait.drib(p), gait.ballFwd(p)];
  TUNE.set('l1_drStepM', 1); TUNE.set('l1_drPushM', 0.8);
  assert.deepEqual([gait.drib(p), gait.ballFwd(p)], before, 'outside sprint dribble unchanged');
  TUNE.reset('l1_drStepM'); TUNE.reset('l1_drPushM');
}
console.log('PASS tier boundaries, finite fallback, non-sprint/no-ball/post unaffected by tier controls');
