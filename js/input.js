// PIXEL HOOPS - 输入：键盘 / 手柄 / 触屏
(function () {
  const PH = (window.PH = window.PH || {});
  const keys = {}, latch = {};
  const MAPS = [
    { up: ['KeyW'], down: ['KeyS'], left: ['KeyA'], right: ['KeyD'], sprint: ['ShiftLeft'], a1: ['KeyJ', 'Space'], a2: ['KeyK'], a3: ['KeyL'], post: ['KeyU'] },
    { up: ['ArrowUp'], down: ['ArrowDown'], left: ['ArrowLeft'], right: ['ArrowRight'], sprint: ['Numpad0', 'ShiftRight'], a1: ['Numpad1', 'Comma'], a2: ['Numpad2', 'Period'], a3: ['Numpad3', 'Slash'], post: ['KeyO'] },
  ];
  const SOLO_EXTRA = { up: ['ArrowUp'], down: ['ArrowDown'], left: ['ArrowLeft'], right: ['ArrowRight'] };
  const touch = { mx: 0, my: 0, a1: false, a2: false, a3: false, alt: false, sprint: false, on: false };
  const sys = {};
  const sysEdge = {}, blockedNav = {};
  const blockedKeys = {}, blockedPad = {}, blockedTouch = {};

  window.addEventListener('keydown', (e) => {
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Slash', 'Tab'].includes(e.code)) e.preventDefault();
    if (!e.repeat) { if (!blockedKeys[e.code]) sysEdge[e.code] = true; delete blockedKeys[e.code]; keys[e.code] = true; latch[e.code] = true; sys[e.code] = true; }
  });
  window.addEventListener('keyup', (e) => { keys[e.code] = false; delete blockedKeys[e.code]; });
  window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; for (const k in blockedKeys) delete blockedKeys[k]; });

  const held = (list) => { for (const c of list) if (!blockedKeys[c] && (keys[c] || latch[c])) return true; return false; };
  const gpBtn = (gp, i) => !!(gp && gp.buttons[i] && (gp.buttons[i].pressed || ((i === 6 || i === 7) && gp.buttons[i].value > 0.3)));
  function padBtn(gp, i) {
    const down = gpBtn(gp, i), blk = gp && blockedPad[gp.index];
    if (blk && blk[i]) { if (!down) delete blk[i]; return false; }
    return down;
  }
  function touchBtn(k) {
    if (!touch[k]) { delete blockedTouch[k]; return false; }
    return !blockedTouch[k];
  }
  let padPrev = {};
  const lock = { on: false };
  const yTaps = [];
  function finishTap(slot, down, onOffense, teamPass) {
    const now = PH.game ? PH.game.G.time : Date.now() / 1000;
    let s = yTaps[slot];
    if (!s || s.teamPass !== teamPass || now < s.time || !onOffense) s = yTaps[slot] = { down: false, at: null, finish: false, teamPass };
    s.time = now;
    if (!onOffense) return { finish: false, alley: false };
    let alley = false, finish = false;
    if (down && !s.down) {
      if (s.at != null && now - s.at < 0.25) { alley = true; s.at = null; s.finish = false; }
      else { s.at = now; s.finish = false; }
    }
    if (s.at != null && now - s.at >= 0.25) { s.at = null; s.finish = true; finish = true; }
    finish = finish || s.finish && down;
    if (!down && s.at == null) s.finish = false;
    s.down = down;
    return { finish, alley };
  }

  function pads() {
    const out = [];
    try { const g = navigator.getGamepads ? navigator.getGamepads() : []; for (const p of g) if (p && p.connected) out.push(p); } catch (e) { /* 沙盒内可能不可用 */ }
    return out;
  }

  // 返回抽象输入：mx,my(屏幕上方为 +y)、sprint、a1(投篮/盖帽)、a2(扣篮/抢断)、a3(运球动作/防守姿态)
  function read(slot, onOffense, solo, teamPass = false) {
    const m = MAPS[slot];
    let mx = 0, my = 0;
    if (held(m.left) || (solo && held(SOLO_EXTRA.left))) mx -= 1;
    if (held(m.right) || (solo && held(SOLO_EXTRA.right))) mx += 1;
    if (held(m.up) || (solo && held(SOLO_EXTRA.up))) my += 1;
    if (held(m.down) || (solo && held(SOLO_EXTRA.down))) my -= 1;
    const a3 = held(m.a3), hesi = onOffense && held([slot === 0 ? 'KeyH' : 'Numpad5']);
    const o = { mx: mx, my: my, sprint: held(m.sprint), a1: held(m.a1), a2: held(m.a2), a3: a3 || hesi, dribble: a3, hesi: hesi, post: onOffense && held(m.post), dx: 0, dy: 0 };
    const gp = lock.on ? null : pads()[slot];
    const y = finishTap(slot, padBtn(gp, 3), onOffense, teamPass);
    if (gp) {
      const ax = gp.axes[0] || 0, ay = gp.axes[1] || 0;
      if (Math.hypot(ax, ay) > 0.22) { o.mx = ax; o.my = -ay; }
      const B = (i) => padBtn(gp, i);
      if (onOffense && B(11)) o.a3 = o.hesi = true;
      if (B(14)) o.mx = -1; if (B(15)) o.mx = 1; if (B(12)) o.my = 1; if (B(13)) o.my = -1;
      if (B(7) || B(5)) o.sprint = true;
      if (onOffense) { if (B(2)) o.a1 = true; if (y.finish) o.a2 = true; if (B(1)) o.a3 = o.dribble = true; if (B(6) || B(4)) o.post = true; }
      else { if (B(3)) o.a1 = true; if (B(2)) o.a2 = true; if (B(6) || B(4) || (!teamPass && B(0))) o.a3 = true; }
      const rx = gp.axes[2] || 0, ry = gp.axes[3] || 0;
      o.rsPad = true;
      if (onOffense && Math.hypot(rx, ry) >= 0.5) { o.a3 = o.rs = true; o.dx = rx; o.dy = -ry; }
    }
    if (slot === 0 && touch.on) {
      if (Math.hypot(touch.mx, touch.my) > 0.2) { o.mx = touch.mx; o.my = touch.my; }
      o.a1 = o.a1 || touchBtn('a1'); o.a2 = o.a2 || touchBtn('a2'); o.a3 = o.a3 || touchBtn('a3'); o.sprint = o.sprint || touchBtn('sprint');
      if (onOffense) { o.dribble = o.dribble || touchBtn('a3'); o.post = o.post || touchBtn('alt'); }
    }
    o.selfAlley = !teamPass && (held(slot === 0 ? ['KeyV'] : ['Numpad4']) || y.alley);
    if (teamPass && y.alley) { o.pass = true; o.passKind = 'alley'; }
    const l = Math.hypot(o.mx, o.my); if (l > 1) { o.mx /= l; o.my /= l; }
    return o;
  }
  // V3.9 5V5：原始按键（Xbox 默认布局，完全对照 2K）。键盘镜像：WASD=左摇杆 方向键=右摇杆 J/空格=X K=A L=B I=Y U=LT E=RB R=LB 左Shift=RT
  const K5 = { X: ['KeyJ', 'Space'], A: ['KeyK'], B: ['KeyL'], Y: ['KeyI'], LT: ['KeyU'], RB: ['KeyE'], LB: ['KeyR'], RT: ['ShiftLeft'] };
  function read5() {
    const o = { lx: 0, ly: 0, rx: 0, ry: 0, A: false, B: false, X: false, Y: false, LB: false, RB: false, LT: false, RT: false, hesi: held(['KeyH']), menu: false, view: false, dU: false, dD: false, dL: false, dR: false, pad: false };
    if (held(['KeyA'])) o.lx -= 1; if (held(['KeyD'])) o.lx += 1; if (held(['KeyW'])) o.ly += 1; if (held(['KeyS'])) o.ly -= 1;
    if (held(['ArrowLeft'])) o.rx -= 1; if (held(['ArrowRight'])) o.rx += 1; if (held(['ArrowUp'])) o.ry += 1; if (held(['ArrowDown'])) o.ry -= 1;
    for (const k in K5) if (held(K5[k])) o[k] = true;
    const gp = lock.on ? null : pads()[0];
    if (gp) {
      o.pad = true;
      const B = (i) => padBtn(gp, i);
      const ax = gp.axes[0] || 0, ay = gp.axes[1] || 0, rx = gp.axes[2] || 0, ry = gp.axes[3] || 0;
      o.rsPad = true;
      if (Math.hypot(ax, ay) > 0.2) { o.lx = ax; o.ly = -ay; }
      if (Math.hypot(rx, ry) > 0.35) { o.rx = rx; o.ry = -ry; }
      const N = ['A', 'B', 'X', 'Y', 'LB', 'RB', 'LT', 'RT', 'view', 'menu'];
      for (let i = 0; i < N.length; i++) if (B(i)) o[N[i]] = true;
      o.hesi = o.hesi || B(11);
      o.dU = B(12); o.dD = B(13); o.dL = B(14); o.dR = B(15);
    }
    if (touch.on) {
      if (Math.hypot(touch.mx, touch.my) > 0.2) { o.lx = touch.mx; o.ly = touch.my; }
      if (touchBtn('a1')) o.X = true; if (touchBtn('a2')) o.A = true; if (touchBtn('a3')) o.LT = true; if (touchBtn('sprint')) o.RT = true;
      o.hesi = o.hesi || touchBtn('alt');
    }
    const l = Math.hypot(o.lx, o.ly); if (l > 1) { o.lx /= l; o.ly /= l; }
    return o;
  }

  function read3(onOffense) {
    const input = read(0, onOffense, true, true), gp = lock.on ? null : pads()[0];
    const B = (i) => padBtn(gp, i);
    const padAlley = input.passKind === 'alley';
    input.pass = held(['KeyE']) || B(0) || touchBtn('pass') || padAlley;
    const bounce = held(['KeyZ']) || touchBtn('bounce') || B(0) && B(4);
    const lob = held(['KeyX']) || touchBtn('lob') || B(0) && B(6);
    const alley = held(['KeyV']) || touchBtn('alley') || bounce && lob || padAlley;
    if (onOffense && (bounce || lob || alley)) input.pass = true;
    if (input.pass) input.passKind = alley ? 'alley' : lob ? 'lob' : bounce ? 'bounce' : input.sprint ? 'skip' : 'chest';
    input.screen = held(['KeyF']) || B(11) || touchBtn('screen');
    if (B(0) && (B(4) || B(6))) input.post = false;
    return input;
  }
  // 每帧轮询手柄的菜单按键（上下左右 / A / B / Menu）
  const navPrev = {}, navRep = {}, REPEAT = { PadUp: 1, PadDown: 1, PadLeft: 1, PadRight: 1 };
  const NAV_KEYS = ['PadUp', 'PadDown', 'PadLeft', 'PadRight', 'PadA', 'PadB', 'PadStart', 'PadBack', 'PadX', 'PadY', 'PadLB', 'PadRB', 'PadRLeft', 'PadRRight'];
  let pressSlot = -1; // 本帧新按下按键的手柄序号（0 = 手柄 1 = 玩家 1，1 = 手柄 2 = 玩家 2）
  // split.on：手柄 2 的菜单键单独记为 P2PadUp / P2PadA …（本地双人选人时两个手柄各有一个光标）
  const split = { on: false, was: false };
  const navPre = (slot) => split.on && slot === 1 ? 'P2' : '';
  function padNav(gp, cur, pre = '') {
    const B = (i) => gp.buttons[i]?.pressed, ax = gp.axes[0] || 0, ay = gp.axes[1] || 0, rx = gp.axes[2] || 0;
    const on = (k) => { cur[pre + k] = true; };
    if (B(12) || ay < -0.6) on('PadUp'); if (B(13) || ay > 0.6) on('PadDown'); if (B(14) || ax < -0.6) on('PadLeft'); if (B(15) || ax > 0.6) on('PadRight');
    if (B(0)) on('PadA'); if (B(1)) on('PadB'); if (B(9)) on('PadStart'); if (B(8)) on('PadBack');
    if (B(2)) on('PadX'); if (B(3)) on('PadY'); if (B(4)) on('PadLB'); if (B(5)) on('PadRB');
    if (rx < -0.6) on('PadRLeft'); if (rx > 0.6) on('PadRRight');
  }
  function pollPads() {
    const cur = {}, nextButtons = {}, now = performance.now();
    let pressed = false;
    pressSlot = -1;
    // 分不分 P2 菜单键切换时，还按着的键记成已按下，不在新名字下再触发一次
    if (split.on !== split.was) {
      split.was = split.on; const held = {};
      pads().forEach((gp, slot) => padNav(gp, held, navPre(slot)));
      for (const k in held) { navPrev[k] = true; navRep[k] = now + 380; }
    }
    pads().forEach((gp, slot) => {
      const blk = blockedPad[gp.index];
      if (blk) for (const i in blk) if (!gpBtn(gp, +i)) delete blk[i];
      const prev = padPrev[gp.index] || [], buttons = nextButtons[gp.index] = gp.buttons.map((b) => b.pressed);
      if (buttons.some((b, i) => b && !prev[i])) { pressed = true; pressSlot = slot; }
      padNav(gp, cur, navPre(slot));
    });
    for (const pre of ['', 'P2']) for (const n of NAV_KEYS) {
      const k = pre + n;
      if (!cur[k]) delete blockedNav[k];
      if (cur[k] && !navPrev[k]) { sys[k] = true; if (!blockedNav[k]) sysEdge[k] = true; navRep[k] = now + 380; }
      else if (cur[k] && REPEAT[n] && now >= navRep[k]) { sys[k] = true; navRep[k] = now + 85; }
      navPrev[k] = !!cur[k];
    }
    padPrev = nextButtons;
    return pressed;
  }
  // 右摇杆（菜单里用来滚动 / 翻页）：取摇杆偏移最大的手柄，死区 0.25
  function rstick() {
    let bx = 0, by = 0;
    for (const gp of pads()) { const x = gp.axes[2] || 0, y = gp.axes[3] || 0; if (Math.hypot(x, y) > Math.hypot(bx, by)) { bx = x; by = y; } }
    return Math.hypot(bx, by) > 0.25 ? { x: bx, y: by } : { x: 0, y: 0 };
  }
  function endTick() { for (const k in latch) delete latch[k]; }
  function blockRebound(slot) {
    delete yTaps[slot];
    const gp = pads()[slot];
    if (gp && gpBtn(gp, 3)) {
      const b = blockedPad[gp.index] || (blockedPad[gp.index] = {});
      b[3] = true;
    }
  }
  function flush() {
    for (const k in blockedNav) delete blockedNav[k];
    for (const k in sysEdge) delete sysEdge[k];
    endTick();
    yTaps.length = 0;
    for (const k in blockedKeys) delete blockedKeys[k];
    for (const k in keys) if (keys[k]) blockedKeys[k] = true;
    for (const k in blockedPad) delete blockedPad[k];
    for (const [slot, gp] of pads().entries()) {
      padNav(gp, blockedNav, navPre(slot));
      const b = {};
      for (let i = 0; i < gp.buttons.length; i++) if (gpBtn(gp, i)) b[i] = true;
      blockedPad[gp.index] = b;
    }
    for (const k in blockedTouch) delete blockedTouch[k];
    for (const k in touch) if (k !== 'on' && k !== 'mx' && k !== 'my' && touch[k]) blockedTouch[k] = true;
  }
  function sysPressed(code) { if (sys[code]) { delete sys[code]; return true; } return false; }
  function sysAny() { const n = Object.keys(sys).length > 0; return n; }
  function clearSys() { for (const k in sys) delete sys[k]; for (const k in sysEdge) delete sysEdge[k]; }
  // 开场只认确认键翻页：移动键、摇杆和其它动作键不算，免得一进场想走位就把入场语音和对话全跳掉
  const INTRO_NEXT = ['Space', 'Enter', 'NumpadEnter', 'PadA'];
  function introPressed(code) { return code ? !!sysEdge[code] : INTRO_NEXT.some((k) => sysEdge[k]); }

  // 触屏
  function initTouch(root) {
    const stick = root.querySelector('#tstick'), nub = root.querySelector('#tnub');
    if (!stick) return;
    let id = null, cx = 0, cy = 0;
    const R = 46;
    const mv = (t) => {
      let dx = t.clientX - cx, dy = t.clientY - cy; const l = Math.hypot(dx, dy);
      if (l > R) { dx = (dx / l) * R; dy = (dy / l) * R; }
      nub.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
      touch.mx = dx / R; touch.my = -dy / R;
    };
    stick.addEventListener('touchstart', (e) => { e.preventDefault(); touch.on = true; const t = e.changedTouches[0]; id = t.identifier; const r = stick.getBoundingClientRect(); cx = r.left + r.width / 2; cy = r.top + r.height / 2; mv(t); }, { passive: false });
    stick.addEventListener('touchmove', (e) => { e.preventDefault(); for (const t of e.changedTouches) if (t.identifier === id) mv(t); }, { passive: false });
    const end = (e) => { for (const t of e.changedTouches) if (t.identifier === id) { id = null; touch.mx = touch.my = 0; nub.style.transform = ''; } };
    stick.addEventListener('touchend', end); stick.addEventListener('touchcancel', end);
    root.querySelectorAll('[data-tb]').forEach((b) => {
      const k = b.getAttribute('data-tb');
      b.addEventListener('touchstart', (e) => { e.preventDefault(); touch.on = true; touch[k] = true; b.classList.add('on'); }, { passive: false });
      const up = (e) => { e.preventDefault(); touch[k] = false; b.classList.remove('on'); };
      b.addEventListener('touchend', up); b.addEventListener('touchcancel', up);
    });
  }

  PH.input = { read: read, read3: read3, read5: read5, endTick: endTick, flush: flush, blockRebound: blockRebound, sysPressed: sysPressed, sysAny: sysAny, introPressed: introPressed, clearSys: clearSys, initTouch: initTouch, pollPads: pollPads, pressSlot: () => pressSlot, rstick: rstick, lock: lock, split: split, pads: pads, keys: keys, touch: touch };
})();
