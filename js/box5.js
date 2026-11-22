// PIXEL HOOPS - V3.9h 5V5 实时数据面板（Box / 球队对比 / 传球 / 换人）+ 换人提示条
// 排版对照我们的 NBA 赛况台：顶部页签、深色表头、每列最高值高亮、在场 / 替补分区、我控制的人标星
(function () {
  const PH = (window.PH = window.PH || {});
  const $ = (id) => document.getElementById(id);
  const S = { open: false, tab: 'box0', sel: 0, pick: null, otab: 'box0', padPrev: {}, seen: 0, toasts: [] };
  const T5 = () => PH.T5, TT = () => PH.T5.T;
  const n0 = (v) => (v == null || isNaN(v) ? 0 : v);
  const pct = (m, a) => (a > 0 ? m / a : null);
  const fp = (v) => (v == null ? '-' : (v * 100).toFixed(v >= 1 ? 0 : 1) + '%');
  const sgn = (v) => (v > 0 ? '+' + v : String(v));
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const POSN = { 1: 'PG', 2: 'SG', 3: 'SF', 4: 'PF', 5: 'C' }, POSZ = { '控球后卫': 'PG', '得分后卫': 'SG', '小前锋': 'SF', '大前锋': 'PF', '中锋': 'C', '后卫': 'G', '前锋': 'F' };
  const posOf = (r) => { const p = r.pos; if (p == null) return '-'; if (typeof p === 'number') return POSN[p] || '-'; return POSZ[p] || p; };
  const F = ['pts', 'reb', 'oreb', 'dreb', 'ast', 'stl', 'blk', 'tov', 'fgm', 'fga', 'tpm', 'tpa', 'ftm', 'fta', 'pf', 'pm', 'pass', 'pAst', 'sAst', 'catch', 'drop', 'min'];

  // 一队的行：在场（按位置 0–4）在前，替补按上场时间
  function rows(t) {
    const T = TT(), B = T5().box(t) || [], ros = T.tm[t].ros;
    const out = B.map((r, i) => {
      const q = ros[i] || {}, a = q.a || {}, o = Object.assign({}, r);
      for (const k of F) o[k] = n0(o[k]);
      if (o.dreb === 0 && o.reb > o.oreb) o.dreb = o.reb - o.oreb;
      o.on = r.on != null ? !!r.on : (q.slot != null ? q.slot >= 0 : false);
      o.slot = r.slot != null ? r.slot : q.slot;
      o.ovr = r.ovr != null ? r.ovr : a.ovr;
      o.fat = r.fat != null ? +r.fat || 0 : 0;
      o.stam = Math.round(r.stam != null ? r.stam : q.p ? q.p.stam : q.stam != null ? q.stam : 100);
      o.pos = posOf(r.pos != null ? r : a);
      o.me = !!(T.hum === t && T.ctl && T.ctl.key === r.key);
      o.pend = !!r.pend || !!(T.subQ && T.subQ.some((s) => s.tm === t && (s.out === r.key || s.in === r.key)));
      o.fgp = pct(o.fgm, o.fga); o.tpp = pct(o.tpm, o.tpa); o.ftp = pct(o.ftm, o.fta);
      o.conv = pct(o.ast, o.pAst); o.at = o.tov ? o.ast / o.tov : o.ast ? o.ast : null;
      return o;
    });
    const on = out.filter((r) => r.on).sort((a, b) => a.slot - b.slot), bn = out.filter((r) => !r.on).sort((a, b) => b.min - a.min || b.ovr - a.ovr);
    const tot = B.team ? Object.assign({}, B.team) : {};
    for (const k of F) tot[k] = B.team && B.team[k] != null ? n0(B.team[k]) : out.reduce((s, r) => s + r[k], 0);
    if (!tot.dreb && tot.reb > tot.oreb) tot.dreb = tot.reb - tot.oreb;
    tot.fgp = pct(tot.fgm, tot.fga); tot.tpp = pct(tot.tpm, tot.tpa); tot.ftp = pct(tot.ftm, tot.fta); tot.conv = pct(tot.ast, tot.pAst); tot.at = tot.tov ? tot.ast / tot.tov : tot.ast || null;
    tot.pts = T.tm[t].score != null ? T.tm[t].score : tot.pts;
    // team5 没有罚球数据时（fta 为 null）隐藏 FT 列 / 罚球对比
    const noFT = !(B.team && B.team.fta != null) && !B.some((r) => r.fta != null);
    return { on: on, bn: bn, all: on.concat(bn), tot: tot, noFT: noFT };
  }
  const mmss = (m) => { const s = Math.round(m * 60); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };

  // 列：[键, 表头, 取值(用于高亮), 显示, 选项]  选项 low = 越少越好（最高值标红）；el = 1V1 结算 Box 的精英阈值（金色）；bad = 拖后腿（红）
  const BXC = () => (PH.BXH && PH.BXH.C) || {};
  const elOf = (k) => { const c = BXC()[k]; return c && c[4] ? c[4] : {}; };
  const COLS = {
    box: [
      ['min', 'MIN', (r) => r.min, (r) => (r.min > 0 || r.on ? mmss(r.min) : '-'), { nohl: true }],
      ['pts', 'PTS', (r) => r.pts, null, { el: (r) => r.pts >= 20 && (r.fgp || 0) >= 0.5 }],
      ['reb', 'REB', (r) => r.reb, null, { el: (r) => r.reb >= 10 }],
      ['ast', 'AST', (r) => r.ast, null, { el: (r) => r.ast >= 10 }],
      ['stl', 'STL', (r) => r.stl, null, { el: (r) => (elOf('STL').el ? elOf('STL').el(r) : r.stl >= 4) }],
      ['blk', 'BLK', (r) => r.blk, null, { el: (r) => (elOf('BLK').el ? elOf('BLK').el(r) : r.blk >= 4) }],
      ['tov', 'TOV', (r) => r.tov, null, { low: true, bad: (r) => (r.tov >= 5 ? 2 : r.tov >= 3 ? 1 : 0) }],
      ['fg', 'FG', (r) => r.fgp, (r) => r.fgm + '-' + r.fga, { q: (r) => r.fga >= 3, el: (r) => r.fga >= 8 && r.fgp >= 0.65, bad: (r) => (r.fga >= 6 && r.fgp < 0.35 ? (r.fgp < 0.25 ? 2 : 1) : 0) }],
      ['tp', '3P', (r) => r.tpp, (r) => r.tpm + '-' + r.tpa, { q: (r) => r.tpa >= 2, el: (r) => r.tpa >= 4 && r.tpp >= 0.5, bad: (r) => (r.tpa >= 4 && r.tpp < 0.2 ? 1 : 0) }],
      ['ft', 'FT', (r) => r.ftp, (r) => r.ftm + '-' + r.fta, { q: (r) => r.fta >= 2 }],
      ['pm', '+/-', (r) => r.pm, (r) => sgn(r.pm), { neg: true }],
    ],
    pass: [
      ['pass', '传球', (r) => r.pass, null, {}],
      ['ast', '助攻', (r) => r.ast, null, { el: (r) => r.ast >= 10 }],
      ['pAst', '潜在助攻', (r) => r.pAst, null, {}],
      ['sAst', '二次助攻', (r) => r.sAst, null, {}],
      ['conv', '转化率', (r) => r.conv, (r) => fp(r.conv), { q: (r) => r.pAst >= 2 }],
      ['tov', '失误', (r) => r.tov, null, { low: true, bad: (r) => (r.tov >= 5 ? 2 : r.tov >= 3 ? 1 : 0) }],
      ['at', 'A/T', (r) => r.at, (r) => (r.at == null ? '-' : r.at.toFixed(1)), { q: (r) => r.ast + r.tov >= 2 }],
      ['catch', '接球', (r) => r.catch, null, {}],
      ['drop', '漏接', (r) => r.drop, null, { low: true, bad: (r) => (r.drop >= 3 ? 1 : 0) }],
    ],
  };
  // 高亮：每列最高值（失误类最高值标红），满足 1V1 结算 Box 的精英阈值时升级成金色；命中率按出手门槛
  function hlMap(list, cols) {
    const H = list.map(() => ({}));
    cols.forEach((c) => {
      const [k, , get, , o] = c; if (o.nohl) return;
      let best = null;
      let lo = null;
      list.forEach((r) => { const v = get(r); if (v == null || (o.q && !o.q(r))) return; if (best == null || v > best) best = v; if (lo == null || v < lo) lo = v; });
      if (best === lo) best = null;
      list.forEach((r, i) => {
        const v = get(r); let cl = '';
        if (o.bad) { const b = o.bad(r); if (b) cl = 'b' + b; }
        if (!cl && o.el && o.el(r)) cl = 'g3';
        if (!cl && best != null && best > 0 && v === best && (!o.q || o.q(r))) cl = o.low ? 'b1' : 'g2';
        if (!cl && o.neg && v < 0 && v === Math.min.apply(null, list.map(get))) cl = 'b1';
        H[i][k] = cl;
      });
    });
    return H;
  }
  function nameCell(r) {
    return '<td class="nm">' + (r.me ? '<b class="b5me">★</b>' : '<b class="b5me"></b>') + '<span class="b5n">' + esc(r.name) + '</span><small class="b5p">' + r.pos + '</small>' + (r.pend ? '<em class="b5pend">待换</em>' : '') + '</td>';
  }
  // 体力条：当前体力 + 右端暗红斜纹 = 长期疲劳（体力上限 100 − fat，只在板凳恢复）
  function stBar(v, wide, fat) { const c = v > 25 ? '' : ' lo', f = Math.max(0, Math.min(60, Math.round(fat || 0))); return '<span class="b5st' + c + (wide ? ' w' : '') + '"><s><b style="width:' + Math.max(0, Math.min(100, v)) + '%"></b>' + (f ? '<u style="width:' + f + '%"></u>' : '') + '</s><i>' + v + '</i></span>'; }
  function table(t, kind, opt) {
    opt = opt || {};
    const T = TT(), R = rows(t), cols = COLS[kind].filter((c) => !(R.noFT && c[0] === 'ft')), H = hlMap(R.all, cols), tc = T.tm[t].col.ui;
    const live = !opt.final;
    let h = '<table class="bx b5t" data-testid="b5-' + kind + '-' + t + '"><thead><tr><th class="nm" style="color:' + tc + '">' + esc(T.tm[t].name) + '</th>' + cols.map((c) => '<th>' + c[1] + '</th>').join('') + (live && kind === 'box' ? '<th>体力</th>' : '') + '</tr></thead><tbody>';
    const row = (r, i, first) => '<tr class="' + (r.on ? 'on' : 'bn') + (first ? ' sep' : '') + (r.me ? ' me' : '') + '">' + nameCell(r) + cols.map((c) => { const v = c[3] ? c[3](r) : c[2](r); return '<td class="' + (H[i][c[0]] || '') + '">' + v + '</td>'; }).join('') + (live && kind === 'box' ? '<td class="stc">' + stBar(r.stam, false, r.fat) + '</td>' : '') + '</tr>';
    const lab = (s, n) => '<tr class="grp"><td colspan="' + n + '">' + s + '</td></tr>';
    const nc = cols.length + 1 + (live && kind === 'box' ? 1 : 0);
    if (live) h += lab('在场', nc);
    R.on.forEach((r, i) => { h += row(r, i, false); });
    if (R.bn.length) { if (live) h += lab('替补', nc); R.bn.forEach((r, j) => { h += row(r, R.on.length + j, !live && j === 0); }); }
    const tt = R.tot; tt.name = '合计';
    h += '<tr class="tot"><td class="nm"><b class="b5me"></b>合计</td>' + cols.map((c) => '<td>' + (c[0] === 'min' ? '' : c[0] === 'pm' ? '' : c[3] ? c[3](tt) : c[2](tt)) + '</td>').join('') + (live && kind === 'box' ? '<td></td>' : '') + '</tr>';
    return h + '</tbody></table>';
  }
  // 球队对比：像赛况台「球队统计」，左右两队，占优一侧高亮
  function compare() {
    const T = TT(), R0 = rows(0), A = R0.tot, B = rows(1).tot, c0 = T.tm[0].col.ui, c1 = T.tm[1].col.ui;
    let L = [
      ['得分', (x) => x.pts], ['投篮', (x) => x.fgp, (x) => x.fgm + '-' + x.fga + ' <small>' + fp(x.fgp) + '</small>'], ['三分', (x) => x.tpp, (x) => x.tpm + '-' + x.tpa + ' <small>' + fp(x.tpp) + '</small>'],
      ['罚球', (x) => x.ftp, (x) => x.ftm + '-' + x.fta], ['篮板', (x) => x.reb], ['前场板', (x) => x.oreb], ['后场板', (x) => x.dreb], ['助攻', (x) => x.ast], ['抢断', (x) => x.stl], ['盖帽', (x) => x.blk],
      ['失误', (x) => x.tov, null, true], ['传球', (x) => x.pass], ['潜在助攻', (x) => x.pAst], ['接球', (x) => x.catch],
    ];
    if (R0.noFT) L = L.filter((x) => x[0] !== '罚球');
    const qs = (tm) => tm.qs.map((v, i) => (i < T.q || v ? v : '-'));
    const ql = T.tm[0].qs.map((_, i) => '<th>' + (i + 1) + '</th>').join('');
    let h = '<table class="bx b5q"><thead><tr><th class="nm"></th>' + ql + '<th>总</th></tr></thead><tbody>' +
      [0, 1].map((t) => '<tr><td class="nm" style="color:' + T.tm[t].col.ui + '">' + esc(T.tm[t].name) + '</td>' + qs(T.tm[t]).map((v) => '<td>' + v + '</td>').join('') + '<td class="g0"><b>' + T.tm[t].score + '</b></td></tr>').join('') + '</tbody></table>';
    const half = Math.ceil(L.length / 2), hd = '<thead><tr><th style="color:' + c0 + '">' + esc(T.tm[0].name) + '</th><th></th><th style="color:' + c1 + '">' + esc(T.tm[1].name) + '</th></tr></thead><tbody>';
    h += '<div class="b5cw">';
    L.forEach(([n, g, d, low], k) => {
      if (k % half === 0) h += (k ? '</tbody></table>' : '') + '<table class="bx b5c"' + (k ? '' : ' data-testid="b5-cmp"') + '>' + hd;
      const a = g(A), b = g(B); let w = -1;
      if (a != null && b != null && Math.abs(a - b) > 1e-9) w = (low ? a < b : a > b) ? 0 : 1;
      const tot = (a || 0) + (b || 0), fa = d ? null : tot > 0 ? Math.round((a || 0) / tot * 100) : 50;
      const bar = fa == null ? '' : '<span class="b5cb"><i style="width:' + fa + '%;background:' + c0 + '"></i><i style="width:' + (100 - fa) + '%;background:' + c1 + '"></i></span>';
      h += '<tr><td class="' + (w === 0 ? 'g2' : '') + '">' + (d ? d(A) : a) + '</td><td class="b5cn">' + n + bar + '</td><td class="' + (w === 1 ? 'g2' : '') + '">' + (d ? d(B) : b) + '</td></tr>';
    });
    return h + '</tbody></table></div>';
  }
  // 换人页：我方在场 5 人 + 替补；先选场上一人，再选替补
  function subList() { const T = TT(); if (T.hum < 0) return []; const R = rows(T.hum); return R.on.concat(R.bn); }
  // V4.2 换人页：每人六大类均值（与选人面板 / 能力卡同一分组，main.js PH.attrG）
  const AGH = () => (PH.attrG ? (PH.attrGN || ['投篮', '终结', '组织', '运动', '防守', '篮板']).map((n) => '<span class="b5ag">' + n + '</span>').join('') : '');
  function agCells(t, key) {
    if (!PH.attrG) return '';
    const q = TT().tm[t].ros.find((x) => x.key === key), a = q && q.a; if (!a) return '<span class="b5ag"></span>'.repeat(PH.attrGN ? PH.attrGN.length : 6);
    const pl = q.p, src = pl && pl.rBase ? pl.rBase : a;
    return PH.attrG(a, src, pl).map((g) => '<span class="b5ag ' + PH.vcl(g[2]) + '">' + g[2] + '</span>').join('');
  }
  function subTab() {
    const T = TT(), t = T.hum, L = subList(), tc = T.tm[t].col.ui;
    if (S.sel >= L.length + 1) S.sel = 0;
    const row = (r, i) => '<button class="b5r' + (r.on ? ' on' : ' bn') + (S.sel === i ? ' cur' : '') + (S.pick === r.key ? ' pk' : '') + (r.pend ? ' pend' : '') + '" data-si="' + i + '" data-testid="b5-sub-' + r.key + '">' +
      '<span class="b5me">' + (r.me ? '★' : '') + '</span><span class="b5pos">' + r.pos + '</span><span class="b5n">' + esc(r.name) + '</span><span class="b5o">' + (r.ovr || '-') + '</span>' + agCells(t, r.key) + stBar(r.stam, true, r.fat) +
      '<span class="b5m">' + mmss(r.min) + '</span><span class="b5m">' + r.pts + '分</span><span class="b5tag">' + (r.pend ? '待换' : '') + '</span></button>';
    const on = L.filter((r) => r.on), bn = L.filter((r) => !r.on);
    let h = '<div class="b5sub" data-testid="b5-sub"><div class="b5sh"><span></span><span>位置</span><span style="color:' + tc + '">在场</span><span>OVR</span>' + AGH() + '<span>体力</span><span>时间</span><span>得分</span><span></span></div>';
    h += on.map((r, i) => row(r, i)).join('') + '<div class="b5sh"><span></span><span></span><span>替补</span></div>' + bn.map((r, j) => row(r, on.length + j)).join('');
    h += '<div class="b5sf"><button class="b5auto' + (S.sel === L.length ? ' cur' : '') + (T.autoSub !== false ? ' onn' : '') + '" data-si="' + L.length + '" data-testid="b5-auto">自动换人 ' + (T.autoSub !== false ? '开' : '关') + '</button></div></div>';
    return h;
  }
  function subAct(i) {
    const T = TT(), L = subList(); if (T.hum < 0) return;
    if (i === L.length) { T.autoSub = T.autoSub === false; PH.audio && PH.audio.play('ui'); render(); return; }
    const r = L[i]; if (!r) return;
    S.sel = i;
    if (r.pend && !S.pick) { if (T5().unsub) { const q = (T.subQ || []).find((s) => s.tm === T.hum && (s.out === r.key || s.in === r.key)); T5().unsub(T.hum, q ? q.out : r.key); } PH.audio && PH.audio.play('ui'); render(); return; }
    const pk = S.pick ? L.find((x) => x.key === S.pick) : null;
    if (!pk) { S.pick = r.key; }
    else if (pk.key === r.key) S.pick = null;
    else if (pk.on !== r.on) { const out = pk.on ? pk : r, inn = pk.on ? r : pk; if (T5().sub) T5().sub(T.hum, out.key, inn.key); S.pick = null; }
    else S.pick = r.key;
    PH.audio && PH.audio.play('ui'); render();
  }

  function tabs(final) {
    const T = TT(), L = [['box0', T.tm[0].name + ' Box'], ['box1', T.tm[1].name + ' Box'], ['pass0', T.tm[0].name + ' 传球'], ['pass1', T.tm[1].name + ' 传球'], ['cmp', '球队对比']];
    if (!final && T.hum >= 0) L.push(['sub', '换人']);
    return L;
  }
  function body(tab, final) {
    if (tab === 'box0') return table(0, 'box', { final: final });
    if (tab === 'box1') return table(1, 'box', { final: final });
    if (tab === 'cmp') return compare();
    if (tab === 'pass0') return table(0, 'pass', { final: final });
    if (tab === 'pass1') return table(1, 'pass', { final: final });
    if (tab === 'sub') return subTab();
    return '';
  }
  function tabBar(L, cur, attr) { return L.map((x) => '<button ' + attr + '="' + x[0] + '" class="' + (x[0] === cur ? 'on' : '') + '" data-testid="' + (attr === 'data-o5' ? 'o5' : 'b5') + 'tab-' + x[0] + '">' + esc(x[1]) + '</button>').join(''); }
  function head() {
    const T = TT(), t0 = T.tm[0], t1 = T.tm[1], q = T.q <= 4 ? '第' + T.q + '节' : '加时' + (T.q > 5 ? T.q - 4 : '');
    const c = Math.max(0, T.gclock), cl = Math.floor(Math.ceil(c) / 60) + ':' + String(Math.ceil(c) % 60).padStart(2, '0');
    const shot = T.phase === 'live' && T.sclock <= T.gclock ? String(Math.max(0, Math.ceil(T.sclock))) : T.phase === 'inb' ? '24' : '--';
    const low = T.phase === 'live' && T.sclock < 5 && T.sclock <= T.gclock;
    return '<div class="t5t" style="--tc:' + t0.col.ui + '"><span class="t5n" style="color:' + t0.col.ui + '">' + esc(t0.name) + '</span><span class="t5s">' + t0.score + '</span></div><div class="t5m"><span class="t5q">' + q + '</span><span class="t5c">' + cl + '</span><span class="shot-tab' + (low ? ' low' : '') + '">' + shot + '</span></div><div class="t5t r" style="--tc:' + t1.col.ui + '"><span class="t5s">' + t1.score + '</span><span class="t5n" style="color:' + t1.col.ui + '">' + esc(t1.name) + '</span></div>';
  }
  function render() {
    if (!S.open) return;
    const L = tabs(false); if (!L.some((x) => x[0] === S.tab)) S.tab = L[0][0];
    $('b5-head').innerHTML = head();
    $('b5-tabs').innerHTML = tabBar(L, S.tab, 'data-b5');
    $('b5-body').innerHTML = body(S.tab, false);
    $('b5-body').classList.toggle('subm', S.tab === 'sub');
  }
  function open(tab) {
    const T = TT(); if (!T || !T.tm || T.phase === 'over') return false;
    S.open = true; S.pick = null; S.sel = 0;
    if (tab) S.tab = tab; else if (S.tab === 'sub') S.tab = T.hum === 1 ? 'box1' : 'box0';
    if (S.tab === 'sub' && T.hum < 0) S.tab = 'box0';
    PH.input.endTick(); render(); $('box5').classList.remove('hidden'); PH.audio && PH.audio.play('ui');
    return true;
  }
  function close() { S.open = false; S.pick = null; $('box5').classList.add('hidden'); PH.input.endTick(); PH.audio && PH.audio.play('ui'); }
  function setTab(d) { const L = tabs(false), i = L.findIndex((x) => x[0] === S.tab); S.tab = L[(i + d + L.length) % L.length][0]; S.pick = null; PH.audio && PH.audio.play('ui'); render(); $('b5-body').scrollTop = 0; }
  function setTabId(id) { S.tab = id; S.pick = null; render(); }
  $('b5-tabs').addEventListener('click', (e) => { const b = e.target.closest('[data-b5]'); if (b) { setTabId(b.getAttribute('data-b5')); PH.audio && PH.audio.play('ui'); } });
  $('b5-body').addEventListener('click', (e) => { const b = e.target.closest('[data-si]'); if (b) subAct(+b.getAttribute('data-si')); });
  $('b5-close').addEventListener('click', () => { if (PH.box5.onClose) PH.box5.onClose(); else close(); });

  // 打开时的按键：手柄 LB/RB 切页签、B 关闭、十字键 + A 换人；键盘 ←→ 切页签、↑↓ + J 换人、Tab / Esc 关闭（关闭由 main.js 处理）
  function keys(I, k) {
    const gp = PH.input.pads()[0], P = {};
    if (gp) { const B = (i) => !!(gp.buttons[i] && gp.buttons[i].pressed); P.LB = B(4) && !S.padPrev.LB; P.RB = B(5) && !S.padPrev.RB; S.padPrev = { LB: B(4), RB: B(5) }; }
    if (P.LB || I.sysPressed('ArrowLeft') || I.sysPressed('KeyQ')) setTab(-1);
    if (P.RB || I.sysPressed('ArrowRight') || I.sysPressed('KeyE')) setTab(1);
    if (k.lf) setTab(-1); if (k.rt) setTab(1);
    if (S.tab === 'sub') {
      const n = subList().length + 1;
      const up = k.up || I.sysPressed('ArrowUp') || I.sysPressed('KeyW'), dn = k.dn || I.sysPressed('ArrowDown') || I.sysPressed('KeyS');
      if (up) { S.sel = (S.sel - 1 + n) % n; render(); } if (dn) { S.sel = (S.sel + 1) % n; render(); }
      if (k.pa || I.sysPressed('KeyJ') || I.sysPressed('Space') || I.sysPressed('Enter')) subAct(S.sel);
      const c = $('b5-body').querySelector('.cur'); if (c && (up || dn)) c.scrollIntoView({ block: 'nearest' });
    } else {
      const sb = $('b5-body'); if (k.up || I.sysPressed('ArrowUp')) sb.scrollTop -= 40; if (k.dn || I.sysPressed('ArrowDown')) sb.scrollTop += 40;
    }
  }

  // ---------- 换人提示条（2K 式：队色条「下 名字 体力% ↔ 上 名字」，2 秒淡出） ----------
  function nameOf(t, key) { const r = TT().tm[t].ros.find((x) => x.key === key); return r ? r.a.name : key; }
  function stamOf(t, key) { const r = TT().tm[t].ros.find((x) => x.key === key); return r ? Math.round(r.p ? r.p.stam : r.stam) : 0; }
  function toast(now) {
    const T = TT(), el = $('subtoast'); if (!el || !T || !T.tm) return;
    const ev = T.subEv || [];
    if (S.seen > ev.length) S.seen = 0;
    for (; S.seen < ev.length; S.seen++) {
      const e = ev[S.seen], id = e.tm + ':' + e.out + '>' + e.in;
      const ex = S.toasts.find((x) => x.id === id && now - x.t0 < 3);
      if (ex) { if (e.ph === 'done') ex.done = true; continue; }
      S.toasts.push({ id: id, t0: now, tm: e.tm, out: e.out, inn: e.in, st: stamOf(e.tm, e.out), done: e.ph === 'done' });
    }
    S.toasts = S.toasts.filter((x) => now - x.t0 < 2).slice(-6);
    // 元素按 id 复用，只改透明度（不重建 DOM，入场动画不会每帧重播）
    const keep = new Set(S.toasts.map((x) => x.id));
    for (const c of Array.prototype.slice.call(el.children)) if (!keep.has(c._id)) c.remove();
    for (const x of S.toasts) {
      let d = Array.prototype.find.call(el.children, (c) => c._id === x.id);
      if (!d) {
        const c = T.tm[x.tm].col.ui; d = document.createElement('div'); d._id = x.id; d.className = 'stt'; d.style.setProperty('--tc', c);
        d.innerHTML = '<u>' + esc(T.tm[x.tm].name) + '</u><span class="so">下 ' + esc(nameOf(x.tm, x.out)) + ' <i class="' + (x.st > 25 ? '' : 'lo') + '">' + x.st + '%</i></span><b>↔</b><span class="si">上 ' + esc(nameOf(x.tm, x.inn)) + '</span>';
        el.appendChild(d);
      }
      const a = now - x.t0, op = a > 1.5 ? Math.max(0, (2 - a) / 0.5) : 1; d.style.opacity = op.toFixed(2);
    }
  }
  function reset() { S.seen = 0; S.toasts = []; S.pick = null; S.sel = 0; S.tab = 'box0'; S.otab = 'box0'; const el = $('subtoast'); if (el) el.innerHTML = ''; }

  // ---------- 结算页：同样的页签（不含换人） ----------
  function renderOver(el, bar) {
    const L = tabs(true); if (!L.some((x) => x[0] === S.otab)) S.otab = L[0][0];
    bar.innerHTML = tabBar(L, S.otab, 'data-o5');
    el.innerHTML = body(S.otab, true);
  }
  function overTab(id, el, bar) { S.otab = id; renderOver(el, bar); }

  PH.box5 = { open: open, close: close, render: render, keys: keys, toast: toast, reset: reset, renderOver: renderOver, overTab: overTab, isOpen: () => S.open, S: S, rows: rows };
})();
