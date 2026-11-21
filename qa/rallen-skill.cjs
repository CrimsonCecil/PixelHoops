const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ctx = vm.createContext({ console, performance: { now: () => 0 }, setTimeout() {}, clearTimeout() {} });
ctx.window = ctx;
ctx.PH = { input: { read: () => ({}), read5: () => ({}), endTick() {} } };
vm.runInContext('let randomSeed = 7; Math.random = () => ((randomSeed = (Math.imul(randomSeed, 1664525) + 1013904223) >>> 0) / 4294967296)', ctx);
for (const name of ['tune', 'ptype', 'render', 'roster', 'measurements', 'r5', 'r2k', 'game', 'b5', 'team3', 'team5']) {
  let source = fs.readFileSync(path.join(__dirname, '../js', name + '.js'), 'utf8');
  if (name === 'game') source = source.replace('PH.game = {', 'PH.rayQA = { skTick, startShot, releaseShot, updatePlayer, startMove, contactBlock }; PH.game = {');
  if (name === 'team5') source = source.replace('  PH.T5.CSB = CSB;', '  PH.ray5QA = { dblC, shotAdj }; PH.T5.CSB = CSB;');
  vm.runInContext(source, ctx, { filename: name + '.js' });
}
const { game: gm, rayQA: qa, T3 } = ctx.PH, { G, K } = gm;
const zero = () => gm.t5.zeroInp();
const near = (a, b) => assert(Math.abs(a - b) < 1e-9, `${a} != ${b}`);
function fixture(mode = '2p', offBall = false) {
  gm.seed(7); gm.newGame({ mode: '2p', arch0: 'rallen', arch1: 'gobert', target: 9999 }); gm.introEnd();
  Object.assign(G, { mode, phase: 'live', time: 10, needClear: false });
  const [p, df] = G.players;
  Object.assign(p, { x: 0, y: 6, vx: 0, vy: -2, speed: 2, z: 0, stun: 0, action: null, tm: 0, hasBall: !offBall, hc: 0, gotT: -9 });
  Object.assign(df, { x: 0, y: 10, off: true, tm: 1 }); p.opp = df;
  return { p, df };
}
function tick(p, duration) { G.time += duration; qa.skTick(p, duration); }
function relocate(p, { set = true, side = false, inside = false } = {}) {
  tick(p, 1 / 60);
  Object.assign(p, { x: side ? 6.9 : 0, y: side ? 12 : inside ? 6 : 5, vx: side ? 2 : 0, vy: side ? 0 : -2, speed: 2 });
  tick(p, 1 / 60);
  assert.equal(p.sk.hint, inside ? '' : 'half');
  if (set) { Object.assign(p, { vx: 0, vy: 0, speed: 0 }); tick(p, K.raySetT + 0.001); }
}
function shoot(p, mode = G.mode) {
  if (mode === 't3' || mode === 't5') Object.assign(p, { passCatchT: G.time - 0.05, passQuality: 0.8 });
  qa.startShot(p, zero(), 'a1'); return p.action;
}
for (const mode of ['2p', 't3', 't5']) {
  const { p } = fixture(mode, mode !== '2p'); relocate(p);
  assert.equal(p.sk.hint, 'ready'); p.hasBall = true;
  const a = shoot(p), normal = { ...a, skill: null };
  assert.equal(a.skill, 'rallen'); assert.equal(p.sk.n, 1); near(p.sk.cd, K.rayCd);
  assert.equal(G.cutin.skill, '退角一抬'); assert.equal(G.stats[p.id].sk, 1);
  near(a.F.sp, gm.SF.ray.sp * K.raySp); near(a.F.dip, gm.SF.ray.dip * K.rayDip); near(a.F.blk, gm.SF.ray.blk * K.rayBlock);
  const width = action => gm._qa.greenWidth(p, p.r.three, 0, 'three', action);
  near(width(a) / width(normal), mode === '2p' ? 1 : K.rayGreen);
  const ideal = a.ideal, span = a.meter.span, jT = a.jT;
  p.action = null; p.sk.cd = 1; const base = shoot(p);
  assert.equal(base.skill, null); near(ideal / base.ideal, K.raySp); assert(span < base.meter.span); assert(jT < base.jT);
  assert.equal(gm.SF.ray.sp, 0.86, 'shared form stays unchanged');
}
console.log('PASS retreat + feet set fires in 1V1/3V3/5V5, including off-ball relocation; compact form/meter; team-only green x1.2; cooldown/cut-in');

for (const reason of ['moving', 'short-set', 'inside', 'airborne', 'stale', 'cooldown', 'bounce', 'move', 'no-relocation', 'team-dribble', 'no-catch', 'old-catch']) {
  const mode = reason.startsWith('team') || reason.includes('catch') ? 't3' : '2p';
  const { p } = fixture(mode);
  if (reason === 'no-relocation') { Object.assign(p, { y: 5, vx: 0, vy: 0 }); tick(p, 0.3); }
  else relocate(p, { set: reason !== 'moving', inside: reason === 'inside' });
  if (reason === 'short-set') p.sk.raySet = K.raySetT - 0.01;
  if (reason === 'airborne') p.z = 0.3;
  if (reason === 'stale') G.time += K.rayWindow + 0.01;
  if (reason === 'cooldown') p.sk.cd = 1;
  if (reason === 'bounce') { p.drib = Math.PI - 0.01; qa.updatePlayer(p, zero(), 1 / 60); }
  if (reason === 'move') { qa.startMove(p, { ...zero(), dx: 1 }, 'hesi'); p.action = null; }
  if (mode === 't3') { p.passCatchT = reason === 'no-catch' ? null : G.time - (reason === 'old-catch' ? 0.7 : 0.1); p.passQuality = 0.8; p.catchDribbled = reason === 'team-dribble'; }
  qa.startShot(p, zero(), 'a1');
  assert.equal(p.action.skill, null, reason); assert.equal(p.sk.n, 0, reason);
}
{ const { p } = fixture(); relocate(p, { side: true }); assert.equal(shoot(p).skill, 'rallen', 'corner sideways relocation'); }
console.log('PASS moving/unset/inside/airborne/stale/cooldown/dribbled/no-relocation and invalid catches cannot trigger; corner relocation works');

