const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function fixture(mode = '1v1', flipped = false, camera = '2k', arch = 'luka') {
  const listeners = {}, pads = [];
  const ctx = vm.createContext({ navigator: { getGamepads: () => pads }, performance: { now: () => 0 },
    setTimeout() {}, addEventListener: (name, cb) => { listeners[name] = cb; } });
  ctx.window = ctx;
  for (const name of ['tune', 'render', 'input', 'roster', 'r5', 'game', 'b5', 'team5', 'team3'])
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', name + '.js'), 'utf8'), ctx);
  const { game: gm, T5: team, TUNE: tune } = ctx.PH;
  gm.seed(7);
  Object.assign(gm.G.train, { role: 'off', dummy: 'stand', gap: 1.5, infStam: false });
  gm.newGame({ mode: '2p', arch0: arch, arch1: 'joe' });
  gm.t5.checkStep(9);
  let p = gm.G.players[0], d = gm.G.players[1];
  if (mode === '3v3') {
    ctx.PH.T3.start({ slots: [arch, 'lebron', 'giannis', 'joe', 'kobe', 'shaq'].map((arch, i) => ({ arch, role: i ? 'cpu' : 'human' })), local: 0, replay: false });
    gm.t5.checkStep(9);
    p = gm.G.players[0]; d = gm.G.players[3];
    for (const other of gm.G.players) if (other !== p) Object.assign(other, { x: -6 + other.id, y: 2, stun: 30, hasBall: false });
  }
  if (mode === '5v5') {
    team.start({ home: arch === 'curry' ? 'GSW' : 'LAL', away: 'BOS', human: flipped ? 1 : 0 });
    const T = team.T;
    p = T.ctl; d = gm.G.players.find(q => q.tm !== p.tm);
    Object.assign(T, { phase: 'live', off: p.tm });
    team.setCam({ preset: camera });
    for (const other of gm.G.players) if (other !== p)
      Object.assign(other, { x: -6 + other.id, y: -7, stun: 30, hasBall: false });
  }
  const G = gm.G, b = G.ball;
  Object.assign(G, { phase: 'live', needClear: false, fb: 'simple', off: mode === '5v5' ? p.tm : 0 });
  Object.assign(p, { x: 0, y: 6.8, z: 0, vz: 0, vx: 0, vy: 0, speed: 0, hasBall: true, action: null, stun: 0, cd: 0 });
  Object.assign(p.r, { hnd: 0.8, post: 0.85, close: 0.85 });
  Object.assign(d, { x: 3, y: 8, off: false, hasBall: false, stun: 30 });
  Object.assign(b, { state: 'held', holder: p.id, dead: false, lastTouch: p.id });
  const key = (code, down = true) => listeners[down ? 'keydown' : 'keyup']({ code, preventDefault() {} });
  const step = (n = 1) => { for (let i = 0; i < n; i++) {
    if (mode === '3v3') { ctx.PH.T3.tick(1 / 120, { 0: ctx.PH.input.read3(true) }); ctx.PH.input.endTick(); }
    else (mode === '5v5' ? team : gm).tick(1 / 120);
  } };
  const fake = () => { key('KeyJ'); step(); key('KeyJ', false); step(); assert.equal(p.action.type, 'fake'); };
  const raw = (x, y) => {
    if (mode !== '5v5') return [x, y];
    const X = team.stick(1, 0), Y = team.stick(0, 1);
    return [x * X.x + y * X.y, x * Y.x + y * Y.y];
  };
  const direction = (x, y, binding = 'stick', flick = true) => {
    const [rx, ry] = raw(x, y);
    if (binding === 'pad') {
      pads[0] = { connected: true, index: 0, axes: [0, 0, rx, -ry], buttons: Array.from({ length: 16 }, () => ({ pressed: false })) };
    } else if (binding === 'B') {
      pads[0] = { connected: true, index: 0, axes: [rx, -ry, 0, 0], buttons: Array.from({ length: 16 }, (_, i) => ({ pressed: i === 1 })) };
    } else if (mode === '5v5') {
      if (rx > 0.5) key('ArrowRight'); if (rx < -0.5) key('ArrowLeft');
      if (ry > 0.5) key('ArrowUp'); if (ry < -0.5) key('ArrowDown');
    } else {
      if (x > 0.5) key('KeyD'); if (x < -0.5) key('KeyA');
      if (y > 0.5) key('KeyW'); if (y < -0.5) key('KeyS');
      key('KeyL');
    }
    if (flick && (binding === 'pad' || mode === '5v5' && binding === 'stick')) {
      step(6);
      if (binding === 'pad') pads[0].axes[2] = pads[0].axes[3] = 0;
      else for (const k of ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']) key(k, false);
    }
  };
  const neutral = () => { pads.length = 0; for (const k of ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyL', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']) key(k, false); };
  const leftShot = (x, y, pad = false) => {
    const [rx, ry] = raw(x, y);
    if (pad) pads[0] = { connected: true, index: 0, axes: [rx, -ry, 0, 0], buttons: Array.from({ length: 16 }, (_, i) => ({ pressed: i === 2 })) };
    else { if (rx > 0.5) key('KeyD'); if (rx < -0.5) key('KeyA'); if (ry > 0.5) key('KeyW'); if (ry < -0.5) key('KeyS'); key('KeyJ'); }
  };
  return { ctx, gm, G, p, d, b, team, tune, pads, key, step, fake, direction, neutral, leftShot };
}

