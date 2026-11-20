const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const cp = require('node:child_process');

function fixture(baseline = false, human = -1, seed = 7) {
  const ctx = vm.createContext({ performance: { now: () => 0 }, setTimeout() {}, clearTimeout() {} });
  ctx.window = ctx;
  ctx.addEventListener = () => {};
  ctx.navigator = { getGamepads: () => [] };
  vm.runInContext(`Math.random = (() => {
    let state = ${seed >>> 0};
    return () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296; };
  })();`, ctx);
  for (const name of ['tune', 'render', 'input', 'roster', 'r5', 'game', 'b5', 'team5']) {
    let code = baseline && name === 'team5'
      ? cp.execFileSync('git', ['show', '3bb7f5f95408c797f8aae8018ac3210f7cb664e9:js/team5.js'], { cwd: path.join(__dirname, '..'), encoding: 'utf8' })
      : fs.readFileSync(path.join(__dirname, '../js', name + '.js'), 'utf8');
    if (name === 'team5') {
      code = code.replace('doPass: doPass,', 'doPass: doPass, qaPassUpdate: passUpdate, qaHand: handPt,');
      code = code.replace('T.ps.rec = rec;', 'rec.qaWindup = Math.max(0, -T.ps.t); T.ps.rec = rec;');
    }
    vm.runInContext(code, ctx, { filename: name + '.js' });
  }
  ctx.PH.game.seed(seed);
  ctx.PH.T5.start({ home: 'LAL', away: 'BOS', human });
  return { t5: ctx.PH.T5, G: ctx.PH.game.G, game: ctx.PH.game };
}

function sample(pac, seed, moving = true, tune = {}) {
  const { t5, G, game } = fixture(false, 0, seed), T = t5.T;
  game.seed(seed);
  Object.assign(t5.TV, tune);
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
    assert.deepEqual([P.x0, P.y0, P.z0], [b.x, b.y, b.z]);
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
  return { windup, speed, miss, er: P.er + P.leadEr, physicalEr: P.er, leadEr: P.leadEr };
}

const avg = pac => {
  const rows = Array.from({ length: 40 }, (_, i) => sample(pac, i + 1));
  return Object.fromEntries(Object.keys(rows[0]).map(k => [k, rows.reduce((s, r) => s + r[k], 0) / rows.length]));
};
const high = avg(90), low = avg(50);
assert(high.windup < low.windup * 0.5);
assert(high.speed > low.speed * 1.2);
assert(high.miss < low.miss * 0.5);
assert(high.er < low.er);
let maxWindupStep = 0;
for (const pac of [50, 90]) for (const z of [0.25, 1.2]) {
  const { t5, G } = fixture(false, 0), p = t5.T.ctl, r = t5.T.tm[0].on.find(q => q !== p), b = G.ball;
  Object.assign(t5.T, { phase: 'live' });
  Object.assign(G, { phase: 'live', off: 0 });
  Object.assign(p, { hasBall: true, action: null, face: 0 });
  p.r5.pac = Math.max(-0.5, Math.min(0.5, (pac - 69) / 40));
  Object.assign(b, { state: 'held', holder: p.id, x: p.x + 0.4, y: p.y - 0.2, z, dead: false });
  assert(t5.doPass(p, r, 'chest'));
  const P = t5.T.ps, startPose = { ...p.pose };
  P.int = null;
  while (P.t < 0) {
    const before = [b.x, b.y, b.z];
    t5.qaPassUpdate(1 / 60);
    const step = Math.hypot(b.x - before[0], b.y - before[1], b.z - before[2]);
    maxWindupStep = Math.max(maxWindupStep, step);
    assert(step <= 0.1 + 1e-9, `Windup ball step ${step} exceeds 0.1m`);
    assert.deepEqual([P.x0, P.y0, P.z0], [b.x, b.y, b.z]);
    if (P.t < -P.windup + 1 / 60 + 1e-9) {
      assert(Math.abs(p.pose.aLp - startPose.aLp) < Math.abs(1.3 - startPose.aLp));
    }
  }
  const release = [b.x, b.y, b.z];
  t5.qaPassUpdate(1 / 600);
  assert.deepEqual([P.x0, P.y0, P.z0], release);
  assert(Math.hypot(b.x - release[0], b.y - release[1], b.z - release[2]) < 0.1);
}
console.log(`Windup 60Hz: maxBallStep=${maxWindupStep.toFixed(4)}m (limit 0.1000m); pose blend and release origin passed.`);
sample(90, 5, false); sample(50, 5, false);
const capped = sample(50, 5, true, { t5_pass_er: 0, t5_pass_leadLow: 0, t5_pass_leadRnd: 0 });
assert.equal(capped.leadEr, 0.8);
assert.equal(capped.physicalEr, 0);
assert.equal(sample(50, 5, true, { t5_pass_er: 0, t5_pass_leadCap: 0 }).er, 0);
for (const [label, row] of [['pac90', high], ['pac50', low]]) console.log(`${label}: windup=${row.windup.toFixed(3)}s speed=${row.speed.toFixed(3)}m/s meanMiss=${row.miss.toFixed(3)}m qualityError=${row.er.toFixed(3)}m`);
const seeds = [7, 19, 43];
function summarize(label, log) {
  assert(log.length > 0);
  const counts = {
    ok: log.filter(r => r.res === 'ok' && r.ck !== 'reach').length,
    reach: log.filter(r => r.res === 'ok' && r.ck === 'reach').length,
    fumble: log.filter(r => r.res === 'fum').length,
    miss: log.filter(r => r.res === 'miss').length,
    interception: log.filter(r => r.res === 'int').length,
    deflection: log.filter(r => r.res === 'defl').length,
    unresolved: log.filter(r => r.res === 'fly').length,
  };
  assert.equal(Object.values(counts).reduce((a, b) => a + b, 0), log.length);
  const rates = Object.entries(counts).map(([k, n]) => `${k}=${n} (${(100 * n / log.length).toFixed(2)}%)`).join(' ');
  const windup = log.reduce((s, r) => s + r.qaWindup, 0) / log.length;
  console.log(`${label}: passes=${log.length} ${rates} meanWindup=${windup.toFixed(4)}s`);
  return { ...counts, total: log.length };
}
console.log('300s VM 5V5 per seed; reach = successful catch with reach pose; ok excludes reach; all rates per attempted pass, windup includes zero-windup passes.');
for (const baseline of [true, false]) {
  const all = [], label = baseline ? 'Before' : 'After';
  for (const seed of seeds) {
    const { t5, G } = fixture(baseline, -1, seed);
    for (let i = 0; i < 36000; i++) {
      t5.tick(1 / 120);
      assert(Number.isFinite(G.ball.x) && Number.isFinite(G.ball.y) && Number.isFinite(G.ball.z));
    }
    summarize(`${label} seed=${seed}`, t5.T.passLog);
    all.push(...t5.T.passLog);
  }
  const counts = summarize(`${label} aggregate`, all);
  if (!baseline) assert((counts.fumble + counts.miss) / counts.total <= 0.025, 'Catch turnover rate must stay within 2.5%');
}
console.log('Pass rating: high/low separation, lead cap, moving/stationary catches, invalid target, windup hands, controller switch and 3-seed 300s simulations passed.');
