// Copy the live data (tune profiles, history, replays, public room leases are ephemeral so skipped)
// from the Cloudflare API into the local SQLite DB, through the public REST API only (no CF token needed).
//
//   node migrate-from-cloudflare.mjs                      # reads https://pixelhoops-api.kccecil.com, writes DB_FILE
//   SRC=https://pixelhoops-api.kccecil.com DB_FILE=/opt/pixelhoops/data/pixelhoops.db node migrate-from-cloudflare.mjs
//
// Idempotent: re-running upserts by id and never deletes anything. Run it right before switching DNS,
// then once more right after, to pick up anything saved in between.
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openD1 } from './lib/d1.mjs';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const SRC = (process.env.SRC || 'https://pixelhoops-api.kccecil.com').replace(/\/$/, '');
const DB_FILE = process.env.DB_FILE || join(HERE, 'data', 'pixelhoops.db');
const db = openD1(DB_FILE, join(HERE, '..', 'worker', 'schema.sql'));

const get = async (p) => {
  const r = await fetch(SRC + p, { headers: { accept: 'application/json' } });
  if (!r.ok) throw new Error(`${p} -> HTTP ${r.status}`);
  return r.json();
};

// 1. profiles + default
const exp = await get('/api/export');
for (const p of exp.profiles) {
  await db.prepare('INSERT OR REPLACE INTO profiles VALUES (?,?,?,?)').bind(p.id, p.name, JSON.stringify(p.data), p.updated).run();
}
if (exp.default) await db.prepare("INSERT OR REPLACE INTO meta VALUES ('default', ?)").bind(exp.default).run();
console.log(`profiles: ${exp.profiles.length}  default=${exp.default}`);

// 2. history (API returns newest 200; keep each row once)
const hist = (await get('/api/history')).history;
let h = 0;
for (const r of hist) {
  const dup = await db.prepare('SELECT 1 FROM history WHERE id=? AND updated=? AND op=?').bind(r.id, r.updated, r.op).first();
  if (dup) continue;
  await db.prepare('INSERT INTO history VALUES (?,?,?,?,?)').bind(r.id, r.name, JSON.stringify(r.data), r.updated, r.op).run();
  h++;
}
console.log(`history: +${h} (of ${hist.length})`);

// 3. replays (metadata list, then full body per replay, re-chunked at 900000 chars exactly like the Worker)
const list = (await get('/api/replays')).replays;
let ok = 0, skipped = 0;
for (const meta of list) {
  const have = await db.prepare('SELECT size FROM replays WHERE id=?').bind(meta.id).first();
  if (have && have.size === meta.size) { skipped++; continue; }
  const full = await get('/api/replays/' + encodeURIComponent(meta.id));
  if (full.data.length < 1 || new TextEncoder().encode(full.data).length !== meta.size) throw new Error(`replay ${meta.id}: size mismatch, aborting (nothing half-written)`);
  const st = [
    db.prepare('DELETE FROM replay_chunks WHERE id=?').bind(meta.id),
    db.prepare('INSERT OR REPLACE INTO replays VALUES (?,?,?,?,?)').bind(meta.id, meta.name, JSON.stringify(full.meta), meta.size, meta.created),
  ];
  for (let n = 0; n < full.data.length; n += 900000) st.push(db.prepare('INSERT INTO replay_chunks VALUES (?,?,?)').bind(meta.id, n / 900000, full.data.slice(n, n + 900000)));
  await db.batch(st);
  ok++;
  console.log(`  replay ${meta.id} "${meta.name}"  ${(meta.size / 1024).toFixed(0)} KB`);
}
console.log(`replays: copied ${ok}, already up to date ${skipped}, total ${list.length}`);

// 4. verify counts against source
const c = (t) => db.raw.prepare(`SELECT COUNT(*) n FROM ${t}`).get().n;
const mismatch = [];
if (c('profiles') < exp.profiles.length) mismatch.push('profiles');
if (c('replays') < list.length) mismatch.push('replays');
console.log(`local DB now: profiles=${c('profiles')} history=${c('history')} replays=${c('replays')} chunks=${c('replay_chunks')}`);
db.close();
if (mismatch.length) { console.error('VERIFY FAILED:', mismatch.join(', ')); process.exit(1); }
console.log('VERIFY OK');