const directions = [['uuForward', 0, 1], ['uuBack', 0, -1], ['uuLeft', -1, 0], ['uuRight', 1, 0]];
const variantNames = { uuForward: '上下步·突篮', uuBack: '上下步·后撤', uuLeft: '上下步·左', uuRight: '上下步·右' };
for (const mode of ['1v1', '3v3', '5v5']) {
  for (const arch of ['curry', 'luka']) for (const ms of [120, 150, 180]) {
    for (const binding of ['stick', 'pad', 'B']) for (const simultaneous of [false, true]) {
      if (mode === '5v5' && binding === 'B' && simultaneous) continue;
      const f = fixture(mode, false, '2k', arch);
      if (binding === 'stick') f.key('KeyJ');
      else f.pads[0] = { connected: true, index: 0, axes: [0, 0, 0, 0], buttons: Array.from({ length: 16 }, (_, i) => ({ pressed: i === 2 })) };
      f.step(Math.round(ms * 120 / 1000));
      if (binding === 'stick') f.key('KeyJ', false); else f.pads[0].buttons[2].pressed = false;
      if (!simultaneous) { f.step(); assert.equal(f.p.action?.type, 'fake', `${mode} ${arch} ${ms}ms tap`); }
      f.direction(0, 1, binding); f.step(2);
      assert.equal(f.p.action?.mv, 'uuForward', `${mode} ${arch} ${ms}ms ${binding} simultaneous=${simultaneous}`);
      assert(f.p.hasBall);
    }
  }
  console.log(`PASS ${mode}: real keyboard/Xbox X taps 120/150/180ms then keyboard/B/right-stick moves, including same-frame release/flick`);
}

for (const [id] of directions) {
  const f = fixture();
  assert.equal(typeof f.gm.MVX[id].how, 'string');
  assert.equal(typeof f.gm.MVX[id].sit, 'function');
  f.gm.tipsStart(id);
  const seen = new Set();
  for (let i = 0; i < 360; i++) {
    f.step(); const a = f.G.players[0].action;
    if (a?.type === 'fake') seen.add('fake');
    if (a?.mv === id) { assert(seen.has('fake')); seen.add(id); }
    if (a && ['shot', 'layup'].includes(a.type) && seen.has(id)) seen.add('followup');
  }
  assert(seen.has(id) && seen.has('followup'), `${id} demo shows fake, correct pivot and follow-up shot`);
}
console.log('PASS all four move descriptions and existing demos: pump fake → directional pivot → follow-up shot');

