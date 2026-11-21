const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ctx = vm.createContext({ console, performance: { now: () => 0 }, setTimeout() {} });
ctx.window = ctx;
for (const name of ['tune', 'ptype', 'render', 'roster', 'measurements', 'r5', 'game']) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../js', name + '.js'), 'utf8'), ctx);
}
const { game, render, TUNE } = ctx.PH;
game.newGame({ mode: 'train', arch0: 'dmitchell', arch1: 'herb' });
const G = game.G, p = G.players[0], frame = { time: 0, scene: G.players, view: 'test' };
let captures = 0;
const capture = () => { captures++; return { image: {}, s: 30, dx: -20, dy: -60 }; };
const sample = () => {
  const before = JSON.stringify(G);
  const result = render.sprintTrail(p, frame, capture);
  assert.equal(JSON.stringify(G), before, 'render history never changes game state or RNG');
  assert(result.length <= game.K.fxTrailCount);
  return result;
};
for (const name of ['Alpha', 'Count', 'Spacing']) {
  const meta = TUNE.meta('l1_fxTrail' + name);
  assert.equal(meta.cat, 'pace'); assert.equal(meta.sub, '特效');
}
for (const hasBall of [true, false]) {
  frame.scene = {};
  Object.assign(p, { hasBall, anim: 'run', speed: 2.8, sprW: 0, x: 0, y: 6 });
  for (let i = 0; i < 30; i++) { frame.time += 1 / 60; p.x += 0.04; assert.equal(sample().length, 0); }
  Object.assign(p, { speed: 7, sprW: 1 });
  let trail;
  for (let i = 0; i < 30; i++) { frame.time += 1 / 60; p.x += 7 / 60; trail = sample(); }
  assert.equal(trail.length, 3);
  assert(trail.every(g => g.x < p.x && g.a > 0 && g.a <= game.K.fxTrailAlpha));
  assert(trail[0].a < trail[1].a && trail[1].a < trail[2].a, 'older copies fade');
  const before = captures; sample(); assert.equal(captures, before, 'paused/repeated render does not resample');
  TUNE.set('l1_fxTrailAlpha', 0); assert.equal(sample().length, 0); TUNE.reset('l1_fxTrailAlpha');
  TUNE.set('l1_fxTrailCount', 0); assert.equal(sample().length, 0); TUNE.reset('l1_fxTrailCount');
  for (let i = 0; i < 30; i++) { frame.time += 1 / 60; p.x += 7 / 60; sample(); }
  frame.time -= 1; assert.equal(sample().length, 0, 'rewind clears history');
  frame.time += 1 / 60; p.x += 5; assert.equal(sample().length, 0, 'teleport clears history');
  frame.scene = {}; assert.equal(sample().length, 0, 'new game clears history');
  frame.view = 'other camera'; assert.equal(sample().length, 0, 'camera switch clears history');
  assert.equal(render.sprintTrail(p, null, capture).length, 0, 'replay/portrait/ghost opt out');
  console.log(`PASS ${hasBall ? 'with' : 'without'} ball: empty jog, three fading sprint copies behind path, disable/reset, no game-state changes`);
}
assert(captures < 80, 'samples reused rather than captured for every copy/frame');
console.log('PASS fx metadata, bounded sampling, repeated-frame reuse; render-only history never enters simulation state');
