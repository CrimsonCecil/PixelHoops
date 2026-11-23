// D1-compatible adapter on top of node:sqlite, so worker/src/index.js + rooms.js run unchanged.
// Surface used by the Worker: prepare().bind().run()/all()/first(), and db.batch([...]).
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';

export function openD1(file, schemaFile) {
  mkdirSync(dirname(file), { recursive: true });
  const raw = new DatabaseSync(file);
  raw.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL; PRAGMA busy_timeout=5000;');
  if (schemaFile) raw.exec(readFileSync(schemaFile, 'utf8'));

  const norm = (v) => (v === undefined ? null : typeof v === 'boolean' ? Number(v) : v);

  function prepare(sql) {
    const stmt = raw.prepare(sql);
    let values = [];
    const api = {
      bind(...v) { values = v.map(norm); return api; },
      async run() { return api._run(); },
      async all() { return { results: stmt.all(...values) }; },
      async first() { return stmt.get(...values) || null; },
      // sync variants are used by batch() so a transaction never yields mid-way
      _run() { const r = stmt.run(...values); return { success: true, meta: { changes: Number(r.changes) } }; },
      _all() { return { results: stmt.all(...values) }; },
    };
    return api;
  }

  return {
    raw,
    prepare,
    async batch(statements) {
      raw.exec('BEGIN IMMEDIATE');
      try {
        const out = statements.map((s) => s._run());
        raw.exec('COMMIT');
        return out;
      } catch (e) {
        try { raw.exec('ROLLBACK'); } catch { /* already rolled back */ }
        throw e;
      }
    },
    close() { raw.close(); },
  };
}
