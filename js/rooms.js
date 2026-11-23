// PIXEL HOOPS - 自有信令 WebRTC P2P + Worker 中继房间
(function () {
  const PH = window.PH;
  const alphabet = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
  const PROTOCOL = 1, VERSION_ERROR = '版本不一致，请刷新页面后重试。';
  const MAX_FRAME = 1024 * 1024, RELAY_BUFFER_LIMIT = 8 * 1024, P2P_BUFFER_LIMIT = 32 * 1024, INPUT_HEARTBEAT_MS = 100;
  // Fallback only. google STUN is unreachable from mainland China, so it is no longer listed.
  const FALLBACK_ICE = [{ urls: ['stun:stun.qq.com:3478', 'stun:stun.miwifi.com:3478'] }];
  const ICE_REFRESH_MS = 60 * 60 * 1000;
  let iceServers = FALLBACK_ICE, iceAt = -Infinity, iceBusy = false, icePending = null;
  // Fetch short-lived TURN credentials from our own backend (GET /api/turn). Never blocks room setup:
  // on any failure we keep whatever we had (own TURN from an earlier fetch, else the STUN fallback).
  function refreshIce() {
    const base = window.__API_BASE__, f = window.fetch;
    if (iceBusy || typeof f !== 'function' || !base || /^__.*__$/.test(base)) return;
    if (performance.now() - iceAt < ICE_REFRESH_MS) return;
    iceBusy = true;
    const opts = { cache: 'no-store' };
    if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') opts.signal = AbortSignal.timeout(3000);
    icePending = Promise.resolve(f.call(window, base.replace(/\/$/, '') + '/api/turn', opts))
      .then((r) => (r && r.ok ? r.json() : null))
      .then((j) => {
        const list = j && Array.isArray(j.iceServers) ? j.iceServers.filter((x) => x && x.urls) : [];
        if (list.length) { iceServers = list.concat(FALLBACK_ICE); iceAt = performance.now(); }
      })
      .catch(() => {})
      .then(() => { iceBusy = false; icePending = null; });
  }
  // 调参台「联机 强制直连」（存进云端配置 C1 等）：开 = 只走直连 P2P，不用 TURN，也不用 Worker 中继传数据（Worker 只做信令）；
  // 直连不通时两边都提示「直连失败」。以房主的开关为准：随 offer 发给客人，整个房间一起生效。
  if (PH.TUNE) PH.TUNE.reg([{ k: 'net_direct', cat: 'net', sub: '连接', label: '强制直连', v: 0, mode: 'bool', note: '开 = 联机只尝试直连（P2P），不走 TURN、也不走 Worker 中继；直连不通时双方都提示「直连失败」。以房主的设置为准' }]);
  const DIRECT_MS = 8000, DIRECT_FAIL = '直连失败：两台电脑之间无法直接连通（已开启「强制直连」，不走中继）。';
  const forceDirect = () => !!(PH.TUNE && PH.TUNE.get('net_direct'));
  function directIce(list) {
    const out = [];
    for (const s of list) {
      const urls = (Array.isArray(s.urls) ? s.urls : [s.urls]).filter((u) => typeof u === 'string' && !/^turns?:/i.test(u));
      if (urls.length) out.push({ ...s, urls });
    }
    return out;
  }
  // Run fn now if no credential fetch is in flight, otherwise right after it settles (<= 3 s, never rejects).
  function whenIce(fn) { if (icePending) icePending.then(fn); else fn(); }
  const room = { peer: null, role: '', code: '', links: new Map(), active: false, ping: null, transport: '', route: '', direct: false };
  let attempt = 0, pending = null, timeout, checkDeadline, stopRecovery;
  let stateSeq = 0, inputSeq = 0, lastInputKey = '', lastInputAt = -Infinity;

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
      const { amount, limit } = linkBuffer(link.conn);
      if (amount <= limit) return false;
    }
    return true;
  }
  function relaying() {
    if (room.role === 'guest') return room.transport === 'relay';
    for (const link of room.links.values()) if (link.conn.open && link.conn.transport !== 'p2p') return true;
    return false;
  }
  function syncTransport() {
    if (room.role === 'guest') {
      room.transport = pending?.open ? pending.transport : '';
      room.route = room.transport === 'p2p' ? (pending.route || '') : '';
      room.direct = !!(pending?.open && pending.direct);
      return;
    }
    let any = false, anyRelay = false, anyTurn = false, direct = false;
    for (const link of room.links.values()) {
      if (!link.conn.open) continue;
      any = true;
      if (link.conn.direct) direct = true;
      if (link.conn.transport !== 'p2p') anyRelay = true;
      else if (link.conn.route === 'turn') anyTurn = true;
    }
    room.transport = !any ? '' : anyRelay ? 'relay' : 'p2p';
    room.route = room.transport !== 'p2p' ? '' : anyTurn ? 'turn' : 'direct';
    room.direct = direct;
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
  function createLink(relaySend, relayEnd, relayBuffered, isHost, direct = false) {
    const listeners = new Map();
    let pc = null, ctrl = null, stateCh = null, inCh = null, pendingIce = [], closed = false, relayAlive = true, directTimer;
    const link = {
      open: false,
      transport: 'relay',
      route: '',            // 'direct' | 'turn' | '' : which ICE path the data channel really uses (diagnostics only)
      direct: false,        // net_direct: P2P without TURN only; the Worker carries signaling, never game data
      reason: '',           // why the link was failed (shown to the user)
      on(type, fn) { if (!listeners.has(type)) listeners.set(type, []); listeners.get(type).push(fn); return this; },
      emit(type, msg) { for (const fn of listeners.get(type) || []) fn(msg); },
      bufferInfo() {
        if (ctrl && ctrl.readyState === 'open') {
          const ch = stateCh && stateCh.readyState === 'open' ? stateCh : ctrl;
          return { amount: ch.bufferedAmount || 0, limit: P2P_BUFFER_LIMIT };
        }
        return { amount: relayBuffered(), limit: RELAY_BUFFER_LIMIT };
      },
      send(msg) {
        if (!this.open) return;
        if (ctrl && ctrl.readyState === 'open') {
          const droppable = isDroppableState(msg);
          // input: unordered + reliable (seq-stamped) so a lost packet never blocks newer key states;
          // state: unordered, no retransmit; everything else: ordered ctrl.
          const ch = droppable && stateCh && stateCh.readyState === 'open' ? stateCh
            : msg && msg.type === 'input' && inCh && inCh.readyState === 'open' ? inCh : ctrl;
          if (droppable && (ch.bufferedAmount || 0) > P2P_BUFFER_LIMIT) return;
          try {
            const raw = JSON.stringify(msg);
            if (new TextEncoder().encode(raw).length <= MAX_FRAME) { ch.send(raw); return; }
          } catch { /* Fall back to relay if DataChannel send fails. */ }
        }
        if (!this.direct) relaySend(msg);
      },
      armDirect() {
        if (this.direct || closed) return;
        this.direct = true;
        syncTransport();
        directTimer = setTimeout(() => { if (!(ctrl && ctrl.readyState === 'open')) this.fail(DIRECT_FAIL); }, DIRECT_MS);
      },
      fail(reason) {
        if (closed) return;
        this.reason = reason;
        relaySend({ type: 'rtc', kind: 'fail' });
        this.close();
      },
      detachRelay() {
        relayAlive = false;
        if (!closed && this.transport !== 'p2p') this.close();
      },
      startRtc() {
        if (closed || pc || typeof window.RTCPeerConnection !== 'function') return;
        if (icePending) { whenIce(() => { if (!closed && !pc) this.startRtc(); }); return; }
        setupPc(this.direct);
        try {
          attachChannel(pc.createDataChannel('ctrl', { ordered: true }), 'ctrl');
          attachChannel(pc.createDataChannel('state', { ordered: false, maxRetransmits: 0 }), 'state');
          attachChannel(pc.createDataChannel('input', { ordered: false }), 'input');
          pc.createOffer()
            .then((offer) => pc && pc.setLocalDescription(offer).then(() => offer))
            .then((offer) => { if (!closed && pc) relaySend(link.direct ? { type: 'rtc', kind: 'offer', sdp: offer, direct: true } : { type: 'rtc', kind: 'offer', sdp: offer }); })
            .catch(() => dropPc());
        } catch { dropPc(); }
      },
      handleRtc(msg) {
        if (closed || !msg) return;
        if (msg.kind === 'fail') { if (this.direct) { this.reason = DIRECT_FAIL; this.close(); } return; }
        if (msg.kind === 'offer' && !isHost && msg.direct === true) this.armDirect();
        if (typeof window.RTCPeerConnection !== 'function') return;
        if (msg.kind === 'offer' && !isHost && msg.sdp && !pc && icePending) {
          whenIce(() => { if (!closed) this.handleRtc(msg); });
        } else if (msg.kind === 'offer' && !isHost && msg.sdp) {
          if (!pc) setupPc(this.direct);
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
        clearTimeout(directTimer);
        const wasOpen = this.open;
        this.open = false;
        dropPc();
        relayEnd();
        syncTransport();
        if (wasOpen) this.emit('close');
      }
    };
    // 'p2p' only means the DataChannel is open. Ask WebRTC which candidate pair was actually selected so the HUD can
    // tell a true direct path from one that is being relayed through our TURN server.
    function probeRoute() {
      const cur = pc;
      if (closed || !cur || typeof cur.getStats !== 'function') return;
      cur.getStats().then((stats) => {
        if (closed || cur !== pc) return;
        const cands = new Map(), pairs = []; let selId = '';
        stats.forEach((r) => {
          if (r.type === 'transport' && r.selectedCandidatePairId) selId = r.selectedCandidatePairId;
          else if (r.type === 'local-candidate' || r.type === 'remote-candidate') cands.set(r.id, r);
          else if (r.type === 'candidate-pair') pairs.push(r);
        });
        const pair = (selId && pairs.find((x) => x.id === selId)) || pairs.find((x) => x.nominated && x.state === 'succeeded');
        if (!pair) return;
        const lc = cands.get(pair.localCandidateId), rc = cands.get(pair.remoteCandidateId);
        const route = (lc && lc.candidateType === 'relay') || (rc && rc.candidateType === 'relay') ? 'turn' : 'direct';
        if (link.route !== route) { link.route = route; syncTransport(); }
      }).catch(() => {});
    }
    function flushIce() {
      if (!pc || !pendingIce.length) return;
      const list = pendingIce.splice(0);
      for (const cand of list) pc.addIceCandidate(cand).catch(() => {});
    }
    function dropPc() {
      const old = pc; pc = null; ctrl = null; stateCh = null; inCh = null; pendingIce = [];
      if (link.transport !== 'relay') { link.transport = 'relay'; syncTransport(); }
      if (old) {
        old.onicecandidate = old.onconnectionstatechange = old.ondatachannel = null;
        try { old.close(); } catch { /* Ignore close errors. */ }
      }
      if (!closed && link.direct) link.fail(DIRECT_FAIL);
      else if (!closed && !relayAlive) link.close();
    }
    function attachChannel(ch, kind) {
      const isCtrl = kind === 'ctrl';
      if (kind === 'ctrl') ctrl = ch; else if (kind === 'state') stateCh = ch; else inCh = ch;
      ch.onopen = () => {
        if (closed) { try { ch.close(); } catch {} return; }
        if (isCtrl) {
          clearTimeout(directTimer);
          link.transport = 'p2p'; syncTransport(); probeRoute(); setTimeout(probeRoute, 3000);
          // Direct-only: the join sent over the Worker was ignored by the host, so say hello again over P2P.
          if (!isHost && link.direct && link.open) link.emit('open');
        }
      };
      ch.onmessage = (ev) => {
        if (closed || !link.open || typeof ev.data !== 'string') return;
        if (new TextEncoder().encode(ev.data).length > MAX_FRAME) return;
        let data; try { data = JSON.parse(ev.data); } catch { return; }
        link.emit('data', data);
      };
      ch.onclose = () => {
        if (isCtrl && ctrl === ch) {
          ctrl = null; link.transport = 'relay'; syncTransport();
          if (!closed && link.direct) link.fail(DIRECT_FAIL);
          else if (!closed && !relayAlive) link.close();
        }
        if (kind === 'state' && stateCh === ch) stateCh = null;
        if (kind === 'input' && inCh === ch) inCh = null;
      };
      ch.onerror = () => {};
    }
    function setupPc(direct) {
      pc = new window.RTCPeerConnection({ iceServers: direct ? directIce(iceServers) : iceServers });
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
          attachChannel(ch, ch.label === 'state' ? 'state' : ch.label === 'input' ? 'input' : 'ctrl');
        };
      }
    }
    if (direct) link.armDirect();
    return link;
  }
  function close() {
    attempt++; clearDeadline(); pending = null;
    stateSeq = 0; inputSeq = 0; lastInputKey = ''; lastInputAt = -Infinity;
    if (stopRecovery) { stopRecovery(); stopRecovery = null; }
    room.links.clear();
    Object.assign(room, { peer: null, role: '', code: '', active: false, ping: null, transport: '', route: '', direct: false });
  }
  function broadcast(msg) {
    const out = msg?.type === 'state' && msg.seq == null ? { ...msg, seq: ++stateSeq } : msg;
    for (const link of room.links.values()) write(link.conn, out);
  }
  function cleanInput(input) {
    if (!input || typeof input !== 'object') return null;
    const o = {};
    for (const key of ['mx', 'my', 'dx', 'dy']) o[key] = Number.isFinite(input[key]) ? Math.max(-1, Math.min(1, input[key])) : 0;
    for (const key of ['sprint', 'a1', 'a2', 'a3', 'post', 'dribble', 'hesi', 'rs', 'rsPad', 'pass', 'screen', 'selfAlley', 'ai']) o[key] = input[key] === true;
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
        if (msg.protocol !== PROTOCOL) { write(conn, { type: 'reject', reason: 'version' }); return; }
        slot = room.active ? -1 : handlers.reserve(msg.mode, room.links);
        if (slot < 0) { write(conn, { type: 'reject' }); return; }
        clearTimeout(watch);
        room.links.set(slot, { conn, input: null, last: 0, ping: null });
        syncTransport();
        write(conn, { type: 'joined', slot, protocol: PROTOCOL });
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
        if (Number.isInteger(msg.seq)) {
          if (link.inSeq != null && msg.seq <= link.inSeq) return; // late/duplicate packet from the unordered channel
          link.inSeq = msg.seq;
        }
        link.input = cleanInput(msg.input); link.last = performance.now();
      }
    });
    const end = () => {
      clearTimeout(watch);
      if (slot >= 0 && room.links.get(slot)?.conn === conn) {
        room.links.delete(slot);
        syncHostPing();
        syncTransport();
        if (token === attempt) handlers.change(slot, conn.reason || '');
      }
    };
    conn.on('close', end); conn.on('error', end);
  }
  async function open(code, mode, handlers) {
    close();
    refreshIce();
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
        write(conn, { type: 'join', mode, protocol: PROTOCOL });
      });
      conn.on('close', () => { if (alive() && pending === conn) fail(conn.reason || relayError || '已与房主断开连接。'); });
      conn.on('error', () => { if (alive() && pending === conn) fail(relayError || '无法建立连接。'); });
      conn.on('data', (msg) => {
        if (!alive() || pending !== conn || !msg) return;
        if (msg.type === 'reject') fail(msg.reason === 'version' ? VERSION_ERROR : '房间已满、已开赛或比赛模式不同。');
        else if (msg.type === 'joined') {
          if (expired()) return;
          if (msg.protocol !== PROTOCOL) { fail(VERSION_ERROR); return; }
          room.code = code; clearDeadline(); handlers.joined(msg.slot);
        }
        else if (msg.type === 'ping' && Number.isFinite(msg.t)) write(conn, { type: 'pong', t: msg.t });
        else if (msg.type === 'pong' && Number.isFinite(msg.t)) {
          const rtt = Math.round(performance.now() - msg.t);
          if (rtt >= 0 && rtt < 60000) room.ping = rtt;
        }
        else if (msg.type === 'start') { lastStateSeq = 0; lastInputKey = ''; lastInputAt = -Infinity; room.active = true; handlers.start(msg.config); }
        else if (msg.type === 'state' && room.active) {
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
          else if (!conn.direct) conn.emit('data', msg);
        } else if (msg?.type === 'peer-open' && Number.isInteger(msg.id)) {
          if (relayGuests.has(msg.id)) return;
          const link = createLink(
            (data) => send({ to: msg.id, msg: data }),
            () => { relayGuests.delete(msg.id); send({ to: msg.id, msg: { type: 'relay-close' } }); },
            () => ws.bufferedAmount || 0,
            true,
            forceDirect()
          );
          relayGuests.set(msg.id, link);
          // Joined guests report the reason through change(); this covers a link that failed before joining.
          link.on('close', () => { if (link.reason && alive() && ![...room.links.values()].some((l) => l.conn === link)) handlers.notice?.(link.reason); });
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
          else if (!link.direct) link.emit('data', msg.msg);
        }
      };
      ws.onerror = () => { /* WebSocket close carries the failure code. */ };
      ws.onclose = (event) => {
        if (!validSocket()) return;
        relaySocket = null; relayUp = false; clearTimeout(relayWatch);
        if (!host) {
          relayDone = true;
          relayError = conn?.reason || (event.code === 4404 ? '找不到该房间。' : '房间中继已断开（' + event.code + '）。');
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
    write(pending, { type: 'input', input: data, seq: ++inputSeq });
  }
  function inputs() {
    const out = {}, now = performance.now();
    for (const [slot, link] of room.links) if (link.input && now - link.last < 500) out[slot] = link.input;
    return out;
  }
  function aiSlots() {
    const out = new Set();
    for (const [slot, link] of room.links) if (link.input && link.input.ai) out.add(slot);
    return out;
  }
  function ping() {
    const t = performance.now();
    if (room.role === 'host') { if (room.links.size) broadcast({ type: 'ping', t }); }
    else if (room.role === 'guest' && pending && room.code) write(pending, { type: 'ping', t });
  }
  const valid = (code) => code.length === 5 && [...code].every((c) => alphabet.includes(c));
  PH.rooms = { room, open, close, iceServers: () => iceServers, broadcast, congested, relaying, input, inputs, aiSlots, ping, valid, sendLobby: (data) => { if (pending && !room.active) write(pending, { ...data, type: 'lobby' }); } };
})();
