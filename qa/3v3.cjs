const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

{
  const main = fs.readFileSync(path.join(__dirname, '../js/main.js'), 'utf8');
  const columns = Array.from({ length: 2 }, () => ({ chips: [], appendChild(el) { this.chips.push(el); } }));
  const players = Array.from({ length: 6 }, (_, id) => ({ tm: id < 3 ? 0 : 1, arch: { name: 'Player ' + id } }));
  const G = { mode: 't3', time: 1, players, bpops: [{ pid: 2, key: 'pick', t0: 1 }, { pid: 5, key: 'pick', t0: 1 }] };
  const ctx = vm.createContext({
    G, $: (id) => columns[{ bcol0: 0, bcol1: 1 }[id]],
    document: { createElement: () => ({ classList: { toggle() {} }, remove() {} }) },
    bTier: () => ({ t: 1, n: 'Badge' }), bHex: () => ''
  });
  vm.runInContext(main.slice(main.indexOf('  const bEls ='), main.indexOf('  const bEls5 =')) + '\nbpops();', ctx);
  assert.match(columns[0].chips[0].innerHTML, /Player 2/);
  assert.match(columns[1].chips[0].innerHTML, /Player 5/);
  console.log('PASS: 3V3 badge popups for slots 2 and 5 use the home and away HUD columns.');
}

function settleCheck(G, T3, inputs) {
  for (let i = 0; i < 120 && G.phase === 'check'; i++) T3.tick(1 / 60, inputs);
  assert.equal(G.phase, 'live', 'check ball reaches the offense');
}

function fixture(options = {}) {
  const ctx = vm.createContext({ performance: { now: () => 0 }, setTimeout: () => {} });
  ctx.window = ctx;
  vm.runInContext('let seed = 7; Math.random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296)', ctx);
  for (const name of ['tune', 'ptype', 'render', 'roster', 'measurements', 'r5', 'game', 'team3']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../js', name + '.js'), 'utf8'), ctx, { filename: name + '.js' });
  }
  const { game, T3 } = ctx.PH;
  game.seed(7);
  const slots = ['curry', 'edwards', 'jokic', 'lebron', 'durant', 'giannis'].map((arch, i) => ({ arch, role: options.human === i ? 'human' : 'cpu' }));
  T3.start({ slots, target: 21, clock: 14, replay: false, ...options });
  if (options.settle !== false) settleCheck(game.G, T3);
  return { ctx, G: game.G, Gm: game, api: game.t5, T3, run: (count, inputs) => { for (let i = 0; i < count; i++) T3.tick(1 / 60, inputs); } };
}

