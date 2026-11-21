// 3V3 结算面板：Box / 9-Cat / 11-Cat / 高阶，两队各一段 + 头像 + 合计 + MVP
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ctx = vm.createContext({ performance: { now: () => 0 }, setTimeout: () => {} });
ctx.window = ctx;
vm.runInContext('let seed = 7; Math.random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296)', ctx);
for (const name of ['tune', 'ptype', 'render', 'roster', 'measurements', 'r5', 'game', 'team3']) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../js', name + '.js'), 'utf8'), ctx, { filename: name + '.js' });
}
const { game, T3 } = ctx.PH, G = game.G;
game.seed(7);
T3.start({ slots: ['curry', 'edwards', 'jokic', 'lebron', 'durant', 'giannis'].map((arch) => ({ arch, role: 'cpu' })), target: 11, clock: 14, replay: false });
for (let i = 0; i < 60 * 900 && G.phase !== 'over'; i++) T3.tick(1 / 60, {});
assert.equal(G.phase, 'over', '3V3 game should finish');

const el = () => ({ innerHTML: '', textContent: '', addEventListener() {}, querySelectorAll: () => [] });
const E = { 'over-stats': el(), 'bx-note': el(), 'bx-bar': el(), n0: el(), n1: el() };
const painted = [];
Object.assign(ctx, { $: (id) => E[id], GM: game, G, localSlot: 0, portrait: (cv) => painted.push(cv),
  document: { querySelectorAll: () => [...E['over-stats'].innerHTML.matchAll(/data-pid="(\d)"/g), ...E['bx-note'].innerHTML.matchAll(/data-pid="(\d)"/g)].map((m) => ({ getAttribute: () => m[1] })) },
  escH: (x) => String(x == null ? '' : x).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])),
  PH: Object.assign(ctx.PH, { audio: { play() {} } }) });
const main = fs.readFileSync(path.join(__dirname, '../js/main.js'), 'utf8');
vm.runInContext(main.slice(main.indexOf('  const BX ='), main.indexOf('  function showOver')) + '\nthis.BX = BX; this.renderBox = renderBox; this.box3Data = box3Data;', ctx);

ctx.renderBox();
let h = E['over-stats'].innerHTML;
assert.equal((h.match(/data-testid="b3-row-/g) || []).length, 6, 'six player rows');
assert.match(h, /b3-team-0[\s\S]*b3-team-1/, 'home section before away');
assert.equal(painted.length, 7, 'six row avatars + MVP avatar painted');
assert.match(E['bx-note'].innerHTML, /全场最佳/);
const D = ctx.box3Data();
for (const t of [0, 1]) {
  assert.equal(D.tot[t].pts, G.score[t], 'team ' + t + ' total points match score');
  assert.equal(D.tm[t].reduce((s, p) => s + D.P[p.id].pts, 0), G.score[t]);
}
assert.equal(D.mvp.tm, G.winner, 'MVP comes from the winning team');
assert.doesNotMatch(h, /胜项/, 'Box view has no category column');
console.log('PASS: 3V3 Box view: 6 avatar rows, team totals equal the score (' + G.score.join(':') + '), MVP from winner.');

ctx.BX.view = '11cat'; ctx.BX.adv = true; ctx.renderBox();
h = E['over-stats'].innerHTML;
for (const c of ['FG%', '3PM', 'OREB', '晃倒', 'TS%', 'USG%', 'GmSc', '胜项']) assert.ok(h.includes('>' + c + '<'), '11-Cat + 高阶 column ' + c);
const usg = D.tm[0].reduce((s, p) => s + (D.P[p.id].usg || 0), 0);
assert.ok(Math.abs(usg - 1) < 1e-9 || D.tot[0].fga + D.tot[0].tov === 0, 'team USG% sums to 100%');
console.log('PASS: 3V3 11-Cat + 高阶 shows category wins and advanced columns; team USG% sums to 100%.');
