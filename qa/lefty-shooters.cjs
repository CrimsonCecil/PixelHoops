const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ctx = vm.createContext({ performance: { now: () => 0 }, setTimeout() {}, clearTimeout() {} });
ctx.window = ctx;
ctx.PH = { input: { endTick() {}, read: () => ({}) } };
for (const name of ['tune', 'render', 'roster', 'r5', 'game']) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../js', name + '.js'), 'utf8'), ctx, { filename: name + '.js' });
}
const gm = ctx.PH.game;
const lefties = ['claxton', 'djj', 'harper', 'mamu', 'conwell', 'camara', 'cmb', 'jase', 'herb', 'harden', 'ginobili'];
const righties = ['mitchell', 'mrobinson', 'ziaire', 'dqueen', 'kuminga', 'bogdan', 'joshgreen', 'lyles'];
for (const key of [...lefties, ...righties]) {
  const lefty = lefties.includes(key);
  gm.seed(7);
  gm.newGame({ mode: '2p', arch0: key, arch1: 'gobert', target: 9999 });
  const g = gm.G, [p, d] = g.players;
  Object.assign(g, { phase: 'live', needClear: false, off: 0 });
  Object.assign(p, { x: 0, y: 7.4, face: Math.PI / 2, hasBall: true });
  d.off = true;
  Object.assign(g.ball, { state: 'held', holder: 0, dead: false });
  assert.equal(!!p.arch.lefty, lefty, key + ' roster hand');
  assert.equal(p.hand, lefty ? -1 : 1, key + ' initial dribble hand');
  const input = { ...gm.t5.zeroInp(), a1: true };
  gm._dbg.startShot(p, input, 'a1', 'set');
  assert.equal(p.action.type, 'shot', key + ' jump shot starts');
  assert.equal(p.action.lefty, lefty, key + ' shooting pose mirror');
  const frames = Math.floor((p.action.ideal - 1 / 60) * 120);
  for (let i = 0; i < frames; i++) gm.tick(1 / 120, () => input);
  assert(p.z > 0 && !p.action.released, key + ' airborne set point');
  const rig = ctx.PH.rig(p), hand = lefty ? rig.handL : rig.handR;
  const expected = hand.map((v, i) => 0.86 * v + 0.14 * (lefty ? rig.handR : rig.handL)[i]);
  expected[2] += 0.12;
  const face = p.face + (p.pose.yaw || 0), right = [Math.sin(face), -Math.cos(face)];
  assert((rig.shR[0] - rig.shL[0]) * right[0] + (rig.shR[1] - rig.shL[1]) * right[1] > 0, key + ' anatomical right shoulder');
  gm._dbg.releaseShot(p, 0, 'shot');
  assert(p.action.released, key + ' release');
  for (const [i, axis] of ['x', 'y', 'z'].entries()) assert(Math.abs(g.ball[axis] - expected[i]) < 1e-9, key + ' release from ' + (lefty ? 'left' : 'right') + ' hand');
}
console.log('PASS lefty shooters: nine corrected players, Harden and Ginobili use left-handed jump-shot releases; Mitchell, Robinson and six audited righties stay right-handed');
