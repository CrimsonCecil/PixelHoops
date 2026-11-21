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
  const rating = (p, key, fallback) => {
    const r = PH.R5, row = r && r.P[p.arch.key];
    return (row && row[r.F.indexOf(key)] || fallback) / 100;
  };
  function matchups() {
    const off = teams(G.off), def = teams(1 - G.off), h = holder();
    const pairs = [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]];
    let order, min = Infinity;
    for (const pair of pairs) {
      const cost = pair.reduce((sum, j, i) => sum + dist(def[i], off[j]) * (off[j] === h ? 1.25 : 1) - (def[i].opp === off[j] ? 0.7 : 0), 0);
      if (cost < min) { min = cost; order = pair; }
    }
    order.forEach((j, i) => { def[i].opp = off[j]; });
    for (const p of off) p.opp = nearest(def, p);
  }
  function check(team, message) {
    const off = teams(team), def = teams(1 - team);
    const h = off.find((p) => p.ctrl !== 'cpu') || off[0];
    T.pass = null; T.request = null; G.phase = 'check'; G.phaseT = 0.9; G.off = team;
    G.shotClock = T.clock; G.needClear = false; G.illId = -1;
    const spots = [[0, 4.65], [-6.8, 9.0], [6.8, 9.0]];
    const order = [h, ...off.filter((p) => p !== h)];
    for (let i = 0; i < 3; i++) for (const p of [order[i], def[i]]) {
      const d = p.tm !== team;
      Object.assign(p, { x: spots[i][0] * (d ? 0.9 : 1), y: spots[i][1] + (d ? 1.15 : 0), z: 0, vx: 0, vy: 0, vz: 0, speed: 0,
        hasBall: p === h, action: null, stun: 0, knock: null, post: false, stance: false, box: false, ib: null, finQ: null, recT: 0,
        face: d ? -Math.PI / 2 : Math.PI / 2, stam: Math.min(100, p.stam + 15), opp: null, cutUntil: 0 });
      Object.assign(p.ai, { t: 0, hold: false, su: null, om: null, dm: null, comboAt: -1 });
    }
    T.acquired = G.time; T.nextPass = G.time + 1.4;
    G.ball = { x: h.x, y: h.y, z: 1, vx: 0, vy: 0, vz: 0, state: 'held', holder: h.id, spin: 0, shot: null, lastTouch: h.id, noPick: 0, dead: false, under: false, trail: null };
    matchups();
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
  function gotBall(p) {
    T.acquired = G.time; T.pass = null;
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
    Object.assign(T, { on: true, replay: o.replay !== false, pass: null, clock: o.clock == null ? 24 : o.clock, next: 0, prev: {}, inputs: {}, request: null });
    A.begin(players, { half: true, clock: T.clock, target: o.target || 21, diff: o.diff, hooks: {
      pickup: gotBall, score,
      turnover: (to, msg) => lost(G.players[G.ball.lastTouch], msg, G.players[to] && G.players[to].tm),
      oob: (id) => lost(G.players[id], '球出界', G.players[id] ? 1 - G.players[id].tm : 1 - G.off)
    } });
    G.fb = o.fb || 'simple';
    G.focus = { cx: 0, cy: -10.5 };
    check(0, '开球');
  }
  function stop() { if (T.on) { T.on = false; T.pass = null; A.end(); } }
  function go(p, tx, ty, sprint) {
    const dx = tx - p.x, dy = ty - p.y, d = Math.hypot(dx, dy), o = A.zeroInp();
    if (d > 0.14) { o.mx = dx / Math.max(d, 0.7); o.my = dy / Math.max(d, 0.7); o.sprint = !!sprint && d > 1.3; }
    return o;
  }
  const gap = (p) => dist(nearest(teams(1 - p.tm), p), p);
  function target(from, inp) {
    let best = null, value = -Infinity;
    for (const p of teams(from.tm)) {
      if (p === from) continue;
      const d = Math.max(0.25, dist(from, p));
      const aim = inp ? (inp.mx * (p.x - from.x) + inp.my * (p.y - from.y)) / d : 0;
      const width = gap(p), three = arc(p.x, p.y), close = GM.distHoop(p) < 2.5;
      const risk = teams(1 - p.tm).some((q) => {
        const u = ((q.x - from.x) * (p.x - from.x) + (q.y - from.y) * (p.y - from.y)) / (d * d);
        return u > 0.2 && u < 0.85 && Math.hypot(q.x - from.x - (p.x - from.x) * u, q.y - from.y - (p.y - from.y) * u) < 0.7;
      });
      const v = 3 * aim + Math.min(3, width) * 0.45 + (three ? p.r.three * 0.8 : close ? p.r.lay * 0.8 : p.r.mid * 0.25) - 0.06 * d - (risk ? 1.5 : 0) + (G.needClear && three ? 3 : 0);
      if (v > value) { best = p; value = v; }
    }
    return { p: best, value };
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
      if (!p.action && G.time > T.nextPass && G.time - T.acquired > 0.3 && (!T.clock || G.shotClock > 2.2)) {
        const call = T.request && T.request.until > G.time && T.request.p.tm === p.tm ? T.request.p : null;
        const best = target(p);
        const driveKick = GM.distHoop(p) < 4 && gap(p) < 1.4 && best.p && arc(best.p.x, best.p.y) && gap(best.p) > 1.7;
        if (call || (G.needClear && best.value > 3.7) || (best.value > 1.85 && gap(p) < 1.6 && (driveKick || t.pass > 0.72 || GM.distHoop(best.p) < 2.7))) {
          if (send(p, call || best.p)) return A.zeroInp();
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
      const sniper = p.r.three > 0.77 && p.r.three >= p.r.lay - 0.15;
      const cutter = Math.max(p.r.lay, p.r.dunk) > 0.75 && !sniper;
      if (cutter && h && !G.needClear && G.time > p.nextCut && h.y < 8 && gap(p) > 1.05 && mates.every((m) => m === p || m.cutUntil <= G.time)) {
        p.nextCut = G.time + 4.2 - t.move * 1.4; p.cutUntil = G.time + 1.05 + t.move * 0.55;
      }
      if (!G.needClear && p.cutUntil > G.time) return go(p, side * 0.9, 11, true);
      const crowded = anchor && anchor.x * side > 3.6;
      return go(p, side * (crowded ? 6.9 : sniper ? 6.4 : 5.8), crowded ? 12.1 : sniper ? 8.8 : 7.15, false);
    }
    if (p.opp === h || !h) return A.aiInput(p, dt);
    const m = p.opp;
    const drive = GM.distHoop(h) < 4.5 && GM.distHoop(m) > 3.0;
    const weak = !arc(m.x, m.y) || m.r.three < 0.75;
    const shade = (0.12 + (drive && weak ? t.help * 0.45 : 0));
    const point = drive && weak ? h : hoop;
    return go(p, m.x + (point.x - m.x) * shade, m.y + (point.y - m.y) * shade + 0.5, drive);
  }
  function tick(dt, inputs) {
    if (!T.on) return;
    if (G.replay) { A.replayTick(dt); return; }
    T.inputs = inputs || {};
    const h = holder();
    if (G.phase === 'live') {
      matchups();
      for (const p of G.players) {
        const inp = T.inputs[p.id], pass = !!(inp && inp.pass && p.ctrl !== 'cpu');
        if (pass && !T.prev[p.id] && h && p.tm === h.tm) {
          if (p === h) send(p, target(p, inp).p);
          else if (h.ctrl === 'cpu') T.request = { p, until: G.time + 0.7 };
        }
        T.prev[p.id] = pass;
      }
    }
    const current = holder();
    if (!A.step(G.players.map((p) => p.ctrl === 'cpu' ? cpu(p, current, dt) : T.inputs[p.id] || A.zeroInp()), dt)) return;
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
  function rearm() { T.acquired = G.time; T.nextPass = G.time + 1.4; }
  PH.T3 = { T, start, stop, tick, holder, rearm };
})();
