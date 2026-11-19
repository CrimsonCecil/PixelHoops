const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const dt = 1 / 120;

function fixture(hnd, badges, mode) {
  const ctx = vm.createContext({ console, performance: { now: () => 0 }, setTimeout() {}, clearTimeout() {} });
  ctx.window = ctx;
  ctx.PH = { input: { endTick() {}, read: () => ({}) } };
  for (const name of ['render', 'tune', 'roster', 'game']) {
    let source = fs.readFileSync(path.join(root, 'js', name + '.js'), 'utf8');
    if (name === 'game') source = source.replace('PH.game = {', 'PH.cancelQA = { updatePlayer }; PH.game = {');
    vm.runInContext(source, ctx, { filename: name + '.js' });
  }
  const gm = ctx.PH.game;
  gm.seed(7);
  gm.newGame({ mode: '2p', arch0: 'lebron', arch1: 'gobert', target: 9999 });
  gm.G.phase = 'live'; gm.G.needClear = false; gm.G.mode = mode;
  const [pl, df] = gm.G.players;
  Object.assign(pl, { x: 0, y: 5, vx: 4, vy: 0, speed: 4, face: Math.PI / 2, hasBall: true });
  Object.assign(pl.r, { hnd, badges });
  pl.arch = { ...pl.arch, key: 'qa' };
  df.off = true;
  return { ctx, gm, pl };
}

function run(label, hnd, badges, kind, eligible, options = {}) {
  const { ctx, gm, pl } = fixture(hnd, badges, options.mode || '2p');
  if (options.key === 'a2') pl.y = 10;
  const input = { mx: 0, my: 0, dx: 0, dy: 0, a1: false, a2: false, a3: false };
  const moveInput = { ...input, dx: kind === 'cross' ? 1 : 0, dy: kind === 'stepback' ? -1 : 0 };
  gm._dbg.startMove(pl, moveInput, kind === 'hesi' ? 'hesi' : 'qa');
  const move = pl.action;
  assert.equal(move.kind, kind);
  if (options.slow) move.T = 0.9;
  if (options.mvx) move.mv = options.mvx;
  const tick = inp => { gm.G.time += dt; ctx.PH.cancelQA.updatePlayer(pl, inp, dt); };
  while (move.t < move.T * (options.at ?? 0.1)) tick(input);
  const pressAt = move.t, time = gm.G.time, pos = [pl.x, pl.y];
  const key = options.key || 'a1';
  tick({ ...input, [key]: true });
  for (let i = 0; i < 240 && pl.action === move; i++) tick({ ...input, [key]: true });
  if (!pl.action) tick({ ...input, [key]: true });
  assert(pl.action && pl.action !== move, 'buffered action must fire');
  const elapsed = gm.G.time - time, cut = move.t < move.T;
  if (eligible) {
    assert(elapsed <= 2 * dt + 1e-9);
    assert.equal(pl.action.v, kind === 'stepback' ? 'stepback' : 'pullup');
    assert(cut);
    assert(Math.hypot(pl.x - pos[0], pl.y - pos[1]) < 1e-9, 'cancel drift');
  } else if (key === 'a1') {
    assert(elapsed >= move.T - pressAt - 1e-9);
    assert(!cut);
  } else {
    assert(cut, 'a2/a3 retain early cancel window');
    assert(elapsed >= move.T * move.cw - pressAt - 1e-9);
  }
  console.log(`${label} ${kind}: press=${pressAt.toFixed(3)}/${move.T.toFixed(3)}s delay=${elapsed.toFixed(3)}s variant=${pl.action.v || pl.action.kind || pl.action.type} cut=${cut}`);
}

for (const kind of ['hesi', 'cross']) {
  run('high handle', 0.9, [], kind, true);
  run('ankle only', 0.55, ['ankle'], kind, true);
  run('tight only', 0.55, ['tight'], kind, true);
  run('low handle', 0.55, [], kind, false);
}
run('stepper only', 0.55, ['stepper'], 'stepback', true);
run('stepper only', 0.55, ['stepper'], 'cross', false);
run('long buffer', 0.3, [], 'hesi', false, { slow: true });
run('frame zero', 0.88, [], 'hesi', true, { at: 0 });
run('5V5 shared path', 0.9, [], 'cross', true, { mode: 't5' });
for (const key of ['a2', 'a3']) run(key + ' unchanged', 0.55, [], 'cross', false, { key });
console.log('PASS pull-up cancellation, full-move buffering, frame-zero input, drift, and a2/a3 windows');

for (const cancel of [false, true]) {
  const { ctx, gm, pl } = fixture(0.9, [], '2p');
  Object.assign(pl, { y: 8, vx: 0, vy: 0, speed: 0 });
  gm.G.needClear = true; gm.G.illId = -1;
  const input = { mx: 0, my: 0, dx: 0, dy: 0, a1: true, a2: false, a3: false };
  if (cancel) gm._dbg.startMove(pl, input, 'hesi');
  gm.G.time += dt;
  ctx.PH.cancelQA.updatePlayer(pl, input, dt);
  assert.equal(pl.action.type, 'shot');
  assert.equal(gm.G.illId, pl.id, 'uncleared rebound shot must be flagged illegal');
  assert.equal(gm.G.clearPing, gm.G.time);
  console.log(`PASS uncleared rebound ${cancel ? 'cancel' : 'normal'} shot: illId=${gm.G.illId}, clearPing=${gm.G.clearPing.toFixed(3)}`);
}

{
  const { ctx, gm, pl } = fixture(0.9, [], '2p');
  const moves = new Set();
  for (let frame = 0; frame < 120; frame++) {
    gm.G.time += dt;
    ctx.PH.cancelQA.updatePlayer(pl, { mx: 0, my: 0, dx: frame === 0 ? 1 : 0, dy: 0, a1: false, a2: false, a3: frame === 0 }, dt);
    if (pl.action && pl.action.type === 'move') moves.add(pl.action);
  }
  assert.equal(moves.size, 1, 'one a3 press must not replay a second move');
  console.log(`PASS single directional a3 press: moves=${moves.size}, buffer=${pl.buf == null ? 'empty' : 'pending'}`);
}
