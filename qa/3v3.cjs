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
  T3.start({ slots, target: 21, clock: 14, ...options });
  return { G: game.G, Gm: game, api: game.t5, T3, run: (count, inputs) => { for (let i = 0; i < count; i++) T3.tick(1 / 60, inputs); } };
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
  const { G, run } = fixture();
  for (let i = 0; i < 60 * 360 && G.phase !== 'over'; i++) run(1);
  assert.equal(G.phase, 'over', 'A full CPU-only game should finish from live gameplay');
  assert(G.score[G.winner] >= 21);
  assert(G.stats.some((s) => s.fga > 0));
  console.log('PASS: CPU-only game finished ' + G.score.join('–') + ' in ' + G.time.toFixed(1) + 's of simulation.');
}
