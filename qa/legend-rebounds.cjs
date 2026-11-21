const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ctx = vm.createContext({ console, Date: class extends Date { static now() { return 7; } }, performance: { now: () => 0 }, setTimeout() {}, clearTimeout() {} });
ctx.window = ctx;
ctx.PH = { input: { read: () => ({}), read5: () => ({}), endTick() {} } };
for (const name of ['tune', 'ptype', 'render', 'roster', 'measurements', 'r5', 'r2k', 'game', 'b5', 'team3', 'team5']) {
  let source = fs.readFileSync(path.join(__dirname, '../js', name + '.js'), 'utf8');
  if (name === 'game') source = source.replace('PH.game = {', 'PH.rebQA = { startBlock, updateAction, updatePlayer, updateBall, skTick, rodReady, rodReach, benSealed, benTick, ctPow, tryStart, ibReady, rebStyle, aiInput }; PH.game = {')
    .replace('if (d < rg && b.z < reach', 'window.radii[p.id] = rg; if (d < rg && b.z < reach');
  vm.runInContext(source, ctx, { filename: name + '.js' });
}
const { game: gm, rebQA: qa } = ctx.PH, { G, K } = gm;
ctx.radii = {};
const zero = () => gm.t5.zeroInp();
const near = (a, b) => assert(Math.abs(a - b) < 1e-8, `${a} != ${b}`);
function fixture(key = 'rodman', mode = '2p') {
  gm.seed(7); gm.newGame({ mode: '2p', arch0: key, arch1: 'gobert', target: 999 }); gm.introEnd();
  Object.assign(G, { mode, phase: 'live', time: 10, off: 1, needClear: false });
  const [p, o] = G.players;
  Object.assign(p, { x: 0, y: 8, z: 0, vz: 0, vx: 0, vy: 0, speed: 0, hasBall: false, stun: 0, cd: 0, action: null, tm: 0, box: false, stam: 100 });
  Object.assign(o, { x: -1, y: 8, z: 0, hasBall: false, off: true, action: null, tm: 1, box: false, stun: 0 });
  p.opp = o; o.opp = p;
  Object.assign(G.ball, { state: 'loose', holder: -1, wasShot: true, dead: false, x: 0.2, y: 8, z: 3, vx: 0, vy: 0, vz: 0, noPick: 0, lk: null });
  return { p, o, b: G.ball };
}
function land(p) { p.z = p.vz = 0; p.action.t = 0.6; qa.updateAction(p, zero(), 1 / 120, false); }
function first(p) { qa.startBlock(p, zero()); land(p); assert(qa.rodReady(p)); }
for (const mode of ['2p', 't3', 't5']) {
  const { p, o, b } = fixture('rodman', mode);
  assert(!qa.rodReady(p), 'no free second jump before first attempt');
  first(p); qa.skTick(p, 0); assert.equal(p.sk.hint, 'ready');
  assert(p.cd > 0); assert(qa.ibReady(p, 'a1')); assert(!qa.ibReady(p, 'a2'));
  const stamina = p.stam;
  qa.tryStart(p, { ...zero(), mx: 0.2 }, { a1: true });
  assert(p.action.rodSecond); near(p.stam, stamina - K.bkCost * gm.ST.cost); assert.equal(p.cd, 0);
  const normalVz = (K.bkVz0 + K.bkVzJ * p.r.vert) * (1 - K.bkVzFat * Math.max(0, (gm.ST.fat0 - stamina) / gm.ST.fat0));
  near(p.action.zmax, normalVz * normalVz * K.rodJump / (2 * 17));
  Object.assign(p, { z: 0.6, vx: 0, vy: 0 }); p.action.t = 0.2;
  Object.assign(o, { off: false, x: -1.2, y: 8 });
  Object.assign(b, { x: p.x + 0.15, y: p.y, z: 2.8, vz: 0 });
  const at = [b.x, b.y, b.z]; qa.updateBall(0);
  assert.equal(p.sk.n, 1); near(p.sk.cd, K.rodCd); assert.equal(G.cutin.skill, '大虫二跳');
  assert.equal(b.state, 'loose'); assert.equal(b.holder, -1); assert(!p.hasBall); assert(b.wasShot);
  assert(b.vx > 0, 'tap goes toward open side away from opponent'); near(Math.hypot(b.vx, b.vy), K.rodTipV);
  assert.deepEqual([b.x, b.y, b.z], at, 'tap does not teleport ball');
  near(b.noPick, K.rodNoPick); assert.equal(b.lastTouch, p.id); assert.equal(G.stats[p.id].reb, 0);
  qa.updateBall(0); assert.equal(b.state, 'loose', 'no immediate recapture by tipper');
  p.noGrabT = G.time + 2; Object.assign(o, { x: b.x, y: b.y, z: 0.6 });
  b.noPick = 0; qa.updateBall(0); assert.equal(b.holder, o.id, 'opponent can grab live tip');
  land(p); assert(!qa.rodReady(p)); assert(p.cd > 0, 'second landing has normal recovery');
}
console.log('PASS Rodman: failed-jump window, jump-only recovery bypass, stamina/height, normal winner, one-hand live tip, no teleport, opponent recapture in 1V1/3V3/5V5');

