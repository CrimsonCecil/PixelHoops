const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function load() {
  const math = Object.create(Math);
  let seed = 7;
  math.random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
  const ctx = vm.createContext({ console, Math: math, performance: { now: () => 0 }, setTimeout() {}, clearTimeout() {} });
  ctx.window = ctx;
  ctx.PH = { input: { endTick() {}, read: () => ({}), read5: () => ({}) } };
  for (const name of ['tune', 'render', 'roster', 'measurements', 'r5', 'game', 'b5', 'team3', 'team5']) {
    let source = fs.readFileSync(path.join(__dirname, '../js', name + '.js'), 'utf8');
    if (name === 'game') source = source.replace('PH.game = {', 'PH.legendQA = { startShot, releaseShot, startMove, updatePlayer, skTick, contactBlock, tipsInput, updateAction, pumpFake }; PH.game = {');
    if (name === 'team3') source = source.replace('PH.T3 = {', 'PH.pickQA = { startPick, pickTick, send, passStep }; PH.T3 = {');
    if (name === 'team5') source = source.replace('PH.T5 = {', 'PH.passQA = { catchBall, passUpdate, screenInp }; PH.T5 = {');
    vm.runInContext(source, ctx, { filename: name + '.js' });
  }
  ctx.PH.randomSeed = value => { seed = value; };
  return ctx.PH;
}
const PH = load(), gm = PH.game, qa = PH.legendQA, A = gm.t5, G = gm.G, K = gm.K;
const inp = () => ({ ...A.zeroInp() });
function duel(key) {
  gm.newGame({ mode: '2p', arch0: key, arch1: 'gobert', target: 9999 });
  Object.assign(G, { time: 10, phase: 'live', needClear: false });
  const [p, d] = G.players;
  Object.assign(p, { x: 0, y: A.HOOP.y - 5, vx: 0, vy: 0, speed: 0, hasBall: true });
  Object.assign(d, { x: 6, y: 3, off: true });
  Object.assign(G.ball, { state: 'held', holder: p.id, x: p.x, y: p.y, z: 1, dead: false });
  return { p, d };
}
function probe(p) {
  qa.startMove(p, inp(), 'hesi');
  p.action = null;
  G.time += 0.4;
}
function shot(p) { qa.startShot(p, inp(), 'a1'); return p.action; }
function finish(p, error = 0) {
  const a = p.action;
  qa.releaseShot(p, error, 'shot');
  assert.equal(G.cutin.skill, p.arch.skill.name);
  assert.equal(G.stats[p.id].sk, 1);
  assert.equal(G.ball.lastSk.sk, p.arch.key);
  assert.equal(G.lastShot.skill, p.arch.key);
  assert.equal(a.softSkill, true);
  assert(G.lastShot.prob <= K.lgCap && G.lastShot.prob > 0);
  return G.lastShot;
}

