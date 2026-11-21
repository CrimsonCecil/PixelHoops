const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ctx = vm.createContext({ console, performance: { now: () => 0 }, setTimeout() {} });
ctx.window = ctx;
for (const name of ['tune', 'ptype', 'render', 'roster', 'measurements', 'r5', 'game']) {
  let source = fs.readFileSync(path.join(__dirname, '../js', name + '.js'), 'utf8');
  if (name === 'game') source = source.replace('PH.game = {', 'PH.poseQA = { poseTarget, updatePlayer }; PH.game = {');
  vm.runInContext(source, ctx, { filename: name + '.js' });
}
const { game, gait, rig, poseQA, TUNE } = ctx.PH;
game.newGame({ mode: '2p', arch0: 'herb', arch1: 'wemby' });
Object.assign(game.G, { phase: 'live', intro: null, tips: null });
const [p, opponent] = game.G.players;
Object.assign(p, { x: 0, y: 6, z: 0, face: Math.PI / 2, action: null, stun: 0, hasBall: false, anim: 'def', stance: true, speed: 0, vx: 0, vy: 0, sq: 1 });
opponent.hasBall = true;
Object.assign(game.G.ball, { state: 'held', holder: opponent.id });
const pose = () => { p.pose = poseQA.poseTarget(p); return rig(p, p.pose, false, p.col.body); };
const planted = pose();
const hip = planted.pelvis[2];
p.stance = false;
const guarding = pose().pelvis[2];
assert(hip < guarding * 0.76, `stance hip ${hip} vs guarding ${guarding}`);
const old = { ...p.pose, lean: 0.372, lA: 0.576, rA: 0.576, lB: 1.108, rB: 1.108, lS: 0.36, rS: 0.36 };
const oldHip = rig(p, old, false, p.col.body).pelvis[2];
assert(hip < oldHip * 0.76 && hip > oldHip * 0.6, `stance hip ${hip} vs old ${oldHip}`);
console.log(`PASS stance hip ${(hip / oldHip).toFixed(3)} of old stance, ${(hip / guarding).toFixed(3)} of nearby guarding`);

for (const [label, vx, vy] of [['right', 2, 0], ['left', -2, 0], ['forward', 0, 2], ['backward', 0, -2], ['diagonal', 1.4, 1.4]]) {
  Object.assign(p, { x: 0, y: 6, face: Math.PI / 2, stance: true, anim: 'def', crab: null, vx, vy, speed: Math.hypot(vx, vy) });
  gait.crab(p, 1 / 120);
  let prev = pose(), supports = 0, total = 0, lifts = new Set(), lastLift, alternations = 0;
  for (let i = 0; i < 240; i++) {
    p.x += vx / 120; p.y += vy / 120;
    gait.crab(p, 1 / 120);
    const k = pose();
    let supportSlip = Infinity;
    for (const side of ['L', 'R']) {
      const foot = k['foot' + side], before = prev['foot' + side];
      assert(foot.every(Number.isFinite), 'finite rig');
      const lift = foot[2] - p.z - 0.06 * (1 + (p.col.body.height / 1.95 - 1) * 1.55);
      if (lift > 0.025) { lifts.add(side); if (lastLift && lastLift !== side) alternations++; lastLift = side; }
      if (lift < 0.003) supportSlip = Math.min(supportSlip, Math.hypot(foot[0] - before[0], foot[1] - before[1]));
      const upper = Math.hypot(...k['knee' + side].map((v, j) => v - k['hip' + side][j]));
      const lower = Math.hypot(...foot.map((v, j) => v - k['knee' + side][j]));
      assert(Math.abs(upper - lower) < 1e-8, 'no stretched or inverted legs');
    }
    total++;
    if (supportSlip < p.speed / 120 * 0.15) supports++;
    assert(k.footL[0] < k.footR[0], 'feet never cross');
    prev = k;
  }
  assert(supports / total > 0.9, `${label}: planted support ${supports}/${total}`);
  assert(lifts.size === 2 && alternations >= 4, `${label}: alternate foot lifts`);
  console.log(`PASS ${label} crab steps: ${supports}/${total} planted support frames, ${alternations} lift alternations`);
}
Object.assign(p, { speed: 0, vx: 0, vy: 0 });
for (let i = 0; i < 60; i++) gait.crab(p, 1 / 60);
const still = pose();
for (let i = 0; i < 60; i++) gait.crab(p, 1 / 60);
assert.deepEqual(pose().footL, still.footL);
assert.deepEqual(pose().footR, still.footR);
p.stance = false; gait.crab(p, 1 / 60); assert.equal(p.crab, null);
console.log('PASS stopped stance is planted; releasing stance clears crab steps');
Object.assign(p, { x: -2, y: 6, speed: 0, vx: 0, vy: 0, face: Math.PI / 2, hasBall: false, stance: true, anim: 'def', crab: null });
gait.crab(p, 1 / 60);
p.x -= 0.01; p.vx = -1;
gait.crab(p, 1 / 60);
assert(p.crab.L[2] > 0 && p.crab.R[2] === 0, 'left lead foot starts leftward travel from rest');
TUNE.set('l1_stWidth', 0.48);
gait.crab(p, 1 / 60);
assert(p.crab.width > 0.45, 'width tuning refreshes planted stance');
TUNE.reset('l1_stWidth');
Object.assign(opponent, { x: 0, y: 10, hasBall: true });
Object.assign(p, { x: -2, y: 6, vx: 0, vy: 0, speed: 0, face: Math.PI / 2 });
let liveLifts = new Set();
for (let i = 0; i < 90; i++) {
  game.G.time += 1 / 60;
  poseQA.updatePlayer(p, { ...game.t5.zeroInp(), mx: 0.35, a3: true }, 1 / 60);
  assert.equal(p.anim, 'def');
  assert(p.stance && p.crab && p.pose.crab > 0);
  for (const side of ['L', 'R']) if (p.crab[side][2] > 0.03) liveLifts.add(side);
  assert(rig(p).footL.every(Number.isFinite));
}
assert.equal(liveLifts.size, 2, 'live input/updatePlayer integrates both stepping feet');
console.log('PASS live defensive input, left lead from rest, and hot width tuning');

