// PIXEL HOOPS - V4.0 调参台面板（PH.TUNE 注册表 + PH.CS 云端配置）
// 入口：主菜单「调参台」、设置菜单「调参台」、训练场面板「调参台」。打开时 PH.TUNE.ui.open = true（训练场里地板画触发区域）
(function () {
  const PH = (window.PH = window.PH || {});
  const $ = (id) => document.getElementById(id);
  const TU = () => PH.TUNE, CS = () => PH.CS;
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const p2 = (n) => String(n).padStart(2, '0');
  const hms = (t) => { const d = new Date(t); return p2(d.getHours()) + ':' + p2(d.getMinutes()) + ':' + p2(d.getSeconds()); };
  const ymd = (t) => { const d = new Date(t); return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate()) + ' ' + hms(t); };
  const OPN = { save: '保存', saveas: '另存为', rename: '重命名', del: '删除', def: '设为默认', load: '读取' };
  let msgT = 0;
  function msg(t, bad) { const m = $('tn-msg'); clearTimeout(msgT); m.textContent = t || ''; m.classList.toggle('hidden', !t); m.classList.toggle('bad', !!bad); if (t && !bad) msgT = setTimeout(() => m.classList.add('hidden'), 4000); }
  let isOpen = false, onClose = null, nameMode = null, delArm = 0, diffOpen = false, dragK = null;

  const decs = (st) => { const s = String(st == null ? 0.01 : st); const i = s.indexOf('.'); return i < 0 ? 0 : Math.min(4, s.length - i - 1); };
  function fv(d, v) {
    if (v == null) return '—';
    if (d.mode === 'bool') return v ? '开' : '关';
    if (typeof d.fmt === 'function') { try { return String(d.fmt(v)); } catch (e) { /* 落到默认格式 */ } }
    const n = d.mode === 'int' ? String(Math.round(v)) : (+v).toFixed(decs(d.step));
    return typeof d.fmt === 'string' ? n + d.fmt : n;
  }
  const changed = (d) => Math.abs(TU().get(d.k) - d.v) > 1e-9;
  // ---- V4.5 大类 / 小类 / 模式 ----
  // 参数字段：cat（大类 id 或中文名）、sub（小类名）、gm（'1v1' / '5v5' / 'both'；兼容把范围写在 mode 里的旧写法）
  const CATS0 = [['move', '移动与姿态'], ['shot', '投篮'], ['fin', '终结'], ['ct', '对抗'], ['drib', '运球与晃人'], ['def', '防守'], ['reb', '篮板与散球'], ['pass', '传球与接球'], ['stam', '体力'], ['ai', 'AI'], ['t5', '5V5 团队'], ['pace', '节奏与表现']];
  let catTab = null, gmF = 'all', q = '', fold = {}, infoK = null;
  function catList() {
    const T = TU(), src = T && Array.isArray(T.CATS) && T.CATS.length ? T.CATS : CATS0.map((c) => ({ id: c[0], name: c[1] }));
    const L = src.map((c) => ({ id: String(c.id), name: String(c.name), subs: Array.isArray(c.subs) ? c.subs.map(String) : [] })), by = {};
    for (const c of L) { by[c.id] = c; by[c.name] = c; }
    for (const d of T ? T.list() : []) { const c = d.cat; if (c != null && c !== '' && !by[c]) { const n = { id: String(c), name: String(c), subs: [] }; L.push(n); by[n.id] = n; } }
    // 「其他」兜底：tune.js 自带 misc 就用它，否则补一个
    let o = by.misc || by['其他']; if (!o) { o = { id: 'other', name: '其他', subs: [] }; L.push(o); by.other = o; } else { L.splice(L.indexOf(o), 1); L.push(o); }
    return { L, by, oth: o.id };
  }
  const gname = (g) => { const x = TU().groups.find((y) => y.id === g); return x ? x.name : g || '未分组'; };
  function catOf(d, C) { const c = d.cat != null && d.cat !== '' ? C.by[d.cat] : null; return c ? c.id : C.oth; }
  const subOf = (d, cid, C) => d.sub ? String(d.sub) : cid === C.oth ? gname(d.g) : '通用';
  function scope(d) { const g = d.gm || d.scope || (/^(1v1|5v5|both)$/.test(d.mode) ? d.mode : null); return g === '1v1' || g === '5v5' ? g : 'both'; }
  const gmOk = (d) => gmF === 'all' || scope(d) === 'both' || scope(d) === gmF;
  const qOk = (d, C) => { if (!q) return true; const c = C.by[catOf(d, C)], h = [d.label, d.k, d.note, d.sub, c && c.name].concat(Array.isArray(d.syn) ? d.syn : []).join(' ').toLowerCase(); return q.split(/\s+/).every((w) => h.includes(w)); };
  // 可见的参数（按模式 + 搜索过滤），附带 cat / sub
  function view() {
    const C = catList(), out = [];
    for (const d of TU().list()) { if (!gmOk(d) || !qOk(d, C)) continue; const c = catOf(d, C); out.push({ d, c, s: subOf(d, c, C) }); }
    return { C, out };
  }
  const isMod = (d) => !d.tmp && changed(d);
  function rowHTML(d) {
    const v = TU().get(d.k), m = changed(d), sc = scope(d);
    const ctl = d.mode === 'bool'
      ? '<button class="tn-bool' + (v ? ' on' : '') + '" data-k="' + d.k + '" data-testid="tn-b-' + d.k + '">' + fv(d, v) + '</button>'
      : '<input type="range" data-k="' + d.k + '" min="' + d.min + '" max="' + d.max + '" step="' + (d.mode === 'int' ? Math.max(1, d.step || 1) : d.step) + '" value="' + v + '" aria-label="' + esc(d.label) + '" data-testid="tn-r-' + d.k + '">';
    const tip = d.label + '\n' + d.k + ' · 默认 ' + fv(d, d.v) + (d.note ? '\n' + d.note : '');
    return '<div class="tn-row' + (m ? ' mod' : '') + '" data-row="' + d.k + '" title="' + esc(tip) + '"><label>' + esc(d.label) + (sc !== 'both' ? '<em class="tn-gmt">' + (sc === '1v1' ? '1V1' : '5V5') + '</em>' : '') + '</label><output>' + esc(fv(d, v)) + '</output>' +
      '<button class="tn-rs" data-rs="' + d.k + '" title="恢复默认 ' + esc(fv(d, d.v)) + '" aria-label="恢复默认" data-testid="tn-rs-' + d.k + '">↺</button>' + ctl + '</div>';
  }
  function updRow(k) {
    for (const el of document.querySelectorAll('#tune [data-row="' + k + '"]')) {
      const d = TU().meta(k); if (!d) return;
      const v = TU().get(k); el.classList.toggle('mod', changed(d)); el.querySelector('output').textContent = fv(d, v);
      const r = el.querySelector('input[type=range]'); if (r && dragK !== k) r.value = v;
      const b = el.querySelector('.tn-bool'); if (b) { b.classList.toggle('on', !!v); b.textContent = fv(d, v); }
    }
    if (infoK === k) info(k);
  }
  // 左侧大类：参数数 + 改过数（按当前模式 / 搜索过滤）
  function cats(V) {
    V = V || view(); const n = {}, m = {};
    for (const x of V.out) { if (x.d.tmp) continue; n[x.c] = (n[x.c] || 0) + 1; if (isMod(x.d)) m[x.c] = (m[x.c] || 0) + 1; }
    const L = V.C.L.filter((c) => c.id !== V.C.oth || n[c.id] || (!q && TU().list().some((d) => !d.tmp && catOf(d, V.C) === c.id)));
    if (!catTab || !L.some((c) => c.id === catTab)) catTab = (L.find((c) => n[c.id]) || L[0] || {}).id || null;
    if (q && !n[catTab]) { const f = L.find((c) => n[c.id]); if (f) catTab = f.id; }
    $('tn-cats').innerHTML = L.map((c) => '<button data-c="' + esc(c.id) + '" data-testid="tn-cat-' + esc(c.id) + '" class="' + (c.id === catTab ? 'on' : '') + (n[c.id] ? '' : ' empty') + (m[c.id] ? ' has' : '') + '"><span>' + esc(c.name) + '</span><small>' + (n[c.id] || 0) + '</small>' + (m[c.id] ? '<i title="改过 ' + m[c.id] + ' 项">' + m[c.id] + '</i>' : '') + '</button>').join('');
  }
  // 右侧：当前大类按小类分段（可折叠）；搜索时显示所有大类里的命中项
  function body() {
    const V = view(); cats(V);
    const list = V.out.filter((x) => !x.d.tmp && (q ? true : x.c === catTab));
    const secs = [], idx = {};
    for (const x of list) { const key = (q ? x.c + '|' : '') + x.s, ck = x.c + '|' + x.s; if (!idx[key]) { idx[key] = { key: ck, name: q ? V.C.by[x.c].name + ' · ' + x.s : x.s, items: [] }; secs.push(idx[key]); } idx[key].items.push(x.d); }
    // 小类顺序：按 CATS[i].subs；不在表里的按出现顺序排在后面
    const so = (S) => { const c = V.C.by[S.key.slice(0, S.key.indexOf('|'))], i = c ? c.subs.indexOf(S.key.slice(S.key.indexOf('|') + 1)) : -1; return i < 0 ? 1e4 : i; };
    if (!q) secs.forEach((S, i) => { S.o = so(S) * 1e4 + i; }), secs.sort((a, b) => a.o - b.o);
    $('tn-body').innerHTML = secs.length ? secs.map((S) => {
      const m = S.items.filter(isMod).length, f = !q && fold[S.key];
      return '<section class="tn-sec' + (f ? ' fold' : '') + '" data-sec="' + esc(S.key) + '"><div class="tn-subh"><button class="tn-tog" data-tog="' + esc(S.key) + '" data-testid="tn-sub-' + esc(S.key) + '"><b>' + (f ? '▸' : '▾') + '</b>' + esc(S.name) + '<small>' + S.items.length + '</small>' + (m ? '<i>' + m + '</i>' : '') + '</button>' +
        (m ? '<button class="tn-rs on" data-rss="' + esc(S.key) + '" title="本小类恢复默认" aria-label="本小类恢复默认" data-testid="tn-rss-' + esc(S.key) + '">↺</button>' : '') + '</div>' +
        (f ? '' : '<div class="tn-subb">' + S.items.map(rowHTML).join('') + '</div>') + '</section>';
    }).join('') : '<div class="tn-none">—</div>';
    // 训练场：预览类临时滑条固定在上方
    const pin = TU().list().filter((d) => d.tmp), tr = $('tune').classList.contains('intrain');
    $('tn-pin').innerHTML = tr && pin.length ? pin.map(rowHTML).join('') : ''; $('tn-pin').classList.toggle('hidden', !(tr && pin.length));
    const c = V.C.by[catTab], cm = TU().list().filter((d) => !d.tmp && catOf(d, V.C) === catTab && isMod(d)).length;
    $('tn-greset').textContent = (c ? c.name : '本类') + ' 重置'; $('tn-greset').disabled = q ? !list.some(isMod) : !cm;
    if (q) $('tn-greset').textContent = '搜索结果重置';
  }
  // 只刷新计数（拖滑条时不重建列表）
  function counts() {
    const V = view(); cats(V);
    for (const sec of document.querySelectorAll('#tn-body .tn-sec')) {
      const key = sec.getAttribute('data-sec'), [c, s] = [key.slice(0, key.indexOf('|')), key.slice(key.indexOf('|') + 1)];
      const it = V.out.filter((x) => !x.d.tmp && x.c === c && x.s === s), m = it.filter((x) => isMod(x.d)).length, h = sec.querySelector('.tn-tog');
      let i = h.querySelector('i'); if (m && !i) { i = document.createElement('i'); h.appendChild(i); } if (i) { if (m) i.textContent = m; else i.remove(); }
      let r = sec.querySelector('[data-rss]'); if (m && !r) { sec.querySelector('.tn-subh').insertAdjacentHTML('beforeend', '<button class="tn-rs on" data-rss="' + esc(key) + '" title="本小类恢复默认" aria-label="本小类恢复默认" data-testid="tn-rss-' + esc(key) + '">↺</button>'); } else if (!m && r) r.remove();
    }
    const C = V.C, list = V.out.filter((x) => !x.d.tmp && (q ? true : x.c === catTab));
    $('tn-greset').disabled = !list.some((x) => isMod(x.d));
  }
  // 说明栏：悬停 / 聚焦某个参数时显示键名、默认值、范围、说明
  function info(k) {
    infoK = k; const el = $('tn-info'), d = k && TU().meta(k);
    if (!d) { el.innerHTML = ''; el.classList.add('blank'); return; }
    el.classList.remove('blank');
    el.innerHTML = '<b>' + esc(d.label) + '</b><code>' + esc(d.k) + '</code><span>默认 ' + esc(fv(d, d.v)) + (d.mode !== 'bool' && d.min != null ? ' · ' + esc(fv(d, d.min)) + '–' + esc(fv(d, d.max)) : '') + '</span>' + (Array.isArray(d.syn) && d.syn.length ? '<span>同义 ' + d.syn.map((x) => '<code>' + esc(x) + '</code>').join(' ') + '</span>' : '') + (d.note ? '<p>' + esc(d.note) + '</p>' : '');
  }
  function resetKeys(ks) { const T = TU(); for (const k of ks) { const d = T.meta(k); if (d && changed(d)) T.set(k, d.v); } }
  function jump(k) {
    const d = TU().meta(k); if (!d) return; const C = catList(), c = catOf(d, C);
    q = ''; $('tn-q').value = ''; if (!gmOk(d)) setGm('all'); catTab = c; fold[c + '|' + subOf(d, c, C)] = false; body();
    const r = document.querySelector('#tn-body [data-row="' + k + '"]'); if (r) { r.scrollIntoView({ block: 'center' }); r.classList.add('flash'); setTimeout(() => r.classList.remove('flash'), 700); info(k); }
  }
  function setGm(g) { gmF = g; for (const b of document.querySelectorAll('#tn-gm button')) b.classList.toggle('on', b.getAttribute('data-gm') === g); }
  function head() {
    const C = CS(), S = C.S, cur = C.cur(), dirty = C.dirty(), off = !S.online;
    $('tn-sel').innerHTML = C.list().map((p) => '<option value="' + esc(p.id) + '"' + (p.id === cur.id ? ' selected' : '') + '>' + (p.id === S.def ? '★ ' : '') + esc(p.name) + '</option>').join('');
    const fail = S.status === 'error' && S.op !== 'load';
    const st = S.busy ? ['保存中…', 'busy'] : fail ? [(OPN[S.op] || '保存') + '失败', 'err'] : off ? ['离线', 'err'] : dirty ? ['未保存', 'dirty'] : cur.id === 'official' ? ['', ''] : S.savedAt ? ['已保存 ' + hms(S.savedAt), 'ok'] : ['已保存', 'ok'];
    const se = $('tn-st'); se.textContent = st[0]; se.className = 'tn-st ' + st[1]; se.title = S.err || '';
    const ee = $('tn-err'), et = fail ? (OPN[S.op] || '保存') + '失败：' + S.err + (dirty ? '（改动未保存）' : '') : off && S.err ? '连不上配置服务器：' + S.err : '';
    ee.textContent = et; ee.classList.toggle('hidden', !et);
    const ut = cur.updated ? +cur.updated : 0; $('tn-upd').textContent = cur.id === 'official' ? '' : ut ? '最后保存 ' + ymd(ut < 1e12 ? ut * 1000 : ut) : '';
    const dis = (id, b) => { $(id).disabled = !!b; };
    dis('tn-save', off || S.busy || cur.id === 'official' || !dirty); dis('tn-saveas', off || S.busy); dis('tn-ren', off || S.busy || cur.id === 'official');
    dis('tn-del', off || S.busy || cur.id === 'official'); dis('tn-def', off || S.busy || S.def === cur.id);
    dis('tn-histbtn', off || cur.id === 'official');
    $('tn-def').textContent = S.def === cur.id ? '★ 默认' : '☆ 设为默认';
    $('tn-del').textContent = delArm > Date.now() ? '确认删除' : '删除'; $('tn-del').classList.toggle('arm', delArm > Date.now());
    const ov = TU().over(), ks = Object.keys(ov);
    $('tn-difft').textContent = '和官方默认相比改了 ' + ks.length + ' 项' + (ks.length ? (diffOpen ? ' ▾' : ' ▸') : '');
    $('tn-difft').disabled = !ks.length;
    const dl = $('tn-diffl'); dl.classList.toggle('hidden', !(diffOpen && ks.length));
    if (diffOpen && ks.length) dl.innerHTML = ks.map((k) => { const d = TU().meta(k); return '<div data-jump="' + k + '"><span>' + esc(d.label) + '</span><b>' + esc(fv(d, d.v)) + ' → ' + esc(fv(d, ov[k])) + '</b></div>'; }).join('');
  }
  function all() { if (!isOpen) return; body(); head(); }

  function nameBox(mode) {
    nameMode = mode; const box = $('tn-name'), inp = $('tn-input');
    box.classList.toggle('hidden', !mode);
    if (mode) { inp.value = mode === 'ren' ? CS().cur().name : ''; inp.placeholder = mode === 'ren' ? '新名字' : '配置名字'; inp.focus(); inp.select(); }
  }
  async function nameOk() {
    let v = $('tn-input').value.trim(); if (!v) { const d = new Date(); v = '配置 ' + p2(d.getHours()) + p2(d.getMinutes()); }
    const m = nameMode; nameBox(null);
    if (m === 'ren') await CS().rename(v); else await CS().saveAs(v);
  }

  // ctx = { ctx: 'menu' | 'pause' | 'train', onClose }；关闭时 ctx = { silent: true } 不回调（切屏时用）
  function open(on, ctx) {
    on = !!on; if (on === isOpen) return;
    isOpen = on; const T = TU(); if (T) { T.ui = T.ui || { open: false }; T.ui.open = on; }
    const el = $('tune'); el.classList.toggle('hidden', !on);
    if (on) { onClose = ctx && ctx.onClose || null; el.dataset.ctx = (ctx && ctx.ctx) || ''; el.classList.toggle('intrain', !!(ctx && ctx.ctx === 'train')); nameBox(null); pasteBox(false); $('tn-hist').classList.add('hidden'); delArm = 0; all(); }
    else { nameBox(null); if (document.activeElement && el.contains(document.activeElement)) document.activeElement.blur(); const f = onClose; onClose = null; if (f && !(ctx && ctx.silent)) f(); }
  }

  function wire() {
    const T = TU(); if (!T || !$('tune')) return;
    T.ui = T.ui || { open: false };
    T.on((keys) => { if (!isOpen) return; if (!keys) { all(); return; } for (const k of keys) updRow(k); counts(); head(); });
    CS().on(() => { if (isOpen) { head(); } });
    $('tn-close').addEventListener('click', () => open(false));
    wireIO();
    $('tn-cats').addEventListener('click', (e) => { const b = e.target.closest('[data-c]'); if (!b) return; catTab = b.getAttribute('data-c'); if (q) { q = ''; $('tn-q').value = ''; } body(); $('tn-body').scrollTop = 0; });
    const qi = $('tn-q');
    qi.addEventListener('input', () => { q = qi.value.trim().toLowerCase(); body(); $('tn-body').scrollTop = 0; });
    qi.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Escape') { e.preventDefault(); if (qi.value) { qi.value = ''; q = ''; body(); } else qi.blur(); } });
    qi.addEventListener('keyup', (e) => e.stopPropagation());
    $('tn-gm').addEventListener('click', (e) => { const b = e.target.closest('[data-gm]'); if (!b) return; setGm(b.getAttribute('data-gm')); body(); });
    const onRows = (root) => {
      root.addEventListener('input', (e) => { const k = e.target.getAttribute('data-k'); if (!k || e.target.type !== 'range') return; dragK = k; T.set(k, +e.target.value); });
      root.addEventListener('change', (e) => { dragK = null; const k = e.target.getAttribute('data-k'); if (k) updRow(k); if (e.target.blur) e.target.blur(); });
      root.addEventListener('click', (e) => {
        const tg = e.target.closest('[data-tog]'); if (tg) { const k = tg.getAttribute('data-tog'); fold[k] = !fold[k]; body(); return; }
        const rss = e.target.closest('[data-rss]'); if (rss) { const key = rss.getAttribute('data-rss'), V = view(); resetKeys(V.out.filter((x) => x.c + '|' + x.s === key).map((x) => x.d.k)); return; }
        const rs = e.target.closest('[data-rs]'); if (rs) { T.reset(rs.getAttribute('data-rs')); return; }
        const b = e.target.closest('.tn-bool'); if (b) { const k = b.getAttribute('data-k'); T.set(k, T.get(k) ? 0 : 1); }
      });
      root.addEventListener('mouseover', (e) => { const r = e.target.closest('[data-row]'); if (r && r.getAttribute('data-row') !== infoK) info(r.getAttribute('data-row')); });
      root.addEventListener('focusin', (e) => { const r = e.target.closest('[data-row]'); if (r) info(r.getAttribute('data-row')); });
    };
    onRows($('tn-body')); onRows($('tn-pin'));
    // 本类重置：当前大类（搜索时 = 命中的全部）里改过的项
    $('tn-greset').addEventListener('click', () => { const V = view(); resetKeys(V.out.filter((x) => !x.d.tmp && (q ? true : x.c === catTab)).map((x) => x.d.k)); });
    $('tn-areset').addEventListener('click', () => { T.reset(); });
    $('tn-sel').addEventListener('change', (e) => { CS().select(e.target.value); e.target.blur(); });
    $('tn-save').addEventListener('click', () => CS().save());
    $('tn-saveas').addEventListener('click', () => nameBox(nameMode === 'new' ? null : 'new'));
    $('tn-ren').addEventListener('click', () => nameBox(nameMode === 'ren' ? null : 'ren'));
    $('tn-def').addEventListener('click', () => CS().setDefault());
    $('tn-del').addEventListener('click', () => { if (delArm > Date.now()) { delArm = 0; CS().del(); } else { delArm = Date.now() + 3000; head(); setTimeout(() => { if (isOpen) head(); }, 3100); } });
    $('tn-ok').addEventListener('click', nameOk);
    $('tn-cancel').addEventListener('click', () => nameBox(null));
    const inp = $('tn-input');
    // 输入名字时按键不传给游戏（空格 / Esc / 方向键）
    inp.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') { e.preventDefault(); nameOk(); } else if (e.key === 'Escape') { e.preventDefault(); nameBox(null); } });
    inp.addEventListener('keyup', (e) => e.stopPropagation());
    $('tn-difft').addEventListener('click', () => { diffOpen = !diffOpen; head(); });
    $('tn-diffl').addEventListener('click', (e) => { const j = e.target.closest('[data-jump]'); if (j) jump(j.getAttribute('data-jump')); });
  }

  // 导出 / 导入（不落本地存储：下载文件、剪贴板、选文件、粘贴）
  function expText() { return JSON.stringify(CS().exportObj(), null, 2); }
  function expFile() {
    const o = CS().exportObj(), t = new Date(), nm = String(o.id || 'config').replace(/[^A-Za-z0-9_-]+/g, '_');   // 文件名只用 ASCII（配置 id），中文名字在文件内容里
    const fn = 'pixel-hoops-' + nm + '-' + t.getFullYear() + p2(t.getMonth() + 1) + p2(t.getDate()) + '-' + p2(t.getHours()) + p2(t.getMinutes()) + p2(t.getSeconds()) + '.json';
    const url = URL.createObjectURL(new Blob([JSON.stringify(o, null, 2)], { type: 'application/json' })), a = document.createElement('a');
    a.href = url; a.download = fn; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    msg('已导出 ' + fn);
  }
  async function expCopy() {
    const t = expText();
    try { await navigator.clipboard.writeText(t); msg('已复制到剪贴板'); }
    catch (e) { const ta = document.createElement('textarea'); ta.value = t; document.body.appendChild(ta); ta.select(); let ok = false; try { ok = document.execCommand('copy'); } catch (e2) { ok = false; } ta.remove(); msg(ok ? '已复制到剪贴板' : '复制失败', !ok); }
  }
  function doImport(txt) {
    const r = CS().importText(txt);
    if (!r.ok) { msg('导入失败：' + r.err, true); return false; }
    msg('已导入 ' + r.n + ' 项' + (r.skip.length ? '，忽略 ' + r.skip.length + ' 项' : '') + '，未保存'); all(); return true;
  }
  function pasteBox(on) { $('tn-pastebox').classList.toggle('hidden', !on); if (on) { $('tn-pastetxt').value = ''; $('tn-pastetxt').focus(); } }
  let hist = [];
  async function histBox(on) {
    const el = $('tn-hist'); el.classList.toggle('hidden', !on); if (!on) return;
    el.innerHTML = '<div class="hm">…</div>';
    try { hist = await CS().history(); }
    catch (e) { el.innerHTML = '<div class="hm bad">' + esc('读取历史失败：' + (e && e.message || e)) + '</div>'; return; }
    el.innerHTML = hist.length ? hist.map((h, i) => '<button data-h="' + i + '" data-testid="tn-hist-' + i + '"><span>' + esc(ymd(h.updated < 1e12 ? h.updated * 1000 : h.updated)) + '</span><b>' + Object.keys(h.data).length + ' 项</b></button>').join('') : '<div class="hm">—</div>';
  }
  function wireIO() {
    $('tn-histbtn').addEventListener('click', () => histBox($('tn-hist').classList.contains('hidden')));
    $('tn-hist').addEventListener('click', (e) => { const b = e.target.closest('[data-h]'); if (!b) return; const h = hist[+b.getAttribute('data-h')]; if (!h) return; CS().loadData(h.data); histBox(false); msg('已载入 ' + ymd(h.updated < 1e12 ? h.updated * 1000 : h.updated) + ' 的版本，未保存'); all(); });
    $('tn-exp').addEventListener('click', expFile);
    $('tn-copy').addEventListener('click', expCopy);
    $('tn-imp').addEventListener('click', () => { const f = $('tn-file'); f.value = ''; f.click(); });
    $('tn-file').addEventListener('change', (e) => { const f = e.target.files && e.target.files[0]; if (!f) return; f.text().then(doImport, () => msg('读取文件失败', true)); });
    $('tn-pastebtn').addEventListener('click', () => pasteBox($('tn-pastebox').classList.contains('hidden')));
    $('tn-pasteok').addEventListener('click', () => { if (doImport($('tn-pastetxt').value)) pasteBox(false); });
    $('tn-pastecancel').addEventListener('click', () => pasteBox(false));
    const ta = $('tn-pastetxt');
    ta.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Escape') { e.preventDefault(); pasteBox(false); } });
    ta.addEventListener('keyup', (e) => e.stopPropagation());
  }

  PH.TUNEUI = { open: open, isOpen: () => isOpen, refresh: all, wire: wire, typing: () => isOpen && ['tn-input', 'tn-pastetxt', 'tn-q'].some((id) => document.activeElement === $(id)), jump: jump, setGm: (g) => { setGm(g); all(); }, search: (t) => { $('tn-q').value = t || ''; q = String(t || '').trim().toLowerCase(); all(); } };
})();
