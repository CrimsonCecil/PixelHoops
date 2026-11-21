const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function fixture(mode) {
  const ctx = vm.createContext({ performance: { now: () => 0 }, setTimeout() {}, clearTimeout() {}, addEventListener() {}, navigator: { getGamepads: () => [] } });
  ctx.window = ctx;
  vm.runInContext('Math.random = () => 0.5', ctx);
  for (const name of ['tune', 'ptype', 'render', 'input', 'roster', 'measurements', 'r5', 'game', 'b5', 'team5', 'team3']) {
    let code = fs.readFileSync(path.join(__dirname, '../js', name + '.js'), 'utf8');
    if (name === 'game') code = code.replace('_qa: {', '_qa: { updateAction, updatePlayer,');
    vm.runInContext(code, ctx, { filename: name + '.js' });
  }
  const { game: gm, T3, T5 } = ctx.PH, { G, K } = gm;
  function reset(seed, hnd, type) {
    gm.seed(seed);
    if (mode === '3V3') T3.start({ slots: ['luka', 'curry', 'jokic', 'joe', 'durant', 'giannis'].map(arch => ({ arch, role: 'cpu' })), local: -1, replay: false });
    else if (mode === '5V5') { T5.start({ human: -1 }); T5.T.phase = 'live'; }
    else gm.newGame({ mode: 'cpu', arch0: 'luka', arch1: 'joe', diff: 1 });
    const p = G.players[0], d = G.players[mode === '3V3' ? 3 : mode === '5V5' ? 5 : 1];
    Object.assign(G, { phase: 'live', off: 0, needClear: false, time: 1 });
    for (const q of G.players) Object.assign(q, { hasBall: false, action: null, stun: 0, cd: 0, z: 0, vz: 0, x: 5, y: 5 });
    Object.assign(p, { x: 0, y: 10, hasBall: true, opp: d, face: Math.PI / 2, stam: 100 });
    Object.assign(d, { x: 0.7, y: 10, opp: p, ctrl: 'p2', face: Math.PI });
    p.r.hnd = hnd; d.r.stl = 0.85; p.r.badges = []; d.r.badges = [];
    p.arch = { ...p.arch, key: 'qa', _bt: {} }; d.arch = { ...d.arch, key: 'qa', _bt: {} };
    Object.assign(G.ball, { state: 'held', holder: p.id, dead: false, wasShot: false, poke: null, x: p.x, y: p.y, z: 1.4 });
    if (type === 'dunk') gm._dbg.startDunk(p, gm._dbg.finPlan(p), 'a2', 'two');
    else assert(gm._dbg.startFinish(p, gm.t5.zeroInp(), 'lay'));
    assert.equal(p.action.type, type);
    // Re-seed after roster setup to keep the trial distribution independent of mode.
    gm.seed(Math.imul(seed, 2654435761) >>> 0);
    return { p, d };
  }
  return { gm, G, K, reset };
}