{
  const { ctx, G, T3 } = fixture({ human: 0, local: 0 });
  const nameRows = [], staminaRows = [], strokes = [], teamNames = new Map();
  const rosterNames = G.players.map(p => p.arch.name);
  const canvas = () => {
    const c = new Proxy({
      createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }),
      measureText: () => ({ width: 8 }),
      stroke() { strokes.push(this.strokeStyle); },
      fillText(text, x, y) {
        if (text === T3.holder()?.arch.name) nameRows.push(y + 12);
        if (rosterNames.includes(text) && this.fillStyle !== '#15101f') teamNames.set(text, { font: this.font, x, y });
      },
      fillRect(x, y, w, h) { if (w === 32 && h === 4 && this.fillStyle === '#15101f') staminaRows.push(y + h); },
    }, { get: (obj, key) => obj[key] ?? (() => {}) });
    return { getContext: () => c };
  };
  ctx.document = { createElement: canvas };
  const R = ctx.PH.render, p = T3.holder();
  R.init(canvas());
  const defaultPitch = R.cam.fz;
  const visible = (q) => q.x > 12 && q.x < R.W - 12 && q.y > 12 && q.y < R.H - 12;
  const rim = () => R.proj(R.HOOP.x, R.HOOP.y, R.HOOP.z);
  const feet = () => R.proj(p.x, p.y, 0);
  const move = (x, y) => {
    Object.assign(p, { x, y, vx: 0, vy: 0 });
    Object.assign(G.ball, { x, y, z: 1.3 });
  };
  move(0, 6);
  R.render(G);
  const clearFrame = { ...G, phase: 'live', time: 1, needClear: true };
  strokes.length = 0;
  R.render(clearFrame);
  assert(!strokes.includes('#ff3b30'), '3V3 does not repaint the arc while the ball needs clearing');
  Object.assign(clearFrame, { needClear: false, clearOk: clearFrame.time });
  strokes.length = 0;
  R.render(clearFrame);
  assert(!strokes.includes('#7dff8a'), '3V3 does not repaint the arc after clearing');
  console.log('PASS: 3V3 keeps the original court arc before and after clearing the ball.');
  assert(feet().s > 30, '3V3 uses close framing at the arc');
  assert(R.cam.fz < defaultPitch, 'elevated end-on camera looks downward more than 1V1');
  assert.equal(R.proj(0, 2, 0).x, rim().x, 'court centerline points straight to the hoop');
  assert(R.proj(0, 2, 0).y > R.proj(0, 10, 0).y, 'offense attacks up the screen');
  const hintY = 253;
  move(3.3, 6.25);
  R.render(G, 1);
  nameRows.length = staminaRows.length = 0;
  teamNames.clear();
  R.render(G, 0, hintY);
  assert(feet().s > 30, 'keep close framing when clearing the hints at the wing');
  assert(nameRows.length && Math.max(...nameRows) < hintY);
  assert(staminaRows.length && Math.max(...staminaRows) < hintY);
  assert.deepEqual([...teamNames.keys()].sort(), [...rosterNames].sort());
  assert([...teamNames.values()].every(({ font, y }) => font.startsWith('12px') && y + 12 < hintY));
  console.log('PASS: 3V3 draws six native-12px under-foot names above the hint bar.');
  assert(visible(feet()) && visible(rim()));
  const origin = R.cam.x;
  move(7.4, 1);
  R.render(G, 1 / 60);
  const first = R.cam.x;
  assert(visible(feet()) && visible(rim()), 'keep the rim and sideline handler in frame during the pan');
  R.render(G, 1);
  assert(origin < first && first < R.cam.x, 'the camera pans rather than jumping to the handler');
  assert(Math.abs(rim().x - R.W / 2) <= R.W * 0.12 && rim().y < R.H / 3, 'keep the hoop near top-center while panning');
  G.ball = { ...G.ball, state: 'shot', holder: -1, x: -4, y: 7, z: 6 };
  R.render(G, 1 / 60, hintY);
  assert(visible(R.proj(G.ball.x, G.ball.y, G.ball.z)) && visible(rim()), 'follow a shot from the snapshot ball');
  assert(feet().y < hintY, 'keep the controlled player clear while the camera follows the shot');
  console.log('PASS: end-on 3V3 camera attacks upward and pans with the ball while keeping the rim near top-center.');
  console.log('PASS: 3V3 player, name tag and stamina bar clear the hints with close wing framing.');

  const guest = G.players[2];
  p.ring = false;
  guest.ring = true;
  Object.assign(p, { x: 7.4, y: 5 });
  Object.assign(guest, { x: 6.8, y: 5, z: 0 });
  G.ball = { ...G.ball, state: 'held', holder: p.id, x: p.x, y: p.y, z: 1.3 };
  const ball = () => R.proj(G.ball.x, G.ball.y, G.ball.z);
  const guestFeet = () => R.proj(guest.x, guest.y, 0);
  const guestHead = () => R.proj(guest.x, guest.y, guest.z + guest.h);
  R.render(G, 3);
  const close = ball().s;
  guest.ring = false;
  R.render(G, 0);
  assert.equal(ball().s, close, 'a nearby local player needs no extra zoom out');
  guest.ring = true;
  guest.x = -7.4;
  R.render(G, 0);
  assert(ball().s < close, 'widen when the local slot is across the court from the receiver');
  assert([guestFeet(), guestHead(), ball(), rim()].every(visible), 'frame the off-ball guest, receiver and rim even without a control hint');
  const minX = Math.min(guestFeet().x, guestHead().x, ball().x), maxX = Math.max(guestFeet().x, guestHead().x, ball().x);
  assert(maxX - minX > R.W - 95, 'use the available width instead of zooming farther out');
  const wideZoom = R.cam.F;
  guest.x = 6.8;
  R.render(G, 1 / 60);
  assert(wideZoom < R.cam.F && ball().s < close, 'zoom back in gradually as the local player approaches the ball');
  guest.x = -7.4;
  G.ball = { ...G.ball, state: 'pass', holder: -1, z: 2 };
  R.render(G, 1 / 60, hintY);
  assert([guestFeet(), guestHead(), ball(), rim()].every(visible) && guestFeet().y < hintY, 'keep the off-ball guest framed when following the pass');
  console.log('PASS: off-ball local slot 2, ball, and rim stay framed across the court; zoom remains close when the local player is near the ball.');
  G.replay = { view: {} };
  R.render(G);
  assert.equal(R.cam.fz, defaultPitch, 'replay restores the existing camera pitch');
}

