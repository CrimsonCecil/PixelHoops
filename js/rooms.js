// PIXEL HOOPS - 自有信令 WebRTC P2P + Worker 中继房间
(function () {
  const PH = window.PH;
  const alphabet = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
  const MAX_FRAME = 1024 * 1024, RELAY_BUFFER_LIMIT = 8 * 1024, P2P_BUFFER_LIMIT = 32 * 1024, INPUT_HEARTBEAT_MS = 100;
  const RELAY_MAX_INFLIGHT = 2, RELAY_ACK_TIMEOUT_MS = 600, LOCAL_PROBE_MS = 2000;
  const ICE_SERVERS = [{ urls: ['stun:stun.miwifi.com:3478', 'stun:stun.qq.com:3478', 'stun:stun.l.google.com:19302'] }];
  const room = { peer: null, role: '', code: '', links: new Map(), active: false, ping: null, transport: '' };
  let attempt = 0, pending = null, timeout, checkDeadline, stopRecovery;
  let stateSeq = 0, lastInputKey = '', lastInputAt = -Infinity;

  function clearDeadline() {
    clearTimeout(timeout);
    if (checkDeadline) {
      document.removeEventListener('visibilitychange', checkDeadline);
      window.removeEventListener('pageshow', checkDeadline);
      checkDeadline = null;
    }
  }

  function isDroppableState(msg) {
    const s = msg?.type === 'state' ? msg : msg?.msg?.type === 'state' ? msg.msg : null;
    return !!(s && !(Array.isArray(s.state?.audio) && s.state.audio.length));
  }
  function linkBuffer(conn) {
    if (typeof conn?.bufferInfo === 'function') return conn.bufferInfo();
    return { amount: 0, limit: RELAY_BUFFER_LIMIT };
  }
  function write(conn, msg) {
    if (!conn || !conn.open) return;
    if (isDroppableState(msg)) {
      const { amount, limit } = linkBuffer(conn);
      if (amount > limit) return;
    }
    conn.send(msg);
  }
  function congested() {
    if (!room.links.size) return false;
    for (const link of room.links.values()) {
      if (!link.conn.open) continue;
      if (typeof link.conn.relayCongested === 'function' && link.conn.relayCongested()) continue;
      const { amount, limit } = linkBuffer(link.conn);
      if (amount <= limit) return false;
    }
    return true;
  }
  function relaying() {
    if (room.role === 'guest') return room.transport === 'relay';
    for (const link of room.links.values()) if (link.conn.open && link.conn.transport === 'relay') return true;
    return false;
  }
  function syncTransport() {
    if (room.role === 'guest') { room.transport = pending?.open ? pending.transport : ''; return; }
    let any = false, anyRelay = false, anyP2p = false;
    for (const link of room.links.values()) {
      if (!link.conn.open) continue;
      any = true;
      if (link.conn.transport === 'relay') anyRelay = true;
      else if (link.conn.transport === 'p2p') anyP2p = true;
    }
    room.transport = !any ? '' : anyRelay ? 'relay' : anyP2p ? 'p2p' : 'local';
  }
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
  function createLink(relaySend, relayEnd, relayBuffered, isHost, localChannelName) {
    const listeners = new Map();
    let pc = null, ctrl = null, stateCh = null, pendingIce = [], closed = false, relayAlive = true;
    let bc = null, localUp = false, localTimer = null;
    const inFlight = [];
    function pruneInFlight(now) {
      while (inFlight.length && now - inFlight[0].at > RELAY_ACK_TIMEOUT_MS) inFlight.shift();
    }
    const link = {
      open: false,
      transport: 'relay',
      on(type, fn) { if (!listeners.has(type)) listeners.set(type, []); listeners.get(type).push(fn); return this; },
      emit(type, msg) { for (const fn of listeners.get(type) || []) fn(msg); },
      ackState(seq) {
        if (!Number.isInteger(seq)) return;
        while (inFlight.length && inFlight[0].seq <= seq) inFlight.shift();
      },
      resetFlow() { inFlight.length = 0; },
      relayCongested() {
        if (this.transport !== 'relay') return false;
        pruneInFlight(performance.now());
        return inFlight.length >= RELAY_MAX_INFLIGHT;
      },
      bufferInfo() {
        if (localUp && bc) return { amount: 0, limit: P2P_BUFFER_LIMIT };
        if (ctrl && ctrl.readyState === 'open') {
          const ch = stateCh && stateCh.readyState === 'open' ? stateCh : ctrl;
          return { amount: ch.bufferedAmount || 0, limit: P2P_BUFFER_LIMIT };
        }
        return { amount: relayBuffered(), limit: RELAY_BUFFER_LIMIT };
      },
      send(msg) {
        if (!this.open) return;
        if (localUp && bc) {
          try { bc.postMessage({ fromHost: isHost, msg }); return; } catch { dropLocal(); }
        }
        if (ctrl && ctrl.readyState === 'open') {
          const droppable = isDroppableState(msg);
          const ch = droppable && stateCh && stateCh.readyState === 'open' ? stateCh : ctrl;
          if (droppable && (ch.bufferedAmount || 0) > P2P_BUFFER_LIMIT) return;
          try {
            const raw = JSON.stringify(msg);
            if (new TextEncoder().encode(raw).length <= MAX_FRAME) { ch.send(raw); return; }
          } catch { /* Fall back to relay if DataChannel send fails. */ }
        }
        const droppable = isDroppableState(msg);
        if (droppable && this.relayCongested()) return;
        if (msg?.type === 'state' && Number.isInteger(msg.seq)) {
          const now = performance.now();
          pruneInFlight(now);
          inFlight.push({ seq: msg.seq, at: now });
          if (inFlight.length > 16) inFlight.shift();
        }
        relaySend(msg);
      },
      detachRelay() {
        relayAlive = false;
        if (!closed && this.transport === 'relay') this.close();
      },
      startRtc() {
        if (closed) return;
        if (isHost && localChannelName && typeof window.BroadcastChannel === 'function' && !bc) {
          startLocal(localChannelName);
          relaySend({ type: 'rtc', kind: 'local-offer', ch: localChannelName });
        }
        if (localUp || pc || typeof window.RTCPeerConnection !== 'function') return;
        setupPc();
        try {
          attachChannel(pc.createDataChannel('ctrl', { ordered: true }), true);
          attachChannel(pc.createDataChannel('state', { ordered: false, maxRetransmits: 0 }), false);
          pc.createOffer()
            .then((offer) => pc && pc.setLocalDescription(offer).then(() => offer))
            .then((offer) => { if (!closed && pc) relaySend({ type: 'rtc', kind: 'offer', sdp: offer }); })
            .catch(() => dropPc());
        } catch { dropPc(); }
      },
      handleRtc(msg) {
        if (closed || !msg) return;
        if (msg.kind === 'local-offer' && !isHost && typeof msg.ch === 'string' && msg.ch && typeof window.BroadcastChannel === 'function') {
          if (!bc) startLocal(msg.ch);
          return;
        }
        if (localUp || typeof window.RTCPeerConnection !== 'function') return;
        if (msg.kind === 'offer' && !isHost && msg.sdp) {
          if (!pc) setupPc();
          pc.setRemoteDescription(msg.sdp)
            .then(() => flushIce())
            .then(() => pc && pc.createAnswer())
            .then((ans) => pc && pc.setLocalDescription(ans).then(() => ans))
            .then((ans) => { if (!closed && pc) relaySend({ type: 'rtc', kind: 'answer', sdp: ans }); })
            .catch(() => dropPc());
        } else if (msg.kind === 'answer' && isHost && pc && msg.sdp) {
          pc.setRemoteDescription(msg.sdp).then(() => flushIce()).catch(() => dropPc());
        } else if (msg.kind === 'ice' && msg.candidate) {
          if (pc && pc.remoteDescription) pc.addIceCandidate(msg.candidate).catch(() => {});
          else if (pendingIce.length < 64) pendingIce.push(msg.candidate);
        }
      },
      close() {
        if (!this.open && closed) return;
        closed = true;
        const wasOpen = this.open;
        this.open = false;
        if (localUp && bc) { try { bc.postMessage({ fromHost: isHost, ctrl: 'close' }); } catch {} }
        dropLocal();
        dropPc();
        relayEnd();
        syncTransport();
        if (wasOpen) this.emit('close');
      }
    };
    function upgradeTransport(next) {
      if (closed || link.transport === next) return;
      link.transport = next;
      inFlight.length = 0;
      syncTransport();
      if (link.open) link.send({ type: 'ping', t: performance.now() });
    }
    function dropLocal() {
      clearTimeout(localTimer); localTimer = null;
      const old = bc; bc = null;
      const wasUp = localUp; localUp = false;
      if (old) { old.onmessage = null; try { old.close(); } catch {} }
      if (wasUp && link.transport === 'local') {
        link.transport = ctrl && ctrl.readyState === 'open' ? 'p2p' : 'relay';
        syncTransport();
        if (!closed && link.transport === 'relay' && !relayAlive) link.close();
      }
    }
    function startLocal(name) {
      try { bc = new window.BroadcastChannel(name); } catch { return; }
      bc.onmessage = (ev) => {
        const d = ev?.data;
        if (closed || !d || d.fromHost === isHost) return;
        if (d.ctrl === 'ack' && isHost) {
          clearTimeout(localTimer); localTimer = null;
          localUp = true;
          try { bc.postMessage({ fromHost: true, ctrl: 'ready' }); } catch {}
          dropPc();
          upgradeTransport('local');
        } else if (d.ctrl === 'ready' && !isHost) {
          clearTimeout(localTimer); localTimer = null;
          localUp = true;
          dropPc();
          upgradeTransport('local');
        } else if (d.ctrl === 'close') {
          link.close();
        } else if (localUp && link.open && d.msg && typeof d.msg === 'object') {
          link.emit('data', d.msg);
        }
      };
      if (!isHost) { try { bc.postMessage({ fromHost: false, ctrl: 'ack' }); } catch {} }
      localTimer = setTimeout(() => { if (!localUp) dropLocal(); }, LOCAL_PROBE_MS);
    }
    function flushIce() {
      if (!pc || !pendingIce.length) return;
      const list = pendingIce.splice(0);
      for (const cand of list) pc.addIceCandidate(cand).catch(() => {});
    }
    function dropPc() {
      const old = pc; pc = null; ctrl = null; stateCh = null; pendingIce = [];
      if (link.transport === 'p2p') { link.transport = localUp ? 'local' : 'relay'; syncTransport(); }
      if (old) {
        old.onicecandidate = old.onconnectionstatechange = old.ondatachannel = null;
        try { old.close(); } catch { /* Ignore close errors. */ }
      }
      if (!closed && !relayAlive && link.transport === 'relay') link.close();
    }
    function attachChannel(ch, isCtrl) {
      if (isCtrl) ctrl = ch; else stateCh = ch;
      ch.onopen = () => {
        if (closed || localUp) { try { ch.close(); } catch {} return; }
        if (isCtrl) upgradeTransport('p2p');
      };
      ch.onmessage = (ev) => {
        if (closed || !link.open || typeof ev.data !== 'string') return;
        if (new TextEncoder().encode(ev.data).length > MAX_FRAME) return;
        let data; try { data = JSON.parse(ev.data); } catch { return; }
        link.emit('data', data);
      };
      ch.onclose = () => {
        if (isCtrl && ctrl === ch) {
          ctrl = null;
          if (link.transport === 'p2p') { link.transport = localUp ? 'local' : 'relay'; syncTransport(); }
          if (!closed && !relayAlive && link.transport === 'relay') link.close();
        }
        if (!isCtrl && stateCh === ch) stateCh = null;
      };
      ch.onerror = () => {};
    }
    function setupPc() {
      pc = new window.RTCPeerConnection({ iceServers: ICE_SERVERS });
      pc.onicecandidate = (ev) => {
        if (!closed && ev.candidate) relaySend({ type: 'rtc', kind: 'ice', candidate: ev.candidate });
      };
      pc.onconnectionstatechange = () => {
        if (!pc) return;
        if (pc.connectionState === 'failed' || pc.connectionState === 'closed') dropPc();
      };
      if (!isHost) {
        pc.ondatachannel = (ev) => {
          const ch = ev.channel;
          if (!ch) return;
          attachChannel(ch, ch.label !== 'state');
        };
      }
    }
    return link;
  }
  function close() {
    attempt++; clearDeadline(); pending = null;
    stateSeq = 0; lastInputKey = ''; lastInputAt = -Infinity;
    if (stopRecovery) { stopRecovery(); stopRecovery = null; }
    room.links.clear();
    Object.assign(room, { peer: null, role: '', code: '', active: false, ping: null, transport: '' });
  }
  function broadcast(msg) {
    if (msg?.type === 'start') {
      for (const link of room.links.values()) link.conn.resetFlow?.();
    }
    const out = msg?.type === 'state' && msg.seq == null ? { ...msg, seq: ++stateSeq } : msg;
    for (const link of room.links.values()) write(link.conn, out);
  }
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
        syncTransport();
        write(conn, { type: 'joined', slot });
        handlers.change();
      } else if (slot >= 0 && msg.type === 'ack' && room.links.get(slot)?.conn === conn && Number.isInteger(msg.seq)) {
        conn.ackState?.(msg.seq);
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
        syncTransport();
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
    const deadlineFailure = () => fail(!host && relayError || '连接超时，请检查网络或房间号。');
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
    if (!url) { fail('在线服务未配置，请检查网络。'); return; }
    let relaySocket = null, relayConn = null, relayTimer, relayWatch, relayRetries = 0;
    let relayUp = false, relayDone = false, ready = false;
    const relayGuests = new Map();
    const alive = () => token === attempt;
    const hostReady = () => {
      if (ready || !alive()) return;
      ready = true; room.code = code; clearDeadline(); handlers.ready(code);
    };
    let lastStateSeq = 0;
    const guestLink = (conn) => {
      conn.on('open', () => {
        if (!alive() || expired()) { conn.close(); return; }
        pending = conn;
        syncTransport();
        write(conn, { type: 'join', mode });
      });
      conn.on('close', () => { if (alive() && pending === conn) fail(relayError || '已与房主断开连接。'); });
      conn.on('error', () => { if (alive() && pending === conn) fail(relayError || '无法建立连接。'); });
      conn.on('data', (msg) => {
        if (!alive() || pending !== conn || !msg) return;
        if (msg.type === 'reject') fail('房间已满、已开赛或比赛模式不同。');
        else if (msg.type === 'joined') { if (expired()) return; room.code = code; clearDeadline(); handlers.joined(msg.slot); }
        else if (msg.type === 'ping' && Number.isFinite(msg.t)) write(conn, { type: 'pong', t: msg.t });
        else if (msg.type === 'pong' && Number.isFinite(msg.t)) {
          const rtt = Math.round(performance.now() - msg.t);
          if (rtt >= 0 && rtt < 60000) room.ping = rtt;
        }
        else if (msg.type === 'start') { lastInputKey = ''; lastInputAt = -Infinity; room.active = true; handlers.start(msg.config); }
        else if (msg.type === 'state' && room.active) {
          if (conn.transport === 'relay' && Number.isInteger(msg.seq)) write(conn, { type: 'ack', seq: msg.seq });
          if (Number.isInteger(msg.seq) && msg.seq <= lastStateSeq) {
            if (Array.isArray(msg.state?.audio) && msg.state.audio.length) handlers.state({ audio: msg.state.audio });
            return;
          }
          if (Number.isInteger(msg.seq)) lastStateSeq = msg.seq;
          handlers.state(msg.state);
        }
        else if (msg.type === 'lobby' && !room.active) handlers.message?.(msg);
      });
    };
    function startRelay() {
      if (!alive() || relaySocket || (!host && relayDone)) return;
      const send = (msg) => {
        if (ws.readyState !== 1) return;
        if (isDroppableState(msg) && (ws.bufferedAmount || 0) > RELAY_BUFFER_LIMIT) return;
        const data = JSON.stringify(msg);
        if (new TextEncoder().encode(data).length <= MAX_FRAME) ws.send(data);
      };
      let ws;
      try { ws = new window.WebSocket(url); } catch {
        relayDone = true;
        fail('房间服务连接失败。');
        return;
      }
      relaySocket = ws;
      if (!host) {
        relayConn = createLink(send, () => ws.close(), () => ws.bufferedAmount || 0, false);
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
          else if (msg?.type === 'rtc') conn.handleRtc(msg);
          else conn.emit('data', msg);
        } else if (msg?.type === 'peer-open' && Number.isInteger(msg.id)) {
          if (relayGuests.has(msg.id)) return;
          const link = createLink(
            (data) => send({ to: msg.id, msg: data }),
            () => { relayGuests.delete(msg.id); send({ to: msg.id, msg: { type: 'relay-close' } }); },
            () => ws.bufferedAmount || 0,
            true,
            'ph-room-' + code + '-' + secret.slice(0, 12) + '-' + msg.id
          );
          relayGuests.set(msg.id, link);
          incoming(link, handlers, token);
          link.open = true;
          link.emit('open');
          link.startRtc();
        } else if (msg?.type === 'peer-close') {
          const link = relayGuests.get(msg.id);
          relayGuests.delete(msg.id);
          if (link) link.detachRelay();
        } else if (msg && Object.hasOwn(msg, 'from')) {
          const link = relayGuests.get(msg.from);
          if (!link) return;
          if (msg.msg?.type === 'rtc') link.handleRtc(msg.msg);
          else link.emit('data', msg.msg);
        }
      };
      ws.onerror = () => { /* WebSocket close carries the failure code. */ };
      ws.onclose = (event) => {
        if (!validSocket()) return;
        relaySocket = null; relayUp = false; clearTimeout(relayWatch);
        if (!host) {
          relayDone = true;
          relayError = event.code === 4404 ? '找不到该房间。' : '房间中继已断开（' + event.code + '）。';
          if (conn) conn.detachRelay();
          if (conn && conn.open) return;
          fail(relayError);
          return;
        }
        const prev = [...relayGuests.values()];
        relayGuests.clear();
        for (const link of prev) link.detachRelay();
        if (!alive()) return;
        const fatal = event.code === 4001 || event.code === 4003;
        if (fatal || !room.active && relayRetries >= 3) {
          relayDone = true;
          if (!room.links.size) fail('房间中继重连失败。');
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
      clearTimeout(relayTimer); clearTimeout(relayWatch);
      document.removeEventListener('visibilitychange', visibleRelay);
      const ws = relaySocket; relaySocket = null;
      for (const link of new Set([...relayGuests.values(), ...Array.from(room.links.values(), (l) => l.conn)])) link.close();
      if (relayConn) relayConn.close();
      if (ws) ws.close();
    };
    startRelay();
  }
  function input(data) {
    if (!pending) return;
    const now = performance.now();
    const key = JSON.stringify(data);
    if (key === lastInputKey && now - lastInputAt < INPUT_HEARTBEAT_MS) return;
    lastInputKey = key; lastInputAt = now;
    write(pending, { type: 'input', input: data });
  }
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
  PH.rooms = { room, open, close, broadcast, congested, relaying, input, inputs, ping, valid, sendLobby: (data) => { if (pending && !room.active) write(pending, { ...data, type: 'lobby' }); } };
})();
