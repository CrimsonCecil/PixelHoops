// Room relay: behaviour-compatible port of worker/src/room.js (Durable Object RoomRelay).
// One in-memory Room per 5-char code. Wire protocol and close codes are unchanged:
//   4000 Host left · 4001 Host replaced · 4003 Unauthorized host · 4404 Room not found
import { WebSocketServer } from 'ws';

export const MAX_FRAME = 1024 * 1024;
const HOST_GRACE_MS = 120000;
const CODE_RE = /^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{5}$/;
const TOKEN_RE = /^[a-f0-9]{64}$/;

class Room {
  constructor() {
    this.claim = null;      // { token, lastSeen }
    this.nextId = 0;
    this.conns = new Set(); // { ws, role: 'host'|'guest'|'closed', id }
  }
  of(role) {
    const out = [];
    for (const c of this.conns) if (c.role === role && c.ws.readyState === 1) out.push(c);
    return out;
  }
  send(c, msg) {
    const data = JSON.stringify(msg);
    if (Buffer.byteLength(data) > MAX_FRAME) return;
    try { c.ws.send(data); } catch { this.leave(c); }
  }
  kill(c, code, reason) {
    c.role = 'closed';
    try { c.ws.close(code, reason); } catch { /* socket already gone */ }
  }
  join(ws, role, token) {
    const c = { ws, role: 'closed', id: 0 };
    this.conns.add(c);
    ws.on('message', (data, isBinary) => this.message(c, data, isBinary));
    ws.on('close', () => this.leave(c));
    ws.on('error', () => this.leave(c));

    if (role === 'host') {
      const hosts = this.of('host');
      const expired = this.claim?.lastSeen != null && !hosts.length && Date.now() - this.claim.lastSeen > HOST_GRACE_MS;
      if (!TOKEN_RE.test(token || '') || (this.claim && this.claim.token !== token && !expired)) {
        this.kill(c, 4003, 'Unauthorized host');
        return;
      }
      this.claim = { token, lastSeen: null };
      for (const old of hosts) this.kill(old, 4001, 'Host replaced');
      c.role = 'host';
      for (const g of this.of('guest')) this.send(c, { type: 'peer-open', id: g.id });
    } else {
      const host = this.of('host')[0];
      if (!host) { this.kill(c, 4404, 'Room not found'); return; }
      c.id = ++this.nextId;
      c.role = 'guest';
      this.send(host, { type: 'peer-open', id: c.id });
      this.send(c, { type: 'relay-ready' });
    }
  }
  message(c, data, isBinary) {
    if (isBinary) return;
    const text = data.toString();
    if (Buffer.byteLength(text) > MAX_FRAME) return;
    let msg;
    try { msg = JSON.parse(text); } catch { return; }
    if (c.role === 'guest') {
      const host = this.of('host')[0];
      if (host) this.send(host, { from: c.id, msg });
    } else if (c.role === 'host' && msg && typeof msg === 'object' && Object.hasOwn(msg, 'msg')) {
      for (const g of this.of('guest')) if (msg.to === '*' || msg.to === g.id) this.send(g, msg.msg);
    }
  }
  leave(c) {
    if (!this.conns.has(c)) return;
    const role = c.role;
    c.role = 'closed';
    this.conns.delete(c);
    try { c.ws.close(1000, 'Closed'); } catch { /* ignore */ }
    if (role === 'host') {
      if (this.of('host').length) return; // replaced by a newer host socket
      if (this.claim) this.claim.lastSeen = Date.now();
      for (const g of this.of('guest')) this.kill(g, 4000, 'Host left');
    } else if (role === 'guest') {
      const host = this.of('host')[0];
      if (host) this.send(host, { type: 'peer-close', id: c.id });
    }
  }
  idle() {
    if (this.conns.size) return false;
    return !this.claim || (this.claim.lastSeen != null && Date.now() - this.claim.lastSeen > HOST_GRACE_MS);
  }
}

export function createRelay() {
  const rooms = new Map();
  // noDelay is on by default in ws; permessage-deflate stays off (latency > bandwidth for 20-30Hz snapshots).
  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_FRAME * 4, perMessageDeflate: false });

  function upgrade(req, socket, head) {
    const url = new URL(req.url, 'http://x');
    const m = url.pathname.match(/\/api\/rooms\/([^/]+)\/ws$/);
    const role = url.searchParams.get('role');
    if (!m || !CODE_RE.test(m[1]) || !['host', 'guest'].includes(role)) {
      socket.write('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n');
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      ws.isAlive = true;
      ws.on('pong', () => { ws.isAlive = true; });
      let room = rooms.get(m[1]);
      if (!room) { room = new Room(); rooms.set(m[1], room); }
      room.join(ws, role, url.searchParams.get('token'));
    });
  }

  // Heartbeat: drop half-open sockets (phones switching Wi-Fi/4G) so peers get peer-close / Host left quickly.
  const beat = setInterval(() => {
    for (const ws of wss.clients) {
      if (ws.isAlive === false) { ws.terminate(); continue; }
      ws.isAlive = false;
      try { ws.ping(); } catch { /* ignore */ }
    }
  }, 15000);
  const sweep = setInterval(() => { for (const [code, room] of rooms) if (room.idle()) rooms.delete(code); }, 60000);
  beat.unref(); sweep.unref();

  return {
    upgrade,
    stats: () => ({ rooms: rooms.size, sockets: wss.clients.size }),
    close() { clearInterval(beat); clearInterval(sweep); for (const ws of wss.clients) ws.terminate(); wss.close(); },
  };
}