function release({ active = true, contest = false, stam = 100 } = {}) {
  const { p, df } = fixture(); relocate(p); if (!active) p.sk.cd = 20;
  if (contest) Object.assign(df, { off: false, x: 0, y: p.y + 0.5, z: 0, stance: true, face: -Math.PI / 2 });
  p.stam = stam; shoot(p); gm.seed(123); qa.releaseShot(p, 0.8, 'shot');
  assert.equal(p.sk.n, active ? 1 : 0, 'release does not fire twice');
  return G.ball.shot.info;
}
const ordinary = release({ active: false }), compact = release(), contested = release({ contest: true }), fatigued = release({ stam: 10 });
near(ordinary.prob, compact.prob); near(ordinary.contest, compact.contest);
assert(compact.prob < 1); assert(contested.contest > compact.contest); assert(contested.prob < compact.prob); assert(fatigued.prob < compact.prob);
{
  const { p, df } = fixture(); relocate(p); const a = shoot(p);
  Object.assign(df, { off: false, x: p.x, y: p.y + 0.3, z: 1, face: -Math.PI / 2, action: { type: 'block', t: 0.25, zmax: 1, rel: 1 } });
  Object.assign(df.pose, { aRp: Math.PI, aRe: 0, aRq: 0, reachR: 1, reachL: 1 });
  const hand = ctx.PH.rig(df).handR, hp = { x: hand[0], y: hand[1], z: hand[2] }, info = { who: p.id };
  gm.CFG.blockMul = 100;
  assert(qa.contactBlock(p, a, hp, 'shot', info)); assert(info.blocked); gm.CFG.blockMul = 1;
}
ctx.PH.T5.start({ home: 'BOS', away: 'DEN', qlen: 90, human: -1 });
{
  const p = G.players.find(p => p.tm === 0), defs = G.players.filter(p => p.tm !== 0);
  Object.assign(p, { x: 0, y: 5, opp: defs[0], action: { type: 'shot', skill: 'rallen', V: { c: 1, p: 1, blk: 1 } } });
  defs.forEach((d, i) => Object.assign(d, { x: i * 0.3, y: 5.6, z: 0, off: false, stance: true }));
  ctx.PH.ray5QA.shotAdj(); ctx.PH.ray5QA.dblC(); assert(p.action.dbl, '5V5 multiple-defender contest still applies');
}
console.log('PASS no 1V1 make/green bonus; normal contest, fatigue, physical blocks and 5V5 multiple-defender coverage remain');

{
  ctx.PH.TUNE.set('l1_raySp', 0.95); ctx.PH.TUNE.set('l1_rayGreen', 1.4); ctx.PH.TUNE.set('l1_rayCd', 8);
  const { p } = fixture('t3'); relocate(p); const a = shoot(p);
  near(a.F.sp, gm.SF.ray.sp * 0.95); near(p.sk.cd, 8);
  const width = action => gm._qa.greenWidth(p, p.r.three, 0, 'three', action);
  near(width(a) / width({ ...a, skill: null }), 1.4);
  const saved = [gm.CFG.greenBase, gm.CFG.greenRating]; gm.CFG.greenBase = gm.CFG.greenRating = 10;
  assert(width(a) <= 0.6 + 1e-9, 'relocation green bonus respects existing cap');
  [gm.CFG.greenBase, gm.CFG.greenRating] = saved;
  for (const key of ['raySp', 'rayGreen', 'rayCd']) ctx.PH.TUNE.reset('l1_' + key);
}
console.log('PASS live PH.TUNE release/green/cooldown parameters and existing green-window cap');

assert(gm.tipsStart('sk-rallen'));
for (let n = 0; n < 600 && !G.players[0].sk.n; n++) gm.tick(1 / 120);
assert.equal(G.players[0].sk.n, 1, 'training demo triggers through normal movement and shot input');
console.log('PASS sk-rallen training scenario retreats, stops and triggers the skill');

let cpuFires = 0;
for (const seed of [7, 19, 41]) {
  gm.seed(seed);
  T3.start({ slots: ['rallen', 'curry', 'jokic', 'caruso', 'durant', 'giannis'].map(arch => ({ arch, role: 'cpu' })), target: 99, clock: 24, replay: false });
  for (let n = 0; n < 120 * 600 && G.phase !== 'over'; n++) T3.tick(1 / 120);
  const fires = G.players[0].sk.n; cpuFires += fires;
  console.log(`CPU 3V3 seed ${seed}: rallen skill fires=${fires}, shots=${G.stats[0].fga}`);
}
assert(cpuFires > 0, 'unscripted CPU games naturally trigger relocation shots');
console.log('PASS unscripted CPU Ray Allen triggers 退角一抬 in simulations');