{
  const { G, Gm, T3, api } = fixture({
    slots: ['curry', 'edwards', 'jokic', 'lebron', 'durant', 'giannis'].map((arch, id) => ({
      arch, role: id === 0 ? 'human' : id === 2 ? 'remote' : 'cpu'
    }))
  });
  assert.equal(T3.holder().id, 0);
  assert.equal(G.players[2].hasBall, false);
  const main = fs.readFileSync(path.join(__dirname, '../js/main.js'), 'utf8');
  const els = new Map(), noop = () => {};
  const $ = (id) => {
    if (!els.has(id)) els.set(id, { style: {}, classList: { toggle: noop, add: noop, contains: () => true } });
    return els.get(id);
  };
  const ctx = vm.createContext({
    G, GM: Gm, PH: { T3 }, CFG: Gm.CFG, $, stage: $('stage'), cues: [$('cue0'), $('cue1')], screen: 'play',
    matchConfig: { mode: 't3' }, localSlot: 2, opts: { info: 'show' }, TR: {}, hasPad: true, padN: 1, isTouch: true,
    frameN: 9, hintKey: '', lastClock: '', lastTB2: '', lastS0: -1, lastS1: -1,
    TT: {}, pcRatings: noop, bList: () => [], fitBadgePops: noop, pcards5: noop, bpops: noop, drawFloats: noop,
    show: noop, shotCard: noop
  });
  vm.runInContext(main.slice(main.indexOf('  function positionBadge('), main.indexOf('  function pkCard(')) +
    main.slice(main.indexOf('  function cardHTML('), main.indexOf('  function fitBadgePops(')) +
    main.slice(main.indexOf('  function pcards()'), main.indexOf('  // V3.9g 5V5 信息卡')) +
    main.slice(main.indexOf('  function hud('), main.indexOf('  // ---------- 结算面板')) + '\nlet overShown = false;', ctx);
  G.banner = null;
  vm.runInContext('hud()', ctx);
  assert.match($('pc0').innerHTML, /<u class="ro">进攻<\/u>/);
  assert.match($('pc1').innerHTML, /<u class="rd">防守<\/u>/);
  assert.match($('pc0').innerHTML, /data-position="内线"/);
  assert.match($('pc1').innerHTML, /字母哥.*data-position="内线"/);
  assert.match($('hint').innerHTML, /^进攻.*<b>Y<\/b> 抢篮板/);
  assert.match($('hint').innerHTML, /<b>A<\/b> 要球/);
  assert.match($('hint').innerHTML, /<b>R3<\/b> 掩护/);
  assert.equal($('tb1').textContent, '篮板');

  T3.holder().hasBall = false;
  api.pickup(G.players[2]);
  vm.runInContext('hud()', ctx);
  assert.match($('hint').innerHTML, /^进攻.*<b>X<\/b> 投篮/);
  assert.match($('hint').innerHTML, /<b>B<\/b>\+方向 运球动作.*<b>A<\/b> 胸传/);
  assert.doesNotMatch($('hint').innerHTML, /掩护/);
  assert.equal($('tb1').textContent, '投篮');

  T3.holder().hasBall = false;
  api.pickup(G.players[3]);
  vm.runInContext('frameN = 19; hud()', ctx);
  assert.match($('pc0').innerHTML, /<u class="rd">防守<\/u>/);
  assert.match($('hint').innerHTML, /^防守.*封盖/);
  assert.equal($('tb1').textContent, '盖帽');
  console.log('PASS: an off-ball 3V3 guest gets offensive card and control hints until their team loses possession.');
}

function tactics(cpu = []) {
  const f = fixture({ slots: ['curry', 'edwards', 'jokic', 'luka', 'kobe', 'giannis'].map((arch, id) => ({
    arch, role: cpu.includes(id) ? 'cpu' : 'human'
  })) });
  const { G, T3, api } = f;
  G.phase = 'live';
  G.time = 5;
  T3.T.acquired = G.time;
  const put = (id, x, y, vx = 0, vy = 0) => Object.assign(G.players[id], { x, y, vx, vy });
  const run = (count, inputs = {}) => f.run(count, Object.fromEntries(
    Object.entries(inputs).map(([id, input]) => [id, { ...api.zeroInp(), ...input }])
  ));
  return { ...f, put, run };
}

{
  const { G, api, T3, run } = fixture({
    slots: ['curry', 'lebron', 'giannis', 'boozer', 'luka', 'bridges'].map((arch) => ({ arch, role: 'human' }))
  });
  const marks = (team) => Array.from(G.players.filter((p) => p.tm === team), (p) => p.opp.id);
  assert.deepEqual(marks(1), [2, 0, 1], 'positions beat distance and roster order at the check');
  assert(G.players.slice(3).every((p) => Math.abs(p.x - p.opp.x) < 1), 'check-ball defenders start next to their marks');
  run(60);
  T3.holder().hasBall = false;
  for (const p of G.players) { p.x = (p.id % 3 - 1) * 5.5; p.y = 9; }
  api.pickup(G.players[3]);
  assert(G.needClear);
  assert.deepEqual(marks(0), [4, 5, 3], 'positional matchups reset immediately on a live change of possession');

  const tie = ['curry', 'maxey', 'jokic', 'luka', 'kyrie', 'sengun'].map((arch) => ({ arch, role: 'human' }));
  const tied = fixture({ slots: tie });
  tied.run(60);
  tied.T3.holder().hasBall = false;
  [5, -5, 0, -5, 5, 0].forEach((x, id) => Object.assign(tied.G.players[id], { x, y: 8 }));
  tied.api.pickup(tied.G.players[3]);
  assert.deepEqual(Array.from(tied.G.players.slice(0, 3), (p) => p.opp.id), [4, 3, 5], 'distance breaks ties between identical positions');
  console.log('PASS: check-ball and live changes favor positional matchups over proximity; distance breaks position ties.');
}

