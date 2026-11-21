const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');

function load(before = false, base = process.env.PERFECT_BASE || 'f9bcdcb') {
  const ctx = vm.createContext({ console, performance: { now: () => 0 }, setTimeout() {}, clearTimeout() {} });
  ctx.window = ctx;
  ctx.PH = { input: { endTick() {}, read: () => ({}), read5: () => ({}) } };
  for (const name of ['tune', 'render', 'roster', 'r5', 'game', 'b5', 'team5']) {
    let code = before && name === 'game'
      ? execFileSync('git', ['show', `${base}:js/game.js`], { cwd: root, encoding: 'utf8' })
      : fs.readFileSync(path.join(root, 'js', name + '.js'), 'utf8');
    if (name === 'game') code = code.replace('PH.game = {', 'PH.finishQA = { updateBall, updateAction, layUnit }; PH.game = {');
    if (name === 'game') code = code.replace('function contestInfo(s, d, cls) {', 'function contestInfo(s, d, cls) { if (PH.finishContestQA != null) return { c: PH.finishContestQA, src: "QA" };');
    if (name === 'team5') code = code.replace('PH.T5 = {', 'PH.finishTeamQA = (g) => { G = g; T.tm = [0, 1].map(tm => ({ on: g.players.filter(p => p.tm === tm) })); shotAdj(); }; PH.T5 = {');
    vm.runInContext(code, ctx, { filename: name + '.js' });
  }
  return ctx;
}

function shot(ctx, opts = {}) {
  const { mode = '2p', defense = 0.9, block = 0.85, error = 0, rating = 0.75, gap = 0.3, z = 0.9, bump = 0.55, seed = 7, cpu = false, flight = false, thru, alley = false } = opts;
  const gm = ctx.PH.game, { G, _dbg: dbg } = gm;
  ctx.PH.finishContestQA = opts.rawContest;
  gm.newGame({ mode: '2p', arch0: opts.skill ? 'cade' : 'joe', arch1: 'joe', target: 9999 });
  Object.assign(G, { mode, phase: 'live', needClear: false, tips: null });
  const [p, d] = G.players;
  Object.assign(p, { x: 0, y: 10, z, vz: 0, face: Math.PI / 2, vx: 0, vy: 0, speed: 0, stam: 100, hasBall: true, ctrl: cpu ? 'cpu' : 'p1' });
  Object.assign(d, { x: 0, y: p.y + gap, z: 0, stance: true, stun: 0, off: false, stam: 100, action: null });
  Object.assign(p.r, { lay: rating, close: rating, flo: rating, str: 0.6, badges: [] });
  Object.assign(d.r, { intD: defense, blk: block, str: 0.6, badges: [] });
  for (const q of [p, d]) q.arch = { ...q.arch, key: 'qa', _bt: {} };
  if (mode === 't5') { p.tm = 0; d.tm = 1; p.opp = d; G.h5 = { score: (q, pts) => { G.score[q.tm] += pts; } }; }
  gm.seed(7);
  assert(dbg.startFinish(p, gm.t5.zeroInp(), 'lay'));
  const a = p.action;
  if (opts.skill) assert.equal(a.skill, 'cade', 'exercise naturally triggered Cade layup skill');
  const variant = opts.variant || 'normal';
  Object.assign(a, { v: variant, sty: 'normal', skill: opts.skill ? a.skill : null, hzL: 0, ky: false, bump, thru, inSteps: false, t: 0.34, farLsv: false, lsv: null });
  a.V = { ...gm._qa.LVR[variant] };
  if (mode === 't5') ctx.PH.finishTeamQA(G);
  if (opts.effectiveContest != null) a.V.c = opts.effectiveContest / (opts.rawContest * (gm.K.smLayC0 - gm.K.smLayCS * p.r.str));
  if (alley) a.alley = { grade: 'green' };
  gm.CFG.blockMul = 0;
  gm.seed(seed);
  const raw = dbg.contestOf(p, d, 'in');
  if (opts.actionPath) {
    a.relAt = a.ideal + error * ctx.PH.finishQA.layUnit(a);
    a.t = a.ideal;
    ctx.PH.finishQA.updateAction(p, gm.t5.zeroInp(), 1 / 120);
  } else dbg.releaseShot(p, error, 'lay');
  const info = G.ball.shot.info;
  assert(Number.isFinite(info.prob) && info.prob >= 0 && info.prob <= 1);
  if (flight) {
    for (let i = 0; i < 600 && G.ball.shot; i++) ctx.PH.finishQA.updateBall(1 / 120);
    assert.equal(G.ball.shot, null, 'shot must resolve');
    assert.equal(G.score[0], info.made ? 2 : 0, 'score must match the sampled release result');
  }
  return { ...info, raw };
}

