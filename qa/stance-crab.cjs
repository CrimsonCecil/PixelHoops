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
const continuity = { frames: 0, exempted: 0, drag: 0, acceleration: 0 };
const geometry = { frames: 0, error: 0, knee: 0 };
const stanceProfiles = [['official', {}], ['C1', { l1_speedMul: 0.9, l1_sprintSp: 1.4, l1_stDepth: 0.99, l1_stLean: 0.33, l1_stWidth: 0.43, l1_stStep: 0.18, l1_stHzMin: 2.05, l1_stHzMax: 3.5, l1_stLift: 0.1 }]];
process.on('exit', () => console.log(`Collision displacement exemptions: ${continuity.exempted}/${continuity.frames} sampled frames`));
function rig(a, P = a.pose, grip = true, body) {
  const k = rawRig(a, P, grip, body);
  if (!a.stance || a.anim !== 'def' || !(P.crab > 0.001)) return k;
  geometry.frames++;
  const neutral = rawRig(a, { ...P, crab: 0 }, false, body);
  for (const side of ['L', 'R']) {
    const hip = k['hip' + side], knee = k['knee' + side], foot = k['foot' + side];
    const distance = (u, v) => Math.hypot(...u.map((x, j) => x - v[j]));
    const height = body ? body.height * a.h / body.baseHeight : a.h;
    const Hh = 1 + (height / 1.95 - 1) * (body ? ctx.PH.bodyHeightK() : 1.7);
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
function checkFootContinuity(a, k, previous, dt) {
  const velocity = {}, grounded = {};
  let exempt = false;
  if (previous) {
    continuity.frames++;
    const moved = Math.hypot(a.x - previous.x, a.y - previous.y), expected = Math.hypot(a.vx || 0, a.vy || 0) * dt;
    const correction = Math.hypot(a.x - a.crab.x, a.y - a.crab.y);
    exempt = moved > expected + 1e-6 || correction > expected + 1e-6;
    if (exempt) continuity.exempted++;
    const neutral = rawRig(a, { ...a.pose, crab: 0 }, false, a.col.body);
    for (const side of ['L', 'R']) {
      const foot = k['foot' + side], before = previous.rig['foot' + side];
      const travel = Math.hypot(...foot.map((v, j) => v - before[j]));
      const floor = a.z + 0.06 * (1 + (a.col.body.height / 1.95 - 1) * ctx.PH.bodyHeightK());
      velocity[side] = foot.slice(0, 2).map((v, j) => (v - before[j]) / dt);
      grounded[side] = foot[2] <= floor + 0.001 && before[2] <= floor + 0.001;
      if (exempt) continue;
      if (grounded[side]) {
        if (a.crab.drag[side]) {
          const Hh = floor / 0.06, fx = Math.cos(a.face), fy = Math.sin(a.face), sign = side === 'L' ? -1 : 1;
          const knee = neutral['knee' + side], forward = (knee[0] - a.x) * fx + (knee[1] - a.y) * fy - 0.075 * Hh;
          const center = [a.x + fy * sign * game.K.stWidth * Hh + fx * forward, a.y - fx * sign * game.K.stWidth * Hh + fy * forward];
          assert(Math.hypot(before[0] - center[0], before[1] - center[1]) > game.K.stReach * Hh - 1e-6, 'drag is independently outside reach');
          assert(travel <= expected + 0.01 + 1e-7, `reach drag displacement within body travel +1cm: ${(travel * 100).toFixed(3)}cm`);
          continuity.drag++;
          if (!previous.exempt && previous.grounded[side] && previous.velocity[side]) {
            const acceleration = Math.hypot(...velocity[side].map((v, j) => v - previous.velocity[side][j])) / dt;
            continuity.acceleration = Math.max(continuity.acceleration, acceleration);
            assert(acceleration <= 360 + 1e-4, `bounded reach-drag acceleration: ${acceleration.toFixed(3)}m/s²`);
          }
        } else assert(travel <= 1.2 * dt + 1e-7, `grounded world displacement <=2cm per 16.7ms: ${(travel * 100 / dt / 60).toFixed(3)}cm`);
      } else assert(travel <= (9 + (a.speed || 0)) * dt + 1e-7, 'swing world displacement stays inside travel budget');
    }
  }
  return { x: a.x, y: a.y, rig: k, velocity, grounded, exempt };
}
assert.equal(TUNE.meta('l1_stLift').min, 0, 'UI slider minimum');
assert.equal(TUNE.meta('l1_stLift').max, 0.15, 'UI slider maximum');
assert.equal(TUNE.meta('l1_stReach').min, 0.05, 'reach slider minimum');
assert.equal(TUNE.meta('l1_stReach').max, 0.5, 'reach slider maximum');
vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/tuneui.js'), 'utf8').replace('PH.TUNEUI = {', 'PH.rowQA = rowHTML; PH.TUNEUI = {'), ctx);
assert.match(ctx.PH.rowQA(TUNE.meta('l1_stLift')), /min="0" max="0.15"/, 'rendered UI slider bounds');
console.log('PASS rendered stLift UI slider range 0–0.15m');
const uiNodes = new Map();
ctx.document = { getElementById(id) {
  if (!uiNodes.has(id)) uiNodes.set(id, { handlers: {}, addEventListener(type, fn) { this.handlers[type] = fn; } });
  return uiNodes.get(id);
} };
ctx.addEventListener = () => {};
ctx.fetch = () => new Promise(() => {});
vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/cfgstore.js'), 'utf8'), ctx);
ctx.PH.TUNEUI.wire();
for (const profile of ['official', 'saved']) for (const lift of [0, 0.07, 0.15]) {
  ctx.PH.CS.loadData(profile === 'saved' ? { l1_stLift: 0.12, l1_stStep: 0.15, l1_stWidth: 0.43, l1_stHzMin: 2.05, l1_stHzMax: 3.5 } : {});
  uiNodes.get('tn-body').handlers.input({ target: { type: 'range', value: String(lift), getAttribute: () => 'l1_stLift' } });
  assert.equal(game.K.stLift, lift, 'UI/profile key reaches gait tuning');
  game.newGame({ mode: 'train', arch0: 'mrobinson', arch1: 'curry' });
  Object.assign(game.G, { phase: 'live', intro: null, tips: null });
  const [a, b] = game.G.players;
  Object.assign(a, { x: 0, y: 6, face: Math.PI / 2, hasBall: false, action: null, stun: 0 });
  b.hasBall = true; Object.assign(game.G.ball, { state: 'held', holder: b.id });
  let peak = 0, previousFrame;
  for (let i = 0; i < 480; i++) {
    a.stam = 100; b.x = a.x; b.y = a.y + 4;
    game.t5.step([{ ...game.t5.zeroInp(), mx: 0.26, a3: true }, game.t5.zeroInp()], 1 / 60);
    if (i < 90) continue;
    const k = rig(a, a.pose, false, a.col.body), sole = 0.06 * (1 + (a.col.body.height / 1.95 - 1) * ctx.PH.bodyHeightK());
    previousFrame = checkFootContinuity(a, k, previousFrame, 1 / 60);
    assert(k.pelvis[2] - a.z <= 0.62, 'defensive crouch stays low');
    for (const s of ['L', 'R']) {
      const height = k['foot' + s][2] - a.z - sole;
      peak = Math.max(peak, height);
      if (s !== a.crab.side) assert(Math.abs(height) < 1e-8, 'UI/profile support foot grounded');
    }
    assert(Math.atan2(Math.hypot(k.chest[0] - k.pelvis[0], k.chest[1] - k.pelvis[1]), k.chest[2] - k.pelvis[2]) * 180 / Math.PI >= 20, 'athletic torso lean');
    const forward = v => (v[0] - k.pelvis[0]) * Math.cos(a.face) + (v[1] - k.pelvis[1]) * Math.sin(a.face);
    if (i === 90) {
      const standing = { ...a, crab: null, speed: 0, vx: 0, vy: 0 };
      gait.crab(standing, 1 / 60); standing.pose = poseQA.poseTarget(standing);
      const neutral = rig(standing, standing.pose, false, standing.col.body);
      assert(forward(neutral.footL) > 0.1 && forward(neutral.footR) > 0.1, 'standing crouch hips behind heels');
    }
  }
  assert(lift === 0 ? peak < 1e-8 : peak >= lift - 0.002 && peak <= lift + 1e-8, 'live UI/profile lift amplitude');
  console.log(`PASS live UI/profile ${profile}: slider ${lift.toFixed(2)}m, peak ${peak.toFixed(3)}m; forward crouch, hips behind heels`);
}
ctx.PH.CS.select('official');
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

for (const [label, vx, vy] of [['slow right', 0.5, 0], ['slow left', -0.5, 0], ['slow forward', 0, 0.5], ['slow backward', 0, -0.5], ['medium right', 1.2, 0], ['medium left', -1.2, 0], ['medium forward', 0, 1.2], ['medium backward', 0, -1.2], ['medium diagonal', 0.84, 0.84], ['max right', 6, 0], ['max left', -6, 0], ['max forward', 0, 6], ['max backward', 0, -6]]) {
  Object.assign(p, { x: 0, y: 6, face: Math.PI / 2, stance: true, anim: 'def', crab: null, vx, vy, speed: Math.hypot(vx, vy) });
  gait.crab(p, 1 / 120);
  pose();
  for (let i = 0; i < 240; i++) { p.x += vx / 120; p.y += vy / 120; gait.crab(p, 1 / 120); pose(); }
  let prev = pose(), previousFrame, samples = [], kneeTravel = 0, shinSweep = 0, lifts = new Set(), peak = { L: 0, R: 0 };
  for (let i = 0; i < 720; i++) {
    p.x += vx / 120; p.y += vy / 120;
    gait.crab(p, 1 / 120);
    const k = pose();
    previousFrame = checkFootContinuity(p, k, previousFrame, 1 / 120);
    const frame = [];
    for (const side of ['L', 'R']) {
      const foot = k['foot' + side], before = prev['foot' + side];
      assert(foot.every(Number.isFinite), 'finite rig');
      const lift = foot[2] - p.z - 0.06 * (1 + (p.col.body.height / 1.95 - 1) * ctx.PH.bodyHeightK());
      if (lift > 0.01) lifts.add(side);
      peak[side] = Math.max(peak[side], lift);
      assert(lift >= -1e-8 && lift <= 0.071, 'grounded or visible lift');
      if (side !== p.crab.side) assert(Math.abs(lift) < 1e-8, 'support foot stays on the floor');
      if (p.crab[side][2] === 0) assert(Math.abs(lift) < 1e-8, 'flat grounded glide');
      const knee = k['knee' + side], shin = foot.map((v, j) => v - knee[j]);
      frame.push({ knee: knee.map((v, j) => v - (j === 0 ? p.x : j === 1 ? p.y : 0)), shin });
    }
    for (const before of samples) for (let s = 0; s < 2; s++) {
      kneeTravel = Math.max(kneeTravel, Math.hypot(...frame[s].knee.slice(0, 2).map((v, j) => v - before[s].knee[j])));
      const a = frame[s].shin, b = before[s].shin;
      shinSweep = Math.max(shinSweep, Math.acos(Math.max(-1, Math.min(1, a.reduce((t, v, j) => t + v * b[j], 0) / Math.hypot(...a) / Math.hypot(...b)))) * 180 / Math.PI);
    }
    samples.push(frame);
    assert(k.footL[0] < k.footR[0], 'feet never cross');
    prev = k;
  }
  assert(lifts.size === 2, 'lead and trail feet lift');
  if (label.startsWith('medium')) assert(peak.L >= 0.05 && peak.R >= 0.05, 'visible lead/trail lift at medium shuffle');
  console.log(`PASS ${label}: lifts ${peak.L.toFixed(3)}/${peak.R.toFixed(3)}m, horizontal knee travel ${kneeTravel.toFixed(4)}m, shin sweep ${shinSweep.toFixed(2)}deg; flat support, no foot jumps`);
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
  for (const side of ['L', 'R']) if (p.crab[side][2] > 0.01) liveLifts.add(side);
  assert(rig(p).footL.every(Number.isFinite));
}
assert(liveLifts.size === 2, 'live input/updatePlayer integrates lead and trail lifts');
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
short.speed = tall.speed = short.sprW = tall.sprW = 0;
TUNE.set('l1_drHeight', 0);
assert.equal(gait.drib(short), gait.drib(tall));
TUNE.reset('l1_drHeight');
const fallback = { h: 1.95, speed: 0 };
assert(Number.isFinite(gait.drib(fallback)), 'height fallback without measured body');
for (const name of ['stDepth', 'stLean', 'stWidth', 'stStep', 'stReach', 'stLift', 'stHzMin', 'stHzMax', 'gaHzMin', 'gaHzMax', 'gaHeight', 'drCrouch', 'drHeight']) {
  const d = TUNE.list().find(d => d.k === 'l1_' + name);
  assert(d && d.cat === 'move' && ['防守滑步', '跑步与运球'].includes(d.sub), '移动与姿态 classification');
}
console.log('PASS tuning registration, height strength zero, unmeasured height fallback');

const legRates = [short, tall].map(q => { q.speed = 7; return gait.cad(q); });
TUNE.set('l1_drHeight', 3);
assert.deepEqual([short, tall].map(q => gait.cad(q)), legRates, 'dribble height cannot accelerate legs');
TUNE.reset('l1_drHeight');
assert(legRates[0] > legRates[1], 'taller means lower leg cadence at equal speed');
assert.equal(gait.cad({ h: 1.95, speed: 0 }), 0);
assert(gait.cad({ h: 1.95, speed: 0.1 }) / Math.PI < 0.15, 'very low speed floor');
for (const q of [short, tall]) {
  q.speed = 2.8; const jogHz = gait.cad(q) / Math.PI;
  q.speed = 7.2; const sprintHz = gait.cad(q) / Math.PI;
  assert(jogHz < 1.3 && sprintHz < 3.1 && sprintHz - jogHz > 1.2, 'wide jog/sprint gap and lower cadence');
  q.hasBall = !q.hasBall; assert.equal(gait.cad(q) / Math.PI, sprintHz, 'shared on/off-ball cadence');
}
console.log('PASS gait low floor, jog/sprint gap, taller strides, shared on/off-ball cadence, no dribble-to-leg feedback');

function maximumSpeed(key, stance, sprint) {
  game.newGame({ mode: '2p', arch0: key, arch1: 'curry' });
  Object.assign(game.G, { phase: 'live', intro: null, tips: null });
  const [a, b] = game.G.players;
  Object.assign(a, { x: 0, y: 6, hasBall: !stance, action: null, stun: 0 });
  Object.assign(b, { x: 0, y: 12, hasBall: stance });
  Object.assign(game.G.ball, { state: 'held', holder: stance ? b.id : a.id });
  for (let i = 0; i < 180; i++) {
    a.x = 0; a.stam = 100; game.G.time += 1 / 120;
    poseQA.updatePlayer(a, { ...game.t5.zeroInp(), mx: 1, a3: stance, sprint }, 1 / 120);
  }
  return a.speed;
}
const frequencies = [];
for (const key of ['mrobinson', 'fvv']) {
  const max = maximumSpeed(key, true, true), walk = maximumSpeed(key, true, false), sprintSpeed = maximumSpeed(key, false, true);
  for (const [mode, speed] of [['slow stance', 0.5], ['medium stance', 1.2], ['brisk stance', 2.5], ['max stance', walk], ['max sprint stance', max]]) {
    const a = game.t5.makePlayer(0, key, 'p1');
    Object.assign(a, { x: 0, y: 6, face: Math.PI / 2, stance: true, anim: 'def', z: 0, sq: 1, action: null, stun: 0, hasBall: false, speed, vx: speed, vy: 0 });
    const renderPose = () => { a.pose = poseQA.poseTarget(a); return rig(a, a.pose, false, a.col.body); };
    gait.crab(a, 1 / 240); renderPose();
    for (let i = 0; i < 480; i++) { a.x += speed / 240; gait.crab(a, 1 / 240); renderPose(); }
    let plants = 0, plantedFrames = 0, leadLifts = 0, leadPlants = 0, leadPlantedFrames = 0, leadHeight = 0, trailDrag = 0, previous = renderPose();
    const sole = 0.06 * (1 + (a.col.body.height / 1.95 - 1) * ctx.PH.bodyHeightK());
    for (let i = 0; i < 4800; i++) {
      const side = a.crab.side, leadZ = a.crab.R[2];
      a.x += speed / 240; gait.crab(a, 1 / 240);
      if (side !== a.crab.side) plants++;
      if (leadZ < 0.001 && a.crab.R[2] > 0.001) leadLifts++;
      if (leadZ > 0.001 && a.crab.R[2] < 0.001) leadPlants++;
      const k = renderPose();
      leadHeight = Math.max(leadHeight, k.footR[2] - sole);
      if (a.crab.R[2] === 0) {
        assert(Math.abs(k.footR[2] - sole) < 1e-7, 'lead plants on floor, not above reach');
        if (Math.hypot(k.footR[0] - previous.footR[0], k.footR[1] - previous.footR[1]) < 1e-7) leadPlantedFrames++;
      }
      if (['L', 'R'].some(s => a.crab[s][2] === 0 && Math.hypot(k['foot' + s][0] - previous['foot' + s][0], k['foot' + s][1] - previous['foot' + s][1]) < 1e-7)) plantedFrames++;
      if (a.crab.side === 'L' && a.crab.L[2] < 0.001 && Math.hypot(k.footL[0] - previous.footL[0], k.footL[1] - previous.footL[1]) > 1e-4) trailDrag++;
      assert(k.footL[0] < k.footR[0], `${key} ${mode}: no crossing`);
      assert(k.footL.every(Number.isFinite) && k.footR.every(Number.isFinite));
      previous = k;
    }
    const hz = plants / 20;
    assert(hz <= game.K.stHzMax + 0.05, 'stance cap');
    if (mode === 'slow stance') assert(hz >= 0.95 && hz <= 1.2, 'near-one slow floor');
    if (mode === 'max sprint stance') assert(leadLifts > 15 && leadPlants > 15 && leadHeight >= 0.05 && leadHeight <= 0.071, 'max-speed visible lead lifts and plants');
    frequencies.push({ key, motion: mode, speed: +speed.toFixed(3), plants_per_second: hz });
  }
  const a = game.t5.makePlayer(0, key, 'p1');
  for (const [motion, speed] of [['jog', 2.8], ['sprint', sprintSpeed]]) {
    a.speed = speed; frequencies.push({ key, motion, speed: +speed.toFixed(3), plants_per_second: +(gait.cad(a) / Math.PI).toFixed(3) });
  }
}
assert(frequencies[4].plants_per_second - frequencies[0].plants_per_second > 1.2, 'stance floor/cap gap');
TUNE.set('l1_stHzMax', 1.8);
Object.assign(p, { stance: true, anim: 'def', crab: null, vx: 6, vy: 0 });
gait.crab(p, 1 / 120); p.x += 6 / 120; gait.crab(p, 1 / 120);
assert.equal(p.crab.hz, 1.8, 'hot cadence cap tuning');
const beforePause = JSON.stringify(p.crab);
gait.crab(p, 0); gait.crab(p, -1);
assert.equal(JSON.stringify(p.crab), beforePause, 'non-positive dt leaves feet unchanged');
TUNE.reset('l1_stHzMax');
console.table(frequencies);
console.log('PASS stance floor/cap/gap, hot cap tuning, max-speed lead lift/plant and classified drag');

for (const [label, mx, my, amount, contact] of [
  ['slow left', -1, 0, 0.1], ['slow right', 1, 0, 0.1],
  ['slow forward', 0, 1, 0.1], ['slow backward', 0, -1, 0.1],
  ['medium lateral', 1, 0, 0.26], ['medium forward', 0, 1, 0.26],
  ['max left', -1, 0, 1], ['max right', 1, 0, 1],
  ['max forward', 0, 1, 1], ['max backward', 0, -1, 1],
  ['turns, stops and stance gaps', -1, 0, 1],
  ['contact', 1, 0, 0.2, true],
]) {
  game.newGame({ mode: 'train', arch0: 'mrobinson', arch1: 'curry' });
  Object.assign(game.G, { phase: 'live', intro: null, tips: null });
  const [a, b] = game.G.players;
  Object.assign(a, { x: 0, y: 6, face: Math.PI / 2, hasBall: false, action: null, stun: 0 });
  Object.assign(b, { x: 0, y: 10, hasBall: true });
  Object.assign(game.G.ball, { state: 'held', holder: b.id });
  const samples = [];
  let kneeTravel = 0, kneeRise = 0, shinSweep = 0, active = 0, previousFrame, peak = { L: 0, R: 0 };
  for (let i = 0; i < 420; i++) {
    const transitions = label === 'turns, stops and stance gaps', turn = transitions && i >= 140 && i < 280;
    b.x = a.x + (turn ? 3 : 0); b.y = a.y + (contact ? 0.65 : turn ? 1 : 4);
    b.vx = b.vy = 0; b.hasBall = true; a.stam = 100;
    const sign = Math.floor(i / 90) % 2 ? -1 : 1, stop = transitions && i >= 200 && i < 230;
    const input = { ...game.t5.zeroInp(), mx: (turn ? my : mx) * amount * sign * !stop, my: (turn ? mx : my) * amount * sign * !stop,
      a3: !(transitions && (i === 100 || i === 300)), sprint: amount === 1 };
    game.t5.step([input, game.t5.zeroInp()], 1 / 60);
    if (!a.stance || a.anim !== 'def') { previousFrame = null; continue; }
    active++;
    assert.equal(a.sq, 1, 'stance excludes runPh squash impulses');
    const k = rig(a, a.pose, false, a.col.body), f = a.face + (a.pose.yaw || 0), fx = Math.cos(f), fy = Math.sin(f);
    previousFrame = checkFootContinuity(a, k, previousFrame, 1 / 60);
    const local = v => [v[0] * fy - v[1] * fx, v[0] * fx + v[1] * fy, v[2]];
    const frame = ['L', 'R'].map(side => {
      const knee = k['knee' + side], foot = k['foot' + side], toe = k['toe' + side];
      const lift = foot[2] - a.z - 0.06 * (1 + (a.col.body.height / 1.95 - 1) * ctx.PH.bodyHeightK());
      peak[side] = Math.max(peak[side], lift);
      assert(lift >= -1e-8 && lift <= 0.071 && Math.abs(foot[2] - toe[2]) < 1e-8, 'live flat feet, grounded except swing lifts');
      if (side !== a.crab.side) assert(Math.abs(lift) < 1e-8, 'live support foot grounded');
      return { knee: local(knee.map((v, j) => v - (j === 0 ? a.x : j === 1 ? a.y : a.z))), shin: local(foot.map((v, j) => v - knee[j])) };
    });
    for (const prev of samples) for (let side = 0; side < 2; side++) {
      kneeTravel = Math.max(kneeTravel, Math.hypot(...frame[side].knee.slice(0, 2).map((v, j) => v - prev[side].knee[j])));
      kneeRise = Math.max(kneeRise, Math.abs(frame[side].knee[2] - prev[side].knee[2]));
      const u = frame[side].shin, v = prev[side].shin;
      shinSweep = Math.max(shinSweep, Math.acos(Math.max(-1, Math.min(1, u.reduce((sum, x, j) => sum + x * v[j], 0) / Math.hypot(...u) / Math.hypot(...v)))) * 180 / Math.PI);
    }
    samples.push(frame);
  }
  assert(active > 390, 'live training exercises sustained stance');
  assert(peak.L > 0.01 && peak.R > 0.01, 'live lead and trail lift');
  if (label.startsWith('medium')) assert(peak.L >= 0.05 && peak.R >= 0.05, 'live visible medium lead/trail lift');
  console.log(`PASS live training ${label}: lifts ${peak.L.toFixed(3)}/${peak.R.toFixed(3)}m, horizontal knee ${(100 * kneeTravel).toFixed(3)}cm, vertical knee ${(100 * kneeRise).toFixed(3)}cm, shin ${shinSweep.toFixed(3)}deg`);
}

for (const liftSetting of [0, 0.15]) {
  TUNE.set('l1_stLift', liftSetting);
  const a = game.t5.makePlayer(0, 'mrobinson', 'p1');
  Object.assign(a, { x: 0, y: 6, z: 0, sq: 1, face: Math.PI / 2, stance: true, anim: 'def', action: null, hasBall: false, vx: 1.2, vy: 0, speed: 1.2 });
  a.pose = poseQA.poseTarget(a);
  let peak = 0, previous;
  for (let i = 0; i < 360; i++) {
    a.x += a.vx / 120; gait.crab(a, 1 / 120);
    a.pose = poseQA.poseTarget(a);
    const k = rig(a, a.pose, false, a.col.body), neutral = rig(a, { ...a.pose, crab: 0 }, false, a.col.body);
    for (const side of ['L', 'R']) {
      const lift = a.crab[side][2];
      peak = Math.max(peak, lift);
    }
    previous = checkFootContinuity(a, k, previous, 1 / 120);
  }
  assert(liftSetting === 0 ? peak === 0 : peak > 0.149, 'zero and maximum lift tuning');
}
TUNE.reset('l1_stLift');
console.log('PASS lift slider 0–0.15m: zero lift, maximum lift, matched knee rise and continuous feet');

for (const lift of [0.07, 0.12, 0.15]) for (const dt of [1 / 120, 1 / 60, 1 / 30]) for (const restart of [false, true]) for (const stopPhase of [0.15, 0.65]) for (const abrupt of [false, true]) {
  TUNE.load(lift === 0.07 ? {} : { l1_stLift: lift, l1_stStep: 0.15, l1_stHzMin: 2.05, l1_stHzMax: 3.5 });
  const a = game.t5.makePlayer(0, 'mrobinson', 'p1');
  Object.assign(a, { x: 0, y: 6, z: 0, sq: 1, face: Math.PI / 2, stance: true, anim: 'def', action: null, hasBall: false, speed: 1.5 });
  a.pose = poseQA.poseTarget(a);
  let decel = -1, previous, previousFrame, peak = 0, plantedPeak = 0, vertical = 0, horizontal = 0;
  for (let i = 0; i < 3 / dt; i++) {
    if (decel < 0 && a.crab && a.crab.phase >= stopPhase) decel = i;
    const since = decel < 0 ? -1 : (i - decel) * dt;
    const speed = abrupt
      ? since < 0 ? 0.874 : since < dt * 2 ? 0.136 : restart && since > 0.04 && since < 0.15 ? -0.136 : 0
      : since < 0 ? 1.5 : since < 0.12 ? Math.max(0.136, 1.4 - since * 10) : restart && since < 0.2 ? -0.136 : 0;
    a.x += speed * dt; a.speed = Math.abs(speed); a.vx = speed;
    gait.crab(a, dt); a.pose = poseQA.poseTarget(a);
    const k = rig(a, a.pose, false, a.col.body);
    previousFrame = checkFootContinuity(a, k, previousFrame, dt);
    const feet = ['L', 'R'].map(s => {
      if (s !== a.crab.side) assert.equal(a.crab[s][2], 0, 'decelerating support stays grounded');
      return k['foot' + s];
    });
    if (previous && decel >= 0) for (let s = 0; s < 2; s++) {
      const travel = Math.hypot(...feet[s].map((v, j) => v - previous[s][j])) / dt / 60;
      peak = Math.max(peak, travel);
      if (!a.crab.drag[['L', 'R'][s]]) plantedPeak = Math.max(plantedPeak, travel);
      vertical = Math.max(vertical, Math.abs(feet[s][2] - previous[s][2]) / dt / 60);
      horizontal = Math.max(horizontal, Math.hypot(feet[s][0] - previous[s][0], feet[s][1] - previous[s][1]) / dt / 60);
    }
    previous = feet;
  }
  assert(decel >= 0, 'decelerates mid-swing');
  console.log(`Decel-stop lift=${lift} ${Math.round(1 / dt)}Hz restart=${restart} phase=${stopPhase} abrupt=${abrupt}: 3D ${(peak * 100).toFixed(3)}cm, vertical ${(vertical * 100).toFixed(3)}cm, horizontal ${(horizontal * 100).toFixed(3)}cm per 16.7ms`);
  assert(plantedPeak <= 0.01501 && vertical <= 0.01001, 'non-drag deceleration continuity');
  assert.equal(a.crab.L[2] + a.crab.R[2], 0, 'stopped feet settle onto floor');
}
TUNE.reset();

for (const [profile, data] of stanceProfiles) for (const moving of [false, true]) {
  TUNE.load(data);
  const a = game.t5.makePlayer(0, 'mrobinson', 'p1');
  Object.assign(a, { x: 0, y: 6, z: 0, sq: 1, face: 0, stance: true, anim: 'def', action: null, hasBall: false, speed: moving ? 1.2 : 0, vx: moving ? 1.2 : 0, vy: 0 });
  a.pose = poseQA.poseTarget(a);
  let previous, previousFrame, peak = 0, worldPeak = 0, recoveryLift = 0;
  const shins = [[], []];
  for (let i = 0; i < 360; i++) {
    a.face += i % 80 === 0 ? Math.PI / 2 : 0.04;
    if (moving) a.x += 1.2 / 60;
    gait.crab(a, 1 / 60); a.pose = poseQA.poseTarget(a);
    if (a.crab.recovering) recoveryLift = Math.max(recoveryLift, a.crab[a.crab.side][2]);
    const k = rig(a, a.pose, false, a.col.body), fx = Math.cos(a.face), fy = Math.sin(a.face);
    if (previousFrame) for (const side of ['L', 'R']) {
      const foot = k['foot' + side], before = previousFrame.rig['foot' + side], floor = 0.06 * (1 + (a.col.body.height / 1.95 - 1) * ctx.PH.bodyHeightK());
      if (foot[2] <= floor + 0.001 && before[2] <= floor + 0.001) worldPeak = Math.max(worldPeak, Math.hypot(...foot.map((v, j) => v - before[j])));
    }
    previousFrame = checkFootContinuity(a, k, previousFrame, 1 / 60);
    const feet = ['L', 'R'].map(s => {
      const f = k['foot' + s], x = f[0] - a.x, y = f[1] - a.y;
      if (s !== a.crab.side) assert.equal(a.crab[s][2], 0, 'pivot support grounded');
      const neutral = rig(a, { ...a.pose, crab: 0 }, false, a.col.body), knee = k['knee' + s];
      const dx = f[0] - knee[0], dy = f[1] - knee[1], dz = f[2] - knee[2], length = Math.hypot(dx, dy, dz);
      const shin = [(dx * fy - dy * fx) / length, (dx * fx + dy * fy) / length, dz / length], samples = shins[s === 'L' ? 0 : 1];
      samples.push(shin);
      return [x * fy - y * fx, x * fx + y * fy, f[2]];
    });
    if (previous) for (let s = 0; s < 2; s++) peak = Math.max(peak, Math.hypot(...feet[s].map((v, j) => v - previous[s][j])));
    previous = feet;
  }
  console.log(`Pivot ${profile} ${moving ? 'moving' : 'in place'} peak body-relative foot shift: ${(peak * 100).toFixed(3)}cm`);
  console.log(`PASS pivot ${profile} ${moving ? 'moving' : 'in place'} grounded world shift ${(worldPeak * 100).toFixed(3)}cm; recovery steps ${a.crab.recoveries || 0}`);
  assert(a.crab.recoveries > 0, 'turn-displaced feet start recovery swings');
  assert(recoveryLift > game.K.stLift * 0.9, 'turn recovery visibly lifts the foot');
}

for (const [profile, data] of stanceProfiles) {
  TUNE.load(data);
  const speeds = [['slow', 0.5], ['medium', 1.2], ['non-sprint', maximumSpeed('mrobinson', true, false)], ['sprint', maximumSpeed('mrobinson', true, true)]];
  for (const [direction, mx, my] of [['left', -1, 0], ['right', 1, 0], ['forward', 0, 1], ['backward', 0, -1]]) for (const [motion, speed] of speeds) {
    const a = game.t5.makePlayer(0, 'mrobinson', 'p1'), dt = 1 / 60;
    Object.assign(a, { x: 0, y: 6, z: 0, sq: 1, face: Math.PI / 2, stance: true, anim: 'def', action: null, hasBall: false, speed, vx: mx * speed, vy: my * speed });
    a.pose = poseQA.poseTarget(a);
    let previous, previousSides, ground = 0, air = 0, drag = 0, supportSlip = 0, peak = 0;
    for (let i = 0; i < 600; i++) {
      a.x += a.vx * dt; a.y += a.vy * dt;
      gait.crab(a, dt); a.pose = poseQA.poseTarget(a);
      const k = rig(a, a.pose, false, a.col.body), before = previous;
      previous = checkFootContinuity(a, k, previous, dt);
      const support = ['L', 'R'].map(side => side !== a.crab.side);
      for (const [j, side] of ['L', 'R'].entries()) {
        const foot = k['foot' + side], floor = 0.06 * (1 + (a.col.body.height / 1.95 - 1) * ctx.PH.bodyHeightK());
        if (i < 120) continue;
        peak = Math.max(peak, foot[2] - floor);
        const travel = Math.hypot(...foot.map((v, d) => v - before.rig['foot' + side][d]));
        if (previous.grounded[side]) {
          ground += travel;
          if (a.crab.drag[side]) drag += travel;
          else if (support[j] && previousSides[j]) supportSlip = Math.max(supportSlip, travel);
        } else air += travel;
      }
      previousSides = support;
      assert(k.footL[0] < k.footR[0], 'profile feet never cross');
    }
    assert(supportSlip < 1e-7, 'non-drag support stays world planted');
    if (speed <= 1.2) assert(drag < 1e-7, 'slow and medium shuffles remain below reach-limited drag');
    console.log(`PASS planting ${profile} ${direction} ${motion} ${speed.toFixed(6)}m/s: grounded ${(100 * ground / (ground + air)).toFixed(3)}%, drag ${(100 * drag / (ground + air)).toFixed(3)}%, support slip ${supportSlip.toExponential(2)}m, lift ${(100 * peak).toFixed(3)}cm`);
  }
}
TUNE.reset();
console.log(`PASS classified drag: ${continuity.drag} intervals, max acceleration ${continuity.acceleration.toFixed(3)}m/s²`);
console.log(`PASS stance IK: ${geometry.frames} sampled poses, max bone error ${(geometry.error * 100).toExponential(3)}%, max knee-to-hip horizontal ${(geometry.knee * 100).toFixed(3)}cm`);
console.log('PASS stance IK lengths/bend side, planting, drag budgets, contact, cadence, stops and pivots');
