const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function fixture(hand = 1, arch0 = 'luka', hooks = false) {
  const listeners = {};
  const pads = [];
  const ctx = vm.createContext({
    navigator: { getGamepads: () => pads },
    performance: { now: () => 0 },
    setTimeout() {},
    addEventListener: (name, cb) => { listeners[name] = cb; },
  });
  ctx.window = ctx;
  for (const name of ['tune', 'render', 'input', 'roster', 'r5', 'game', 'b5', 'team5', 'team3']) {
    let source = fs.readFileSync(path.join(__dirname, '..', 'js', name + '.js'), 'utf8');
    if (hooks && name === 'game') source = source.replace('  PH.game = {', '  PH.game = { testStartCombo: cbStart,');
    vm.runInContext(source, ctx);
  }
  const { game, rig } = ctx.PH;
  game.seed(7);
  Object.assign(game.G.train, { role: 'off', dummy: 'stand', gap: 1.5, infStam: false });
  game.newGame({ mode: 'train', arch0, arch1: 'joe' });
  const [p, d] = game.G.players;
  const b = game.G.ball;
  Object.assign(game.G, { phase: 'live', needClear: false, off: 0 });
  Object.assign(p, { x: 0, y: 4.4, hand, handX: hand * 0.33, hasBall: true });
  Object.assign(d, { off: false, x: 0, y: 5.9, stun: 0 });
  Object.assign(b, { state: 'held', holder: 0, dead: false });
  const key = (code, down = true) => listeners[down ? 'keydown' : 'keyup']({ code, preventDefault() {} });
  const step = (n = 1) => { for (let i = 0; i < n; i++) game.tick(1 / 120); };
  return { game, p, d, b, rig, key, step, pads, input: ctx.PH.input, team3: ctx.PH.T3, team5: ctx.PH.T5 };
}

for (const moving of [false, true]) for (const face of [0, Math.PI / 2, -Math.PI / 2]) {
  const { game, p, d } = fixture();
  const fx = Math.cos(face), fy = Math.sin(face);
  Object.assign(p, { face, vx: moving ? fx * 4 : 0, vy: moving ? fy * 4 : 0, speed: moving ? 4 : 0 });
  d.off = true;
  const start = [p.x, p.y];
  const step = (n = 1, hesi = true) => { for (let i = 0; i < n; i++) game.tick(1 / 120, () => ({ mx: moving ? fx : 0, my: moving ? fy : 0, a3: hesi, hesi })); };
  step(40);
  const dx = p.x - start[0], dy = p.y - start[1];
  assert(Math.abs(dx * fx + dy * fy + game.K.hesiBack) < 0.001);
  assert(Math.abs(dx * -fy + dy * fx) < 0.001);
  assert(Math.hypot(dx, dy) >= 0.2 && Math.hypot(dx, dy) <= 0.4);
  const held = [p.x, p.y];
  step(120);
  assert.deepEqual([p.x, p.y], held);
  assert.equal(p.speed, 0);
  step(80, false);
  if (!moving) assert.deepEqual([p.x, p.y], held);
}

for (const [x, y, face] of [[7.19, 6, Math.PI], [-7.19, 6, 0], [0, 0.31, Math.PI / 2], [0, 13.69, -Math.PI / 2]]) {
  const { game, p, d } = fixture();
  Object.assign(p, { x, y, face }); d.off = true;
  for (let i = 0; i < 80; i++) game.tick(1 / 120, () => ({ mx: 0, my: 0, a3: true, hesi: true }));
  assert(Math.abs(p.x) <= 7.2 && p.y >= 0.3 && p.y <= 13.7, 'back-step respects move-edge bounds');
}

{
  const { game, p, d } = fixture();
  Object.assign(p, { face: Math.PI / 2 });
  Object.assign(d, { x: p.x, y: p.y - game.K.bdR - 0.05, dummy: false, ctrl: 'p2', stun: 3 });
  for (let i = 0; i < 60; i++) game.tick(1 / 120, q => q === p ? { mx: 0, my: 0, a3: true, hesi: true } : { mx: 0, my: 0 });
  assert(p.y > d.y, 'back-step cannot pass through a defender behind the handler');
  assert(Math.hypot(p.x - d.x, p.y - d.y) >= game.K.bdR - 0.001);
}

