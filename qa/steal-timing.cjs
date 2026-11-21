const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');

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
      code = code.replace('_qa: {', '_qa: { startSteal, poseTarget, stealRead: typeof stealRead === "function" ? stealRead : null, movePath, updatePlayer, updateBall, updateAction,');
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
      code = code.replace('function updateAction(pl, inp, dt, shootPress) {', `function updateAction(pl, inp, dt, shootPress) {
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
        updateActionOriginal(pl, inp, dt, shootPress);
        if (timed && G.stats[pl.id].stl > before) reachAudit.timedHits++;
        if (judge && a.qaMove && G.stats[pl.id].stl > before) reachAudit.scheduledHits++;
      }
      function updateActionOriginal(pl, inp, dt, shootPress) {`);
    }
    vm.runInContext(code, ctx, { filename: name + '.js' });
  }
  const gm = ctx.PH.game;
  gm.rig = ctx.PH.rig;
  gm.reachAudit = ctx.reachAudit;
  gm.seed(7);
  gm.newGame({ mode: '2p', arch0: 'luka', arch1: 'joe', target: 999 });
  return gm;
}

function sample(gm, { kind = 'cross', mv, u = 0.5, side = 1, hand = 1, mode = '2p', chin = false, type = 'move', range = 1.05, fb = 'detail', post = false, lateral = 0.8, forward = 0.6, face = Math.PI / 2 } = {}) {
  const { G, K, t5 } = gm, [p, d] = G.players;
  G.mode = mode;
  Object.assign(G, { phase: 'live', needClear: false, off: 0, fb, floats: [] });
  Object.assign(p, { x: 0, y: 5, face, hand, handX: 0.33 * hand, hasBall: true, action: type ? { type, kind, mv, h0: hand, h1: hand, t: u, T: 1 } : null, chinT: chin ? G.time + 1 : 0, post, z: 0, opp: d });
  Object.assign(d, { x: side * hand * range * lateral, y: 5 + range * forward, face: -Math.PI / 2, hasBall: false, ctrl: 'p2', action: { type: 'steal', t: K.stlHitT, T: K.stlT }, opp: p });
  Object.assign(G.ball, { state: 'held', holder: 0, dead: false, x: p.x, y: p.y, z: 0.8 });
  const before = G.stats[1].stl;
  gm._qa.updateAction(d, t5.zeroInp(), 0);
  return { hit: G.stats[1].stl > before, recovery: d.action.T, text: G.floats.at(-1)?.text };
}

