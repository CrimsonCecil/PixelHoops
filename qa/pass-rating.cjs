const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const cp = require('node:child_process');

function fixture(baseline = false, human = -1) {
  const ctx = vm.createContext({ performance: { now: () => 0 }, setTimeout() {}, clearTimeout() {} });
  ctx.window = ctx;
  ctx.addEventListener = () => {};
  ctx.navigator = { getGamepads: () => [] };
  for (const name of ['tune', 'render', 'input', 'roster', 'r5', 'game', 'b5', 'team5']) {
    let code = baseline && name === 'team5'
      ? cp.execFileSync('git', ['show', '3bb7f5f95408c797f8aae8018ac3210f7cb664e9:js/team5.js'], { cwd: path.join(__dirname, '..'), encoding: 'utf8' })
      : fs.readFileSync(path.join(__dirname, '../js', name + '.js'), 'utf8');
    if (name === 'team5') code = code.replace('doPass: doPass,', 'doPass: doPass, qaPassUpdate: passUpdate, qaHand: handPt,');
    vm.runInContext(code, ctx, { filename: name + '.js' });
  }
  ctx.PH.game.seed(7);
  ctx.PH.T5.start({ home: 'LAL', away: 'BOS', human });
  return { t5: ctx.PH.T5, G: ctx.PH.game.G, game: ctx.PH.game };
}

function sample(pac, seed, moving = true) {
  const { t5, G, game } = fixture(false, 0), T = t5.T;
  game.seed(seed);
  const p = T.ctl, r = T.tm[0].on.find(q => q !== p), b = G.ball;
  Object.assign(T, { phase: 'live' });
  Object.assign(G, { phase: 'live', off: 0 });
  for (const q of G.players) { q.hasBall = false; q.x = -7; q.y = -12; }
  Object.assign(p, { x: -3, y: 0, face: 0, hasBall: true, action: null });
  p.r5.pac = Math.max(-0.5, Math.min(0.5, (pac - 69) / 40));
  Object.assign(r, { x: 3, y: 0, vx: 0, vy: moving ? 3 : 0, speed: moving ? 3 : 0, pose: null });
  Object.assign(b, { state: 'held', holder: p.id, x: p.x, y: p.y, z: 1.2, dead: false });
  assert.equal(t5.doPass(p, null, 'chest'), false);
  assert.equal(t5.doPass(p, r, 'chest'), true);
  assert.equal(T.ctl, r);
  const P = T.ps, windup = -P.t, speed = P.v;
  const interception = { d: T.tm[1].on[0], u: 0.5, ch: 0, done: false };
  P.int = interception;
  if (windup > 0) {
    t5.qaPassUpdate(windup / 2);
    assert.equal(P.t < 0, true);
    assert.equal(interception.done, false);
    const H = t5.qaHand(p, b);
    assert(Math.hypot(b.x - H[0], b.y - H[1]) < 1e-9);
    r.y += r.vy * windup / 2;
  }
  let miss;
  while (T.ps) {
    const dt = Math.min(1 / 240, P.T - P.t);
    const arrives = !P.lin && P.t + dt >= P.T;
    r.y += r.vy * dt;
    t5.qaPassUpdate(dt);
    if (!P.lin && P.t / P.T < interception.u) assert.equal(interception.done, false);
    if (arrives) {
      const H = t5.qaHand(r, { x: p.x, y: p.y });
      miss = Math.hypot(b.x - H[0], b.y - H[1]);
    }
  }
  assert.equal(interception.done, true);
  assert(Number.isFinite(miss));
  return { windup, speed, miss, er: P.er };
}

const avg = pac => {
  const rows = Array.from({ length: 40 }, (_, i) => sample(pac, i + 1));
  return Object.fromEntries(Object.keys(rows[0]).map(k => [k, rows.reduce((s, r) => s + r[k], 0) / rows.length]));
};
const high = avg(90), low = avg(50);
assert(high.windup < low.windup);
assert(high.speed > low.speed);
assert(high.miss < low.miss);
assert(high.er < low.er);
sample(90, 5, false); sample(50, 5, false);
for (const [label, row] of [['pac90', high], ['pac50', low]]) console.log(`${label}: windup=${row.windup.toFixed(3)}s speed=${row.speed.toFixed(3)}m/s meanMiss=${row.miss.toFixed(3)}m qualityError=${row.er.toFixed(3)}m`);
for (const baseline of [true, false]) {
  const { t5, G } = fixture(baseline);
  for (let i = 0; i < 7200; i++) {
    t5.tick(1 / 120);
    assert(Number.isFinite(G.ball.x) && Number.isFinite(G.ball.y) && Number.isFinite(G.ball.z));
  }
  const log = t5.T.passLog, intercepted = log.filter(r => r.res === 'int').length;
  assert(log.length > 0);
  console.log(`${baseline ? 'Before' : 'After'} 60s VM 5V5 smoke: passes=${log.length} interceptions=${intercepted} rate=${(100 * intercepted / log.length).toFixed(2)}%`);
}
console.log('Pass rating: moving/stationary catches, invalid target, windup hands, controller switch and 60s simulations passed.');
