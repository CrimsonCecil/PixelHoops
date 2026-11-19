window.PH = window.PH || {};
(function () {
  const types = {
    allstar: { name: '全能明星', col: '#ffd24a', pixels: ['..#..', '#####', '.###.', '.###.', '#...#'] },
    sniper: { name: '三分射手', col: '#6edcff', pixels: ['####.', '....#', '..##.', '....#', '####.'] },
    slasher: { name: '突破手', col: '#ff9b4a', pixels: ['..##.', '.##..', '#####', '..##.', '.##..'] },
    playmaker: { name: '组织大师', col: '#c69bff', pixels: ['..#..', '...#.', '#####', '...#.', '..#..'] },
    post: { name: '内线支柱', col: '#ff7f89', pixels: ['#...#', '#####', '.#.#.', '.###.', '..#..'] },
    rim: { name: '护框者', col: '#69b5ff', pixels: ['#####', '#...#', '#...#', '.#.#.', '..#..'] },
    lockdown: { name: '防守大闸', col: '#7de0a2', pixels: ['.###.', '.#.#.', '#####', '##.##', '#####'] }
  };
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
    a.ptype = { id: id, name: t.name, col: t.col };
    return a.ptype;
  }
  function draw(ctx, id, x, y) {
    const t = types[id]; if (!t) return 0;
    x = Math.round(x); y = Math.round(y);
    ctx.save();
    for (let r = 0; r < 11; r++) for (let c = 0; c < 11; c++) {
      const d = (c - 5) * (c - 5) + (r - 5) * (r - 5);
      if (d > 30) continue;
      ctx.fillStyle = d > 21 ? '#15101f' : d > 13 ? t.col : '#202334';
      ctx.fillRect(x + c, y + r, 1, 1);
    }
    ctx.fillStyle = '#fff9e8';
    t.pixels.forEach((row, r) => { for (let c = 0; c < row.length; c++) if (row[c] === '#') ctx.fillRect(x + c + 3, y + r + 3, 1, 1); });
    ctx.restore();
    return 11;
  }
  PH.PT = { of: of, draw: draw, SIZE: 11 };
})();
