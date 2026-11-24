// PIXEL HOOPS - 球场场景：地板配色 + 远景画法（主场球馆仍在 render.js，这里是其余场景）
(function () {
  const PH = (window.PH = window.PH || {});
  const FONT = "12px 'Fusion Pixel 12px Proportional SC', monospace";
  const BIG = "24px 'Fusion Pixel 12px Proportional SC', monospace";
  function rng(seed) { return () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }; }
  function box(b, c, x, y, w, h) { b.fillStyle = c; b.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); }
  // 竖向渐变：几档纯色之间用抖动过渡，保持像素感
  function sky(b, o, cols, y0, y1) {
    const n = cols.length - 1, span = (y1 - y0) / n;
    for (let y = y0; y < y1; y++) {
      const f = (y - y0) / span, i = Math.min(n - 1, Math.floor(f)), t = f - i;
      for (let x = 0; x < o.BW; x += 2) { b.fillStyle = cols[o.BAYER[((x >> 1) & 3) + ((y >> 1) & 3) * 4] / 16 < t ? i + 1 : i]; b.fillRect(x, y, 2, 1); }
    }
  }
  function glow(b, o, cx, y0, y1, half, col) {
    for (let y = y0; y < y1; y++) { const k = (y - y0) / (y1 - y0), w = half * (0.25 + 0.75 * k); for (let x = Math.round(cx - w); x < cx + w; x++) if (o.BAYER[(x & 3) + (y & 3) * 4] < (1 - k) * 9) { b.fillStyle = col; b.fillRect(x, y, 1, 1); } }
  }
  // 底部 28 像素的围挡：刷底色 + 一排字
  function strip(b, o, bg, edge, cols, y) {
    box(b, bg[0], 0, 142, o.BW, 28); box(b, bg[1], 0, 146, o.BW, 20); box(b, edge, 0, 145, o.BW, 1); box(b, edge, 0, 166, o.BW, 1);
    b.font = FONT; b.textBaseline = 'top';
    let x = o.startX, i = 0;
    while (x < o.BW) { b.fillStyle = cols[i % cols.length]; const w = o.words[i % o.words.length]; b.fillText(w, x, y || 150); x += Math.ceil(b.measureText(w).width) + 34; i++; }
  }
  function person(b, o, x, y, k, shirt, skin, up) {
    const s = o.shade;
    box(b, s(shirt, k), x, y + 6 - (up ? 2 : 0), 7, 12 + (up ? 2 : 0)); box(b, s(skin, k), x + 1, y - (up ? 2 : 0), 5, 6); box(b, s('#1a1210', k + 0.3), x + 1, y - (up ? 2 : 0), 5, 2);
    if (up) { box(b, s(skin, k), x - 2, y - 6, 2, 8); box(b, s(skin, k), x + 7, y - 6, 2, 8); }
    box(b, s('#23283a', k), x + 1, y + 18, 2, 8); box(b, s('#23283a', k), x + 4, y + 18, 2, 8);
  }
  function fence(b, o, y0, y1, col, post) {
    b.fillStyle = col;
    for (let y = y0; y < y1; y++) for (let x = 0; x < o.BW; x++) if (((x + y) % 6 === 0) || ((x - y + 600) % 6 === 0)) b.fillRect(x, y, 1, 1);
    for (let x = 20; x < o.BW; x += 96) { box(b, post, x, y0 - 4, 3, y1 - y0 + 4); box(b, o.shade(post, 1.4), x, y0 - 4, 1, y1 - y0 + 4); }
    box(b, post, 0, y0 - 2, o.BW, 2);
  }
  function skyline(b, o, r, base, cols, lit, hMin, hMax, gap) {
    for (let x = -10; x < o.BW;) {
      const w = 26 + ((r() * 44) | 0), h = hMin + ((r() * (hMax - hMin)) | 0), c = cols[(r() * cols.length) | 0];
      box(b, c, x, base - h, w, h); box(b, o.shade(c, 1.25), x, base - h, 2, h);
      for (let wy = base - h + 5; wy < base - 5; wy += 7) for (let wx = x + 5; wx < x + w - 5; wx += 6) if (r() < lit.p) box(b, lit.c[(r() * lit.c.length) | 0], wx, wy, 3, 4);
      if (r() < 0.3) { box(b, o.shade(c, 0.8), x + (w >> 1) - 4, base - h - 9, 9, 9); box(b, o.shade(c, 0.6), x + (w >> 1), base - h - 16, 1, 7); }
      x += w + ((r() * gap) | 0);
    }
  }

  const COURTS = [
    {
      id: 'gym', name: '训练馆', indoor: true, crowd: false, sky: '#262c3b', light: 0.13,
      wood: ['#e8c48a', '#e2bc80', '#e5c086', '#dab478', '#ecca92'], woodIn: ['#ecc990', '#e6c186', '#e9c58c', '#dfb97e', '#f0cf98'],
      paint: '#b8463c', paint2: '#a63e36', line: '#fbf6ea', apron: ['#2f5484', '#34598c'], out: '#151a26', pole: ['#15171f', '#4a5266', '#6c7690'],
      words: ['TRAINING DAY', 'PIXEL HOOPS', '训练馆', 'NO DAYS OFF'],
      paint3(b, o) {
        const r = rng(11);
        box(b, '#262c3b', 0, 0, o.BW, 170); box(b, '#3b4358', 0, 22, o.BW, 80); box(b, '#515b74', 0, 100, o.BW, 2);
        // 屋架和吊灯
        box(b, '#1a1f2c', 0, 0, o.BW, 22); for (let x = 0; x < o.BW; x += 44) { box(b, '#2c3346', x, 4, 44, 2); box(b, '#2c3346', x + 21, 0, 2, 22); }
        for (let x = 70; x < o.BW; x += 150) { box(b, '#10131c', x, 14, 34, 6); box(b, '#fff3c4', x + 3, 20, 28, 3); glow(b, o, x + 17, 23, 74, 60, 'rgba(255,240,190,0.12)'); }
        // 高窗
        for (let x = 24; x < o.BW; x += 150) {
          box(b, '#1c2130', x - 2, 34, 64, 50); box(b, '#9fd0f2', x, 36, 60, 46); box(b, '#c9e8fb', x, 36, 60, 14); box(b, '#1c2130', x + 19, 36, 2, 46); box(b, '#1c2130', x + 39, 36, 2, 46); box(b, '#1c2130', x, 58, 60, 2);
        }
        // 冠军旗
        const flags = ['#c94f4f', '#d9b44a', '#4f7bc9', '#5aa469', '#e8e4d8'];
        for (let x = 98, i = 0; x < o.BW; x += 150, i++) for (let j = 0; j < 2; j++) { const c = flags[(i * 2 + j) % 5], fx = x + j * 22; box(b, c, fx, 30, 16, 26); box(b, o.shade(c, 0.7), fx, 52, 16, 4); box(b, '#262c3b', fx + 6, 54, 4, 2); box(b, o.shade(c, 1.3), fx + 3, 36, 10, 2); box(b, o.shade(c, 1.3), fx + 5, 42, 6, 6); }
        // 墙面软包
        box(b, '#27477a', 0, 104, o.BW, 38); box(b, '#2f558f', 0, 104, o.BW, 3);
        for (let x = 0; x < o.BW; x += 38) { box(b, '#1d3760', x, 104, 1, 38); box(b, '#3563a4', x + 1, 107, 1, 35); }
        // 球架、记分牌、饮水机
        for (let x = 150; x < o.BW; x += 420) {
          box(b, '#10131c', x, 112, 54, 2); box(b, '#10131c', x, 128, 54, 2); box(b, '#10131c', x, 110, 2, 32); box(b, '#10131c', x + 52, 110, 2, 32);
          for (let i = 0; i < 5; i++) for (let j = 0; j < 2; j++) if (r() < 0.85) { box(b, '#d9722e', x + 4 + i * 10, 104 + j * 16, 8, 8); box(b, '#f09a52', x + 5 + i * 10, 105 + j * 16, 3, 3); box(b, '#7a3212', x + 4 + i * 10, 108 + j * 16, 8, 1); }
        }
        for (let x = 360; x < o.BW; x += 420) { box(b, '#0c0e15', x, 62, 70, 30); box(b, '#1a1f2c', x + 2, 64, 66, 26); b.font = FONT; b.textBaseline = 'top'; b.fillStyle = '#ff6b4a'; b.fillText('21', x + 8, 70); b.fillStyle = '#ffd24a'; b.fillText(':', x + 32, 70); b.fillStyle = '#5ee0ff'; b.fillText('18', x + 42, 70); }
        strip(b, o, ['#141926', '#1c2334'], '#3b4a72', ['#e8e4d8', '#ffd24a', '#8fb4e8', '#e8e4d8']);
      },
    },
    {
      id: 'street', name: '街头铁网球场', indoor: false, crowd: true, sky: '#4f8fd0', light: 0.09, grain: true,
      wood: ['#565c60', '#5b6165', '#52585c', '#5f6569', '#585e62'], woodIn: ['#63696c', '#686e71', '#5f6568', '#6c7275', '#656b6e'],
      paint: '#b8503a', paint2: '#a94832', line: '#ece6d2', apron: ['#74736e', '#6e6d68'], out: '#3c3b38', pole: ['#17181c', '#5a5e66', '#858a94'],
      words: ['STREET BALL', 'PIXEL HOOPS', '街头斗牛', 'WINNER STAYS'],
      paint3(b, o) {
        const r = rng(23);
        sky(b, o, ['#4f8fd0', '#78b2e6', '#a9d3f2', '#d9ecf6'], 0, 96);
        for (let i = 0; i < 9; i++) { const x = r() * o.BW, y = 8 + r() * 36, w = 30 + r() * 50; box(b, '#eef6fb', x, y, w, 5); box(b, '#eef6fb', x + 8, y - 3, w - 20, 3); box(b, '#cfe2ee', x + 4, y + 5, w - 8, 1); }
        skyline(b, o, r, 104, ['#8a5646', '#6a6878', '#96785a', '#7a4a3e', '#5f6a78'], { p: 0.55, c: ['#2b3140', '#2b3140', '#f6e2a0', '#9cc4dc'] }, 34, 82, 10);
        // 涂鸦墙
        box(b, '#8f8d86', 0, 96, o.BW, 46); box(b, '#a3a199', 0, 96, o.BW, 2); for (let x = 0; x < o.BW; x += 64) box(b, '#7f7d77', x, 98, 1, 44);
        const tags = [['HOOPS', '#ff5d8f', '#3b1d5e'], ['街球', '#ffd24a', '#b8341c'], ['BALL IS LIFE', '#5ee0ff', '#1b3f8a'], ['一球定胜负', '#7dff8a', '#15523a'], ['KING', '#ff8a3a', '#4a1d12'], ['1V1', '#f4f1e6', '#b8341c']];
        b.textBaseline = 'top'; b.font = BIG;
        for (let x = 16, i = 0; x < o.BW; i++) {
          const t = tags[i % tags.length], w = Math.ceil(b.measureText(t[0]).width);
          for (let k = 0; k < 14; k++) box(b, o.shade(t[2], 1.2), x - 8 + r() * (w + 12), 102 + r() * 32, 4 + r() * 16, 2 + r() * 5);
          b.fillStyle = t[2]; b.fillText(t[0], x + 2, 107); b.fillText(t[0], x - 2, 107); b.fillText(t[0], x, 109);
          b.fillStyle = t[1]; b.fillText(t[0], x, 105);
          for (let k = 0; k < 3; k++) box(b, t[1], x + r() * w, 129, 1, 3 + r() * 8);
          x += w + 30 + ((r() * 30) | 0);
        }
        // 铁网外的围观路人
        const shirts = ['#c94f4f', '#4f7bc9', '#d9b44a', '#e8e4d8', '#5aa469', '#8a5fc0', '#d97a3a', '#2a2e3d'], skins = ['#e9b384', '#c98d62', '#8d5a3b', '#f0c8a0', '#6b4530'];
        for (let x = 6; x < o.BW; x += 13 + ((r() * 30) | 0)) if (r() < 0.62) person(b, o, x, 114 + ((r() * 3) | 0), 0.9, shirts[(r() * shirts.length) | 0], skins[(r() * skins.length) | 0], o.up && r() < 0.8);
        fence(b, o, 78, 142, 'rgba(26,30,38,0.42)', '#3d4048');
        strip(b, o, ['#55544f', '#63625c'], '#8a8880', ['#f4f1e6', '#ffd24a', '#f4f1e6', '#ff8a6a']);
        for (let x = 0; x < o.BW; x += 23) box(b, '#4a4945', x + ((r() * 9) | 0), 167 + ((r() * 2) | 0), 5 + ((r() * 8) | 0), 1);
      },
    },
    {
      id: 'rooftop', name: '天台日落', indoor: false, crowd: false, sky: '#2b1d52', light: 0.12, grain: true,
      wood: ['#2f6f8c', '#337592', '#2b6986', '#377b98', '#317290'], woodIn: ['#3a88a4', '#3e8eaa', '#36829e', '#4294b0', '#3c8ba7'],
      paint: '#e2733c', paint2: '#d36632', line: '#fff3dc', apron: ['#5b4a60', '#554559'], out: '#2a2030', pole: ['#1b1424', '#6a4f6e', '#94709a'],
      words: ['SUNSET RUN', 'PIXEL HOOPS', '天台球场', 'GOLDEN HOUR'],
      paint3(b, o) {
        const r = rng(37);
        sky(b, o, ['#2b1d52', '#6a2f6e', '#c44f68', '#f58a52', '#ffc66a'], 0, 128);
        for (let i = 0; i < 40; i++) box(b, '#f6dcff', r() * o.BW, r() * 34, 1, 1);
        // 落日：横条切开的圆盘
        for (let cx = 250; cx < o.BW; cx += 500) for (let y = -34; y <= 34; y++) { const w = Math.round(Math.sqrt(34 * 34 - y * y)), yy = 112 + y; if (yy >= 128 || (y > 0 && (y % 7) > 4)) continue; box(b, y < -12 ? '#fff0a8' : y < 8 ? '#ffd166' : '#ff9a5a', cx - w, yy, w * 2, 1); }
        for (let i = 0; i < 12; i++) { const x = r() * o.BW, y = 40 + r() * 50, w = 40 + r() * 70; box(b, '#e06a6c', x, y, w, 3); box(b, '#ffb07a', x + 6, y + 3, w - 16, 1); }
        skyline(b, o, r, 130, ['#3a2356', '#452a60', '#2f1d48'], { p: 0.35, c: ['#ffd27a', '#ffb057', '#ffe9b0'] }, 20, 62, 6);
        // 近处楼顶：水塔、天线、晾衣绳彩灯
        for (let x = 60; x < o.BW; x += 330) { box(b, '#1f1530', x, 92, 30, 28); box(b, '#2c1f42', x, 92, 4, 28); box(b, '#1f1530', x - 3, 88, 36, 5); box(b, '#1f1530', x + 3, 120, 2, 12); box(b, '#1f1530', x + 25, 120, 2, 12); box(b, '#1f1530', x + 190, 74, 1, 56); box(b, '#1f1530', x + 182, 82, 17, 1); box(b, '#1f1530', x + 185, 90, 11, 1); }
        box(b, '#3b2a46', 0, 128, o.BW, 14); box(b, '#5a4266', 0, 128, o.BW, 2); for (let x = 0; x < o.BW; x += 28) box(b, '#2c1f36', x, 130, 1, 12);
        const bulbs = ['#ffd24a', '#ff6b8a', '#5ee0ff', '#7dff8a', '#ff9a4a'];
        for (let x = 0, i = 0; x < o.BW; x += 12, i++) { const y = 121 + Math.round(4 * Math.sin((x % 120) / 120 * Math.PI)); box(b, '#1b1424', x, y, 12, 1); box(b, bulbs[i % 5], x + 5, y + 1, 2, 3); box(b, 'rgba(255,240,200,0.25)', x + 4, y + 1, 4, 4); }
        strip(b, o, ['#2a2030', '#3b2a46'], '#7a5a8a', ['#ffc66a', '#ff8a8a', '#ffe9b0', '#ffc66a']);
      },
    },
    {
      id: 'park', name: '夜间公园', indoor: false, crowd: true, sky: '#080d20', light: 0.26, grain: true,
      wood: ['#1f4a44', '#224e48', '#1c4640', '#25524c', '#204c46'], woodIn: ['#265a54', '#295e58', '#235650', '#2c625c', '#275c56'],
      paint: '#8a3aa8', paint2: '#7c3298', line: '#8ff4ff', apron: ['#152a30', '#172e34'], out: '#0b1418', pole: ['#090c14', '#2f3850', '#4a5878'],
      words: ['NIGHT RUN', 'PIXEL HOOPS', '夜场斗牛', 'OPEN 24H'],
      paint3(b, o) {
        const r = rng(51);
        sky(b, o, ['#080d20', '#0d1630', '#162344'], 0, 110);
        for (let i = 0; i < 90; i++) box(b, r() < 0.2 ? '#ffffff' : '#8fa6d8', r() * o.BW, r() * 70, 1, 1);
        for (let cx = 180; cx < o.BW; cx += 500) for (let y = -11; y <= 11; y++) { const w = Math.round(Math.sqrt(121 - y * y)); box(b, '#f4f0d0', cx - w, 30 + y, w * 2, 1); box(b, '#080d20', cx - w + 7, 26 + y, Math.max(0, w * 2 - 9), 1); }
        skyline(b, o, r, 112, ['#111a34', '#0e1630', '#162040'], { p: 0.3, c: ['#ffd27a', '#5ee0ff', '#ff6bd0'] }, 24, 70, 14);
        // 树
        for (let x = -20; x < o.BW; x += 46 + ((r() * 40) | 0)) { const h = 30 + ((r() * 22) | 0); box(b, '#0a1f1c', x + 14, 112 - 8, 4, 30); for (let k = 0; k < 9; k++) { const w = 10 + r() * 16; box(b, k & 1 ? '#0f2e28' : '#0c2622', x + 16 - w + r() * 8, 112 - h + k * (h / 11), w * 2, 7); } }
        // 路灯和霓虹招牌
        for (let x = 110; x < o.BW; x += 260) { box(b, '#1c2438', x, 52, 3, 90); box(b, '#1c2438', x - 10, 50, 23, 3); box(b, '#fff6c8', x - 9, 53, 8, 3); box(b, '#fff6c8', x + 4, 53, 8, 3); glow(b, o, x - 5, 56, 142, 46, 'rgba(255,244,190,0.13)'); glow(b, o, x + 8, 56, 142, 46, 'rgba(255,244,190,0.13)'); }
        const neon = [['HOOPS', '#ff5dc8'], ['OPEN', '#5ee0ff'], ['夜场', '#ffd24a'], ['24H', '#7dff8a']];
        b.font = BIG; b.textBaseline = 'top';
        for (let x = 20, i = 0; x < o.BW; x += 260, i++) { const n = neon[i % 4], w = Math.ceil(b.measureText(n[0]).width); box(b, '#0a0f1e', x - 6, 80, w + 12, 34); box(b, n[1], x - 6, 80, w + 12, 1); box(b, n[1], x - 6, 113, w + 12, 1); box(b, n[1], x - 6, 80, 1, 34); box(b, n[1], x + w + 5, 80, 1, 34); b.globalAlpha = 0.35; b.fillStyle = n[1]; b.fillText(n[0], x + 1, 86); b.fillText(n[0], x - 1, 84); b.globalAlpha = 1; b.fillStyle = '#ffffff'; b.fillText(n[0], x, 85); b.globalAlpha = 0.75; b.fillStyle = n[1]; b.fillText(n[0], x, 85); b.globalAlpha = 1; }
        const shirts = ['#c94f4f', '#4f7bc9', '#d9b44a', '#8a5fc0', '#d97a3a', '#2a2e3d'], skins = ['#e9b384', '#c98d62', '#8d5a3b', '#6b4530'];
        for (let x = 4; x < o.BW; x += 16 + ((r() * 34) | 0)) if (r() < 0.5) person(b, o, x, 115 + ((r() * 3) | 0), 0.55, shirts[(r() * shirts.length) | 0], skins[(r() * skins.length) | 0], o.up && r() < 0.8);
        fence(b, o, 84, 142, 'rgba(120,150,200,0.22)', '#1c2438');
        strip(b, o, ['#0b1220', '#101a30'], '#ff5dc8', ['#8ff4ff', '#ff8ae0', '#ffd24a', '#8ff4ff']);
        box(b, '#5ee0ff', 0, 166, o.BW, 1);
      },
    },
    {
      id: 'art', name: '彩绘球场', indoor: false, crowd: false, sky: '#f2c9a0', light: 0.07, art: true,
      wood: ['#ff7fa3', '#ffb347', '#4f6fe0', '#ffd95a', '#8a5fd6'], woodIn: ['#ff93b2', '#ffc063', '#6282ea', '#ffe274', '#9c74e0'],
      paint: '#1f2a6a', paint2: '#263380', line: '#ffffff', apron: ['#f4ead8', '#ece0cc'], out: '#b9a892', pole: ['#1a1a2a', '#f4f1e6', '#ffffff'],
      words: ['ART COURT', 'PIXEL HOOPS', '彩绘球场', 'PLAY IN COLOR'],
      paint3(b, o) {
        const r = rng(67), P = ['#ff7fa3', '#ffb347', '#4f6fe0', '#ffd95a', '#8a5fd6', '#3ec9b0', '#f4f1e6'];
        sky(b, o, ['#f2c9a0', '#f6dcc0', '#fbeedd'], 0, 40);
        // 两侧老楼夹着的整面色块墙
        for (let x = 0; x < o.BW; x += 125) {
          const c = P[(x / 125 | 0) % P.length], c2 = P[((x / 125 | 0) + 3) % P.length], top = 14 + ((r() * 18) | 0);
          box(b, c, x, top, 125, 142 - top); box(b, o.shade(c, 0.86), x + 119, top, 6, 142 - top); box(b, o.shade(c, 1.1), x, top, 125, 2);
          // 大几何：半圆、斜切、条纹
          const k = (x / 125 | 0) % 4;
          if (k === 0) for (let y = 0; y < 52; y++) { const w = Math.round(Math.sqrt(52 * 52 - y * y)); box(b, c2, x + 60 - w, 142 - y - 1, Math.min(w * 2, 125 - (60 - w)), 1); }
          else if (k === 1) for (let y = top + 4; y < 142; y++) box(b, c2, x, y, Math.max(0, Math.min(119, (y - top) * 1.1)), 1);
          else if (k === 2) for (let i = 0; i < 5; i++) box(b, i & 1 ? c2 : o.shade(c2, 1.12), x + 10, top + 14 + i * 20, 99, 10);
          else { for (let y = -30; y <= 30; y++) { const w = Math.round(Math.sqrt(900 - y * y)); box(b, c2, x + 62 - w, 78 + y, w * 2, 1); } box(b, P[6], x + 20, 118, 84, 6); }
          // 窗
          if (r() < 0.7) { const wx = x + 18 + ((r() * 60) | 0), wy = top + 10 + ((r() * 20) | 0); box(b, '#2a2440', wx - 1, wy - 1, 20, 26); box(b, '#9fd0f2', wx, wy, 18, 24); box(b, '#d9eefb', wx, wy, 18, 8); box(b, '#2a2440', wx + 8, wy, 2, 24); }
        }
        strip(b, o, ['#f4f1e6', '#ffffff'], '#1f2a6a', ['#1f2a6a', '#ff5d8f', '#4f6fe0', '#e08a1e']);
      },
    },
    {
      id: 'loft', name: '红砖仓库馆', indoor: true, crowd: true, sky: '#120d10', light: 0.24,
      wood: ['#8a5a36', '#825232', '#86563a', '#7a4c2e', '#90603c'], woodIn: ['#9a683e', '#92603a', '#966442', '#8a5a36', '#a06e44'],
      paint: '#23232c', paint2: '#2b2b36', line: '#f2e6c8', apron: ['#3a2c28', '#40312c'], out: '#150f0e', pole: ['#0e0c10', '#3a3a44', '#5c5c6a'],
      words: ['UNDERGROUND', 'PIXEL HOOPS', '仓库夜赛', 'INVITE ONLY'],
      paint3(b, o) {
        const r = rng(83);
        box(b, '#120d10', 0, 0, o.BW, 170);
        // 砖墙
        for (let y = 20; y < 142; y += 6) for (let x = ((y / 6) & 1) * 7 - 7; x < o.BW; x += 14) box(b, o.shade(['#7a3a2c', '#6e3428', '#84402e', '#63302a'][(r() * 4) | 0], 0.55 + (y / 142) * 0.45), x, y, 13, 5);
        // 钢梁、吊灯
        box(b, '#0c0a0e', 0, 0, o.BW, 20); for (let x = 0; x < o.BW; x += 36) { box(b, '#26222a', x, 6, 36, 2); box(b, '#26222a', x, 14, 36, 2); for (let k = 0; k < 8; k++) box(b, '#26222a', x + k * 4.5, 6 + (k & 1 ? 8 - (k % 4) * 2 : (k % 4) * 2), 2, 2); }
        for (let x = 60; x < o.BW; x += 170) { box(b, '#0c0a0e', x + 14, 20, 1, 14); box(b, '#1c1a20', x, 34, 30, 6); box(b, '#ffe2a0', x + 3, 40, 24, 2); glow(b, o, x + 15, 42, 128, 74, 'rgba(255,214,140,0.16)'); }
        // 壁画：大号人像剪影 + 色块
        const M = ['#ffd24a', '#ff5d8f', '#5ee0ff', '#f4f1e6'];
        for (let x = 150; x < o.BW; x += 340) {
          const c = M[(x / 340 | 0) % 4];
          for (let y = -34; y <= 34; y++) { const w = Math.round(Math.sqrt(34 * 34 - y * y)); for (let xx = -w; xx < w; xx++) if (o.BAYER[((x + xx) & 3) + ((y + 80) & 3) * 4] < 11) { b.fillStyle = c; b.fillRect(x + xx, 82 + y, 1, 1); } }
          box(b, '#120d10', x - 6, 62, 12, 13); box(b, '#120d10', x - 10, 75, 20, 26); box(b, '#120d10', x + 8, 56, 5, 24); box(b, '#120d10', x + 6, 50, 9, 9); box(b, '#120d10', x - 9, 101, 7, 16); box(b, '#120d10', x + 2, 101, 7, 16);
          b.font = BIG; b.textBaseline = 'top'; b.fillStyle = '#120d10'; b.fillText('HOOPS', x + 52, 72); b.fillStyle = c; b.fillText('HOOPS', x + 50, 70);
        }
        // 站着围观的人
        const shirts = ['#c94f4f', '#4f7bc9', '#d9b44a', '#e8e4d8', '#8a5fc0', '#d97a3a', '#2a2e3d', '#2a2e3d'], skins = ['#e9b384', '#c98d62', '#8d5a3b', '#f0c8a0', '#6b4530'];
        for (let row = 0; row < 2; row++) for (let x = (row * 5) - 2; x < o.BW; x += 9 + ((r() * 5) | 0)) if (r() < 0.86) person(b, o, x, 108 + row * 8 + ((r() * 3) | 0), 0.5 + row * 0.22, shirts[(r() * shirts.length) | 0], skins[(r() * skins.length) | 0], o.up);
        strip(b, o, ['#0e0b0e', '#1a1416'], '#ffd24a', ['#ffd24a', '#f4f1e6', '#ff8a6a', '#f4f1e6']);
      },
    },
  ];
  // 彩绘球场地板：按世界坐标切成几块大色块（返回调色板下标）
  function artCell(wx, wy) {
    if (Math.hypot(wx + 4.6, wy - 2.4) < 3.3) return 3;
    if (Math.hypot(wx - 5.4, wy - 11.6) < 3.8) return 0;
    const u = wx * 0.8 + wy * 0.6;
    if (u > 9.6) return 4;
    if (u > 5.2) return 2;
    if (wx - wy * 0.55 < -6.4) return 1;
    return u > 0.6 ? 1 : 0;
  }
  PH.COURTS = { list: COURTS, artCell: artCell, byId: (id) => COURTS.find((c) => c.id === id) || null };
})();