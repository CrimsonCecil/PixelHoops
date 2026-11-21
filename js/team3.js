// PIXEL HOOPS - 3V3 半场
(function () {
  const PH = window.PH, GM = PH.game, G = GM.G, A = GM.t5;
  const T = { on: false };
  const arc = GM.isThree, hoop = A.HOOP;
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const teams = (tm) => G.players.filter((p) => p.tm === tm);
  const holder = () => G.ball.state === 'held' ? G.players[G.ball.holder] : null;
  const nearest = (list, spot) => list.reduce((best, p) => !best || dist(p, spot) < dist(best, spot) ? p : best, null);
  const shooting = (p) => p.action && ['shot', 'layup', 'dunk'].includes(p.action.type);
  const shooter = (p) => p.r.three > 0.77 && p.r.three >= p.r.lay - 0.15;
  const canScreen = (p) => !p.off && !p.action && !p.stun && p.z < 0.05 && !p.hasBall;
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const rating = (p, key, fallback) => {
    const r = PH.R5, row = r && r.P[p.arch.key];
    return (row && row[r.F.indexOf(key)] || fallback) / 100;
  };
  const position = (a) => a.pos.endsWith('后卫') ? '后卫' : a.pos === '中锋' || a.pos === '大前锋' ? '内线' : '锋线';
  function matchups() {
    const off = teams(G.off), def = teams(1 - G.off);
    const pairs = [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]];
    let order, bestGroup = -1, bestExact = -1, min = Infinity;
    for (const pair of pairs) {
      let group = 0, exact = 0, cost = 0;
      pair.forEach((j, i) => {
        const d = def[i], o = off[j];
        group += Number(position(d.arch) === position(o.arch));
        exact += Number(d.arch.pos === o.arch.pos);
        cost += dist(d, o);
      });
      if (group > bestGroup || group === bestGroup && (exact > bestExact || exact === bestExact && cost < min)) {
        bestGroup = group; bestExact = exact; min = cost; order = pair;
      }
    }
    T.marks = new Map(def.map((p, i) => [p, off[order[i]]]));
    T.defTeam = 1 - G.off;
    T.cover = null;
    T.swap = null;
    T.switchAt = G.time;
    restoreMarks();
  }
  function restoreMarks() {
    for (const [d, m] of T.marks) d.opp = m;
    if (T.swap) {
      const { a, b } = T.swap;
      a.opp = T.marks.get(b); b.opp = T.marks.get(a);
    }
    const def = [...T.marks.keys()];
    for (const p of teams(G.off)) p.opp = nearest(def, p);
  }
  function swapMarks(a, b) {
    T.swap = { a, b, h: holder() };
    T.switchAt = G.time + 0.85;
    restoreMarks();
  }
  const available = (p) => p.ctrl === 'cpu' && !p.off && !p.action && !p.stun && p.z < 0.1;
  function threat(p) {
    return GM.distHoop(p) < 2.7 ? 2 + Math.max(p.r.lay, p.r.dunk) : arc(p.x, p.y) ? p.r.three : p.r.mid * 0.7;
  }
  function defense(h) {
    if (T.defTeam !== 1 - G.off) matchups();
    if (T.swap && (h !== T.swap.h || G.needClear || G.time >= T.switchAt)) T.swap = null;
    restoreMarks();
    const previous = T.cover;
    T.cover = null;
    if (!h || G.needClear) return;
    const d = [...T.marks.keys()].find((p) => p.opp === h);
    if (!d) return;
    const dx = hoop.x - h.x, dy = hoop.y - h.y, lane = Math.hypot(dx, dy) || 1;
    const ahead = ((d.x - h.x) * dx + (d.y - h.y) * dy) / lane;
    const beaten = d.stun > 0.15 || ahead < -0.5 || dist(d, h) > 2.7 && ahead < 1;
    if (!beaten) return;
    const help = [...T.marks.keys()].filter((p) => p !== d && available(p));
    if (!help.length) return;
    const attack = (h.vx * dx + h.vy * dy) / lane;
    if (lane < 4.7 && (attack > 0.45 || lane < 3.25 || shooting(h))) {
      // Cut off the rim before accounting for the helper's original assignment.
      const depth = Math.min(1.3, lane * 0.45);
      const spot = { x: h.x + dx / lane * depth, y: h.y + dy / lane * depth };
      const closest = nearest(help, spot);
      const helper = previous?.h === h && help.includes(previous.helper) && dist(previous.helper, spot) < dist(closest, spot) + 0.6 ? previous.helper : closest;
      const free = teams(G.off).filter((p) => p !== h).sort((a, b) => threat(b) - threat(a));
      const next = help.find((p) => p !== helper);
      T.cover = { h, helper, spot, next };
      if (next) { next.opp = free[0]; d.opp = free[1]; }
      else d.opp = helper.opp;
      helper.opp = h;
      return;
    }
    const closer = nearest(help, h);
    if (G.time >= T.switchAt && dist(closer, h) + 1.1 - closer.tendency.help * 0.55 < dist(d, h) &&
      dist(closer, h) < 3 && (!T.pick || T.pick.phase === 'roll')) swapMarks(d, closer);
  }
  function check(team, message) {
    const off = teams(team), def = teams(1 - team);
    const h = off.find((p) => p.ctrl !== 'cpu') || off[0];
    clearPick();
    T.pass = null; T.request = null; G.phase = 'check'; G.phaseT = 0.9; G.off = team;
    G.shotClock = T.clock; G.needClear = false; G.illId = -1;
    const spots = [[0, 4.65], [-6.8, 9.0], [6.8, 9.0]];
    const order = [h, ...off.filter((p) => p !== h)];
    for (let i = 0; i < 3; i++) for (const p of [order[i], def[i]]) {
      const d = p.tm !== team;
      Object.assign(p, { x: spots[i][0] * (d ? 0.9 : 1), y: spots[i][1] + (d ? 1.15 : 0), z: 0, vx: 0, vy: 0, vz: 0, speed: 0,
        hasBall: p === h, action: null, stun: 0, knock: null, post: false, stance: false, box: false, ib: null, finQ: null, recT: 0,
        face: d ? -Math.PI / 2 : Math.PI / 2, stam: Math.min(100, p.stam + 15), opp: null, cutUntil: 0, screen3: false, screenSlow3: 0 });
      Object.assign(p.ai, { t: 0, hold: false, su: null, om: null, dm: null, comboAt: -1 });
    }
    T.acquired = G.time; T.nextPass = G.time + 1.4; T.nextPick = G.time + 2.5;
    G.ball = { x: h.x, y: h.y, z: 1, vx: 0, vy: 0, vz: 0, state: 'held', holder: h.id, spin: 0, shot: null, lastTouch: h.id, noPick: 0, dead: false, under: false, trail: null };
    matchups();
    for (const [d, o] of T.marks) { d.x = o.x * 0.9; d.y = o.y + 1.15; }
    restoreMarks();
    A.banner(message || '弧顶交换球', GM.TEAMS[team].name + '球权', GM.TEAMS[team].css, 0.9);
  }
  function lost(by, text, receiving) {
    if (by) G.stats[by.id].tov++;
    A.sfx('whistle');
    check(receiving == null ? 1 - G.off : receiving, text);
  }
  function score(p, pts) {
    const tm = p.tm;
    G.score[tm] += pts;
    G.stats[p.id].pts = (G.stats[p.id].pts || 0) + pts;
    G.phase = 'dead'; G.phaseT = 1.0; T.next = 1 - tm;
    if (G.score[tm] >= G.target) G.winner = tm;
    A.banner(pts === 3 ? '三分命中' : '两分命中', p.arch.name + ' · ' + GM.TEAMS[tm].name + ' +' + pts, p.team.css, 1.0);
  }
  function gotBall(p, change) {
    T.acquired = G.time; T.pass = null;
    if (change) { clearPick(); matchups(); }
    p.ai.hold = false; p.ai.su = null;
    if (p.ctrl !== 'cpu') { const input = T.inputs && T.inputs[p.id]; if (input) Object.assign(p.prev, { a1: input.a1, a2: input.a2, a3: input.a3 }); }
  }
  function start(o) {
    const players = o.slots.map((s, i) => {
      const tm = i < 3 ? 0 : 1, p = A.makePlayer(i, s.arch, s.role === 'cpu' || s.role === 'waiting' ? 'cpu' : 'p1', GM.TEAMS[tm]);
      p.tm = tm; p.ring = i === o.local;
      p.tendency = { pass: (rating(p, 'piq', 70) + rating(p, 'vis', 54)) / 2, accuracy: rating(p, 'pac', 69),
        move: rating(p, 'iq', 60), help: rating(p, 'hlp', 71), read: rating(p, 'ppc', 67), shot: rating(p, 'siq', 70) };
      p.nextCut = 1 + i % 3; return p;
    });
    Object.assign(T, { on: true, replay: o.replay !== false, pass: null, clock: o.clock == null ? 24 : o.clock, next: 0, prev: {}, screenPrev: {}, inputs: {}, request: null });
    A.begin(players, { half: true, clock: T.clock, target: o.target || 21, diff: o.diff, hooks: {
      pickup: gotBall, score,
      turnover: (to, msg) => lost(G.players[G.ball.lastTouch], msg, G.players[to] && G.players[to].tm),
      oob: (id) => lost(G.players[id], '球出界', G.players[id] ? 1 - G.players[id].tm : 1 - G.off)
    } });
    G.fb = o.fb || 'simple';
    G.focus = { cx: 0, cy: -10.5 };
    check(0, '开球');
  }
  function stop() { if (T.on) { clearPick(); T.on = false; T.pass = null; A.end(); } }
  function go(p, tx, ty, sprint) {
    const dx = tx - p.x, dy = ty - p.y, d = Math.hypot(dx, dy), o = A.zeroInp();
    if (d > 0.14) { o.mx = dx / Math.max(d, 0.7); o.my = dy / Math.max(d, 0.7); o.sprint = !!sprint && d > 1.3; }
    return o;
  }
  const gap = (p) => dist(nearest(teams(1 - p.tm), p), p);
  function clearPick() {
    if (T.pick) T.pick.s.screen3 = false;
    T.pick = null;
  }
  function startPick(s, h, d) {
    const P = T.pick = { s, h, d, phase: s.ctrl === 'cpu' ? 'approach' : 'set', at: G.time, side: s.x < d.x ? -1 : 1, pop: shooter(s) };
    s.cutUntil = 0;
    if (P.phase === 'set') plant(s);
    T.nextPick = G.time + 4.5;
  }
  function plant(s) { s.screen3 = true; s.vx = s.vy = 0; }
  function pickSpot(P) {
    const { h, d, side } = P, dx = hoop.x - h.x, dy = hoop.y - h.y, l = Math.hypot(dx, dy) || 1;
    return { x: clamp(d.x + side * dy / l * 0.78, -6.9, 6.9), y: clamp(d.y - side * dx / l * 0.78, 0.65, 12.8) };
  }
  function pickTick(h) {
    const P = T.pick;
    if (P) {
      const { s, d } = P;
      if (h !== P.h || !canScreen(s) || (P.phase !== 'roll' && dist(h, d) > 4)) { clearPick(); return; }
      if (P.phase === 'approach') {
        if (dist(s, pickSpot(P)) < 0.36) { P.phase = 'set'; P.at = G.time; plant(s); }
        else if (G.time - P.at > 1.7) clearPick();
      } else if (P.phase === 'set') {
        if (!P.hit && G.time - P.at >= 0.12 && d.z < 0.1 && !d.off && d.stun <= 0 && dist(s, d) < 0.94) {
          const dx = s.x - d.x, dy = s.y - d.y, approach = d.vx * dx + d.vy * dy;
          if (approach > 0.2 || (dist(h, d) > 0.85 && (h.x - d.x) * dx + (h.y - d.y) * dy > 0.18)) {
            const fight = 0.40 * (d.r.lat || d.r.spd) + 0.35 * d.tendency.help + 0.25 * d.r.def;
            const strength = 0.6 * s.r.str + 0.4 * s.tendency.move;
            const speed = clamp(0.24 + 0.62 * fight - 0.18 * strength, 0.28, 0.82);
            d.vx *= speed; d.vy *= speed;
            d.screenSlow3 = G.time + clamp(0.72 + 0.24 * strength - 0.64 * fight, 0.2, 0.8);
            d.screenSpeed3 = speed;
            P.hit = true; P.release = G.time + 0.24;
            A.float('掩护', s, '#9ef0ff', s.ctrl !== 'cpu' ? 1 : 0);
            const other = [...T.marks.keys()].find((m) => T.marks.get(m) === s);
            if (!T.cover && T.marks.get(d) === h && other && available(other) && G.time >= T.switchAt &&
              dist(other, h) + 0.5 - other.tendency.help * 0.45 < dist(d, h) && dist(other, h) < 2.6) swapMarks(d, other);
          }
        }
        const input = T.inputs[s.id];
        if (G.time - P.at >= 0.95 || P.hit && G.time >= P.release ||
          s.ctrl !== 'cpu' && G.time - P.at > 0.25 && input && Math.hypot(input.mx || 0, input.my || 0) > 0.4) {
          s.screen3 = false;
          if (s.ctrl === 'cpu') { P.phase = 'roll'; P.at = G.time; }
          else clearPick();
        }
      } else if (G.time - P.at > 2) clearPick();
      return;
    }
    if (!h || G.needClear || G.time < T.nextPick || G.time - T.acquired < 0.6 ||
      (T.clock && G.shotClock < 4) || GM.distHoop(h) < 4.2 || Math.abs(h.x) > 5.3) return;
    const d = teams(1 - h.tm).find((m) => m.opp === h);
    if (!d || dist(d, h) > 2.8) return;
    const options = teams(h.tm).filter((p) => p.ctrl === 'cpu' && canScreen(p) && p.cutUntil <= G.time &&
      dist(p, d) < 4.2 && (p.r.str * 0.55 + p.tendency.move * 0.45 > 0.66 || shooter(p) && p.tendency.move > 0.74));
    const s = nearest(options, d);
    if (s) startPick(s, h, d);
  }
  function pickInput(p) {
    const P = T.pick;
    if (!P || P.s !== p) return null;
    if (P.phase === 'set') return A.zeroInp();
    if (p.ctrl !== 'cpu') return null;
    if (P.phase === 'approach') { const spot = pickSpot(P); return go(p, spot.x, spot.y, true); }
    return P.pop ? go(p, P.side * 6.65, 8.8, false) : go(p, P.side * 0.95, 11.3, true);
  }
  function passRead(from, p, inp) {
    const d = Math.max(0.25, dist(from, p));
    const aim = inp ? ((inp.mx || 0) * (p.x - from.x) + (inp.my || 0) * (p.y - from.y)) / d : 0;
    const width = gap(p), three = arc(p.x, p.y), close = GM.distHoop(p) < 2.5;
    const risk = teams(1 - p.tm).some((q) => {
      if (q.off || q.stun > 0) return false;
      const u = ((q.x - from.x) * (p.x - from.x) + (q.y - from.y) * (p.y - from.y)) / (d * d);
      return u > 0.15 && u < 0.92 && Math.hypot(q.x - from.x - (p.x - from.x) * u, q.y - from.y - (p.y - from.y) * u) < 0.7;
    });
    const rolling = T.pick?.phase === 'roll' && T.pick.s === p && width > 1.35 && !risk && (T.pick.pop ? three : close);
    const value = 3 * aim + Math.min(3, width) * 0.45 + (three ? p.r.three * 0.8 : close ? p.r.lay * 0.8 : p.r.mid * 0.25) - 0.06 * d - (risk ? 1.5 : 0) + (G.needClear && three ? 3 : 0) + (rolling ? 1.3 : 0);
    return { p, value, width, risk, rolling };
  }
  function target(from, inp) {
    let best = { p: null, value: -Infinity };
    for (const p of teams(from.tm)) {
      if (p === from || p.off) continue;
      const read = passRead(from, p, inp);
      if (read.value > best.value) best = read;
    }
    return best;
  }
  function answerCall(p) {
    const request = T.request;
    if (!request || request.h !== p) return false;
    const { p: to } = request, read = passRead(p, to);
    if (!to.off && !to.stun && !read.risk && read.width >= 2.15 - 1.15 * p.tendency.pass &&
      (!G.needClear || arc(to.x, to.y)) && send(p, to)) return true;
    declineCall();
    return false;
  }
  function declineCall() {
    A.float('暂不传球', T.request.p, '#ffd24a', 1);
    T.request = null;
  }
  function send(from, to) {
    if (!to || from === to || !from.hasBall || from.action || from.stun > 0 || G.phase !== 'live') return false;
    const b = G.ball, duration = Math.max(0.17, dist(from, to) / (13 + 5 * from.tendency.accuracy));
    from.hasBall = false; from.post = false;
    from.face = Math.atan2(to.y - from.y, to.x - from.x);
    T.pass = { from, to, x: from.x, y: from.y, z: from.h * 0.66, t: 0, duration };
    Object.assign(b, { state: 'pass', holder: -1, lastTouch: from.id, wasShot: false, trail: null, vx: 0, vy: 0, vz: 0, dead: false });
    T.nextPass = G.time + 0.85; T.request = null;
    return true;
  }
  function passStep(dt) {
    const P = T.pass, b = G.ball;
    if (!P) return;
    P.t += dt;
    const u = Math.min(1, P.t / P.duration);
    b.x = P.x + (P.to.x - P.x) * u; b.y = P.y + (P.to.y - P.y) * u;
    b.z = P.z + (P.to.h * 0.64 - P.z) * u + 0.25 * Math.sin(Math.PI * u);
    if (u > 0.12) {
      const d = nearest(teams(1 - P.from.tm), b);
      if (!d.stun && dist(d, b) < 0.22 + d.tendency.read * 0.35) {
        G.stats[d.id].stl++; G.stats[P.from.id].tov++; A.pickup(d); A.float('抢断传球', d, '#7dff8a', 1); return;
      }
    }
    if (u === 1) A.pickup(P.to);
  }
  function cpu(p, h, dt) {
    if (G.phase !== 'live') return A.zeroInp();
    const t = p.tendency, b = G.ball, team = p.tm === G.off;
    if (p === h) {
      if (!p.action && !p.stun && G.time > T.nextPass && G.time - T.acquired > 0.3 && (!T.clock || G.shotClock > 2.2)) {
        if (answerCall(p)) return A.zeroInp();
        const best = target(p);
        const driveKick = GM.distHoop(p) < 4 && gap(p) < 1.4 && best.p && arc(best.p.x, best.p.y) && gap(best.p) > 1.7;
        if ((G.needClear && best.value > 3.7) || best.rolling || (best.value > 1.85 && gap(p) < 1.6 && (driveKick || t.pass > 0.72 || GM.distHoop(best.p) < 2.7))) {
          if (send(p, best.p)) return A.zeroInp();
        }
        T.nextPass = G.time + 0.3;
      }
      const o = A.aiInput(p, dt);
      if (!p.action && !G.needClear && arc(p.x, p.y) && p.r.three * t.shot > 0.56 && gap(p) > 2 && G.time - T.acquired > 0.55 && !p.prev.a1) o.a1 = true;
      if (!p.action && !G.needClear && T.clock && G.shotClock < 1.4 && !p.prev.a1) o.a1 = true;
      return o;
    }
    if (b.state === 'loose' || b.state === 'shot') {
      const spot = b.state === 'shot' ? hoop : b;
      if (nearest(teams(p.tm), spot) === p) return A.aiInput(p, dt);
    }
    if (team) {
      const anchor = h || (T.pass && T.pass.to) || nearest(teams(p.tm), b);
      const mates = teams(p.tm).filter((m) => m !== anchor);
      const side = mates.length === 2 ? (mates[0] === p ? (mates[0].x <= mates[1].x ? -1 : 1) : (mates[0].x <= mates[1].x ? 1 : -1)) : (p.id % 2 ? -1 : 1);
      const sniper = shooter(p);
      const cutter = Math.max(p.r.lay, p.r.dunk) > 0.75 && !sniper;
      const iso = h && !G.needClear && !T.pick && (h.post || h.action?.type === 'move' || G.time - T.acquired > 0.95 && Math.abs(h.x) > 2.5);
      if (iso) {
        p.cutUntil = 0;
        const weak = h.x >= 0 ? -1 : 1;
        const corner = mates.reduce((best, m) => m.r.three > best.r.three ? m : best, mates[0]);
        return p === corner ? go(p, weak * 7, 12, false) : go(p, weak * 5.6, 5.9, false);
      }
      if (cutter && h && !G.needClear && G.time > p.nextCut && h.y < 8 && gap(p) > 1.05 && mates.every((m) => m === p || m.cutUntil <= G.time)) {
        p.nextCut = G.time + 4.2 - t.move * 1.4; p.cutUntil = G.time + 1.05 + t.move * 0.55;
      }
      if (!G.needClear && p.cutUntil > G.time) return go(p, side * 0.9, 11, true);
      const crowded = anchor && anchor.x * side > 3.6;
      return go(p, side * (sniper ? 7 : crowded ? 6.9 : 5.8), sniper ? 12 : crowded ? 12.1 : 7.15, false);
    }
    if (T.cover?.helper === p && dist(p, T.cover.spot) > 0.65) {
      const o = go(p, T.cover.spot.x, T.cover.spot.y, t.help > 0.66);
      const effort = 0.68 + 0.32 * t.help;
      o.mx *= effort; o.my *= effort;
      return o;
    }
    if (p.opp === h || !h) return A.aiInput(p, dt);
    const m = p.opp;
    return go(p, m.x + (hoop.x - m.x) * 0.12, m.y + (hoop.y - m.y) * 0.12 + 0.5, T.cover?.next === p && t.help > 0.66);
  }
  function tick(dt, inputs) {
    if (!T.on) return;
    if (G.replay) { A.replayTick(dt); return; }
    T.inputs = inputs || {};
    const h = holder();
    if (G.phase === 'live') {
      defense(h);
      if (T.request && (T.request.h !== h || T.request.until <= G.time)) declineCall();
      for (const p of G.players) {
        const inp = T.inputs[p.id], pass = !!(inp && inp.pass && p.ctrl !== 'cpu');
        const screen = !!(inp && inp.screen && p.ctrl !== 'cpu');
        if (screen && !T.screenPrev[p.id] && h && p.tm === h.tm && !p.hasBall && !G.needClear && canScreen(p) && (!T.pick || (T.pick.phase === 'approach' && T.pick.s.ctrl === 'cpu'))) {
          const d = teams(1 - h.tm).find((m) => m.opp === h);
          if (d && dist(p, d) < 1.8 && dist(h, d) < 3.5) { clearPick(); startPick(p, h, d); }
        }
        T.screenPrev[p.id] = screen;
        if (pass && !T.prev[p.id] && h && p.tm === h.tm) {
          if (p === h) send(p, target(p, inp).p);
          else if (h.ctrl === 'cpu') {
            T.request = { p, h, until: G.time + 0.7 };
            A.float('要球', p, '#9ef0ff', 1);
          }
        }
        T.prev[p.id] = pass;
      }
    }
    const current = holder();
    if (G.phase === 'live') pickTick(current);
    else clearPick();
    if (!A.step(G.players.map((p) => {
      const o = pickInput(p) || (p.ctrl === 'cpu' ? cpu(p, current, dt) : T.inputs[p.id] || A.zeroInp());
      return p.screenSlow3 > G.time ? { ...o, mx: o.mx * p.screenSpeed3 || 0, my: o.my * p.screenSpeed3 || 0, sprint: false } : o;
    }), dt)) return;
    if (T.replay && G.vopt.replay) A.trackReplay();
    if (G.replay) return;
    if (G.phase === 'check' || G.phase === 'dead') {
      G.phaseT -= dt;
      if (G.phaseT <= 0) {
        if (G.phase === 'check') G.phase = 'live';
        else if (G.winner >= 0) { G.phase = 'over'; G.phaseT = 0; A.sfx('win'); }
        else check(T.next);
      }
      return;
    }
    if (G.phase === 'over') G.phaseT += dt;
    if (G.phase !== 'live') return;
    passStep(dt);
    const ballCarrier = holder();
    if (ballCarrier && !shooting(ballCarrier)) {
      if (Math.abs(ballCarrier.x) > 7.5 || ballCarrier.y < 0 || ballCarrier.y > 14) { lost(ballCarrier, '踩线出界'); return; }
      if (G.needClear && arc(ballCarrier.x, ballCarrier.y)) { G.needClear = false; G.illId = -1; G.clearOk = G.time; A.float('可以进攻', ballCarrier, '#7dff8a', 1); }
    }
    if (T.clock) {
      G.shotClock = Math.max(0, G.shotClock - dt);
      const b = G.ball, rebounding = b.state === 'loose' && b.wasShot;
      if (!G.shotClock && b.state !== 'shot' && !rebounding) lost(ballCarrier || G.players[b.lastTouch], T.clock + ' 秒违例');
    }
  }
  PH.T3 = { T, start, stop, tick, holder, position };
})();
