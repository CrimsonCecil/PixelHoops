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
const { game, gait, rig: rawRig, poseQA, TUNE } = ctx.PH;
const geometry = { frames: 0, error: 0, knee: 0 };
function rig(a, P = a.pose, grip = true, body) {
  const k = rawRig(a, P, grip, body);
  if (!a.stance || a.anim !== 'def' || !(P.crab > 0.001)) return k;
  geometry.frames++;
  const neutral = rawRig(a, { ...P, crab: 0 }, false, body);
  for (const side of ['L', 'R']) {
    const hip = k['hip' + side], knee = k['knee' + side], foot = k['foot' + side];
    const distance = (u, v) => Math.hypot(...u.map((x, j) => x - v[j]));
    const height = body ? body.height * a.h / body.baseHeight : a.h;
    const Hh = 1 + (height / 1.95 - 1) * (body ? 1.55 : 1.7);
    const thigh = 0.41 * Hh * (body ? 0.95 * body.legs : 1), shin = thigh;
    assert(Math.abs(distance(hip, knee) / thigh - 1) <= 0.01, 'IK thigh length preserved within one percent');
    assert(Math.abs(distance(knee, foot) / shin - 1) <= 0.01, 'IK shin length preserved within one percent');
    geometry.error = Math.max(geometry.error, Math.abs(distance(hip, knee) / thigh - 1), Math.abs(distance(knee, foot) / shin - 1));
    geometry.knee = Math.max(geometry.knee, Math.hypot(knee[0] - hip[0], knee[1] - hip[1]));
    const axis = foot.map((v, j) => (v - hip[j]) / distance(foot, hip));
    const reference = neutral['knee' + side].map((v, j) => v - hip[j]);
    const actual = knee.map((v, j) => v - hip[j]);
    const along = actual.reduce((n, v, j) => n + v * axis[j], 0);
    const projection = reference.reduce((n, v, j) => n + v * axis[j], 0);
    const bend = actual.reduce((n, v, j) => n + (v - along * axis[j]) * (reference[j] - projection * axis[j]), 0);
    assert(bend >= -1e-8 && along >= -1e-8 && along <= distance(hip, foot) + 1e-8, 'IK knee stays on original bend side without hyperextension');
  }
  return k;
}
assert.equal(TUNE.meta('l1_stSlideHz').min0, 1.2, 'cadence slider minimum');
assert.equal(TUNE.meta('l1_stSlideStride').max0, 1, 'stride slider maximum');
for (const gone of ['stStep', 'stHzMin', 'stHzMax', 'stReach', 'stLift']) assert.equal(TUNE.meta('l1_' + gone).note, '当前版本未使用，改了无效果', `foot-planting key ${gone} retired`);
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

const Hh = 1 + (p.col.body.height / 1.95 - 1) * 1.55, sole = 0.06 * Hh;
const local = (k, side) => { const f = k['foot' + side], dx = f[0] - p.x, dy = f[1] - p.y; return [dx, dy, f[2] - p.z - sole]; };
for (const [label, vx, vy] of [['slow right', 0.5, 0], ['slow left', -0.5, 0], ['slow forward', 0, 0.5], ['slow backward', 0, -0.5], ['medium right', 1.8, 0], ['medium left', -1.8, 0], ['medium forward', 0, 1.8], ['medium backward', 0, -1.8], ['medium diagonal', 1.3, 1.3], ['max right', 4.8, 0], ['max left', -4.8, 0], ['max forward', 0, 4.8], ['max backward', 0, -4.8]]) {
  Object.assign(p, { x: 0, y: 6, face: Math.PI / 2, stance: true, anim: 'def', slide: null, vx, vy, speed: Math.hypot(vx, vy) });
  for (let i = 0; i < 240; i++) { p.x += vx / 120; p.y += vy / 120; gait.slide(p, 1 / 120); pose(); }
  let prev = pose(), peak = { L: 0, R: 0 }, minGap = Infinity, jump = 0, along = { L: [Infinity, -Infinity], R: [Infinity, -Infinity] };
  const dir = [vx, vy].map((v) => v / Math.hypot(vx, vy));
  for (let i = 0; i < 720; i++) {
    p.x += vx / 120; p.y += vy / 120;
    gait.slide(p, 1 / 120);
    const k = pose();
    for (const side of ['L', 'R']) {
      const f = local(k, side), b = local(prev, side);
      assert(f.every(Number.isFinite), 'finite rig');
      assert(f[2] >= -1e-8 && f[2] <= 0.08 * Hh + 1e-8, 'grounded or lifted, never through the floor');
      peak[side] = Math.max(peak[side], f[2]);
      jump = Math.max(jump, Math.hypot(...f.map((v, j) => v - b[j])));
      const d = f[0] * dir[0] + f[1] * dir[1];
      along[side] = [Math.min(along[side][0], d), Math.max(along[side][1], d)];
    }
    minGap = Math.min(minGap, k.footR[0] - k.footL[0]);
    assert(k.footL[0] < k.footR[0] - 0.25, 'feet never cross or touch');
    assert(Math.atan2(Math.hypot(k.chest[0] - k.pelvis[0], k.chest[1] - k.pelvis[1]), k.chest[2] - k.pelvis[2]) * 180 / Math.PI >= 20, 'athletic torso lean');
    prev = k;
  }
  if (!label.startsWith('slow')) assert(peak.L >= 0.05 && peak.R >= 0.05, 'both feet visibly lift every cycle');
  const swing = Math.min(along.L[1] - along.L[0], along.R[1] - along.R[0]);
  assert(swing > (label.startsWith('slow') ? 0.1 : 0.3) * Hh, `each foot strides along the travel direction: ${swing.toFixed(3)}m`);
  assert(jump < Math.hypot(vx, vy) / 120 + 0.04, `no foot pops between frames: ${jump.toFixed(3)}m`);
  console.log(`PASS ${label}: lifts ${peak.L.toFixed(3)}/${peak.R.toFixed(3)}m, stride ${swing.toFixed(2)}m, min foot gap ${minGap.toFixed(2)}m, max local step ${(jump * 100).toFixed(1)}cm`);
}
Object.assign(p, { slide: null, vx: 4.8, vy: 0, speed: 4.8 });
for (let i = 0; i < 60; i++) { p.x += p.vx / 120; gait.slide(p, 1 / 120); pose(); }
let prev = pose(), jump = 0;
p.vx = -4.8;
for (let i = 0; i < 120; i++) { p.x += p.vx / 120; gait.slide(p, 1 / 120); const k = pose(); for (const s of ['L', 'R']) jump = Math.max(jump, Math.hypot(...local(k, s).map((v, j) => v - local(prev, s)[j]))); prev = k; }
assert(jump < 4.8 / 120 + 0.04, `direction reversal keeps feet continuous: ${jump.toFixed(3)}m`);
Object.assign(p, { speed: 0, vx: 0, vy: 0 });
for (let i = 0; i < 120; i++) gait.slide(p, 1 / 60);
const still = pose();
for (let i = 0; i < 30; i++) gait.slide(p, 1 / 60);
const after = pose();
for (const s of ['L', 'R']) assert(Math.hypot(...local(after, s).map((v, j) => v - local(still, s)[j])) < 1e-3 && Math.abs(local(after, s)[2]) < 1e-3, 'stopped stance settles flat in place');
p.stance = false; gait.slide(p, 1 / 60); assert.equal(p.slide, null);
console.log(`PASS reversal max step ${(jump * 100).toFixed(1)}cm; stopped stance settles flat; releasing stance clears the slide cycle`);
