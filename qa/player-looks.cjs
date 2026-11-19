const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ctx = vm.createContext({ console, performance: { now: () => 0 } });
ctx.window = ctx;
const noop = () => {};
const canvas = () => {
  const c = new Proxy({ createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }), measureText: () => ({ width: 8 }) }, {
    get: (obj, key) => obj[key] ?? noop,
  });
  return { getContext: () => c };
};
ctx.document = { createElement: canvas };
for (const name of ['tune', 'render', 'roster', 'measurements', 'r5', 'game', 'b5', 'team5']) {
  const file = path.resolve(__dirname, '../js', name + '.js');
  vm.runInContext(fs.readFileSync(file, 'utf8'), ctx, { filename: file });
}

const { game, render, rig, measurements, T5 } = ctx.PH;
render.init(canvas());
assert.deepEqual(Object.keys(measurements).sort(), Array.from(game.ROSTER).sort());
for (const key of game.ROSTER) {
  const p = game.t5.makePlayer(0, key, 'cpu');
  const m = measurements[key], body = p.col.body;
  assert.equal(body.height, m[0] * 0.0254);
  assert(body.height > 1.7 && body.height < 2.35 && m[1] > 150 && m[1] <= 325, key);
  if (!m[2]) assert.equal(body.arm, p.col.wing, key);
  for (const value of Object.values(body)) assert(Number.isFinite(value), key);
  const live = rig(p);
  const painted = render.drawPlayer(p);
  assert(Object.values(painted.k).flat().every(Number.isFinite), key);
  const legacy = { ...p, col: { ...p.col, body: undefined } };
  assert.deepEqual(live, rig(legacy), key);
  const held = render.drawPlayer({ ...p, hasBall: true });
  assert.deepEqual(Array.from(held.k.handL), Array.from(live.handL), key);
  assert.deepEqual(Array.from(held.k.handR), Array.from(live.handR), key);
}
const look = (key) => game.lookOf(game.ARCH[key]);
const curry = look('curry'), lebron = look('lebron');
assert(curry.mouthguard && lebron.band && lebron.beard === 'boxed');
assert(lebron.body.shoulder > curry.body.shoulder && lebron.body.limb > curry.body.limb);
assert(look('wemby').body.legs > look('zion').body.legs);
assert(look('wemby').body.arm > curry.body.arm);
assert(look('zion').body.chest > look('wemby').body.chest);
assert(look('kawhi').body.hand > curry.body.hand);
assert(look('harden').beard === 'long' && look('kawhi').style === 'braids');
console.log('PASS every rostered player renders; 302 measured-height profiles, signature looks, original gameplay rig and held-ball wrist anchors');

game.newGame({ mode: 'train', arch0: 'luka', arch1: 'curry' });
for (const p of game.G.players) {
  const base = p.h, listed = p.col.body.height;
  assert.notEqual(base, listed);
  const heightScale = h => 1 + (h / 1.95 - 1) * 1.55;
  const headZ = () => render.drawPlayer(p).k.head[2];
  const initial = headZ();
  for (const h of [1.7, 2.25]) {
    p.h = h;
    assert(Math.abs(headZ() / initial - heightScale(h) / heightScale(listed)) < 1e-9, p.arch.key);
  }
  p.h = base;
  assert.equal(headZ(), initial, p.arch.key);
}
console.log('PASS training player and dummy resize with height overrides and restore their listed visuals at default');

T5.start({ home: 'LAL', away: 'GSW', human: -1 });
assert.equal(game.G.players.length, 10);
for (const p of game.G.players) {
  assert.equal(p.col.body.height, measurements[p.arch.key][0] * 0.0254);
  render.drawPlayer(p);
}
console.log('PASS 5V5 starters share the measured appearance profiles');
