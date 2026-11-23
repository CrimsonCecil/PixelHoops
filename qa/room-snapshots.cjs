const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = name => fs.readFileSync(path.join(__dirname, '../js', name + '.js'), 'utf8');
const main = source('main');
const plain = value => JSON.parse(JSON.stringify(value));
function client(mode, role) {
  const ctx = vm.createContext({ performance: { now: () => 0 }, setTimeout() {} });
  ctx.window = ctx;
  for (const name of ['tune', 'ptype', 'render', 'roster', 'measurements', 'r5', 'game', 'team3']) vm.runInContext(source(name), ctx);
  const { game, T3 } = ctx.PH;
  if (mode === 't3') T3.start({ slots: ['curry', 'edwards', 'jokic', 'lebron', 'durant', 'giannis'].map(arch => ({ arch, role: 'human' })), local: role === 'host' ? 0 : 2 });
  else game.newGame({ mode: '2p', arch0: 'curry', arch1: 'lebron' });
  Object.assign(ctx, { GM: game, G: game.G, localSlot: role === 'host' ? 0 : mode === 't3' ? 2 : 1, room: { role, active: true, links: new Map([[2, {}]]) } });
  vm.runInContext(main.slice(main.indexOf('  const NET_STATE'), main.indexOf('  function roomAction')), ctx);
  return {
    game, G: game.G,
    snapshot: () => plain(vm.runInContext('roomSnapshot()', ctx)),
    settle: () => vm.runInContext('applyGuestInterp(1000)', ctx),
    receive: state => { ctx.packet = plain(state); vm.runInContext('roomState(packet)', ctx); }
  };
}

for (const mode of ['duel', 't3']) {
  const host = client(mode, 'host'), guest = client(mode, 'guest');
  const identities = guest.G.players.map(p => ({ id: p.id, tm: p.tm, tendency: p.tendency, arch: p.arch, team: p.team, col: p.col }));
  for (const z of host.game.HZ) for (const l of [-1, 1, 2]) {
    const cells = host.game.hzCells(z);
    host.G.hzV = { z, l, cells };
    const state = host.snapshot();
    assert.deepEqual(state.hzV, { z, l });
    assert.equal(host.G.hzV.cells, cells, 'snapshot must not replace host geometry');
    guest.receive(state);
    assert.equal(guest.G.hzV.cells, guest.game.hzCells(z), 'guest reuses cached geometry');
    assert.deepEqual(plain(guest.G.hzV), plain(host.G.hzV), 'all hot/cold levels and zones reconstruct identically');
    const legacy = { ...state, hzV: { ...state.hzV, cells: plain(cells) } };
    assert(JSON.stringify(state).length < JSON.stringify(legacy).length);
  }
  const p = host.G.players[0];
  Object.assign(p, { x: 1.234, stam: 45, ctrl: 'cpu', tk: 2, action: { type: 'shot', t: 0.5 } });
  p.pose.tilt = 0.125;
  host.G.hzV = null;
  const state = host.snapshot();
  for (const player of state.players) for (const key of ['id', 'tm', 'tendency', 'ring', 'arch', 'team', 'col', 'ai', 'prev', 'b5in']) assert(!Object.hasOwn(player, key), key + ' should not repeat on the wire');
  guest.receive(state);
  guest.settle();
  assert.equal(guest.G.hzV, null, 'inactive hot zone clears previous geometry');
  for (const [i, player] of guest.G.players.entries()) {
    for (const [key, value] of Object.entries(identities[i])) assert.equal(player[key], value, 'match initialization preserves ' + key);
    for (const [key, value] of Object.entries(state.players[i])) if (key !== 'oppId') assert.deepEqual(plain(player[key]), value, 'dynamic ' + key + ' remains authoritative');
    assert.equal(player.ring, mode === 't3' && i === 2, 'selection ring stays guest-local');
    assert.equal(player.opp, guest.G.players[state.players[i].oppId] || null);
  }
  for (const hzV of [null, { z: 'invalid', l: 1 }, { z: host.game.HZ[0], l: 'hot' }, {}]) {
    guest.receive({ ...state, hzV });
    assert.equal(guest.G.hzV, null, 'empty or invalid hot-zone descriptors are safe');
  }
  guest.receive(null); guest.receive({ players: [] });
  host.G.hzV = { z: host.game.HZ[0], l: 1, get cells() { throw Error('geometry traversed'); } };
  assert.doesNotThrow(host.snapshot, 'snapshot never traverses cached geometry');
  console.log('PASS: ' + mode + ' compact snapshots rebuild every hot zone, retain cached identities and dynamic visuals, and handle empty/invalid state.');
}
