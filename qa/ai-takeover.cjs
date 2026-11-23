// 在线对局托管：球员 ctrl 临时改成 cpu 后由电脑（含 1V1 战术调用）接手，收回后重新跟随真人输入
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ctx = vm.createContext({ console, performance: { now: () => 0 }, setTimeout() {} });
ctx.window = ctx;
for (const name of ['tune', 'ptype', 'render', 'roster', 'r5', 'r2k', 'game']) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', name + '.js'), 'utf8'), ctx, { filename: name + '.js' });
const { game: gm } = ctx.PH;
const { G, t5: t } = gm;
gm.setAudioSink(() => {});
const dt = 1 / 60;
let humanMoves = 0;
const human = () => ({ ...t.zeroInp(), mx: 1 });
const run = (sec) => { for (let i = 0; i < sec / dt && G.phase !== 'over'; i++) gm.tick(dt, (p) => { humanMoves++; return human(p); }); };

gm.newGame({ mode: '2p', arch0: 'curry', arch1: 'lebron', target: 99 });
assert.equal(G.players.map((p) => p.ctrl).join(), 'p1,p2');
const saved = G.players.map((p) => p.ctrl);
for (const p of G.players) p.ctrl = 'cpu';
humanMoves = 0;
run(90);
assert.equal(humanMoves, 0, 'taken-over players ignore human input');
assert(G.score[0] + G.score[1] >= 6, 'both AIs play a real game: ' + G.score);
assert(G.players.some((p) => p.ai.call || p.ai.su) || Object.keys(G.aiPlay || {}).length, '1V1 play calling is active for taken-over players');
console.log('PASS: two taken-over online players play a full AI duel (' + G.score.join(':') + ')');

G.players.forEach((p, i) => { p.ctrl = saved[i]; });
humanMoves = 0;
run(1);
assert(humanMoves > 0, 'returned players read human input again');
console.log('PASS: handing control back restores human input');