for (const mode of ['1v1', '3v3', '5v5']) {
  for (const [mv, x, y] of directions) for (const pad of [false, true]) for (const releaseEarly of [false, true]) {
    const f = fixture(mode); f.p.y = f.ctx.PH.render.HOOP.y - 3.5;
    f.fake(); f.step(4); f.leftShot(x, y, pad); f.step();
    assert.equal(f.p.action?.mv, mv, `${mode} shoot + direction selects ${mv}`);
    f.step(15);
    if (releaseEarly) { f.key('KeyJ', false); if (pad) f.pads[0].buttons[2].pressed = false; }
    while (f.p.action?.kind === 'uu') f.step();
    if (releaseEarly) { f.step(10); assert(!f.p.action, 'releasing during the pivot cancels automatic follow-up'); }
    else {
      assert.equal(f.p.action?.type, mv === 'uuForward' ? 'layup' : 'shot');
      if (mv === 'uuBack') assert.equal(f.p.action.v, 'stepback');
      assert(f.p.action.meter && !f.p.action.released);
      if (f.p.action.type === 'shot') {
        f.step(Math.round(f.p.action.ideal * 120));
        f.key('KeyJ', false); if (pad) f.pads[0].buttons[2].pressed = false;
        f.step(); assert(f.p.action.released, 'button release controls the follow-up meter');
      }
    }
  }
  const f = fixture(mode); f.fake(); f.key('KeyJ'); f.step();
  assert.notEqual(f.p.action?.kind, 'uu', 'no direction retains ordinary fake/shot behavior');
  console.log(`PASS ${mode}: X/J + direction selects four variants, hold-through layup/jumpers, early-release cancellation and neutral-stick behavior`);
}

for (const [mode, flipped, camera] of [['1v1', false, '2k'], ['5v5', false, '2k'], ['5v5', true, '2k'], ['5v5', true, 'broadcast']]) {
  for (const recentFake of [false, true]) for (const [mv, x, y] of directions) {
    const f = fixture(mode, flipped, camera); f.p.y = f.ctx.PH.render.HOOP.y - 3.5;
    if (recentFake) f.fake();
    f.direction(x, y, 'pad', false); f.step();
    assert.equal(f.p.action?.type, 'move', 'stick deflection dispatches the move on the first frame');
    const move = f.p.action;
    f.step(11);
    f.pads[0].axes[2] = f.pads[0].axes[3] = 0; f.step();
    assert.strictEqual(f.p.action, move, 'quick flick keeps the same move without another release-time input');
    assert(!f.p.buf);
    if (recentFake) assert.equal(f.p.action.mv, mv);
    const h = fixture(mode, flipped, camera); h.p.y = h.ctx.PH.render.HOOP.y - 3.5;
    if (recentFake) h.fake();
    h.direction(x, y, 'pad', false); h.step();
    const heldMove = h.p.action;
    assert.equal(heldMove?.type, 'move');
    h.step(26);
    if (recentFake) assert.equal(h.p.action?.mv, mv, 'right-stick hold selects a directional UU');
    else {
      assert.equal(h.p.action?.type, 'shot', 'holding interrupts the dribble into a shot');
      assert.notStrictEqual(h.p.action, heldMove);
      assert(h.p.action.t < 0.04, 'shot meter starts at conversion, not initial deflection');
      assert.equal(h.p.ib, null); assert.equal(h.p.buf, null);
    }
    while (h.p.action?.kind === 'uu') h.step();
    assert(['shot', 'layup'].includes(h.p.action?.type));
    if (recentFake) assert.equal(h.p.action.type, mv === 'uuForward' ? 'layup' : 'shot');
    if (h.p.action.type === 'shot') {
      h.step(Math.max(1, Math.round((h.p.action.ideal - h.p.action.t) * 120)));
      h.pads[0].axes[2] = h.pads[0].axes[3] = 0; h.step();
      assert(h.p.action.released, 'stick release controls shot-meter timing');
    }
  }
  const early = fixture(mode, flipped, camera); early.fake();
  early.direction(-1, 0, 'pad', false); early.step(27);
  assert(early.p.action.uuHold, 'holding past the threshold arms the immediate UU follow-up');
  early.pads[0].axes[2] = early.pads[0].axes[3] = 0;
  early.step(90);
  assert(!early.p.action && early.p.hasBall, 'neutral during the pivot cancels the automatic follow-up');
  const f = fixture(mode, flipped, camera); f.tune.set('l1_rsHold', 0.35);
  f.direction(-1, 0, 'pad', false); f.step(27);
  assert.equal(f.p.action?.type, 'move', 'longer shared threshold keeps the immediate move running');
  f.step(18); assert.equal(f.p.action?.type, 'shot', 'the tuned hold threshold converts the move');
  console.log(`PASS ${mode} flipped=${flipped} ${camera}: right-stick flick vs hold, four UU directions, layup/jumper follow-ups, release timing and l1_rsHold`);
}

