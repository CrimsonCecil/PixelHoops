window.PH = window.PH || {};
(function () {
  const types = {
    allstar: { name: '全能明星', pixels: ['...#...', '..###..', '#######', '.#####.', '..###..', '.##.##.', '.#...#.'] },
    sniper: { name: '三分射手', pixels: ['.#####.', '.....##', '.....##', '..####.', '.....##', '.....##', '.#####.'] },
    slasher: { name: '突破手', pixels: ['...###.', '..###..', '.###...', '#######', '...###.', '..###..', '.###...'] },
    playmaker: { name: '组织大师', pixels: ['...#...', '...##..', '...###.', '#######', '...###.', '...##..', '...#...'] },
    post: { name: '内线支柱', pixels: ['.#.#.#.', '.#####.', '.#####.', '######.', '#######', '.#####.', '..###..'] },
    rim: { name: '护框者', pixels: ['.#####.', '##...##', '#.....#', '#.....#', '.#...#.', '..#.#..', '...#...'] },
    lockdown: { name: '防守大闸', pixels: ['..###..', '.##.##.', '.#...#.', '.#####.', '.##.##.', '.##.##.', '.#####.'] }
  };
  const SIZE = 13;
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
  function draw(ctx, id, x, y) {
    const t = types[id]; if (!t) return 0;
    x = Math.round(x); y = Math.round(y);
    ctx.save();
    for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) {
      const hex = Math.max(Math.abs(c - 6), Math.abs(r - 6) + Math.abs(c - 6) * 0.5);
      if (hex > 6) continue;
      ctx.fillStyle = hex > 5 ? '#15101f' : hex > 4 ? '#b9c4d0' : '#202334';
      ctx.fillRect(x + c, y + r, 1, 1);
    }
    ctx.fillStyle = '#fff9e8';
    t.pixels.forEach((row, r) => { for (let c = 0; c < row.length; c++) if (row[c] === '#') ctx.fillRect(x + c + 3, y + r + 3, 1, 1); });
    ctx.restore();
    return SIZE;
  }
  PH.PT = { of: of, draw: draw, SIZE: SIZE };
})();
