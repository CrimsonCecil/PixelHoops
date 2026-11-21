const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const T = require('../js/tape.js');
globalThis.__API_BASE__ = process.env.QA_API || 'http://localhost:8000';
const base = globalThis.__API_BASE__;
const quant = v => JSON.parse(JSON.stringify(v, (k, x) => k === 'parts' ? undefined : typeof x === 'number' ? Math.round(x * 1000) / 1000 : x));
function synthetic(count, fps) {
  const frames = [];
  for (let i = 0; i <= 300 * fps; i++) {
    const t = i / fps;
    const p = Array.from({ length: count }, (_, id) => {
      const w = t * (0.7 + id * 0.031) + id;
      return { id, name: '球员' + id, x: Math.sin(w) * 230, y: Math.cos(w * 0.8) * 180, z: Math.max(0, Math.sin(w * 3)) * 50,
        vx: Math.cos(w) * 60, vy: Math.sin(w) * 60, face: Math.sin(w) > 0 ? 1 : -1,
        pose: { armL: Math.sin(w * 8), armR: Math.cos(w * 8), legL: Math.cos(w * 6), legR: Math.sin(w * 6) },
        h: 180 + id, col: '#ffaa88', stun: 0, stunK: 0, knock: null, knockT: 0, knockD: 0, knockUp: 0, knockDx: 0, knockDy: 0,
        flash: 0, off: false, action: null, sq: 1, armS: [0, 0], brPh: w, stam: 0.7 + Math.sin(w) * 0.2, exr: 0, grip: 1,
        hasBall: id === Math.floor(t / 8) % count, anim: 'run', ghosts: null };
    });
    frames.push({ t: 100 + t, p, b: { x: p[0].x + 10, y: p[0].y, z: 15 + Math.abs(Math.sin(t * 8)) * 35, spin: t * 4, under: false, state: 'held', holder: 0 }, net: 0, rings: [], led: null, cheer: 0,
      s: { score: [Math.floor(t / 20) * 2, Math.floor(t / 27) * 2], phase: 'play', gclock: 300 - t, off: Math.floor(t / 8) % 2, ...(count === 10 ? { q: 1 } : {}) } });
  }
  return { v: 1, meta: { mode: count === 10 ? 't5' : 'cpu', title: '五分钟测试', players: frames[0].p.map(p => p.name), score: frames.at(-1).s.score, date: '2026-01-01', dur: 300, dt: 1 / fps }, frames };
}
async function request(method, path, body) {
  return fetch(base + '/api/' + path, { method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
}
async function main() {
  const ids = [];
  try {
    assert.equal(T.at({ frames: [] }, 0), null);
    assert.equal(T.summary(null), null);
    await assert.rejects(T.decode('invalid'));
    for (const [n, fps] of [[2, 30], [10, 15]]) {
      const tape = synthetic(n, fps), data = await T.encode(tape);
      console.log(`${n} players: ${tape.frames.length} frames, ${fps} fps, ${data.length} encoded bytes (${(data.length / 1048576).toFixed(2)} MiB)`);
      assert(data.length < 3 * 1048576, 'size budget');
      assert.deepEqual(await T.decode(data), quant(tape));
      const id = 'qa_' + n + '_' + Date.now(), name = '测试录像 ' + id; ids.push(id);
      let r = await request('PUT', 'replays/' + id, { name: '  ' + name + '  ', meta: tape.meta, data });
      assert.equal(r.status, 200); assert.equal((await r.json()).name, name);
      assert((await T.list()).some(r => r.id === id && !('data' in r)));
      for (const key of [id, name]) { const row = await T.get(key); assert.equal(row.data, data); assert.deepEqual(row.tape, quant(tape)); }
      assert.equal((await request('PUT', 'replays/qa_duplicate', { name, data })).status, 409);
      assert.equal(T.at(tape, 23.6).t, 123.6);
      console.log(execFileSync(process.execPath, [__dirname + '/replay.cjs', 'list', '--api', base], { encoding: 'utf8' }).trim());
      console.log(execFileSync(process.execPath, [__dirname + '/replay.cjs', 'show', name, '--api', base], { encoding: 'utf8' }).trim());
      console.log('PASS round-trip, list, GET name/id, duplicate name, CLI list/show');
    }
    for (const body of [{ name: '', data: '' }, { name: 'x', data: {} }, []]) assert.equal((await request('PUT', 'replays/qa_bad', body)).status, 400);
    assert.equal((await request('PUT', 'replays/bad!', {})).status, 400);
    assert.equal((await request('GET', 'replays/qa_missing')).status, 404);
    const empty = { v: 1, meta: {}, frames: [] }, label = '空录像_' + Date.now();
    const first = await T.save(label, empty); ids.push(first.id);
    const second = await T.save(label, empty); ids.push(second.id);
    assert.equal(second.name, label + ' (2)');
    assert.deepEqual((await T.get(second.id)).tape, empty);
    assert.equal((await request('PUT', 'replays/' + first.id, { name: label, meta: {}, data: '' })).status, 200);
    assert.equal((await (await request('GET', 'replays/' + first.id)).json()).data, '');
    console.log('PASS auto-suffix, empty tape/data, overwrite clears chunks');
    await request('POST', 'freeze', { sec: 5 });
    try { assert.equal((await request('DELETE', 'replays/' + ids[0])).status, 503); } finally { await request('POST', 'freeze', { sec: 0 }); }
    console.log('PASS empty/error cases and freeze');
  } finally {
    for (const id of ids) { assert.equal((await request('DELETE', 'replays/' + id)).status, 200); assert.equal((await request('GET', 'replays/' + id)).status, 404); }
  }
  console.log('PASS delete and missing replay');
}
main().catch(e => { console.error(e); process.exitCode = 1; });
