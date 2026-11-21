(function (root) {
  const PH = root.PH = root.PH || {};
  const node = typeof module !== 'undefined' && module.exports;
  function quantize(value) {
    return JSON.parse(JSON.stringify(value, (k, v) => k === 'parts' ? undefined : typeof v === 'number' ? Math.round(v * 1000) / 1000 : v));
  }
  async function encode(tape) {
    const json = JSON.stringify(quantize(tape));
    if (node) return require('node:zlib').gzipSync(json).toString('base64');
    const bytes = new Uint8Array(await new Response(new Blob([json]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer());
    let str = ''; for (let i = 0; i < bytes.length; i += 32768) str += String.fromCharCode(...bytes.subarray(i, i + 32768));
    return btoa(str);
  }
  async function decode(str) {
    if (node) return JSON.parse(require('node:zlib').gunzipSync(Buffer.from(str, 'base64')).toString());
    const bytes = Uint8Array.from(atob(str), c => c.charCodeAt(0));
    return JSON.parse(await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).text());
  }
  function at(tape, sec) {
    const f = tape.frames; if (!f.length) return null;
    const t = f[0].t + Number(sec || 0);
    let lo = 0, hi = f.length - 1;
    while (lo < hi) { const m = (lo + hi) >> 1; if (f[m].t < t) lo = m + 1; else hi = m; }
    return lo && Math.abs(f[lo - 1].t - t) <= Math.abs(f[lo].t - t) ? f[lo - 1] : f[lo];
  }
  function summary(f) {
    if (!f) return null;
    const s = f.s || {}, b = f.b || {};
    return { score: s.score, phase: s.phase, clock: s.gclock, possession: s.possession ?? s.off, q: s.q,
      players: (f.p || []).map(p => ({ name: p.name ?? p.key ?? p.id, x: p.x, y: p.y, z: p.z, anim: p.anim, hasBall: p.hasBall, stam: p.stam })),
      ball: { x: b.x, y: b.y, z: b.z, state: b.state, holder: b.holder } };
  }
  function api(path) {
    if (PH.CS && PH.CS.api) return PH.CS.api(path);
    let b = root.__API_BASE__ || '';
    if (/^__.*__$/.test(b)) { const h = root.location.hostname; b = h === 'localhost' || h === '127.0.0.1' || h === '' ? 'http://localhost:8000' : ''; }
    return b.replace(/\/$/, '') + path;
  }
  async function req(method, key, body) {
    const r = await fetch(api('/api/replays' + (key == null ? '' : '/' + encodeURIComponent(key))), { method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined, cache: 'no-store' });
    const j = await r.json();
    if (!r.ok) { const e = new Error(j.error || 'HTTP ' + r.status); e.status = r.status; throw e; }
    return j;
  }
  function start(G) {
    G.tapeTick = 0;
    G.tape = G.mode === 'demo' ? null : { v: 1, meta: { mode: G.mode, title: '', players: G.players.map(p => (p.arch || p.a || {}).name || p.key || String(p.id)), date: new Date().toISOString(), dur: 0, dt: G.mode === 't5' ? 1 / 15 : 1 / 30 }, frames: [] };
    if (G.tape && G.mode === 't5') G.tape.meta.teams = PH.T5.T.tm.map(t => t.ab || t.key);
  }
  function record(G, frame, state) {
    const tape = G.tape;
    if (!tape || G.mode === 'demo' || G.replay) return;
    if (G.time >= 1200) { tape.meta.truncated = true; return; }
    if (G.tapeTick++ % (G.mode === 't5' ? 4 : 2)) return;
    const f = quantize({ ...frame, s: state });
    f.b.vx = Math.round((G.ball.vx || 0) * 1000) / 1000;
    f.b.vy = Math.round((G.ball.vy || 0) * 1000) / 1000;
    f.p.forEach((p, i) => { p.vx = Math.round((G.players[i].vx || 0) * 1000) / 1000; p.vy = Math.round((G.players[i].vy || 0) * 1000) / 1000; });
    f.p.forEach((p, i) => { p.name = (G.players[i].arch || G.players[i].a || {}).name || G.players[i].key || String(G.players[i].id); p.key = G.players[i].key || (G.players[i].arch || {}).key; });
    tape.frames.push(f);
  }
  function current() { return PH.game && PH.game.G.tape || null; }
  function finish() {
    const tape = current(); if (!tape) return null;
    const G = PH.game.G, T = G.mode === 't5' && PH.T5.T;
    tape.meta.score = T ? T.tm.map(t => t.score) : G.score.slice();
    tape.meta.dur = Math.min(1200, G.time);
    return tape;
  }
  const TAPE = { quantize, encode, decode, at, summary, start, record, current, finish,
    async list() { return (await req('GET')).replays; },
    async get(key) { const row = await req('GET', key); return { ...row, tape: await decode(row.data) }; },
    async save(name, tape) {
      name = String(name || '').trim(); if (!name || Array.from(name).length > 40) throw new Error('bad name');
      const id = 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10), data = await encode(tape);
      for (let n = 1; ; n++) {
        const suffix = n === 1 ? '' : ' (' + n + ')';
        const candidate = Array.from(name).slice(0, 40 - suffix.length).join('') + suffix;
        try { return await req('PUT', id, { name: candidate, meta: tape.meta, data }); } catch (e) { if (e.status !== 409) throw e; }
      }
    },
    del(id) { return req('DELETE', id); }
  };
  PH.TAPE = TAPE;
  if (node) module.exports = TAPE;
})(typeof window !== 'undefined' ? window : globalThis);
