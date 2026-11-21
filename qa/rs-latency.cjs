const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function fixture(mode) {
  const pad = { connected: true, index: 0, axes: [0, 0, 0, 0], buttons: Array.from({ length: 16 }, () => ({ pressed: false })) };
  const ctx = vm.createContext({ navigator: { getGamepads: () => [pad] }, performance: { now: () => 0 }, setTimeout() {}, addEventListener() {} });
  ctx.window = ctx;
  for (const name of ['tune', 'render', 'input', 'roster', 'r5', 'game', 'b5', 'team5', 'team3'])
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../js', name + '.js'), 'utf8'), ctx, { filename: name + '.js' });
  const { game: gm, T3, T5, TUNE: tune, input } = ctx.PH;
  gm.seed(7);
  if (mode === '3V3') T3.start({ slots: ['curry', 'lebron', 'giannis', 'joe', 'kobe', 'shaq'].map((arch, i) => ({ arch, role: i ? 'cpu' : 'human' })), local: 0, replay: false });
  else if (mode === '5V5') T5.start({ home: 'GSW', away: 'BOS', human: 0 });
  else gm.newGame({ mode: 'cpu', arch0: 'curry', arch1: 'joe' });
  const G = gm.G, p = mode === '5V5' ? T5.T.ctl : G.players[0];
  Object.assign(G, { phase: 'live', intro: null, needClear: false, off: p.tm ?? p.id });
  for (const other of G.players) Object.assign(other, { hasBall: false, x: 6, y: 2, stun: 30 });
  Object.assign(p, { x: 0, y: ctx.PH.render.HOOP.y - 6, hasBall: true, action: null, stun: 0, cd: 0, stam: 100, z: 0, vz: 0, vx: 0, vy: 0, speed: 0 });
  Object.assign(G.ball, { state: 'held', holder: p.id, dead: false, wasShot: false });
  if (mode === '5V5') Object.assign(T5.T, { phase: 'live', off: p.tm });
  const push = (x = 1, y = 0) => { pad.axes[2] = x; pad.axes[3] = -y; };
  const step = () => {
    if (mode === '3V3') { T3.tick(1 / 60, { 0: input.read3(true) }); input.endTick(); }
    else (mode === '5V5' ? T5 : gm).tick(1 / 60);
  };
  const early = () => {
    push(); step();
    const first = p.action;
    assert.equal(first?.type, 'move');
    push(0, 0); step();
    while (first.t < first.T * 0.1) step();
    return first;
  };
  return { p, gm, tune, pad, push, step, early };
}

for (const mode of ['1V1', '3V3', '5V5']) {
  {
    const f = fixture(mode);
    f.push(0.49); f.step(); assert.equal(f.p.action, null);
    f.push(0.5); f.step(); assert.equal(f.p.action?.type, 'move', '0.5 tilt starts on push frame');
    const first = f.p.action;
    f.push(0, 0);
    for (let i = 0; f.p.action === first && i < 120; i++) f.step();
    assert.equal(f.p.action, null);
    assert(f.p.cd > 1 / 60, 'fixture retains more than a tick of recovery');
    Object.assign(f.p, { vx: 0, vy: 0, speed: 0 });
    f.push(-1); f.step(); assert.equal(f.p.action?.type, 'move', 'RS bypasses residual cooldown');
    console.log(`PASS ${mode}: 0.49 stays neutral; 0.5 starts on push frame; post-move cooldown cannot delay fresh RS`);
  }
  for (const cancel of [0, 0.3, 1]) {
    const f = fixture(mode);
    f.tune.set('l1_rsCancel', cancel);
    assert.equal(f.gm.K.rsCancel, cancel);
    const first = f.early();
    f.push(-1); f.step();
    if (cancel === 0) assert.notEqual(f.p.action, first, 'early RS cancels on push frame');
    else {
      assert.equal(f.p.action, first);
      assert.equal(f.p.buf?.rs, true);
      const threshold = first.T * Math.min(cancel, first.cw);
      f.push(0, 0);
      let elapsed;
      for (let i = 0; f.p.action === first && i < 120; i++) { elapsed = first.t; f.step(); }
      assert.notEqual(f.p.action, first);
      assert(elapsed >= threshold && elapsed < threshold + 1 / 60 + 1e-9, 'RS obeys configured progress / original cw');
    }
    assert.equal(f.p.action?.type, 'move');
  }
  {
    const f = fixture(mode);
    f.push(); f.step(); const first = f.p.action;
    f.step(); assert.equal(f.p.action, first, 'held direction is not another push');
    f.push(1, 0.1); f.step(); assert.equal(f.p.action, first, 'same direction sector does not restart');
    f.push(-1); f.step();
    assert.notEqual(f.p.action, first, 'new direction works without a neutral frame');
    const next = f.p.action;
    f.step(); assert.equal(f.p.action, next);
    for (let i = 0; f.p.action === next && i < 30; i++) f.step();
    assert.equal(f.p.action?.type, 'shot', 'hold still converts the new move');
    console.log(`PASS ${mode}: early 10% RS cancel; l1_rsCancel=0/0.3/1; direction-change push; no held-stick replay; hold converts to shot`);
  }
  {
    const f = fixture(mode), first = f.early();
    if (mode === '5V5') f.gm.t5.step(f.gm.G.players.map(p => ({ ...f.gm.t5.zeroInp(), ...(p === f.p ? { mx: -1, a3: true, dribble: true } : {}) })), 1 / 60);
    else { f.pad.buttons[1].pressed = true; f.pad.axes[0] = -1; f.step(); }
    assert.equal(f.p.action, first, 'B still waits for the original combo window');
    assert(!f.p.buf.rs);
  }
  for (const state of ['rebound', 'stun', 'empty', 'noBall']) {
    const f = fixture(mode);
    if (state === 'rebound') f.p.reboundRS = true;
    if (state === 'stun') f.p.stun = 1;
    if (state === 'empty') f.p.stam = 0;
    if (state === 'noBall') { f.p.hasBall = false; f.gm.G.ball.state = 'loose'; f.gm.G.ball.holder = -1; f.gm.G.ball.x = 6; f.gm.G.ball.y = 2; }
    f.push(); f.step(); assert.equal(f.p.action, null, state + ' cannot start RS dribble');
    if (state === 'rebound') {
      f.push(0, 0); f.step(); f.push(); f.step(); assert.equal(f.p.action?.type, 'move');
    }
  }
  console.log(`PASS ${mode}: non-RS retains combo window; rebound-neutral, stun, stamina and possession guards preserved`);
}