{
  let { p, d } = duel('tmac');
  const base = shot(p); assert.equal(base.skill, null);
  const normalTime = base.ideal, normalHeight = base.F.setP, normalJump = base.F.jmp;
  ({ p, d } = duel('tmac')); probe(p);
  qa.skTick(p, 0); assert.equal(p.sk.hint, 'ready');
  let a = shot(p);
  assert.equal(a.skill, 'tmac'); assert.equal(a.v, 'pullup');
  assert.equal(a.V.back, 0); assert.equal(a.V.lat, 0); assert.equal(a.F.lean, 0);
  assert(a.ideal < normalTime && a.F.setP > normalHeight && a.F.jmp > normalJump);
  const before = [p.x, p.y]; const open = finish(p, 0.3);
  assert.deepEqual([p.x, p.y], before, 'skill never snaps the shooter');
  ({ p, d } = duel('tmac')); probe(p);
  Object.assign(d, { off: false, x: -1.5, y: p.y + 0.2, stance: true });
  p.hand = 1; a = shot(p); assert.equal(a.skill, 'tmac');
  const contested = finish(p, 0.3);
  assert(contested.contest > 0 && contested.prob < open.prob);
  ({ p, d } = duel('tmac')); probe(p);
  Object.assign(d, { off: false, x: 0.5, y: p.y + 0.3 }); p.hand = 1;
  assert.equal(shot(p).skill, null, 'ball-side tight defender cancels');
  ({ p, d } = duel('tmac')); probe(p); a = shot(p);
  Object.assign(d, { off: false, x: 0.5, y: p.y + 0.3 }); p.hand = 1;
  qa.releaseShot(p, 0.3, 'shot');
  assert.equal(a.skill, null); assert.equal(G.stats[p.id].sk, 0); assert(G.lastShot.contest > 0);
  ({ p, d } = duel('tmac')); probe(p); p.hand = -1;
  Object.assign(d, { off: false, x: -0.5, y: p.y + 0.3 });
  assert.equal(shot(p).skill, null, 'left gather uses the actual dribble hand');
  ({ p } = duel('tmac')); probe(p); G.time += K.lgProbe + 0.01;
  assert.equal(shot(p).skill, null);
  ({ p } = duel('tmac')); qa.pumpFake(p, 0.2, false); p.action = null;
  assert.equal(shot(p).skill, 'tmac', 'pump fake is an existing probe');
  ({ p } = duel('tmac')); probe(p); p.sk.cd = 1;
  assert.equal(shot(p).skill, null);
  ({ p } = duel('tmac')); probe(p); G.mode = 'demo';
  assert.equal(shot(p).skill, null);
  console.log('PASS: McGrady probe/fake pull-up, high upright quick release, cooldown/expiry/demo negatives, live gather-side cancellation and ordinary contest');
}
function sprint(p) {
  const i = { ...inp(), mx: 1, sprint: true };
  for (let n = 0; n < 42; n++) { G.time += 1 / 60; qa.updatePlayer(p, i, 1 / 60); }
  assert(p.sk.sprintAt != null, 'actual hard sprint arms stop-and-pop');
}
{
  let { p, d } = duel('rip'); assert.equal(shot(p).skill, null);
  ({ p, d } = duel('rip')); p.x = -3; sprint(p);
  assert.equal(shot(p).skill, 'rip'); finish(p);
  ({ p, d } = duel('rip')); p.x = -3; sprint(p); G.time += K.lgStop + 0.01;
  assert.equal(shot(p).skill, null);
  ({ p, d } = duel('rip')); p.x = -3; sprint(p); probe(p);
  assert.equal(shot(p).skill, null, 'dribble move cancels stop-and-pop');
  ({ p, d } = duel('rip')); p.x = -3; sprint(p); p.y = 4;
  assert.equal(shot(p).skill, null, 'no three-point skill');
  ({ p, d } = duel('rip')); p.x = -3; sprint(p);
  Object.assign(d, { off: false, x: p.x, y: p.y + 0.5 });
  assert.equal(shot(p).skill, null);
  assert.equal(gm.ARCH.rip.three, 0.81);
  console.log('PASS: Hamilton actual sprint stop-and-pop; no sprint/expired/move/three/close negatives; three rating unchanged');
}
{
  const { p } = duel('rip');
  p.x = -2; sprint(p);
  assert.equal(A.legendShot(p), 'rip');
  const priorSprintAt = p.sk.sprintAt;
  qa.startMove(p, inp(), 'hesi');
  const run = { ...inp(), mx: -1, sprint: true };
  let frames = 0;
  while (p.action && frames++ < 90) {
    G.time += 1 / 60; qa.updatePlayer(p, run, 1 / 60);
  }
  assert.equal(p.action, null, 'hesitation completes through normal player updates');
  assert(G.time - priorSprintAt < K.lgStop, 'move ends before the old stop window expires');
  assert.equal(A.legendShot(p), null, 'move cancels the qualified sprint');
  for (let n = 0; n < 42; n++) {
    G.time += 1 / 60; qa.updatePlayer(p, run, 1 / 60);
    if (n === Math.floor(K.lgRun * 60 / 2)) assert.equal(A.legendShot(p), null, 'partial fresh sprint is insufficient');
  }
  assert(p.sk.runStart > p.lastMoveT, 'fresh run starts after the move');
  assert.equal(shot(p).skill, 'rip', 'full fresh sprint re-arms without waiting out the stop window');
  finish(p);
  console.log('PASS: Hamilton sprint/move/fresh sprint re-arms stop-and-pop without an idle reset; partial sprint stays ineligible');
}
for (const key of ['tmac', 'rip']) {
  let made = 0, missed = 0;
  for (let seed = 1; seed <= 180; seed++) {
    const { p } = duel(key);
    if (key === 'tmac') probe(p);
    else { p.x = -3; sprint(p); }
    gm.seed(seed * 997); assert.equal(shot(p).skill, key);
    const L = finish(p); L.made ? made++ : missed++;
  }
  assert(made && missed, 'even perfect skill shots have both outcomes');
  console.log('PASS:', key, 'perfect skill shots are probabilistic:', made, 'makes,', missed, 'misses');
}
for (const key of ['tmac', 'rip']) {
  const { p, d } = duel(key);
  Object.assign(p, { y: 10, z: 1.5, face: Math.PI / 2 });
  Object.assign(d, { off: false, x: 0, y: 10.3, z: 1, stun: 0, face: -Math.PI / 2,
    action: { type: 'block', t: 0.25, zmax: 1, rel: 1 } });
  Object.assign(d.pose, { aRp: Math.PI, aRe: 0, aRq: 0, reachR: 1, reachL: 1 });
  const hand = PH.rig(d).handR, ball = { x: hand[0], y: hand[1], z: hand[2] };
  const a = { type: 'shot', skill: key, softSkill: true, t: 0.3, V: { blk: 100, name: 'pullup' } };
  const before = [p.x, p.y, d.x, d.y];
  gm.CFG.blockMul = 100;
  assert(qa.contactBlock(p, a, ball, 'shot', { who: p.id }), 'soft skill takes normal physical block path');
  assert.deepEqual([p.x, p.y, d.x, d.y], before);
}
console.log('PASS: both shot skills remain physically blockable, with no position snaps');

