const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const dt = 1 / 120;
let inputs = [];
const ctx = vm.createContext({ console, performance: { now: () => 0 }, setTimeout() {}, clearTimeout() {} });
ctx.window = ctx;
ctx.PH = { input: { read: (i) => inputs[i], read5: () => ({}), endTick() {} } };
for (const name of ['tune', 'render', 'roster', 'r5', 'game', 'b5', 'team5']) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../js', name + '.js'), 'utf8'), ctx, { filename: name + '.js' });
}
const { game: gm, TUNE: tune, T5: team } = ctx.PH;
const { G, t5, _dbg: dbg } = gm;
const close = (actual, expected, label) => assert(Math.abs(actual - expected) < 1e-8, `${label}: expected ${expected}, got ${actual}`);

function fixture(mode, overrides = {}) {
  if (G.mode === 't5') t5.end();
  tune.load({ l1_stamRegen: 0, ...overrides });
  gm.seed(7);
  gm.newGame({ mode: '2p', arch0: 'lebron', arch1: 'gobert', target: 999 });
  const [p, d] = G.players;
  if (mode === 't5') t5.begin([p, d]);
  Object.assign(G, { phase: 'live', needClear: false });
  Object.assign(G.ball, { state: 'held', holder: p.id, dead: false });
  Object.assign(p, { x: 0, y: 5, z: 0, hasBall: true, opp: d, stam: 100 });
  Object.assign(p.r, { sta: 0.5, badges: [] });
  Object.assign(d, { x: -4, y: 4, off: true, opp: p, hasBall: false });
  return { p, d, step(playerInput, opponentInput) {
    inputs = [playerInput, opponentInput].map((i) => ({ ...t5.zeroInp(), ...i }));
    if (mode === 't5') t5.step(inputs, dt); else gm.tick(dt);
  } };
}

for (const mode of ['2p', 't5']) {
  const checks = [
    ['sprint', 12 * 0.925 * dt, ({ step }) => step({ mx: 1, sprint: true })],
    ['crossover', 9.6 * 0.925, ({ p, step }) => {
      p.arch = { ...p.arch, key: 'qa' };
      p.speed = 2;
      step({ dx: 1, a3: true });
      assert.equal(p.action?.kind, 'cross');
    }],
    ['post drive', 5.5 * 0.8 * 0.925 * dt, ({ p, step }) => {
      p.speed = 2;
      step({ my: 1, post: true });
    }],
    ['layup', 4, ({ p }) => {
      p.y = 10.5;
      assert(dbg.startFinish(p, t5.zeroInp(), 'lay'));
    }],
    ['dunk', 7.2, ({ p }) => {
      p.y = 10.5;
      dbg.startDunk(p);
    }],
    ['rebound jump or block', 4.8, ({ p, d, step }) => {
      p.hasBall = false; d.hasBall = true; G.ball.holder = d.id;
      step({ a1: true });
      assert.equal(p.action?.type, 'block');
    }],
    ['steal', 2.4, ({ p, d, step }) => {
      p.hasBall = false; d.hasBall = true; G.ball.holder = d.id;
      step({ a2: true });
      assert.equal(p.action?.type, 'steal');
    }],
    ['dive', 8, ({ p, step }) => {
      p.hasBall = false;
      Object.assign(G.ball, { state: 'loose', holder: -1, x: 2, y: 5, z: 0.5 });
      step({ a2: true });
      assert.equal(p.action?.type, 'dive');
    }],
    ['pump fake', 0, ({ p, step }) => {
      step({ a1: true });
      step({});
      assert.equal(p.action?.type, 'fake');
    }],
    ['jump shot', 2.4, ({ p, step }) => {
      step({ a1: true });
      for (let i = 0; i < 120 && p.action.t < p.action.ideal; i++) step({ a1: true });
      close(p.stam, 100, 'shot wind-up');
      step({});
      assert(p.action?.released);
      for (let i = 0; i < 10; i++) step({});
    }],
  ];
  for (const [label, expected, perform] of checks) {
    const f = fixture(mode);
    perform(f);
    close(100 - f.p.stam, expected, mode + ' ' + label);
  }
}

const { p, step } = fixture('2p', { l1_stShotCost: 5, l1_stCost: 1 });
p.stam = 3;
dbg.startShot(p, t5.zeroInp());
Object.assign(p.action, { t: p.action.ideal - dt, vt: p.action.ideal - dt });
step({});
close(p.stam, 0, 'custom shot cost clamps stamina to zero');

{
  const { p, step } = fixture('2p');
  p.stam = 25;
  dbg.startShot(p, t5.zeroInp());
  const a = p.action, releaseAt = a.ideal + 0.98 * a.meter.gw * a.meter.span;
  Object.assign(a, { t: releaseAt - dt, vt: releaseAt - dt });
  step({});
  assert(G.lastShot?.green, 'stamina cost must not shrink the green window of the shot being released');
  close(p.stam, 22.6, 'green jump shot still costs stamina');
}

tune.reset();
team.start({ home: 'LAL', away: 'BOS', human: -1, qlen: 720 });
gm.seed(7);
for (let i = 0; i < 1200 && team.T.phase !== 'live'; i++) team.tick(dt);
assert.equal(team.T.phase, 'live', '5V5 tip-off must reach live play');
const r = team.T.tm[0].ros[0], fat = r.fat;
team.tick(dt);
assert.equal(team.T.phase, 'live');
const fast = r.p.speed > 5;
close(r.fat - fat, 24 / 420 * dt * (fast ? 1.5 : 1), '5V5 live-ball fatigue');
assert(r.p.stam <= 100 - r.fat, 'long-term fatigue caps available stamina');

console.log('PASS shared stamina costs in 1V1 and 5V5, including free pump fakes and 5V5 fatigue');
