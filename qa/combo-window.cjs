const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ctx = vm.createContext({ performance: { now: () => 0 }, setTimeout() {}, clearTimeout() {} });
ctx.window = ctx;
ctx.PH = { input: { read: () => ({}), read5: () => ({}), endTick() {} } };
for (const name of ['tune', 'render', 'roster', 'r5', 'game', 'b5', 'team5', 'team3']) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../js', name + '.js'), 'utf8'), ctx, { filename: name + '.js' });
}
const { game: gm, TUNE: tune, T3, T5 } = ctx.PH;
const { G, t5 } = gm;
const dt = 1 / 120;

function fixture(mode, win) {
  tune.load({});
  tune.set('l1_cbWin', win);
  assert.equal(gm.K.cbWin, win, 'slider value reaches the engine');
  gm.seed(7);
  if (mode === 't3') {
    const slots = ['kyrie', 'curry', 'jokic', 'lebron', 'durant', 'giannis'].map((arch) => ({ arch, role: 'human' }));
    T3.start({ slots, target: 21, clock: 14, replay: false });
  } else if (mode === 't5') T5.start({ home: 'LAL', away: 'BOS' });
  else gm.newGame({ mode, arch0: 'kyrie', arch1: 'joe' });
  const p = G.players[0];
  Object.assign(G, { phase: 'live', needClear: false, off: 0, intro: null, tips: null });
  for (const other of G.players.slice(1)) Object.assign(other, { hasBall: false, off: true, ctrl: 'p2' });
  Object.assign(p, { hasBall: true, ctrl: 'p1', x: 0, y: mode === 't5' ? 8 : 8.5, z: 0, cd: 0, speed: 0, action: null });
  p.r.hnd = 0.99;
  Object.assign(G.ball, { state: 'held', holder: p.id, dead: false });
  const step = (inp = {}) => {
    const i = { ...t5.zeroInp(), ...inp };
    if (mode === 't3' || mode === 't5') t5.step([i], dt);
    else gm.tick(dt, (pl) => pl === p ? i : t5.zeroInp());
  };
  return { p, step };
}

function buffer(mode, win, lead) {
  const { p, step } = fixture(mode, win);
  step({ mx: 1, a3: true });
  const first = p.action;
  assert.equal(first?.type, 'move', mode + ' starts first move');
  step();
  while (first.t < first.T * first.cw - lead) step();
  step({ my: 1, a3: true });
  assert.equal(p.buf?.a3, true, mode + ' buffered dribble input');
  for (let i = 0; p.action === first && i < 90; i++) step();
  assert.equal(p.action?.type, 'move', mode + ' still plays the buffered move');
  assert.notEqual(p.action, first);
  assert.notEqual(p.action.kind, first.kind, mode + ' uses two different moves');
  return p;
}

for (const mode of ['cpu', '2p', 'train', 't3', 't5']) {
  for (const [win, lead, expected] of [[0.05, 0.12, false], [0.35, 0.12, true], [0.05, 0.03, true]]) {
    const p = buffer(mode, win, lead);
    assert.equal(p.dribbleCombo.count, expected ? 2 : 1, `${mode}: HUD window=${win}, lead=${lead}`);
    assert.equal(p.combo, expected ? 2 : 1, mode + ' gameplay combo');
    assert.equal(p.dcn, expected ? 1 : 0, mode + ' chain stages');
  }
  console.log('PASS ' + mode + ': early buffered input obeys the slider; close inputs still chain');
}

for (const win of [0.05, 0.35]) {
  const { p, step } = fixture('2p', win);
  step({ mx: 1, a3: true });
  for (let i = 0; p.action && i < 180; i++) step();
  assert.equal(p.action, null, 'move finishes naturally');
  for (let i = 0; i < 15; i++) step();
  assert.equal(p.dribbleCombo.count, win === 0.05 ? 0 : 1, 'idle chain expiry');
  step({ my: 1, a3: true });
  assert.equal(p.action?.type, 'move');
  assert.equal(p.combo, win === 0.05 ? 1 : 2, 'post-move input obeys the slider');
}
console.log('PASS natural move completion: idle chain expiry and late inputs obey the slider');

{
  const { p, step } = fixture('2p', 0.05);
  step({ mx: 1, a3: true });
  for (let i = 0; p.action && i < 180; i++) step();
  assert.equal(p.action, null);
  p.cd = 0.12;
  step({ my: 1, a3: true });
  assert.equal(p.ib?.k, 'a3', 'a timely input can still need to wait for recovery');
  for (let i = 0; !p.action && i < 30; i++) step();
  assert.equal(p.action?.type, 'move');
  assert.equal(p.combo, 2, 'timely input stays linked even if recovery delays execution');
}
console.log('PASS recovery buffer preserves the original input time');

for (const [win, delay, expected] of [[0.05, 10, null], [0.35, 10, 'dbl'], [0.05, 2, 'dbl']]) {
  const { p, step } = fixture('2p', win);
  step({ mx: 1 });
  for (let i = 1; i < delay; i++) step({ mx: 1 });
  step({ mx: -1 });
  step({ mx: 1, a3: true });
  assert.equal(p.action?.type, 'move');
  assert.equal(p.action.cb, expected, 'direction sequence obeys the slider');
}
console.log('PASS direction sequences obey the slider; fast gestures still trigger special combos');
