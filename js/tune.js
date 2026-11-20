// PIXEL HOOPS - V4.0 调参注册表（最先加载，在 game.js 之前）
// 所有可调数值都在这里登记；代码里读 PH.TUNE.get(k)。保存的配置只存与默认不同的项（over()）。
(function () {
  const PH = (window.PH = window.PH || {});
  const GROUPS = [
    { id: 'zone', name: '触发区域' },
    { id: 'lay', name: '上篮扣篮' },
    { id: 'shot', name: '投篮' },
    { id: 'drib', name: '运球过人' },
    { id: 'ai', name: 'AI 决策' },
    { id: 'ct', name: '封堵对抗' },
    { id: 'ankle', name: '晃人' },
    { id: 'def', name: '防守盖帽' },
    { id: 'stam', name: '体力' },
    { id: 'scr', name: '挡拆' },
    { id: 't5', name: '5V5' },
    { id: 'rules', name: '规则' },
  ];
  const GID = {}; GROUPS.forEach((g) => { GID[g.id] = 1; });
  // ---- V4.6 大类 / 小类 / 模式（cat / sub / gm / syn）----
  // 所有参数统一按这一套分类；1V1（l1_）和 5V5（t5_）同一个机制用完全相同的小类名，调参台里排在一起。
  // 参数自己带了 cat / sub 就用自己的（t5_ 由 team5.js 标注，T5RE 里统一个别小类名）；没带的按下面 CLS 规则（键名去掉 l1_ 前缀后匹配，先命中先用）。
  const CATS = [
    { id: 'shot', name: '投篮', subs: ['出手时机', '绿区', '命中', '干扰', '假投', '徽章', '热区与手感', '主宰'] },
    { id: 'fin', name: '终结', subs: ['上篮', '上篮变体', '扣篮', '站扣', '脚步与起跳', '被封堵变体'] },
    { id: 'ct', name: '对抗', subs: ['封堵对抗', '顶翻', '身体碰撞', '背打', '掩护'] },
    { id: 'drib', name: '运球与晃人', subs: ['移动', '招式位移', '连招', '晃人判定', '晃人四档', '被晃恢复', '背身转身', '魔术手'] },
    { id: 'def', name: '防守', subs: ['抢断', '盖帽', '钉板', '被盖反应', '封盖干扰', '补防', '换防与轮转'] },
    { id: 'reb', name: '篮板与散球', subs: ['篮板', '卡位', '篮板动作', '补篮', '地板球', '鱼跃扑球'] },
    { id: 'pass', name: '传球与接球', subs: ['传球', '接球', '接球即投'] },
    { id: 'stam', name: '体力', subs: ['消耗', '恢复', '疲劳影响', '体力门槛'] },
    { id: 'ai', name: 'AI', subs: ['进攻决策', '球员个性', '连招', '防守反应', '难度'] },
    { id: 't5', name: '5V5 团队', subs: ['战术', '换人', '时间管理', '命中校准', '团队专属'] },
    { id: 'pace', name: '节奏与表现', subs: ['时长与规则', '插屏', '特效', '镜头', '回放', '震屏', '输入缓冲'] },
  ];
  const CAT_ID = {}; CATS.forEach((c) => { CAT_ID[c.id] = c; CAT_ID[c.name] = c; });
  const CLS = [
    [/^bg(Acro[GC]|Bully[GC]|Dead|Lim|Fade|Step[GC]|Clutch|Quick|T\d)/, 'shot', '徽章'], [/^bg(Launch|Poster)/, 'fin', '扣篮'], [/^bgRimD/, 'ct', '封堵对抗'],
    [/^bgBullyP/, 'ct', '身体碰撞'], [/^bgClampC/, 'def', '封盖干扰'], [/^bg(Dream|BullySpin)/, 'drib', '背身转身'], [/^bgStepD/, 'drib', '招式位移'],
    [/^bg(TightSt|MotorSt|HuCost)/, 'stam', '消耗'], [/^bg(Hu|MotorDive)/, 'reb', '鱼跃扑球'], [/^(hc|hz)/, 'shot', '热区与手感'],
    [/^dkLowSt$/, 'stam', '疲劳影响'], [/^dk(?!Tgt)/, 'fin', '扣篮'], [/^dif\d/, 'ai', '难度', '1v1'],
    [/^ps(Ch|Si|Po|Sl|Pu)(Su|Open)$/, 'ai', '球员个性', '1v1'], [/^ps(Ch|Si|Po|Sl|Pu)/, 'ai', '球员个性'], [/^aiSty5$/, 'ai', '球员个性', '5v5'], [/^aiPo/, 'ai', '球员个性'],
    [/^aiSu/, 'ai', '进攻决策', '1v1'],
    [/^ai(Df|Rx|Gap|Jmp|Stl|Tip)/, 'ai', '防守反应'], [/^ai(Rel|Dec|Open|W|Post|Pb|Pull|Fake|Clk|Mv|Dv)/, 'ai', '进攻决策'],
    [/^fxT\dSh$/, 'pace', '震屏'], [/^fxWin/, 'pace', '特效', '1v1'], [/^fx/, 'pace', '特效'], [/^rp/, 'pace', '回放', '1v1'], [/^cam/, 'pace', '镜头', '1v1'],
    [/^(prevRun)$/, 'fin', '脚步与起跳', '1v1'], [/^(ctDbl|ctBlkD)$/, 'ct', '封堵对抗', '5v5'],
    [/^shotClock$/, 'pace', '时长与规则', '1v1'],
    [/^(ciDur|ciFx)$/, 'pace', '插屏'], [/^layNoStop$/, 'pace', '特效'], [/^ibuf/, 'pace', '输入缓冲'],
    [/^(smTLay|smTFlo|layTi|floTi|smLay0|smLayR|smFlo0|smFloR|smIn|smGIn)/, 'fin', '上篮'],
    [/^(smLayC|smCLay|smCShot|smCR|contestShot|contestLay|greenContest)/, 'shot', '干扰'],
    [/^(bdStam|dvCost)$/, 'stam', '消耗'], [/^(smFat|mvFat|cbFat|stFat0|stLow)$/, 'stam', '疲劳影响'],
    [/^(stLay|stDunk|stAct|stJump)$/, 'stam', '体力门槛'], [/^(stRg|stamRegen)/, 'stam', '恢复'], [/^(stCost|stShotCost|sprintDrain|moveCost)$/, 'stam', '消耗'],
    [/^(shotJump|clutchMoveT|shotIdeal|lateSlope|smT)/, 'shot', '出手时机'],
    [/^(brClutch|gwSkill|smSk)/, 'shot', '主宰'], [/^gwBadge$/, 'shot', '徽章'],
    [/^(gw|green)/, 'shot', '绿区'], [/^fk(?!Cpu)/, 'shot', '假投'], [/^hz/, 'shot', '热区与手感'],
    [/^smKy$/, 'shot', '主宰'], [/^smEsc$/, 'ct', '封堵对抗'], [/^sm/, 'shot', '命中'],
    [/^(dunk|dkTgt|d2lE)/, 'fin', '扣篮'], [/^sd/, 'fin', '站扣'], [/^(sP|sRev|lv)/, 'fin', '上篮变体'], [/^cv/, 'fin', '被封堵变体'],
    [/^(lay|flo|runV|step|hopD|euroD|gathT)/, 'fin', '脚步与起跳'], [/^aiLay$/, 'ai', '进攻决策'],
    [/^ctThru/, 'ct', '顶翻'], [/^(ct|df)/, 'ct', '封堵对抗'], [/^bdLay|^smBump$/, 'ct', '身体碰撞'], [/^bd/, 'ct', '身体碰撞'], [/^po/, 'ct', '背打'],
    [/^(speedMul|sprintSp)$/, 'drib', '移动'], [/^(dm|mvEdge)/, 'drib', '招式位移'], [/^cb/, 'drib', '连招'],
    [/^akKy/, 'drib', '魔术手'], [/^akPs/, 'drib', '背身转身'], [/^(akCpu|akRead)/, 'ai', '防守反应'],
    [/^(ak(Ag|Hv|Fs|Ctl|Rec))/, 'drib', '被晃恢复'], [/^(akHesi|akCross|akStS|akComboS|akBdgS|akPw|akT[123]|akOffM|akDazeM|akSpinM|akFallM|akFallMin|stunMul)/, 'drib', '晃人四档'],
    [/^(ak|ankle$)/, 'drib', '晃人判定'],
    [/^(stlCpu)/, 'ai', '难度'], [/^(stl|stealMul$)/, 'def', '抢断'],
    [/^(c(Front|Side|Back|Air|Stance|Idle|Full)|contestRange$)/, 'def', '封盖干扰'],
    [/^pin/, 'def', '钉板'], [/^br(T|K|\d)/, 'def', '被盖反应'], [/^(b[A-Z]|bk|blockMul$)/, 'def', '盖帽'],
    [/^rbAi/, 'ai', '防守反应'], [/^rbBox/, 'reb', '卡位'], [/^rbL/, 'reb', '地板球'], [/^(rbStNear|rbTip|rbRip|rbChin|rbOne|rbCv)/, 'reb', '篮板动作'],
    [/^rb/, 'reb', '篮板'], [/^pb/, 'reb', '补篮'], [/^(hu|dv)/, 'reb', '鱼跃扑球'],
    [/^ai_cb/, 'ai', '连招'], [/^fkCpu$/, 'ai', '进攻决策'],
  ];
  // 5V5 参数个别小类统一到 1V1 同机制的小类名
  // team5.js 旧小类名 → 统一后的小类（team5_builder 改完后这里只是兜底）
  const T5RE = [[/^t5_dbl_/, 'ct', '封堵对抗']];
  const T5SUB = { 'def|扑防': 'def|换防与轮转', 'def|换防': 'def|换防与轮转', 'def|绕掩护': 'def|换防与轮转', 'def|对位': 'def|换防与轮转', 'def|防守移动': 'def|换防与轮转',
    't5|防守战术': 't5|战术', 't5|无球跑位': 't5|战术', 't5|徽章与专属': 't5|团队专属', 'pass|徽章': 'pass|传球' };
  // 搜索同义词（按小类）
  const SYN = {
    '盖帽': ['封盖', '火锅', 'block'], '抢断': ['断球', '截传', 'steal'], '封盖干扰': ['干扰', 'contest', '举手'], '干扰': ['contest', '封堵'],
    '绿区': ['完美出手', 'green'], '出手时机': ['投篮条', 'timing'], '命中': ['命中率', '投篮'], '扣篮': ['dunk', '暴扣'], '上篮': ['layup', '抛投'],
    '顶翻': ['顶倒', '撞翻'], '身体碰撞': ['冲撞', '对抗', '吨位'], '背打': ['低位', 'post'], '晃人判定': ['脚踝', 'ankle', '晃倒'], '晃人四档': ['脚踝', '晃倒', '踉跄'],
    '篮板': ['rebound', '抢板'], '卡位': ['boxout'], '鱼跃扑球': ['扑球', '地板球', 'hustle'], '补篮': ['补扣', 'putback'], '消耗': ['体力', '耗体'], '疲劳影响': ['疲劳', '累'],
    '连招': ['combo'], '徽章': ['badge', '徽章'], '热区与手感': ['手热', '手冷', 'hot', '热区'], '难度': ['difficulty', '简单', '困难'], '球员个性': ['个性', '风格', '连续过人', '背打', '突破', '急停', 'style'], '防守反应': ['电脑防守', 'AI'], '进攻决策': ['电脑进攻', 'AI'], '招式位移': ['变向', '过人'], '传球': ['pass'], '接球即投': ['catch', '接投'], '换人': ['轮换'], '时长与规则': ['进攻时间', '24 秒'],
  };
  // V4.6 合并删除的旧键 → 新键（读旧档 C1 等）：只在旧键已不存在时生效；新键自己有保存值时以新键为准（这些键 1V1 也读，不能被 5V5 旧值覆盖）
  //   [旧键, 新键, 换算]：换算 'div:<键>' = 旧值 ÷ 该键当前值（倍率化的项）
  const ALIAS = [
    ['t5_spr_stam', 'l1_stLow'], ['t5_opp_sh', 't5_opp_shK', 'div:l1_contestRange'], ['t5_int_cpu0', 'l1_stlCpu0'], ['t5_int_cpuD', 'l1_stlCpuD'],
    ['t5_sk_dimeG', 'l1_gwSkill'], ['t5_sk_dimeC', 'l1_smKy'],
    ['t5_b5_gm', 't5_b5_gmK', 'div:l1_gwBadge'], ['t5_b5_tot', 't5_b5_totK', 'div:l1_gwBadge'], ['t5_b5_gmS', 't5_b5_gmSK', 'div:l1_gwSkill'], ['t5_b5_totS', 't5_b5_totSK', 'div:l1_gwSkill'],
  ];
  function alias(obj) {
    if (!obj || typeof obj !== 'object') return obj;
    let o = null;
    for (const [a, b, cv] of ALIAS) {
      if (!(a in obj) || D[a] || (b in obj)) continue;
      let v = +obj[a]; if (!isFinite(v)) continue;
      if (cv && cv.slice(0, 4) === 'div:') { const r = cv.slice(4), base = r in obj ? +obj[r] : D[r] ? D[r].v : NaN; if (!(base > 0)) continue; v = +(v / base).toPrecision(6); }
      o = o || Object.assign({}, obj); o[b] = v; delete o[a];
    }
    return o || obj;
  }
  function classify(d) {
    const k = String(d.k), bare = k.replace(/^l1_/, ''), t5 = /^t5_/.test(k);
    if (t5) { const m = T5SUB[d.cat + '|' + d.sub]; if (m) { d.cat = m.split('|')[0]; d.sub = m.split('|')[1]; } for (const [re, c, s] of T5RE) if (re.test(k)) { d.cat = c; d.sub = s; } }
    if (!d.cat) for (const r of CLS) if (r[0].test(bare)) { d.cat = r[1]; d.sub = r[2]; if (r[3] && !d.gm) d.gm = r[3]; break; }
    if (!d.cat) { d.cat = t5 ? 't5' : 'pace'; d.sub = d.sub || (t5 ? '战术' : '时长与规则'); }
    if (CAT_ID[d.cat] && CAT_ID[d.cat].id !== d.cat) d.cat = CAT_ID[d.cat].id;
    if (!d.sub) d.sub = CAT_ID[d.cat] ? CAT_ID[d.cat].subs[0] : '通用';
    if (!d.gm) d.gm = t5 ? '5v5' : /^(1v1|5v5|both)$/.test(d.mode) ? d.mode : 'both';
    if (!d.syn && SYN[d.sub]) d.syn = SYN[d.sub];
  }
  const defs = [], D = {}, V = {}, subs = [];
  let pend = {};   // load() 时尚未注册的项：之后 reg 到了再套用（文件加载顺序不一致时也不丢）
  const EPS = 1e-9;

  function cl(d, v) {
    if (d.mode === 'bool') return v ? 1 : 0;
    v = +v; if (!isFinite(v)) return d.v;
    if (d.min != null && v < d.min) v = d.min;
    if (d.max != null && v > d.max) v = d.max;
    if (d.mode === 'int') v = Math.round(v);
    return v;
  }
  // 读取保存的配置（C1 等）：不按滑条范围截断，只做数值 / 整数 / 开关校正——旧版本或手改出来的超范围值原样生效
  function clLoose(d, v) {
    if (d.mode === 'bool') return v ? 1 : 0;
    v = +v; if (!isFinite(v)) return d.v;
    if (d.mode === 'int') v = Math.round(v);
    return v;
  }
  // V4.3 系统放宽滑条范围（默认值不变）：下限到 0（原本允许负值的放到 2 倍）；上限到默认值的 4 倍，
  // 距离（米）最多到 6 米、概率 / 比例最多到 1；时长（秒）下限留一个步长，避免除以 0。步长按新范围调整（保持能精确落回默认值）
  // WIDE：个别参数指定范围（扣篮 / 上篮距离类给得更宽）
  const WIDE = {
    l1_dunkMax: { max: 6 }, l1_dunkMin: { max: 5 }, l1_dunkBase: { max: 3 }, l1_dunkAth: { max: 6 },
    l1_dkTgt: { max: 5 }, l1_dkTgtRun: { max: 5 }, l1_dkTgtMin: { max: 5 },
    l1_layMax: { max: 10 }, l1_layTgtA: { max: 8 }, l1_layTgtB: { max: 10 }, l1_stepMax: { max: 7 }, l1_stepBase: { max: 5 }, l1_stepRun: { max: 5 },
  };
  function widen(d) {
    if (d.mode === 'bool' || d.min == null || d.max == null || d.wide === false) return;
    if (d.min === 0 && d.max === 1 && d.step === 1) return;   // 0 / 1 开关
    const v = +d.v, mn = d.min, mx = d.max, txt = (d.label || '') + ' ' + (d.note || ''), unit = String(d.note || '').trim();
    const prob = mx <= 1 && mn >= 0 && v <= 1 && /概率|比例|占比/.test(txt) && !/倍率/.test(unit.slice(0, 4));
    const meter = /^米/.test(unit) && !/米\/秒|米\/米/.test(unit.slice(0, 4)), sec = /^秒/.test(unit);
    let hi = v !== 0 ? 4 * Math.abs(v) : 2 * mx;
    if (prob) hi = 1; else if (meter) hi = Math.min(hi, 6); else if (mx === 100 && v <= 100) hi = 100;   // 百分制（体力等）封顶 100
    let nmx = Math.max(mx, hi), nmn = mn >= 0 ? 0 : 2 * mn;
    if (sec && mn > 0) nmn = Math.min(mn, d.step || 0.01);
    const W = WIDE[d.k]; if (W) { if (W.min != null) nmn = Math.min(nmn, W.min); if (W.max != null) nmx = Math.max(nmx, W.max); }
    if (d.mode === 'int') { nmx = Math.ceil(nmx); nmn = Math.floor(nmn); }
    d.min0 = mn; d.max0 = mx; d.min = nmn; d.max = nmx;
    // 步长：范围扩大后格数太多就放大步长（×2 / ×5 / ×10），但要能精确表示默认值
    const st = d.step || 0.01;
    for (const m of [10, 5, 2]) { const s2 = st * m; if ((nmx - nmn) / s2 >= 300 && (d.mode !== 'int' || s2 >= 1) && Math.abs(v / s2 - Math.round(v / s2)) < 1e-6 && Math.abs((v - nmn) / s2 - Math.round((v - nmn) / s2)) < 1e-6) { d.step = +s2.toPrecision(6); break; } }
  }
  function emit(keys) { for (const f of subs.slice()) { try { f(keys); } catch (e) { console.error('TUNE.on', e); } } }

  const T = {
    groups: GROUPS,
    CATS: CATS,
    CAT_ID: CAT_ID,
    classify: classify,
    ALIAS: ALIAS,
    alias: alias,
    cur: { id: 'official', name: '官方默认' },
    // list: [{k, g, label, v, min, max, step, mode, note, fmt, tmp}]；tmp=true：临时控件，不进 over()、load 不覆盖
    //   k 全局唯一（l1_ 共用 / t5_ 5V5 专用）；g 分组 id；v 默认值；mode: 'num'(默认) | 'int' | 'bool'
    //   note：单位和效果（只在调参台显示）；fmt：可选，(v) => 显示文本
    reg(list) {
      const ks = [];
      for (const it of list || []) {
        if (!it || !it.k) continue;
        if (D[it.k]) { console.warn('TUNE.reg 重复', it.k); continue; }
        const d = Object.assign({ g: 'rules', label: it.k, min: null, max: null, step: 0.01, mode: 'num', note: '' }, it);
        if (!GID[d.g]) d.g = 'rules';
        classify(d);
        widen(d);
        if (d.min != null && d.v < d.min) d.min = d.v;
        if (d.max != null && d.v > d.max) d.max = d.v;
        defs.push(d); D[d.k] = d; V[d.k] = d.v; ks.push(d.k);
        if (d.k in pend) { V[d.k] = clLoose(d, pend[d.k]); delete pend[d.k]; }
      }
      if (ks.length) emit(ks);
      return T;
    },
    has(k) { return !!D[k]; },
    get(k) { return V[k]; },
    def(k) { return D[k] ? D[k].v : undefined; },
    meta(k) { return D[k]; },
    set(k, v) {
      const d = D[k]; if (!d) return false;
      v = cl(d, v); if (Math.abs(V[k] - v) <= EPS) return true;
      V[k] = v; emit([k]); return true;
    },
    // tmp 项（如“预览跑速”）只是调参台的临时控件：不进 over() / nOver()，load() 时保持当前值
    over() { const o = {}; for (const d of defs) if (!d.tmp && Math.abs(V[d.k] - d.v) > EPS) o[d.k] = V[d.k]; return o; },
    nOver() { let n = 0; for (const d of defs) if (!d.tmp && Math.abs(V[d.k] - d.v) > EPS) n++; return n; },
    load(obj, cur) {
      pend = {};
      obj = alias(obj);
      for (const d of defs) if (!d.tmp) V[d.k] = d.v;
      if (obj && typeof obj === 'object') for (const k in obj) { if (D[k] && !D[k].tmp) V[k] = clLoose(D[k], obj[k]); else pend[k] = obj[k]; }
      if (cur) T.cur = { id: cur.id, name: cur.name };
      emit(null);   // null = 全部可能变化
      return T;
    },
    reset(x) {
      if (x == null) { pend = {}; for (const d of defs) V[d.k] = d.v; emit(null); return; }
      if (D[x]) { T.set(x, D[x].v); return; }
      if (GID[x]) { const ks = []; for (const d of defs) if (d.g === x && Math.abs(V[d.k] - d.v) > EPS) { V[d.k] = d.v; ks.push(d.k); } if (ks.length) emit(ks); }
    },
    list(g) { return g ? defs.filter((d) => d.g === g) : defs.slice(); },
    vals() { const o = {}; for (const d of defs) o[d.k] = V[d.k]; return o; },
    on(fn) { subs.push(fn); return () => { const i = subs.indexOf(fn); if (i >= 0) subs.splice(i, 1); }; },
    // 热路径缓存：bind(obj, {字段: 'k', ...}) → obj.字段 始终等于当前值
    bind(obj, map) {
      const sync = () => { for (const f in map) if (D[map[f]]) obj[f] = V[map[f]]; };
      sync(); T.on(sync); return obj;
    },
  };
  PH.TUNE = T;
})();
