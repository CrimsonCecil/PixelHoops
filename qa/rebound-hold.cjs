const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function fixture(mode) {
  const listeners = {}, pads = [];
  const ctx = vm.createContext({ navigator: { getGamepads: () => pads }, performance: { now: () => 0 },
    setTimeout() {}, addEventListener: (name, cb) => { listeners[name] = cb; } });
  ctx.window = ctx;
  for (const name of ['tune', 'render', 'input', 'roster', 'r5', 'game', 'b5', 'team5', 'team3'])
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', name + '.js'), 'utf8'), ctx);
  const { game: gm, T5, T3, input } = ctx.PH;
  gm.seed(7);
  if (mode === '5V5') { T5.start(); T5.T.phase = 'live'; }
  else if (mode === '3V3') T3.start({ slots: ['luka', 'curry', 'jokic', 'lebron', 'durant', 'giannis'].map((arch, i) => ({ arch, role: i ? 'cpu' : 'human' })), local: 0, replay: false });
  else gm.newGame({ mode: '2p', arch0: 'luka', arch1: 'joe' });
  const G = gm.G, p = mode === '5V5' ? T5.T.ctl : G.players[0], b = G.ball;
  Object.assign(G, { phase: 'live', off: p.tm ?? p.id, needClear: false });
  for (const q of G.players) Object.assign(q, { hasBall: false, action: null, x: 6, y: -4, stun: 30 });
  Object.assign(p, { x: 0, y: 4.4, z: 0, vz: 0, stun: 0, cd: 0 });
  Object.assign(b, { state: 'loose', holder: -1, dead: false, wasShot: true, x: p.x, y: p.y, z: 1, noPick: 10 });
  const key = (down, code = 'KeyJ') => listeners[down ? 'keydown' : 'keyup']({ code, preventDefault() {} });
  pads[0] = { connected: true, index: 0, axes: [0, 0, 0, 0], buttons: Array.from({ length: 16 }, () => ({ pressed: false })) };
  const read = () => input.read3(p.hasBall);
  const step = () => {
    if (mode === '5V5') T5.tick(1 / 120);
    else if (mode === '3V3') { T3.tick(1 / 120, { [p.id]: read() }); input.endTick(); }
    else gm.tick(1 / 120);
  };
  const grab = () => {
    if (mode === '3V3') T3.T.inputs = { [p.id]: read() };
    if (mode === '5V5') T5.T.prev = T5.T.R = input.read5();
    gm.t5.pickup(p);
    assert.equal(G.stats[p.id].oreb, 1);
  };
  return { G, p, key, pads, step, grab };
}

for (const mode of ['1V1', '3V3', '5V5']) {
  for (const binding of ['keyboard', 'Y', 'X', 'right-stick']) {
    const { G, p, key, pads, step, grab } = fixture(mode);
    const hold = down => {
      if (binding === 'keyboard') key(down);
      else if (binding === 'right-stick') pads[0].axes[2] = down ? 1 : 0;
      else pads[0].buttons[binding === 'Y' ? 3 : 2].pressed = down;
    };
    hold(true); grab();
    for (let i = 0; i < 120; i++) {
      step();
      assert(!['shot', 'fake', 'layup', 'dunk'].includes(p.action?.type), `${mode} ${binding}: started ${p.action?.type}`);
      assert(p.hasBall, `${mode} ${binding}: lost possession`);
      assert.equal(G.stats[p.id].fga, 0);
    }
    hold(false); step();
    if (binding === 'right-stick') hold(true);
    else key(true);
    for (let i = 0; i < 60 && p.action?.type !== 'shot'; i++) step();
    assert.equal(p.action?.type, 'shot', `${mode} ${binding}: fresh press shoots`);
  }
  console.log(`PASS ${mode}: keyboard, Y/X and right-stick held through rebound for 1s; release + fresh press shoots`);
}

for (const mode of ['1V1', '3V3']) for (const binding of ['LT/Y', 'LB/Y', 'L/J', 'Q/J']) {
  const { G, p, key, pads, step, grab } = fixture(mode);
  const pad = binding.endsWith('/Y');
  const contact = down => {
    if (pad) pads[0].buttons[binding === 'LT/Y' ? 6 : 4].pressed = down;
    else key(down, binding === 'L/J' ? 'KeyL' : 'KeyQ');
  };
  const rebound = down => { if (pad) pads[0].buttons[3].pressed = down; else key(down); };
  contact(true);
  for (let i = 0; i < 12; i++) step();
  rebound(true);
  for (let i = 0; i < 12; i++) step();
  assert.equal(p.action?.type, 'block', `${binding}: rebound jump not exercised`);
  assert(p.z > 0, `${binding}: not airborne at pickup`);
  grab();
  for (let i = 0; i < 180; i++) {
    step();
    assert(!['shot', 'fake', 'layup', 'dunk'].includes(p.action?.type), `${binding}: held rebound started ${p.action?.type}`);
    assert(p.hasBall, `${binding}: lost rebound`);
    assert.equal(G.stats[p.id].fga, 0);
  }
  assert.equal(p.z, 0, `${binding}: never landed`);
  rebound(false);
  for (let i = 0; i < 36; i++) step();
  assert.equal(p.action, null, `${binding}: release replayed a pending finish`);
  rebound(true);
  for (let i = 0; i < 60 && p.action?.type !== 'shot'; i++) step();
  assert.equal(p.action?.type, 'shot', `${binding}: fresh press did not shoot with contact/post still held`);
  console.log(`PASS ${mode} ${binding}: box-out/post held through airborne rebound and landing for 1.5s; no delayed finish, release + fresh press shoots`);
}
