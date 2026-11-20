const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Optional baseline source: STEAL_BASELINE=/path/to/original-game.js node qa/steal-timing.cjs
function fixture(source) {
  const ctx = vm.createContext({ performance: { now: () => 0 }, setTimeout() {}, clearTimeout() {} });
  ctx.window = ctx;
  ctx.PH = { input: { endTick() {}, read: () => ({}) } };
  ctx.reachAudit = { judged: 0, inRange: 0, moving: 0, timed: 0, timedHits: 0,
    scheduled: 0, fired: 0, cancelledMove: 0, cancelledWindow: 0, cancelledOutOfRange: 0,
    started: 0, scheduledJudged: 0, lostMove: 0, lostToMove: 0, lostToGather: 0, lostToIdle: 0, missedWindow: 0, missedRange: 0, rangeOnly: 0, scheduledTimedInRange: 0, scheduledHits: 0 };
  for (const name of ['tune', 'render', 'roster', 'r5', 'game']) {
    let code = name === 'game' && source ? source : fs.readFileSync(path.join(__dirname, '../js', name + '.js'), 'utf8');
    if (name === 'game') {
      code = code.replace('_qa: {', '_qa: { stealRead: typeof stealRead === "function" ? stealRead : null, movePath, updatePlayer, updateBall, updateAction,');
      code = code.replace(/ai.stealPlan = (\{ move: oa, at: Math.max\([^;]+);/, '{ reachAudit.scheduled++; ai.stealPlan = $1; }');
      code = code.replace(
        "if (ai.stealPlan && (ai.stealPlan.move !== oa || oa.t + K.stlHitT > sr.windowEnd)) ai.stealPlan = null;",
        "if (ai.stealPlan && (ai.stealPlan.move !== oa || oa.t + K.stlHitT > sr.windowEnd)) { if (ai.stealPlan.move !== oa) reachAudit.cancelledMove++; else reachAudit.cancelledWindow++; if (dd >= K.aiStlD) reachAudit.cancelledOutOfRange++; ai.stealPlan = null; }"
      );
      code = code.replace(
        'o.a2 = true; ai.stealPlan = null;',
        'reachAudit.fired++; pl.qaReachMove = oa; o.a2 = true; ai.stealPlan = null;'
      );
      code = code.replace(
        "T: K.stlT, done: false }; pl.animT",
        "T: K.stlT, done: false, qaMove: pl.qaReachMove }; if (pl.qaReachMove) { reachAudit.started++; pl.qaReachMove = null; } pl.animT"
      );
      code = code.replace('function updateAction(pl, inp, dt) {', `function updateAction(pl, inp, dt) {
        const df = OP(pl), a = pl.action;
        const judge = a.type === 'steal' && !a.done && a.t + dt >= K.stlHitT;
        const inRange = judge && df.hasBall && Math.hypot(df.x - pl.x, df.y - pl.y) < K.stlR;
        const timed = inRange && typeof stealRead === 'function' && stealRead(pl, df).timed;
        const before = G.stats[pl.id].stl;
        if (judge) reachAudit.judged++;
        if (inRange) reachAudit.inRange++;
        if (inRange && df.action?.type === 'move') reachAudit.moving++;
        if (timed) reachAudit.timed++;
        if (judge && a.qaMove) {
          reachAudit.scheduledJudged++;
          if (df.action !== a.qaMove) {
            reachAudit.lostMove++;
            if (df.action?.type === 'move') reachAudit.lostToMove++;
            else if (df.action) reachAudit.lostToGather++;
            else reachAudit.lostToIdle++;
          }
          else if (!stealRead(pl, df).timed) reachAudit.missedWindow++;
          if (!inRange) reachAudit.missedRange++;
          if (!inRange && df.action === a.qaMove && stealRead(pl, df).timed) reachAudit.rangeOnly++;
          if (timed && df.action === a.qaMove) reachAudit.scheduledTimedInRange++;
        }
        updateActionOriginal(pl, inp, dt);
        if (timed && G.stats[pl.id].stl > before) reachAudit.timedHits++;
        if (judge && a.qaMove && G.stats[pl.id].stl > before) reachAudit.scheduledHits++;
      }
      function updateActionOriginal(pl, inp, dt) {`);
    }
    vm.runInContext(code, ctx, { filename: name + '.js' });
  }
  const gm = ctx.PH.game;
  gm.reachAudit = ctx.reachAudit;
  gm.seed(7);
  gm.newGame({ mode: '2p', arch0: 'luka', arch1: 'joe', target: 999 });
  return gm;
}

function sample(gm, { kind = 'cross', mv, u = 0.5, side = 1, hand = 1, mode = '2p', chin = false, type = 'move', range = 1.05, fb = 'detail' } = {}) {
  const { G, K, t5 } = gm, [p, d] = G.players;
  G.mode = mode;
  Object.assign(G, { phase: 'live', needClear: false, off: 0, fb, floats: [] });
  Object.assign(p, { x: 0, y: 5, face: Math.PI / 2, hand, handX: 0.33 * hand, hasBall: true, action: type ? { type, kind, mv, h0: hand, h1: hand, t: u, T: 1 } : null, chinT: chin ? G.time + 1 : 0, post: false, z: 0, opp: d });
  Object.assign(d, { x: side * hand * range * 0.8, y: 5 + range * 0.6, face: -Math.PI / 2, hasBall: false, ctrl: 'p2', action: { type: 'steal', t: K.stlHitT, T: K.stlT }, opp: p });
  Object.assign(G.ball, { state: 'held', holder: 0, dead: false, x: p.x, y: p.y, z: 0.8 });
  const before = G.stats[1].stl;
  gm._qa.updateAction(d, t5.zeroInp(), 0);
  return { hit: G.stats[1].stl > before, recovery: d.action.T, text: G.floats.at(-1)?.text };
}

function rates(gm, label) {
  const cases = {
    'cross in-window': {}, 'cross out-of-window': { u: 0.05 },
    'ball-side': { type: null }, 'across-body': { type: null, side: -1 },
    'safe behind': { kind: 'behind' },
  };
  const result = {};
  for (const [name, opts] of Object.entries(cases)) {
    gm.seed(7);
    let hits = 0;
    for (let i = 0; i < 4000; i++) hits += sample(gm, opts).hit;
    result[name] = hits / 4000;
    console.log(label + ' ' + name + ': ' + hits + '/4000 (' + (100 * result[name]).toFixed(2) + '%)');
  }
  return result;
}

function possessions(gm, label) {
  for (const k in gm.reachAudit) gm.reachAudit[k] = 0;
  let steals = 0, attempts = 0, timeouts = 0;
  const N = 3000, dt = 1 / 60;
  for (let n = 0; n < N; n++) {
    gm.seed(7 + n * 2);
    gm.newGame({ mode: 'cpu', arch0: n % 2 ? 'kyrie' : 'luka', arch1: 'joe', target: 999, diff: 1 });
    const { G } = gm;
    G.players.forEach(p => { p.ctrl = 'cpu'; });
    // Start after the check-ball, with both CPUs otherwise using real game decisions.
    if (G.phase === 'check') G.phaseT = 0;
    let live = false, ended = false, previous = null;
    for (let i = 0; i < 2400; i++) {
      gm.tick(dt);
      const a = G.players[1].action;
      if (a?.type === 'steal' && a !== previous) attempts++;
      previous = a;
      if (G.phase === 'live') live = true;
      if (live && (G.off !== 0 || G.phase !== 'live' || G.stats[1].stl > 0)) { ended = true; break; }
    }
    steals += G.stats[1].stl;
    if (!ended) timeouts++;
  }
  assert.equal(timeouts, 0, 'all CPU possessions should finish');
  console.log(label + ' CPU-vs-CPU: ' + steals + ' steals / ' + N + ' possessions; ' + attempts + ' reaches; timeouts=' + timeouts);
  console.log(label + ' reach audit: ' + JSON.stringify(gm.reachAudit));
  return steals;
}

for (const hand of [-1, 1]) {
  const gm = fixture(), { G, _qa, t5 } = gm, [p, d] = G.players;
  Object.assign(G, { phase: 'live', needClear: false });
  Object.assign(p, { hand, handX: hand * 0.33, hasBall: true, face: Math.PI / 2 });
  d.off = true;
  Object.assign(G.ball, { state: 'held', holder: p.id, cT: 0 });
  gm._dbg.startMove(p, { ...t5.zeroInp(), mx: 1 }, 'cross');
  const a = p.action;
  assert.equal(a.h0, hand);
  assert.equal(a.h1, -hand);
  const rows = [];
  for (let i = 0; i < 120 && p.action === a; i++) {
    _qa.updatePlayer(p, t5.zeroInp(), 1 / 120);
    _qa.updateBall(1 / 120);
    if (p.action !== a) break;
    const u = a.t / a.T, fx = Math.cos(p.face), fy = Math.sin(p.face);
    const lateral = fy * (G.ball.x - p.x) - fx * (G.ball.y - p.y);
    const side = Math.sign(lateral);
    Object.assign(d, { x: p.x + fy * side, y: p.y - fx * side });
    const read = _qa.stealRead(d, p);
    if (rows.length < 4 && u >= [0.1, 0.25, 0.5, 0.75][rows.length]) {
      rows.push('u=' + u.toFixed(3) + ': ball=' + lateral.toFixed(3) + ', handX=' + p.handX.toFixed(3));
    }
    assert(read.ballSide > 0.99 && read.across === 0, 'rendered ball side must receive the bonus throughout a real crossover');
    Object.assign(d, { x: p.x - fy * side, y: p.y + fx * side });
    assert(_qa.stealRead(d, p).across > 0.99, 'opposite side remains shielded');
    const ahead = gm.K.stlHitT;
    const futureSide = Math.sign(_qa.movePath(a, Math.min(1, (a.t + ahead) / a.T))[0]);
    Object.assign(d, { x: p.x + fy * futureSide, y: p.y - fx * futureSide });
    assert(_qa.stealRead(d, p, ahead).ballSide > 0.99, 'CPU lookahead follows the future ball side');
  }
  assert.equal(rows.length, 4);
  console.log('Crossover source hand ' + hand + ': ' + rows.join('; '));
}

if (process.env.STEAL_BASELINE) {
  const before = fixture(fs.readFileSync(process.env.STEAL_BASELINE, 'utf8'));
  rates(before, 'before');
  possessions(before, 'before');
}
const gm = fixture();
const r = rates(gm, 'after');
assert(r['cross in-window'] > r['cross out-of-window'] + 0.2);
assert(r['ball-side'] > r['across-body'] + 0.1);
assert(r['across-body'] >= 0.04 && r['across-body'] <= 0.06, 'reckless reaches retain a low real chance');
assert.equal(r['safe behind'], 0);
for (const hand of [-1, 1]) {
  gm.seed(7); const right = Array.from({ length: 100 }, () => sample(gm, { hand, mode: '2p' }).hit);
  gm.seed(7); const team = Array.from({ length: 100 }, () => sample(gm, { hand, mode: 't5' }).hit);
  assert.deepEqual(team, right, '5V5 shares the same judgement for either hand');
}
gm.seed(7); const left = Array.from({ length: 100 }, () => sample(gm, { hand: -1 }).hit);
gm.seed(7); const right = Array.from({ length: 100 }, () => sample(gm, { hand: 1 }).hit);
assert.deepEqual(left, right, 'mirroring ball hand and defender side preserves odds');
gm.CFG.stealMul = 0;
const good = sample(gm), bad = sample(gm, { u: 0.05, side: -1 });
assert(bad.recovery > good.recovery);
assert.equal(bad.text, '伸手失位');
assert.equal(sample(gm, { u: 0.05, side: -1, fb: 'simple' }).text, '伸手失位');
assert.equal(sample(gm, { range: 3, fb: 'simple' }).text, '伸手失位');
assert.equal(sample(gm, { fb: 'simple' }).text, undefined, 'ordinary misses stay hidden in simplified mode');
gm.CFG.stealMul = 1;
for (const type of ['layup', 'dunk']) {
  for (let i = 0; i < 100; i++) assert(!sample(gm, { type }).hit);
}
// No action is also a valid judgement input.
assert.equal(typeof sample(gm, { type: null }).hit, 'boolean');
assert.equal(sample(gm, { range: 3 }).text, '伸手失位');
const d = gm.G.players[1];
d.arch = gm.ARCH.draymond;
d.sk.cd = 0;
assert(sample(gm, { side: -1, u: 0.05 }).hit, 'Draymond skill overrides a bad reach');
assert(d.sk.cd > 0, 'skill goes on cooldown');
d.sk.cd = 0;
let chinHits = 0;
for (let i = 0; i < 100; i++) chinHits += sample(gm, { side: -1, chin: true }).hit;
assert(chinHits < 20, 'chin retains low ordinary odds rather than the guaranteed skill');
assert.equal(d.sk.cd, 0, 'chin prevents the guaranteed skill from firing');
for (const type of ['layup', 'dunk']) assert(!sample(gm, { type }).hit, 'finishes exclude the skill too');
{
  const ai = fixture(), { G, K } = ai;
  sample(ai);
  const [p, d] = G.players;
  Object.assign(G, { diff: 2, phase: 'live' });
  Object.assign(G.ball, { state: 'held', holder: p.id, dead: false });
  Object.assign(d, { action: null, stun: 0, cd: 0, z: 0 });
  d.ai.stealCd = 0;
  p.hasBall = true; p.action = { type: 'move', kind: 'cross', h0: 1, h1: 1, t: 0, T: 1 };
  ai.t5.aiInput(d, 0);
  assert.equal(d.ai.stealPlan.move, p.action, 'hard CPU recognizes an exposed move once');
  assert(d.ai.stealPlan.at + K.stlHitT >= K.stlWin0);
  assert(d.ai.stealPlan.at + K.stlHitT <= K.stlWin1);
  assert.equal(d.ai.stealPlan.at + K.stlHitT, K.stlWin0, 'reach targets the window opening before combo cancels and separation');
  p.action.t = d.ai.stealPlan.at;
  assert(ai.t5.aiInput(d, 0).a2, 'scheduled reach fires at its target frame');
  assert.equal(d.ai.stealPlan, null);
  assert(d.ai.stealCd > 0);
  for (const [diff, kind, t] of [[0, 'cross', 0], [2, 'behind', 0], [2, 'cross', 0.95]]) {
    G.diff = diff; d.ai.stealCd = 0;
    p.action = { type: 'move', kind, h0: 1, h1: 1, t, T: 1 };
    ai.t5.aiInput(d, 0);
    assert.equal(d.ai.stealPlan, null, 'easy CPU, safe moves and expired windows do not schedule reaches');
  }
  G.diff = 2; d.ai.stealCd = 0;
  p.action = { type: 'move', kind: 'cross', h0: 1, h1: 1, t: 0, T: 1 };
  ai.t5.aiInput(d, 0);
  assert(d.ai.stealPlan);
  p.action = null;
  ai.t5.aiInput(d, 0);
  assert.equal(d.ai.stealPlan, null, 'possession/action changes discard pending reactions');
}
const steals = possessions(fixture(), 'after');
assert(steals >= 1.6 * 13 && steals <= 40, 'CPU steals should be at least 1.6x the 13/3000 baseline, without overshooting');
console.log('PASS steal timing, geometry, recovery, exclusions and shared 5V5 judgement');