{
  const f = fixture();
  const room = fs.readFileSync(path.join(__dirname, '..', 'js/rooms.js'), 'utf8');
  const clean = vm.runInContext(room.slice(room.indexOf('  function cleanInput('), room.indexOf('  function incoming(')) + '\ncleanInput;', f.ctx);
  assert.equal(clean({ rs: true, dx: -1 }).rs, true);
  assert.equal(clean({ rs: 'true' }).rs, false);
  assert.equal(clean(null), null);
  f.direction(-1, 0, 'pad', false); f.step(12);
  f.p.hasBall = false; f.d.hasBall = true; f.b.holder = f.d.id; f.step();
  f.pads[0].axes[2] = 0; f.step();
  assert.equal(f.p.rsGesture, null, 'possession loss discards a pending stick gesture');
  assert(!f.p.action, 'no stale dribble or shot after gesture interruption');
}
console.log('PASS right-stick metadata survives host sanitization and pending gestures clear on possession loss');

{
  const f = fixture('5v5'); f.p.y = f.ctx.PH.render.HOOP.y - 3.5;
  f.fake(); f.key('ShiftLeft'); f.p.speed = 4; f.leftShot(0, 1); f.step();
  assert.equal(f.p.action?.mv, 'uuForward', '5V5 physical X/J starts UU even when RT maps shoot to finish');
  while (f.p.action?.kind === 'uu') f.step();
  assert(['layup', 'dunk'].includes(f.p.action?.type), 'physical X remains held through the pivot');
}
console.log('PASS 5V5 sprint + physical X/J still starts and holds through the directional pivot');

for (const [mode, flipped, camera] of [['1v1', false, '2k'], ['3v3', false, '2k'], ['5v5', false, '2k'], ['5v5', true, '2k'], ['5v5', true, 'broadcast']]) {
  for (const [x, y, variant] of [[-1, 0, 'hop'], [Math.SQRT1_2, -Math.SQRT1_2, 'euro'], [0, -1, 'floater'], [0, 1, 'normal']]) {
    for (const timing of ['early', 'ideal', 'late']) {
      const f = fixture(mode, flipped, camera, 'curry');
      Object.assign(f.p.r, { lay: 0.9, spd: 0.85, acc: 0.85 });
      Object.assign(f.p, { y: f.ctx.PH.render.HOOP.y - 3.2, speed: 4, vy: 4, face: Math.PI / 2 });
      f.direction(x, y, 'pad', false); f.step();
      const a = f.p.action;
      assert.equal(a?.type, 'layup', 'a reachable drive finish starts on stick deflection, not neutral');
      assert.equal(a.v, variant); assert.equal(a.btn, 'a3');
      assert(!a.tap && a.tapAt == null, 'the initiating stick input is still held');
      const target = timing === 'early' ? 0.15 : a.ideal + (timing === 'late' ? 0.07 : 0);
      for (let i = 0; i < 240 && (a.inSteps || a.t < target - 1 / 240); i++) f.step();
      assert(!a.inSteps && !a.released && !a.tap, 'holding beyond rsHold keeps the selected finish and its meter live');
      assert.strictEqual(f.p.action, a);
      assert(f.p.hasBall);
      f.pads[0].axes[2] = f.pads[0].axes[3] = 0; f.step();
      assert(a.released && a.relAt >= 0, 'returning the stick to neutral releases the finish at the actual meter time');
      assert.equal(a.tapAt, undefined, 'the finish was not forced into an early gather tap');
      const e = f.G.lastShot.e;
      if (timing === 'ideal') assert(Math.abs(e) < 0.1, `timed release has near-zero error, got ${e}`);
      else if (timing === 'early') assert(e < -0.5, 'deliberately early release retains its penalty');
      else assert(e > 0.4 && e < 0.8, 'late release retains its actual timing error');
    }
  }
  console.log(`PASS ${mode} flipped=${flipped} ${camera}: drive stick starts hop/euro/floater/normal finishes immediately, holds their meters and times early/ideal/late neutral releases`);
}

