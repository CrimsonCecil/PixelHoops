// 1V1 / 3V3 check ball: the defender holds the ball, bounce-passes it, and play goes live on the catch.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function load(extra = []) {
  const ctx = vm.createContext({ performance: { now: () => 0 }, setTimeout: () => {} });
  ctx.window = ctx;
  vm.runInContext('let seed = 7; Math.random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296)', ctx);
  for (const name of ['tune', 'ptype', 'render', 'roster', 'measurements', 'r5', 'game', ...extra]) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../js', name + '.js'), 'utf8'), ctx, { filename: name + '.js' });
  }
  ctx.PH.game.seed(7);
  ctx.PH.input = { read: () => ctx.PH.game.t5.zeroInp(), endTick() {} };
  return ctx.PH;
}

function watch(G, step, offId, defId) {
  const log = [];
  for (let i = 0; i < 120 && G.phase === 'check'; i++) {
    const o = G.players[offId], d = G.players[defId], b = G.ball;
    log.push({ t: i / 60, state: b.state, z: b.z, dO: Math.hypot(b.x - o.x, b.y - o.y), dD: Math.hypot(b.x - d.x, b.y - d.y), oBall: o.hasBall, dHands: !!(d.pose && d.pose.passHands) });
    step();
  }
  return log;
}

function verify(log, G, offId, label) {
  assert.equal(G.phase, 'live', label + ': play goes live');
  assert.equal(G.ball.state, 'held', label + ': offense holds the ball');
  assert.equal(G.ball.holder, offId, label + ': ball goes to the offense');
  assert(log.length > 40 && log.length < 70, label + ': check lasts about one second (' + log.length + ' frames)');
  assert(log.every((f) => f.state === 'pass' && !f.oBall), label + ': nobody owns the ball until the catch');
  assert(log.slice(0, 25).every((f) => f.dD < 0.6 && f.z > 0.9 && f.dHands), label + ': defender holds the ball at chest height first');
  assert(Math.min(...log.map((f) => f.z)) < 0.2, label + ': it is a bounce pass');
  assert(log[log.length - 1].dO < 0.6, label + ': ball arrives at the offense');
}

{
  const PH = load(), GM = PH.game, G = GM.G;
  GM.newGame({ mode: 'cpu', arch0: 'curry', arch1: 'lebron', target: 11 });
  assert.equal(G.phase, 'check');
  const log = watch(G, () => GM.tick(1 / 60), 0, 1);
  verify(log, G, 0, '1V1 opening');
  GM.setupCheck(1, '测试');
  const log2 = watch(G, () => GM.tick(1 / 60), 1, 0);
  verify(log2, G, 1, '1V1 after a change of possession');
  GM.newGame({ mode: 'cpu', arch0: 'curry', arch1: 'lebron', target: 11 });
  const held = (p) => Object.assign(GM.t5.zeroInp(), p.hasBall ? { a1: true } : { a2: true });
  for (let i = 0; i < 90; i++) GM.tick(1 / 60, held);
  assert.equal(G.phase, 'live');
  assert(!G.players[0].action || !['shot', 'layup', 'dunk'].includes(G.players[0].action.type), 'a button held through the catch is not a new shot');
  GM.newGame({ mode: 'train', arch0: 'curry', arch1: 'lebron' });
  assert.equal(G.ball.state, 'held', 'training mode keeps its instant reset');
  console.log('PASS: 1V1 check ball goes defender -> bounce pass -> offense catch -> live.');
}

{
  const PH = load(['team3']), GM = PH.game, G = GM.G, T3 = PH.T3;
  const slots = ['curry', 'edwards', 'jokic', 'lebron', 'durant', 'giannis'].map((arch, i) => ({ arch, role: i === 0 ? 'human' : 'cpu' }));
  T3.start({ slots, target: 21, clock: 14, replay: false });
  const defId = G.ball.lastTouch;
  assert.equal(G.players[defId].tm, 1, '3V3: the defense checks the ball');
  const log = watch(G, () => T3.tick(1 / 60, {}), 0, defId);
  verify(log, G, 0, '3V3 opening');
  assert(GM.isThree(G.players[0].x, G.players[0].y), '3V3: the catch is outside the arc');
  console.log('PASS: 3V3 check ball goes defender -> bounce pass -> offense catch -> live.');
}

for (const mode of ['cpu', 't3']) {
  const PH = load(['team3']), GM = PH.game, G = GM.G, api = GM.t5;
  if (mode === 't3') PH.T3.start({ slots: ['curry', 'edwards', 'jokic', 'lebron', 'durant', 'giannis'].map((arch) => ({ arch, role: 'cpu' })), target: 21, clock: 14, replay: false });
  else GM.newGame({ mode: 'cpu', arch0: 'curry', arch1: 'lebron', target: 11 });
  const off = G.players[0], def = G.players.find((p) => p.tm !== off.tm && p.id !== off.id) || G.players[1];
  const rebound = (pl) => {
    for (const p of G.players) p.hasBall = false;
    Object.assign(pl, { x: 0.4, y: PH.render.HOOP.y - 1.5 });
    Object.assign(G.ball, { state: 'loose', holder: -1, wasShot: true, x: pl.x, y: pl.y, z: 1 });
    api.pickup(pl);
  };
  Object.assign(G, { phase: 'live', off: off.tm ?? off.id, needClear: true, illId: off.id });
  rebound(off);
  assert.equal(G.needClear, false, mode + ': an offensive rebound needs no clearance');
  assert.equal(G.illId, -1, mode + ': an offensive rebound clears the uncleared-shot flag');
  rebound(def);
  assert.equal(G.needClear, true, mode + ': a defensive rebound inside the arc still needs clearance');
  console.log('PASS: ' + (mode === 't3' ? '3V3' : '1V1') + ' offensive rebounds play on; defensive rebounds clear the arc.');
}
