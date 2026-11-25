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

// 右摇杆一推只出一招：回差、回弹过滤、推杆走弧线不算换向
function run(mode, frames, total = 150) {
  const f = fixture(mode), seen = [];
  let last = null;
  for (let i = 0; i < total; i++) {
    const v = frames[i] || [0, 0];
    f.push(v[0], v[1]); f.step();
    const a = f.p.action;
    if (a && a !== last) seen.push(a);
    last = a;
  }
  return seen;
}
const rep = (n, v) => Array.from({ length: n }, () => v);
const ONE = {
  'clean flick': [[0.4, 0], ...rep(6, [1, 0]), [0.3, 0]],
  'snap-back past centre': [[0.4, 0], ...rep(6, [1, 0]), [0.2, 0], [-0.6, 0], [-0.2, 0]],
  'snap-back for two frames': [[0.4, 0], ...rep(6, [1, 0]), [0.2, 0], [-0.7, 0], [-0.55, 0], [0.1, 0]],
  'jitter around the threshold': [[0.52, 0], [0.47, 0], [0.53, 0], [0.48, 0], [0.9, 0], [1, 0], [0.3, 0]],
  'jitter on release': [[0.4, 0], ...rep(6, [1, 0]), [0.45, 0], [0.52, 0], [0.2, 0]],
  'arc on the way out': [[0.1, 0.55], [0.5, 0.6], ...rep(6, [1, 0]), [0.3, 0]],
  'slide at full tilt for one frame': [[0.6, 0], [1, 0], [0.8, -0.6], [0.6, -0.8], [0.2, -0.3]],
  'slide on release': [...rep(5, [1, 0]), [0.5, -0.5], [0.1, -0.6], [0, -0.2]],
};
const TWO = {
  'deliberate opposite flick right after release': [...rep(4, [1, 0]), [0, 0], [0, 0], ...rep(8, [-1, 0])],
  'deliberate opposite flick without neutral': [...rep(4, [1, 0]), ...rep(8, [-1, 0])],
  'deliberate quarter turn at full tilt': [...rep(8, [1, 0]), ...rep(6, [0, -1])],
  'same direction twice': [...rep(4, [1, 0]), ...rep(3, [0, 0]), ...rep(4, [1, 0])],
};
for (const mode of ['1V1', '3V3', '5V5']) {
  for (const k in ONE) assert.equal(run(mode, ONE[k]).length, 1, mode + ' ' + k + ': one move');
  for (const k in TWO) { const n = run(mode, TWO[k], 40).length; assert(n >= 2, mode + ' ' + k + ': second move still comes out, got ' + n); }
  {
    const f = fixture(mode);
    f.tune.set('l1_rsSnap', 0); f.tune.set('l1_rsSettle', 0);
    assert.equal(f.gm.K.rsSnap, 0); assert.equal(f.gm.K.rsSettle, 0);
  }
  console.log('PASS ' + mode + ': noisy single pushes give one move; deliberate second pushes still chain; filters tunable');
}