{
  const events = {}, touchEvents = {};
  const pad = { connected: true, axes: [], buttons: [] };
  const ctx = vm.createContext({ addEventListener: (event, fn) => { events[event] = fn; }, navigator: { getGamepads: () => [pad] } });
  ctx.window = ctx;
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/input.js'), 'utf8'), ctx);
  const room = fs.readFileSync(path.join(__dirname, '../js/rooms.js'), 'utf8');
  const clean = vm.runInContext(room.slice(room.indexOf('  function cleanInput('), room.indexOf('  function incoming(')) + '\ncleanInput;', ctx);
  const input = ctx.PH.input;
  events.keydown({ code: 'KeyF' });
  assert.equal(clean(input.read3(false)).screen, true);
  events.keyup({ code: 'KeyF' });
  input.endTick();
  assert.equal(input.read3(false).screen, false);
  pad.buttons[11] = { pressed: true };
  assert.equal(clean(input.read3(false)).screen, true);
  pad.buttons[11].pressed = false;
  const off = () => input.read(0, true, true);
  pad.axes = [0.8, 0, 0, 0];
  pad.buttons[0] = { pressed: true };
  assert.equal(off().a3, false, 'Xbox A with direction does not dribble in 1V1');
  assert.equal(off().dribble, false);
  assert.equal(input.read3(true).passKind, 'chest');
  assert.equal(input.read3(true).a3, false, 'Xbox A with direction only passes in 3V3');
  assert.equal(input.read3(true).dribble, false);
  pad.buttons[0].pressed = false;
  pad.buttons[1] = { pressed: true };
  assert(off().a3 && off().dribble);
  assert(input.read3(true).a3 && input.read3(true).dribble);
  assert.equal(input.read3(true).pass, false, 'Xbox B dribbles without passing in 3V3');
  pad.buttons[1].pressed = false;
  pad.axes = [0, 0, 0.8, 0];
  assert(off().a3 && input.read3(true).a3, 'the right stick still dribbles in both modes');
  pad.axes = [];
  events.keydown({ code: 'KeyE' });
  assert.equal(clean(input.read3(true)).passKind, 'chest');
  events.keyup({ code: 'KeyE' });
  input.endTick();
  events.keydown({ code: 'KeyZ' });
  assert.equal(clean(input.read3(true)).passKind, 'bounce');
  events.keyup({ code: 'KeyZ' });
  input.endTick();
  pad.buttons[0].pressed = true;
  pad.buttons[4] = { pressed: true };
  assert.equal(clean(input.read3(true)).passKind, 'bounce');
  pad.buttons[4].pressed = false;
  pad.buttons[6] = { pressed: true };
  assert.equal(clean(input.read3(true)).passKind, 'lob');
  pad.buttons[4] = { pressed: true };
  assert.equal(clean(input.read3(true)).passKind, 'alley');
  pad.buttons[0].pressed = pad.buttons[4].pressed = pad.buttons[6].pressed = false;
  assert.equal(clean({ pass: true, passKind: 'invalid' }).passKind, undefined);
  console.log('PASS: Xbox A is not a dribble input in 1V1 or 3V3; only Xbox A passes in 3V3.');
  const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
  const button = html.match(/<button data-tb="([^"]+)"[^>]+id="tbscreen"/);
  assert(button);
  input.initTouch({
    querySelector: () => ({ addEventListener() {} }),
    querySelectorAll: () => [{ getAttribute: () => button[1], addEventListener: (event, fn) => { touchEvents[event] = fn; }, classList: { add() {}, remove() {} } }]
  });
  touchEvents.touchstart({ preventDefault() {} });
  assert.equal(clean(input.read3(false)).screen, true);
  touchEvents.touchend({ preventDefault() {} });
  assert.equal(input.read3(false).screen, false);
  assert.equal(clean({ screen: 1 }).screen, false);
  console.log('PASS: F, R3 and the touch button produce a screen input preserved by the host sanitizer.');
}

{
  const contact = (fight, switchCover) => {
    const { G, T3, put, run } = tactics(switchCover ? [4] : []);
    put(0, 0, 5); put(1, 0.79, 7); put(3, 0, 7);
    put(4, switchCover ? 0.9 : 4, switchCover ? 5.5 : 8);
    const d = G.players[3];
    d.r.lat = d.r.def = d.tendency.help = fight;
    run(1, { 0: { screen: true }, 4: { screen: true } });
    assert(!T3.T.pick, 'neither the holder nor a defender can screen');
    run(1, { 1: { screen: true, mx: 1, my: 0 } });
    assert(G.players[1].screen3, 'off-ball player is planted');
    run(8);
    if (switchCover) put(4, 0.9, 5.5);
    put(3, 0.23, 7, 3);
    run(1, { 3: { mx: 1, my: 0, sprint: true } });
    assert(d.screenSlow3 > G.time && d.vx < 3, 'screen contact reduces defender movement');
    assert(Math.hypot(d.x - G.players[1].x, d.y - G.players[1].y) >= 0.77, 'the shared player collision separates screener and defender');
    if (switchCover) {
      assert.equal(G.players[4].opp.id, 0, 'screen defender switches onto the ball');
      assert.equal(d.opp.id, 1, 'original defender takes the screener');
      assert.equal(T3.T.marks.get(d).id, 0, 'screen switches leave the underlying matchup intact');
    }
    return { time: d.screenSlow3 - G.time, speed: d.screenSpeed3 };
  };
  const weak = contact(0.2, true), strong = contact(0.95, false);
  assert(strong.time < weak.time && strong.speed > weak.speed, 'better defenders fight through more quickly');
  console.log('PASS: human screen plants and obstructs the defender, better defenders fight through faster, and a nearby CPU switches.');
}

for (const pop of [false, true]) {
  const { G, T3, put, run } = tactics([1]);
  put(0, 0, 5); put(1, 0.78, 6.2); put(3, 0, 6.2); put(4, 5, 9); put(5, -6, 8);
  const s = G.players[1], h = T3.holder();
  s.r.three = pop ? 0.95 : 0.4;
  s.r.str = s.tendency.move = 0.9;
  T3.T.acquired = G.time - 1;
  run(2);
  assert(T3.T.pick?.s === s && s.screen3, 'CPU uses ratings and spacing to get set');
  run(9);
  put(3, 0.23, 6.2, 3);
  run(18);
  assert.equal(T3.T.pick?.phase, 'roll');
  assert(!s.screen3);
  assert(pop ? s.vx > s.vy : s.vy > s.vx, 'shooter runs toward the arc and finisher runs toward the rim');
  put(1, pop ? 6.65 : 0.95, pop ? 8.8 : 11.3);
  put(3, -2, 7); put(4, -4, 10); put(5, -6, 8);
  h.ctrl = 'cpu';
  T3.T.nextPass = 0;
  run(1);
  assert.equal(T3.T.pass?.to, s, 'CPU handler finds an open screener after the break');
}
console.log('PASS: CPU teammates set screens, roll or pop by tendency, and receive the open pass.');

