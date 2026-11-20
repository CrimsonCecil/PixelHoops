const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = (name) => fs.readFileSync(path.join(__dirname, '../js', name + '.js'), 'utf8');
const main = source('main');
function client(role) {
  const heard = [], ctx = vm.createContext({ performance: { now: () => 0 }, setTimeout: () => {} });
  ctx.window = ctx;
  for (const name of ['tune', 'ptype', 'render', 'roster', 'measurements', 'r5', 'game', 'team3']) vm.runInContext(source(name), ctx);
  const { game, T3 } = ctx.PH;
  ctx.PH.audio = { play: (...args) => heard.push(['play', ...args]), vo: (...args) => heard.push(['vo', ...args]) };
  T3.start({ slots: ['curry', 'edwards', 'jokic', 'lebron', 'durant', 'giannis'].map((arch) => ({ arch, role: 'cpu' })) });
  Object.assign(ctx, { GM: game, G: game.G, localSlot: -1, room: { role, active: true, links: new Map([[2, {}]]) } });
  vm.runInContext(main.slice(main.indexOf('  const NET_STATE'), main.indexOf('  function roomAction')) +
    '\nif (typeof resetRoomAudio === "function") resetRoomAudio();', ctx);
  return { ctx, game, heard };
}

const host = client('host'), guest = client('guest');
host.game.t5.sfx('bounce');
host.game.t5.scoreBy(0, 3, 'shot');
host.game.t5.sfx('whistle');
assert.deepEqual(host.heard, [['play', 'bounce'], ['play', 'swish'], ['play', 'cheer'], ['vo', 'curry', 'three', undefined], ['play', 'whistle']]);
guest.ctx.snapshot = vm.runInContext('roomSnapshot()', host.ctx);
assert.deepEqual(guest.heard, [], 'No guest simulation is needed');
vm.runInContext('roomState(snapshot)', guest.ctx);
assert.deepEqual(guest.heard, JSON.parse(JSON.stringify(host.heard)), 'Guest plays host events when applying the snapshot');
assert.equal(guest.game.G.score[0], 3);
guest.ctx.snapshot = vm.runInContext('roomSnapshot()', host.ctx);
vm.runInContext('roomState(snapshot)', guest.ctx);
assert.equal(guest.heard.length, host.heard.length, 'The next snapshot must not replay old audio');
console.log('PASS: online guests hear batched bounce, basket, voice and whistle events once without simulating.');
