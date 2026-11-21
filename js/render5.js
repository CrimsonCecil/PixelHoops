// PIXEL HOOPS - 5V5 全场渲染：2K 转播式侧面镜头、全场地板、两端篮架
(function () {
  const PH = (window.PH = window.PH || {});
  const CL = 14, CW = 7.5, HX = 12.425, HZ = 3.05, BX = 12.8;
  const FONT = "12px 'Fusion Pixel 12px Proportional SC', monospace";
  let R, ctx, W, H, cam, fcv, fctx, fimg, fbuf, back = null, backKey = '', paintKey = '', PAL = null;
  const rowY = new Float32Array(400), rowS = new Float32Array(400);
  const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  // 镜头：机位在近端边线外，看向场地中心
  const CAM5 = { y: -19, z: 9, F: 440, ly: 1.0, lz: 0, oy: 14 };

  function hexRgb(h) { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  function pk(h, k) { const c = hexRgb(h); k = k || 1; return ((255 << 24) | ((Math.min(255, c[2] * k) | 0) << 16) | ((Math.min(255, c[1] * k) | 0) << 8) | (Math.min(255, c[0] * k) | 0)) >>> 0; }
  function hash(n) { n = (n ^ 61) ^ (n >>> 16); n = (n + (n << 3)) | 0; n ^= n >>> 4; n = Math.imul(n, 0x27d4eb2d); n ^= n >>> 15; return n >>> 0; }
  const LV = [1, 0.92, 0.83, 0.74];

  function init() {
    R = PH.render; ctx = R.getCtx(); W = R.W; H = R.H; cam = R.cam;
    // 画布尺寸会随窗口比例变化（main.js 的 R.resize：W 480~640，H 270~360），每帧重读，尺寸变了就重建离屏缓冲
    if (!fcv || fcv.width !== W || fcv.height !== H) { fcv = document.createElement('canvas'); fcv.width = W; fcv.height = H; fctx = fcv.getContext('2d'); fimg = fctx.createImageData(W, H); fbuf = new Uint32Array(fimg.data.buffer); }
  }
  function applyCam(x) {
    cam.x = x; cam.y = CAM5.y; cam.z = CAM5.z; cam.F = CAM5.F; cam.oy = CAM5.oy;
    const dy = CAM5.ly - CAM5.y, dz = CAM5.lz - CAM5.z, L = Math.hypot(dy, dz);
    cam.fy = dy / L; cam.fz = dz / L; cam.uy = -cam.fz; cam.uz = cam.fy;
  }
  function halfW() { const d0 = (0 - cam.y) * cam.fy + (0 - cam.z) * cam.fz; return (W / 2) * d0 / cam.F; }
  let camX = 0;
  function reset() { RPL.reset(); init(); if (!saved) saved = { cv: Object.assign({}, R.CAMV), oy: cam.oy }; camX = 0; applyCam(0); }

  function palette(T) {
    const key = T.tm[0].ab;
    if (paintKey === key && PAL) return PAL;
    paintKey = key;
    const N = PH.RX.teams[key], pc = N.jersey;
    const mk = (cols) => LV.map((k) => cols.map((c) => pk(c, k)));
    PAL = {
      wood: mk(['#e0a45c', '#d89a52', '#dca058', '#d09248', '#e4aa64']),
      woodI: mk(['#e8b06a', '#e0a860', '#e4ac66', '#d89e56', '#ecb672']),
      paint: LV.map((k) => pk(pc, k * 0.95)), paint2: LV.map((k) => pk(pc, k * 0.82)),
      line: LV.map((k) => pk('#f6efe0', k)), apr: [pk('#1a2342'), pk('#1e294c')], aprT: pk(N.trim, 0.55), dark: 0xff120d0a,
    };
    return PAL;
  }
  // 场内一个像素的颜色（转播镜头、2K 镜头共用）：wx 沿球场长边、wy 沿短边；lw / lwy 是两个方向上线条的半宽
  function courtPx(P, wx, wy, ax, ay, lw, lwy, sx, by) {
        const dl = Math.sqrt(wx * wx * 0.04 + wy * wy * 0.3);
        let lv = (dl * 0.18 + BAYER[(sx & 3) + by] / 16 - 0.2) | 0; if (lv < 0) lv = 0; else if (lv > 3) lv = 3;
        let line = false, col = 0;
        if (ay > CW - lwy || ax > CL - lw || ax < lw) line = true;
        else {
          const u = CL - ax, hu = u - (CL - HX);  // 离底线距离、离篮筐中心沿长边距离
          const dr = Math.sqrt(hu * hu + wy * wy), fr = dr > 0.01 ? ay / dr : 0, lr = lw + (lwy - lw) * fr;
          const in3 = hu > 1.415 ? dr < 6.75 : ay < 6.6;
          if (hu > 1.415 ? Math.abs(dr - 6.75) < lr : Math.abs(ay - 6.6) < lwy && u < 2.99 + lw) line = true;
          else if ((Math.abs(ay - 2.45) < lwy && u < 5.8) || (Math.abs(u - 5.8) < lw && ay < 2.45)) line = true;
          else if (hu > 0 && Math.abs(dr - 1.25) < lr) line = true;
          else {
            const fu = u - 5.8, d2 = Math.sqrt(fu * fu + wy * wy), lr2 = lw + (lwy - lw) * (d2 > 0.01 ? ay / d2 : 0);
            const d3 = Math.sqrt(wx * wx + wy * wy), lr3 = lw + (lwy - lw) * (d3 > 0.01 ? ay / d3 : 0);
            if (Math.abs(d2 - 1.8) < lr2 && fu > 0) line = true;
            else if (Math.abs(d3 - 1.8) < lr3) line = true;
            else if (ay < 2.45 && u < 5.8) col = ((Math.floor(wy / 0.3) & 1) ? P.paint : P.paint2)[lv];
            else if (d3 < 1.8) col = P.paint2[lv];
            else {
              const pl = Math.floor(wy / 0.3), seg = Math.floor((wx + (pl & 3) * 0.9) / 3.2);
              col = (in3 ? P.woodI : P.wood)[lv][hash(pl * 31 + seg + 999) % 5];
            }
          }
        }
        return line ? P.line[lv] : col;
  }
  function drawFloor(T) {
    const P = palette(T);
    fbuf.fill(0);
    const cy = H / 2 + cam.oy, dz = -cam.z;
    for (let sy = 0; sy <= H; sy++) {
      const t = (cy - (sy + 0.5)) / cam.F, den = t * cam.fy - cam.uy, dy = (dz * (cam.uz - t * cam.fz)) / den;
      if (!(dy > 0) || dy > 80) { rowY[sy] = 1e9; rowS[sy] = 0; continue; }
      rowY[sy] = cam.y + dy; rowS[sy] = cam.F / (dy * cam.fy + dz * cam.fz);
    }
    let first = H;
    for (let sy = 0; sy < H; sy++) {
      const wy = rowY[sy]; if (wy > CW + 3.2) continue;
      if (sy < first) first = sy;
      const inv = 1 / rowS[sy], lw = Math.max(0.045, 0.55 * inv);
      const prev = sy > 0 && rowY[sy - 1] < 1e8 ? rowY[sy - 1] : wy + inv * 3, lwy = Math.max(0.045, 0.55 * Math.abs(prev - wy));
      let wx = cam.x + (0.5 - W / 2) * inv;
      const row = sy * W, by = (sy & 3) * 4, ay = wy < 0 ? -wy : wy;
      const yIn = ay < CW + lwy;
      for (let sx = 0; sx < W; sx++, wx += inv) {
        const ax = wx < 0 ? -wx : wx;
        if (!yIn || ax > CL + lw) {
          let c = ax > CL + 3.6 ? P.dark : P.apr[(Math.floor(wx / 1.5) + Math.floor(wy / 1.5)) & 1];
          if (ay > CW + 0.6 && ay < CW + 0.8 && ax < CL) c = P.aprT;
          fbuf[row + sx] = c; continue;
        }
        fbuf[row + sx] = courtPx(P, wx, wy, ax, ay, lw, lwy, sx, by);
      }
    }
    fctx.putImageData(fimg, 0, 0);
    return first;
  }

  function buildBack(T) {
    const key = T.tm[0].ab + T.tm[1].ab;
    if (back && backKey === key) return back;
    backKey = key;
    const BW = 1200, BH = 150;
    back = document.createElement('canvas'); back.width = BW; back.height = BH;
    const b = back.getContext('2d');
    b.fillStyle = '#070a16'; b.fillRect(0, 0, BW, BH);
    let seed = 11; const rn = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    const c0 = PH.RX.teams[T.tm[0].ab], c1 = PH.RX.teams[T.tm[1].ab];
    const shirts = [c0.jersey, c0.jersey, c0.trim, '#e8e4d8', '#3a3f58', '#3a3f58', c1.jersey, '#c94f4f', '#4f7bc9', '#d9b44a'];
    const skins = ['#e9b384', '#c98d62', '#8d5a3b', '#f0c8a0', '#6b4530'];
    // 顶棚灯
    b.fillStyle = '#10152a'; b.fillRect(0, 0, BW, 20);
    for (let x = 20; x < BW; x += 96) { b.fillStyle = '#2a3460'; b.fillRect(x, 5, 40, 9); b.fillStyle = '#fff6c8'; for (let i = 0; i < 3; i++) b.fillRect(x + 3 + i * 12, 7, 9, 5); }
    for (let r = 0; r < 8; r++) {
      const y = 26 + r * 11, k = 0.42 + r * 0.07;
      b.fillStyle = PH.shade('#151b33', 0.7 + r * 0.06); b.fillRect(0, y + 5, BW, 11);
      for (let x = (r & 1) * 4 - 2; x < BW; x += 8) {
        if (rn() < 0.1) continue;
        b.fillStyle = PH.shade(shirts[(rn() * shirts.length) | 0], k); b.fillRect(x, y + 5, 6, 6);
        b.fillStyle = PH.shade(skins[(rn() * skins.length) | 0], k); b.fillRect(x + 1, y, 4, 5);
      }
    }
    // 记分台 / LED
    b.fillStyle = '#0a0d1c'; b.fillRect(0, 118, BW, 32);
    b.fillStyle = '#12183a'; b.fillRect(0, 122, BW, 20);
    b.fillStyle = '#2b3a80'; b.fillRect(0, 121, BW, 1); b.fillRect(0, 142, BW, 1);
    b.font = FONT; b.textBaseline = 'top';
    const words = ['PIXEL HOOPS', '5V5', c0.city + c0.name, 'FULL COURT', c1.city + c1.name, '像素篮球'];
    const cols = ['#ffd24a', '#5ee0ff', c0.trim, '#7dff8a', c1.trim, '#ff6b6b'];
    let x = 10, i = 0;
    while (x < BW) { b.fillStyle = cols[i % cols.length]; const w = words[i % words.length]; b.fillText(w, x, 126); x += Math.ceil(b.measureText(w).width) + 30; i++; }
    return back;
  }

  // ---------- 篮架 ----------
  function quad(pts, fill, stroke) {
    ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(Math.round(p.x), Math.round(p.y)) : ctx.moveTo(Math.round(p.x), Math.round(p.y)))); ctx.closePath();
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1; ctx.stroke(); }
  }
  function box(x0, x1, y0, y1, z0, z1, top, side, front) {
    const P = PJ || R.proj;
    if (K2) {   // 2K 镜头：五个面按屏幕上的朝向剔除（顶面一定朝镜头，用它定正负号）
      const ar = (q) => { let a = 0; for (let i = 0; i < q.length; i++) { const A = q[i], B = q[(i + 1) % q.length]; a += A.x * B.y - B.x * A.y; } return a; };
      const tq = [P(x0, y0, z1), P(x1, y0, z1), P(x1, y1, z1), P(x0, y1, z1)], sg = Math.sign(ar(tq)) || 1;
      const F = [[P(x0, y0, z0), P(x0, y1, z0), P(x0, y1, z1), P(x0, y0, z1)], [P(x1, y0, z0), P(x1, y0, z1), P(x1, y1, z1), P(x1, y1, z0)],
        [P(x0, y0, z0), P(x0, y0, z1), P(x1, y0, z1), P(x1, y0, z0)], [P(x0, y1, z0), P(x1, y1, z0), P(x1, y1, z1), P(x0, y1, z1)]];
      const cols = [side, side, front, front];
      for (let i = 0; i < 4; i++) if (Math.sign(ar(F[i])) === sg) quad(F[i], cols[i]);
      quad(tq, top); return;
    }
    // 侧面镜头只看得到顶面、正面和朝向镜头一侧
    quad([P(x0, y0, z1), P(x1, y0, z1), P(x1, y1, z1), P(x0, y1, z1)], top);
    const sx = cam.x < (x0 + x1) / 2 ? x0 : x1;
    quad([P(sx, y0, z0), P(sx, y1, z0), P(sx, y1, z1), P(sx, y0, z1)], side);
    quad([P(x0, y0, z0), P(x1, y0, z0), P(x1, y0, z1), P(x0, y0, z1)], front);
  }
  function drawStanchion(s) {
    const P = PJ || R.proj, br = R.brush;
    const bx0 = s * (CL + 1.0), bx1 = s * (CL + 2.1), cw = (w) => Math.min(40, w);
    box(Math.min(bx0, bx1), Math.max(bx0, bx1), -0.55, 0.55, 0, 1.0, '#2c3a7a', '#1b2558', '#22306a');
    const a = P(s * (CL + 1.5), 0, 1.0), b = P(s * (CL + 1.5), 0, 3.55), c = P(s * (BX + 0.12), 0, 3.4);
    br(ctx, a.x, a.y, b.x, b.y, cw(Math.max(2, 0.18 * a.s)), '#15101f', '#3b4a8c');
    br(ctx, b.x, b.y, c.x, c.y, cw(Math.max(2, 0.12 * b.s)), '#15101f', '#3b4a8c');
    const d = P(s * (CL + 1.5), 0, 2.4); br(ctx, d.x, d.y, c.x, c.y, cw(Math.max(1, 0.06 * d.s)), '#15101f', '#2b3a70');
  }
  function drawBoard(s) {
    const P = PJ || R.proj;
    const x = s * BX, pts = [P(x, -0.915, 2.9), P(x, 0.915, 2.9), P(x, 0.915, 3.97), P(x, -0.915, 3.97)];
    ctx.globalAlpha = 0.7; quad(pts, '#cfe3f2'); ctx.globalAlpha = 1; quad(pts, null, '#f6f6f6');
    const ip = [P(x, -0.3, 3.0), P(x, 0.3, 3.0), P(x, 0.3, 3.45), P(x, -0.3, 3.45)]; quad(ip, null, '#e24a3a');
    // 侧面边框（镜头偏离时能看到厚度）
    const e0 = P(x, -0.915, 2.9), e1 = P(x, -0.915, 3.97); R.brush(ctx, e0.x, e0.y, e1.x, e1.y, 2, '#e8e8e8', '#ffffff');
  }
  function drawRim(s, half) {
    const P = PJ || R.proj, cx = s * HX, n = 16, pts = [];
    for (let i = 0; i <= n; i++) { const a = (i / n) * Math.PI * 2; pts.push({ a: a, f: Math.cos(a) * HV[0] + Math.sin(a) * HV[1], p: P(cx + Math.cos(a) * 0.23, Math.sin(a) * 0.23, HZ), q: P(cx + Math.cos(a) * 0.13, Math.sin(a) * 0.13, HZ - 0.42) }); }
    if (half === 'back') {
      ctx.fillStyle = '#f4f0e6';
      for (let i = 0; i < n; i += 2) { const A = pts[i]; if (A.f < 0) continue; R.brush(ctx, A.p.x, A.p.y, A.q.x, A.q.y, 1, 'rgba(244,240,230,0.85)'); }
      for (let i = 0; i < n; i++) { const A = pts[i], B = pts[i + 1]; if (A.f >= 0) R.brush(ctx, A.p.x, A.p.y, B.p.x, B.p.y, 2, '#a83a12', '#e8622a'); }
      const k = P(s * BX, 0, HZ), r0 = P(cx + s * 0.23, 0, HZ); R.brush(ctx, k.x, k.y, r0.x, r0.y, 2, '#a83a12', '#e8622a');
    } else {
      for (let i = 0; i < n; i += 2) { const A = pts[i]; if (A.f >= 0) continue; R.brush(ctx, A.p.x, A.p.y, A.q.x, A.q.y, 1, 'rgba(244,240,230,0.9)'); }
      for (let i = 0; i < n; i++) { const A = pts[i], B = pts[i + 1]; if (A.f < 0) R.brush(ctx, A.p.x, A.p.y, B.p.x, B.p.y, 2, '#a83a12', '#ff7a36'); }
    }
  }

  // ---------- 文字 ----------
  function text(t, x, y, col, align) {
    ctx.font = FONT; ctx.textBaseline = 'top';
    const w = Math.ceil(ctx.measureText(t).width), x0 = Math.round(align === 'c' ? x - w / 2 : align === 'r' ? x - w : x);
    ctx.fillStyle = '#15101f';
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [1, 1]]) ctx.fillText(t, x0 + dx, Math.round(y) + dy);
    ctx.fillStyle = col; ctx.fillText(t, x0, Math.round(y));
    return w;
  }

  // ---------- 主渲染（V3.9：画面里的人和球都是 1V1 引擎的对象，只做坐标换算） ----------
  const PI2 = Math.PI / 2;
  const GLYPH = { A: '#3cb04a', B: '#e0403a', X: '#3a7be0', Y: '#e8c030', LT: '#8a8a96' };
  const KEYL = { A: 'K', B: 'L', X: 'J', Y: 'I', LT: 'Q' };
  let saved = null, last2k = '';
  // V3.9e 篮架等场馆物件用世界坐标画：转播镜头 PJ = R.proj；2K 镜头先把世界坐标转到镜头坐标再投影。HV = 镜头前方（世界坐标），用来分篮筐前后半圈
  let PJ = null, HV = [0, 1], K2 = false;
  function G5() { return PH.game.G; }
  function dOf(T) { return RPL.on && RPL.view ? RPL.view.dir : T.dir[G5().off]; }
  // 逻辑坐标 → 世界坐标的代理对象（转播镜头用）
  function poseInView(p, xy) {
    if (!p.pose || !p.pose.passHands) return p.pose;
    const Q = p.pose.passHands, hands = Object.assign({}, Q);
    for (const side of ['L', 'R']) hands[side] = [...xy(Q[side][0], Q[side][1]), Q[side][2]];
    return Object.assign({}, p.pose, { passHands: hands });
  }
  function wp(p, d) {
    const q = Object.create(p); q.x = d * p.y; q.y = -d * p.x; q.vx = d * (p.vy || 0); q.vy = -d * (p.vx || 0); q.face = p.face - d * PI2;
    q.pose = poseInView(p, (x, y) => [d * y, -d * x]);
    if (p.stealFoot) { const f = p.stealFoot; q.stealFoot = Object.assign({}, f, { pos: [d * f.pos[1], -d * f.pos[0], f.pos[2]] }); }
    if (p.grip && p.grip.rim) { q.gripRimX = d * HX; q.gripRimY = 0; }
    if (p.ghosts) q.ghosts = p.ghosts.map((g) => Object.assign({}, g, { x: d * g.y, y: -d * g.x, face: g.face - d * PI2 }));
    return q;
  }
  function camBroadcast(T, dt, d) {
    const z = T.cam.zoom, h = T.cam.height;
    CAM5.y = -(24 - z); CAM5.z = 4 + h; CAM5.F = 440;
    const b = G5().ball, Gp = G5().players, hd = b.state === 'held' ? Gp[b.holder] : null;
    // 跟球：持球人往进攻方向前看一点；投篮时兼顾篮筐
    let tx = d * b.y;
    if (hd) tx = d * (hd.y + 2.2 + (hd.vy || 0) * 0.45);
    else if (b.state === 'shot') tx = d * (b.y * 0.6 + 12.425 * 0.4);
    const hw = halfW(), lim = Math.max(0, CL + 3.4 - hw);
    const rc = RPL.on && RPL.view ? RPL.cam : null; if (rc) tx = rc.x;   // V4.4 回放：对准接触点
    tx = Math.max(-lim, Math.min(lim, tx));
    camX += (tx - camX) * Math.min(1, (dt || 1 / 60) * 2.4); if (!(dt > 0) || (RPL.on && RPL.returnT != null)) camX = tx;
    applyCam(camX); if (rc) cam.F *= 1 + 0.3 * rc.w;
    if (RPL.on) R.replayCamera(RPL, cam, 'broadcast');
    T.camX = cam.x;
  }
  function render(T, dt) {
    init();
    if (!saved) saved = { cv: Object.assign({}, R.CAMV), oy: cam.oy };
    RPL.rT = G5().time; const sw = RPL.on && RPL.view ? RPL.swap() : null;
    try { if (T.cam.preset === '2k') render2k(T, dt); else renderBroadcast(T, dt); } finally { if (sw) sw(); }
    if (sw) RPL.hud(); else overlays(T);
  }
  function renderBroadcast(T, dt) {
    const Gm = G5(), d = dOf(T), b = Gm.ball;
    camBroadcast(T, dt, d);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#070a16'; ctx.fillRect(0, 0, W, H);
    const F = Gm.fx;
    if (F.shake > 0.3) { const hsh = hash((Gm.time * 60) | 0); ctx.setTransform(1, 0, 0, 1, Math.round(((hsh & 255) / 255 - 0.5) * F.shake), Math.round((((hsh >>> 8) & 255) / 255 - 0.5) * F.shake)); }
    const first = drawFloor(T);
    const bk = buildBack(T), bxo = Math.round(-((cam.x + 20) * 18) % (bk.width - W));
    ctx.drawImage(bk, bxo < 0 ? bxo : -bxo, first - bk.height + 2);
    ctx.drawImage(fcv, 0, 0);
    const P = Gm.players.map((p) => wp(p, d)), wb = Object.assign({}, b, { x: d * b.y, y: -d * b.x });
    T.view = { P: P, d: d };
    const ents = [];
    for (const p of P) ents.push({ y: p.y, k: 'p', o: p });
    ents.push({ y: wb.y - 0.01, k: 'b' });
    for (const s of [1, -1]) { ents.push({ y: 0.6, k: 'stan', s: s }); ents.push({ y: 0.25, k: 'rimB', s: s }); ents.push({ y: -0.25, k: 'rimF', s: s }); }
    ents.sort((a, c) => c.y - a.y);
    for (const e of ents) if (e.k === 'p') R.shadow(e.o.x, e.o.y, e.o.z, 0.42 * (e.o.col.bw || 1));
    R.shadow(wb.x, wb.y, wb.z, 0.17);
    // 控制圈（脚下）
    for (const p of P) if (p.ring) footRing(p);
    { const f = foeOf(T), q = f && P[f.id]; if (q && !q.ring) footRing(q); }   // V3.9s 敌方当前球员光标
    for (const e of ents) {
      if (e.k === 'p') { const r = R.drawPlayer(e.o, { flash: e.o.flash > 0, trail: RPL.on ? null : { time: G5().time, scene: G5().players, view: 'broadcast' } }); e.o.__head = r && r.head; }
      else if (e.k === 'b') { if (b.state !== 'held' || true) R.drawBall(wb); }
      else if (e.k === 'stan') { drawStanchion(e.s); drawBoard(e.s); }
      else if (e.k === 'rimB') drawRim(e.s, 'back');
      else drawRim(e.s, 'front');
    }
    for (const q of F.parts) { const pp = R.proj(d * q.y, -d * q.x, q.z); if (pp.d < 1) continue; const sz = R.particleSize(q, pp.s), offset = q.interceptTeam != null ? sz / 2 : 0; ctx.fillStyle = q.col; ctx.fillRect(Math.round(pp.x - offset), Math.round(pp.y - offset), sz, sz); }
    if (F.rings) for (const r of F.rings) {
      if (r.t < 0) continue; const u = r.t / r.T, c = R.proj(d * r.y, -d * r.x, r.z); if (c.d < 1) continue;
      const rad = (0.25 + r.R * (1 - (1 - u) * (1 - u))) * c.s * 0.5, n = Math.max(16, Math.round(rad * 0.9)); ctx.fillStyle = r.col;
      for (let i = 0; i < n; i++) { const an = i / n * Math.PI * 2; ctx.fillRect(Math.round(c.x + Math.cos(an) * rad), Math.round(c.y + Math.sin(an) * rad * 0.62), 1, 1); }
    }
    for (const p of P) if (p.__head) { R.drawMeter(p, p.__head); }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (R.drawScreenFx) R.drawScreenFx(Gm, { heads: P.map((p) => p.__head), ball: R.proj(wb.x, wb.y, wb.z) });
    if (F.flash > 0) { ctx.globalAlpha = Math.min(0.5, F.flash * 3.2); ctx.fillStyle = F.flashCol; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1; }
  }
  // ---------- V3.9e 2K 镜头 ----------
  // 机位在进攻方向后上方，沿球场长轴看向进攻篮筐，左右对称；全场按世界坐标画（不再借用 1V1 的半场渲染器）。
  // 镜头坐标：u = 屏幕右、v = 镜头前方。世界 (X 长边, Y 短边) → u = X·sinφ − Y·cosφ，v = X·cosφ + Y·sinφ；φ 由 team5 的 camTurn 给出
  // V3.9f 2K 镜头按 2K27 实机视频拟合（qa/v39f_fit.js 量屏幕占比）：焦距 F = 439、主点偏移 oy = 16.9 固定，
  // 机位 = 地面焦点 − back·朝向，高 cz，俯角 = atan(cz / back)（约 22–26 度，比 V3.9e 的 34 度平、近）。
  // 焦点和机位随“球在进攻方向上的纵坐标 yb”连续插值：底线发球 → 后场推进（拉远拉高）→ 半场阵地（推近压低），中间没有硬切。
  const K2F = 439, K2OY = 16.9;
  const K2TAB = [   // [yb, 焦点纵坐标, back, cz]
    [-14.55, -8.6, 17.62, 7.3],    // 底线发球：近端底线在画面 80%，远端篮筐 9%
    [-4.5, -1.78, 16.98, 7.07],    // 后场推进：远端篮筐 13%、远端底线 26%、中线 49%、持球人 68%
    [5, 11.43, 16.03, 7.71],       // 半场阵地（持球人到弧顶以内）：篮筐 26%、底线 48%、罚球线 70%、弧顶 89%
  ];
  function k2At(yb) {
    const t = K2TAB; if (yb <= t[0][0]) return { fy: t[0][1], back: t[0][2], cz: t[0][3] };
    for (let i = 1; i < t.length; i++) if (yb <= t[i][0]) { const a = t[i - 1], b = t[i], u = (yb - a[0]) / (b[0] - a[0]); return { fy: a[1] + (b[1] - a[1]) * u, back: a[2] + (b[2] - a[2]) * u, cz: a[3] + (b[3] - a[3]) * u }; }
    const l = t[t.length - 1]; return { fy: l[1], back: l[2], cz: l[3] };
  }
  // 滑条：远近 5 / 高度 10 = 实机取景；远近每档 ±7% 距离，高度每档 ±0.35 米（俯角跟着变，焦点不变）
  function k2Slide(T, k) { const z = T.cam.zoom, h = T.cam.height; return { back: k.back * (1 + (5 - z) * 0.07), cz: Math.max(1.6, k.cz + (h - 10) * 0.35) }; }
  // 跳球机位：贴地的场边低机位（世界坐标，离中圈 10.2 米、高 1 米、微微仰拍），侧面看中圈
  const TIPCAM = { X: 0, Y: -10.2, Z: 1.0, phi: PI2, a: -Math.atan2(2.5 - 1.0, 10.2), F: K2F, oy: 0 };
  const TIP_HOLD = 0.45, TIP_BLEND = 0.75;
  const C2 = { X: 0, Y: 0, back: 16, cz: 7.7, init: false, dphi: 0 };
  // 机位（镜头坐标）→ 屏幕；不改 R.cam，给发球取景检查用
  function pv(P, u, v, z) {
    const ca = Math.cos(P.a), sa = Math.sin(P.a), dy = v - P.cv, dz = z - P.cz, zc = dy * ca - dz * sa, yc = dy * sa + dz * ca, s = P.F / Math.max(0.5, zc);
    return { x: W / 2 + (u - P.cu) * s, y: H / 2 + P.oy - yc * s, s: s, d: zc };
  }
  function applyPose(P) {
    cam.x = P.cu; cam.y = P.cv; cam.z = P.cz; cam.F = P.F; cam.oy = P.oy;
    cam.fy = Math.cos(P.a); cam.fz = -Math.sin(P.a); cam.uy = Math.sin(P.a); cam.uz = Math.cos(P.a);
  }
  // 发球阶段必须完整看到的点（逻辑坐标）：发球人脚、头、左右肩，和球
  function inbPts(T, Gm) {
    const out = [], b = Gm.ball;
    let by = null, x, y;
    if (T.phase === 'inb' && T.inb) { by = T.inb.by; x = by.x; y = by.y; }
    else if (T.phase === 'dead' && T.next) { by = T.next.by; x = T.next.x; y = T.next.y; }
    if (!by) return out;
    const h = (by.h || 2) + 0.15;
    out.push([x, y, 0], [x, y, h], [x - 0.45, y, 1.4], [x + 0.45, y, 1.4]);
    if (T.phase === 'inb') out.push([b.x, b.y, b.z], [b.x, b.y, b.z + 0.25]);
    else out.push([x, y, 1.2]);
    return out;
  }
  // 安全区：四边留 4%，并避开底部比分条
  function unsafe(q) {
    const mx = W * 0.04, my = H * 0.04, sb = PH.render5.sbRect;
    if (q.d < 1) return 'b';
    if (q.x < mx) return 'l'; if (q.x > W - mx) return 'r'; if (q.y < my) return 't'; if (q.y > H - my) return 'b';
    if (sb && q.x > sb.x0 - 3 && q.x < sb.x1 + 3 && q.y > sb.y0 - 3) return 'b';
    // V3.9g 左右上角信息卡：发球人/球落进卡片时往前推（让它们往下走出卡片）
    const av = PH.render5.avoid; if (av) for (const r of av) if (r !== sb && r.y1 < H * 0.6 && q.x > r.x0 - 3 && q.x < r.x1 + 3 && q.y < r.y1 + 3) return 't';
    return '';
  }
  // 把必须看到的点都塞进安全区：左右平移焦点 / 往后拉（焦点后移 + 稍微拉远）。f = {u, v, back, cz}（镜头坐标）
  function fitInb(f, pts, toV) {
    for (let it = 0; it < 60; it++) {
      const P = { cu: f.u, cv: f.v - f.back, cz: f.cz, a: Math.atan2(f.cz, f.back), F: K2F, oy: K2OY + (C2.oyx || 0) };
      let du = 0, back = false, fwd = false;
      for (const p of pts) {
        const w = toV(p[0], p[1]), q = pv(P, w[0], w[1], p[2]), k = unsafe(q);
        if (k === 'l') du = Math.min(du, (q.x - W * 0.04 - 4) / q.s); else if (k === 'r') du = Math.max(du, (q.x - W * 0.96 + 4) / q.s);
        else if (k === 'b') back = true; else if (k === 't') fwd = true;
      }
      if (!du && !back && !fwd) return it;
      f.u += du;
      if (back) { f.v -= 0.25; f.back += 0.05; } else if (fwd) f.v += 0.25;
    }
    return 60;
  }
  function drawFloor2k(T, ph) {
    const P = palette(T), cs = Math.cos(ph), sn = Math.sin(ph), ac = Math.abs(cs), as = Math.abs(sn);
    fbuf.fill(0);
    const cy = H / 2 + cam.oy, dz = -cam.z;
    for (let sy = 0; sy <= H; sy++) {
      const t = (cy - (sy + 0.5)) / cam.F, den = t * cam.fy - cam.uy, dy = (dz * (cam.uz - t * cam.fz)) / den;
      if (!(dy > 0) || dy > 90) { rowY[sy] = 1e9; rowS[sy] = 0; continue; }
      rowY[sy] = cam.y + dy; rowS[sy] = cam.F / (dy * cam.fy + dz * cam.fz);
    }
    let first = H;
    const XL = CL + 3.6, YL = CW + 3.4;
    for (let sy = 0; sy < H; sy++) {
      const v = rowY[sy]; if (v > 1e8) continue;
      const inv = 1 / rowS[sy], dv = sy > 0 && rowY[sy - 1] < 1e8 ? rowY[sy - 1] - v : inv * 3;
      const lw = Math.max(0.045, 0.55 * (ac * dv + as * inv)), lwy = Math.max(0.045, 0.55 * (as * dv + ac * inv));
      const u0 = cam.x + (0.5 - W / 2) * inv;
      let wx = v * cs + u0 * sn, wy = v * sn - u0 * cs; const ix = inv * sn, iy = -inv * cs;
      const row = sy * W, by = (sy & 3) * 4;
      for (let sx = 0; sx < W; sx++, wx += ix, wy += iy) {
        const ax = wx < 0 ? -wx : wx, ay = wy < 0 ? -wy : wy;
        if (ax > XL || ay > YL) continue;   // 场馆外：透明，露出后面的看台
        if (sy < first) first = sy;
        if (ay > CW + lwy || ax > CL + lw) { let c = P.apr[(Math.floor(wx / 1.5) + Math.floor(wy / 1.5)) & 1]; if (ay > CW + 0.6 && ay < CW + 0.8 && ax < CL) c = P.aprT; fbuf[row + sx] = c; continue; }
        fbuf[row + sx] = courtPx(P, wx, wy, ax, ay, lw, lwy, sx, by);
      }
    }
    fctx.putImageData(fimg, 0, 0);
    return first;
  }
  let lastProj = null;
  function render2k(T, dt) {
    const Gm = G5(), d = dOf(T), b = Gm.ball;
    const ph0 = T.c2 ? T.c2.phi : (d === 1 ? 0 : Math.PI);
    // 跳球镜头：tip 阶段 + 拨球后 TIP_HOLD 秒保持，再用 TIP_BLEND 秒升起、转到 2K 机位
    const ta = T.phase === 'tip' ? -1 : (T.tipAt != null && T.tipAt > -1 ? T.time - T.tipAt : 99);
    const tipE = ta < 0 ? 0 : ta < TIP_HOLD ? 0 : ta < TIP_HOLD + TIP_BLEND ? (() => { const u = (ta - TIP_HOLD) / TIP_BLEND; return u * u * (3 - 2 * u); })() : 1;
    // 跳球 → 2K 的朝向插值：从 π/2 连续地转到 2K 的朝向（展开角度避免跳变）
    let dp = ph0 - PI2; dp = Math.atan2(Math.sin(dp), Math.cos(dp)); if (tipE < 1 && Math.abs(dp - C2.dphi) > Math.PI) dp += dp < C2.dphi ? Math.PI * 2 : -Math.PI * 2; C2.dphi = dp;
    const ph = tipE >= 1 ? ph0 : PI2 + dp * tipE, cs = Math.cos(ph), sn = Math.sin(ph);
    const c0 = Math.cos(ph0), s0 = Math.sin(ph0);
    // 逻辑坐标 (x, y) → 世界 (X = d·y, Y = −d·x) → 镜头 (u, v)
    const U = (x, y) => d * y * sn + d * x * cs, V = (x, y) => d * y * cs - d * x * sn;
    const U0 = (x, y) => d * y * s0 + d * x * c0, V0 = (x, y) => d * y * c0 - d * x * s0;
    const fa = PI2 - d * PI2 - ph;   // 朝向角：逻辑 → 镜头
    const wpk = (p) => {
      const q = Object.create(p); q.x = U(p.x, p.y); q.y = V(p.x, p.y); q.vx = U(p.vx || 0, p.vy || 0); q.vy = V(p.vx || 0, p.vy || 0); q.face = p.face + fa;
      q.pose = poseInView(p, (x, y) => [U(x, y), V(x, y)]);
      if (p.stealFoot) { const f = p.stealFoot; q.stealFoot = Object.assign({}, f, { pos: [U(f.pos[0], f.pos[1]), V(f.pos[0], f.pos[1]), f.pos[2]] }); }
      if (p.grip && p.grip.rim) { q.gripRimX = U(0, HX); q.gripRimY = V(0, HX); }
      if (p.ghosts) q.ghosts = p.ghosts.map((g) => Object.assign({}, g, { x: U(g.x, g.y), y: V(g.x, g.y), face: g.face + fa }));
      return q;
    };
    // ---- 2K 机位目标（逻辑坐标里算，再转世界坐标平滑）----
    const hd = b.state === 'held' ? Gm.players[b.holder] : null;
    let bx = hd ? hd.x : b.x, by = hd ? hd.y : b.y;
    if (T.phase === 'dead' && T.next) { bx = T.next.x; by = T.next.y; }
    if (b.state === 'shot') by = Math.max(by, 7);
    const K = k2At(by), S = k2Slide(T, K), fx = Math.max(-0.5, Math.min(0.5, bx * 0.06));
    // 世界焦点（逻辑 (fx, fy) → 世界 (d·fy, −d·fx)）
    let TX = d * K.fy, TY = -d * fx;
    // 攻防翻转途中焦点往球那边靠（转到一半时对着球），转完回到正常焦点
    const tw = T.c2 && T.c2.t >= 0 ? Math.sin(Math.PI * Math.min(1, T.c2.t / 0.5)) : 0;
    if (tw > 0) { TX += (d * by - TX) * tw; TY += (-d * bx - TY) * tw; }
    // 发球：把发球人和球放进画面（必要时左右平移 / 往后拉），发出后由平滑自然回正
    const ipts = inbPts(T, Gm), inbOn = ipts.length > 0 && tipE >= 1;
    let tB = S.back, tZ = S.cz;
    if (inbOn) {
      const f = { u: TX * s0 - TY * c0, v: TX * c0 + TY * s0, back: tB, cz: tZ };
      fitInb(f, ipts, (x, y) => [U0(x, y), V0(x, y)]);
      TX = f.v * c0 + f.u * s0; TY = f.v * s0 - f.u * c0; tB = f.back;
    }
    { const rc = RPL.on && RPL.view ? RPL.cam : null;   // V4.4 回放：焦点移到接触点，越近接触越推近
      if (rc) { TX = rc.x; TY = rc.y; tB = S.back * (1 - 0.3 * rc.w); tZ = Math.max(1.6, S.cz * (1 - 0.25 * rc.w)); } }
    const k = dt > 0 ? Math.min(1, dt * (T.phase === 'inb' || T.phase === 'dead' ? 4 : 3)) : 1;
    if (T.camSnap) { T.camSnap = false; C2.init = false; }
    if (!C2.init || !(dt > 0)) { C2.X = TX; C2.Y = TY; C2.back = tB; C2.cz = tZ; C2.init = true; }
    else { C2.X += (TX - C2.X) * k; C2.Y += (TY - C2.Y) * k; C2.back += (tB - C2.back) * k; C2.cz += (tZ - C2.cz) * k; }
    // 发球阶段逐帧硬约束：平滑没跟上时直接把实际机位推到能看全发球人和球的位置
    if (inbOn && T.phase === 'inb' && !(T.c2 && T.c2.t >= 0)) {
      const f = { u: C2.X * s0 - C2.Y * c0, v: C2.X * c0 + C2.Y * s0, back: C2.back, cz: C2.cz };
      if (fitInb(f, ipts, (x, y) => [U0(x, y), V0(x, y)])) { C2.X = f.v * c0 + f.u * s0; C2.Y = f.v * s0 - f.u * c0; C2.back = f.back; }
    }
    // ---- 机位：2K 机位（世界）与跳球机位混合 ----
    const a2 = Math.atan2(C2.cz, C2.back);
    let PX = C2.X - C2.back * c0, PY = C2.Y - C2.back * s0, PZ = C2.cz, pa = a2, pF = K2F, poy = K2OY;
    { const rc = RPL.on && RPL.view ? RPL.cam : null; if (rc) pF *= 1 + 0.6 * rc.w; }   // V4.4 回放推近：焦距拉长
    if (tipE < 1) {
      const e = tipE, tc = TIPCAM;
      PX = tc.X + (PX - tc.X) * e; PY = tc.Y + (PY - tc.Y) * e; PZ = tc.Z + (PZ - tc.Z) * e; pa = tc.a + (pa - tc.a) * e; poy = tc.oy + (poy - tc.oy) * e;
    }
    const pose = { cu: PX * sn - PY * cs, cv: PX * cs + PY * sn, cz: PZ, a: pa, F: pF, oy: poy };
    // V4.3 顶部比分条安全区：进攻篮筐的篮板顶边要落在 sbTop.y1 + 4px 以下，不够就整体下移主点 oy
    // （纯平移，不改机位和俯角；需要时立刻下移，不需要时平滑回正；sbTop 为 null 或跳球镜头时不动）
    { const st = PH.render5.sbTop; let need = 0;
      if (st && tipE >= 1) {
        const bt = [pv(pose, U(-0.915, BX), V(-0.915, BX), 3.97), pv(pose, U(0.915, BX), V(0.915, BX), 3.97)];
        if (bt[0].d > 1.2 && bt[1].d > 1.2 && Math.max(bt[0].x, bt[1].x) > st.x0 - 2 && Math.min(bt[0].x, bt[1].x) < st.x1 + 2)
          need = Math.max(0, Math.min(H * 0.16, st.y1 + 5 - Math.min(bt[0].y, bt[1].y)));
      }
      const ko = dt > 0 ? Math.min(1, dt * 2.5) : 1;
      C2.oyx = need >= (C2.oyx || 0) ? need : (C2.oyx || 0) + (need - (C2.oyx || 0)) * ko;
      pose.oy += C2.oyx * tipE; }
    if (RPL.on) R.replayCamera(RPL, pose, '2k');
    applyPose(pose); T.camX = pose.cu;
    lastProj = (x, y, z) => pv(pose, U(x, y), V(x, y), z || 0);   // QA 用：逻辑坐标 → 屏幕像素
    PH.render5.k2 = { tipE: tipE, tip: tipE < 1, pose: pose, ph: ph, inb: inbOn };
    // 世界坐标 → 屏幕（给篮架、看台用）
    PJ = (X, Y, z) => R.proj(X * sn - Y * cs, X * cs + Y * sn, z); HV = [cs, sn]; K2 = true;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#070a16'; ctx.fillRect(0, 0, W, H);
    const F = Gm.fx;
    if (F.shake > 0.3) { const hsh = hash((Gm.time * 60) | 0); ctx.setTransform(1, 0, 0, 1, Math.round(((hsh & 255) / 255 - 0.5) * F.shake), Math.round((((hsh >>> 8) & 255) / 255 - 0.5) * F.shake)); }
    const first = drawFloor2k(T, ph);
    // 看台：铺满地板最远一行以上的区域（俯角更平以后看台占画面上方近一半），底边一条深色挡墙
    const bk = buildBack(T), span = bk.width - W, bxo = Math.round(((((ph / (Math.PI * 2)) * span * 2 + pose.cu * 14) % span) + span) % span), CH = 116;
    for (let y0 = first - CH - 4, n = 0; y0 > -CH && n < 4; y0 -= CH - 22, n++) ctx.drawImage(bk, bxo, n ? 22 : 0, W, n ? CH - 22 : CH, 0, n ? y0 + 22 - 0 : y0, W, n ? CH - 22 : CH);
    // 越往上的看台越暗（远处和顶棚压暗），避免整屏都是同一亮度的观众
    { const yb = first - 4, yt = first - CH - 40, A = 'rgba(7,10,22,'; if (yb > 0) { const g = ctx.createLinearGradient(0, yb, 0, yt); g.addColorStop(0, A + '0.22)'); g.addColorStop(1, A + '0.86)'); ctx.fillStyle = g; ctx.fillRect(0, Math.max(0, yt), W, yb - Math.max(0, yt)); if (yt > 0) { ctx.fillStyle = A + '0.86)'; ctx.fillRect(0, 0, W, yt); } } }
    ctx.fillStyle = '#0a0d1c'; ctx.fillRect(0, first - 5, W, 7);
    ctx.drawImage(fcv, 0, 0);
    const P = Gm.players.map(wpk), wb = Object.assign({}, b, { x: U(b.x, b.y), y: V(b.x, b.y) });
    const near = (x, y, z) => R.proj(x, y, z).d > 1.2;   // 镜头背后 / 贴脸的东西不画
    T.view = { P: P, d: d, pr: (x, y, z) => R.proj(U(x, y), V(x, y), z) };
    const ents = [];
    for (const p of P) if (near(p.x, p.y, 1)) ents.push({ y: p.y, k: 'p', o: p });
    if (near(wb.x, wb.y, wb.z)) ents.push({ y: wb.y - 0.01, k: 'b' });
    const VW = (X, Y) => X * cs + Y * sn;
    // 近端篮架（镜头这一侧）画成半透明幻影放在最上层，另一端正常按远近排序
    const vA = VW(HX, 0), vB = VW(-HX, 0), ghost = Math.abs(vA - vB) > 6 ? (vA < vB ? 1 : -1) : 0;
    for (const s of [1, -1]) {
      if (s === ghost) continue;
      if (PJ(s * HX, 0, HZ).d < 1.5 || PJ(s * (CL + 1.5), 0, 1).d < 1.5) continue;
      ents.push({ y: VW(s * (CL + 1.5), 0), k: 'stan', s: s }); ents.push({ y: VW(s * BX, 0) + 0.001 * s * cs, k: 'board', s: s });
      const rv = VW(s * HX, 0); ents.push({ y: rv + 0.25, k: 'rimB', s: s }); ents.push({ y: rv - 0.25, k: 'rimF', s: s });
    }
    ents.sort((a, c) => c.y - a.y);
    for (const e of ents) if (e.k === 'p') R.shadow(e.o.x, e.o.y, e.o.z, 0.42 * (e.o.col.bw || 1));
    if (near(wb.x, wb.y, 0)) R.shadow(wb.x, wb.y, wb.z, 0.17);
    for (const p of P) if (p.ring && near(p.x, p.y, 0)) footRing(p);
    { const f = foeOf(T), q = f && P[f.id]; if (q && !q.ring && near(q.x, q.y, 0)) footRing(q); }   // V3.9s 敌方当前球员光标
    for (const p of P) p.__head = null;
    for (const e of ents) {
      if (e.k === 'p') { const r = R.drawPlayer(e.o, { flash: e.o.flash > 0, trail: RPL.on ? null : { time: G5().time, scene: G5().players, view: '2k' } }); e.o.__head = r && r.head; }
      else if (e.k === 'b') R.drawBall(wb);
      else if (e.k === 'stan') { drawStanchion(e.s); drawClock(e.s, T); }
      else if (e.k === 'board') drawBoard(e.s);
      else if (e.k === 'rimB') drawRim(e.s, 'back');
      else drawRim(e.s, 'front');
    }
    if (ghost) drawGhost(ghost, T, cs, sn);
    for (const q of F.parts) { const pp = R.proj(U(q.x, q.y), V(q.x, q.y), q.z); if (pp.d < 1.2) continue; const sz = R.particleSize(q, pp.s), offset = q.interceptTeam != null ? sz / 2 : 0; ctx.fillStyle = q.col; ctx.fillRect(Math.round(pp.x - offset), Math.round(pp.y - offset), sz, sz); }
    if (F.rings) for (const r of F.rings) {
      if (r.t < 0) continue; const u = r.t / r.T, c = R.proj(U(r.x, r.y), V(r.x, r.y), r.z); if (c.d < 1.2) continue;
      const rad = (0.25 + r.R * (1 - (1 - u) * (1 - u))) * c.s * 0.5, n = Math.max(16, Math.round(rad * 0.9)); ctx.fillStyle = r.col;
      for (let i = 0; i < n; i++) { const an = i / n * Math.PI * 2; ctx.fillRect(Math.round(c.x + Math.cos(an) * rad), Math.round(c.y + Math.sin(an) * rad * 0.62), 1, 1); }
    }
    for (const p of P) if (p.__head) R.drawMeter(p, p.__head);
    const cueView = { heads: P.map((p) => p.__head), ball: R.proj(wb.x, wb.y, wb.z) };
    PJ = null; HV = [0, 1]; K2 = false;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (R.drawScreenFx) R.drawScreenFx(Gm, cueView);
    if (F.flash > 0) { ctx.globalAlpha = Math.min(0.5, F.flash * 3.2); ctx.fillStyle = F.flashCol; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1; }
  }
  // 篮板上方的 24 秒计时器（2K / NBA 场馆都装在篮板顶上）
  function drawClock(s, T) {
    const P = PJ || R.proj, x = s * (BX + 0.05), q = [P(x, -0.34, 4.0), P(x, 0.34, 4.0), P(x, 0.34, 4.42), P(x, -0.34, 4.42)];
    if (q.some((p) => !isFinite(p.x))) return;
    quad(q, '#0b0b14', '#2a2a3a');
    const c = P(x, 0, 4.21), w = Math.abs(q[1].x - q[0].x);
    if (w >= 9) { ctx.font = FONT; ctx.textBaseline = 'middle'; ctx.fillStyle = '#ff3b2f'; const t = String(Math.max(0, Math.ceil(T.sclock || 24))); const tw = ctx.measureText(t).width; if (tw < w * 1.4) ctx.fillText(t, Math.round(c.x - tw / 2), Math.round(c.y)); ctx.textBaseline = 'top'; }
    else { ctx.fillStyle = '#ff3b2f'; ctx.fillRect(Math.round(c.x - 1), Math.round(c.y), 2, 1); }
  }
  // 近端篮架幻影：整套篮架先画到离屏画布，再以 38% 不透明度盖在最上层；镜头背后（d < 0.8）的点不画
  let gcv = null, gctx = null;
  function drawGhost(s, T, cs, sn) {
    if (!gcv || gcv.width !== W || gcv.height !== H) { gcv = document.createElement('canvas'); gcv.width = W; gcv.height = H; gctx = gcv.getContext('2d'); }
    gctx.setTransform(1, 0, 0, 1, 0, 0); gctx.clearRect(0, 0, W, H);
    const pj = PJ, main = ctx;
    PJ = (X, Y, z) => { const q = pj(X, Y, z); return q.d < 0.8 ? { x: NaN, y: NaN, s: q.s, d: q.d } : q; };
    ctx = gctx;
    try { drawStanchion(s); drawClock(s, T); drawBoard(s); drawRim(s, 'back'); drawRim(s, 'front'); } finally { ctx = main; PJ = pj; }
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 0.38; ctx.drawImage(gcv, 0, 0); ctx.restore();
    void cs; void sn;
  }
  // V3.9g 2K 式控制圈：脚下一圈贴地的细椭圆（队色，按真实透视投影，球员的腿会挡住前半圈）
  function footRing(p) {
    const r = 0.58, c = R.proj(p.x, p.y, 0.01); if (!(c.d > 1.2) || !isFinite(c.x)) return;
    const n = Math.max(28, Math.round(r * c.s * 7)), pts = [];
    for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2, q = R.proj(p.x + Math.cos(a) * r, p.y + Math.sin(a) * r, 0.01); pts.push([Math.round(q.x), Math.round(q.y)]); }
    // 外侧一圈淡白光晕、内侧一圈暗边，中间一像素队色线：木地板、油漆区上都看得清
    const off = (q, k) => { const dx = q[0] - c.x, dy = (q[1] - c.y) * 2.4, l = Math.hypot(dx, dy) || 1; return [Math.round(q[0] + k * dx / l), Math.round(q[1] + k * dy / l)]; };
    ctx.fillStyle = 'rgba(255,255,255,0.5)'; for (const q of pts) { const o = off(q, 1); ctx.fillRect(o[0], o[1], 1, 1); }
    ctx.fillStyle = 'rgba(12,8,24,0.4)'; for (const q of pts) { const o = off(q, -1); ctx.fillRect(o[0], o[1], 1, 1); }
    ctx.fillStyle = p.col.ringCol; for (const q of pts) ctx.fillRect(q[0], q[1], 1, 1);
  }
  // V3.9s 敌方「当前球员」：敌方进攻 = 持球人；敌方防守 = 盯我控制球员的人（没有就取离他最近的）
  function foeOf(T) {
    const Gm = G5(), c = T.ctl; if (!(T.hum >= 0) || !c || T.phase === 'over' || !Gm) return null;
    const h = PH.T5.holder && PH.T5.holder(); if (h && h.tm !== T.hum) return h;
    if (c.opp && c.opp.tm !== T.hum && !c.opp.off) return c.opp;   // 5V5 对位人（换防后会更新）
    let m = null, bd = 1e9;
    for (const p of Gm.players) { if (p.tm === T.hum || p.tm == null || p.off) continue; if (p.mark === c || p.opp === c) return p; const d = Math.hypot(p.x - c.x, p.y - c.y); if (d < bd) { bd = d; m = p; } }
    return m;
  }
  // 遮挡物（底部比分条、左右上角信息卡）在 480x270 画布坐标里的矩形
  let uiAv = [];   // C2：战术选择条 / 角落战术名，本帧的矩形（名字标签要避开）
  function hitAvoid(x0, x1, y0, y1) {
    const L = ((PH.render5 && PH.render5.avoid) || []).concat(uiAv);
    for (const r of L) if (x1 > r.x0 && x0 < r.x1 && y1 > r.y0 && y0 < r.y1) return true;
    return false;
  }
  // 控制球员脚下：体力条 + 名字（2K 样式）。脚在画面外时贴着屏幕边缘显示，挡到比分条/信息卡时挪到头顶
  function ctlTag(p, q, pr, star, busy, col) {
    const g = pr(p.x, p.y, 0); if (!g || !isFinite(g.x)) return;
    const s = Math.max(8, Math.min(60, g.s || 20)), bw = Math.round(Math.max(28, Math.min(56, 1.75 * s))), bh = 3, ry = 0.58 * s * 0.36;
    let cx = Math.max(bw / 2 + 4, Math.min(W - bw / 2 - 4, g.x)), by = Math.round(g.y + ry + 4);
    const hp = q && q.__head, top = hp ? Math.round(hp.y - 0.42 * hp.s - 22) : Math.round(g.y - 2.6 * s - 22);
    const hit = (y) => busy && cx + 34 > busy.x0 && cx - 34 < busy.x1 && y + 18 > busy.y0 && y < busy.y1;
    // V4.0 名字一律在脚下（用户：不用担心遮挡），只夹在画面内；不再挪到头顶
    by = Math.max(2, Math.min(H - 19 - (star ? bh + 5 : 0), by));
    if (hit(by)) by = busy.y0 - 19 > 2 ? busy.y0 - 19 : busy.y1 + 1;
    if (star) {
      // V4.4 体力条（render.js PH.stamBar：刻度、阈值、残影）；旧版 bw 20–40 × 3 → 28–56 × 3（只拉长）
      if (PH.stamBar) PH.stamBar(ctx, Math.round(cx - bw / 2), by + 2, bw, bh, p.stam, 'f' + (p.id != null ? p.id : p.a.name), (G5() && G5().time) || 0);
    }
    const alpha = ctx.globalAlpha;
    ctx.globalAlpha = star || col ? 1 : 0.85;
    const r = R.drawNameTag(ctx, p.a, cx, by + (star ? bh + 5 : 0), col, true);
    ctx.globalAlpha = alpha;
    return { x0: r.x0, x1: r.x1, y0: by - 1, y1: r.y1 };
  }
  function overlays(T) {
    const Gm = G5(), V = T.view; if (!V) return;
    const P = V.P, hum = T.hum >= 0, ctl = T.ctl;
    const pr = V.pr || ((x, y, z) => (V.d ? R.proj(V.d * y, -V.d * x, z) : R.proj(x, y, z)));
    uiAv = [];
    if (T.phase !== 'over') {
      ctx.font = FONT; const nm = PH.T5.plHud ? PH.T5.plHud() : '';
      if (nm) uiAv.push({ x0: 4, x1: 8 + Math.ceil(ctx.measureText(nm).width) + 12, y0: H - 28, y1: H - 8 });
      if (T.bar) uiAv.push({ x0: W / 2 - 150, x1: W / 2 + 150, y0: H - 46, y1: H - 20 });
    }
    // 控制球员：脚下体力条 + 名字；对方/队友持球人只显示名字
    if (hum && ctl && T.phase !== 'over' && !(PH.render5.k2 && PH.render5.k2.tip && PH.render5.k2.tipE < 0.5)) {
      const h = PH.T5.holder && PH.T5.holder();
      const mine = ctlTag(ctl, P[ctl.id], pr, true);
      const f = foeOf(T);   // V3.9s 敌方当前球员：名字用队色（跟脚下光标一致）
      if (h && h !== ctl && h !== f && (T.phase === 'live' || T.phase === 'inb')) ctlTag(h, P[h.id], pr, false, mine);
      if (f && (T.phase === 'live' || T.phase === 'inb')) ctlTag(f, P[f.id], pr, false, mine, f.col && f.col.ringCol);
    }
    if (hum && ctl) {
      // Who To Guard：防守时脚下箭头指向自己的对位
      if (ctl.tm !== Gm.off && ctl.mark && (T.phase === 'live' || T.phase === 'inb')) {
        const m = ctl.mark, dx = m.x - ctl.x, dy = m.y - ctl.y, l = Math.hypot(dx, dy);
        if (l > 1.4) {
          const ux = dx / l, uy = dy / l, a0 = pr(ctl.x + ux * 0.75, ctl.y + uy * 0.75, 0.02), a1 = pr(ctl.x + ux * 1.25, ctl.y + uy * 1.25, 0.02);
          const L2 = pr(ctl.x + ux * 0.8 - uy * 0.3, ctl.y + uy * 0.8 + ux * 0.3, 0.02), R2 = pr(ctl.x + ux * 0.8 + uy * 0.3, ctl.y + uy * 0.8 - ux * 0.3, 0.02);
          R.brush(ctx, L2.x, L2.y, a1.x, a1.y, 2, '#15101f', '#ffd24a'); R.brush(ctx, R2.x, R2.y, a1.x, a1.y, 2, '#15101f', '#ffd24a'); void a0;
        }
      }
      // V3.9h 传球目标（2K Pass Target）：我方持球时，当前摇杆方向会传给的那名队友头顶画小白三角（与传球用同一个选人函数）
      const pt = T.passTgt;
      if (!T.icon && pt && ctl.hasBall && pt !== ctl && pt.tm === ctl.tm) {
        const q = P[pt.id]; let hp = q && q.__head; if (!hp) { const pp = pr(pt.x, pt.y, (pt.h || 2) + 0.2); if (pp && isFinite(pp.x)) hp = { x: pp.x, y: pp.y, s: 0 }; }
        if (hp) {
          const x = Math.round(Math.max(6, Math.min(W - 6, hp.x))), y = Math.round(Math.max(28, Math.min(H - 40, hp.y - 0.42 * hp.s - 9)));
          ctx.fillStyle = '#15101f'; for (let r = -1; r <= 5; r++) { const w = Math.max(0, 5 - r) + 1; ctx.fillRect(x - w, y + r, w * 2 + 1, 1); }
          ctx.fillStyle = '#ffffff'; for (let r = 0; r < 5; r++) { const w = 4 - r; ctx.fillRect(x - w, y + r, w * 2 + 1, 1); }
        }
      }
      // 按住 RB：队友头顶显示 A/B/X/Y/LT 图标（没接手柄时显示键盘字母）
      if (T.icon) {
        const pad = T.R && T.R.pad;
        for (const m of T.tm[ctl.tm].on) {
          if (m === ctl) continue; const q = P[m.id];
          let hp = q && q.__head; if (!hp) { const pp = pr(m.x, m.y, (m.h || 2) + 0.2); if (!pp || !isFinite(pp.x)) continue; hp = { x: pp.x, y: pp.y, s: 0 }; }
          const k = PH.T5.ICON[m.slot], t = pad ? k : KEYL[k];
          ctx.font = FONT; const w = Math.max(11, Math.ceil(ctx.measureText(t).width) + 6);
          // 画面外的队友：图标贴在屏幕边缘（2K 同样会把图标钉在边上）
          const x = Math.round(Math.max(w / 2 + 3, Math.min(W - w / 2 - 3, hp.x))), y = Math.round(Math.max(30, Math.min(H - 40, hp.y - 0.42 * hp.s - 15)));
          ctx.fillStyle = '#15101f'; ctx.fillRect(x - (w >> 1) - 1, y - 1, w + 2, 14);
          ctx.fillStyle = GLYPH[k]; ctx.fillRect(x - (w >> 1), y, w, 12);
          ctx.textBaseline = 'top'; ctx.fillStyle = k === 'Y' ? '#15101f' : '#ffffff'; ctx.fillText(t, x - Math.ceil(ctx.measureText(t).width) / 2, y);
        }
      }
    }
    R.drawCombos(Gm);
    // 飘字（1V1 的 G.floats）
    for (const f of Gm.floats) {
      const q = pr(f.x, f.y, f.z + f.t * 0.8); if (q.x < -20 || q.x > W + 20) continue;
      ctx.globalAlpha = f.t > 0.9 ? Math.max(0, (1.3 - f.t) / 0.4) : 1; text(f.text, q.x, q.y - (f.shot && f.sub ? 20 : 8), f.color || '#ffffff', 'c');
      if (f.shot && f.sub) text(f.sub, q.x, q.y - 7, f.subColor || '#ffffff', 'c');   // V4.1 投篮反馈副文字（和 1V1 一样：空位 / 轻微干扰 / 严重干扰 / 双人封堵 / 无视干扰）
      ctx.globalAlpha = 1;
    }
    playUi(T);
    if (T.banner) {
      const bn = T.banner, a = Math.min(1, bn.age * 5, bn.d > 50 ? 1 : (bn.d - bn.age) * 4);
      ctx.globalAlpha = Math.max(0, a); ctx.font = FONT; const w = Math.ceil(ctx.measureText(bn.t).width) + 24;
      ctx.fillStyle = 'rgba(10,8,30,0.82)'; ctx.fillRect(Math.round(W / 2 - w / 2), 52, w, 20);
      ctx.fillStyle = '#ffd24a'; ctx.fillRect(Math.round(W / 2 - w / 2), 52, w, 1); ctx.fillRect(Math.round(W / 2 - w / 2), 71, w, 1);
      text(bn.t, W / 2, 56, '#ffffff', 'c'); ctx.globalAlpha = 1;
    }
  }
  // V3.9m C2 十字键战术呼叫：下方 4 格选择条（A / B / X / Y，键盘 K / L / J / I）+ 角落当前战术名。只画名字，不画说明
  function playUi(T) {
    if (T.phase === 'over') return;
    const pad = T.R && T.R.pad, B = T.bar;
    ctx.font = FONT;
    if (B) {
      const items = B.items.slice(B.pg * 4, B.pg * 4 + 4), ks = ['A', 'B', 'X', 'Y'];
      const ws = items.map((it) => 15 + Math.ceil(ctx.measureText(it.n).width) + 6), gap = 3, tot = ws.reduce((a, b) => a + b, 0) + gap * (items.length - 1);
      let x = Math.round(W / 2 - tot / 2); const y = H - 42;
      const pages = Math.ceil(B.items.length / 4), fade = (4 - (T.time - B.t0)) * 3;
      ctx.globalAlpha = Math.max(0.3, Math.min(1, fade));
      ctx.fillStyle = 'rgba(10,8,30,0.86)'; ctx.fillRect(x - 3, y - 3, tot + 6, 18 + (pages > 1 ? 4 : 0));
      ctx.fillStyle = '#ffd24a'; ctx.fillRect(x - 3, y - 3, tot + 6, 1);
      for (let i = 0; i < items.length; i++) {
        const k = ks[i], t = pad ? k : KEYL[k];
        ctx.fillStyle = '#15101f'; ctx.fillRect(x, y, 13, 12); ctx.fillStyle = GLYPH[k]; ctx.fillRect(x + 1, y, 11, 12);
        ctx.textBaseline = 'top'; ctx.fillStyle = k === 'Y' ? '#15101f' : '#ffffff'; ctx.fillText(t, x + 7 - Math.ceil(ctx.measureText(t).width) / 2, y);
        text(items[i].n, x + 16, y, '#ffffff');
        x += ws[i] + gap;
      }
      if (pages > 1) for (let i = 0; i < pages; i++) { ctx.fillStyle = i === B.pg ? '#ffd24a' : '#6a6480'; ctx.fillRect(Math.round(W / 2 - pages * 3 + i * 6), y + 15, 4, 2); }
      ctx.globalAlpha = 1;
    }
    const nm = PH.T5.plHud ? PH.T5.plHud() : '';
    if (nm) {
      const w = Math.ceil(ctx.measureText(nm).width) + 12, t = T.hum >= 0 ? T.hum : PH.game.G.off, col = T.tm && T.tm[t] && T.tm[t].col ? T.tm[t].col.ui : '#ffd24a';
      const x = 6, y = H - 26;   // 左下角（上方两角是球员信息卡，下方中间是比分条）
      ctx.fillStyle = 'rgba(10,8,30,0.8)'; ctx.fillRect(x, y, w, 16); ctx.fillStyle = col || '#ffd24a'; ctx.fillRect(x, y, 2, 16);
      text(nm, x + 7, y + 2, '#ffffff');
    }
  }
  // ---------- V4.4 5V5 即时回放（顶翻）：team5 没有回放，这里自己录帧 + 播放 ----------
  // 录：包住 PH.T5.tick，每个逻辑帧后录一份画面快照（位置 / 姿势 / 倒地字段 / 球 / 粒子），保留 6 秒
  // 触发：game.js 接触帧写 G.thruMk；死球 / 发球时播放，进球后先留一拍（活球里不打断比赛，5s 内没死球就作废）
  // 播放：暂停 team5 tick；接触前后 0.35s 慢放 ×0.25（0.8s 内 ×0.5，其余 ×0.8）；镜头对准接触点、推近；上下黑边 + REPLAY 标；A/B/X/Y 跳过
  const RPL = (function () {
    // 只在真的在画 5V5 时播（rT = 最近一次 render 的比赛时间）；无画面的批量模拟（t5sim 等）不进回放
    const S = { rT: null, on: false, view: null, buf: [], mk: null, seen: null, rt: 0, age: 0, i: 0, cam: null, prev: null };
    const KP = ['x', 'y', 'z', 'vx', 'vy', 'face', 'stun', 'stunK', 'knock', 'knockT', 'knockD', 'knockUp', 'knockDx', 'knockDy', 'hasBall', 'flash', 'off', 'speed', 'anim', 'sq', 'armS', 'brPh', 'stam', 'exr', 'grip'];
    const KB = ['x', 'y', 'z', 'state', 'holder', 'spin', 'under'];
    function rec() {
      const Gm = G5(), T5 = PH.T5 && PH.T5.T; if (!T5 || !T5.on || Gm.mode !== 't5') { S.buf.length = 0; return; }
      const R0 = S.buf, last = R0[R0.length - 1]; if (last && Gm.time < last.t) R0.length = 0;
      const F = Gm.fx, dense = !last || (R0.length & 1);
      R0.push({ t: Gm.time, dir: T5.dir[Gm.off], p: Gm.players.map((p) => { const o = { pose: Object.assign({}, p.pose) }; for (const k of KP) o[k] = p[k]; if (p.armS) o.armS = p.armS.slice(); return o; }), b: (() => { const o = {}; for (const k of KB) o[k] = Gm.ball[k]; return o; })(),
        parts: dense ? F.parts.map((q) => Object.assign({}, q)) : last.parts, rings: F.rings ? F.rings.map((q) => Object.assign({}, q)) : [] });
      if (PH.TAPE) PH.TAPE.record(Gm, R0[R0.length - 1], { score: T5.tm.map(t => t.score), phase: T5.phase, gclock: T5.gclock, off: T5.off, q: T5.q });
      while (R0.length && R0[0].t < Gm.time - 6) R0.shift();
      const mk = Gm.thruMk;
      if (mk && mk !== S.seen && Gm.time - mk.t < 0.5) {
        S.seen = mk;
        const dir = T5.dir[mk.off]; S.mk = Object.assign({}, mk, { x: dir * mk.y, y: -dir * mk.x });
      }
      if (S.mk && Gm.time - S.mk.t > 5) S.mk = null;
      if (S.mk && PH.game.replayFlow.ready() && Gm.time - S.mk.t > 1.0 && S.rT != null && Math.abs(Gm.time - S.rT) < 0.5 && (T5.phase === 'dead' || T5.phase === 'inb') && Gm.vopt.replay !== false) start();
    }
    function start() {
      const mk = S.mk; S.mk = null; const fr = S.buf.filter((f) => f.t >= mk.t - 1.4 && f.t <= mk.t + 1.3); if (fr.length < 40) return;
      Object.assign(S, { on: true, fr, q: mk, rt: fr[0].t, t1: fr[fr.length - 1].t, i: 0, age: 0, wipeIn: 0, returnT: null, cameraFrom: null, view: null, cam: { x: mk.x, y: mk.y, w: 0 }, prev: null });
      S.log = (S.log || []).concat([{ t: G5().time, k: mk.k }]);
      try { PH.game.sfx && PH.game.sfx('swoosh'); } catch (e) {}
    }
    function stop() { S.on = false; S.view = null; S.fr = null; S.buf.length = 0; }
    function reset() { stop(); S.mk = S.seen = S.rT = null; }
    function tick(dt) {
      dt = Math.min(dt, 0.05);
      const R = PH.input.read5 ? PH.input.read5() : {}; PH.input.endTick();
      const any = !!(R.A || R.B || R.X || R.Y), edge = any && !S.prev; S.prev = any;
      const wasReplay = !!S.view, phase = PH.game.replayFlow.advance(S, dt, (edge && S.age > 0.5) || S.rt >= S.t1);
      if (wasReplay && !S.view) PH.T5.T.camSnap = true;
      if (phase === 'done') stop();
      if (phase !== 'play') return;
      const e = S.rt - S.q.t, ae = Math.abs(e);
      S.rt += dt * (ae < 0.35 ? 0.25 : ae < 0.8 ? 0.5 : 0.8);
      while (S.i < S.fr.length - 1 && S.fr[S.i + 1].t <= S.rt) S.i++;
      const f = S.fr[S.i], a = f.p[S.q.pid], d = f.p[S.q.did], w = Math.max(0, 1 - Math.max(0, ae - 0.2) / 1.0), k = Math.min(1, dt * 4);
      // 取景：进攻人和防守人的中点，接触前后往接触点收
      const gx = a && d ? f.dir * (a.y + d.y) / 2 : S.q.x, gy = a && d ? -f.dir * (a.x + d.x) / 2 : S.q.y;
      S.cam.x += (gx + (S.q.x - gx) * 0.4 * w - S.cam.x) * k; S.cam.y += (gy + (S.q.y - gy) * 0.4 * w - S.cam.y) * k; S.cam.w += (w - S.cam.w) * k;
      S.view = f;
    }
    // 把当前回放帧换到真实对象上画，画完换回
    function swap() {
      const Gm = G5(), f = S.view, sv = Gm.players.map((p) => { const o = { pose: p.pose, ghosts: p.ghosts, action: p.action }; for (const k of KP) o[k] = p[k]; return o; }), sb = {}, F = Gm.fx, sp = F.parts, sr = F.rings, sk = F.shake, sfl = F.flash, scf = F.confetti, ssf = F.scoreFx;
      for (const k of KB) sb[k] = Gm.ball[k];
      Gm.players.forEach((p, i) => { const o = f.p[i]; if (!o) return; for (const k of KP) p[k] = o[k]; p.pose = o.pose; p.ghosts = null; p.action = null; });
      for (const k of KB) Gm.ball[k] = f.b[k]; F.parts = f.parts; F.rings = f.rings; F.shake = 0; F.flash = 0; F.confetti = []; F.scoreFx = null;
      return () => { Gm.players.forEach((p, i) => { const o = sv[i]; for (const k of KP) p[k] = o[k]; p.pose = o.pose; p.ghosts = o.ghosts; p.action = o.action; }); for (const k of KB) Gm.ball[k] = sb[k]; F.parts = sp; F.rings = sr; F.shake = sk; F.flash = sfl; F.confetti = scf; F.scoreFx = ssf; };
    }
    function hud() {
      const bh = 14, e = S.rt - S.q.t, slow = Math.abs(e) < 0.35;
      ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, bh); ctx.fillRect(0, H - bh, W, bh);
      const x = 8, y = H - bh - 16; ctx.fillStyle = 'rgba(10,8,30,0.82)'; ctx.fillRect(x, y, 86, 13);
      if (((S.age * 2.5) | 0) % 2 === 0) { ctx.fillStyle = '#ff3b2f'; ctx.fillRect(x + 4, y + 4, 5, 5); }
      ctx.font = FONT; ctx.textBaseline = 'top'; text('REPLAY' + (slow ? ' ×0.25' : ''), x + 13, y, '#ffffff');
      const s = S.q.k === 'fall' ? '顶翻' : '顶退'; text(s, W - 8 - Math.ceil(ctx.measureText(s).width), y, '#ffb02a');
    }
    return Object.assign(S, { rec, tick, swap, hud, start, stop, reset, S });
  })();
  if (PH.T5 && PH.T5.tick && !PH.T5.tick.__rpl) {
    const t0 = PH.T5.tick, tk = function (dt) { if (RPL.on) { RPL.tick(dt); return; } t0.call(this, dt); try { RPL.rec(); } catch (e) { RPL.buf.length = 0; } };
    tk.__rpl = true; PH.T5.tick = tk;
  }
  function restore() { if (PH.render && PH.render.setTheme) PH.render.setTheme(null); if (saved && PH.render) { PH.render.setCam(PH.render.camTuned ? PH.render.camTuned() : saved.cv); if (cam) cam.oy = saved.oy; } saved = null; }
  PH.render5 = { rpl: RPL, proj: (x, y, z) => (lastProj ? lastProj(x, y, z) : null), render: render, reset: reset, resize: init, restore: restore, CAM5: CAM5, halfW: () => halfW() };
})();
