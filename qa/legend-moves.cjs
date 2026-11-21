const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ctx = vm.createContext({ console, performance: { now: () => 0 }, setTimeout() {}, clearTimeout() {} });
ctx.window = ctx;
ctx.PH = { input: { endTick() {}, read: () => ({}) } };
for (const name of ['tune', 'render', 'roster', 'r5', 'game', 'b5', 'team5']) {
  let source = fs.readFileSync(path.join(__dirname, '..', 'js', name + '.js'), 'utf8');
  if (name === 'game') source = source.replace('PH.game = {', 'PH.legendQA = { buildSteps, stepUpdate, stepPose, updateGrip, heldShotPos, startSteal, startHesitation, updateHesitation, updateAction, updatePlayer, pickDunk, dunkTakeoff, releaseShot, cvSet }; PH.game = {');
  vm.runInContext(source, ctx, { filename: name + '.js' });
}
const gm = ctx.PH.game, Q = ctx.PH.legendQA, H = ctx.PH.render.HOOP, K = gm.K;
const plain = (x) => JSON.parse(JSON.stringify(x));
const close = (a, b, msg) => assert(Math.abs(a - b) < 1e-8, `${msg}: ${a} != ${b}`);
for (const key of ['manuContest', 'manuSteal', 'manuCpu', 'aiCommit', 'aiProbeRange', 'aiBurst', 'aiChain', 'vcRunway', 'vcSpeed', 'vcSetRadius', 'vcSetSpeed']) {
  const meta = ctx.PH.TUNE.meta('l1_' + key);
  assert(meta && meta.wide === false && meta.min <= K[key] && meta.max >= K[key], `${key} exposed with bounded slider`);
}
function setup(key = 'ginobili', distance = 4.5) {
  gm.newGame({ mode: '2p', arch0: key, arch1: 'gobert', target: 9999 });
  gm.seed(7);
  Object.assign(gm.G, { phase: 'live', needClear: false, off: 0, time: 10 });
  const [p, d] = gm.G.players;
  Object.assign(p, { x: 0, y: H.y - distance, vx: 0, vy: 5, speed: 5, face: Math.PI / 2, hasBall: true, ctrl: 'p1', hand: 1 });
  Object.assign(d, { x: 4, y: H.y, vx: 0, vy: 0, speed: 0, stance: false, off: false, action: null, stun: 0 });
  Object.assign(gm.G.ball, { state: 'held', holder: 0, dead: false });
  return { p, d };
}
function euro(key = 'ginobili', disabled = false) {
  const f = setup(key);
  if (disabled) f.p.sk.cd = 10;
  assert(gm._dbg.startFinish(f.p, { mx: 0.7, my: -0.7 }, 'stick', 'a1'));
  assert.equal(f.p.action.v, 'euro');
  return { ...f, a: f.p.action };
}
for (const profile of [null, require('./far-layup-c1.json').data]) {
  const old = { ...K };
  if (profile) for (const [k, v] of Object.entries(profile)) if (k.startsWith('l1_') && k.slice(3) in K) K[k.slice(3)] = v;
  const { p, a } = euro();
  const P = gm._dbg.finPlan(p), normal = { type: 'layup', v: 'euro', sty: 'euro', hand: -1 };
  normal.wp = Q.buildSteps(p, normal, P, 'euro', -1);
  assert.deepEqual(plain(a.wp), plain(normal.wp), 'identical legal euro steps, lengths and timing');
  assert.equal(a.wp.length, 2);
  assert(a.wp[0].x > a.wp[0].fx && a.wp[1].x < a.wp[1].fx, 'right then left');
  assert.equal(a.hand, -1);
  assert(['scoop', 'glass'].includes(a.sty));
  assert.equal(a.skill, undefined, 'signature does not opt into legacy guaranteed-skill outcomes');
  for (const [si, st, right] of [[0, 0, 1], [1, a.wp[1].T, 0]]) {
    Object.assign(a, { si, st }); Q.updateGrip(p, a, 1 / 60);
    close(p.grip.right, right, 'actual rig grip carry');
    const pose = Q.stepPose(a); assert(Number.isFinite(pose.aRp) && Number.isFinite(pose.aLp));
  }
  Q.cvSet(p, a, 'scoop'); assert.equal(a.hand, -1, 'contact conversion preserves left finish');
  Object.assign(K, old);
}
for (const key of ['kobe', 'lebron', 'iverson']) assert.equal(euro(key).a.sigMove, undefined, `${key} ordinary euro`);
assert.equal(euro('ginobili', true).a.sigMove, undefined, 'cooldown ordinary euro');
{
  const { p } = setup();
  assert(gm._dbg.startFinish(p, { mx: 0, my: 1 }, 'lay', 'a1'));
  assert.equal(p.action.sigMove, undefined, 'other Manu layups unchanged');
  let picks = 0;
  for (let i = 1; i <= 40; i++) { const { p } = setup(); p.ctrl = 'cpu'; gm.seed(i * 100003); gm._dbg.startFinish(p, {}, 'lay', 'a1'); if (p.action.sigMove) picks++; }
  assert(picks > 15 && picks < 40, 'CPU prefers euro without forcing every layup');
}
{
  const { p, d, a } = euro();
  Object.assign(d, { x: p.x, y: p.y + 1, z: 0.3, action: { type: 'block' } });
  Q.stepUpdate(p, a, { a1: true }, 0.01);
  const early = gm.contestInfo(p, d, 'in').c;
  const marker = a.sigMove; a.sigMove = null; const ordinary = gm.contestInfo(p, d, 'in').c; a.sigMove = marker;
  close(early, ordinary * K.manuContest, 'early block contest multiplier');
  a.inSteps = false;
  close(gm.contestInfo(p, d, 'in').c, early, 'same premature jump remains reduced');
  d.action = { type: 'block' };
  close(gm.contestInfo(p, d, 'in').c, ordinary, 'fresh late contest is normal');
  d.action = null; d.stance = true; a.inSteps = true; Q.stepUpdate(p, a, { a1: true }, 0.01);
  const stanceEarly = gm.contestInfo(p, d, 'in').c;
  a.sigMove = null; const stanceNormal = gm.contestInfo(p, d, 'in').c; a.sigMove = marker;
  close(stanceEarly, stanceNormal * K.manuContest, 'early hands-up contest multiplier');
  a.inSteps = false; d.action = { type: 'block' }; d.z = 0.3;
  close(gm.contestInfo(p, d, 'in').c, ordinary, 'late jump beats early hands-up marker');
  d.action = null; d.stance = false; a.released = true;
  Q.updateAction(p, {}, 0.001, false);
  d.stance = true; a.sigMove = null;
  const raisedAgain = gm.contestInfo(p, d, 'in').c; a.sigMove = marker;
  close(gm.contestInfo(p, d, 'in').c, raisedAgain, 'lowered then late-raised hands contest normally');
}
{
  const saved = K.manuSteal, counts = [];
  for (const multiplier of [1, saved]) {
    let stolen = 0;
    for (let i = 1; i <= 256; i++) {
      const { p, d } = euro();
      Object.assign(d, { x: p.x + 0.4, y: p.y + 0.3, face: Math.atan2(-0.3, -0.4), ctrl: 'p2' });
      K.manuSteal = multiplier; Q.startSteal(d); gm.seed(i * 100003);
      Q.updateAction(d, {}, K.stlHitT + 0.001, false);
      stolen += +!p.hasBall;
    }
    counts.push(stolen);
  }
  K.manuSteal = saved;
  assert(counts[1] > 0 && counts[1] < counts[0], 'carry protection reduces normal reach-in rolls without immunity');
  console.log(`PASS Manu carry steal rolls unprotected=${counts[0]}/256 protected=${counts[1]}/256 (not immune)`);
}
function answer(key, velocity, hand = 1, distance = 1.5, expired = false, seed = 7) {
  const { p, d } = setup(key, 6);
  Object.assign(p, { hand, handX: hand * 0.33, vx: 0, vy: 0 });
  Object.assign(d, { x: 0, y: p.y + distance, vx: hand * velocity[0], vy: velocity[1] });
  Q.startHesitation(p, {}, { key: 'hesi', exit: null }, gm.G.time);
  const first = p.action; first.t = first.T * 0.5;
  Object.assign(d, { vx: hand * velocity[0], vy: velocity[1], stun: 0, action: null });
  gm.seed(seed);
  if (expired) { p.action = null; p.mvEndT = gm.G.time - K.cbWin - 1; gm.G.time += 2; }
  if (expired) gm._dbg.startMove(p, { mx: -hand, my: 0.6 }, 'cross');
  else assert(Q.updateHesitation(p, first, { mx: -hand, my: 0.6 }));
  return { p, d, a: p.action };
}
for (const hand of [1, -1]) {
  const { p, a } = answer('iverson', [2, 0], hand);
  assert.equal(a.sigMove, 'iverson'); assert.equal(a.hesiDrive, true); assert.equal(a.kind, 'cross');
  assert.equal(a.h1, -hand); assert.equal(a.h0, hand); assert.equal(a.skill, undefined);
  const speed = (u, bonus) => { const saved = K.aiBurst; K.aiBurst = bonus; a.t = a.T * u; Q.updateAction(p, {}, 0, false); K.aiBurst = saved; return Math.hypot(p.vx, p.vy); };
  assert(speed(0.4, K.aiBurst) > speed(0.4, 0), 'bonus accelerates early exit');
  assert(speed(0.9, K.aiBurst) < speed(0.9, 0), 'bonus recovers distance late');
  let base = 0, burst = 0;
  for (let i = 0; i < 1000; i++) { const u = 0.3 + (i + 0.5) / 1000 * 0.7; base += speed(u, 0); burst += speed(u, K.aiBurst); }
  close(base, burst, 'no extra exit distance');
}
for (const [label, key, v, distance, expired] of [
  ['home', 'iverson', [0, 0], 1.5], ['backing off', 'iverson', [2, 2], 1.5],
  ['other side', 'iverson', [-2, 0], 1.5], ['backed away', 'iverson', [2, 0], 4],
  ['wrong player', 'kobe', [2, 0], 1.5], ['expired combo', 'iverson', [2, 0], 1.5, true],
]) assert.equal(answer(key, v, 1, distance, expired).a.sigMove, undefined, label);
{
  const ankle = gm.CFG.ankle; gm.CFG.ankle = 0;
  const noAnkle = answer('iverson', [2, 0]);
  assert.equal(noAnkle.a.sigMove, 'iverson');
  assert.equal(noAnkle.d.stun, 0, 'signature cannot bypass the normal ankle-badge roll');
  gm.CFG.ankle = ankle;
  const { p, d } = setup('iverson', 6); p.ctrl = 'cpu'; Object.assign(d, { x: 0, y: p.y + 1.5, vx: 2 });
  Q.startHesitation(p, {}, null, gm.G.time); const first = p.action; first.t = first.T * 0.5; first.answerChain = true;
  Object.assign(d, { vx: 2, vy: 0, stun: 0, action: null });
  gm.t5.aiInput(p, 0.01); Q.updateAction(p, {}, 0.01, false);
  assert.equal(p.action.sigMove, 'iverson', 'CPU uses existing held-hesi cross release');
}
function dunk(key = 'carter', runway = true, planted = false, speed = 5) {
  const { p, d } = setup(key, 4.5);
  p.sk.runway = runway ? K.vcRunway + 0.5 : 0; p.vy = speed;
  gm._dbg.startDunk(p, gm._dbg.finPlan(p), 'a2'); const a = p.action;
  const w = a.wp[a.wp.length - 1]; Object.assign(p, { x: w.x, y: w.y });
  if (planted) Object.assign(d, { x: H.x, y: H.y - 0.5, stance: true, vx: 0, vy: 0 });
  Q.dunkTakeoff(p, a);
  return { p, d, a };
}
assert.equal(dunk().a.v, 'windmill'); assert.equal(dunk().a.sigMove, 'carter');
for (const [key, runway, planted, speed] of [['carter', false, false, 5], ['carter', true, true, 5], ['carter', true, false, 1], ['kobe', true, false, 5]]) {
  const { a } = dunk(key, runway, planted, speed);
  assert.equal(a.sigMove, undefined, 'runway, speed, planted and player gates');
  if (key === 'carter') assert.notEqual(a.v, 'windmill');
}
{
  const { p } = setup('carter', 8);
  for (let i = 0; i < 40; i++) { gm.G.time += 1 / 60; Q.updatePlayer(p, { mx: 0, my: 1, sprint: true }, 1 / 60); }
  assert(p.sk.runway > K.vcRunway, 'runway accumulates from real movement');
  p.vx = p.vy = 0; Q.updatePlayer(p, {}, 1 / 60); assert.equal(p.sk.runway, 0, 'stopping clears runway');
}
for (const key of ['ginobili', 'carter']) {
  const results = [];
  for (const contested of [false, true]) {
    let made = 0, prob = 0;
    for (let i = 1; i <= 96; i++) {
      const { p, d, a } = key === 'ginobili' ? euro() : dunk();
      gm.CFG.blockMul = 0;
      if (key === 'ginobili') { a.inSteps = false; a.t = a.ideal; p.y = H.y - 1.2; p.x = 0; p.z = 0.1; }
      if (contested) Object.assign(d, { off: false, x: p.x, y: p.y + 0.6, z: 0.4, stance: true, action: { type: 'block', zmax: 1, t: 0.2 } });
      else d.off = true;
      gm.seed(i * 100003);
      if (key === 'ginobili') Q.releaseShot(p, 0.6, 'lay');
      else { a.t = a.T * 0.81; Q.updateAction(p, {}, 0.001, false); }
      const shot = gm.G.lastShot || gm.G.ball.shot?.info;
      assert(shot, 'normal shot result published'); assert(!a.skill);
      made += +shot.made; prob += shot.prob;
    }
    results.push({ made, prob: prob / 96 });
  }
  assert(results[1].prob < results[0].prob, `${key} contest reduces ordinary shot rolls`);
  assert(results[1].made < 96 && results[0].made > 0, `${key} no guaranteed makes`);
  console.log(`PASS ${key} seeded makes open=${results[0].made}/96 contested=${results[1].made}/96; contest retains normal penalties`);
}
console.log('PASS Manu: right-to-left rig carry, left finish, early vs late contest, CPU preference, player/cooldown gates, identical default/C1 euro steps/distance/timing');
console.log('PASS Iverson: opposite-hand low cross, committed-only fixed-direction start bonus, same distance, stay-home/back-off/expired/player gates, CPU chain, no forced ankle break');
console.log('PASS Carter: real runway tracking, windmill preference, planted/no-runway/slow/player fallback, ordinary contest and shot rolls');
