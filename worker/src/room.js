const MAX_FRAME = 64 * 1024;

export class RoomRelay {
  constructor(state) {
    this.state = state;
  }
  sockets(role) {
    return this.state.getWebSockets().filter((ws) => ws.readyState === 1 && ws.deserializeAttachment()?.role === role);
  }
  send(ws, msg) {
    const data = JSON.stringify(msg);
    if (new TextEncoder().encode(data).length > MAX_FRAME) return;
    try { ws.send(data); } catch { this.webSocketError(ws); }
  }
  async fetch(req) {
    const role = new URL(req.url).searchParams.get('role');
    if (req.headers.get('Upgrade')?.toLowerCase() !== 'websocket') return new Response('WebSocket required', { status: 426 });
    if (role !== 'host' && role !== 'guest') return new Response('Invalid role', { status: 400 });
    const [client, ws] = Object.values(new WebSocketPair());
    this.state.acceptWebSocket(ws);
    if (role === 'host') {
      for (const old of this.sockets('host')) {
        old.serializeAttachment({ role: 'closed' });
        old.close(4001, 'Host replaced');
      }
      ws.serializeAttachment({ role });
      for (const guest of this.sockets('guest')) this.send(ws, { type: 'peer-open', id: guest.deserializeAttachment().id });
    } else if (!this.sockets('host').length) {
      ws.serializeAttachment({ role: 'closed' });
      ws.close(4404, 'Room not found');
    } else {
      const id = await this.state.blockConcurrencyWhile(async () => {
        const next = (await this.state.storage.get('nextId') || 0) + 1;
        await this.state.storage.put('nextId', next);
        return next;
      });
      ws.serializeAttachment({ role, id });
      const host = this.sockets('host')[0];
      if (host) this.send(host, { type: 'peer-open', id });
      else { ws.serializeAttachment({ role: 'closed' }); ws.close(4404, 'Room not found'); }
    }
    return new Response(null, { status: 101, webSocket: client });
  }
  webSocketMessage(ws, data) {
    if (typeof data !== 'string' || new TextEncoder().encode(data).length > MAX_FRAME) return;
    let msg;
    try { msg = JSON.parse(data); } catch { return; }
    const sender = ws.deserializeAttachment();
    if (sender?.role === 'guest') {
      const host = this.sockets('host')[0];
      if (host) this.send(host, { from: sender.id, msg });
    } else if (sender?.role === 'host' && msg && Object.hasOwn(msg, 'msg')) {
      for (const guest of this.sockets('guest')) {
        if (msg.to === '*' || msg.to === guest.deserializeAttachment().id) this.send(guest, msg.msg);
      }
    }
  }
  webSocketClose(ws) {
    const sender = ws.deserializeAttachment();
    ws.serializeAttachment({ role: 'closed' });
    if (sender?.role === 'host') {
      for (const guest of this.sockets('guest')) {
        guest.serializeAttachment({ role: 'closed' });
        guest.close(4000, 'Host left');
      }
    } else if (sender?.role === 'guest') {
      const host = this.sockets('host')[0];
      if (host) this.send(host, { type: 'peer-close', id: sender.id });
    }
    try { ws.close(1000, 'Closed'); } catch { /* Already closed. */ }
  }
  webSocketError(ws) {
    this.webSocketClose(ws);
  }
}
