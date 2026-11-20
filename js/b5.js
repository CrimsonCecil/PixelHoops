// PIXEL HOOPS - V3.9o 5V5 徽章（类 2K，四档 铜 / 银 / 金 / 名人堂）+ 5V5 团队专属（skill5，定义在 roster.js 的 PH.RX.skill5）
// 只在 5V5 生效。挂钩：team5.js tick（PH.B5.tick）/ doPass（PH.B5.pass、PH.B5.reachK）；render.js PH.scr.hit（scrK / scrT / scrD / scrSway）；game.js 篮板范围（G.h5.rebK）
// 档位按能力自动分配（能力：roster / ARCH 的 ×99 值 + r5.js 的 2K 原始传球 / 协防 / 预判能力），不占 1V1 的 4 个徽章位
(function () {
  const PH = window.PH = window.PH || {};
  const cl = (v, a, b) => (v < a ? a : v > b ? b : v), hyp = Math.hypot, HY = 12.425;
  const dist = (a, b) => hyp(a.x - b.x, a.y - b.y), dHoop = (p) => hyp(p.x, HY - p.y);
  const MED = { pac: 69, piq: 70, vis: 54, siq: 70, iq: 60, hlp: 71, ppc: 67, hands: 85 };
  function raw(a) { const R = PH.R5, row = R && R.P[a.key], o = {}; (R ? R.F : Object.keys(MED)).forEach((f, i) => { o[f] = row ? row[i] : MED[f]; }); return o; }
  const bwK = (a) => cl(((a.bw || 1) - 0.8) / 0.6, 0, 1);
  // 分档分数（×99 / 2K 原值）与四档门槛
  const SCORE = {
    dimer: (a, q) => 0.7 * q.pac + 0.3 * q.vis,
    needle: (a, q) => 0.5 * q.pac + 0.5 * q.piq,
    bailout: (a, q) => 0.4 * q.piq + 0.4 * q.vis + 0.2 * a.hnd * 99,
    breaker: (a, q) => 0.45 * q.pac + 0.25 * q.vis + 0.3 * a.dreb * 99,
    postpm: (a, q) => 0.4 * q.piq + 0.3 * q.vis + 0.3 * (a.post || 0) * 99,
    brick: (a) => 99 * (0.55 * a.str + 0.45 * bwK(a)),
    dodger: (a) => 99 * (0.45 * a.acc + 0.25 * a.spd + 0.3 * a.def),
    intercept: (a, q) => 0.5 * a.stl * 99 + 0.5 * q.ppc,
    anchor: (a, q) => 0.4 * a.blk * 99 + 0.3 * (a.intD || 0) * 99 + 0.3 * q.hlp,
    chaser: (a) => 99 * (0.45 * (a.oreb || 0) + 0.35 * (a.dreb || 0) + 0.2 * a.vert),
    boxout: (a) => 99 * (0.45 * a.str + 0.35 * (a.dreb || 0) + 0.2 * bwK(a)),
  };
  const TH = { dimer: [78, 83, 88, 94], needle: [78, 83, 88, 94], bailout: [75, 80, 86, 92], breaker: [69, 73, 78, 85], postpm: [66, 71, 77, 84],
    brick: [62, 74, 85, 95], dodger: [74, 78, 82, 86], intercept: [70, 77, 83, 90], anchor: [68, 76, 84, 91], chaser: [65, 72, 79, 84], boxout: [66, 75, 84, 92] };
  const KEYS = Object.keys(TH);
  // V4.5 调参台：5V5 徽章 / 团队专属数值从 team5.js 的 TUNE 缓存（PH.T5.TV，t5_b5_* / t5_sk_*）读，没有时用原值
  const tv = (k, d) => { const V = PH.T5 && PH.T5.TV, v = V && V[k]; return typeof v === 'number' && isFinite(v) ? v : d; };
  // 效果（下标 = 档位 0 无 / 1 铜 / 2 银 / 3 金 / 4 名人堂）
  const E = {
    dimer: { p: [1, 1.01, 1.015, 1.025, 1.035], g: [1, 1.03, 1.05, 1.07, 1.1] },
    needle: { ch: [1, 0.88, 0.8, 0.7, 0.6], r: [1, 0.95, 0.92, 0.88, 0.84] },
    bailout: { er: [1, 0.75, 0.6, 0.45, 0.3], ch: [1, 0.85, 0.75, 0.65, 0.55] },
    breaker: { sp: [0, 0.08, 0.12, 0.16, 0.22], er: [1, 0.7, 0.55, 0.4, 0.25], ch: [1, 0.8, 0.7, 0.6, 0.5] },
    postpm: { ch: [1, 0.8, 0.7, 0.6, 0.5], p: [1, 1.02, 1.03, 1.045, 1.06], g: [1, 1.05, 1.08, 1.12, 1.16] },
    brick: { k: [1, 1.12, 1.2, 1.3, 1.42] },
    dodger: { k: [1, 0.9, 0.83, 0.75, 0.67], d: [1, 0.9, 0.83, 0.75, 0.67] },
    intercept: { r: [1, 1.06, 1.1, 1.15, 1.2], ch: [1, 1.12, 1.2, 1.3, 1.4] },
    anchor: { c: [1, 1.06, 1.1, 1.15, 1.2], b: [1, 1.1, 1.17, 1.25, 1.35] },
    chaser: { r: [1, 1.06, 1.1, 1.15, 1.2] },
    boxout: { r: [1, 0.88, 0.8, 0.7, 0.6] },
  };
  // V4.5 徽章强度：t5_b5k_<徽章> 倍率（1 = 原表；>1 放大与无徽章的差距，0 = 等于无徽章）
  const ef = (b, f, t) => { const v = E[b][f][t], k = tv('t5_b5k_' + b, 1); return k === 1 || !t ? v : f === 'sp' ? v * k : 1 + (v - 1) * k; };
  // 团队专属：基础冷却（秒，比赛时间）；按节长再拉长，保证每人每场次数可控（传球大师约 4 次）
  const SK = {
    dime: { cd: 18, per: 4.5, cap: 5, win: 1.6, name: '传球大师' },
    space: { cd: 15, per: 7, win: 1.5, name: '空位创造' },
    screen: { cd: 12, per: 9, win: 2.5, name: '掩护大师' },
    hub: { cd: 30, per: 8, dur: 10, name: '组织核心' },
    dcmd: { cd: 30, per: 8, dur: 8, name: '防守指挥' },
  };
  function tiersOf(a) {
    const th = tv('t5_b5_th', 0);
    if (!a) return {}; if (a._b5 && a._b5o === th) return a._b5;
    const q = raw(a), o = {};
    for (const k of KEYS) { const s = SCORE[k](a, q) - th, t = TH[k]; o[k] = s >= t[3] ? 4 : s >= t[2] ? 3 : s >= t[1] ? 2 : s >= t[0] ? 1 : 0; }
    a._b5o = th; return (a._b5 = o);
  }
  const B = { off: false, dry: false, dis: {} };   // dry：只统计不生效（QA 对照组：同样的触发判定和记录，效果全部不加）
  const tier = (p, k) => (B.off || B.dis[k] || !p || !p.arch ? 0 : tiersOf(p.arch)[k] || 0);
  const sk5 = (p) => { if (B.off || !p || B.dis.sk5) return null; const S = PH.RX && PH.RX.skill5 && PH.RX.skill5[p.key]; return S && !B.dis[S.type] ? S : null; };
  const T5 = () => PH.T5 && PH.T5.T, GG = () => PH.game.G, A5 = () => PH.game.t5;
  const on5 = () => { const G = GG(); return G && G.mode === 't5' && T5() && T5().on; };
  // ---------- 每场状态 / 统计 ----------
  let S = null;
  function st() {
    const T = T5();
    if (!S || S.T !== T || (T && T.time < S.t)) S = { T: T, t: 0, cd: {}, n: {}, hub: [-9, -9], dcmd: [-9, -9], pick: null, play: null, off: -1, chgT: [-9, -9], pend: null, lastShot: null, lastPs: null, st: {}, sh: { all: [0, 0, 0, 0] }, log: [] };
    if (T) S.t = T.time; return S;
  }
  const rec = (k) => { const s = st().st; return s[k] || (s[k] = { n: 0, sh: 0, mk: 0, sh3: 0, mk3: 0, x: 0 }); };
  const skCD = (p, S5) => { const T = T5(), K = SK[S5.type]; return Math.max(K.cd, (T.qlen || 300) * 4 / K.per) * tv('t5_sk_cd', 1); };
  const skOk = (p, S5) => { const s = st(); return !(s.cd[p.id] > T5().time) && !((s.n[p.id] || 0) >= (SK[S5.type].cap || 99)); };
  let cutSeq = 900000;
  function fire(p, S5, txt) {
    const s = st(), T = T5(), G = GG(), K = SK[S5.type];
    s.cd[p.id] = T.time + skCD(p, S5); s.n[p.id] = (s.n[p.id] || 0) + 1; rec('sk_' + S5.type).n++;
    s.log.push({ t: +T.time.toFixed(1), q: T.q, key: p.key, type: S5.type });
    if (G.mode === 'demo') return;
    // 不冻结：半屏插屏（G.cutin short，render.js PH.ci 面板 0.9 秒，计时由 game.js t5step 推进）+ 本人浮字 + 徽章弹窗（芯片）
    if (!G.cutin) G.cutin = { t: 0, T: 0.9, pid: p.id, name: p.arch.name, full: p.arch.full, skill: S5.name, en: S5.en, col: p.team && p.team.css ? p.team.css : '#ffd24a', seq: ++cutSeq, short: true, five: true };
    try { A5().float(txt || S5.name, p, '#ffd24a', 1); } catch (e) {}
    pop(p, 'sk5_' + S5.type, S5.name);
    try { A5().sfx('badge'); } catch (e) {}
    // V3.9o2 触发时已出半屏插屏，不再补进球后的短插屏（s.pend 不再设置）
  }
  function pop(p, key, name, tr) {
    const G = GG(); if (G.mode === 'demo') return;
    const L = G.bpops || (G.bpops = []), gt = G.time;
    if (L.some((y) => y.pid === p.id && y.key === key && gt - y.t0 < 2.5)) return;
    L.push({ pid: p.id, key: key, name: name, tier: tr || 0, t0: gt }); if (L.length > 6) L.shift();
  }
  const bpop = (p, k) => { const t = tier(p, k); if (t) { pop(p, k, PH.game.BADGES[k].name, t); try { if (PH.audio && GG().mode !== 'demo') PH.audio.play('badge'); } catch (e) {} } };
  const team = (tm) => T5().tm[tm].on;
  // ---------- 传球 ----------
  function reachK(d, p) {
    if (!on5()) return 1; const s = st(), T = T5();
    let k = ef('intercept', 'r', tier(d, 'intercept')) * ef('needle', 'r', tier(p, 'needle'));
    if (s.dcmd[d.tm] > T.time) k *= tv('t5_sk_dcR', 1.15);
    return B.dry ? 1 : k;
  }
  function passState(p, m, kind) {
    const s = st(), T = T5();
    const d0 = dist(p, m), jp = !!p.jpNow, kick = dHoop(p) < 5, cut = !!(m.f5 && m.f5.cut) || ((m.speed || 0) > 3 && ((m.vx || 0) * -m.x + (m.vy || 0) * (HY - m.y)) > 0.6 * m.speed * dHoop(m));
    const postIn = p.post || (p.f5 && p.f5.ck && p.f5.ck.k === 'post' && T.time - (p.catchT || -9) < 1.5);
    const S5 = sk5(p); let skT = null;
    if (S5 && skOk(p, S5)) {
      if (S5.type === 'dime' && (jp || kick || kind === 'bounce' || kind === 'lob' || kind === 'alley' || d0 >= 9 || cut)) skT = 'dime';
      else if (S5.type === 'space' && dHoop(p) <= 4.5 && dHoop(m) >= 5) skT = 'space';
    }
    return { d0, needle: tier(p, 'needle'), bailout: jp || kick ? tier(p, 'bailout') : 0,
      breaker: T.time - s.chgT[p.tm] < tv('t5_b5_bkW', BK.win) && d0 >= tv('t5_b5_bkD', BK.dd) ? tier(p, 'breaker') : 0,
      postpm: postIn ? tier(p, 'postpm') : 0, dimer: tier(p, 'dimer'), hub: s.hub[p.tm] > T.time, S5, skT };
  }
  function pass(p, m, kind, ps, Tt, first) {
    if (!on5() || !ps || !m) return; const T = T5();
    if (ps.inb) return;
    const C = ps.badgeState || passState(p, m, kind), d0 = C.d0;
    let chM = 1, erM = 1, sp = 0; const used = [];
    const tn = C.needle; if (tn) { chM *= ef('needle', 'ch', tn); used.push('needle'); }
    const tb = C.bailout; if (tb) { chM *= ef('bailout', 'ch', tb); erM *= ef('bailout', 'er', tb); used.push('bailout'); }
    const tk = C.breaker; if (tk) { chM *= ef('breaker', 'ch', tk); erM *= ef('breaker', 'er', tk); sp = ef('breaker', 'sp', tk); used.push('breaker'); }
    const tp = C.postpm; if (tp) { chM *= ef('postpm', 'ch', tp); used.push('postpm'); }
    if (C.hub) chM *= tv('t5_sk_hubCh', 0.6);
    if (first && first.d) { const ti = tier(first.d, 'intercept'); if (ti) { chM *= ef('intercept', 'ch', ti); rec('intercept').n++; first.b5i = 1; } }
    // 团队专属
    const skT = C.skT;
    if (skT) fire(p, C.S5, skT === 'dime' ? '妙传' : '突分');
    if (skT) { chM = 0; if (skT === 'dime') erM = 0; }
    if (B.dry) { if (first) for (const k of used) rec(k).x += first.ch * (1 - chM); chM = 1; erM = 1; sp = 0; }
    if (first && !B.dry) { const c0 = first.ch; first.ch = Math.max(c0 * chM, chM === 0 ? 0 : c0 * tv('t5_b5_chMin', 0.35)); if (first.ch <= 0) ps.int = null; for (const k of used) rec(k).x += c0 - first.ch; }
    if (erM < 1 || sp) {
      let ix = m.x + (m.vx || 0) * Tt * 0.6, iy = m.y + (m.vy || 0) * Tt * 0.6;
      if ((kind === 'alley' || kind === 'lob') && dHoop(m) < 5.5) { ix = ix + (0 - ix) * 0.35; iy = iy + (HY - 0.6 - iy) * 0.35; }
      ix = cl(ix, -7.4, 7.4); iy = cl(iy, -13.8, 13.8);
      ps.tx = ix + (ps.tx - ix) * erM; ps.ty = iy + (ps.ty - iy) * erM; ps.er = (ps.er || 0) * erM;
      if (sp) { ps.T = Math.max(0.22, ps.T / (1 + sp)); ps.v = d0 / ps.T; }
    }
    for (const k of used) rec(k).n++;
    if (used.length) bpop(p, used[0]);
    m.b5in = { t: T.time, from: p, dimer: C.dimer, postpm: tp, sk: skT, hub: C.hub };
  }
  // ---------- 掩护（render.js PH.scr.hit） ----------
  function scrK(s, d) {
    if (!on5()) return 1; const S0 = st(), T = T5();
    let k = ef('brick', 'k', tier(s, 'brick')) * ef('dodger', 'k', tier(d, 'dodger'));
    if (S0.dcmd[d.tm] > T.time) k *= tv('t5_sk_dcS', 0.7);
    return B.dry ? 1 : k;
  }
  function scrT(s, d, t0, kind) {
    if (!on5()) return t0; const T = T5(); let t = t0;
    const S5 = sk5(s);
    if (S5 && S5.type === 'screen' && skOk(s, S5)) {
      t = Math.max(t0, tv('t5_sk_scrT', 3) + (Math.random() < 0.4 ? 1 : 0)); fire(s, S5, '掩护大师');
      const until = T.time + SK.screen.win; s.b5scr = until;
      const h = kind === 'pnr' ? T.pick && T.pick.h : d.mark; if (h && h.tm === s.tm) h.b5scr = until;
    }
    const tb = tier(s, 'brick'), td = tier(d, 'dodger'), g = st();
    if (tb) { rec('brick').n++; rec('brick').x += t; bpop(s, 'brick'); }
    if (td) { rec('dodger').n++; rec('dodger').x += t; bpop(d, 'dodger'); }
    (g.scr || (g.scr = [0, 0]))[0]++; g.scr[1] += t;
    return B.dry ? t0 : t;
  }
  function scrD(s, d, t, f) {
    if (!on5() || B.dry) return; const td = tier(d, 'dodger'); if (!td) return; const k = ef('dodger', 'd', td);
    f.scrD *= k; if (d.stun > 0) { d.stun *= k; d.stunT0 = d.stun; }
  }
  const scrSway = (s) => (on5() && !B.dry && tier(s, 'brick') ? 0.5 : 1);
  // ---------- 篮板（game.js） ----------
  function rebK(p) {
    if (!on5()) return 1; let k = ef('chaser', 'r', tier(p, 'chaser'));
    const dp = dHoop(p);
    for (const q of team(1 - p.tm)) { const t = tier(q, 'boxout'); if (t && q.z < 0.3 && !(q.stun > 0) && dist(q, p) < 1.6 && dHoop(q) < dp) k = Math.min(k, k * ef('boxout', 'r', t)); }
    return B.dry ? 1 : k;
  }
  // ---------- 长传快攻：CPU 传球意愿（team5.js passVal 末尾加分） ----------
  // 换攻 4 秒内、持球人有长传快攻、接球人在前方 ≥4 米且身边 2 米内没人、传球距离 ≥9 米 → 传球价值加分（铜 0.3 ~ 名人堂 0.6）
  const CSG = [0, 0.08, 0.15, 0.25, 0.36];   // = team5.js CSB.g（接球投篮绿区加成，按档位）
  const BK = { win: 4, dd: 9 };   // 长传快攻：换攻后 4 秒内、≥9 米
  function passV(p, m, dd) {
    if (!on5() || B.dry || !p || !m) return 0; const t = tier(p, 'breaker'); if (!t) return 0;
    const s = st(), T = T5(); if (T.time - s.chgT[p.tm] > tv('t5_b5_bkW', BK.win)) return 0;
    const D = B.dbg || (B.dbg = {}); D.w = (D.w || 0) + 1; if (dd < tv('t5_b5_bkD', BK.dd)) { D.dd = (D.dd || 0) + 1; return 0; } if (m.y < p.y + 4) { D.ah = (D.ah || 0) + 1; return 0; }
    let nd = 9; for (const d of team(1 - p.tm)) nd = Math.min(nd, dist(d, m)); if (nd < 2) { D.nd = (D.nd || 0) + 1; return 0; }
    D.ok = (D.ok || 0) + 1; return tv('t5_b5_bkV0', 0.2) + tv('t5_b5_bkVt', 0.1) * t;
  }
  // ---------- 每帧（team5.js tick，csTick 之后、shotAdj 之前） ----------
  function tick(T, dt) {
    if (!on5()) return; const s = st(), G = GG();
    if (G.h5 && G.h5.rebK !== rebK) G.h5.rebK = rebK;
    if (G.off !== s.off) { if (s.off >= 0 && T.phase === 'live') s.chgT[G.off] = T.time; s.off = G.off; }
    // 长传快攻：换攻后持球人有这个徽章，读秒提前（0.2 秒内就看前场），每次换攻只提前一次
    if (!B.dry && T.time - s.chgT[G.off] < tv('t5_b5_bkW', BK.win) && s.bkD !== s.chgT[G.off]) { const h = G.ball.state === 'held' ? G.players[G.ball.holder] : null; if (h && h.tm === G.off && h.ctrl === 'cpu' && h.f5 && tier(h, 'breaker')) { s.bkD = s.chgT[G.off]; h.f5.dec = Math.min(h.f5.dec == null ? 9e9 : h.f5.dec, T.time + 0.2); } }
    // 组织核心 / 防守指挥：对方或己方发起挡拆 / 战术
    const pk = T.pick, pl = T.play;
    let ev = null;
    if (pk && pk !== s.pick && pk.h) ev = { h: pk.h }; else if (pl && pl !== s.play) ev = { h: pl.lh || (G.ball.holder >= 0 ? G.players[G.ball.holder] : null) };
    s.pick = pk; s.play = pl;
    if (ev && ev.h && T.phase === 'live') {
      const h = ev.h, S5 = sk5(h);
      if (S5 && S5.type === 'hub' && skOk(h, S5) && h.hasBall) { s.hub[h.tm] = T.time + tv('t5_sk_hubT', SK.hub.dur); fire(h, S5, '组织核心'); }
      for (const d of team(1 - h.tm)) { const D5 = sk5(d); if (D5 && D5.type === 'dcmd' && skOk(d, D5)) { s.dcmd[d.tm] = T.time + tv('t5_sk_dcT', SK.dcmd.dur); fire(d, D5, '防守指挥'); break; } }
    }
    // 截传结算统计：上一帧在飞的传球，这一帧被截传徽章的人拿到
    if (s.lastPs && s.lastPs !== T.ps && s.lastPs.int && s.lastPs.int.b5i) { const d = s.lastPs.int.d; if (G.ball.holder === d.id || (G.ball.state === 'loose' && G.ball.lastTouch === d.id)) rec('intercept').mk++; }
    s.lastPs = T.ps;
    // 出手加成
    for (const p of T.tm[0].on.concat(T.tm[1].on)) {
      const a = p.action; if (!a || (a.type !== 'shot' && a.type !== 'layup') || a.released || a.b5 || !a.V) continue;
      a.b5 = 1; let pm = 1, gm = 1, cm = 1, bm = 1, skG = false; const used = [];
      const ct = T.time - (p.catchT == null ? -9 : p.catchT), I = p.b5in && p.catchT != null && p.catchT >= p.b5in.t - 0.01 ? p.b5in : null;
      if (I && I.dimer && ct <= 1.5) { pm *= ef('dimer', 'p', I.dimer); gm *= ef('dimer', 'g', I.dimer); used.push('dimer'); bpop(I.from, 'dimer'); }
      if (I && I.postpm && ct <= 1.5) { pm *= ef('postpm', 'p', I.postpm); gm *= ef('postpm', 'g', I.postpm); used.push('postpm'); }
      if (I && (I.hub || s.hub[p.tm] > T.time) && ct <= 2 && !(sk5(p) && sk5(p).type === 'hub')) { pm *= tv('t5_sk_hubP', 1.06); gm *= tv('t5_sk_hubG', 1.3); used.push('sk_hub'); }
      if (I && I.sk === 'dime' && ct <= SK.dime.win) { cm *= tv('l1_smKy', 0.5); bm = 0; gm *= tv('l1_gwSkill', 1.7); skG = true; used.push('sk_dime'); }
      if (I && I.sk === 'space' && ct <= SK.space.win && a.type === 'shot') { cm *= tv('t5_sk_spC', 0.35); gm *= tv('t5_sk_spG', 1.5); pm *= tv('t5_sk_spP', 1.08); skG = true; used.push('sk_space'); }
      if (p.b5scr > T.time) { cm *= tv('t5_sk_scrC', 0.5); gm *= tv('t5_sk_scrG', 1.5); skG = true; used.push('sk_screen'); p.b5scr = 0; }
      if (dHoop(p) < 3) { let ta = 0, who = null; for (const d of team(1 - p.tm)) { const t = tier(d, 'anchor'); if (t > ta && dist(d, p) < 2.5) { ta = t; who = d; } } if (ta) { cm *= ef('anchor', 'c', ta); bm *= ef('anchor', 'b', ta); used.push('anchor'); bpop(who, 'anchor'); } }
      if (s.dcmd[1 - p.tm] > T.time) { cm *= tv('t5_sk_dcC', 1.15); used.push('sk_dcmd'); }
      if (!used.length) { p.b5k = null; continue; }
      // 绿区封顶算总倍率：team5 接球投篮 CSB（a.csB 档位，已乘在 a.V.g 上，空位/掩护 +0.04 这里按上限算）× b5 ≤ 1.7，团队专属 ≤ 2.0；
      // CSB 自己不被削（gm 最低 1），名人堂接投空位单独 1.40 完整生效
      // V4.0 调参台：CSB 绿区和上限从 team5.js 的 TUNE 缓存读（t5_csb_* / t5_b5_*），没有时用原值
      const TV = (PH.T5 && PH.T5.TV) || {}, CG = (PH.T5 && PH.T5.CSB && PH.T5.CSB.g) || CSG;
      const csf = a.csB ? 1 + CG[a.csB] + (TV.t5_csb_xg != null ? TV.t5_csb_xg : 0.04) : 1;
      pm = Math.min(pm, TV.t5_b5_pm || 1.15); gm = Math.max(1, Math.min(gm, skG ? tv('l1_gwSkill', 1.7) * tv('t5_b5_gmSK', 1.12) : tv('l1_gwBadge', 1.45) * tv('t5_b5_gmK', 1.1), (skG ? tv('l1_gwSkill', 1.7) * tv('t5_b5_totSK', 1.18) : tv('l1_gwBadge', 1.45) * tv('t5_b5_totK', 1.17)) / csf));
      const V = a.V; if (!B.dry) a.V = Object.assign({}, V, { p: (V.p || 1) * pm, g: (V.g || 1) * gm, c: (V.c == null ? 1 : V.c) * cm, blk: (V.blk == null ? 1 : V.blk) * bm });
      for (const k of used) if (k === 'dimer' || k === 'postpm' || k === 'anchor' || k.slice(0, 3) === 'sk_') rec(k).x++;
      a.b5k = used; p.b5k = used; p.b5in = null;
    }
    // 出手结算：命中统计（触发 vs 全部）
    const b = G.ball;
    if (b.state === 'shot' && b.shot && b.shot !== s.lastShot) {
      s.lastShot = b.shot; const sh = G.players[b.shot.shooter], mk = b.shot.made ? 1 : 0, t3 = sh && PH.game.isThree(sh.x, sh.y) ? 1 : 0;
      const A = s.sh.all; A[0]++; A[1] += mk; A[2] += t3; A[3] += t3 && mk ? 1 : 0;
      const ks = sh && sh.b5k; if (ks) { for (const k of ks) { const r = rec(k); r.sh++; r.mk += mk; r.sh3 += t3; r.mk3 += t3 && mk ? 1 : 0; } sh.b5k = null; }
    }
    // 用户方专属后得分：进球后 0.6 秒短插屏（球已是死球，不冻结活球）
    const P = s.pend;
    if (P) {
      if (T.cnt.poss !== P.poss || T.time - P.t > 14) s.pend = null;
      else if (T.tm[P.tm].score > P.sc && !G.cutin) {
        s.pend = null; const p = P.p;
        G.cutin = { t: 0, T: 0.6, pid: p.id, name: p.arch.name, full: p.arch.full, skill: P.S5.name, en: P.S5.en, col: p.team ? p.team.css : '#ffd24a', seq: ++cutSeq, short: true };
      }
    }
  }
  function stats() { const s = st(); return { st: s.st, sh: s.sh, n: s.n, log: s.log, scr: s.scr || [0, 0] }; }
  Object.assign(B, { tick, pass, passState, passV, reachK, scrK, scrT, scrD, scrSway, rebK, tier, tiersOf, sk5, stats, KEYS, TH, E, SK, SCORE });
  PH.B5 = B;
})();
