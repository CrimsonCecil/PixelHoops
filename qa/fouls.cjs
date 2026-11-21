const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ctx = vm.createContext({ console, performance: { now: () => 0 }, setTimeout() {} });
ctx.window = ctx;
for (const name of ['tune', 'ptype', 'render', 'roster', 'r5', 'r2k', 'game']) {
  let code = fs.readFileSync(path.join(__dirname, '..', 'js', name + '.js'), 'utf8');
  if (name === 'game') code = code.replace('PH.game = {', 'PH.foulQA = { finContact, collide, updateAction }; PH.game = {');
  vm.runInContext(code, ctx, { filename: name + '.js' });
}
const { game: gm, TUNE: tune, foulQA: qa } = ctx.PH;
const { G, _dbg: dbg, t5: t } = gm;
const dt = 1 / 120;
const set = (key, value) => tune.set('l1_' + key, value);
const tick = (hold = false) => gm.tick(dt, (p) => ({ ...t.zeroInp(), a1: hold && p.id === G.off }));
function until(test, hold = false) {
  for (let i = 0; i < 800 && !test(); i++) tick(hold);
  assert(test(), 'simulation did not reach expected state');
}
function duel(o = {}) {
  gm.newGame({ mode: '2p', arch0: 'curry', arch1: 'curry', ...o });
  t.checkStep(9); G.phase = 'live';
  const [p, d] = G.players;
  Object.assign(p, { face: Math.PI / 2, x: 0, y: 7, vx: 0, vy: 0 });
  Object.assign(d, { face: -Math.PI / 2, x: 0, y: 7.4, vx: 0, vy: 0, stance: true });
  Object.assign(d.r, { def: 0.95, intD: 0.95, dcon: 0.5 });
  return [p, d];
}
function jumper(y, made, fouls) {
  const [p, d] = duel({ fouls, glen: 180 });
  p.y = y; d.y = y + 0.4;
  gm.seed(3);
  dbg.startShot(p, t.zeroInp());
  gm.seed(made ? 9999 : 1730);
  dbg.releaseShot(p, made ? 0 : 1, 'shot');
  assert.equal(G.lastShot.made, made);
  until(() => G.ball.state !== 'shot');
  return [p, d];
}
function freeThrow(green) {
  const p = G.players[G.ft.id], phase = G.ft.index;
  // A button held through the whistle must not start a new attempt.
  until(() => G.phaseT === 0, true);
  tick(true);
  assert.equal(p.action, null);
  tick();
  tick(true);
  assert(p.action?.meter && p.action.ft, 'the normal shot button starts the timing meter');
  if (green) until(() => p.action.t + dt >= p.action.ideal - dt / 2, true);
  tick();
  assert.equal(G.ball.shot.kind, 'ft');
  assert.equal(G.ball.shot.made, green);
  until(() => !G.ft || G.ft.index !== phase);
}

set('foulJump', 1);
set('foulBlock', 4);
set('foulContestMin', 0);
set('foulRating', 3);
set('ftBase', 0); set('ftRating', 0); set('ftTiming', 1);
jumper(7, true);
assert.equal(G.phase, 'ft');
assert.equal(G.stats[1].pf, 1);
assert.equal(G.stats[0].fga, 1);
assert.equal(G.ft.total, 1);
assert.equal(G.score[0], 2);
const gameClock = G.gclock;
freeThrow(true);
assert.equal(G.gclock, gameClock);
assert.equal(G.score[0], 3);
assert.equal(G.stats[0].ftm, 1);
until(() => G.phase === 'check');
assert.equal(G.off, 1, 'made last free throw gives the other player the check-ball');

