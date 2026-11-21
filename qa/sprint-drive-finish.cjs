const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const C1 = require('./far-layup-c1.json');
const before = process.argv.includes('--before');

function fixture(profile, cpu = false) {
  const ctx = vm.createContext({ console, performance: { now: () => 0 }, setTimeout() {}, clearTimeout() {} });
  ctx.window = ctx;
  ctx.PH = {};
  for (const name of ['render', 'tune', 'roster', 'game']) {
    let src = before && name === 'game'
      ? execFileSync('git', ['show', `${process.argv[process.argv.indexOf('--before') + 1] || 'HEAD^'}:js/game.js`], { cwd: root, encoding: 'utf8' })
      : fs.readFileSync(path.join(root, 'js', name + '.js'), 'utf8');
    if (name === 'game') src = src.replace('PH.game = {', 'PH.driveQA = { tryStart, updatePlayer }; PH.game = {');
    vm.runInContext(src, ctx, { filename: name + '.js' });
  }
  for (const [key, value] of Object.entries(profile)) ctx.PH.TUNE.set(key, value);
  const gm = ctx.PH.game;
  gm.newGame({ mode: '2p', arch0: 'lebron', arch1: 'gobert', target: 9999 });
  Object.assign(gm.G, { phase: 'live', needClear: false, time: 10 });
  const [p, d] = gm.G.players, H = ctx.PH.render.HOOP;
  Object.assign(p, { x: 0, y: H.y - 3, vx: 0, vy: 7, speed: 7, face: Math.PI / 2, hasBall: true, ctrl: cpu ? 'cpu' : 'p1' });
  p.arch = { ...p.arch, key: 'qa', _bt: {} };
  d.off = true;
  const inp = { mx: 0, my: 1, dx: 0, dy: 0, sprint: true, a1: true };
  return { ctx, gm, p, inp, fire: () => ctx.PH.driveQA.tryStart(p, inp, { a1: true }) };
}

for (const [label, profile] of [['default', {}], ['C1', C1.data]]) {
  for (const cpu of [false, true]) {
    for (const stale of ['none', 'post', 'spin']) {
      for (const dunk of [false, true]) {
        const f = fixture(profile, cpu), { p, gm } = f;
        Object.assign(p.r, { dunk: dunk ? 0.99 : 0.1, sdunk: dunk ? 0.99 : 0.1 });
        if (stale === 'post') p.postMove = { kind: 'postspin', t: gm.G.time, side: 1 };
        if (stale === 'spin') Object.assign(p, { lastMove: 'spin', lastMoveT: gm.G.time, face: -Math.PI / 2 });
        const plan = gm._dbg.finPlan(p);
        assert(plan.lay);
        f.fire();
        assert.equal(p.action?.type, plan.dunk ? 'dunk' : 'layup', `${label} cpu=${cpu} stale=${stale} dunk=${dunk}`);
        assert(!p.action.V?.floater);
      }
    }
    for (const kind of ['neutral', 'away', 'lateral', 'far', 'stepback', 'postHeld']) {
      const f = fixture(profile, cpu), { p, inp, gm } = f;
      if (kind === 'neutral') inp.my = 0;
      if (kind === 'away') { inp.my = -1; p.y = f.ctx.PH.render.HOOP.y - 5; }
      if (kind === 'lateral') { inp.mx = 1; inp.my = 0; }
      if (kind === 'far') p.y = f.ctx.PH.render.HOOP.y - 12;
      if (kind === 'stepback') Object.assign(p, { lastMove: 'stepback', lastMoveT: gm.G.time });
      if (kind === 'postHeld') { p.post = true; inp.post = true; }
      f.fire();
      if (kind === 'far') assert.notEqual(p.action?.type, 'layup');
      else assert.equal(p.action?.type, 'shot', `${label} ${kind} retains jumper`);
    }
    const f = fixture(profile, cpu);
    Object.assign(f.p, { recT: 11, landT: 9.9 });
    f.fire();
    assert.equal(f.p.action, null, 'held rebound shoot guard');
    const wide = fixture(profile, cpu);
    wide.ctx.PH.TUNE.set('l1_layMax', 5);
    wide.ctx.PH.TUNE.set('l1_layK', 1.5);
    wide.p.y = wide.ctx.PH.render.HOOP.y - 7;
    Object.assign(wide.p.r, { dunk: 0.1, sdunk: 0.1 });
    assert(wide.gm._dbg.finPlan(wide.p).lay);
    wide.fire();
    assert.equal(wide.p.action?.type, 'layup', 'live layup tuning is not capped by jumper distance or dunk ratings');
  }
  console.log(`PASS sprint-drive-finish ${label}: human/CPU dunk/layup, stale post/spin, non-drive jumpers, rebound guard (no PH.input)`);
}
