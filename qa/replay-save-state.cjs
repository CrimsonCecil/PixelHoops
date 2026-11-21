const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm');
const source = fs.readFileSync(__dirname + '/../js/main.js', 'utf8');
const elements = new Map();
function el(id) {
  if (!elements.has(id)) elements.set(id, { value: '', textContent: '', hidden: false, handlers: {}, addEventListener(k, fn) { this.handlers[k] = fn; }, focus() {}, select() {} });
  return elements.get(id);
}
const statuses = [el('pause-status'), el('over-status'), el('over5-status')], button = el('save');
button.parentElement = { querySelector: () => statuses[0] };
let tape = { meta: { mode: 't3', date: new Date().toISOString(), players: ['库里'] }, frames: [{}] }, saving;
const c = vm.createContext({ console, Date, PH: { TAPE: { current: () => tape, finish: () => tape, save: () => saving } },
  document: { querySelectorAll: s => s === '.replay-save' ? [button] : statuses }, $: el, show: (id, on) => el(id).hidden = !on });
vm.runInContext(source.slice(source.indexOf('  let replaySaving ='), source.indexOf('  // ---------- 循环 ----------')), c);
async function save(result, fail = false, reset = false) {
  button.handlers.click(); el('replay-input').value = '录像';
  let resolve, reject; saving = new Promise((a, b) => { resolve = a; reject = b; });
  const pending = el('replay-ok').handlers.click();
  assert.equal(statuses[0].textContent, '保存中…');
  if (reset) vm.runInContext('replaySaveReset()', c);
  if (fail) reject(new Error(result)); else resolve({ name: result });
  await pending;
}
(async () => {
  await save('旧3V3'); assert.equal(statuses[0].textContent, '已保存：旧3V3');
  statuses[1].textContent = '保存失败：旧错误'; statuses[2].textContent = '已保存：旧5V5';
  button.handlers.click(); vm.runInContext('replaySaveReset()', c);
  assert(el('replay-name').hidden); assert.equal(el('replay-input').value, '');
  assert(statuses.every(s => !s.textContent));
  assert(vm.runInContext('!replaySaveTape && !replaySaveFrom && !replaySaving', c));
  await save('过期成功', false, true); assert.equal(statuses[0].textContent, '');
  await save('过期失败', true, true); assert.equal(statuses[0].textContent, '');
  await save('新错误', true); assert.equal(statuses[0].textContent, '保存失败：新错误');
  tape = { frames: [] }; vm.runInContext('replaySaveReset()', c);
  assert(button.disabled); assert.equal(button.title, '暂无录像');
  assert.equal((source.match(/    replaySaveReset\(\);/g) || []).length, 3);
  console.log('PASS save reset clears all statuses, dialog and references; stale success/error ignored; empty tape disabled');
})().catch(e => { console.error(e); process.exitCode = 1; });
