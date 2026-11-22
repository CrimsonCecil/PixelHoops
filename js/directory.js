// Public-room leases are independent of PeerJS. Older API deployments can still use direct join.
(function () {
  const PH = window.PH;
  let lease = null, timer = null;
  function url(path) { return String(window.__API_BASE__ || '').replace(/\/$/, '') + '/api/rooms' + path; }
  async function request(method, path, data, keepalive = false) {
    const ac = new AbortController(), timeout = setTimeout(() => ac.abort(), 7000);
    try {
      const response = await fetch(url(path), { method, cache: 'no-store', keepalive, signal: ac.signal,
        headers: data ? { 'Content-Type': 'application/json' } : {}, body: data ? JSON.stringify(data) : undefined });
      if (!response.ok) throw new Error('房间大厅暂不可用，可使用下方直连入口');
      return await response.json();
    } finally { clearTimeout(timeout); }
  }
  function stop() {
    clearInterval(timer); timer = null;
    const old = lease; lease = null;
    if (old) request('DELETE', '/' + old.code, { token: old.token }, true).catch(() => {});
  }
  async function publish(code, details, onError) {
    if (lease && lease.code !== code) stop();
    if (!lease) lease = { code, token: crypto.randomUUID() };
    const current = lease;
    const beat = async () => {
      try { await request('PUT', '/' + code, { ...details(), token: current.token }); }
      catch (e) { if (lease === current) onError(e); }
    };
    clearInterval(timer); timer = setInterval(beat, 15000);
    await beat();
  }
  window.addEventListener('pagehide', stop);
  PH.directory = { list: () => request('GET', ''), publish, stop };
})();
