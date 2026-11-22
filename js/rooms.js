// PIXEL HOOPS - PeerJS 房间
(function () {
  const PH = window.PH;
  const alphabet = '23456789ABCDEFGHJKMNPQRSTUVWXYZ', prefix = 'pixelhoops-v1-';
  const MAX_FRAME = 1024 * 1024;
  const room = { peer: null, role: '', code: '', links: new Map(), active: false, ping: null };
  let script, attempt = 0, pending = null, timeout, checkDeadline, stopRecovery;

  function clearDeadline() {
    clearTimeout(timeout);
    if (checkDeadline) {
      document.removeEventListener('visibilitychange', checkDeadline);
      window.removeEventListener('pageshow', checkDeadline);
      checkDeadline = null;
    }
  }

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
  function relayURL(code, role, secret) {
    const base = window.__API_BASE__;
    if (!base || /^__.*__$/.test(base)) return '';
    try {
      const url = new URL(base.replace(/\/$/, '') + '/api/rooms/' + code + '/ws');
      if (!['http:', 'https:'].includes(url.protocol)) return '';
      url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
      url.searchParams.set('role', role);
      if (secret) url.searchParams.set('token', secret);
      return url.href;
    } catch { return ''; }
  }
  function relayLink(send, end) {
    const listeners = new Map();
    return {
      open: false,
      on(type, fn) { if (!listeners.has(type)) listeners.set(type, []); listeners.get(type).push(fn); return this; },
      emit(type, msg) { for (const fn of listeners.get(type) || []) fn(msg); },
      send(msg) { if (this.open) send(msg); },
      close() { if (!this.open) return; this.open = false; end(); this.emit('close'); }
    };
  }
  function close() {
    attempt++; clearDeadline(); pending = null;
    if (stopRecovery) { stopRecovery(); stopRecovery = null; }
    const peer = room.peer;
    room.links.clear();
    Object.assign(room, { peer: null, role: '', code: '', active: false, ping: null });
    if (peer) peer.destroy();
  }
  function broadcast(msg) { for (const link of room.links.values()) write(link.conn, msg); }
  function cleanInput(input) {
    if (!input || typeof input !== 'object') return null;
    const o = {};
    for (const key of ['mx', 'my', 'dx', 'dy']) o[key] = Number.isFinite(input[key]) ? Math.max(-1, Math.min(1, input[key])) : 0;
    for (const key of ['sprint', 'a1', 'a2', 'a3', 'post', 'dribble', 'hesi', 'rs', 'rsPad', 'pass', 'screen', 'selfAlley']) o[key] = input[key] === true;
    if (o.pass && ['chest', 'skip', 'bounce', 'lob', 'alley'].includes(input.passKind)) o.passKind = input.passKind;
    return o;
  }
  function syncHostPing() {
    let best = null;
    for (const link of room.links.values()) {
      if (Number.isFinite(link.ping)) best = best == null ? link.ping : Math.max(best, link.ping);
    }
    room.ping = best;
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
        room.links.set(slot, { conn, input: null, last: 0, ping: null });
        write(conn, { type: 'joined', slot });
        handlers.change();
      } else if (slot >= 0 && msg.type === 'ping' && room.links.get(slot)?.conn === conn && Number.isFinite(msg.t)) {
        write(conn, { type: 'pong', t: msg.t });
      } else if (slot >= 0 && msg.type === 'pong' && room.links.get(slot)?.conn === conn && Number.isFinite(msg.t)) {
        const link = room.links.get(slot), rtt = Math.round(performance.now() - msg.t);
        if (link && rtt >= 0 && rtt < 60000) { link.ping = rtt; syncHostPing(); }
      } else if (slot >= 0 && !room.active && msg.type === 'lobby' && room.links.get(slot)?.conn === conn) {
        handlers.message?.(msg, slot);
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
        syncHostPing();
        if (token === attempt) handlers.change(slot);
      }
    };
    conn.on('close', end); conn.on('error', end);
  }
  async function open(code, mode, handlers) {
    close();
    const token = attempt, host = !code;
    room.role = host ? 'host' : 'guest';
    const fail = (reason) => {
      if (token !== attempt) return;
      try { close(); } finally { handlers.error(reason); }
    };
    const deadline = Date.now() + 15000;
    let relayError = '';
    const deadlineFailure = () => fail(!host && relayDone && relayError || '连接超时，请检查网络或房间号。');
    const expired = () => {
      if (Date.now() < deadline) return false;
      deadlineFailure();
      return true;
    };
    checkDeadline = expired;
    document.addEventListener('visibilitychange', checkDeadline);
    window.addEventListener('pageshow', checkDeadline);
    timeout = setTimeout(deadlineFailure, 15000);
    if (host) code = Array.from(crypto.getRandomValues(new Uint8Array(5)), (n) => alphabet[n % alphabet.length]).join('');
    const secret = host ? Array.from(crypto.getRandomValues(new Uint8Array(32)), (n) => n.toString(16).padStart(2, '0')).join('') : '';
    const url = relayURL(code, host ? 'host' : 'guest', secret);
    let relaySocket = null, relayConn = null, fallbackTimer, relayTimer, relayWatch, relayRetries = 0;
    let winner = null, p2pUp = false, relayUp = false, p2pDone = false, relayDone = !url;
    const relayGuests = new Map();
    let ready = false, joined = false, guestRetried = false, retries = 0, retryTimer = null;
    const alive = () => token === attempt;
    const current = (peer) => alive() && room.peer === peer;
    const hostReady = () => {
      if (ready || !alive()) return;
      ready = true; room.code = code; clearDeadline(); handlers.ready(code);
    };
    const hostFailure = (reason) => {
      if (p2pDone && relayDone && !p2pUp && !relayUp && !room.active) fail(reason);
    };
    const guestFailure = () => {
      if (p2pDone && relayDone && !winner) fail(relayError || '无法建立对等连接。');
    };
    const choose = (conn) => {
      if (!alive() || winner && winner !== conn) { conn.close(); return false; }
      if (expired()) { conn.close(); return false; }
      winner = pending = conn;
      clearTimeout(fallbackTimer); clearTimeout(retryTimer);
      if (conn !== relayConn && relaySocket) { relaySocket.close(); relaySocket = null; }
      if (conn === relayConn && room.peer) {
        const peer = room.peer; room.peer = null; peer.destroy();
      }
      return true;
    };
    const guestLink = (conn, valid = alive) => {
      conn.on('open', () => { if (valid() && choose(conn)) write(conn, { type: 'join', mode }); else conn.close(); });
      conn.on('close', () => { if (alive() && winner === conn) fail('已与房主断开连接。'); });
      conn.on('error', () => {
        if (!alive()) return;
        if (winner === conn) fail('无法建立对等连接。');
        else if (url) { p2pDone = true; startRelay(); guestFailure(); }
        else fail('无法建立对等连接。');
      });
      conn.on('data', (msg) => {
        if (!alive() || winner !== conn || !msg) return;
        if (msg.type === 'reject') fail('房间已满、已开赛或比赛模式不同。');
        else if (msg.type === 'joined') { if (expired()) return; joined = true; room.code = code; clearDeadline(); handlers.joined(msg.slot); }
        else if (msg.type === 'start') { room.active = true; handlers.start(msg.config); }
        else if (msg.type === 'state' && room.active) handlers.state(msg.state);
        else if (msg.type === 'lobby' && !room.active) handlers.message?.(msg);
        else if (msg.type === 'ping' && joined && Number.isFinite(msg.t)) write(conn, { type: 'pong', t: msg.t });
        else if (msg.type === 'pong' && joined && Number.isFinite(msg.t)) {
          const rtt = Math.round(performance.now() - msg.t);
          if (rtt >= 0 && rtt < 60000) room.ping = rtt;
        }
      });
    };
    function startRelay() {
      if (!url || !alive() || relaySocket || (!host && (winner || relayDone))) return;
      const send = (msg) => {
        const data = JSON.stringify(msg);
        if (ws.readyState === 1 && new TextEncoder().encode(data).length <= MAX_FRAME) ws.send(data);
      };
      let ws;
      try { ws = new window.WebSocket(url); } catch {
        relayDone = true;
        if (host) hostFailure('房间中继连接失败。');
        else { relayError = '房间中继连接失败。'; guestFailure(); }
        return;
      }
      relaySocket = ws;
      if (!host) {
        relayConn = relayLink(send, () => ws.close());
        guestLink(relayConn);
      }
      const conn = relayConn;
      const validSocket = () => alive() && relaySocket === ws;
      if (host) relayWatch = setTimeout(() => { if (validSocket() && !relayUp) ws.close(); }, 10000);
      ws.onopen = () => {
        if (!validSocket()) { ws.close(); return; }
        clearTimeout(relayWatch);
        if (host) { relayUp = true; relayDone = false; relayRetries = 0; hostReady(); }
      };
      ws.onmessage = (event) => {
        if (!validSocket()) return;
        if (typeof event.data !== 'string' || new TextEncoder().encode(event.data).length > MAX_FRAME) return;
        let msg; try { msg = JSON.parse(event.data); } catch { return; }
        if (!host) {
          if (!conn.open) {
            if (msg?.type === 'relay-ready') { relayUp = true; conn.open = true; conn.emit('open'); }
            return;
          }
          if (msg?.type === 'relay-close') conn.close();
          else conn.emit('data', msg);
        } else if (msg?.type === 'peer-open' && Number.isInteger(msg.id)) {
          if (relayGuests.has(msg.id)) return;
          const link = relayLink((data) => send({ to: msg.id, msg: data }), () => {
            relayGuests.delete(msg.id); send({ to: msg.id, msg: { type: 'relay-close' } });
          });
          relayGuests.set(msg.id, link); incoming(link, handlers, token); link.open = true; link.emit('open');
        } else if (msg?.type === 'peer-close') relayGuests.get(msg.id)?.close();
        else if (msg && Object.hasOwn(msg, 'from')) relayGuests.get(msg.from)?.emit('data', msg.msg);
      };
      ws.onerror = () => { /* WebSocket close carries the failure code. */ };
      ws.onclose = (event) => {
        if (!validSocket()) return;
        relaySocket = null; relayUp = false; clearTimeout(relayWatch);
        if (!host) {
          relayDone = true;
          relayError = event.code === 4404 ? '找不到该房间。' : '房间中继已断开（' + event.code + '）。';
          if (winner === conn) fail(relayError);
          else guestFailure();
          return;
        }
        for (const link of [...relayGuests.values()]) link.close();
        if (!alive()) return;
        const fatal = event.code === 4001 || event.code === 4003;
        if (fatal || !p2pUp && relayRetries >= 3) {
          relayDone = true; hostFailure('房间中继重连失败。');
        } else {
          relayTimer = setTimeout(startRelay, Math.min(10000, 500 * 2 ** Math.min(relayRetries++, 5)));
        }
      };
    }
    const visibleRelay = () => {
      if (host && !document.hidden && !relaySocket && !relayDone && alive()) { clearTimeout(relayTimer); startRelay(); }
    };
    document.addEventListener('visibilitychange', visibleRelay);
    stopRecovery = () => {
      clearTimeout(retryTimer); clearTimeout(fallbackTimer); clearTimeout(relayTimer); clearTimeout(relayWatch);
      document.removeEventListener('visibilitychange', visibleRelay);
      document.removeEventListener('visibilitychange', visible);
      const ws = relaySocket; relaySocket = null;
      if (ws) ws.close();
      for (const link of [...relayGuests.values()]) link.close();
      if (relayConn) relayConn.open = false;
    };
    const visible = () => { if (!document.hidden && room.peer?.disconnected) recoverHost(true); };
    document.addEventListener('visibilitychange', visible);
    const recoverHost = (immediate = false) => {
      if (!alive() || room.active || !ready) return;
      if (retryTimer != null) {
        if (!immediate) return;
        clearTimeout(retryTimer);
      }
      retryTimer = setTimeout(() => {
        retryTimer = null;
        if (!alive() || room.active) return;
        if (retries >= 3) { p2pDone = true; hostFailure('在线服务重连失败，请重新建房。'); return; }
        const peer = room.peer;
        const delay = 1000 * 2 ** retries++;
        retryTimer = setTimeout(() => { retryTimer = null; recoverHost(true); }, delay);
        try {
          if (!peer.disconnected) peer.disconnect();
          peer.reconnect();
        } catch (err) { /* Retry synchronous failures on the same backoff. */ }
      }, immediate ? 0 : 500);
    };
    if (host) startRelay();
    else if (url) fallbackTimer = setTimeout(startRelay, 5000);
    try {
      const Peer = await loadPeer();
      if (!alive() || (!ready && expired()) || winner) return;
      const retryGuest = () => {
        if (host || joined || guestRetried || expired()) return false;
        guestRetried = true;
        const peer = room.peer;
        room.peer = null; pending = null;
        try { peer.destroy(); } finally {
          retryTimer = setTimeout(() => {
            retryTimer = null;
            if (token === attempt && !expired()) createPeer();
          }, 1000);
        }
        return true;
      };
      function createPeer() {
        const peer = room.peer = host ? new Peer(prefix + code) : new Peer();
        if (Array.isArray(peer.options?.config?.iceServers)) {
          peer.options.config = { ...peer.options.config, iceServers: [...peer.options.config.iceServers,
            { urls: ['stun:stun.miwifi.com:3478', 'stun:stun.qq.com:3478'] }] };
        }
        peer.on('error', (err) => {
          if (!current(peer)) return;
          const signaling = ['network', 'socket-error', 'socket-closed'].includes(err.type);
          if (host) {
            p2pUp = false;
            if (ready && (signaling || err.type === 'unavailable-id' && retries > 0)) { recoverHost(); return; }
            p2pDone = true; hostFailure('在线服务连接失败（' + (err.type || 'WebRTC') + '）。'); return;
          }
          if (url && !winner) { p2pDone = true; startRelay(); guestFailure(); return; }
          if (winner === relayConn && winner) return;
          if ((err.type === 'peer-unavailable' || signaling) && retryGuest()) return;
          fail(err.type === 'peer-unavailable' ? '找不到该房间。' : '在线服务连接失败（' + (err.type || 'WebRTC') + '）。');
        });
        peer.on('disconnected', () => {
          if (!current(peer) || room.active) return;
          p2pUp = false;
          if (host && ready) recoverHost();
          else if (url) { p2pDone = true; startRelay(); guestFailure(); }
          else if (!retryGuest()) fail('在线服务已断开，请重新建房或加入。');
        });
        peer.on('close', () => {
          if (!current(peer)) return;
          p2pUp = false; p2pDone = true;
          if (host) hostFailure('在线服务已关闭，请重新建房或加入。');
          else if (url && !winner) { startRelay(); guestFailure(); }
          else fail('在线服务已关闭，请重新建房或加入。');
        });
        peer.on('open', () => {
          if (!current(peer) || (!ready && expired())) return;
          if (host) {
            p2pUp = true; p2pDone = false;
            clearTimeout(retryTimer); retryTimer = null; retries = 0;
            hostReady();
            return;
          }
          const conn = peer.connect(prefix + code, { reliable: true, serialization: 'binary' });
          guestLink(conn, () => current(peer));
        });
        if (host) peer.on('connection', (conn) => incoming(conn, handlers, token));
      }
      createPeer();
    } catch (err) {
      p2pDone = true;
      if (host) hostFailure('无法加载在线服务，请检查网络。');
      else if (url) { startRelay(); guestFailure(); }
      else fail('无法加载在线服务，请检查网络。');
    }
  }
  function input(data) { if (pending) write(pending, { type: 'input', input: data }); }
  function inputs() {
    const out = {}, now = performance.now();
    for (const [slot, link] of room.links) if (link.input && now - link.last < 500) out[slot] = link.input;
    return out;
  }
  function ping() {
    const t = performance.now();
    if (room.role === 'host') { if (room.links.size) broadcast({ type: 'ping', t }); }
    else if (room.role === 'guest' && pending && room.code) write(pending, { type: 'ping', t });
  }
  const valid = (code) => code.length === 5 && [...code].every((c) => alphabet.includes(c));
  PH.rooms = { room, open, close, broadcast, input, inputs, ping, valid, sendLobby: (data) => { if (pending && !room.active) write(pending, { ...data, type: 'lobby' }); } };
})();