{
  const { G, T3, put, run } = tactics([3, 4, 5]);
  put(0, 0, 5.9); put(3, 0, 3.4); put(4, 0.95, 6.6);
  run(1);
  assert.equal(G.players[4].opp.id, 0, 'the closer teammate takes over a lost matchup');
  assert.equal(G.players[3].opp.id, 1);
  assert.equal(T3.T.cover, null, 'a perimeter switch is not a paint rotation');
  G.time = T3.T.switchAt;
  put(0, 0, 5); put(3, 0, 7);
  run(1);
  assert.deepEqual(Array.from(G.players.slice(3), (d) => d.opp.id), [0, 1, 2], 'recover positional assignments after a switch');
}

{
  const { G, T3, put, run } = tactics([3, 4]);
  put(0, 0, 5.9); put(3, 0, 3.4); put(4, 0.95, 6.6);
  run(1);
  const marks = () => Array.from(G.players.slice(3), (d) => d.opp.id);
  assert.deepEqual(marks(), [1, 0, 2], 'CPU defenders first switch on the perimeter');

  put(0, 0, 9, 0, 2); put(3, 1.1, 10.8); put(4, 0, 7);
  run(1);
  assert.equal(T3.T.cover?.helper.id, 3, 'the switch partner is the only CPU able to help');
  assert.equal(T3.T.cover.next, undefined, 'the human defender does not participate in the rotation');
  assert.deepEqual(marks(), [0, 1, 2], 'the beaten defender takes the helper’s current mark, keeping each attacker covered');
  console.log('PASS: single-helper paint rotation after a switch preserves one defender per attacker.');
}

function driveCoverage(helpIQ) {
  const { G, T3, api, put, run } = tactics([3, 4, 5]);
  put(0, 0, 9, 0, 2); put(3, 0, 7); put(4, 1.7, 10.8); put(5, -3, 8);
  put(1, 7, 12); put(2, -6, 5);
  G.players[1].r.three = 0.99; G.players[2].r.three = 0.55;
  G.players[4].tendency.help = helpIQ;
  const step = api.step;
  let effort;
  api.step = (inputs, dt) => {
    const { mx, my } = inputs[4];
    effort = Math.hypot(mx, my);
    return step(inputs, dt);
  };
  run(1);
  assert.equal(T3.T.cover?.helper.id, 4, 'nearest helper leaves the strong shooter to defend the paint');
  assert(T3.T.cover.spot.y > G.players[0].y);
  assert.equal(G.players[4].opp.id, 0);
  assert.equal(G.players[5].opp.id, 1, 'second helper covers the most dangerous open player');
  assert.equal(G.players[3].opp.id, 2);
  api.step = step;
  put(0, 0, 5); put(3, 0, 7);
  run(1);
  assert.equal(T3.T.cover, null);
  assert.deepEqual(Array.from(G.players.slice(3), (d) => d.opp.id), [0, 1, 2], 'recover the man assignments after the drive ends');
  return effort;
}
{
  assert(driveCoverage(0.95) > driveCoverage(0.25), 'help IQ scales the movement input sent to the shared engine');
  console.log('PASS: beaten defenders switch on the perimeter; drives trigger paint-first help, a second rotation, and recovery.');
}

{
  const { G, T3, put, run } = tactics([1, 2]);
  put(0, 0, 5); put(1, -6.5, 10); put(2, 4, 6);
  put(3, 0, 6.3); put(4, -3, 7); put(5, 5.5, 10);
  const [h, shooter, slasher] = G.players;
  shooter.r.three = 0.97; shooter.r.lay = 0.6;
  slasher.r.three = 0.45; slasher.r.dunk = 0.9;
  T3.T.nextPick = 99;
  run(1);
  assert(shooter.vx < 0 && shooter.vy > 0, 'shooter spots up in the corner');
  assert(slasher.cutUntil > G.time && slasher.vx < 0 && slasher.vy > 0, 'slasher still cuts to the rim');
  h.post = true;
  put(0, 3, 6); put(1, -6.5, 10); put(2, 0, 8);
  run(1, { 0: { post: true, mx: 0, my: 0 } });
  assert(slasher.cutUntil === 0 && slasher.vx < 0 && slasher.vy < 0, 'on isolation both mates clear to the weak side at separate depths');
  console.log('PASS: 3V3 shooters spot up in the corner, slashers cut, and both clear the lane for isolation.');
}

for (const [passIQ, separation, blockedLane, expectPass] of [[0.9, 1.6, false, true], [0.2, 1.6, false, false], [0.9, 1.6, true, false], [0.9, 0.85, false, false]]) {
  const { G, T3, put, run } = tactics();
  const h = T3.holder();
  h.ctrl = 'cpu'; h.tendency.pass = passIQ;
  T3.T.acquired = G.time - 1;
  put(0, 0, 5); put(1, 4, 5); put(2, -6, 10);
  put(3, 0, 8); put(4, 4, 5 + separation); put(5, blockedLane ? 2 : -5, 5);
  run(1, { 1: { pass: true } });
  assert.equal(T3.T.pass?.to.id === 1, expectPass);
  assert.equal(G.floats.some((f) => f.pid === 1 && f.text === '暂不传球'), !expectPass);
  if (expectPass) assert(G.floats.some((f) => f.pid === 1 && f.text === '要球'));
}
console.log('PASS: a CPU honors an open call according to pass IQ, vetoes a blocked lane, and signals a declined call.');

