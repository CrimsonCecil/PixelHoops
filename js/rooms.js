// PIXEL HOOPS - PeerJS 房间
(function () {
  const PH = window.PH;
  const alphabet = '23456789ABCDEFGHJKMNPQRSTUVWXYZ', prefix = 'pixelhoops-v1-';
  const room = { peer: null, role: '', code: '', links: new Map(), active: false };
  let script, attempt = 0, pending = null, timeout;

  function loadPeer() {
    if (window.Peer) return Promise.resolve(window.Peer);
    if (!script) script = new Promise((resolve, reject) => {
      const tag = document.createElement('script');
      tag.src = 'https://cdn.jsdelivr.net/npm/peerjs@1.5.5/dist/peerjs.min.js';
      tag.onload = () => window.Peer ? resolve(window.Peer) : reject(new Error('PeerJS'));
      tag.onerror = () => { tag.remove(); reject(new Error('PeerJS')); };
      document.head.append(tag);
    }).catch((e) => { script = null; throw e; });
    return script;
  }
  function write(conn, msg) { if (conn.open) conn.send(msg); }
  function close() {
    attempt++; clearTimeout(timeout); pending = null;
    const peer = room.peer;
    room.links.clear();
    Object.assign(room, { peer: null, role: '', code: '', active: false });
    if (peer) peer.destroy();
  }
  function broadcast(msg) { for (const link of room.links.values()) write(link.conn, msg); }
  function cleanInput(input) {
    if (!input || typeof input !== 'object') return null;
    const o = {};
    for (const key of ['mx', 'my', 'dx', 'dy']) o[key] = Number.isFinite(input[key]) ? Math.max(-1, Math.min(1, input[key])) : 0;
    for (const key of ['sprint', 'a1', 'a2', 'a3', 'post', 'dribble', 'hesi', 'pass', 'screen', 'selfAlley']) o[key] = input[key] === true;
    if (o.pass && ['chest', 'skip', 'bounce', 'lob', 'alley'].includes(input.passKind)) o.passKind = input.passKind;
    return o;
  }
  function incoming(conn, handlers, token) {
    let slot = -1;
    const watch = setTimeout(() => { if (slot < 0) conn.close(); }, 10000);
    conn.on('data', (msg) => {
      if (token !== attempt || !msg || typeof msg !== 'object') return;
      if (slot < 0 && msg.type === 'join') {
        slot = room.active ? -1 : handlers.reserve(msg.mode, room.links);
        if (slot < 0) { write(conn, { type: 'reject' }); return; }
        clearTimeout(watch);
        room.links.set(slot, { conn, input: null, last: 0 });
        write(conn, { type: 'joined', slot });
        handlers.change();
      } else if (slot >= 0 && msg.type === 'input' && room.active) {
        const link = room.links.get(slot);
        if (!link || link.conn !== conn) return;
        link.input = cleanInput(msg.input); link.last = performance.now();
      }
    });
    const end = () => {
      clearTimeout(watch);
      if (slot >= 0 && room.links.get(slot)?.conn === conn) {
        room.links.delete(slot);
        if (token === attempt) handlers.change(slot);
      }
    };
    conn.on('close', end); conn.on('error', end);
  }
  async function open(code, mode, handlers) {
    close();
    const token = attempt, host = !code;
    room.role = host ? 'host' : 'guest';
    const fail = (reason) => { if (token === attempt) { close(); handlers.error(reason); } };
    timeout = setTimeout(() => fail('连接超时，请检查网络或房间号。'), 15000);
    try {
      const Peer = await loadPeer();
      if (token !== attempt) return;
      if (host) code = Array.from(crypto.getRandomValues(new Uint8Array(5)), (n) => alphabet[n % alphabet.length]).join('');
      const peer = room.peer = host ? new Peer(prefix + code) : new Peer();
      peer.on('error', (err) => fail(err.type === 'peer-unavailable' ? '找不到该房间。' : '在线服务连接失败（' + (err.type || 'WebRTC') + '）。'));
      peer.on('open', () => {
        if (token !== attempt) return;
        room.code = code;
        if (host) { clearTimeout(timeout); handlers.ready(code); return; }
        const conn = pending = peer.connect(prefix + code, { reliable: true, serialization: 'binary' });
        conn.on('open', () => write(conn, { type: 'join', mode }));
        conn.on('close', () => fail('已与房主断开连接。'));
        conn.on('error', () => fail('无法建立对等连接。'));
        conn.on('data', (msg) => {
          if (token !== attempt || !msg) return;
          if (msg.type === 'reject') fail('房间已满、已开赛或比赛模式不同。');
          else if (msg.type === 'joined') { clearTimeout(timeout); handlers.joined(msg.slot); }
          else if (msg.type === 'start') { room.active = true; handlers.start(msg.config); }
          else if (msg.type === 'state' && room.active) handlers.state(msg.state);
        });
      });
      if (host) peer.on('connection', (conn) => incoming(conn, handlers, token));
    } catch (err) { fail('无法加载在线服务，请检查网络。'); }
  }
  function input(data) { if (pending) write(pending, { type: 'input', input: data }); }
  function inputs() {
    const out = {}, now = performance.now();
    for (const [slot, link] of room.links) if (link.input && now - link.last < 500) out[slot] = link.input;
    return out;
  }
  const valid = (code) => code.length === 5 && [...code].every((c) => alphabet.includes(c));
  PH.rooms = { room, open, close, broadcast, input, inputs, valid };
})();
