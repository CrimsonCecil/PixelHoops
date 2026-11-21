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
  return { ctx, G: game.G, Gm: game, api: game.t5, T3, run: (count, inputs) => { for (let i = 0; i < count; i++) T3.tick(1 / 60, inputs); } };
}

{
  const { ctx, G, T3 } = fixture({ human: 0, local: 0 });
  const nameRows = [], staminaRows = [];
  const canvas = () => {
    const c = new Proxy({
      createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }),
      measureText: () => ({ width: 8 }),
      fillText(text, x, y) { if (text === T3.holder()?.arch.name) nameRows.push(y + 12); },
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
  assert(feet().s > 30, '3V3 uses close framing at the arc');
  assert(R.cam.fz < defaultPitch, 'elevated end-on camera looks downward more than 1V1');
  assert.equal(R.proj(0, 2, 0).x, rim().x, 'court centerline points straight to the hoop');
  assert(R.proj(0, 2, 0).y > R.proj(0, 10, 0).y, 'offense attacks up the screen');
  const hintY = 253;
  move(3.3, 6.25);
  R.render(G, 1);
  nameRows.length = staminaRows.length = 0;
  R.render(G, 0, hintY);
  assert(feet().s > 30, 'keep close framing when clearing the hints at the wing');
  assert(nameRows.length && Math.max(...nameRows) < hintY);
  assert(staminaRows.length && Math.max(...staminaRows) < hintY);
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
    G, GM: Gm, CFG: Gm.CFG, $, stage: $('stage'), cues: [$('cue0'), $('cue1')], screen: 'play',
    matchConfig: { mode: 't3' }, localSlot: 2, opts: { info: 'show' }, TR: {}, hasPad: true, isTouch: true,
    frameN: 9, hintKey: '', lastClock: '', lastTB2: '', lastS0: -1, lastS1: -1,
    TT: {}, pcRatings: noop, bList: () => [], fitBadgePops: noop, pcards5: noop, bpops: noop, drawFloats: noop,
    show: noop, shotCard: noop
  });
  vm.runInContext(main.slice(main.indexOf('  function cardHTML('), main.indexOf('  function fitBadgePops(')) +
    main.slice(main.indexOf('  function pcards()'), main.indexOf('  // V3.9g 5V5 信息卡')) +
    main.slice(main.indexOf('  function hud()'), main.indexOf('  // ---------- 结算面板')) + '\nlet overShown = false;', ctx);
  G.banner = null;
  vm.runInContext('hud()', ctx);
  assert.match($('pc0').innerHTML, /<u class="ro">进攻<\/u>/);
  assert.match($('pc1').innerHTML, /<u class="rd">防守<\/u>/);
  assert.match($('hint').innerHTML, /^进攻.*<b>Y<\/b> 抢篮板/);
  assert.equal($('tb1').textContent, '篮板');

  T3.holder().hasBall = false;
  api.pickup(G.players[2]);
  vm.runInContext('hud()', ctx);
  assert.match($('hint').innerHTML, /^进攻.*<b>X<\/b> 投篮/);
  assert.equal($('tb1').textContent, '投篮');

  T3.holder().hasBall = false;
  api.pickup(G.players[3]);
  vm.runInContext('frameN = 19; hud()', ctx);
  assert.match($('pc0').innerHTML, /<u class="rd">防守<\/u>/);
  assert.match($('hint').innerHTML, /^防守.*封盖/);
  assert.equal($('tb1').textContent, '盖帽');
  console.log('PASS: an off-ball 3V3 guest gets offensive card and control hints until their team loses possession.');
}

{
  const { G, Gm, T3, api, run } = fixture({ human: 1, target: 5 });
  assert.equal(G.players.length, 6);
  assert.equal(T3.holder().id, 1);
  assert.equal(G.phase, 'check');
  assert.equal(G.shotClock, 14);
  assert(Gm.isThree(T3.holder().x, T3.holder().y));
  run(60);
  api.scoreBy(1, 2, 'lay');
  assert.deepEqual([...G.score], [2, 0]);
  run(62);
  assert.equal(G.phase, 'check');
  assert.equal(G.off, 1);
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
  run(1, { 0: { pass: true, mx: -1, my: 0 } });
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
  assert(replay.view && replay.wipeOut > 0, 'skip starts the exit wipe rather than cutting immediately');
  for (let i = 0; i < 30 && replay.view; i++) run(1);
  assert.equal(replay.view, null);
  assert.equal(Gm.replayFlow.cover(replay), 1, 'cut back to live behind the closed wipe');
  run(24);
  assert.equal(G.replay, null);
  run(75);
  assert.equal(G.off, 1);
  assert.equal(G.score[0], 3);
  console.log('PASS: a 3V3 three-pointer waits, wipes into the replay, and wipes out when skipped.');
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