{
  const { G, T3, put, run } = tactics();
  put(0, 0, 5); put(1, 3, 6); put(2, -5, 6);
  put(3, 0, 10); put(4, 4, 10); put(5, -4, 10);
  T3.holder().stun = 0.12;
  run(1, { 0: { pass: true, passKind: 'bounce', mx: 1 } });
  assert.equal(G.ball.state, 'held');
  run(9);
  assert.equal(T3.T.pass?.kind, 'bounce', 'one tap is buffered through contact with its direction and type');
  assert.equal(T3.T.pass?.to.id, 1);
  run(30);
  assert.equal(T3.holder().id, 1);
  console.log('PASS: a 3V3 pass tap buffers through contact without a second press.');
}

{
  function delivery(kind, accuracy) {
    const { G, Gm, T3, api, put, run } = tactics();
    put(0, -1, 5); put(1, 5, 7); put(2, -5, 7);
    put(3, 0, 11); put(4, 5, 11); put(5, -4, 11);
    Object.assign(G.ball, { x: -1, y: 5, z: 1.25 });
    T3.holder().tendency.accuracy = accuracy;
    run(1, { 0: { pass: true, passKind: kind, mx: 1 } });
    const P = T3.T.pass;
    assert.equal(P?.kind, kind);
    let low = Infinity, high = 0;
    while (T3.T.pass) {
      run(1);
      low = Math.min(low, G.ball.z); high = Math.max(high, G.ball.z);
    }
    assert.equal(T3.holder()?.id, 1);
    const r = T3.holder(), quality = r.passQuality;
    Gm._dbg.startShot(r, api.zeroInp(), 'a1');
    assert(r.action.catchShot, 'clean catch opens the catch-and-shoot window');
    const shot = { power: r.action.V.p, green: r.action.V.g, t: r.action.t };
    api.scoreBy(1, 2, 'shot');
    assert.equal(G.stats[0].ast, 1, 'the passer earns an assist on a prompt score');
    return { duration: P.duration, error: P.error, quality, low, high, shot };
  }
  const chest = delivery('chest', 0.95), poor = delivery('chest', 0.3);
  assert(chest.duration < poor.duration && chest.error < poor.error && chest.quality > poor.quality);
  assert(chest.shot.power > poor.shot.power && chest.shot.green > poor.shot.green && chest.shot.t > poor.shot.t);
  const bounce = delivery('bounce', 0.95), skip = delivery('skip', 0.95), lob = delivery('lob', 0.95), alley = delivery('alley', 0.95);
  assert(bounce.low < 0.25 && skip.duration < chest.duration && lob.high > chest.high + 1 && alley.high > chest.high + 1);
  console.log('PASS: five pass types have distinct trajectories; accuracy improves speed, catch-and-shoot and assist opportunities.');
}

{
  const { T3, put, run } = tactics();
  put(0, -2, 6); put(1, 1, 11); put(2, -6, 5);
  put(3, -5, 8); put(4, 5, 8); put(5, -5, 12);
  run(1, { 0: { pass: true, passKind: 'alley', mx: 0.5, my: 0.87 } });
  while (T3.T.pass) run(1);
  assert(['layup', 'dunk'].includes(T3.holder()?.action?.type), 'an accurate lob at the rim starts a shared finish');
  console.log('PASS: a clean alley-oop catch at the rim starts a shared finish.');
}

{
  const { api, T3, put, run } = tactics();
  put(0, -5, 6); put(1, 5, 4); put(2, -1, api.HOOP.y - 3.65);
  put(3, 0, 7); put(4, 5, 10); put(5, 4, 12);
  run(1, { 0: { pass: true, passKind: 'alley', mx: 1, my: 0.7 } });
  assert.equal(T3.T.pass?.to.id, 2, 'aim the alley at Jokic');
  while (T3.T.pass) run(1);
  assert.equal(T3.holder()?.id, 2);
  assert(['layup', 'dunk'].includes(T3.holder()?.action?.type), 'a clean Jokic catch within the 5V5 alley window starts a finish');
  console.log('PASS: Jokic finishes a clean alley-oop catch inside the 5V5 range.');
}

{
  const { G, T3, put, run } = tactics();
  put(0, -5, 6); put(1, -6, 4); put(2, -1, 9);
  put(3, -3, 7.5); put(4, 5, 10); put(5, 4, 12);
  Object.assign(G.ball, { x: -5, y: 6, z: 1.25 });
  run(1, { 0: { pass: true, passKind: 'alley', mx: 1, my: 0.75 } });
  assert.equal(T3.T.pass?.to.id, 2);
  let passedOver = false;
  while (T3.T.pass) {
    run(1);
    const d = G.players[3], b = G.ball;
    if (Math.hypot(d.x - b.x, d.y - b.y) < 0.25 && b.z > d.z + d.h + 0.35) passedOver = true;
  }
  assert(passedOver && T3.holder()?.id === 2, 'a standing defender cannot intercept a high alley directly overhead');
  console.log('PASS: an alley-oop clears a standing defender when it passes above his reach.');
}

