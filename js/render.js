// PIXEL HOOPS - 渲染：伪 3D 投影、球场、像素角色
(function () {
  const PH = (window.PH = window.PH || {});
  // 逻辑画布：默认 480x270（16:9）；窗口比例不同时 main.js 调 resize() 把宽或高延展（不裁切、不留黑边）
  let W = 480, H = 270;
  const BW = 1000;
  const HOOP = { x: 0, y: 12.425, z: 3.05 };
  const BOARD_Y = 12.8, BALL_R = 0.135;
  const cam = { x: 0, y: -5.5, z: 6.5, F: 400, oy: 10, fy: 0, fz: 0, uy: 0, uz: 0 };
  // 镜头参数：zoom 拉近倍数、height 机位高度、dist 与持球人的前后距离、follow 左右跟随
  const CAM_DEF = { zoom: 1.32, height: 5.8, dist: 8.8, follow: 0.7, push: 1, pin: 0.26, plow: 0.3 };
  const CAMV = Object.assign({}, CAM_DEF);
  let follow3 = null;
  let intro1 = null;
  let offsetX3 = 0, offsetY3 = 0;
  function setPitch(dy, dz) {
    const L = Math.hypot(dy, dz);
    cam.fy = dy / L; cam.fz = dz / L; cam.uy = -cam.fz; cam.uz = cam.fy;
  }
  function setCam(o) {
    Object.assign(CAMV, o || {});
    cam.F = 400 * CAMV.zoom; cam.z = CAMV.height;
    setPitch(CAMV.dist + 2.4, 1 - cam.z);
  }
  setCam();
  // 镜头面板参数登记在调参台，跟调参配置一起存云端、打开时随默认配置套用
  const CAM_K = { zoom: 'camZoom', height: 'camHeight', dist: 'camDist', follow: 'camFollow', push: 'camPush', pin: 'camPin', plow: 'camPlow' };
  const CAM_KS = Object.keys(CAM_K).map((f) => CAM_K[f]);
  const CAMERA_DISPLAY = {
    camZoom: ['镜头 焦距倍数', '越大画面中的球员越大、视野越窄；焦距倍数'],
    camHeight: ['镜头 机位高度', '越大机位越高；米'],
    camDist: ['镜头 跟随距离', '越大机位离跟随目标越远；米'],
    camFollow: ['镜头 横向跟随比例', '越大镜头越跟着持球人左右移；0 = 固定中线，1 = 完全跟随'],
    camPush: ['镜头 禁区推近', '开：持球接近篮下时镜头前推并压低'],
    camPin: ['镜头 禁区推近力度', '越大攻筐时镜头推得越近；比例'],
    camPlow: ['镜头 禁区压低力度', '越大攻筐推近时机位降得越低；比例'],
    t3_camZoom: ['3V3 镜头焦距倍数', '越大画面越放大；焦距倍数，自动取景仍保护篮筐与持球人'],
    t3_camHeight: ['3V3 镜头高度', '越大机位越高；米'],
    t3_camDist: ['3V3 镜头距离', '越大机位离跟随目标越远；米，仍受底线限制'],
    t3_camFollow: ['3V3 横向跟随比例', '越大镜头越跟着目标左右移；0 = 固定中线，1 = 完全跟随'],
    t3_camSpeed: ['3V3 镜头跟随响应', '越大镜头跟随与取景变化越快；每秒'],
    t3_camPitch: ['3V3 镜头俯视斜率', '越大镜头越向下俯视；斜率'],
    l1_ciDur: ['专属技能 插画停留时间', '越大半屏插画从滑入到淡出越久；秒，组队与短插屏乘 0.75'],
    l1_ciFx: ['专属技能 闪光持续时间', '越大技能金光与边缘光晕持续越久；秒，5V5 乘 0.75'],
  };
  function camTuned() { const T = PH.TUNE, o = {}; for (const f in CAM_K) o[f] = T && T.has && T.has(CAM_K[f]) ? +T.get(CAM_K[f]) : CAM_DEF[f]; return o; }
  if (PH.TUNE && PH.TUNE.reg && !PH.TUNE.has('camZoom')) {
    PH.TUNE.reg([
      { k: 'camZoom', label: '镜头 拉近', v: CAM_DEF.zoom, min: 0.8, max: 1.8, step: 0.01, wide: false, note: '倍数：1V1 / 训练镜头焦距（暂停 → 镜头面板“拉近”）' },
      { k: 'camHeight', label: '镜头 机位高度', v: CAM_DEF.height, min: 3, max: 10, step: 0.1, wide: false, note: '米：机位离地高度（镜头面板“机位高度”）' },
      { k: 'camDist', label: '镜头 距离', v: CAM_DEF.dist, min: 6, max: 14, step: 0.1, wide: false, note: '米：机位在持球人身后多远（镜头面板“镜头距离”）' },
      { k: 'camFollow', label: '镜头 左右跟随', v: CAM_DEF.follow, min: 0, max: 1, step: 0.05, wide: false, note: '比例：0 = 机位固定在中线，1 = 完全跟着持球人左右移动' },
      { k: 'camPush', label: '镜头 禁区推近', v: CAM_DEF.push, mode: 'bool', note: '开：持球接近篮下时镜头前推、机位压低' },
      { k: 'camPin', label: '镜头 推近力度', v: CAM_DEF.pin, min: 0, max: 0.6, step: 0.02, wide: false, note: '比例：禁区推近时往前推多少' },
      { k: 'camPlow', label: '镜头 压低程度', v: CAM_DEF.plow, min: 0, max: 1, step: 0.05, wide: false, note: '比例：禁区推近时机位压低多少' },
    ].map((d) => ({ ...d, display: CAMERA_DISPLAY[d.k] })));
    PH.TUNE.on((ks) => { if (!ks || ks.some((k) => CAM_KS.indexOf(k) >= 0)) setCam(camTuned()); });
    setCam(camTuned());
  }
  const CAM3 = PH.CAM3 = [
    { k: 't3_camZoom', f: 'zoom', label: '3V3 镜头 拉近', v: 1, min: 0.6, max: 1.8, step: 0.01, wide: false, note: '焦距倍数；自动取景仍会保护篮筐和持球人不出画面' },
    { k: 't3_camHeight', f: 'height', label: '3V3 镜头 机位高度', v: 8.2, min: 4, max: 12, step: 0.1, wide: false, note: '米：机位离地高度' },
    { k: 't3_camDist', f: 'dist', label: '3V3 镜头 距离', v: 10.8, min: 6, max: 16, step: 0.1, wide: false, note: '米：机位在跟随目标身后多远，保留底线范围限制' },
    { k: 't3_camFollow', f: 'follow', label: '3V3 镜头 左右跟随', v: 0.55, min: 0, max: 1, step: 0.05, wide: false, note: '比例：0 固定中线，1 完全跟随目标' },
    { k: 't3_camSpeed', f: 'speed', label: '3V3 镜头 跟随速度', v: 4.5, min: 1, max: 10, step: 0.1, wide: false, note: '数值越大，跟随和取景变化越快' },
    { k: 't3_camPitch', f: 'pitch', label: '3V3 镜头 俯视角度', v: 0.54, min: 0.2, max: 1, step: 0.01, wide: false, note: '俯视斜率，越大越往下看' },
  ];
  if (PH.TUNE && PH.TUNE.reg) PH.TUNE.reg(CAM3.map((d) => ({ ...d, display: CAMERA_DISPLAY[d.k] })));
  function cam3Tuned() { const o = {}; for (const c of CAM3) o[c.f] = PH.TUNE && PH.TUNE.has(c.k) ? +PH.TUNE.get(c.k) : c.v; return o; }
  // 镜头面板改值：写进调参台（会算作当前配置的未保存改动）；没有调参表时直接改
  function setCamTuned(o, mode) {
    if (mode === 't3') { for (const c of CAM3) if (c.f in (o || {}) && PH.TUNE) PH.TUNE.set(c.k, o[c.f]); return; }
    const T = PH.TUNE, raw = {};
    for (const f in o || {}) { if (T && CAM_K[f] && T.has(CAM_K[f])) T.set(CAM_K[f], o[f]); else raw[f] = o[f]; }
    if (Object.keys(raw).length) setCam(raw);
  }
  function resetCamTuned(mode) { const T = PH.TUNE; if (mode === 't3') { if (T) for (const c of CAM3) T.reset(c.k); return; } if (T && T.has('camZoom')) { for (const k of CAM_KS) T.reset(k); } else setCam(CAM_DEF); }

  function proj(x, y, z) {
    const dx = x - cam.x, dy = y - cam.y, dz = z - cam.z;
    const zc = Math.max(0.5, dy * cam.fy + dz * cam.fz);
    const yc = dy * cam.uy + dz * cam.uz;
    const s = cam.F / zc;
    const endOn = (offsetX3 || offsetY3) && PH.game.G.mode === 't3';
    return { x: W / 2 + dx * s + (endOn ? offsetX3 : 0), y: H / 2 + cam.oy - yc * s + (endOn ? offsetY3 : 0), s: s, d: zc };
  }

  // ---------- 颜色 ----------
  function hexToRgb(h) { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  function pack(r, g, b) { return ((255 << 24) | (b << 16) | (g << 8) | r) >>> 0; }
  function shade(h, k) {
    const c = hexToRgb(h).map((v) => Math.max(0, Math.min(255, Math.round(v * k))));
    return '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('');
  }
  function packHex(h, k) { const c = hexToRgb(h); k = k || 1; return pack(Math.min(255, c[0] * k) | 0, Math.min(255, c[1] * k) | 0, Math.min(255, c[2] * k) | 0); }
  PH.shade = shade;

  const WOOD_BASE = ['#e0a45c', '#d89a52', '#dca058', '#d09248', '#e4aa64'];
  const WOOD_IN = ['#eab46c', '#e2aa62', '#e6b068', '#dba25a', '#eebb74'];
  const LV = [1, 0.9, 0.79, 0.68];
  const WOOD = LV.map((k) => WOOD_BASE.map((c) => packHex(c, k)));
  const WOODI = LV.map((k) => WOOD_IN.map((c) => packHex(c, k)));
  const PAINT = LV.map((k) => packHex('#2c62b0', k));
  const PAINT2 = LV.map((k) => packHex('#2857a0', k));
  const LINE = LV.map((k) => packHex('#f6efe0', k));
  // V3.9：5V5 的 2K 镜头复用这套渲染，可临时换油漆区颜色和广告牌文字；setTheme(null) 还原 1V1 默认
  const WORDS_DEF = ['PIXEL HOOPS', '1 ON 1', '像素斗牛', 'HALF COURT'];
  const WORDS_3 = WORDS_DEF.map((word) => word === '1 ON 1' ? '3 ON 3' : word);
  let WORDS = WORDS_DEF, themeKey = '';
  function setTheme(th) {
    const key = th ? th.paint + '|' + th.k1 + th.k2 + '|' + th.words.join(',') : '';
    if (key === themeKey) return; themeKey = key;
    for (let i = 0; i < LV.length; i++) { PAINT[i] = th ? packHex(th.paint, LV[i] * th.k1) : packHex('#2c62b0', LV[i]); PAINT2[i] = th ? packHex(th.paint, LV[i] * th.k2) : packHex('#2857a0', LV[i]); }
    WORDS = th ? th.words : WORDS_DEF;
    if (back) { back = buildBackdrop(false); backB = buildBackdrop(true); }
  }
  const APR = [packHex('#1a2342'), packHex('#1e294c')];
  const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

  let cv, ctx, fcv, fctx, fimg, fbuf, back, backB, back3, spr, sctx, sil, silx;
  let rowY = new Float32Array(H + 1), rowS = new Float32Array(H + 1);

  function bufs() {
    cv.width = W; cv.height = H; ctx = cv.getContext('2d'); ctx.imageSmoothingEnabled = false;
    fcv = document.createElement('canvas'); fcv.width = W; fcv.height = H;
    fctx = fcv.getContext('2d');
    fimg = fctx.createImageData(W, H); fbuf = new Uint32Array(fimg.data.buffer);
    rowY = new Float32Array(H + 1); rowS = new Float32Array(H + 1);
  }
  function resize(w, h) {
    w = Math.round(w); h = Math.round(h); if (w === W && h === H) return false;
    W = w; H = h; if (cv) bufs(); return true;
  }
  function init(canvas) {
    cv = canvas; bufs();
    spr = document.createElement('canvas'); spr.width = spr.height = SZ; sctx = spr.getContext('2d');
    sil = document.createElement('canvas'); sil.width = sil.height = SZ; silx = sil.getContext('2d');
    back = buildBackdrop(false); backB = buildBackdrop(true);
  }

  // ---------- 看台背景 ----------
  function buildBackdrop(up, words = WORDS, startX = 14) {
    const back = document.createElement('canvas'); back.width = BW; back.height = 170;
    const b = back.getContext('2d');
    b.fillStyle = '#070a16'; b.fillRect(0, 0, BW, 170);
    let seed = 7;
    const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    const shirts = ['#c94f4f', '#4f7bc9', '#d9b44a', '#e8e4d8', '#5aa469', '#8a5fc0', '#d97a3a', '#3a3f58', '#3a3f58'];
    const skins = ['#e9b384', '#c98d62', '#8d5a3b', '#f0c8a0', '#6b4530'];
    for (let r = 0; r < 9; r++) {
      const y = 34 + r * 12, k = 0.38 + r * 0.065;
      b.fillStyle = shade('#151b33', 0.7 + r * 0.06); b.fillRect(0, y + 6, BW, 12);
      for (let x = (r & 1) * 4 - 2; x < BW; x += 8) {
        if (rnd() < 0.08) continue;
        const bob = (rnd() < 0.2 ? -1 : 0) - (up ? 3 : 0);
        const sc = shade(shirts[(rnd() * shirts.length) | 0], k), kc = shade(skins[(rnd() * skins.length) | 0], k);
        b.fillStyle = sc; b.fillRect(x, y + 5 + bob, 6, 8 - (up ? -3 : 0));
        b.fillStyle = kc; b.fillRect(x + 1, y + bob, 4, 5);
        if (up) { b.fillStyle = kc; b.fillRect(x - 1, y + bob - 3, 1, 6); b.fillRect(x + 6, y + bob - 3, 1, 6); b.fillStyle = sc; b.fillRect(x - 1, y + bob + 3, 1, 3); b.fillRect(x + 6, y + bob + 3, 1, 3); }
        if (rnd() < 0.5) { b.fillStyle = shade('#1a1210', k + 0.3); b.fillRect(x + 1, y + bob, 4, 2); }
      }
    }
    // 灯架
    b.fillStyle = '#10152a'; b.fillRect(0, 0, BW, 26);
    b.fillStyle = '#1c2444'; b.fillRect(0, 22, BW, 4);
    for (let x = 30; x < BW; x += 110) {
      b.fillStyle = '#2a3460'; b.fillRect(x, 6, 50, 12);
      for (let i = 0; i < 4; i++) { b.fillStyle = '#fff6c8'; b.fillRect(x + 4 + i * 12, 9, 8, 6); b.fillStyle = '#ffd866'; b.fillRect(x + 4 + i * 12, 14, 8, 1); }
      for (let yy = 19; yy < 40; yy++) for (let xx = x - 4; xx < x + 54; xx++) if (BAYER[(xx & 3) + (yy & 3) * 4] < (40 - yy) * 0.35) { b.fillStyle = 'rgba(255,240,180,0.10)'; b.fillRect(xx, yy, 1, 1); }
    }
    // LED 广告牌
    b.fillStyle = '#0a0d1c'; b.fillRect(0, 142, BW, 28);
    b.fillStyle = '#12183a'; b.fillRect(0, 146, BW, 20);
    b.fillStyle = '#2b3a80'; b.fillRect(0, 145, BW, 1); b.fillRect(0, 166, BW, 1);
    b.font = "12px 'Fusion Pixel 12px Proportional SC', monospace"; b.textBaseline = 'top';
    const cols = ['#ffd24a', '#5ee0ff', '#ff6b6b', '#7dff8a'];
    let x = startX, i = 0;
    while (x < BW) { b.fillStyle = cols[i % 4]; const w = words[i % words.length]; b.fillText(w, x, 150); x += Math.ceil(b.measureText(w).width) + 34; i++; }
    return back;
  }

  // ---------- 地板 ----------
  function hash(n) { n = (n ^ 61) ^ (n >>> 16); n = (n + (n << 3)) | 0; n ^= n >>> 4; n = Math.imul(n, 0x27d4eb2d); n ^= n >>> 15; return n >>> 0; }

  function drawFloor() {
    fbuf.fill(0);
    const cy = H / 2 + cam.oy + offsetY3, dz = -cam.z;
    for (let sy = 0; sy <= H; sy++) {
      const t = (cy - (sy + 0.5)) / cam.F;
      const den = t * cam.fy - cam.uy;
      const dy = (dz * (cam.uz - t * cam.fz)) / den;
      if (!(dy > 0) || dy > 60) { rowY[sy] = 1e9; rowS[sy] = 0; continue; }
      rowY[sy] = cam.y + dy;
      rowS[sy] = cam.F / (dy * cam.fy + dz * cam.fz);
    }
    let firstRow = H;
    // 5V5 的 2K 镜头：全场 = 半场镜像（|y|），只在 t5 模式下生效
    const mir = PH.game && PH.game.G && PH.game.G.mode === 't5';
    for (let sy = 0; sy < H; sy++) {
      const wy0 = rowY[sy], wy = mir && wy0 < 0 && wy0 > -1e8 ? -wy0 : wy0;
      if (wy > 17.4) continue;
      if (sy < firstRow) firstRow = sy;
      const inv = 1 / rowS[sy];
      const lw = Math.max(0.05, 0.6 * inv);
      const prev = sy > 0 && rowY[sy - 1] < 1e8 ? (mir && rowY[sy - 1] < 0 ? -rowY[sy - 1] : rowY[sy - 1]) : wy + inv * 3;
      const lwy = Math.max(0.05, 0.6 * Math.abs(prev - wy));
      let wx = cam.x + (0.5 - W / 2 - offsetX3) * inv;
      const row = sy * W, by = (sy & 3) * 4;
      const dyr = wy - HOOP.y, dyf = wy - 8.2;
      const yIn = wy > -lwy && wy < 14 + lwy;
      const yEdge = wy < lwy || wy > 14 - lwy;
      for (let sx = 0; sx < W; sx++, wx += inv) {
        const ax = wx < 0 ? -wx : wx;
        let col;
        if (!yIn || ax > 7.5 + lw) {
          col = wy > 16.6 ? 0xff120d0a : APR[(Math.floor(wx / 1.5) + Math.floor(wy / 1.5)) & 1];
          fbuf[row + sx] = col; continue;
        }
        // 光照层级（抖动）
        const dl = Math.sqrt(wx * wx * 0.6 + (wy - 9) * (wy - 9));
        let lv = (dl * 0.2 + BAYER[(sx & 3) + by] / 16 - 0.35) | 0;
        if (lv < 0) lv = 0; else if (lv > 3) lv = 3;
        let line = false;
        if (yEdge || ax > 7.5 - lw) line = true;
        else {
          const dr = Math.sqrt(wx * wx + dyr * dyr);
          const fr = dr > 0.01 ? Math.abs(dyr) / dr : 0;
          const lr = lw + (lwy - lw) * fr;
          const in3 = wy < 11.01 ? dr < 6.75 : ax < 6.6;
          if (wy < 11.01 ? Math.abs(dr - 6.75) < lr : Math.abs(ax - 6.6) < lw) line = true;
          else if ((Math.abs(ax - 2.45) < lw && wy > 8.2) || (Math.abs(dyf) < lwy && ax < 2.45)) line = true;
          else if (dr < 1.25 + lr && dr > 1.25 - lr && wy < HOOP.y) line = true;
          else {
            const d2 = Math.sqrt(wx * wx + dyf * dyf);
            const lr2 = lw + (lwy - lw) * (d2 > 0.01 ? Math.abs(dyf) / d2 : 0);
            const d3 = Math.sqrt(wx * wx + wy * wy);
            const lr3 = lw + (lwy - lw) * (d3 > 0.01 ? wy / d3 : 0);
            if (Math.abs(d2 - 1.8) < lr2 && wy < 8.2) line = true;
            else if (Math.abs(d3 - 1.8) < lr3) line = true;
            else if (ax < 2.45 && wy > 8.2) col = ((Math.floor(wx / 0.28) & 1) ? PAINT : PAINT2)[lv];
            else if (d3 < 1.8) col = PAINT2[lv];
            else {
              const pl = Math.floor(wx / 0.28);
              const seg = Math.floor((wy + (pl & 3) * 0.9) / 3.2);
              col = (in3 ? WOODI : WOOD)[lv][hash(pl * 31 + seg) % 5];
            }
          }
        }
        fbuf[row + sx] = line ? LINE[lv] : col;
      }
    }
    fctx.putImageData(fimg, 0, 0);
    return firstRow;
  }

  // ---------- 像素图元 ----------
  function brush(c, x0, y0, x1, y1, w, dark, light, top = -Infinity, rounded = false, endWidth) {
    w = Math.max(1, Math.round(w));
    endWidth = endWidth == null ? w : Math.max(1, Math.round(endWidth));
    const dx = x1 - x0, dy = y1 - y0, n = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)))), h = w / 2;
    const paint = (col, size) => {
      c.fillStyle = col;
      const corner = rounded ? Math.floor(size * 0.17) : 0;
      for (let i = 0; i <= n; i++) {
        const t = i / n, taper = endWidth === w ? 0 : Math.round((endWidth - w) * t), width = Math.max(1, size + taper);
        const x = Math.round(x0 + dx * t - h - taper / 2), y = Math.round(y0 + dy * t - h), start = Math.max(y, top);
        if (start < y + size) {
          c.fillRect(x + corner, start, Math.max(1, width - 2 * corner), y + size - start);
          const middle = Math.max(start, y + corner);
          if (corner && middle < y + size - corner) c.fillRect(x, middle, width, y + size - corner - middle);
        }
      }
    };
    paint(dark, w);
    if (light) paint(light, w >= 3 ? w - 1 : w);
  }
  function ellipse(c, cx, cy, rx, ry, col) {
    c.fillStyle = col; cx = Math.round(cx); cy = Math.round(cy);
    ry = Math.max(1, Math.round(ry));
    for (let dy = -ry; dy <= ry; dy++) {
      const w = Math.round(rx * Math.sqrt(Math.max(0, 1 - (dy * dy) / (ry * ry + 0.5))));
      if (w > 0) c.fillRect(cx - w, cy + dy, w * 2, 1);
    }
  }
  // V3.9s 光标名字：1V1 电脑方也画（训练假人 / 观战回放不画）
  const curOn = (p, G) => !p.dummy && !p.off && !!p.arch && !(G.replay && G.replay.view) && G.players.length <= 2;
  // 名字颜色跟光标一致；太暗的队色往白提亮，保证在地板上看得清
  function curCol(c) { const m = /^#([0-9a-f]{6})$/i.exec(c || ''); if (!m) return '#ffffff'; const v = parseInt(m[1], 16), r = v >> 16, g = (v >> 8) & 255, b = v & 255, L = 0.3 * r + 0.59 * g + 0.11 * b; if (L >= 110) return c; const k = (110 - L) / (255 - L); return 'rgb(' + [r, g, b].map((x) => Math.round(x + (255 - x) * k)).join(',') + ')'; }
  function nameBounds(c, a, cx, y, compact) {
    c.font = "12px 'Fusion Pixel 12px Proportional SC', monospace";
    const tw = Math.ceil(c.measureText(a.name).width), w = tw + 3 + PH.PT.SIZE;
    const x0 = Math.round(Math.max(2, Math.min(W - w - 2, cx - w / 2))), yy = Math.round(y), y0 = yy - (compact ? 2 : 1);
    return { x0, x1: x0 + w, y0, y1: y0 + PH.PT.SIZE, yy };
  }
  function curName(c, a, cx, y, col, compact = false) {
    const t = a.name, pt = PH.PT.of(a), box = nameBounds(c, a, cx, y, compact), { x0, yy } = box;
    c.textBaseline = 'top';
    c.fillStyle = '#15101f'; for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1]]) c.fillText(t, x0 + dx, yy + dy);
    c.fillStyle = curCol(col); c.fillText(t, x0, yy);
    PH.PT.draw(c, pt.id, box.x1 - PH.PT.SIZE, box.y0);
    return box;
  }
  function ring(c, cx, cy, rx, ry, col) {
    c.fillStyle = col; cx = Math.round(cx); cy = Math.round(cy);
    const n = Math.max(12, Math.round(rx * 5));
    for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; c.fillRect(Math.round(cx + Math.cos(a) * rx), Math.round(cy + Math.sin(a) * ry), 1, 1); }
  }

  // ---------- V3.9m 步态 / 运球 / 呼吸（1V1、5V5 共用；game.js 的 updatePlayer / poseTarget / 球位挂钩调用） ----------
  // 速度按该球员自己的极速归一（kW≈0.35 走、≈0.9 慢跑、≥1.15 冲刺），步频、步幅、前倾、起伏、摆臂都随 kW 连续变化
  const GT = (function () {
    const tune = (k, d) => PH.game && PH.game.K ? PH.game.K[k] : d;
    const height = (pl) => pl.col && pl.col.body ? pl.col.body.height * pl.h / pl.col.body.baseHeight : pl.h || 1.95;
    const cl = (v, a, b) => (v < a ? a : v > b ? b : v), ss = (a, b, v) => { const t = cl((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
    const vref = (pl) => 4.2 + 1.7 * ((pl.r && pl.r.spd) != null ? pl.r.spd : 0.5);
    const kW = (pl) => cl((pl.speed || 0) / vref(pl), 0, 1.35);
    // 冲刺权重：速度够快，或按着冲刺键且确实在跑（持球/疲劳降速时也算）
    const spW = (pl) => { const k = kW(pl); return Math.max(ss(0.98, 1.22, k), (pl.sprW || 0) * ss(0.55, 0.85, k)); };
    const tier = (pl) => height(pl) < tune('drTierS', 1.91) ? 'S' : height(pl) >= tune('drTierT', 2.06) ? 'T' : 'M';
    const drTune = (pl, key, defaults) => { const t = tier(pl); return tune(key + t, defaults['SMT'.indexOf(t)]); };
    const sprintDribble = (pl) => pl.anim === 'run' && pl.hasBall && !pl.post;
    const fat = (pl) => cl((40 - (pl.stam == null ? 100 : pl.stam)) / 40, 0, 1);
    // 每帧：冲刺标记平滑、运动负荷（冲刺后累积，停下来慢慢恢复）、呼吸相位按频率积分（换频率不跳）
    function tick(pl, dt, sprint) {
      if (!(dt > 0)) return;
      pl.spr = !!sprint; const s0 = pl.sprW || 0; pl.sprW = s0 + ((sprint ? 1 : 0) - s0) * Math.min(1, dt * (sprint ? 6 : 3));
      const k = kW(pl); let e = pl.exr || 0;
      if (sprint) e += dt * 0.45; else if (k > 0.5) e += dt * (k - 0.5) * 0.06 - dt * 0.05; else e -= dt * (k < 0.15 ? 0.16 : 0.09);
      pl.exr = cl(e, 0, 1);
      pl.brPh = ((pl.brPh || 0) + dt * brRate(pl)) % (Math.PI * 200);
    }
    const brRate = (pl) => 2.4 + 4.6 * (pl.exr || 0) + 5 * fat(pl);
    const brAmp = (pl) => 0.03 + 0.07 * (pl.exr || 0) + 0.05 * fat(pl);
    const brS = (pl) => Math.sin(pl.brPh || 0);
    const br = (pl) => brS(pl) * brAmp(pl);
    // runPh 一周两次落脚；低速放慢，高个球员用更长的步幅，不由运球频率反推步频
    function cad(pl) {
      const v = pl.speed || 0, lo = tune('gaHzMin', 0.45), hi = Math.max(lo, tune('gaHzMax', 2.8));
      return v < 0.05 ? 0 : Math.PI * (lo + (hi - lo) * Math.pow(cl(v / 7.2, 0, 1), 1.4)) * Math.min(1, v / 0.7) * Math.pow(1.95 / height(pl), tune('gaHeight', 0.8));
    }
    // 普通运球按身高缩放；持球冲刺按整档拍球/步数锁定落脚节拍
    function drib(pl) {
      const s = spW(pl), scale = Math.pow(2 / height(pl), tune('drHeight', 1.8)), base = (5.4 + 0.35 * (pl.speed || 0)) * scale;
      if (s < 0.02 || !(pl.speed > 0.9)) return base;
      if (sprintDribble(pl)) {
        const ratio = drTune(pl, 'drStep', [1, 0.5, 0.5]), rate = cad(pl) * ratio;
        let d = (pl.runPh || 0) * ratio - (pl.drib || 0);
        d -= Math.round(d / Math.PI) * Math.PI;
        return base * (1 - s) + s * Math.max(0, rate + 5 * d);
      }
      let d = ((pl.runPh || 0) * scale - Math.PI / 2) - (pl.drib || 0); d = d - Math.round(d / Math.PI) * Math.PI;
      return base + (cad(pl) * scale - base) * s + 5 * s * d;
    }
    function crab(pl, dt, pose = pl.pose) {
      if (!pl.stance || pl.anim !== 'def' || pl.z > 0.01) { pl.crab = null; return; }
      if (!(dt > 0)) return;
      const fx = Math.cos(pl.face), fy = Math.sin(pl.face), Hh = 1 + (height(pl) / 1.95 - 1) * 1.55, w = tune('stWidth', 0.42) * Hh;
      const k = rig(pl, { ...pose, crab: 0 }, false, pl.col && pl.col.body), reach = tune('stReach', 0.3) * Hh;
      const base = (side) => {
        const foot = k[side < 0 ? 'kneeL' : 'kneeR'];
        const forward = (foot[0] - pl.x) * fx + (foot[1] - pl.y) * fy - 0.075 * Hh;
        return [pl.x + fy * side * w + fx * forward,
          pl.y - fx * side * w + fy * forward, 0];
      };
      let c = pl.crab;
      if (!c || Math.abs(c.width - w) > 0.001 || Math.hypot(pl.x - c.x, pl.y - c.y) > 1) {
        const lat = pl.vx * fy - pl.vy * fx;
        c = pl.crab = { x: pl.x, y: pl.y, width: w, phase: 0, side: lat < 0 ? 'L' : 'R', L: base(-1), R: base(1) };
        c.from = c[c.side].slice(); c.to = c.from.slice();
      }
      const previous = { L: c.L.slice(), R: c.R.slice() };
      const turned = c.face != null && Math.abs(pl.face - c.face) > 1e-6;
      c.face = pl.face;
      c.drag = { L: false, R: false };
      c.velocity = c.velocity || { L: [0, 0], R: [0, 0] };
      if (turned) for (const side of ['L', 'R']) {
        const center = base(side === 'L' ? -1 : 1), f = c[side];
        if (f[2] <= 0.001 && Math.hypot(f[0] - center[0], f[1] - center[1]) > reach + 1e-6) c.next = side;
      }
      const dx = pl.x - c.x, dy = pl.y - c.y, distance = Math.hypot(dx, dy);
      const speed = distance / dt;
      if (c.speed != null && speed < c.speed - 0.01 * dt) c.settling = true;
      c.speed = speed;
      c.x = pl.x; c.y = pl.y;
      if (distance < 0.00001 && !c.next && !c.recovering) { c[c.side][2] = Math.max(0, c[c.side][2] - 0.6 * dt); c.rest = c[c.side][2] === 0; c.settling = !c.rest; }
      else {
        if (c.rest) { c.side = dx * fy - dy * fx < 0 ? 'L' : 'R'; c.phase = 0; c.rest = false; }
        const v = distance / dt, lo = tune('stHzMin', 1), hi = Math.max(lo, tune('stHzMax', 2.4));
        const hz = distance < 0.00001 ? lo : cl(v / (tune('stStep', 0.42) + 0.12 * v), lo, hi) * Math.min(1, v / 0.35);
        const step = Math.min(v / hz, reach);
        c.hz = hz; c.lead = dx * fy - dy * fx < 0 ? 'L' : 'R';
        let advance = hz * dt;
        while (advance > 0) {
          if (c.phase === 0) {
            if (c.next) { c.side = c.next; c.next = null; c.recovering = true; c.rest = false; c.settling = false; c.recoveries = (c.recoveries || 0) + 1; }
            c.from = c[c.side].slice(); c.to = base(c.side === 'L' ? -1 : 1);
            if (distance >= 0.00001) { c.to[0] += dx / distance * (v / hz + step); c.to[1] += dy / distance * (v / hz + step); }
            c.lift = tune('stLift', 0.07) * (c.recovering ? 1 : Math.min(1, v / 0.8));
          }
          const take = Math.min(1 - c.phase, advance); c.phase += take; advance -= take;
          const u = c.phase, blend = u * u * (3 - 2 * u), foot = c[c.side];
          foot[0] = c.from[0] + (c.to[0] - c.from[0]) * blend;
          foot[1] = c.from[1] + (c.to[1] - c.from[1]) * blend;
          const lift = u >= 1 ? 0 : Math.sin(Math.PI * u) * c.lift, prevZ = previous[c.side][2];
          foot[2] = c.settling ? cl(lift, Math.max(0, prevZ - 0.6 * dt), prevZ + 0.6 * dt) : lift;
          if (u >= 1 && foot[2] > 0) break;
          if (u >= 1) { foot[2] = 0; c.side = c.side === 'L' ? 'R' : 'L'; c.phase = 0; c.settling = false; c.recovering = false; }
        }
      }
      for (const side of ['L', 'R']) {
        const f = c[side], center = base(side === 'L' ? -1 : 1), x = f[0] - center[0], y = f[1] - center[1], d = Math.hypot(x, y);
        if (d > reach) { f[0] = center[0] + x * reach / d; f[1] = center[1] + y * reach / d; }
        const prev = previous[side], px = prev[0], py = prev[1];
        const grounded = Math.max(f[2], prev[2]) <= 0.001;
        c.drag[side] = grounded && Math.hypot(px - center[0], py - center[1]) > reach + 1e-6;
        const swing = side === c.side && c.phase > 0 && c.phase < 1 && Math.min(f[2], prev[2]) > 0.001 && !c.settling, travel = Math.hypot(f[0] - px, f[1] - py), budget = Math.sqrt(Math.max(0, Math.pow(c.drag[side] ? speed * dt + 0.01 : (swing ? 9 : 0.84) * dt, 2) - Math.pow(f[2] - prev[2], 2)));
        if (travel > budget) { f[0] = px + (f[0] - px) * budget / travel; f[1] = py + (f[1] - py) * budget / travel; }
        if (c.drag[side]) {
          const velocity = c.velocity[side], vx = (f[0] - px) / dt, vy = (f[1] - py) / dt, change = Math.hypot(vx - velocity[0], vy - velocity[1]), mix = Math.min(1, 360 * dt / (change || 1));
          f[0] = px + (velocity[0] + (vx - velocity[0]) * mix) * dt;
          f[1] = py + (velocity[1] + (vy - velocity[1]) * mix) * dt;
          const moved = Math.hypot(f[0] - px, f[1] - py);
          if (moved > budget) { f[0] = px + (f[0] - px) * budget / moved; f[1] = py + (f[1] - py) * budget / moved; }
        }
        c.velocity[side] = [(f[0] - px) / dt, (f[1] - py) / dt];
      }
    }
    // 跑动运球：球在最低点往身前推多少（米）
    function ballFwd(pl) { if (pl.post) return 0; const u = Math.abs(Math.sin(pl.drib || 0)), push = sprintDribble(pl) ? drTune(pl, 'drPush', [0.35, 0.45, 0.55]) : 0.3; return (0.08 * cl(kW(pl), 0, 1) + push * spW(pl)) * (1 - u); }
    // 跑步姿势：替换 poseTarget 里 an==='run' 那一段
    function run(pl, T) {
      const ph = pl.runPh || 0, s = Math.sin(ph), k = kW(pl), sp = spW(pl);
      const stride = cl((pl.speed || 0) / Math.max(0.1, cad(pl) / Math.PI) / (1.2 * height(pl) / 1.95), 0.7, 1.5);
      const amp = (0.14 + 0.62 * k + 0.3 * sp) * stride, ampF = Math.min(amp * (1 + 0.15 * sp), 1.05), ampB = Math.min(amp * (1 - 0.3 * sp), 0.72); // 前摆封顶（高抬腿靠屈膝），后蹬腿别拖成水平线
      const kb = 0.25 + 0.75 * k + 0.75 * sp, c1 = Math.cos(ph - 0.15), bump = (c) => Math.pow(Math.max(0, c), 1.2); // 屈膝只在摆动期（大腿往前摆过竖直时收脚跟），支撑腿基本伸直
      const arm = 0.14 + 0.58 * k + 0.6 * sp, armF = arm * (1 + 0.25 * sp), armB = arm * (1 - 0.1 * sp), el = 0.22 + 0.85 * k + 0.55 * sp;
      const sw = (v, f, b) => (v > 0 ? f * v : b * v);
      T.lean = 0.03 + 0.13 * k + 0.2 * sp; T.lA = sw(s, ampF, ampB); T.rA = sw(-s, ampF, ampB);
      T.lB = 0.12 + 0.12 * k + kb * bump(c1); T.rB = 0.12 + 0.12 * k + kb * bump(-c1);
      T.lS = T.rS = 0.05 + 0.02 * sp;
      T.aLp = sw(-s, armF, armB); T.aRp = sw(s, armF, armB); T.aLe = el; T.aRe = el; T.aLq = T.aRq = 0.12 + 0.06 * (1 - k);
      // 上下起伏：每步一次腾空（冲刺明显，走路几乎没有）
      T.bob = (0.006 + 0.022 * k + 0.085 * sp) * (0.5 - 0.5 * Math.cos(2 * ph + 0.4));
    }
    // poseTarget 末尾：运球手形、冲刺重心与呼吸叠加
    function post(pl, T, an, a) {
      T.crab = an === 'steal' ? T.crab || 0 : pl.crab && an === 'def' ? 1 : 0;
      if (T.crab && an === 'def') {
        const fx = Math.cos(pl.face), fy = Math.sin(pl.face);
        for (const side of ['L', 'R']) {
          const f = pl.crab[side], dx = f[0] - pl.x, dy = f[1] - pl.y;
          T['foot' + side + 'X'] = dx * fy - dy * fx;
          T['foot' + side + 'Y'] = dx * fx + dy * fy;
          T['foot' + side + 'Z'] = f[2];
        }
      }
      if (T.bob == null) T.bob = 0;
      if (pl.pose && pl.pose.bob == null) pl.pose.bob = 0;
      if (T.yaw == null) T.yaw = 0;   // V3.9p 上身/整体视觉转向（rig 用，不改逻辑朝向）
      if (pl.pose && pl.pose.yaw == null) pl.pose.yaw = 0;
      T.reachL = T.reachR = 1;
      if (pl.pose && pl.pose.reachL == null) pl.pose.reachL = pl.pose.reachR = 1;
      const gnd = pl.z <= 0.01 && !pl.stun && !a;
      if (gnd && pl.hasBall && !pl.post && (an === 'run' || an === 'idle')) {
        const u = Math.abs(Math.sin(pl.drib || 0)), sp = an === 'run' ? spW(pl) : 0, k = an === 'run' ? Math.min(1, kW(pl)) : 0;
        // 普通抬肘护球；冲刺前伸，在腰胯高度接球
        const p = (0.36 + 0.34 * u) * (1 - sp) + (0.52 + 0.12 * u) * sp, e = (0.3 + 0.78 * u) * (1 - sp) + (0.5 + 0.55 * u) * sp;
        const R = pl.handX > 0;
        if (R) { T.aRp = p; T.aRe = e; T.aRq = 0.22 - 0.06 * sp; } else { T.aLp = p; T.aLe = e; T.aLq = 0.22 - 0.06 * sp; }
        // 非运球手：走/慢跑时护球半抬，冲刺时跟着摆但幅度减半
        const o = R ? 'aL' : 'aR', s = Math.sin(pl.runPh || 0) * (R ? -1 : 1);
        if (an === 'run') { T[o + 'p'] = 0.35 * (1 - sp) + sp * 0.45 * s * (0.6 + 0.4 * k); T[o + 'e'] = 0.7 * (1 - sp) + Math.PI / 2 * sp; T[o + 'q'] = 0.3 - 0.18 * sp; }
        const lo = 0.06 + tune('drCrouch', 0.32) * cl(kW(pl) / 1.35, 0, 1);
        T.lA += lo * 0.6; T.rA += lo * 0.6; T.lB += lo * 1.3; T.rB += lo * 1.3; T.lean += lo * 0.3;
        if (sp > 0) {
          const wave = Math.sin(pl.runPh || 0), knee = Math.cos((pl.runPh || 0) - 0.15);
          const depth = tune('drCrouch', 0.32) / 0.32 * cl(kW(pl) / 1.2, 0, 1) * [1.08, 1, 0.96]['SMT'.indexOf(tier(pl))];
          for (const [side, sign] of [['l', 1], ['r', -1]]) {
            const a = 0.48 * depth + 0.26 * wave * sign;
            const b = Math.min(0.16 + 1.22 * depth + 0.35 * Math.max(0, knee * sign), a + 1.15);
            T[side + 'A'] += (a - T[side + 'A']) * sp;
            T[side + 'B'] += (b - T[side + 'B']) * sp;
          }
        }
        T.lean += (drTune(pl, 'drLean', [0.30, 0.26, 0.22]) - T.lean) * sp;
        T.tilt += ((R ? 1 : -1) * drTune(pl, 'drRoll', [0.10, 0.08, 0.06]) * (1 + 0.15 * (1 - u)) - T.tilt) * sp;
        T.bob *= 1 - 0.35 * sp;
      }
      if (gnd && (an === 'idle' || an === 'run' || an === 'def' || an === 'post')) {
        // 呼吸：idle 原来固定 2.4rad/s ±0.03；现在频率 / 幅度随负荷、体力变
        const b = br(pl), m = an === 'run' ? 0.4 : 1;
        T.lean += (b - (an === 'idle' ? Math.sin(G0().time * 2.4) * 0.03 : 0)) * m;
        T.aLp += b * 0.9 * m; T.aRp += b * 0.9 * m;
      }
      if (T.flR == null) T.flR = 0; if (T.flL == null) T.flL = 0;   // V4.0 投篮压腕（手指段，rig 用）
      if (pl.pose) { if (pl.pose.flR == null) pl.pose.flR = 0; if (pl.pose.flL == null) pl.pose.flL = 0; }
      if (PH.shotP) PH.shotP.pose(pl, T, an, a);   // V4.0 跳投双手：合球 → 投篮兜辅助手扶侧 → 压腕跟随
      if (PH.scr) PH.scr.pose(pl, T, an, a);
      if (PH.blkP) PH.blkP.pose(pl, T, an, a);   // V3.9s 钉板 / 侧面上篮
      if (PH.cvP) PH.cvP.pose(pl, T, an, a);   // V4.3 被封堵的上篮变体（a.cv）
      if (an === 'layup' && a && !a.inSteps) layReachRim(pl, T, a);
      if (PH.thruP) PH.thruP.pose(pl, T, an, a);   // V4.4 终结顶翻（防守人倒地 / 踉跄、进攻方肩撞）
      if (PH.blkR) PH.blkR.pose(pl, T, an, a);
    }
    const G0 = () => (PH.game && PH.game.G) || { time: 0 };
    // 胸口起伏（rig 里用，世界米）：呼吸吸气时胸、肩、头上提
    const bz = (pl) => (pl.brPh == null ? 0 : (0.5 + 0.5 * brS(pl)) * (0.004 + 0.02 * (pl.exr || 0) + 0.014 * fat(pl)));
    return { tick, cad, drib, crab, ballFwd, run, post, br, brS, bz, kW, spW };
  })();
  PH.gait = GT;

  // ---------- V4.0 跳投手型（1V1 / 5V5 共用：poseTarget → gait.post） ----------
  // 所有非勾手跳投（定点 / 急停 / 漂移 / 后撤 / 转身 / 后仰 / 背身后仰 / 接球投）+ 投篮假动作：
  //   合球下沉（双手持球，球随屈膝落到腰前）→ 举到投篮兜（投篮手在球下，辅助手扶在球侧）
  //   → 出手：投篮手朝篮筐伸直并压腕（flR/flL 手指段），辅助手停在侧面张开，不往前推
  // 腿、身体前后倾、出手时机仍由 game.js 的投篮包（SF：setP 高低、two 两段 / 一段、dip、kick、lean）决定；
  // 这里只按 IK 把两只手放到球上。球的位置仍由 game.js 按“0.72 投篮手 + 0.28 双手中点 + 0.12 上移”算，
  // 所以投篮手放在球下 = 球正好落在目标点，辅助手贴在球侧。
  const SP = (function () {
    const cl = (v, a, b) => Math.max(a, Math.min(b, v)), sm = (u) => { u = cl(u, 0, 1); return u * u * (3 - 2 * u); }, lp = (a, b, u) => a + (b - a) * u;
    const relT = new WeakMap();
    function dims(pl, T) {
      const C = pl.col || {}, bw = C.bw || 1, wg = C.wing || 1, Hh = 1 + (pl.h / 1.95 - 1) * 1.7, fb = Math.max(0.6, 1 + 1.5 * (bw - 1));
      const to = 0.48 * Hh, sw = 0.21 * Hh * (0.55 + 0.45 * fb), sl = Math.sin(T.lean), cs = Math.cos(T.lean), ti = Math.sin(T.tilt || 0), tc = Math.cos(T.tilt || 0);
      const ch = [ti * to, sl * to, cs * tc * to], hk = (to + 0.29 * Hh) / to;
      return { Hh, ua: 0.28 * Hh * wg, fa: 0.26 * Hh * wg, head: [ch[0] * hk, ch[1] * hk, ch[2] * hk], sh: (sd) => [ch[0] + sd * sw * tc, ch[1], ch[2] - 0.03 - sd * sw * ti] };
    }
    // 和 rig.arm 相同的正向运动学（肩为原点，x 右 y 前 z 上）
    function fk(sd, p, q, e, ua, fa) { const q2 = q * 0.4, cq = Math.cos(q), c2 = Math.cos(q2);
      return [sd * Math.sin(q) * ua + sd * Math.sin(q2) * fa, Math.sin(p) * cq * ua + Math.sin(p + e) * c2 * fa, -Math.cos(p) * cq * ua - Math.cos(p + e) * c2 * fa]; }
    // 解 (p, q, e)：解析初值（同 game.js armTo）+ 4 次高斯-牛顿
    function ik(T, sd, v, ua, fa) {
      const r = Math.hypot(v[0], v[1], v[2]) || 1, rc = Math.min(r, (ua + fa) * 0.985);
      let e = Math.acos(cl((rc * rc - ua * ua - fa * fa) / (2 * ua * fa), -1, 1)), q = cl(Math.atan2(sd * v[0], Math.hypot(v[1], v[2])), -0.55, 1.2), p = Math.atan2(v[1], -v[2]) - e * 0.5;
      const sc = rc / r, tg = [v[0] * sc, v[1] * sc, v[2] * sc];
      for (let it = 0; it < 4; it++) {
        const f0 = fk(sd, p, q, e, ua, fa), rr = [tg[0] - f0[0], tg[1] - f0[1], tg[2] - f0[2]]; if (Math.hypot(rr[0], rr[1], rr[2]) < 0.004) break;
        const h = 1e-3, X = [p, q, e], Jc = [];
        for (let j = 0; j < 3; j++) { const Y = X.slice(); Y[j] += h; const f1 = fk(sd, Y[0], Y[1], Y[2], ua, fa); Jc.push([(f1[0] - f0[0]) / h, (f1[1] - f0[1]) / h, (f1[2] - f0[2]) / h]); }
        // (JᵀJ + λI) d = Jᵀr
        const A = [[0, 0, 0], [0, 0, 0], [0, 0, 0]], g = [0, 0, 0];
        for (let i = 0; i < 3; i++) { for (let j = 0; j < 3; j++) A[i][j] = Jc[i][0] * Jc[j][0] + Jc[i][1] * Jc[j][1] + Jc[i][2] * Jc[j][2] + (i === j ? 2e-3 : 0); g[i] = Jc[i][0] * rr[0] + Jc[i][1] * rr[1] + Jc[i][2] * rr[2]; }
        const det = (M) => M[0][0] * (M[1][1] * M[2][2] - M[1][2] * M[2][1]) - M[0][1] * (M[1][0] * M[2][2] - M[1][2] * M[2][0]) + M[0][2] * (M[1][0] * M[2][1] - M[1][1] * M[2][0]);
        const D = det(A); if (!(Math.abs(D) > 1e-12)) break;
        const d = [0, 1, 2].map((c) => det(A.map((row, i) => row.map((x, j) => (j === c ? g[i] : x)))) / D);
        p += d[0]; q = cl(q + d[1], -0.55, 1.2); e = cl(e + d[2], 0, 2.7);
      }
      if (sd > 0) { T.aRp = p; T.aRq = q; T.aRe = e; } else { T.aLp = p; T.aLq = q; T.aLe = e; }
    }
    const BRAD = 0.135;
    // 球心 B（骨盆局部坐标）→ 投篮手 / 辅助手：辅助手偏移 g，投篮手按 game.js 的球位公式反解（球心正好落在 B）
    function hands(T, D, sd, B, g, wS, wG) {
      const s = [-(0.14 * g[0]) / 0.86, -(0.14 * g[1]) / 0.86, -(0.14 * g[2] + 0.12) / 0.86];
      const HS = [B[0] + s[0], B[1] + s[1], B[2] + s[2]], HG = [B[0] + g[0], B[1] + g[1], B[2] + g[2]];
      const T2 = Object.assign({}, T), s0 = D.sh(sd), g0 = D.sh(-sd);
      ik(T2, sd, [HS[0] - s0[0], HS[1] - s0[1], HS[2] - s0[2]], D.ua, D.fa);
      ik(T2, -sd, [HG[0] - g0[0], HG[1] - g0[1], HG[2] - g0[2]], D.ua, D.fa);
      for (const k of ['p', 'q', 'e']) { const kS = (sd > 0 ? 'aR' : 'aL') + k, kG = (sd > 0 ? 'aL' : 'aR') + k; T[kS] = lp(T[kS], T2[kS], wS); T[kG] = lp(T[kG], T2[kG], wG); }
    }
    function gather(pl, T, dip) {
      const D = dims(pl, T), H = D.Hh, sd = pl.arch.lefty ? -1 : 1;
      const B = [sd * (0.06 + 0.14 * dip) * H, (0.3 + 0.04 * dip) * H, (0.5 - 0.21 * dip) * H];
      hands(T, D, sd, B, [-sd * (BRAD + 0.035), -0.01, 0.02], 1, 1 - dip);
    }
    function pose(pl, T, an, a) {
      if (!a || !(an === 'shoot' || an === 'fake')) return;
      if (an === 'shoot' && (a.type !== 'shot' || !a.V || a.V.hook)) return;
      if (a.stride && a.t < a.stride.T) return;
      if (an === 'fake' && a.type !== 'fake') return;
      const GM = PH.game || {}, K = GM.K || {}, F = (a.F) || (GM.SF && GM.SF.std) || { setP: 2.7, dip: 1, two: true };
      const sd = (an === 'fake' ? pl.arch && pl.arch.lefty : a.lefty) ? -1 : 1, D = dims(pl, T), H = D.Hh, hd = D.head;
      // 投篮兜：头前上方、偏投篮手一侧；高低按投篮包 setP（胸前推射 2.1 → 外星高点 3.08）
      const k = cl((F.setP - 2.1) / 0.98, 0, 1), push = !!F.push;
      const S = [hd[0] + sd * (0.07 + 0.03 * k) * H, hd[1] + (push ? 0.3 : 0.17 + 0.03 * (1 - k)) * H, hd[2] + (-0.1 + 0.2 * k) * H + 0.2];   // 高低差收窄：各投篮包出手球高（相对起跳）均值与旧版持平 ≈2.18m，盖帽平衡不变
      const chestB = [sd * 0.06 * H, 0.3 * H, 0.5 * H], dipB = [sd * 0.09 * H, 0.27 * H, (0.28 - 0.1 * ((F.dip || 1) - 0.8)) * H];
      const gSide = [-sd * (BRAD + 0.035), -0.01, 0.02];   // 辅助手：贴在球的外侧
      if (an === 'fake') { const u = sm((a.t || 0) / 0.14); const B = [lp(chestB[0], S[0], u), lp(chestB[1], S[1], u), lp(chestB[2], S[2] - 0.08 * H, u)]; hands(T, D, sd, B, gSide, 1, 1); return; }
      const strideT = a.stride ? a.stride.T : 0;
      const jT = (a.jT || K.shotJump || 0.12) - strideT, TI = (a.ideal || 0.5) - strideT, t = (a.t || 0) - strideT, rel = !!a.released;
      const AS = sd > 0 ? ['aRp', 'aRq', 'aRe'] : ['aLp', 'aLq', 'aLe'], A0 = {}; for (const n of AS) A0[n] = T[n];   // 投篮包原本的投篮手角度
      if (!rel) {
        let B;
        if (t < jT) {
          // 合球下沉：前 55% 球随屈膝落到腰前，后 45% 跟着起跳回到胸前
          const u = t / jT; B = u < 0.55 ? chestB.map((c, i) => lp(c, dipB[i], sm(u / 0.55))) : dipB.map((c, i) => lp(c, chestB[i], sm((u - 0.55) / 0.45)));
        } else {
          // 举球：两段式先到投篮兜停住，一段式一路连到出手
          const u = cl((t - jT) / Math.max(0.05, TI - jT), 0, 1), w = F.two ? sm(u / 0.5) : sm(u);
          B = chestB.map((c, i) => lp(c, S[i], w));
          if (!F.two) B[2] += 0.05 * H * Math.sin(Math.PI * u);   // 一段式：举球路径稍弧
        }
        hands(T, D, sd, B, gSide, 1, 1);
        // 出手前最后 0.2s：投篮手伸回投篮包原本的出手点（setP / setE，各人高低出手点和旧版一致 → 出手高度、盖帽平衡不变），
        // 辅助手留在球侧不动 → 自然离球
        const pe = sm(cl((t - (TI - 0.2)) / 0.12, 0, 1));
        if (pe > 0) for (const n of AS) T[n] = lp(T[n], A0[n], pe);
        if (sd > 0) T.flR = 0; else T.flL = 0;
        return;
      }
      // 出手后：投篮手朝篮筐方向伸直 + 压腕；辅助手停在投篮兜外侧张开（离开球，不跟着往前送）
      if (!relT.has(a)) relT.set(a, t);
      const v = sm((t - relT.get(a)) / 0.09), s0 = D.sh(sd), L = (D.ua + D.fa) * 0.97;
      const el = push ? 0.85 : lp(1.1, 1.4, k), fx = [sd * 0.03, Math.cos(el), Math.sin(el)];
      const T2 = Object.assign({}, T); ik(T2, sd, fx.map((c) => c * L), D.ua, D.fa);
      for (const n of AS) T2[n] = lp(A0[n], T2[n], v);   // 从投篮包出手点伸到压腕
      const g0 = D.sh(-sd), HG = [S[0] - sd * (BRAD + 0.035 + 0.07 * v), S[1] - 0.03 * v, S[2] - 0.03 * v];
      ik(T2, -sd, [HG[0] - g0[0], HG[1] - g0[1], HG[2] - g0[2]], D.ua, D.fa);
      for (const n of ['aRp', 'aRq', 'aRe', 'aLp', 'aLq', 'aLe']) T[n] = T2[n];
      if (sd > 0) T.flR = v; else T.flL = v;
    }
    return { pose: pose, gather: gather, ik: ik, fk: fk };
  })();
  PH.shotP = SP;

  // ---------- V3.9n 挡拆被挡分档（5V5；team5.js 的挡拆接触挂 PH.scr.hit，无球掩护在 gait.tick 里通用判定） ----------
  // 档位：1 轻（擦过减速）2 中（顶住停顿后仰）3 重（撞开踉跄转身，浮字"好掩护"）4 最重（坐倒，浮字"挡倒"，≈ 严重晃倒）
  // 分档分数 = 撞击速度 × 吨位比 × 掩护能力 / 挤过能力 × 看没看见（背后挡更重）× 随机 0.8~1.2
  const SC = (function () {
    const cl = (v, a, b) => (v < a ? a : v > b ? b : v), rr = (a, b) => a + Math.random() * (b - a);
    const U = (p, f) => (p && p.r5 ? p.r5[f] || 0 : 0), GM = () => PH.game, GG = () => PH.game.G;
    const hasB = (p, b) => { try { return !!(GM().hasB && GM().hasB(p, b)); } catch (e) { return false; } };
    const pow = (p) => (GM().t5 && GM().t5.powOf ? GM().t5.powOf(p) : 0.55 * (p.r.bw || 1) + 0.25 * (p.h - 1.7) / 0.4 + 0.45 * p.r.str);
    const agil = (p) => cl(0.5 * p.r.acc + 0.3 * p.r.spd + 0.2 * p.r.def, 0, 1);
    // 掩护能力：力量、体重、球商（无球跑动意识 iq），有"推土机"徽章加成
    const skS = (s) => cl(0.45 * s.r.str + 0.25 * cl(((s.r.bw || 1) - 0.8) / 0.6, 0, 1) + 0.3 * (0.5 + U(s, 'iq')) + (GM().ba ? GM().ba(s, 'bully', 0.15) : hasB(s, 'bully') ? 0.15 : 0), 0, 1.2);
    // 挤过能力：敏捷、外线防守、协防意识，"锁死"徽章加成
    const skD = (d) => cl(0.5 * agil(d) + 0.3 * d.r.def + 0.2 * (0.5 + U(d, 'hlp')) + (GM().ba ? GM().ba(d, 'clamps', 0.12) : hasB(d, 'clamps') ? 0.12 : 0), 0, 1.2);
    const TH = [0.62, 1.2, 2.0];   // 档位门槛（sim 校准：最重档每场 1~3 次）
    const CF = () => (PH.T5 && PH.T5.scrCfg) || {};
    const S = { T: null, g: null, rec: [], lastShot: null, all: [] };
    const newG = () => ({ n: [0, 0, 0, 0, 0], on: [0, 0, 0, 0, 0], off: [0, 0, 0, 0, 0], sh: { on: [0, 0], off: [0, 0], none: [0, 0] }, shT: { 1: [0, 0], 2: [0, 0], 3: [0, 0], 4: [0, 0] }, ty: {} });
    function cur() { const T5 = PH.T5 && PH.T5.T; if (S.T !== T5 || !S.g || (T5 && T5.time < S.t0)) { S.T = T5; S.g = newG(); S.all.push(S.g); S.rec = []; S.lastShot = null; } S.t0 = T5 ? T5.time : 0; return S.g; }
    function score(s, d, tgt) {
      const dx = s.x - d.x, dy = s.y - d.y, l = Math.hypot(dx, dy) || 1, nx = dx / l, ny = dy / l;
      let vrel = Math.max(0, (d.vx - (s.vx || 0)) * nx + (d.vy - (s.vy || 0)) * ny);
      // 追人路线上被挡：防守人朝他要追的人跑的速度、被追的人借掩护甩开的速度都算撞击速度（掩护人在路线前方才算）
      if (tgt) { const ux = tgt.x - d.x, uy = tgt.y - d.y, ul = Math.hypot(ux, uy) || 1, ex = ux / ul, ey = uy / ul;
        if (nx * ex + ny * ey > 0.25) vrel = Math.max(vrel, 0.85 * Math.max(0, d.vx * ex + d.vy * ey), 0.6 * Math.max(0, (tgt.vx || 0) * ex + (tgt.vy || 0) * ey)); }
      const c = Math.cos(d.face) * nx + Math.sin(d.face) * ny, blind = c < 0.35 ? 1 + 0.55 * (0.35 - c) / 1.35 : 1;
      const v = Math.pow(cl(vrel / 4.2, 0, 2), 1.15), m = Math.pow(pow(s) / Math.max(0.5, pow(d)), 0.85);
      return { k: v * m * (0.7 + 0.6 * skS(s)) / (0.7 + 0.6 * skD(d)) * blind * rr(0.8, 1.2), nx, ny, blind: blind > 1.15, vrel };
    }
    function stun(d, t, k, sd) { if (d.stun >= t) return; if (!d.hasBall) d.action = d.action && d.action.type === 'block' ? d.action : null; d.stun = t; d.stunK = k; d.stunT0 = t; d.spinD = sd; d.spinF0 = d.face; d.spinA = Math.PI * 0.55; d.spinW = 0.42; }
    // 撞上掩护：kind 'pnr' 有球挡拆 / 'off' 无球掩护；返回档位 1~4
    function hit(s, d, kind, now, tgt, typ, force) {
      const C = CF(), th = C.TH || TH, dK = C.dK || 1, sK = C.sK || 1, pK = C.pK || 1;   // V3.9p team5 调参钩子（PH.T5.scrCfg），不设时和原来一样
      const g = cur(), r = score(s, d, tgt), B5 = PH.B5, k = r.k * (B5 ? B5.scrK(s, d) : 1), t0 = k < th[0] ? 1 : k < th[1] ? 2 : k < th[2] ? 3 : 4, tier = force || (B5 ? B5.scrT(s, d, t0, kind) : t0);   // force：QA 截图指定档位；V3.9o 人墙 / 挤过掩护 / 掩护大师 / 防守指挥（js/b5.js）
      const f = d.f5 || (d.f5 = {}); f.scr = now; const side = (r.nx * Math.sin(d.face) - r.ny * Math.cos(d.face)) >= 0 ? 1 : -1;
      const p2 = C.p2 || 0;
      if (tier === 1) { f.scrD = 0.4 * dK; f.scrK = 0.6; d.vx *= 0.55; d.vy *= 0.55; }
      else if (tier === 2) { f.scrD = 0.85 * dK; f.scrK = 0.45; d.vx = d.vx * 0.15 - r.nx * p2; d.vy = d.vy * 0.15 - r.ny * p2; stun(d, 0.38 * sK, 'off', side); }
      else if (tier === 3) { f.scrD = 1.25 * dK; f.scrK = 0.5; d.vx = -r.nx * 1.6 * pK; d.vy = -r.ny * 1.6 * pK; stun(d, 0.62 * sK, 'spin', side); }
      else { f.scrD = 1.8 * dK; f.scrK = 0.5; d.vx = -r.nx * 2.2 * pK; d.vy = -r.ny * 2.2 * pK; d.z = 0; stun(d, 1.25 * sK, 'fall', side); }
      if (B5) B5.scrD(s, d, tier, f);
      d.scrHit = { t: GG().time, tier, side, dx: -r.nx, dy: -r.ny, dur: [0, 0.4, 0.6, 0.7, 1.25][tier] * (tier === 1 ? 1 : sK) }; s.scrImp = { t: GG().time, tier, nx: r.nx, ny: r.ny };
      s.sqv = (s.sqv || 0) - (1.5 + tier); d.sqv = (d.sqv || 0) - (1 + tier * 0.8);
      { const sw = B5 ? B5.scrSway(s) : 1; s.vx = (s.vx || 0) + r.nx * 0.25 * tier * sw; s.vy = (s.vy || 0) + r.ny * 0.25 * tier * sw; }   // 掩护人被冲得晃一下
      if (tier >= 3 && GM().t5 && GM().t5.float) GM().t5.float(tier === 4 ? '挡倒' : '好掩护', s, tier === 4 ? '#ffd24a' : '#9ef0ff', 1);
      if (tier >= 3 && GM().t5 && GM().t5.sfx) try { GM().t5.sfx('bump'); } catch (e) {}
      g.n[tier]++; g[kind === 'pnr' ? 'on' : 'off'][tier]++; const ty = typ || (kind === 'pnr' ? 'pnr' : 'gen'); (g.ty[ty] || (g.ty[ty] = [0, 0, 0, 0, 0]))[tier]++; (g.ks || (g.ks = [])).push(+k.toFixed(2));
      const m = tgt || (kind === 'pnr' ? (PH.T5.T.pick && PH.T5.T.pick.h) : d.mark);
      if (m && GM().t5.legendScreen) GM().t5.legendScreen(s, d, m);
      if (m) S.rec.push({ id: m.id, t: PH.T5.T.time, tier, kind: kind === 'pnr' ? 'on' : 'off' });
      return tier;
    }
    // 每帧（gait.tick 里，按防守人调用）：无球掩护通用判定——站定的进攻人（非持球、非正在做挡拆的人）挡住追自己人的防守人
    // team5.js tick 里 passUpdate 之后每帧调用一次
    function step(T5) {
      const G = GG(); if (!T5 || !T5.on || G.mode !== 't5' || !T5.tm) return;
      shots(T5, G);
      if (T5.phase !== 'live' || G.ball.state === 'shot') return;
      for (const d of T5.tm[1 - G.off].on) tick(d, T5, G, T5.tm[G.off].on);
    }
    function tick(pl, T5, G, O) {
      const d = pl, f = d.f5 || {}; if (d.stun > 0 || d.off || d.z > 0.05 || (d.action && d.action.type !== 'move') || !(d.speed > 1.6) || f.scr > T5.time - 1.0 || !d.mark) return;
      for (const s of O) {
        if (s === d.mark || s.hasBall || s.z > 0.05 || s.action || s.stun > 0 || (s.speed || 0) > 1.4 || (T5.pick && T5.pick.s === s && d.opp === T5.pick.h)) continue;
        const dx = s.x - d.x, dy = s.y - d.y, l = Math.hypot(dx, dy), rc = 0.84 + 0.1 * ((s.r.bw || 1) + (d.r.bw || 1) - 2);   // 身体碰撞半径 0.78（game.js collide）
        if (l > rc || l < 0.05) continue;
        // 防守人在往掩护人身上跑（追人路线被挡），而且他追的人在掩护人另一侧
        if ((d.vx * dx + d.vy * dy) / l < 1.0) continue;
        const mx = d.mark.x - d.x, my = d.mark.y - d.y; if (mx * dx + my * dy <= 0) continue;
        hit(s, d, d.mark.hasBall ? 'pnr' : 'off', T5.time, d.mark, s.f5 && s.f5.scrSet && s.f5.scrSet.type); return;
      }
    }
    function shots(T5, G) {
      const g = cur(), b = G.ball; S.rec = S.rec.filter((r) => T5.time - r.t < 2);
      if (b.state === 'shot' && b.shot && b.shot !== S.lastShot && b.shot.t < 0.1) {
        S.lastShot = b.shot; const r = S.rec.filter((q) => q.id === b.shot.shooter).sort((a, c) => c.tier - a.tier)[0], mk = b.shot.made ? 1 : 0;
        const k = r ? r.kind : 'none'; g.sh[k][0]++; g.sh[k][1] += mk; if (r) { g.shT[r.tier][0]++; g.shT[r.tier][1] += mk; }
      }
    }
    // 姿势叠加（gait.post 末尾）：被挡人擦过歪肩 / 顶住后仰 / 踉跄；掩护人站定张臂、受冲击晃一下
    function dust(pl, dx, dy, n, sp) { const M = GM(); if (!M || !M.part) return; for (let i = 0; i < n; i++) { const a = Math.random() * 6.283, v = (0.3 + Math.random() * 0.7) * sp; M.part(pl.x + Math.cos(a) * 0.25, pl.y + Math.sin(a) * 0.15, 0.05, dx * sp * 0.8 + Math.cos(a) * v, dy * sp * 0.8 + Math.sin(a) * v * 0.6, 0.6 + Math.random() * 0.8, ['#d9c39a', '#efe2c4', '#b59a6e'][i % 3], 0.35 + Math.random() * 0.25, 3, 1); } }
    function pose(pl, T, an, a) {
      const G = GG(), h = pl.scrHit, now = G.time;
      if (h && now - h.t < (h.dur || 0.9) + 0.25) {
        // V3.9p 加强：时长跟 scrHit.dur（team5 scrCfg.sK 拉长时姿势撑满）
        const e = now - h.t, D = h.dur || [0, 0.4, 0.6, 0.7, 1.25][h.tier] || 0.6, u = e / D, sd = h.side || 1, out = u > 1 ? Math.max(0, 1 - (e - D) / 0.25) : 1;
        if (h.tier === 1 && u < 1) { const w = 1 - u; T.tilt = (T.tilt || 0) + 0.36 * sd * w; T.yaw += 0.35 * sd * w; T.lean -= 0.16 * w; T.aLq += 0.4 * w; T.aRq += 0.4 * w; }
        else if (h.tier === 2) {
          // 中：前 45% 被顶住停滞（后仰、前臂护胸、膝弯、抖），后 55% 侧身挤过（转体 ~60°、侧倾、横滑步、前手探出）
          if (u < 0.45) { const w = Math.min(1, e / 0.06) * out, sh = Math.sin(e * 46) * 0.05;
            T.lean = T.lean * (1 - w) + (-0.4 + sh) * w; T.lA = 0.35 * w + T.lA * (1 - w); T.rA = 0.35 * w + T.rA * (1 - w); T.lB = 0.8; T.rB = 0.8; T.lS = 0.3; T.rS = 0.3;
            T.aLp = 1.3; T.aRp = 1.3; T.aLq = 0.25; T.aRq = 0.25; T.aLe = 1.6; T.aRe = 1.6; T.tilt = sh * sd; T.bob = -0.04; }
          else { const v = Math.min(1, (u - 0.45) / 0.15) * out, st = Math.sin((e - 0.45 * D) * 17);
            T.yaw += 1.05 * sd * v; T.tilt = (T.tilt || 0) + 0.28 * sd * v; T.lean = T.lean * (1 - v) + 0.22 * v;
            T.lS = T.lS * (1 - v) + (0.32 + 0.18 * st) * v; T.rS = T.rS * (1 - v) + (0.32 - 0.18 * st) * v; T.lB = T.lB * (1 - v) + 0.75 * v; T.rB = T.rB * (1 - v) + 0.75 * v;
            const L = sd > 0 ? 'aR' : 'aL', B = sd > 0 ? 'aL' : 'aR'; T[L + 'p'] = T[L + 'p'] * (1 - v) + 1.35 * v; T[L + 'q'] = 0.35; T[L + 'e'] = 0.3; T[B + 'p'] = 0.9; T[B + 'q'] = 0.5; T[B + 'e'] = 1.4; }
        } else if (h.tier === 3 && u < 1) {
          // 重：被撞开——前 0.22s 整个人往后弹（大后仰、两臂甩开、一条腿离地），之后拖步滑开、侧倾慢慢回正
          const w = 1 - u;
          if (e < 0.22) { const k = Math.sin(Math.min(1, e / 0.22) * Math.PI * 0.5);
            T.lean = -0.62 * k + T.lean * (1 - k); T.yaw += 0.4 * sd * k; T.aLp = 2.3; T.aRp = 2.0; T.aLq = 1.35; T.aRq = 1.25; T.aLe = 0.2; T.aRe = 0.3;
            T.lA = -0.45; T.lB = 1.15; T.rA = 0.35; T.rB = 0.25; T.lS = 0.42; T.rS = 0.5; T.bob = 0.05 * k; }
          else { T.tilt = (T.tilt || 0) + 0.42 * sd * w; T.lean -= 0.3 * w; T.lS += 0.22 * w; T.rS += 0.22 * w; T.yaw += 0.3 * sd * w; }
          if (!h.dust) { h.dust = 1; dust(pl, h.dx || 0, h.dy || 0, 5, 0.7); }
        } else if (h.tier === 4 && !h.dust) { h.dust = 1; dust(pl, h.dx || 0, h.dy || 0, 7, 0.9); }
      }
      const T5 = PH.T5 && PH.T5.T, P = T5 && T5.on && T5.pick, im = pl.scrImp, setNow = pl.screen3 || P && P.s === pl && P.ph === 'set';
      const imE = im ? now - im.t : 9;
      if ((setNow || imE < 0.6) && !a && pl.z <= 0.01 && !(pl.stun > 0) && !pl.hasBall) {
        // 站定：脚分开、膝微屈、两臂张开护在胸前
        T.lean = 0.14; T.lA = 0.22; T.rA = 0.22; T.lB = 0.55; T.rB = 0.55; T.lS = 0.34; T.rS = 0.34; T.tilt = 0;
        T.aLp = 0.75; T.aRp = 0.75; T.aLq = 0.95; T.aRq = 0.95; T.aLe = 0.9; T.aRe = 0.9; T.bob = 0;
        if (imE < 0.6) { const w = Math.exp(-imE * 6) * (0.6 + 0.25 * im.tier); T.lean -= 0.35 * w * Math.cos(imE * 26); T.aLq += 0.3 * w; T.aRq += 0.3 * w; }
      }
    }
    function stats() { cur(); return S.all; }
    return { hit, step, pose, stats, score, TH, S };
  })();
  PH.scr = SC;

  // ---------- V3.9o 专属技能半屏插屏（1V1 / 5V5 共用，DOM 面板 #cutin.ci2；动画按游戏时间 c.t 驱动，不冻结比赛） ----------
  // 面板占舞台约 40%×31%，从左或右边斜切滑入，按持球人（含投篮条）和篮筐的屏幕位置自动选不遮挡的角落
  const CI = (function () {
    // V4.0 停留时长进调参台（rules 组）：半屏插画 l1_ciDur、全屏特效 l1_ciFx；5V5 / 短插屏按 ×0.75
    //   旧值：1V1 半屏 1.2s、5V5 0.9s；全屏只有 0.12s 闪光。仍不冻结、不慢放，只是停留更久再淡出
    const TG = (k, d) => { const T = PH.TUNE; return T && T.has && T.has(k) ? +T.get(k) : d; };
    if (PH.TUNE && PH.TUNE.reg && !(PH.TUNE.has && PH.TUNE.has('l1_ciDur'))) PH.TUNE.reg([
      { k: 'l1_ciDur', g: 'rules', label: '专属半屏插画停留', v: 2.0, min: 0.6, max: 4, step: 0.1, note: '秒：1V1 专属技能半屏插画从滑入到淡出的总时长（5V5 和进球短插屏 ×0.75）；不冻结画面' },
      { k: 'l1_ciFx', g: 'rules', label: '专属全屏特效时长', v: 1.4, min: 0.2, max: 4, step: 0.1, note: '秒：专属技能触发时全屏金色闪光 + 边缘光晕的时长（5V5 ×0.75）；画面中间不遮挡' },
    ].map((d) => ({ ...d, display: CAMERA_DISPLAY[d.k] })));
    const k5 = (c) => (c && (c.short || c.five) ? 0.75 : 1);
    const pDur = (c) => TG('l1_ciDur', 2.0) * k5(c), fDur = (c) => TG('l1_ciFx', 1.4) * k5(c);
    const dur = (c) => Math.max(pDur(c), fDur(c));
    // 全屏特效层：#stage 里一层 div（在 HUD 下面），金白闪光 + 队色边缘光晕，按 c.t 驱动
    let fxEl = null, fxSeq = -1;
    function fxFrame(c, el) {
      if (!fxEl) { const st = el.parentNode; if (!st) return; fxEl = document.createElement('div'); fxEl.id = 'cifx'; fxEl.setAttribute('data-testid', 'cifx');
        fxEl.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:3;opacity:0'; st.insertBefore(fxEl, el);
        // 插屏结束 / 隐藏 / 回放时自动熄灭（main.js 不再调 frame 时由这里收尾）
        const chk = () => { const G = PH.game && PH.game.G, cc = G && G.cutin; if (!cc || cc.seq !== fxSeq || el.classList.contains('hidden') || (st.classList && st.classList.contains('replay'))) fxEl.style.opacity = '0'; requestAnimationFrame(chk); };
        requestAnimationFrame(chk); }
      fxSeq = c.seq;
      const D = fDur(c), t = c.t, u = t / D; if (!(u < 1)) { fxEl.style.opacity = '0'; return; }
      const col = /^#[0-9a-f]{6}$/i.test(c.col || '') ? c.col : '#ffd24a';
      const env = cl(t / 0.06, 0, 1) * (u < 0.55 ? 1 : 1 - (u - 0.55) / 0.45), fl = 0.42 * cl(1 - t / 0.22, 0, 1), pu = 0.75 + 0.25 * Math.abs(Math.sin(t * 9));
      fxEl.style.background = 'radial-gradient(ellipse 72% 68% at 50% 52%, transparent 58%, ' + col + '55 82%, ' + col + 'cc 100%), radial-gradient(ellipse 90% 85% at 50% 50%, transparent 70%, rgba(255,210,74,0.5) 100%), rgba(255,240,190,' + fl.toFixed(3) + ')';
      fxEl.style.opacity = (env * pu).toFixed(3);
    }
    const cl = (v, a, b) => Math.max(a, Math.min(b, v));
    const PW = 0.4, PH_ = 0.31;
    function pts(G, screen) {
      // 返回需要避开的矩形（舞台比例 0~1）：持球人 / 出手人（头到脚 + 右侧投篮条）、篮筐
      const five = screen === 'play5', cv = document.getElementById('game'); if (!cv) return [];
      const W = cv.width, H = cv.height, out = [], b = G.ball;
      const pj = (x, y, z) => (five ? (PH.render5 && PH.render5.proj(x, y, z)) : PH.render.proj(x, y, z));
      const box = (x0, y0, x1, y1) => out.push([x0 / W, y0 / H, x1 / W, y1 / H]);
      const c = G.cutin, who = new Set(); if (c) who.add(c.pid);
      if (b && b.holder != null && b.holder >= 0) who.add(b.holder);
      if (b && b.shot && b.shot.shooter != null) who.add(b.shot.shooter);
      for (const id of who) {
        const p = G.players[id]; if (!p) continue;
        const hd = five ? p.__head : p.headScreen;
        let P = hd; if (!P) { const q = pj(p.x, p.y, 1.8); if (!q) continue; P = { x: q.x, y: q.y, s: q.s / 3 }; }
        const k = Math.max(10, P.s || 20);
        box(P.x - 0.9 * k, P.y - 1.0 * k, P.x + 1.3 * k, P.y + 2.6 * k);
      }
      const HO = PH.render.HOOP; if (HO) { const r = pj(HO.x, HO.y, 3.05); if (r) { const k = Math.max(8, r.s * 0.6); box(r.x - 1.6 * k, r.y - 2.2 * k, r.x + 1.6 * k, r.y + 1.4 * k); } }
      return out;
    }
    function pick(G, screen) {
      const R = pts(G, screen), cands = [['L', 'b'], ['R', 'b'], ['L', 't'], ['R', 't']];
      let best = null, bs = 1e9;
      for (const [sd, vt] of cands) {
        const x0 = sd === 'L' ? 0 : 1 - PW, y0 = vt === 'b' ? 1 - PH_ - (screen === 'play5' ? 0.14 : 0.07) : 0.15, x1 = x0 + PW, y1 = y0 + PH_;
        let ov = 0; for (const r of R) ov += Math.max(0, Math.min(x1, r[2]) - Math.max(x0, r[0])) * Math.max(0, Math.min(y1, r[3]) - Math.max(y0, r[1]));
        const sc = ov * 100 + (vt === 't' ? 0.05 : 0) + (sd === 'R' ? 0.01 : 0);
        if (sc < bs) { bs = sc; best = { sd: sd, vt: vt, ov: ov }; }
      }
      return best;
    }
    // V4.0 默认位置：触发方信息卡（1V1 #pc0/#pc1，5V5 #pc50/#pc51）正下方，左上 / 右上，宽 37%，下沿不超过 48%，和信息卡连成一块
    //   万一挡到持球人 / 投篮条 / 篮筐，退回旧的四角选位
    function cardBox(G, screen, c) {
      const five = screen === 'play5', pl = G.players[c.pid]; if (!pl) return null;
      const R = five ? pl.tm === 1 : c.pid === 1, st = document.getElementById('stage'), cd = document.getElementById((five ? 'pc5' : 'pc') + (R ? 1 : 0)); if (!st) return null;
      const sr = st.getBoundingClientRect(); if (!(sr.width > 0)) return null;
      let top = 0.04; if (cd && !cd.classList.contains('hidden')) { const r = cd.getBoundingClientRect(); if (r.height > 0 && getComputedStyle(cd).display !== 'none') top = (r.bottom - sr.top) / sr.height + 0.006; }
      const w = 0.37, h = cl(0.48 - top, 0.22, 0.31), x0 = R ? 1 - w : 0, B = [x0, top, x0 + w, top + h];
      let ov = 0; for (const q of pts(G, screen)) ov += Math.max(0, Math.min(B[2], q[2]) - Math.max(B[0], q[0])) * Math.max(0, Math.min(B[3], q[3]) - Math.max(B[1], q[1]));
      return ov > 0.003 ? null : { sd: R ? 'R' : 'L', vt: 'c', box: B, ov: ov };
    }
    const ease = (u) => 1 - Math.pow(1 - cl(u, 0, 1), 3);
    function frame(c, el, screen) {
      const G = PH.game && PH.game.G; if (!G || !el) return;
      if (el.__ciSeq !== c.seq) { el.__ciSeq = c.seq; el.__ci = cardBox(G, screen, c) || pick(G, screen); el.classList.add('ci2');
        const b = el.__ci.box, S = el.style, pc = (v) => (v * 100).toFixed(2) + '%';
        if (b) { S.top = pc(b[1]); S.bottom = 'auto'; S.width = pc(b[2] - b[0]); S.height = pc(b[3] - b[1]); S.left = el.__ci.sd === 'R' ? 'auto' : '0'; S.right = el.__ci.sd === 'R' ? '0' : 'auto'; }
        else S.top = S.bottom = S.width = S.height = S.left = S.right = ''; }
      fxFrame(c, el);
      const P = el.__ci || { sd: 'L', vt: 'b' }, D = pDur(c), t = cl(c.t, 0, D), R = P.sd === 'R';
      el.classList.toggle('right', R); el.classList.toggle('ci-top', P.vt !== 'b'); el.classList.toggle('ci-five', screen === 'play5');
      el.dataset.side = P.sd + P.vt;
      // 滑入 0~0.16s（超出 6% 回弹），停留时抖动衰减，最后 0.35s 淡出并斜着滑走
      const ui = t / 0.16, uo = (t - (D - 0.35)) / 0.35;
      let x = ui < 1 ? -1.15 * (1 - ease(ui)) + 0.06 * Math.sin(ui * Math.PI) : uo > 0 ? -0.6 * Math.pow(cl(uo, 0, 1), 2) : 0;
      const sh = t > 0.12 && t < 0.6 ? (1 - (t - 0.12) / 0.48) * 5 : 0, n = Math.floor(t * 40);
      const jx = sh * (((n * 7919) % 11) / 5 - 1), jy = sh * 0.6 * (((n * 104729) % 9) / 4 - 1);
      el.style.transform = 'translate(calc(' + (R ? -x : x) * 100 + '% + ' + jx.toFixed(1) + 'px), ' + jy.toFixed(1) + 'px)';
      el.style.opacity = uo > 0 ? String(cl(1 - uo, 0, 1)) : '1';
      el.style.setProperty('--ci-ln', (t * 900).toFixed(0) + 'px');        // 速度线流动
      el.style.setProperty('--ci-sh', (cl((t - 0.1) / 0.45, 0, 1) * 260 - 80).toFixed(0) + '%');   // 光带扫过
      el.style.setProperty('--ci-fl', cl(1 - t / 0.14, 0, 1).toFixed(2));  // 入场白闪
      el.style.setProperty('--ci-pz', (1 + 0.28 * cl(1 - (t - 0.08) / 0.22, 0, 1)).toFixed(3));   // 头像冲击放大
      el.style.setProperty('--ci-glow', (0.55 + 0.45 * Math.abs(Math.sin(t * 14))).toFixed(2));
    }
    return { dur: dur, frame: frame, pick: pick, pts: pts };
  })();
  PH.ci = CI;

  // ---------- V3.9p 被盖帽的进攻人：三档表现（1V1 / 5V5 共用，只画姿态；位移 / z 由逻辑层负责） ----------
  // 状态：p.blkR = { tier: 1|2|3, t: 开始时的 G.time（或 e: 已过秒数）, dur, dx, dy: 被扇方向单位向量 }
  //   3 重：空中被扇后仰 → 摔地平躺僵直 → 撑地爬起（落地尘土 + 轻震屏）
  //   2 中：落地后向后踉跄 2~3 步，两臂乱甩
  //   1 轻：落地短暂摇晃、重心不稳
  const BR = (function () {
    const cl = (v, a, b) => Math.max(a, Math.min(b, v)), lp = (a, b, u) => a + (b - a) * u, sm = (u) => { u = cl(u, 0, 1); return u * u * (3 - 2 * u); };
    const KEYS = ['lean', 'tilt', 'yaw', 'bob', 'lA', 'lB', 'lS', 'rA', 'rB', 'rS', 'aLp', 'aLq', 'aLe', 'aRp', 'aRq', 'aRe'];
    const mix = (T, o, w) => { for (const k of KEYS) if (o[k] != null) T[k] = (T[k] || 0) * (1 - w) + o[k] * w; };
    const lerpO = (A, B, u) => { const o = {}; for (const k in A) o[k] = lp(A[k], B[k] != null ? B[k] : A[k], u); return o; };
    const AIR = { lean: -0.78, tilt: 0, yaw: 0, bob: 0, lA: 0.95, lB: 0.95, lS: 0.3, rA: 0.5, rB: 0.45, rS: 0.34, aLp: 2.75, aLq: 1.05, aLe: 0.25, aRp: 2.45, aRq: 1.2, aRe: 0.35 };
    const LIE = { lean: -1.5, tilt: 0, yaw: 0, bob: -0.02, lA: 1.5, lB: 0.08, lS: 0.24, rA: 1.38, rB: 0.3, rS: 0.32, aLp: 1.95, aLq: 1.45, aLe: 0.12, aRp: 1.8, aRq: 1.5, aRe: 0.2 };
    const SIT = { lean: -0.85, tilt: 0, yaw: 0, bob: 0, lA: 1.45, lB: 0.2, lS: 0.2, rA: 1.3, rB: 0.6, rS: 0.25, aLp: -0.7, aLq: 0.35, aLe: 0.1, aRp: -0.6, aRq: 0.35, aRe: 0.1 };
    const CRO = { lean: 0.38, tilt: 0, yaw: 0, bob: 0, lA: 0.85, lB: 1.55, lS: 0.3, rA: 0.75, rB: 1.45, rS: 0.3, aLp: 0.4, aLq: 0.5, aLe: 0.5, aRp: 0.5, aRq: 0.5, aRe: 0.4 };
    function fx(pl, n, sp, sh) {
      const M = PH.game, G = M && M.G; if (!M || !M.part || !G) return;
      for (let i = 0; i < n; i++) { const a = Math.random() * 6.283, v = (0.35 + Math.random() * 0.75) * sp; M.part(pl.x + Math.cos(a) * 0.35, pl.y + Math.sin(a) * 0.2, 0.05, Math.cos(a) * v, Math.sin(a) * v * 0.6, 0.5 + Math.random() * 0.9, ['#d9c39a', '#efe2c4', '#b59a6e', '#ffffff'][i % 4], 0.4 + Math.random() * 0.3, 3, i % 3 === 0 ? 2 : 1); }
      if (sh && G.fx) G.fx.shake = Math.max(G.fx.shake || 0, sh);
    }
    function pose(pl, T) {
      const B = pl.blkR; if (!B || !(B.dur > 0)) return;
      // t 约定：开始时的 G.time（game.js blkReact 的写法）；也接受 B.e = 已过秒数
      const G = PH.game && PH.game.G, e = B.e != null ? B.e : (G ? G.time : 0) - (B.t || 0), D = B.dur, u = e / D; if (u >= 1 || e < 0) return;
      // 被扇方向投到身体：fw > 0 = 往前，sd = 往右（rig 的 tilt 正方向）
      const f = pl.face, fw = Math.cos(f) * (B.dx || 0) + Math.sin(f) * (B.dy || 0), sd = Math.sin(f) * (B.dx || 0) - Math.cos(f) * (B.dy || 0);
      const lr = Math.abs(sd) > 0.3 ? Math.sign(sd) : 1;
      if (B.tier === 3) {
        // 0~0.14 空中被扇 / 0.14~0.24 摔地 / 0.24~0.8 平躺僵直 / 0.8~1 撑地爬起
        let o;
        if (u < 0.14) o = lerpO(Object.assign({}, AIR, { lean: -0.2 }), AIR, sm(u / 0.06));
        else if (u < 0.24) o = lerpO(AIR, LIE, sm((u - 0.14) / 0.1));
        else if (u < 0.8) { const z = (u - 0.24) / 0.56; o = Object.assign({}, LIE);
          if (z < 0.12) o.bob = -0.02 + 0.05 * Math.sin(z / 0.12 * Math.PI);   // 摔地反弹一下
          if (z > 0.35 && z < 0.5) { const q = Math.sin((z - 0.35) / 0.15 * Math.PI * 3); o.rB += 0.35 * q; o.aRe += 0.3 * q; }   // 僵直中抽一下
        } else if (u < 0.9) o = lerpO(LIE, SIT, sm((u - 0.8) / 0.1));
        else o = lerpO(SIT, CRO, sm((u - 0.9) / 0.1));
        o.tilt = (o.tilt || 0) + 0.18 * lr * (u < 0.8 ? 1 : 1 - (u - 0.8) / 0.2); o.yaw = (o.yaw || 0) + 0.2 * lr;
        mix(T, o, u > 0.97 ? (1 - u) / 0.03 : 1);
        if (u >= 0.16 && !B.land) { B.land = 1; fx(pl, 14, 1.4, 3.2); if (PH.game.G) pl.sqv = (pl.sqv || 0) - 5; }
        return;
      }
      const w = Math.min(1, e / 0.05) * (u > 0.82 ? (1 - u) / 0.18 : 1);
      if (B.tier === 2) {
        // 向后踉跄 2.5 步：腿交替往后蹬，上身后仰前后晃，两臂乱甩（风车），侧倾跟着步子摆
        const ph = u * 2.5 * 2 * Math.PI, s = Math.sin(ph), c = Math.cos(ph);
        mix(T, { lean: -0.5 + 0.14 * Math.sin(2 * ph) + 0.15 * Math.max(0, fw), tilt: 0.2 * Math.sin(ph * 0.5 + 0.4) * lr + 0.12 * sd, yaw: 0.22 * Math.sin(ph * 0.7) * lr, bob: 0.035 * Math.abs(s),
          lA: -0.75 * s, rA: 0.75 * s, lB: 0.35 + 0.9 * Math.max(0, -c), rB: 0.35 + 0.9 * Math.max(0, c), lS: 0.36, rS: 0.36,
          aLp: 1.6 + 1.6 * Math.sin(ph * 1.4), aRp: 1.7 - 1.6 * Math.sin(ph * 1.4 + 0.8), aLq: 1.35 + 0.25 * c, aRq: 1.4 - 0.25 * c, aLe: 0.45, aRe: 0.55 }, w);
        if (!B.land) { B.land = 1; fx(pl, 5, 0.8, 0); }
        return;
      }
      // 1 轻：落地膝盖吸收 → 左右晃两下，两臂张开找平衡
      const k = 1 - u, wb = Math.sin(e * 24) * k;
      const up = Math.max(0, wb * lr), dn = Math.max(0, -wb * lr);   // 往哪边歪，另一只脚就离地
      mix(T, { lean: -0.2 * k + 0.12 * Math.sin(e * 15) * k, tilt: 0.45 * wb * lr, yaw: 0.16 * wb, bob: -0.05 * Math.max(0, 1 - e / 0.12),
        lA: 0.22 + 0.35 * dn, rA: 0.18 + 0.35 * up, lB: lp(1.1, 0.4, sm(u * 1.6)) + 0.5 * dn, rB: lp(1.05, 0.4, sm(u * 1.6)) + 0.5 * up, lS: 0.4, rS: 0.4,
        aLp: 1.0 + 0.55 * wb, aRp: 1.0 - 0.55 * wb, aLq: 1.4, aRq: 1.4, aLe: 0.3, aRe: 0.3 }, w);
    }
    return { pose: pose, fx: fx, KEYS: KEYS };
  })();
  PH.blkR = BR;

  // ---------- V3.9s 盖帽人起跳 / 钉板 + 侧面上篮出手（只画姿态；起跳高度、接触点由逻辑层定） ----------
  // 盖帽：block action 上 ba.pin = { t: 接触时 G.time, x, y, z: 篮板接触点, hold: 贴板停顿秒数 }
  //   上升中身体舒展、小腿收起（手臂过头 / 伸向球仍由 poseTarget 的 IK 负责）→ 拍到球后手跟着球到 pin 点（IK）→ 手贴板停顿 → 收手下落
  // 侧面上篮：layup action 上 a.side = ±1（出手点在身体哪一侧，+1 右）、a.lsv = 'reach' | 'far' | 'rev'
  //   防守人在 -side 一侧：上身转开、肩 / 肘顶向防守人护球，出手手伸到 side 一侧
  const PB = (function () {
    const cl = (v, a, b) => Math.max(a, Math.min(b, v)), lp = (a, b, u) => a + (b - a) * u, sm = (u) => { u = cl(u, 0, 1); return u * u * (3 - 2 * u); };
    const G0 = () => (PH.game && PH.game.G) || { time: 0 };
    // 与 game.js armTo 同一套局部坐标：bx 右、by 前、bz 上（单位 Hh = 身高/1.95）
    function arm(T, side, bx, by, bz, Hh) {
      const sx = side * 0.21 * Hh, sy = Math.sin(T.lean) * 0.48 * Hh, sz = 0.76 * Hh + Math.cos(T.lean) * 0.48 * Hh - 0.03;
      const vx = bx * Hh - sx, vy = by * Hh - sy, vz = bz * Hh - sz, r = Math.hypot(vx, vy, vz) || 1;
      const ua = 0.28 * Hh, fa = 0.26 * Hh, rc = Math.min(r, (ua + fa) * 0.98);
      const e = Math.acos(cl((rc * rc - ua * ua - fa * fa) / (2 * ua * fa), -1, 1));
      const q = cl(Math.atan2(side * vx, Math.hypot(vy, vz)), -0.55, 1.2), p = Math.atan2(vy, -vz) - e * 0.5;
      return { p: p, q: q, e: e };
    }
    const setA = (T, side, o, w) => { const k = side > 0 ? 'aR' : 'aL'; T[k + 'p'] = lp(T[k + 'p'], o.p, w); T[k + 'q'] = lp(T[k + 'q'], o.q, w); T[k + 'e'] = lp(T[k + 'e'], o.e, w); };
    const loc = (pl, x, y, z, yw) => { const Hh = pl.h / 1.95, f = pl.face + (yw != null ? yw : (pl.pose && pl.pose.yaw || 0)), fx = Math.cos(f), fy = Math.sin(f), dx = x - pl.x, dy = y - pl.y; return { x: (dx * fy - dy * fx) / Hh, y: (dx * fx + dy * fy) / Hh, z: (z - pl.z) / Hh, Hh: Hh }; };
    function block(pl, T, a) {
      const G = G0(), P = a.pin, up = pl.vz > 0, zr = a.zmax > 0 ? cl(pl.z / a.zmax, 0, 1) : 0;
      if (!P) {
        if (a.bst || a.reb || a.chase || (a.rel != null && a.rel < -0.3)) return;
        // 手臂交给 poseTarget（含伸向球的 IK，盖帽判定用手的位置），这里只改躯干 / 腿：越接近最高点身体越舒展、小腿越收
        const k = up ? sm(zr) : 1;
        T.lean = lp(0.1, -0.06, k); T.lB = lp(0.25, 0.8, zr); T.rB = lp(0.25, 0.5, zr); T.lA = 0.08 + 0.3 * zr; T.rA = 0.02 - 0.05 * zr; T.bob = (T.bob || 0) + 0.02 * zr;
        return;
      }
      const e = G.time - P.t, hold = P.hold != null ? P.hold : 0.12, SL = 0.07;
      if (e < 0) return;
      // 0~0.07 拍击：手从拍到球的点（ikB）跟着球砸到板上的 pin 点 / hold 贴板停顿（手钉在板上、膝收起）/ 之后 0.28s 收手下落
      const B0 = a.ikB || P, k = sm(e / SL), Lp = loc(pl, P.x, P.y, P.z), sd = Lp.x >= 0 ? 1 : -1, L = loc(pl, lp(B0.x, P.x, k), lp(B0.y, P.y, k), lp(B0.z, P.z, k), 0.18 * sd);
      const ik = arm(T, sd, L.x, L.y, L.z, L.Hh), O = sd > 0 ? 'aL' : 'aR';
      let w; if (e < SL + hold) w = 1; else w = 1 - sm((e - SL - hold) / 0.28);
      if (w <= 0) return;
      // 拍击那一下肘先弯一点再打直（甩腕感）
      if (e < SL) ik.e += 0.3 * Math.sin(Math.PI * e / SL);
      setA(T, sd, ik, w);
      const hs = e >= SL && e < SL + hold ? 1 : 0, sh = hs ? 0.03 * Math.sin((e - SL) * 60) : 0;   // 贴板时身体轻震一下
      T[O + 'p'] = lp(T[O + 'p'], 1.35, w); T[O + 'q'] = lp(T[O + 'q'], 1.0, w); T[O + 'e'] = lp(T[O + 'e'], 0.35, w);
      T.lean = lp(T.lean, 0.08 + sh, w); T.tilt = lp(T.tilt || 0, -0.16 * sd, w); T.yaw = lp(T.yaw || 0, 0.18 * sd, w);
      T.lA = lp(T.lA, 0.55, w); T.lB = lp(T.lB, 1.05, w); T.rA = lp(T.rA, 0.2, w); T.rB = lp(T.rB, 0.7, w);
    }
    function layReach(T, a, s, far) {
      const I = a.ideal || 0.34, release = a.released ? (a.relT ?? I) : a.t;
      const extend = sm((release / I - (far ? 0.2 : 0.1)) / 0.63);
      const recover = sm((a.t - Math.min(release, I) - 0.04) / 0.22);
      const blend = sm(a.t / 0.08), knee = sm(release / (I * 0.55));
      const kneeMax = PH.game && PH.game.K ? PH.game.K.lvFarKnee : 0.6;
      const reach = far ? { p: 2.26, q: 0.58, e: 0.12 } : { p: 2.6, q: 0.48, e: 0.2 };
      // 球从出手侧髋前托起；另一只手先护在胸前，再向侧下方收回。
      const o = {
        yaw: -s * lp(lp(0.16, far ? 0.54 : 0.42, extend), 0, recover),
        tilt: s * lp(lp(0.07, far ? 0.22 : 0.17, extend), 0, recover),
        lean: lp(lp(0.21, 0.06, extend), 0.16, recover),
        rA: lp(lp(0.42, kneeMax, knee), 0.28, recover), rB: lp(lp(0.7, 0.9, knee), 0.54, recover), rS: lp(0.1, 0.14, recover),
        lA: lp(lp(-0.35, -0.19, knee), 0.24, recover), lB: lp(lp(0.53, 0.68, knee), 0.51, recover), lS: lp(0.12, 0.14, recover),
      };
      setA(T, s, {
        p: lp(lp(far ? 0.42 : 0.83, reach.p, extend), 0.75, recover),
        q: lp(lp(0.06, reach.q, extend), 0.28, recover), e: lp(lp(1.08, reach.e, extend), 0.53, recover),
      }, blend);
      setA(T, -s, { p: lp(lp(0.84, 0.62, extend), 0.46, recover), q: lp(lp(-0.18, 0.42, extend), 0.26, recover), e: lp(lp(1.36, 0.72, extend), 0.5, recover) }, blend);
      if (s < 0) { [o.rA, o.lA] = [o.lA, o.rA]; [o.rB, o.lB] = [o.lB, o.rB]; [o.rS, o.lS] = [o.lS, o.rS]; }
      for (const k in o) T[k] = lp(T[k] || 0, o[k], blend);
      T.lA = Math.min(T.lA, kneeMax); T.rA = Math.min(T.rA, kneeMax);
      T.lB = Math.min(T.lB, 0.9); T.rB = Math.min(T.rB, 0.9);
    }
    function layS(T, a) {
      const s = a.side > 0 ? 1 : -1, v = a.lsv || 'reach', rel = a.released, I = a.ideal || 0.34;
      if (v === 'reach' || v === 'far') return layReach(T, a, s, v === 'far');
      const u = rel ? 1 : cl(a.t / I, 0, 1), pr = rel ? cl((a.t - (a.relAt > 0 ? a.relAt : I)) / 0.25, 0, 1) : 0;
      const w = sm(a.t / 0.08) * (1 - (rel ? 0.6 * pr : 0)) * (1 - sm(((a.relT ?? a.t) - I - 0.015) / 0.07));
      const o = {};
      // 护球：防守人那侧的手臂横在胸前、肘外顶；上身转开；身体往出手侧倾
      if (v === 'rev') {
        // 反手：背对防守人从篮下穿过去，手过头往后、腕子往回拨
        Object.assign(o, { yaw: -1.15 * s, tilt: 0.2 * s, lean: lp(0.1, -0.22, u) });
        const A = { p: lp(2.3, 3.35, u), q: lp(0.3, 0.55, u), e: lp(0.7, 0.2, u) + (rel ? 0.35 * pr : 0) }; setA(T, s, A, w);
        setA(T, -s, { p: 1.5, q: 1.1, e: 0.9 }, w);
      }
      for (const k in o) T[k] = lp(T[k] || 0, o[k], w);
      // 起跳腿：出手侧的膝抬高（同侧起跳摆腿），防守侧腿往外撑
      const kH = s > 0 ? 'rB' : 'lB', kA = s > 0 ? 'rA' : 'lA', fS = s > 0 ? 'lS' : 'rS';
      T[kA] = lp(T[kA], 1.0, w * 0.8); T[kH] = lp(T[kH], 1.2, w * 0.8); T[fS] = lp(T[fS] || 0, 0.38, w);
    }
    function pose(pl, T, an, a) {
      if (!a) return;
      if (a.type === 'block' && an === 'block') block(pl, T, a);
      else if (a.type === 'layup' && an === 'layup' && a.side && !a.cv && !a.inSteps && a.v !== 'floater' && a.v !== 'power' && a.clutchT == null) layS(T, a);
    }
    return { pose: pose, arm: arm };
  })();
  PH.blkP = PB;

  // ---------- V4.3 被封堵的上篮变体（layup action 上 a.cv；1V1 / 5V5 共用 gait.post） ----------
  // 字段（input_buffer_builder 约定）：a.t 空中时钟（起跳清零）；a.cvT 变体起点；a.cvR 计划出手（hang 已含 a.cvD）；
  //   a.relT 实际出手；a.hand 最终出手手（左手球员 = -1，整套镜像）；a.side 出手侧；
  //   bump：a.cvDx/cvDy 指向防守人、a.cvK 强度；dunk2lay：a.cvTr 过渡时长
  // 只改姿势：起跳高度、滞空、球位、命中都在 game.js
  const CVP = (function () {
    const cl = (v, a, b) => Math.max(a, Math.min(b, v)), lp = (a, b, u) => a + (b - a) * u, sm = (u) => { u = cl(u, 0, 1); return u * u * (3 - 2 * u); };
    const setA = (T, side, o, w) => { const k = side > 0 ? 'aR' : 'aL'; T[k + 'p'] = lp(T[k + 'p'], o.p, w); T[k + 'q'] = lp(T[k + 'q'], o.q, w); T[k + 'e'] = lp(T[k + 'e'], o.e, w); };
    const lA = (A, B, u) => ({ p: lp(A.p, B.p, u), q: lp(A.q, B.q, u), e: lp(A.e, B.e, u) });
    const KS = ['lean', 'tilt', 'yaw', 'bob', 'lA', 'lB', 'lS', 'rA', 'rB', 'rS'];
    // 腿：出手侧 = s；k0 = 出手侧（摆动腿）、k1 = 另一侧（起跳腿）
    const legs = (o, s, swA, swB, stA, stB) => { if (s > 0) { o.rA = swA; o.rB = swB; o.lA = stA; o.lB = stB; } else { o.lA = swA; o.lB = swB; o.rA = stA; o.rB = stB; } };
    function pose(pl, T, an, a) {
      if (!a || a.type !== 'layup' || !a.cv || a.inSteps || an !== 'layup') return;
      const PBm = PH.blkP; if (!PBm) return;
      const t = a.t || 0, t0 = a.cvT || 0, rel = !!a.released, Hh = pl.h / 1.95;
      const s = a.hand < 0 ? -1 : 1;
      const I = rel && a.relT != null ? a.relT : a.cvR != null ? a.cvR : a.ideal || 0.34;
      const span = I - t0 < 0.1 ? 0.18 : I - t0;   // 出手那一刻才补的化解变体（cvT = cvR）：动作在出手后 0.18s 内做完
      const u = cl((t - t0) / span, 0, 1), pr = rel ? cl((t - (a.relT != null ? a.relT : I)) / 0.25, 0, 1) : 0;
      const w = sm((t - t0) / 0.06 + (t0 > 0 ? 0 : 1)) * (rel ? 1 - 0.7 * sm((pr - 0.4) / 0.6) : 1);
      if (w <= 0) return;
      const arm = (side, bx, by, bz) => PBm.arm(T, side, bx, by, bz, Hh);
      const o = {}, v = a.cv;
      if (v === 'hang') {
        // 空中滞留：身体打开、两膝收起（最高点悬停），球双手举在身前护住（出手手在球下、另一手扶上侧），最后一刻才伸出去
        const hv = sm((u - 0.82) / 0.18), fl = Math.sin(t * 9) * 0.04;
        Object.assign(o, { lean: lp(0.05, -0.12, sm(u * 3)) + fl, tilt: 0.06 * s, yaw: -0.2 * s * (1 - hv), bob: 0.02 });
        legs(o, s, lp(0.9, 1.25, sm(u * 3)), lp(1.0, 1.55, sm(u * 3)), lp(0.35, 0.85, sm(u * 3)), lp(0.6, 1.35, sm(u * 3)));
        const hold = arm(s, s * 0.1, 0.3, 1.3), up = { p: 2.75, q: 0.3, e: 0.12 };
        setA(T, s, rel ? up : lA(hold, up, hv), w);
        setA(T, -s, rel ? { p: 1.6, q: 0.9, e: 0.8 } : lA(arm(-s, -s * 0.04, 0.34, 1.38), { p: 2.2, q: 0.6, e: 0.5 }, hv), w);
      } else if (v === 'bump') {
        // 身体对抗硬挤：撞的一下肩膀 / 上身往防守人那边顶（前顶 + 侧倾），对抗手肘外顶护球，出手手短促往上推；两腿分开撑住
        const f = pl.face, dx = a.cvDx || 0, dy = a.cvDy || 0, fw = Math.cos(f) * dx + Math.sin(f) * dy, sdv = Math.sin(f) * dx - Math.cos(f) * dy;
        const ds = Math.abs(sdv) > 0.2 ? Math.sign(sdv) : -s, K = a.cvK != null ? cl(a.cvK, 0, 1) : 0.6, hit = Math.exp(-Math.max(0, t - t0) * 14);
        const jolt = 0.12 * K * Math.sin(Math.max(0, t - t0) * 50) * hit;
        Object.assign(o, { lean: 0.3 + 0.15 * K + 0.12 * Math.max(0, fw) + jolt, tilt: ds * (0.22 + 0.2 * K) - 0.1 * ds * hit, yaw: ds * 0.35, bob: -0.02 * hit });
        o.lA = 0.6; o.lB = 0.85; o.rA = 0.55; o.rB = 0.8; o.lS = 0.42; o.rS = 0.42;
        const bar = arm(ds, ds * 0.42, 0.18, 1.02); bar.e = 1.6;   // 肘顶向防守人
        const set = arm(-ds, -ds * 0.15, 0.32, 1.22), push = arm(-ds, -ds * 0.18, 0.45, 1.45); push.e = 0.2;
        const bs = -ds;   // 出手手在远离防守人那一侧（a.hand 与之不同时也照 a.hand 出手）
        if (bs === s) { setA(T, s, lA(set, push, sm((u - 0.65) / 0.35)), w); setA(T, -s, bar, w); }
        else { const sp = arm(s, s * 0.1, 0.4, lp(1.15, 1.42, sm((u - 0.65) / 0.35))); sp.e = lp(0.9, 0.2, sm((u - 0.65) / 0.35)); setA(T, s, sp, w); setA(T, -s, { p: 1.4, q: 0.9, e: 1.3 }, w); }
      } else if (v === 'scoop') {
        // 低手挑篮：身体压低前探、远离封盖，球从髋下低手往前上方挑（手心朝上），另一只手高举挡住盖帽手
        const k2 = sm(u);
        Object.assign(o, { lean: lp(0.42, 0.18, k2), tilt: 0.25 * s, yaw: -0.4 * s, bob: -0.03 });
        legs(o, s, lp(1.15, 0.85, k2), lp(0.7, 0.5, k2), lp(0.3, 0.2, k2), lp(0.9, 0.6, k2));
        setA(T, s, { p: lp(0.15, 2.2, k2) + (rel ? 0.35 * pr : 0), q: lp(0.35, 0.25, k2), e: lp(0.15, 0.05, k2) }, w);
        setA(T, -s, { p: 2.75, q: 0.85, e: 0.35 }, w);
      } else if (v === 'revAvoid') {
        // 躲盖帽反手：背向防守人转身（大幅 yaw）、身体向出手侧倾斜躲开，球从头后反手往回拨；护球手往防守人方向横挡
        const sd = a.side ? (a.side > 0 ? 1 : -1) : s, k2 = sm(u);
        Object.assign(o, { yaw: -1.35 * sd * sm(u * 2), tilt: 0.38 * sd * k2, lean: lp(0.15, -0.3, k2), bob: 0 });
        legs(o, s, lp(0.8, 1.2, k2), lp(1.0, 1.35, k2), 0.4, lp(0.7, 1.0, k2));
        setA(T, s, { p: lp(2.0, 3.4, k2), q: lp(0.25, 0.6, k2), e: lp(1.0, 0.25, k2) + (rel ? 0.45 * pr : 0) }, w);
        setA(T, -s, { p: 1.45, q: 1.2, e: 1.2 }, w);
      } else if (v === 'dunk2lay') {
        // 扣篮被挡改上篮：先双手把球举过头（扣篮）→ cvTr 内收回到胸前、上身后缩躲开 → 单手轻放 / 挑进
        const tr = a.cvTr || 0.15, c = sm((t - t0 - 0.04) / tr), k3 = sm((u - 0.55) / 0.45);
        Object.assign(o, { lean: lp(lp(0.2, -0.28, c), -0.05, k3), tilt: lp(0, 0.28 * s, c), yaw: lp(0, -0.35 * s, c), bob: 0 });
        legs(o, s, lp(1.1, 0.9, c), lp(0.9, 1.3, c), lp(0.6, 0.45, c), lp(0.7, 1.15, c));
        const dk = { p: 3.0, q: 0.15, e: 0.25 }, pull = arm(s, s * 0.14, 0.32, 1.32), lay = { p: 2.6, q: 0.35, e: 0.18 };
        setA(T, s, k3 > 0 ? lA(pull, lay, k3) : lA(dk, pull, c), w);
        setA(T, -s, k3 > 0 ? lA(arm(-s, -s * 0.06, 0.34, 1.36), { p: 1.3, q: 1.05, e: 1.3 }, k3) : lA({ p: 3.0, q: 0.2, e: 0.25 }, arm(-s, -s * 0.06, 0.34, 1.36), c), w);
      } else return;
      for (const k of KS) if (o[k] != null) T[k] = lp(T[k] || 0, o[k], w);
    }
    return { pose: pose };
  })();
  PH.cvP = CVP;

  // ---------- V4.4 终结反向对抗：力量型起跳后把防守人顶翻（1V1 / 5V5 共用 gait.post） ----------
  // 字段（input_buffer_builder 约定）：防守人 df.knock 'fall' | 'stagger'、knockT（0 往上涨）、knockD 总时长、knockUp 起身时刻、knockDx/Dy 被顶飞方向；
  //   进攻方 a.thru、a.thruG 接触时 G.time、a.thruDx/Dy、a.thruK 强度。stunK 同时是 'fall' / 'daze'（姿势这里整套覆盖）
  // 和其他倒地区分：晃倒 = 正后方一屁股坐下（对称、头顶小鸟）；被挡倒 = 掩护分档；被盖帽 = 进攻方手被打下。
  //   顶翻 fall：撞击瞬间两臂前甩、一腿离地 → 往被顶的一侧侧倒 → 侧坐地、倒地侧手撑地、一膝立起 → 撑地爬起（不冒星）
  //   顶翻 stagger：头颈后甩、两臂张开 → 倒退碎步、上身侧晃 → 收住
  const THP = (function () {
    const cl = (v, a, b) => Math.max(a, Math.min(b, v)), lp = (a, b, u) => a + (b - a) * u, sm = (u) => { u = cl(u, 0, 1); return u * u * (3 - 2 * u); };
    const setA = (T, side, o, w) => { const k = side > 0 ? 'aR' : 'aL'; T[k + 'p'] = lp(T[k + 'p'], o.p, w); T[k + 'q'] = lp(T[k + 'q'], o.q, w); T[k + 'e'] = lp(T[k + 'e'], o.e, w); };
    const KS = ['lean', 'tilt', 'yaw', 'bob', 'lA', 'lB', 'lS', 'rA', 'rB', 'rS'];
    const G0 = () => (PH.game && PH.game.G) || { time: 0 };
    // 被顶方向在身体局部：fw > 0 往前，sd 侧向（和 cvP bump 的 tilt 符号一致）
    const loc = (pl, dx, dy) => { const f = pl.face || 0; return { fw: Math.cos(f) * dx + Math.sin(f) * dy, sd: Math.sin(f) * dx - Math.cos(f) * dy }; };
    function dust(pl, dx, dy, n, sp) { const M = PH.game; if (!M || !M.part) return; for (let i = 0; i < n; i++) { const an = Math.random() * 6.283, v = (0.3 + Math.random() * 0.8) * sp; M.part(pl.x + Math.cos(an) * 0.3, pl.y + Math.sin(an) * 0.18, 0.05, dx * sp + Math.cos(an) * v, dy * sp + Math.sin(an) * v * 0.6, 0.5 + Math.random() * 0.9, ['#d9c39a', '#efe2c4', '#b59a6e'][i % 3], 0.35 + Math.random() * 0.3, 2); } }
    function def(pl, T) {
      const k = pl.knock; if (k !== 'fall' && k !== 'stagger') { pl._knS = null; return; }
      const D = pl.knockD || (k === 'fall' ? 1.3 : 0.55), e = pl.knockT != null ? pl.knockT : (pl.stunT0 || D) - (pl.stun || 0);
      const dx = pl.knockDx || 0, dy = pl.knockDy || 0, L = loc(pl, dx, dy), sd = Math.abs(L.sd) > 0.15 ? Math.sign(L.sd) : (pl.id & 1 ? 1 : -1);
      // 接触帧：扬尘（fall 落地再来一次）；记在 pl._knS 上，同一次只出一次
      const S = pl._knS && pl._knS.D === D && pl._knS.k === k && e >= pl._knS.e - 0.01 ? pl._knS : (pl._knS = { k, D, e, d0: 0, d1: 0 }); S.e = e;
      if (!S.d0) { S.d0 = 1; dust(pl, dx, dy, k === 'fall' ? 7 : 4, 1.4); }
      if (k === 'fall' && !S.d1 && e > 0.3) { S.d1 = 1; dust(pl, dx, dy, 10, 0.9); }
      const o = {}, w0 = sm(e / 0.05);
      if (k === 'fall') {
        const U = pl.knockUp != null && pl.knockUp > 0.4 ? pl.knockUp : D - 0.45;
        if (e < 0.12) {
          // 撞击：整个人往后被掀，两臂往前上甩（失去平衡），被顶一侧的腿离地
          const u = sm(e / 0.12);
          Object.assign(o, { lean: lp(0.1, -0.78, u), tilt: 0.22 * sd * u, yaw: 0.3 * sd * u, bob: 0.05 * u });
          if (sd > 0) { o.rA = 0.95 * u; o.rB = 0.25; o.lA = 0.35; o.lB = 0.7; } else { o.lA = 0.95 * u; o.lB = 0.25; o.rA = 0.35; o.rB = 0.7; }
          o.lS = 0.2; o.rS = 0.2;
          setA(T, sd, { p: 2.3, q: 1.15, e: 0.2 }, w0); setA(T, -sd, { p: 1.9, q: 0.8, e: 0.35 }, w0);
        } else if (e < 0.34) {
          // 侧倒：往被顶的一侧倒下，倒地侧手伸下去接地
          const u = sm((e - 0.12) / 0.22);
          Object.assign(o, { lean: lp(-0.78, -1.02, u), tilt: lp(0.22, 0.72, u) * sd, yaw: lp(0.3, 0.5, u) * sd, bob: lp(0.05, 0, u) });
          const A = lp(0.95, 1.6, u), B = lp(0.25, 0.05, u), A2 = lp(0.35, 2.2, u), B2 = lp(0.7, 1.26, u); if (sd > 0) { o.rA = A; o.rB = B; o.lA = A2; o.lB = B2; } else { o.lA = A; o.lB = B; o.rA = A2; o.rB = B2; }
          o.lS = 0.3; o.rS = 0.3;
          setA(T, sd, { p: lp(2.3, -0.55, u), q: lp(1.15, 0.85, u), e: lp(0.2, 0.08, u) }, 1); setA(T, -sd, { p: lp(1.9, 1.5, u), q: lp(0.8, 0.55, u), e: lp(0.35, 1.0, u) }, 1);
        } else {
          // 侧坐地：倒地侧手撑地、另一膝立起、手搭膝上；knockUp 起撑地爬起 → 半蹲 → 站直
          const br = Math.sin(e * 5) * 0.03, g = sm((e - U) / Math.max(0.2, D - U));
          const sit = { lean: -1.0 + br, tilt: 0.6 * sd, yaw: 0.5 * sd, bob: 0 }, up = { lean: 0.45, tilt: 0.1 * sd, yaw: 0.15 * sd, bob: 0 };
          const g1 = sm(g / 0.6), g2 = sm((g - 0.6) / 0.4);
          for (const n in sit) o[n] = lp(lp(sit[n], up[n], g1), 0, g2);
          const near = { A: 1.6, B: 0.05 }, far = { A: 2.2, B: 1.26 }, sq = { A: 1.05, B: 1.7 };   // 近侧腿平放地上；远侧立膝，脚和髋同高（b = 2a − π），髋才坐得到地
          const nA = lp(lp(near.A, sq.A, g1), 0.12, g2), nB = lp(lp(near.B, sq.B, g1), 0.25, g2), fA = lp(lp(far.A, sq.A, g1), 0.12, g2), fB = lp(lp(far.B, sq.B, g1), 0.25, g2);
          if (sd > 0) { o.rA = nA; o.rB = nB; o.lA = fA; o.lB = fB; } else { o.lA = nA; o.lB = nB; o.rA = fA; o.rB = fB; }
          o.lS = lp(0.32, 0.08, g); o.rS = lp(0.32, 0.08, g);
          const wa = 1 - g2;
          setA(T, sd, { p: lp(-0.75, 0.75, g1), q: lp(0.55, 0.3, g1), e: lp(0.05, 0.4, g1) }, wa);   // 撑地 → 撑膝
          setA(T, -sd, { p: lp(0.95, 0.75, g1), q: lp(0.35, 0.3, g1), e: lp(1.25, 0.4, g1) }, wa);   // 搭膝 → 撑膝
          if (g2 >= 1) return;
        }
      } else {
        // 踉跄：被顶的一下头颈后甩、两臂张开 → 倒退碎步、上身侧晃 → 收住
        const fade = 1 - sm((e - (D - 0.12)) / 0.12);
        if (e < 0.1) { const u = sm(e / 0.1);
          Object.assign(o, { lean: lp(0.05, -0.58, u), tilt: 0.3 * sd * u, yaw: 0.25 * sd * u, bob: 0.02 * u });
          o.lA = 0.2; o.rA = 0.2; o.lB = 0.55; o.rB = 0.55; o.lS = 0.3; o.rS = 0.3;
          setA(T, 1, { p: 1.35, q: 1.35, e: 0.3 }, w0); setA(T, -1, { p: 1.2, q: 1.3, e: 0.35 }, w0);
        } else {
          const u = (e - 0.1) / Math.max(0.2, D - 0.1), st = Math.sin((e - 0.1) * 24), wb = Math.sin((e - 0.1) * 13) * (1 - u);
          Object.assign(o, { lean: lp(-0.58, -0.12, sm(u)) * fade, tilt: (0.3 * (1 - u) + 0.14 * wb) * sd * fade, yaw: 0.25 * sd * (1 - u) * fade, bob: 0.02 * Math.abs(st) * fade });
          o.lA = (-0.45 * st + 0.1) * fade; o.rA = (0.45 * st + 0.1) * fade; o.lB = 0.55 + 0.35 * Math.max(0, st); o.rB = 0.55 + 0.35 * Math.max(0, -st); o.lS = 0.3; o.rS = 0.3;
          setA(T, 1, { p: 1.3 + 0.5 * wb, q: 1.25, e: 0.35 }, fade); setA(T, -1, { p: 1.15 - 0.5 * wb, q: 1.25, e: 0.4 }, fade);
        }
      }
      for (const n of KS) if (o[n] != null) T[n] = lp(T[n] || 0, o[n], n === 'lean' || n === 'tilt' ? 1 : Math.max(w0, 0.6));
    }
    // 进攻方：接触后 0.45s 肩膀 / 上身前顶、往防守人那侧侧倾转肩，靠防守人一侧的手臂收肘护在身前（不是持球手才动）
    function att(pl, T, a) {
      if (!a || !a.thru || a.thruG == null || (a.type !== 'dunk' && a.type !== 'layup')) return;
      const e = G0().time - a.thruG; if (e < 0 || e > 0.5) return;
      const K = a.thruK != null ? cl(a.thruK, 0, 1) : a.thru === 'fall' ? 0.8 : 0.5, k = sm(e / 0.05) * (1 - sm((e - 0.12) / 0.38)) * (0.6 + 0.4 * K);
      const L = loc(pl, a.thruDx || 0, a.thruDy || 0), s = a.hand < 0 ? -1 : 1, ds = Math.abs(L.sd) > 0.2 ? Math.sign(L.sd) : -s, jolt = 0.08 * Math.sin(e * 55) * Math.exp(-e * 12);
      T.lean = (T.lean || 0) + (0.3 + jolt) * k; T.tilt = (T.tilt || 0) + 0.3 * ds * k; T.yaw = (T.yaw || 0) + 0.42 * ds * k;
      if (a.cv === 'bump') return;   // 上篮顶人：cvP bump 已经有肘顶 / 推送手
      const two = a.type === 'dunk' && (a.v === 'two' || a.v === 'tomahawk2' || a.both);
      if (!two && ds !== s) setA(T, ds, { p: 1.15, q: 0.2, e: 1.95 }, 0.85 * k);   // 撞击肩一侧：收肘顶在身前
      const kn = ds > 0 ? 'r' : 'l'; T[kn + 'A'] = (T[kn + 'A'] || 0) + 0.35 * k; T[kn + 'B'] = (T[kn + 'B'] || 0) + 0.3 * k;   // 撞击侧膝盖前顶
    }
    function pose(pl, T, an, a) { def(pl, T); att(pl, T, a); }
    return { pose: pose };
  })();
  PH.thruP = THP;

  // ---------- V4.3 脚下体力条（1V1 / 5V5 共用：PH.stamBar） ----------
  // V4.4 用户：只要拉长不要加粗 → 1V1 30×2（原 22×2，约 1.4 倍）；25 / 50 / 75 细刻度；阈值短刻度伸出条外（上 2px、下 1px）：开始疲劳 ST.fat0（青）、扣篮最低 ST.dunk（紫）
  // 颜色：> 50 绿、> 25 黄→橙、25 以下红并轻微闪烁；刚消耗的部分留淡色残影，0.6 秒后再收回
  const STB = { w1: 30, h1: 2, gap: 3, hold: 0.6, mem: new Map() };
  function stamBar(c, x, y, w, h, st, key, t) {
    st = Math.max(0, Math.min(100, st == null ? 100 : st)); x = Math.round(x); y = Math.round(y);
    let m = STB.mem.get(key); if (!m || t < m.t - 0.5) { m = { g: st, at: t, t: t, last: st }; STB.mem.set(key, m); }
    if (st < m.last - 0.8) { m.g = Math.max(m.g, m.last); m.at = t; }   // 一下扣掉的（>0.8）：残影从掉之前的位置开始、重新计 0.6s；跑动的小幅持续消耗不重置计时
    if (st >= m.g) m.g = st; else if (t - m.at > STB.hold) m.g = Math.max(st, m.g - (t - m.t) * 120);   // 停留 0.6s 后快速收回
    m.last = st; m.t = t;
    const ST = (PH.game && PH.game.ST) || { fat0: 25, dunk: 7 }, fx = (v) => x + Math.round((w * v) / 100);
    c.fillStyle = '#15101f'; c.fillRect(x - 1, y - 1, w + 2, h + 2);
    c.fillStyle = '#3a3346'; c.fillRect(x, y, w, h);
    const low = st < 25, mid = st <= 50, col = low ? '#ff4a3a' : mid ? '#ff9a2a' : st > 75 ? '#5fe05a' : '#c8e04a', hi = low ? '#ffa89a' : mid ? '#ffd08a' : '#c8ffb0';
    const f = Math.round((w * st) / 100), gf = Math.round((w * m.g) / 100);
    if (gf > f) { c.fillStyle = low ? '#ffb0a6' : mid ? '#ffd9a8' : '#e6ffd8'; c.globalAlpha = 0.85; c.fillRect(x + f, y, gf - f, h); c.globalAlpha = 1; }
    if (f > 0) { c.globalAlpha = low ? 0.72 + 0.28 * Math.sin(t * 9) : 1; c.fillStyle = col; c.fillRect(x, y, f, h); c.fillStyle = hi; c.fillRect(x, y, f, 1); c.globalAlpha = 1; }
    c.fillStyle = 'rgba(21,16,31,0.7)'; for (const v of [25, 50, 75]) c.fillRect(fx(v), y, 1, h);
    const mk = (v, cc) => { if (!(v > 0 && v < 100)) return; c.fillStyle = cc; c.fillRect(fx(v), y - 2, 1, 2); c.fillRect(fx(v), y + h, 1, 1); };
    mk(ST.fat0, '#7fe0ff'); mk(ST.dunk, '#d690ff');
    return h + STB.gap;
  }
  PH.stamBar = stamBar; PH.stamBar.STB = STB;

  // ---------- 骨架 ----------
  const lerpN = (a, b, u) => a + (b - a) * u;
  function layReachRim(pl, T, a) {
    const sideScoop = a.lsv === 'reach' || a.lsv === 'far';
    const scoop = a.cv ? a.cv === 'scoop' : a.side ? sideScoop :
      a.v === 'euro' || (a.v === 'normal' && (a.sty === 'tip' || a.sty === 'glide' || a.sty === 'roll' || a.sty === 'scoop'));
    const t = a.relT ?? a.t;
    const clutch = a.clutchT != null;
    if (!scoop && !clutch) return;
    const end = a.ideal;
    const start = clutch ? lerpN(a.clutchT, end, 0.56) : end * 0.33;
    const ease = (v) => { const u = Math.max(0, Math.min(1, v)); return u * u * (3 - 2 * u); };
    const w = ease((t - start) / Math.max(0.05, (end - start) * 0.78))
      * (clutch ? 1 : 1 - ease((t - end - 0.015) / 0.065))
      * (a.released ? 1 - ease((a.t - t - 0.025) / 0.19) : 1);
    if (w <= 0) return;
    T.lean += 0.19 * w;
    const left = a.hand < 0, k = left ? 'L' : 'R', s = left ? -1 : 1, arm = 'a' + k;
    T['reach' + k] += (clutch ? 0.34 : 0.44) * w;
    const sh = rig(pl, T)['sh' + k], f = pl.face + (T.yaw || 0);
    const dx = HOOP.x - sh[0], dy = HOOP.y - sh[1], dz = HOOP.z + 0.18 - sh[2];
    const fwd = Math.max(0.08, dx * Math.cos(f) + dy * Math.sin(f)), lat = dx * Math.sin(f) - dy * Math.cos(f);
    const p = Math.atan2(fwd, -dz) - 0.04;
    const q = Math.max(-0.8, Math.min(0.85, 1.35 * Math.atan2(s * lat, Math.hypot(fwd, dz))));
    T[arm + 'p'] = lerpN(T[arm + 'p'], p, w * 0.94);
    T[arm + 'q'] = lerpN(T[arm + 'q'], q, w * 0.94);
    T[arm + 'e'] = lerpN(T[arm + 'e'], 0.08, w);
  }

  function gripArm(k, side, end, gathering, bounded = false) {
    const sh = k['sh' + side], el = k['el' + side], hand = k['hand' + side];
    const diff = (a, b) => a.map((x, i) => x - b[i]), dot = (a, b) => a.reduce((s, x, i) => s + x * b[i], 0);
    const axis = diff(end, sh), d0 = Math.hypot(...axis);
    if (d0 < 0.001) return;
    const v = axis.map((x) => x / d0), upper = diff(el, sh);
    let ua = Math.hypot(...upper), fa = Math.hypot(...diff(hand, el));
    const d = bounded ? Math.min(d0, (ua + fa) * 0.99) : gathering ? Math.min(d0, (ua + fa) * 1.04) : d0;
    if (d < d0) end = sh.map((x, i) => x + v[i] * d);
    const reach = Math.max(1, d / ((ua + fa) * 0.99)); ua *= reach; fa *= reach;
    const along = Math.max(-ua, Math.min(ua, (d * d + ua * ua - fa * fa) / (2 * d)));
    const perp = (a) => { const t = dot(a, v); return a.map((x, i) => x - t * v[i]); };
    let bend = perp(upper), n = Math.hypot(...bend);
    if (n < 0.001) { bend = perp(Math.abs(v[2]) < 0.9 ? [0, 0, -1] : [0, -1, 0]); n = Math.hypot(...bend); }
    const h = Math.sqrt(Math.max(0, ua * ua - along * along)), fg = diff(k['fg' + side], hand);
    k['el' + side] = sh.map((x, i) => x + v[i] * along + bend[i] * h / n);
    k['hand' + side] = end; k['fg' + side] = end.map((x, i) => x + fg[i]);
  }
  function finishGrip(k, pl) {
    const g = pl.grip, fwd = pl.face + (pl.pose.yaw || 0);
    const w = g.right, both = 4 * w * (1 - w), L = k.handL, R = k.handR;
    const across = R.map((x, i) => x - L[i]), d = Math.hypot(...across);
    const axis = d > 0.02 ? across.map((x) => x / d) : [Math.sin(fwd), -Math.cos(fwd), 0];
    const side = w >= 0.5 ? 'R' : 'L', hand = k['hand' + side], el = k['el' + side];
    const palm = g.dunk ? hand.map((x, i) => x - el[i]) : [0, 0, 1], n = Math.hypot(...palm) || 1;
    const natural = L.map((x, i) => lerpN(x, R[i], w) + 0.105 * (1 - both) * palm[i] / n);
    const rim = [pl.gripRimX ?? HOOP.x, pl.gripRimY ?? HOOP.y, HOOP.z + BALL_R + 0.045];
    let center = natural.map((x, i) => lerpN(x, rim[i], g.rim));
    const a = g.gather;
    if (a) {
      const fx = Math.cos(pl.face), fy = Math.sin(pl.face);
      const start = [pl.x + fx * a.fwd + fy * a.lat, pl.y + fy * a.fwd - fx * a.lat, a.z];
      center = center.map((x, i) => lerpN(start[i], x, a.mix));
    }
    for (const [s, hd, sign, weight] of [['L', L, -1, 1 - w], ['R', R, 1, w]]) {
      const f = Math.min(1, weight * 2) * g.fade;
      if (f === 0 || (!g.rim && !both && !a)) continue;
      const wArm = a ? f * (0.4 + 0.6 * a.mix) : f;
      const end = center.map((x, i) => lerpN(hd[i], x + 0.108 * (sign * both * axis[i] - (1 - both) * palm[i] / n), wArm));
      gripArm(k, s, end, !!a);
    }
    k.ball = center;
  }
  function fitLimb(k, root, joint, tip, extra, upper, lower) {
    const start = k[root], end = k[tip], elbow = k[joint];
    let axis = end.map((v, i) => v - start[i]), d0 = Math.hypot(...axis);
    if (d0 < 0.0001) { axis = [0, 0, -1]; d0 = 1; }
    const v = axis.map(x => x / d0), d = Math.max(Math.abs(upper - lower) + 0.0001, Math.min(distance3(start, end), upper + lower - 0.0001));
    const along = (d * d + upper * upper - lower * lower) / (2 * d);
    const perp = a => { const dot = a.reduce((sum, x, i) => sum + x * v[i], 0); return a.map((x, i) => x - dot * v[i]); };
    let bend = perp(elbow.map((x, i) => x - start[i])), n = Math.hypot(...bend);
    if (n < 0.0001) { bend = perp(Math.abs(v[2]) < 0.9 ? [0, 0, -1] : [0, -1, 0]); n = Math.hypot(...bend); }
    const height = Math.sqrt(Math.max(0, upper * upper - along * along));
    const target = start.map((x, i) => x + v[i] * d);
    k[joint] = start.map((x, i) => x + v[i] * along + bend[i] * height / n);
    k[tip] = target;
    k[extra] = k[extra].map((x, i) => x + target[i] - end[i]);
  }
  function distance3(a, b) { return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]); }

  function rig(pl, P = pl.pose, grip = true, body) {
    // 卡通化体型：身高差放大 1.7 倍，宽度/臂展按球员体型
    const C = pl.col || {}, bw = C.bw || 1, wg = C.wing || 1;
    const height = body ? body.height * (pl.h / body.baseHeight) : pl.h;
    const Hh = 1 + (height / 1.95 - 1) * (body ? 1.55 : 1.7);
    // 像素风头身比（约 1:4.5）：大头、短躯干、短腿
    const legs = body ? 0.95 * body.legs : 1, armLength = body ? 0.94 * body.arm : wg, fb = Math.max(0.6, 1 + 1.5 * (bw - 1));
    const th = 0.41 * Hh * legs, sh = th, to = 0.48 * Hh - 0.82 * Hh * (legs - 1), ua0 = 0.28 * Hh * armLength, fa0 = 0.26 * Hh * armLength;
    const hw = 0.12 * Hh * (body ? body.hip : 0.5 + 0.5 * fb), sw = 0.21 * Hh * (body ? body.shoulder : 0.55 + 0.45 * fb);
    function leg(side, a, b, s) {
      const hip = [side * hw, 0, 0];
      const knee = [hip[0] + side * Math.sin(s) * th, Math.sin(a) * Math.cos(s) * th, -Math.cos(a) * Math.cos(s) * th];
      const a2 = a - b;
      const foot = [knee[0] + side * Math.sin(s) * 0.4 * sh, knee[1] + Math.sin(a2) * sh, knee[2] - Math.cos(a2) * sh];
      const toe = [foot[0], foot[1] + 0.2 * Hh, foot[2]];
      return [hip, knee, foot, toe];
    }
    const L = leg(-1, P.lA, P.lB, P.lS), R = leg(1, P.rA, P.rB, P.rS);
    // 两段式 IK：髋固定、脚落点给定，膝盖沿原本的弯曲方向自然弯（整条腿从髋摆动，不是小腿绕膝画圈）
    function bendKnee(hip, knee, foot, a, b) {
      const radius = Math.sqrt(Math.max(0, Math.pow((a + b) * 0.999, 2) - Math.pow(foot[2] - hip[2], 2))), horizontal = Math.hypot(foot[0] - hip[0], foot[1] - hip[1]);
      if (horizontal > radius) {
        foot[0] = hip[0] + (foot[0] - hip[0]) * radius / horizontal;
        foot[1] = hip[1] + (foot[1] - hip[1]) * radius / horizontal;
      }
      const d = foot.map((v, i) => v - hip[i]), n0 = Math.hypot(...d) || 1e-6, u = d.map((v) => v / n0), L = Math.min(n0, (a + b) * 0.999);
      const k = knee.map((v, i) => v - hip[i]), kd = k[0] * u[0] + k[1] * u[1] + k[2] * u[2];
      let w = k.map((v, i) => v - kd * u[i]), wn = Math.hypot(...w);
      if (wn < 1e-6) { w = [0, 1, 0].map((v, i) => v - u[1] * u[i]); wn = Math.hypot(...w) || 1; }
      const along = (a * a - b * b + L * L) / (2 * L), up = Math.sqrt(Math.max(0, a * a - along * along));
      return hip.map((v, i) => v + u[i] * along + w[i] / wn * up);
    }
    // 卡通弹簧：sq < 1 压扁变宽，> 1 拉长变窄；脚底保持贴地
    const sy = pl.sq || 1, sxk = 1 + (1 - sy) * 0.9;
    const pelZ = (-Math.min(L[2][2], R[2][2]) + 0.06 * Hh) * sy + pl.z + (P.bob || 0) * Hh, bz = GT.bz(pl) / sy;
    if (P.crab > 0.001) {
      for (const [side, leg] of [['L', L], ['R', R]]) {
        const target = [(P['foot' + side + 'X'] || 0) / sxk, P['foot' + side + 'Y'] || 0, ((P['foot' + side + 'Z'] || 0) + pl.z + 0.06 * Hh - pelZ) / sy];
        const foot = leg[2].map((v, i) => lerpN(v, target[i], P.crab));
        leg[1] = bendKnee(leg[0], leg[1], foot, th, sh);
        leg[2] = foot;
        leg[3] = [leg[2][0], leg[2][1] + 0.2 * Hh, leg[2][2]];
      }
    }
    const sl = Math.sin(P.lean), cl = Math.cos(P.lean);
    const ti = Math.sin(P.tilt || 0), tc = Math.cos(P.tilt || 0);
    const chest = [ti * to, sl * to, cl * tc * to + bz];
    const head = [ti * (to + 0.29 * Hh), sl * (to + 0.29 * Hh), cl * tc * (to + 0.29 * Hh) + bz * 0.8];
    function arm(side, p, q, e) {
      // 美卡式拉伸：盖帽 / 抢断瞬间手臂可以拉长去够球
      const ks = Math.min(1.6, ((pl.armS && pl.armS[side < 0 ? 0 : 1]) || 1) * (P[side < 0 ? 'reachL' : 'reachR'] || 1)), ua = ua0 * ks, fa = fa0 * ks;
      const s0 = [chest[0] + side * sw * tc, chest[1], chest[2] - 0.03 - side * sw * ti];
      const el = [s0[0] + side * Math.sin(q) * ua, s0[1] + Math.sin(p) * Math.cos(q) * ua, s0[2] - Math.cos(p) * Math.cos(q) * ua];
      const p2 = p + e, q2 = q * 0.4;
      const hd = [el[0] + side * Math.sin(q2) * fa, el[1] + Math.sin(p2) * Math.cos(q2) * fa, el[2] - Math.cos(p2) * Math.cos(q2) * fa];
      return [s0, el, hd];
    }
    const AL = arm(-1, P.aLp, P.aLq, P.aLe), AR = arm(1, P.aRp, P.aRq, P.aRe);
    const fing = (A, f) => { const d = [A[2][0] - A[1][0], A[2][1] - A[1][1], A[2][2] - A[1][2]], n = Math.hypot(d[0], d[1], d[2]) || 1, L = (0.075 + 0.03 * f) * Hh * (body ? body.hand : 1);
      const u = [d[0] / n, d[1] / n, d[2] / n], w = [u[0] * 0.25, 0.75, -0.66], m = Math.hypot(w[0], w[1], w[2]), c = [lerpN(u[0], w[0] / m, f), lerpN(u[1], w[1] / m, f), lerpN(u[2], w[2] / m, f)];
      return [A[2][0] + c[0] * L, A[2][1] + c[1] * L, A[2][2] + c[2] * L]; };
    const fa_ = pl.face + ((P && P.yaw) || 0), fx = Math.cos(fa_), fy = Math.sin(fa_), rx = fy, ry = -fx;
    const tw = (v) => [pl.x + rx * v[0] * sxk + fx * v[1], pl.y + ry * v[0] * sxk + fy * v[1], pelZ + v[2] * sy];
    const k = {
      hipL: tw(L[0]), kneeL: tw(L[1]), footL: tw(L[2]), toeL: tw(L[3]),
      hipR: tw(R[0]), kneeR: tw(R[1]), footR: tw(R[2]), toeR: tw(R[3]),
      pelvis: tw([0, 0, 0]), chest: tw(chest), head: tw(head),
      shL: tw(AL[0]), elL: tw(AL[1]), handL: tw(AL[2]),
      shR: tw(AR[0]), elR: tw(AR[1]), handR: tw(AR[2]),
      // V4.0 手指段：沿前臂延长；投篮压腕（pose.flR/flL）时朝前下方弯（鹅颈）
      fgL: tw(fing(AL, P.flL || 0)), fgR: tw(fing(AR, P.flR || 0)),
    };
    if (pl.stealFoot && !pl.stealFoot.sampling) {
      const side = pl.stealFoot.side, foot = k['foot' + side], planted = pl.stealFoot.pos;
      k['toe' + side] = k['toe' + side].map((v, i) => v + planted[i] - foot[i]);
      k['foot' + side] = planted.slice();
    }
    if (grip && P === pl.pose && pl.grip) finishGrip(k, pl);
    if (grip && P === pl.pose && P.passHands) {
      for (const side of ['L', 'R']) gripArm(k, side, P.passHands[side], false);
    }
    if (grip && P === pl.pose && P.ftHand) gripArm(k, P.ftHand.side, P.ftHand.target, false, true);
    return k;
  }
  PH.rig = rig;
  PH.footTarget = (pl, side) => visualRig(pl)['foot' + side];

  function visualRig(pl, ftHand = pl.pose.ftHand) {
    const body = pl.col.body;
    const k = rig(pl, pl.pose, !body && !pl.pose.ftHand, body);
    // 用比赛骨架的手部落点，保持持球、触球和盖帽动作对齐。
    if (body && (pl.grip || pl.hasBall || pl.anim === 'block' || pl.anim === 'steal' || pl.armS || pl.pose.passHands)) {
      const live = rig(pl, pl.pose, !pl.pose.ftHand);
      for (const side of ['L', 'R']) gripArm(k, side, live['hand' + side], false, true);
    }
    const height = body ? body.height * pl.h / body.baseHeight : pl.h;
    const Hh = 1 + (height / 1.95 - 1) * (body ? 1.55 : 1.7), arm = body ? 0.94 * body.arm : pl.col.wing || 1;
    const leg = 0.41 * Hh * (body ? 0.95 * body.legs : 1);
    for (const side of ['L', 'R']) {
      fitLimb(k, 'hip' + side, 'knee' + side, 'foot' + side, 'toe' + side, leg, leg);
      fitLimb(k, 'sh' + side, 'el' + side, 'hand' + side, 'fg' + side, 0.28 * Hh * arm, 0.26 * Hh * arm);
    }
    if (ftHand) gripArm(k, ftHand.side, ftHand.target, false, true);
    return k;
  }

  PH.ftCatchHand = (pl, side, ball, gripOffset, w) => {
    const k = visualRig(pl, null), shoulder = k['sh' + side];
    const d = distance3(shoulder, ball) || 1;
    const target = ball.map((v, i) => v + lerpN((shoulder[i] - v) * (0.11 / d), gripOffset[i], w));
    pl.pose.ftHand = { side, target };
    gripArm(k, side, target, false, true);
    return Math.max(distance3(k['hand' + side], ball), distance3(rig(pl)['hand' + side], ball));
  };

  const SZ = 300, OX = 150, OY = 270;
  const PINSTRIPES = [0.23, 0.5, 0.77];
  const FACES = { square: { w: 1, h: 1.05, r: 0.1, rb: 0.12, chin: 0 }, round: { w: 1.04, h: 1.02, r: 0.42, rb: 0.42, chin: 0 }, oval: { w: 0.9, h: 1.14, r: 0.34, rb: 0.38, chin: 0.12 },
    long: { w: 0.84, h: 1.26, r: 0.24, rb: 0.3, chin: 0.08 }, wide: { w: 1.2, h: 0.98, r: 0.34, rb: 0.3, chin: 0 },
    tapered: { w: 1, h: 1.14, r: 0.33, rb: 0.34, chin: 0.13 },
    youthful: { w: 1.03, h: 1.07, r: 0.34, rb: 0.42, chin: 0.04, soft: true } };
  const headHeight = (face, size) => Math.max(5, Math.round(size * (FACES[face] || FACES.square).h));
  const HAIRLINE = { buzz: 0.14, receding: 0.14, crop: 0.23, fade: 0.23, curlfade: 0.22, braids: 0.24, longbraids: 0.24, wispy: 0.2 };
  const HAIR_NAPE = { buzz: 0.73, receding: 0.68, crop: 0.72, fade: 0.7, curlfade: 0.76, braids: 0.8, longbraids: 0.84,
    afro: 0.84, curly: 0.79, locks: 0.84, long: 0.82, swept: 0.77, wispy: 0.68 };
  const NAPE_TAPER = { buzz: 0.12, receding: 0.055, crop: 0.07, fade: 0.24, curlfade: 0.17, short: 0.1 };
  function drawHead(c, C, x, y, size, facing) {
    const fs = FACES[C.face] || FACES.square;
    const w = Math.max(5, Math.round(size * fs.w)), h = headHeight(C.face, size);
    const left = Math.round(x - w / 2), top = Math.round(y - h / 2);
    const back = Math.sin(facing), away = back > 0.35, side = Math.cos(facing), profile = Math.abs(side) > 0.45;
    const px = (x, y, w, h, col) => {
      c.fillStyle = col; c.fillRect(left + Math.round(x), top + Math.round(y), Math.max(1, Math.round(w)), Math.max(1, Math.round(h)));
    };
    const dark = C.skin[0], skin = C.skin[1], hr = C.hair, st = C.style, bh = shade(hr, 1.85);
    const crown = Math.max(1, Math.round(h * 0.15));
    const earY = h * 0.49, earW = Math.max(1, w * 0.09);
    if (!profile || side > 0) px(-earW, earY, earW, h * 0.22, dark);
    if (!profile || side < 0) px(w, earY, earW, h * 0.22, dark);
    if (st === 'afro') {
      const brim = Math.round(w * 0.19), span = w + 2 * brim, step = Math.max(1, Math.round(span / 11));
      for (let i = 0; i < span; i += step) {
        const curve = Math.sin(Math.PI * (i + 0.5) / span);
        const lift = h * (0.06 + 0.22 * curve) + (i / step % 3 === 1 ? 1 : 0);
        px(i - brim, -lift, Math.min(step, span - i), lift + h * (0.32 + 0.24 * curve), hr);
      }
    }
    if (st === 'curly' || st === 'locks' || st === 'wispy') {
      const step = Math.max(2, Math.floor(w / 5));
      for (let i = 0; i < w; i += step) {
        const width = Math.min(step, w - i), curve = Math.sin(Math.PI * (i + width / 2) / w);
        const lift = st === 'wispy' ? (i % 3 + 1) * 0.6
          : away || profile ? crown * (0.38 + curve * (st === 'curly' ? 1.17 : 0.68)) + (i / step % 2 ? 1 : 0)
          : crown * (i === 0 ? 0.6 : 1.3);
        px(i, -lift, width, h * 0.2 + lift, hr);
      }
    }
    if (st === 'curlfade') {
      const step = Math.max(2, Math.round(w / 6));
      for (let i = step; i < w - step; i += step) {
        const lift = Math.max(1, Math.round(crown * ((i / step) % 2 ? 0.5 : 0.3)));
        px(i, -lift, Math.min(step + 1, w - step - i), crown + lift, hr);
      }
    }
    if (st === 'swept') {
      const part = away ? 0.24 : 0.17;
      px(w * part, -crown, w * 0.59, crown, hr); px(0, -crown * 0.45, w * 0.89, crown, hr);
    }
    const longBraids = () => {
      const stride = Math.max(2, Math.round(w / 4.5)), strand = Math.max(1, stride - 1);
      for (let i = -1; i < w + 1; i += stride) {
        const u = (i + strand / 2) / w;
        if (away || (!profile && (u < 0.16 || u > 0.84)) || (profile && (side > 0 ? u < 0.34 : u > 0.66))) {
          const end = h * (1.34 + 0.16 * Math.sin((i + 1) * 2));
          px(i, h * 0.31, strand, end - h * 0.31, hr);
          px(i + (side > 0 ? -1 : 1), end, strand, h * 0.12, hr);
          if (strand >= 2) for (let y = Math.round(h * 0.53); y < end; y += 3) px(i + (y % 2), y, 1, 1, bh);
        }
      }
    };
    if (st === 'longbraids') longBraids();
    if (st === 'locks' || st === 'long' || (st === 'braids' && away)) {
      const stride = Math.max(2, Math.round(w / 4));
      for (let i = 0; i < w + stride; i += stride) {
        const lx = Math.min(w, i) - 1;
        if (away || i === 0 || i >= w) px(lx, h * 0.16, Math.max(1, stride - 1), h * (st === 'locks' ? 0.9 : 0.66) - i % 3, hr);
      }
    }
    c.save(); c.beginPath();
    const rt = Math.round(fs.r * w), rb = Math.round(fs.rb * w);
    const inset = (i, r) => i < r ? r - Math.round(Math.sqrt(r * r - (r - i - 0.5) ** 2)) : 0;
    for (let i = 0; i < h; i++) {
      const chin = Math.round(fs.chin * w * Math.max(0, (i / h - 0.55) / 0.45) ** 1.6);
      const edge = Math.min(Math.max(inset(i, rt), inset(h - 1 - i, rb)) + chin, (w >> 1) - 1);
      c.rect(left + edge, top + i, w - edge * 2, 1);
    }
    c.clip();
    px(0, 0, w, h, dark); px(0, 0, w - Math.max(1, w * 0.13), h - 1, skin);
    if (st === 'bald') px(w * 0.25, h * 0.12, w * 0.26, 1, shade(skin, 1.18));
    else {
      const hairline = HAIRLINE[st] || 0.3;
      const close = st === 'buzz' || st === 'receding';
      const nape = HAIR_NAPE[st] || 0.74, taper = NAPE_TAPER[st];
      const hairColor = close && !C.dyed ? shade(skin, st === 'buzz' ? 0.53 : 0.44) : hr;
      const fadeColor = close && !C.dyed ? shade(skin, 0.71) : shade(hr, st === 'fade' ? 2.23 : 1.63);
      const braidStart = Math.max(1, Math.round(w / 6)), braidStep = Math.max(2, Math.round(w / 4));
      const rear = Math.max(0, back * 2.25);
      const profileMix = clampR(Math.min((back + 0.75) / 0.45, (0.45 - back) / 0.1), 0, 1);
      for (let i = 0; i < w; i++) {
        const u = (i + 0.5) / w;
        const distanceFromNape = side > 0 ? u : 1 - u;
        const temple = clampR((0.43 - distanceFromNape) / 0.18, 0, 1);
        const crownDepth = Math.min(1, Math.max(rear, (1 + back) / 2 + side * (0.5 - u)));
        const towardNape = lerpN(crownDepth, temple, profileMix);
        const contour = away ? nape - 0.055 * Math.abs(2 * u - 1) : Math.max(0.74, nape);
        const depth = Math.max(away ? Math.ceil(0.63 * h) : 1, Math.round(h * lerpN(hairline, contour, towardNape)));
        const braid = (st === 'braids' || st === 'longbraids') && i >= braidStart && i < w - 1 && (i - braidStart) % braidStep === 0;
        const fadeStart = taper && towardNape > 0.24 ? Math.max(1, depth - Math.max(1, Math.round(h * taper))) : depth;
        px(i, 0, 1, fadeStart, braid ? bh : hairColor);
        if (fadeStart < depth) px(i, fadeStart, 1, depth - fadeStart, fadeColor);
        if ((away || (profile && towardNape > 0.6)) && !close && !braid && depth >= 5) {
          if ((st === 'afro' || st === 'curly' || st === 'curlfade' || st === 'locks' || st === 'wispy') && i % 3 !== 2) {
            const y = 1 + (i * 5 + Math.floor(i / 3)) % Math.max(1, fadeStart - 2);
            if (y < fadeStart) px(i, y, 1, 1, i % 3 ? bh : shade(hr, 1.4));
          }
          if ((st === 'swept' || st === 'short') && i >= w * 0.17 && i < w * 0.8) {
            const y = Math.round(h * (st === 'swept' ? 0.09 + 0.2 * u : 0.18 + 0.13 * Math.abs(u - 0.5)));
            if (y < fadeStart) px(i, y, 1, 1, shade(hr, st === 'swept' ? 1.75 : 1.4));
          }
        }
      }
      if (!away && st === 'receding') px(w * 0.33, h * 0.08, w * 0.34, h * 0.12, hr);
      if (!away && st === 'swept') {
        px(w * 0.04, h * 0.19, w * 0.55, h * 0.12, hr);
        px(w * 0.16, h * 0.07, w * 0.48, 1, bh);
      }
      if (st === 'longbraids') longBraids();
    }
    if (C.band) {
      px(0, h * 0.22, w, h * 0.1, C.band);
      if (h >= 15) px(0, h * 0.22, w, 1, shade(C.band, 1.16));
    }
    if (!away) {
      const ey = h * 0.49, open = C.eyes === 'open', hooded = C.eyes === 'hooded';
      const es = Math.max(1, Math.floor(w * (open ? 0.22 : hooded ? 0.24 : 0.15))), ei = Math.max(1, Math.round(w * (open ? 0.2 : 0.19)));
      const eyes = profile ? [side > 0 ? w - ei - es : ei] : [ei, w - ei - es];
      const cx = w * 0.5 + side * w * 0.21, nose = shade(skin, fs.soft ? 0.91 : 0.81);
      const browWidth = es + (C.brow === 'heavy' ? 1 : 0) - (fs.soft ? 1 : 0), browColor = fs.soft ? shade(skin, 0.62) : hr;
      for (const ex of eyes) {
        if (w >= 10) px(ex, ey - (open ? 3 : C.brow === 'soft' ? 1 : 2), browWidth, 1, browColor);
        if (hooded) {
          px(ex, ey - 1, es, 1, shade(skin, 0.57));
          if (es > 1) px(ex, ey, es, 1, shade(skin, 1.48));
          px(ex + Math.floor(es / 2), ey, 1, 1, '#211620');
        } else if (open && es > 2) {
          px(ex, ey, es, 1, '#eee6da');
          px(ex + 1, ey + 1, es - 2, 1, '#eee6da');
          px(ex + Math.floor(es / 2), ey, 1, 2, '#3d2c24');
        } else {
          const eh = es * 0.74;
          if (es > 1) px(ex, ey, es, eh, '#eee6da');
          px(ex + (es > 1 && side >= 0 ? es - 1 : 0), ey, 1, eh, '#211620');
        }
      }
      if (!profile && C.brow === 'joined') px(ei, ey - 2, w - ei * 2, 1, hr);
      if (w >= 8) {
        px(cx, h * 0.58, w * 0.09, h * (fs.soft ? 0.06 : 0.1), nose);
        if (!fs.soft) px(cx - w * 0.09, h * 0.68, w * 0.18, 1, dark);
      }
      if (C.mask) {
        const frame = '#dfeced';
        px(w * 0.08, h * 0.36, w * 0.84, 1, frame);
        px(w * 0.08, h * 0.36, 1, h * 0.32, frame); px(w * 0.84, h * 0.36, 1, h * 0.32, frame);
        px(w * 0.08, h * 0.68, w * 0.84, 1, frame); px(cx, h * 0.48, 1, h * 0.2, frame);
      }
      const bd = C.beard === true ? 'full' : C.beard;
      if (bd === 'full' || bd === 'boxed' || bd === 'long') {
        const close = bd === 'full' && C.beardFit === 'close';
        const cheek = close ? 0.12 : bd === 'boxed' ? 0.16 : 0.22, cheekTop = close ? 0.67 : 0.62;
        px(0, h * cheekTop, w * cheek, h * (1 - cheekTop), hr); px(w * (1 - cheek), h * cheekTop, w * cheek, h * (1 - cheekTop), hr);
        px(0, h * 0.82, w, h * 0.18, hr); px(cx - w * 0.18, h * 0.73, w * 0.36, 1, hr);
      } else if (bd === 'goatee') {
        if (C.beardFit === 'light') {
          const beard = shade(skin, 0.46), moustache = shade(skin, 0.57);
          px(cx - w * 0.11, h * 0.86, w * 0.22, h * 0.12, beard);
          if (w >= 12) {
            px(cx - w * 0.17, h * 0.73, w * 0.13, 1, moustache);
            px(cx + w * 0.04, h * 0.73, w * 0.13, 1, moustache);
          } else px(cx - w * 0.13, h * 0.73, w * 0.26, 1, moustache);
        } else {
          px(cx - w * 0.14, h * 0.84, w * 0.28, h * 0.16, hr);
          if (C.smile) px(cx - w * 0.23, h * 0.72, w * 0.46, 1, hr);
        }
      } else if (bd === 'trimmed') {
        px(w * 0.04, h * 0.72, w * 0.1, h * 0.19, hr); px(w * 0.86, h * 0.72, w * 0.1, h * 0.19, hr);
        px(w * 0.1, h * 0.87, w * 0.8, h * 0.13, hr); px(cx - w * 0.17, h * 0.73, w * 0.34, 1, hr);
      } else if (bd === 'stubble') px(0, h * 0.85, w, h * 0.15, shade(skin, 0.64));
      if (w >= 8) px(cx - w * 0.12, h * 0.79, w * 0.24, 1, fs.soft ? shade(skin, 0.81) : dark);
      if (C.smile && w >= 8) {
        px(cx - w * 0.27, h * 0.77, w * 0.54, h * 0.12, dark);
        px(cx - w * 0.23, h * 0.77, w * 0.46, 1, '#fff3df');
      }
      if (C.mouthguard) px(cx + (side < -0.45 ? -w * 0.17 : w * 0.08), h * 0.79, w * 0.14, 1, '#f4ede0');
      if (bd === 'long') {
        c.restore();
        px(w * 0.16, h * 0.89, w * 0.68, h * 0.19, hr); px(w * 0.24, h, w * 0.52, h * 0.19, hr);
        return top + h * 0.49;
      }
    }
    c.restore();
    return top + h * 0.49;
  }

  const JERSEY_DIGITS = [
    [7, 5, 5, 5, 7], [2, 6, 2, 2, 7], [7, 1, 7, 4, 7], [7, 1, 7, 1, 7], [5, 5, 7, 1, 1],
    [7, 4, 7, 1, 7], [7, 4, 7, 5, 7], [7, 1, 1, 2, 2], [7, 5, 7, 5, 7], [7, 5, 7, 1, 7],
  ];
  const COMPACT_JERSEY_DIGITS = [
    [3, 2, 2, 2, 3], [1, 3, 1, 1, 1], [3, 1, 3, 2, 3], [3, 1, 3, 1, 3], [2, 2, 3, 1, 1],
    [3, 2, 3, 1, 3], [2, 2, 3, 3, 3], [3, 1, 1, 2, 2], [3, 2, 3, 2, 3], [3, 3, 3, 1, 1],
  ];
  function drawJerseyNumber(c, C, torso, s) {
    const num = C.jerseyNo, torsoWidth = Math.round(torso.w);
    const compact = num.length === 2 && torsoWidth < 8;
    const digitWidth = compact ? 2 : 3, gap = compact && torsoWidth < 5 ? 0 : 1;
    const stride = digitWidth + gap, width = num.length * stride - gap;
    const scale = compact ? 1 : Math.max(1, Math.min(Math.floor((torsoWidth - 1) / width), Math.floor(s / 24)));
    const x = Math.round(lerpN(torso.a.x, torso.b.x, compact ? 0.2 : 0.66) - width * scale / 2);
    const y = Math.max(torso.top, Math.round(lerpN(torso.a.y, torso.b.y, 0.2) - 2.5 * scale));
    c.fillStyle = C.jerseyInk;
    for (let i = 0; i < num.length; i++) {
      const rows = (compact ? COMPACT_JERSEY_DIGITS : JERSEY_DIGITS)[num[i]];
      for (let r = 0; r < rows.length; r++) for (let col = 0; col < digitWidth; col++) {
        if (rows[r] & (1 << (digitWidth - 1 - col))) c.fillRect(x + (stride * i + col) * scale, y + r * scale, scale, scale);
      }
    }
  }

  const trailHistory = new Map();
  let trailScene, trailView;
  function sprintTrail(pl, frame, capture) {
    if (!frame) return [];
    if (frame.scene !== trailScene || frame.view !== trailView) {
      trailHistory.clear(); trailScene = frame.scene; trailView = frame.view;
    }
    const K = PH.game.K, alpha = Math.max(0, Math.min(0.3, K.fxTrailAlpha));
    const count = Math.max(0, Math.min(5, Math.round(K.fxTrailCount)));
    const spacing = Math.max(0.025, Math.min(0.1, K.fxTrailSpacing));
    const w = PH.gait.spW(pl), weight = Math.max(0, Math.min(1, (w - 0.15) / 0.85));
    let state = trailHistory.get(pl.id);
    if (!alpha || !count || !weight || pl.anim !== 'run' || !(pl.speed > 0.9) || pl.off) {
      if (state) while (state.history.length) state.pool.push(state.history.pop());
      return [];
    }
    if (!state) { state = { history: [], pool: [] }; trailHistory.set(pl.id, state); }
    const { history, pool } = state;
    const last = history[history.length - 1], t = frame.time;
    if (last && (t < last.t || t - last.t > 0.2 || Math.hypot(pl.x - last.x, pl.y - last.y) > 2)) {
      while (history.length) pool.push(history.pop());
    }
    while (history.length && t - history[0].t > spacing * (count + 1)) pool.push(history.shift());
    const copies = [];
    for (let i = count; i >= 1; i--) {
      const target = t - spacing * i;
      let g;
      for (let j = history.length - 1; j >= 0; j--) if (history[j].t <= target + 1e-6) { g = history[j]; break; }
      if (g && Math.hypot(pl.x - g.x, pl.y - g.y) > 0.08) copies.push({ ...g, a: alpha * weight * Math.pow(1 - (i - 1) / count, 1.5) });
    }
    if (!history.length || t - history[history.length - 1].t >= spacing / 2 - 1e-6) {
      const snapshot = capture(pool.pop());
      snapshot.x = pl.x; snapshot.y = pl.y; snapshot.t = t;
      history.push(snapshot);
    }
    return copies;
  }

  function drawPlayer(pl, opts) {
    const k = visualRig(pl), J = {};
    const base = proj(pl.x, pl.y, 0);
    const ox = Math.round(base.x) - OX, oy = Math.round(base.y) - OY;
    for (const n in k) { const p = proj(k[n][0], k[n][1], k[n][2]); J[n] = { x: p.x - ox, y: p.y - oy, d: p.d, s: p.s }; }
    const s = base.s, C = pl.col;
    sctx.clearRect(0, 0, SZ, SZ);
    const segs = [];
    const seg = (a, b, w, col, bias = 0, top) => segs.push({ a: J[a], b: J[b], w: w * s, c: col, d: (J[a].d + J[b].d) / 2 + bias, top });
    // 体型夸张化：瘦的更瘦、壮的更壮（bw 偏离 1 的部分放大 1.5 倍）
    const bw = C.bw || 1, fb = Math.max(0.6, 1 + 1.5 * (bw - 1)), B = C.body;
    const lw = B ? B.limb : (0.5 + 0.5 * fb) * 1.12, tw = B ? B.chest : (0.2 + 0.8 * fb) * 1.06;
    const armWidth = B ? B.armThickness : lw;
    const headSize = 0.38 * s * (B ? B.headScale : 0.92 + 0.08 * Math.min(1.4, tw));
    const shoulderTop = Math.ceil(J.head.y + 0.25 * headHeight(C.face, headSize));
    for (const side of ['L', 'R']) {
      const hip = J['hip' + side], knee = J['knee' + side], hem = 'hem' + side;
      if (B) J[hem] = { x: lerpN(hip.x, knee.x, 0.82), y: lerpN(hip.y, knee.y, 0.82), d: lerpN(hip.d, knee.d, 0.82) };
      const shortsEnd = B ? hem : 'knee' + side;
      seg('hip' + side, shortsEnd, (B ? 0.21 * (B.shortsScale || 1) : 0.17) * lw, C.shorts);
      if (B) seg(hem, 'knee' + side, 0.135 * lw, C.skin);
      seg('knee' + side, 'foot' + side, (B ? 0.12 : 0.11) * lw, C.skin);
    }
    seg('footL', 'toeL', 0.12, C.shoe, -0.01); seg('footR', 'toeR', 0.12, C.shoe, -0.01);
    seg('hipL', 'hipR', (B ? 0.23 * (B.shortsScale || 1) : 0.2) * lw, C.shorts);
    if (B) {
      const P = J.pelvis, Q = J.chest;
      J.mid = { x: (P.x + Q.x) / 2, y: (P.y + Q.y) / 2, d: (P.d + Q.d) / 2 };
      J.neck = { x: lerpN(Q.x, J.head.x, 0.55), y: lerpN(Q.y, J.head.y, 0.55), d: Q.d };
      seg('pelvis', 'mid', 0.32 * B.waist, C.jersey, 0, shoulderTop);
      seg('mid', 'chest', 0.375 * tw, C.jersey, 0, shoulderTop);
      if (B.taper || C.pinstripes) {
        segs[segs.length - 2].hidden = true;
        segs[segs.length - 1].torso = true;
      }
      seg('chest', 'neck', 0.13 * (0.72 * lw + 0.28 * B.shoulder) * (B.neckScale || 1), C.skin, 0.02);
    } else seg('pelvis', 'chest', 0.31 * tw, C.jersey, 0, shoulderTop);
    seg('shL', 'shR', 0.12 * (B ? B.chest : 0.6 + 0.4 * fb), C.jersey, 0, shoulderTop);
    for (const side of ['L', 'R']) {
      const sleeve = C.sleeve === side ? [C.shorts[0], C.trim] : C.skin;
      const upper = (B ? 0.122 : 0.11) * armWidth, elbowTop = Math.round(J['el' + side].y - Math.max(1, Math.round(upper * s)) / 2);
      seg('sh' + side, 'el' + side, upper, sleeve, 0, Math.min(shoulderTop, elbowTop));
      if (C.tattoos && C.sleeve !== side) {
        segs[segs.length - 1].tattoos = true;
      }
      seg('el' + side, 'hand' + side, (B ? 0.106 : 0.095) * armWidth, sleeve);
      if (C.wristband) segs[segs.length - 1].wristband = true;
      if (B || (pl.pose['fl' + side] || 0) > 0.15) seg('hand' + side, 'fg' + side, 0.075 * lw, C.skin);
    }
    segs.push({ head: true, d: J.head.d - 0.02 });
    segs.sort((a, b) => b.d - a.d);
    const facing = pl.face + (pl.pose.yaw || 0), away = Math.sin(facing);
    const numberTorso = C.jerseyNo != null && Math.abs(away) > 0.55
      ? segs.find(g => g.a === (J.mid || J.pelvis) && g.b === J.chest) : null;
    let lastJersey;
    if (numberTorso) {
      const glyphWidth = C.jerseyNo.length === 2 ? 4 : 3;
      if (Math.round(numberTorso.w) < glyphWidth) numberTorso.w = glyphWidth;
      for (let i = segs.length - 1; i >= 0; i--) {
        if (segs[i].c === C.jersey) { lastJersey = segs[i]; break; }
      }
    }
    for (const g of segs) {
      if (g.head) {
        drawHead(sctx, C, J.head.x, J.head.y, headSize, facing);
      } else if (g.torso) {
        const top = Math.max(shoulderTop, Math.round(J.chest.y - 0.06 * s));
        const bottom = Math.max(top + 1, Math.round(J.pelvis.y + 0.07 * s));
        for (let y = top; y <= bottom; y++) {
          const t = (y - top) / (bottom - top), width = Math.max(1, Math.round(lerpN(0.375 * tw, 0.32 * B.waist, t) * s));
          const x = Math.round(lerpN(J.chest.x, J.pelvis.x, t) - width / 2);
          sctx.fillStyle = C.jersey[0]; sctx.fillRect(x, y, width, 1);
          sctx.fillStyle = C.jersey[1]; sctx.fillRect(x, y, Math.max(1, width - 1), 1);
          if (C.pinstripes && width >= 5) {
            sctx.fillStyle = C.pinstripes;
            for (const u of PINSTRIPES) sctx.fillRect(x + Math.round(u * (width - 2)), y, 1, 1);
          }
        }
        if (g === lastJersey) drawJerseyNumber(sctx, C, numberTorso, s);
      } else if (g.hidden) {
        continue;
      } else {
        brush(sctx, g.a.x, g.a.y, g.b.x, g.b.y, g.w, g.c[0], g.c[1], g.top, !!B && (g.c === C.jersey || g.c === C.shorts), g.endWidth);
        if (g.wristband) {
          const x = lerpN(g.a.x, g.b.x, 0.81), y = lerpN(g.a.y, g.b.y, 0.81);
          const dx = g.b.x - g.a.x, dy = g.b.y - g.a.y, len = Math.hypot(dx, dy) || 1;
          const half = g.w * 0.35 / len, nx = dy * half, ny = -dx * half;
          brush(sctx, x - nx, y - ny, x + nx, y + ny, Math.max(2, 0.046 * s), ...C.wristband);
        }
        if (g.tattoos) {
          sctx.fillStyle = '#344947';
          for (const t of [0.25, 0.4, 0.65]) {
            const x = Math.round(lerpN(g.a.x, g.b.x, t)), y = Math.max(g.top || 0, Math.round(lerpN(g.a.y, g.b.y, t)));
            sctx.fillRect(x - 1, y, Math.max(1, Math.round(g.w * 0.65)), 1);
          }
        }
        if (g === lastJersey) drawJerseyNumber(sctx, C, numberTorso, s);
      }
    }
    // 球衣号码色块
    if (C.jerseyNo == null && s > 20 && Math.abs(away) > 0.3) {
      const mx = Math.round((J.pelvis.x + J.chest.x) / 2), my = Math.round((J.pelvis.y * 0.35 + J.chest.y * 0.65));
      sctx.fillStyle = C.trim; sctx.fillRect(mx - 2, my, 3, Math.max(3, Math.round(0.14 * s)));
      if (pl.id === 1) sctx.fillRect(mx + 2, my, 1, Math.max(3, Math.round(0.14 * s)));
    }
    if (opts && opts.ghost) {
      silx.globalCompositeOperation = 'source-over'; silx.clearRect(0, 0, SZ, SZ); silx.drawImage(spr, 0, 0);
      silx.globalCompositeOperation = 'source-in'; silx.fillStyle = opts.ghost.c; silx.fillRect(0, 0, SZ, SZ);
      ctx.globalAlpha = opts.ghost.a; ctx.drawImage(sil, ox, oy); ctx.globalAlpha = 1; return null;
    }
    const trail = sprintTrail(pl, opts && opts.trail, (snapshot = {}) => {
      const pad = Math.ceil(s * 0.4 + 4);
      let minX = SZ, minY = SZ, maxX = 0, maxY = 0;
      for (const n in J) { const p = J[n]; minX = Math.min(minX, p.x); minY = Math.min(minY, p.y); maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y); }
      const x = Math.max(0, Math.min(SZ - 1, Math.floor(minX - pad)));
      const y = Math.max(0, Math.min(SZ - 1, Math.floor(minY - pad)));
      const w = Math.max(1, Math.min(SZ - x, Math.ceil(maxX + pad) - x));
      const h = Math.max(1, Math.min(SZ - y, Math.ceil(maxY + pad) - y));
      const image = snapshot.image || document.createElement('canvas');
      if (!snapshot.image || image.width < w || image.height < h) {
        image.width = Math.max(snapshot.image ? image.width : 0, Math.ceil(w / 16) * 16);
        image.height = Math.max(snapshot.image ? image.height : 0, Math.ceil(h / 16) * 16);
      }
      const c = image.getContext('2d'); c.clearRect(0, 0, image.width, image.height);
      c.drawImage(spr, x, y, w, h, 0, 0, w, h);
      return Object.assign(snapshot, { image, dx: x - OX, dy: y - OY, s, w, h });
    });
    if (trail.length) ctx.save();
    for (const g of trail) {
      const p = proj(g.x, g.y, 0), scale = p.s / g.s;
      ctx.globalAlpha = g.a;
      ctx.drawImage(g.image, 0, 0, g.w, g.h, Math.round(p.x + g.dx * scale), Math.round(p.y + g.dy * scale), Math.round(g.w * scale), Math.round(g.h * scale));
    }
    if (trail.length) ctx.restore();
    const skA = pl.skAu && pl.skAu > PH.game.G.time, grA = !skA && pl.grabT && PH.game.G.time - pl.grabT < 0.36 && ((PH.game.G.time - pl.grabT) * 16 | 0) % 2 === 0;
    if (pl.tkOn > 0 || skA || grA) {
      // 主宰：身上一圈跳动的橙色火光描边；专属技能触发：金白色
      const Gt = PH.game.G.time, pu = 0.55 + 0.45 * Math.sin(Gt * 10 + pl.id);
      silx.globalCompositeOperation = 'source-over'; silx.clearRect(0, 0, SZ, SZ); silx.drawImage(spr, 0, 0);
      silx.globalCompositeOperation = 'source-in'; silx.fillStyle = grA ? '#ffffff' : skA ? (Math.sin(Gt * 30) > 0 ? '#ffffff' : '#ffd24a') : Math.sin(Gt * 23) > 0 ? '#ff8a2a' : '#ffd24a'; silx.fillRect(0, 0, SZ, SZ);
      ctx.globalAlpha = 0.5 + 0.4 * pu; const o2 = 2 + Math.round(pu);
      ctx.drawImage(sil, ox - o2, oy); ctx.drawImage(sil, ox + o2, oy); ctx.drawImage(sil, ox, oy - o2 - 1); ctx.drawImage(sil, ox, oy + 1);
      ctx.drawImage(sil, ox - 1, oy - 2); ctx.drawImage(sil, ox + 1, oy - 2); ctx.globalAlpha = 1;
    }
    silx.globalCompositeOperation = 'source-over'; silx.clearRect(0, 0, SZ, SZ); silx.drawImage(spr, 0, 0);
    silx.globalCompositeOperation = 'source-in'; silx.fillStyle = opts && opts.flash ? '#ffffff' : '#15101f'; silx.fillRect(0, 0, SZ, SZ);
    ctx.drawImage(sil, ox - 1, oy); ctx.drawImage(sil, ox + 1, oy); ctx.drawImage(sil, ox, oy - 1); ctx.drawImage(sil, ox, oy + 1);
    ctx.drawImage(spr, ox, oy);
    if (pl.stun > 0.05 && (!pl.stunK || pl.stunK === 'off')) {
      const hp = proj(k.head[0], k.head[1], k.head[2] + 0.3);
      for (let i = 0; i < 3; i++) { const a = PH.game.G.time * 9 + i * 2.1; ctx.fillStyle = '#ffe14a'; ctx.fillRect(Math.round(hp.x + Math.cos(a) * 7), Math.round(hp.y + Math.sin(a) * 2.5), 2, 2); }
    }
    return { k: k, head: proj(k.head[0], k.head[1], k.head[2]) };
  }

  function drawBall(b) {
    const p = proj(b.x, b.y, b.z), r = Math.max(2, Math.round(BALL_R * p.s));
    const cx = Math.round(p.x), cy = Math.round(p.y);
    const cue = PH.game && PH.game.pokeCue && PH.game.pokeCue();
    const gold = cue && cue.gold;
    const fl = b.fl > 0 && ((b.fl * 18) | 0) % 2 === 0;
    ellipse(ctx, cx, cy, r + 1, r + 1, fl ? '#fff6c8' : '#15101f');
    ellipse(ctx, cx, cy, r, r, gold ? '#b67b12' : '#b4501e');
    ellipse(ctx, cx - 0.5, cy - 0.5, r - 0.6, r - 0.6, gold ? '#ffd34e' : '#ee7f30');
    ctx.fillStyle = gold ? '#916014' : '#7a3212';
    const off = Math.round(Math.sin(b.spin) * r * 0.6);
    ctx.fillRect(cx + off, cy - r + 1, 1, r * 2 - 1);
    ctx.fillRect(cx - r + 1, cy + Math.round(Math.cos(b.spin * 0.7) * r * 0.4), r * 2 - 1, 1);
    ctx.fillStyle = gold ? '#fff5b5' : '#ffc890'; ctx.fillRect(cx - Math.max(1, r >> 1), cy - Math.max(1, r >> 1), 1, 1);
    if (gold) {
      const phase = PH.game.G.time * Math.PI * 2 * PH.game.K.stlPokeHz, hx = cx + Math.sin(phase) * r * 0.45, hy = cy - r * 0.35;
      ctx.save(); ctx.globalAlpha = cue.glow; ctx.fillStyle = '#ffffff';
      ctx.fillRect(Math.round(hx) - 1, Math.round(hy), 3, 1); ctx.fillRect(Math.round(hx), Math.round(hy) - 1, 1, 3);
      ctx.restore();
    }
  }

  function shadow(x, y, z, rad) {
    const p = proj(x, y, 0);
    const k = Math.max(0.35, 1 - z * 0.22);
    ellipse(ctx, p.x, p.y, rad * p.s * k, rad * p.s * 0.34 * k, 'rgba(10,8,30,0.34)');
  }

  function drawBackboard() {
    const pb = proj(0, 15.3, 0), pt = proj(0, 15.3, 3.3);
    const pw = Math.max(3, Math.round(0.3 * pb.s));
    ctx.fillStyle = '#15101f'; ctx.fillRect(Math.round(pb.x - pw / 2) - 1, Math.round(pt.y) - 1, pw + 2, Math.round(pb.y - pt.y) + 2);
    ctx.fillStyle = '#2a3a78'; ctx.fillRect(Math.round(pb.x - pw / 2), Math.round(pt.y), pw, Math.round(pb.y - pt.y));
    ctx.fillStyle = '#3d52a0'; ctx.fillRect(Math.round(pb.x - pw / 2), Math.round(pt.y), Math.max(1, pw >> 1), Math.round(pb.y - pt.y));
    const base = proj(0, 15.3, 0); ctx.fillStyle = '#15101f'; ctx.fillRect(Math.round(base.x - pw * 1.6), Math.round(base.y) - 2, Math.round(pw * 3.2), 4);
    const a = proj(-0.9, BOARD_Y, 3.95), c = proj(0.9, BOARD_Y, 2.9);
    const x0 = Math.round(a.x), y0 = Math.round(a.y), w = Math.round(c.x - a.x), h = Math.round(c.y - a.y);
    ctx.fillStyle = '#2a3a78'; ctx.fillRect(Math.round(pb.x - pw / 2), y0 + (h >> 1), pw, Math.round(pt.y) - y0);
    ctx.fillStyle = '#15101f'; ctx.fillRect(x0 - 1, y0 - 1, w + 2, h + 2);
    ctx.fillStyle = '#dfe9f5'; ctx.fillRect(x0, y0, w, h);
    ctx.fillStyle = '#b8c8e0'; ctx.fillRect(x0 + 1, y0 + 1, w - 2, h - 2);
    ctx.fillStyle = '#cfdcee'; for (let i = 0; i < h - 2; i += 2) ctx.fillRect(x0 + 1 + ((i * 3) % (w - 4)), y0 + 1 + i, 3, 1);
    const Gs = PH.game && PH.game.G; if (Gs && Gs.fx && Gs.fx.shatter > 0) { ctx.fillStyle = '#15101f'; const cx = x0 + (w >> 1), cy = y0 + (h >> 1); for (let k = 0; k < 9; k++) { const an = k * 0.7 + 0.3, L = (k % 3 + 2) * Math.max(w, h) / 7; for (let t = 0; t < L; t += 1) ctx.fillRect(Math.round(cx + Math.cos(an) * t + Math.sin(t * 0.9 + k) * 1.2), Math.round(cy + Math.sin(an) * t * 0.6), 1, 1); } ctx.fillStyle = '#5a6a90'; ctx.fillRect(cx - 2, cy - 1, 5, 3); }
    const i1 = proj(-0.3, BOARD_Y, 3.5), i2 = proj(0.3, BOARD_Y, 3.05);
    const ix = Math.round(i1.x), iy = Math.round(i1.y), iw = Math.round(i2.x - i1.x), ih = Math.round(i2.y - i1.y);
    ctx.fillStyle = '#f6efe0'; ctx.fillRect(ix, iy, iw, 1); ctx.fillRect(ix, iy + ih, iw + 1, 1); ctx.fillRect(ix, iy, 1, ih); ctx.fillRect(ix + iw, iy, 1, ih);
  }
  function drawRim(net, rw) {
    // 篮筐被磕到时上下抖一下
    const wz = rw ? Math.sin(rw * 38) * rw * 0.035 : 0;
    const c = proj(HOOP.x, HOOP.y, HOOP.z + wz), f = proj(HOOP.x, HOOP.y - 0.23, HOOP.z), bk = proj(HOOP.x, HOOP.y + 0.23, HOOP.z);
    const rx = 0.23 * c.s, ry = Math.max(1.5, (f.y - bk.y) / 2);
    const bb = proj(0, BOARD_Y, HOOP.z);
    ctx.fillStyle = '#c23a1e'; ctx.fillRect(Math.round(c.x) - 1, Math.round(bb.y), 2, Math.max(1, Math.round(bk.y - bb.y)));
    // 篮网
    const stretch = 1 + net * 0.45, nh = 0.42 * c.s * stretch, n = 6;
    ctx.fillStyle = '#f6efe0';
    for (let i = 0; i <= n; i++) {
      const u = i / n - 0.5, xt = c.x + u * 2 * rx, xb = c.x + u * 2 * rx * (0.55 - net * 0.15) + Math.sin(net * 9) * net * 2;
      const yt = c.y + ry * Math.sqrt(1 - 4 * u * u);
      const steps = Math.max(2, Math.round(nh));
      for (let j = 0; j <= steps; j++) { const t = j / steps; if (((j + i) & 1) === 0 || t === 1) ctx.fillRect(Math.round(xt + (xb - xt) * t), Math.round(yt + nh * t), 1, 1); }
    }
    ring(ctx, c.x, c.y + 1, rx, ry, '#8a2412');
    ring(ctx, c.x, c.y, rx, ry, '#ff6a2a');
    ring(ctx, c.x, c.y, rx - 1, Math.max(1, ry - 1), '#ff6a2a');
  }

  // ---------- V4.0 调参台：触发区域可视化（只在训练场 + 调参台打开时） ----------
  // 数据：PH.game.zones(pl) → {lay, float, dunk, euro, contest, block}；每项是半径 r（米）或 {r, x?, y?, r0?, ang?, arc?}
  //   lay/float/dunk/euro 默认以篮筐地面投影为圆心，contest/block 默认以防守人脚下为圆心；ang/arc 画扇形（干扰正面）
  const TZ = [['dunk', '扣篮', '#ff5a4a', -1.75], ['lay', '上篮', '#4ae06a', -2.05], ['euro', '欧洲步', '#c07aff', -2.35], ['float', '抛投', '#ffd24a', -2.65], ['contest', '干扰', '#3ab8ff', -2.2], ['block', '盖帽', '#ff9a3c', -1.0]];   // 第 4 项：标签放在圈上的角度（篮筐圈沿左前方错开，避开右侧训练面板；防守圈放前方两侧）
  const tuneOn = (G) => !!(PH.TUNE && PH.TUNE.ui && PH.TUNE.ui.open) && G.mode === 'train' && !(G.replay && G.replay.view);
  function tunePl(G) { const b = G.ball; return b.state === 'held' && G.players[b.holder] ? G.players[b.holder] : G.players[0]; }
  function drawTune(G) {
    tuneLabs = [];
    if (!tuneOn(G) || !(PH.game && PH.game.zones)) return;
    const pl = tunePl(G); if (!pl) return;
    let Z; try { Z = PH.game.zones(pl); } catch (e) { return; } if (!Z) return;
    const df = G.players.find((p) => p !== pl && !p.off) || null, labs = [], seen = [];
    // 标签左右至少留 8px，并避开右侧调参台面板（面板左边缘换算到画布像素）
    let xR = W; try { const te = document.getElementById('tune'), cr = ctx.canvas.getBoundingClientRect(); if (te && !te.classList.contains('hidden') && cr.width > 0) { const tr = te.getBoundingClientRect(); if (tr.width > 0 && tr.left > cr.left) xR = Math.min(W, (tr.left - cr.left) * W / cr.width); } } catch (e) { /* 无 DOM 时按整屏 */ }
    ctx.save(); ctx.font = "12px 'Fusion Pixel 12px Proportional SC', monospace"; ctx.textBaseline = 'top';
    for (const [k, nm, col, la] of TZ) {
      let z = Z[k]; if (z == null) continue; if (typeof z === 'number') z = { r: z };
      const r = +z.r; if (!(r > 0.05)) continue;
      const onDef = k === 'contest' || k === 'block', c = onDef ? df : null;
      const cx = z.x != null ? z.x : onDef ? (c ? c.x : NaN) : HOOP.x, cy = z.y != null ? z.y : onDef ? (c ? c.y : NaN) : HOOP.y; if (!isFinite(cx) || !isFinite(cy)) continue;
      // 和已画的圈完全重合（如欧洲步 = 上篮）：不再画一圈，名字并进那个标签
      const r0v = z.r0 > 0 ? z.r0 : 0, dup = seen.find((S) => Math.abs(S.cx - cx) < 0.01 && Math.abs(S.cy - cy) < 0.01 && Math.abs(S.r - r) < 0.01 && Math.abs(S.r0 - r0v) < 0.01 && !S.arc && !z.arc);
      if (dup) { if (dup.L) { dup.L.t = dup.L.t.replace(' ', '/' + nm + ' '); dup.L.x1 = dup.L.x0 + Math.ceil(ctx.measureText(dup.L.t).width); } continue; }
      const sv = { cx: cx, cy: cy, r: r, r0: r0v, arc: z.arc, L: null }; seen.push(sv);
      const a0 = z.arc ? (z.ang || 0) - z.arc / 2 : 0, A = z.arc ? Math.min(z.arc, Math.PI * 2) : Math.PI * 2, r0 = z.r0 > 0 ? z.r0 : 0;
      // 地面上的圈：按透视采样，出底线（y > 14）的部分不画；半透明填充 + 1 像素实线边（每隔几点断一下，像素虚线）
      const n = Math.max(48, Math.round(r * 40)), P = [], Q = [];
      for (let i = 0; i <= n; i++) { const t = a0 + A * i / n, x = cx + Math.cos(t) * r, y = cy + Math.sin(t) * r; P.push(y <= 14 ? proj(x, y, 0.01) : null); if (r0) { const y2 = cy + Math.sin(t) * r0; Q.push(y2 <= 14 ? proj(cx + Math.cos(t) * r0, y2, 0.01) : null); } }
      ctx.globalAlpha = 0.1; ctx.fillStyle = col; ctx.beginPath(); let st = false;
      if (z.arc && !r0) { const o = proj(cx, cy, 0.01); ctx.moveTo(o.x, o.y); st = true; }
      for (const q of P) if (q) { if (!st) { ctx.moveTo(q.x, q.y); st = true; } else ctx.lineTo(q.x, q.y); }
      if (r0) for (let i = Q.length - 1; i >= 0; i--) if (Q[i]) ctx.lineTo(Q[i].x, Q[i].y);
      ctx.closePath(); ctx.fill();
      // 2 像素粗的像素虚线：下面一层深色描边，上面队色，地板 / 油漆区上都清楚
      const dot = (L, c, o) => { ctx.fillStyle = c; for (let i = 0; i < L.length; i++) { const q = L[i]; if (!q || i % 8 >= 6) continue; ctx.fillRect(Math.round(q.x) - 1 + o, Math.round(q.y) - 1 + o, 2, 2); } };
      ctx.globalAlpha = 0.55; dot(P, '#15101f', 1); if (r0) dot(Q, '#15101f', 1);
      ctx.globalAlpha = 0.95; dot(P, col, 0); if (r0) dot(Q, col, 0);
      // 小标签：放在圈上固定角度处（各圈错开），不在画面里时退到离镜头最近的点
      // 安全区：左右留 8px + 半个标签宽、不压右侧调参台、不压底部操作提示栏；不在安全区就沿圈找离预设角最近的安全点
      const hw = 0.5 * ctx.measureText(nm + ' 0.0–0.0m').width + 8, ok = (q) => q && q.x > hw && q.x < xR - hw && q.y > 40 && q.y < H - 64;
      let best = cy + Math.sin(la) * r <= 14 ? proj(cx + Math.cos(la) * r, cy + Math.sin(la) * r, 0.01) : null;
      if (!ok(best)) { best = null; let bd = 1e9; for (let i = 0; i < P.length; i++) { if (!ok(P[i])) continue; let d = Math.abs(((a0 + A * i / n - la) % (2 * Math.PI) + 3 * Math.PI) % (2 * Math.PI) - Math.PI); if (d < bd) { bd = d; best = P[i]; } } }
      if (!best && r0) { let bd = 1e9; for (let i = 0; i < Q.length; i++) { if (!ok(Q[i])) continue; let d = Math.abs(((a0 + A * i / n - la) % (2 * Math.PI) + 3 * Math.PI) % (2 * Math.PI) - Math.PI); if (d < bd) { bd = d; best = Q[i]; } } }   // 外圈全出画面：挂内圈
      if (best) {
        const t = nm + ' ' + (r0 ? r0.toFixed(1) + '–' : '') + r.toFixed(1) + 'm', tw = Math.ceil(ctx.measureText(t).width); let x0 = Math.round(Math.max(8, Math.min(xR - tw - 8, best.x - tw / 2))), y0 = Math.round(best.y - 6);
        for (let g = 0; g < 6; g++) { const hit = labs.find((L) => x0 < L.x1 + 2 && x0 + tw > L.x0 - 2 && y0 < L.y1 && y0 + 12 > L.y0); if (!hit) break; y0 = hit.y1 + 1; }
        if (y0 > H - 13) y0 = H - 13;
        sv.L = { x0: x0, x1: x0 + tw, y0: y0, y1: y0 + 12, t: t, col: col }; labs.push(sv.L);
      }
    }
    ctx.restore();
    tuneLabs = labs;
  }
  // 标签在球员之后画（不被身体挡住）
  let tuneLabs = [];
  function drawTuneLabs(G) {
    if (!tuneLabs.length) return; if (!tuneOn(G)) { tuneLabs = []; return; }
    ctx.save(); ctx.font = "12px 'Fusion Pixel 12px Proportional SC', monospace"; ctx.textBaseline = 'top';
    for (const L of tuneLabs) { ctx.globalAlpha = 0.72; ctx.fillStyle = '#15101f'; ctx.fillRect(L.x0 - 2, L.y0 - 1, L.x1 - L.x0 + 4, 13); ctx.globalAlpha = 1; ctx.fillStyle = L.col; ctx.fillText(L.t, L.x0, L.y0); }
    ctx.restore(); tuneLabs = [];
  }

  const clampR = (v, a, b) => Math.max(a, Math.min(b, v));
  function drawMeter(pl, hp) {
    const a = pl.action; if (!a || !a.meter || a.alley) return;
    // 投篮条：涨到顶 = 最佳出手点；空中按下拉杆后才换成蓝区。
    const x = Math.round(hp.x + 0.42 * hp.s) + 3, h = Math.round(clampR(hp.s * 0.75, 24, 44)), wd = Math.round(clampR(hp.s * 0.09, 3, 5)), y = Math.round(hp.y - h * 0.55);
    const m = a.meter;
    ctx.fillStyle = '#15101f'; ctx.fillRect(x - 1, y - 1, wd + 2, h + 2);
    ctx.fillStyle = '#2a2740'; ctx.fillRect(x, y, wd, h);
    const S = Math.max(0.05, m.ideal), v = m.v, clutch = a.clutchT != null;
    const pk = m.ideal, f = clampR(1 - Math.abs(v - pk) / S, 0, 1), fh = Math.round(f * h);
    const gH = Math.max(2, Math.round(m.gw / S * h));
    ctx.fillStyle = clutch ? '#1f6f8a' : '#1f8a3c'; ctx.fillRect(x, y, wd, gH);
    const fall = v > pk && !m.done;
    ctx.fillStyle = m.done ? m.color : fall ? '#e0a63a' : '#ffd24a'; ctx.fillRect(x + 1, y + h - fh, wd - 2, fh);
    ctx.fillStyle = clutch ? '#5ee0ff' : '#7dff8a'; ctx.fillRect(x - 1, y, wd + 2, 1);
    ctx.fillStyle = '#ffffff'; if (fh > 0) ctx.fillRect(x, y + h - fh, wd, 1);
  }

  function hexRgb(hex) {
    if (!hex || hex[0] !== '#') return [255, 210, 74];
    const s = hex.length === 4 ? hex[1] + hex[1] + hex[2] + hex[2] + hex[3] + hex[3] : hex.slice(1, 7);
    const n = parseInt(s, 16);
    return isNaN(n) ? [255, 210, 74] : [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function drawConfetti(F) {
    const C = F && F.confetti; if (!C || !C.length) return;
    ctx.save();
    for (const c of C) {
      const px = Math.round(c.x * W), py = Math.round(c.y * H);
      if (px < -6 || px > W + 6 || py < -6 || py > H + 6) continue;
      const u = c.t / c.life, a = u > 0.72 ? Math.max(0, (1 - u) / 0.28) : 1;
      const flip = Math.abs(Math.cos(c.ang)), w = Math.max(1, Math.round(c.w * (0.35 + 0.65 * flip))), h = c.h;
      ctx.globalAlpha = a;
      ctx.fillStyle = c.col;
      ctx.fillRect(px, py, w, h);
      if (flip > 0.78 && w >= 2) { ctx.fillStyle = '#ffffff'; ctx.fillRect(px, py, 1, 1); }
    }
    ctx.restore();
  }
  function drawIntroFx(G) {
    const I = G.intro; if (!I || I.li >= 0) return;
    const sh = I.shot != null ? G.players.find((p) => p.id === I.shot) : null;
    if (!sh) return;
    const t = G.time, rgb = hexRgb(sh.team && sh.team.css), cStr = rgb[0] + ',' + rgb[1] + ',' + rgb[2];
    const qp = proj(sh.x, sh.y, sh.h * 0.65);
    ctx.save();
    // 舞台追光束：两道从顶棚扫向出场球星的柔和光柱
    for (let k = -1; k <= 1; k += 2) {
      const ox = W * (0.5 + k * 0.32) + Math.sin(t * 2.1 + k) * 28;
      const tx = Math.max(40, Math.min(W - 40, qp.d > 1 ? qp.x : W * 0.5)) + Math.sin(t * 3.2 + k) * 10;
      const g = ctx.createLinearGradient(ox, 0, tx, H * 0.88);
      g.addColorStop(0, 'rgba(255,250,225,0.20)');
      g.addColorStop(0.55, 'rgba(' + cStr + ',0.11)');
      g.addColorStop(1, 'rgba(' + cStr + ',0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(ox - 10, 0); ctx.lineTo(ox + 10, 0);
      ctx.lineTo(tx + 54, H * 0.92); ctx.lineTo(tx - 54, H * 0.92);
      ctx.closePath(); ctx.fill();
    }
    // 屏幕边缘球馆欢呼光晕（脉动）
    const pulse = 0.55 + 0.45 * Math.sin(t * 7.5);
    const vg = ctx.createRadialGradient(W * 0.5, H * 0.52, H * 0.28, W * 0.5, H * 0.52, W * 0.66);
    vg.addColorStop(0, 'rgba(' + cStr + ',0)');
    vg.addColorStop(0.7, 'rgba(' + cStr + ',' + (0.10 + 0.08 * pulse).toFixed(3) + ')');
    vg.addColorStop(1, 'rgba(' + cStr + ',' + (0.28 + 0.14 * pulse).toFixed(3) + ')');
    ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
    // 顶/底能量细边
    ctx.globalAlpha = 0.5 + 0.35 * pulse;
    ctx.fillStyle = sh.team.css;
    ctx.fillRect(0, 0, W, 2); ctx.fillRect(0, H - 2, W, 2);
    // 全场闪光灯（看台与屏幕上方）
    for (let i = 0; i < 6; i++) {
      const h = hash(((t * 24) | 0) * 197 + i * 733);
      if ((h & 3) > 1) continue;
      const fx = h % W, fy = 8 + ((h >>> 9) % Math.round(H * 0.42));
      ctx.globalAlpha = 0.85;
      ctx.fillStyle = '#ffffff'; ctx.fillRect(fx, fy, 2, 2);
      ctx.fillStyle = '#fff6c8'; ctx.fillRect(fx - 2, fy, 6, 1); ctx.fillRect(fx, fy - 2, 1, 6);
    }
    ctx.restore();
  }
  function drawScoreFx(G) {
    const S = G.fx && G.fx.scoreFx; if (!S) return;
    const u = Math.max(0, Math.min(1, S.t / S.dur));
    const env = (u < 0.12 ? u / 0.12 : 1) * (1 - u) * (1 - u);
    if (env <= 0.005) return;
    const rgb = hexRgb(S.col), cStr = rgb[0] + ',' + rgb[1] + ',' + rgb[2];
    const rgb2 = hexRgb(S.col2), c2Str = rgb2[0] + ',' + rgb2[1] + ',' + rgb2[2];
    const kOwn = S.own ? 1 : 0.72;
    const tierBoost = S.kind === 'dunk' ? 1.25 : S.pts === 3 ? 1.1 : 0.82;
    const str = Math.min(1.35, (0.75 + S.tier * 0.22) * kOwn * tierBoost);
    ctx.save();
    // 1. 全屏四周能量光晕（中心完全通透，不遮挡球场与投篮）
    const vg = ctx.createRadialGradient(W * 0.5, H * 0.5, H * 0.30, W * 0.5, H * 0.5, W * 0.66);
    vg.addColorStop(0, 'rgba(' + cStr + ',0)');
    vg.addColorStop(0.66, 'rgba(' + cStr + ',' + (0.09 * env * str).toFixed(3) + ')');
    vg.addColorStop(0.88, 'rgba(' + cStr + ',' + (0.26 * env * str).toFixed(3) + ')');
    vg.addColorStop(1, 'rgba(' + c2Str + ',' + (0.42 * env * str).toFixed(3) + ')');
    ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
    // 2. 四边像素高光脉冲边框
    const bw = Math.max(1, Math.round((S.kind === 'dunk' ? 4 : S.pts === 3 ? 3 : 2) * env));
    ctx.globalAlpha = Math.min(0.95, 0.78 * env * kOwn);
    ctx.fillStyle = S.col;
    ctx.fillRect(0, 0, W, bw); ctx.fillRect(0, H - bw, W, bw);
    ctx.fillRect(0, 0, bw, H); ctx.fillRect(W - bw, 0, bw, H);
    if (S.tier >= 1 || S.kind === 'dunk' || S.pts === 3) {
      ctx.globalAlpha = Math.min(0.85, 0.6 * env * kOwn);
      ctx.fillStyle = S.col2;
      const ins = bw + 2;
      ctx.fillRect(ins, ins, W - ins * 2, 1); ctx.fillRect(ins, H - ins - 1, W - ins * 2, 1);
      // 3. 角落放射速度线（三分/扣篮/高光得分瞬间冲击感，避开中心区域）
      const rays = S.kind === 'dunk' ? 20 : 14;
      const cx = W * 0.5, cy = H * 0.5;
      ctx.lineWidth = S.kind === 'dunk' ? 2 : 1;
      for (let i = 0; i < rays; i++) {
        const an = (i / rays) * Math.PI * 2 + 0.17;
        const r1 = Math.max(W, H) * 0.62;
        const len = (24 + (i % 3) * 14) * (0.45 + 0.55 * env) * (S.kind === 'dunk' ? 1.25 : 0.9);
        const r0 = r1 - len;
        ctx.strokeStyle = i % 2 === 0 ? S.col2 : '#ffffff';
        ctx.globalAlpha = Math.min(0.8, 0.52 * env * kOwn);
        ctx.beginPath();
        ctx.moveTo(Math.round(cx + Math.cos(an) * r0), Math.round(cy + Math.sin(an) * r0 * 0.62));
        ctx.lineTo(Math.round(cx + Math.cos(an) * r1), Math.round(cy + Math.sin(an) * r1 * 0.62));
        ctx.stroke();
      }
    }
    // 4. 场馆闪光灯爆闪（前 65% 时长）
    if (u < 0.65) {
      const fn = S.kind === 'dunk' ? 6 : S.pts === 3 ? 4 : 2;
      for (let i = 0; i < fn; i++) {
        const h = hash(((G.time * 28) | 0) * 151 + i * 887);
        const fx = h % W, fy = 6 + ((h >>> 8) % Math.round(H * 0.35));
        ctx.globalAlpha = 0.85 * (1 - u / 0.65);
        ctx.fillStyle = '#ffffff'; ctx.fillRect(fx, fy, 2, 2);
        ctx.fillStyle = '#fff6c8'; ctx.fillRect(fx - 2, fy, 5, 1); ctx.fillRect(fx, fy - 2, 1, 5);
      }
    }
    ctx.restore();
  }
  function drawScreenFx(G) {
    drawIntroFx(G);
    drawScoreFx(G);
    drawConfetti(G.fx);
  }
  function drawCrowdFx(G, bx, by) {
    const F = G.fx, t = G.time, MP = (G.mp >= 0 || G.sd) && G.phase !== 'over', mpc = G.sd ? '#ffd24a' : G.mpCol || '#ffd24a';
    const chv = Math.max(F.cheer, MP ? 0.55 + 0.2 * Math.sin(t * 2.4) : 0);
    if (chv > 0) {
      const lv = Math.min(1, chv / 1.2);
      for (let i = 0; i < BW / 8; i++) {
        const sx = i * 8; if (bx + sx > W || bx + sx < -8) continue;
        if (Math.sin(t * 13 + i * 1.9) + Math.sin(t * 7 + i * 0.6) * 0.6 > 0.9 - lv * 1.1) ctx.drawImage(backB, sx, 26, 8, 116, bx + sx, by + 26, 8, 116);
      }
      // 闪光灯
      const n = Math.round(lv * 5);
      for (let i = 0; i < n; i++) { const h = hash(((t * 30) | 0) * 131 + i * 977); const fx = h % W, fy = by + 34 + ((h >>> 9) % 100); ctx.fillStyle = '#ffffff'; ctx.fillRect(fx, fy, 2, 2); ctx.fillStyle = '#fff6c8'; ctx.fillRect(fx - 1, fy, 4, 1); ctx.fillRect(fx, fy - 1, 1, 4); }
    }
    PH.render.ledY = -99;
    if (F.led) {
      const L = F.led, y0 = by + 146; PH.render.ledY = y0;
      ctx.fillStyle = '#0c1030'; ctx.fillRect(0, y0, W, 20);
      const blink = ((L.t * 9) | 0) & 1;
      ctx.fillStyle = blink ? '#ffffff' : L.col; ctx.fillRect(0, y0, W, 1); ctx.fillRect(0, y0 + 19, W, 1);
      ctx.font = "12px 'Fusion Pixel 12px Proportional SC', monospace"; ctx.textBaseline = 'top';
      const tw = Math.ceil(ctx.measureText(L.text).width) + 40, off = (L.t * 70) % tw;
      ctx.fillStyle = blink && L.t < 0.8 ? '#ffffff' : L.col;
      for (let x = -off; x < W; x += tw) ctx.fillText(L.text, Math.round(x), y0 + 4);
    } else if (MP) {
      // 赛点 / 加时：广告带上下沿用该队颜色呼吸闪
      const y0 = by + 146; ctx.globalAlpha = 0.55 + 0.45 * Math.sin(t * 6); ctx.fillStyle = mpc; ctx.fillRect(0, y0, W, 2); ctx.fillRect(0, y0 + 18, W, 2); ctx.globalAlpha = 1;
    }
  }

  // 三分线提示：球权转换未出线时沿三分线闪光；出线瞬间绿色闪一下
  function draw3pt(G) {
    if (G.mode === 't3') return;
    const now = G.time, ping = now - (G.clearPing || -9), ok = now - (G.clearOk || -9);
    let col, a;
    const h = G.players[G.off];
    if (G.needClear && G.phase === 'live' && G.ball.state === 'held' && h && h.ctrl !== 'cpu') { col = '#ff3b30'; a = 0.7 + 0.3 * Math.sin(now * 7) + (ping < 0.5 ? 0.5 * (1 - ping / 0.5) : 0); }
    else if (ok < 0.6) { col = '#7dff8a'; a = 1 - ok / 0.6; }
    else return;
    const pts = [];
    pts.push([-6.6, 14]);
    const a0 = Math.asin(6.6 / 6.75), y0 = HOOP.y - Math.cos(a0) * 6.75;
    pts.push([-6.6, y0]);
    for (let i = 0; i <= 40; i++) { const t = -a0 + (2 * a0) * i / 40; pts.push([HOOP.x + Math.sin(t) * 6.75, HOOP.y - Math.cos(t) * 6.75]); }
    pts.push([6.6, 14]);
    ctx.save(); ctx.globalAlpha = Math.max(0, Math.min(1, a)); ctx.strokeStyle = col; ctx.lineJoin = 'round';
    for (const [lw, al] of [[10, 0.22], [5, 0.5], [2.5, 1]]) {
      ctx.lineWidth = lw; ctx.globalAlpha = Math.max(0, Math.min(1, a)) * al; ctx.beginPath();
      pts.forEach((p, i) => { const q = proj(p[0], p[1], 0); if (i) ctx.lineTo(q.x, q.y); else ctx.moveTo(q.x, q.y); });
      ctx.stroke();
    }
    // 流动光点
    if (col !== '#7dff8a') { ctx.fillStyle = '#ffffff'; for (let k = 0; k < 6; k++) { const f = ((now * 0.35 + k / 6) % 1), idx = Math.floor(f * (pts.length - 1)), p = pts[idx], q = proj(p[0], p[1], 0); ctx.globalAlpha = Math.max(0, Math.min(1, a)); ctx.fillRect(Math.round(q.x) - 1, Math.round(q.y) - 1, 3, 2); } }
    ctx.restore();
  }

  function drawCombos(G) {
    for (const p of G.players) {
      const c = p.dribbleCombo;
      if (!c || c.shown < 2 || p.off) continue;
      const fade = c.end == null ? 1 : Math.max(0, 1 - (G.time - c.end));
      if (!fade) continue;
      const age = G.time - c.last, heat = Math.min(1, (c.shown - 2) / 6), pop = Math.max(0, 1 - age / 0.22);
      const scale = Math.min(1.4, 0.84 * (1 + heat * 0.45) * (1 + Math.sin(pop * Math.PI * 0.8) * 0.28));
      ctx.save(); ctx.globalAlpha = fade;
      ctx.translate(W - 12 + pop * 6.6, H * (G.mode === 't5' ? 0.34 : 0.29) + 32 * scale);
      ctx.translate(Math.sin(age * 110) * pop * 2, Math.cos(age * 90) * pop);
      ctx.scale(scale, scale); ctx.textAlign = 'right'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
      ctx.shadowColor = '#140d29'; ctx.shadowBlur = 0; ctx.shadowOffsetX = 2; ctx.shadowOffsetY = 3;
      const line = (text, y, font, col) => { ctx.font = font; ctx.lineWidth = 3; ctx.strokeStyle = '#23102e'; ctx.strokeText(text, 0, y, W * 0.33 / scale); ctx.fillStyle = col; ctx.fillText(text, 0, y, W * 0.33 / scale); };
      line(String(c.shown), -14, 'italic 900 32px sans-serif', heat > 0.65 ? '#ff6342' : heat > 0.25 ? '#ffac32' : '#ffe66a');
      line('HITS', 8, 'italic 900 11px sans-serif', '#fff5cf');
      ctx.restore();
      ctx.save(); ctx.globalAlpha = fade; ctx.textAlign = 'right'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
      ctx.translate(Math.round(W - 12), Math.round(H * (G.mode === 't5' ? 0.34 : 0.29) + 46 * scale + 19));
      ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetX = ctx.shadowOffsetY = 0;
      ctx.font = "900 16px 'Microsoft YaHei', 'PingFang SC', 'Noto Sans CJK SC', 'Fusion Pixel 12px Proportional SC', sans-serif";
      ctx.strokeStyle = '#090d19'; ctx.lineWidth = 4; ctx.strokeText(c.name, 0, 0);
      ctx.fillStyle = '#ffe073'; ctx.fillText(c.name, 0, 0); ctx.restore();
    }
  }
  function nameFoot(p, t3) {
    const q = proj(p.x, p.y - (t3 ? 0 : 0.25), 0);
    return { x: q.x, y: q.y + 0.34 * q.s * (t3 ? 0.62 : 1) };
  }
  function staminaOn(p, G, replay) {
    if (replay || G.intro || G.vopt?.stamina === false || p.off || p.dummy) return false;
    if (G.mode !== 't3') return G.mode === 'cpu' || G.mode === '2p' ? true : !!p.ring;
    const h = G.ball.state === 'held' && G.players[G.ball.holder];
    return !!h && (p === h || p.tm !== h.tm && p.opp === h);
  }
  function playerStamina(p, y, x, G) {
    stamBar(ctx, x - STB.w1 / 2, y - STB.h1 - STB.gap, STB.w1, STB.h1, p.stam, 'g' + p.id, G.time);
  }
  function teamNameTags(players, maxY, G) {
    const placed = [], stamina = STB.h1 + STB.gap, height = PH.PT.SIZE;
    for (const p of players.filter(p => !p.off && p.arch && !p.dummy).sort((a, b) => Number(b.ring) - Number(a.ring))) {
      const q = nameFoot(p, true);
      const bar = staminaOn(p, G, false);
      const y = Math.max(3 + (bar ? stamina : 0), Math.min(maxY, Math.round(q.y) + 3 + (bar ? stamina : 0)));
      const box = nameBounds(ctx, p.arch, q.x, y, true);
      const nearby = placed.filter(tag => tag.x0 < box.x1 + 2 && box.x0 < tag.x1 + 2);
      const candidates = [y, ...nearby.flatMap(tag => [tag.y0 - height, tag.y1 + 3])];
      candidates.sort((a, b) => Math.abs(a - y) - Math.abs(b - y));
      const row = candidates.find(row => row >= 3 && row <= maxY &&
        nearby.every(tag => row - 2 - (bar ? stamina : 0) >= tag.y1 + 1 || row - 2 + height <= tag.y0 - 1)) ?? y;
      const tag = curName(ctx, p.arch, q.x, row, p.col.ringCol, true);
      if (bar) {
        playerStamina(p, row, q.x, G);
        tag.x0 = Math.min(tag.x0, q.x - STB.w1 / 2);
        tag.x1 = Math.max(tag.x1, q.x + STB.w1 / 2);
        tag.y0 = Math.min(tag.y0, row - stamina - 2);
      }
      placed.push(tag);
    }
  }
  function camera3(G, dt, hintY) {
    const C = cam3Tuned();
    const b = G.ball, p = b.state === 'held' ? G.players[b.holder] : null, fp = G.intro && G.intro.foc;
    const x = fp ? fp.x : p ? p.x + p.vx * 0.28 : b.x + (b.state === 'pass' ? 0 : b.vx * 0.12);
    const y = fp ? fp.y + 1.3 : p ? p.y + p.vy * 0.28 + 1.3 : b.state === 'shot' ? b.y * 0.65 + HOOP.y * 0.35 : b.y;
    const tx = Math.max(-7.5, Math.min(7.5, x)), ty = Math.max(0, Math.min(14, y));
    const fresh = follow3?.players !== G.players;
    if (fresh) follow3 = { players: G.players, x: tx, y: ty, zoom: 1 };
    const k = 1 - Math.exp(-C.speed * dt);
    follow3.x += (tx - follow3.x) * k; follow3.y += (ty - follow3.y) * k;
    cam.y = Math.max(-8.8, Math.min(-3.8, follow3.y - C.dist));
    cam.x = follow3.x * C.follow;
    cam.z = C.height; cam.F = 530 * C.zoom;
    setPitch(1, -C.pitch);

    const rim = proj(HOOP.x, HOOP.y, HOOP.z), board = proj(0, BOARD_Y, 3.95);
    const q = proj(b.x, b.y, b.z);
    const feet = p ? proj(p.x, p.y, 0) : q, head = p ? proj(p.x, p.y, p.z + p.h) : q;
    const local = G.players.find((pl) => pl.ring && !pl.off);
    const localFeet = local && local !== p ? proj(local.x, local.y, 0) : feet;
    const localHead = local && local !== p ? proj(local.x, local.y, local.z + local.h) : head;
    const left = Math.min(rim.x, board.x, q.x, feet.x, head.x, localFeet.x, localHead.x);
    const right = Math.max(rim.x, board.x, q.x, feet.x, head.x, localFeet.x, localHead.x);
    const top = Math.min(rim.y, q.y, head.y, localHead.y);
    const bottom = Math.max(rim.y, q.y, feet.y, localFeet.y);
    const footLimit = Math.min(H - 30, (hintY ?? H) - 4);
    const nameAnchor = hintY != null && local ? nameFoot(local, true).y : bottom;
    const nameLimit = hintY != null && local ? hintY - (STB.h1 + STB.gap + 20) : footLimit;
    const fit = (span, room) => span > 0 ? room / span : 1;
    const frameZoom = (pad) => Math.min(1,
      fit(right - left, W - 84 - 2 * pad),
      fit(Math.max(rim.x - left, right - rim.x), W * 0.62 - 42 - pad),
      fit(bottom - top, footLimit - 16 - pad),
      fit(bottom - board.y, footLimit - 36 - pad),
      fit(nameAnchor - top, nameLimit - 16 - pad),
      fit(nameAnchor - board.y, nameLimit - 36 - pad));
    const targetZoom = frameZoom(6) * (fp ? 1 + fp.u : 1);
    // Smooth the padded framing; the outer fit still catches a sudden snapshot or pass.
    const zoom = fresh ? targetZoom : Math.min(frameZoom(0) * (fp ? 1 + fp.u : 1), follow3.zoom + (targetZoom - follow3.zoom) * k);
    follow3.zoom = zoom;
    const center = H / 2 + cam.oy;
    const scaledY = (y) => center + (y - center) * zoom;
    cam.F *= zoom;
    offsetX3 = Math.max(42 - W / 2 - (left - W / 2) * zoom,
      Math.min((W / 2 - rim.x) * zoom, W / 2 - 42 - (right - W / 2) * zoom));
    offsetY3 = Math.max(36 - scaledY(board.y), 16 - scaledY(top),
      Math.min(40 - scaledY(board.y), footLimit - scaledY(bottom), nameLimit - scaledY(nameAnchor)));
  }
  function camera1Intro(G, dt) {
    const fp = G.intro && G.intro.foc;
    if (!fp) { intro1 = null; return; }
    const K = PH.game && PH.game.K;
    cam.F = 400 * CAMV.zoom;
    const tx = fp.x;
    let tz, ty, tp;
    if (fp.mode === 'talk') {
      tz = K ? K.camInTalkZ : 2.8;
      const dist = K ? K.camInTalkDist : 11.2;
      const minY = fp.minY != null ? fp.minY : fp.y - 1.1;
      ty = minY - dist;
      tp = (K ? K.camInTalkPitch : -11) * Math.PI / 180;
    } else {
      tz = K ? K.camInZ : 1.4;
      const dist = K ? K.camInDist : 8.2;
      ty = fp.y - dist;
      tp = (K ? K.camInPitch : -4) * Math.PI / 180;
    }
    const fresh = !intro1 || intro1.intro !== G.intro || fp.snap;
    if (fresh) { intro1 = { intro: G.intro, x: tx, y: ty, z: tz, p: tp }; fp.snap = false; }
    else {
      const k = 1 - Math.exp(-7 * dt);
      intro1.x += (tx - intro1.x) * k;
      intro1.y += (ty - intro1.y) * k;
      intro1.z += (tz - intro1.z) * k;
      intro1.p += (tp - intro1.p) * k;
    }
    cam.x = intro1.x; cam.y = intro1.y; cam.z = intro1.z;
    setPitch(Math.cos(intro1.p), Math.sin(intro1.p));
  }
  function particleSize(q, scale) {
    return q.interceptTeam != null ? Math.max(4, Math.min(6, Math.round(q.s * scale / 24))) : q.s || 1;
  }
  function replayCamera(replay, pose, preset) {
    if (replay.view) replay.cameraFrom = { preset, pose: { ...pose } };
    else if (replay.returnT != null && replay.cameraFrom?.preset === preset) {
      const t = replay.returnT, u = t * t * (3 - 2 * t), from = replay.cameraFrom.pose;
      for (const k in pose) pose[k] = from[k] + (pose[k] - from[k]) * u;
    }
    return pose;
  }
  function render(G, dt = 1 / 60, hintY) {
    // 回放时用录下来的画面快照代替实时状态
    const replay = G.replay, RP = replay?.view;
    if (RP) G = Object.assign(Object.create(G), RP);
    // 相机
    const b = G.ball, foc = G.focus, F = G.fx;
    offsetX3 = offsetY3 = 0;
    cam.x = foc.cx + (G.camShift || 0); cam.y = foc.cy; cam.z = CAMV.height; cam.F = 400 * CAMV.zoom;
    // 特写：镜头沿视线朝高光点推近（目标点在画面中位置基本不变、被放大），同时横向对准
    const cz = G.cz;
    if (cz) {
      let k = cz.k != null ? cz.k : Math.min(1, cz.t / 0.18) * Math.min(1, Math.max(0, cz.T - cz.t) / 0.4);
      k = k * k * (3 - 2 * k); const u = cz.u * k;
      cam.x += (cz.x - cam.x) * 0.55 * k; cam.y += (cz.y - cam.y) * u; cam.z += (cz.z - cam.z) * u;
    }
    // 禁区推近（可关）：持球接近篮下时镜头沿纵向前推、机位压低。只用平滑过的 camK，不读球员实时位置，不做额外取景修正
    const pk = RP || cz || !CAMV.push ? 0 : (G.camK || 0);
    if (pk > 0.001) { const e = pk * pk * (3 - 2 * pk); cam.y += CAMV.pin * 5 * e; cam.z -= (cam.z - 1.2) * CAMV.pin * CAMV.plow * e; }
    if (G.mode === 't3' && !RP) { intro1 = null; camera3(G, dt, hintY); }
    else {
      if (follow3) { follow3 = null; setPitch(CAMV.dist + 2.4, 1 - CAMV.height); }
      if (G.intro && G.intro.foc && !RP) camera1Intro(G, dt);
      else if (intro1) { intro1 = null; setPitch(CAMV.dist + 2.4, 1 - CAMV.height); }
    }
    if (replay && (RP || replay.returnT != null)) {
      const { dx, dy, ...pose } = replayCamera(replay, { ...cam, dx: offsetX3, dy: offsetY3 }, G.mode);
      Object.assign(cam, pose);
      setPitch(cam.fy, cam.fz);
      offsetX3 = dx; offsetY3 = dy;
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#070a16'; ctx.fillRect(0, 0, W, H);
    if (F.shake > 0.3) { const h = hash((G.time * 60) | 0); ctx.setTransform(1, 0, 0, 1, Math.round(((h & 255) / 255 - 0.5) * F.shake), Math.round((((h >>> 8) & 255) / 255 - 0.5) * F.shake)); }
    const first = drawFloor();
    const bx = Math.round(W / 2 - BW / 2 - cam.x * 14);
    ctx.drawImage(G.mode === 't3' ? back3 || (back3 = buildBackdrop(false, WORDS_3, 58)) : back, bx, first - 170);
    drawCrowdFx(G, bx, first - 170);
    ctx.drawImage(fcv, 0, 0);
    draw3pt(G);
    drawTune(G);   // V4.0 调参台打开时：地板上画触发区域
    // 热区：持球站在热 / 致命 / 冷区时，该区地板淡淡着色
    if (G.hzV && !RP) { const V = G.hzV; ctx.save(); ctx.globalAlpha = V.l === 2 ? 0.2 : V.l === 1 ? 0.13 : 0.12; ctx.fillStyle = V.l === 2 ? '#ff3b2f' : V.l === 1 ? '#ff8a2a' : '#3a8bff'; ctx.beginPath();
      for (const c of V.cells) { const a = proj(c[0], c[1], 0), b2 = proj(c[0] + 0.16, c[1], 0), c2 = proj(c[0] + 0.16, c[1] + 0.16, 0), d2 = proj(c[0], c[1] + 0.16, 0); ctx.moveTo(a.x, a.y); ctx.lineTo(b2.x, b2.y); ctx.lineTo(c2.x, c2.y); ctx.lineTo(d2.x, d2.y); ctx.closePath(); }
      ctx.fill(); ctx.restore(); }
    const bsx = F.board > 0 ? Math.round(Math.sin(F.board * 60) * Math.min(2, F.board * 5)) : 0;
    ctx.translate(bsx, 0); drawBackboard(); ctx.translate(-bsx, 0);
    // 阴影与脚下指示环
    for (const p of G.players) {
      if (p.off) continue;
      shadow(p.x, p.y, p.z, 0.5);
      const skR = p.sk && p.sk.hint === 'ready', skH = p.sk && p.sk.hint === 'half';
      if (p.icy && !(p.tkOn > 0)) { const q = proj(p.x, p.y, 0); ring(ctx, q.x, q.y, 0.8 * q.s, 0.8 * q.s * 0.34, '#3a8cff'); ring(ctx, q.x, q.y, 0.8 * q.s + 1, 0.8 * q.s * 0.34 + 1, '#9fd6ff'); }
      if (p.tkOn > 0) { const q = proj(p.x, p.y, 0), pu = 1 + 0.12 * Math.sin(G.time * 9); ring(ctx, q.x, q.y, 0.85 * q.s * pu, 0.85 * q.s * 0.34 * pu, '#ff8a2a'); ring(ctx, q.x, q.y, 0.85 * q.s * pu + 2, 0.85 * q.s * 0.34 * pu + 1, '#ffd24a'); }
      if (p.ring || skR) { const q = proj(p.x, p.y, 0); ring(ctx, q.x, q.y, 0.62 * q.s, 0.62 * q.s * 0.34, p.ring ? p.col.ringCol : '#ffd24a'); ring(ctx, q.x, q.y, 0.62 * q.s + 1, 0.62 * q.s * 0.34 + 1, p.ring ? p.col.ringCol : '#ffd24a'); }
      else if (curOn(p, G)) { const q = proj(p.x, p.y, 0); ring(ctx, q.x, q.y, 0.62 * q.s, 0.62 * q.s * 0.34, p.col.ringCol); }   // V3.9s 1V1 电脑方也有光标（单线）
      if (skR || skH) { const q = proj(p.x, p.y, 0), pu = 0.5 + 0.5 * Math.sin(G.time * 14), rr2 = 0.62 * q.s + 3 + (skR ? pu * 2 : 0); ctx.globalAlpha = skR ? 0.6 + 0.4 * pu : 0.45; ring(ctx, q.x, q.y, rr2, rr2 * 0.34, '#ffd24a'); if (skR) ring(ctx, q.x, q.y, rr2 + 1, rr2 * 0.34 + 1, '#fff2b0'); ctx.globalAlpha = 1; }
    }
    if (!G.intro) shadow(b.x, b.y, b.z, 0.16);
    const teamTags = G.mode === 't3' && !RP;
    const maxNameY = teamTags ? Math.min(H - 13, Math.floor((hintY ?? H) - 14)) : H - 13;
    // 运球（没在做动作）时球总画在持球人身前，背对镜头时也不会被身体挡住
    const hb = b.state === 'held' ? G.players[b.holder] : null, hbFront = hb && hb.action && hb.action.type === 'shot' && hb.action.V && hb.action.V.hook;
    const items = [{ y: HOOP.y, t: 'rim' }];
    if (!G.intro) items.push({ y: hbFront ? Math.min(b.y, hb.y - 0.02) : b.y + (b.under ? 0.5 : 0), t: 'ball' });
    for (const p of G.players) if (!p.off) items.push({ y: p.y, t: 'pl', p: p });
    items.sort((a, c) => c.y - a.y);
    const heads = [];
    for (const it of items) {
      if (it.t === 'rim') { ctx.translate(bsx, 0); drawRim(G.net, G.fx && G.fx.rim); ctx.translate(-bsx, 0); }
      else if (it.t === 'ball') drawBall(b);
      else {
        const p = it.p;
        if (p.ghosts) for (const g of p.ghosts) drawPlayer({ x: g.x, y: g.y, z: g.z, face: g.face, pose: g.pose, h: p.h, col: p.col, id: p.id, stun: 0 }, { ghost: { c: p.col.ringCol, a: 0.42 * (1 - g.t / 0.22) } });
        const r = drawPlayer(p, { flash: p.flash > 0, trail: RP ? null : { time: G.time, scene: G.players, view: G.mode } }); heads[p.id] = r.head;
      }
    }
    drawTuneLabs(G);
    // V3.9s 光标下方的名字（1V1 双方）：小号像素字、光标同色、深色描边；有体力条时放在体力条下面。
    // 画在球员之后（不被腿挡住）；永远在脚下
    if (teamTags) teamNameTags(G.players, maxNameY, G);
    else { const tags = [];
      for (const p of G.players) {
        if (!(p.ring || curOn(p, G)) || p.off || !p.arch || RP || p.dummy) continue;
        const bar = staminaOn(p, G, RP);
        const q = nameFoot(p, false); let y = bar ? Math.min(H - 13 - (STB.h1 + STB.gap), Math.round(q.y) + 3) + STB.h1 + STB.gap : Math.round(q.y) + 3;
        // V4.0 名字一律在脚下（用户：名称都在脚下显示就好，不用担心遮挡），只夹在画面内，不再挪到头顶
        if (y < 2) continue; y = Math.min(H - 13, y);
        for (const o of tags) if (Math.abs(o.y0 - y) < 12 && Math.abs((o.x0 + o.x1) / 2 - q.x) < 40) y = o.y0 > y ? o.y0 - 13 : o.y1 + 1;
        if (bar) playerStamina(p, y, q.x, G);
        tags.push(curName(ctx, p.arch, q.x, y, p.col.ringCol));
      } }
    // 粒子
    for (const q of F.parts) {
      const p = proj(q.x, q.y, q.z); if (p.d < 1) continue;
      const k = q.t / q.life; if (k > 0.75 && (((G.time * 30) | 0) & 1)) continue;
      ctx.fillStyle = q.col; const contact = q.interceptTeam != null, sz = contact ? particleSize(q, p.s) : q.s + (p.s > 26 ? 1 : 0), offset = contact ? sz / 2 : 0;
      ctx.fillRect(Math.round(p.x - offset), Math.round(p.y - offset), sz, sz);
    }
    // 冲击环（抢断 / 盖帽 / 进攻篮板）
    if (F.rings) for (const r of F.rings) {
      if (r.t < 0) continue;
      const u = r.t / r.T, c = proj(r.x, r.y, r.z); if (c.d < 1) continue;
      const rad = (0.25 + r.R * (1 - (1 - u) * (1 - u))) * c.s * 0.5, n = Math.max(16, Math.round(rad * 0.9)), sz = u < 0.6 ? 2 : 1;
      if (u > 0.7 && (((G.time * 30) | 0) & 1)) continue;
      ctx.fillStyle = r.col;
      for (let i = 0; i < n; i++) { const an = i / n * Math.PI * 2; ctx.fillRect(Math.round(c.x + Math.cos(an) * rad), Math.round(c.y + Math.sin(an) * rad * 0.62), sz, sz); }
    }
    drawCombos(G);
    for (const p of G.players) if (heads[p.id]) { drawMeter(p, heads[p.id]); p.headScreen = heads[p.id]; }
    // 晃晕冒星 / 晃倒小鸟
    for (const p of G.players) if (heads[p.id] && p.stun > 0 && !p.knock && (p.stunK === 'daze' || p.stunK === 'fall' || p.stunK === 'spin')) {   // 顶翻（knock）不冒星
      const hp = heads[p.id], r = Math.max(4, hp.s * 0.28), n = p.stunK === 'spin' ? 2 : 3;
      for (let i = 0; i < n; i++) {
        const an = G.time * 7 + i * Math.PI * 2 / n, sx = Math.round(hp.x + Math.cos(an) * r), sy = Math.round(hp.y - hp.s * 0.32 + Math.sin(an) * r * 0.35);
        ctx.fillStyle = i % 2 ? '#ffffff' : '#ffd24a'; ctx.fillRect(sx, sy - 2, 1, 5); ctx.fillRect(sx - 2, sy, 5, 1); ctx.fillRect(sx - 1, sy - 1, 3, 3);
      }
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (!RP) drawScreenFx(G, { heads, ball: proj(b.x, b.y, b.z) });
    if (F.flash > 0) { ctx.globalAlpha = Math.min(0.5, F.flash * 3.2); ctx.fillStyle = F.flashCol; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1; }
    if (F.slow > 0) { ctx.fillStyle = '#05070f'; ctx.fillRect(0, 0, W, 14); ctx.fillRect(0, H - 14, W, 14); }
    if (RP) {
      ctx.fillStyle = '#05070f'; ctx.fillRect(0, H - 18, W, 18); ctx.fillRect(0, 0, W, 6);
    }
  }

  PH.render = { init: init, resize: resize, get W() { return W; }, get H() { return H; }, render: render, camera1Intro: camera1Intro, replayCamera: replayCamera, particleSize: particleSize, setTheme: setTheme, proj: proj, cam: cam, CAMV: CAMV, CAM_DEF: CAM_DEF, setCam: setCam, camTuned: camTuned, setCamTuned: setCamTuned, resetCamTuned: resetCamTuned, HOOP: HOOP, BOARD_Y: BOARD_Y, BALL_R: BALL_R, curCol: curCol,
    // 5V5 全场模式复用的绘制图元（不影响 1V1）
    drawCombos: drawCombos, drawScreenFx: drawScreenFx, drawMeter: (pl, hp) => drawMeter(pl, hp), drawPlayer: drawPlayer, sprintTrail: sprintTrail, drawHead: drawHead, drawBall: drawBall, shadow: shadow, ellipse: ellipse, ring: ring, brush: brush, getCtx: () => ctx, drawNameTag: curName, BAYER: BAYER };
  const previewCache = new Map();
  PH.render.playerPreview = function (target, arch, side) {
    const key = arch.key + ':' + side;
    if (!previewCache.has(key)) {
      const saved = { ctx, W, H, cam: { ...cam }, view: { ...CAMV } }, image = document.createElement('canvas');
      image.width = 360; image.height = 400;
      try {
        ctx = image.getContext('2d'); W = 360; H = 400;
        setCam({ height: 1.2, dist: 6, zoom: 1.25, push: 0 }); cam.x = 0; cam.y = -5.5; cam.oy = 10;
        const p = PH.game.t5.makePlayer(side, arch.key, 'human'); p.face = -Math.PI / 2; p.pose.lean = 0;
        drawPlayer(p, {});
        const pixels = ctx.getImageData(0, 0, W, H).data;
        let x0 = W, y0 = H, x1 = -1, y1 = -1;
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (pixels[(y * W + x) * 4 + 3]) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
        const crop = document.createElement('canvas'); crop.width = Math.max(1, x1 - x0 + 5); crop.height = Math.max(1, y1 - y0 + 5);
        if (x1 >= x0) crop.getContext('2d').drawImage(image, x0 - 2, y0 - 2, crop.width, crop.height, 0, 0, crop.width, crop.height);
        previewCache.set(key, crop);
      } finally { ctx = saved.ctx; W = saved.W; H = saved.H; Object.assign(cam, saved.cam); Object.assign(CAMV, saved.view); }
    }
    const image = previewCache.get(key), c = target.getContext('2d'), s = Math.min(target.width / image.width, target.height / image.height);
    c.clearRect(0, 0, target.width, target.height); c.imageSmoothingEnabled = false;
    c.drawImage(image, (target.width - image.width * s) / 2, target.height - image.height * s, image.width * s, image.height * s);
  };
})();