for (const mode of ['1v1', '3v3']) for (const binding of ['KeyH', 'R3']) {
  for (const [dir, kind] of [['KeyA', 'cross'], ['KeyD', 'inout'], ['KeyS', 'stepback'], [null, null]]) {
    const f = fixture();
    const { game, key, pads, input, team3 } = f;
    let p = f.p, step = f.step;
    if (mode === '3v3') {
      const slots = ['luka', 'curry', 'jokic', 'joe', 'durant', 'giannis'].map((arch, i) => ({ arch, role: i === 0 ? 'human' : 'cpu' }));
      team3.start({ slots, human: 0, local: 0, clock: 0, replay: false });
      p = game.G.players[0];
      Object.assign(game.G, { phase: 'live', off: 0, needClear: false });
      for (const other of game.G.players) if (other !== p) Object.assign(other, { hasBall: false, x: -6 + other.id, y: 1, stun: 3 });
      Object.assign(p, { x: 0, y: 4.4, hand: 1, hasBall: true, action: null });
      Object.assign(game.G.ball, { state: 'held', holder: 0, dead: false });
      step = (n = 1) => { for (let i = 0; i < n; i++) { team3.tick(1 / 120, { 0: input.read3(true) }); input.endTick(); } };
    }
    const gp = { index: 0, connected: true, axes: [0, 0, 0, 0], buttons: Array.from({ length: 16 }, () => ({ pressed: false })) };
    pads.push(gp);
    const press = (down) => binding === 'R3' ? gp.buttons[11].pressed = down : key(binding, down);
    key('KeyW'); step(8);
    press(true); step();
    assert.equal(p.action.kind, 'hesi', mode + ' ' + binding + ' starts while moving');
    assert.equal(p.action.hesiHold, 'hesi');
    const start = [p.x, p.y];
    const face = p.action.f0;
    step(80);
    assert.equal(p.action.kind, 'hesi');
    const dx = p.x - start[0], dy = p.y - start[1];
    assert(dx * Math.cos(face) + dy * Math.sin(face) < -0.2);
    assert(Math.hypot(dx, dy) <= 0.33);
    const held = [p.x, p.y];
    step(40);
    assert.deepEqual([p.x, p.y], held);
    key('KeyW', false);
    if (dir) key(dir);
    step();
    press(false); step();
    if (kind) assert.equal(p.action.kind, kind, mode + ' ' + binding + ' release ' + dir);
    else { step(80); assert.equal(p.action, null); }
    assert(p.hasBall);
  }
}

{
  const source = fs.readFileSync(path.join(__dirname, '../js/rooms.js'), 'utf8');
  const clean = vm.runInNewContext(source.slice(source.indexOf('  function cleanInput('), source.indexOf('  function incoming(')) + '\ncleanInput;');
  assert.equal(clean({ hesi: true }).hesi, true);
  assert.equal(clean({}).hesi, false);
  assert.equal(clean({ hesi: 'true' }).hesi, false);
  assert.equal(clean(null), null);
}

{
  const { input, key } = fixture();
  key('Numpad5');
  assert(input.read(1, true, false).hesi);
  assert(!input.read(0, true, false).hesi);
  assert(!input.read(1, false, false).hesi);
}

// After the short back-step, moving the stick only previews the release direction.
{
  const { p, d, key, step } = fixture();
  const start = [p.x, p.y];
  Object.assign(p, { vy: 5, speed: 5 });
  key('KeyL'); step();
  assert.equal(p.action.kind, 'hesi');
  key('KeyA'); step(160);
  assert.equal(p.action.kind, 'hesi');
  assert(Math.abs(p.x - start[0]) < 0.001);
  assert(p.y < start[1] - 0.2 && p.y > start[1] - 0.34);
  const held = [p.x, p.y];
  assert.equal(p.speed, 0);
  assert(p.hasBall);
  assert.equal(d.action, null);
  key('KeyA', false); step();
  key('KeyL', false); step(80);
  assert.equal(p.action, null);
  assert.deepEqual([p.x, p.y], held);
}

