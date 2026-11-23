// A: arcade navigation. Game rules and simulation remain in main.js.
(function () {
  const PH = window.PH, GM = PH.game, $ = (id) => document.getElementById(id);
  const esc = (v) => String(v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  let ctx, view = 'home', previous = 'solo', roomName = '来一场像素斗牛', filter = 'all';
  let listTimer, generation = 0, roomsList = [], published = '', listBusy = false;
  const synced = new Set();
  const labels = { duel: '1V1 · 半场斗牛', t3: '3V3 · 半场组队', t5: '5V5 · 全场比赛', king: '斗牛之王', train: '自由训练' };
  const fmt = () => ctx.opts.format === 't3' ? 't3' : 'online';
  const members = () => [0, ...ctx.room.links.keys()];
  function go(next) {
    const restoreFocus = document.activeElement !== $('menu') && $('menu').contains(document.activeElement);
    generation++; clearInterval(listTimer); listTimer = null; listBusy = false;
    view = next; $('menu').dataset.view = view;
    $('front-breadcrumb').textContent = { home: '你的球场，随时开场。', solo: '单机游玩', lobby: '在线大厅', select: '选择阵容' }[next];
    if (next === 'lobby') { loadRooms(); listTimer = setInterval(() => loadRooms(true), 10000); }
    refresh();
    const first = $('menu').querySelector('[data-view-panel="' + next + '"] button, .menu-panel button:not(.hidden)');
    if (first && first.offsetParent && (next !== 'home' || restoreFocus)) first.focus({ preventScroll: true });
    else if (next === 'home') { $('menu').tabIndex = -1; $('menu').focus({ preventScroll: true }); }
  }
  function leave(next) {
    PH.directory.stop(); published = ''; ctx.rooms.close(); synced.clear(); remoteMembers = []; ctx.status('');
    ctx.opts.opponent = 'cpu'; ctx.redraw(); go(next);
  }
  function choose(format, online = false, returnView = 'solo') {
    ctx.opts.format = format; ctx.opts.opponent = online ? 'online' : format === 'duel' && PH.input.pads().length >= 2 ? '2p' : 'cpu';
    previous = online ? 'lobby' : returnView; synced.clear(); remoteMembers = []; ctx.redraw(); go('select');
  }
  function capacity() { return ctx.opts.format === 't3' ? 1 + ctx.lobby.filter((s, i) => i !== 0 && s.role === 'waiting').length : 2; }
  function publish() {
    if (ctx.room.role !== 'host' || !ctx.room.code || ctx.room.active) return;
    const code = ctx.room.code;
    if (published === code) return;
    published = code;
    PH.directory.publish(code, () => ({ name: roomName, mode: fmt(), players: 1 + ctx.room.links.size, capacity: Math.max(1 + ctx.room.links.size, capacity()) }),
      () => { if (ctx.room.code === code && !ctx.room.active) ctx.status('房间已建立；公开大厅暂不可用，可让朋友通过直连加入：' + code); });
  }
  function sync() {
    if (ctx.room.role !== 'host') return;
    const list = members();
    ctx.rooms.broadcast({ type: 'lobby', name: roomName, arch0: ctx.opts.arch0, arch1: ctx.opts.arch1,
      slots: ctx.lobby.map((s) => ({ ...s })), ready: Object.fromEntries(list.map((s) => [s, s === 0 || synced.has(s)])), members: list });
  }
  function changed() {
    for (const s of synced) if (!ctx.room.links.has(s)) synced.delete(s);
    publish(); sync(); refresh();
  }
  function selectionChanged() {
    if (ctx.room.role === 'guest') ctx.rooms.sendLobby({ arch: ctx.opts.format === 't3' ? ctx.lobby[ctx.slot()]?.arch : ctx.opts.arch1, ready: true });
    else sync();
    refresh();
  }
  let remoteMembers = [];
  function message(msg, slot) {
    if (ctx.room.role === 'host') {
      if (GM.ARCH[msg.arch]) { if (ctx.opts.format === 't3') ctx.lobby[slot].arch = msg.arch; else ctx.opts.arch1 = msg.arch; }
      synced.add(slot); sync(); ctx.redraw(); refresh();
    } else {
      if (GM.ARCH[msg.arch0]) ctx.opts.arch0 = msg.arch0;
      if (GM.ARCH[msg.arch1]) ctx.opts.arch1 = msg.arch1;
      if (Array.isArray(msg.slots) && msg.slots.length === 6 && msg.slots.every((s) => GM.ARCH[s.arch] && ['human', 'cpu', 'waiting'].includes(s.role))) msg.slots.forEach((s, i) => Object.assign(ctx.lobby[i], s));
      remoteMembers = Array.isArray(msg.members) ? msg.members : [];
      if (typeof msg.name === 'string') roomName = msg.name.slice(0, 24);
      ctx.redraw();
    }
  }
  function allowed(side, slot) {
    if (!ctx.room.role) return true;
    if (ctx.room.role === 'guest') return ctx.slot() >= 0 && (slot === null ? side === 1 : slot === ctx.slot());
    return slot === null ? side === 0 : !ctx.room.links.has(slot);
  }
  function canStart() {
    if (view !== 'select') return false;
    if (!ctx.room.role) return ctx.opts.opponent !== 'online';
    return ctx.room.role === 'host' && ctx.room.links.size > 0 && [...ctx.room.links.keys()].every((s) => synced.has(s));
  }
  function refresh() {
    if (!ctx) return;
    const r = ctx.room, online = !!r.role || ctx.opts.opponent === 'online';
    const list = r.role === 'host' ? members() : remoteMembers;
    const count = r.role === 'host' ? 1 + r.links.size : Math.max(1, remoteMembers.length);
    $('menu').dataset.view = view; $('menu').dataset.format = ctx.opts.format;
    $('menu').toggleAttribute('data-room', !!r.code);
    $('front-select-title').textContent = online ? roomName : labels[ctx.opts.format];
    $('front-room-info').textContent = r.code ? (r.role === 'host' ? '房主' : '球友') + ' · ' + count + ' 人在房间 · ' + (r.role === 'host' ? '选好球员即可开始' : '选好球员，等待房主开始') : '选择阵容，然后上场';
    $('front-ready-state').textContent = r.code ? (r.role === 'host' && !r.links.size ? '等待球友加入…' : list.map((s) => (s === 0 ? '房主' : '球友 ' + s) + (r.role !== 'host' || s === 0 || synced.has(s) ? ' ✓ 已准备' : ' · 加入中…')).join('　')) : '';
    $('front-guest-wait').classList.toggle('hidden', !(r.role === 'guest' && !r.active && ctx.slot() >= 0));
    $('front-invite').classList.toggle('hidden', !r.code);
    $('front-invite-code').textContent = r.code;
    $('btn-start').disabled = !canStart();
    for (let i = 0; i < 2; i++) $('pick' + i).disabled = !allowed(i, null);
    ctx.lobby.forEach((s, i) => { $('pick3-' + i).disabled = !allowed(i < 3 ? 0 : 1, i); $('role3-' + i).disabled = !!r.role && (r.role !== 'host' || r.links.has(i) || i === 0); });
    if (!r.role && published) { PH.directory.stop(); published = ''; }
  }
  async function loadRooms(quiet = false) {
    if (listBusy) return;
    listBusy = true; const token = generation;
    if (!quiet) $('front-room-list').innerHTML = '<p class="front-empty" role="status">正在寻找公开房间…</p>';
    try {
      const data = await PH.directory.list();
      if (token !== generation) return;
      roomsList = Array.isArray(data.rooms) ? data.rooms : [];
      $('front-directory-status').textContent = '大厅每 10 秒自动刷新 · 房间点一下即可加入'; renderRooms();
    } catch (e) {
      if (token !== generation) return;
      $('front-room-list').innerHTML = '<div class="front-empty"><b>暂时连不上大厅</b><button id="front-retry">重试</button></div>';
      $('front-directory-status').textContent = '公开大厅暂不可用';
    } finally { if (token === generation) listBusy = false; }
  }
  function renderRooms() {
    $('front-filters').querySelectorAll('button').forEach((b) => { const on = b.dataset.filter === filter; b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); });
    const q = $('front-room-search').value.trim().toLowerCase();
    const list = roomsList.filter((r) => (filter === 'all' || r.mode === filter) && String(r.name).toLowerCase().includes(q));
    $('front-room-list').innerHTML = list.length ? list.map((r) => '<button class="front-room" data-join="' + esc(r.code) + '"><span class="front-room-mode">' + (r.mode === 't3' ? '3V3' : '1V1') + '</span><span><b>' + esc(r.name) + '</b><small>' + r.players + ' / ' + r.capacity + ' 人</small></span><strong>加入 →</strong></button>').join('') : '<div class="front-empty"><b>暂无房间</b></div>';
  }
  function joinRoom(code, mode) {
    if (!ctx.rooms.valid(code)) { $('front-directory-status').textContent = '请输入有效的 5 位直连码'; return; }
    const selected = ctx.opts.arch0;
    choose(mode === 't3' ? 't3' : 'duel', true); ctx.opts.arch1 = selected;
    $('room-code').value = code; ctx.action(true); refresh();
  }
  function mount(context) {
    ctx = context;
    $('menu').insertAdjacentHTML('afterbegin', `
      <header class="front-top"><a class="front-brand" href="#" data-home>PIXEL <i>HOOPS</i></a><span id="front-breadcrumb">你的球场，随时开场。</span><span class="front-edition">● 街机球馆</span></header>
      <section class="front-home" data-view-panel="home">
        <div class="front-intro"><h1>PIXEL<span>HOOPS</span></h1></div>
        <nav class="front-home-nav" aria-label="游玩模式"><div class="front-entries"><button id="front-solo" data-testid="home-solo"><b>本地开打</b><em aria-hidden="true">↗</em></button><button id="front-online" data-testid="home-online"><b>在线对战</b><em aria-hidden="true">↗</em></button></div>
        <button class="front-home-train" data-home-format="train" data-testid="home-train">自由训练<em aria-hidden="true">↗</em></button></nav>
        <div class="front-tools"><button data-tool="help"><span aria-hidden="true">?</span>操作说明</button><button data-tool="set"><span aria-hidden="true">⚙</span>设置</button></div>
      </section>
      <section class="front-page front-solo" data-view-panel="solo"><header><button data-home>← 主页</button></header>
        <button class="front-king" data-format="king" data-testid="solo-king"><strong>♛ 斗牛之王</strong></button>
        <h2>自由比赛</h2><div class="front-formats"><button data-format="duel" data-testid="solo-1v1"><b>1V1</b></button><button data-format="t3" data-testid="solo-t3"><b>3V3</b></button><button data-format="t5" data-testid="solo-t5"><b>5V5</b></button></div>
        <button class="front-train" data-format="train">训练场 · 自由练习动作 →</button>
      </section>
      <section class="front-page front-lobby" data-view-panel="lobby"><header><button data-home>← 返回主页</button></header><div class="front-lobby-head"><h2>在线大厅</h2></div>
        <div class="front-lobby-layout"><aside class="front-lobby-aside"><div class="front-plus" aria-hidden="true">＋</div><button class="primary" id="front-create-open">创建房间 →</button></aside><div class="front-lobby-main">
        <div class="front-lobby-tools"><div class="seg" id="front-filters"><button data-filter="all" class="on">全部</button><button data-filter="online">1V1</button><button data-filter="t3">3V3</button></div><input id="front-room-search" type="search" placeholder="搜索房间名称" aria-label="搜索房间名称"><button id="front-refresh">刷新</button></div>
        <p id="front-directory-status" role="status"></p><div id="front-room-list"></div>
        <form id="front-create" class="hidden"><h3>建立公开房间</h3><label>房间名称<input id="front-room-name" maxlength="24" value="来一场像素斗牛" required></label><label>比赛形式<select id="front-room-mode"><option value="duel">1V1 半场斗牛</option><option value="t3">3V3 半场组队</option></select></label><button type="submit" class="primary">建房并选人 →</button><button type="button" id="front-create-cancel">取消</button></form>
        <details class="front-direct"><summary>朋友直连</summary><div><input id="front-direct-code" maxlength="5" placeholder="朋友的直连码" aria-label="朋友的直连码"><select id="front-direct-mode" aria-label="直连比赛形式"><option value="online">1V1</option><option value="t3">3V3</option></select><button id="front-direct-join">直连加入</button></div></details>
        </div></div></section>`);
    $('menu').querySelector('.menu-panel').insertAdjacentHTML('afterbegin', '<header class="front-select-head"><button id="front-back">← 返回</button><div><h2 id="front-select-title"></h2><small id="front-room-info"></small></div><b>选择球星</b></header>');
    $('btn-start').insertAdjacentHTML('beforebegin', '<details id="front-invite" class="front-direct hidden"><summary>邀请朋友（可选直连）</summary><p>直连码 <strong id="front-invite-code"></strong> · 朋友在大厅下方打开「朋友直连」，选择相同比赛形式即可加入。</p></details><p id="front-ready-state" role="status"></p>');
    $('btn-start').insertAdjacentHTML('afterend', '<span id="front-guest-wait" class="hidden" role="status">等待房主开始...</span>');
    $('front-solo').onclick = () => go('solo'); $('front-online').onclick = () => { previous = 'lobby'; go('lobby'); };
    $('front-back').onclick = () => leave(previous);
    $('menu').addEventListener('click', (e) => {
      const b = e.target.closest('button, a[data-home]'); if (!b) return;
      if (b.matches('a')) e.preventDefault();
      if (b.hasAttribute('data-home')) leave('home');
      if (b.dataset.homeFormat) choose(b.dataset.homeFormat, false, 'home');
      if (b.dataset.format) choose(b.dataset.format);
      if (b.dataset.tool) $('btn-' + b.dataset.tool).click();
      if (b.dataset.join) { const r = roomsList.find((r) => r.code === b.dataset.join); if (r) joinRoom(r.code, r.mode); }
      if (b.id === 'front-retry' || b.id === 'front-refresh') loadRooms();
      if (b.dataset.filter) { filter = b.dataset.filter; $('front-filters').querySelectorAll('button').forEach((x) => { x.classList.toggle('on', x === b); x.setAttribute('aria-pressed', String(x === b)); }); renderRooms(); }
    });
    // Hovering an action transfers selection; moving over empty court must not cancel it.
    $('menu').querySelector('.front-home').addEventListener('pointermove', (e) => {
      const button = e.target.closest('button');
      if (e.pointerType === 'touch' || !button) return;
      if (e.currentTarget.querySelector('button.pf,button:focus-visible')) {
        e.currentTarget.querySelectorAll('.pf').forEach((b) => b.classList.remove('pf'));
        button.classList.add('pf');
        if (e.currentTarget.contains(document.activeElement)) document.activeElement.blur();
      }
    });
    $('front-create-open').onclick = () => { $('front-create').classList.remove('hidden'); $('front-room-name').focus(); };
    $('front-create-cancel').onclick = () => $('front-create').classList.add('hidden');
    $('front-create').onsubmit = (e) => { e.preventDefault(); roomName = $('front-room-name').value.trim() || '来一场像素斗牛'; choose($('front-room-mode').value, true); ctx.action(false); };
    $('front-room-search').oninput = renderRooms;
    $('front-direct-join').onclick = () => joinRoom($('front-direct-code').value.trim().toUpperCase(), $('front-direct-mode').value);
    // Text editing must not reach the global game shortcuts (P = Back, M = mute, arrows, Tab).
    for (const type of ['keydown', 'keyup']) $('menu').addEventListener(type, (e) => {
      if (e.key !== 'Tab' && !e.target.matches('input,select')) return;
      e.stopPropagation();
      if (type === 'keydown' && e.key === 'Escape') e.target.blur();
      if (type === 'keydown' && e.key === 'Enter' && e.target.id === 'front-direct-code') { e.preventDefault(); $('front-direct-join').click(); }
    });
    go('home');
  }
  PH.frontend = { mount, refresh, changed, selectionChanged, message, allowed, canStart,
    reset: () => { if (ctx) leave('home'); }, started: () => { PH.directory.stop(); published = ''; },
    joined: () => { ctx.rooms.sendLobby({ arch: ctx.opts.arch1, ready: true }); refresh(); },
    back: () => { if (view === 'home') return false; leave(view === 'select' ? previous : 'home'); return true; } };
})();
