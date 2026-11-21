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
    if (name === 'render') code = code.replace('curCol: curCol,', 'curCol: curCol, pokePromptBox,');
    if (name === 'game') code = code.replace('_qa: {', '_qa: { updateAction, updateBall, updatePlayer, agil, slowSkip,');
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
  return { gm, G, K, reset, hit, tick, PH: ctx.PH, ctx };
}

for (const mode of ['1V1', '3V3', '5V5']) {
  const f = fixture(mode), { gm, G, K } = f;
  {
    const defaults = { stlCl0: K.stlCl0, stlClS: K.stlClS, stlClTm: K.stlClTm }, sounds = [];
    gm.setAudioSink((type, name) => { if (type === 'play') sounds.push(name); });
    let { p, d } = f.reset();
    Object.assign(K, { stlCl0: 0, stlClS: 0, stlClTm: 0 });
    assert(f.hit(d));
    assert.equal(G.fx.slow, K.stlPokeSlowT);
    assert.equal(G.fx.slowScale, K.stlPokeSlowK);
    assert.equal(sounds.filter((s) => s === 'poke').length, 1, 'one poke sound at contact');
    assert.equal(gm.pokeCue().gold, true, 'pending poke colors ball gold');
    assert.equal(p.stunK, 'daze', 'reuse ankle-breaker stagger');
    assert.equal(p.stun, Math.max(0, K.stlPokeStun - K.stlPokeAg * gm._qa.agil(p)));
    const x = p.x, y = p.y;
    gm._qa.updatePlayer(p, { ...gm.t5.zeroInp(), mx: 1, my: 1 }, 0.01);
    assert.equal(p.x, x, 'stagger blocks movement toward ball');
    assert.equal(p.y, y);
    G.ball.noPick = 0; G.ball.x = p.x; G.ball.y = p.y; G.ball.z = 0.13;
    gm._qa.updateBall(0);
    assert.notEqual(G.ball.holder, p.id, 'stagger blocks pickup');
    G.ball.state = 'ext';
    const start = G.time;
    for (let i = 0; i < Math.ceil(K.stlPokeSlowT * 120) + 1; i++) f.tick();
    assert.equal(G.fx.slow, 0, 'slow motion ends in real time');
    assert.equal(G.fx.slowScale, null);
    assert(Math.abs(G.time - start - K.stlPokeSlowT * K.stlPokeSlowK) < 0.025, 'simulation uses tuned time scale');
    const durations = [];
    for (const agility of [0.2, 0.9]) {
      ({ p, d } = f.reset());
      Object.assign(p.r, { acc: agility, spd: agility, lat: agility });
      assert(f.hit(d)); durations.push(p.stun);
    }
    assert(durations[1] < durations[0], 'agile handler staggers for less time');
    ({ p, d } = f.reset());
    gm.isOnline = () => true;
    assert(f.hit(d)); assert.equal(G.fx.slow, 0, 'online poke never slows simulation');
    delete gm.isOnline;
    ({ p, d } = f.reset());
    G.replay = {};
    assert(f.hit(d)); assert.equal(G.fx.slow, 0, 'replay poke does not start new slow motion');
    G.replay = null;
    ({ p, d } = f.reset());
    Object.assign(K, { stlCl0: 1, stlClS: 0, stlClTm: 0 });
    sounds.length = 0;
    assert.equal(f.hit(d), false);
    assert.equal(G.fx.slowScale, undefined, 'clean steal does not trigger poke time scale');
    assert(!sounds.includes('poke'), 'clean audio unchanged');
    assert.equal(gm.pokeCue().gold, false);
    Object.assign(K, defaults); gm.setAudioSink(null);
    console.log(`PASS ${mode}: poke-only offline slow motion and expiry, sound, gold ball, agility stagger and no vacuum pickup`);
  }
  for (const head of [{ x: 240, y: 210 }, { x: 2, y: 2 }, { x: 478, y: 268 }]) {
    for (const ball of [{ x: head.x, y: head.y - 30, s: 40 }, { x: 240, y: 215, s: 60 }]) {
      const box = f.PH.render.pokePromptBox(head, ball, 100), r = Math.max(2, f.PH.render.BALL_R * ball.s) + 12;
      assert(box, 'prompt has a visible placement');
      assert(box.x >= 0 && box.y >= 0 && box.x + box.w <= f.PH.render.W && box.y + box.h <= f.PH.render.H, 'prompt stays on screen');
      assert(box.x + box.w < ball.x - r || box.x > ball.x + r || box.y + box.h < ball.y - r || box.y > ball.y + r, 'prompt avoids ball and flash ring');
    }
  }
  console.log(`PASS ${mode}: player-anchored prompt placement avoids ball and viewport edges`);
  {
    const cleanDefaults = { stlCl0: K.stlCl0, stlClS: K.stlClS, stlClTm: K.stlClTm };
    const { p, d } = f.reset();
    assert.equal(gm.pokeCue().active, false, 'no cue without pending poke');
    Object.assign(K, { stlCl0: 0, stlClS: 0, stlClTm: 0 });
    assert(f.hit(d));
    assert(gm.pokeCue().active, 'poke activates shared flash');
    Object.assign(p, { ctrl: 'p1', stun: 0, action: null, x: G.ball.x - 2, y: G.ball.y });
    Object.assign(d, { ctrl: 'p2', stun: 0, action: null, x: G.ball.x + 2, y: G.ball.y });
    assert.equal(gm.pokeCue().prompts.length, 2, 'both human teams receive prompt');
    assert(gm.pokeCue().prompts[0].text.includes(mode === '5V5' ? 'J / Space' : 'K'));
    assert(gm.pokeCue().prompts[1].text.includes(mode === '5V5' ? 'J / Space' : 'Num2 / .'));
    if (mode !== '5V5') {
      const binding = fs.readFileSync(path.join(__dirname, '../js/main.js'), 'utf8').split('\n').find((line) => line.includes('GM.localInputSlot ='));
      assert(binding, 'main provides client-local input ownership');
      for (const local of [p, d]) {
        vm.runInContext(`{ const GM = PH.game, G = GM.G, matchConfig = {}, localSlot = ${local.id}; ${binding} }`, f.ctx);
        const prompts = gm.pokeCue().prompts;
        assert.equal(prompts.length, 1, 'online client never prompts remote humans');
        assert.equal(prompts[0].id, local.id);
        assert.equal(prompts[0].text, 'P1 扑球！按 K', 'host and guest both use device slot zero');
      }
      delete gm.localInputSlot;
      console.log(`PASS ${mode}: online host/guest prompt ownership and local slot-zero key`);
    }
    const glow = gm.pokeCue().glow;
    G.time += 0.5 / K.stlPokeHz;
    assert.notEqual(gm.pokeCue().glow, glow, 'flash pulses');
    K.stlPokePrompt = 0;
    assert.equal(gm.pokeCue().prompts.length, 0, 'prompt toggle');
    K.stlPokePrompt = 1;
    p.stun = 1; d.action = { type: 'steal' };
    assert.equal(gm.pokeCue().prompts.length, 0, 'unavailable humans receive no prompt');
    p.stun = 0;
    const input = f.PH.input;
    delete f.PH.input;
    assert(gm.pokeCue().prompts.length, 'headless cue does not require input module');
    f.PH.input = input;
    f.ctx.navigator.getGamepads = () => [{ connected: true, id: 'Xbox' }];
    assert.equal(input.diveLabel(0, false), 'X');
    f.ctx.navigator.getGamepads = () => [{ connected: true, id: 'DualSense' }];
    assert.equal(input.diveLabel(0, true), '□');
    f.ctx.navigator.getGamepads = () => [];
    if (mode === '5V5') {
      input.touch.on = true; input.touch.a1 = true;
      assert.equal(input.read5().X, true, 'first touch button maps to dive input X');
      for (const label of ['投篮', '抢断']) {
        f.ctx.document = { getElementById: (id) => id === 'tb1' ? { textContent: label } : null };
        assert.equal(input.diveLabel(0, true), label, '5V5 uses current first touch button label');
        assert.equal(gm.pokeCue().prompts[0].text, 'P1 扑球！按 ' + label);
      }
      delete f.ctx.document;
      assert.equal(input.diveLabel(0, true), '投篮/抢断', 'touch label remains headless safe');
      input.touch.on = false; input.touch.a1 = false;
      console.log('PASS 5V5: touch dive input and actual first-button prompt label');
    }
    gm.t5.pickup(p);
    assert.equal(gm.pokeCue().active, false, 'pickup clears flash');
    assert.equal(gm.pokeCue().prompts.length, 0, 'pickup clears prompt');
    Object.assign(K, cleanDefaults);
    console.log(`PASS ${mode}: poke flash, human/device prompts, availability, toggle, headless and pickup cleanup`);
  }
  let low = 0, high = 0;
  for (let i = 0; i < 200; i++) {
    let { p, d } = f.reset(100 + i);
    if (f.hit(d)) {
      low++;
      assert.equal(G.ball.state, 'loose');
      assert((G.ball.vx * (p.x - d.x) + G.ball.vy * (p.y - d.y)) > 0, 'poke travels away from stealer');
      assert.equal(G.ball.lastTouch, d.id);
      assert.equal(G.ball.noPick, K.stlPokeNP);
      assert.equal(p.stun, Math.max(0, K.stlPokeStun - K.stlPokeAg * gm._qa.agil(p)));
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
  assert.equal(gm.pokeCue().active, false, 'OOB clears cue');
  assert.equal(gm.pokeCue().prompts.length, 0, 'OOB clears prompts');
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
