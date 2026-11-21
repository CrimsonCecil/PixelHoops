const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const C1 = require('./far-layup-c1.json');
const before = process.argv.includes('--before');

function fixture(profile, cpu = false, replay = false, ref = before ? process.argv[process.argv.indexOf('--before') + 1] || 'main' : null) {
  const ctx = vm.createContext({ console, performance: { now: () => 0 }, setTimeout() {}, clearTimeout() {} });
  ctx.window = ctx;
  ctx.PH = {};
  for (const name of ['render', 'tune', 'roster', 'game']) {
    let src = ref && name === 'game'
      ? execFileSync('git', ['show', `${ref}:js/game.js`], { cwd: root, encoding: 'utf8' })
      : fs.readFileSync(path.join(root, 'js', name + '.js'), 'utf8');
    if (name === 'game') {
      const lines = src.split('\n');
      const start = lines.findIndex(l => l.includes('function tryStart('));
      const end = lines.findIndex((l, j) => j > start && l.includes('function noGas('));
      src = lines.map((line, i) => {
        return i >= start && i < end ? line.replace(/\b(startShot|startFinish|startDunk)\(/g,
          (_, fn) => `(PH.driveBranch = 'L${i + 1}:${fn}', ${fn})(`) : line;
      }).join('\n');
      src = src.replace('PH.game = {', 'PH.driveQA = { tryStart, updatePlayer, inDir, backTurn, postFollow, faceHoop, ST }; PH.game = {');
    }
    vm.runInContext(src, ctx, { filename: name + '.js' });
  }
  for (const [key, value] of Object.entries(profile)) ctx.PH.TUNE.set(key, value);
  const gm = ctx.PH.game;
  gm.newGame({ mode: replay ? 'cpu' : '2p', arch0: replay ? 'flagg' : 'lebron', arch1: replay ? 'jalensmith' : 'gobert', target: 9999 });
  Object.assign(gm.G, { phase: 'live', needClear: false, time: 10 });
  const [p, d] = gm.G.players, H = ctx.PH.render.HOOP;
  Object.assign(p, { x: 0, y: H.y - 3, vx: 0, vy: 7, speed: 7, face: Math.PI / 2, hasBall: true, ctrl: cpu ? 'cpu' : 'p1' });
  if (!replay) p.arch = { ...p.arch, key: 'qa', _bt: {} };
  d.off = true;
  if (replay) {
    Object.assign(gm.G, { mode: 'cpu', time: 26 });
    Object.assign(p, { x: 2.312, y: 11.883, vx: -7.042, vy: 2.366, speed: Math.hypot(7.042, 2.366), face: 2.446 });
    Object.assign(d, { x: 2.326, y: 10.129, vx: -3.289, vy: 5.671, face: 1.464, stam: 69.366, off: false });
  }
  const inp = { mx: 0, my: 1, dx: 0, dy: 0, sprint: true, a1: true };
  return { ctx, gm, p, inp, fire: () => ctx.PH.driveQA.tryStart(p, inp, { a1: true }) };
}

function replayMatrix(matrixOnly) {
  console.log('Hoop=(0,12.425,3.05); inDir fwd=normalized stick dot hoopDir(position), NOT player facing.');
  console.log('code profile stick stam branch result q.l q.fwd q.lat inside back fv lay dunk reach stam>ST.dunk backTurn postFollow faceHoop');
  for (const [code, ref] of [['OLD', 'main'], ['NEW', null]]) {
    for (const [label, profile] of [['default', {}], ['C1', C1.data]]) {
      for (const stick of ['velocity', 'hoop']) for (const stam of [100, 50, 25, 10, 7, 0]) {
        const f = fixture(profile, false, true, ref), { p, inp, ctx, gm } = f, Q = ctx.PH.driveQA;
        p.stam = stam;
        const x = stick === 'velocity' ? p.vx : -p.x, y = stick === 'velocity' ? p.vy : ctx.PH.render.HOOP.y - p.y;
        const len = Math.hypot(x, y);
        inp.mx = x / len; inp.my = y / len;
        const q = Q.inDir(p, inp), P = gm._dbg.finPlan(p);
        const backTurn = Q.backTurn(p), postFollow = !!Q.postFollow(p), faceHoop = Q.faceHoop(p);
        f.fire();
        console.log([code, label, stick, stam, ctx.PH.driveBranch, p.action?.type + '/' + p.action?.v,
          q.l.toFixed(3), q.fwd.toFixed(3), q.lat.toFixed(3), P.inside, P.back, P.fv.toFixed(3), P.lay, P.dunk,
          P.reach.toFixed(3), `${stam}>${Q.ST.dunk}:${stam > Q.ST.dunk}`, backTurn, postFollow, faceHoop.toFixed(3)].join(' '));
        if (!matrixOnly && code === 'NEW') {
          assert(['layup', 'dunk'].includes(p.action?.type), 'exact replay state must finish');
          if (stam <= Q.ST.dunk) assert.equal(p.action.type, 'layup', 'exhausted dunk falls back to existing layup');
        }
      }
    }
  }
}
replayMatrix(process.argv.includes('--matrix'));
if (process.argv.includes('--matrix')) process.exit(0);

for (const [label, profile] of [['default', {}], ['C1', C1.data]]) {
  for (const stick of ['velocity', 'hoop']) for (const stam of [100, 50, 25, 10, 7, 0]) {
    const f = fixture(profile, false, true), { p, inp, ctx, gm } = f;
    p.stam = stam;
    const x = stick === 'velocity' ? p.vx : -p.x, y = stick === 'velocity' ? p.vy : ctx.PH.render.HOOP.y - p.y;
    inp.mx = x / Math.hypot(x, y); inp.my = y / Math.hypot(x, y);
    p.postMove = { kind: 'postspin', t: gm.G.time - 0.5, side: 1 };
    f.fire();
    assert(['layup', 'dunk'].includes(p.action?.type), `${label} replay geometry with hypothetical recent post-spin must finish`);
  }
  console.log(`PASS replay-state ${label}: exact recorded geometry/facing/defender, both sticks, stamina 100/50/25/10/7/0; hypothetical recent post-spin cannot override drive`);
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
