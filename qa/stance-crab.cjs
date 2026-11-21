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

for (const [label, vx, vy] of [['slow right', 0.5, 0], ['medium right', 1.2, 0], ['medium left', -1.2, 0], ['medium forward', 0, 1.2], ['medium backward', 0, -1.2], ['medium diagonal', 0.84, 0.84]]) {
  Object.assign(p, { x: 0, y: 6, face: Math.PI / 2, stance: true, anim: 'def', crab: null, vx, vy, speed: Math.hypot(vx, vy) });
  gait.crab(p, 1 / 120);
  pose();
  for (let i = 0; i < 240; i++) { p.x += vx / 120; p.y += vy / 120; gait.crab(p, 1 / 120); pose(); }
  let prev = pose(), supports = 0, total = 0, lifts = new Set(), lastLift, alternations = 0;
  for (let i = 0; i < 720; i++) {
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
    if (supportSlip < 1e-7) supports++;
    assert(k.footL[0] < k.footR[0], 'feet never cross');
    prev = k;
  }
  assert(supports / total > 0.98, `${label}: planted support ${supports}/${total}`);
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
short.speed = tall.speed = short.sprW = tall.sprW = 0;
TUNE.set('l1_drHeight', 0);
assert.equal(gait.drib(short), gait.drib(tall));
TUNE.reset('l1_drHeight');
const fallback = { h: 1.95, speed: 0 };
assert(Number.isFinite(gait.drib(fallback)), 'height fallback without measured body');
for (const name of ['stDepth', 'stWidth', 'stStep', 'stLift', 'stHzMin', 'stHzMax', 'gaHzMin', 'gaHzMax', 'gaHeight', 'drCrouch', 'drHeight']) assert(TUNE.has('l1_' + name));
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
    const sole = 0.06 * (1 + (a.col.body.height / 1.95 - 1) * 1.55);
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
    if (speed <= 1.2) assert(plantedFrames > 4800 * 0.98, `${key} ${mode}: fully planted support ${plantedFrames}/4800`);
    if (mode === 'max sprint stance') assert(leadLifts > 15 && leadPlants > 15 && leadHeight > 0.08 && leadPlantedFrames > 400 && trailDrag > 400, 'max-speed lead lifts/plants, holds when reachable, and grounded trail drag');
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
console.log('PASS stance floor/cap/gap, hot cap tuning, slow/medium planted support, max-speed lead lift/plant and trail drag');