for (const failure of ['far', 'high', 'held', 'claimed', 'expired', 'second', 'blocked-cd']) {
  const { p, o, b } = fixture(); qa.startBlock(p, zero());
  if (failure === 'far') b.x = 5;
  if (failure === 'high') Object.assign(b, { z: 15, vz: 5 });
  if (failure === 'held') Object.assign(b, { state: 'held', holder: o.id });
  if (failure === 'claimed') { gm.t5.pickup(o); Object.assign(o, { hasBall: false }); Object.assign(b, { state: 'loose', wasShot: true, holder: -1, z: 3 }); }
  if (failure === 'second') p.action.rodSecond = true;
  land(p);
  if (failure === 'expired') G.time += K.rodWindow + 0.01;
  if (failure === 'blocked-cd') p.cd = 2;
  assert(!qa.rodReady(p), failure);
}
{
  const { p, o, b } = fixture(); first(p); qa.startBlock(p, zero());
  Object.assign(p, { z: 0.5, x: 0, y: 8 }); p.action.t = 0.2;
  Object.assign(o, { off: false, x: 0.5, y: 8, box: true });
  Object.assign(b, { x: 0.9, y: 8, z: 2.5 }); qa.updateBall(0);
  assert.equal(p.sk.n, 0, 'box-out shrink excludes second jump from winning radius');
}
console.log('PASS Rodman: unreachable/possessed/previously claimed/expired balls, repeated windows, other cooldowns and sufficient box-outs prevent skill');

function seal(p, o) {
  Object.assign(p, { box: true }); Object.assign(o, { off: false, x: p.x, y: p.y - 0.8 });
  qa.skTick(p, K.benTime / 2); assert.equal(p.sk.hint, 'half');
  qa.skTick(p, K.benTime / 2 + 0.001); assert(qa.benSealed(p, o)); assert.equal(p.sk.hint, 'ready');
}
for (const mode of ['2p', 't3', 't5']) {
  const { p, o, b } = fixture('bwallace', mode); const base = qa.ctPow(p); seal(p, o);
  near(qa.ctPow(p) / base, K.benPower);
  b.z = 6; qa.updateBall(0); const shrunk = ctx.radii[o.id];
  ctx.PH.TUNE.set('l1_benRadius', 1); qa.updateBall(0); near(shrunk / ctx.radii[o.id], K.benRadius === 1 ? 0.75 : K.benRadius); ctx.PH.TUNE.reset('l1_benRadius');
  const behind = { x: o.x, y: o.y }; o.x += 1.2; o.y = p.y;
  assert(!qa.benSealed(p, o), 'side escape cancels without waiting a tick'); near(qa.ctPow(p), base);
  Object.assign(o, behind); assert(qa.benSealed(p, o));
  qa.startBlock(p, zero()); p.box = false; assert(qa.benSealed(p, o), 'seal carries into normal jump only while target behind');
  Object.assign(p, { z: 0.5 }); p.action.t = 0.2;
  Object.assign(b, { x: p.x + 0.1, y: p.y + 0.1, z: 2.5 }); qa.updateBall(0);
  assert(p.hasBall); assert.equal(p.action.rbS, 'two'); assert.equal(p.sk.n, 1); near(p.sk.cd, K.benCd);
  assert.equal(G.cutin.skill, '大本卡位'); assert(!qa.benSealed(p));
}
{
  const { p, o } = fixture('bwallace'); seal(p, o);
  const y = o.y; qa.updatePlayer(p, { ...zero(), a3: true }, 1 / 120); const pushed = y - o.y;
  o.y = y; p.sk.cd = 10; qa.updatePlayer(p, { ...zero(), a3: true }, 1 / 120); near(pushed / (y - o.y), K.benPower);
  p.sk.cd = 0; o.x = 1.3; o.y = p.y; qa.skTick(p, 0); assert.equal(p.sk.benT, 0);
  o.x = p.x; o.y = p.y - 0.8; qa.skTick(p, K.benTime / 2); assert(!qa.benSealed(p), 'side escape requires rebuilding seal');
}
let opponentWins = 0;
for (let seed = 1; seed <= 20; seed++) {
  const { p, o, b } = fixture('bwallace'); gm.seed(seed); seal(p, o);
  b.x = o.x + (gm.t5.rnd() - 0.5) * 0.1; b.y = o.y; b.z = 2;
  qa.updateBall(0); if (o.hasBall) opponentWins++;
  assert.equal(p.sk.n, 0, 'sealed does not guarantee Wallace wins');
}
assert(opponentWins > 0);
console.log(`PASS Wallace: 0.5s charge, live behind-cone/radius/push checks, side cancellation, jump carry, two-hand secure in all modes; better-positioned opponent wins ${opponentWins}/20 seeded trials`);

for (const [id, skill] of [['sk-rodman', '大虫二跳'], ['sk-bwallace', '大本卡位']]) {
  gm.seed(7); assert(gm.tipsStart(id));
  let missed = false;
  for (let n = 0; n < 480 && !G.players[0].sk.n; n++) { gm.tick(1 / 120); if (G.ball.state === 'loose' && G.ball.wasShot) missed = true; }
  assert(missed, id + ' uses a real missed-shot rebound');
  assert.equal(G.players[0].sk.n, 1, id + ' demonstrates skill through inputs/physics');
  assert.equal(G.cutin.skill, skill);
  console.log('PASS training scenario ' + id + ': rim miss -> normal rebound skill');
}
