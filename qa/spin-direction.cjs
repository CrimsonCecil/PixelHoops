const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ctx = vm.createContext({ performance: { now: () => 0 }, setTimeout() {} });
ctx.window = ctx;
for (const name of ['tune', 'render', 'roster', 'r5', 'game', 'b5', 'team5', 'team3']) {
  let source = fs.readFileSync(path.join(__dirname, '../js', name + '.js'), 'utf8');
  if (name === 'game') source = source.replace('  PH.game = {', '  window.__spinStart = startMove;\n  PH.game = {');
  vm.runInContext(source, ctx);
}
const { game: gm, T3, T5, render: R } = ctx.PH;
const { G, t5 } = gm;
const dt = 1 / 120;
R.setCam();
for (const mode of ['train', 't3', 't5']) for (const ctrl of ['p1', 'cpu']) {
  for (const face of [Math.PI / 2, -Math.PI / 2, 0]) for (const hand of [-1, 1]) {
    for (const [right, stick] of [[0.55, -0.2], [-0.55, 0.2], [0, -0.4], [0, 0.4], [0, 0]]) {
      gm.seed(7);
      if (mode === 't3') T3.start({ slots: ['kyrie', 'curry', 'jokic', 'lebron', 'durant', 'giannis'].map(arch => ({ arch, role: 'human' })), clock: 0 });
      else if (mode === 't5') T5.start({ home: 'LAL', away: 'BOS' });
      else gm.newGame({ mode, arch0: 'kyrie', arch1: 'joe' });
      const p = G.players[0], d = G.players[mode === 't3' ? 3 : mode === 't5' ? 5 : 1];
      Object.assign(G, { phase: 'live', off: 0, needClear: false, intro: null });
      for (const other of G.players) Object.assign(other, { off: other !== p && other !== d, hasBall: false });
      const fx = Math.cos(face), fy = Math.sin(face);
      Object.assign(p, { x: 0, y: 6, z: 0, face, hand, hasBall: true, ctrl, opp: d, action: null, cd: 0 });
      Object.assign(d, { x: p.x + fx + fy * right, y: p.y + fy - fx * right, off: false, stun: 3 });
      Object.assign(G.ball, { state: 'held', holder: 0, dead: false });
      p.r.hnd = 0.99;
      p.arch = gm.ARCH.kobe;
      const h = gm.t5.HOOP, hy = h.y - p.y, hx = h.x - p.x, len = Math.hypot(hx, hy);
      d.x = p.x + fx + fy * right; d.y = p.y + fy - fx * right;
      const input = { ...t5.zeroInp(), a3: true, mx: -fy * stick, my: fx * stick, dx: (hx * 0.6 - hy * 0.8) / len, dy: (hy * 0.6 + hx * 0.8) / len };
      // Expose only the existing start site so selection is independent of AI decision randomness.
      ctx.__p = p; ctx.__input = input;
      vm.runInContext('__spinStart(__p, __input)', ctx);
      assert.equal(p.action.kind, 'spin');
      const expected = right ? Math.sign(right) : stick ? Math.sign(stick) : hand;
      const a = p.action;
      assert.equal(p.hand, -expected, 'ball ends away from defender');
      assert((-fy * a.dx + fx * a.dy) * expected > 0, 'exit away from defender');
      const step = () => t5.step(G.players.map(() => t5.zeroInp()), dt);
      let prev = face, screenPrev;
      for (let i = 0; i < 20; i++) {
        step();
        assert((p.face - prev) * expected < 0, 'world rotation sign');
        prev = p.face;
        const c = R.proj(p.x, p.y, 0), tip = R.proj(p.x + Math.cos(p.face) * 0.1, p.y + Math.sin(p.face) * 0.1, 0);
        const angle = Math.atan2(tip.y - c.y, tip.x - c.x);
        if (screenPrev != null) {
          const delta = Math.atan2(Math.sin(angle - screenPrev), Math.cos(angle - screenPrev));
          assert(delta * expected > 0, 'clockwise screen rotation for defender right');
        }
        screenPrev = angle;
      }
    }
  }
  console.log('PASS ' + mode + ' ' + ctrl + ': defender-relative spins, both hands, facing angles, stick/hand fallbacks, projected clockwise/counterclockwise sequence');
}
