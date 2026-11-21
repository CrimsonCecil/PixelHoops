// PIXEL HOOPS - 音频：程序化音效与芯片音乐
(function () {
  const PH = (window.PH = window.PH || {});
  let ac = null, master = null, musicGain = null, pauseGain = null, sfxGain = null, voGain = null, noiseBuf = null;
  // 混音总线：音乐 / 音效 / 语音分别一路，再进总线。默认值是离线渲染测响度后定的（见 qa/mix.js）
  const MIX = { master: 0.8, music: 0.5, sfx: 0.5, vo: 0.5 };
  const BASE = { music: 0.28, sfx: 0.85, vo: 0.27 };
  let musicOn = true, sfxOn = true, timer = null;

  function ensure() {
    if (ac) { if (ac.state === 'suspended') ac.resume(); return true; }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return false;
    try { ac = new AC(); } catch (e) { return false; }
    buildBus(ac.destination);
    return true;
  }
  function buildBus(out) {
    master = ac.createGain(); master.connect(out);
    // 暂停压低 BGM 用独立的一级增益，不碰混音滑条
    pauseGain = ac.createGain(); pauseGain.connect(master); pauseGain.gain.value = ac === offAc ? 1 : (pauseOn ? PAUSE_LV : 1);
    musicGain = ac.createGain(); musicGain.connect(pauseGain);
    sfxGain = ac.createGain(); sfxGain.connect(master);
    voGain = ac.createGain(); voGain.connect(master);
    noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
    const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    applyMix();
  }
  // 滑条 0~1，0.5 = 默认；按分贝感知映射（0.5 → ×1，1 → ×2 约 +6dB，0 → 静音）
  const curve = (v) => v <= 0 ? 0 : Math.pow(v / 0.5, 1.6);
  let pauseOn = false, offAc = null;
  const PAUSE_LV = 0.3, PAUSE_FADE = 0.3;
  // 暂停时 BGM 平滑降到约 30%，恢复时平滑回来；暂停时停掉正在播的配音
  function setPaused(on) {
    on = !!on; if (on === pauseOn) return; pauseOn = on;
    if (on) { voSeq++; if (voCur) { try { voCur.stop(); } catch (e) { /* 已停 */ } voCur = null; } }
    if (!pauseGain || !ac) return;
    const g = pauseGain.gain, t = ac.currentTime;
    g.cancelScheduledValues(t); g.setValueAtTime(g.value, t); g.linearRampToValueAtTime(on ? PAUSE_LV : 1, t + PAUSE_FADE);
  }
  function applyMix() {
    if (!master) return;
    master.gain.value = MIX.master * 0.625;
    musicGain.gain.value = BASE.music * curve(MIX.music);
    sfxGain.gain.value = BASE.sfx * curve(MIX.sfx);
    voGain.gain.value = BASE.vo * curve(MIX.vo);
  }
  function tone(f, dur, type, vol, t0, f2, dest) {
    const t = t0 || ac.currentTime, o = ac.createOscillator(), g = ac.createGain();
    o.type = type || 'square'; o.frequency.setValueAtTime(f, t);
    if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
    g.gain.setValueAtTime(vol || 0.2, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(dest || sfxGain); o.start(t); o.stop(t + dur + 0.02);
  }
  function noise(dur, vol, freq, q, t0, f2, type) {
    const t = t0 || ac.currentTime, s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
    s.buffer = noiseBuf; s.loop = true; f.type = type || 'bandpass'; f.frequency.setValueAtTime(freq, t); f.Q.value = q || 1;
    if (f2) f.frequency.exponentialRampToValueAtTime(f2, t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(f).connect(g).connect(arguments[7] || sfxGain); s.start(t); s.stop(t + dur + 0.02);
  }
  const SFX = {
    badge: () => { tone(880, 0.09, 'square', 0.12, 0, 1320); tone(1320, 0.16, 'triangle', 0.16, 0.08, 1760); },
    bump: () => { tone(80, 0.14, 'sine', 0.45, 0, 45); noise(0.07, 0.22, 420, 1); },
    bump2: () => { tone(58, 0.26, 'sine', 0.6, 0, 32); tone(110, 0.12, 'square', 0.12, 0, 50); noise(0.16, 0.38, 300, 0.8); },
    bigsteal: () => { const t = ac.currentTime; noise(0.14, 0.32, 4200, 1.2, t, 900); tone(620, 0.06, 'square', 0.16, t, 1500); tone(1320, 0.09, 'square', 0.12, t + 0.06); tone(1760, 0.12, 'square', 0.1, t + 0.12); noise(0.9, 0.2, 800, 0.6, t + 0.1); },
    bigblock: () => { const t = ac.currentTime; noise(0.07, 0.55, 2000, 0.9, t); tone(72, 0.32, 'sine', 0.65, t, 34); tone(190, 0.12, 'square', 0.22, t, 70); noise(0.2, 0.3, 380, 0.7, t + 0.02); noise(1.4, 0.3, 1100, 0.45, t + 0.08); },
    oreb: () => { const t = ac.currentTime; tone(150, 0.1, 'sine', 0.45, t, 85); noise(0.05, 0.22, 1600, 2, t); tone(523, 0.06, 'square', 0.1, t + 0.05); tone(784, 0.06, 'square', 0.1, t + 0.1); tone(1047, 0.1, 'square', 0.1, t + 0.15); },
    rebound: () => { const t = ac.currentTime; tone(784, 0.08, 'triangle', 0.18, t); tone(1047, 0.11, 'triangle', 0.2, t + 0.055); tone(1319, 0.16, 'sine', 0.18, t + 0.11); },
    pant: () => { const t = ac.currentTime; noise(0.16, 0.07, 1100, 0.9, t, 500); noise(0.2, 0.06, 900, 0.9, t + 0.24, 450); },
    gasp: () => { const t = ac.currentTime; noise(0.28, 0.16, 1300, 0.8, t, 600); tone(170, 0.2, 'sine', 0.1, t, 120); },
    bounce: () => { tone(150, 0.09, 'sine', 0.35, 0, 60); noise(0.03, 0.08, 900, 1); },
    swoosh: () => { const t = ac.currentTime; noise(0.35, 0.22, 900, 0.7, t, 4200); tone(330, 0.08, 'square', 0.08, t + 0.28); tone(660, 0.12, 'square', 0.08, t + 0.36); },
    swish: () => { noise(0.32, 0.3, 5200, 0.8, 0, 1400, 'highpass'); },
    rim: () => { tone(310, 0.18, 'square', 0.14); tone(467, 0.22, 'triangle', 0.18); noise(0.05, 0.12, 2500, 3); },
    board: () => { tone(120, 0.1, 'square', 0.16, 0, 70); },
    dunk: () => { tone(55, 0.34, 'sine', 0.52, 0, 28); tone(90, 0.35, 'sawtooth', 0.3, 0, 40); noise(0.3, 0.3, 700, 0.7); tone(300, 0.2, 'square', 0.12); },
    buzzer: () => { tone(196, 0.7, 'sawtooth', 0.22); tone(198, 0.7, 'square', 0.12); },
    whistle: () => { tone(2300, 0.22, 'square', 0.1); tone(2350, 0.22, 'sine', 0.1); },
    squeak: () => { tone(1900, 0.07, 'sine', 0.07, 0, 2600); },
    steal: () => { tone(500, 0.06, 'square', 0.16, 0, 900); noise(0.05, 0.15, 3000, 2); },
    poke: () => {
      const t = ac.currentTime, v = PH.game?.K.stlPokeVol ?? 1;
      if (v <= 0) return;
      noise(0.1, 0.45 * v, 2200, 0.8, t, 700);
      tone(600, 0.1, 'square', 0.2 * v, t, 1200);
      tone(1450, 0.16, 'triangle', 0.22 * v, t + 0.04);
      tone(2200, 0.18, 'sine', 0.16 * v, t + 0.1);
    },
    interceptGood: () => { const t = ac.currentTime; [659, 880, 1109, 1319].forEach((f, i) => tone(f, 0.13, 'square', 0.14, t + i * 0.065)); noise(0.08, 0.12, 3500, 1, t); },
    interceptBad: () => { const t = ac.currentTime; [392, 294, 196].forEach((f, i) => tone(f, 0.18, 'sawtooth', 0.14, t + i * 0.09, f * 0.85)); noise(0.1, 0.12, 500, 1, t); },
    block: () => { noise(0.12, 0.35, 500, 0.8); tone(110, 0.12, 'square', 0.2, 0, 60); },
    jump: () => { tone(220, 0.08, 'triangle', 0.08, 0, 420); },
    grab: () => { const t = ac.currentTime; tone(240, 0.06, 'triangle', 0.16, t, 160); tone(660, 0.06, 'square', 0.09, t + 0.04); tone(990, 0.08, 'square', 0.08, t + 0.09); },
    ui: () => { tone(880, 0.05, 'square', 0.1); },
    start: () => { const t = ac.currentTime; [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.12, 'square', 0.12, t + i * 0.08)); },
    green: () => { const t = ac.currentTime; tone(1047, 0.07, 'square', 0.1, t); tone(1568, 0.12, 'square', 0.1, t + 0.06); },
    cheer2: () => { const t = ac.currentTime; noise(1.8, 0.34, 1200, 0.45, t); noise(1.5, 0.2, 2800, 0.6, t + 0.08); noise(0.5, 0.2, 500, 0.6, t); [784, 988, 1175].forEach((f, i) => tone(f, 0.1, 'square', 0.07, t + i * 0.07)); },
    cheerSoft: () => { const t = ac.currentTime; noise(0.65, 0.14, 1350, 0.55, t, 1650); noise(0.45, 0.08, 2500, 0.7, t + 0.06); },
    combo: () => { const t = ac.currentTime; tone(660, 0.05, 'square', 0.08, t); tone(990, 0.07, 'square', 0.08, t + 0.05); },
    cheer: () => { noise(1.1, 0.22, 1300, 0.5); noise(0.9, 0.12, 2600, 0.7, ac.currentTime + 0.1); },
    win: () => { const t = ac.currentTime; [523, 523, 659, 784, 659, 784, 1047].forEach((f, i) => tone(f, 0.16, 'square', 0.13, t + i * 0.13)); noise(1.8, 0.2, 1400, 0.5, t); },
    tick: () => { tone(1250, 0.05, 'square', 0.09); },
    tick2: () => { tone(1560, 0.06, 'square', 0.12); tone(780, 0.06, 'triangle', 0.1); },
    gtick: () => { tone(740, 0.09, 'triangle', 0.22); tone(1480, 0.04, 'square', 0.05); },
    horn: () => { tone(220, 1.3, 'sawtooth', 0.22); tone(277, 1.3, 'square', 0.09); tone(110, 1.3, 'triangle', 0.25); },
    mpoint: () => { const t = ac.currentTime; noise(1.8, 0.24, 900, 0.5, t, 2400); tone(98, 0.22, 'sine', 0.55, t, 60); tone(98, 0.22, 'sine', 0.55, t + 0.32, 60); tone(131, 0.3, 'sine', 0.5, t + 0.64, 70); },
    lose: () => { const t = ac.currentTime; [392, 349, 311, 262].forEach((f, i) => tone(f, 0.22, 'triangle', 0.16, t + i * 0.2)); },
  };
  function play(n) { if (!sfxOn || !ensure()) return; try { SFX[n] && SFX[n](); } catch (e) { /* 忽略 */ } }

  // ---------- 分场景音乐：全部程序合成（WebAudio 振荡器 + 噪声），无音频文件 ----------
  // 每套曲子 = 速度 + 调式 + 和弦进行 + 音色 + 鼓组；按「段落表」轮换 A/B/C 变奏；切场景时交叉淡入淡出
  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
  // 一个音：起音 a 秒线性上升，之后 d 秒指数衰减
  function vox(m, t, d, type, vol, dest, a, det) {
    const o = ac.createOscillator(), g = ac.createGain(); a = a || 0.005;
    o.type = type; o.frequency.setValueAtTime(mtof(m), t); if (det) o.detune.setValueAtTime(det, t);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
    o.connect(g).connect(dest); o.start(t); o.stop(t + a + d + 0.05);
  }
  const kick = (t, v, d, lo) => tone(lo ? 110 : 150, lo ? 0.26 : 0.17, 'sine', v, t, lo ? 38 : 44, d);
  const snare = (t, v, d, f) => { noise(0.13, v, f || 1800, 0.8, t, 0, 'bandpass', d); tone(190, 0.07, 'triangle', v * 0.5, t, 140, d); };
  const hat = (t, v, d, open) => noise(open ? 0.14 : 0.03, v, 8200, 1, t, 0, 'highpass', d);
  const clap = (t, v, d) => { for (let k = 0; k < 3; k++) noise(0.02, v * 0.7, 1300, 1.2, t + k * 0.011, 0, 'bandpass', d); noise(0.14, v * 0.8, 1300, 1, t + 0.033, 0, 'bandpass', d); };
  const tom = (t, v, d, f) => tone(f, 0.22, 'sine', v, t, f * 0.55, d);
  const crash = (t, v, d) => noise(1.4, v, 6000, 0.4, t, 3000, 'highpass', d);
  // 和弦（MIDI 音）
  const C = {
    Gm7: [55, 58, 62, 65], C9: [48, 52, 58, 62], Fmaj7: [53, 57, 60, 64], Dm7: [50, 53, 57, 60], Bbmaj7: [46, 50, 53, 57], Am7: [45, 48, 52, 55], C7s: [48, 53, 55, 58], FA: [45, 53, 57, 60],
    Dm9: [50, 53, 57, 60, 64], G6: [43, 50, 52, 55, 59], Bbm7: [46, 50, 53, 57, 62], C6: [48, 52, 55, 57, 62], Am9: [45, 52, 55, 59, 60], Dd: [38, 45, 50, 57],
    Am: [45, 48, 52], F: [41, 45, 48], Cj: [48, 52, 55], G: [43, 47, 50], Em: [40, 43, 47], Dm: [50, 53, 57], E: [40, 44, 47],
    eEm: [40, 43, 47], eC: [36, 40, 43], eG: [43, 47, 50], eD: [38, 42, 45], eB: [35, 39, 42]
  };
  const root = (c, lo) => lo + (((c[0] - lo) % 12) + 12) % 12;
  const pick = (a, k) => a[((k % a.length) + a.length) % a.length];
  // 段落内第 sb 小节用哪个和弦
  const TRK = {
    // 主菜单 / 选人：F 大调 lo-fi，80 BPM，三连感摇摆，低通闷一点，带黑胶底噪
    menu: {
      bpm: 80, swing: 0.3, lp: 1900, vol: 0.85, fade: 2.2, form: ['A', 'A', 'B', 'A', 'C', 'B'],
      sec: { A: [C.Gm7, C.C9, C.Fmaj7, C.Dm7], B: [C.Bbmaj7, C.Am7, C.Gm7, C.C7s], C: [C.Dm7, C.Bbmaj7, C.FA, C.Gm7] },
      play(I, t, x) {
        const o = I.in, c = x.c, i = x.i, drums = x.sec !== 'C';
        if (i === 0 || i === 6 || (x.sec === 'C' && i === 10)) c.forEach((m, k) => { vox(m + 12, t + k * 0.012, x.spb * (i === 0 ? 7 : 4), 'sine', 0.06, o, 0.012, 0); vox(m + 12, t + k * 0.012, x.spb * 3, 'triangle', 0.022, o, 0.01, 7); });
        if (i === 0 || i === 7 || i === 10) vox(root(c, 33), t, x.spb * (i === 0 ? 5 : 2.5), 'sine', drums ? 0.32 : 0.2, o, 0.01);
        if (drums) {
          if (i === 0 || i === 7 || (i === 10 && x.sb % 2)) kick(t, 0.42, o, true);
          if (i === 4 || i === 12) snare(t, 0.16, o, 1500);
          if (i % 2 === 0) hat(t, i % 4 === 2 ? 0.05 : 0.03, o);
        }
        if (x.sec === 'B' && [2, 5, 8, 11, 14].includes(i) && ((x.s * 7 + x.sb) % 3)) vox(pick([65, 67, 69, 72, 74, 72, 69], x.s >> 1) + 12, t, x.spb * 2.5, 'triangle', 0.05, o, 0.01);
        if (Math.random() < 0.18) noise(0.008, 0.05 + Math.random() * 0.05, 3000 + Math.random() * 4000, 2, t + Math.random() * x.spb, 0, 'bandpass', o);
      },
      init(I) { I.bed.push(bed(I.out, 0.012, 5000, 0.4, 'highpass', 0)); }
    },
    // 操作说明 / 调参台：D 多利亚氛围，60 BPM，无鼓，慢起音铺底 + 零星钟声
    calm: {
      bpm: 60, lp: 2600, vol: 0.9, fade: 2.0, form: ['A', 'B', 'A', 'C'],
      sec: { A: [C.Dm9, C.G6, C.Dm9, C.G6], B: [C.Bbm7, C.C6, C.Dm9, C.Am9], C: [C.Dd, C.Dd, C.G6, C.Dd] },
      play(I, t, x) {
        const o = I.in, c = x.c, i = x.i;
        if (i === 0) c.forEach((m, k) => { vox(m, t, x.spb * 18, 'sine', 0.05, o, 1.6, -5); vox(m, t, x.spb * 18, 'sine', 0.04, o, 1.9, 6); });
        if (i === 0 && x.sb % 2 === 0) vox(root(c, 36), t, x.spb * 30, 'sine', 0.12, o, 2.5);
        if ((i === 4 || i === 10) && ((x.s * 13 + x.sb * 5) % 7) < (x.sec === 'C' ? 4 : 2)) { const m = pick([74, 76, 77, 79, 81, 83, 86], (x.s * 5 + x.sb * 3) >> 1); vox(m, t, 2.6, 'sine', 0.035, o, 0.005); vox(m + 12, t, 1.2, 'sine', 0.01, o, 0.005); }
      }
    },
    // 1V1：A 小调 chiptune + hip-hop 鼓点，96 BPM，轻摇摆；关键时刻提速 8% 并加 16 分音符琶音和开镲
    p1: {
      bpm: 96, swing: 0.16, vol: 1.25, fade: 1.4, hotBpm: 0.08, form: ['A', 'A', 'B', 'B', 'A', 'C', 'B'],
      sec: { A: [C.Am, C.F, C.Cj, C.G], B: [C.F, C.G, C.Em, C.Am], C: [C.Dm, C.Em, C.F, C.E] },
      play(I, t, x) {
        const o = I.in, c = x.c, i = x.i, r = root(c, 36);
        if (i === 0 || i === 7 || i === 10 || (x.sb === 3 && i === 14)) kick(t, 0.6, o);
        if (i === 4 || i === 12) snare(t, 0.32, o);
        if (x.sec !== 'C' || i % 4 === 0) hat(t, i % 4 === 2 ? 0.09 : 0.05, o, i === 14 && x.sb % 2 === 1);
        if ([0, 3, 6, 10, 14].includes(i)) vox(r + (i === 6 || i === 14 ? 12 : 0), t, x.spb * 1.5, 'triangle', 0.42, o, 0.004);
        if (x.sec !== 'C' && (i === 2 || i === 9)) c.forEach((m) => vox(m + 24, t, x.spb * 0.8, 'square', 0.028, o, 0.003));
        if (x.sec === 'B') { const H = [76, 0, 72, 0, 74, 76, 0, 79, 0, 76, 0, 74, 72, 0, 69, 0]; const m = H[i] && H[i] + (x.sb === 2 ? -3 : 0); if (m) vox(m, t, x.spb * 1.1, 'square', 0.05, o, 0.003); }
        if (x.sec === 'C') vox(c[(i >> 1) % c.length] + 24 + (i % 2 ? 12 : 0), t, x.spb * 0.9, 'triangle', 0.08, o, 0.003);
        if (I.hot > 0.02) { const L = I.lay; vox(c[i % c.length] + 36 + (i >= 8 ? 12 : 0), t, x.spb * 0.6, 'square', 0.03, L, 0.002); if (i % 4 === 2) hat(t, 0.08, L, true); if (i % 4 === 0) kick(t, 0.3, L); }
      }
    },
    // 5V5：E 小调竞技场电子，128 BPM，四拍底鼓 + 拍手 + 锯齿贝斯 + 观众声床；B 段带观众「防守」拍手；C 段通鼓过门
    p5: {
      bpm: 128, vol: 1.3, fade: 1.4, hotBpm: 0.06, form: ['A', 'B', 'A', 'B', 'C', 'B'],
      sec: { A: [C.eEm, C.eC, C.eG, C.eD], B: [C.eEm, C.eC, C.eD, C.eB], C: [C.eC, C.eD, C.eEm, C.eEm] },
      play(I, t, x) {
        const o = I.in, c = x.c, i = x.i, brk = x.sec === 'C' && x.sb < 2;
        if (!brk && i % 4 === 0) kick(t, 0.62, o);
        if (!brk && (i === 4 || i === 12)) clap(t, 0.3, o);
        if (i % 4 === 2) hat(t, 0.08, o, true); else if (!brk) hat(t, 0.04, o);
        if (x.sec === 'C' && x.sb === 1 && i >= 8) tom(t, 0.4, o, [196, 196, 165, 165, 131, 131, 110, 98][i - 8]);
        if (!brk && i % 2 === 0) vox(root(c, 28) + (i % 4 === 2 ? 12 : 0), t, x.spb * 1.4, 'sawtooth', 0.11, o, 0.003);
        vox(c[(i * 2) % c.length] + 24 + (i % 4 === 3 ? 12 : 0), t, x.spb * 0.7, 'square', brk ? 0.05 : 0.032, o, 0.002);
        if (x.sec === 'B' && (i === 0 || i === 3 || i === 6)) c.forEach((m) => vox(m + 12, t, x.spb * 1.6, 'sawtooth', 0.026, o, 0.004));
        if (x.sec === 'B' && x.sb % 2 === 1 && (i === 8 || i === 12)) clap(t, 0.16, I.out);
        if (x.sec === 'B' && x.sb % 2 === 1 && i === 0) noise(0.9, 0.05, 900, 0.5, t, 1300, 'bandpass', I.out);
        if (I.hot > 0.02) { const L = I.lay; vox(c[i % c.length] + 36, t, x.spb * 0.5, 'square', 0.045, L, 0.002); if (i % 4 === 2) kick(t, 0.28, L); if (i % 2 === 1) hat(t, 0.05, L); if (x.sb === 3 && i >= 8) snare(t, 0.1 + (i - 8) * 0.02, L); if (i === 0 && x.sb === 0) noise(2.2, 0.09, 800, 0.5, t, 1500, 'bandpass', I.out); if (i === 0) vox(c[0] + 48, t, x.spb * 14, 'sine', 0.015, L, x.spb * 8); }
      },
      init(I) { I.bed.push(bed(I.out, 0.05, 750, 0.6, 'bandpass', 0.13)); I.bed.push(bed(I.lay, 0.09, 1100, 0.7, 'bandpass', 0.31)); }
    },
    // 结算：胜利 C 大调号角 140 BPM（约 3 秒）；失败 A 小调下行 70 BPM（约 4 秒）
    win: {
      bpm: 140, vol: 1.25, fade: 0.05, once: 32,
      play(I, t, x) {
        const o = I.in, s = x.s, M = { 0: 67, 2: 72, 4: 76, 6: 79, 8: 84, 12: 81, 14: 83, 16: 84 };
        if (M[s]) { vox(M[s], t, s >= 16 ? 1.8 : x.spb * 1.8, 'square', 0.07, o, 0.003); vox(M[s] - 12, t, s >= 16 ? 1.8 : x.spb * 1.8, 'triangle', 0.1, o, 0.003); }
        if (s === 8 || s === 16) { kick(t, 0.6, o); crash(t, 0.12, o); }
        if (s === 12) [53, 57, 60].forEach((m) => vox(m, t, x.spb * 3, 'square', 0.03, o, 0.005));
        if (s === 14) [55, 59, 62].forEach((m) => vox(m, t, x.spb * 2, 'square', 0.03, o, 0.005));
        if (s === 16) [48, 52, 55, 60].forEach((m) => vox(m, t, 2.2, 'triangle', 0.09, o, 0.01));
        if (s < 8 && s % 2 === 0) snare(t, 0.06 + s * 0.02, o);
      }
    },
    lose: {
      bpm: 70, lp: 2200, vol: 0.9, fade: 0.05, once: 24,
      play(I, t, x) {
        const o = I.in, s = x.s, M = { 0: 64, 4: 62, 8: 60, 12: 59 };
        if (M[s] != null) { vox(M[s], t, x.spb * 3.6, 'triangle', 0.14, o, 0.01); vox(M[s] - 24, t, x.spb * 3.6, 'sine', 0.2, o, 0.01); }
        if (s === 16) { [45, 52, 57, 60, 64].forEach((m, k) => vox(m, t + k * 0.04, 3, 'sine', 0.06, o, 0.05)); vox(33, t, 3.2, 'sine', 0.25, o, 0.02); }
        if (s === 0 || s === 8) kick(t, 0.25, o, true);
      }
    }
  };
  // 连续噪声床（黑胶底噪 / 观众声），可选慢 LFO 起伏
  function bed(dest, vol, f, q, type, lfo) {
    const s = ac.createBufferSource(), fl = ac.createBiquadFilter(), g = ac.createGain(), t = ac.currentTime;
    s.buffer = noiseBuf; s.loop = true; fl.type = type; fl.frequency.value = f; fl.Q.value = q; g.gain.value = vol;
    s.connect(fl).connect(g).connect(dest); s.start(t); const r = [s];
    if (lfo) { const o = ac.createOscillator(), lg = ac.createGain(); o.frequency.value = lfo; lg.gain.value = vol * 0.45; o.connect(lg).connect(g.gain); o.start(t); r.push(o); }
    return r;
  }
  let insts = [], want = null, curName = null, hotWant = 0;
  function mkInst(name) {
    const D = TRK[name], out = ac.createGain(); out.gain.value = 0.0001; out.connect(musicGain);
    let inp = out; if (D.lp) { const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = D.lp; f.Q.value = 0.5; f.connect(out); inp = f; }
    const tg = ac.createGain(); tg.gain.value = D.vol || 1; tg.connect(inp);
    const lay = ac.createGain(); lay.gain.value = 0; lay.connect(tg);
    const I = { name, D, out, in: tg, lay, step: 0, nextT: ac.currentTime + 0.08, end: Infinity, hot: 0, hotTgt: 0, bed: [] };
    if (D.init) D.init(I);
    return I;
  }
  function ramp(p, v, dur) { const t = ac.currentTime; p.cancelScheduledValues(t); p.setValueAtTime(Math.max(0.0001, p.value), t); p.linearRampToValueAtTime(v, t + dur); }
  function fadeOut(I, f) { if (I.end !== Infinity && I.end < ac.currentTime + f) return; ramp(I.out.gain, 0.0001, f); I.end = ac.currentTime + f + 0.05; }
  function kill(I) { for (const b of I.bed) for (const n of b) { try { n.stop(); } catch (e) { /* 已停 */ } } try { I.out.disconnect(); } catch (e) { /* 已断 */ } }
  function schedInst(I, until) {
    const D = I.D;
    while (I.nextT < until && I.nextT < I.end) {
      if (D.once && I.step >= D.once) { I.end = Math.min(I.end, I.nextT + 3); break; }
      const s = I.step, i = s % 16, bar = s >> 4, n = D.form ? D.form.length * 4 : 1, b = bar % n, sec = D.form ? D.form[b >> 2] : 'A', sb = b & 3;
      if (i === 0 || i === 8) I.hot += Math.max(-0.5, Math.min(0.5, I.hotTgt - I.hot));
      const spb = 60 / (D.bpm * (1 + (D.hotBpm || 0) * I.hot)) / 4, t = I.nextT + (i % 2 ? (D.swing || 0) * spb : 0);
      try { D.play(I, t, { s, i, bar, sec, sb, c: D.sec ? D.sec[sec][sb] : null, spb }); } catch (e) { /* 忽略单步出错 */ }
      I.nextT += spb; I.step++;
    }
  }
  function sched() {
    if (!ac) return;
    const now = ac.currentTime;
    for (const I of insts) schedInst(I, now + 0.2);
    insts = insts.filter((I) => { if (now > I.end + 0.3) { kill(I); return false; } return true; });
    if (!insts.length && timer) { clearInterval(timer); timer = null; }
  }
  function apply() {
    if (!ac || !musicOn || want === curName) return;
    const D = TRK[want], f = D ? D.fade : 1.4;
    for (const I of insts) fadeOut(I, D && D.once ? 0.5 : f);
    curName = want;
    if (D) { const I = mkInst(want); I.hotTgt = I.hot = D.hotBpm ? hotWant : 0; I.lay.gain.value = I.hot; ramp(I.out.gain, 1, f); insts.push(I); }
    if (!timer) timer = setInterval(sched, 50);
    sched();
  }
  // 场景：menu / calm / p1 / p5 / win / lose / null(静音)；重复调用同一场景不会重启
  function scene(n) { want = n && TRK[n] ? n : null; apply(); }
  // 关键时刻强度 0~1：提速 + 叠一层
  function intensity(v) {
    v = v > 0.5 ? 1 : 0; if (v === hotWant) return; hotWant = v;
    const I = insts.find((x) => x.name === curName && x.end === Infinity); if (!I || !I.D.hotBpm) return;
    I.hotTgt = v; ramp(I.lay.gain, v, v ? 1.2 : 2.5);
  }
  function startMusic() { if (!musicOn || !ensure()) return; if (want == null && curName == null) want = 'menu'; apply(); }
  function stopMusic() { if (!ac) return; for (const I of insts) fadeOut(I, 0.3); curName = null; }
  function setMusic(on) { musicOn = on; if (on) startMusic(); else stopMusic(); }
  function setSfx(on) { sfxOn = on; }

  // 球员配音：vo/manifest.json 列出每名球员每类事件的若干条语音，随机选、不连播同一条
  let voM = null, voOn = true, voCur = null, voLast = {}, voBusy = 0;
  const VO_WALK = { barkley: 'shaq_dunk_2.mp3' };
  const VO_INTRO = {
    barkley: [['shaq_make_1.mp3', 'shaq_make_0.mp3'], ['shaq_dom_1.mp3', 'shaq_block_0.mp3']],
    yao: [['sengun_dom_0.mp3', 'sengun_dom_2.mp3'], ['sengun_taunt_1.mp3', 'sengun_make_0.mp3']],
    mutombo: [['gobert_taunt_2.mp3', 'gobert_dom_1.mp3'], ['gobert_taunt_0.mp3', 'gobert_block_2.mp3']]
  };
  // 每名球员的全部语音合成一个文件（vo/p/<球员>.mp3，40kbps 定长帧，每帧 120 字节、24ms），清单里记每句的起始帧 o 和帧数 n
  const voIdx = {}, voSpr = {};
  const voReady = fetch('vo/manifest.json' + (window.__V__ !== undefined ? '?v=' + window.__V__ : '')).then((r) => r.ok ? r.json() : null).then((j) => {
    voM = j && j.voices;
    if (voM) for (const k in voM) { const V = voM[k]; for (const ev in V.lines) for (const it of V.lines[ev]) voIdx[it.f] = { s: V.s, it }; }
    return voM;
  }).catch(() => null);
  function voFile(s) { if (!voSpr[s]) voSpr[s] = fetch('vo/' + s).then((r) => r.ok ? r.arrayBuffer() : null).catch(() => { delete voSpr[s]; return null; }); return voSpr[s]; }
  // 语音解码成缓冲走 WebAudio，和音乐、音效同一套总线
  const voCache = {};
  function voBuf(f) { const X = voIdx[f]; if (!X) return Promise.resolve(null); const { o, n } = X.it; if (!voCache[f]) voCache[f] = voFile(X.s).then((ab) => ab ? new Promise((ok, no) => ac.decodeAudioData(ab.slice(o * 120, (o + n) * 120), ok, no)) : null).catch(() => { delete voCache[f]; return null; }); return voCache[f]; }
  // 跳过 TTS 音频开头的长静音/低噪（保留 50ms 气口），避免台词字幕已出完语音才响
  function voLead(buf) {
    if (!buf || !buf.getChannelData) return 0.1;
    if (buf._voLead != null) return buf._voLead;
    const ch = buf.getChannelData(0), sr = buf.sampleRate || 48000, win = Math.max(1, Math.floor(sr * 0.05));
    const maxI = Math.min(ch.length, Math.floor(sr * Math.max(0, (buf.duration || ch.length / sr) - 0.35)));
    let lead = 0.1;
    for (let i = 0; i + win <= maxI; i += win) {
      let s = 0;
      for (let j = i; j < i + win; j++) s += ch[j] * ch[j];
      if (Math.sqrt(s / win) >= 0.02) { lead = Math.max(0.1, i / sr - 0.05); break; }
    }
    return (buf._voLead = lead);
  }
  function voPreload(keys) {
    const run = () => { if (!voM) return; for (const k of keys) {
      const V = voM[k]; if (V?.s) voFile(V.s);
      const alias = voM[VO_ALIAS[k]?.key]; if (alias?.s) voFile(alias.s);
      const walk = voIdx[VO_WALK[k]]; if (walk) voFile(walk.s);
      if (!V?.lines?.intro?.length) for (const f of VO_INTRO[k]?.flat() || []) { if (voIdx[f]) voFile(voIdx[f].s); }
    } };
    if (voM) run(); else voReady.then(run);
  }
  // 新事件没有录到时退回到相近的事件
  const VO_FB = { poster: 'dunk', fall: 'ankle', pin: 'block', clutch: 'make', hot: 'make', stop: 'taunt', rejected: 'hurt', dropped: 'hurt', posterized: 'hurt', stolen: 'hurt' };
  // 只借用审核过的通用台词；球员自己的语音（尤其 intro/reply）始终优先。
  const VO_ALIAS = {
    ginobili: { key: 'white', events: { dunk: 1, three: 2, make: 1, ankle: 0, block: 2, steal: 1, taunt: 1, dom: 2, win: 1, miss: 1, hurt: 0, poster: 0, fall: 2, pin: 0, clutch: 0, hot: 0, stop: 2, rejected: 1, dropped: 2, posterized: 2, stolen: 0 } },
    iverson: { key: 'kyrie', events: { dunk: 0, three: 1, make: 2, ankle: 1, block: 1, steal: 0, taunt: 2, dom: 1, win: 0, miss: 1, hurt: 0, poster: 0, fall: 1, pin: 0, clutch: 2, hot: 0, stop: 0, rejected: 1, dropped: 1, posterized: 1, stolen: 0 } },
    carter: { key: 'lavine', events: { dunk: 1, three: 0, make: 1, ankle: 2, block: 1, steal: 0, taunt: 1, dom: 1, win: 1, miss: 1, hurt: 0, poster: 0, fall: 0, pin: 0, clutch: 0, hot: 1, stop: 1, rejected: 0, dropped: 0, posterized: 0, stolen: 0 } }
  };
  function voLines(key, ev) {
    const own = voM && voM[key]?.lines?.[ev];
    if (own && own.length) return own;
    const alias = VO_ALIAS[key], i = alias?.events[ev];
    const it = i != null && voM && voM[alias.key]?.lines?.[ev]?.[i];
    return it ? [it] : null;
  }
  function vo(key, ev, mode) {
    if (!voOn || !sfxOn || !voM || pauseOn) return null;
    const pri = mode === 'pri';
    if (mode === 'q' && performance.now() < voBusy) {
      const w = voBusy - performance.now();
      if (w < 6000) {
        if (voQTimer) clearTimeout(voQTimer);
        const qSeq = voSeq;
        voQTimer = setTimeout(() => { voQTimer = null; if (voSeq === qSeq) vo(key, ev, 'pri'); }, Math.max(80, w - 120));
      }
      return null;
    }
    const walk = ev === 'walk' ? voIdx[VO_WALK[key]] : null;
    if (ev === 'walk' && !walk) ev = 'taunt';
    let L = walk ? [walk.it] : voLines(key, ev);
    if (!L || !L.length) L = voLines(key, VO_FB[ev]);
    if (!L || !L.length) return null;
    const now = performance.now(); if (now < voBusy && !pri) return null;
    const lk = key + ev; let i = Math.floor(Math.random() * L.length); if (L.length > 1 && i === voLast[lk]) i = (i + 1) % L.length; voLast[lk] = i;
    const it = L[i];
    if (!ensure()) return null;
    if (voQTimer) { clearTimeout(voQTimer); voQTimer = null; }
    if (voCur && pri) { try { voCur.stop(); } catch (e) { /* 已停 */ } voCur = null; }
    const seq = ++voSeq;
    voBuf(it.f).then((buf) => { if (!buf || !voOn || pauseOn || seq !== voSeq) return; if (ac.state === 'suspended') ac.resume(); const lead = voLead(buf), src = ac.createBufferSource(); src.buffer = buf; src.connect(voGain); src.start(0, lead); voCur = src; if (lead > 0.1) voBusy = Math.min(voBusy, performance.now() + Math.max(0.3, (buf.duration || it.d || 1.5) - lead) * 1000 + 250); }).catch(() => {});
    voBusy = now + ((it.d || 1.5) * 1000) + 250;
    return it;
  }
  // 指定一条语音（开场对话用）：voLine 按序号取条目，voSay 打断当前语音直接播
  function voLine(key, ev, i, skip) {
    const lines = voM && voM[key] && voM[key].lines;
    if (ev === 'intro' && !lines?.intro?.length) {
      for (const f of VO_INTRO[key]?.[i] || []) { if (voIdx[f] && !skip?.has(f)) return voIdx[f].it; }
      return null;
    }
    if (!lines) return null;
    const pick = (e) => {
      const L = voLines(key, e);
      if (!L || !L.length) return null;
      for (let k = 0; k < L.length; k++) {
        const it = L[((i || 0) + k) % L.length];
        if (!skip || !skip.has(it.f)) return it;
      }
      return null;
    };
    const hit = pick(ev);
    if (hit || !skip) return hit;
    for (const fb of ['taunt', 'dom', 'win']) {
      if (fb === ev) continue;
      const alt = pick(fb);
      if (alt) return alt;
    }
    const L = voLines(key, ev);
    return L && L.length ? L[(i || 0) % L.length] : null;
  }
  function voHas(key, ev) { return !!voM?.[key]?.lines?.[ev]?.length; }
  function voStop() { voSeq++; voSayF = ''; if (voQTimer) { clearTimeout(voQTimer); voQTimer = null; } if (voCur) { try { voCur.stop(); } catch (e) { /* 已停 */ } voCur = null; } voBusy = 0; }
  function voSay(it, onStart) {
    if (!it || !voOn || !sfxOn || pauseOn || !ensure()) return false;
    voStop(); const want = it.f, seq = ++voSeq; voSayF = want;
    voBuf(it.f).then((buf) => {
      if (!buf || !voOn || pauseOn || voSayF !== want || seq !== voSeq) { if (onStart && seq === voSeq) onStart(0); return; }
      if (ac.state === 'suspended') ac.resume();
      const lead = voLead(buf), src = ac.createBufferSource(); src.buffer = buf; src.connect(voGain); src.start(0, lead); voCur = src;
      const playDur = Math.max(0.3, (buf.duration || it.d || 1.5) - lead);
      if (lead > 0.1) voBusy = Math.min(voBusy, performance.now() + playDur * 1000 + 250);
      if (onStart) onStart(playDur);
    }).catch(() => { if (onStart && seq === voSeq) onStart(0); });
    voBusy = performance.now() + ((it.d || 1.5) * 1000) + 250;
    return true;
  }
  function voWhenReady(cb) { if (voM) cb(); else voReady.then(() => { if (voM) cb(); }); }
  let voSayF = '', voSeq = 0, voQTimer = null;
  // 离线混音测量：用 OfflineAudioContext 按当前总线增益渲染一段（音乐 / 某个音效 / 某条语音），返回采样
  // name 为音乐场景名（加 '!' 后缀 = 关键时刻强度全开）；空名 = 1V1 比赛音乐
  async function mixRender(kind, name, secs) {
    const sr = 48000, off = new OfflineAudioContext(1, Math.ceil(sr * (secs || 3)), sr);
    const save = { ac, master, pauseGain, musicGain, sfxGain, voGain, noiseBuf };
    if (!ac) ensure();
    const buf = kind === 'vo' ? await voBuf(name) : null;
    ac = off; offAc = off; buildBus(off.destination);
    try {
      if (kind === 'music') { const hot = /!$/.test(name || ''), n = (name || 'p1').replace('!', ''), I = mkInst(TRK[n] ? n : 'p1'); I.out.gain.value = 1; I.nextT = 0.01; if (hot) { I.hot = I.hotTgt = 1; I.lay.gain.value = 1; } schedInst(I, secs); }
      else if (kind === 'sfx') SFX[name]();
      else if (kind === 'vo' && buf) { const src = off.createBufferSource(); src.buffer = buf; src.connect(voGain); src.start(0.01); }
    } finally { offAc = null; ({ ac, master, pauseGain, musicGain, sfxGain, voGain, noiseBuf } = save); }
    const out = await off.startRendering();
    return Array.from(out.getChannelData(0));
  }
  function setMix(k, v) { MIX[k] = v; applyMix(); }
  PH.audio = { voHas: voHas, setPaused: setPaused, get paused() { return pauseOn; }, get pauseLevel() { return pauseGain ? pauseGain.gain.value : 1; }, mixRender: mixRender, MIX: MIX, BASE: BASE, setMix: setMix, voPreload: voPreload, voLine: voLine, voSay: voSay, voStop: voStop, voWhenReady: voWhenReady, sfxNames: () => Object.keys(SFX), vo: vo, setVo: (v) => { voOn = v; }, get voOn() { return voOn; }, play: play, ensure: ensure, startMusic: startMusic, stopMusic: stopMusic, scene: scene, intensity: intensity, get scene_() { return curName; }, get hot() { return hotWant; }, tracks: () => Object.keys(TRK), setMusic: setMusic, setSfx: setSfx, get musicOn() { return musicOn; }, get sfxOn() { return sfxOn; } };
})();