function team(mode, key = 'nash') {
  if (mode === 't3') PH.T3.start({ slots: [key, 'shaq', 'rip', 'kobe', 'giannis', 'curry'].map(arch => ({ arch, role: 'human' })), human: 0 });
  else {
    PH.T5.start({ home: 'LAL', away: 'BOS', human: -1 });
    const p = PH.T5.T.tm[0].on[0]; p.arch = gm.ARCH[key]; p.r = { ...p.r, ...p.arch };
    PH.T5.T.phase = 'live'; PH.T5.T.time = 10;
  }
  Object.assign(G, { time: 10, phase: 'live', needClear: false, off: 0 });
  const O = G.players.filter(p => p.tm === 0), D = G.players.filter(p => p.tm === 1), [p, s] = O;
  for (const q of G.players) Object.assign(q, { x: 6, y: 1, action: null, stun: 0, z: 0, vx: 0, vy: 0, speed: 0, hasBall: false, off: false });
  Object.assign(p, { x: 0, y: 6, hasBall: true, face: Math.PI / 2, opp: D[0], sk: { ...p.sk, cd: 0, screen: null, curl: null } });
  Object.assign(s, { x: 0.8, y: 7, vx: 0, vy: 2 });
  Object.assign(D[0], { x: -0.6, y: 6.5, opp: p, mark: p });
  Object.assign(D[1], { x: 0.9, y: 6.3, opp: s, mark: s });
  Object.assign(G.ball, { state: 'held', holder: p.id, x: p.x, y: p.y, z: 1, dead: false });
  return { p, s, D, O };
}
function screen(mode, p, s, d) {
  if (mode === 't3') {
    gm.seed(1);
    Object.assign(s, { x: d.x + 0.7, y: d.y, vx: 0, vy: 0 });
    Object.assign(d, { vx: 3, vy: 0 });
    PH.pickQA.startPick(s, p, d);
    PH.T3.T.pick.at = G.time - 0.2;
    PH.pickQA.pickTick(G.players[G.ball.holder]);
  } else PH.scr.hit(s, d, p.hasBall ? 'pnr' : 'off', PH.T5.T.time, p);
  assert.equal(p.sk.screen.s, s.id, 'real screen contact records recipient');
}
for (const mode of ['t3', 't5']) {
  let { p, s, D, O } = team(mode);
  assert.equal(A.legendPocket(p, s), false);
  screen(mode, p, s, D[0]);
  Object.assign(s, { x: 0, y: 8, vx: 0, vy: 2 });
  Object.assign(D[0], { x: -1, y: 6.5, stun: 0 }); Object.assign(D[1], { x: 1, y: 6.5 });
  assert.equal(A.legendPocket(p, s), false, 'handler must actually come off the screen');
  p.y += 0.7; Object.assign(G.ball, { x: p.x, y: p.y });
  assert(A.legendPocket(p, s));
  assert.equal(A.legendPocket(p, null), false, 'missing receiver is safe');
  assert.equal(A.legendPocket(p, O[2]), false, 'must pass to screener');
  s.vy = -2; assert.equal(A.legendPocket(p, s), false); s.vy = 2;
  D[1].x = 5; assert.equal(A.legendPocket(p, s), false); D[1].x = 1;
  G.time += K.lgScreen + 0.01; assert.equal(A.legendPocket(p, s), false); G.time -= K.lgScreen + 0.01;
  p.sk.cd = 1; assert.equal(A.legendPocket(p, s), false); p.sk.cd = 0;
  const pass = mode === 't3' ? PH.pickQA.send : PH.T5.doPass;
  assert(pass(p, s, 'chest'));
  const P = mode === 't3' ? PH.T3.T.pass : PH.T5.T.ps;
  assert.equal(P.kind, 'bounce'); assert.equal(P.skill, 'nash');
  assert.equal(G.cutin.skill, gm.ARCH.nash.skill.name); assert.equal(G.stats[p.id].sk, 1);
  let intercepted = false;
  if (mode === 't3') {
    const step = P.duration / 60;
    for (let n = 0; n < 60 && G.ball.state === 'pass'; n++) {
      const u = Math.min(1, (P.t + step) / P.duration);
      Object.assign(D[0], { x: P.x + (P.tx - P.x) * u, y: P.y + (P.ty - P.y) * u, stun: 0 });
      PH.pickQA.passStep(step);
    }
    intercepted = G.stats[p.id].tov > 0;
  } else {
    Object.assign(D[0], { x: (P.x0 + P.tx) / 2, y: (P.y0 + P.ty) / 2, stun: 0, r: { ...D[0].r, stl: 1 } });
    PH.passQA.passUpdate(P.windup);
    assert(P.int && P.int.ch > 0, 'ordinary lane interception candidate survives skill');
    const I = P.int;
    PH.randomSeed(615934122);
    for (let n = 0; n < 100 && G.ball.state === 'pass'; n++) {
      const u = Math.min(1, (P.t + P.T / 100) / P.T);
      Object.assign(I.d, { x: P.x0 + ((P.ex ?? P.tx) - P.x0) * u, y: P.y0 + ((P.ey ?? P.ty) - P.y0) * u, stun: 0 });
      PH.passQA.passUpdate(P.T / 100);
    }
    intercepted = G.stats[p.id].tov > 0;
  }
  assert(intercepted, mode + ' skill bounce pass can actually be intercepted');
  console.log('PASS:', mode, 'Nash screen/double-team/roll bounce pass, wrong target/roll/defender/expiry/cooldown negatives, normal lane interception');
}
{
  const { p } = duel('nash');
  assert.equal(A.legendPocket(p, G.players[1]), false);
  assert.equal(A.legendShot(p), null);
  console.log('PASS: Nash has no 1V1 replacement signature');
}
for (const mode of ['t3', 't5']) {
  for (const close of [false, true]) {
    const { p, s, D, O } = team(mode, 'rip');
    p.hasBall = false; O[2].hasBall = true; G.ball.holder = O[2].id;
    screen(mode, p, s, D[0]);
    Object.assign(p, { x: 2.3, y: A.HOOP.y - 4.8 });
    for (const d of D) Object.assign(d, { x: -6, y: 1, stun: 0 });
    if (close) Object.assign(D[1], { x: p.x + 0.5, y: p.y });
    if (mode === 't3') {
      p.hasBall = true; p.passCatchT = G.time; p.catchDribbled = false; A.legendCatch(p);
    } else PH.passQA.catchBall(p, { from: O[2], kind: 'chest', er: 0, leadEr: 0 });
    assert.equal(A.legendShot(p), close ? null : 'rip');
    const a = shot(p);
    assert.equal(a.skill, close ? null : 'rip');
    if (!close) finish(p);
  }
  const { p } = team(mode, 'rip'); p.passCatchT = G.time; p.catchDribbled = false;
  assert.equal(shot(p).skill, null, 'catch without off-ball screen does not trigger');
  console.log('PASS:', mode, 'Hamilton off-ball screen/cut/catch shot, close switched catch and no-screen negatives');
}
for (const id of ['sk-tmac', 'sk-rip']) {
  assert(gm.tipsStart(id)); const p = G.players[0];
  let fired = false;
  for (let n = 0; n < 240; n++) {
    G.time += 1 / 60;
    qa.updatePlayer(p, qa.tipsInput(p), 1 / 60);
    if (G.stats[0].sk > 0) { fired = true; break; }
  }
  assert(fired, id + ' demo uses real input and fires');
  assert.equal(G.tips.mk, false, 'new demo does not force makes');
}
for (const d of gm.TDEF.filter(d => d[0].startsWith('lg'))) assert.equal(PH.TUNE.get('l1_' + d[0]), K[d[0]]);
console.log('PASS: sk-tmac/sk-rip input-driven demos fire without forced makes; all new magnitudes registered in PH.TUNE');
