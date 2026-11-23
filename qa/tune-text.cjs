const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
function load(base) {
  const ctx = vm.createContext({ console, performance: { now: () => 0 }, setTimeout() {}, clearTimeout() {} });
  ctx.window = ctx;
  ctx.PH = { input: { endTick() {}, read: () => ({}) } };
  for (const name of ['tune', 'render', 'roster', 'r5', 'game', 'b5', 'team5']) {
    const source = base ? execFileSync('git', ['show', `main:js/${name}.js`], { cwd: root, encoding: 'utf8' }) : fs.readFileSync(path.join(root, 'js', `${name}.js`), 'utf8');
    vm.runInContext(source, ctx, { filename: name + '.js' });
  }
  return ctx.PH.TUNE;
}
const old = load(true), current = load(false);
const validNote = d => /^(越大|越小|开：)/.test(d.note) || d.note === '当前版本未使用，改了无效果';
const added = current.list().filter(d => !old.meta(d.k));
for (const d of old.list()) assert(current.meta(d.k), `${d.k}: kept`);
for (const d of added) assert(validNote(d), `${d.k}: new tip style`);
let edited = 0;
const maxChanges = [];
for (const d of current.list()) {
  const before = old.meta(d.k);
  if (!before) continue;
  for (const f of ['v', 'min', 'step', 'g', 'cat', 'sub', 'gm', 'mode']) assert.equal(d[f], before[f], `${d.k}.${f}`);
  if (d.max !== before.max) maxChanges.push(`${d.k}: ${before.max} → ${d.max}`);
  if (d.label !== before.label || d.note !== before.note) {
    edited++;
    assert(d.syn.includes(before.label), `${d.k}: old label searchable`);
    assert(validNote(d), `${d.k}: tip style`);
  }
}
console.log(`Registry comparison: ${old.list().length} keys kept, ${added.length} added; default/min/step/group/category/sub/mode identical`);
console.log(`Max changes: ${maxChanges.length ? maxChanges.join(', ') : 'none'}`);
console.log(`Rewritten parameters: ${edited}`);
console.log(`Empty notes: ${current.list().filter(d => !d.note.trim()).length}`);
console.log(`Notes outside requested style: ${current.list().filter(d => !validNote(d)).length}`);
for (const cat of [...new Set(current.list().map(d => d.cat))]) {
  const defs = current.list().filter(d => d.cat === cat);
  console.log(`Category ${cat}: ${defs.filter(validNote).length}/${defs.length} compliant`);
}
current.reg([{ k: 'qa_display', label: '旧名', v: 0.5, min: 0, max: 1, step: 0.01, note: '概率', display: ['新名', '越大越容易触发'] }]);
assert.equal(current.meta('qa_display').max, 1, 'widen uses original probability text');
assert.equal(current.meta('qa_display').label, '新名');
assert(current.meta('qa_display').syn.includes('旧名'));
current.reg([{ k: 'qa_empty', label: '原名', v: 1, note: '原说明', display: [] }]);
assert.equal(current.meta('qa_empty').label, '原名');
assert.equal(current.meta('qa_empty').note, '原说明');
assert.equal(current.set('qa_missing', 2), false);
console.log('Display metadata: numeric widening preserved; aliases, empty display, unknown key OK');
