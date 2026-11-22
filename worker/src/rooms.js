// Ephemeral public directory; WebRTC gameplay still uses PeerJS, not this API.
const TTL = 60, CODE = /^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{5}$/, TOKEN = /^[a-zA-Z0-9_-]{20,80}$/;
export async function roomRequest(req, db, path, send) {
  if (path !== '/api/rooms' && !path.startsWith('/api/rooms/')) return null;
  await db.prepare('CREATE TABLE IF NOT EXISTS rooms (code TEXT PRIMARY KEY, token TEXT NOT NULL, name TEXT NOT NULL, mode TEXT NOT NULL, players INTEGER NOT NULL, capacity INTEGER NOT NULL, updated REAL NOT NULL)').run();
  const now = Date.now() / 1000;
  if (req.method === 'GET' && path === '/api/rooms') {
    const rows = (await db.prepare('SELECT code,name,mode,players,capacity FROM rooms WHERE updated>? AND players<capacity ORDER BY updated DESC LIMIT 100').bind(now - TTL).all()).results;
    return send(200, { rooms: rows });
  }
  const code = path.slice('/api/rooms/'.length);
  if (!CODE.test(code) || !['PUT', 'DELETE'].includes(req.method)) return send(400, { error: 'bad room request' });
  let b;
  try { const raw = await req.text(); if (raw.length > 2048) throw Error(); b = JSON.parse(raw); } catch { return send(400, { error: 'bad body' }); }
  if (!b || typeof b !== 'object' || !TOKEN.test(b.token)) return send(400, { error: 'bad token' });
  if (req.method === 'DELETE') {
    await db.prepare('DELETE FROM rooms WHERE code=? AND token=?').bind(code, b.token).run();
    return send(200, { ok: true });
  }
  if (typeof b.name !== 'string' || !b.name.trim() || Array.from(b.name.trim()).length > 24 || !['online', 't3'].includes(b.mode) ||
      !Number.isInteger(b.players) || !Number.isInteger(b.capacity) || b.players < 1 || b.capacity < 2 || b.players > b.capacity || b.capacity > (b.mode === 'online' ? 2 : 6)) return send(400, { error: 'bad room' });
  await db.prepare('DELETE FROM rooms WHERE updated<?').bind(now - TTL).run();
  const result = await db.prepare('INSERT INTO rooms VALUES (?,?,?,?,?,?,?) ON CONFLICT(code) DO UPDATE SET name=excluded.name,mode=excluded.mode,players=excluded.players,capacity=excluded.capacity,updated=excluded.updated WHERE rooms.token=excluded.token')
    .bind(code, b.token, b.name.trim(), b.mode, b.players, b.capacity, now).run();
  return send(result.meta.changes ? 200 : 409, result.meta.changes ? { ok: true, ttl: TTL } : { error: 'room already owned' });
}
