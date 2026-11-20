// PIXEL HOOPS - 输入：键盘 / 手柄 / 触屏
(function () {
  const PH = (window.PH = window.PH || {});
  const keys = {}, latch = {};
  const MAPS = [
    { up: ['KeyW'], down: ['KeyS'], left: ['KeyA'], right: ['KeyD'], sprint: ['ShiftLeft'], a1: ['KeyJ', 'Space'], a2: ['KeyK'], a3: ['KeyL'], post: ['KeyQ'] },
    { up: ['ArrowUp'], down: ['ArrowDown'], left: ['ArrowLeft'], right: ['ArrowRight'], sprint: ['Numpad0', 'ShiftRight'], a1: ['Numpad1', 'Comma'], a2: ['Numpad2', 'Period'], a3: ['Numpad3', 'Slash'], post: ['KeyO'] },
  ];
  const SOLO_EXTRA = { up: ['ArrowUp'], down: ['ArrowDown'], left: ['ArrowLeft'], right: ['ArrowRight'] };
  const touch = { mx: 0, my: 0, a1: false, a2: false, a3: false, alt: false, sprint: false, on: false };
  const sys = {};

  window.addEventListener('keydown', (e) => {
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Slash', 'Tab'].includes(e.code)) e.preventDefault();
    if (!e.repeat) { keys[e.code] = true; latch[e.code] = true; sys[e.code] = true; }
  });
  window.addEventListener('keyup', (e) => { keys[e.code] = false; });
  window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; });

  const held = (list) => { for (const c of list) if (keys[c] || latch[c]) return true; return false; };
  let padPrev = {};
  const lock = { on: false };

  function pads() {
    const out = [];
    try { const g = navigator.getGamepads ? navigator.getGamepads() : []; for (const p of g) if (p && p.connected) out.push(p); } catch (e) { /* 沙盒内可能不可用 */ }
    return out;
  }

  // 返回抽象输入：mx,my(屏幕上方为 +y)、sprint、a1(投篮/盖帽)、a2(扣篮/抢断)、a3(运球动作/防守姿态)
  function read(slot, onOffense, solo) {
    const m = MAPS[slot];
    let mx = 0, my = 0;
    if (held(m.left) || (solo && held(SOLO_EXTRA.left))) mx -= 1;
    if (held(m.right) || (solo && held(SOLO_EXTRA.right))) mx += 1;
    if (held(m.up) || (solo && held(SOLO_EXTRA.up))) my += 1;
    if (held(m.down) || (solo && held(SOLO_EXTRA.down))) my -= 1;
    const a3 = held(m.a3);
    const o = { mx: mx, my: my, sprint: held(m.sprint), a1: held(m.a1), a2: held(m.a2), a3: a3, dribble: a3, post: onOffense && held(m.post), dx: 0, dy: 0 };
    const gp = lock.on ? null : pads()[slot];
    if (gp) {
      const ax = gp.axes[0] || 0, ay = gp.axes[1] || 0;
      if (Math.hypot(ax, ay) > 0.22) { o.mx = ax; o.my = -ay; }
      const B = (i) => !!(gp.buttons[i] && (gp.buttons[i].pressed || ((i === 6 || i === 7) && gp.buttons[i].value > 0.3)));
      if (B(14)) o.mx = -1; if (B(15)) o.mx = 1; if (B(12)) o.my = 1; if (B(13)) o.my = -1;
      if (B(7) || B(5)) o.sprint = true;
      if (onOffense) { if (B(2)) o.a1 = true; if (B(3)) o.a2 = true; if (B(0) || B(1)) o.a3 = o.dribble = true; if (B(6) || B(4)) o.post = true; }
      else { if (B(3)) o.a1 = true; if (B(2)) o.a2 = true; if (B(6) || B(4) || B(0)) o.a3 = true; }
      const rx = gp.axes[2] || 0, ry = gp.axes[3] || 0;
      if (onOffense && Math.hypot(rx, ry) > 0.6) { o.a3 = true; o.dx = rx; o.dy = -ry; }
    }
    if (slot === 0 && touch.on) {
      if (Math.hypot(touch.mx, touch.my) > 0.2) { o.mx = touch.mx; o.my = touch.my; }
      o.a1 = o.a1 || touch.a1; o.a2 = o.a2 || touch.a2; o.a3 = o.a3 || touch.a3; o.sprint = o.sprint || touch.sprint;
      if (onOffense) { o.dribble = o.dribble || touch.a3; o.post = o.post || touch.alt; }
    }
    const l = Math.hypot(o.mx, o.my); if (l > 1) { o.mx /= l; o.my /= l; }
    return o;
  }
  // V3.9 5V5：原始按键（Xbox 默认布局，完全对照 2K）。键盘镜像：WASD=左摇杆 方向键=右摇杆 J/空格=X K=A L=B I=Y Q=LT E=RB R=LB 左Shift=RT
  const K5 = { X: ['KeyJ', 'Space'], A: ['KeyK'], B: ['KeyL'], Y: ['KeyI'], LT: ['KeyQ'], RB: ['KeyE'], LB: ['KeyR'], RT: ['ShiftLeft'] };
  function read5() {
    const o = { lx: 0, ly: 0, rx: 0, ry: 0, A: false, B: false, X: false, Y: false, LB: false, RB: false, LT: false, RT: false, hesi: held(['KeyH']), menu: false, view: false, dU: false, dD: false, dL: false, dR: false, pad: false };
    if (held(['KeyA'])) o.lx -= 1; if (held(['KeyD'])) o.lx += 1; if (held(['KeyW'])) o.ly += 1; if (held(['KeyS'])) o.ly -= 1;
    if (held(['ArrowLeft'])) o.rx -= 1; if (held(['ArrowRight'])) o.rx += 1; if (held(['ArrowUp'])) o.ry += 1; if (held(['ArrowDown'])) o.ry -= 1;
    for (const k in K5) if (held(K5[k])) o[k] = true;
    const gp = lock.on ? null : pads()[0];
    if (gp) {
      o.pad = true;
      const B = (i) => !!(gp.buttons[i] && (gp.buttons[i].pressed || ((i === 6 || i === 7) && gp.buttons[i].value > 0.3)));
      const ax = gp.axes[0] || 0, ay = gp.axes[1] || 0, rx = gp.axes[2] || 0, ry = gp.axes[3] || 0;
      if (Math.hypot(ax, ay) > 0.2) { o.lx = ax; o.ly = -ay; }
      if (Math.hypot(rx, ry) > 0.35) { o.rx = rx; o.ry = -ry; }
      const N = ['A', 'B', 'X', 'Y', 'LB', 'RB', 'LT', 'RT', 'view', 'menu'];
      for (let i = 0; i < N.length; i++) if (B(i)) o[N[i]] = true;
      o.hesi = o.hesi || B(11);
      o.dU = B(12); o.dD = B(13); o.dL = B(14); o.dR = B(15);
    }
    if (touch.on) {
      if (Math.hypot(touch.mx, touch.my) > 0.2) { o.lx = touch.mx; o.ly = touch.my; }
      if (touch.a1) o.X = true; if (touch.a2) o.A = true; if (touch.a3) o.LT = true; if (touch.sprint) o.RT = true;
      o.hesi = o.hesi || touch.alt;
    }
    const l = Math.hypot(o.lx, o.ly); if (l > 1) { o.lx /= l; o.ly /= l; }
    return o;
  }

  function read3(onOffense) {
    const input = read(0, onOffense, true), gp = lock.on ? null : pads()[0];
    input.pass = held(['KeyE']) || !!(gp && gp.buttons[1] && gp.buttons[1].pressed) || !!touch.pass;
    if (gp && gp.buttons[1] && gp.buttons[1].pressed && !(gp.buttons[0] && gp.buttons[0].pressed) && !held(MAPS[0].a3) && !touch.a3 && Math.hypot(input.dx, input.dy) <= 0.6) input.a3 = input.dribble = false;
    return input;
  }
  // 每帧轮询手柄的菜单按键（上下左右 / A / B / Menu）
  const navPrev = {}, navRep = {}, REPEAT = { PadUp: 1, PadDown: 1, PadLeft: 1, PadRight: 1 };
  function pollPads() {
    const cur = {}, nextButtons = {}, now = performance.now();
    let pressed = false;
    for (const gp of pads()) {
      const prev = padPrev[gp.index] || [], buttons = nextButtons[gp.index] = gp.buttons.map((b) => b.pressed);
      if (buttons.some((b, i) => b && !prev[i])) pressed = true;
      const B = (i) => buttons[i], ax = gp.axes[0] || 0, ay = gp.axes[1] || 0, rx = gp.axes[2] || 0;
      if (B(12) || ay < -0.6) cur.PadUp = true; if (B(13) || ay > 0.6) cur.PadDown = true; if (B(14) || ax < -0.6) cur.PadLeft = true; if (B(15) || ax > 0.6) cur.PadRight = true;
      if (B(0)) cur.PadA = true; if (B(1)) cur.PadB = true; if (B(9)) cur.PadStart = true; if (B(8)) cur.PadBack = true;
      if (B(2)) cur.PadX = true; if (B(3)) cur.PadY = true; if (B(4)) cur.PadLB = true; if (B(5)) cur.PadRB = true;
      if (rx < -0.6) cur.PadRLeft = true; if (rx > 0.6) cur.PadRRight = true;
    }
    for (const k of ['PadUp', 'PadDown', 'PadLeft', 'PadRight', 'PadA', 'PadB', 'PadStart', 'PadBack', 'PadX', 'PadY', 'PadLB', 'PadRB', 'PadRLeft', 'PadRRight']) {
      if (cur[k] && !navPrev[k]) { sys[k] = true; navRep[k] = now + 380; }
      else if (cur[k] && REPEAT[k] && now >= navRep[k]) { sys[k] = true; navRep[k] = now + 85; }
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
  function sysPressed(code) { if (sys[code]) { delete sys[code]; return true; } return false; }
  function sysAny() { const n = Object.keys(sys).length > 0; return n; }
  function clearSys() { for (const k in sys) delete sys[k]; }

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

  PH.input = { read: read, read3: read3, read5: read5, endTick: endTick, sysPressed: sysPressed, sysAny: sysAny, clearSys: clearSys, initTouch: initTouch, pollPads: pollPads, rstick: rstick, lock: lock, pads: pads, keys: keys, touch: touch };
})();