Object.assign(p, { hasBall: true, stance: false, anim: 'run', z: 0, action: null, drib: Math.PI / 2, exr: 0, brPh: 0 });
p.crab = null;
function runHip(speed, sprint) {
  p.speed = speed; p.sprW = sprint;
  let sum = 0;
  for (let i = 0; i < 120; i++) { p.runPh = i / 120 * Math.PI * 2; sum += pose().pelvis[2]; }
  return sum / 120;
}
const jog = runHip(2.8, 0), sprint = runHip(7.5, 1);
assert(sprint < jog * 0.95, `sprint hip ${sprint} vs jog ${jog}`);
console.log(`PASS running dribble sprint hip ${sprint.toFixed(3)} < jog ${jog.toFixed(3)}`);
const short = game.t5.makePlayer(0, 'fvv', 'p1'), tall = game.t5.makePlayer(1, 'wemby', 'cpu');
for (const speed of [0, 3, 7]) {
  for (const q of [short, tall]) Object.assign(q, { speed, sprW: speed > 6 ? 1 : 0, drib: 0, runPh: Math.PI / 2 });
  const ratio = gait.drib(short) / gait.drib(tall);
  assert(ratio >= 1.3, `height rate ratio ${ratio}`);
  console.log(`PASS height dribble rate at ${speed} m/s: short/tall ${ratio.toFixed(3)}`);
  for (const q of [short, tall]) {
    q.drib = 0; q.runPh = 0;
    for (let i = 0; i < 2400; i++) { q.runPh += gait.cad(q) / 120; q.drib += gait.drib(q) / 120; }
  }
  assert(short.drib / tall.drib >= 1.3, 'sprint phase correction preserves actual height frequency difference');
}
short.runPh = tall.runPh = Math.PI / 2; short.drib = tall.drib = 0;
TUNE.set('l1_drHeight', 0);
assert.equal(gait.drib(short), gait.drib(tall));
TUNE.reset('l1_drHeight');
const fallback = { h: 1.95, speed: 0 };
assert(Number.isFinite(gait.drib(fallback)), 'height fallback without measured body');
for (const name of ['stDepth', 'stWidth', 'stStep', 'stLift', 'drCrouch', 'drHeight']) assert(TUNE.has('l1_' + name));
console.log('PASS tuning registration, height strength zero, unmeasured height fallback');
