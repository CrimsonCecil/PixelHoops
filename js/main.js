// PIXEL HOOPS - 界面、HUD、训练场面板与主循环
(function () {
  const PH = window.PH, GM = PH.game, G = GM.G, R = PH.render, CFG = GM.CFG, TR = G.train;
  const $ = (id) => document.getElementById(id);
  const stage = $('stage'), canvas = $('game');
  const opts = { mode: 'cpu', diff: 1, target: 21, clock: 24, glen: 0, arch0: GM.ROSTER[(Math.random() * GM.ROSTER.length) | 0], arch1: 'random', fb: 'simple', info: 'show', home: 'LAL', away: 'BOS', qlen: 300, side: 0 };
  let scale = 2, paused = false, manual = false, screen = 'menu', last = 0, acc = 0, fps = 60, debug = /[?&]debug/.test(location.search);
  const isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  if (isTouch) document.getElementById('stage').classList.add('touch');
  const DT = 1 / 60;
  let panelOpen = true, hasPad = false;

  function layout() {
    // 铺满窗口：逻辑高度固定 270、宽度随窗口比例延展（16:9 ~ 64:27）；比 16:9 更窄时宽度固定 480、高度延展（到 4:3）
    // 超出这个范围才留最小的黑边；不吸附整数倍（画布 image-rendering: pixelated 保持像素感）
    const w = window.innerWidth, h = window.innerHeight, a = w / Math.max(1, h);
    let lw = 480, lh = 270;
    if (a >= 16 / 9) lw = Math.min(640, Math.round(270 * a / 2) * 2); else lh = Math.min(360, Math.round(480 / a / 2) * 2);
    if (R.resize(lw, lh) && screen === 'play5' && PH.render5.resize) PH.render5.resize();
    const s = Math.min(w / R.W, h / R.H);
    scale = s;
    stage.style.width = Math.round(R.W * s) + 'px'; stage.style.height = Math.round(R.H * s) + 'px';
    document.documentElement.style.setProperty('--u', s + 'px');
    // V4.5 徽章图标 9×9 像素按整数倍放大：弹出 --bpx（约为原来 1.5 倍）、信息卡 / 能力卡 --bps
    document.documentElement.style.setProperty('--bpx', Math.max(3, Math.round(s * 1.25)) + 'px');
    document.documentElement.style.setProperty('--bps', Math.max(2, Math.round(s * 0.75)) + 'px');
    document.documentElement.style.setProperty('--bpk', Math.max(2, Math.round(s)) + 'px');
    camShift();
  }
  window.addEventListener('resize', layout);
  const narrow = () => window.innerWidth <= 700 || window.innerHeight <= 420;
  function camShift() {
    if (screen === 'menu') G.camShift = narrow() ? 0 : -3.6;
    else G.camShift = 0; // 训练场参数面板开关不改镜头
  }

  // ---------- 菜单 ----------
  // 随机对手：洗牌袋（不抽到自己选的人，一轮内不重复）
  let bag = [], lastRnd = null;
  function pickArch(v, own) {
    if (v !== 'random') return v;
    bag = bag.filter((k) => k !== own);
    if (!bag.length) { bag = GM.ROSTER.filter((k) => k !== own); for (let i = bag.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; const t = bag[i]; bag[i] = bag[j]; bag[j] = t; } if (bag.length > 1 && bag[bag.length - 1] === lastRnd) bag.unshift(bag.pop()); }
    return (lastRnd = bag.pop());
  }
  window.__pickArch = pickArch; window.__portrait = (cv, k, side) => portrait(cv, GM.ARCH[k], GM.TEAMS[side || 0]);
  // ---------- 球员选择 ----------
  const A99 = (v) => Math.round(v * 99);
  function portrait(cv, a, team) {
    const c = cv.getContext('2d'), W = cv.width, k = W / 32;
    c.imageSmoothingEnabled = false; c.clearRect(0, 0, W, cv.height);
    const look = GM.lookOf(a), T = team || GM.TEAMS[0];
    const shoulder = look.body ? look.body.shoulder : 1;
    const sw = Math.min(31, 24 * shoulder) * k, neck = Math.min(12, 7.5 * shoulder) * k;
    c.fillStyle = T.jersey; c.fillRect(Math.round((W - sw) / 2), Math.round(26 * k), Math.round(sw), Math.round(6 * k));
    c.fillStyle = T.trim; c.fillRect(Math.round((W - neck) / 2 - k), Math.round(25 * k), Math.round(neck + 2 * k), Math.round(4 * k));
    c.fillStyle = look.skin[0]; c.fillRect(Math.round((W - neck) / 2), Math.round(20 * k), Math.round(neck), Math.round(7 * k));
    c.fillStyle = T.trim; c.font = 'bold ' + Math.round(3.6 * k) + 'px monospace'; c.textAlign = 'center';
    c.fillText(String(a.num == null ? '' : a.num), W / 2, 31.6 * k);
    const eyeY = R.drawHead(c, look, W / 2, 14 * k, 17 * k, -Math.PI / 2) / k;
    return { eyeY };
  }
  const IC = PH.icons, TT = { star: 'S', mid: 'A', avg: 'B', rook: 'C' };
  // 装备品质属性档位：灰 <55、白 55+、绿 64+、蓝 72+、紫 80+、橙 88+、金 95+
  const vcl = (v) => v >= 95 ? 'rating-gold' : v >= 88 ? 'rating-orange' : v >= 80 ? 'rating-purple' : v >= 72 ? 'rating-blue' : v >= 64 ? 'rating-green' : v >= 55 ? 'rating-white' : 'rating-grey';
  const tg = (v01) => GM.grade(v01)[0];
  // V4.5 选人能力卡徽章：和比赛中同一套六边形图标，按档位配色（铜 / 银 / 金 / 名人堂，不写档位字）
  const badgeHtml = (k, full, t) => { const B = GM.BADGES[k]; return '<div class="bdg tr' + (t || 3) + '">' + bHex(k, t) + (full ? '<div><b>' + B.name + (B.five ? '<sup>5V5</sup>' : '') + '</b><span>' + B.desc + '</span></div>' : '<b>' + B.name + '</b>') + '</div>'; };
  let pkSide = 0, pkSel = 'curry';
  const listedHeight = (a) => (PH.measurements && PH.measurements[a.key] ? PH.measurements[a.key][0] * 0.0254 : a.h).toFixed(2);
  function pkCard(key) {
    if (key === 'random') return '<button class="pkc rnd" data-pk="random" data-testid="pk-random"><span class="pkf q">?</span><span class="pkn">随机</span><span class="pkp">任意球员</span></button>';
    const a = GM.ARCH[key];
    return '<button class="pkc t' + TT[a.tier] + '" data-pk="' + key + '" data-testid="pk-' + key + '"><canvas class="pkf" width="32" height="32"></canvas><span class="pkn">' + a.name + (a.skill ? '<i class="pkst">' + IC.svg('takeover') + '</i>' : '') + '</span><span class="pkp">' + a.pos + '<small class="pkh"> · ' + listedHeight(a) + '</small></span><span class="pko">' + a.ovr + '</span></button>';
  }
  const LTIP = { normal: 'lay' };
  let pkShown = '';
  // 热区小地图：12 区，红 = 致命 / 橙 = 热 / 灰 = 普通 / 蓝 = 冷
  function hzMap(a) {
    const B = GM.hzBase(a), C = { '-1': '#3a6fd8', 0: '#3a3f58', 1: '#ff8a2a', 2: '#ff3b2f' }, cx = 80, cy = 14, S = 9.5;
    const P = (x, y) => [cx + x * S, cy + (14 - y) * S];
    let cells = '';
    for (let x = -7.5; x < 7.5; x += 0.5) for (let y = 4.5; y < 14; y += 0.5) { const z = GM.zoneOf(x + 0.25, y + 0.25), p = P(x, y + 0.5); cells += '<rect x="' + p[0].toFixed(1) + '" y="' + p[1].toFixed(1) + '" width="' + (S * 0.5 + 0.3).toFixed(1) + '" height="' + (S * 0.5 + 0.3).toFixed(1) + '" fill="' + C[B[z] || 0] + '"/>'; }
    const hp = P(0, 12.425), arc = []; const a0 = Math.asin(6.6 / 6.75); for (let i = 0; i <= 24; i++) { const t = -a0 + 2 * a0 * i / 24, p = P(Math.sin(t) * 6.75, 12.425 - Math.cos(t) * 6.75); arc.push(p.map((v) => v.toFixed(1)).join(',')); }
    const c1 = P(-6.6, 14), c2 = P(6.6, 14), cA = P(-6.6, 12.425 - Math.cos(a0) * 6.75), cB = P(6.6, 12.425 - Math.cos(a0) * 6.75), k1 = P(-2.45, 14), k2 = P(2.45, 8.2);
    const lines = '<polyline fill="none" stroke="#e8e2cc" stroke-width="1" points="' + [c1.join(','), cA.join(',')].concat(arc).concat([cB.join(','), c2.join(',')]).join(' ') + '"/><rect x="' + k1[0] + '" y="' + k1[1].toFixed(1) + '" width="' + (k2[0] - k1[0]).toFixed(1) + '" height="' + (k2[1] - k1[1]).toFixed(1) + '" fill="none" stroke="#e8e2cc" stroke-width="1"/><circle cx="' + hp[0] + '" cy="' + hp[1] + '" r="2.4" fill="none" stroke="#ff8a2a" stroke-width="1.2"/>';
    const L = GM.HZ.filter((z) => (B[z] || 0) > 0).sort((x, y) => B[y] - B[x]).map((z) => '<span class="hz' + B[z] + '">' + GM.HZN[z] + '</span>').join('');
    return '<div class="pkhz"><svg viewBox="0 0 160 110" width="160" height="110" shape-rendering="crispEdges">' + cells + lines + '</svg><div><em>热区</em>' + (L || '<span>无</span>') + '</div></div>';
  }
  // V4.2 属性分组（参考 2K 六大类）：只列游戏里真实使用的字段；第三项 1 = 5V5 专用能力（js/r5.js，取自 2K），没有数据的球员不显示该项
  const AGRP = [
    ['投篮', '投篮', [['close', '近距离'], ['mid', '中投'], ['three', '三分'], ['fade', '后仰'], ['siq', '投篮 IQ', 1]]],
    ['终结', '终结', [['lay', '上篮'], ['flo', '抛投'], ['dunk', '扣篮'], ['sdunk', '站扣'], ['post', '低位'], ['hook', '勾手']]],
    ['组织', '组织', [['hnd', '控球'], ['pac', '传球准度', 1], ['piq', '传球 IQ', 1], ['vis', '传球视野', 1], ['iq', '球商', 1], ['hands', '接球', 1]]],
    ['运动', '运动', [['spd', '速度'], ['acc', '加速'], ['str', '力量'], ['vert', '弹跳'], ['sta', '体力']]],
    ['防守', '防守', [['def', '外防'], ['intD', '内防'], ['stl', '抢断'], ['blk', '盖帽'], ['hlp', '协防 IQ', 1], ['ppc', '传球预判', 1]]],
    ['篮板', '篮板', [['oreb', '前场板'], ['dreb', '后场板']]],
  ];
  const R5TIP = { siq: '5V5：出手选择（少投坏球）与接球投篮', hands: '5V5：接球稳定，低了容易漏接', pac: '5V5：传球速度与落点准确，越准越难被截', piq: '5V5：读秒快慢、避开被卡的传球线路', vis: '5V5：发现空位队友、长传与跳传', iq: '5V5：无球跑动、空切与拉开站位', hlp: '5V5：协防补位与换防判断', ppc: '5V5：预判传球、截传范围' };
  function r5Raw(a, pl) { const R = PH.R5, row = R && a && R.P[a.key]; if (!row) return null; if (pl && pl.r5 && pl.r5.raw) return pl.r5.raw; const o = {}; R.F.forEach((f, i) => { o[f] = row[i]; }); return o; }
  // [[组名, 短名, 组均值, [[键, 名, 0~99, 5V5 专用], ...]], ...]；src = 1V1 属性（arch 或场上 pl.r），pl = 5V5 场上球员（带球队加成的 2K 能力）
  function attrGroups(a, src, pl) {
    const R = r5Raw(a, pl);
    return AGRP.map(([g, gs, L]) => {
      const rows = [];
      for (const [k, n, f5] of L) { const v = f5 ? (R && R[k] != null ? Math.round(R[k]) : null) : (typeof src[k] === 'number' ? A99(src[k]) : null); if (v != null) rows.push([k, n, Math.max(0, Math.min(99, v)), !!f5]); }
      return [g, gs, rows.length ? Math.round(rows.reduce((t, x) => t + x[2], 0) / rows.length) : null, rows];
    });
  }
  PH.attrG = attrGroups; PH.vcl = vcl;
  // 球员详情分页（参考 2K：概览 / 属性六大类 / 徽章四大类 / 动作与热区）；LB·RB 或点页签切换，右摇杆上下滚动
  const PK_TABS = [['ov', '概览'], ['at', '属性'], ['bd', '徽章'], ['mv', '动作 · 热区']];
  const BCAT = [['终结', ['acrobat', 'poster', 'launch', 'bully', 'dream']], ['投篮', ['limitless', 'deadeye', 'quick', 'clutch', 'fade', 'stepper', 'cs']], ['组织', ['ankle', 'tight', 'dimer', 'needle', 'bailout', 'breaker', 'postpm']], ['防守 / 篮板', ['rim', 'pick', 'clamps', 'motor', 'hustle', 'brick', 'dodger', 'intercept', 'anchor', 'chaser', 'boxout']]];
  let pkTab = 'ov';
  function pkTabStep(d) { const i = PK_TABS.findIndex((t) => t[0] === pkTab); pkTab = PK_TABS[(i + d + PK_TABS.length) % PK_TABS.length][0]; pkDetail(pkShown || pkSel); $('pk-detail').scrollTop = 0; PH.audio.play('ui'); }
  function pkDetail(key) {
    const el = $('pk-detail'), sc = key === pkShown ? el.scrollTop : 0; pkShown = key;
    if (key === 'random') { el.innerHTML = '<div class="pkd-h"><b>随机对手</b></div><p class="tnote">每局开赛重新抽一位（不会抽到你自己选的人，一轮之内不重复）。</p>'; return; }
    const a = GM.ARCH[key];
    const tm = a.team && GM.NBA[a.team], tmS = tm ? (a.team === 'LEG' ? '传奇' : tm.city + tm.name) + ' · ' : a.tier === 'rook' ? '新秀 · ' : '';
    let h = '<div class="pkd-h"><canvas class="pkf big" width="64" height="64"></canvas><div><b>' + a.full + '</b><span>' + tmS + a.pos + ' · ' + listedHeight(a) + ' 米 · ' + a.num + ' 号</span><span class="pkd-desc">' + a.desc + '</span></div><em class="t' + TT[a.tier] + '">' + a.ovr + '<small>' + GM.TIERS[a.tier] + '</small></em></div>';
    const pt = PH.PT.of(a);
    h += '<p class="pkform" data-testid="ptype"><canvas width="' + PH.PT.SIZE + '" height="' + PH.PT.SIZE + '" data-ptype="' + pt.id + '" style="width:26px;height:26px;image-rendering:pixelated;vertical-align:middle"></canvas> ' + pt.name + '</p>';
    h += '<div class="pkd-tabs" data-testid="pk-tabs">' + PK_TABS.map((t) => '<button data-nonav="1" data-pkt="' + t[0] + '" class="' + (t[0] === pkTab ? 'on' : '') + '" data-testid="pkt-tab-' + t[0] + '">' + t[1] + '</button>').join('') + '<span class="pkd-lr">LB</span><span class="pkd-lr r">RB</span></div>';
    const bar = (n, v, tip) => { const cl = vcl(v); return '<div class="pkr"' + (tip ? ' title="' + tip + '"' : '') + '><span>' + n + '</span><i><s class="' + cl + '" style="width:' + v + '%"></s></i><b class="' + cl + '">' + v + '</b></div>'; };
    const AT = {}; GM.ATTRS.forEach((t) => { AT[t[0]] = t[2]; }); Object.assign(AT, R5TIP);
    const AG = attrGroups(a, a), bl = bList(a, true), have = {}; bl.forEach((x) => { have[x[0]] = x[1]; });
    if (pkTab === 'ov') {
      h += '<div class="rating-legend" aria-label="属性颜色分档">' + [[95, '金 95+'], [88, '橙 88+'], [80, '紫 80+'], [72, '蓝 72+'], [64, '绿 64+'], [55, '白 55+'], [0, '灰 &lt;55']].map(([v, n]) => '<span class="' + vcl(v) + '">' + n + '</span>').join('') + '</div>';
      h += '<div class="pkov" data-testid="pk-ov">' + AG.map(([g, gs, v]) => '<div class="pko1"><span>' + g + '</span><b class="' + vcl(v) + '">' + v + '</b></div>').join('') + '</div>';
      { const F = GM.SF[a.form] || GM.SF.std, sp = F.sp <= 0.85 ? '极快' : F.sp <= 0.92 ? '快' : F.sp <= 1.04 ? '中等' : F.sp <= 1.15 ? '偏慢' : '慢', hi = F.blk <= 0.85 ? '高' : F.blk >= 1.1 ? '低' : '中'; h += '<p class="pkform">投篮包 <b>' + F.name + '</b>' + (a.lefty ? ' · 左手' : '') + ' · 出手 ' + sp + ' · 出手点 ' + hi + (F.two ? ' · 两段式' : ' · 一段式') + '</p>'; }
      { const K = GM.dunkPkg(a), N = { two: '双手', one: '单手', rimpull: '挂筐', reverse: '背扣', tomahawk: '战斧', poster: '隔扣', cock: '拉弓', windmill: '风车', '360': '360', glide: '滑翔', cradle: '摇篮', pump: '双抽', scissor: '剪刀腿', shaq: '大鲨鱼' }, L = Object.keys(N).filter((k) => K.S[k]).map((k) => N[k]);
        h += '<p class="pkform">扣篮包 <b>' + K.name + '</b> · ' + (L.length ? L.join(' / ') : '以上篮为主') + '</p>'; }
      { const ms = GM.moveSet({ r: a, arch: a }); h += '<p class="pkform">运球包 <b>' + ms.pk.name + '</b> · ' + ms.pk.desc + '</p>'; }
      h += '<div class="pkbrow">' + (bl.length ? bl.map((x) => '<span class="tr' + x[1] + '" title="' + GM.BADGES[x[0]].name + '">' + bHex(x[0], x[1]) + '</span>').join('') : '<span class="none">无徽章</span>') + '</div>';
      if (a.skill) h += '<div class="pks' + (GM.TIPS['sk-' + key] ? ' tip" data-ptip="sk-' + key + '" data-tn="必杀技 · ' + a.skill.name + '"' : '"') + '><div class="pks-h"><b>必杀技 · ' + a.skill.name + (GM.TIPS['sk-' + key] ? IC.svg('play', 'tpl') : '') + '</b><span>' + a.skill.en + '</span></div><p><em>条件</em>' + a.skill.cond + '</p><p><em>效果</em>' + a.skill.eff + '</p></div>';
      else h += '<div class="pks none"><p>只有球星有必杀技。</p></div>';
    } else if (pkTab === 'at') {
      h += '<div class="agrp" data-testid="pk-attrs">' + AG.map(([g, gs, v, L]) => '<div class="ag"><h4><span>' + g + '</span><b class="' + vcl(v) + '">' + v + '</b></h4><div class="pka">' + L.map((x) => bar(x[1] + (x[3] ? '<sup>5V5</sup>' : ''), x[2], AT[x[0]])).join('') + '</div></div>').join('') + '</div>';
    } else if (pkTab === 'bd') {
      const seen = {};
      h += '<div data-testid="pk-badges">' + BCAT.map(([cn, ks]) => { const own = ks.filter((k) => GM.BADGES[k] && have[k]); own.forEach((k) => { seen[k] = 1; }); return '<h4 class="pkbh"><span>' + cn + '</span><b>' + own.length + '</b></h4>' + (own.length ? '<div class="pkb">' + own.map((k) => badgeHtml(k, true, have[k])).join('') + '</div>' : '<p class="pkno">无</p>'); }).join('');
      const rest = Object.keys(have).filter((k) => !seen[k] && GM.BADGES[k]); if (rest.length) h += '<h4 class="pkbh"><span>其他</span><b>' + rest.length + '</b></h4><div class="pkb">' + rest.map((k) => badgeHtml(k, true, have[k])).join('') + '</div>';
      h += '</div>';
    } else {
      const ms = GM.moveSet({ r: a, arch: a }), chip = (x) => { const t = x[1] ? tg(x[4]) : 'X'; const tid = LTIP[x[3]] || x[3], tp = GM.TIPS[tid] ? ' data-ptip="' + tid + '" data-tn="' + x[0] + '"' : ''; return '<span class="mvc t' + t + (x[1] ? '' : ' no') + (tp ? ' tip' : '') + '"' + tp + ' title="' + (x[5] ? x[5] + ' · ' : '') + (x[1] ? '熟练度 ' + Math.round(x[4] * 99) : '需要 ' + x[2]) + (x[6] ? ' · ' + x[6] : '') + '">' + IC.svg(x[1] ? x[3] : 'lock') + x[0] + (x[1] ? '<sup>' + t + '</sup>' : '') + (tp ? IC.svg('play', 'tpl') : '') + '</span>'; };
      h += '<p class="pkform">运球包 <b>' + ms.pk.name + '</b> · ' + ms.pk.desc + '</p>';
      h += '<div class="pkmv"><div><em>运球</em>' + ms.mv.map(chip).join('') + '</div><div><em>上篮</em>' + ms.lay.map(chip).join('') + '</div></div>';
      h += hzMap(a);
    }
    el.innerHTML = h; el.scrollTop = sc;
    const ptCanvas = el.querySelector('[data-ptype]');
    if (ptCanvas) PH.PT.draw(ptCanvas.getContext('2d'), pt.id, 0, 0);
    const fc = el.querySelector('canvas'); if (fc) portrait(fc, a, GM.TEAMS[pkSide]);
  }
  function pkMark() { $('pk-grid').querySelectorAll('.pkc').forEach((b) => b.classList.toggle('on', b.getAttribute('data-pk') === pkSel)); }
  // V3.2：按球队筛选（全部 = 按档位分组）
  let pkTeam = 'all';
  function pkTeams() {
    const N = GM.NBA || {}, ks = Object.keys(N).filter((k) => k !== 'LEG').sort((x, y) => N[x].name.localeCompare(N[y].name, 'zh-Hans-u-co-pinyin'));
    const chip = (v, t, col) => '<button class="pkt' + (pkTeam === v ? ' on' : '') + '" data-tm="' + v + '" data-testid="pkt-' + v + '">' + (col ? '<i style="background:' + col + '"></i>' : '') + t + '</button>';
    $('pk-teams').innerHTML = chip('all', '全部') + ks.map((k) => chip(k, N[k].name, N[k].jersey)).join('') + (N.LEG ? chip('LEG', '传奇', N.LEG.jersey) : '') + chip('rook', '新秀');
    $('pk-teams').classList.toggle('hidden', !ks.length);
  }
  function pkFill() {
    let gh = pkSide ? pkCard('random') : '';
    if (pkTeam === 'all') { for (const t of Object.keys(GM.TIERS)) { const ks = GM.ROSTER.filter((k) => GM.ARCH[k].tier === t); if (ks.length) gh += '<div class="pk-tier t' + TT[t] + '"><i>' + TT[t] + '</i>' + GM.TIERS[t] + '</div>' + ks.map(pkCard).join(''); } }
    else gh += GM.ROSTER.filter((k) => pkTeam === 'rook' ? GM.ARCH[k].tier === 'rook' : GM.ARCH[k].team === pkTeam).map(pkCard).join('');
    $('pk-grid').innerHTML = gh; $('pk-grid').scrollTop = 0;
    $('pk-grid').querySelectorAll('canvas.pkf').forEach((cv) => portrait(cv, GM.ARCH[cv.parentElement.getAttribute('data-pk')], GM.TEAMS[pkSide]));
    pkMark();
  }
  $('pk-teams').addEventListener('click', (e) => { const b = e.target.closest('.pkt'); if (!b) return; pkTeam = b.getAttribute('data-tm'); $('pk-teams').querySelectorAll('.pkt').forEach((x) => x.classList.toggle('on', x === b)); pkFill(); PH.audio.play('ui'); });
  function openPicker(side) {
    pkSide = side; pkSel = side ? opts.arch1 : opts.arch0;
    $('pk-title').textContent = side ? (opts.mode === '2p' ? '选择玩家 2 的球员' : opts.mode === 'train' ? '选择训练对手' : '选择对手') : opts.mode === '2p' ? '选择玩家 1 的球员' : '选择你的球员';
    pkTeams(); pkFill(); pkDetail(pkSel); clearPf(); show('picker', true);
    const cur = $('pk-grid').querySelector('.pkc.on'); if (cur) { cur.classList.add('pf'); cur.scrollIntoView({ block: 'nearest' }); }
    PH.audio.play('ui');
  }
  function closePicker(ok) {
    if (ok) { if (pkSide) opts.arch1 = pkSel; else opts.arch0 = pkSel; }
    show('picker', false); clearPf(); refreshMenu(); PH.audio.play('ui');
    const b = $(pkSide ? 'pick1' : 'pick0'); if (b) b.classList.add('pf');
  }
  $('pk-grid').addEventListener('click', (e) => { const b = e.target.closest('.pkc'); if (!b) return; const k = b.getAttribute('data-pk'); if (k === pkSel && e.detail >= 2) { closePicker(true); return; } pkSel = k; pkMark(); pkDetail(k); PH.audio.play('ui'); });
  $('pk-grid').addEventListener('mouseover', (e) => { const b = e.target.closest('.pkc'); if (b) pkDetail(b.getAttribute('data-pk')); });
  $('pk-grid').addEventListener('mouseleave', () => pkDetail(pkSel));
  $('pk-ok').addEventListener('click', () => closePicker(true));
  $('pk-cancel').addEventListener('click', () => closePicker(false));
  $('pick0').addEventListener('click', () => openPicker(0));
  $('pick1').addEventListener('click', () => openPicker(1));
  function pickBtn(id, key) {
    const el = $(id);
    if (key === 'random') { el.className = 'pick'; el.innerHTML = '<span class="pkf q">?</span><span class="pk-n">随机</span><span class="pk-s">任意球员</span><span class="pk-c">更换</span>'; return; }
    const a = GM.ARCH[key];
    el.className = 'pick t' + TT[a.tier]; el.innerHTML = '<canvas class="pkf" width="32" height="32"></canvas><span class="pk-n">' + a.name + ' <small>' + a.ovr + '</small></span><span class="pk-s">' + (a.skill ? '必杀技 · ' + a.skill.name : a.pos + ' · ' + GM.TIERS[a.tier]) + '</span><span class="pk-c">更换</span>';
    portrait(el.querySelector('canvas'), a, GM.TEAMS[id === 'pick0' ? 0 : 1]);
  }
  function refreshMenu() {
    document.querySelectorAll('#menu .seg').forEach((seg) => {
      const k = seg.getAttribute('data-opt');
      seg.querySelectorAll('button').forEach((b) => b.classList.toggle('on', String(opts[k]) === b.getAttribute('data-v')));
    });
    const tr = opts.mode === 'train', t5 = opts.mode === 't5';
    $('row-diff').classList.toggle('hidden', opts.mode !== 'cpu' && !t5);
    for (const id of ['row-fb', 'row-p1', 'row-p2']) $(id).classList.toggle('hidden', t5);
    for (const id of ['row-qlen', 'row-teams', 'row-side']) $(id).classList.toggle('hidden', !t5);
    if (t5) { refresh5(); $('row-target').classList.add('hidden'); $('row-clock').classList.add('hidden'); $('row-glen').classList.add('hidden'); return; }
    $('row-target').classList.toggle('hidden', tr); $('row-clock').classList.toggle('hidden', tr); $('row-glen').classList.toggle('hidden', tr);
    $('lab-p1').textContent = opts.mode === '2p' ? '玩家 1' : '你的球员';
    $('lab-p2').textContent = opts.mode === '2p' ? '玩家 2' : tr ? '假人体型' : '对手';
    $('btn-start').textContent = tr ? '进入训练场' : '开始比赛';
    $('menu-foot').textContent = tr ? '训练场：无比分无时限，可设置假人防守方式，并现场调整球员能力和判定参数。' : '规则：2 分 / 3 分，先到目标分且领先 2 分获胜，失分方球权，抢到对方的球要先带出三分线。';
    const a = GM.ARCH[opts.arch0];
    pickBtn('pick0', opts.arch0); pickBtn('pick1', opts.arch1);
    $('arch-desc').textContent = a.full + '：' + a.desc + (a.skill ? '。必杀技「' + a.skill.name + '」，条件和效果见“更换”。' : '。');
  }
  document.querySelectorAll('#menu .seg button').forEach((b) => b.addEventListener('click', () => {
    const k = b.parentElement.getAttribute('data-opt'), v = b.getAttribute('data-v');
    opts[k] = k === 'diff' || k === 'target' || k === 'clock' || k === 'glen' || k === 'qlen' || k === 'side' ? +v : v; if (k === 'fb') { cardId = -1; }
    PH.audio.play('ui'); refreshMenu();
  }));

  function show(id, on) { $(id).classList.toggle('hidden', !on); }
  function clearPf() { document.querySelectorAll('.pf').forEach((e) => e.classList.remove('pf')); }
  function startDemo() { GM.newGame({ mode: 'demo', arch0: 'curry', arch1: 'lebron', target: 11 }); }
  function toMenu() {
    tuneClose();
    screen = 'menu'; paused = false; clearPf(); camOpen = false; camFromSet = false; show('campanel', false); pcards();
    show('menu', true); show('picker', false); show('cutin', false); show('hud', false); show('pause', false); show('over', false); show('help', false); show('touch', false); show('banner', false); show('train', false); show('shotcard', false); stage.classList.remove('panel');
    if (PH.T5) { PH.T5.stop(); PH.render5.restore(); } show('hud5', false); show('over5', false); show('tpicker', false); show('btn-cam', true); show('btn-disp', true); show('btn-box5', false); if (PH.box5 && PH.box5.isOpen()) PH.box5.close();
    startDemo(); camShift();
  }
  let lastArch = null;
  function startMatch(same) {
    tuneClose();
    PH.audio.ensure(); PH.audio.play('start'); PH.audio.startMusic();
    if (opts.mode === 't5') { start5(); return; }
    if (PH.T5) { PH.T5.stop(); PH.render5.restore(); } show('hud5', false); show('over5', false); show('btn-cam', true); show('btn-disp', true); show('btn-box5', false); if (PH.box5 && PH.box5.isOpen()) PH.box5.close();
    if (!same || !lastArch || opts.arch1 === 'random') lastArch = { a0: opts.arch0, a1: pickArch(opts.arch1, opts.arch0) };
    const tr = opts.mode === 'train';
    if (!tr) CFG.shotClock = opts.clock;
    GM.newGame({ mode: opts.mode, diff: opts.diff, target: opts.target, arch0: lastArch.a0, arch1: lastArch.a1, fb: opts.fb, glen: opts.glen });
    PH.audio.voPreload(G.players.map((p) => p.arch.key));
    screen = 'play'; paused = false; PH.input.clearSys(); clearPf();
    show('menu', false); show('picker', false); show('pause', false); show('over', false); show('help', false); show('hud', true); show('touch', isTouch); show('shotcard', false);
    show('scorebar', !tr); show('trainbar', tr); show('btn-panel', tr);
    panelOpen = tr && !narrow(); show('train', panelOpen); stage.classList.toggle('panel', panelOpen); camShift();
    if (tr) { trTab = 'dummy'; buildPanel(); }
    const p = G.players;
    $('n0').textContent = (opts.mode === '2p' ? '玩家 1 · ' : '你 · ') + p[0].arch.name;
    $('n1').textContent = (opts.mode === '2p' ? '玩家 2 · ' : '电脑 · ') + p[1].arch.name;
    $('target').textContent = '先到 ' + G.target + ' 分';
    $('btn-restart').textContent = tr ? '重置训练' : '重新开始'; $('btn-resume').textContent = tr ? '继续训练' : '继续比赛';
    hintKey = ''; cardId = -1; lastClock = ''; lastTB2 = ''; pcards();
  }
  function setPause(on) { if (screen === 'play5') { if (PH.T5.T.phase === 'over') return; if (PH.box5.isOpen()) { PH.box5.close(); b5Pause = false; } } else if (screen !== 'play' || G.phase === 'over') return; paused = on; clearPf(); setView('main'); show('pause', on); if (!on) show('help', false); }
  // 设置菜单：一级（继续/镜头/声音/显示/说明/重开/退出），二级（声音、显示）
  let setV = 'main';
  function setView(v) {
    setV = v; for (const k of ['main', 'sound', 'disp', 'cam5']) show('set-' + k, k === v);
    // 5V5 的显示设置只有球员信息和配音（投篮反馈/回放/特写/热区是 1V1 的）
    for (const id of ['btn-fb', 'btn-replay', 'btn-close', 'btn-hz']) show(id, screen !== 'play5');
    $('set-title').textContent = v === 'sound' ? '声音' : v === 'disp' ? '显示' : v === 'cam5' ? '镜头' : '设置'; setLabels(); if (v === 'cam5') cam5Labels(); clearPf();
  }
  function setLabels() {
    $('btn-music').textContent = '音乐 ' + (PH.audio.musicOn ? '开' : '关');
    $('btn-sfx').textContent = '音效 ' + (PH.audio.sfxOn ? '开' : '关');
    $('btn-info').textContent = '球员信息 ' + (opts.info === 'show' ? '显示' : '隐藏');
    $('btn-fb').textContent = '投篮反馈 ' + (opts.fb === 'detail' ? '详细' : '精简');
    $('btn-replay').textContent = '精彩回放 ' + (G.vopt.replay ? '开' : '关');
    $('btn-close').textContent = '特写镜头 ' + (G.vopt.close ? '开' : '关');
    $('btn-hz').textContent = '热区显示 ' + (G.vopt.hz !== false ? '开' : '关');
    $('btn-vo').textContent = '球员配音 ' + (PH.audio.voOn ? '开' : '关');
  }
  function togglePanel(on) { if (screen !== 'play' || G.mode !== 'train') return; panelOpen = on == null ? !panelOpen : on; show('train', panelOpen); stage.classList.toggle('panel', panelOpen); camShift(); if (panelOpen) buildPanel(); }

  // ---------- 操作说明（竖排：动作 → 按键） ----------
  const K = (t, c) => '<kbd' + (c ? ' class="' + c + '"' : '') + '>' + t + '</kbd>';
  const or = '<span>或</span>';
  const HELP = {
    k1: { move: K('W') + K('A') + K('S') + K('D'), sprint: K('左 Shift'), a1: K('J') + or + K('空格'), a2: K('K'), a3: K('L'), post: K('Q'), pause: K('Esc') + or + K('P'), music: K('M') },
    k2: { move: K('↑') + K('←') + K('↓') + K('→'), sprint: K('小键盘 0') + or + K('右 Shift'), a1: K('小键盘 1') + or + K(','), a2: K('小键盘 2') + or + K('.'), a3: K('小键盘 3') + or + K('/'), post: K('O'), pause: K('Esc'), music: K('M') },
    pad: { move: K('左摇杆', 'g'), sprint: K('RT', 'g'), a1: K('X', 'x'), a2: K('Y', 'y'), a3: K('A', 'a'), a3r: K('A', 'a') + or + K('拨右摇杆', 'g'), post: K('LT', 'g'), blk: K('Y', 'y'), stl: K('X', 'x'), stance: K('LT', 'g'), pause: K('Menu ≡', 'g'), music: '<span>键盘 M</span>' },
  };
  // 说明行：有演示的动作后面带“演示”按钮
  const TIPN = { 体前变向: 'cross', 胯下运球: 'legs', 背后运球: 'behind', 内外假晃: 'inout', 转身过人: 'spin', 后撤步: 'stepback', 犹豫步: 'hesi', 双重变向: 'dbl', 遛狗过人: 'sham', 拽回后撤: 'snatch', 犹豫爆发: 'hgo',
    定点跳投: 'set', 急停跳投: 'pullup', 漂移跳投: 'drift', 后仰跳投: 'fade', 后撤步跳投: 'sbshot', 假动作: 'pump', 冲刺扣篮: 'sdunk', 三步上篮: 'lay', 跳步上篮: 'hop', 欧洲步: 'euro', 抛投: 'floater', 顶人: 'post', 勾手: 'hook', 背身后仰: 'postfade' };
  const tipB = (id, nm, ds) => GM.TIPS[id] ? '<button class="tipb" data-tip="' + id + '" data-tn="' + nm + '" data-td="' + String(ds).replace(/<[^>]+>/g, '').replace(/"/g, '') + '" data-testid="tip-' + id + '">' + IC.svg('play', 'hi') + '演示</button>' : '';
  // 帮助面板里徽章说明的措辞（覆盖 game.js 的简短描述）
  // V3.9o 5V5 徽章说明（数值依次为 铜 / 银 / 金 / 名人堂）
  const BDESC = {
    cs: '接球 0.6 秒内出手，命中 +2 / 3.5 / 5.5 / 7.5%，绿区 +8 / 14 / 20 / 27%，出手提前 0.02 / 0.035 / 0.05 / 0.065 秒。战术跑出、掩护后或空位接球时再加成',
    dimer: '队友接到你的传球后 1.5 秒内跳投或上篮，命中 ×1.02 / 1.035 / 1.05 / 1.07，绿区 ×1.06 / 1.10 / 1.15 / 1.21',
    needle: '你的传球被截概率 ×0.88 / 0.80 / 0.70 / 0.60，防守人够球范围 ×0.95 / 0.92 / 0.88 / 0.84',
    bailout: '跳传和突破分球的落点误差 ×0.75 / 0.6 / 0.45 / 0.3，被截概率 ×0.85 / 0.75 / 0.65 / 0.55',
    breaker: '抢到防守篮板或抢断后 3 秒内传出 10 米以上的长传，球速 +8 / 12 / 16 / 22%，误差 ×0.7 / 0.55 / 0.4 / 0.25，被截 ×0.8 / 0.7 / 0.6 / 0.5',
    postpm: '背打中（或背身接球后）传出，被截 ×0.8 / 0.7 / 0.6 / 0.5；接球人 1.5 秒内出手，命中 ×1.02 / 1.03 / 1.045 / 1.06，绿区 ×1.05 / 1.08 / 1.12 / 1.16',
    brick: '掩护撞击分数 ×1.12 / 1.2 / 1.3 / 1.42（更容易挡出“好掩护”或“挡倒”），你被撞的晃动减半',
    dodger: '被掩护时撞击分数 ×0.9 / 0.83 / 0.75 / 0.67，被挡时间同比例缩短',
    intercept: '截传够球范围 ×1.06 / 1.1 / 1.15 / 1.2，截下概率 ×1.12 / 1.2 / 1.3 / 1.4',
    anchor: '对手在离筐 3 米内终结、你在他 2.5 米内（协防也算）时，干扰 ×1.06 / 1.1 / 1.15 / 1.2，被盖概率 ×1.1 / 1.17 / 1.25 / 1.35',
    chaser: '投篮篮板的抓取范围 ×1.06 / 1.1 / 1.15 / 1.2',
    boxout: '对方出手后，你离篮筐比贴身的进攻人更近（1.6 米内）时，他的篮板范围 ×0.88 / 0.8 / 0.7 / 0.6',
  };
  const TIER_ROWS = [['四档', '铜 / 银 / 金 / 名人堂。档位按球员能力自动分配，徽章说明里的数值是金档'],
    ['1V1 徽章', '训练场 / 斗牛 / 5V5 都生效：持有名单不变，档位按对应能力算。铜档效果约为金档的 65%，银档约 85%，名人堂约 125%。例：神射手（金）跳投受干扰 -25%，铜 -16%，银 -21%，名人堂 -31%；无限射程（金）9.4 米，铜 8.8 米，银 9.1 米，名人堂 9.85 米'],
    ['5V5 徽章', '只在 5V5 生效，按能力全自动分配，不占球员卡上的 4 个徽章位。触发时屏幕两侧弹出“徽章名 · 档位”']];
  const TEAMSK_ROWS = [['和 1V1 专属', '1V1 专属在 5V5 照样生效（触发时插屏冻结约 1 秒）。下面 5 种团队专属只在 5V5 生效，触发时不冻结比赛：LED 横幅、本人头顶浮字，再加一个徽章芯片。你这一方触发传球大师、空位创造或掩护大师后，如果这一回合得分，进球后补一个 0.6 秒的短插屏特写（这时已是死球）'],
    ['传球大师', '约基奇“约老师手术刀”、哈利伯顿“哈利长传”、特雷·杨“冰吹高吊”。传出创造性传球时触发：跳传、突破分球、击地、高吊 / 空接、9 米以上长传、传给空切的队友。这记球不会被截、落点零误差；接球人 1.6 秒内的跳投或上篮干扰减半、不会被盖、绿区 ×1.7。冷却较长，每人每场大约 4 次'],
    ['组织核心', '东契奇“魔术指挥”、詹姆斯“国王视野”。本人持球发起战术或挡拆时触发：之后 10 秒全队传球被截概率 ×0.6；队友接球 2 秒内出手，命中 ×1.06、绿区 ×1.3'],
    ['空位创造', '哈登“大胡子突分”、坎宁安“凯德突分”。本人突破到离筐 4.5 米内，把球分给外线或中距离的队友时触发：这记球不会被截；接球人 1.5 秒内跳投，干扰 ×0.35、绿区 ×1.5、命中 ×1.08'],
    ['掩护大师', '萨博尼斯“萨博人墙”、戈贝尔“巨闸顺下”。本人的挡拆或无球掩护撞上防守人时触发：至少挡出“好掩护”，40% 直接“挡倒”；之后 2.5 秒内，掩护人顺下 / 外弹的出手和被掩护持球人的出手，干扰减半、绿区 ×1.5'],
    ['防守指挥', '追梦格林“追梦指挥”、文班亚马“外星指挥”。本人在场防守、对方发起挡拆或战术时触发：之后 8 秒，全队被掩护撞击分数 ×0.7、干扰 ×1.15、截传范围 ×1.15']];
  const SK1_ROWS = [['哈利超远', '哈利伯顿：7.5 米外定点或急停三分。无视干扰、不可被盖，绿区 ×1.7，完美出手必进'],
    ['冰吹深三', '特雷·杨：运球动作后 0.8 秒内，在 7.5 米外急停或后撤步三分。无视干扰、不可被盖，绿区 ×1.7，完美出手必进'],
    ['大胡子后撤', '哈登：三分线外后撤步跳投。无视干扰、不可被盖，绿区 ×1.7，完美出手必进'],
    ['追梦掏球', '追梦格林：持球人在 1.4 米内时出手抢断，必定掏下（对方上篮 / 扣篮途中和护球时除外），冷却 20 秒'],
    ['立陶宛背打', '萨博尼斯：背打累计 0.6 秒以上后出手勾手或转身跳投。无视干扰、不可被盖，绿区 ×1.7，完美出手必进'],
    ['法国巨闸', '戈贝尔：对手在篮下 3.4 米内出手、你在他 2.4 米内起跳封盖，只要手碰到球就必定盖帽'],
    ['外星封锁', '文班亚马：对手在篮下 3.4 米内出手、你在他 2.4 米内起跳封盖']];
  const gT = (t, rows) => '<div class="mgroup"><h3>' + t + '</h3>' + rows.map((r) => { const id = r[2] || TIPN[r[0]]; return '<div class="mrow"><b>' + r[0] + '</b><span>' + r[1] + (id ? tipB(id, r[0].replace(/<[^>]+>/g, ''), r[1]) : '') + '</span></div>'; }).join('') + '</div>';
  function helpBody(tab) {
    if (tab === 't5a') {
      // V3.9b：5V5 专用能力（数值来自 NBA 2K 能力值）。和 1V1 共用的能力不重复计算
      const row = (a, note, eff) => '<div class="krow"><div class="kact">' + a + (note ? '<small>' + note + '</small>' : '') + '</div><div class="kkeys a5e">' + eff + '</div></div>';
      const head = (t, r) => '<div class="khead"><b>' + t + '</b><span>' + r + '</span></div>';
      return '<div class="klist">' +
        head('5V5 专用能力', '影响什么') +
        row('传球准确', 'Pass Accuracy', '球速快慢（±10%）、落点偏差（0~0.6 米，长传 / 高吊更大）、被截的机会（±30%）') +
        row('传球意识', 'Pass IQ', '读秒传球的快慢、会不会避开被卡住的传球线路、传球方式选得对不对') +
        row('传球视野', 'Vision', '看得到多宽的队友、会不会转移到弱侧、多看重“谁空着”；你控球时自动选人也会更偏向空位') +
        row('投篮意识', 'Shot IQ', '被贴防、位置不好时放弃强投改去找传球；意识低的人更爱单干') +
        row('球商', 'Intangibles', '无球空切的频率和时机、拉开空间的距离') +
        row('协防意识', 'Help Defense IQ', '补防反应快慢（0.05~0.45 秒）、往篮下收缩多少、绕掩护快慢、换防判断') +
        row('传球预判', 'Pass Perception', '截传范围（±20%）和成功率（±30%）、抢先移向传球落点') +
        row('手感', 'Hands', '低于平均的人接快球 / 偏球可能脱手') +
        head('和 1V1 共用', '不重复计算') +
        row('投篮 / 上篮 / 扣篮', '', '出手命中、投篮条宽度，和 1V1 完全一样') +
        row('抢断 / 盖帽 / 防守', '', '贴身抢断、盖帽、干扰投篮；截传距离也算一部分抢断') +
        row('进攻 / 防守篮板', '', '抢篮板、卡位，和 1V1 一样（弹跳、力量也有影响）') +
        row('力量 / 体重', '', '掩护质量：卡人范围和卡人时长') +
        '<p class="hnote">能力中位数的球员表现和平均水平一样；高于或低于中位数越多，差别越大。数据：NBA 2KLab 球员能力值。</p>' +
        '</div>';
    }
    if (tab === 't5') {
      // V3.9：5V5 按键完全对照 NBA 2K 的 Xbox 默认布局；键盘是同一套键的镜像
      const row = (a, note, keys) => '<div class="krow"><div class="kact">' + a + (note ? '<small>' + note + '</small>' : '') + '</div><div class="kkeys">' + keys + '</div></div>';
      const head = (t) => '<div class="khead"><b>' + t + '</b><span>Xbox 手柄 · 键盘</span></div>';
      const kb = (p, k) => p + '<span>·</span>' + k;
      const X = K('X', 'x'), A = K('A', 'a'), B = K('B', 'b'), Y = K('Y', 'y'), G2 = (t) => K(t, 'g');
      return '<div class="klist">' +
        head('通用') + row('移动', '方向跟着镜头：转播镜头里推上 = 往屏幕上方跑', kb(G2('左摇杆'), K('W') + K('A') + K('S') + K('D'))) + row('加速', '按住，消耗体力', kb(G2('RT'), K('左 Shift'))) +
        row('暂停 / 镜头设置', '暂停菜单 → 镜头：2K 镜头 / 转播、远近、高度', kb(G2('Menu ≡'), K('Esc') + or + K('P'))) +
        row('数据面板', '比赛暂停；双方 Box（含替补）、球队对比、传球 / 组织、换人；暂停菜单 → 数据 也能打开', kb(G2('View ⧉'), K('Tab'))) +
        row('换人', '直接打开数据面板的换人页', kb(G2('十字键↓'), K('B') + or + K('4'))) +
        row('面板切页签', '', kb(G2('LB') + G2('RB'), K('←') + K('→'))) +
        row('面板换人', '先选场上一人，再选一名替补，下个死球生效（显示“待换”）；再选一次“待换”的人取消；最下面是自动换人开关', kb(G2('十字键') + '+' + A, K('↑') + K('↓') + '+' + K('J'))) +
        row('关闭面板', '', kb(B, K('Tab') + or + K('Esc'))) +
        head('进攻') + row('投篮', '按住蓄力、条涨到绿区松手；轻点 = 假投；突破中按 = 上篮', kb(X, K('J') + or + K('空格'))) +
        row('扣篮', '突破中按住加速再按投篮', kb(G2('RT') + '+' + X, K('左 Shift') + '+' + K('J'))) +
        row('专业摇杆（Pro Stick）', '左右变向、前转身、后后撤步；可连招', kb(G2('右摇杆'), K('↑') + K('←') + K('↓') + K('→'))) +
        row('犹豫步', '按住双臂向两侧展开，单手托球假突，松手按左摇杆方向接招', kb(G2('R3'), K('H'))) +
        row('运球接急停', '高控球或脚踝终结者/运球如丝可随时接干拔，后撤步大师仅限后撤步；其他球员等动作做完', kb(X, K('J'))) +
        row('传球', '左摇杆指向谁就传给谁；不指方向传给面前最合适的人；按住 = 长传', kb(A, K('K'))) +
        row('击地传球', '', kb(B, K('L'))) + row('高吊传球 / 空中接力', '按一下高吊，快速按两下 = 空中接力', kb(Y, K('I'))) +
        row('背打 / 护球', '按住', kb(G2('LT'), K('Q'))) + row('叫挡拆', '叫最近的内线来掩护；再按一次 = 顺下', kb(G2('LB'), K('R'))) +
        row('图标传球', '按住 RB，队友头顶出现 A / B / X / Y / LT，再按对应键传给他（键盘显示 K / L / J / I / Q）', kb(G2('RB') + '+图标', K('E') + '+图标')) +
        row('接球即投 / 即传 / 即招式', '传球飞来时提前按：X 接球即投 / A 接球即传 / 右摇杆 接球即招式（键盘 J / K / 方向键）', kb(X + A + G2('右摇杆'), K('J') + K('K') + K('↑') + K('←') + K('↓') + K('→'))) +
        row('空中分球', '突破或起跳后、出手前按：取消上篮 / 扣篮 / 跳投，改成空中传球；越接近出手越容易失误', kb(A + B + Y, K('K') + K('L') + K('I'))) +
        head('战术呼叫 · 进攻') +
        row('快速战术', '本队风格最常用的 4 个', kb(G2('十字键↑'), K('1'))) +
        row('战术库', '再按一次翻页：牛角、西班牙挡拆、手递手、电梯门、Floppy、低位单打、Pistol，以及“交给教练 / 自己叫”', kb(G2('十字键←'), K('2'))) +
        row('挡拆呼叫', '选一名队友上来挡拆；也可以叫手递手、无球掩护', kb(G2('十字键→'), K('3'))) +
        row('选择', '弹出选择条后按对应键；4 秒不选、同一方向再按一次、被抢断或球权转换时自动收起；进攻时间剩不到 5 秒时战术自动中止，改为单打', kb(A + B + X + Y, K('K') + K('L') + K('J') + K('I'))) +
        head('防守') + row('切换球员', '切到离球最近的队友', kb(A, K('K'))) + row('换防', '长按：把离你最近的进攻人换成你的对位', kb(A + '（长按）', K('K') + '（长按）')) +
        row('图标换人', '按住 RB，再按队友头顶的图标', kb(G2('RB') + '+图标', K('E') + '+图标')) +
        row('抢断', '右摇杆往下 / 左右也是抢断', kb(X, K('J'))) + row('盖帽 / 篮板', '', kb(Y, K('I'))) +
        row('强硬防守（Intense-D）/ 卡位', '按住；投篮出手后按住 = 卡位', kb(G2('LT'), K('Q'))) + row('举手', '右摇杆往上', kb(G2('右摇杆↑'), K('↑'))) +
        row('站定挡人（造犯规）', '按住原地站死，靠身体挡突破；本作不吹犯规，只是更不容易被撞开', kb(B + '（按住）', K('L') + '（按住）')) +
        row('包夹', '叫一个队友去夹持球人，再按一次取消', kb(G2('LB'), K('R'))) +
        head('战术呼叫 · 防守') +
        row('防守策略', '包夹 / 紧盯外线 / 收缩禁区 / 自动', kb(G2('十字键↑'), K('1'))) +
        row('防守阵型', '人盯人 / 2-3 联防 / 全场紧逼 / 自动', kb(G2('十字键←'), K('2'))) +
        row('挡拆对策', '换防 / 挤过 / 下沉 / 夹击', kb(G2('十字键→'), K('3'))) +
        '</div>' + gT('战术简介', [
          ['牛角', '两名大个站在罚球线两侧，持球人选一边打挡拆，另一个大个拉开或者下顺'],
          ['西班牙挡拆', '挡拆的同时，第三个人给挡拆人做背掩护'],
          ['手递手', '大个在外线接球，递给绕过来的射手'],
          ['电梯门', '射手从两名掩护人中间穿出，两人随即合拢，挡住追防的人'],
          ['Floppy', '射手从底线出发，借两侧的掩护选一边跑出来接球'],
          ['低位单打', '把球送进低位，其余人拉开空间'],
          ['Pistol', '快攻落位之前，后卫和侧翼在弧顶快速打手递手和挡拆'],
          ['高位策应', '遇到联防时，把球交给罚球线附近的人分球']]) +
        '<p class="tnote">和 2K 一样，控制权会自动跟着球走：传球后切到接球人，球权转换后切到离球最近的防守人。和 2K 一样，你控制的球员脚下有一圈队色细圈，下面是金色体力条和带星号的名字；对方持球人只显示名字。左上角信息卡是你控制的球员，右上角是他的直接对位（设置 → 显示 → 球员信息 可关闭）；防守时脚下的黄色箭头指向你该防的人（Who To Guard）。1V1 里的所有动作（运球包、连招、后撤步、转身、背打顶人、勾手、后仰、投篮条绿区、上篮扣篮包、高阶上篮、盖帽手球判定、抢断、身体对抗、体力、徽章、热区、配音）在 5V5 里都一样。</p>' +
        '<p class="tnote">各队会按阵容采用不同的默认进攻风格（五外、挡拆、低位、无球跑动、球星单打），队友会自动拉开空间。</p>' +
        '<p class="tnote">规则：全场 5 对 5，四节；24 秒进攻（前场篮板重置为 14 秒）；不吹犯规、不罚球、不判回场，出界由另一队边线发球；平局打加时。体力低的球员在死球时自动换下，屏幕上方会出现队色换人条（下 谁 体力% ↔ 上 谁）；数据面板 → 换人 可以手动换人，或关掉自动换人（只管你的球队，电脑队始终自动）。左上 / 右上信息卡底部的体力条和场上脚下的金色体力条是同一个体力值，25 以下变红。数据面板里每列最高值绿色高亮，达到精英线为金色，失误最多为红色；★ 是你当前控制的球员。镜头默认是 2K 镜头：机位在进攻方向后上方、对着进攻篮筐，左右对称；球在后场时镜头拉远拉高看全前场，过半场后连续推近压低到半场取景；攻防转换时镜头快速转 180 度（转身期间摇杆方向不变）；摇杆往上推就是朝进攻篮筐跑。镜头这一侧的篮架会变成半透明，挡不住球员。第一节和加时赛先跳球（场边低机位，拨球后升起转到 2K 镜头），第二、三节由输掉开场跳球的一队发边线球，第四节由赢得跳球的一队发球。发球时镜头会保证看得到发球人和球。2K 镜头下比分条在底部正中。暂停 → 镜头可以换成转播镜头（侧面），并调远近 0~10、高度（2K 镜头 0~20，转播 0~10；2K 镜头默认远近 5、高度 10，就是实机取景），和 2K 的镜头设置一样。</p>';
    }
    if (tab === 'stars') {
      const g = gT;
      const st = GM.ROSTER.filter((k) => GM.ARCH[k].star && GM.ARCH[k].skill).map((k) => { const a = GM.ARCH[k]; return [a.name + ' · ' + a.skill.name, '条件：' + a.skill.cond + '。效果：' + a.skill.eff + '。', 'sk-' + a.skill.id]; });
      return '<p class="tnote" style="margin:0 0 8px">必杀技不需要额外按键：满足苛刻条件后脚下出现金色光圈，再用正常操作做出对应动作就会自动释放，全屏插画并短暂定格。每次释放后冷却 18 秒。</p>' +
        g('球星必杀技', st) +
        (() => { const AT = {}; GM.ATTRS.forEach((t) => { AT[t[0]] = t[2]; }); Object.assign(AT, R5TIP); return AGRP.map((x) => g('属性 · ' + x[0], x[2].map((k) => [k[1], AT[k[0]] || '']))).join(''); })() +
        (() => { const have = new Set(st.map((r) => r[0].split(' · ')[1])), add = SK1_ROWS.filter((r) => !have.has(r[0])); return add.length ? g('新增 1V1 专属', add) : ''; })() +
        g('5V5 团队专属（只在 5V5 生效）', TEAMSK_ROWS) +
        g('徽章等级', TIER_ROWS) +
        g('徽章', Object.keys(GM.BADGES).filter((k) => !GM.BADGES[k].five).map((k) => [IC.svg(k, 'hi') + GM.BADGES[k].name, GM.BADGES[k].desc])) +
        g('5V5 徽章（数值依次为 铜 / 银 / 金 / 名人堂）', Object.keys(GM.BADGES).filter((k) => GM.BADGES[k].five).map((k) => [(IC.has(k) ? IC.svg(k, 'hi') : '') + GM.BADGES[k].name, BDESC[k] || GM.BADGES[k].desc]).concat([['合计上限', '同一次出手，所有 5V5 加成合计最多命中 ×1.15、绿区 ×1.6（团队专属触发时绿区最多 ×1.9）；传球被截概率最低降到原来的 35%']]));
    }
    if (tab === 'moves') {
      const g = gT;
      return '<p class="tnote" style="margin:0 0 8px">按键只有几个，游戏会根据你当时的方向、速度和位置自动出对应动作。下面“前 / 后”指朝向篮筐 / 远离篮筐。</p>' +
        g('投篮键（三分线内外）', [['定点跳投', '站定出手，最稳'], ['急停跳投', '跑动中出手'], ['漂移跳投', '加速横移中，按住左右出手'], ['后仰跳投', '按住“后”出手，干扰和被盖概率大幅降低'], ['后撤步跳投', '做完后撤步立刻出手'], ['假动作', '轻点投篮键，能骗防守人起跳']]) +
        g('完美出手（绿区）', [['必进', '投篮条卡在绿区松手：空位、轻度干扰都必进，大多是空心；只有被严重封堵（贴脸 50% 以上）才可能不进'], ['非完美', '稍早稍晚也能进，但多是磕筐、颠框、打板这类运气球'], ['绿区宽度', '跳投绿区比以前更宽一些，上篮扣篮不变'], ['出手弧度', '每人不同：低平弧线（詹姆斯、字母哥、内线）进球多是磕前沿滚进；高抛弧线（库里、东契奇）空心更多']]) +
        g('投篮包（每个球员不同，选人界面可看）', [['出手速度', '快的投篮条走得快、防守人来不及扑上来，但更难卡准绿区；慢的反过来'], ['出手点', '头顶高点出手更难被盖、受干扰小；胸前推射容易被盖'], ['一段式 / 两段式', '一段式一口气投出；两段式先举到出手点停一下再出手'], ['代表', '库里一段式快投、科比高点后仰带踢腿、东契奇慢速两段、哈登左手额前推射、约基奇单腿金鸡、杜兰特长臂高点、奥尼尔胸前推射'], ['左手球员', '哈登、布伦森、福克斯、萨博尼斯、锡安、兰德尔等左手出手，默认左手运球']]) +
        '<p class="tnote" style="margin:0 0 8px">上篮和扣篮按真实规则：收球（0 步）后再走两步起跳。跑得越快步子越大，所以冲刺时离篮筐五六米就能启动。持球冲向篮筐时，脚下会提示“可扣篮 / 可上篮 / 抛投”。</p>' +
        g('扣篮怎么出（提示“可扣篮”时按终结键）', [['扣篮包', '每人只会自己扣篮包里的动作（选人详情里能看到）：力量型（奥尼尔这类大体重内线）双手 / 挂筐 / 隔扣为主，不会风车 360 拉弓；运动型（行进扣篮 + 弹跳都高）才有风车 / 360 / 拉弓 / 战斧；常规型以单双手、背扣为主；贴地型基本只能上篮'], ['轻按', '在自己的扣篮包里按情况选：底线杀入多出背扣；防守人正面堵着且身体明显占优才会隔扣；慢速收球多出双手；空位且是运动型会混进花式'], ['按住不放', '一直按到起跳，出扣篮包里最花的那几种；力量型按住是挂筐暴扣 / 大鲨鱼暴扣'], ['奥尼尔专属', '大鲨鱼暴扣：双手砸进去挂在筐上把篮架拉晃；有小概率直接把篮板扣碎'], ['沉底暴扣', '背打把防守人顶开后（他会踉跄一下），马上按扣篮键原地双手暴扣；被顶开的人这时很难盖到'], ['补篮 / 补扣', '自己或对手没投进，进攻篮板强的人起跳在篮筐附近碰到球，会直接空中补进'], ['连按两下', '双手暴扣（最稳，最不容易被盖）'], ['加速+右摇杆', '或加速 + 运球键 + 方向：推前双手扣，推左右侧身单手扣，推后花式扣'], ['隔扣能不能成', '看扣篮 + 弹跳 + 力量 + 身高，对比防守人的内线防守 + 盖帽 + 力量 + 身高；不占优硬扣容易被直接扇下'], ['长距离起跳', '全速冲刺时最后一步离筐更远，扣篮能力高的人能在 2.5 米外起跳滑翔扣进'], ['花式扣篮库', '运动型额外会滑翔单手扣、摇篮扣、空中双抽、剪刀腿，起跳时按扣篮包随机抽'], ['上篮库', '普通上篮随机出擦板 / 打板转身 / 挑篮 / 滑翔挑篮 / 高抛挑篮 / 错步上篮；离筐很近时不走三步，直接收球起跳'], ['盖帽判定', '必须防守人起跳后手真正碰到球才算盖帽，起跳太晚、太低或手差一点都盖不到，不会隔空盖'], ['自动改上篮', '起跳点够不到、扣篮能力不足或没体力时，自动改成上篮或抛投']]) +
        g('普通上篮会自动变成哪种', [['强吃上篮', '面前有人，但你更重、力量 75 以上：用肩膀扛开出手'], ['低手挑篮', '面前是更长的防守人，上篮 75 以上：手放低从侧下方挑，躲开封盖'], ['打板上篮', '从 45 度角切入：侧身擦板'], ['挑篮', '高速冲到篮下：直臂把球往前上方送'], ['单手上篮', '其余情况']]) +
        g('投篮键（突破中 / 靠近篮筐）', [['冲刺扣篮', '按住加速朝篮筐冲，按投篮键：能扣就扣，够不着自动上篮'], ['三步上篮', '朝篮筐跑动中按，提示“可上篮”时就能出；左侧用左手，右侧用右手'], ['上篮出手时机', '按住投篮键，条第一次涨到顶（绿区）松手；继续按住条会掉下去再涨一次，第二次到顶是蓝色拉杆点；只是轻点一下会自动出手，但自动出手算稍晚、不会进绿区'], ['转身上篮', '突破中连按两下投篮键'], ['抛投', '面朝篮筐时轻拉“后”再按；或冲刺中离篮筐 3 到 4.5 米时按，很难被盖。背对篮筐往外跑时按出的是后仰跳投'], ['转身跳投', '背打刚松开、或转身过人后背对篮筐时按投篮键，转身面框跳投；按住不放直到条到顶'], ['捡地板球', '球在地上时靠近就会自动捡起，手长、控球好、拼抢积极的人够得更远；捡到时球会闪一下并有轻响'], ['反篮', '从底线一侧杀到篮下时自动使用'], ['双脚强起', '篮下慢速时按，跳停双脚起跳'], ['拉杆', '起跳后按住不松，等第二个蓝色区域再松手']]) +
        g('高阶上篮（突破到篮下时，运球动作键 + 方向，以篮筐为前）', [['普通上篮', '推前'], ['跳步上篮', '推左或右，双脚跳向那一侧'], ['欧洲步', '推斜后左或斜后右，先反向跨一步，再落到推的那一侧'], ['抛投', '推正后'], ['出手时机', '按住不放，到绿区松开']]) +
        g('体力（脚下的条：黄 → 橙 40 以下 → 红闪 15 以下）', [['消耗', '加速跑、运球动作（连招越连越贵）、背打、上篮/扣篮、起跳封盖、抢断；耐力属性和“永动机”徽章让消耗变少'], ['恢复', '不加速时慢慢回，站着回得最快'], ['40 以下逐步变差', '跑速和加速变慢、过人变慢更难晃开人、投篮绿区变窄命中下降、起跳变低扣篮起跳点变近、防守干扰变弱、更容易被抢断'], ['见底', '体力 3 以下不能加速（跑不动），8 以下不能做运球动作（没体力），5 以下不能起跳封盖（跳不动），12 以下不能扣篮（没体力 改上篮）'], ['表现', '越累身体越前倾、喘气起伏越大，嘴边冒白气、流汗；见底时没球站着会双手撑膝；按了做不出来会弯腰喘一下并提示原因']]) +
        g('身体对抗（吨位 = 体重 + 身高 + 力量）', [['冲撞', '每次碰撞看吨位、速度、是否站稳防守姿态，再加一点随机：势均力敌双方各退一步；小优势对方轻微踉跄；大优势把人撞开；压倒性优势直接撞倒。吨位大只是赢的概率高，不是每次都赢'], ['背打', '每顶一下都有撞击，吨位占优会把防守人一步步顶退'], ['上篮', '收球途中被更重的人撞到，路线被撞偏、命中下降'], ['扣篮', '吨位压过对手的隔扣会把人扣倒；小个子硬扣大个子更容易扣丢']]) +
        g('身体对抗与体力', [['每次碰撞', '双方都会掉体力，输的一方掉得更多'], ['体力影响', '体力越低越顶不动人；双方体力都很低时，碰撞多半是互相弹开'], ['终结路线有人', '上篮或扣篮途中撞上防守人：按吨位、体力、速度、终结和防守能力判定——顶开继续、扣篮改上篮 / 上篮被挤偏，或直接被挡下']]) +
        g('灵活度（运球动作的快慢和位移）', [['怎么算', '控球、加速、体重、身高一起决定。小个高控球后卫同一个动作做得更快、蹬得更远；笨重中锋动作更慢、位移更短'], ['大概差多少', '库里、欧文这类做变向比奥尼尔快约一倍，位移多出四成左右']]) +
        g('运球键 + 方向', [['体前变向', '跑动中按左或右：踩住一脚，球从身前低运换手，横向蹬出'], ['胯下运球', '站定时按左或右，快而省体力，适合起手'], ['背后运球', '防守人贴身时按左或右，球绕到背后换手，不会被抢断'], ['内外假晃', '按“前”：肩膀和球先往一侧晃，再拉回来'], ['转身过人', '按“前”且防守人贴在面前：护球转一整圈。往左转出是右手持球顺时针转，往右转出是左手持球逆时针转，收招换到外侧手'], ['后撤步', '按“后”：前脚刹住，向后跳一步双脚落地，球收到胸前，接着按投篮'], ['犹豫步', '左摇杆回中时按住运球键，刹停抖肩并向两侧展开双臂，单手托球假突；松手时推向持球手的反侧出体前变向，同侧或正前出突破，向后出后撤步，不推方向或不会对应动作则原地收招'], ['连招', '连续做不同的动作，晃人概率逐次提高'], ['灵活度（看控球）', '控球越好：动作越快、越早能接下一个动作、收招停顿越短、晃人越容易。真实控球达到干拔门槛（默认 88%），或有脚踝终结者/运球如丝，任何运球中按投篮都能立即干拔；后撤步大师仅限后撤步。其他球员须等动作完整结束才出手']]) +
        g('运球包（参考 2K：每个人同一个方向 + 运球键出的招不一样，选人界面能看到并点开演示）', [['斜前 / 斜后', '有些运球包把斜前、斜后单独设成招牌招；没有的就和横推一样'], ['好不好用', '有的招什么时候都好用，有的只在特定情况下才强：贴身、对手扑上来、对手伸手、对手比你轻']].concat(Object.keys(GM.MVX).map((k) => { const X = GM.MVX[k]; return [X.name, X.how + (X.req ? '（' + X.req.t + '）' : ''), k]; })).concat(Object.keys(GM.DPKG).map((k) => { const P = GM.DPKG[k], who = Object.keys(GM.ARCH).filter((a) => (GM.DPK_OF[a] || 'std') === k).map((a) => GM.ARCH[a].name); return who.length ? [P.name, P.desc + '。' + who.join('、')] : null; }).filter(Boolean))) +
        g('搓招连招（像格斗游戏：0.9 秒内按完方向序列，最后一下同时按运球键；以篮筐为前）', Object.keys(GM.CB).map((k) => { const C = GM.CB[k]; return [C.name, C.seq + ' + 运球键。控球 ' + Math.round(C.req * 99) + ' 以上才能出（主宰·控球类无门槛），不够就出普通动作。晃人概率 ×' + C.bite + '，晃倒/晃晕更久，体力消耗 ×1.3', k]; }).concat([['举例', '右 → 左 → 左斜后 + 运球键 = 拽回后撤（先往右骗，再拉回左边后撤，拉开空间直接投）']])) +
        g('热区（参考 2K，选人详情里有小地图）', [['分区', '半场分 12 区：篮下、禁区、左右底线 / 侧翼中投、罚球线、左右底角 / 侧翼三分、弧顶三分'], ['冷 / 普通 / 热 / 致命', '每人初始热区由属性和招牌位置决定；本场同一区连中 2 球升一级，连铁 2 次降一级'], ['效果', '热区绿区 +18%、能力 +2.5；致命区绿区 +32%、能力 +4.5；冷区绿区 -12%、能力 -2.5。上篮和勾手只吃一半'], ['地板提示', '持球站在热区地板淡橙、致命区淡红、冷区淡蓝；设置里可关']]) +
        g('手感（火热 / 冰冷）', [['手感火热', '连续得分 3 球：投篮轨迹带火焰，三分和中投 +5，信息卡数字旁显示 ↑'], ['手感冰冷', '跳投连续 3 次不进（含被盖）：脚下出现蓝色光圈，三分和中投 -6，信息卡数字变蓝并显示 ↓；投进一球立刻解除'], ['主宰加成', '主宰期间信息卡上被加成的数字旁显示 ↑ 和加了多少']]) +
        g('背打（按住 LT / Q；本地双人玩家 2 按 O）', [['顶人', '按“前”把防守人往篮下挤，内线力量大更容易'], ['勾手', '背打中按投篮键（离篮筐近）；默认朝禁区中路侧身，用离篮筐远的那只手勾；同时推左或右可自己选方向'], ['转身跳投', '背打中按投篮键（离篮筐远）'], ['背身后仰', '背打中按住“后”再按投篮键'], ['背身转身', '松开背打键的同时按住左或右；蹬多远、能不能转过人看背打、爆发、控球、力量'], ['转过', '没晃住也没撞开时还会再判一次能不能转过防守人：脚步、速度差占优更容易，力量比对手小也有机会'], ['转身撞开', '转身贴着人时，吨位占优或有“梦幻舞步”“推土机”徽章，会把防守人撞开'], ['转身晃人', '背身转身能不能把人转晕，看你的背打、力量、加速和吨位，对比防守人的内线防守、灵活度和吨位；防守人越往你身上顶，越容易被转身甩掉，不看运球属性'], ['转身终结', '背打中靠近篮筐按扣篮键']]) +
        g('盖帽（防守时无球按投篮键）', [['起跳方向', '自动跳向出手点：跳投扑向对手身前，上篮扣篮跳到他去篮筐的路线上；同时按方向可以微调'], ['被盖的球', '约 2 成落在进攻人身边；其余往外场两侧飞出 3~5 米，进攻人 0.8 秒、盖帽人 0.35 秒内捡不到，变成争球，可以飞身去扑'], ['起跳时机', '人在最高点时碰到球最容易盖，起跳太早落下来了、太晚还没升起来都会掉成功率；正好最高点盖掉会提示“完美时机”'], ['站位', '要在对手和篮筐之间、正面封；从背后起跳基本盖不到（詹姆斯的追身大帽是例外）'], ['博弈', '跳投可以先举手干扰，看清真出手再跳，别吃假动作；后仰、高点出手、快出手更难盖'], ['盖帽样式', '自动按情况出：单手大帽；盖帽极强且时机好会直接抓帽，球权归你；正面封且身体占优会呼脸大帽；从身后追上去是追身封盖'], ['倒地与无碰撞', '倒地、起身和被晃转身的一瞬间不占体积，可以直接穿过去；被晃晕、死球时不触发身体碰撞']]) +
        g('篮板（球出手后按投篮键起跳抢）', [['起跳时机', '球从篮筐弹下来、落到你头顶附近时跳，在最高点碰到球够得最远'], ['提前按', '还在落地或做动作时按下去也算，落地后自动起跳，不会丢键'], ['卡位', '投篮出手后按住防守姿态键：张开手臂挡在对手和球之间，用身体把他往外挤，被卡住的人很难抢到；吨位大挤得更动'], ['防守方优势', '防守方离篮筐近、抢板范围更大；进攻方要靠绕开卡位或冲抢'], ['不跳够不到高球', '站在地上只能接到头顶附近的球，球越高能够到的范围越小；高过头顶的球一定要起跳']]) +
        gT('飞身扑球（散球落地或低弹时按抢断键）', [['飞身扑球', '朝球扑出去，双手先碰到就拿到球权；扑空要趴在地上一会儿才起来', 'dive'], ['扑多远', '看拼劲：速度、爆发、篮板、抢断越高扑得越远越快；体重大扑得短；“拼抢狂人”再远 0.6 米、手更长、两人同扑更占优'], ['起身', '体重大起得慢，拼劲高起得快'], ['两人同时扑', '拼劲高的一方更容易抢到'], ['消耗', '每次 10 体力（拼抢狂人 6），体力 8 以下扑不动']]) +
        g('防守', [['举手干扰', '按住防守姿态贴近对手，不起跳也能降低对方命中，不会吃假动作'], ['起跳封盖', '干扰更强且能盖帽，但会被假动作骗起来'], ['顶防背打', '对方背打时按住防守姿态，更不容易被挤开'], ['抢断', '对方做变向、站定投篮或体力不足时成功率高']]) +
        g('动作包（看属性，选人页可查）', [['运球', '胯下、内外晃需要控球 50；背后运球控球 60；后撤步控球 50 或中投 70；转身控球 45 或力量 80。不会的动作按了会自动换成体前变向或犹豫步'], ['上篮', '反篮需要突破上篮 70；跳步突破上篮 70 + 控球 50；欧洲步突破上篮 78 + 控球 60 + 速度 70；转身上篮突破上篮 80 + 控球 70。不会的改成普通上篮或强起'], ['招牌动作', '字母哥欧洲步 / 跳步、詹姆斯欧洲步 / 跳步 / 转身、奥尼尔转身，不受属性限制'], ['体重', '越重起步、变向越慢，运球动作也更沉'], ['怎么看', '选人详情页“运球 / 上篮”一栏，划线的是不会的，鼠标移上去显示需要多少属性；属性汇总条移上去显示由哪些细项组成']]) +
        g('主宰（信息卡下方的橙色条）', [['怎么攒', '进球、完美出手、晃倒/晃晕、盖帽、抢断、强干扰逼铁、抢篮板都会涨；被打进、失误、被盖、被晃会掉；不打球时缓慢回落'], ['以弱胜强', '总评越低攒得越快（最多 1.5 倍），球星攒得慢'], ['满了自动进入', '持续 24 秒（参考 2K 的主宰）：全部属性 +5，自己最强那一类再 +20（封顶 99），体力消耗 -30%。左上角信息卡会变橙并列出加成，属性数字旁边的 +N 就是加了多少'], ['五种主宰', '按球员最强的一项自动决定：投篮（绿区 +40%、被干扰影响 -40%）/ 终结（上篮扣篮被盖 -50%、内线被干扰 -30%）/ 内线（每次顶人都能顶开、背打出手被干扰 -50%）/ 运球（晃人成功率 ×1.6、运球动作体力 -60%）/ 防守（盖帽抢断成功率 ×1.4、干扰 +30%）'], ['提前结束', '主宰中被对手得分、失误会缩短时间'], ['攻防都算', '防守端的盖帽、抢断、逼铁同样能攒满']]) +
        g('庆祝与配音', [['进球庆祝', '扣篮、三分、晃倒后得分、关键球一定会庆祝，其它进球随机；镜头拉近，进攻方按自己性格做动作，防守方抱头 / 叉腰 / 摊手'], ['球员配音', '扣篮、三分、晃人、盖帽、抢断、打铁、主宰、获胜都有台词，每人每类多条随机，风格按球员性格；设置里可以关'], ['声音说明', '配音是 AI 合成的不同声线，不是球员本人原声']]) +
        g('属性颜色', [['亮绿 90+', '顶级，带发光'], ['黄绿 80+', '优秀'], ['金黄 70+', '合格'], ['暗橙 60+', '偏弱'], ['暗红 60 以下', '短板']]) +
        g('比赛规则', [['目标分', '11 / 21 / 33 / 50 分，默认 21；必须领先 2 分才算赢，没拉开就一直打下去'], ['赛点', '某一方这一回合进一个三分就能赢时进入赛点：广告屏打出 MATCH POINT，观众起立，广告带上下沿按该队颜色闪，比分牌下方显示“赛点”'], ['比赛时间', '默认不限；可选 3 / 5 / 10 分钟，只在比赛进行中走表。最后 10 秒每秒读秒，时间到鸣笛：球在空中等它落地（压哨球算），领先方获胜；平分进加时，下一球定胜负'], ['进攻时间', '最后 5 秒每秒滴一声，最后 3 秒更急'], ['三分线外清球', '球权转换后要先把球带出三分线，三分线变红并流动提示，出线时闪一下绿色。没出线也可以投篮、突破，但进了不算，判违例，球权交给对方']]) +
        g('声音（设置 → 声音）', [['音量', '总音量、音乐、音效、语音四个滑条，50 是默认；默认值按离线测出来的响度配平，语音和普通音效差不多响，音乐垫在下面，球员说话时音乐自动压低'], ['动作演示', '选人界面右侧的运球、上篮动作和必杀技都能点，用这名球员本人演示']]) +
        g('精彩回放与特写（设置 → 显示 里可关）', [['特写', '精彩瞬间镜头推近；越精彩推得越近、停得越久'], ['回放', '每个回合里最精彩的一球，死球后立即慢放回放一次，双方都算；至少播 2.5 秒，之后按 Enter / Esc（手柄 B 或 Menu）或点屏幕跳过，打球的键不会误跳'], ['精彩度', '按档位打分，再加分：隔扣、花式扣、钉板、完美时机、晃倒、晃倒后得分、关键球、致胜球、超远三分']]) +
        g('进攻节奏博弈（对电脑）', [['电脑会记你的打法', '电脑会记住你最近几回合靠什么得分（背打转身、背打勾手、突破、三分、后撤步、中投），下回合可能提前针对：防背身转身就退一步等你转、防突破就退后放投、防三分就贴身。它猜中了很难打，猜错了反而更好打，换打法就能反制'], ['看防守反应', '你做完一个动作，电脑会选择：扑上来（压低身体、举手贴近）、后撤（退一步防突破）或者不动'], ['它扑上来', '重心在前、转身慢，这时变向或直接突破最容易过'], ['它后撤', '给出了投篮空间，接着投'], ['常用骗法', '犹豫步 / 内外晃引它后撤再投；后撤步引它扑出来再突破。投射好的人，电脑更愿意扑，防守好的电脑更常选不动']]);
    }
    const D = HELP[tab], pad = tab === 'pad';
    const row = (a, note, keys) => '<div class="krow"><div class="kact">' + a + (note ? '<small>' + note + '</small>' : '') + '</div><div class="kkeys">' + keys + '</div></div>';
    const head = (t) => '<div class="khead"><b>' + t + '</b><span>动作 → 按键</span></div>';
    return '<div class="klist">' +
      head('通用') + row('移动', '', D.move) + row('加速', '消耗体力', D.sprint) + row('暂停', '', D.pause) + row('音乐开关', '', D.music) +
      head('进攻（持球时）') + row('投篮 / 上篮', '按住蓄力，条往上涨，涨到顶（绿区）松手最准；过了顶条会往下掉，越掉越偏晚。朝篮筐突破中按出三步上篮', D.a1) + row('假动作', '轻点一下投篮键', D.a1) + row('扣篮 / 上篮（终结键）', '冲向篮筐时，提示“可扣篮”就扣，够不着自动改上篮', D.a2) +
      row('运球动作', '同时按方向：左右变向，前转身，后后撤步', pad ? D.a3r : D.a3) + row('犹豫步', '不推方向按住，双臂向两侧展开，单手托球假突；松开时反侧变向、同侧突破、向后后撤、不推原地收招', D.a3) + row('背打', '按住', D.post) +
      head('防守（对方持球时）') + row('起跳封盖 / 抢篮板', '', pad ? D.blk : D.a1) + row('抢断', '', pad ? D.stl : D.a2) + row('飞身扑球（散球时）', '', pad ? D.stl : D.a2) + row('防守姿态 / 举手干扰', '按住', pad ? D.stance : D.a3) +
      (pad ? '<p class="tnote">菜单里用十字键或左摇杆选择，A 确认，B 返回；滑条 / 下拉左右拨动调整，LB / RB 或右摇杆左右切页签，右摇杆上下滚动；调参台里 X 恢复当前参数默认值。单人模式用第一个手柄；本地双人时第二个手柄控制玩家 2。训练场里 View 键开关参数面板。</p>' : tab === 'k1' ? '<p class="tnote">单人模式下方向键也能移动。训练场里 Tab 开关参数面板，R 重置站位。</p>' : '<p class="tnote">玩家 2 只在本地双人模式使用。</p>') + '</div>';
  }
  let helpTab = 'k1';
  function openHelp() { if (hasPad && helpTab === 'k1') helpTab = 'pad'; renderHelp(); clearPf(); show('help', true); }
  function renderHelp() { $('help-body').innerHTML = helpBody(helpTab); $('help-tabs').querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.getAttribute('data-h') === helpTab)); }
  $('help-tabs').addEventListener('click', (e) => { const h = e.target.getAttribute && e.target.getAttribute('data-h'); if (h) { helpTab = h; renderHelp(); $('help-body').scrollTop = 0; } });

  $('btn-start').addEventListener('click', () => startMatch(false));
  $('btn-help').addEventListener('click', openHelp);
  // ---------- V4.0 调参台（js/tuneui.js 面板 + js/cfgstore.js 云端配置） ----------
  const TUI = PH.TUNEUI, CSt = PH.CS;
  function tuneClose() { if (TUI && TUI.isOpen()) TUI.open(false, { silent: true }); }
  function cfgMenu() {
    const sel = $('cfg-sel'); if (!sel || !CSt) return;
    const S = CSt.S, cur = CSt.cur(), h = CSt.list().map((p) => '<option value="' + p.id + '"' + (p.id === cur.id ? ' selected' : '') + '>' + (p.id === S.def ? '★ ' : '') + p.name.replace(/[<&]/g, '') + '</option>').join('');
    if (sel.innerHTML !== h) sel.innerHTML = h;
    sel.value = cur.id;
  }
  if (TUI && CSt && PH.TUNE) {
    TUI.wire(); CSt.on(cfgMenu); PH.TUNE.on((k) => { if (!k) cfgMenu(); }); cfgMenu();
    $('cfg-sel').addEventListener('change', (e) => { CSt.select(e.target.value); PH.audio.play('ui'); e.target.blur(); });
    $('btn-tune').addEventListener('click', () => { PH.audio.play('ui'); TUI.open(!TUI.isOpen(), { ctx: 'menu' }); });
    // 设置菜单里打开：先收起设置面板，关掉调参台后回到设置
    $('btn-tune2').addEventListener('click', () => { show('pause', false); TUI.open(true, { ctx: 'pause', onClose: () => { if (paused && (screen === 'play' || screen === 'play5')) show('pause', true); } }); });
    // 训练场：调参台替换训练面板的位置（地板上画触发区域），关掉后恢复训练面板
    $('tr-tune').addEventListener('click', () => { show('train', false); TUI.open(true, { ctx: 'train', onClose: () => { if (screen === 'play' && G.mode === 'train' && panelOpen) { show('train', true); buildPanel(); } } }); });
  } else { for (const id of ['row-cfg', 'btn-tune2', 'tr-tune']) { const e = $(id); if (e) e.classList.add('hidden'); } }
  $('btn-help2').addEventListener('click', openHelp);
  $('btn-sound').addEventListener('click', () => setView('sound'));
  $('btn-disp').addEventListener('click', () => setView('disp'));
  for (const b of document.querySelectorAll('#pause [data-back]')) b.addEventListener('click', () => setView('main'));
  $('btn-sfx').addEventListener('click', () => { PH.audio.setSfx(!PH.audio.sfxOn); setLabels(); });
  // 声音面板：总音量 / 音乐 / 音效 / 语音，50 为默认
  { const MX = [['master', '总音量'], ['music', '音乐'], ['sfx', '音效'], ['vo', '语音']];
    $('mixer').innerHTML = MX.map((m) => '<label class="mx"><span>' + m[1] + '</span><input type="range" min="0" max="100" step="1" data-mx="' + m[0] + '" data-testid="mx-' + m[0] + '"><b></b></label>').join('');
    const sync = () => $('mixer').querySelectorAll('input').forEach((i) => { const k = i.getAttribute('data-mx'), v = Math.round((k === 'master' ? PH.audio.MIX.master / 0.8 * 50 : PH.audio.MIX[k] * 100)); i.value = v; i.nextElementSibling.textContent = v; });
    $('mixer').addEventListener('input', (e) => { const i = e.target, k = i.getAttribute('data-mx'); if (!k) return; const v = +i.value; PH.audio.setMix(k, k === 'master' ? v / 50 * 0.8 : v / 100); i.nextElementSibling.textContent = v; });
    $('mixer').addEventListener('change', (e) => { const k = e.target.getAttribute('data-mx'); PH.audio.play(k === 'vo' ? 'ui' : k === 'music' ? 'ui' : 'swish'); if (k === 'vo' && G.players[0]) PH.audio.vo(G.players[0].arch.key, 'three', 'pri'); });
    sync(); }
  $('btn-info').addEventListener('click', () => { toggleInfo(); setLabels(); });
  const saveV = () => setLabels();
  $('btn-replay').addEventListener('click', () => { G.vopt.replay = !G.vopt.replay; saveV(); });
  $('btn-close').addEventListener('click', () => { G.vopt.close = !G.vopt.close; saveV(); });
  $('btn-hz').addEventListener('click', () => { G.vopt.hz = G.vopt.hz === false; saveV(); });
  $('btn-vo').addEventListener('click', () => { PH.audio.setVo(!PH.audio.voOn); saveV(); });
  const REPLAY_MIN = 2.5; // 回放至少播 2.5 秒才能跳过，只认 Enter / Esc / 手柄 B·Menu / 点击画面（打球键不会误跳）
  canvas.addEventListener('pointerdown', () => { if (G.replay && G.replay.age >= REPLAY_MIN) G.replay.skip = true; });
  $('btn-fb').addEventListener('click', () => { opts.fb = opts.fb === 'detail' ? 'simple' : 'detail'; G.fb = opts.fb; if (typeof refreshMenu === 'function') refreshMenu(); setLabels(); });
  // ---------- 动作演示 ----------
  let tipsSave = null;
  const TIPS_VIS = ['menu', 'hud', 'touch', 'train', 'shotcard', 'pause', 'help', 'campanel', 'picker'];
  function tipsEnter(id, nm, ds, who) {
    if (!GM.TIPS[id]) return;
    if (!tipsSave) tipsSave = { G: Object.assign({}, G), train: JSON.parse(JSON.stringify(G.train)), screen: screen, paused: paused, cam: Object.assign({}, R.CAMV), vis: TIPS_VIS.map((k) => !$(k).classList.contains('hidden')), panel: stage.classList.contains('panel'), sc: $('help-body').scrollTop };
    if (tipsSave) { tipsSave.from = $('picker').classList.contains('hidden') ? 'help' : 'picker'; tipsSave.pkShown = pkShown; }
    GM.tipsStart(id, who); screen = 'tips'; paused = false; clearPf();
    for (const k of TIPS_VIS) show(k, false); stage.classList.remove('panel');
    // 演示镜头固定取景：正对篮筐，人和篮筐都完整在画面里
    R.setCam({ zoom: 1.5, dist: 12, height: 6.2, follow: 0.5 }); camShift(); { const p0 = G.players[0], C = R.CAMV; G.focus.cx = p0.x * C.follow; G.focus.cy = Math.min(Math.max(Math.min(p0.y, 9) - C.dist, 2 - C.dist), 9 - C.dist); G.camK = 0; }
    $('tips-n').textContent = nm || ''; $('tips-d').textContent = ds || ''; show('tipsbar', true);
  }
  function tipsExit() {
    const S = tipsSave; if (!S) return; tipsSave = null; GM.tipsStop();
    for (const k of Object.keys(G)) if (!(k in S.G)) delete G[k];
    Object.assign(G, S.G); Object.assign(G.train, S.train); G.tips = null;
    screen = S.screen; paused = S.paused; R.setCam(S.cam);
    TIPS_VIS.forEach((k, i) => show(k, S.vis[i])); stage.classList.toggle('panel', S.panel); camShift();
    show('tipsbar', false); if (S.from === 'picker') { pkDetail(S.pkShown || pkSel); } else { show('help', true); renderHelp(); $('help-body').scrollTop = S.sc; } clearPf();
  }
  $('help-body').addEventListener('click', (e) => { const b = e.target.closest && e.target.closest('[data-tip]'); if (b) tipsEnter(b.getAttribute('data-tip'), b.getAttribute('data-tn'), b.getAttribute('data-td')); });
  $('tips-back').addEventListener('click', () => tipsExit());
  $('pk-detail').addEventListener('click', (e) => { const t = e.target.closest && e.target.closest('[data-pkt]'); if (t) { pkTab = t.getAttribute('data-pkt'); pkDetail(pkShown || pkSel); $('pk-detail').scrollTop = 0; PH.audio.play('ui'); return; } const b = e.target.closest && e.target.closest('[data-ptip]'); const k = pkShown; if (!b || !GM.ARCH[k]) return; tipsEnter(b.getAttribute('data-ptip'), b.getAttribute('data-tn'), GM.ARCH[k].full, k); });
  $('btn-help-close').addEventListener('click', () => { show('help', false); clearPf(); });
  $('btn-pause').addEventListener('click', () => setPause(true));
  $('btn-resume').addEventListener('click', () => setPause(false));
  $('btn-restart').addEventListener('click', () => startMatch(true));
  $('btn-quit').addEventListener('click', toMenu);
  $('btn-again').addEventListener('click', () => startMatch(true));
  $('btn-menu').addEventListener('click', toMenu);
  $('btn-panel').addEventListener('click', () => togglePanel());
  $('tr-fold').addEventListener('click', () => togglePanel(false));
  $('tr-exit').addEventListener('click', toMenu);
  $('tr-reset-pos').addEventListener('click', () => GM.trainReset());
  // ---------- 球员信息卡 ----------
  const PC_WEIGHTS = {
    shooting: { three: 45, mid: 30, close: 15, fade: 10 },
    finishing: { lay: 45, dunk: 20, flo: 15, post: 10, sdunk: 5, hook: 5 },
    athleticism: { spd: 30, acc: 25, vert: 20, str: 15, sta: 10 },
    defense: { def: 35, intD: 30, blk: 20, stl: 15 },
    rebounding: { dreb: 60, oreb: 40 },
  };
  const PC_WEIGHTS_5 = {
    ...PC_WEIGHTS,
    shooting: { three: 40, mid: 25, close: 15, fade: 10, siq: 10 },
    playmaking: { hnd: 30, pac: 25, piq: 15, vis: 15, hands: 10, iq: 5 },
    defense: { def: 30, intD: 25, stl: 15, blk: 15, hlp: 10, ppc: 5 },
  };
  const PC_SHOOT = ['shooting', '投篮'], PC_FINISH = ['finishing', '终结'], PC_ATH = ['athleticism', '运动'];
  const PC_GUARD = ['defense', '防守'], PC_REB = ['rebounding', '篮板'];
  const PC_STEAL = ['stl', '抢断'], PC_BLOCK = ['blk', '盖帽'];
  const PC_SPEED = ['spd', '速度'];
  const PC_OFF = [['three', '三分'], ['mid', '中投'], ['dunk', '扣篮'], ['lay', '上篮'], ['hnd', '控球'], PC_SPEED];
  const PC_DEF = [['def', '外防'], ['intD', '内防'], PC_STEAL, PC_BLOCK, ['dreb', '后板'], PC_SPEED];
  const PC_OFF_5 = [PC_SHOOT, PC_FINISH, ['playmaking', '组织'], PC_ATH];
  function pcRating(key, r, raw, weights, heat) {
    const value = (k) => {
      const v = Number.isFinite(r[k]) ? A99(r[k]) : raw && raw[k];
      if (!Number.isFinite(v)) return null;
      return Math.min(99, Math.max(0, Math.round(v) + (k === 'three' || k === 'mid' ? heat : 0)));
    };
    if (!weights[key]) return value(key);
    let total = 0, used = 0;
    for (const [k, weight] of Object.entries(weights[key])) {
      const v = value(k);
      if (v != null) { total += v * weight; used += weight; }
    }
    return used ? Math.round(total / used) : null;
  }
  function pcCell(name, v, d) {
    const change = d > 0 ? '<sup>↑' + d + '</sup>' : d < 0 ? '<sup>↓' + (-d) + '</sup>' : '';
    return '<span>' + name + '<i class="' + vcl(v) + (d > 0 ? ' up' : d < 0 ? ' dn' : '') + '">' + (v == null ? '—' : v) + change + '</i></span>';
  }
  function pcRatings(pl, isOff, is5) {
    const weights = is5 ? PC_WEIGHTS_5 : PC_WEIGHTS;
    const base = pl.rBase || pl.r, raw = is5 ? r5Raw(pl.arch, pl) : null;
    const heat = is5 ? 0 : Math.round(GM.hcMod(pl) * 99);
    const keys = is5
      ? (isOff ? PC_OFF_5 : [PC_GUARD, PC_REB, PC_ATH, A99(base.stl) >= A99(base.blk) ? PC_STEAL : PC_BLOCK])
      : (isOff ? PC_OFF : PC_DEF);
    return keys.map(([k, name]) => {
      if (k === 'spd') return pcCell(name, pcRating(k, base, null, weights, 0), 0);
      const v = pcRating(k, pl.r, raw, weights, heat);
      const original = base !== pl.r || heat ? pcRating(k, base, raw, weights, 0) : v;
      return pcCell(name, v, v != null && original != null ? v - original : 0);
    }).join('');
  }
  function cardHTML(pl, isOff, st, is5 = false) {
    const a = pl.arch, tkOn = pl.tkOn > 0;
    const cells = pcRatings(pl, isOff, is5);
    const TD = tkOn && pl.tkT ? GM.TKD[pl.tkT] : null;
    const tkl = TD ? '<div class="pctki"><div class="tkh"><b>主宰 · ' + TD.n + '</b><span>' + Math.ceil(pl.tkOn) + '秒</span></div><div class="tkg">' + ['全属性 +5', TD.n + '类 +20'].concat(TD.ab, ['体力消耗 -30%']).map((x) => '<i>' + x + '</i>').join('') + '</div></div>' : '';
    const sl = st && is5 ? '<div class="pcs pcs5">' + [[st.pts, '分'], [st.fg + '/' + st.fga, '投'], [st.reb, '板'], [st.ast, '助'], [st.stl, '断'], [st.blk, '帽'], [st.tov, '误']].map((x) => '<b' + (x[0] === 0 ? ' class="z"' : '') + '>' + x[0] + '</b>' + x[1]).join('') + '</div>' : st ? '<div class="pcs"><b>' + st.pts + '</b>分<b>' + st.fg + '/' + st.fga + '</b>投<b>' + st.reb + '</b>板<b>' + st.blk + '</b>帽<b>' + st.stl + '</b>断</div>' : '';
    // V4.5 信息卡徽章行（1V1 / 5V5 同一套）：档位配色的六边形图标，正在触发的徽章高亮
    const bl = bList(pl, is5), hot = new Set((G.bpops || []).filter((x) => G.time - x.t0 < 1.8 && G.time >= x.t0 && G.players[x.pid] === pl).map((x) => x.key));
    const brow = bl.length ? '<div class="pcb" data-testid="pc-badges">' + bl.map((x) => '<span class="tr' + x[1] + (hot.has(x[0]) ? ' hot' : '') + '" title="' + GM.BADGES[x[0]].name + '">' + bHex(x[0], x[1]) + '</span>').join('') + '</div>' : '';
    const name = '<b>' + a.name + '</b>', ovr = '<em class="t' + TT[a.tier] + '">' + a.ovr + '</em>';
    const role = '<u class="' + (isOff ? 'ro' : 'rd') + '">' + (isOff ? '进攻' : '防守') + '</u>';
    const head = is5 ? name + role + ovr : '<span class="pc-id">' + name + ovr + '</span>' + role;
    return '<div class="pch">' + head + '</div>' + sl + '<div class="pcg">' + cells + '</div>' + brow + tkl + '<div class="pctk' + (tkOn ? ' on' : '') + '"><span>主宰</span><s><b style="width:' + Math.round(pl.tk) + '%"></b></s></div>';
  }
  function pcards() {
    for (let i = 0; i < 2; i++) {
      const el = $('pc' + i), pl = G.players[i];
      const on = screen === 'play' && opts.info === 'show' && pl && !pl.dummy && !(G.mode === 'train' && i === 1 && TR.dummy === 'none');
      el.classList.toggle('hidden', !on); if (!on) continue;
      const S = G.stats && G.stats[i];
      const html = cardHTML(pl, G.off === i, S && G.mode !== 'train' ? { pts: G.score[i], fg: S.fg, fga: S.fga, reb: S.reb, blk: S.blk, stl: S.stl } : null);
      el.classList.toggle('tk', pl.tkOn > 0);
      if (el._h !== html) { el._h = html; el.innerHTML = html; }
    }
    pcards5();
  }
  // V3.9g 5V5 信息卡：左上 = 我当前控制的球员，右上 = 他的直接对位（进攻时防我的人，防守时我防的人；没有就取最近的对手）
  function opp5(me) {
    const T = PH.T5.T, them = T.tm[1 - me.tm].on;
    let o = me.tm === T.off ? them.find((d) => d.mark === me) : me.mark;
    if (!o || them.indexOf(o) < 0) { let bd = 1e9; for (const d of them) { const dd = Math.hypot(d.x - me.x, d.y - me.y); if (dd < bd) { bd = dd; o = d; } } }
    return o;
  }
  // 5V5 数据 = rk.st（换下场时已结算的部分）+ G.stats（这次在场还没结算的部分），和数据面板 PH.T5.box() 同一算法
  function st5(pl) {
    const r = pl.rk && pl.rk.st, g = G.stats && G.stats[pl.id]; if (!r) return null;
    return { pts: r.pts, fg: r.fgm + (g ? g.fg : 0), fga: r.fga + (g ? g.fga : 0), reb: r.reb + (g ? g.reb : 0), blk: r.blk + (g ? g.blk : 0), stl: r.stl + (g ? g.stl : 0), ast: r.ast, tov: r.tov + (g ? g.tov : 0) };
  }
  function pcards5() {
    const T = screen === 'play5' && PH.T5 ? PH.T5.T : null, K = PH.render5 && PH.render5.k2;
    // 观战（CPU 对 CPU）时左卡跟持球人
    let me = T && T.tm ? (T.hum >= 0 ? T.ctl : PH.T5.holder() || pcards5.last) : null;
    if (T && T.tm && me && T.tm[me.tm].on.indexOf(me) < 0) me = null; pcards5.last = me;
    const on = !!me && opts.info === 'show' && T.phase !== 'over' && !PH.box5.isOpen() && !(T.cam.preset === '2k' && K && K.tip && K.tipE < 0.5);
    const ps = on ? [me, opp5(me)] : [null, null];
    for (let i = 0; i < 2; i++) {
      const el = $('pc5' + i), pl = ps[i], show1 = !!pl;
      el.classList.toggle('hidden', !show1); if (!show1) continue;
      // V3.9h：信息卡底部加体力条（和场上脚下金色体力条同一套体力值、同样配色，25 以下变红）
      const sv = Math.round(Math.max(0, Math.min(100, pl.stam))), fv = Math.round(Math.max(0, Math.min(60, (pl.rk && pl.rk.fat) || 0))), html = cardHTML(pl, pl.tm === T.off, st5(pl), true) + '<div class="pcst' + (sv > 25 ? '' : ' lo') + '" data-testid="pcst-' + i + '"><span>体力</span><s><b style="width:' + sv + '%"></b>' + (fv ? '<u style="width:' + fv + '%"></u>' : '') + '</s><i>' + sv + '</i></div>';
      el.classList.toggle('tk', pl.tkOn > 0);
      const c = T.tm[pl.tm].col.ui; if (el._c !== c) { el._c = c; el.style.setProperty(i ? 'border-right-color' : 'border-left-color', c); }
      if (el._h !== html) { el._h = html; el.innerHTML = html; }
    }
  }
  function toggleInfo() { opts.info = opts.info === 'show' ? 'hide' : 'show'; pcards(); refreshMenu(); camBody(); }
  // ---------- 镜头面板 ----------
  const CAMS = [['zoom', '拉近', 0.8, 1.8, 0.05], ['height', '机位高度', 3, 10, 0.1], ['dist', '镜头距离', 6, 14, 0.1], ['follow', '左右跟随', 0, 1, 0.05], ['pin', '推近力度', 0, 0.6, 0.02], ['plow', '压低程度', 0, 1, 0.05]];
  let camOpen = false, camWasPaused = false;
  function camBody() {
    if (!camOpen) return;
    $('cam-body').innerHTML = CAMS.map((c) => '<label class="crow"><span>' + c[1] + '</span><input type="range" data-cam="' + c[0] + '" min="' + c[2] + '" max="' + c[3] + '" step="' + c[4] + '" value="' + R.CAMV[c[0]] + '" data-testid="cam-' + c[0] + '"><b>' + (+R.CAMV[c[0]]).toFixed(2) + '</b></label>').join('').replace('<label class="crow"><span>推近力度', '<button class="cam-push" data-testid="cam-push">禁区推近 ' + (R.CAMV.push ? '开' : '关') + '</button><label class="crow"><span>推近力度');
    $('cam-info').textContent = '球员信息 ' + (opts.info === 'show' ? '显示' : '隐藏');
  }
  function toggleCam(on) {
    if (screen !== 'play') return;
    camOpen = on == null ? !camOpen : on; show('campanel', camOpen); $('cam-close').textContent = camFromSet ? '返回' : '关闭';
    if (camOpen) { camWasPaused = paused; if (G.mode !== 'train') paused = true; camBody(); }
    else if (camFromSet) { camFromSet = false; paused = true; setView('main'); show('pause', true); }
    else if (G.mode !== 'train') paused = camWasPaused;
  }
  $('btn-cam').addEventListener('click', () => { if (screen === 'play5') { setView('cam5'); return; } show('pause', false); camFromSet = true; toggleCam(true); });
  // 5V5 镜头设置（参考 2K：2K 镜头 / 转播 + 远近 0~10 + 高度 0~10（2K 镜头 0~20）；两种镜头各记一套，只存在内存里）
  function cam5Labels() { const C = PH.T5.CAMS; $('c5-preset').textContent = '镜头 ' + (C.preset === '2k' ? '2K 镜头' : '转播'); $('c5-z').textContent = '远近 ' + C.zoom; $('c5-h').textContent = '高度 ' + C.height; }
  $('c5-preset').addEventListener('click', () => { PH.T5.setCam({ preset: PH.T5.CAMS.preset === '2k' ? 'broadcast' : '2k' }); cam5Labels(); });
  $('c5-zm').addEventListener('click', () => { PH.T5.setCam({ zoom: PH.T5.CAMS.zoom - 1 }); cam5Labels(); });
  $('c5-zp').addEventListener('click', () => { PH.T5.setCam({ zoom: PH.T5.CAMS.zoom + 1 }); cam5Labels(); });
  $('c5-hm').addEventListener('click', () => { PH.T5.setCam({ height: PH.T5.CAMS.height - 1 }); cam5Labels(); });
  $('c5-hp').addEventListener('click', () => { PH.T5.setCam({ height: PH.T5.CAMS.height + 1 }); cam5Labels(); });
  $('c5-reset').addEventListener('click', () => { PH.T5.resetCam(); cam5Labels(); });
  $('cam-close').addEventListener('click', () => toggleCam(false));
  let camFromSet = false;
  $('cam-reset').addEventListener('click', () => { R.setCam(R.CAM_DEF); camBody(); });
  $('cam-info').addEventListener('click', () => toggleInfo());
  $('cam-body').addEventListener('input', (e) => { const k = e.target.getAttribute('data-cam'); if (!k) return; const v = +e.target.value; R.setCam({ [k]: v }); e.target.nextElementSibling.textContent = v.toFixed(2); });
  $('cam-body').addEventListener('change', (e) => { if (e.target.blur) e.target.blur(); });
  $('cam-body').addEventListener('click', (e) => { if (!e.target.closest || !e.target.closest('.cam-push')) return; R.setCam({ push: R.CAMV.push ? 0 : 1 }); camBody(); });
  function toggleMusic() { PH.audio.setMusic(!PH.audio.musicOn); setLabels(); }
  $('btn-music').addEventListener('click', () => toggleMusic());
  document.addEventListener('click', (e) => { if (e.target.tagName === 'BUTTON') e.target.blur(); });

  // ---------- 训练场面板 ----------
  let trTab = 'dummy', ctl = [];
  const pct = (v) => Math.round(v * 100) + '', m2 = (v) => v.toFixed(2), m1 = (v) => v.toFixed(1);
  function sld(label, get, set, min, max, step, fmt, note) {
    const rating = fmt === A99, cl = rating ? vcl(A99(get())) : '';
    const i = ctl.length; ctl.push({ get: get, set: set, fmt: fmt, rating: rating });
    return '<div class="sl"><label>' + label + '</label><output class="' + cl + '" id="o' + i + '">' + fmt(get()) + '</output><input class="' + cl + '" type="range" data-c="' + i + '" min="' + min + '" max="' + max + '" step="' + step + '" value="' + get() + '"' + ' aria-label="' + label + '">' + (note ? '<small>' + note + '</small>' : '') + '</div>';
  }
  // 球员下拉：按球队分组（全名单太长，按钮放不下）
  function selArch(label, cur, key) {
    const N = GM.NBA || {}, grp = {}; GM.ROSTER.forEach((k) => { const a = GM.ARCH[k], g = a.tier === 'rook' ? '新秀' : a.team && N[a.team] ? (a.team === 'LEG' ? '传奇' : N[a.team].city + N[a.team].name) : '其他'; (grp[g] = grp[g] || []).push(k); });
    const o = (k) => '<option value="' + k + '"' + (k === cur ? ' selected' : '') + '>' + GM.ARCH[k].name + ' ' + GM.ARCH[k].ovr + '</option>';
    return '<div class="tl">' + label + '</div><select class="tsel" data-sel="' + key + '" data-testid="tr-' + key + '">' + Object.keys(grp).map((g) => '<optgroup label="' + g + '">' + grp[g].map(o).join('') + '</optgroup>').join('') + '</select>';
  }
  function segb(label, cur, list, key) { return '<div class="tl">' + label + '</div><div class="tseg" data-k="' + key + '">' + list.map((o) => '<button data-v="' + o[0] + '" data-testid="tr-' + key + '-' + o[0] + '"' + (String(cur) === String(o[0]) ? ' class="on"' : '') + '>' + o[1] + '</button>').join('') + '</div>'; }
  const RULES = [
    ['shotClock', '进攻时间（秒，0 为不限）', 0, 35, 1, (v) => (v ? v + '' : '不限'), '比赛模式生效；训练进攻时不计时'],
    ['shotIdeal', '投篮条到绿区用时（秒）', 0.3, 0.9, 0.01, m2, '越大出手越慢'],
    ['greenBase', '绿区基础宽度', 0.04, 0.3, 0.01, m2, '完美出手的时间窗口'],
    ['greenRating', '能力值对绿区的加成', 0, 0.3, 0.01, m2, ''],
    ['greenContest', '干扰对绿区的压缩', 0, 0.3, 0.01, m2, ''],
    ['greenHeavy', '严重干扰下完美出手命中率', 0.3, 1, 0.01, pct, '%'],
    ['lateSlope', '时机偏差的惩罚力度', 0.3, 1.5, 0.05, m2, '越大，早了晚了越难进'],
    ['contestRange', '干扰生效距离（米）', 1.5, 4, 0.1, m1, ''],
    ['contestShot', '干扰对跳投命中的影响', 0, 1, 0.05, m2, ''],
    ['contestLay', '干扰对上篮命中的影响', 0, 1, 0.05, m2, ''],
    ['blockMul', '盖帽概率倍率', 0, 2.5, 0.1, m1, ''],
    ['stealMul', '抢断概率倍率', 0, 3, 0.1, m1, ''],
    ['ankle', '晃开防守人概率倍率', 0, 3, 0.1, m1, ''],
    ['stunMul', '被晃后的硬直时长倍率', 0, 3, 0.1, m1, ''],
    ['speedMul', '移动速度倍率', 0.6, 1.5, 0.05, m2, ''],
    ['sprintDrain', '加速每秒体力消耗', 0, 40, 1, m1, ''],
    ['moveCost', '运球动作体力消耗', 0, 20, 1, m1, ''],
    ['stamRegen', '体力恢复倍率', 0, 3, 0.1, m1, ''],
  ];
  const ATTR = GM.ATTRS;
  function buildPanel() {
    if (G.mode !== 'train') return;
    // V4.0 判定参数已迁入调参台（规则组），训练面板不再重复
    { const mv = !!(PH.TUNE && PH.TUNE.list('rules').length), rb = $('tr-tabs').querySelector('[data-t="rules"]'); if (rb) rb.classList.toggle('hidden', mv); if (mv && trTab === 'rules') trTab = 'dummy'; }
    ctl = [];
    const me = G.players[0], dm = G.players[1]; let h = '';
    if (trTab === 'dummy') {
      h += segb('练习内容', TR.role, [['off', '我进攻'], ['def', '我防守']], 'role');
      if (TR.role === 'off') {
        h += segb('假人防守方式', TR.dummy, [['none', '无人'], ['stand', '站桩'], ['hands', '举手干扰'], ['follow', '贴身跟防'], ['block', '跟防并封盖'], ['ai', '全力防守']], 'dummy');
        h += '<div class="tbtns"><button id="tr-place" data-testid="tr-place">假人移到我面前</button></div>';
        h += sld('防守距离（米）', () => TR.gap, (v) => { TR.gap = v; if (TR.dummy === 'stand' || TR.dummy === 'hands') GM.placeDummy(); }, 0.6, 3, 0.1, m1, '假人和你之间保持的距离');
        h += sld('反应时间（秒）', () => TR.react, (v) => { TR.react = v; GM.applyTrain(); }, 0.05, 0.6, 0.01, m2, '跟防的迟滞和起跳封盖的延迟');
        h += sld('吃晃概率', () => TR.bite, (v) => { TR.bite = v; GM.applyTrain(); }, 0, 1, 0.05, pct, '% 被假动作骗起跳、被运球晃开的概率');
        h += sld('假人身高（米）', () => dm.h, (v) => { dm.h = v; }, 1.7, 2.25, 0.01, m2, '');
        h += sld('假人外线防守', () => dm.r.def, (v) => { dm.r.def = v; }, 0, 1, 0.01, A99, '影响干扰强度');
        h += sld('假人盖帽', () => dm.r.blk, (v) => { dm.r.blk = v; }, 0, 1, 0.01, A99, '影响盖帽概率');
        h += sld('假人力量', () => dm.r.str, (v) => { dm.r.str = v; }, 0, 1, 0.01, A99, '影响背打时能否顶开');
      } else {
        h += segb('电脑难度', G.diff, [[0, '简单'], [1, '普通'], [2, '困难']], 'diff');
        h += selArch('电脑球员', dm.arch.key, 'cpuarch');
        h += '<p class="tnote">电脑每回合从弧顶开始进攻，你来防守。进球、抢断或抢到篮板后自动重新开始。</p>';
      }
    } else if (trTab === 'player') {
      h += selArch('套用球员', me.arch.key, 'myarch');
      h += '<p class="tnote">套用后属性、徽章、必杀技和外形一起换；下面的滑块只改属性。</p>';
      for (const a of ATTR) h += sld(a[1], () => me.r[a[0]], (v) => { me.r[a[0]] = v; }, 0, 1, 0.01, A99, a[2]);
      h += sld('身高（米）', () => me.h, (v) => { me.h = v; }, 1.7, 2.25, 0.01, m2, '');
      h += segb('体力', TR.infStam ? 1 : 0, [[0, '正常消耗'], [1, '无限体力']], 'stam');
    } else if (trTab === 'rules') {
      h += '<p class="tnote" style="margin-top:0">这些参数立即生效，并且在本次打开网页期间对正式比赛同样生效；刷新网页后恢复默认。</p>';
      for (const r of RULES) h += sld(r[1], () => CFG[r[0]], (v) => { CFG[r[0]] = v; }, r[2], r[3], r[4], r[5], r[6] === '%' ? '' : r[6]);
      h += '<div class="tbtns"><button id="tr-default" data-testid="tr-default">恢复默认</button><button id="tr-exp" data-testid="tr-exp">导出当前参数</button></div><textarea id="tr-export" class="hidden" readonly aria-label="导出的参数"></textarea>';
    } else {
      h += '<div id="tr-dyn"></div><div class="tbtns"><button id="tr-clear" data-testid="tr-clear">统计清零</button></div>';
    }
    $('tr-body').innerHTML = h;
    $('tr-tabs').querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.getAttribute('data-t') === trTab));
    if (trTab === 'stats') statsDyn();
  }
  function statsDyn() {
    const el = $('tr-dyn'); if (!el) return;
    const S = TR.stats, me = G.players[0], dm = G.players[1], p = (m, a) => (a ? Math.round((m / a) * 100) + '%' : '—');
    const bar = (lab, m, a, cls) => '<div class="st-row"><span>' + lab + '</span><div class="st-bar"><i class="' + (cls || '') + '" style="width:' + (a ? (m / a) * 100 : 0) + '%"></i></div><b>' + m + ' / ' + a + ' · ' + p(m, a) + '</b></div>';
    const tb = (lab, n, cls) => '<div class="st-row"><span>' + lab + '</span><div class="st-bar"><i class="' + cls + '" style="width:' + (S.n ? (n / S.n) * 100 : 0) + '%"></i></div><b>' + n + ' 次</b></div>';
    const ci = GM.contestInfo(me, dm), d = GM.distHoop(me);
    el.innerHTML = '<div class="st-big">' + p(S.made, S.n) + ' <small>命中率 · ' + S.made + ' / ' + S.n + '</small></div>' +
      '<div class="tl">当前位置</div><div class="st-last"><span>距篮筐 ' + d.toFixed(1) + ' 米 · ' + (GM.isThree(me.x, me.y) ? '三分区' : d < 3.7 ? '篮下' : '中距离') + '</span><span>干扰 ' + Math.round(ci.c * 100) + '%' + (ci.c > 0.04 ? ' · ' + ci.src : '') + '</span></div>' +
      '<div class="tl">分区命中</div>' + bar('三分', S.zones.three[0], S.zones.three[1]) + bar('中投', S.zones.mid[0], S.zones.mid[1]) + bar('篮下', S.zones.lay[0], S.zones.lay[1]) +
      '<div class="tl">出手时机分布</div>' + tb('过早', S.timing[0], 'r') + tb('稍早', S.timing[1], 'y') + tb('完美', S.timing[2], 'g') + tb('稍晚', S.timing[3], 'y') + tb('过晚', S.timing[4], 'r') +
      '<div class="tl">其他</div><div class="st-last"><span>平均受干扰 ' + (S.n ? Math.round((S.sumC / S.n) * 100) : 0) + '%</span><span>被盖 ' + S.blocked + ' 次</span></div>' +
      '<div class="tl">最近出手</div>' + (S.last.length ? S.last.map((x) => '<div class="st-last ' + (x.made ? 'ok' : 'no') + '"><span>' + x.name + ' · ' + x.tl + '</span><span>' + (x.made ? '命中' : '未进') + ' ' + Math.round(x.prob * 100) + '%</span></div>').join('') : '<div class="tnote">还没有出手</div>');
  }
  function copyArch(pl, key) { const a = GM.ARCH[key]; Object.assign(pl.r, a, { badges: a.badges.slice(), sig: Object.assign({}, a.sig) }); pl.h = a.h; pl.arch = a; pl.sk.cd = 0; pl.sk.ready = false; pl.sk.streak = 0; Object.assign(pl.col, GM.lookOf(a)); }
  $('tr-tabs').addEventListener('click', (e) => { const t = e.target.getAttribute && e.target.getAttribute('data-t'); if (t) { trTab = t; buildPanel(); $('tr-body').scrollTop = 0; } });
  $('tr-body').addEventListener('input', (e) => {
    const i = e.target.getAttribute('data-c'); if (i == null) return;
    const c = ctl[+i], v = +e.target.value; c.set(v); $('o' + i).textContent = c.fmt(v);
    if (c.rating) {
      const cl = vcl(A99(v));
      for (const el of [$('o' + i), e.target]) {
        for (const name of Array.from(el.classList)) if (name.startsWith('rating-')) el.classList.remove(name);
        el.classList.add(cl);
      }
    }
  });
  $('tr-body').addEventListener('change', (e) => {
    const sk = e.target.getAttribute && e.target.getAttribute('data-sel'), v = e.target.value;
    if (sk === 'cpuarch') copyArch(G.players[1], v);
    else if (sk === 'myarch') { copyArch(G.players[0], v); $('n0').textContent = '你 · ' + GM.ARCH[v].name; }
    if (sk) { PH.audio.play('ui'); buildPanel(); }
    if (e.target.blur) e.target.blur(); });
  $('tr-body').addEventListener('click', (e) => {
    const t = e.target; if (t.tagName !== 'BUTTON') return;
    const seg = t.parentElement.getAttribute('data-k'), v = t.getAttribute('data-v');
    if (seg) {
      if (seg === 'role') { TR.role = v; GM.applyTrain(); GM.trainReset(); G.lastShot = null; hintKey = ''; }
      else if (seg === 'dummy') { const was = TR.dummy; TR.dummy = v; GM.applyTrain(); if (was === 'none' || v === 'stand' || v === 'hands') GM.placeDummy(); }
      else if (seg === 'diff') G.diff = +v;
      else if (seg === 'cpuarch') { copyArch(G.players[1], v); }
      else if (seg === 'myarch') { copyArch(G.players[0], v); $('n0').textContent = '你 · ' + GM.ARCH[v].name; }
      else if (seg === 'stam') TR.infStam = v === '1';
      PH.audio.play('ui'); buildPanel(); return;
    }
    if (t.id === 'tr-place') GM.placeDummy();
    else if (t.id === 'tr-default') { Object.assign(CFG, GM.CFG_DEF); buildPanel(); }
    else if (t.id === 'tr-clear') { TR.stats = GM.newTrainStats(); statsDyn(); }
    else if (t.id === 'tr-exp') {
      const me = G.players[0], dm = G.players[1], r3 = (v) => Math.round(v * 1000) / 1000, pk = (pl) => { const o = { 身高: r3(pl.h) }; for (const a of ATTR) o[a[1]] = Math.round(pl.r[a[0]] * 100); return o; };
      const diff = {}; for (const k in CFG) if (CFG[k] !== GM.CFG_DEF[k]) diff[k] = r3(CFG[k]);
      const ta = $('tr-export'); ta.classList.remove('hidden');
      ta.value = JSON.stringify({ 判定参数_全部: CFG, 判定参数_已改动: diff, 我的球员: pk(me), 假人: Object.assign(pk(dm), { 方式: TR.dummy, 距离: TR.gap, 反应: TR.react, 吃晃概率: TR.bite }) }, null, 1);
      ta.focus(); ta.select();
    }
  });

  // ---------- HUD ----------
  const floatsEl = $('floats'), fpool = [];
  for (let i = 0; i < 6; i++) { const d = document.createElement('div'); d.style.display = 'none'; floatsEl.appendChild(d); fpool.push(d); }
  const cues = [0, 1].map(() => { const d = document.createElement('div'); d.className = 'cue'; d.style.display = 'none'; floatsEl.appendChild(d); return d; });
  let lastTB2 = '', hintKey = '', overShown = false, lastS0 = -1, lastS1 = -1, lastClock = '', cardId = -1, frameN = 0, lastTB = '';
  function who(id) { return G.mode === '2p' ? '玩家 ' + (id + 1) : G.players[id].ctrl === 'cpu' ? (G.players[id].dummy ? '假人' : '电脑') : '你'; }
  function shotCard() {
    const L = G.lastShot, el = $('shotcard');
    if (!L || G.mode === 'demo' || opts.fb !== 'detail' || (G.mode !== 'train' && G.time - L.time > 3.6) || G.phase === 'over') { el.classList.add('hidden'); cardId = -1; return; }
    if (L.id === cardId) return;
    cardId = L.id;
    const res = L.blocked ? '被盖帽' : L.made ? '命中' : '未进', pc = Math.round(L.prob * 100);
    let h = '<div class="sc-h" style="color:' + G.players[L.who].team.css + '"><span>' + who(L.who) + ' · ' + L.name + '</span><em>' + L.pts + ' 分</em></div><div class="sc-res">' + res + '</div>';
    if (L.e != null) {
      const gw = Math.min(1, L.gw || 0.1);
      h += '<div class="sc-track"><i style="left:' + (50 - gw * 50) + '%;width:' + gw * 100 + '%"></i><u style="left:' + ((L.e + 1) * 50) + '%"></u></div><div class="sc-ends"><span>早</span><span>绿区</span><span>晚</span></div>';
      h += '<div class="sc-r"><span>时机</span><b class="' + (L.green ? 'good' : Math.abs(L.e) > 0.6 ? 'bad' : 'mid') + '">' + L.tl + '</b></div>';
    }
    h += '<div class="sc-r"><span>干扰</span><b class="' + (L.contest < 0.2 ? 'good' : L.contest < 0.5 ? 'mid' : 'bad') + '">' + Math.round(L.contest * 100) + '%' + (L.src ? ' · ' + L.src : ' · 空位') + '</b></div>';
    h += '<div class="sc-r"><span>距离</span><b>' + L.dist.toFixed(1) + ' 米</b></div>';
    h += '<div class="sc-r"><span>体力</span><b class="' + (L.stamLow ? 'bad' : 'good') + '">' + (L.stamLow ? '不足' : '正常') + '</b></div>';
    if (!L.blocked) h += '<div class="sc-r"><span>命中率</span><b class="' + (pc >= 60 ? 'good' : pc >= 35 ? 'mid' : 'bad') + '">' + pc + '%</b></div>';
    h += '<div class="sc-why"><span>' + (L.made ? '结果：' : '原因：') + '</span>' + L.reason + '</div>';
    el.innerHTML = h; el.className = L.made ? 'made' : 'miss';
  }
  // V3.9r 徽章档位只用颜色区分（.bchip.tr1–tr4 = 铜 / 银 / 金 / 名人堂），名字不带档位文字。
  // 档位：x.tier → 名字后缀「·铜/银/金/名人堂」（去掉）→ 1V1 徽章按持有者能力算（同 game.js btier）→ 默认金
  const TRN = ['铜', '银', '金', '名人堂'];
  function bTier(x) {
    let n = String(x.name || ''), t = x.tier | 0; const m = n.match(/·(铜|银|金|名人堂)$/);
    if (m) { n = n.slice(0, m.index); if (!t) t = TRN.indexOf(m[1]) + 1; }
    if (!t) { const pl = G.players[x.pid], f = GM.BADGE_TIER && GM.BADGE_TIER[x.key], a = pl && pl.arch; if (f && a && pl.r && pl.r.badges && pl.r.badges.indexOf(x.key) >= 0) t = Math.max(1, Math.min(4, f(a) | 0)); }
    return { n: n, t: t >= 1 && t <= 4 ? t : 3 };
  }
  // V4.5 徽章统一显示：弹出芯片、信息卡徽章行、选人能力卡共用 bHex / bLv / bList
  // bLv(o, k)：o = 球员（1V1 / 5V5）或 ARCH 条目 → 0 没有 / 1 铜 / 2 银 / 3 金 / 4 名人堂（同 game.js btier、b5.js tiersOf、team5 csT）
  function bLv(o, k) {
    const a = (o && o.arch) || o, B = GM.BADGES[k], F = GM.BADGE_TIER || {}; if (!a || !B) return 0;
    if (k === 'cs') return o.csT != null ? o.csT | 0 : F.cs ? F.cs(a) | 0 : 0;
    if (B.five) return PH.B5 && PH.B5.tiersOf ? PH.B5.tiersOf(a)[k] | 0 : 0;
    const L = (o.r && o.r.badges) || a.badges || []; if (L.indexOf(k) < 0) return 0;
    return F[k] ? Math.max(1, Math.min(4, F[k](a) | 0)) : 3;
  }
  // bList(o, five)：[[key, 档位]]，1V1 徽章在前；five = 加上 5V5 专属徽章（接球投篮 + b5.js 的 11 个）
  function bList(o, five) {
    const a = (o && o.arch) || o, out = []; if (!a) return out;
    for (const k of (o.r && o.r.badges) || a.badges || []) { const t = bLv(o, k); if (t) out.push([k, t]); }
    if (five) for (const k of ['cs'].concat((PH.B5 && PH.B5.KEYS) || [])) { const t = bLv(o, k); if (t) out.push([k, t]); }
    return out;
  }
  const bHex = (k, t) => '<i class="bhex tr' + (t || 3) + '">' + (IC.has(k) ? IC.svg(k) : String((GM.BADGES[k] || {}).name || k)[0]) + '</i>';
  // 徽章触发：每条约 1.8 秒，P1 左下 / P2 右下
  const bEls = new Map();
  function bpops() {
    const L = (G.bpops || []).filter((x) => G.time - x.t0 < 1.8 && G.time >= x.t0), live = new Set();
    for (const x of L) {
      const id = x.pid + x.key + x.t0.toFixed(3); live.add(id);
      let el = bEls.get(id);
      if (!el) { el = document.createElement('div'); el.className = 'bchip'; const b = bTier(x); el.className = 'bchip tr' + b.t; el.innerHTML = bHex(x.key, b.t) + '<span>' + b.n + '</span>'; $('bcol' + x.pid).appendChild(el); bEls.set(id, el); }
      el.classList.toggle('out', G.time - x.t0 > 1.5);
    }
    for (const [id, el] of bEls) if (!live.has(id)) { el.remove(); bEls.delete(id); }
  }
  // V3.9h 5V5 徽章弹出：按球员所属队放左右两列，芯片前带名字
  const bEls5 = new Map();
  function bpops5() {
    const T = PH.T5.T, L = (G.bpops || []).filter((x) => G.time - x.t0 < 1.8 && G.time >= x.t0 && G.players[x.pid]), live = new Set();
    for (const x of L) {
      const id = x.pid + x.key + x.t0.toFixed(3), pl = G.players[x.pid], t = pl.tm === 1 ? 1 : 0; live.add(id);
      let el = bEls5.get(id);
      if (!el) { el = document.createElement('div'); el.className = 'bchip'; el.style.setProperty(t ? 'border-right-color' : 'border-left-color', T.tm && T.tm[t] ? T.tm[t].col.ui : ''); const b = bTier(x); el.className = 'bchip tr' + b.t; el.innerHTML = bHex(x.key, b.t) + '<span><small>' + ((pl.a || pl.arch).name) + '</small>' + b.n + '</span>'; $('bcol5' + t).appendChild(el); bEls5.set(id, el); }
      el.classList.toggle('out', G.time - x.t0 > 1.5);
    }
    for (const [id, el] of bEls5) if (!live.has(id)) { el.remove(); bEls5.delete(id); }
  }
  let padPrev = false;
  function padAny() { const ps = PH.input.pads(); let on = false; for (const p of ps) if (p && p.buttons) for (const b of p.buttons) if (b.pressed) on = true; const e = on && !padPrev; padPrev = on; return e; }
  function drawFloats() {
    // 浮字（互相避让，避开 LED 横幅）
    const placed = [], ly = R.ledY, sbE = $('scorebar');
    // 比分条在画布上的区域（逻辑坐标），浮字压到上面时挪到比分条下方
    let sb = null;
    if (sbE && sbE.offsetParent && screen === 'play') { const cv = stage.getBoundingClientRect(), r = sbE.getBoundingClientRect(); if (r.width) sb = { x0: (r.left - cv.left) / scale, x1: (r.right - cv.left) / scale, y1: (r.bottom - cv.top) / scale }; }
    for (let i = fpool.length - 1; i >= 0; i--) {
      const f = G.floats[i], d = fpool[i];
      if (!f) { d.style.display = 'none'; continue; }
      const p = R.proj(f.x, f.y, f.z + f.t * 0.5), pw = (f.shot ? 44 : f.text.length * 7 + 6) / 2, ph = f.shot ? 26 : 13;
      let y = p.y;
      const inSb = (yy) => sb && p.x + pw > sb.x0 && p.x - pw < sb.x1 && yy - ph < sb.y1 + 1;
      if (inSb(y)) y = sb.y1 + 2 + ph;
      for (let g = 0; g < 4; g++) { const hit = placed.find((q) => Math.abs(q.x - p.x) < q.w + pw && y > q.y - q.h - 1 && y - ph < q.y + 1); if (!hit) break; y = hit.y - hit.h - 2; if (inSb(y)) y = hit.y + ph + 2; }
      if (ly > -50 && y > ly - 1 && y - ph < ly + 21) y = y - ph / 2 < ly + 10 ? ly - 1 : ly + 21 + ph;
      if (inSb(y)) y = sb.y1 + 2 + ph;
      placed.push({ x: p.x, y: y, w: pw, h: ph }); p.y = y;
      d.style.display = 'block';
      if (f.shot) { d.className = 'sfb'; d.style.display = 'flex'; d.innerHTML = '<b style="color:' + f.color + '">' + f.text + '</b><span style="color:' + f.subColor + '">' + f.sub + '</span>'; d.style.color = ''; }
      else { d.className = ''; d.textContent = f.text; d.style.color = f.color; }
      d.style.left = Math.max(40, Math.min(R.W - 40, p.x)) * scale + 'px'; d.style.top = Math.max(26, p.y) * scale + 'px';
      d.style.opacity = f.t > 1 ? String(Math.max(0, 1 - (f.t - 1) / 0.3)) : '1';
    }
  }
  function hud() {
    frameN++;
    stage.classList.toggle('replay', !!(G.replay && screen === 'play'));
    if (frameN % 30 === 0) { const hp = PH.input.pads().length > 0; if (hp !== hasPad) { hasPad = hp; show('padtag', hp); hintKey = ''; } }
    if (screen === 'tips') { drawFloats(); return; }
    if (screen !== 'play') { for (const d of fpool) d.style.display = 'none'; return; }
    const train = G.mode === 'train';
    if (frameN % 10 === 0) pcards();
    bpops();
    if (G.score[0] !== lastS0) { lastS0 = G.score[0]; $('s0').textContent = lastS0; }
    if (G.score[1] !== lastS1) { lastS1 = G.score[1]; $('s1').textContent = lastS1; }
    const c = CFG.shotClock > 0 ? String(Math.max(0, Math.ceil(G.shotClock))) : '--';
    if (c !== lastClock) { lastClock = c; $('clock').textContent = c; $('clock').classList.toggle('low', CFG.shotClock > 0 && G.shotClock <= 5); }
    { const gl = G.glen > 0 && G.mode !== 'train', gc = Math.ceil(G.gclock || 0), tt = G.sd ? '加时 · 下一球胜' : (gl ? Math.floor(gc / 60) + ':' + String(gc % 60).padStart(2, '0') + ' · ' : '') + (G.mp >= 0 ? '赛点' : '先到 ' + G.target + ' 分');
      if (tt !== lastTB2) { lastTB2 = tt; const el = $('target'); el.textContent = tt; el.classList.toggle('mp', G.mp >= 0 || !!G.sd); el.classList.toggle('low', gl && gc <= 10); } }
    show('notice', G.needClear && G.phase === 'live' && G.ball.state === 'held' && G.players[G.off].ctrl !== 'cpu');
    $('notice').classList.toggle('ping', G.time - (G.clearPing || -9) < 0.45);
    if (train && frameN % 12 === 0) {
      const S = TR.stats, t = TR.role === 'def' ? '自由训练 · 练防守 · 电脑得分 <b>' + G.score[1] + '</b>' : '自由训练 · 出手 <b>' + S.n + '</b> 命中 <b>' + S.made + '</b> 命中率 <b>' + (S.n ? Math.round((S.made / S.n) * 100) + '%' : '—') + '</b>';
      if (t !== lastTB) { lastTB = t; $('trainbar').innerHTML = t; }
      if (panelOpen && trTab === 'stats') statsDyn();
    }
    // 操作提示
    const two = G.mode === '2p', off = G.off === 0, post = off && G.players[0].post;
    const key = (two ? '2' : '1') + (off ? 'o' : 'd') + (post ? 'p' : '') + (hasPad ? 'g' : '') + (train ? 't' : '');
    if (key !== hintKey) {
      hintKey = key;
      const kb = hasPad ? { a1: 'X', a2: 'Y', a3: 'A', po: 'LT', sp: 'RT', st: 'LT', d1: 'Y', d2: 'X' } : { a1: 'J', a2: 'K', a3: 'L', po: 'Q', sp: 'Shift', st: '按住 L', d1: 'J', d2: 'K' };
      const O = '<b>' + kb.a1 + '</b> 投篮/突破上篮 <b>' + kb.a2 + '</b> 扣篮/终结 <b>' + kb.a3 + '</b>+方向 运球动作／中立按住 犹豫步 <b>' + kb.po + '</b> 背打 <b>' + kb.sp + '</b> 加速';
      const P = '背打中　<b>' + kb.a1 + '</b> 勾手 / 按住后方向后仰 <b>' + kb.a2 + '</b> 转身终结　松开时按左右 转身';
      const D = '<b>' + kb.d1 + '</b> 封盖 <b>' + kb.d2 + '</b> 抢断 <b>' + kb.st + '</b> 举手干扰 <b>' + kb.sp + '</b> 加速';
      show('hint', train || opts.fb === 'detail');
      $('hint').innerHTML = two ? '玩家 1：WASD + J K L，Q 背打　玩家 2：方向键 + 小键盘 1 2 3，O 背打' : (post ? P : off ? '进攻　' + O : '防守　' + D) + (train ? '　<b>' + (hasPad ? 'View' : 'Tab') + '</b> 参数 <b>R</b> 重置' : '');
      if (isTouch) { $('tb1').textContent = off ? '投篮' : '盖帽'; $('tb2').textContent = off ? '终结' : '抢断'; $('tb3').textContent = off ? '运球' : '姿态'; $('tbalt').textContent = '背打'; show('tbalt', off); }
    }
    // 终结提示（脚下）
    for (let i = 0; i < 2; i++) {
      const pl = G.players[i], d = cues[i], c = pl && pl.cue;
      if (!c) { d.style.display = 'none'; continue; }
      const kb2 = G.mode === '2p' ? null : hasPad ? { a1: 'X', a2: 'Y' } : { a1: 'J', a2: 'K' };
      const simple = opts.fb !== 'detail' && !train;
      if (simple && c === 'flo') { d.style.display = 'none'; continue; }
      const t = c === 'dunk' ? (simple ? '扣' : '可扣篮') : c === 'lay' ? (simple ? '上篮' : '可上篮') : '抛投距离';
      const k = !kb2 || simple ? '' : (c === 'dunk' ? kb2.a2 : c === 'lay' ? kb2.a1 + '/' + kb2.a2 : kb2.a1) + ' ';
      const p = R.proj(pl.x, pl.y - 0.55, 0);
      d.style.display = 'block'; d.textContent = k + t; d.className = 'cue ' + c;
      d.style.left = Math.max(40, Math.min(R.W - 40, p.x)) * scale + 'px'; d.style.top = Math.min(R.H - 6, p.y + 0.45 * p.s + 10) * scale + 'px';
    }
    drawFloats();
    const b = G.banner, be = $('banner');
    if (b) { if (be.classList.contains('hidden') || be.firstElementChild.textContent !== b.text) { be.classList.remove('hidden'); be.style.animation = 'none'; void be.offsetWidth; be.style.animation = ''; } be.firstElementChild.textContent = b.text; be.firstElementChild.style.color = b.color; be.lastElementChild.textContent = b.sub; be.style.borderLeftColor = b.color; }
    else be.classList.add('hidden');
    const hr = G.hero, he = $('hero');
    if (hr && G.time - hr.t0 < hr.T && G.time >= hr.t0) {
      if (he.classList.contains('hidden') || he.dataset.k !== String(hr.t0)) { he.dataset.k = String(hr.t0); he.classList.remove('hidden'); he.style.animation = 'none'; void he.offsetWidth; he.style.animation = ''; he.querySelector('b').textContent = hr.text; he.querySelector('span').textContent = hr.sub; he.style.setProperty('--hc', hr.col); he.classList.toggle('lite', !!hr.lite); }
      he.classList.toggle('out', G.time - hr.t0 > hr.T - 0.4);
    } else if (!he.classList.contains('hidden')) he.classList.add('hidden');
    shotCard();
    if (G.phase === 'over' && !overShown && G.phaseT > 1.6) { overShown = true; showOver(); }
    if (G.phase !== 'over') overShown = false;
  }
  // ---------- 结算面板（参考赛况台：Box / 9-Cat / 11-Cat，可叠加高阶数据与高亮） ----------
  const BX = { view: 'box', adv: false, heat: true };
  const pc = (m, a) => (a > 0 ? m / a : null), fp = (v) => (v == null ? '-' : (v * 100).toFixed(v >= 1 ? 0 : 1) + '%');
  function bxStat(i) {
    const x = G.stats[i], pts = G.score[i], poss = Math.max(1, x.fga - x.oreb + x.tov);
    return Object.assign({}, x, { pts: pts, poss: poss, two: x.fg - x.tp, twoa: x.fga - x.tpa,
      fgp: pc(x.fg, x.fga), tpp: pc(x.tp, x.tpa), inp: pc(x.inm, x.ina), ts: pc(pts, 2 * x.fga), efg: pc(x.fg + 0.5 * x.tp, x.fga), tpar: pc(x.tpa, x.fga), ppp: pts / poss,
      gms: pts + 0.4 * x.fg - 0.7 * x.fga + 0.7 * x.oreb + 0.3 * x.dreb + x.stl + 0.7 * x.blk - x.tov });
  }
  // 列：[标题, 取值, 显示, 说明, 选项]  选项 low = 越少越好；el = 精英阈值；bad = 拖后腿阈值；q = 样本门槛
  const C = {
    PTS: ['得分', (p) => p.pts, null, '得分', { el: (p) => p.pts >= 21 && p.fgp >= 0.55 }],
    FG: ['投篮', (p) => p.fgp, (p) => p.fg + '/' + p.fga, '投篮命中 / 出手', { el: (p) => p.fga >= 8 && p.fgp >= 0.65, bad: (p) => p.fga >= 6 && p.fgp < 0.35 ? (p.fgp < 0.25 ? 2 : 1) : 0 }],
    '3P': ['三分', (p) => p.tpp, (p) => p.tp + '/' + p.tpa, '三分命中 / 出手', { el: (p) => p.tpa >= 4 && p.tpp >= 0.5, bad: (p) => p.tpa >= 4 && p.tpp < 0.2 ? 1 : 0 }],
    IN: ['内线', (p) => p.inp, (p) => p.inm + '/' + p.ina, '上篮 / 扣篮 / 补篮 命中 / 出手', { el: (p) => p.ina >= 5 && p.inp >= 0.75 }],
    REB: ['篮板', (p) => p.reb, (p) => p.reb + '<small>' + p.oreb + '前</small>', '篮板（其中前场板）', { el: (p) => p.reb >= 10 }],
    STL: ['抢断', (p) => p.stl, null, '抢断', { el: (p) => p.stl >= 4 }],
    BLK: ['盖帽', (p) => p.blk, null, '盖帽', { el: (p) => p.blk >= 4 }],
    TO: ['失误', (p) => p.tov, null, '失误（被断、违例、进攻时间到）', { low: true, bad: (p) => p.tov >= 8 ? 2 : p.tov >= 5 ? 1 : 0 }],
    DNK: ['扣篮', (p) => p.dunk, null, '扣篮命中', { el: (p) => p.dunk >= 5 }],
    ANK: ['晃倒', (p) => p.ankle, null, '晃倒 / 晃晕对手', { el: (p) => p.ankle >= 3 }],
    PRF: ['完美', (p) => p.green, null, '完美出手（绿区）', { el: (p) => p.green >= 4 }],
    SK: ['必杀', (p) => p.sk || 0, null, '必杀技发动', {}],
    'FG%': ['FG%', (p) => p.fgp, (p) => fp(p.fgp), '投篮命中率', { el: (p) => p.fga >= 8 && p.fgp >= 0.65, bad: (p) => p.fga >= 6 && p.fgp < 0.35 ? (p.fgp < 0.25 ? 2 : 1) : 0 }],
    '3P%': ['3P%', (p) => p.tpp, (p) => fp(p.tpp), '三分命中率（1 对 1 没有罚球，用它代替 FT%）', { el: (p) => p.tpa >= 4 && p.tpp >= 0.5, bad: (p) => p.tpa >= 4 && p.tpp < 0.2 ? 1 : 0 }],
    '3PM': ['3PM', (p) => p.tp, null, '三分命中数', { el: (p) => p.tp >= 5 }],
    OREB: ['OREB', (p) => p.oreb, null, '前场篮板', { el: (p) => p.oreb >= 4 }],
    'TS%': ['TS%', (p) => p.ts, (p) => fp(p.ts), '真实命中率 PTS / (2×FGA)，没有罚球', { el: (p) => p.fga >= 8 && p.ts >= 0.7, bad: (p) => p.fga >= 6 && p.ts < 0.42 ? 1 : 0 }],
    'eFG%': ['eFG%', (p) => p.efg, (p) => fp(p.efg), '有效命中率 (FGM + 0.5×3PM) / FGA', { el: (p) => p.fga >= 8 && p.efg >= 0.68 }],
    '3PAr': ['3PAr', (p) => p.tpar, (p) => fp(p.tpar), '三分出手占比 3PA / FGA', { neutral: true }],
    PPP: ['PPP', (p) => p.ppp, (p) => p.ppp.toFixed(2), '每回合得分 = 得分 / (FGA − OREB + TO)', { el: (p) => p.poss >= 6 && p.ppp >= 1.4 }],
    GmSc: ['GmSc', (p) => p.gms, (p) => p.gms.toFixed(1), 'Hollinger 单场综合表现分（去掉罚球、助攻、犯规项）', { el: (p) => p.gms >= 20 }],
  };
  PH.BXH = { C: C };
  const VIEWS = { box: ['PTS', 'FG', '3P', 'IN', 'REB', 'STL', 'BLK', 'TO', 'DNK', 'ANK', 'PRF', 'SK'], '9cat': ['FG%', '3P%', '3PM', 'PTS', 'REB', 'STL', 'BLK', 'TO', 'DNK'], '11cat': ['FG%', '3P%', '3PM', 'PTS', 'REB', 'OREB', 'STL', 'BLK', 'TO', 'DNK', 'ANK'] };
  const ADVC = ['TS%', 'eFG%', '3PAr', 'PPP', 'GmSc'];
  function heatCls(k, P, i) {
    const c = C[k], o = c[4], v = c[1](P[i]), w = c[1](P[1 - i]);
    if (o.bad) { const b = o.bad(P[i]); if (b) return 'b' + b; }
    if (o.el && o.el(P[i])) return 'g3';
    if (o.neutral || v == null) return '';
    const better = w == null ? v > 0 : o.low ? v < w : v > w; if (!better) return '';
    const big = o.low ? (w - v >= 3) : (w != null && w > 0 ? v >= w * 1.8 && v - w >= (v < 1.5 ? 0.15 : 2) : v >= 2);
    return big ? 'g2' : 'g1';
  }
  function catWin(k, P) { const c = C[k], a = c[1](P[0]), b = c[1](P[1]); if (a == null && b == null) return -1; if (a == null) return 1; if (b == null) return 0; if (Math.abs(a - b) < 1e-9) return -1; return (c[4].low ? a < b : a > b) ? 0 : 1; }
  function renderBox() {
    const P = [bxStat(0), bxStat(1)], cols = VIEWS[BX.view].concat(BX.adv ? ADVC : []), cat = BX.view !== 'box';
    const nm = [$('n0').textContent, $('n1').textContent], cw = cat ? VIEWS[BX.view].map((k) => catWin(k, P)) : null;
    let h = '<thead><tr><th class="pcol">球员</th>' + cols.map((k) => '<th title="' + C[k][3] + '">' + C[k][0] + '</th>').join('') + (cat ? '<th class="cw">胜项</th>' : '') + '</tr></thead><tbody>';
    for (const i of [0, 1]) {
      const p = P[i];
      h += '<tr class="' + (i === G.winner ? 'win' : '') + '"><td class="pcol ' + (i ? 'r' : 'b') + '">' + nm[i] + '</td>';
      cols.forEach((k, j) => { const c = C[k], v = c[2] ? c[2](p) : c[1](p), hc = BX.heat ? heatCls(k, P, i) : '', won = cat && j < cw.length && cw[j] === i; h += '<td class="' + hc + (won ? ' cwin' : '') + '">' + v + '</td>'; });
      if (cat) { const n = cw.filter((x) => x === i).length, t = cw.filter((x) => x === -1).length; h += '<td class="cw"><b>' + n + '</b><small>-' + (cw.length - n - t) + (t ? '-' + t : '') + '</small></td>'; }
      h += '</tr>';
    }
    $('over-stats').innerHTML = h + '</tbody>';
    const L = P.map((p, i) => p.lead), R = P.map((p) => p.run);
    const ld = L[0] === L[1] ? '最大领先 ' + L[0] : '最大领先 ' + nm[L[0] > L[1] ? 0 : 1] + ' ' + Math.max(L[0], L[1]);
    const rn = '最长连得 ' + nm[R[0] >= R[1] ? 0 : 1] + ' ' + Math.max(R[0], R[1]) + '-0';
    $('bx-note').textContent = ld + ' · ' + rn + (G.sd ? ' · 加时决胜' : '');
    $('bx-bar').querySelectorAll('[data-bv]').forEach((b) => b.classList.toggle('on', b.getAttribute('data-bv') === BX.view));
    $('bx-bar').querySelectorAll('[data-bo]').forEach((b) => b.classList.toggle('on', !!BX[b.getAttribute('data-bo')]));
  }
  $('bx-bar').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; const v = b.getAttribute('data-bv'), o = b.getAttribute('data-bo'); if (v) BX.view = v; if (o) BX[o] = !BX[o]; PH.audio.play('ui'); renderBox(); });
  function showOver() {
    const w = G.winner, two = G.mode === '2p';
    $('over-title').textContent = two ? '玩家 ' + (w + 1) + ' 获胜' : w === 0 ? '你赢了' : '电脑获胜';
    $('over-title').style.color = w === 0 ? 'var(--blue)' : 'var(--red)';
    $('over-score').innerHTML = '<span class="b">' + G.score[0] + '</span> : <span class="r">' + G.score[1] + '</span>';
    BX.view = 'box'; renderBox();
    clearPf(); show('over', true); show('touch', false);
  }

  // ---------- 5V5 球队模式 ----------
  const T5 = PH.T5;
  const tnm = (ab) => PH.RX.teams[ab].name;
  function teamBtn(id, ab, side) {
    const N = PH.RX.teams[ab], L = T5.lineup(ab);
    const ovr = Math.round(L.start.reduce((s, k) => s + GM.ARCH[k].ovr, 0) / 5);
    // V4.2 首发五人六大类均值（同选人面板的分组）
    const GA = L.start.map((k) => attrGroups(GM.ARCH[k], GM.ARCH[k])), gv = (gi) => { const v = Math.round(GA.reduce((t, g) => t + g[gi][2], 0) / GA.length); return '<b class="' + vcl(v) + '">' + v + '</b>'; };
    const g5 = '<span class="pk-s pk-5" data-testid="' + id + '-r5">' + AGRP.slice(0, 3).map((g, gi) => g[1] + gv(gi)).join(' ') + '</span><span class="pk-s pk-5">' + AGRP.slice(3).map((g, gi) => g[1] + gv(gi + 3)).join(' ') + '</span>';
    $(id).innerHTML = '<span class="tb5-sw" style="background:' + N.jersey + ';border-color:' + N.trim + '"></span><span class="pk-n">' + N.name + ' <small>' + ovr + '</small></span><span class="pk-s">' + N.city + ' · ' + L.start.map((k) => GM.ARCH[k].name).join(' ') + '</span>' + g5 + '<span class="pk-c">更换</span>';
  }
  function refresh5() {
    teamBtn('team0', opts.home, 0); teamBtn('team1', opts.away, 1);
    $('btn-start').textContent = '开始比赛';
    $('menu-foot').textContent = '规则：全场 5 对 5，四节，每节 ' + Math.round(opts.qlen / 60) + ' 分钟，24 秒进攻，不吹犯规；平局打加时。';
    $('arch-desc').textContent = PH.RX.teams[opts.home].city + PH.RX.teams[opts.home].name + ' 对阵 ' + PH.RX.teams[opts.away].city + PH.RX.teams[opts.away].name + '。首发按位置和总评自动排好，体力不足会自动换人。';
  }
  let tpSide = 0, tpSel = null;
  function openTP(side) {
    tpSide = side; tpSel = side ? opts.away : opts.home;
    $('tp-title').textContent = side ? '选择客队' : '选择主队';
    const other = side ? opts.home : opts.away;
    $('tp-grid').innerHTML = T5.teamList().map((ab) => { const N = PH.RX.teams[ab]; return '<button class="tpc' + (ab === tpSel ? ' on' : '') + '" data-tp="' + ab + '" data-testid="tp-' + ab + '"' + (ab === other ? ' disabled' : '') + '><span class="tb5-sw" style="background:' + N.jersey + ';border-color:' + N.trim + '"></span><b>' + N.name + '</b><small>' + N.city + '</small></button>'; }).join('');
    clearPf(); show('tpicker', true); PH.audio.play('ui');
    const cur = $('tp-grid').querySelector('.tpc.on'); if (cur) cur.classList.add('pf');
  }
  function closeTP(ok, ab) {
    if (ok && ab) { if (tpSide) opts.away = ab; else opts.home = ab; }
    show('tpicker', false); clearPf(); refreshMenu(); PH.audio.play('ui');
    $(tpSide ? 'team1' : 'team0').classList.add('pf');
  }
  $('tp-grid').addEventListener('click', (e) => { const b = e.target.closest('.tpc'); if (b && !b.disabled) closeTP(true, b.getAttribute('data-tp')); });
  $('tp-cancel').addEventListener('click', () => closeTP(false));
  $('team0').addEventListener('click', () => openTP(0));
  $('team1').addEventListener('click', () => openTP(1));
  let over5Shown = false, h5 = {};
  function start5() {
    T5.start({ home: opts.home, away: opts.away, qlen: opts.qlen, diff: opts.diff, human: opts.side });
    screen = 'play5'; paused = false; over5Shown = false; h5 = {}; fdReset(); PH.input.clearSys(); clearPf();
    show('menu', false); show('picker', false); show('tpicker', false); show('pause', false); show('over', false); show('over5', false); show('help', false);
    show('hud', false); show('hud5', true); show('touch', isTouch && opts.side >= 0); show('shotcard', false); show('train', false); show('banner', false); show('campanel', false); stage.classList.remove('panel');
    show('btn-cam', true); show('btn-disp', true); show('btn-box5', true); show('box5', false); PH.box5.reset(); b5Pause = false;
    $('btn-restart').textContent = '重新开始'; $('btn-resume').textContent = '继续比赛';
    for (let i = 0; i < 2; i++) { const tm = T5.T.tm[i]; $('h5n' + i).textContent = tm.name; $('h5t' + i).style.setProperty('--tc', tm.col.ui); $('h5t' + i).classList.toggle('me', opts.side === i); }
  }
  const mmss = (s) => { s = Math.max(0, s); if (s < 60) return s.toFixed(1); const m = Math.floor(Math.ceil(s) / 60), r = Math.ceil(s) % 60; return m + ':' + String(r).padStart(2, '0'); };
  function set5(id, v) { if (h5[id] !== v) { h5[id] = v; $(id).textContent = v; } }
  let frameN5 = 0;
  // 比分条和左右信息卡不重叠：依次尝试 正常 → 紧凑（队名缩窄）→ 极简（只留比分和时间）
  function sbFit() {
    const hd = $('hud5'), sb = $('sb5'), a = $('pc50'), b = $('pc51'), u = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--u')) || 2;
    const vis = (e) => { if (e.classList.contains('hidden')) return null; const r = e.getBoundingClientRect(); return r.width > 0 ? r : null; }, ra = vis(a), rb = vis(b);
    let lv = 0;
    for (; lv < 2; lv++) {
      hd.classList.toggle('sbt1', lv === 1); hd.classList.toggle('sbt2', lv === 2);
      const r = sb.getBoundingClientRect();
      if ((!ra || r.left >= ra.right + u * 3) && (!rb || r.right <= rb.left - u * 3)) break;
    }
    hd.classList.toggle('sbt1', lv === 1); hd.classList.toggle('sbt2', lv === 2);
    // 换人提示放在比分条正下方
    const st = $('subtoast'), top = Math.round(sb.getBoundingClientRect().bottom - hd.getBoundingClientRect().top + u * 2) + 'px'; if (st._top !== top) { st._top = top; st.style.top = top; }
  }
  function hud5() {
    const T = T5.T; if (!T.tm) return;
    // 比分条在顶部正中；2K 镜头跳球特写时隐藏、转到 2K 机位时淡入
    const k2 = T.cam.preset === '2k', K = PH.render5.k2, hd = $('hud5');
    hd.classList.toggle('k2', k2); hd.classList.toggle('tiphide', k2 && !!K && K.tip && K.tipE < 0.5);
    // 画布上被 DOM 盖住的区域（比分条、信息卡），换算成画布逻辑坐标给镜头取景和球员标签避让
    { const cv = $('game').getBoundingClientRect(), sx = R.W / (cv.width || 1), sy = R.H / (cv.height || 1), av = [];
      const rc = (el) => { if (!el || el.classList.contains('hidden')) return null; const r = el.getBoundingClientRect(); return r.width ? { x0: (r.left - cv.left) * sx, x1: (r.right - cv.left) * sx, y0: (r.top - cv.top) * sy, y1: (r.bottom - cv.top) * sy } : null; };
      // V4.3 比分条移到顶部正中（两张信息卡之间），不再挡底部球员；作为顶部遮挡区交给镜头和标签避让
      if (frameN5++ % 10 === 0) { pcards5(); sbFit(); }
      PH.render5.sbRect = null; const sb = rc($('sb5')); PH.render5.sbTop = sb && !hd.classList.contains('tiphide') ? sb : null; if (PH.render5.sbTop) av.push(sb);   // sbTop：镜头顶部安全区（画布坐标）
      for (const id of ['pc50', 'pc51', 'feed5']) { const r = rc($(id)); if (r) av.push(r); }
      PH.render5.avoid = av; }
    set5('h5s0', String(T.tm[0].score)); set5('h5s1', String(T.tm[1].score));
    set5('h5q', T.q <= 4 ? '第' + T.q + '节' : '加时' + (T.q > 5 ? T.q - 4 : ''));
    set5('h5c', mmss(T.gclock));
    set5('h5sc', T.phase === 'live' && T.sclock <= T.gclock ? String(Math.max(0, Math.ceil(T.sclock))) : T.phase === 'inb' ? '24' : '--');
    $('h5sc').classList.toggle('low', T.phase === 'live' && T.sclock < 5 && T.sclock <= T.gclock);
    for (let i = 0; i < 2; i++) $('h5t' + i).classList.toggle('ball', T.off === i && T.phase !== 'over');
    PH.box5.toast(T.time); bpops5(); fdRender();
    if (isTouch && T.hum >= 0) { const off = T.off === T.hum; set5('tb1', off ? '投篮' : '抢断'); set5('tb2', off ? '传球' : '切人'); set5('tb3', off ? '背打' : '防守'); set5('tbalt', '犹豫步'); show('tbalt', !!(off && T.ctl && T.ctl.hasBall)); }
    if (T.phase === 'over' && !over5Shown && T.phaseT > 2) { over5Shown = true; showOver5(); }
  }
  function showOver5() {
    const T = T5.T, w = T.winner, t0 = T.tm[0], t1 = T.tm[1];
    $('o5-title').textContent = T.hum < 0 ? (w === 0 ? t0 : t1).name + ' 获胜' : w === T.hum ? '你赢了' : '你输了';
    $('o5-score').innerHTML = '<span style="color:' + t0.col.ui + '">' + t0.name + ' ' + t0.score + '</span> : <span style="color:' + t1.col.ui + '">' + t1.score + ' ' + t1.name + '</span>';
    const q = (tm) => tm.qs.join(' · ') + (T.q > 4 ? ' · 加时 ' + (tm.score - tm.qs.reduce((a, b) => a + b, 0)) : '');
    $('o5-qs').textContent = t0.name + ' ' + q(t0) + '　｜　' + t1.name + ' ' + q(t1);
    PH.box5.S.otab = T.hum === 1 ? 'box1' : 'box0'; PH.box5.renderOver($('o5-box'), $('o5-tabs'));
    clearPf(); show('over5', true); show('touch', false);
  }
  $('o5-tabs').addEventListener('click', (e) => { const b = e.target.closest('[data-o5]'); if (!b) return; const id = b.getAttribute('data-o5'), f = b.classList.contains('pf'); PH.box5.overTab(id, $('o5-box'), $('o5-tabs')); PH.audio.play('ui'); const nb = $('o5-tabs').querySelector('[data-o5="' + id + '"]'); if (nb && f) nb.classList.add('pf'); });
  // V3.9h 5V5 数据面板：比赛中打开即暂停；从暂停菜单打开的，关闭后回到暂停菜单
  let b5Pause = false, d13 = false;
  function open5(tab, fromPause) { if (screen !== 'play5' || PH.T5.T.phase === 'over') return; if (!PH.box5.open(tab)) return; b5Pause = !!fromPause; paused = true; show('pause', false); show('help', false); clearPf(); }
  function close5() { PH.box5.close(); if (b5Pause) { b5Pause = false; setView('main'); show('pause', true); } else paused = false; }
  PH.box5.onClose = close5;
  $('btn-box5').addEventListener('click', () => open5(null, true));
  $('o5-again').addEventListener('click', () => startMatch(true));
  $('o5-menu').addEventListener('click', toMenu);
  $('btn-pause5').addEventListener('click', () => setPause(true));

  // ---------- 手柄菜单导航 ----------
  const NAV_SEL = 'button, select, input[type=range]';
  const navList = (root) => Array.prototype.filter.call(root.querySelectorAll(NAV_SEL), (b) => b.offsetParent !== null && !b.disabled && !b.hasAttribute('data-nonav'));
  const trainPanelOn = () => screen === 'play' && G.mode === 'train' && panelOpen && !paused && !G.replay && !$('train').classList.contains('hidden');
  // 当前能用手柄操作的界面（从上到下优先）：调参台 / 镜头面板 / 说明 / 选队 / 选人 / 设置 / 结算 / 主菜单 / 训练面板
  function navRoot() {
    if (TUI && TUI.isOpen()) return $('tune');
    if (camOpen && !$('campanel').classList.contains('hidden')) return $('campanel');
    for (const id of ['help', 'tpicker', 'picker', 'pause', 'over5', 'over', 'menu']) if (!$(id).classList.contains('hidden')) return $(id);
    return trainPanelOn() ? $('train') : null;
  }
  const NAV_SCROLL = { picker: '#pk-detail', help: '#help-body', tune: '#tn-body', train: '#tr-body', over5: '#o5-box', over: '', pause: '', menu: '' };
  const NAV_TABS = { help: '#help-tabs', tune: '#tn-cats', train: '#tr-tabs', over5: '#o5-tabs' };
  function scrollBox(root) {
    const sel = NAV_SCROLL[root.id]; if (sel) return root.querySelector(sel);
    for (const e of root.querySelectorAll('*')) if (e.scrollHeight > e.clientHeight + 4 && /auto|scroll/.test(getComputedStyle(e).overflowY) && e.offsetParent !== null) return e;
    return null;
  }
  let adj = { el: null, n: 0, t: 0, timer: 0 };
  // 滑条 / 下拉：左右调整；长按越调越快；松手后才触发 change（避免每一格都播声音 / 重建面板）
  function navAdjust(el, dir) {
    const now = performance.now(); adj.n = adj.el === el && now - adj.t < 220 ? adj.n + 1 : 0; adj.el = el; adj.t = now;
    if (el.tagName === 'SELECT') {
      const n = el.options.length; let i = el.selectedIndex; for (let k = 0; k < n; k++) { i = (i + dir + n) % n; if (!el.options[i].disabled) break; }
      if (i !== el.selectedIndex) { el.selectedIndex = i; el.dispatchEvent(new Event('change', { bubbles: true })); PH.audio.play('ui'); }
      return;
    }
    const st = +el.step || 1, mn = +el.min, mx = +el.max, dec = (String(el.step || '1').split('.')[1] || '').length, mult = adj.n < 6 ? 1 : adj.n < 16 ? 4 : 12;
    let v = +el.value + dir * st * mult; v = Math.min(mx, Math.max(mn, +(Math.round(v / st) * st).toFixed(dec)));
    if (v === +el.value) return;
    el.value = v; el.dispatchEvent(new Event('input', { bubbles: true }));
    clearTimeout(adj.timer); adj.timer = setTimeout(() => el.dispatchEvent(new Event('change', { bubbles: true })), 260);
  }
  function navSet(root, el) { clearPf(); el.classList.add('pf'); el.scrollIntoView({ block: 'nearest' }); if (root.id === 'tune') el.dispatchEvent(new FocusEvent('focusin', { bubbles: true })); }
  // 面板被重建（切页签 / 选项）后，焦点落回原来的位置
  function navRefocus(root, list, idx, b) {
    const r2 = navRoot(); if (r2 !== root) return;
    if (b.isConnected && b.offsetParent !== null) { b.classList.add('pf'); return; }
    const l2 = navList(root), n = l2[Math.min(Math.max(0, idx), l2.length - 1)]; if (n) navSet(root, n);
  }
  function navMove(dx, dy) {
    const root = navRoot(); if (!root) return;
    const list = navList(root); if (!list.length) return;
    let cur = root.querySelector('.pf');
    if (!cur || cur.offsetParent === null || !cur.matches(NAV_SEL)) { cur = root.querySelector('button.primary') || list[0]; if (!list.includes(cur)) cur = list[0]; navSet(root, cur); return; }
    if (dx && cur.type === 'range') { navAdjust(cur, dx); return; }
    const r0 = cur.getBoundingClientRect(), cx = r0.left + r0.width / 2, cy = r0.top + r0.height / 2;
    let best = null, bs = 1e9;
    for (const b of list) {
      if (b === cur) continue;
      const r = b.getBoundingClientRect(), ex = r.left + r.width / 2 - cx, ey = r.top + r.height / 2 - cy;
      let sc;
      if (dy) {
        // 上下：先找最近的一行，再在该行里找横向最近的（按钮宽度不同也不会被跳过）
        const along = ey * dy; if (along < 6) continue;
        const gx = cx < r.left ? r.left - cx : cx > r.right ? cx - r.right : 0;
        sc = along * 4 + gx;
      } else {
        const along = ex * dx; if (along < 4 || Math.abs(ey) > Math.max(r.height, r0.height) * 0.8) continue;
        sc = along + Math.abs(ey) * 3;
      }
      if (sc < bs) { bs = sc; best = b; }
    }
    if (best) { navSet(root, best); PH.audio.play('ui'); if (best.hasAttribute('data-pk')) pkDetail(best.getAttribute('data-pk')); }
    else if (dx && cur.tagName === 'SELECT') navAdjust(cur, dx);   // 下拉：左右旁边没有别的控件时才左右切选项（A 也能切下一项）
  }
  function navClick() {
    const root = navRoot(); if (!root) return false;
    const list = navList(root), b = root.querySelector('.pf') || root.querySelector('button.primary');
    if (!b) { if (list[0]) navSet(root, list[0]); return true; }
    if (b.tagName === 'SELECT') { navAdjust(b, 1); return true; }
    if (b.type === 'range') return true;
    const idx = list.indexOf(b); b.click(); navRefocus(root, list, idx, b);
    return true;
  }
  // LB / RB / 右摇杆左右：切页签；X：把当前参数恢复默认（调参台）；右摇杆上下：滚动
  function navTab(root, d) {
    if (root.id === 'picker') { pkTabStep(d); return; }
    const g = NAV_TABS[root.id] && root.querySelector(NAV_TABS[root.id]); if (!g) return;
    const L = Array.prototype.filter.call(g.querySelectorAll('button'), (b) => b.offsetParent !== null), i = L.findIndex((b) => b.classList.contains('on'));
    const n = L[(i + d + L.length) % L.length]; if (n && L.length) { n.click(); PH.audio.play('ui'); const cur = root.querySelector('.pf'); if (cur && !cur.isConnected) clearPf(); }
  }
  let rsT = 0;
  function navAct(root, k) {
    if (k.up) navMove(0, -1); else if (k.dn) navMove(0, 1); else if (k.lf) navMove(-1, 0); else if (k.rt) navMove(1, 0);
    if (k.lb || k.rl) navTab(root, -1); else if (k.rb || k.rr) navTab(root, 1);
    if (k.px && root.id === 'tune') { const cur = root.querySelector('.pf'), row = cur && cur.closest('[data-row]'), rs = row && row.querySelector('[data-rs]'); if (rs) rs.click(); }
    const now = performance.now(), dt = Math.min(60, now - rsT || 16); rsT = now;
    const r = PH.input.rstick(); if (r.y) { const sb = scrollBox(root); if (sb) sb.scrollTop += r.y * dt * 1.1; }
  }

  // ---------- 循环 ----------
  function sysKeys() {
    const I = PH.input; I.pollPads();
    // 回放：播满 2.5 秒后才能用 Enter / Esc / 手柄 B·Menu 跳过
    if (screen === 'play' && G.replay && !paused) { padAny(); const sk = I.sysPressed('Escape') || I.sysPressed('Enter') || I.sysPressed('PadB') || I.sysPressed('PadStart'); I.clearSys(); if (sk && G.replay.age >= REPLAY_MIN) G.replay.skip = true; return; }
    if (I.sysPressed('KeyM')) toggleMusic();
    if (I.sysPressed('KeyI') && screen === 'play') toggleInfo();
    if (I.sysPressed('KeyC') && screen === 'play' && G.phase !== 'over') toggleCam();
    if (I.sysPressed('F3')) { debug = !debug; }
    const tab = I.sysPressed('Tab') || I.sysPressed('PadBack'), rk = I.sysPressed('KeyR');
    if (screen === 'play' && G.mode === 'train' && !paused && !(TUI && TUI.isOpen())) { if (tab) togglePanel(); if (rk) GM.trainReset(); }
    const up = I.sysPressed('PadUp'), dn = I.sysPressed('PadDown'), lf = I.sysPressed('PadLeft'), rt = I.sysPressed('PadRight');
    const pa = I.sysPressed('PadA'), pb = I.sysPressed('PadB'), ps = I.sysPressed('PadStart');
    const esc = I.sysPressed('Escape') || I.sysPressed('KeyP') || ps;
    const ok = I.sysPressed('Enter');
    const lb = I.sysPressed('PadLB'), rb = I.sysPressed('PadRB'), rl = I.sysPressed('PadRLeft'), rr = I.sysPressed('PadRRight'), px = I.sysPressed('PadX');
    if (screen === 'tips') { if (esc || pb || ok) tipsExit(); I.clearSys(); return; }
    const root = navRoot();
    if (TUI && TUI.isOpen()) {
      navAct(root, { up: up, dn: dn, lf: lf, rt: rt, lb: lb, rb: rb, rl: rl, rr: rr, px: px });
      if (pa) navClick();
      else if (esc || pb) { const sub = ['tn-name', 'tn-pastebox'].map($).find((e) => e && !e.classList.contains('hidden')); if (sub) { const c = sub.querySelector('#tn-cancel,#tn-pastecancel'); if (c) c.click(); } else TUI.open(false); }
      I.clearSys(); return;
    }
    if (root) navAct(root, { up: up, dn: dn, lf: lf, rt: rt, lb: lb, rb: rb, rl: rl, rr: rr, px: px });
    if (!$('help').classList.contains('hidden')) { if (esc || ok || pb) { show('help', false); clearPf(); } else if (pa) navClick(); }
    else if (!$('tpicker').classList.contains('hidden')) { if (pb || esc) closeTP(false); else if (pa || ok) navClick(); }
    else if (!$('picker').classList.contains('hidden')) { if (pb || esc) closePicker(false); else if (ok) closePicker(true); else if (pa) { const b = $('picker').querySelector('.pf'); if (b && b.hasAttribute('data-pk')) { if (b.getAttribute('data-pk') === pkSel) closePicker(true); else b.click(); b.classList.add('pf'); } else navClick(); } }
    else if (screen === 'menu') { if (ok || ps) startMatch(false); else if (pa) navClick(); }
    else if (screen === 'play5') {
      // 手柄十字键下（只认十字键，不认左摇杆）= 换人页；View = 数据面板；键盘 Tab = 数据面板、B / 4 = 换人页
      const gp0 = PH.input.pads()[0], dd = !!(gp0 && gp0.buttons[13] && gp0.buttons[13].pressed), dD = dd && !d13; d13 = dd;
      const kb = I.sysPressed('KeyB') | I.sysPressed('Digit4'); // 键盘 4 = 十字键↓（1/2/3 = 十字键 ↑/←/→ 战术呼叫，由 team5 处理）
      if (PH.box5.isOpen()) {
        if (PH.T5.T.phase === 'over') PH.box5.close();
        else if (esc || pb || tab || (kb && PH.box5.S.tab === 'sub')) close5();
        else if (kb) { PH.box5.S.tab = 'sub'; PH.box5.S.sel = 0; PH.box5.render(); }
        else { PH.box5.keys(I, { up: up, dn: dn, lf: lf, rt: rt, pa: pa }); const r = PH.input.rstick(), now = performance.now(), dt = Math.min(60, now - rsT || 16); rsT = now; if (r.y) $('b5-body').scrollTop += r.y * dt * 1.1; }
      }
      else if (PH.T5.T.phase === 'over') { if (over5Shown) { if (ok) startMatch(true); else if (esc || pb) toMenu(); else if (pa) navClick(); } }
      else if (!paused && (tab || kb || dD)) open5(kb || dD ? 'sub' : null, false);
      else if (paused && setV !== 'main' && (esc || pb)) setView('main');
      else if (esc) setPause(!paused); else if (paused) { if (ok || pb) setPause(false); else if (pa) navClick(); }
    }
    else if (screen === 'play') {
      if (G.phase === 'over') { if (overShown) { if (ok) startMatch(true); else if (esc || pb) toMenu(); else if (pa) navClick(); } }
      else if (root && root.id === 'train' && (pa || pb)) { if (pa) navClick(); else togglePanel(false); }
      else if (camOpen && (esc || pb)) toggleCam(false);
      else if (camOpen && pa) navClick();
      else if (paused && setV !== 'main' && (esc || pb)) setView('main');
      else if (esc) setPause(!paused); else if (paused) { if (ok || pb) setPause(false); else if (pa) navClick(); }
    }
    I.clearSys();
  }
  // 5V5 计时音效（和 1V1 同一套）：进攻时间最后 5 秒每秒 tick（3 秒起 tick2 更急），每节最后 10 秒 gtick；违例 / 节末蜂鸣器在 team5 里
  // 只在模拟推进时检测（暂停、打开数据面板时不推进，所以不发声）；时间往回跳（重置、换节）不响；进攻时间被比赛时间覆盖时只响比赛读秒
  const clk5 = { s: 99, g: 999 };
  function tick5(dt) {
    PH.T5.tick(dt); fdScan();
    const T = PH.T5.T; if (!T || !T.tm || G.mode === 'demo') return;
    const s = G.shotClock, g = T.gclock, live = G.phase === 'live' && T.phase !== 'over' && T.phase !== 'tip';
    const sc = Math.ceil(s), gc = Math.ceil(g), ps = clk5.s, pg = clk5.g; clk5.s = sc; clk5.g = gc;
    if (!live) return;
    if (gc < pg && gc >= 1 && gc <= 10) { PH.audio.play('gtick'); return; }
    if (sc < ps && sc >= 1 && sc <= 5 && g > s && G.ball.state !== 'shot') PH.audio.play(sc <= 3 ? 'tick2' : 'tick');
  }
  // ---------- V3.9k 5V5 文字播报（左侧，信息卡下方；同时最多 3 条，2.5 秒淡出，同类事件合并） ----------
  // 事件来源（不改 team5）：得分 = 包一层 G.h5.score（取 b.shot 的出手名 / 距离、得分前后助攻数差得出助攻人）；
  // 抢断 / 截传 / 盖帽 / 进攻篮板 / 失误 / 晃倒 = 每步比较 G.stats 增量；24 秒违例 / 出界 = T.cnt 增量；晃飞（四档里次重，晃晕 / 晃开不播）/ 挡倒 / 鱼跃 = 新出现的 G.floats
  const FD = { L: [], seq: 0, st: {}, cnt: null, fl: new WeakSet(), last: {} };
  const FD_DUR = 2.5, FD_MAX = 3;
  const escH = (x) => String(x == null ? '' : x).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const pnm = (p) => (p ? escH((p.a || p.arch).name) : '');
  function fdPush(kind, p, html, extra) {
    const T = PH.T5.T, now = T.time, k = kind + ':' + (p ? p.id : '');
    if (FD.last[k] != null && now - FD.last[k] < 4) return;   // 同人同类 4 秒内不重复
    FD.last[k] = now;
    FD.L.push({ id: ++FD.seq, kind: kind, tm: p ? p.tm : -1, html: '<b>' + pnm(p) + '</b>' + html + (extra || ''), t0: now });
    while (FD.L.length > FD_MAX) FD.L.shift();
  }
  function fdReset() { FD.L = []; FD.st = {}; FD.cnt = null; FD.fl = new WeakSet(); FD.last = {}; const el = $('feed5'); if (el) el.innerHTML = ''; fdEls.clear(); }
  function fdShotName(pl, pts, kind, name) {
    const s = G.ball.shot && G.ball.shot.shooter === pl.id ? G.ball.shot : null, d = s ? s.d || 0 : 0;
    if (kind === 'dunk') return name || '暴扣';
    if (kind === 'lay') return !name || name === '上篮' ? '上篮命中' : name === '抛投' ? '抛投命中' : name;
    if (pts === 3) { if (d > 8.8) return '超远三分'; const n = (name || '').replace(/跳投$/, ''); return n && n !== '定点' && n !== '接球投篮' ? n + '三分' : '三分命中'; }
    if (!name || name === '定点跳投') return '中投命中';
    return /跳投|投|勾手|抛投|上篮|挑篮/.test(name) ? name + '命中' : name;
  }
  function fdHook() {
    const H = G.h5; if (!H || H.__fd) return; H.__fd = true;
    const orig = H.score;
    H.score = function (pl, pts, kind, name) {
      const T = PH.T5.T, bz = !!(T.endPend && T.bzOn), L = T.lastPass;
      const all = []; for (const t of T.tm) for (const q of t.on) all.push([q, q.rk ? q.rk.st.ast : 0]);
      const nm = fdShotName(pl, pts, kind, name), oop = kind === 'dunk' && L && L.to === pl && T.time - L.t < 1.1;
      const r = orig.apply(this, arguments);
      try {
        fdPush('score', pl, ' ' + (bz ? '压哨 · ' : '') + escH(oop ? '空接' + (nm.indexOf('扣') >= 0 ? ' · ' + nm : '暴扣') : nm), '<em>+' + pts + '</em>');
        const a = all.find((x) => x[0].rk && x[0].rk.st.ast > x[1]);
        if (a && a[0] !== pl) { FD.last['ast:' + a[0].id] = -99; fdPush('ast', a[0], ' 助攻 <b>' + pnm(pl) + '</b>'); }
      } catch (e) { /* 播报失败不影响比赛 */ }
      return r;
    };
  }
  function fdScan() {
    const T = PH.T5.T; if (!T || !T.tm || G.mode === 'demo') return;
    fdHook();
    const on = []; for (const t of T.tm) for (const q of t.on) on.push(q);
    const d = {};   // 本步增量 pid → {stl, blk, oreb, dreb, tov, ankle}
    for (const p of on) {
      const g = G.stats[p.id]; if (!g) continue;
      const o = FD.st[p.id];
      if (!o || o.ref !== g || o.key !== p.rk) { FD.st[p.id] = { ref: g, key: p.rk, v: Object.assign({}, g) }; continue; }
      const x = {}; let any = false; for (const k of ['stl', 'blk', 'oreb', 'dreb', 'tov', 'ankle']) { const v = (g[k] || 0) - (o.v[k] || 0); if (v > 0) { x[k] = v; any = true; } }
      o.v = Object.assign({}, g); if (any) d[p.id] = { p: p, x: x };
    }
    const c = T.cnt || {}, c0 = FD.cnt || c; FD.cnt = Object.assign({}, c);
    const dv = (k) => (c[k] || 0) - (c0[k] || 0);
    const viol = dv('viol') > 0, oob = dv('oob') > 0, intc = dv('intc') > 0;
    const D = Object.values(d), stl = D.filter((e) => e.x.stl), tov = D.filter((e) => e.x.tov);
    for (const e of stl) { const v = tov.find((t) => t.p.tm !== e.p.tm); fdPush('stl', e.p, intc ? ' 截传' : ' 抢断', v ? ' <b>' + pnm(v.p) + '</b>' : ''); }
    for (const e of D) {
      if (e.x.blk) fdPush('blk', e.p, ' 盖帽');
      if (e.x.oreb) fdPush('oreb', e.p, ' 进攻篮板');
      else if (e.x.dreb && T.q >= 4 && T.gclock < 30 && Math.abs(T.tm[0].score - T.tm[1].score) <= 5) fdPush('dreb', e.p, ' 关键篮板');
      if (e.x.ankle) { const v = T.tm[1 - e.p.tm].on.find((q) => q.mark === e.p); fdPush('ankle', e.p, ' 晃倒', v ? ' <b>' + pnm(v) + '</b>' : ''); }
    }
    for (const e of tov) {
      if (stl.some((s) => s.p.tm !== e.p.tm)) continue;
      fdPush('tov', e.p, viol ? ' 24 秒违例' : oob ? ' 出界' : ' 失误');
    }
    if (viol && !tov.length) { const h = G.players[G.ball.lastTouch]; FD.L.push({ id: ++FD.seq, kind: 'viol', tm: h ? h.tm : -1, html: '<b>' + escH(h ? T.tm[h.tm].name : '') + '</b> 24 秒违例', t0: T.time }); while (FD.L.length > FD_MAX) FD.L.shift(); }
    for (const f of G.floats || []) {
      if (FD.fl.has(f)) continue; FD.fl.add(f);
      const p = f.pid >= 0 ? G.players[f.pid] : null; if (!p || p.tm == null) continue;
      if (f.text === '晃飞') { const v = T.tm[1 - p.tm].on.find((q) => q.mark === p); fdPush('shake', p, ' 晃飞', v ? ' <b>' + pnm(v) + '</b>' : ''); }
      else if (f.text === '挡倒') { const v = p.scrImp ? T.tm[1 - p.tm].on.find((q) => q.scrHit && q.scrHit.t === p.scrImp.t) : null; fdPush('scr', p, ' 挡倒', v ? ' <b>' + pnm(v) + '</b>' : ''); }
      else if (f.text === '扑到了') fdPush('dive', p, ' 鱼跃扑球');
    }
  }
  const fdEls = new Map();
  function fdRender() {
    let el = $('feed5');
    if (!el) { el = document.createElement('div'); el.id = 'feed5'; el.setAttribute('data-testid', 'feed5'); $('hud5').appendChild(el); }
    const T = PH.T5.T, now = T && T.time != null ? T.time : 0, hide = !T || !T.tm || T.phase === 'over' || PH.box5.isOpen();
    el.classList.toggle('hidden', hide);
    // 位置：左卡显示时贴在左卡下方，否则固定在左上
    const pc = $('pc50'), st = $('stage').getBoundingClientRect();
    const top = pc && !pc.classList.contains('hidden') ? pc.getBoundingClientRect().bottom - st.top + 6 : null;
    const tv = top == null ? '' : Math.round(top) + 'px'; if (el._top !== tv) { el._top = tv; el.style.top = tv; }
    const live = new Set();
    for (const x of FD.L) {
      const age = now - x.t0; if (age < 0 || age > FD_DUR) continue;
      live.add(x.id); let e = fdEls.get(x.id);
      if (!e) { e = document.createElement('div'); e.className = 'f5i'; e.innerHTML = x.html; if (x.tm >= 0 && T.tm[x.tm]) e.style.borderLeftColor = T.tm[x.tm].col.ui; el.appendChild(e); fdEls.set(x.id, e); }
      e.classList.toggle('out', age > FD_DUR - 0.35);
    }
    for (const [id, e] of fdEls) if (!live.has(id)) { e.remove(); fdEls.delete(id); }
  }
  function step(n) { for (let i = 0; i < n; i++) { if (screen === 'play5') { if (!paused) tick5(DT); } else GM.tick(DT); } }
  function frame(ts) {
    requestAnimationFrame(frame);
    const d = Math.min(0.1, (ts - last) / 1000 || 0); last = ts;
    if (d > 0) fps = fps * 0.95 + (1 / d) * 0.05;
    sysKeys();
    { const nr = navRoot(); PH.input.lock.on = !!nr && (nr.id === 'tune' || nr.id === 'campanel' || nr.id === 'train'); }
    if (!manual && !paused) { acc += d; let n = 0; while (acc >= DT && n < 5) { if (screen === 'play5') tick5(DT); else GM.tick(DT); acc -= DT; n++; } if (n === 5) acc = 0; }
    draw();
  }
  // 分场景音乐：每帧按当前界面 / 比赛状态选曲（audio.js 内部去重，切换时交叉淡入淡出）
  function musicPick() {
    const A = PH.audio; if (!A.scene) return;
    let sc = 'menu', hot = 0;
    if (screen === 'tips') sc = 'calm';
    else if (screen === 'play') {
      if (G.phase === 'over' && G.mode !== 'train') sc = G.phaseT < 1.4 ? null : (G.mode === '2p' || G.winner === 0 ? 'win' : 'lose');
      else { sc = 'p1'; if (G.mode !== 'train') { const d = Math.abs(G.score[0] - G.score[1]); hot = G.sd || G.mp >= 0 || (G.glen > 0 && G.gclock <= 24) || (Math.max(G.score[0], G.score[1]) >= G.target - 2 && d <= 3) ? 1 : 0; } }
    } else if (screen === 'play5') {
      const T = PH.T5.T;
      if (T.phase === 'over') sc = T.phaseT < 1.4 ? null : (T.hum < 0 || T.winner === T.hum ? 'win' : 'lose');
      else { sc = 'p5'; const d = Math.abs(T.tm[0].score - T.tm[1].score); hot = T.q > 4 || (T.q === 4 && ((T.gclock <= 24 && d <= 6) || (T.gclock <= 60 && d <= 3))) ? 1 : 0; }
    }
    if (!$('help').classList.contains('hidden') || (PH.TUNEUI && PH.TUNEUI.isOpen())) { sc = 'calm'; hot = 0; }
    A.scene(sc); A.intensity(hot);
  }
  // 浏览器要求用户操作后才能出声：第一次点击 / 按键时启动音乐（主菜单就有音乐）
  const musKick = () => { if (PH.audio.ensure()) { PH.audio.startMusic(); musicPick(); } };
  window.addEventListener('pointerdown', musKick, true); window.addEventListener('keydown', musKick, true);
  function draw() {
    PH.audio.setPaused((screen === 'play' || screen === 'play5') && paused);
    musicPick();
    if (screen === 'play5') { PH.render5.render(PH.T5.T, manual ? 0.05 : 1 / Math.max(30, fps)); hud5(); cutin(); return; }
    R.render(G); hud(); cutin();
    const dbg = $('debug');
    if (debug) { dbg.classList.remove('hidden'); dbg.textContent = 'FPS ' + fps.toFixed(0) + ' · ' + G.phase + ' · 进攻 ' + G.off + ' · 球 ' + G.ball.state; } else dbg.classList.add('hidden');
  }

  let ciSeq = 0;
  function cutin() {
    const c = G.cutin, el = $('cutin');
    for (let i = 0; i < 2; i++) { const pl = G.players[i], n = $('n' + i); if (n && pl) n.classList.toggle('skr', !!(pl.sk && pl.sk.hint === 'ready')); }
    if (!c || (G.mode === 'demo' && screen !== 'play5') || (screen !== 'play' && screen !== 'tips' && screen !== 'play5')) { if (!el.classList.contains('hidden')) el.classList.add('hidden'); return; }
    if (c.seq === ciSeq) { if (PH.ci) PH.ci.frame(c, el, screen); return; }   // V3.9o 半屏面板：每帧按游戏时间驱动
    ciSeq = c.seq; const pl = G.players[c.pid];
    el.style.setProperty('--tc', c.col); el.classList.toggle('right', screen === 'play5' ? pl.tm === 1 : c.pid === 1);
    el.querySelector('.ci-name').textContent = c.full;
    el.querySelector('.ci-skill').textContent = c.skill;
    el.querySelector('.ci-en').textContent = c.en;
    const PF = portrait($('ci-face'), pl.arch, pl.team);
    { const ec = $('ci-eyes'), x = ec.getContext('2d'), k = 4, y0 = (PF.eyeY - 3.2) * k; x.imageSmoothingEnabled = false; x.clearRect(0, 0, 160, 72); x.drawImage($('ci-face'), 4 * k, y0, 24 * k, 7.2 * k, 0, 0, 160, 48);
      x.fillStyle = 'rgba(0,0,0,0)'; }
    el.classList.remove('hidden'); el.style.animation = 'none'; void el.offsetWidth; el.style.animation = '';
    el.querySelectorAll('.ci-band,.ci-lines').forEach((e) => { e.style.animation = 'none'; void e.offsetWidth; e.style.animation = ''; });
    if (PH.ci) PH.ci.frame(c, el, screen);
  }
  window.advanceTime = function (ms) { manual = true; step(Math.max(1, Math.round(ms / (1000 / 60)))); draw(); };
  window.resumeRealtime = function () { manual = false; };
  window.render_game_to_text = function () { const o = JSON.parse(GM.toText()); o.screen = screen; if (screen === 'play5') o.t5 = PH.T5.state(); o.paused = paused; o.panelOpen = panelOpen; o.cfg = CFG; return JSON.stringify(o); };
  document.addEventListener('visibilitychange', () => { if (document.hidden && (screen === 'play' || screen === 'play5')) setPause(true); });
  window.addEventListener('gamepadconnected', () => { hasPad = true; show('padtag', true); hintKey = ''; });

  function boot() {
    layout(); R.init(canvas); PH.input.initTouch(document); refreshMenu(); renderHelp(); toMenu();
    requestAnimationFrame(frame);
  }
  const fontReady = document.fonts && document.fonts.load ? Promise.race([document.fonts.load("12px 'Fusion Pixel 12px Proportional SC'", 'PIXEL 像素斗牛'), new Promise((r) => setTimeout(r, 2500))]) : Promise.resolve();
  fontReady.then(boot, boot);
})();
