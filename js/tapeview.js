(function () {
  const PH = window.PH, T = PH.TAPE, $ = id => document.getElementById(id);
  const show = (id, on) => $(id).classList.toggle('hidden', !on);
  const V = { open: false, row: null, t: 0, playing: false, speed: 1, enter: null, leave: null };
  let request = 0;
  const mode = m => ({ cpu: '1V1', '2p': '1V1', train: '训练', t3: '3V3', t5: '5V5' }[m] || m);
  const clock = t => { t = Math.max(0, Number(t) || 0); return String(Math.floor(t / 60)).padStart(2, '0') + ':' + (t % 60).toFixed(1).padStart(4, '0'); };
  const duration = () => { const f = V.row.tape.frames; return f.length ? f[f.length - 1].t - f[0].t : 0; };
  const frame = () => V.row && V.row.tape.frames[V.index];
  function info() { return { ...T.summary(frame()), name: V.row && V.row.name, t: V.t, playing: V.playing, speed: V.speed }; }
  function hud() {
    if (!V.row) return;
    const f = frame(), s = f && f.s || {};
    $('tape-title').textContent = V.row.name;
    $('tape-state').textContent = clock(V.t) + ' / ' + clock(duration()) + '　比分 ' + (s.score || []).join(' : ') + '　比赛时间 ' + clock(s.gclock) + '　' + (s.phase || '');
    $('tape-scrub').max = duration(); $('tape-scrub').value = V.t;
    $('tape-play').textContent = V.playing ? '暂停' : '播放'; $('tape-speed').textContent = V.speed + '×';
  }
  function seek(t) { if (!V.row) return; V.t = Math.max(0, Math.min(duration(), Number(t) || 0)); V.index = V.row.tape.frames.indexOf(T.at(V.row.tape, V.t)); hud(); return info(); }
  function toggle() { if (V.t >= duration()) seek(0); V.playing = !V.playing; hud(); }
  function speed() { const rates = [0.25, 0.5, 1, 2]; V.speed = rates[(rates.indexOf(V.speed) + 1) % rates.length]; hud(); }
  function step(dir) {
    if (V.playing || !V.row) return;
    const frames = V.row.tape.frames;
    V.index = Math.max(0, Math.min(frames.length - 1, V.index + dir));
    V.t = frames[V.index].t - frames[0].t; hud();
  }
  async function list() {
    const token = ++request;
    V.open = true; V.playing = false; V.row = null; V.enter();
    show('tape-hud', false); show('tape-list', true);
    $('tape-rows').replaceChildren(); $('tape-list-status').textContent = '读取中…';
    try {
      const rows = await T.list(); if (token !== request) return;
      $('tape-list-status').textContent = rows.length ? '' : '暂无录像，从暂停菜单或赛后保存录像';
      for (const r of rows) {
        const box = document.createElement('div'); box.className = 'tn-name';
        const text = document.createElement('span'), m = r.meta || {};
        text.style.flex = '1'; text.textContent = r.name + ' · ' + mode(m.mode) + ' · ' + new Date(m.date || r.created * 1000).toLocaleString() + ' · ' + clock(m.dur) + ' · ' + (m.score || []).join(':');
        const play = document.createElement('button'); play.textContent = '播放'; play.onclick = () => load(r.id, 0, true);
        const del = document.createElement('button'); del.textContent = '删除'; del.onclick = async () => {
          if (!window.confirm('删除录像「' + r.name + '」？')) return;
          del.disabled = true;
          try { await T.del(r.id); await list(); } catch (e) { $('tape-list-status').textContent = '删除失败：' + e.message; del.disabled = false; }
        };
        box.append(text, play, del); $('tape-rows').append(box);
      }
    } catch (e) { if (token === request) $('tape-list-status').textContent = '云端离线，读取失败：' + e.message; }
  }
  function keyOf(value) { return PH.game.ARCH[value] ? value : Object.keys(PH.game.ARCH).find(k => PH.game.ARCH[k].name === value) || 'curry'; }
  function setup(tape) {
    const gm = PH.game, G = gm.G, m = tape.meta, keys = m.players.map(keyOf);
    PH.T3.stop(); PH.T5.stop(); PH.render5.restore();
    const audio = PH.audio; PH.audio = new Proxy({}, { get: () => () => {} });
    try {
      if (m.mode === 't5') PH.T5.start({ home: m.teams && m.teams[0] || 'BOS', away: m.teams && m.teams[1] || 'DEN', human: -1 });
      else if (m.mode === 't3') PH.T3.start({ slots: keys.map(arch => ({ arch, role: 'cpu' })), replay: false });
      else gm.newGame({ mode: m.mode, arch0: keys[0], arch1: keys[1] });
    } finally { PH.audio = audio; }
    G.intro = null; G.replay = null; G.banner = null; G.floats = []; G.cutin = null;
    PH.render.setCam(PH.render.camTuned());
  }
  async function load(key, t, play) {
    const token = ++request;
    V.open = true; V.enter(); show('tape-list', true); $('tape-list-status').textContent = '读取中…';
    try {
      const row = await T.get(key);
      if (token !== request) return;
      if (!row.tape.frames.length) throw new Error('录像没有画面');
      setup(row.tape); V.row = row; V.speed = 1; V.playing = !!play; seek(t);
      show('tape-list', false); show('tape-hud', true);
    } catch (e) { if (token === request) $('tape-list-status').textContent = '播放失败：' + e.message; }
  }
  function render(dt) {
    if (!V.row) return false;
    if (V.playing) { seek(V.t + dt * V.speed); if (V.t >= duration()) V.playing = false; }
    const f = frame(), G = PH.game.G, s = f.s || {}, fx = { ...G.fx, parts: [], rings: f.rings || [], led: f.led || null, cheer: 0, shake: 0, flash: 0, hit: 0, slow: 0, confetti: [], scoreFx: null };
    G.time = f.t; G.score = s.score || [0, 0]; G.off = s.off || 0; G.phase = s.phase; G.gclock = s.gclock;
    if (V.row.tape.meta.mode === 't5') {
      const T5 = PH.T5.T, rpl = PH.render5.rpl;
      T5.phase = s.phase; T5.off = G.off; T5.q = s.q; T5.gclock = s.gclock;
      if (f.dir) { T5.dir[G.off] = f.dir; T5.dir[1 - G.off] = -f.dir; }
      T5.tm.forEach((tm, i) => tm.score = G.score[i]);
      G.players.forEach((p, i) => {
        const key = keyOf(f.p[i].key || f.p[i].name || V.row.tape.meta.players[i]);
        if (p.key !== key) { const fresh = PH.game.t5.makePlayer(i, key, 'cpu', T5.tm[p.tm].kit); Object.assign(p, { arch: fresh.arch, col: fresh.col, h: fresh.h, r: fresh.r, a: fresh.arch, key }); }
      });
      rpl.on = false; rpl.view = { ...f, parts: [] };
      const restore = rpl.swap();
      try { PH.render5.render(T5, dt); } finally { restore(); rpl.view = null; }
    } else {
      const C = PH.render.CAMV, b = { vx: 0, vy: 0, ...f.b }, sx = 3.4 + Math.max(0, C.zoom - 1) * 6;
      const players = f.p.map((p, i) => Object.assign(Object.create(G.players[i]), { vx: 0, vy: 0 }, p, { action: null }));
      const view = Object.assign(Object.create(G), { players, ball: b, net: f.net || 0, time: f.t, focus: { cx: Math.max(-sx, Math.min(sx, b.x * C.follow)), cy: Math.max(2 - C.dist, Math.min(9 - C.dist, b.y - C.dist)) }, cz: null, fx, replay: null });
      PH.render.render(view, dt);
    }
    hud(); return true;
  }
  function exit() { request++; V.open = false; V.row = null; V.playing = false; show('tape-list', false); show('tape-hud', false); V.leave(); }
  function keys(I) {
    if (I.sysPressed('Escape') || I.sysPressed('PadB')) { if (V.row) list(); else exit(); }
    else if (V.row) {
      if (I.sysPressed('Space') || I.sysPressed('PadA')) toggle();
      if (I.sysPressed('ArrowLeft') || I.sysPressed('PadLB')) seek(V.t - 5);
      if (I.sysPressed('ArrowRight') || I.sysPressed('PadRB')) seek(V.t + 5);
      if (I.sysPressed('Comma')) step(-1); if (I.sysPressed('Period')) step(1);
      if (I.sysPressed('KeyS') || I.sysPressed('PadY')) speed();
    } else {
      const buttons = Array.from($('tape-list').querySelectorAll('button:not(:disabled)'));
      let index = buttons.indexOf(document.activeElement);
      if (I.sysPressed('PadDown') || I.sysPressed('ArrowDown')) buttons[(index + 1) % buttons.length].focus();
      if (I.sysPressed('PadUp') || I.sysPressed('ArrowUp')) buttons[(index + buttons.length - 1) % buttons.length].focus();
      if (I.sysPressed('PadA')) (buttons[index] || buttons[0]).click();
    }
    I.clearSys();
  }
  $('btn-replays').onclick = list; $('tape-refresh').onclick = list; $('tape-list-close').onclick = exit;
  $('tape-play').onclick = toggle; $('tape-speed').onclick = speed;
  $('tape-back').onclick = () => seek(V.t - 5); $('tape-forward').onclick = () => seek(V.t + 5);
  $('tape-prev').onclick = () => step(-1); $('tape-next').onclick = () => step(1);
  $('tape-scrub').oninput = e => seek(e.target.value); $('tape-exit').onclick = list;
  window.tapeSeek = seek; window.tapeInfo = info;
  document.addEventListener('keydown', e => { if (V.open && V.row && ['Space', 'ArrowLeft', 'ArrowRight', 'Comma', 'Period', 'KeyS'].includes(e.code)) e.preventDefault(); });
  PH.tapeView = Object.assign(V, { list, load, render, keys });
})();