function rates(gm, label) {
  gm.G.players[0].r.hnd = 0.5;
  gm.G.players[1].r.stl = 0.5;
  const cases = {
    'cross in-window': {}, 'cross out-of-window': { u: 0.05 },
    'ball-side': { type: null }, 'across-body': { type: null, side: -1 },
    'safe behind': { kind: 'behind' },
    'neutral': { type: null, lateral: 0, forward: 1 },
    'behind': { type: null, lateral: 0, forward: -1 },
    'fake in-window': { type: 'fake' },
    'fake out-of-window': { type: 'fake', u: 0.05 },
    'ordinary post': { type: null, post: true, face: -Math.PI / 2, forward: 0, lateral: -1 },
    'post away-side': { type: null, post: true, face: -Math.PI / 2, forward: -1, lateral: 0 },
    'post hoop-side': { type: null, post: true, face: -Math.PI / 2, forward: 1, lateral: 0 },
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
    if (G.phase === 'check' && gm.t5.checkStep(9)) G.phase = 'live';
    // Measure steals from an on-ball guarding spot, not from the deeper check-ball stance.
    { const [o, d] = G.players; d.x = o.x + 0.7; d.y = o.y + 1.5; }
    let live = false, ended = false, previous = null;
    // Long possessions with several offensive rebounds are legitimate.
    for (let i = 0; i < 3600; i++) {
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

{
  const oldSource = execFileSync('git', ['show', (process.env.STEAL_RECOVERY_BASE || '3bb7f5f') + ':js/game.js'], { cwd: path.join(__dirname, '..'), encoding: 'utf8' });
  const old = fixture(oldSource), current = fixture();
  old.CFG.stealMul = 0; current.CFG.stealMul = 0;
  const ranges = [['close', 0.25], ['mid', 0.6], ['far', 0.95], ['out', 1.3]];
  const rows = [];
  console.log('Miss action duration seconds, from reach start (old -> new); distance / stlR: close=.25 mid=.60 far=.95 out=1.30');
  console.log('stl     close           mid             far             out-of-range');
  for (const rating of [0.3, 0.6, 0.9]) {
    old.G.players[1].r.stl = rating; current.G.players[1].r.stl = rating;
    const cells = ranges.map(([, fraction]) => {
      const opts = { type: null, range: fraction * current.K.stlR };
      const before = sample(old, opts).recovery, after = sample(current, opts).recovery;
      const team = sample(current, { ...opts, mode: 't5' }).recovery;
      assert.equal(after, team, '1V1 and 5V5 share miss recovery');
      return { before, after };
    });
    for (let i = 1; i < cells.length; i++) assert(cells[i].after > cells[i - 1].after, 'farther reaches recover more slowly, including out of range');
    if (rows.length) cells.forEach((cell, i) => assert(cell.after < rows.at(-1)[i].after, 'better defender steal rating recovers faster'));
    rows.push(cells);
    console.log(rating.toFixed(1) + '     ' + cells.map(c => c.before.toFixed(3) + ' -> ' + c.after.toFixed(3)).join('  '));
  }
  const average = cells => cells.reduce((sum, c) => sum + c, 0) / cells.length;
  const oldAverage = average(rows[1].map(c => c.before)), newAverage = average(rows[1].map(c => c.after));
  assert(newAverage < oldAverage * 0.75, 'average defender recovery should be clearly shorter');
  assert(rows[2][0].after < 0.35, 'elite close reach misses recover quickly');
  console.log('Average defender (stl .6), mean over distances: ' + oldAverage.toFixed(3) + ' -> ' + newAverage.toFixed(3) + 's');
  for (const rating of [0.3, 0.6, 0.9]) {
    current.G.players[1].r.stl = rating;
    let previous = 0;
    for (const fraction of [0, 0.25, 0.6, 0.99, 1, 1.01, 1.3, 2, 10]) {
      const value = sample(current, { type: null, range: fraction * current.K.stlR }).recovery;
      assert(Number.isFinite(value) && value >= current.K.stlHitT);
      assert(value >= previous, 'recovery stays monotonic across the range boundary and caps safely');
      previous = value;
    }
  }
  current.G.players[0].hasBall = false;
  current.G.players[1].action = { type: 'steal', t: current.K.stlHitT, T: current.K.stlT };
  current._qa.updateAction(current.G.players[1], current.t5.zeroInp(), 0);
  assert(Number.isFinite(current.G.players[1].action.T), 'missing ball handler still produces finite recovery');
  console.log('PASS distance/rating recovery scaling, shorter average, range boundary, absent ball, and shared 5V5 recovery');
}

for (const mode of ['2p', 't5', 't3']) for (const outcome of ['hit', 'miss', 'out-of-range', 'no-handler']) for (const hand of [-1, 1]) {
  const visual = fixture(), { G, K, _qa, t5 } = visual;
  visual.CFG.stealMul = outcome === 'hit' ? 100 : 0;
  K.stlMax = 1;
  const expected = sample(visual, { mode, hand, type: null, range: outcome === 'out-of-range' ? 3 : 0.9 });
  const [p, d] = G.players;
  delete p.pose.passHands; delete d.pose.passHands;
  d.action = null; d.grip = null;
  p.hasBall = outcome !== 'no-handler';
  const read = p.hasBall ? _qa.stealRead(d, p) : null, ratio = Math.min(K.stlMissDistMax, Math.hypot(p.x - d.x, p.y - d.y) / K.stlR);
  const duration = outcome === 'hit' ? K.stlRecT : Math.max(K.stlHitT, K.stlMissT + K.stlMissDistT * ratio * ratio + K.stlMissWeakT * (1 - d.r.stl)
    + K.stlFarT * Math.max(0, ratio - 1) + K.stlRiskT * (read ? read.risk : 0));
  if (outcome !== 'no-handler') assert.equal(expected.recovery, duration, 'judgement retains the original recovery formula');
  // Reset the sampled possession before running the real frame-by-frame animation.
  p.hasBall = outcome !== 'no-handler'; p.stun = 0;
  Object.assign(G.ball, { state: 'held', holder: p.hasBall ? p.id : -1, dead: false, x: p.x, y: p.y, z: 0.65 });
  d.face = -Math.PI / 2; d.stun = 0; d.cd = 0;
  for (let i = 0; i < 30; i++) _qa.updatePlayer(d, t5.zeroInp(), 1 / 60);
  _qa.startSteal(d);
  const action = d.action, heights = [];
  for (let i = 1; i <= Math.ceil((Math.max(duration, 0.4) + 0.04) * 120); i++) {
    G.time += 1 / 120;
    _qa.updatePlayer(d, t5.zeroInp(), 1 / 120);
    if (action.done) assert.equal(action.T, duration, 'visual recoil never shortens or extends gameplay recovery');
    if (i / 120 >= K.stlHitT + 0.05 && i / 120 <= K.stlHitT + 0.2) {
      const rig = visual.rig(d), wrist = rig[action.swipe < 0 ? 'handL' : 'handR'][2];
      heights.push(wrist - d.z);
    }
    if (i / 120 < duration - 1 / 120) assert.equal(d.action, action, 'recovered arm does not unlock gameplay early');
  }
  assert(heights.some(z => z > d.h * 0.48), mode + ' ' + outcome + ': wrist returns above waist within 200ms after contact');
  assert.equal(d.action, null, 'action still ends on its original timer');
  const target = { ...d, anim: 'steal', animT: K.stlHitT + 0.05, action: { type: 'steal', T: 0.6, done: true, poked: false, swipe: hand } };
  const miss = _qa.poseTarget(target);
  target.action.poked = true;
  assert(Math.abs(miss.tilt) > Math.abs(_qa.poseTarget(target).tilt), 'miss adds body stagger, not an arm hold');
  target.animT = K.stlHitT + 0.18;
  assert(_qa.poseTarget(target)[hand < 0 ? 'aLe' : 'aRe'] > 0.7, 'steal elbow bends back in while recovery is still active');
  assert(Object.values(miss).every(Number.isFinite), 'empty-target and out-of-range poses stay finite');
}
console.log('PASS steal wrist recoil within 200ms, unchanged gameplay timers, mirrored hit/miss/empty/out-of-range poses in 1V1/5V5/3V3');

let maxElbowStep = 0, maxWristStep = 0;
for (const mode of ['2p', 't5', 't3']) for (const fps of [60, 120]) for (const hit of [true, false]) {
  const visual = fixture(), { G, K, _qa, t5 } = visual, dt = 1 / fps;
  for (const range of [0.55, 0.8, 1.01, 1.3, 1.35]) for (const phase of [0, 1, 2, 3]) for (const hand of [-1, 1]) {
    visual.newGame({ mode: '2p', arch0: 'lyles', arch1: 'djmurray', target: 999 });
    visual.CFG.stealMul = hit ? 100 : 0; K.stlMax = 1;
    const [p, d] = G.players;
    Object.assign(G, { phase: 'live', needClear: false, time: 0, mode });
    Object.assign(p, { x: 0, y: 5, hasBall: true, face: Math.PI / 2, opp: d, action: null, hand, handX: hand * 0.33 });
    Object.assign(d, { x: hand * range * 0.6, y: 5 + range * 0.8, hasBall: false, face: -Math.PI / 2, opp: p, action: null });
    delete p.pose.passHands; delete d.pose.passHands;
    Object.assign(G.ball, { state: 'held', holder: p.id, dead: false });
    const step = () => {
      G.time += dt;
      _qa.updatePlayer(p, t5.zeroInp(), dt);
      _qa.updatePlayer(d, t5.zeroInp(), dt);
      _qa.updateBall(dt);
    };
    for (let i = 0; i < fps / 2; i++) step();
    p.drib = phase; _qa.updateBall(0); _qa.startSteal(d);
    const action = d.action, label = `${mode} ${fps}fps ${hit ? 'hit' : 'miss'} ${range}m phase=${phase} hand=${hand}`;
    const joints = () => {
      const rig = visual.rig(d);
      return { elbows: [d.pose.aLe, d.pose.aRe], wrists: [rig.handL, rig.handR] };
    };
    let previous = joints(), duration = null, raised = false;
    for (let i = 1; i <= Math.ceil(0.9 * fps); i++) {
      if (!action.done && action.t + dt >= K.stlHitT) {
        const read = _qa.stealRead(d, p), ratio = Math.min(K.stlMissDistMax, Math.hypot(p.x - d.x, p.y - d.y) / K.stlR);
        duration = hit ? K.stlRecT : Math.max(action.t + dt, K.stlHitT, K.stlMissT + K.stlMissDistT * ratio * ratio
          + K.stlMissWeakT * (1 - d.r.stl) + K.stlFarT * Math.max(0, ratio - 1) + K.stlRiskT * read.risk);
      }
      step();
      const current = joints();
      if (i * dt >= K.stlHitT - 2 * dt && i * dt <= Math.min(K.stlHitT + K.stlRecoilT, action.T)) {
        for (let arm = 0; arm < 2; arm++) {
          const elbow = Math.abs(current.elbows[arm] - previous.elbows[arm]);
          const wrist = Math.hypot(...current.wrists[arm].map((x, j) => x - previous.wrists[arm][j]));
          maxElbowStep = Math.max(maxElbowStep, elbow); maxWristStep = Math.max(maxWristStep, wrist);
          assert(elbow <= 0.5, `${label}: elbow ${arm} jumped ${elbow}rad at ${i * dt}s`);
          assert(wrist <= 0.2, `${label}: wrist ${arm} jumped ${wrist}m at ${i * dt}s`);
        }
      }
      if (action.done) {
        assert.equal(!!action.poked, hit, label + ': intended judgement path executes');
        assert(action.reach, label + ': contact IK executes');
        assert.equal(action.T, duration, label + ': gameplay recovery formula unchanged');
      }
      if (i * dt >= K.stlHitT && i * dt <= K.stlHitT + 0.2) raised ||= current.wrists[action.swipe < 0 ? 0 : 1][2] - d.z > d.h * 0.48;
      if (duration !== null) assert.equal(d.action === action, action.t < action.T, label + ': action ends only on its gameplay timer');
      previous = current;
    }
    assert(raised, label + ': quick recoil still lifts wrist within 200ms');
    assert.equal(d.action, null, label + ': recovery completes');
  }
}
console.log(`PASS steal contact continuity: hit/miss, 0.55/0.8/1.01/1.3/1.35m, both arms, four dribble phases, 60/120fps, 1V1/5V5/3V3; max elbow=${maxElbowStep.toFixed(3)}rad, wrist=${maxWristStep.toFixed(3)}m/frame`);

if (process.env.STEAL_BASELINE) {
  const before = fixture(fs.readFileSync(process.env.STEAL_BASELINE, 'utf8'));
  rates(before, 'before');
  possessions(before, 'before');
}
const gm = fixture();
const r = rates(gm, 'after');
assert(r['cross in-window'] > r['cross out-of-window'] + 0.2);
assert(r['ball-side'] >= 0.08 && r['ball-side'] <= 0.12, 'average ball-side dribbling stays in the normal band');
assert(r['across-body'] < 0.01 && r.behind < 0.01, 'unreasonable reaches almost never succeed');
assert(Math.abs(r['cross out-of-window'] - r['ball-side']) < 0.02);
assert(r.neutral > r['ball-side'] * 0.35 && r.neutral < r['ball-side'] * 0.65);
assert(r['fake in-window'] > r['fake out-of-window'] + 0.15);
assert(r['ordinary post'] >= 0.04 && r['ordinary post'] <= 0.06);
assert(r['post away-side'] >= 0.25 && r['post away-side'] <= 0.35);
assert(r['post away-side'] > r['ball-side'] + 0.15 && r['post away-side'] > r['ordinary post'] + 0.2);
assert(r['post hoop-side'] < 0.01);
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
const simulation = fixture();
const steals = possessions(simulation, 'after');
assert(steals >= 6 && steals <= 38, 'CPU steals remain possible without exceeding the old elevated rate');
assert(simulation.reachAudit.judged > 0, 'possession audit instruments the shared judgment');
console.log('PASS steal timing, geometry, recovery, exclusions and shared 5V5 judgement');
