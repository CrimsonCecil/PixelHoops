const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const T = require('../js/tape.js');
function load() {
  const c = vm.createContext({ performance: { now: () => 0 }, setTimeout() {}, clearTimeout() {} }); c.window = c;
  const drawing = new Proxy({ createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }), createLinearGradient: () => ({ addColorStop() {} }), measureText: () => ({ width: 8 }) }, { get: (o, k) => o[k] ?? (() => {}) });
  c.document = { createElement: () => ({ getContext: () => drawing }) };
  c.PH = { input: { endTick() {}, read: () => c.PH.game.t5.zeroInp(), read5: () => ({}) } };
  for (const n of ['tape', 'tune', 'ptype', 'render', 'roster', 'measurements', 'r5', 'r2k', 'game', 'team3', 'b5', 'team5', 'render5']) vm.runInContext(fs.readFileSync(__dirname + '/../js/' + n + '.js', 'utf8'), c, { filename: n });
  c.PH.game.seed(7); return c.PH;
}
async function main() {
  const P = load(), gm = P.game, G = gm.G;
  gm.newGame({ mode: 'cpu', arch0: 'curry', arch1: 'lebron', target: 999 });
  G.players.forEach(p => p.ctrl = 'cpu'); G.vopt.replay = false;
  while (G.time < 60) gm.tick(1 / 60);
  assert(Math.abs(G.tape.frames.length - G.time * 30) < 3);
  assert.equal(P.TAPE.finish().meta.dur, G.tape.frames.at(-1).t - G.tape.frames[0].t);
  assert(G.tape.frames.every(f => f.s.score && f.s.phase && 'gclock' in f.s && !('parts' in f)));
  const saved = G.tape, len = saved.frames.length;
  G.hlQ = { t: G.time - 1, pid: 0, k: 'fall' }; G.vopt.replay = true; G.phase = 'dead'; G.phaseT = 0.5;
  gm.t5.trackReplay(); assert(G.replay, 'real highlight starts');
  const before = G.tape.frames.length;
  for (let i = 0; i < 30; i++) gm.tick(1 / 60);
  assert.equal(G.tape.frames.length, before); assert.equal(G.tape, saved);
  G.rec = []; assert(G.tape.frames.length >= len);
  assert.deepEqual(await T.decode(await T.encode(G.tape)), JSON.parse(JSON.stringify(T.quantize(G.tape))));
  gm.newGame({ mode: '2p' }); assert.notEqual(G.tape, saved); assert.equal(G.tape.frames.length, 0);
  G.hlQ = { t: -1, pid: 0, k: 'fall' }; G.phase = 'dead'; G.phaseT = 0.5;
  gm.tick(1 / 60, () => gm.t5.zeroInp());
  assert.equal(G.replay, null, 'network-style humanInput records without starting host-only highlights');
  assert.equal(G.tape.frames.length, 1);
  for (let i = 0; i < 120; i++) gm.tick(1 / 60); assert(G.tape.frames.length > 40);
  gm.newGame({ mode: 'train' }); for (let i = 0; i < 120; i++) gm.tick(1 / 60); assert(G.tape.frames.length > 40);
  G.time = 1200; gm.tick(1 / 60); assert(G.tape.meta.truncated);
  gm.newGame({ mode: 'demo' }); gm.tick(1 / 60); assert.equal(G.tape, null);
  console.log('PASS 60s CPU ~30fps, match state, real highlight isolation, codec, reset, 2p/train/demo, 20min cap');
  P.T3.start({ slots: ['curry', 'edwards', 'jokic', 'lebron', 'durant', 'giannis'].map(arch => ({ arch, role: 'cpu' })), replay: false, target: 999 });
  for (let i = 0; i < 600; i++) P.T3.tick(1 / 60);
  assert(G.tape.frames.length > 200); assert.equal(G.tape.frames[0].p.length, 6); assert.equal(G.tape.meta.mode, 't3');
  console.log('PASS 3V3 records with highlights disabled, six players, fresh tape');
  P.T5.start({ home: 'BOS', away: 'DEN', human: -1 });
  for (let i = 0; i < 600; i++) P.T5.tick(1 / 60);
  assert(G.tape.frames.length > 100 && G.tape.frames.length <= 150); assert.equal(G.tape.frames[0].p.length, 10); assert.equal(G.tape.frames[0].s.q, 1);
  assert.deepEqual(await T.decode(await T.encode(G.tape)), JSON.parse(JSON.stringify(T.quantize(G.tape))));
  console.log('PASS 5V5 ~15fps, ten players, quarter/state and codec');
}
main().catch(e => { console.error(e); process.exitCode = 1; });
