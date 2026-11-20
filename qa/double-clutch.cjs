const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const dt = 1 / 120;
const root = path.join(__dirname, '..', 'js');
const sources = ['tune', 'render', 'input', 'roster', 'r5', 'game', 'b5', 'team5', 'team3'].map(
  name => new vm.Script(fs.readFileSync(path.join(root, name + '.js'), 'utf8'), { filename: name + '.js' })
);

function fixture({ five = false, three = false, seed = 7, x = 0.5, distance = 2.5, contested = false } = {}) {
  const listeners = {};
  const ctx = vm.createContext({
    navigator: { getGamepads: () => [] },
    performance: { now: () => 0 },
    setTimeout() {},
    addEventListener: (name, cb) => { listeners[name] = cb; },
  });
  ctx.window = ctx;
  for (const source of sources) source.runInContext(ctx);
  const { game, T5, T3, input, render } = ctx.PH, { G } = game, { HOOP } = render;
  game.seed(seed);
  if (five) {
    T5.start();
    T5.T.phase = 'live';
  } else if (three) {
    const slots = ['kyrie', 'edwards', 'jokic', 'lebron', 'durant', 'giannis'].map(arch => ({ arch, role: 'human' }));
    T3.start({ slots, local: 0 });
  } else game.newGame({ mode: '2p', arch0: 'kyrie', arch1: 'joe' });
  const p = five ? T5.T.ctl : G.players[0], d = G.players[1];
  Object.assign(G, { phase: 'live', needClear: false, off: five ? p.tm : p.id });
  for (const q of G.players) Object.assign(q, { hasBall: q === p, off: q !== p, x: -6, y: 2 });
  Object.assign(p, { x, y: HOOP.y - distance, face: Math.PI / 2, vx: 0, vy: 4, speed: 4, noGrabT: 0 });
  if (contested) {
    Object.assign(d, { off: false, x: x + 0.45, y: p.y + 1.4 });
    game.K.cvP = 1; game.K.cvC = 0; game.K.cvA = 0; game.K.cvA2 = 0;
  }
  Object.assign(G.ball, { state: 'held', holder: p.id, dead: false });
  const key = (code, down = true) => listeners[down ? 'keydown' : 'keyup']({ code, preventDefault() {} });
  const step = () => {
    if (three) { T3.tick(dt, { [p.id]: input.read3(p.hasBall) }); input.endTick(); }
    else (five ? T5 : game).tick(dt);
  };
  const runTo = (predicate, seconds = 1.5) => {
    for (let i = 0; i < seconds / dt && !predicate(); i++) step();
    assert(predicate(), `state not reached within ${seconds}s`);
  };
  const start = (want) => {
    key('KeyW'); key('KeyJ');
    if (want) assert(game._dbg.startFinish(p, game.t5.zeroInp(), want, 'a1'));
    step();
    assert.equal(p.action?.type, 'layup');
    assert(p.action.inSteps, 'the first press should start a gather');
    return p.action;
  };
  return { game, G, p, key, step, runTo, start };
}

function airborne(f, a, time) {
  f.runTo(() => !a.inSteps && a.t >= time);
  assert(f.p.z > 0 && !a.released && a.clutchT == null);
}

for (const [time, x] of [[0.09, -0.5], [0.26, 0.5]]) {
  test(`a new press begins the tuck on that tick at ${time}s airborne`, () => {
    const f = fixture({ x }), control = fixture({ x });
    const a = f.start(), plain = control.start();
    for (const [sim, action] of [[f, a], [control, plain]]) {
      sim.key('KeyJ', false);
      airborne(sim, action, time);
    }
    const startT = a.t;
    f.key('KeyJ');
    f.step(); control.step();
    assert.equal(a.clutchT, startT);
    assert.equal(a.meter.t0, startT);
    assert.equal(a.meter.label, '拉杆上篮');
    assert(a.tapAt == null && !a.released, 'the first tap must not release the ball');
    const shootArm = a.hand < 0 ? 'aLp' : 'aRp';
    assert(Math.abs(f.p.pose[shootArm] - control.p.pose[shootArm]) > 0.001);
    f.runTo(() => a.t + dt >= a.ideal);
    f.key('KeyJ', false); f.step();
    assert(a.released && f.p.z > 0);
    assert.equal(f.G.lastShot.name, '拉杆上篮');
    assert(Math.abs(f.G.lastShot.e) <= dt / 0.1);
  });
}

