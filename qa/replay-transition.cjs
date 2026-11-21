const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ctx = vm.createContext({ performance: { now: () => 0 }, setTimeout() {} });
ctx.window = ctx;
ctx.document = { createElement: () => ({ getContext: () => ({ createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }) }) }) };
ctx.PH = { input: { read5: () => ({}), endTick() {} } };
vm.runInContext('let seed = 7; Math.random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296)', ctx);
for (const name of ['tune', 'ptype', 'render', 'roster', 'measurements', 'r5', 'r2k', 'game', 'b5', 'team5', 'render5']) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../js', name + '.js'), 'utf8'), ctx, { filename: name + '.js' });
}
const { game, T5, render5 } = ctx.PH, G = game.G, R = render5.rpl, dt = 1 / 60;
game.seed(7);
T5.start({ home: 'BOS', away: 'DEN', qlen: 300, human: -1 });
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
for (let i = 0; i < 30 && !R.view; i++) tick();
assert(R.view);
assert.equal(game.replayFlow.cover(R), 1, 'the entry cut is obscured');
for (let i = 0; i < 420 && !R.wipeOut; i++) tick();
assert(R.on && R.view && R.wipeOut > 0, 'natural completion starts the exit wipe');
for (let i = 0; i < 30 && R.view; i++) tick();
assert.equal(R.view, null);
assert.equal(game.replayFlow.cover(R), 1, 'the return cut is obscured');
for (let i = 0; i < 30 && R.on; i++) tick();
assert.equal(R.on, false);
assert.equal(G.time, matchTime, 'play does not advance during either wipe');
tick();
assert(G.time > matchTime, 'the match resumes after the wipe');
console.log('PASS: 5V5 contact replay waits after the make and wipes in and out on natural completion.');

const main = fs.readFileSync(path.join(__dirname, '../js/main.js'), 'utf8');
const wipeSelector = main.slice(main.indexOf('  const wipeStyles ='), main.indexOf('  function draw(dt)'));
const pixels = { childElementCount: 0, appendChild() { this.childElementCount++; } };
const replayWipe = { dataset: {}, querySelector: () => pixels };
const styles = vm.runInNewContext(wipeSelector + `
  Array.from({ length: 12 }, () => { pickWipeStyle(); return replayWipe.dataset.style; });
`, {
  replayWipe,
  Math: { random: () => 0 },
  document: { createElement: () => ({ style: { setProperty() {} } }) },
});
for (let i = 0; i < styles.length; i += 4) {
  assert.deepEqual(Array.from(styles.slice(i, i + 4)).sort(), ['blinds', 'diagonal', 'pixels', 'shutters']);
  assert.notEqual(styles[i], styles[i - 1], 'do not immediately repeat a wipe across shuffle boundaries');
}
assert.equal(pixels.childElementCount, 96, 'build the pixel grid once');
console.log('PASS: each shuffle shows every replay wipe without adjacent repeats.');
