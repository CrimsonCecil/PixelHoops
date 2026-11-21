const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ctx = vm.createContext({ console, performance: { now: () => 0 }, setTimeout() {} });
ctx.window = ctx;
for (const name of ['tune', 'ptype', 'render', 'roster', 'r5', 'r2k', 'game']) {
  let code = fs.readFileSync(path.join(__dirname, '..', 'js', name + '.js'), 'utf8');
  if (name === 'game') code = code.replace('PH.game = {', 'PH.ftQA = { shootingFoul, awardFreeThrows, freeThrowInput, tkStart }; PH.game = {');
  vm.runInContext(code, ctx, { filename: name + '.js' });
}
const { game: gm, ftQA: qa, TUNE: tune, R2K } = ctx.PH;
const { ARCH, G, K } = gm;
const dt = 1 / 60;
const seed = (i) => gm.seed(Math.imul(i + 1, 100003));
const zero = gm.t5.zeroInp();
const set = (key, value) => tune.set('l1_' + key, value);

for (const a of Object.values(ARCH)) {
  for (const k of ['ft', 'drawFoul']) assert(a[k] >= 0 && a[k] <= 1, a.key + ' ' + k);
}
for (const [key, [ft, draw]] of Object.entries(R2K.FT)) {
  assert.equal(Math.round(99 * ARCH[key].ft), ft);
  assert.equal(Math.round(99 * ARCH[key].drawFoul), draw);
}
for (const key of ['sga', 'embiid', 'harden']) {
  assert(ARCH[key].drawFoul >= 0.94, 'elite foul drawer: ' + key);
}

function startFT(rating, cpu, i = 0) {
  gm.newGame({ mode: '2p', arch0: 'curry', arch1: 'curry' });
  const [p] = G.players;
  p.r.ft = rating;
  if (cpu) p.ctrl = 'cpu';
  seed(i);
  qa.awardFreeThrows(0, 2, true);
  for (let j = 0; !p.action && j < 180; j++) qa.freeThrowInput(dt, { ...zero, a1: !cpu && j >= 60 });
  assert(p.action?.ft);
  return p.action;
}
function release(a, cpu, offset) {
  a.ftCatch.done = true;
  if (offset != null) {
    a.t = a.ideal + offset - dt;
    if (cpu) a.cpuRelease = 0;
  }
  for (let j = 0; !a.released && j < 180; j++) qa.freeThrowInput(dt, zero);
  assert.equal(G.ball.shot.kind, 'ft');
  return { made: G.ball.shot.made, green: a.meter.color === '#7dff8a' };
}
const hi = ARCH.curry.ft, lo = ARCH.shaq.ft;
const halfWidth = (a) => a.meter.gw * a.meter.span;
const hw = halfWidth(startFT(hi, false)), lw = halfWidth(startFT(lo, false));
assert(hw >= lw * 1.4);
assert.equal(halfWidth(startFT(hi, true)), hw, 'same green window for CPU and player');
const sameRelease = (hw + lw) / 2;
assert(release(startFT(hi, false), false, sameRelease).green);
assert(!release(startFT(lo, false), false, sameRelease).green);
const baseWindow = K.ftGreenBase, ratingWindow = K.ftGreenRating;
set('ftGreenBase', 0.08); set('ftGreenRating', 0.1);
assert(release(startFT(1, false), false, 0.15).green, 'large tuned windows include offsets beyond 120 ms');
set('ftGreenBase', baseWindow); set('ftGreenRating', ratingWindow);
for (let i = 0; i < 160; i++) {
  const human = startFT(hi, false, i);
  seed(i);
  const result = release(human, false, 0.06);
  const cpu = startFT(hi, true, i);
  seed(i);
  assert.deepEqual(release(cpu, true, 0.06), result, 'same timing and roll resolve identically');
}
const autoRate = (rating) => Array.from({ length: 600 }, (_, i) => release(startFT(rating, true, i), true).made).filter(Boolean).length / 600;
const highRate = autoRate(hi), lowRate = autoRate(lo);
assert(highRate >= 0.82 && highRate <= 0.98 && lowRate >= 0.42 && lowRate <= 0.67 && highRate - lowRate >= 0.23,
  'CPU FT make rates: ' + highRate + ' / ' + lowRate);
