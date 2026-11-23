// Delta state snapshots (main.js netDelta / netMerge): the guest's merged state must equal the host's full snapshot,
// lost packets must heal by the next keyframe, and the stream must be much smaller than full snapshots.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = name => fs.readFileSync(path.join(__dirname, '../js', name + '.js'), 'utf8');
const main = source('main');
const plain = v => JSON.parse(JSON.stringify(v));
function client(mode, role) {
  const ctx = vm.createContext({ performance: { now: () => 0 }, setTimeout() {}, structuredClone });
  ctx.window = ctx;
  for (const name of ['tune', 'ptype', 'render', 'roster', 'measurements', 'r5', 'game', 'team3']) vm.runInContext(source(name), ctx);
  const { game, T3 } = ctx.PH;
  if (mode === 't3') T3.start({ slots: ['curry', 'edwards', 'jokic', 'lebron', 'durant', 'giannis'].map(arch => ({ arch, role: 'cpu' })), local: 0 });
  else game.newGame({ mode: 'cpu', arch0: 'curry', arch1: 'lebron' });
  game.G.intro = null;
  Object.assign(ctx, { GM: game, G: game.G, localSlot: role === 'host' ? 0 : 1, room: { role, active: true, links: new Map([[1, {}]]) } });
  vm.runInContext(main.slice(main.indexOf('  const NET_STATE'), main.indexOf('  function roomAction')), ctx);
  return { ctx, game, T3, run: code => vm.runInContext(code, ctx) };
}
const pseudo = (seed) => () => (seed = (seed * 16807) % 2147483647) / 2147483647;

for (const mode of ['duel', 't3']) {
  const host = client(mode, 'host'), guest = client(mode, 'guest');
  const rnd = pseudo(7);
  let fullBytes = 0, deltaBytes = 0, packets = 0, healed = 0, lossy = false, legacy = null;
  // What a guest fed full snapshots ends up with: player keys that vanish keep their last value (Object.assign).
  const legacyMerge = (full) => (legacy = legacy ? { ...full, players: full.players.map((p, i) => ({ ...legacy.players[i], ...p })) } : full);
  for (let i = 0; i < 2400; i++) {
    const inp = () => ({ mx: Math.sin(i / 30), my: Math.cos(i / 40), dx: 0, dy: 0, sprint: i % 90 < 40, a1: i % 120 === 0 });
    try { if (mode === 't3') host.T3.tick(1 / 60, {}); else host.game.tick(1 / 60, inp); } catch { /* sim noise is fine */ }
    if (i % 3) continue;
    const full = plain(host.run('roomSnapshot()'));
    host.ctx.snap = full;
    const wire = plain(host.run('netDelta(snap, true)'));
    // Keyframes restart the merge base; roomState's Object.assign keeps vanished player keys on the guest either way.
    if (!wire.dl) legacy = null;
    const expect = legacyMerge(full);
    fullBytes += JSON.stringify(full).length; deltaBytes += JSON.stringify(wire).length; packets++;
    // Drop ~20% of packets in the second half (unreliable state channel).
    const drop = i > 1200 && rnd() < 0.2;
    if (drop) { lossy = true; continue; }
    guest.ctx.packet = wire;
    const merged = guest.run('netMerge(packet)');
    if (!merged) continue;
    if (!wire.dl) { assert.deepEqual(plain(merged), full, mode + ' keyframe reproduces the full snapshot'); if (lossy) healed++; }
    else if (!lossy) assert.deepEqual(plain(merged), expect, mode + ' lossless delta merge equals the full snapshot at packet ' + packets);
  }
  assert(healed > 0, 'keyframes arrived after losses');
  const ratio = deltaBytes / fullBytes;
  console.log(`${mode}: ${packets} packets, full ${Math.round(fullBytes / packets)} B, delta ${Math.round(deltaBytes / packets)} B (${Math.round(ratio * 100)}%)`);
  assert(ratio < 0.6, mode + ' delta stream must be well under full snapshots');

  // A guest that never saw a keyframe ignores deltas (except audio) instead of applying partial state.
  const fresh = client(mode, 'guest');
  fresh.ctx.packet = { dl: 1, players: [{ x: 1 }], audio: [['swish']] };
  assert.deepEqual(plain(fresh.run('netMerge(packet)')), { audio: [['swish']] });
  // Legacy host (no delta) still works: a full packet passes through unchanged.
  const full = plain(host.run('roomSnapshot()'));
  fresh.ctx.packet = full;
  assert.deepEqual(plain(fresh.run('netMerge(packet)')), full);
  // A top-level key that becomes undefined is cleared on the guest.
  host.ctx.snap = { ...full, cutin: { who: 1 } }; host.run('netDelta(snap, true)');
  host.ctx.snap = { ...full, cutin: undefined }; const w = plain(host.run('netDelta(snap, true)'));
  if (w.dl) { assert(w.gone.includes('cutin')); fresh.ctx.packet = full; fresh.run('netMerge(packet)'); fresh.ctx.packet = w; assert.equal(fresh.run('netMerge(packet)').cutin, undefined); }
}
console.log('PASS: delta snapshots merge exactly, heal after loss, and shrink the state stream.');
