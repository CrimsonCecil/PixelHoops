// PIXEL HOOPS - V4.0 调参配置云端存储客户端（只用后端，不用 localStorage）
// 接口：GET /api/profiles → {profiles:[{id,name,data,updated}], default}；PUT /api/profiles/:id {name,data}；DELETE /api/profiles/:id；POST /api/default {id}
// 'official' = 官方默认（不在库里，data 为空，不可写）
(function () {
  const PH = (window.PH = window.PH || {});
  const OFF = { id: 'official', name: '官方默认', data: {} };
  const S = { profiles: [], def: 'official', cur: 'official', online: false, ready: false, busy: false, status: 'idle', err: '', savedAt: 0, op: '' };
  const subs = [];
  const emit = () => { for (const f of subs.slice()) { try { f(S); } catch (e) { console.error('CS.on', e); } } };
  const TU = () => PH.TUNE;

  function api(path) {
    let b = window.__API_BASE__ || '';
    if (/^__.*__$/.test(b)) {   // 占位符没被替换：本地开发用 8000 端口的后端
      const h = location.hostname;
      b = h === 'localhost' || h === '127.0.0.1' || h === '' ? 'http://localhost:8000' : '';
    }
    return b.replace(/\/$/, '') + path;
  }
  async function req(method, path, body, ms) {
    const ac = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const to = ac ? setTimeout(() => ac.abort(), ms || 8000) : 0;
    try {
      let r;
      try { r = await fetch(api(path), { method: method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined, signal: ac ? ac.signal : undefined, cache: 'no-store' }); }
      catch (e) { throw new Error(e && e.name === 'AbortError' ? '网络超时' : '网络错误'); }
      const j = await r.json().catch(() => null);
      if (!r.ok) throw new Error(j && j.msg ? String(j.msg) : 'HTTP ' + r.status + (j && j.error ? ' ' + j.error : ''));   // 503 frozen：发版期间冻结写入，显示服务器给的提示
      if (!j || typeof j !== 'object') throw new Error('服务器返回的不是 JSON');
      return j;
    } finally { if (to) clearTimeout(to); }
  }
  function take(j) {
    if (!j || !Array.isArray(j.profiles)) return;
    S.profiles = j.profiles.filter((p) => p && p.id && p.id !== 'official');
    S.def = j.default && (j.default === 'official' || S.profiles.some((p) => p.id === j.default)) ? j.default : 'official';
    S.online = true;
  }
  const byId = (id) => (id === 'official' ? OFF : S.profiles.find((p) => p.id === id) || null);
  const sameData = (a, b) => { a = a || {}; b = b || {}; const ka = Object.keys(a), kb = Object.keys(b); if (ka.length !== kb.length) return false; for (const k of ka) if (!(k in b) || Math.abs(+a[k] - +b[k]) > 1e-9) return false; return true; };

  // 切换到某一份：TUNE 先全部重置再套用覆盖项
  function select(id) {
    const p = byId(id) || OFF; S.cur = p.id;
    if (TU()) TU().load(p.data || {}, { id: p.id, name: p.name });
    emit(); return p;
  }
  // 当前值和所选那份保存的是否不同（官方默认 = 有任何改动）
  function dirty() { const p = byId(S.cur) || OFF; return TU() ? !sameData(TU().over(), p.data) : false; }

  // op：'save' / 'saveas' / 'rename' / 'del' / 'def' / 'load'，出错时显示是哪一步失败
  async function run(fn, okMsg, op) {
    S.busy = true; S.status = 'saving'; S.err = ''; S.op = op || ''; emit();
    try { const j = await fn(); take(j); S.status = okMsg || 'saved'; if (S.status === 'saved') S.savedAt = Date.now(); return true; }
    catch (e) { S.status = 'error'; S.err = String(e && e.message || e); console.warn('[cfg] ' + (op || '') + ' 失败：' + S.err); return false; }
    finally { S.busy = false; emit(); }
  }
  // 写入后立刻重新 GET，确认服务器上那份的名字和数据与刚提交的一致；不一致就报错（仍用服务器的数据，本地保持未保存）
  async function putVerify(id, name, data) {
    await req('PUT', '/api/profiles/' + id, { name: name, data: data });
    const g = await req('GET', '/api/profiles');
    take(g);
    const p = S.profiles.find((x) => x.id === id);
    if (!p) throw new Error('校验失败：服务器上找不到这份配置');
    if (p.name !== name || !sameData(p.data, data)) throw new Error('校验失败：服务器上的数据和本地不一致');
    return g;
  }
  const newId = () => 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const nm = (s) => String(s || '').trim().slice(0, 30);

  const CS = {
    api: api, S: S, OFF: OFF, byId: byId, dirty: dirty, select: select,
    on(fn) { subs.push(fn); return () => { const i = subs.indexOf(fn); if (i >= 0) subs.splice(i, 1); }; },
    list() { return [OFF].concat(S.profiles); },
    cur() { return byId(S.cur) || OFF; },
    async refresh() { return run(() => req('GET', '/api/profiles'), 'idle', 'load'); },
    // 历史版本：服务器最近 200 条写入记录里属于当前这份的保存（新的在前）
    async history() {
      const j = await req('GET', '/api/history');
      return (Array.isArray(j.history) ? j.history : []).filter((h) => h && h.id === S.cur && h.op !== 'delete' && h.data && typeof h.data === 'object');
    },
    // 载入某个历史版本：作为未保存改动
    loadData(data) { const T = TU(); if (!T) return false; const p = byId(S.cur) || OFF; T.load(data || {}, { id: p.id, name: p.name }); S.status = 'imported'; S.err = ''; emit(); return true; },
    // 导出：当前调参台里的值（含未保存改动）
    exportObj() {
      const p = byId(S.cur) || OFF;
      return { app: 'pixel-hoops', kind: 'tune-profile', v: 1, id: p.id, name: p.name, updated: p.updated || null, exported: new Date().toISOString(), dirty: dirty(), data: TU() ? TU().over() : {} };
    },
    // 导入：接受导出文件 {data:{...}} 或直接的 {键: 数值}；套用到当前这份，作为未保存改动（需要手动保存）
    importText(txt) {
      let o; try { o = JSON.parse(String(txt || '')); } catch (e) { return { ok: false, err: 'JSON 格式不对' }; }
      if (!o || typeof o !== 'object' || Array.isArray(o)) return { ok: false, err: '内容不是配置对象' };
      const d = o.data && typeof o.data === 'object' && !Array.isArray(o.data) ? o.data : o.kind || o.app ? null : o;
      if (!d) return { ok: false, err: '没有 data 字段' };
      const T = TU(); if (!T) return { ok: false, err: '调参表未就绪' };
      const use = {}, skip = [];
      for (const k in d) { const v = d[k], m = T.meta && T.meta(k); if (m && !m.tmp && (typeof v === 'number' && isFinite(v) || typeof v === 'boolean')) use[k] = +v; else skip.push(k); }
      if (!Object.keys(use).length && Object.keys(d).length) return { ok: false, err: '没有可识别的参数', skip: skip };
      const p = byId(S.cur) || OFF; T.load(use, { id: p.id, name: p.name });
      S.status = 'imported'; S.err = ''; emit();
      return { ok: true, n: Object.keys(use).length, skip: skip, name: o.name || '' };
    },
    // 另存为：新建一份，内容 = 当前与官方默认不同的项
    async saveAs(name) {
      const id = newId(), n = nm(name) || '未命名';
      const ok = await run(() => putVerify(id, n, TU() ? TU().over() : {}), 'saved', 'saveas');
      if (ok) { S.cur = id; if (TU()) TU().cur = { id: id, name: n }; emit(); }
      return ok;
    },
    // 保存：覆盖当前这份（官方默认不可覆盖）
    async save() {
      const p = byId(S.cur); if (!p || p.id === 'official') return false;
      return run(() => putVerify(p.id, p.name, TU() ? TU().over() : {}), 'saved', 'save');
    },
    async rename(name) {
      const p = byId(S.cur), n = nm(name); if (!p || p.id === 'official' || !n) return false;
      const ok = await run(() => putVerify(p.id, n, p.data || {}), 'saved', 'rename');
      if (ok && TU()) TU().cur = { id: p.id, name: n };
      emit(); return ok;
    },
    async del() {
      const p = byId(S.cur); if (!p || p.id === 'official') return false;
      const ok = await run(() => req('DELETE', '/api/profiles/' + p.id), 'idle', 'del');
      if (ok) select(S.def);   // 删掉后切回默认那份
      return ok;
    },
    async setDefault(id) {
      id = id || S.cur; if (!byId(id)) return false;
      return run(() => req('POST', '/api/default', { id: id }), 'idle', 'def');
    },
  };
  PH.CS = CS;
  // 有未保存改动（或正在保存）时刷新 / 关闭页面先弹浏览器确认框
  window.addEventListener('beforeunload', (e) => { if (S.busy || dirty()) { e.preventDefault(); e.returnValue = ''; return ''; } });

  // 启动：立即并行请求，最多等 2.5 秒；拿到后套用默认那份。失败或超时用官方默认，菜单不等
  const t0 = Date.now();
  CS.boot = req('GET', '/api/profiles', null, 2500).then((j) => {
    take(j); S.ready = true;
    if (Date.now() - t0 <= 2600 && S.cur === 'official' && !(TU() && TU().nOver && TU().nOver())) select(S.def); else emit();
  }).catch((e) => { S.ready = true; S.online = false; S.status = 'offline'; S.err = String(e && e.message || e); emit(); });
})();
