// Full seeded default games; QA_API selects a local API for the full 5V5 upload.
const assert = require('node:assert/strict');
const { load } = require('./replay-record.cjs');
const codec = require('../js/tape.js');
const fs = require('node:fs');
async function main() {
  for (const mode of ['cpu', 't3', 't5']) {
    const P = load(), G = P.game.G;
    if (mode === 'cpu') { P.game.newGame({ mode, arch0: 'curry', arch1: 'lebron' }); G.players.forEach(p => p.ctrl = 'cpu'); }
    if (mode === 't3') P.T3.start({ slots: ['curry', 'edwards', 'jokic', 'lebron', 'durant', 'giannis'].map(arch => ({ arch, role: 'cpu' })) });
    if (mode === 't5') P.T5.start({ home: 'BOS', away: 'DEN', human: -1 });
    G.vopt.replay = false;
    let ticks = 0;
    while ((mode === 't5' ? P.T5.T.phase : G.phase) !== 'over' && ticks++ < 60 * 7200) {
      if (mode === 'cpu') P.game.tick(1 / 60);
      else if (mode === 't3') P.T3.tick(1 / 60);
      else P.T5.tick(1 / 60);
      if (mode === 't5' && ticks % 36000 === 0) console.log(`5V5 progress: sim=${G.time.toFixed(1)}s quarter=${P.T5.T.q} frames=${G.tape.frames.length}`);
    }
    assert.equal(mode === 't5' ? P.T5.T.phase : G.phase, 'over', 'default game must finish');
    const tape = P.TAPE.finish();
    assert(!tape.meta.truncated, 'competitive game is never truncated by training cap');
    assert(Math.abs(tape.frames.at(-1).t - G.time) < 0.1, 'recorded through the final tick');
    assert.equal(tape.meta.dur, tape.frames.at(-1).t - tape.frames[0].t);
    const data = await codec.encode(tape);
    console.log(`PASS full ${mode}: ${G.time.toFixed(2)}s, score=${tape.meta.score.join('-')}, frames=${tape.frames.length}, encoded=${data.length} bytes (${(data.length / 1048576).toFixed(2)} MiB), truncated=false`);
    if (mode === 't5') {
      assert(P.T5.T.q >= 4);
      assert(data.length < 90 * 1048576, 'full default 5V5 fits upload budget without reducing 15fps');
      const base = process.env.QA_API || 'http://localhost:8000';
      assert(/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(base), 'local writes only');
      const id = 'full5_' + Date.now(), body = JSON.stringify({ name: id, meta: tape.meta, data });
      try {
        let r = await fetch(base + '/api/replays/' + id, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body });
        assert.equal(r.status, 200, await r.text());
        r = await fetch(base + '/api/replays/' + id);
        assert.equal(r.status, 200); assert.equal((await r.json()).data, data);
        console.log('PASS full 5V5 PUT/GET chunk reassembly equals encoded tape');
      } finally { assert.equal((await fetch(base + '/api/replays/' + id, { method: 'DELETE' })).status, 200); }
      for (const file of ['../server/server.py', '../worker/src/index.js']) assert.match(fs.readFileSync(__dirname + '/' + file, 'utf8'), /90 \* 1024 \* 1024/);
    }
  }
}
main().catch(e => { console.error(e); process.exitCode = 1; });