// Both arms open sideways; the ball follows the same palm, below the head.
for (const [arch, hand] of [['kyrie', 1], ['kyrie', -1], ['shaq', 1], ['shaq', -1]]) {
  const { p, b, rig, key, step } = fixture(hand, arch);
  key('KeyL'); step(80);
  const k = rig(p);
  const palm = hand > 0 ? k.handR : k.handL, offHand = hand > 0 ? k.handL : k.handR;
  const fx = Math.cos(p.face), fy = Math.sin(p.face);
  const lateral = (from, to) => fy * (to[0] - from[0]) - fx * (to[1] - from[1]);
  assert(lateral(k.shL, k.handL) < -0.28 && lateral(k.shR, k.handR) > 0.28);
  assert(k.handL[2] < k.shL[2] + 0.02 && k.handR[2] < k.shR[2] + 0.02);
  assert(b.z > k.pelvis[2] + 0.15 && b.z < k.chest[2] + 0.055 && b.z < k.head[2] - 0.24);
  assert.deepEqual([b.x, b.y], Array.from(palm.slice(0, 2)));
  assert(b.z > palm[2] && b.z - palm[2] < 0.15);
  assert(Math.hypot(b.x - offHand[0], b.y - offHand[1]) > 0.8);
}

for (const [hand, dir, kind, side, nextHand] of [
  [1, 'KeyA', 'cross', -1, -1], [-1, 'KeyD', 'cross', 1, 1],
  [1, 'KeyD', 'inout', 1, 1], [-1, 'KeyA', 'inout', -1, -1],
  [1, 'KeyS', 'stepback', 0, 1],
]) {
  const { p, key, step } = fixture(hand);
  key('KeyL'); step(28);
  const y = p.y;
  key(dir); step(12);
  assert.equal(p.action.kind, 'hesi');
  key('KeyL', false); step();
  assert.equal(p.action.kind, kind);
  assert.equal(p.hand, nextHand);
  key(dir, false); step(28);
  assert(p.hasBall);
  if (side) assert(p.x * side > 0.15);
  if (kind === 'inout') assert(Math.abs(p.y - y) < 1e-9 && p.action.hesiDrive);
  if (kind === 'stepback') { assert(p.y < y - 0.2); assert(!p.action.hesiBurst); }
}

// Release before the fake reaches its peak: keep the release-frame direction.
{
  const { p, key, step } = fixture();
  key('KeyL'); step();
  key('KeyA'); key('KeyL', false); step();
  key('KeyA', false); key('KeyD'); step(22);
  assert.equal(p.action.kind, 'cross');
  assert(p.action.dx < 0);
}

// A right-stick flick does not override the left stick or keep the dribble button held.
{
  const { p, step, pads } = fixture();
  const gp = { connected: true, axes: [0, 0, 0, 0], buttons: Array.from({ length: 16 }, () => ({ pressed: false })) };
  pads.push(gp);
  gp.buttons[1].pressed = true; step(40);
  gp.buttons[1].pressed = false; gp.axes[0] = -0.82; gp.axes[2] = 0.9; step();
  assert.equal(p.action.kind, 'cross');
  assert(p.action.dx < 0);
}

// A neutral press buffers during another move; a quick release keeps its direction.
{
  const { p, key, step } = fixture();
  key('KeyD'); key('KeyL'); step();
  key('KeyD', false); key('KeyL', false); step();
  key('KeyL'); step();
  assert(p.buf.hesi);
  key('KeyA'); key('KeyL', false); step();
  key('KeyA', false); key('KeyD'); step(48);
  assert.equal(p.action.kind, 'cross');
  assert(p.action.dx < 0);
}

// An ordinary action cooldown also preserves the hesitation press and release.
{
  const { p, key, step } = fixture();
  p.cd = 0.12;
  key('KeyL'); step();
  key('KeyS'); key('KeyL', false); step();
  key('KeyS', false); step(36);
  assert.equal(p.action.kind, 'stepback');
}

// The post-up key and the original direction-first dribble still work.
{
  const { p, key, step } = fixture();
  key('KeyQ'); step(30);
  assert(p.post && !p.action);
  key('KeyQ', false); step();
  key('KeyD'); key('KeyL'); step();
  assert(p.action.kind !== 'hesi');
}

// A hesitation cannot unlock moves outside the handler's ratings.
for (const dir of ['KeyS', 'KeyD']) {
  const { p, key, step } = fixture(1, 'shaq');
  key('KeyL'); step(40);
  key(dir); key('KeyL', false); step();
  assert.equal(p.action.kind, 'hesi');
  assert.equal(p.action.hesiHold, null);
}

// Losing possession during the fake discards the pending branch.
{
  const { p, d, b, key, step } = fixture();
  key('KeyL'); step(40);
  p.hasBall = false; d.hasBall = true; b.holder = 1;
  key('KeyA'); key('KeyL', false); step();
  assert.equal(p.action, null);
}

