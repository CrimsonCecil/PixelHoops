const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ctx = vm.createContext({ performance: { now: () => 0 }, setTimeout() {} });
ctx.window = ctx;
for (const name of ['tune', 'ptype', 'render', 'roster', 'measurements', 'r5', 'r2k', 'game', 'b5', 'team5']) {
  let source = fs.readFileSync(path.join(__dirname, '../js', name + '.js'), 'utf8');
  if (name === 'game') source = source.replace('PH.game = {', 'PH.legendQA = { contactBlock, updateBall, poseTarget }; PH.game = {');
  vm.runInContext(source, ctx, { filename: name + '.js' });
}
const { game: GM, legendQA: QA, render: { HOOP }, T5 } = ctx.PH;
const { G, _dbg: dbg, t5: { zeroInp } } = GM;
ctx.PH.input = { read: zeroInp, endTick() {} };
const dt = 1 / 120;
const step = (n, input = zeroInp) => { for (let i = 0; i < n; i++) GM.tick(dt, input); };

for (const [key, number] of [['barkley', 34], ['yao', 11], ['mutombo', 55]]) {
  const a = GM.ARCH[key];
  assert.equal(a.team, 'LEG'); assert.equal(a.num, number); assert.ok(a.skill);
  assert.ok(!T5.teamList().includes('LEG'));
  for (const [arch0, arch1, line] of [[key, 'joe', 0], ['joe', key, 1]]) {
    GM.newGame({ mode: '2p', arch0, arch1 });
    GM.introStart();
    const p = G.players.find(p => p.arch.key === key);
    assert.equal(G.intro.lines.find(l => l.id === p.id).t, a.intro[line]);
  }
}
assert.ok(ctx.PH.B5.tier({ arch: GM.ARCH.yao }, 'postpm') >= 2);
assert.equal(ctx.PH.B5.tier({ arch: GM.ARCH.mutombo }, 'anchor'), 4);

function post(key, x = 1.3, side = 1, charge = 0.7, defender = true, shade = 0) {
  GM.newGame({ mode: '2p', arch0: key, arch1: 'joe' });
  GM.seed(7);
  const [p, d] = G.players;
  Object.assign(G, { phase: 'live', time: 5, needClear: false });
  Object.assign(p, { x, y: HOOP.y - 3.1, post: true, hasBall: true, z: 0, vx: 0, vy: 0 });
  Object.assign(d, { x: x + shade, y: p.y + 1, off: !defender, vx: 0, vy: 0 });
  p.postEnd = G.time;
  p.sk.postT = charge;
  const l = Math.hypot(x, 3.1), hx = -x / l, hy = 3.1 / l;
  dbg.startMove(p, { ...zeroInp(), mx: (hx - side * hy) / Math.SQRT2, my: (hy + side * hx) / Math.SQRT2 }, 'postdrop');
  p.action = null; G.time = p.postMove.t + 1e-3; G.fx.hit = 0;
  dbg.startShot(p, zeroInp(), 'a1');
  return { shot: p.action };
}
for (const side of [1, -1]) {
  const { shot } = post('yao', 1.3 * side, side);
  assert.equal(shot.postSignature, true);
  assert.equal(shot.hand, -side); assert.equal(shot.meter.label, '上海勾手');
  assert.equal(post('yao', 1.3 * side, -side).shot.postSignature, undefined);
}
assert.equal(post('yao', 1.3, 1, 0.1).shot.postSignature, undefined);
assert.equal(post('yao', 1.3, 1, 0.7, false).shot.postSignature, undefined);
assert.equal(post('yao', 1.3, 1, 0.7, true, -0.65).shot.postSignature, undefined);
assert.equal(post('barkley').shot.postSignature, undefined);

function drive({ key = 'barkley', shade = false, cooldown = 0, speed = 3, stamina = 100 } = {}) {
  GM.newGame({ mode: '2p', arch0: key, arch1: 'joe' });
  GM.seed(7);
  const [p, d] = G.players;
  Object.assign(G, { phase: 'live', time: 5, needClear: false });
  Object.assign(p, { x: 0, y: HOOP.y - 4.35, vx: 0, vy: speed, face: Math.PI / 2, stam: stamina, hasBall: true });
  Object.assign(d, { x: shade ? 0 : 3, y: HOOP.y - 1, vx: 0, vy: 0 });
  p.sk.cd = cooldown;
  return { p, d };
}
{
  const { p } = drive();
  const plan = dbg.finPlan(p);
  assert.ok(plan.dunk && plan.flying);
  assert.equal(plan.reach, plan.reach0 + GM.K.bkDunkDist);
  assert.ok(dbg.startFinish(p, zeroInp(), 'auto', 'a2'));
  const a = p.action;
  step(190);
  assert.equal(a.sigMove, 'barkley');
  assert.equal(a.v, 'glide');
  assert.ok(a.tkD > plan.reach0 + 0.4);
  assert.equal(a.skill, null, 'regular dunk block and success rules stay active');
  assert.equal(G.stats[p.id].sk, 1);
  assert.ok(G.lastShot.prob < 1);
  for (const state of [{ shade: true }, { speed: 0 }, { cooldown: 4 }, { key: 'shaq' }]) {
    assert.equal(dbg.finPlan(drive(state).p).flying, false);
  }
  assert.equal(dbg.finPlan(drive({ stamina: 1 }).p).dunk, false);
  assert.equal(dbg.finPlan(drive().p, 0, true).flying, false, 'not an alley-oop advantage');
}

