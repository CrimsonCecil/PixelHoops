const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,PUT,POST,DELETE,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};
const ID_RE = /^[a-zA-Z0-9_-]{1,40}$/;
const send = (code, obj) => new Response(code === 204 ? null : JSON.stringify(obj), {
  status: code,
  headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
});

async function exportAll(db) {
  const rows = (await db.prepare('SELECT id, name, data, updated FROM profiles ORDER BY updated').all()).results;
  const d = await db.prepare("SELECT v FROM meta WHERE k='default'").first();
  return { profiles: rows.map((r) => ({ id: r.id, name: r.name, data: JSON.parse(r.data), updated: r.updated })), default: d ? d.v : 'official' };
}

export default {
  async fetch(req, env) {
    const db = env.DB;
    const url = new URL(req.url);
    const i = url.pathname.indexOf('/api/');
    const p = i >= 0 ? url.pathname.slice(i) : url.pathname;
    const m = p.match(/^\/api\/profiles\/([^/]+)$/);
    const body = async () => { try { return await req.json(); } catch { return null; } };
    const now = () => Date.now() / 1000;

    if (req.method === 'OPTIONS') return send(204);
    if (p === '/api/replays' && req.method === 'GET') {
      const rows = (await db.prepare('SELECT * FROM replays ORDER BY created DESC').all()).results;
      return send(200, { replays: rows.map(r => ({ ...r, meta: JSON.parse(r.meta) })) });
    }
    if (p.startsWith('/api/replays/')) {
      const key = p.slice('/api/replays/'.length);
      if (req.method === 'GET') {
        let k; try { k = decodeURIComponent(key); } catch { return send(400, { error: 'bad key' }); }
        const r = await db.prepare('SELECT * FROM replays WHERE id=? OR name=? ORDER BY (id=?) DESC LIMIT 1').bind(k, k, k).first();
        if (!r) return send(404, { error: 'not found' });
        const chunks = (await db.prepare('SELECT data FROM replay_chunks WHERE id=? ORDER BY seq').bind(r.id).all()).results;
        return send(200, { ...r, meta: JSON.parse(r.meta), data: chunks.map(c => c.data).join('') });
      }
      if (req.method === 'PUT' || req.method === 'DELETE') {
        if (!ID_RE.test(key)) return send(400, { error: 'bad id' });
        if (req.method === 'DELETE') {
          await db.batch([db.prepare('DELETE FROM replay_chunks WHERE id=?').bind(key), db.prepare('DELETE FROM replays WHERE id=?').bind(key)]);
          return send(200, { ok: true });
        }
        let b;
        try {
          const raw = await req.text();
          if (new TextEncoder().encode(raw).length > 8 * 1024 * 1024) return send(400, { error: 'bad body' });
          b = JSON.parse(raw);
        } catch { return send(400, { error: 'bad body' }); }
        if (!b || typeof b !== 'object' || Array.isArray(b)) return send(400, { error: 'bad body' });
        if (typeof b.name !== 'string' || !b.name.trim() || Array.from(b.name.trim()).length > 40) return send(400, { error: 'bad name' });
        if (typeof b.data !== 'string') return send(400, { error: 'bad data' });
        const name = b.name.trim();
        if (await db.prepare('SELECT 1 FROM replays WHERE name=? AND id<>?').bind(name, key).first()) return send(409, { error: 'name taken' });
        const row = { id: key, name, meta: b.meta ?? null, size: new TextEncoder().encode(b.data).length, created: now() };
        const st = [db.prepare('INSERT INTO replays VALUES (?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name, meta=excluded.meta, size=excluded.size, created=excluded.created').bind(key, name, JSON.stringify(row.meta), row.size, row.created), db.prepare('DELETE FROM replay_chunks WHERE id=?').bind(key)];
        for (let n = 0; n < b.data.length; n += 900000) st.push(db.prepare('INSERT INTO replay_chunks VALUES (?,?,?)').bind(key, n / 900000, b.data.slice(n, n + 900000)));
        try { await db.batch(st); } catch (e) {
          if (String(e).includes('UNIQUE constraint failed: replays.name')) return send(409, { error: 'name taken' });
          throw e;
        }
        return send(200, row);
      }
    }
    if (req.method === 'GET') {
      if (p === '/api/profiles' || p === '/api/export') return send(200, await exportAll(db));
      if (p === '/api/health') return send(200, { ok: true, frozen: false });
      if (p === '/api/history') {
        const rows = (await db.prepare('SELECT id, name, data, updated, op FROM history ORDER BY updated DESC LIMIT 200').all()).results;
        return send(200, { history: rows.map((r) => ({ ...r, data: JSON.parse(r.data) })) });
      }
    }
    if (req.method === 'PUT' && m) {
      const id = m[1];
      if (!ID_RE.test(id) || id === 'official') return send(400, { error: 'bad id' });
      const b = await body();
      if (!b) return send(400, { error: 'bad body' });
      const name = String(b.name || '未命名').slice(0, 30);
      let data = b.data || {};
      if (typeof data !== 'object' || Array.isArray(data)) return send(400, { error: 'bad data' });
      data = Object.fromEntries(Object.entries(data).filter(([, v]) => ['number', 'boolean', 'string'].includes(typeof v)).map(([k, v]) => [k.slice(0, 60), v]));
      const js = JSON.stringify(data), t = now();
      await db.batch([
        db.prepare('INSERT OR REPLACE INTO profiles VALUES (?,?,?,?)').bind(id, name, js, t),
        db.prepare('INSERT INTO history VALUES (?,?,?,?,?)').bind(id, name, js, t, 'put'),
      ]);
      return send(200, await exportAll(db));
    }
    if (req.method === 'DELETE' && m) {
      const id = m[1];
      const r = await db.prepare('SELECT id, name, data FROM profiles WHERE id=?').bind(id).first();
      const st = [];
      if (r) st.push(db.prepare('INSERT INTO history VALUES (?,?,?,?,?)').bind(r.id, r.name, r.data, now(), 'delete'));
      st.push(db.prepare('DELETE FROM profiles WHERE id=?').bind(id));
      st.push(db.prepare("DELETE FROM meta WHERE k='default' AND v=?").bind(id));
      await db.batch(st);
      return send(200, await exportAll(db));
    }
    if (req.method === 'POST') {
      if (p === '/api/freeze') return send(200, { frozen: false, until: 0 });
      if (p === '/api/default') {
        const b = await body();
        if (!b) return send(400, { error: 'bad body' });
        const id = String(b.id || 'official');
        if (id !== 'official' && !(await db.prepare('SELECT 1 FROM profiles WHERE id=?').bind(id).first())) return send(404, { error: 'no profile' });
        await db.prepare("INSERT OR REPLACE INTO meta VALUES ('default', ?)").bind(id).run();
        return send(200, await exportAll(db));
      }
    }
    return send(404, { error: 'not found' });
  },
};
