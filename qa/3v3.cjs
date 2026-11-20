const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function fixture(options = {}) {
  const ctx = vm.createContext({ performance: { now: () => 0 }, setTimeout: () => {} });
  ctx.window = ctx;
  vm.runInContext('let seed = 7; Math.random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296)', ctx);
  for (const name of ['tune', 'ptype', 'render', 'roster', 'measurements', 'r5', 'game', 'team3']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../js', name + '.js'), 'utf8'), ctx, { filename: name + '.js' });
  }
  const { game, T3 } = ctx.PH;
  game.seed(7);
  const slots = ['curry', 'edwards', 'jokic', 'lebron', 'durant', 'giannis'].map((arch, i) => ({ arch, role: options.human === i ? 'human' : 'cpu' }));
  T3.start({ slots, target: 21, clock: 14, ...options });
  return { G: game.G, Gm: game, api: game.t5, T3, run: (count, inputs) => { for (let i = 0; i < count; i++) T3.tick(1 / 60, inputs); } };
}

{
  const { G, Gm, T3, api, run } = fixture({ human: 1, target: 5 });
  assert.equal(G.players.length, 6);
  assert.equal(T3.holder().id, 1);
  assert.equal(G.phase, 'check');
  assert.equal(G.shotClock, 14);
  assert(Gm.isThree(T3.holder().x, T3.holder().y));
  run(60);
  api.scoreBy(1, 2, 'lay');
  assert.deepEqual([...G.score], [2, 0]);
  run(62);
  assert.equal(G.phase, 'check');
  assert.equal(G.off, 1);
  assert(!G.needClear && Gm.isThree(T3.holder().x, T3.holder().y));
  assert.equal(G.shotClock, 14);
  run(60);
  T3.holder().hasBall = false;
  const rebounder = G.players[1];
  Object.assign(rebounder, { x: 0, y: 11 });
  G.ball.wasShot = true;
  api.pickup(rebounder);
  assert.equal(G.stats[1].dreb, 1);
  assert.equal(G.off, 0);
  assert(G.needClear);
  run(1, { 1: { ...api.zeroInp(), a1: true } });
  assert.equal(G.illId, 1, 'Starting a shot inside the arc marks it illegal');
  api.scoreBy(1, 2, 'lay');
  assert.deepEqual([...G.score], [2, 0], 'Uncleared make does not score');
  assert.equal(G.off, 1);
  run(60);
  T3.holder().hasBall = false;
  Object.assign(rebounder, { x: 0, y: 8 });
  api.pickup(rebounder);
  assert(G.needClear, 'A live-ball turnover inside the arc also needs clearance');
  api.scoreBy(1, 2, 'dunk');
  assert.deepEqual([...G.score], [2, 0], 'Finishes without a shot-start marker must clear too');
  run(60);
  T3.holder().hasBall = false;
  Object.assign(rebounder, { x: 0, y: 8 });
  api.pickup(rebounder);
  assert(G.needClear);
  Object.assign(rebounder, { x: 0, y: 4.5 });
  run(1);
  assert(!G.needClear);
  api.scoreBy(1, 3, 'shot');
  run(62);
  assert.deepEqual([...G.score], [5, 0]);
  assert.equal(G.phase, 'over');
  assert.equal(G.winner, 0);
  T3.stop();
  console.log('PASS: six slots, checks, change of possession, illegal makes, clear arc and 2/3 point scoring.');
}

{
  const { G, T3, run } = fixture({ human: 0, clock: 3 });
  run(60);
  const before = G.shotClock;
  run(1, { 0: { pass: true, mx: -1, my: 0 } });
  assert.equal(G.ball.state, 'pass');
  run(41);
  assert.equal(T3.holder().id, 1);
  assert(G.shotClock < before, 'An offensive pass does not reset the shot clock');
  G.shotClock = 0.001; run(1);
  assert.equal(G.phase, 'check');
  assert.equal(G.off, 1);
  assert.equal(G.shotClock, 3);
  console.log('PASS: directional passing and shot-clock turnover.');
}

{
  const { G, run } = fixture();
  for (let i = 0; i < 60 * 360 && G.phase !== 'over'; i++) run(1);
  assert.equal(G.phase, 'over', 'A full CPU-only game should finish from live gameplay');
  assert(G.score[G.winner] >= 21);
  assert(G.stats.some((s) => s.fga > 0));
  console.log('PASS: CPU-only game finished ' + G.score.join('–') + ' in ' + G.time.toFixed(1) + 's of simulation.');
}
