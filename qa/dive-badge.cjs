const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ctx = vm.createContext({ performance: { now: () => 0 }, setTimeout() {}, clearTimeout() {}, addEventListener() {}, navigator: { getGamepads: () => [] } });
ctx.window = ctx;
for (const name of ['tune', 'ptype', 'render', 'input', 'roster', 'measurements', 'r5', 'r2k', 'game', 'b5', 'team5', 'team3']) {
  let code = fs.readFileSync(path.join(__dirname, '../js', name + '.js'), 'utf8');
  if (name === 'game') code = code.replace('_qa: {', '_qa: { updatePlayer, updateAction,');
  vm.runInContext(code, ctx, { filename: name + '.js' });
}
const { game: gm, input, TUNE, T3, T5 } = ctx.PH;
const { G, ARCH, BADGE_TIER, K } = gm;
const dt = 1 / 120;
const buttons = gm.t5.zeroInp;
const counts = [0, 0, 0, 0, 0];
for (const a of Object.values(ARCH)) {
  const t = BADGE_TIER.hustle(a);
  counts[t]++;
  assert.equal(a.badges.includes('hustle'), t > 0, a.key);
}
for (const [key, hus2k, dcon2k, tier] of [['rodman', 99, 98, 4], ['bwallace', 98, 99, 4], ['white', 95, 95, 4], ['smart', 90, 85, 3], ['lebron', 70, 60, 0], ['curry', 85, 65, 0], ['jokic', 80, 80, 0]]) {
  const a = ARCH[key];
  assert.equal(a.hus2k, hus2k, key);
  assert.equal(a.dcon2k, dcon2k, key);
  assert.equal(BADGE_TIER.hustle(a), tier, key);
}
for (const [hus2k, dcon2k, tier] of [[89, 99, 0], [90, 49, 0], [90, 50, 1], [90, 74, 1], [90, 75, 2], [90, 84, 2], [90, 85, 3], [94, 99, 3], [95, 94, 3], [95, 95, 4]]) {
  assert.equal(BADGE_TIER.hustle({ hus2k, dcon2k }), tier);
}
const participation = counts.slice(1).reduce((a, b) => a + b) / Object.keys(ARCH).length;
assert(participation >= 0.30 && participation <= 0.35);
assert(counts[1] > counts[2] && counts[2] > counts[3] && counts[3] > counts[4]);
assert(counts[4] >= 10 && counts[4] <= 15);
console.log('Roster (none / bronze / silver / gold / HOF):', counts.join(' / '));

