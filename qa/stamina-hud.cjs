const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, '../js/render.js'), 'utf8');
const calls = [];
const ctx = vm.createContext({
  PH: { PT: { SIZE: 13 } }, STB: { w1: 30, h1: 2, gap: 3 }, ctx: {},
  stamBar: (...args) => calls.push(args),
  nameFoot: p => ({ x: p.id * 80 + 40, y: 50 }),
  nameBounds: (c, a, x, y) => ({ x0: x - 20, x1: x + 20, y0: y - 2, y1: y + 11 }),
  curName: (c, a, x, y) => ({ x0: x - 20, x1: x + 20, y0: y - 2, y1: y + 11 })
});
vm.runInContext(source.slice(source.indexOf('  function staminaOn('), source.indexOf('  function camera3(')), ctx);
const players = Array.from({ length: 6 }, (_, id) => ({ id, tm: id < 3 ? 0 : 1, arch: {}, col: {}, stam: id * 20 }));
const G = { players, mode: 'cpu', vopt: {}, time: 1, ball: { state: 'held', holder: 0 } };
const visible = () => players.filter(p => ctx.staminaOn(p, G, false)).map(p => p.id);
G.players = players.slice(0, 2);
for (const mode of ['cpu', '2p']) {
  G.mode = mode;
  assert.ok(G.players.every(p => ctx.staminaOn(p, G, false)), mode + ' shows both players');
}
G.players = players; G.mode = 't3'; players[3].opp = players[0];
assert.deepEqual(visible(), [0, 3]);
players[4].opp = players[1]; G.ball.holder = 1;
assert.deepEqual(visible(), [1, 4], 'follows pass recipient');
players[4].opp = players[2]; players[5].opp = players[1];
assert.deepEqual(visible(), [1, 5], 'follows defensive switch');
G.ball.holder = 4; players[0].opp = players[4];
assert.deepEqual(visible(), [0, 4], 'follows turnover');
for (const state of ['pass', 'shot', 'loose']) {
  G.ball.state = state; assert.deepEqual(visible(), [], state);
}
G.ball.state = 'held'; G.ball.holder = 99;
assert.deepEqual(visible(), [], 'invalid holder');
G.ball.holder = 4;
for (const key of ['off', 'dummy']) {
  players[4][key] = true; assert.ok(!ctx.staminaOn(players[4], G, false)); players[4][key] = false;
}
G.intro = {}; assert.deepEqual(visible(), []); G.intro = null;
G.vopt.stamina = false; assert.deepEqual(visible(), []); G.vopt.stamina = true;
assert.equal(ctx.staminaOn(players[4], G, true), false, 'hidden in replay');
ctx.teamNameTags(players, 200, G);
assert.equal(calls.length, 2);
assert.deepEqual(calls.map(c => c[5]), [0, 80], 'uses existing per-player stamina');
assert.ok(calls.every(c => c[3] === 30 && c[4] === 2), 'reuses compact bar dimensions');
G.vopt.stamina = false; ctx.teamNameTags(players, 200, G); assert.equal(calls.length, 2);
console.log('PASS: stamina HUD covers both duel players, possession/matchup changes, loose/in-flight/invalid balls, intro, replay, toggle, and existing bar rendering.');