{
  const f = fixture();
  Object.assign(f.p, { y: f.ctx.PH.render.HOOP.y - 3.2, speed: 4, vy: 4 });
  f.direction(-1, 0, 'pad'); f.step();
  const a = f.p.action;
  assert.equal(a?.type, 'layup');
  assert(a.tap && a.tapAt < 0, 'a genuine quick drive flick releases during the gather, rather than creating a second gesture');
  assert.equal(f.p.rsGesture, null);
  assert.equal(f.p.ib, null);
  const far = fixture();
  Object.assign(far.p, { y: far.ctx.PH.render.HOOP.y - 6.5, speed: 4, vy: 4 });
  far.direction(-1, 0, 'pad', false); far.step();
  assert.equal(far.p.action?.type, 'move', 'an unreachable lateral finish immediately dispatches a dribble move');
}
console.log('PASS drive quick flick is an explicit early release; unreachable finishes immediately dispatch dribble moves');

for (const [mode, flipped, camera] of [['1v1', false, '2k'], ['5v5', false, '2k'], ['5v5', true, '2k'], ['5v5', true, 'broadcast']]) {
  for (const binding of mode === '1v1' ? ['stick', 'pad', 'B'] : ['stick', 'pad', 'B']) {
    for (const [mv, x, y] of directions) {
      const f = fixture(mode, flipped, camera), { p, b, step } = f;
      f.fake(); const start = [p.x, p.y], stamina = p.stam;
      f.direction(x, y, binding); step();
      assert.equal(p.action?.mv, mv, `${mode} ${flipped} ${camera} ${binding}`);
      assert.equal(p.action.name, variantNames[mv]);
      assert(f.G.floats.some(q => q.pid === p.id && q.text === variantNames[mv]), 'variant name shows in simple feedback');
      assert(p.stam < stamina, 'existing move path charges stamina');
      f.neutral(); step(44);
      const dx = p.x - start[0], dy = p.y - start[1];
      const distance = mv === 'uuForward' ? 1.5 : mv === 'uuBack' ? 1.15 : 1.25;
      assert(dx * x + dy * y > distance * 0.85, `${mv} enlarged displacement ${dx},${dy}`);
      assert(Math.abs(dx * y - dy * x) < 0.15, 'no sideways drift');
      assert(p.hasBall && b.holder === p.id && b.state === 'held');
    }
  }
  console.log(`PASS ${mode} flipped=${flipped} ${camera}: four variants, keyboard/right-stick/B bindings, directional displacement, stamina and possession`);
}

for (const expired of [false, true]) {
  const f = fixture();
  if (expired) { f.fake(); f.step(130); }
  f.direction(-1, 0); f.step();
  assert.notEqual(f.p.action?.kind, 'uu');
}
for (const wait of [0, 36]) {
  const f = fixture(); f.fake(); f.step(wait); f.direction(0, 1); f.step();
  assert.equal(f.p.action?.mv, 'uuForward');
}
{
  const f = fixture(); f.fake();
  f.step(120);
  f.tune.set('l1_fkMin', 0.4); f.tune.set('l1_fkFrac', 0.8); f.tune.set('l1_fkGap', 0);
  f.key('KeyJ'); f.step(32); f.key('KeyJ', false); f.step();
  assert(f.p.action.jf && f.p.z > 0, 'real early airborne release enters fast-landing fake');
  f.direction(0, 1); f.step(); assert.equal(f.p.action?.kind, 'uu');
  f.neutral(); f.step(45); assert.equal(f.p.z, 0); assert(f.p.hasBall);
}
for (const failure of ['ratings', 'stamina', 'possession', 'dead']) {
  const f = fixture(); f.fake();
  if (failure === 'ratings') { f.tune.set('l1_uuReq', 0.45); Object.assign(f.p.r, { hnd: 0.1, post: 0.1, close: 0.1 }); }
  if (failure === 'stamina') f.p.stam = 0;
  if (failure === 'possession') { f.p.hasBall = false; f.d.hasBall = true; f.b.holder = f.d.id; }
  if (failure === 'dead') { f.G.phase = 'over'; f.b.dead = true; }
  f.direction(0, 1); f.step(); assert.notEqual(f.p.action?.kind, 'uu', failure);
}
console.log('PASS fake-only trigger, post-fake window/expiry, fast landing, rating/stamina gates, possession loss and dead-ball rejection');