function reset(mode = '1V1', human = true) {
  gm.seed(19);
  if (mode === '3V3') T3.start({ slots: ['white', 'curry', 'jokic', 'joe', 'durant', 'giannis'].map((arch, i) => ({ arch, role: i === 0 && human ? 'p1' : 'cpu' })), local: human ? 0 : -1, replay: false });
  else if (mode === '5V5') { T5.start({ human: human ? 0 : -1 }); T5.T.phase = 'live'; }
  else gm.newGame({ mode: 'cpu', arch0: 'white', arch1: 'joe', diff: 1 });
  const p = G.players[0], d = G.players[G.players.length / 2];
  if (mode === '5V5' && human) T5.setCtl(p, 'manual');
  Object.assign(G, { phase: 'live', off: 0, needClear: false, time: 1, shotClock: 8, cutin: null });
  Object.assign(G.fx, { hit: 0, slow: 0 });
  for (const q of G.players) Object.assign(q, { ctrl: q === p && human ? 'p1' : 'cpu', hasBall: false, action: null, stun: 0, cd: 0, z: 0, vx: 0, vy: 0, vz: 0, x: q.id % 2 ? -5 : 5, y: 10 + q.id * 0.25 });
  Object.assign(p, { x: -3, y: 5, opp: d });
  Object.assign(d, { x: 0, y: 5.6, opp: p });
  Object.assign(G.ball, { state: 'loose', holder: -1, dead: false, wasShot: false, x: 0, y: 5, z: 0.2, vx: 0, vy: 0, vz: 0, noPick: 1 });
  return { p, d };
}
function setRatings(p, [hus2k, dcon2k]) {
  p.arch = { ...p.arch, hus2k, dcon2k, _bt: {} };
  p.r.badges = BADGE_TIER.hustle(p.arch) ? ['hustle'] : [];
}
const read5 = input.read5;
K.aiDvP = 1000;
for (const mode of ['1V1', '3V3', '5V5']) {
  for (const human of [true, false]) {
    for (const [hus2k, dcon2k, eligible] of [[85, 95, false], [95, 95, true]]) {
      const { p } = reset(mode, human);
      setRatings(p, [hus2k, dcon2k]);
      const press = { ...buttons(), mx: 1, a2: true };
      if (mode === '5V5') {
        input.read5 = () => ({ ...read5(), X: human });
        T5.tick(dt);
      } else if (mode === '3V3') T3.tick(dt, human ? { [p.id]: press } : {});
      else gm.tick(dt, () => press);
      assert.equal(p.action?.type === 'dive', eligible, `${mode} ${human ? 'human' : 'CPU'} Hustle ${hus2k}`);
      if (!human && !eligible) assert(p.vx > 0, `${mode} CPU runs toward loose ball without badge`);
    }
  }
}
input.read5 = read5;
K.aiDvP = TUNE.def('l1_aiDvP');
console.log('1V1 / 3V3 / 5V5: human and CPU dive only with badge; CPU still chases without it.');

function distance(ratings) {
  const { p, d } = reset();
  setRatings(p, ratings);
  d.x = 5; d.y = 12;
  p.x = -5; G.ball.x = 6; G.ball.noPick = 10;
  const x = p.x;
  gm._qa.updatePlayer(p, { ...buttons(), a2: true }, dt);
  assert.equal(p.action?.type, 'dive');
  for (let i = 0; i < 120 && p.action; i++) {
    G.time += dt;
    gm._qa.updatePlayer(p, buttons(), dt);
  }
  return p.x - x;
}
const tiers = [[90, 50], [90, 75], [90, 85], [95, 95]];
const distances = tiers.map(distance);
assert(distances.every((d, i) => !i || d > distances[i - 1]));
assert(distances[2] > 6.8 && distances[3] > 6.8, 'gold and HOF beat the old distance cap in this setup');
for (const [i, tier] of ['Bronze', 'Silver', 'Gold', 'Hof'].entries()) {
  const k = 'l1_dvR' + tier, m = TUNE.meta(k);
  assert.equal(m.sub, '鱼跃扑球');
  assert.equal(m.gm, 'both');
  TUNE.set(k, m.v + 0.5);
  const tuned = distance(tiers[i]);
  assert(tuned > distances[i] + 0.25, `${tier}: ${distances[i]} → ${tuned}, tune ${K['dvR' + tier]}`);
  assert.equal(distance(tiers[(i + 1) % tiers.length]), distances[(i + 1) % tiers.length]);
  TUNE.reset(k);
}

function wins(ratings) {
  let n = 0;
  for (let i = 0; i < 500; i++) {
    const { p, d } = reset();
    setRatings(p, ratings);
    d.r = { ...p.r, badges: [] };
    p.x = 0; d.x = 1.2; d.y = 5.65; G.ball.x = d.x; G.ball.noPick = 0;
    gm._qa.updatePlayer(p, { ...buttons(), a2: true }, dt);
    const a = p.action;
    a.t = a.pre + 0.01;
    gm.seed(Math.imul(i, 2654435761));
    gm._qa.updateAction(p, buttons(), 0);
    n += G.ball.holder === p.id;
  }
  return n;
}
const winCounts = tiers.map(wins);
assert(winCounts.every((n, i) => !i || n > winCounts[i - 1]));
console.log('Dive distances (m):', distances.map(d => d.toFixed(2)).join(' / '));
console.log('Contested pickups (out of 500):', winCounts.join(' / '));