gm.newGame({ mode: '2p', arch0: 'shaq', arch1: 'curry' });
const [shaq, curry] = G.players;
qa.tkStart(shaq);
qa.tkStart(curry);
assert.equal(shaq.r.drawFoul, 1, 'Takeover never lowers a 99-rated foul drawer');
assert(curry.r.ft > hi && curry.r.ft <= 1, 'Takeover raises FT rating within the correct scale');
console.log('PASS FT ratings: higher rating widens the green window; input parity; CPU makes ' + highRate.toFixed(3) + ' vs ' + lowRate.toFixed(3));

function whistleRate(draw, discipline, { contest = 0.65, contact = false, drought = 0, trips = 0, fouls = true } = {}) {
  gm.newGame({ mode: '2p', fouls, arch0: 'harden', arch1: 'bridges' });
  gm.t5.checkStep(9);
  G.phase = 'live';
  const [p, d] = G.players;
  p.r.drawFoul = draw; d.r.dcon = discipline;
  let whistles = 0;
  for (let i = 0; i < 1500; i++) {
    seed(i);
    G.foulDrought = drought; G.ftTrips = trips;
    if (qa.shootingFoul(p, d, { cHit: contact }, { c: contest }, contact ? 'lay' : 'shot')) whistles++;
  }
  return whistles / 1500;
}
const specialist = ARCH.harden.drawFoul, ordinary = ARCH.bridges.drawFoul;
const strong = whistleRate(specialist, 0.65), regular = whistleRate(ordinary, 0.65);
assert(strong > 2 * regular && regular > 0, 'same contested jump shot: ' + strong + ' / ' + regular);
assert(whistleRate(specialist, 0.65, { contact: true }) > 2 * whistleRate(ordinary, 0.65, { contact: true }), 'contact finish');
assert(whistleRate(specialist, 0.9) < strong, 'disciplined defenders foul less');
assert(whistleRate(ordinary, 0.65, { drought: 10 }) > regular, 'legit contact during a whistle drought is more likely to be called');
assert.equal(whistleRate(ordinary, 0.65, { drought: 10, trips: 2 }), regular);
assert(whistleRate(specialist, 0.65, { trips: 6 }) < strong, 'after many trips the odds taper without removing the rating effect');
assert.equal(whistleRate(specialist, 0.65, { contest: 0, drought: 10 }), 0, 'no phantom foul even after a drought');
assert.equal(whistleRate(specialist, 0.65, { contact: true, fouls: false }), 0);
const weight = K.foulRating;
set('foulRating', 0);
assert.equal(whistleRate(specialist, 0.65), whistleRate(ordinary, 0.65));
set('foulRating', weight);
console.log('PASS draw foul: ' + strong.toFixed(3) + ' vs ' + regular.toFixed(3) + ' on matched contests, with discipline and no-contact guards');

if (process.env.FT_PROFILE) {
  const data = JSON.parse(fs.readFileSync(process.env.FT_PROFILE, 'utf8'));
  for (const [k, v] of Object.entries(data)) if (tune.meta(k)) tune.set(k, v);
}
const pairs = [['bridges', 'white'], ['luka', 'lebron'], ['kyrie', 'curry'], ['sga', 'embiid'], ['harden', 'gobert'], ['lebron', 'giannis'], ['tatum', 'booker'], ['gobert', 'shaq'], ['maxey', 'kyrie'], ['embiid', 'wemby'], ['harden', 'bridges'], ['reaves', 'butler']];
const games = pairs.map(([arch0, arch1], i) => {
  gm.seed(i + 1);
  gm.newGame({ mode: 'cpu', arch0, arch1, target: 21, diff: 1 });
  G.players[0].ctrl = 'cpu';
  G.vopt.replay = false;
  let trips = 0;
  for (let f = 0; f < 27000 && G.phase !== 'over'; f++) {
    const phase = G.phase;
    gm.tick(dt);
    if (phase !== 'ft' && G.phase === 'ft') trips++;
  }
  assert.equal(G.phase, 'over');
  assert.equal(trips, G.ftTrips);
  return trips;
});
const mean = games.reduce((sum, trips) => sum + trips, 0) / games.length;
assert(mean >= 2.5 && mean <= 5 && games.filter((n) => n >= 2).length >= 8, 'ordinary 21-point games: ' + games);
console.log('PASS 21-point pacing: ' + mean.toFixed(2) + ' FT trips per game (' + games.join(', ') + ')');