// Pull-up privileges can interrupt the held fake; other players must let it finish.
for (const [arch, canCancel] of [['kyrie', true], ['shaq', false]]) {
  const { p, key, step } = fixture(1, arch);
  key('KeyL'); step(80);
  assert.equal(p.action.kind, 'hesi');
  key('KeyJ'); step();
  if (canCancel) {
    assert.equal(p.action.type, 'shot');
    assert.equal(p.action.v, 'pullup');
  } else {
    assert.equal(p.action.kind, 'hesi');
    key('KeyL', false); step(50);
    assert.equal(p.action.type, 'shot');
  }
}

// The 5V5 binding uses the dedicated hesitation key, not a pass button.
{
  const { game, key, team5 } = fixture();
  team5.start({ home: 'LAL', away: 'BOS', human: 0 });
  const T = team5.T, p = T.ctl;
  Object.assign(T, { phase: 'live', off: 0 });
  Object.assign(game.G, { phase: 'live', off: 0 });
  for (const other of game.G.players) if (other !== p) Object.assign(other, { x: -6 + other.id, y: 1, stun: 3 });
  Object.assign(p, { x: 0, y: 6.8, hand: 1, hasBall: true });
  Object.assign(game.G.ball, { state: 'held', holder: p.id, dead: false, lastTouch: p.id });
  const step = (n = 1) => { for (let i = 0; i < n; i++) team5.tick(1 / 120); };
  key('KeyW'); key('KeyH'); step(40);
  assert.equal(p.action.kind, 'hesi');
  assert(p.y < 6.6 && p.y > 6.46);
  assert.equal(T.cnt.passes, 0);
  key('KeyW', false); key('KeyA'); key('KeyH', false); step();
  assert.equal(p.action.kind, 'cross');
  key('KeyA', false); key('KeyW'); key('KeyH'); step(75);
  assert.equal(p.action.kind, 'hesi');
  assert(p.action.hesiHold === 'hesi');
}

for (const [x, y, face] of [[0, 13.75, -Math.PI / 2], [0, -13.75, Math.PI / 2], [7.3, 6, Math.PI], [-7.3, 6, 0], [0, 13.6, -Math.PI / 2]]) {
  const { game, key, team5 } = fixture();
  team5.start({ home: 'LAL', away: 'BOS', human: 0 });
  const T = team5.T, p = T.ctl;
  Object.assign(T, { phase: 'live', off: 0, lgPoss: T.cnt.poss, lgUsed: false, lgB: null });
  Object.assign(game.G, { phase: 'live', off: 0 });
  for (const other of game.G.players) if (other !== p) Object.assign(other, { x: -6 + other.id, y: 1, stun: 3 });
  Object.assign(p, { x, y, face, hand: 1, hasBall: true, catchT: -9 });
  Object.assign(game.G.ball, { state: 'held', holder: p.id, dead: false, lastTouch: p.id });
  key('KeyH');
  for (let i = 0; i < 80; i++) {
    team5.tick(1 / 120);
    assert.equal(p.action.kind, 'hesi');
    assert.equal(T.lgUsed, false, 'hesitation must not consume the line guard');
    if (Math.abs(y) > 13.65 || Math.abs(x) > 7.27) {
      assert(Math.abs(p.x - x) < 1e-9, 'no inward snap from outside the guard zone');
      assert(Math.abs(p.y - y) < 1e-9, 'no inward snap from outside the guard zone');
    } else assert(Math.abs(p.y) <= 13.65, 'back-step stops inside the guard trigger');
  }
}

