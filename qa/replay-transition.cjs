const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const motion = { matches: false };
const ctx = vm.createContext({ performance: { now: () => 0 }, setTimeout() {}, matchMedia: () => motion });
ctx.window = ctx;
const canvas = () => {
  const drawing = new Proxy({
    createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }),
    createLinearGradient: () => ({ addColorStop() {} }),
    measureText: () => ({ width: 8 }),
  }, { get: (obj, key) => obj[key] ?? (() => {}) });
  return { getContext: () => drawing };
};
ctx.document = { createElement: canvas };
ctx.PH = { input: { read5: () => ({}), endTick() {} } };
vm.runInContext('let seed = 7; Math.random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296)', ctx);
for (const name of ['tune', 'ptype', 'render', 'roster', 'measurements', 'r5', 'r2k', 'game', 'b5', 'team5', 'render5']) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../js', name + '.js'), 'utf8'), ctx, { filename: name + '.js' });
}
const { game, T5, render, render5 } = ctx.PH, G = game.G, R = render5.rpl, dt = 1 / 60;
render.init(canvas());
game.seed(7);
T5.start({ home: 'BOS', away: 'DEN', qlen: 300, human: -1 });
T5.setCam({ preset: '2k' });
function tick() {
  R.rT = G.time;
  T5.tick(dt);
}
for (let i = 0; i < 60 * 5; i++) tick();
const attacker = G.players.find(p => p.tm === G.off && !p.off);
const defender = G.players.find(p => p.tm !== G.off && !p.off);
G.thruMk = { t: G.time, x: attacker.x, y: attacker.y, off: G.off, pid: attacker.id, did: defender.id, k: 'fall' };
for (let i = 0; i < 12; i++) tick();
game.t5.scoreBy(attacker.id, 2, 'dunk');
for (let i = 0; i < 180 && !R.on; i++) tick();
assert(R.on, 'a made basket after a recorded contact triggers the 5V5 replay');
assert(G.time - G.lastMakeAt >= game.replayFlow.makeBeat, 'the contact replay waits for the make, not just the contact');
assert.equal(R.view, null);
const matchTime = G.time;
for (let i = 0; i < 17; i++) tick();
assert.equal(R.view, null, 'the slower wipe has not reached the scene cut after 17 frames');
for (let i = 0; i < 30 && !R.view; i++) tick();
assert(R.view);
assert.equal(game.replayFlow.cover(R), 1, 'the entry cut is obscured');
while (R.rt < R.t1 && R.age < 7) tick();
assert(R.view && R.rt >= R.t1, 'reach the last replay frame naturally');
render5.render(T5.T, dt);
const from = { ...render5.k2.pose };
tick();
assert(R.on && R.returnT === 0, 'natural completion starts the camera return');
assert.equal(R.view, null);
assert.equal(game.replayFlow.cover(R), 0, 'the camera return is not obscured');
render5.render(T5.T, dt);
assert.deepEqual({ ...render5.k2.pose }, from, 'keep the same displayed camera at the handoff');
for (let i = 0; i < 20; i++) tick();
render5.render(T5.T, dt);
const mid = { ...render5.k2.pose };
for (let i = 0; i < 24 && R.on; i++) tick();
assert.equal(R.on, false);
render5.render(T5.T, dt);
const to = render5.k2.pose;
assert(from.F > mid.F && mid.F > to.F, 'the 2K camera pulls back continuously');
assert.equal(G.time, matchTime, 'play does not advance during either wipe');
tick();
assert(G.time > matchTime, 'the match resumes after the wipe');
console.log('PASS: 5V5 contact replay has a slower wipe in and an unobscured zoom-out at natural completion.');

const flow = game.replayFlow;
assert.equal(flow.foulProgress({ t: 0.15 }), 1, 'ordinary notices do not start a wipe');
assert.equal(flow.wipeCover(flow.foulProgress({ t: 0.4, foul: true })), 1, 'hold the foul label at full cover');
assert.equal(flow.foulProgress({ t: 0.81, foul: true }), 1, 'wipe ends before the next check-ball pass is caught');
motion.matches = true;
assert.equal(flow.foulProgress({ t: 0.3, foul: true }), 1, 'reduced motion uses the normal foul banner without a wipe');
const reduced = { wipeIn: 1, view: {} };
assert.equal(game.replayFlow.advance(reduced, dt, true), 'done');
assert.equal(reduced.view, null);
assert.equal(game.replayFlow.cover(reduced), 0);
console.log('PASS: reduced motion resumes immediately without a camera move.');
