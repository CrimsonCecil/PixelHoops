const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function fixture(hand = 1, arch0 = 'luka') {
  const listeners = {};
  const pads = [];
  const ctx = vm.createContext({
    navigator: { getGamepads: () => pads },
    performance: { now: () => 0 },
    setTimeout() {},
    addEventListener: (name, cb) => { listeners[name] = cb; },
  });
  ctx.window = ctx;
  for (const name of ['tune', 'render', 'input', 'roster', 'r5', 'game', 'b5', 'team5']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', name + '.js'), 'utf8'), ctx);
  }
  const { game, rig } = ctx.PH;
  game.seed(7);
  Object.assign(game.G.train, { role: 'off', dummy: 'stand', gap: 1.5, infStam: false });
  game.newGame({ mode: 'train', arch0, arch1: 'joe' });
  const [p, d] = game.G.players;
  const b = game.G.ball;
  Object.assign(game.G, { phase: 'live', needClear: false, off: 0 });
  Object.assign(p, { x: 0, y: 4.4, hand, handX: hand * 0.33, hasBall: true });
  Object.assign(d, { off: false, x: 0, y: 5.9, stun: 0 });
  Object.assign(b, { state: 'held', holder: 0, dead: false });
  const key = (code, down = true) => listeners[down ? 'keydown' : 'keyup']({ code, preventDefault() {} });
  const step = (n = 1) => { for (let i = 0; i < n; i++) game.tick(1 / 120); };
  return { game, p, d, b, rig, key, step, pads, team5: ctx.PH.T5 };
}

// While held, moving the stick previews a direction but never moves the handler.
{
  const { p, d, key, step } = fixture();
  const start = [p.x, p.y];
  Object.assign(p, { vy: 5, speed: 5 });
  key('KeyL'); step();
  assert.equal(p.action.kind, 'hesi');
  key('KeyA'); step(160);
  assert.equal(p.action.kind, 'hesi');
  assert.deepEqual([p.x, p.y], start);
  assert.equal(p.speed, 0);
  assert(p.hasBall);
  assert.equal(d.action, null);
  key('KeyA', false); step();
  key('KeyL', false); step(80);
  assert.equal(p.action, null);
  assert.deepEqual([p.x, p.y], start);
}

// Both arms open sideways; the ball follows the same palm, below the head.
for (const [arch, hand] of [['kyrie', 1], ['kyrie', -1], ['shaq', 1], ['shaq', -1]]) {
  const { p, b, rig, key, step } = fixture(hand, arch);
  key('KeyL'); step(80);
  const k = rig(p);
  const palm = hand > 0 ? k.handR : k.handL, offHand = hand > 0 ? k.handL : k.handR;
  const fx = Math.cos(p.face), fy = Math.sin(p.face);
  const lateral = (from, to) => fy * (to[0] - from[0]) - fx * (to[1] - from[1]);
  assert(lateral(k.shL, k.handL) < -0.28 && lateral(k.shR, k.handR) > 0.28);
  assert(k.handL[2] < k.shL[2] + 0.02 && k.handR[2] < k.shR[2] + 0.02);
  assert(b.z > k.pelvis[2] + 0.15 && b.z < k.chest[2] + 0.055 && b.z < k.head[2] - 0.24);
  assert.deepEqual([b.x, b.y], Array.from(palm.slice(0, 2)));
  assert(b.z > palm[2] && b.z - palm[2] < 0.15);
  assert(Math.hypot(b.x - offHand[0], b.y - offHand[1]) > 0.8);
}

for (const [hand, dir, kind, side, nextHand] of [
  [1, 'KeyA', 'cross', -1, -1], [-1, 'KeyD', 'cross', 1, 1],
  [1, 'KeyD', 'inout', 1, 1], [-1, 'KeyA', 'inout', -1, -1],
  [1, 'KeyS', 'stepback', 0, 1],
]) {
  const { p, key, step } = fixture(hand);
  const y = p.y;
  key('KeyL'); step(28);
  key(dir); step(12);
  assert.equal(p.action.kind, 'hesi');
  key('KeyL', false); step();
  assert.equal(p.action.kind, kind);
  assert.equal(p.hand, nextHand);
  key(dir, false); step(28);
  assert(p.hasBall);
  if (side) assert(p.x * side > 0.15);
  if (kind === 'inout') assert(p.y > y + 0.2 && p.action.hesiDrive);
  if (kind === 'stepback') assert(p.y < y - 0.2);
}

