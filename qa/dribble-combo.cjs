const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ctx = vm.createContext({ performance: { now: () => 0 }, setTimeout() {}, clearTimeout() {} });
ctx.window = ctx;
ctx.PH = { input: { read: () => ({}), read5: () => ({}), endTick() {} } };
for (const name of ['tune', 'render', 'roster', 'r5', 'game', 'b5', 'team5']) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', name + '.js'), 'utf8'), ctx);
}
const { game: gm, T5 } = ctx.PH, G = gm.G;
for (const mode of ['cpu', '2p', 'train', 't5']) {
  if (mode === 't5') T5.start({ home: 'LAL', away: 'BOS' });
  else gm.newGame({ mode, arch0: 'kyrie', arch1: 'joe' });
  const p = G.players[0];
  G.phase = 'live'; G.time = 10;
  for (const q of G.players) q.hasBall = false;
  Object.assign(p, { hasBall: true, x: 0, y: 4, action: null });
  Object.assign(G.ball, { state: 'held', holder: p.id, dead: false });
  const step = () => mode === 't5' ? gm.t5.step(G.players.map(() => ({})), 1 / 120) : gm.tick(1 / 120);
  const move = () => gm._dbg.startMove(p, { mx: 1, my: 0 }, 'cross');
  assert.equal(p.dribbleCombo, undefined);
  for (let n = 1; n <= 4; n++) { move(); assert.equal(p.dribbleCombo.count, n); G.time += 0.4; }
  assert(p.dribbleCombo.name);
  G.time += 1.6; step();
  assert.equal(p.dribbleCombo.count, 0, mode + ' timeout');
  assert.equal(p.dribbleCombo.shown, 4);
  move(); assert.equal(p.dribbleCombo.count, 1);
  G.time += 0.4; move();
  p.hasBall = false; G.ball.state = 'pass'; G.ball.holder = -1; step();
  assert.equal(p.dribbleCombo.count, 0, mode + ' pass');
  Object.assign(p, { hasBall: true, action: null });
  Object.assign(G.ball, { state: 'held', holder: p.id, dead: false });
  move(); assert.equal(p.dribbleCombo.count, 1);
  gm.t5.pickup(p); assert.equal(p.dribbleCombo.count, 0, mode + ' pickup');
  move(); p.action = { type: 'fake', t: 0, T: 1 }; step();
  assert.equal(p.dribbleCombo.count, 0, mode + ' shot gather');
  console.log('PASS ' + mode + ': chained/repeated moves, timeout, pass, pickup, shot reset');
}
