const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function fixture(mode = '1v1', flipped = false, camera = '2k') {
  const listeners = {}, pads = [];
  const ctx = vm.createContext({ navigator: { getGamepads: () => pads }, performance: { now: () => 0 },
    setTimeout() {}, addEventListener: (name, cb) => { listeners[name] = cb; } });
  ctx.window = ctx;
  for (const name of ['tune', 'render', 'input', 'roster', 'r5', 'game', 'b5', 'team5'])
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', name + '.js'), 'utf8'), ctx);
  const { game: gm, T5: team, TUNE: tune } = ctx.PH;
  gm.seed(7);
  Object.assign(gm.G.train, { role: 'off', dummy: 'stand', gap: 1.5, infStam: false });
  gm.newGame({ mode: 'train', arch0: 'luka', arch1: 'joe' });
  let p = gm.G.players[0], d = gm.G.players[1];
  if (mode === '5v5') {
    team.start({ home: 'LAL', away: 'BOS', human: flipped ? 1 : 0 });
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
  const step = (n = 1) => { for (let i = 0; i < n; i++) (mode === '5v5' ? team : gm).tick(1 / 120); };
  const fake = () => { key('KeyJ'); step(); key('KeyJ', false); step(); assert.equal(p.action.type, 'fake'); };
  const raw = (x, y) => {
    if (mode !== '5v5') return [x, y];
    const X = team.stick(1, 0), Y = team.stick(0, 1);
    return [x * X.x + y * X.y, x * Y.x + y * Y.y];
  };
  const direction = (x, y, binding = 'stick') => {
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
  };
  const neutral = () => { pads.length = 0; for (const k of ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyL', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']) key(k, false); };
  return { ctx, gm, G, p, d, b, team, tune, pads, key, step, fake, direction, neutral };
}

const directions = [['uuForward', 0, 1], ['uuBack', 0, -1], ['uuLeft', -1, 0], ['uuRight', 1, 0]];
const variantNames = { uuForward: '上下步·突篮', uuBack: '上下步·后撤', uuLeft: '上下步·左', uuRight: '上下步·右' };
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
      assert(dx * x + dy * y > 0.5, `${mv} displacement ${dx},${dy}`);
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
  if (failure === 'ratings') Object.assign(f.p.r, { hnd: 0.1, post: 0.1, close: 0.1 });
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
  return f.G.lastShot;
}
const normal = bonus(false), bitten = bonus(true, true);
assert.equal(normal.uuBonus, 0); assert.equal(bitten.uuBonus, 0.08);
assert(bitten.prob > normal.prob);
assert.equal(bonus(true, true, false, true).uuBonus, 0.08, 'a defender biting during the pivot also grants the bonus');
assert.equal(bonus(true, true, true).uuBonus, 0, 'a different nearest defender removes the bite bonus');
console.log('PASS defender-bit probability bonus and normal-contest non-bite case');

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