for (const mode of ['cpu', 't5']) for (const hand of [1, -1]) for (const lateral of [0, -0.4, 0.4]) {
  const { game, p: solo, d: soloDef, key, pads, team5 } = fixture(hand);
  let p = solo, d = soloDef;
  game.G.mode = mode;
  if (mode === 't5') {
    team5.start({ home: 'LAL', away: 'BOS', human: 0 });
    Object.assign(team5.T, { phase: 'live', off: 0 });
    p = team5.T.ctl;
    d = game.G.players.find(q => q.tm !== p.tm);
    for (const other of game.G.players) if (other !== p && other !== d) Object.assign(other, { x: -6 + other.id, y: 1, stun: 3 });
  }
  Object.assign(game.G, { phase: 'live', off: 0, needClear: false });
  Object.assign(p, { x: 0, y: 6.8, face: Math.PI / 2, hand, handX: hand * 0.33, hasBall: true, catchT: -9 });
  p.r.hnd = 0.9;
  Object.assign(d, { x: 0, y: 8.05, dummy: false, D: null, hasBall: false, stun: 0 });
  Object.assign(game.G.ball, { state: 'held', holder: p.id, dead: false, lastTouch: p.id });
  const pad = { connected: true, axes: [0, 0, 0, 0], buttons: Array.from({ length: 16 }, () => ({ pressed: false })) };
  pads.push(pad);
  const step = () => mode === 't5' ? team5.tick(1 / 120) : game.tick(1 / 120);
  key('KeyH'); for (let i = 0; i < 24; i++) step();
  const dfX = d.x, dfY = d.y, h = game.t5.HOOP;
  const hl = Math.hypot(h.x - dfX, h.y - dfY), fx = (h.x - dfX) / hl, fy = (h.y - dfY) / hl;
  const offset = () => (p.x - dfX) * -fy + (p.y - dfY) * fx;
  key('KeyH', false); pad.axes[0] = lateral; pad.axes[1] = -Math.sqrt(1 - lateral * lateral); step();
  const a = p.action;
  assert(a.hesiBurst, mode + ' release is a shoulder-lane burst');
  const side = Math.sign(a.dx * -fy + a.dy * fx);
  assert.notEqual(side, 0, 'forward release picks a shoulder instead of the defender body');
  let prev = offset(), frames = 0;
  while (p.action === a && frames++ < 150) {
    step();
    assert((offset() - prev) * side >= -1e-6, mode + ' burst never steers back toward the defender–hoop line');
    prev = offset();
  }
  assert(frames < 150);
  assert(Math.abs(offset()) > 0.3, 'exit has readable shoulder clearance');
  if (!lateral) {
    const heldOffset = offset();
    for (let i = 0; i < 60; i++) step();
    assert((offset() - heldOffset) * side >= -1e-6, 'holding forward after the burst does not recenter the lane');
  }
}

for (const hand of [1, -1]) {
  const { game, p, d } = fixture(hand, 'luka', true);
  game.seed(11); game.G.mode = 'cpu';
  Object.assign(d, { dummy: false, D: null, x: 0, y: 5.65, stun: 0 });
  p.ctrl = 'cpu';
  game._dbg.startMove(p, { mx: 0, my: 0 }, 'hesi');
  game.testStartCombo(p, 'H', 1);
  p.ai.plan = 'drive'; p.ai.t = 1.5;
  let burst = null, prev = 0, side = 0;
  for (let i = 0; i < 120; i++) {
    game.tick(1 / 120);
    if (!burst && p.action && p.action.hesiBurst) { burst = p.action; side = Math.sign(burst.dx); prev = p.x; }
    else if (burst && p.action === burst) { assert((p.x - prev) * side >= -1e-6, 'CPU hesitation exit must not use the reversing inout path'); prev = p.x; }
    else if (burst) break;
  }
  assert(burst && burst.hesiDrive);
}

for (const absent of [false, true]) {
  const { game, p, d } = fixture();
  const h = game.t5.HOOP;
  Object.assign(p, { x: 0, y: h.y - 2 });
  Object.assign(d, { x: h.x, y: h.y, off: absent });
  game._dbg.startMove(p, { mx: 0, my: 0 }, 'hesi');
  game._dbg.startMove(p, { mx: 0, my: 1 }, 'inout');
  assert(Number.isFinite(p.action.dx) && Number.isFinite(p.action.dy));
  assert(Math.abs(Math.hypot(p.action.dx, p.action.dy) - 1) < 1e-9);
  if (absent) { assert.equal(p.action.dx, 0); assert.equal(p.action.dy, 1); }
}

for (const hand of [1, -1]) {
  const { game, p, d } = fixture(hand);
  game.G.mode = '2p';
  Object.assign(p, { x: 0, y: 11.2, face: Math.PI / 2 });
  Object.assign(d, { x: 0, y: 12.9, dummy: false, ctrl: 'p2', stun: 0 });
  const step = inp => game.tick(1 / 120, q => q === p ? inp : game.t5.zeroInp());
  for (let i = 0; i < 24; i++) step({ mx: 0, my: 0, a3: true, hesi: true });
  const startY = p.y;
  step({ mx: 0, my: 1 });
  const a = p.action;
  assert(a.hesiBurst && a.dy > 0, 'defender beyond the rim cannot reverse a forward release');
  let prevY = p.y;
  for (let i = 0; i < 60 && p.action === a; i++) {
    step({ mx: 0, my: 1 });
    assert(p.y >= prevY - 1e-9, 'baseline burst always advances toward the hoop');
    prevY = p.y;
  }
  assert(p.y > startY + 0.4);
}