for (const [mv, x, y] of directions) {
  const f = fixture();
  f.p.y = f.ctx.PH.render.HOOP.y - (mv === 'uuForward' ? 2.8 : 5);
  f.fake(); f.direction(x, y); f.step(); f.neutral();
  f.step(16); f.key('KeyJ'); f.step();
  assert.equal(f.p.action.kind, 'uu', 'shoot buffers without cutting the pivot short');
  f.step(40);
  assert.equal(f.p.action?.type, mv === 'uuForward' ? 'layup' : 'shot', mv);
  if (mv === 'uuBack') assert.equal(f.p.action.v, 'stepback');
  assert(f.p.hasBall);
}
console.log('PASS buffered shot chains: toward becomes near-rim layup, away becomes stepback, lateral becomes jump shot');

function bonus(bit, recover = false, switchDefender = false, delayed = false) {
  const f = fixture(); f.tune.set('l1_uuRecover', 2);
  f.fake();
  if (bit && !delayed) Object.assign(f.d, { z: 0.5, vz: 0 });
  f.direction(0, -1); f.step(); f.neutral();
  if (delayed) Object.assign(f.d, { z: 0.5, vz: 0 });
  f.step(15);
  f.key('KeyJ'); f.step(42);
  assert.equal(f.p.action.type, 'shot');
  if (recover) Object.assign(f.d, { z: 0, vz: 0 });
  if (switchDefender) {
    const other = f.gm.t5.makePlayer(2, 'joe', 'cpu', f.d.team);
    Object.assign(other, { x: f.p.x + 0.2, y: f.p.y, off: false, tm: 1 });
    f.G.players.push(other);
  }
  f.gm._dbg.releaseShot(f.p, 0.7, 'shot');
  return { ...f.G.lastShot, expectedBonus: 0.08 * Math.max(0, Math.min(1, ((f.p.r.close + f.p.r.lay) / 2 - 0.55) / (0.92 - 0.55))) };
}
const normal = bonus(false), bitten = bonus(true, true);
assert.equal(normal.uuBonus, 0); assert.equal(bitten.uuBonus, bitten.expectedBonus);
assert(bitten.prob > normal.prob);
const delayedBonus = bonus(true, true, false, true);
assert.equal(delayedBonus.uuBonus, delayedBonus.expectedBonus, 'a defender biting during the pivot also grants the quality-scaled bonus');
assert.equal(bonus(true, true, true).uuBonus, 0, 'a different nearest defender removes the bite bonus');
console.log('PASS defender-bit probability bonus and normal-contest non-bite case');

{
  const f = fixture(); f.fake();
  assert.equal(f.d.z, 0, 'defender stays grounded during the fake');
  f.direction(0, -1); f.step(); f.neutral(); f.step(15);
  f.key('KeyJ'); f.step(42);
  assert.equal(f.p.action.type, 'shot');
  assert.equal(f.p.action.uu.def, -1, 'no bite recorded during the fake or pivot');
  Object.assign(f.d, { z: 0.5, vz: 3 });
  f.step();
  assert.equal(f.p.action.type, 'shot');
  assert(f.d.z > 0.05, 'defender jumps to contest the real shot');
  f.gm._dbg.releaseShot(f.p, 0.7, 'shot');
  assert.equal(f.G.lastShot.uuBonus, 0, 'a real-shot contest is not a pump-fake bite');
}
console.log('PASS defender jumping only at the follow-up shot grants no bite bonus');

for (const chance of [0, 1]) {
  const f = fixture(); f.fake(); f.tune.set('l1_uuCpu', chance);
  Object.assign(f.d, { z: 0.5, vz: 0 }); f.p.ctrl = 'cpu';
  const input = f.gm.t5.aiInput(f.p, 1 / 120);
  assert.equal(!!input.a3, !!chance);
}
console.log('PASS CPU fake-follow-up chance uses the shared directional move input');

{
  const f = fixture('5v5'); f.fake();
  f.key('KeyK'); f.step(); f.key('KeyK', false); f.step();
  assert.notEqual(f.p.action?.kind, 'uu');
  assert(f.team.T.cnt.passes > 0 || f.team.T.qPass, 'A remains a pass');
}
console.log('PASS 5V5 A remains pass');
