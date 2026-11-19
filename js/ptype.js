window.PH = window.PH || {};
(function () {
  const types = {
    allstar: { name: '全能明星', pixels: ['..#..', '#####', '.###.', '.###.', '#...#'] },
    sniper: { name: '三分射手', pixels: ['####.', '....#', '..##.', '....#', '####.'] },
    slasher: { name: '突破手', pixels: ['..##.', '.##..', '#####', '..##.', '.##..'] },
    playmaker: { name: '组织大师', pixels: ['..#..', '...#.', '#####', '...#.', '..#..'] },
    post: { name: '内线支柱', pixels: ['#...#', '#####', '.#.#.', '.###.', '..#..'] },
    rim: { name: '护框者', pixels: ['#####', '#...#', '#...#', '.#.#.', '..#..'] },
    lockdown: { name: '防守大闸', pixels: ['.###.', '.#.#.', '#####', '##.##', '#####'] }
  };
  const styles = ['白环圆章', '奶油同色', '队色圆章', '银框六角', '极简描边', '浅底反色'];
  const valid = (v) => Number.isInteger(+v) && +v >= 1 && +v <= styles.length;
  let style = 1;
  function setStyle(v) {
    if (!valid(v)) return false;
    style = +v;
    try { localStorage.setItem('ptype-style', String(style)); } catch (_) {}
    return true;
  }
  try { const saved = localStorage.getItem('ptype-style'); if (valid(saved)) style = +saved; } catch (_) {}
  const requested = new URLSearchParams(window.location.search).get('pt');
  if (valid(requested)) setStyle(requested);
  function of(a) {
    if (!a || typeof a !== 'object') return null;
    if (Object.prototype.hasOwnProperty.call(a, 'ptype')) return a.ptype;
    const r = (k) => Number.isFinite(a[k]) ? Math.max(0, Math.min(1, a[k])) : 0;
    const shoot = (r('three') + r('mid')) / 2, inside = Math.max(r('lay'), r('dunk'));
    const guard = /后卫|PG|SG/.test(a.pos || ''), big = (a.h || 0) >= 2.06;
    let id;
    if (a.ovr >= 94 && shoot >= 0.76 && inside >= 0.87 && r('hnd') >= 0.84 && r('def') >= 0.62 && (shoot + inside + r('hnd') + r('def')) / 4 >= 0.83) id = 'allstar';
    else {
      const scores = {
        sniper: r('three') * 0.85 + r('mid') * 0.15,
        slasher: inside * 0.4 + r('spd') * 0.25 + r('acc') * 0.25 + r('vert') * 0.1,
        playmaker: r('hnd') * 0.85 + r('acc') * 0.15 + (guard ? 0.025 : -0.12),
        post: r('str') * 0.5 + inside * 0.35 + r('mid') * 0.15 + (big ? 0.07 : -0.2),
        rim: r('blk') * 0.8 + Math.max(0, Math.min(1, ((a.h || 0) - 1.8) / 0.35)) * 0.2 + (big ? 0.03 : -0.15),
        lockdown: r('def') * 0.7 + r('stl') * 0.3 + 0.035
      };
      id = Object.keys(scores).reduce((best, k) => scores[k] > scores[best] ? k : best, 'sniper');
    }
    const t = types[id];
    a.ptype = { id: id, name: t.name, col: '#fff9e8' };
    return a.ptype;
  }
  function draw(ctx, id, x, y, nameCol) {
    const t = types[id]; if (!t) return 0;
    x = Math.round(x); y = Math.round(y);
    ctx.save();
    const ink = '#15101f', light = '#fff9e8';
    const accent = style === 2 ? '#e9d9ad' : style === 3 || style === 5 ? nameCol || light : style === 4 ? '#b9c4d0' : light;
    if (style !== 5) for (let r = 0; r < 11; r++) for (let c = 0; c < 11; c++) {
      const d = (c - 5) * (c - 5) + (r - 5) * (r - 5);
      const hex = Math.max(Math.abs(c - 5), Math.abs(r - 5) + Math.abs(c - 5) * 0.5);
      const edge = style === 4 ? hex > 4 ? 2 : hex > 3 ? 1 : 0 : d > 21 ? 2 : d > 13 ? 1 : 0;
      if (style === 4 ? hex > 5 : d > 30) continue;
      ctx.fillStyle = edge === 2 ? ink : style === 6 ? light : edge === 1 ? accent : '#202334';
      ctx.fillRect(x + c, y + r, 1, 1);
    }
    if (style === 5) {
      ctx.fillStyle = ink;
      t.pixels.forEach((row, r) => { for (let c = 0; c < row.length; c++) if (row[c] === '#') ctx.fillRect(x + c + 2, y + r + 2, 3, 3); });
    }
    ctx.fillStyle = style === 6 ? ink : style === 2 || style === 3 || style === 5 ? accent : light;
    t.pixels.forEach((row, r) => { for (let c = 0; c < row.length; c++) if (row[c] === '#') ctx.fillRect(x + c + 3, y + r + 3, 1, 1); });
    ctx.restore();
    return 11;
  }
  PH.PT = { of: of, draw: draw, SIZE: 11, styles: styles, setStyle: setStyle, get style() { return style; } };
})();