for (const hand of [1, -1]) for (const side of [1, -1]) {
  const { game, p, d } = fixture(hand);
  game.G.mode = '2p';
  Object.assign(p, { x: 0, y: 6.8, face: Math.PI / 2 });
  Object.assign(d, { x: side * 1.2, y: 7.7, dummy: false, ctrl: 'p2', stun: 0 });
  const step = inp => game.tick(1 / 120, q => q === p ? inp : game.t5.zeroInp());
  for (let i = 0; i < 24; i++) step({ mx: 0, my: 0, a3: true, hesi: true });
  const startY = p.y;
  step({ mx: side, my: 0 });
  const a = p.action;
  assert(a.hesiBurst);
  assert.equal(a.dx, side, 'keep an already-clear lateral stick direction');
  assert.equal(a.dy, 0, 'do not add forward steering into a diagonal defender');
  const dx = d.x - p.x, dy = d.y - p.y, distance = (vx, vy) => Math.sqrt(Math.max(0, dx * dx + dy * dy - Math.max(0, dx * vx + dy * vy) ** 2));
  assert(distance(a.dx, a.dy) >= distance(side, 0) - 1e-9, 'assisted ray cannot approach the body more closely than the raw stick ray');
  for (let i = 0; i < 60 && p.action === a; i++) {
    step({ mx: side, my: 0 });
    assert(Math.abs(p.y - startY) < 1e-9);
    assert(Math.hypot(p.x - d.x, p.y - d.y) > game.K.bdR, 'open lateral exit never contacts the defender');
  }
}

for (const hand of [1, -1]) for (const side of [1, -1]) {
  const { game, p, d } = fixture(hand);
  game.G.mode = '2p';
  Object.assign(p, { x: 0, y: 6.8, face: Math.PI / 2 });
  Object.assign(d, { x: side * 1.2, y: 6.9, vx: 0, vy: 0, dummy: false, ctrl: 'p2', stun: 0 });
  const step = inp => game.tick(1 / 120, q => q === p ? inp : game.t5.zeroInp());
  for (let i = 0; i < 24; i++) step({ mx: 0, my: 0, a3: true, hesi: true });
  step({ mx: side, my: 0 });
  const a = p.action, x = d.x - p.x, y = d.y - p.y, radius = game.K.bdR + 0.12;
  assert(a.hesiBurst && a.dy > 0, 'blocked outside lane must use the open inside shoulder');
  const toward = Math.max(0, x * a.dx + y * a.dy);
  assert(x * x + y * y - toward * toward >= radius * radius - 1e-9);
  for (let i = 0; i < 100 && p.action === a; i++) {
    step({ mx: side, my: 0 });
    assert(Math.hypot(p.x - d.x, p.y - d.y) >= radius - 1e-9, 'inside shoulder clears the body for the whole burst');
    assert.equal(p.stun, 0, 'open lane must not lose burst time to body contact');
  }
  assert(a.t >= a.T, 'burst completes without collision cancellation');
}

{
  const { game, p, d } = fixture();
  Object.assign(d, { x: p.x, y: p.y + 0.5 });
  game._dbg.startMove(p, { mx: 0, my: 0 }, 'hesi');
  game._dbg.startMove(p, { mx: 0, my: 1 }, 'inout');
  assert.equal(p.action.dx, 0, 'with no clear candidate keep the raw stick direction');
  assert.equal(p.action.dy, 1);
}

console.log('Hesitation: sideways one-hand fake, release directions, buffering, move requirements, post-up, possession loss, and 5V5 passed.');
console.log('PASS hesitation shoulder lanes: forward/diagonal releases, both hands, 1V1/5V5, forward-held recovery, and CPU combo exits');
console.log('PASS forward hesitation near baseline: defender beyond rim, both hands');
console.log('PASS sideways hesitation: clear stick lanes preserved against diagonal defenders, both hands and sides');
console.log('PASS blocked sideways hesitation: open inside shoulder, full burst, both hands/sides, raw fallback when no lane clears');