// Release before the fake reaches its peak: keep the release-frame direction.
{
  const { p, key, step } = fixture();
  key('KeyL'); step();
  key('KeyA'); key('KeyL', false); step();
  key('KeyA', false); key('KeyD'); step(22);
  assert.equal(p.action.kind, 'cross');
  assert(p.action.dx < 0);
}

// A right-stick flick does not override the left stick or keep the A button held.
{
  const { p, step, pads } = fixture();
  const gp = { connected: true, axes: [0, 0, 0, 0], buttons: Array.from({ length: 16 }, () => ({ pressed: false })) };
  pads.push(gp);
  gp.buttons[0].pressed = true; step(40);
  gp.buttons[0].pressed = false; gp.axes[0] = -0.82; gp.axes[2] = 0.9; step();
  assert.equal(p.action.kind, 'cross');
  assert(p.action.dx < 0);
}

// A neutral press buffers during another move; a quick release keeps its direction.
{
  const { p, key, step } = fixture();
  key('KeyD'); key('KeyL'); step();
  key('KeyD', false); key('KeyL', false); step();
  key('KeyL'); step();
  assert(p.buf.hesi);
  key('KeyA'); key('KeyL', false); step();
  key('KeyA', false); key('KeyD'); step(48);
  assert.equal(p.action.kind, 'cross');
  assert(p.action.dx < 0);
}

// An ordinary action cooldown also preserves the hesitation press and release.
{
  const { p, key, step } = fixture();
  p.cd = 0.12;
  key('KeyL'); step();
  key('KeyS'); key('KeyL', false); step();
  key('KeyS', false); step(36);
  assert.equal(p.action.kind, 'stepback');
}

// The post-up key and the original direction-first dribble still work.
{
  const { p, key, step } = fixture();
  key('KeyQ'); step(30);
  assert(p.post && !p.action);
  key('KeyQ', false); step();
  key('KeyD'); key('KeyL'); step();
  assert(p.action.kind !== 'hesi');
}

// A hesitation cannot unlock moves outside the handler's ratings.
for (const dir of ['KeyS', 'KeyD']) {
  const { p, key, step } = fixture(1, 'shaq');
  key('KeyL'); step(40);
  key(dir); key('KeyL', false); step();
  assert.equal(p.action.kind, 'hesi');
  assert.equal(p.action.hesiHold, null);
}

// Losing possession during the fake discards the pending branch.
{
  const { p, d, b, key, step } = fixture();
  key('KeyL'); step(40);
  p.hasBall = false; d.hasBall = true; b.holder = 1;
  key('KeyA'); key('KeyL', false); step();
  assert.equal(p.action, null);
}

// Pull-up privileges can interrupt the held fake; other players must let it finish.
for (const [arch, canCancel] of [['kyrie', true], ['shaq', false]]) {
  const { p, key, step } = fixture(1, arch);
  key('KeyL'); step(80);
  assert.equal(p.action.kind, 'hesi');
  key('KeyJ'); step();
  if (canCancel) {
    assert.equal(p.action.type, 'shot');
    assert.equal(p.action.v, 'pullup');
  } else {
    assert.equal(p.action.kind, 'hesi');
    key('KeyL', false); step(50);
    assert.equal(p.action.type, 'shot');
  }
}

// The 5V5 binding uses the dedicated hesitation key, not a pass button.
{
  const { game, key, team5 } = fixture();
  team5.start({ home: 'LAL', away: 'BOS', human: 0 });
  const T = team5.T, p = T.ctl;
  Object.assign(T, { phase: 'live', off: 0 });
  Object.assign(game.G, { phase: 'live', off: 0 });
  for (const other of game.G.players) if (other !== p) Object.assign(other, { x: -6 + other.id, y: 1, stun: 3 });
  Object.assign(p, { x: 0, y: 6.8, hand: 1, hasBall: true });
  Object.assign(game.G.ball, { state: 'held', holder: p.id, dead: false, lastTouch: p.id });
  const step = (n = 1) => { for (let i = 0; i < n; i++) team5.tick(1 / 120); };
  key('KeyW'); key('KeyH'); step(40);
  assert.equal(p.action.kind, 'hesi');
  assert.equal(p.y, 6.8);
  assert.equal(T.cnt.passes, 0);
  key('KeyW', false); key('KeyA'); key('KeyH', false); step();
  assert.equal(p.action.kind, 'cross');
  key('KeyA', false); key('KeyW'); key('KeyH'); step(75);
  assert.equal(p.action.kind, 'hesi');
  assert(p.action.hesiHold === 'hesi');
}

console.log('Hesitation: sideways one-hand fake, release directions, buffering, move requirements, post-up, possession loss, and 5V5 passed.');