const before = load(true), after = load();
console.log('75 finish, airborne front hands-up + gather bump; real team5 shotAdj; blocks disabled to isolate make odds');
console.log('Mode Defense Timing  Raw/Effective  Before After  Sampled(after, N=400)');
for (const mode of ['2p', 't5']) {
  for (const [label, defense, block, gap, bump] of [['strong', 0.9, 0.85, 0.3, 0.55], ['weak', 0.6, 0.6, 0.3, 0.55], ['open', 0.9, 0.85, 9, 0]]) {
    for (const error of [0, 0.75]) {
      const opts = { mode, defense, block, gap, bump, error }, old = shot(before, opts), now = shot(after, opts);
      let made = 0;
      for (let i = 1; i <= 400; i++) made += shot(after, { ...opts, seed: Math.imul(i, 100003), flight: true, actionPath: true }).made;
      console.log(`${mode} ${label.padEnd(6)} ${error ? 'late   ' : 'perfect'} ${(100 * now.raw).toFixed(1)}/${(100 * now.contest).toFixed(1)}% ${(100 * old.prob).toFixed(1)}% ${(100 * now.prob).toFixed(1)}% ${(100 * made / 400).toFixed(1)}%`);
      if (process.env.PERFECT_AUDIT) continue;
      assert.equal(now.green, error === 0);
      assert(Math.abs(made / 400 - now.prob) < 0.06);
      if (label === 'open') {
        assert.equal(now.prob, old.prob);
        assert.equal(shot(after, { ...opts, cpu: true }).prob, shot(before, { ...opts, cpu: true }).prob);
      }
      else {
        assert.equal(shot(after, { ...opts, cpu: true }).prob, now.prob);
        assert(now.contest >= 0.5);
        if (!error) assert(now.prob >= (label === 'strong' ? 0.35 : 0.55) && now.prob <= (label === 'strong' ? 0.5 : 0.65));
        else {
          const perfect = shot(after, { ...opts, error: 0 }).prob;
          assert(perfect > now.prob && perfect - now.prob < 0.16);
        }
      }
    }
  }
}
if (!process.env.PERFECT_AUDIT) {
  const reviewed = load(true, '1a0635e');
  const regression = { variant: 'floater', defense: 0.6, block: 0.3, rawContest: 1, bump: 0 };
  const oldLow = shot(reviewed, { ...regression, effectiveContest: 0.499 });
  const oldHigh = shot(reviewed, { ...regression, effectiveContest: 0.501 });
  const low = shot(after, { ...regression, effectiveContest: 0.499 });
  const high = shot(after, { ...regression, effectiveContest: 0.501 });
  assert(oldHigh.prob > oldLow.prob, 'reproduce reviewed green floater discontinuity');
  assert(high.prob <= low.prob);
  console.log(`Green floater 49.9% -> 50.1% contest: reviewed ${(100 * oldLow.prob).toFixed(1)}% -> ${(100 * oldHigh.prob).toFixed(1)}%; fixed ${(100 * low.prob).toFixed(1)}% -> ${(100 * high.prob).toFixed(1)}%`);
  const contests = [...new Set([
    ...Array.from({ length: 101 }, (_, i) => i / 100),
    ...Array.from({ length: 101 }, (_, i) => (450 + i) / 1000),
    0.4999, 0.5001,
  ])].sort((a, b) => a - b);
  for (const mode of ['2p', 't5']) for (const variant of ['normal', 'floater']) {
    for (const defense of [0.6, 0.9]) for (const block of [0.3, 0.9]) {
      for (const cpu of [false, true]) for (const error of [0, 0.75]) {
        for (const sweep of ['raw', 'effective']) {
          let previous = 1;
          for (const contest of contests) {
            const opts = { mode, variant, defense, block, cpu, error, bump: 0,
              rawContest: sweep === 'raw' ? contest : 1,
              ...(sweep === 'effective' ? { effectiveContest: contest } : {}) };
            const now = shot(after, opts);
            if (sweep === 'effective') assert(Math.abs(now.contest - contest) < 1e-9);
            assert(now.prob <= previous + 1e-9, `${JSON.stringify(opts)}: ${previous} -> ${now.prob}`);
            previous = now.prob;
          }
        }
      }
      for (const cpu of [false, true]) for (const effectiveContest of [0.501, 0.75, 1]) {
        const opts = { mode, variant, defense, block, cpu, rawContest: 1, bump: 0, effectiveContest };
        assert(shot(after, opts).prob > shot(after, { ...opts, error: 0.75 }).prob,
          `perfect timing advantage with both ceilings binding: ${JSON.stringify(opts)}`);
      }
    }
  }
  console.log('PASS monotonic raw/effective contest sweeps: 0–1 plus dense 0.45–0.55, layups/floaters, green/non-green, low/high intD/block, human/CPU, 1v1/5V5; perfect advantage with both caps binding');
  for (const mode of ['2p', 't5']) {
    const oldSkill = shot(before, { mode, skill: true }), skill = shot(after, { mode, skill: true });
    console.log(`${mode} naturally triggered Cade skill: ${(100 * oldSkill.prob).toFixed(1)}% -> ${(100 * skill.prob).toFixed(1)}%`);
    assert.equal(oldSkill.prob, 1);
    assert(skill.prob <= 0.5);
    for (const rating of [0.7, 0.8]) {
      const opts = { mode, rating }, normal = shot(after, opts);
      assert(normal.prob >= 0.35 - 1e-9 && normal.prob <= 0.5);
      assert(shot(after, { ...opts, block: 0.6 }).prob > normal.prob, 'block rating matters independently');
      assert(shot(after, { ...opts, defense: 0.6 }).prob > normal.prob, 'interior defense matters independently');
      assert(shot(after, { ...opts, thru: 'fall' }).prob <= normal.prob + 1e-9);
      assert(shot(after, { ...opts, alley: true }).prob <= normal.prob + 1e-9);
    }
    for (const gap of [2.5, 9]) for (const error of [0, 0.75]) {
      const opts = { mode, gap, bump: 0, error };
      assert.equal(shot(after, opts).prob, shot(before, opts).prob, 'open/light unchanged');
    }
  }
  console.log('PASS perfect contested layups: target ranges, timing advantage, independent intD/block scaling, human/CPU parity, real action/flight/scoring samples, natural Cade skill, fall/alley caps, open/light preservation');
}