jumper(4.65, false);
assert.equal(G.phase, 'ft');
assert.equal(G.ft.total, 3);
assert.equal(G.stats[0].fga, 0, 'missed fouled shot does not count as a field goal attempt');
freeThrow(false);
assert.equal(G.phase, 'ft', 'missed intermediate attempt is dead');
freeThrow(true);
freeThrow(false);
assert.equal(G.score[0], 1);
assert.equal(G.stats[0].fta, 3);
assert.equal(G.phase, 'live');
assert(G.ball.wasShot && !G.ball.dead);
for (let i = 0; i < 600 && G.ball.state === 'loose'; i++) {
  gm.tick(dt, (p) => {
    const mx = G.ball.x - p.x, my = G.ball.y - p.y, distance = Math.hypot(mx, my);
    return { ...t.zeroInp(), mx: mx / Math.max(0.1, distance), my: my / Math.max(0.1, distance) };
  });
}
until(() => G.stats[0].reb + G.stats[1].reb === 1);
assert.equal(G.ball.state, 'held');

jumper(7, true, false);
assert.equal(G.phase, 'dead');
assert.equal(G.ft, null);
assert.equal(G.stats[1].pf ?? 0, 0);

set('foulInside', 1);
for (const kind of ['lay', 'dunk']) {
  const [p, d] = duel();
  Object.assign(p, { x: 0, y: 10, z: 0.3, vy: 5 });
  Object.assign(d, { x: 0, y: 10.35, z: 0, stance: true });
  Object.assign(p.r, { close: 0.99, lay: 0.99, dunk: 0.99 });
  if (kind === 'lay') {
    assert(dbg.startFinish(p, t.zeroInp(), 'lay'));
    Object.assign(p.action, { cHit: true, inSteps: false });
    gm.seed(7);
    dbg.releaseShot(p, 0, 'lay');
  } else {
    dbg.startDunk(p, dbg.finPlan(p), 'a2', 'one');
    const a = p.action;
    Object.assign(a, { cHit: true, inSteps: false, t: a.T * 0.8, sx: p.x, sy: p.y });
    gm.seed(7);
    qa.updateAction(p, t.zeroInp(), 0);
  }
  until(() => G.phase === 'ft');
  assert.equal(G.ft.total, G.lastShot.made ? 1 : 2);
}
console.log('PASS shooting fouls: jumper, layup, dunk, and-one, three-shot miss, FT timing and both possession outcomes');

set('ctThruHi', -1); set('ctThruP', 1); set('ctThruQMin', 1);
function chargeTrial(i, edge = 0, fouls) {
  const [p, d] = duel({ fouls });
  Object.assign(p, { y: 10, vy: 5 });
  Object.assign(d, { y: 10.58, stance: false });
  Object.assign(p.r, { str: 0.55 + edge, lay: 0.55 + edge });
  Object.assign(d.r, { str: 0.55, intD: 0.55 });
  assert(dbg.startFinish(p, t.zeroInp(), 'lay'));
  p.action.skill = null;
  gm.seed(Math.imul(i + 1, 100003));
  qa.finContact(p, d);
  if (G.phase !== 'check') {
    assert.equal(p.action.thru, 'fall', 'unwhistled contact still performs the existing knockdown');
    return false;
  }
  assert.equal(G.off, 1);
  assert.equal(G.stats[0].tov, 1);
  assert.equal(G.stats[0].pf, 1);
  assert.equal(G.score[0], 0);
  assert.equal(G.banner.text, '进攻犯规');
  return true;
}
const rate = (edge, on) => Array.from({ length: 400 }, (_, i) => chargeTrial(i, edge, on)).filter(Boolean).length / 400;
const even = rate(0), edge = rate(0.42);
assert(even >= 0.45 && even <= 0.55, `even rating charge rate ${even}`);
assert(edge < 0.15 && edge < even, `dominant attacker charge rate ${edge}`);
assert.equal(rate(0, false), 0);

set('foulCharge', 1); set('foulChargeSlope', 0);
set('bdT3', 0); set('bdT2', 0); set('bdT1', 0); set('bdFallV', 0);
set('bdRnd', 0); set('bdSpd', 1);
const [driver, defender] = duel();
Object.assign(driver, { vy: 8, y: 8 });
Object.assign(defender, { y: 8.35 });
gm.seed(7);
qa.collide(driver, defender);
assert.equal(G.banner.text, '进攻犯规');
assert.equal(G.off, 1);
console.log(`PASS offensive fouls: ${(even * 100).toFixed(1)}% at even ratings, ${(edge * 100).toFixed(1)}% for dominant attacker, live drive charge, no fouls when disabled`);
