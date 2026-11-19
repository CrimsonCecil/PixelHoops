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