function board({ defense = false, cooldown = 0, z = 0.7, distance = 1.45, wasShot = true, contested = false } = {}) {
  const { p, d } = drive();
  G.off = +defense; G.needClear = true;
  Object.assign(p, { x: 0, y: HOOP.y - distance, z, vx: 0, vy: 0, hasBall: false });
  Object.assign(d, { x: contested ? 0 : 3, y: p.y + 0.8, face: -Math.PI / 2, hasBall: false });
  p.sk.cd = cooldown;
  Object.assign(G.ball, { state: 'loose', wasShot, dead: false, noPick: 0, x: p.x, y: p.y, z: z ? 3 : 1.7, vx: 0, vy: 0, vz: 0 });
  QA.updateBall(dt);
  return p;
}
{
  const p = board();
  assert.equal(G.ball.shot?.sk, 'barkley');
  assert.equal(G.ball.shot.kind, 'dunk');
  assert.equal(G.ball.shot.name, '空中飞猪 · 补扣');
  assert.equal(G.stats[p.id].oreb, 1);
  assert.equal(G.stats[p.id].fga, 1);
  assert.equal(G.stats[p.id].sk, 1);
  assert.equal(G.needClear, false);
  const openProb = G.lastShot.prob;
  board({ contested: true });
  assert.equal(G.ball.shot?.sk, 'barkley');
  assert.ok(G.lastShot.prob < openProb && openProb < 1);
  for (const state of [{ defense: true }, { z: 0 }, { cooldown: 5 }, { distance: 2 }, { wasShot: false }]) {
    board(state);
    assert.notEqual(G.ball.shot?.sk, 'barkley');
    assert.equal(G.stats[0].sk, 0);
  }
}

for (const behind of [false, true]) {
  GM.newGame({ mode: '2p', arch0: 'joe', arch1: 'mutombo' });
  const [s, d] = G.players;
  Object.assign(G, { phase: 'live', time: 5, needClear: false });
  Object.assign(s, { x: 0, y: 9.9, z: 0, face: Math.PI / 2, hasBall: true });
  Object.assign(d, { x: 0, y: s.y + (behind ? -0.85 : 0.85), z: 0, face: -Math.PI / 2, vx: 0, vy: 0 });
  dbg.startShot(s, zeroInp(), 'a1');
  dbg.startBlock(d, zeroInp());
  assert.equal(!!d.action.verticalArm, !behind);
  assert.equal(d.action.chase, false);
  if (behind) continue;
  assert.equal(d.vx, 0); assert.equal(d.vy, 0);
  d.z = d.action.zmax;
  Object.assign(d, { anim: 'block', animT: 0.16 });
  Object.assign(d.pose, QA.poseTarget(d));
  assert.equal(QA.contactBlock(s, s.action, { x: 5, y: 5, z: 3 }, 'shot'), false);
  const arm = d.action.verticalArm < 0 ? 'handL' : 'handR';
  const [x, y, z] = ctx.PH.rig(d)[arm];
  GM.seed(7);
  assert.ok(QA.contactBlock(s, s.action, { x, y, z }, 'shot', { who: 0 }));
  assert.equal(G.stats[1].blk, 1); assert.equal(G.stats[1].sk, 1);
  assert.equal(G.chk.wag, undefined, 'No celebration during live play');
  Object.assign(G.ball, { x: 7.8, z: 0.2, vx: 0, vy: 0, vz: 0 });
  QA.updateBall(dt);
  assert.equal(G.phase, 'check'); assert.equal(G.chk.wag.id, 1);
  step(24);
  assert.equal(G.chk.t, 0, 'Wag happens before the check pass');
  step(240);
  assert.equal(G.phase, 'live');
}
for (const key of ['barkley', 'yao', 'mutombo']) {
  GM.seed(7);
  assert.equal(GM.tipsStart('sk-' + key), true);
  step(265);
  assert.equal(G.stats[0].sk, 1, `${key}'s demo fires its signature using normal inputs`);
  if (key === 'mutombo') assert.equal(G.stats[0].blk, 1);
}
console.log('PASS frontcourt legends: flying dunk, offensive putback, Shanghai Hook, honest blocks and dead-ball wag');
