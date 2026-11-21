const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function fixture(mode) {
  const ctx = vm.createContext({ performance: { now: () => 0 }, setTimeout() {}, clearTimeout() {}, addEventListener() {}, navigator: { getGamepads: () => [] } });
  ctx.window = ctx;
  vm.runInContext('let seed = 7; Math.random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296)', ctx);
  for (const name of ['tune', 'ptype', 'render', 'input', 'roster', 'measurements', 'r5', 'game', 'b5', 'team5', 'team3']) {
    let code = fs.readFileSync(path.join(__dirname, '../js', name + '.js'), 'utf8');
    if (name === 'game') code = code.replace('_qa: {', '_qa: { updateAction, updateBall,');
    vm.runInContext(code, ctx, { filename: name + '.js' });
  }
  const { game: gm, T3, T5 } = ctx.PH, { G, K } = gm;
  function reset(seed = 7) {
    gm.seed(seed);
    if (mode === '3V3') T3.start({ slots: ['luka', 'curry', 'jokic', 'joe', 'durant', 'giannis'].map(arch => ({ arch, role: 'cpu' })), local: -1, replay: false });
    else if (mode === '5V5') { T5.start({ human: -1 }); T5.T.phase = 'live'; }
    else gm.newGame({ mode: 'cpu', arch0: 'luka', arch1: 'joe', diff: 1 });
    const p = G.players[0], d = G.players[mode === '3V3' ? 3 : mode === '5V5' ? 5 : 1];
    Object.assign(G, { phase: 'live', off: 0, needClear: false, time: 1, shotClock: 8, cutin: null });
    Object.assign(G.fx, { hit: 0, slow: 0 });
    for (const q of G.players) {
      const slot = q.id % (G.players.length / 2);
      Object.assign(q, { ctrl: 'cpu', hasBall: false, action: null, stun: 0, cd: 0, z: 0, vz: 0, vx: 0, vy: 0, noGrabT: 0, x: slot % 2 ? -5 : 5, y: 10 + slot * 0.3 + (q.tm || 0) * 0.6 });
    }
    Object.assign(p, { x: 0, y: 6, face: Math.PI / 2, handX: 0.33, hasBall: true, opp: d });
    Object.assign(d, { x: 0.8, y: 6.6, opp: p, face: -Math.PI / 2 });
    p.r.badges = []; d.r.badges = []; d.r.stl = 0.5;
    Object.assign(p.ai, { call: 'drive', callLost: false, pm: { drive: 0 } });
    Object.assign(G.ball, { state: 'held', holder: p.id, dead: false, wasShot: false, poke: null, x: p.x, y: p.y, z: 0.8, noPick: 0 });
    Object.assign(K, { stlB0: 100, stlMax: 1 });
    return { p, d };
  }
  function hit(d) {
    d.action = { type: 'steal', t: K.stlHitT, T: K.stlT };
    gm._qa.updateAction(d, gm.t5.zeroInp(), 0);
    assert(d.action.poked, 'successful shared on-ball judgement');
    return !!G.ball.poke;
  }
  const tick = () => mode === '3V3' ? T3.tick(1 / 120, {}) : mode === '5V5' ? T5.tick(1 / 120) : gm.tick(1 / 120);
  return { gm, G, K, reset, hit, tick, PH: ctx.PH };
}

