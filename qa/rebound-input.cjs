const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

function fixture(five = false) {
  const listeners = {};
  const pads = [];
  let seed = 7;
  const math = Object.create(Math);
  math.random = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32;
  const ctx = vm.createContext({
    Math: math,
    navigator: { getGamepads: () => pads },
    performance: { now: () => 0 },
    setTimeout() {},
    addEventListener: (name, cb) => { listeners[name] = cb; },
  });
  ctx.window = ctx;
  for (const name of ['tune', 'render', 'input', 'roster', 'r5', 'game', 'b5', 'team5']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', name + '.js'), 'utf8'), ctx);
  }
  const { game, T5 } = ctx.PH;
  const { G } = game;
  game.seed(7);
  if (five) {
    T5.start();
    T5.T.phase = 'live';
  } else game.newGame({ mode: '2p', arch0: 'luka', arch1: 'joe' });
  const p = G.players[0], b = G.ball;
  Object.assign(G, { phase: 'live', needClear: false });
  Object.assign(p, { x: 0, y: 4.4, noGrabT: 0 });
  for (const q of G.players) {
    q.hasBall = false;
    if (q !== p) Object.assign(q, { x: 6, y: -4, off: true });
  }
  Object.assign(b, { state: 'loose', holder: -1, dead: false, wasShot: true, x: 0, y: 4.4, z: 1, vx: 0, vy: 0, vz: 0, noPick: 10 });
  const key = (code, down = true) => listeners[down ? 'keydown' : 'keyup']({ code, preventDefault() {} });
  const pad = (i, pressed) => {
    pads[0] ||= { connected: true, axes: [0, 0, 0, 0], buttons: [] };
    pads[0].buttons[i] = { pressed };
  };
  const step = () => (five ? T5 : game).tick(1 / 120);
  const claim = (stat = 'oreb') => {
    Object.assign(b, { x: p.x, y: p.y, z: p.z + 1, noPick: 0 });
    step();
    assert.equal(G.stats[p.id][stat], 1);
    assert(p.hasBall);
  };
  return { G, T5, p, b, key, pad, step, claim };
}

const attempting = p => ['shot', 'fake', 'layup', 'dunk'].includes(p.action?.type);
function keepBall({ p, G, step }, frames = 150) {
  for (let i = 0; i < frames; i++) {
    step();
    assert(!attempting(p), `replayed a pre-rebound input as ${p.action?.type}`);
    assert(p.hasBall);
    assert.equal(G.stats[p.id].fga, 0);
  }
}

test('1V1 drops a second rebound tap queued while airborne', () => {
  const f = fixture();
  const { p, key, step, claim } = f;
  key('KeyJ'); step();
  assert.equal(p.action?.type, 'block');
  key('KeyJ', false); step();
  key('KeyJ'); step();
  assert.equal(p.ib?.k, 'a1');
  key('KeyJ', false);
  claim();
  keepBall(f);
});

test('1V1 gamepad rebound Y does not become a finish while still held', () => {
  const f = fixture();
  const { p, pad, step, claim } = f;
  pad(3, true); step();
  assert.equal(p.action?.type, 'block');
  claim();
  step();
  assert.equal(p.ib?.k, undefined);
  keepBall(f);
  pad(3, false); step();
  pad(2, true); step();
  assert.equal(p.action?.type, 'shot');
});

test('1V1 defense X does not become a shot when possession flips', () => {
  const f = fixture();
  const { G, p, pad, step, claim } = f;
  G.off = 1;
  pad(2, true); step();
  claim('dreb');
  keepBall(f);
  pad(2, false); step();
  pad(2, true); step();
  assert.equal(p.action?.type, 'shot');
});

test('5V5 does not shoot from a held loose-ball key after switching control', () => {
  const f = fixture(true);
  const { T5, p, key, step, claim } = f;
  assert.notEqual(T5.T.ctl, p);
  key('KeyJ'); step();
  claim();
  assert.equal(T5.T.ctl, p);
  keepBall(f);
  key('KeyJ', false); step();
  key('KeyJ'); step();
  assert.equal(p.action?.type, 'shot');
});

test('1V1 still buffers a fresh shot pressed during rebound recovery', () => {
  const f = fixture();
  const { p, key, step, claim } = f;
  key('KeyJ'); step();
  claim();
  key('KeyJ', false); step();
  key('KeyJ'); step();
  assert.equal(p.ib?.k, 'a1');
  assert(p.ib.hb, 'the tap was made after the rebound');
  for (let i = 0; i < 150 && !attempting(p); i++) step();
  assert.equal(p.action?.type, 'shot');
});

test('5V5 still buffers catch-and-shoot on an incoming pass', () => {
  const { T5, p, b, key, step } = fixture(true);
  const passer = T5.T.ctl;
  Object.assign(passer, { off: false, hasBall: true, x: 0, y: 2, face: Math.PI / 2 });
  Object.assign(b, { state: 'held', holder: passer.id, x: passer.x, y: passer.y, wasShot: false });
  assert(T5.doPass(passer, p, 'chest'));
  step();
  key('KeyJ'); step();
  assert(p.ib?.wc);
  for (let i = 0; i < 150 && !attempting(p); i++) step();
  assert(p.hasBall);
  assert.equal(p.action?.type, 'shot');
});