{
  const { G, T3, put, run } = tactics();
  put(0, -2, 6); put(1, 1, 11); put(2, -6, 5);
  put(3, -5, 8); put(4, 5, 8); put(5, -5, 12);
  const receiver = G.players[1];
  receiver.r.dunk = receiver.r.sdunk = 0.25;
  run(1, { 0: { pass: true, passKind: 'alley', mx: 0.5, my: 0.87 } });
  while (T3.T.pass) run(1);
  const a = receiver.action;
  assert.equal(a?.type, 'layup');
  for (let i = 0; i < 240 && !a.released; i++) run(1);
  assert(a.released, 'a human non-dunk alley releases automatically without receiver input');
  assert(a.alley && !Number.isFinite(a.tapAt));
  console.log('PASS: a human non-dunk alley-oop automatically releases the shared layup.');
}

{
  for (const recovery of [2, 4, 'out']) {
    const { G, T3, put, run } = tactics();
    put(0, -1, 5); put(1, 5, 7); put(2, -5, 7);
    put(3, 0, 11); put(4, 5, 11); put(5, -4, 11);
    G.players[1].stun = 2;
    run(1, { 0: { pass: true, mx: 1 } });
    assert.equal(T3.T.pass?.to.id, 1);
    while (T3.T.pass) run(1);
    assert.equal(G.ball.state, 'loose');
    assert.equal(G.stats[0].tov, 0, 'a missed catch has not yet changed possession');
    if (recovery === 'out') {
      Object.assign(G.ball, { x: 7.8, z: 0.2 });
      run(1);
      assert.equal(G.phase, 'check');
    } else {
      put(recovery, G.ball.x, G.ball.y);
      for (let i = 0; i < 40 && !T3.holder(); i++) run(1);
      assert.equal(T3.holder()?.id, recovery);
    }
    assert.equal(G.stats[0].tov, recovery === 2 ? 0 : 1, 'only an actual loss counts, at most once');
  }
  console.log('PASS: a missed catch counts as a turnover only after an opposing recovery or out-of-bounds.');
}

{
  const { G, Gm, T3, api, run } = fixture({ human: 1, target: 5, settle: false });
  assert.equal(G.players.length, 6);
  assert.equal(G.phase, 'check');
  assert.equal(T3.holder(), null, 'the defender holds the check ball');
  assert.equal(G.ball.state, 'pass');
  assert.equal(G.players[G.ball.lastTouch].tm, 1, 'a defender checks the ball');
  assert.equal(G.shotClock, 14);
  settleCheck(G, T3);
  assert.equal(T3.holder().id, 1);
  assert(Gm.isThree(T3.holder().x, T3.holder().y));
  run(60);
  api.scoreBy(1, 2, 'lay');
  assert.deepEqual([...G.score], [2, 0]);
  run(62);
  assert.equal(G.phase, 'check');
  assert.equal(G.off, 1);
  settleCheck(G, T3);
  assert(!G.needClear && Gm.isThree(T3.holder().x, T3.holder().y));
  assert.equal(G.shotClock, 14);
  run(60);
  T3.holder().hasBall = false;
  const rebounder = G.players[1];
  Object.assign(rebounder, { x: 0, y: 11 });
  G.ball.wasShot = true;
  api.pickup(rebounder);
  assert.equal(G.stats[1].dreb, 1);
  assert.equal(G.off, 0);
  assert(G.needClear);
  run(1, { 1: api.zeroInp() }); // Release the rebound input before pressing shoot.
  run(1, { 1: { ...api.zeroInp(), a1: true } });
  assert.equal(G.illId, 1, 'Starting a shot inside the arc marks it illegal');
  api.scoreBy(1, 2, 'lay');
  assert.deepEqual([...G.score], [2, 0], 'Uncleared make does not score');
  assert.equal(G.off, 1);
  run(60);
  T3.holder().hasBall = false;
  Object.assign(rebounder, { x: 0, y: 8 });
  api.pickup(rebounder);
  assert(G.needClear, 'A live-ball turnover inside the arc also needs clearance');
  api.scoreBy(1, 2, 'dunk');
  assert.deepEqual([...G.score], [2, 0], 'Finishes without a shot-start marker must clear too');
  run(60);
  T3.holder().hasBall = false;
  Object.assign(rebounder, { x: 0, y: 8 });
  api.pickup(rebounder);
  assert(G.needClear);
  Object.assign(rebounder, { x: 0, y: 4.5 });
  run(1);
  assert(!G.needClear);
  api.scoreBy(1, 3, 'shot');
  run(62);
  assert.deepEqual([...G.score], [5, 0]);
  assert.equal(G.phase, 'over');
  assert.equal(G.winner, 0);
  T3.stop();
  console.log('PASS: six slots, checks, change of possession, illegal makes, clear arc and 2/3 point scoring.');
}

{
  const { G, T3, run } = fixture({ human: 0, clock: 3 });
  run(60);
  const before = G.shotClock;
  T3.holder().stun = 0.12;
  run(1, { 0: { pass: true, mx: -1, my: 0 } });
  assert.equal(G.ball.state, 'held', 'brief contact delays but does not swallow a pass');
  run(9);
  assert.equal(G.ball.state, 'pass');
  run(41);
  assert.equal(T3.holder().id, 1);
  assert(G.shotClock < before, 'An offensive pass does not reset the shot clock');
  G.shotClock = 0.001; run(1);
  assert.equal(G.phase, 'check');
  assert.equal(G.off, 1);
  assert.equal(G.shotClock, 3);
  console.log('PASS: directional passing and shot-clock turnover.');
}