for (const mode of ['1V1', '3V3', '5V5']) {
  const f = fixture(mode), { gm, G, K } = f;
  let low = 0, high = 0;
  for (let i = 0; i < 200; i++) {
    let { p, d } = f.reset(100 + i);
    if (f.hit(d)) {
      low++;
      assert.equal(G.ball.state, 'loose');
      assert((G.ball.vx * (p.x - d.x) + G.ball.vy * (p.y - d.y)) > 0, 'poke travels away from stealer');
      assert.equal(G.ball.lastTouch, d.id);
      assert.equal(G.ball.noPick, K.stlPokeNP);
      assert.equal(p.stun, K.stlPokeStun);
      assert.equal(d.action.T, K.stlRecT);
      assert.equal(G.stats[d.id].stl, 0);
      assert.equal(G.stats[p.id].tov, 0);
      if (mode === '1V1') assert.equal(p.ai.pm.drive, 0, 'poke does not penalize tactic memory before recovery');
    }
    ({ p, d } = f.reset(100 + i));
    d.r.stl = 0.99; d.r.badges = ['pick'];
    if (!f.hit(d)) {
      high++;
      assert.equal(p.stun, K.stlStun, 'clean stun unchanged');
      assert.equal(G.stats[d.id].stl, 1, 'clean credit remains immediate');
      assert.equal(G.stats[p.id].tov, 1);
      assert.equal(G.ball.noPick, K.stlNoPick);
      if (mode === '1V1') assert.equal(p.ai.pm.drive, -K.aiPlTurn, 'clean steal penalizes tactic memory immediately');
    }
  }
  assert(low > 150 && high > 150, 'low rating mostly pokes; elite pick badge mostly clean');
  console.log(`PASS ${mode}: low-rating pokes=${low}/200, elite pick clean=${high}/200`);

  for (const recovery of ['defense', 'offense', 'expired', 'expiredOffense', ...(mode === '1V1' ? [] : ['teammate'])]) {
    let { p, d } = f.reset();
    Object.assign(K, { stlCl0: 0, stlClS: 0, stlClTm: 0 });
    assert(f.hit(d));
    if (mode === '1V1') assert.equal(p.ai.pm.drive, 0, 'pending poke preserves tactic memory');
    const offensive = recovery === 'offense' || recovery === 'expiredOffense';
    G.time += recovery.startsWith('expired') ? K.stlPokeCredT + 0.01 : 0.5;
    gm._qa.updateBall(0);
    gm.t5.pickup(offensive ? p : recovery === 'teammate' ? G.players[d.id + 1] : d);
    assert.equal(G.ball.poke, null);
    const credit = recovery === 'defense' || recovery === 'teammate' ? 1 : 0;
    assert.equal(G.stats[d.id].stl, credit);
    assert.equal(G.stats[p.id].tov, credit);
    if (mode === '1V1') assert.equal(p.ai.pm.drive, credit ? -K.aiPlTurn : 0, 'only credited defensive recovery penalizes tactic memory');
    if (offensive) { assert.equal(G.off, 0); assert.equal(G.shotClock, 8); }
    gm.t5.pickup(d);
    assert.equal(G.stats[d.id].stl, credit, 'no double credit');
    if (mode === '1V1') assert.equal(p.ai.pm.drive, credit ? -K.aiPlTurn : 0, 'no repeated tactic memory penalty');
  }
  let { p, d } = f.reset();
  gm.t5.pickup(p);
  assert.equal(G.stats[d.id].stl, 0, 'ordinary pickup without pending poke');
  ({ p, d } = f.reset());
  assert(f.hit(d));
  G.ball.x = 8; G.ball.z = 0.13; G.ball.vz = 0;
  gm._qa.updateBall(0);
  assert.equal(G.off, 0, 'poke out of bounds returns ball to original offense');
  assert.equal(G.stats[d.id].stl, 0);
  console.log(`PASS ${mode}: defensive/offensive/expired/empty recovery credit, no double count, clock and OOB`);

  let defense = 0, offense = 0, other = 0;
  for (let i = 0; i < 200; i++) {
    ({ p, d } = f.reset(1000 + i));
    assert(f.hit(d));
    const moved = new Set();
    for (let t = 0; t < 600 && G.ball.state === 'loose' && G.phase === 'live'; t++) {
      f.tick();
      for (const q of [p, d]) if (Math.hypot(q.vx, q.vy) > 0.1) moved.add(q.id);
    }
    assert(moved.has(p.id) && moved.has(d.id), 'both original CPUs pursue the loose ball');
    if (G.ball.state !== 'held') other++;
    else if ((G.players[G.ball.holder].tm ?? G.ball.holder) === 0) offense++;
    else defense++;
  }
  console.log(`${mode} seeded poke recovery: defense=${defense}, offense=${offense}, unresolved/OOB=${other} / 200`);
  assert(defense >= 120 && defense <= 150 && offense > 0, 'defense recovers 60–75%, not all');
}
console.log('PASS poke steals: shared judgement, ratings/badges, recovery accounting and CPU races');