for (const mode of ['1V1', '3V3', '5V5']) {
  const { gm, G, K, reset } = fixture(mode), N = 1000;
  for (const type of ['layup', 'dunk']) {
    for (const hnd of [0.4, 0.95]) {
      let strips = 0;
      for (let i = 1; i <= N; i++) {
        const { p, d } = reset(i, hnd, type);
        p.z = 0.5; p.vz = 1;
        d.action = { type: 'steal', t: K.stlHitT, T: K.stlT };
        gm._qa.updateAction(d, gm.t5.zeroInp(), 0);
        if (!G.ball.poke) continue;
        strips++;
        assert.equal(p.action, null); assert.equal(p.z, 0.5); assert.equal(p.vz, 1);
        assert.equal(G.ball.state, 'loose'); assert.equal(G.ball.wasShot, false);
        if (strips === 1) {
          for (let t = 0; t < 120; t++) gm._qa.updatePlayer(p, gm.t5.zeroInp(), 1 / 120);
          assert.equal(p.z, 0, 'cancelled airborne finish lands with normal gravity');
          assert.equal(p.vz, 0);
        }
        assert.equal(G.stats[p.id].tov, 0); assert.equal(G.stats[p.id].fga, 0);
        gm.t5.pickup(d);
        assert.equal(G.stats[p.id].tov, 1); assert.equal(G.stats[d.id].stl, 1);
        gm.t5.pickup(d); assert.equal(G.stats[p.id].tov, 1);
      }
      console.log(`${mode} ${type} strips hnd=${hnd}: ${strips}/${N} (${(100 * strips / N).toFixed(1)}%)`);
      assert(hnd < 0.6 ? strips > 330 && strips < 460 : strips < 50);
    }
    for (const hnd of [0.3, 0.95]) {
      let fumbles = 0;
      for (let i = 1; i <= N; i++) {
        const { p, d } = reset(i, hnd, type);
        // Hold the gather so a second update cannot release or slam the ball.
        p.action.inSteps = true; p.action.vt = K.stlFumT;
        gm._qa.updateAction(p, { ...gm.t5.zeroInp(), a1: true }, 0);
        if (!G.ball.poke) {
          assert(p.action.fumbleChecked);
          gm._qa.updateAction(p, { ...gm.t5.zeroInp(), a1: true }, 0);
          assert.equal(G.ball.poke, null, 'no second fumble roll');
          continue;
        }
        fumbles++;
        assert.equal(p.action, null); assert.equal(G.ball.lastTouch, p.id);
        assert.equal(G.stats[p.id].fga, 0); assert.equal(G.stats[p.id].tov, 0);
        gm.t5.pickup(i % 2 ? p : d);
        assert.equal(G.stats[p.id].tov, i % 2 ? 0 : 1);
        assert.equal(G.stats[d.id].stl, 0);
        gm.t5.pickup(d); assert.equal(G.stats[p.id].tov, i % 2 ? 0 : 1);
      }
      const expected = Math.max(0, K.stlFumH - hnd) * K.stlFumP;
      console.log(`${mode} ${type} self-fumbles hnd=${hnd}: ${fumbles}/${N} (${(100 * fumbles / N).toFixed(1)}%), expected ${(100 * expected).toFixed(2)}%`);
      assert(Math.abs(fumbles / N - expected) < 0.025);
      if (!expected) assert.equal(fumbles, 0);
    }
    {
      const old = { ...K }, { p, d } = reset(7, 0.4, type), action = p.action;
      Object.assign(K, { stlFinB: 1, stlFinS: 0, stlFinMax: 1 });
      const hit = () => {
        Object.assign(p, { hasBall: true, action, stun: 0 });
        Object.assign(G.ball, { state: 'held', holder: p.id, dead: false, wasShot: false, poke: null });
        d.action = { type: 'steal', t: K.stlHitT, T: K.stlT };
        gm._qa.updateAction(d, gm.t5.zeroInp(), 0);
        return !!d.action.poked;
      };
      p.chinT = G.time + 1;
      for (const multiplier of [0, 0.15, 1]) {
        K.stlChin = multiplier; gm.seed(7);
        let hits = 0;
        for (let i = 0; i < 1000; i++) hits += hit();
        assert(Math.abs(hits / 1000 - multiplier) < 0.04, 'finishing strips retain tunable chin scaling');
        if (!multiplier) assert.equal(hits, 0);
      }
      p.chinT = G.time; K.stlPost = 0; p.post = true;
      assert.equal(hit(), false, 'finishing strips retain post protection');
      p.post = false; d.ctrl = 'cpu'; K.stlCpu0 = K.stlCpuD = 0;
      assert.equal(hit(), false, 'finishing strips retain CPU difficulty scaling');
      Object.assign(K, old, { stlFinCpu: 100000 });
      for (const multiplier of [0, 1]) {
        Object.assign(p, { hasBall: true, action, chinT: G.time + 1 });
        Object.assign(d, { action: null, cd: 0, stun: 0, z: 0 });
        Object.assign(d.ai, { stealCd: 0, seenAct: action, jumpAt: -1 });
        Object.assign(G.ball, { state: 'held', holder: p.id, dead: false });
        K.stlChin = multiplier;
        const input = gm.t5.aiInput(d, 0.01, { noJump: true });
        assert.equal(input.a2, !!multiplier, 'CPU finishing attempts share chin protection');
      }
      Object.assign(K, old);
      console.log(`PASS ${mode} ${type}: chin scaling, post protection, CPU difficulty and protected CPU attempts`);
    }
  }
}
console.log('PASS finishing fumbles: shared modes, strips, handling protection, once-only self-fumbles, recovery credit, no shot attempts');
