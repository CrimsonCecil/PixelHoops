window.PH = window.PH || {};
(function () {
  // V4.6 球员类型：14 种，每人按能力自动算 1 个主类型。效果在 game.js（ptIs / TAI）和 team5.js 里生效，说明见 desc
  const types = {
    allstar: { name: '全能明星', desc: '体力低时能力衰减减半；关键时刻优先持球', pixels: ['...#...', '..###..', '#######', '.#####.', '..###..', '.##.##.', '.#...#.'] },
    sniper: { name: '三分射手', desc: '接球 0.6 秒内三分绿区 +8%；电脑更爱投三分，5V5 跑无球掩护', pixels: ['.#####.', '.....##', '.....##', '..####.', '.....##', '.....##', '.#####.'] },
    creator: { name: '持球射手', desc: '运球后干拔 / 后撤步受干扰 −8%；电脑多单打后撤步', pixels: ['..#.#..', '.#####.', '##...##', '#..#..#', '##...##', '.#####.', '..#.#..'] },
    slasher: { name: '突破手', desc: '持球加速 +6%，对抗上篮更强；电脑多突破冲筐', pixels: ['...###.', '..###..', '.###...', '#######', '...###.', '..###..', '.###...'] },
    playmaker: { name: '组织大师', desc: '运球连招衔接更快；5V5 接他传球 1 秒内出手命中 +3%', pixels: ['...#...', '...##..', '...###.', '#######', '...###.', '...##..', '...#...'] },
    post: { name: '低位背打', desc: '背打顶人 +8%；电脑多背打，5V5 多低位落位', pixels: ['.#.#.#.', '.#####.', '.#####.', '######.', '#######', '.#####.', '..###..'] },
    pointC: { name: '策应中锋', desc: '高位（离筐 4~7 米）中投绿区 +5%；5V5 高位传球更难被截', pixels: ['#..#..#', '.#.#.#.', '..###..', '#######', '..###..', '.#.#.#.', '#..#..#'] },
    rim: { name: '护框者', desc: '篮下 3.5 米内防守移动更快（协防启动快）', pixels: ['.#####.', '##...##', '#.....#', '#.....#', '.#...#.', '..#.#..', '...#...'] },
    lockdown: { name: '防守大闸', desc: '横移速度 +5%，吃晃 −10%；5V5 自动去防对方最强的人', pixels: ['..###..', '.##.##.', '.#...#.', '.#####.', '.##.##.', '.##.##.', '.#####.'] },
    threeD: { name: '3D 侧翼', desc: '防守回位加速 +6%，底角三分绿区 +5%', pixels: ['###.##.', '..#.#.#', '.##.#.#', '..#.#.#', '###.##.', '.......', '#######'] },
    stretch: { name: '空间型内线', desc: '跳投没有大个出手点被盖惩罚，三分绿区 +5%；5V5 挡拆后外弹', pixels: ['#######', '#.....#', '#.###.#', '#.#.#.#', '#.###.#', '#.....#', '#######'] },
    glass: { name: '篮板怪', desc: '投篮篮板范围 +0.3 米；5V5 必冲前场板', pixels: ['..###..', '.#####.', '..###..', '.......', '#.....#', '##...##', '.#####.'] },
    lob: { name: '空接终结者', desc: '补扣范围 +0.3 米、门槛更低；5V5 挡拆必下顺，更容易被喂空接', pixels: ['..###..', '..###..', '.......', '...#...', '..###..', '.#.#.#.', '...#...'] },
    twoway: { name: '锋线攻防', desc: '内外线干扰都按外防 / 内防较高的一项算（换防不吃亏）', pixels: ['..#.#..', '.##.##.', '#######', '.##.##.', '..#.#..', '.......', '.......'] }
  };
  const SIZE = 13;
  function score(a) {
    const r = (k, d) => Number.isFinite(a[k]) ? Math.max(0, Math.min(1, a[k])) : (d == null ? 0 : d);
    const h = a.h || 2, pos = a.pos || '', big = h >= 2.06, guard = /后卫/.test(pos), ctr = /中锋/.test(pos), inner = /中锋|大前/.test(pos), fwd = !guard && !inner;
    const R5 = PH.R5, row = R5 && R5.P && R5.P[a.key], pass = row ? (row[0] + row[1] + row[2]) / 300 : 0.55 + 0.35 * r('hnd') - 0.2;
    const shoot = (r('three') + r('mid')) / 2, inside = Math.max(r('lay'), r('dunk')), hk = Math.max(r('hook'), r('fade'));
    return {
      sniper: r('three') * 0.9 + r('mid') * 0.1 - 0.4 * Math.max(0, r('hnd') - 0.75) - 0.02 - (inner ? 0.1 : 0),
      creator: shoot * 0.55 + r('hnd') * 0.35 + r('fade') * 0.1 - 0.05 * pass - (inner ? 0.15 : 0),
      slasher: inside * 0.45 + r('spdB', r('spd')) * 0.2 + r('acc') * 0.25 + r('leap', r('vert')) * 0.1 - 0.03 - (ctr ? 0.15 : 0) - 0.1 * Math.max(0, shoot - 0.8),
      playmaker: r('hnd') * 0.4 + pass * 0.55 + (guard ? 0.04 : -0.2) - 0.04,
      post: r('str') * 0.3 + r('post') * 0.4 + hk * 0.15 + r('close') * 0.15 + (big ? 0.03 : -0.2),
      pointC: inner ? r('hnd') * 0.3 + pass * 0.5 + r('post') * 0.1 + r('mid') * 0.1 + 0.05 : 0,
      rim: r('blk') * 0.55 + r('intD') * 0.3 + Math.max(0, Math.min(1, (h - 1.8) / 0.35)) * 0.15 + (big ? 0.02 : -0.2) - (ctr ? 0 : 0.04),
      lockdown: r('def') * 0.45 + r('lat', r('def')) * 0.3 + r('stl') * 0.25 + 0.01 - 0.1 * Math.max(0, shoot - 0.8),
      threeD: Math.min(r('three'), r('def')) * 0.8 + 0.1 * r('lat', r('def')) + 0.1 * r('three') + (inner ? -0.1 : 0.06) - 0.2 * Math.max(0, r('hnd') - 0.8) - 0.2 * Math.max(0, inside - 0.82),
      stretch: inner && big ? r('three') * 0.65 + r('blk') * 0.1 + r('str') * 0.15 + r('intD') * 0.1 + 0.03 : 0,
      glass: (r('oreb') * 0.45 + r('dreb') * 0.35 + r('str') * 0.2) + (big || (inner && r('oreb') >= 0.95 && r('dreb') >= 0.95) ? 0.04 : -0.1) - 0.15 * shoot,
      lob: r('dunk') * 0.35 + r('leap', r('vert')) * 0.25 + r('sdunk') * 0.2 + r('rej', r('vert')) * 0.2 + (big ? 0.1 : -0.15) - 0.3 * r('three') - 0.4 * Math.max(0, r('hnd') - 0.65),
      twoway: fwd ? (r('def') + r('intD')) * 0.22 + (shoot + inside) * 0.22 + r('hnd') * 0.08 + 0.07 : 0
    };
  }
  function of(a) {
    if (!a || typeof a !== 'object') return null;
    if (Object.prototype.hasOwnProperty.call(a, 'ptype')) return a.ptype;
    const r = (k) => Number.isFinite(a[k]) ? Math.max(0, Math.min(1, a[k])) : 0;
    const shoot = (r('three') + r('mid')) / 2, inside = Math.max(r('lay'), r('dunk'));
    let id;
    if (a.ovr >= 94 && shoot >= 0.76 && inside >= 0.87 && r('hnd') >= 0.84 && r('def') >= 0.62 && (shoot + inside + r('hnd') + r('def')) / 4 >= 0.83) id = 'allstar';
    else { const s = score(a); id = Object.keys(s).reduce((best, k) => s[k] > s[best] ? k : best, 'sniper'); }
    const t = types[id];
    a.ptype = { id: id, name: t.name, desc: t.desc, col: '#fff9e8' };
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
  PH.PT = { of: of, draw: draw, SIZE: SIZE, types: types, score: score };
})();
