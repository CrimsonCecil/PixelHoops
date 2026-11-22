// A: arcade navigation. Game rules and simulation remain in main.js.
(function () {
  const PH = window.PH, GM = PH.game, $ = (id) => document.getElementById(id);
  const esc = (v) => String(v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  let ctx, view = 'home', previous = 'solo', roomName = '来一场像素斗牛', filter = 'all', ready = {}, joined = false;
  let listTimer, generation = 0, roomsList = [], published = '', listBusy = false;
  const labels = { duel: '1V1 · 半场斗牛', t3: '3V3 · 半场组队', t5: '5V5 · 全场比赛', king: '斗牛之王', train: '自由训练' };
  const fmt = () => ctx.opts.format === 't3' ? 't3' : 'online';
  const localId = () => ctx.room.role === 'host' ? 0 : ctx.slot();
  const members = () => [0, ...ctx.room.links.keys()];
  function go(next) {
    generation++; clearInterval(listTimer); listTimer = null; listBusy = false;
    view = next; $('menu').dataset.view = view;
    if (next === 'lobby') { loadRooms(); listTimer = setInterval(() => loadRooms(true), 10000); }
    refresh();
    const first = $('menu').querySelector('[data-view-panel="' + next + '"] button, .menu-panel button:not(.hidden)');
    if (first && first.offsetParent) first.focus({ preventScroll: true });
  }
  function leave(next) {
    PH.directory.stop(); published = ''; ctx.rooms.close(); joined = false; ready = {}; ctx.status('');
    ctx.opts.opponent = 'cpu'; ctx.redraw(); go(next);
  }
  function choose(format, online = false) {
    ctx.opts.format = format; ctx.opts.opponent = online ? 'online' : 'cpu';
    previous = online ? 'lobby' : 'solo'; ready = {}; ctx.redraw(); go('select');
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
    ctx.rooms.broadcast({ type: 'lobby', name: roomName, arch0: ctx.opts.arch0, arch1: ctx.opts.arch1,
      slots: ctx.lobby.map((s) => ({ ...s })), ready: { ...ready }, members: members() });
  }
  function changed() { ready = {}; publish(); sync(); refresh(); }
  function selectionChanged() {
    ready = {};
    if (ctx.room.role === 'guest') ctx.rooms.sendLobby({ arch: ctx.opts.format === 't3' ? ctx.lobby[ctx.slot()]?.arch : ctx.opts.arch1, ready: false });
    else sync();
    refresh();
  }
  let remoteMembers = [];
  function message(msg, slot) {
    if (ctx.room.role === 'host') {
      if (GM.ARCH[msg.arch]) { if (ctx.opts.format === 't3') ctx.lobby[slot].arch = msg.arch; else ctx.opts.arch1 = msg.arch; }
      ready[slot] = msg.ready === true; sync(); ctx.redraw();
    } else {
      if (GM.ARCH[msg.arch0]) ctx.opts.arch0 = msg.arch0;
      if (GM.ARCH[msg.arch1]) ctx.opts.arch1 = msg.arch1;
      if (Array.isArray(msg.slots) && msg.slots.length === 6 && msg.slots.every((s) => GM.ARCH[s.arch] && ['human', 'cpu', 'waiting'].includes(s.role))) msg.slots.forEach((s, i) => Object.assign(ctx.lobby[i], s));
      ready = msg.ready && typeof msg.ready === 'object' ? msg.ready : {};
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
    return ctx.room.role === 'host' && ctx.room.links.size > 0 && members().every((s) => ready[s]);
  }
  function refresh() {
    if (!ctx) return;
    const r = ctx.room, online = !!r.role || ctx.opts.opponent === 'online';
    $('menu').dataset.view = view; $('menu').dataset.format = ctx.opts.format;
    $('front-select-title').textContent = online ? roomName : labels[ctx.opts.format];
    $('front-room-info').textContent = r.code ? (r.role === 'host' ? '房主' : '球友') + ' · ' + (1 + (r.role === 'host' ? r.links.size : remoteMembers.length - 1)) + ' 人在房间 · 选好球员后准备' : '选择阵容，然后上场';
    $('front-ready').classList.toggle('hidden', !r.code || r.active || (r.role === 'guest' && !joined));
    $('front-ready').textContent = ready[localId()] ? '已准备 · 点击取消' : '我准备好了';
    $('front-ready').classList.toggle('on', !!ready[localId()]);
    $('front-ready-state').textContent = r.code ? (r.role === 'host' && !r.links.size ? '等待球友加入…' : (r.role === 'host' ? members() : remoteMembers).map((s) => (s === 0 ? '房主' : '球友 ' + s) + (ready[s] ? ' ✓ 已准备' : ' · 选择中')).join('　')) : '';
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
      $('front-room-list').innerHTML = '<div class="front-empty"><b>暂时连不上大厅</b><p>可以重试，或建房后使用下方直连入口；不会影响单机游玩。</p><button id="front-retry">重试</button></div>';
      $('front-directory-status').textContent = '公开大厅暂不可用';
    } finally { if (token === generation) listBusy = false; }
  }
  function renderRooms() {
    const q = $('front-room-search').value.trim().toLowerCase();
    const list = roomsList.filter((r) => (filter === 'all' || r.mode === filter) && String(r.name).toLowerCase().includes(q));
    $('front-room-list').innerHTML = list.length ? list.map((r) => '<button class="front-room" data-join="' + esc(r.code) + '"><span class="front-room-mode">' + (r.mode === 't3' ? '3V3' : '1V1') + '</span><span><b>' + esc(r.name) + '</b><small>等待开赛 · ' + r.players + ' / ' + r.capacity + ' 人</small></span><strong>加入 →</strong></button>').join('') : '<div class="front-empty"><b>还没有合适的房间</b><p>来做今天的第一位房主吧，球友会在这里看到你。</p></div>';
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
      <section class="front-home" data-view-panel="home">
        <p class="front-eyebrow">像素斗牛 ／ 篮球街机</p><h1>PIXEL<br><span>HOOPS</span></h1>
        <p class="front-tagline">球场在等你。<br>下一位传奇，由你上场。</p>
        <div class="front-entries"><button id="front-solo" class="primary" data-testid="home-solo"><small>PLAY SOLO</small><b>单机游玩</b><span>闯关、斗牛与全场比赛 →</span></button><button id="front-online" data-testid="home-online"><small>PLAY ONLINE</small><b>在线对战</b><span>找到球友，一起上场 →</span></button></div>
        <div class="front-tools"><button data-tool="help">操作说明</button><button data-tool="replays">录像</button><button data-tool="set">设置</button></div>
        <p class="front-caption">真实球员 · 像素球场 · 每一场都是新故事</p>
      </section>
      <section class="front-page front-solo" data-view-panel="solo"><header><button data-home>← 主页</button><span>PLAY SOLO / 单机游玩</span></header>
        <button class="front-king" data-format="king" data-testid="solo-king"><span class="front-eyebrow">主打玩法 · 五关挑战</span><strong>♛ 斗牛之王</strong><b>KING OF THE COURT</b><span>从街头新人到球场之王。选一位球星，连胜五位对手。</span><em>登上王座 →</em></button>
        <h2>也可以，来一场自由比赛</h2><div class="front-formats"><button data-format="duel" data-testid="solo-1v1"><b>1V1</b><span>半场斗牛</span><small>对战电脑 / 本地双人</small></button><button data-format="t3" data-testid="solo-t3"><b>3V3</b><span>半场组队</span><small>搭配三人阵容</small></button><button data-format="t5" data-testid="solo-t5"><b>5V5</b><span>全场比赛</span><small>完整球队对抗</small></button></div>
        <button class="front-train" data-format="train">训练场 · 自由练习动作 →</button>
      </section>
      <section class="front-page front-lobby" data-view-panel="lobby"><header><button data-home>← 主页</button><span>PLAY ONLINE / 在线对战</span></header><div class="front-lobby-head"><div><p class="front-eyebrow">找到球友，直接上场</p><h2>公开房间</h2></div><button class="primary" id="front-create-open">＋ 建立房间</button></div>
        <div class="front-lobby-tools"><div class="seg" id="front-filters"><button data-filter="all" class="on">全部</button><button data-filter="online">1V1</button><button data-filter="t3">3V3</button></div><input id="front-room-search" type="search" placeholder="搜索房间名称" aria-label="搜索房间名称"><button id="front-refresh">刷新</button></div>
        <p id="front-directory-status" role="status"></p><div id="front-room-list"></div>
        <form id="front-create" class="hidden"><h3>建立公开房间</h3><label>房间名称<input id="front-room-name" maxlength="24" value="来一场像素斗牛" required></label><label>比赛形式<select id="front-room-mode"><option value="duel">1V1 半场斗牛</option><option value="t3">3V3 半场组队</option></select></label><button type="submit" class="primary">建房并选人 →</button><button type="button" id="front-create-cancel">取消</button></form>
        <details class="front-direct"><summary>朋友直连 / 大厅不可用时使用</summary><div><input id="front-direct-code" maxlength="5" placeholder="朋友的直连码" aria-label="朋友的直连码"><select id="front-direct-mode" aria-label="直连比赛形式"><option value="online">1V1</option><option value="t3">3V3</option></select><button id="front-direct-join">直连加入</button></div><small>通常无需直连码，点击公开房间即可。</small></details>
      </section>`);
    $('menu').querySelector('.menu-panel').insertAdjacentHTML('afterbegin', '<header class="front-select-head"><button id="front-back">← 返回</button><div><h2 id="front-select-title"></h2><small id="front-room-info"></small></div><b>选择球星</b></header>');
    $('btn-start').insertAdjacentHTML('beforebegin', '<p id="front-ready-state" role="status"></p><button id="front-ready" class="hidden"></button>');
    $('front-solo').onclick = () => go('solo'); $('front-online').onclick = () => { previous = 'lobby'; go('lobby'); };
    $('front-back').onclick = () => leave(previous);
    $('menu').addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.hasAttribute('data-home')) leave('home');
      if (b.dataset.format) choose(b.dataset.format);
      if (b.dataset.tool) $('btn-' + b.dataset.tool).click();
      if (b.dataset.join) { const r = roomsList.find((r) => r.code === b.dataset.join); if (r) joinRoom(r.code, r.mode); }
      if (b.id === 'front-retry' || b.id === 'front-refresh') loadRooms();
      if (b.dataset.filter) { filter = b.dataset.filter; $('front-filters').querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b)); renderRooms(); }
    });
    $('front-create-open').onclick = () => { $('front-create').classList.remove('hidden'); $('front-room-name').focus(); };
    $('front-create-cancel').onclick = () => $('front-create').classList.add('hidden');
    $('front-create').onsubmit = (e) => { e.preventDefault(); roomName = $('front-room-name').value.trim() || '来一场像素斗牛'; choose($('front-room-mode').value, true); ctx.action(false); };
    $('front-room-search').oninput = renderRooms;
    $('front-direct-join').onclick = () => joinRoom($('front-direct-code').value.trim().toUpperCase(), $('front-direct-mode').value);
    $('front-ready').onclick = () => { const id = localId(); ready[id] = !ready[id]; if (ctx.room.role === 'guest') ctx.rooms.sendLobby({ ready: ready[id] }); else sync(); refresh(); };
    go('home');
  }
  PH.frontend = { mount, refresh, changed, selectionChanged, message, allowed, canStart,
    reset: () => { if (ctx) leave('home'); }, started: () => { PH.directory.stop(); published = ''; },
    joined: () => { joined = true; ctx.rooms.sendLobby({ arch: ctx.opts.arch1, ready: false }); refresh(); },
    back: () => { if (view === 'home') return false; leave(view === 'select' ? previous : 'home'); return true; } };
})();