test('an early second release still plays through the tuck and finish', () => {
  const f = fixture(), a = f.start();
  f.key('KeyJ', false);
  airborne(f, a, 0.18);
  f.key('KeyJ'); f.step();
  const startT = a.clutchT;
  f.key('KeyJ', false); f.step();
  assert(a.relAt > startT && !a.released);
  f.key('KeyJ'); f.step();
  assert.equal(a.clutchT, startT, 'subsequent presses must not restart the tuck');
  f.runTo(() => a.released);
  assert.equal(f.G.lastShot.name, '拉杆上篮');
  assert.equal(f.G.lastShot.e, -1);
});

for (const three of [false, true]) {
  test(`${three ? '3V3' : '1V1'} replays a non-winning double clutch that scores after landing`, () => {
    const f = fixture({ three }), a = f.start();
    f.key('KeyJ', false);
    airborne(f, a, 0.26);
    f.key('KeyJ'); f.step();
    f.runTo(() => a.t + dt >= a.ideal);
    f.key('KeyJ', false); f.step();
    const shot = f.G.ball.shot;
    assert(a.clutchT != null && shot.made && !shot.win);
    assert.equal(shot.attempt, a);
    f.runTo(() => !f.p.action || f.G.score[0] > 0);
    assert.equal(f.p.z, 0);
    assert.equal(f.p.action, null);
    assert.equal(f.G.score[0], 0, 'the shooter must land before the ball scores');
    assert.equal(f.G.ball.shot, shot);
    assert.equal(f.G.hlQ, null, 'no replay is queued before the basket');
    f.runTo(() => f.G.score[0] === 2);
    assert.equal(f.G.phase, 'dead');
    assert.equal(f.G.hlQ?.pid, f.p.id, 'the made double clutch must queue a replay');
    f.runTo(() => f.G.replay != null, 3);
    assert.equal(f.G.replay.q.pid, f.p.id);
  });
}

test('tap or hold under pressure never selects a clutch or random hand switch', () => {
  const variants = new Set();
  for (let seed = 9; seed < 41; seed += 2) {
    for (const hold of [false, true]) {
      const f = fixture({ seed, contested: true }), a = f.start();
      if (!hold) f.key('KeyJ', false);
      f.runTo(() => a.released);
      variants.add(a.cv);
      assert(a.clutchT == null && a.cv !== 'switch' && a.lsv !== 'swap');
      assert.notEqual(f.G.lastShot.name, '拉杆上篮');
    }
  }
  assert(variants.has('hang') || variants.has('scoop') || variants.has('revAvoid') || variants.has('bump'));
});

test('grounded double tap still spins; holding it through takeoff does not clutch', () => {
  const f = fixture({ distance: 3 }), a = f.start('lay');
  f.key('KeyJ', false); f.step();
  f.key('KeyJ'); f.step();
  assert(a.inSteps && a.v === 'spin');
  f.runTo(() => a.released);
  assert(a.clutchT == null);
  assert.equal(f.G.lastShot.name, '转身上篮');
});

test('a late press after release and a second press on a floater do not clutch', () => {
  const f = fixture(), a = f.start();
  f.key('KeyJ', false);
  f.runTo(() => a.released);
  assert(f.p.z > 0);
  f.key('KeyJ'); f.step();
  assert(a.clutchT == null);

  const floater = fixture({ distance: 3 }), b = floater.start('floater');
  assert(b.V.floater);
  floater.key('KeyJ', false);
  airborne(floater, b, 0.08);
  floater.key('KeyJ'); floater.step();
  assert(b.clutchT == null);
  floater.runTo(() => b.released);
  assert.equal(floater.G.lastShot.name, '抛投');
});

test('5V5 uses the real shoot press even when sprint maps X to the finish action', () => {
  const f = fixture({ five: true }), a = f.start();
  f.key('KeyJ', false);
  airborne(f, a, 0.08);
  assert(f.p.speed > 2.5);
  f.key('ShiftLeft'); f.key('KeyJ'); f.step();
  assert(a.clutchT != null && a.meter.label === '拉杆上篮');
  f.key('ShiftLeft', false); f.step();
  assert.equal(a.relAt, -1, 'remapping a held X must not be a release');
  f.runTo(() => a.released);
  assert.equal(f.G.lastShot.name, '拉杆上篮');
});