{
  const { G, api, T3, run } = fixture({ human: 0, clock: 24 });
  run(60);
  T3.holder().hasBall = false;
  G.shotClock = 0.005;
  Object.assign(G.ball, { state: 'shot', holder: -1, x: api.HOOP.x, y: api.HOOP.y, z: api.HOOP.z,
    vx: 0, vy: 0, vz: 0, shot: { t: 0, T: 0.025, made: false, shooter: 0, kind: 'shot' } });
  run(1);
  assert.equal(G.shotClock, 0);
  assert.equal(G.ball.state, 'shot');
  run(1);
  assert.equal(G.phase, 'live', 'An in-time shot that misses must remain live for a rebound');
  assert.equal(G.ball.state, 'loose');
  assert.equal(G.stats[0].tov, 0);
  run(20);
  assert.equal(G.phase, 'live');
  const rebounder = G.players[3];
  if (!T3.holder()) api.pickup(rebounder);
  assert.equal(G.off, T3.holder().tm);
  assert(G.stats[T3.holder().id].reb > 0);
  assert(G.shotClock >= 14);
  console.log('PASS: a shot released before expiration stays live through a miss and rebound.');
}

{
  const { G, Gm, T3, api, run } = fixture({ human: 2, replay: true });
  run(155);
  api.scoreBy(T3.holder().id, 3, 'shot');
  for (let i = 0; i < 150 && !G.replay; i++) run(1);
  assert.equal(G.replay.q.pid, 2);
  assert(G.time - G.lastMakeAt >= Gm.replayFlow.makeBeat);
  assert.equal(G.phase, 'dead', 'do not show the next check ball before the replay');
  const replay = G.replay;
  assert.equal(replay.view, null, 'show the live court until the wipe covers it');
  for (let i = 0; i < 30 && !replay.view; i++) run(1);
  assert.equal(Gm.replayFlow.cover(replay), 1, 'cut to replay behind the closed wipe');
  assert.equal(replay.view.players.length, 6);
  const main = fs.readFileSync(path.join(__dirname, '../js/main.js'), 'utf8');
  const skip = main.match(/^  const REPLAY_MIN = .*;$|^  function skipReplay\(\).*/gm).join('\n');
  const ctx = vm.createContext({ G, screen: 'play', paused: false });
  vm.runInContext(skip + '\nskipReplay();', ctx);
  assert.equal(G.replay.skip, false);
  run(60);
  vm.runInContext('skipReplay()', ctx);
  assert.equal(G.replay.skip, true);
  run(1);
  assert.equal(G.replay, replay, 'skip starts the camera return rather than ending immediately');
  assert.equal(replay.returnT, 0);
  assert.equal(replay.view, null);
  run(18);
  assert(replay.returnT > 0 && replay.returnT < 1);
  assert.equal(Gm.replayFlow.cover(replay), 0, 'no wipe or logo on the way out');
  run(24);
  assert.equal(G.replay, null);
  run(75);
  assert.equal(G.off, 1);
  assert.equal(G.score[0], 3);
  console.log('PASS: a 3V3 three-pointer waits, wipes in, and returns to the live camera when skipped.');
}

for (const human of [0, -1]) {
  const slots = ['kyrie', 'edwards', 'jokic', 'lebron', 'durant', 'giannis'].map((arch, id) => ({
    arch, role: id < 3 && human < 0 ? 'cpu' : 'human'
  }));
  const { G, Gm, T3, api, run } = fixture({ slots, replay: false });
  const p = G.players[0], d = G.players[3];
  G.phase = 'live';
  for (const q of G.players) Object.assign(q, { x: q.id % 2 ? -6 : 6, y: 2 + q.id });
  Object.assign(p, { x: 0.5, y: api.HOOP.y - 2.5, face: Math.PI / 2, vx: 0, vy: 4, speed: 4 });
  if (human < 0) {
    Object.assign(d, { x: 0.95, y: p.y + 1.4 });
    Gm.K.cvP = 1; Gm.K.cvC = 0; Gm.K.cvA = 0; Gm.K.cvA2 = 0;
  }
  assert.equal(T3.holder(), p);
  assert(Gm._dbg.startFinish(p, api.zeroInp(), 'lay', 'a1'));
  const a = p.action;
  for (let i = 0; i < 70 && (a.inSteps || a.t < 0.1); i++) run(1);
  if (human >= 0) run(1, { 0: { ...api.zeroInp(), a1: true } });
  for (let i = 0; i < 60 && !a.released; i++) {
    const hold = human >= 0 && a.t + 1 / 60 < a.ideal;
    run(1, { 0: { ...api.zeroInp(), a1: hold } });
  }
  assert(a.clutchT != null && a.released, 'Timed double clutch should release for ' + (human < 0 ? 'CPU' : 'human'));
  assert.equal(G.lastShot.name, '拉杆上篮');
}
console.log('PASS: human and CPU 3V3 players use the shared timed double-clutch layup.');

{
  const { G, run } = fixture();
  for (let i = 0; i < 60 * 360 && G.phase !== 'over'; i++) run(1);
  assert.equal(G.phase, 'over', 'A full CPU-only game should finish from live gameplay');
  assert(G.score[G.winner] >= 21);
  assert(G.stats.some((s) => s.fga > 0));
  console.log('PASS: CPU-only game finished ' + G.score.join('–') + ' in ' + G.time.toFixed(1) + 's of simulation.');
}
