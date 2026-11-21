// Node 24: replay.cjs list | show <name|id> [seconds] | dump <name|id> <t0> <t1>
// Add --api http://localhost:8000 for local data. This CLI only issues GETs.
// 查看云端录像: index.html?replay=<URL-encoded name or id>&t=<seconds> opens paused.
const T = require('../js/tape.js');
async function main() {
  const args = process.argv.slice(2), i = args.indexOf('--api');
  let base = 'https://pixelhoops-api.cecilcai322.workers.dev';
  if (i >= 0) { base = args[i + 1]; args.splice(i, 2); }
  globalThis.__API_BASE__ = base;
  const [cmd, key, a, b] = args;
  if (cmd === 'list') return console.log(JSON.stringify(await T.list(), null, 2));
  if (!key || !['show', 'dump'].includes(cmd)) throw new Error('Usage: replay.cjs list | show <name|id> [t] | dump <name|id> <t0> <t1> [--api <base>]');
  const row = await T.get(key), tape = row.tape;
  if (cmd === 'show') {
    console.log(JSON.stringify({ id: row.id, name: row.name, meta: tape.meta }, null, 2));
    if (a !== undefined) {
      if (!Number.isFinite(+a)) throw new Error('Invalid time');
      console.log(JSON.stringify(T.summary(T.at(tape, +a)), null, 2));
    } else {
      let prev;
      for (const f of tape.frames) {
        const score = JSON.stringify(f.s && f.s.score);
        if (score !== prev) { console.log(JSON.stringify({ t: f.t - tape.frames[0].t, score: f.s && f.s.score })); prev = score; }
      }
    }
  } else {
    if (a === undefined || b === undefined || !Number.isFinite(+a) || !Number.isFinite(+b) || +b < +a) throw new Error('Invalid time range');
    for (let t = +a; t <= +b; t += 0.25) console.log(JSON.stringify({ t, ...T.summary(T.at(tape, t)) }));
  }
}
main().catch(e => { console.error(e.message); process.exitCode = 1; });
