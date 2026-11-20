// PIXEL HOOPS - 5V5 球队比赛（V3.9 重做）：动作和判定全部复用 1V1（PH.game.t5），本文件只做球队层
// 逻辑坐标与 1V1 相同（进攻方朝 y=+12.425 的篮筐），世界坐标见下方说明
(function () {
  const PH = (window.PH = window.PH || {});
  const CL = 14, CW = 7.5, HX = 12.425, HZ = 3.05;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v), lerp = (a, b, t) => a + (b - a) * t;
  const rnd = Math.random, rr = (a, b) => a + (b - a) * rnd(), hyp = Math.hypot;
  const POSV = { 控球后卫: 1, 得分后卫: 2, 后卫: 1.5, 小前锋: 3, 前锋: 3.5, 大前锋: 4, 中锋: 5 };
  // CPU 难度：react 决策间隔、gap 贴防距离、steal 抢断倍率、help 协防概率、blk 盖帽倍率、shot 命中倍率
  const DIFF5 = [
    { react: 0.34, gap: 1.5, steal: 0.55, help: 0.45, blk: 0.6, shot: 0.9, spd: 0.94 },
    { react: 0.22, gap: 1.15, steal: 1, help: 0.75, blk: 1, shot: 1, spd: 1 },
    { react: 0.14, gap: 0.95, steal: 1.35, help: 0.95, blk: 1.25, shot: 1.06, spd: 1.03 },
  ];
  const POSE0 = { tilt: 0, lean: 0.05, lA: 0.16, lB: 0.34, lS: 0.06, rA: -0.16, rB: 0.34, rS: 0.06, aLp: 0.35, aLq: 0.18, aLe: 0.45, aRp: 0.35, aRq: 0.18, aRe: 0.45 };
  const T = { on: false };

  // V4.0 调参台：5V5 可调数值（t5_ 前缀，t5 组）。默认值 = 原来写死的值；PH.TUNE 不在时用默认值。热路径读缓存 TV，TUNE 改动时刷新
  const T5REG = [
    { k: 't5_k5_ra_c', g: 't5', cat: 't5', sub: '命中校准', gm: '5v5', syn: ['l1_cFront'], label: '篮下上篮 干扰系数', v: 0.56, min: 0.2, max: 1.6, step: 0.01, note: '倍率。乘在 1V1 的干扰值上，越大被干扰影响越重。1V1 对应：乘在 1V1 干扰（l1_cFront / l1_cSide 等）的结果上' },
    { k: 't5_k5_ra_p', g: 't5', cat: 't5', sub: '命中校准', gm: '5v5', label: '篮下上篮 命中系数', v: 1.7, min: 0.5, max: 2, step: 0.01, note: '倍率。乘在命中率上，越大越准' },
    { k: 't5_k5_ra_blk', g: 't5', cat: 't5', sub: '命中校准', gm: '5v5', label: '篮下上篮 被盖系数', v: 0.3, min: 0, max: 1.5, step: 0.01, note: '倍率。乘在被盖概率上' },
    { k: 't5_k5_lay_c', g: 't5', cat: 't5', sub: '命中校准', gm: '5v5', label: '抛投勾手 干扰系数', v: 0.62, min: 0.2, max: 1.6, step: 0.01, note: '倍率。乘在 1V1 的干扰值上，越大被干扰影响越重' },
    { k: 't5_k5_lay_p', g: 't5', cat: 't5', sub: '命中校准', gm: '5v5', label: '抛投勾手 命中系数', v: 1.85, min: 0.5, max: 2, step: 0.01, note: '倍率。乘在命中率上，越大越准' },
    { k: 't5_k5_lay_blk', g: 't5', cat: 't5', sub: '命中校准', gm: '5v5', label: '抛投勾手 被盖系数', v: 0.4, min: 0, max: 1.5, step: 0.01, note: '倍率。乘在被盖概率上' },
    { k: 't5_k5_paint_c', g: 't5', cat: 't5', sub: '命中校准', gm: '5v5', label: '禁区跳投 干扰系数', v: 0.8, min: 0.2, max: 1.6, step: 0.01, note: '倍率。乘在 1V1 的干扰值上，越大被干扰影响越重' },
    { k: 't5_k5_paint_p', g: 't5', cat: 't5', sub: '命中校准', gm: '5v5', label: '禁区跳投 命中系数', v: 1.45, min: 0.5, max: 2, step: 0.01, note: '倍率。乘在命中率上，越大越准' },
    { k: 't5_k5_paint_blk', g: 't5', cat: 't5', sub: '命中校准', gm: '5v5', label: '禁区跳投 被盖系数', v: 0.45, min: 0, max: 1.5, step: 0.01, note: '倍率。乘在被盖概率上' },
    { k: 't5_k5_mid_c', g: 't5', cat: 't5', sub: '命中校准', gm: '5v5', label: '中投 干扰系数', v: 0.8, min: 0.2, max: 1.6, step: 0.01, note: '倍率。乘在 1V1 的干扰值上，越大被干扰影响越重' },
    { k: 't5_k5_mid_p', g: 't5', cat: 't5', sub: '命中校准', gm: '5v5', label: '中投 命中系数', v: 1.4, min: 0.5, max: 2, step: 0.01, note: '倍率。乘在命中率上，越大越准' },
    { k: 't5_k5_mid_blk', g: 't5', cat: 't5', sub: '命中校准', gm: '5v5', label: '中投 被盖系数', v: 0.3, min: 0, max: 1.5, step: 0.01, note: '倍率。乘在被盖概率上' },
    { k: 't5_k5_three_c', g: 't5', cat: 't5', sub: '命中校准', gm: '5v5', label: '三分 干扰系数', v: 0.92, min: 0.2, max: 1.6, step: 0.01, note: '倍率。乘在 1V1 的干扰值上，越大被干扰影响越重' },
    { k: 't5_k5_three_p', g: 't5', cat: 't5', sub: '命中校准', gm: '5v5', label: '三分 命中系数', v: 1.0, min: 0.5, max: 2, step: 0.01, note: '倍率。乘在命中率上，越大越准' },
    { k: 't5_k5_three_blk', g: 't5', cat: 't5', sub: '命中校准', gm: '5v5', label: '三分 被盖系数', v: 0.3, min: 0, max: 1.5, step: 0.01, note: '倍率。乘在被盖概率上' },
    { k: 't5_dbl_r', g: 't5', cat: 'ct', sub: '封堵对抗', gm: '5v5', syn: ['l1_ctDbl', 'l1_ctBlkD'], label: '双人封堵 检测半径', v: 1.5, min: 1, max: 4, step: 0.1, note: '米。出手时这个距离内的防守人都计算干扰（V4.3 2.7 → 1.5）。1V1 对应：l1_ctDbl（双人封堵 额外惩罚）/ l1_ctBlkD（双人封堵 被盖倍率）；5V5 用这里的合成规则改干扰，1V1 的两项在 5V5 照样叠加' },
    { k: 't5_dbl_w2', g: 't5', cat: 'ct', sub: '封堵对抗', gm: '5v5', syn: ['l1_ctDbl'], label: '双人封堵 第二人权重', v: 0.4, min: 0, max: 1, step: 0.05, note: '合成干扰 = c1 + 权重×c2 + 第三人权重×c3，上限 1。1V1 对应：l1_ctDbl' },
    { k: 't5_dbl_w3', g: 't5', cat: 'ct', sub: '封堵对抗', gm: '5v5', syn: ['l1_ctDbl'], label: '双人封堵 第三人权重', v: 0.15, min: 0, max: 1, step: 0.05, note: '第三近的防守人的干扰权重。1V1 对应：l1_ctDbl' },
    { k: 't5_dbl_min', g: 't5', cat: 'ct', sub: '封堵对抗', gm: '5v5', syn: ['l1_ctDbl'], label: '双人封堵 第二人门槛', v: 0.5, min: 0, max: 1, step: 0.01, note: '第二人干扰低于这个值就忽略，不算双人封堵（V4.3 0.1 → 0.5：封堵对抗模型下双人封堵上篮命中只剩 3 成，只算第二人也真正封到的情况）。1V1 对应：l1_ctDbl' },
    { k: 't5_scr_th1', g: 't5', cat: 'ct', sub: '掩护', gm: '5v5', label: '掩护分档 中档门槛', v: 0.5, min: 0.1, max: 3, step: 0.05, note: '掩护强度分数 ≥ 这个值算中档（越低中档越多）' },
    { k: 't5_scr_th2', g: 't5', cat: 'ct', sub: '掩护', gm: '5v5', label: '掩护分档 重档门槛', v: 1.0, min: 0.1, max: 3, step: 0.05, note: '分数 ≥ 这个值算重档' },
    { k: 't5_scr_th3', g: 't5', cat: 'ct', sub: '掩护', gm: '5v5', label: '掩护分档 挡倒门槛', v: 1.9, min: 0.1, max: 4, step: 0.05, note: '分数 ≥ 这个值算挡倒' },
    { k: 't5_scr_dK', g: 't5', cat: 'ct', sub: '掩护', gm: '5v5', label: '被挡停滞时长倍率', v: 1.4, min: 0.3, max: 3, step: 0.05, note: '倍率。被挡后防守人停滞的时间' },
    { k: 't5_scr_sK', g: 't5', cat: 'ct', sub: '掩护', gm: '5v5', label: '被挡硬直倍率', v: 1.4, min: 0.3, max: 3, step: 0.05, note: '倍率。被挡瞬间的硬直' },
    { k: 't5_scr_pK', g: 't5', cat: 'ct', sub: '掩护', gm: '5v5', label: '重档弹开倍率', v: 1.15, min: 0.3, max: 3, step: 0.05, note: '倍率。重档 / 挡倒时防守人被顶开的距离' },
    { k: 't5_scr_p2', g: 't5', cat: 'ct', sub: '掩护', gm: '5v5', label: '中档弹开比例', v: 0.5, min: 0, max: 1.5, step: 0.05, note: '中档被顶开的距离，占重档的比例' },
    { k: 't5_scr_offK', g: 't5', cat: 'ct', sub: '掩护', gm: '5v5', label: '无球被挡 移动保留', v: 0.45, min: 0.05, max: 1, step: 0.01, note: '停滞期内防守人的移动速度保留比例（没有分档数值时）' },
    { k: 't5_scr_pnrK', g: 't5', cat: 'ct', sub: '掩护', gm: '5v5', label: '挡拆被挡 移动上限', v: 0.32, min: 0.05, max: 1, step: 0.01, note: '有球挡拆被挡后，停滞期内防守人移动速度最多保留这个比例' },
    { k: 't5_scr_arW', g: 't5', cat: 'def', sub: '换防与轮转', gm: '5v5', label: '绕挡 外侧距离', v: 1.35, min: 0.3, max: 3, step: 0.05, note: '米。被挡后从掩护人外侧绕过的横向距离，越大路线越长' },
    { k: 't5_scr_arT', g: 't5', cat: 'def', sub: '换防与轮转', gm: '5v5', label: '绕挡 持续时间', v: 0.9, min: 0, max: 2, step: 0.05, note: '秒。停滞结束后这段时间内仍走绕挡路线' },
    { k: 't5_scr_arV', g: 't5', cat: 'def', sub: '换防与轮转', gm: '5v5', label: '挡拆绕挡 速度', v: 0.75, min: 0.3, max: 1, step: 0.05, note: '倍率。持球人的防守人绕挡时的速度' },
    { k: 't5_scr_swP', g: 't5', cat: 'def', sub: '换防与轮转', gm: '5v5', label: '无球换防 概率倍率', v: 0.85, min: 0, max: 1.5, step: 0.05, note: '倍率。无球掩护后选择换防的概率' },
    { k: 't5_scr_swD', g: 't5', cat: 'def', sub: '换防与轮转', gm: '5v5', label: '无球换防 最短延迟', v: 0.3, min: 0, max: 1.5, step: 0.05, note: '秒。喊换防到真正交换盯人的最短时间' },
    { k: 't5_scr_swD2', g: 't5', cat: 'def', sub: '换防与轮转', gm: '5v5', label: '无球换防 延迟浮动', v: 0.35, min: 0, max: 1.5, step: 0.05, note: '秒。协防意识越差，延迟在最短延迟上加得越多（最多加这么多）' },
    { k: 't5_acc_up', g: 't5', cat: 'def', sub: '换防与轮转', gm: '5v5', label: '防守起步加速度', v: 13, min: 4, max: 40, step: 0.5, note: '米/秒²。电脑无球防守（扑防、回位、退防）起步加速' },
    { k: 't5_acc_upA', g: 't5', cat: 'def', sub: '换防与轮转', gm: '5v5', label: '起步加速 能力加成', v: 6, min: 0, max: 20, step: 0.5, note: '米/秒²。加速能力每高 1（满分 1）多加的加速度' },
    { k: 't5_acc_dn', g: 't5', cat: 'def', sub: '换防与轮转', gm: '5v5', label: '防守减速度', v: 24, min: 4, max: 60, step: 0.5, note: '米/秒²。减速、急停' },
    { k: 't5_rx_base', g: 't5', cat: 'ai', sub: '防守反应', gm: '5v5', label: '传球反应 基础', v: 0.23, min: 0, max: 0.6, step: 0.01, note: '秒。球传出后防守人转向新目标的反应时间（按协防 / 预判 / 防守能力增减）' },
    { k: 't5_rx_min', g: 't5', cat: 'ai', sub: '防守反应', gm: '5v5', label: '传球反应 最短', v: 0.2, min: 0, max: 0.6, step: 0.01, note: '秒。反应时间下限' },
    { k: 't5_rx_max', g: 't5', cat: 'ai', sub: '防守反应', gm: '5v5', label: '传球反应 最长', v: 0.45, min: 0.1, max: 1.2, step: 0.01, note: '秒。反应时间上限' },
    { k: 't5_cs_od', g: 't5', cat: 'pass', sub: '接球即投', gm: '5v5', label: '接球即投 最小空间', v: 1.6, min: 0.5, max: 4, step: 0.1, note: '米。接球时最近防守人比这个近就不会接球就投' },
    { k: 't5_cs_jr', g: 't5', cat: 'pass', sub: '接球即投', gm: '5v5', label: '接球即投 投射门槛', v: 0.7, min: 0.4, max: 1, step: 0.01, note: '投射能力（满分 1）达到这个值才会接球就投' },
    { k: 't5_cs_jrLo', g: 't5', cat: 'pass', sub: '接球即投', gm: '5v5', label: '接球即投 大空位门槛', v: 0.62, min: 0.4, max: 1, step: 0.01, note: '非常空（≥ 大空位距离）时，投射达到这个值也会投' },
    { k: 't5_cs_far', g: 't5', cat: 'pass', sub: '接球即投', gm: '5v5', label: '接球即投 大空位距离', v: 3.5, min: 1, max: 6, step: 0.1, note: '米。最近防守人超过这个距离算非常空' },
    { k: 't5_cs_open', g: 't5', cat: 'pass', sub: '接球即投', gm: '5v5', label: '空位接球 距离', v: 2.5, min: 1, max: 5, step: 0.1, note: '米。超过这个距离，投射中等以上的人基本都接球就投' },
    { k: 't5_cs_base', g: 't5', cat: 'pass', sub: '接球即投', gm: '5v5', label: '空位接球 基础出手率', v: 0.72, min: 0, max: 1, step: 0.01, note: '空位且投射达标时的接球就投概率起点' },
    { k: 't5_cs_atkV', g: 't5', cat: 'pass', sub: '接球即投', gm: '5v5', label: '一步过人 扑防速度', v: 4, min: 1, max: 8, step: 0.1, note: '米/秒。防守人扑过来的速度超过这个值，会突破的人才考虑一步过人' },
    { k: 't5_cs_keep', g: 't5', cat: 'pass', sub: '接球即投', gm: '5v5', label: '空位接球 不放弃距离', v: 2.2, min: 0.5, max: 5, step: 0.1, note: '米。接球时这么空的跳投在 0.6 秒内不会被否决' },
    { k: 't5_csb_g1', g: 't5', cat: 'shot', sub: '徽章', gm: '5v5', label: '接球投篮徽章 铜 绿区', v: 0.08, min: 0, max: 1, step: 0.01, note: '绿区加宽比例（0.25 = 宽 25%）' },
    { k: 't5_csb_p1', g: 't5', cat: 'shot', sub: '徽章', gm: '5v5', label: '接球投篮徽章 铜 命中', v: 0.02, min: 0, max: 0.3, step: 0.005, note: '命中率加成比例' },
    { k: 't5_csb_t1', g: 't5', cat: 'shot', sub: '徽章', gm: '5v5', label: '接球投篮徽章 铜 出手提速', v: 0.02, min: 0, max: 0.2, step: 0.005, note: '秒。出手动作提前' },
    { k: 't5_csb_g2', g: 't5', cat: 'shot', sub: '徽章', gm: '5v5', label: '接球投篮徽章 银 绿区', v: 0.15, min: 0, max: 1, step: 0.01, note: '绿区加宽比例（0.25 = 宽 25%）' },
    { k: 't5_csb_p2', g: 't5', cat: 'shot', sub: '徽章', gm: '5v5', label: '接球投篮徽章 银 命中', v: 0.035, min: 0, max: 0.3, step: 0.005, note: '命中率加成比例' },
    { k: 't5_csb_t2', g: 't5', cat: 'shot', sub: '徽章', gm: '5v5', label: '接球投篮徽章 银 出手提速', v: 0.035, min: 0, max: 0.2, step: 0.005, note: '秒。出手动作提前' },
    { k: 't5_csb_g3', g: 't5', cat: 'shot', sub: '徽章', gm: '5v5', label: '接球投篮徽章 金 绿区', v: 0.25, min: 0, max: 1, step: 0.01, note: '绿区加宽比例（0.25 = 宽 25%）' },
    { k: 't5_csb_p3', g: 't5', cat: 'shot', sub: '徽章', gm: '5v5', label: '接球投篮徽章 金 命中', v: 0.055, min: 0, max: 0.3, step: 0.005, note: '命中率加成比例' },
    { k: 't5_csb_t3', g: 't5', cat: 'shot', sub: '徽章', gm: '5v5', label: '接球投篮徽章 金 出手提速', v: 0.05, min: 0, max: 0.2, step: 0.005, note: '秒。出手动作提前' },
    { k: 't5_csb_g4', g: 't5', cat: 'shot', sub: '徽章', gm: '5v5', label: '接球投篮徽章 名人堂 绿区', v: 0.36, min: 0, max: 1, step: 0.01, note: '绿区加宽比例（0.25 = 宽 25%）' },
    { k: 't5_csb_p4', g: 't5', cat: 'shot', sub: '徽章', gm: '5v5', label: '接球投篮徽章 名人堂 命中', v: 0.075, min: 0, max: 0.3, step: 0.005, note: '命中率加成比例' },
    { k: 't5_csb_t4', g: 't5', cat: 'shot', sub: '徽章', gm: '5v5', label: '接球投篮徽章 名人堂 出手提速', v: 0.065, min: 0, max: 0.2, step: 0.005, note: '秒。出手动作提前' },
    { k: 't5_csb_xg', g: 't5', cat: 'shot', sub: '徽章', gm: '5v5', label: '接球投篮 空位/掩护额外绿区', v: 0.04, min: 0, max: 0.3, step: 0.01, note: '空位或掩护后接球时额外加宽的绿区比例' },
    { k: 't5_fat_up', g: 't5', cat: 'stam', sub: '消耗', gm: '5v5', syn: ['l1_stFat0'], label: '长期疲劳 累积', v: 24, min: 0, max: 80, step: 1, mode: 'int', note: '每 7 分钟（12 分钟一节的比例）在场活球时间累积的疲劳点数，高速跑动时再乘高速倍率。1V1 对应：l1_stFat0（疲劳起点）是短时体力的疲劳影响，这里是 5V5 的长期疲劳，两层叠加' },
    { k: 't5_fat_dn', g: 't5', cat: 'stam', sub: '恢复', gm: '5v5', label: '长期疲劳 板凳恢复', v: 35, min: 0, max: 120, step: 1, mode: 'int', note: '每 4 分钟（按节长比例）在板凳上恢复的疲劳点数，死球时减半' },
    { k: 't5_fat_max', g: 't5', cat: 'stam', sub: '疲劳影响', gm: '5v5', syn: ['l1_stFat0'], label: '长期疲劳 上限', v: 60, min: 10, max: 100, step: 1, mode: 'int', note: '疲劳最多累积到这个值（体力上限 = 100 − 疲劳）。1V1 对应：l1_stFat0' },
    { k: 't5_fat_qb', g: 't5', cat: 'stam', sub: '恢复', gm: '5v5', label: '节间休息 恢复', v: 5, min: 0, max: 30, step: 1, mode: 'int', note: '每节之间所有人恢复的疲劳点数' },
    { k: 't5_sub_th', g: 't5', cat: 't5', sub: '换人', gm: '5v5', label: '换人 体力阈值', v: 65, min: 30, max: 100, step: 1, mode: 'int', note: '体力上限（100 − 疲劳）低于这个值开始扣换人评分' },
    { k: 't5_sub_keep', g: 't5', cat: 't5', sub: '换人', gm: '5v5', label: '换人 刚上场保护', v: 50, min: 0, max: 100, step: 1, mode: 'int', note: '刚换上来的人，疲劳低于这个值就至少打一段' },
    { k: 't5_sub_bench', g: 't5', cat: 't5', sub: '换人', gm: '5v5', label: '换人 回场疲劳', v: 12, min: 0, max: 60, step: 1, mode: 'int', note: '板凳上疲劳降到这个值以下才会被换回场' },
    { k: 't5_sub_gap', g: 't5', cat: 't5', sub: '换人', gm: '5v5', label: '换人 评分差', v: 4, min: 0, max: 20, step: 1, mode: 'int', note: '替补的评分要比场上的人高出这么多才换' },
    { k: 't5_prs_team', g: 't5', cat: 't5', sub: '战术', gm: '5v5', label: '全场紧逼 紧逼型球队', v: 0.3, min: 0, max: 1, step: 0.05, note: '紧逼型球队在死球后使用全场紧逼的概率' },
    { k: 't5_prs_late', g: 't5', cat: 't5', sub: '战术', gm: '5v5', label: '全场紧逼 末节落后', v: 0.75, min: 0, max: 1, step: 0.05, note: '末节最后 30% 时间落后 3–20 分时的紧逼概率' },
    { k: 't5_prs_h2', g: 't5', cat: 't5', sub: '战术', gm: '5v5', label: '全场紧逼 下半场大比分落后', v: 0.4, min: 0, max: 1, step: 0.05, note: '下半场落后 12 分以上时的紧逼概率' },
    { k: 't5_b5_pm', g: 't5', cat: 'shot', sub: '徽章', gm: '5v5', label: '徽章 命中加成上限', v: 1.15, min: 1, max: 2, step: 0.01, note: '倍率。5V5 徽章合计的命中加成上限' },
    { k: 't5_b5_gmK', g: 't5', cat: 'shot', sub: '徽章', gm: '5v5', syn: ['l1_gwBadge'], label: '5V5 徽章 绿区上限倍率', v: 1.1, min: 0.5, max: 2, step: 0.01, note: '倍率。5V5 团队徽章合计的绿区倍率上限 = l1_gwBadge（徽章绿区加成上限，1V1 / 5V5 共用）× 这个' },
    { k: 't5_b5_gmSK', g: 't5', cat: 'shot', sub: '徽章', gm: '5v5', syn: ['l1_gwSkill'], label: '5V5 徽章 绿区上限倍率（团队专属）', v: 1.12, min: 0.5, max: 2, step: 0.01, note: '倍率。触发团队专属时的绿区倍率上限 = l1_gwSkill（必杀技绿区倍数，共用）× 这个' },
    { k: 't5_b5_totK', g: 't5', cat: 'shot', sub: '徽章', gm: '5v5', syn: ['l1_gwBadge'], label: '5V5 绿区 总上限倍率', v: 1.17, min: 0.5, max: 2.5, step: 0.01, note: '倍率。接球投篮徽章 × 5V5 徽章合计的绿区上限 = l1_gwBadge × 这个' },
    { k: 't5_b5_totSK', g: 't5', cat: 'shot', sub: '徽章', gm: '5v5', syn: ['l1_gwSkill'], label: '5V5 绿区 总上限倍率（团队专属）', v: 1.18, min: 0.5, max: 2.5, step: 0.01, note: '倍率。触发团队专属时的总上限 = l1_gwSkill × 这个' },
    { k: 't5_clk_late', g: 't5', cat: 't5', sub: '时间管理', gm: '5v5', label: '时间紧迫 收战术', v: 6, min: 0, max: 12, step: 0.5, note: '秒。剩余时间 min(进攻时间, 小节时间) ≤ 这个：战术结束转单打 / 挡拆，优先把球传给有空位、能投的人' },
    { k: 't5_clk_pass', g: 't5', cat: 't5', sub: '时间管理', gm: '5v5', label: '时间紧迫 找投手加成', v: 0.45, min: 0, max: 1.5, step: 0.05, note: '分。紧迫窗口内传给空位投手的意愿加成' },
    { k: 't5_clk_force', g: 't5', cat: 't5', sub: '时间管理', gm: '5v5', label: '时间紧迫 强制终结', v: 3, min: 0, max: 8, step: 0.25, note: '秒。剩余 ≤ 这个：不再传球，持球人原地出手或者直接突破上篮；接球就投' },
    { k: 't5_clk_heave', g: 't5', cat: 't5', sub: '时间管理', gm: '5v5', label: '时间紧迫 无论位置强投', v: 1.5, min: 0, max: 4, step: 0.1, note: '秒。剩余 ≤ 这个：无论在哪都马上出手（超远三分 / 抛投）' },
    { k: 't5_clk_rel', g: 't5', cat: 't5', sub: '时间管理', gm: '5v5', label: '时间紧迫 强制出手点', v: 0.3, min: 0, max: 1, step: 0.05, note: '秒。投篮动作中剩余 ≤ 这个就立刻出手，保证球在计时结束前离手' },
    { k: 't5_clk_hold', g: 't5', cat: 't5', sub: '时间管理', gm: '5v5', label: '小节末 领先耗时到', v: 7, min: 0, max: 24, step: 0.5, note: '秒。小节时间少于进攻时间、领先或平分时，电脑先运球耗时，到剩这么多秒再进攻（最后一攻，仍必须在小节结束前出手）；0 = 不耗' },
    { k: 't5_pass_spd', g: 't5', cat: 'pass', sub: '传球', gm: '5v5', label: '传球 球速差距', v: 0.45, min: 0, max: 1, step: 0.05, note: '倍率。球速 × (1 + 这个 × 传球准确偏离)，pac 90 约 +23%、50 约 −21%' },
    { k: 't5_pass_wFast', g: 't5', cat: 'pass', sub: '传球', gm: '5v5', label: '传球 精英出手时间', v: 0.06, min: 0, max: 0.3, step: 0.01, note: '秒。pac 高端的推球准备时间；发球和跳传不等待' },
    { k: 't5_pass_wSlow', g: 't5', cat: 'pass', sub: '传球', gm: '5v5', label: '传球 低能力出手时间', v: 0.2, min: 0, max: 0.5, step: 0.01, note: '秒。pac 低端的准备时间，与精英时间按能力插值' },
    { k: 't5_pass_leadLow', g: 't5', cat: 'pass', sub: '传球', gm: '5v5', label: '传球 低能力提前量', v: 0.65, min: 0, max: 1.5, step: 0.05, note: '倍率。低能力预判接球人跑动的比例；高能力趋近 1，误差计入接球质量' },
    { k: 't5_pass_leadCap', g: 't5', cat: 'pass', sub: '传球', gm: '5v5', label: '传球 提前量质量惩罚上限', v: 0.8, min: 0, max: 2, step: 0.05, note: '米。跑动提前量不足计入接球质量的误差上限，不限制原有随机落点误差' },
    { k: 't5_pass_leadRnd', g: 't5', cat: 'pass', sub: '传球', gm: '5v5', label: '传球 提前量波动', v: 0.15, min: 0, max: 0.5, step: 0.05, note: '倍率。低能力提前量的随机正负波动，随 pac 提高减小' },
    { k: 't5_pass_arc', g: 't5', cat: 'pass', sub: '传球', gm: '5v5', label: '传球 弧线差距', v: 1.4, min: 0, max: 2, step: 0.05, note: '倍率。胸前 / 长传的弧度 × (1 − 这个 × 传球准确偏离)：能力高的球更直，能力低的更飘' },
    { k: 't5_pass_er', g: 't5', cat: 'pass', sub: '传球', gm: '5v5', label: '传球 落点误差', v: 1.2, min: 0, max: 3, step: 0.05, note: '米。落点误差 = 这个 × max(0, 误差起点 − 传球准确偏离) × 距离 / 类型系数（以前斜率 0.6）' },
    { k: 't5_pass_er0', g: 't5', cat: 'pass', sub: '传球', gm: '5v5', label: '传球 误差起点', v: 0.25, min: -0.5, max: 0.5, step: 0.01, note: '传球准确偏离高于这个（约 pac 79）就没有随机落点误差；跑动提前量不足仍计入接球质量' },
    { k: 't5_pass_trk', g: 't5', cat: 'pass', sub: '传球', gm: '5v5', label: '传球 偏球修正', v: 0.8, min: 0.2, max: 3, step: 0.05, note: '米。球飞行中向接球人手上修正的速度 × (1 − 落点误差 / 这个)：越小越难修正，偏球会真的偏到身后 / 脚下' },
    { k: 't5_pass_bh', g: 't5', cat: 'pass', sub: '传球', gm: '5v5', label: '传球 偏到身后概率', v: 0.65, min: 0, max: 1, step: 0.05, note: '概率。接球人在跑动时，落点误差偏到他身后的概率（要停下来回身接）' },
    { k: 't5_pass_feet', g: 't5', cat: 'pass', sub: '传球', gm: '5v5', label: '传球 偏到脚下概率', v: 0.35, min: 0, max: 1, step: 0.05, note: '概率。落点误差 > 0.3 米时球偏低、到脚下（低位接球，不能接球即投）' },
    { k: 't5_pass_int', g: 't5', cat: 'def', sub: '抢断', gm: '5v5', label: '传球 被断差距', v: 1.2, min: 0, max: 2, step: 0.05, note: '倍率。截下概率 × (1 − 这个 × 传球准确偏离)（以前 0.6）' },
    { k: 't5_pass_intL', g: 't5', cat: 'def', sub: '抢断', gm: '5v5', label: '传球 长传 / 穿越被断', v: 0.8, min: 0, max: 3, step: 0.05, note: '倍率。传球准确低于中位数时，长传（> 6 米，14 米满）的截下概率再 × (1 + 这个 × 2 × 低出的部分)' },
    { k: 't5_pass_rch', g: 't5', cat: 'def', sub: '抢断', gm: '5v5', label: '传球 慢球截传范围', v: 0.3, min: 0, max: 1, step: 0.05, note: '倍率。防守人截传范围 × (1 − 这个 × 传球准确偏离)：能力低的球慢，更容易被够到' },
    { k: 't5_pass_kf', g: 't5', cat: 'pass', sub: '传球', gm: '5v5', label: '传球手段 失误率', v: 0.3, min: 0, max: 1.5, step: 0.05, note: '概率倍率。高难度传球（击地 / 跳传 / 背后 / No-look / 空中接力 / 过顶长传）的失手率 = 这个 × 难度 × max(0, 门槛 − 传球准确 − 0.5 × 控球)' },
    { k: 't5_pass_kfS', g: 't5', cat: 'pass', sub: '传球', gm: '5v5', label: '传球手段 门槛', v: 0.1, min: -0.5, max: 0.5, step: 0.01, note: '传球准确偏离 + 0.5 × 控球偏离高于这个就能稳定完成高难度传球' },
    { k: 't5_pass_kdB', g: 't5', cat: 'pass', sub: '传球', gm: '5v5', label: '难度 击地', v: 0.6, min: 0, max: 3, step: 0.05, note: '' },
    { k: 't5_pass_kdS', g: 't5', cat: 'pass', sub: '传球', gm: '5v5', label: '难度 过顶长传', v: 0.8, min: 0, max: 3, step: 0.05, note: '' },
    { k: 't5_pass_kdL', g: 't5', cat: 'pass', sub: '传球', gm: '5v5', label: '难度 高吊', v: 0.8, min: 0, max: 3, step: 0.05, note: '' },
    { k: 't5_pass_kdA', g: 't5', cat: 'pass', sub: '传球', gm: '5v5', label: '难度 空中接力', v: 1.3, min: 0, max: 3, step: 0.05, note: '' },
    { k: 't5_pass_kdN', g: 't5', cat: 'pass', sub: '传球', gm: '5v5', label: '难度 背后 / No-look', v: 1.0, min: 0, max: 3, step: 0.05, note: '背身 / 侧身盲传另加' },
    { k: 't5_pass_kdJ', g: 't5', cat: 'pass', sub: '传球', gm: '5v5', label: '难度 跳传', v: 0.8, min: 0, max: 3, step: 0.05, note: '空中传球另加' },
    { k: 't5_pass_fum', g: 't5', cat: 'pass', sub: '接球', gm: '5v5', label: '偏球 漏接', v: 0.15, min: 0, max: 1, step: 0.01, note: '概率倍率。偏球的漏接率 = 这个 × (落点误差 − 0.35) × (0.6 − 接球偏离)' },
    { k: 't5_pass_ckD', g: 't5', cat: 'pass', sub: '接球', gm: '5v5', label: '偏球 停顿', v: 0.35, min: 0, max: 1.5, step: 0.05, note: '秒。偏球接到后电脑多停顿（调整）的时间上限' },
    { k: 't5_pass_csEr', g: 't5', cat: 'pass', sub: '接球即投', gm: '5v5', label: '偏球 不能接球即投', v: 0.42, min: 0, max: 2, step: 0.02, note: '米。落点误差超过这个，电脑不接球就投（先调整）' },
    { k: 't5_pass_q0', g: 't5', cat: 'pass', sub: '接球即投', gm: '5v5', label: '传球质量 基准', v: 0.85, min: 0, max: 1, step: 0.05, note: '传球质量（0~1，落点准、球快）高于这个的传球给接球投篮加成，低于减成' },
    { k: 't5_pass_csG', g: 't5', cat: 'pass', sub: '接球即投', gm: '5v5', label: '传球质量 绿区', v: 1.0, min: 0, max: 2, step: 0.05, note: '倍率。接球 0.6 秒内出手的绿区 × (1 + 这个 × (质量 − 基准))' },
    { k: 't5_pass_csP', g: 't5', cat: 'pass', sub: '接球即投', gm: '5v5', label: '传球质量 命中', v: 0.15, min: 0, max: 0.5, step: 0.01, note: '倍率。接球 0.6 秒内出手的命中 × (1 + 这个 × (质量 − 基准))' },
    { k: 't5_pass_csT', g: 't5', cat: 'pass', sub: '接球即投', gm: '5v5', label: '传球质量 出手节奏', v: 0.06, min: 0, max: 0.3, step: 0.01, note: '秒。好球接到就投的出手提前量 × (质量 − 基准)' },
    { k: 't5_pass_vr0', g: 't5', cat: 'ai', sub: '进攻决策', gm: '5v5', label: 'AI 视野 基础距离', v: 4.5, min: 0, max: 12, step: 0.5, note: '米。电脑持球人能考虑的最远传球 = 这个 + 视野距离 × 传球球商（iq / vis / piq，中位数 0.5）' },
    { k: 't5_pass_vr', g: 't5', cat: 'ai', sub: '进攻决策', gm: '5v5', label: 'AI 视野 距离', v: 14, min: 0, max: 25, step: 0.5, note: '米。见上（以前 6 + 11）' },
    { k: 't5_pass_ws', g: 't5', cat: 'ai', sub: '进攻决策', gm: '5v5', label: 'AI 视野 弱侧', v: 1.2, min: 0, max: 3, step: 0.05, note: '看见弱侧队友的概率 = 0.675 + 这个 × (传球球商 − 0.5)' },
    { k: 't5_pass_near', g: 't5', cat: 'ai', sub: '进攻决策', gm: '5v5', label: 'AI 视野 只传近处', v: 0.6, min: 0, max: 2, step: 0.05, note: '分。传球球商低的电脑偏向近处队友（每 5 米 × 这个 × (0.5 − 球商)）；球商高的反过来更敢传远' },
    { k: 't5_pass_skip', g: 't5', cat: 'ai', sub: '进攻决策', gm: '5v5', label: 'AI 视野 转移 / 远角', v: 0.25, min: 0, max: 1, step: 0.05, note: '分。传球球商高于中位数的电脑，传给弱侧 / 远角（> 9 米）空位投手的加分' },
    { k: 't5_pass_hes', g: 't5', cat: 'ai', sub: '进攻决策', gm: '5v5', label: 'AI 出球犹豫', v: 0.5, min: 0, max: 2, step: 0.05, note: '秒。决策间隔 + 这个 × (0.5 − 传球球商)：球商低的人出球犹豫，高的人出球快' },
    { k: 't5_shakeOff', g: 't5', cat: 'pace', sub: '震屏', gm: '5v5', label: '无球对抗 震屏', v: 0, min: 0, max: 1, step: 0.05, note: '倍率。身体对抗双方都是电脑控制的无球队员（掩护、卡位、跑位碰撞、篮板卡位）时的震屏 / 顿帧倍率；0 = 不震。有人类控制的球员或持球人参与时不受影响' },
    // V4.5 全量登记：5V5 换人 / 体力 / 传球 AI / 截传 / 接球 / 持球决策 / 战术 / 挡拆 / 无球跑位 / 协防 / 扑防 / 对位 / 徽章 / 团队专属（默认值 = 原来写死的值）
    { k: 't5_sub_man', g: 't5', cat: 't5', sub: '换人', gm: '5v5', label: '换人 手动换上保护', v: 90, min: 0, max: 300, step: 5, note: '秒。手动换上的人这段时间内不会被自动换下' },
    { k: 't5_sub_min', g: 't5', cat: 't5', sub: '换人', gm: '5v5', label: '换人 最短上场时间', v: 240, min: 0, max: 720, step: 10, note: '秒（按 12 分钟一节折算，实际 × 节长 / 720）。刚换上的人至少打这么久，除非疲劳超过「刚上场保护」' },
    { k: 't5_sub_pos', g: 't5', cat: 't5', sub: '换人', gm: '5v5', label: '换人 位置不符扣分', v: 5, min: 0, max: 20, step: 0.5, note: '分。自动换人评分 = 总评 − 这个 × 位置号差 − 疲劳扣分；越大越坚持按位置换' },
    { k: 't5_sub_fatW', g: 't5', cat: 't5', sub: '换人', gm: '5v5', label: '换人 疲劳扣分权重', v: 1.2, min: 0, max: 5, step: 0.05, note: '倍率。体力低于「换人 体力阈值」的部分 × 这个扣分；越大越早换下累的人' },
    { k: 't5_sub_cur', g: 't5', cat: 't5', sub: '换人', gm: '5v5', label: '换人 在场者加分', v: 2, min: 0, max: 10, step: 0.5, note: '分。场上这个人自己的评分加成（迟滞），越大越少来回换' },
    { k: 't5_spr_d', g: 't5', cat: 'stam', sub: '消耗', gm: '5v5', label: '无球冲刺 距离门槛', v: 2.2, min: 0, max: 6, step: 0.1, note: '米。离目标点超过这个距离才冲刺（近处慢跑省体力）' },
    { k: 't5_fat_runV', g: 't5', cat: 'stam', sub: '消耗', gm: '5v5', label: '长期疲劳 高速判定', v: 5, min: 0, max: 9, step: 0.1, note: '米/秒。场上移动速度高于这个时长期疲劳按「高速倍率」累积' },
    { k: 't5_fat_run', g: 't5', cat: 'stam', sub: '消耗', gm: '5v5', label: '长期疲劳 高速倍率', v: 1.5, min: 0, max: 4, step: 0.05, note: '倍率。高速跑动时长期疲劳累积 × 这个' },
    { k: 't5_fat_dead', g: 't5', cat: 'stam', sub: '恢复', gm: '5v5', label: '长期疲劳 死球恢复比例', v: 0.5, min: 0, max: 1, step: 0.05, note: '倍率。板凳球员在死球时间的恢复速度 × 这个（活球时 × 1）' },
    { k: 't5_open0', g: 't5', cat: 'ai', sub: '进攻决策', gm: '5v5', label: '空位 起算距离', v: 0.8, min: 0, max: 3, step: 0.05, note: '米。最近防守人距离超过这个才开始算「空」（电脑选传球目标、战术传球都用）' },
    { k: 't5_openW', g: 't5', cat: 'ai', sub: '进攻决策', gm: '5v5', label: '空位 满额跨度', v: 3, min: 0.1, max: 8, step: 0.1, note: '米。起算距离再往外这么多就算完全空位' },
    { k: 't5_blind', g: 't5', cat: 'def', sub: '抢断', gm: '5v5', label: '看球不看人 截传打折', v: 0.6, min: 0, max: 1, step: 0.05, note: '比例。防守人面向持球人、空切人在身后时，截空切传球的范围最多打这么多折（协防意识高的人打折少）' },
    { k: 't5_lr_r0', g: 't5', cat: 'ai', sub: '进攻决策', gm: '5v5', label: '传球线路风险 基础范围', v: 0.7, min: 0, max: 2, step: 0.05, note: '米。电脑估算「线路上有人」的防守人够球范围 = 这个 + 系数 × 抢断' },
    { k: 't5_lr_rS', g: 't5', cat: 'ai', sub: '进攻决策', gm: '5v5', label: '传球线路风险 抢断系数', v: 0.5, min: 0, max: 2, step: 0.05, note: '米。见上；越大电脑越怕抢断好的人站在线路上' },
    { k: 't5_lr_lob', g: 't5', cat: 'ai', sub: '进攻决策', gm: '5v5', label: '传球线路风险 高吊 / 过顶减免', v: 0.35, min: 0, max: 1, step: 0.05, note: '米。高吊和过顶长传估算的够球范围减这么多' },
    { k: 't5_pv_lane', g: 't5', cat: 'ai', sub: '进攻决策', gm: '5v5', label: '传球价值 线路风险扣分', v: 0.9, min: 0, max: 3, step: 0.05, note: '分。线路风险 × 这个（再按传球意识 / 视野放大）从传球价值里扣；越大越不敢往人堆里传' },
    { k: 't5_pv_far', g: 't5', cat: 'ai', sub: '进攻决策', gm: '5v5', label: '传球价值 超长传扣分', v: 0.4, min: 0, max: 2, step: 0.05, note: '分。传球距离 > 14 米时扣这么多' },
    { k: 't5_pv_cut', g: 't5', cat: 'ai', sub: '进攻决策', gm: '5v5', label: '传球价值 空切加分', v: 0.45, min: 0, max: 2, step: 0.05, note: '分。接球人在空切（7.5 米内）时的加分，再按视野 / 传球意识和接球人终结能力缩放' },
    { k: 't5_pv_beat', g: 't5', cat: 'ai', sub: '进攻决策', gm: '5v5', label: '传球价值 甩开防守加分', v: 0.3, min: 0, max: 2, step: 0.05, note: '分。接球人的防守人被挡住 / 甩在身后时的加分' },
    { k: 't5_pv_outlet', g: 't5', cat: 'ai', sub: '进攻决策', gm: '5v5', label: '传球价值 后场回给控卫', v: 0.55, min: 0, max: 2, step: 0.05, note: '分。后场非控卫持球时传给控卫的加分' },
    { k: 't5_pv_back', g: 't5', cat: 'ai', sub: '进攻决策', gm: '5v5', label: '传球价值 回传后场扣分', v: 0.8, min: 0, max: 3, step: 0.05, note: '分。前场持球往后场传的扣分' },
    { k: 't5_see_near', g: 't5', cat: 'ai', sub: '进攻决策', gm: '5v5', label: '传球视野 近处必看见', v: 3.5, min: 0, max: 8, step: 0.1, note: '米。这个距离内的队友不论朝向都看得见' },
    { k: 't5_see_ang', g: 't5', cat: 'ai', sub: '进攻决策', gm: '5v5', label: '传球视野 背后角度', v: 0.2, min: 0, max: 1, step: 0.05, note: '余弦。队友方向和朝向夹角的余弦低于 −(这个 + 1.6 × 视野) 时看不见（越大越难看到身后）' },
    { k: 't5_see_far0', g: 't5', cat: 'ai', sub: '进攻决策', gm: '5v5', label: '传球视野 远处看见概率', v: 0.6, min: 0, max: 1, step: 0.05, note: '概率。9 米外的队友被看见的概率 = 这个 + 0.8 × 视野（中位数 0）' },
    { k: 't5_see_lag', g: 't5', cat: 'ai', sub: '进攻决策', gm: '5v5', label: '传球视野 空位反应延迟', v: 0.55, min: 0, max: 1.5, step: 0.05, note: '秒。队友刚空出来后要过（这个 − 0.5 × 传球球商）秒才被看见' },
    { k: 't5_pv_or0', g: 't5', cat: 'ai', sub: '进攻决策', gm: '5v5', label: '传球判断 客观价值权重', v: 0.2, min: 0, max: 1, step: 0.05, note: '比例。电脑传球判断 = (1 − k) × 主观价值 + k × 客观价值，k = 这个 + 球商权重 × 传球球商' },
    { k: 't5_pv_orG', g: 't5', cat: 'ai', sub: '进攻决策', gm: '5v5', label: '传球判断 球商权重', v: 0.7, min: 0, max: 1, step: 0.05, note: '比例。见上；越大高球商越接近最优选择' },
    { k: 't5_pv_noise', g: 't5', cat: 'ai', sub: '进攻决策', gm: '5v5', label: '传球判断 噪声', v: 0.6, min: 0, max: 2, step: 0.05, note: '分。低球商的判断随机误差幅度 ×(1 − 球商)' },
    { k: 't5_pv_chest', g: 't5', cat: 'pass', sub: '传球', gm: '5v5', label: '球速 胸前传球', v: 12.5, min: 1, max: 30, step: 0.5, note: '米/秒。基础球速（再按传球准确 / 球商缩放）' },
    { k: 't5_pv_skip', g: 't5', cat: 'pass', sub: '传球', gm: '5v5', label: '球速 过顶长传', v: 14, min: 1, max: 30, step: 0.5, note: '米/秒。基础球速' },
    { k: 't5_pv_bounce', g: 't5', cat: 'pass', sub: '传球', gm: '5v5', label: '球速 击地传球', v: 10, min: 1, max: 30, step: 0.5, note: '米/秒。基础球速' },
    { k: 't5_pv_lob', g: 't5', cat: 'pass', sub: '传球', gm: '5v5', label: '球速 高吊', v: 8.5, min: 1, max: 30, step: 0.5, note: '米/秒。基础球速' },
    { k: 't5_pv_alley', g: 't5', cat: 'pass', sub: '传球', gm: '5v5', label: '球速 空中接力', v: 8.5, min: 1, max: 30, step: 0.5, note: '米/秒。基础球速' },
    { k: 't5_pass_lobT', g: 't5', cat: 'pass', sub: '传球', gm: '5v5', label: '高吊 / 空中接力 飞行时间', v: 1.15, min: 0.5, max: 3, step: 0.05, note: '倍率。高吊和空中接力的飞行时间 × 这个' },
    { k: 't5_pass_jpV', g: 't5', cat: 'pass', sub: '传球', gm: '5v5', label: '跳传 球速', v: 0.82, min: 0.2, max: 1.5, step: 0.02, note: '倍率。跳传（突破分球 / 跳投途中传球）的球速 × 这个' },
    { k: 't5_jp_er0', g: 't5', cat: 'pass', sub: '传球', gm: '5v5', label: '跳传 基础误差', v: 0.15, min: 0, max: 1, step: 0.01, note: '米。跳传落点误差基础值（再加传球准确低、被贴身、出手晚的误差，按视野打折）' },
    { k: 't5_jp_crowd', g: 't5', cat: 'pass', sub: '传球', gm: '5v5', label: '跳传 贴身误差', v: 0.35, min: 0, max: 1.5, step: 0.01, note: '米。跳传时 1.2 米内有防守人的额外误差' },
    { k: 't5_jp_late', g: 't5', cat: 'pass', sub: '传球', gm: '5v5', label: '跳传 偏晚误差', v: 0.45, min: 0, max: 1.5, step: 0.01, note: '米。离出手点太近才改传（偏晚窗口）的额外误差' },
    { k: 't5_jp_p1', g: 't5', cat: 'ai', sub: '进攻决策', gm: '5v5', label: '突破分球 一人补防概率', v: 0.25, min: 0, max: 1, step: 0.01, note: '概率。电脑上篮 / 扣篮起步时 1 人补到面前、外线有空位队友时空中分球的概率（再按视野 / 传球意识缩放）' },
    { k: 't5_jp_p2', g: 't5', cat: 'ai', sub: '进攻决策', gm: '5v5', label: '突破分球 两人补防概率', v: 0.55, min: 0, max: 1, step: 0.01, note: '概率。2 人以上补防时' },
    { k: 't5_int_chK', g: 't5', cat: 'def', sub: '抢断', gm: '5v5', label: '截传 总倍率', v: 0.25, min: 0, max: 1, step: 0.01, note: '倍率。截下概率的总系数（越大传球越容易被断）' },
    { k: 't5_int_long', g: 't5', cat: 'def', sub: '抢断', gm: '5v5', label: '截传 距离增长', v: 0.045, min: 0, max: 0.2, step: 0.005, note: '每米。截下概率 × (0.7 + 这个 × 传球距离)，14 米封顶' },
    { k: 't5_int_blind', g: 't5', cat: 'def', sub: '抢断', gm: '5v5', label: '截传 盲传倍率', v: 1.6, min: 1, max: 4, step: 0.05, note: '倍率。背身 / 侧身盲传被截的概率 × 这个' },
    { k: 't5_int_bnc', g: 't5', cat: 'def', sub: '抢断', gm: '5v5', label: '截传 击地倍率', v: 0.55, min: 0, max: 2, step: 0.05, note: '倍率。击地传球被截的概率 × 这个' },
    { k: 't5_int_lob', g: 't5', cat: 'def', sub: '抢断', gm: '5v5', label: '截传 高吊倍率', v: 0.6, min: 0, max: 2, step: 0.05, note: '倍率。高吊 / 空中接力被截的概率 × 这个' },
    { k: 't5_int_play', g: 't5', cat: 'def', sub: '抢断', gm: '5v5', label: '截传 战术传球倍率', v: 0.6, min: 0, max: 2, step: 0.05, note: '倍率。战术设计好的传球被截的概率 × 这个' },
    { k: 't5_int_r0', g: 't5', cat: 'def', sub: '抢断', gm: '5v5', label: '截传范围 基础', v: 0.55, min: 0, max: 2, step: 0.05, note: '米。防守人截传够球范围 = (这个 + 系数 × 抢断) × 预判 / 姿态等倍率' },
    { k: 't5_int_rS', g: 't5', cat: 'def', sub: '抢断', gm: '5v5', label: '截传范围 抢断系数', v: 0.55, min: 0, max: 2, step: 0.05, note: '米。见上' },
    { k: 't5_int_rP', g: 't5', cat: 'def', sub: '抢断', gm: '5v5', label: '截传范围 预判加成', v: 0.4, min: 0, max: 1.5, step: 0.05, note: '倍率。范围 × (1 + 这个 × 传球预判)' },
    { k: 't5_int_rStl', g: 't5', cat: 'def', sub: '抢断', gm: '5v5', label: '截传范围 抢断动作中', v: 1.4, min: 1, max: 3, step: 0.05, note: '倍率。防守人正在做抢断动作时范围 × 这个' },
    { k: 't5_int_c0', g: 't5', cat: 'def', sub: '抢断', gm: '5v5', label: '截下概率 基础', v: 0.45, min: 0, max: 1.5, step: 0.01, note: '截下概率 = (这个 + 系数 × 抢断) × 预判加成 × …' },
    { k: 't5_int_cS', g: 't5', cat: 'def', sub: '抢断', gm: '5v5', label: '截下概率 抢断系数', v: 0.5, min: 0, max: 1.5, step: 0.01, note: '见上' },
    { k: 't5_int_cP', g: 't5', cat: 'def', sub: '抢断', gm: '5v5', label: '截下概率 预判加成', v: 0.6, min: 0, max: 2, step: 0.05, note: '倍率。× (1 + 这个 × 传球预判)' },
    { k: 't5_int_grab', g: 't5', cat: 'def', sub: '抢断', gm: '5v5', label: '截传 抓球距离', v: 1.6, min: 0, max: 3, step: 0.05, note: '米。球飞到截传点时防守人离球在这个距离内才能截下' },
    { k: 't5_int_deflD', g: 't5', cat: 'def', sub: '抢断', gm: '5v5', label: '截传 碰球距离', v: 1.3, min: 0, max: 3, step: 0.05, note: '米。没截下时，这个距离内有机会把球碰飞' },
    { k: 't5_int_defl', g: 't5', cat: 'def', sub: '抢断', gm: '5v5', label: '截传 碰球概率', v: 0.6, min: 0, max: 1, step: 0.05, note: '比例。碰飞概率 = 截下概率 × 这个' },
    { k: 't5_pass_fum0', g: 't5', cat: 'pass', sub: '接球', gm: '5v5', label: '接球 手感漏接', v: 0.08, min: 0, max: 0.5, step: 0.01, note: '概率。手感低于中位数的人接球脱手的基础概率 × 手感差距（快球 / 偏球再放大）' },
    { k: 't5_ck_reachD', g: 't5', cat: 'pass', sub: '接球', gm: '5v5', label: '接球 伸手够球距离', v: 2.6, min: 0, max: 5, step: 0.1, note: '米。传偏 / 慢半步时，这个距离内的接球人伸手够球' },
    { k: 't5_ck_reachP', g: 't5', cat: 'pass', sub: '接球', gm: '5v5', label: '接球 够球成功率', v: 0.85, min: 0, max: 1, step: 0.01, note: '概率。伸手够偏球接住的概率' },
    { k: 't5_ai_dec', g: 't5', cat: 'ai', sub: '进攻决策', gm: '5v5', label: '持球 决策间隔', v: 1, min: 0.2, max: 3, step: 0.05, note: '倍率。电脑持球人每次重新读秒（找传球 / 单打）的间隔 × 这个；越小出球越快' },
    { k: 't5_ai_self', g: 't5', cat: 'ai', sub: '进攻决策', gm: '5v5', label: '持球 自己打的基础倾向', v: 0.15, min: -1, max: 1, step: 0.01, note: '分。「自己打」的价值基础项；越大越少传球' },
    { k: 't5_ai_passTh', g: 't5', cat: 'ai', sub: '进攻决策', gm: '5v5', label: '持球 传球门槛', v: 0.1, min: -1, max: 1, step: 0.01, note: '分。最佳传球价值要超过「自己打」这么多才传' },
    { k: 't5_ai_urgeT', g: 't5', cat: 'ai', sub: '进攻决策', gm: '5v5', label: '持球 拖太久开始想传', v: 1.2, min: 0, max: 6, step: 0.1, note: '秒。持球超过这个时间后传球意愿逐渐上升' },
    { k: 't5_ai_urgeD', g: 't5', cat: 'ai', sub: '进攻决策', gm: '5v5', label: '持球 被包夹想传', v: 0.5, min: 0, max: 2, step: 0.05, note: '分。1.8 米内有 2 名防守人时传球意愿加这么多' },
    { k: 't5_pk_lobD', g: 't5', cat: 'ai', sub: '进攻决策', gm: '5v5', label: '传球方式 高吊距离', v: 3.5, min: 0, max: 8, step: 0.1, note: '米。接球人离筐小于这个且线路有人时改高吊 / 空中接力' },
    { k: 't5_pk_skipD', g: 't5', cat: 'ai', sub: '进攻决策', gm: '5v5', label: '传球方式 过顶长传距离', v: 9, min: 3, max: 20, step: 0.5, note: '米。传球距离超过这个用过顶长传' },
    { k: 't5_pk_bncR', g: 't5', cat: 'ai', sub: '进攻决策', gm: '5v5', label: '传球方式 击地风险门槛', v: 0.25, min: 0, max: 1, step: 0.01, note: '线路风险高于这个（7 米内）改击地传球' },
    { k: 't5_pk_err', g: 't5', cat: 'ai', sub: '进攻决策', gm: '5v5', label: '传球方式 选错概率', v: 0.8, min: 0, max: 2, step: 0.05, note: '倍率。传球意识低于中位数时选错传球方式（退回胸前传球）的概率 = 这个 × 差距' },
    { k: 't5_iso_s', g: 't5', cat: 'ai', sub: '进攻决策', gm: '5v5', label: '单打倾向 明星', v: 0.35, min: 0, max: 2, step: 0.01, note: '分。总评 83 以上的明星「自己打」加分（93 封顶）' },
    { k: 't5_iso_h', g: 't5', cat: 'ai', sub: '进攻决策', gm: '5v5', label: '单打倾向 控球', v: 0.2, min: 0, max: 2, step: 0.01, note: '分。控球 70→95 的「自己打」加分' },
    { k: 't5_iso_b', g: 't5', cat: 'ai', sub: '进攻决策', gm: '5v5', label: '单打倾向 基础', v: 0.07, min: 0, max: 1, step: 0.01, note: '分。所有人「自己打」的基础加分（不在后场）' },
    { k: 't5_iso_c', g: 't5', cat: 'ai', sub: '进攻决策', gm: '5v5', label: '单打 发起概率', v: 0.8, min: 0, max: 2, step: 0.05, note: '倍率。不传球时转入单打的概率系数' },
    { k: 't5_iso_drv', g: 't5', cat: 'ai', sub: '进攻决策', gm: '5v5', label: '单打 攻筐概率', v: 0.45, min: 0, max: 1, step: 0.01, note: '概率。单打读秒到了、去篮下有路时攻筐的概率 = 这个 + 0.5 × 终结能力' },
    { k: 't5_iso_od', g: 't5', cat: 'ai', sub: '进攻决策', gm: '5v5', label: '单打 干拔空间', v: 1.4, min: 0, max: 4, step: 0.05, note: '米。最近防守人超过这个距离才干拔跳投' },
    { k: 't5_veto_c', g: 't5', cat: 'ai', sub: '进攻决策', gm: '5v5', label: '放弃出手 干扰权重', v: 1.2, min: 0, max: 4, step: 0.05, note: '倍率。电脑跳投「出手差」评分 = 干扰 × 这个 + (0.95 − 出手价值) × 价值权重；按投篮意识决定是否放弃' },
    { k: 't5_veto_q', g: 't5', cat: 'ai', sub: '进攻决策', gm: '5v5', label: '放弃出手 价值权重', v: 0.6, min: 0, max: 3, step: 0.05, note: '倍率。见上' },
    { k: 't5_veto_t', g: 't5', cat: 'ai', sub: '进攻决策', gm: '5v5', label: '放弃出手 冷却', v: 0.6, min: 0, max: 3, step: 0.05, note: '秒。放弃一次跳投后这么久内不再投' },
    { k: 't5_veto_t2', g: 't5', cat: 'ai', sub: '进攻决策', gm: '5v5', label: '放弃长两分 冷却', v: 1.3, min: 0, max: 4, step: 0.05, note: '秒。放弃踩线长两分后的冷却' },
    { k: 't5_pick_hold', g: 't5', cat: 't5', sub: '战术', gm: '5v5', label: '挡拆 呼叫持球时间', v: 1.0, min: 0, max: 6, step: 0.1, note: '秒。电脑持球超过这个时间才会叫挡拆' },
    { k: 't5_pick_k', g: 't5', cat: 't5', sub: '战术', gm: '5v5', label: '挡拆 呼叫频率', v: 1, min: 0, max: 4, step: 0.05, note: '倍率。球队风格的挡拆概率 × 这个' },
    { k: 't5_pick_pop', g: 't5', cat: 't5', sub: '战术', gm: '5v5', label: '挡拆 外弹概率', v: 0.6, min: 0, max: 1, step: 0.05, note: '概率。会投三分（> 0.62）的掩护人挡完外弹（不顺下）的概率' },
    { k: 't5_pnr_sr', g: 't5', cat: 'ct', sub: '掩护', gm: '5v5', label: '挡拆 掩护范围', v: 0.95, min: 0, max: 3, step: 0.05, note: '米。持球人的防守人进入掩护人这个距离内算撞上掩护（按力量 / 体重缩放）' },
    { k: 't5_pnr_fix', g: 't5', cat: 't5', sub: '战术', gm: '5v5', label: '挡拆对策 按球队设置', v: 0.75, min: 0, max: 1, step: 0.05, note: '概率。按球队默认挡拆对策应对的概率（其余随机临场变化）' },
    { k: 't5_pnr_sw', g: 't5', cat: 'def', sub: '换防与轮转', gm: '5v5', label: '挡拆对策 换防执行率', v: 0.9, min: 0, max: 1, step: 0.05, note: '概率。对策是「换防」时真的换过去的概率' },
    { k: 't5_pnr_ovSw', g: 't5', cat: 'def', sub: '换防与轮转', gm: '5v5', label: '挡拆对策 挤过时换防', v: 0.4, min: 0, max: 1, step: 0.05, note: '倍率。对策是「挤过」时临时换防的概率系数（再 × 协防意识加成 × 0.35）' },
    { k: 't5_pnr_hdT', g: 't5', cat: 't5', sub: '战术', gm: '5v5', label: '挡拆对策 延误时长', v: 0.75, min: 0, max: 3, step: 0.05, note: '秒。延误（hedge）时掩护人的防守人上提的时间' },
    { k: 't5_pnr_dpT', g: 't5', cat: 't5', sub: '战术', gm: '5v5', label: '挡拆对策 下沉时长', v: 1.6, min: 0, max: 4, step: 0.05, note: '秒。下沉（drop）时掩护人的防守人守在篮下的时间' },
    { k: 't5_pnr_trT', g: 't5', cat: 't5', sub: '战术', gm: '5v5', label: '挡拆对策 夹击时长', v: 1.4, min: 0, max: 4, step: 0.05, note: '秒。夹击（trap）持续时间' },
    { k: 't5_scr_swS', g: 't5', cat: 'def', sub: '换防与轮转', gm: '5v5', label: '无球换防 换防型球队基础', v: 0.8, min: 0, max: 1, step: 0.05, note: '概率。挡拆对策为「换防」的球队，无球掩护时换防的基础概率（+ 0.8 × 协防意识）' },
    { k: 't5_scr_sw0', g: 't5', cat: 'def', sub: '换防与轮转', gm: '5v5', label: '无球换防 其他球队基础', v: 0.45, min: 0, max: 1, step: 0.05, note: '概率。其他球队的基础概率' },
    { k: 't5_cut_int', g: 't5', cat: 't5', sub: '战术', gm: '5v5', label: '空切 间隔', v: 1, min: 0.1, max: 4, step: 0.05, note: '倍率。无球队员两次空切判断的间隔（3~7 秒，按球商 / 风格缩放）× 这个；越小切得越频繁' },
    { k: 't5_cut_pW', g: 't5', cat: 't5', sub: '战术', gm: '5v5', label: '空切 防守人看球时概率', v: 0.55, min: 0, max: 1, step: 0.05, note: '概率。防守人背对 / 看球时空切的概率（再按球商 × 风格缩放）' },
    { k: 't5_cut_p', g: 't5', cat: 't5', sub: '战术', gm: '5v5', label: '空切 防守人放松时概率', v: 0.4, min: 0, max: 1, step: 0.05, note: '概率。防守人离得远（> 1.6 米）时空切的概率' },
    { k: 't5_cut_dur', g: 't5', cat: 't5', sub: '战术', gm: '5v5', label: '空切 持续时间', v: 1.8, min: 0.2, max: 5, step: 0.1, note: '秒。一次空切跑向篮下的时长' },
    { k: 't5_cut_lag', g: 't5', cat: 'ai', sub: '防守反应', gm: '5v5', label: '空切 防守人慢一拍', v: 0.3, min: 0, max: 1.5, step: 0.05, note: '秒。空切人的防守人反应延迟 = 这个 + 1.2 × (空切人球商 − 防守人协防意识)，0~0.9 秒' },
    { k: 't5_lag_k', g: 't5', cat: 'ai', sub: '防守反应', gm: '5v5', label: '空切 慢一拍期间移动', v: 0.3, min: 0, max: 1, step: 0.05, note: '比例。反应延迟期间防守人的移动只有这么多' },
    { k: 't5_spc_d', g: 't5', cat: 't5', sub: '战术', gm: '5v5', label: '落位 队友最小间距', v: 3.5, min: 0, max: 8, step: 0.1, note: '米。无球队员之间保持的间距（跑位智商低的人挤得更近）' },
    { k: 't5_paint_t', g: 't5', cat: 't5', sub: '战术', gm: '5v5', label: '落位 三秒区停留', v: 2.2, min: 0, max: 3, step: 0.1, note: '秒。无球队员在油漆区待满这么久就出来（防 3 秒违例）' },
    { k: 't5_pl_free', g: 't5', cat: 't5', sub: '战术', gm: '5v5', label: '战术 自由进攻权重', v: 1, min: 0, max: 5, step: 0.05, note: '倍率。电脑选战术时「不跑战术」的权重 × 这个；越小越常跑战术' },
    { k: 't5_pl_pist', g: 't5', cat: 't5', sub: '战术', gm: '5v5', label: '战术 Pistol 频率', v: 1, min: 0, max: 5, step: 0.05, note: '倍率。快攻 / 早期进攻的 Pistol 战术概率 × 这个' },
    { k: 't5_pl_zone', g: 't5', cat: 't5', sub: '战术', gm: '5v5', label: '战术 打区域联防用高位策应', v: 0.7, min: 0, max: 1, step: 0.05, note: '概率。对方摆区域联防时跑高位策应战术的概率' },
    { k: 't5_tr_push0', g: 't5', cat: 't5', sub: '战术', gm: '5v5', label: '快攻 推进基础概率', v: 0.15, min: 0, max: 1, step: 0.01, note: '概率。没有人数优势时也推快攻的概率 = 这个 + 节奏系数 × 持球人传球准确（0~1）' },
    { k: 't5_tr_pushP', g: 't5', cat: 't5', sub: '战术', gm: '5v5', label: '快攻 节奏系数', v: 0.45, min: 0, max: 1, step: 0.01, note: '概率。见上' },
    { k: 't5_clk_pick', g: 't5', cat: 't5', sub: '时间管理', gm: '5v5', label: '时间紧迫 叫挡拆概率', v: 0.35, min: 0, max: 1, step: 0.05, note: '概率。时间紧迫收战术时叫挡拆（其余转单打）的概率' },
    { k: 't5_help_d', g: 't5', cat: 'def', sub: '补防', gm: '5v5', label: '补防 触发距离', v: 5.5, min: 0, max: 10, step: 0.1, note: '米。持球人离筐小于这个、原防守人被甩开时才找人补防' },
    { k: 't5_help_r', g: 't5', cat: 'def', sub: '补防', gm: '5v5', label: '补防 最远人选', v: 6, min: 0, max: 15, step: 0.5, note: '米。补防人评分（距离 − 内线加分 − 2 × 协防意识）低于这个才去补' },
    { k: 't5_help_big', g: 't5', cat: 'def', sub: '补防', gm: '5v5', label: '补防 内线优先', v: 1.2, min: 0, max: 5, step: 0.1, note: '米。内线（4、5 号位）参与补防选人时的距离减免' },
    { k: 't5_help_t0', g: 't5', cat: 'def', sub: '补防', gm: '5v5', label: '补防 反应时间', v: 0.25, min: 0, max: 1.5, step: 0.01, note: '秒。补防反应延迟 = 这个 − 协防系数 × 协防意识' },
    { k: 't5_help_tH', g: 't5', cat: 'def', sub: '补防', gm: '5v5', label: '补防 协防意识系数', v: 0.4, min: 0, max: 1.5, step: 0.01, note: '秒。见上' },
    { k: 't5_help_dur', g: 't5', cat: 'def', sub: '补防', gm: '5v5', label: '补防 持续时间', v: 1.6, min: 0, max: 5, step: 0.1, note: '秒。补防人上去盯持球人的时长' },
    { k: 't5_sag_0', g: 't5', cat: 'def', sub: '补防', gm: '5v5', label: '无球防守 基础收缩', v: 0.22, min: 0, max: 1, step: 0.01, note: '比例。无球防守人从对位人往篮下收的比例 = 这个 + 远球系数 × 离球距离/10（再按协防意识 / 防守缩放）' },
    { k: 't5_sag_far', g: 't5', cat: 'def', sub: '补防', gm: '5v5', label: '无球防守 离球越远收越多', v: 0.3, min: 0, max: 1, step: 0.01, note: '比例。见上' },
    { k: 't5_col_k', g: 't5', cat: 'def', sub: '补防', gm: '5v5', label: '突破收缩 力度', v: 0.32, min: 0, max: 1, step: 0.01, note: '比例。持球人突破到篮下时，协防位置的人额外往篮下收的比例' },
    { k: 't5_col_max', g: 't5', cat: 'def', sub: '补防', gm: '5v5', label: '突破收缩 上限', v: 0.75, min: 0, max: 1, step: 0.01, note: '比例。收缩总比例上限' },
    { k: 't5_col_2', g: 't5', cat: 'def', sub: '补防', gm: '5v5', label: '突破收缩 第二人', v: 0.7, min: 0, max: 1, step: 0.05, note: '比例。离持球人第二近的协防人按这个比例收（最近的人 × 1）' },
    { k: 't5_col_3', g: 't5', cat: 'def', sub: '补防', gm: '5v5', label: '突破收缩 其余人', v: 0.35, min: 0, max: 1, step: 0.05, note: '比例。其余协防人' },
    { k: 't5_col_sh', g: 't5', cat: 'def', sub: '补防', gm: '5v5', label: '突破收缩 盯射手', v: 0.75, min: 0, max: 1, step: 0.05, note: '比例。盯的是三分线外好射手（≥ 0.78）时收缩 × 这个' },
    { k: 't5_ball_k', g: 't5', cat: 'def', sub: '补防', gm: '5v5', label: '无球防守 向球偏移', v: 0.2, min: 0, max: 1, step: 0.01, note: '比例。无球防守人往球的方向偏的比例（× 离球距离 / 8）' },
    { k: 't5_co_gap', g: 't5', cat: 'def', sub: '换防与轮转', gm: '5v5', label: '扑防 距离基础', v: 0.95, min: 0.3, max: 2, step: 0.05, note: '米。扑防停在接球人前的距离（射手更近、突破手留一步，0.7–1.3 米）' },
    { k: 't5_co_ch', g: 't5', cat: 'def', sub: '换防与轮转', gm: '5v5', label: '扑防 小碎步速度', v: 0.62, min: 0, max: 1, step: 0.01, note: '比例。扑防最后一段的移动 = 这个 + 0.3 × 防守' },
    { k: 't5_co_v', g: 't5', cat: 'def', sub: '换防与轮转', gm: '5v5', label: '扑防 冲过头速度', v: 4.6, min: 0, max: 9, step: 0.1, note: '米/秒。扑到位时速度超过这个就算冲太猛，可能被一步过' },
    { k: 't5_co_t', g: 't5', cat: 'def', sub: '换防与轮转', gm: '5v5', label: '扑防 冲过头窗口', v: 0.55, min: 0, max: 2, step: 0.05, note: '秒。冲太猛后的易被突破时间' },
    { k: 't5_co_beat', g: 't5', cat: 'def', sub: '换防与轮转', gm: '5v5', label: '扑防 被一步过概率', v: 0.75, min: 0, max: 1, step: 0.01, note: '概率。冲太猛时接球人马上突破，防守人被过的概率（再按防守 / 控球调整，0.25~0.85）' },
    { k: 't5_opp_shK', g: 't5', cat: 'def', sub: '换防与轮转', gm: '5v5', syn: ['l1_contestRange'], label: '出手时就近封堵 范围倍率', v: 1.04, min: 0.5, max: 2, step: 0.01, note: '倍率。持球人出手时，离他 l1_contestRange（干扰生效距离，1V1 / 5V5 共用）× 这个以内的防守人都去封堵' },
    { k: 't5_xm_max', g: 't5', cat: 'def', sub: '换防与轮转', gm: '5v5', label: '转换防守 交叉换人次数', v: 3, min: 0, max: 10, step: 1, mode: 'int', note: '次。每回合转换防守最多交叉换人几次' },
    { k: 't5_xm_g', g: 't5', cat: 'def', sub: '换防与轮转', gm: '5v5', label: '转换防守 换人收益门槛', v: 3.2, min: 0, max: 10, step: 0.1, note: '米。两人交换对位后总路程省超过这个才换' },
    { k: 't5_zone_p', g: 't5', cat: 't5', sub: '战术', gm: '5v5', label: '区域联防 外线弱队概率', v: 0.25, min: 0, max: 1, step: 0.01, note: '概率。外线防守差（< 0.62）的球队每回合用 2-3 联防的概率（下一场生效）' },
    { k: 't5_zone_p0', g: 't5', cat: 't5', sub: '战术', gm: '5v5', label: '区域联防 其他球队概率', v: 0.04, min: 0, max: 1, step: 0.01, note: '概率。其他球队（下一场生效）' },
    { k: 't5_b5_th', g: 't5', cat: 't5', sub: '团队专属', gm: '5v5', label: '5V5 徽章 分档门槛偏移', v: 0, min: -20, max: 20, step: 1, note: '分（2K 能力值）。所有 5V5 徽章的分档门槛 + 这个；正数 = 更难拿到徽章 / 档位更低' },
    { k: 't5_b5k_dimer', g: 't5', cat: 'pass', sub: '传球', gm: '5v5', label: '徽章强度 妙传手', v: 1, min: 0, max: 4, step: 0.05, note: '倍率。这个 5V5 徽章各档效果与无徽章的差距 × 这个（1 = 原表，0 = 等于无徽章）' },
    { k: 't5_b5k_needle', g: 't5', cat: 'pass', sub: '传球', gm: '5v5', label: '徽章强度 穿针引线', v: 1, min: 0, max: 4, step: 0.05, note: '倍率。这个 5V5 徽章各档效果与无徽章的差距 × 这个（1 = 原表，0 = 等于无徽章）' },
    { k: 't5_b5k_bailout', g: 't5', cat: 'pass', sub: '传球', gm: '5v5', label: '徽章强度 救球传球', v: 1, min: 0, max: 4, step: 0.05, note: '倍率。这个 5V5 徽章各档效果与无徽章的差距 × 这个（1 = 原表，0 = 等于无徽章）' },
    { k: 't5_b5k_breaker', g: 't5', cat: 'pass', sub: '传球', gm: '5v5', label: '徽章强度 长传快攻', v: 1, min: 0, max: 4, step: 0.05, note: '倍率。这个 5V5 徽章各档效果与无徽章的差距 × 这个（1 = 原表，0 = 等于无徽章）' },
    { k: 't5_b5k_postpm', g: 't5', cat: 'pass', sub: '传球', gm: '5v5', label: '徽章强度 低位策应', v: 1, min: 0, max: 4, step: 0.05, note: '倍率。这个 5V5 徽章各档效果与无徽章的差距 × 这个（1 = 原表，0 = 等于无徽章）' },
    { k: 't5_b5k_brick', g: 't5', cat: 'ct', sub: '掩护', gm: '5v5', label: '徽章强度 人墙', v: 1, min: 0, max: 4, step: 0.05, note: '倍率。这个 5V5 徽章各档效果与无徽章的差距 × 这个（1 = 原表，0 = 等于无徽章）' },
    { k: 't5_b5k_dodger', g: 't5', cat: 'ct', sub: '掩护', gm: '5v5', label: '徽章强度 绕挡', v: 1, min: 0, max: 4, step: 0.05, note: '倍率。这个 5V5 徽章各档效果与无徽章的差距 × 这个（1 = 原表，0 = 等于无徽章）' },
    { k: 't5_b5k_intercept', g: 't5', cat: 'def', sub: '抢断', gm: '5v5', label: '徽章强度 截传', v: 1, min: 0, max: 4, step: 0.05, note: '倍率。这个 5V5 徽章各档效果与无徽章的差距 × 这个（1 = 原表，0 = 等于无徽章）' },
    { k: 't5_b5k_anchor', g: 't5', cat: 'def', sub: '封盖干扰', gm: '5v5', label: '徽章强度 护框', v: 1, min: 0, max: 4, step: 0.05, note: '倍率。这个 5V5 徽章各档效果与无徽章的差距 × 这个（1 = 原表，0 = 等于无徽章）' },
    { k: 't5_b5k_chaser', g: 't5', cat: 'reb', sub: '篮板', gm: '5v5', label: '徽章强度 篮板追逐', v: 1, min: 0, max: 4, step: 0.05, note: '倍率。这个 5V5 徽章各档效果与无徽章的差距 × 这个（1 = 原表，0 = 等于无徽章）' },
    { k: 't5_b5k_boxout', g: 't5', cat: 'reb', sub: '卡位', gm: '5v5', label: '徽章强度 卡位', v: 1, min: 0, max: 4, step: 0.05, note: '倍率。这个 5V5 徽章各档效果与无徽章的差距 × 这个（1 = 原表，0 = 等于无徽章）' },
    { k: 't5_b5_chMin', g: 't5', cat: 'pass', sub: '传球', gm: '5v5', label: '传球徽章 被断率下限', v: 0.35, min: 0, max: 1, step: 0.05, note: '比例。传球类徽章叠加后，被截概率最低保留原来的这么多（团队专属妙传 / 突分除外）' },
    { k: 't5_b5_bkV0', g: 't5', cat: 'ai', sub: '进攻决策', gm: '5v5', label: '长传快攻 传球意愿基础', v: 0.2, min: 0, max: 2, step: 0.05, note: '分。长传快攻徽章：换攻后长传给前方空位队友的传球价值加分 = 这个 + 每档 × 档位' },
    { k: 't5_b5_bkVt', g: 't5', cat: 'ai', sub: '进攻决策', gm: '5v5', label: '长传快攻 每档意愿', v: 0.1, min: 0, max: 1, step: 0.05, note: '分。见上' },
    { k: 't5_b5_bkW', g: 't5', cat: 'pass', sub: '传球', gm: '5v5', label: '长传快攻 生效窗口', v: 4, min: 0, max: 10, step: 0.5, note: '秒。换攻后这么久内长传快攻徽章生效' },
    { k: 't5_b5_bkD', g: 't5', cat: 'pass', sub: '传球', gm: '5v5', label: '长传快攻 最短距离', v: 9, min: 0, max: 20, step: 0.5, note: '米。传球距离至少这么远才算长传快攻' },
    { k: 't5_sk_cd', g: 't5', cat: 't5', sub: '团队专属', gm: '5v5', label: '团队专属 冷却倍率', v: 1, min: 0, max: 5, step: 0.05, note: '倍率。所有团队专属技能的冷却 × 这个' },
    { k: 't5_sk_hubT', g: 't5', cat: 't5', sub: '团队专属', gm: '5v5', label: '组织核心 持续时间', v: 10, min: 0, max: 30, step: 0.5, note: '秒。组织核心触发后全队传球增益持续时间' },
    { k: 't5_sk_hubCh', g: 't5', cat: 't5', sub: '团队专属', gm: '5v5', label: '组织核心 被断倍率', v: 0.6, min: 0, max: 1, step: 0.05, note: '倍率。组织核心期间传球被截概率 × 这个' },
    { k: 't5_sk_hubP', g: 't5', cat: 't5', sub: '团队专属', gm: '5v5', label: '组织核心 接球出手命中', v: 1.06, min: 1, max: 1.5, step: 0.01, note: '倍率。组织核心期间接球 2 秒内出手命中 × 这个' },
    { k: 't5_sk_hubG', g: 't5', cat: 't5', sub: '团队专属', gm: '5v5', label: '组织核心 接球出手绿区', v: 1.3, min: 1, max: 3, step: 0.05, note: '倍率。同上，绿区 × 这个' },
    { k: 't5_sk_spC', g: 't5', cat: 't5', sub: '团队专属', gm: '5v5', label: '空位创造 干扰倍率', v: 0.35, min: 0, max: 1, step: 0.05, note: '倍率。空位创造突分后接球跳投的干扰 × 这个' },
    { k: 't5_sk_spG', g: 't5', cat: 't5', sub: '团队专属', gm: '5v5', label: '空位创造 绿区倍率', v: 1.5, min: 1, max: 3, step: 0.05, note: '倍率。同上，绿区 × 这个' },
    { k: 't5_sk_spP', g: 't5', cat: 't5', sub: '团队专属', gm: '5v5', label: '空位创造 命中倍率', v: 1.08, min: 1, max: 1.5, step: 0.01, note: '倍率。同上，命中 × 这个' },
    { k: 't5_sk_scrT', g: 't5', cat: 't5', sub: '团队专属', gm: '5v5', label: '掩护大师 挡人时长', v: 3, min: 0, max: 8, step: 0.1, note: '秒。掩护大师触发时被挡的人至少停这么久（40% 再 +1 秒）' },
    { k: 't5_sk_scrC', g: 't5', cat: 't5', sub: '团队专属', gm: '5v5', label: '掩护大师 出手干扰倍率', v: 0.5, min: 0, max: 1, step: 0.05, note: '倍率。掩护大师掩护后队友出手的干扰 × 这个' },
    { k: 't5_sk_scrG', g: 't5', cat: 't5', sub: '团队专属', gm: '5v5', label: '掩护大师 出手绿区倍率', v: 1.5, min: 1, max: 3, step: 0.05, note: '倍率。同上，绿区 × 这个' },
    { k: 't5_sk_dcT', g: 't5', cat: 't5', sub: '团队专属', gm: '5v5', label: '防守指挥 持续时间', v: 8, min: 0, max: 30, step: 0.5, note: '秒。防守指挥触发后全队防守增益持续时间' },
    { k: 't5_sk_dcR', g: 't5', cat: 't5', sub: '团队专属', gm: '5v5', label: '防守指挥 截传范围', v: 1.15, min: 1, max: 2, step: 0.01, note: '倍率。防守指挥期间截传范围 × 这个' },
    { k: 't5_sk_dcS', g: 't5', cat: 't5', sub: '团队专属', gm: '5v5', label: '防守指挥 被挡强度', v: 0.7, min: 0, max: 1, step: 0.05, note: '倍率。防守指挥期间被掩护挡住的强度 × 这个' },
    { k: 't5_sk_dcC', g: 't5', cat: 't5', sub: '团队专属', gm: '5v5', label: '防守指挥 出手干扰', v: 1.15, min: 1, max: 2, step: 0.01, note: '倍率。防守指挥期间对方出手的干扰 × 这个' }
  ];
  // V4.6 和 1V1 共用的参数：直接读 l1_ 键（调参台改 1V1 的值，5V5 一起变），缓存进 TV；没有 TUNE 时用 1V1 默认值
  const L1D = { l1_stLow: 15, l1_contestRange: 2.7, l1_stlCpu0: 0.6, l1_stlCpuD: 0.35, l1_stealMul: 1, l1_gwSkill: 1.7, l1_gwBadge: 1.45, l1_smKy: 0.5 };
  const TV = {}; for (const d of T5REG) TV[d.k] = d.v; Object.assign(TV, L1D);
  let t5Reg = false;
  function t5Tune() {
    const TU = PH.TUNE; if (!TU) return;
    if (!t5Reg) { t5Reg = true; TU.reg(T5REG); if (TU.on) TU.on(t5Pull); }
    t5Pull();
  }
  function t5Pull() { const TU = PH.TUNE; if (TU) for (const d of T5REG) { const v = TU.get(d.k); TV[d.k] = typeof v === 'number' && isFinite(v) ? v : d.v; } if (TU) for (const k in L1D) { const v = TU.get(k); TV[k] = typeof v === 'number' && isFinite(v) ? v : L1D[k]; } if (typeof t5Sync === 'function') t5Sync(); }

  // ---------- 球队 ----------
  function teamList() { return Object.keys(PH.RX.teams).filter((k) => k !== 'LEG'); }
  function pv(a) { return POSV[a.pos] || 3; }
  function lineup(ab) {
    const GM = PH.game, A = GM.ARCH, keys = GM.ROSTER.filter((k) => A[k].team === ab).sort((a, b) => A[b].ovr - A[a].ovr);
    const top = keys.slice(0, Math.min(8, keys.length)), used = [], cur = [];
    let best = null, bs = -1e9;
    (function rec(s, sum) {
      if (s === 5) { if (sum > bs) { bs = sum; best = cur.slice(); } return; }
      for (let i = 0; i < top.length; i++) {
        if (used[i]) continue; used[i] = 1; cur[s] = top[i];
        rec(s + 1, sum + A[top[i]].ovr - 5 * Math.abs(pv(A[top[i]]) - (s + 1)));
        used[i] = 0;
      }
    })(0, 0);
    return { start: best, bench: keys.filter((k) => best.indexOf(k) < 0) };
  }
  function rgb(h) { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  function cdist(a, b) { const x = rgb(a), y = rgb(b); return hyp(x[0] - y[0], x[1] - y[1], x[2] - y[2]); }
  function lum(h) { const c = rgb(h); return 0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2]; }
  const pair = (h) => [PH.shade(h, 0.72), h];
  // V3.9：kit 同时给 game.makePlayer 用的原始颜色（jersey/shorts/shoe/trim/css）
  function kitRaw(ab, away, other) {
    const N = PH.RX.teams[ab], O = PH.RX.teams[other];
    let j = N.jersey, s = N.shorts, tr = N.trim, white = false;
    if (away && (cdist(j, O.jersey) < 120 || cdist(j, O.trim) < 60)) { tr = lum(j) > 180 ? N.trim : j; j = '#eeeae0'; s = '#d6d2c8'; white = true; }
    const ui = white ? (lum(tr) > 60 ? tr : '#e8e4da') : lum(j) > 70 ? j : lum(N.trim) > 70 ? N.trim : '#c8c8d8';
    return { jersey: j, shorts: s, shoe: away ? '#2a2740' : '#f4f0e0', trim: tr, css: ui, ui: ui, name: N.name };
  }
  // V3.9h 5V5 全场数据：pm 正负值、pass 传球、pAst 潜在助攻（传球后接球人 4 秒内出手）、sAst 二次助攻、catch 接球成功、drop 接球失误/被断
  function newSt() { return { pts: 0, reb: 0, oreb: 0, dreb: 0, ast: 0, stl: 0, blk: 0, fgm: 0, fga: 0, tpm: 0, tpa: 0, ftm: 0, fta: 0, tov: 0, pf: 0, pm: 0, pass: 0, pAst: 0, sAst: 0, catch: 0, drop: 0, sec: 0 }; }

  // ======================================================================
  // V3.9 重做：5V5 直接跑 1V1 的同一套动作和判定（PH.game.t5），team5 只负责
  // 球队层：阵容 / 换人 / 节次 / 发球 / 传球 / 无球跑位 / 协防 / 2K 式按键与切人。
  // 逻辑坐标 = 1V1 的"进攻方坐标"：x 横向（±7.5 边线），y 纵向，进攻方总是朝 y=+12.425 的篮筐；
  // 后场 y<0，底线 y=±14。球权转换时整场坐标翻转（世界坐标不变）。
  // 世界坐标（转播镜头用）：X = d·y，Y = −d·x，d = T.dir[进攻方]
  // ======================================================================
  const SPOT = [[0, 5.6], [5.9, 8.4], [-5.9, 8.4], [6.6, 12.9], [-2.0, 11.3]];
  // V3.9b 5V5 专用能力（js/r5.js，2K 能力值）：归一成 u = 偏离联盟中位数的程度（-0.5 ~ +0.5），中位数球员 u=0，行为和调参时一样
  const R5MED = { pac: 69, piq: 70, vis: 54, siq: 70, iq: 60, hlp: 71, ppc: 67, hands: 85 }, R5SPAN = { pac: 40, piq: 40, vis: 40, siq: 40, iq: 40, hlp: 40, ppc: 40, hands: 24 };
  function r5Of(key, adj) {
    const D = PH.R5 || { F: [], P: {} }, row = D.P[key], o = { raw: {} };
    for (const f in R5MED) {
      const i = D.F.indexOf(f); let v = row && i >= 0 ? row[i] : R5MED[f];
      if (adj && adj[f]) v = Math.max(25, Math.min(99, v + adj[f]));
      o.raw[f] = v; o[f] = clamp((v - R5MED[f]) / R5SPAN[f], -0.5, 0.5);
    }
    return o;
  }
  const U = (p, f) => (p && p.r5 ? p.r5[f] : 0);
  const PASS = { chest: { v: 12.5, ap: 0.25, tz: 1.25 }, skip: { v: 14, ap: 1.2, tz: 1.35 }, bounce: { v: 10, ap: 0, tz: 1.0 }, lob: { v: 8.5, ap: 2.2, tz: 2.2 }, alley: { v: 8.5, ap: 1.6, tz: 3.2 } };
  const ICON = ['A', 'B', 'X', 'Y', 'LT'];
  // V3.9e 默认 2K 镜头（远近 5、高度 10，2K 社区常用值）；转播镜头留作可选。两种镜头各记一套远近 / 高度（只存内存）
  const CAM_DEF5 = { broadcast: { zoom: 5, height: 5 }, '2k': { zoom: 5, height: 10 } };
  const CAMS = { preset: '2k', zoom: 5, height: 10, mem: JSON.parse(JSON.stringify(CAM_DEF5)) };
  let A5 = null, G = null;
  const ps = () => G.players;
  const dist = (a, b) => hyp(a.x - b.x, a.y - b.y);
  const TMp = (p) => p.tm;
  const HY = 12.425;
  const dHoop = (p) => hyp(p.x, p.y - HY);
  const three = (x, y) => (y < 11.01 ? hyp(x, y - HY) > 6.75 : Math.abs(x) > 6.6);
  const offs = () => T.tm[G.off].on, defs = () => T.tm[1 - G.off].on;
  const holder = () => (G.ball.state === 'held' ? G.players[G.ball.holder] : null);
  function segD(px, py, ax, ay, bx, by) { const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy || 1e-6, k = clamp(((px - ax) * dx + (py - ay) * dy) / L2, 0, 1); return { d: hyp(px - ax - dx * k, py - ay - dy * k), k: k }; }
  const toW = (x, y) => { const d = T.dir[G.off]; return { X: d * y, Y: -d * x }; };
  const fromW = (X, Y) => { const d = T.dir[G.off]; return { x: -d * Y, y: d * X }; };

  // ---------- 开局 ----------
  function mkTeam(t, ab, other, human) {
    const L = lineup(ab), N = PH.RX.teams[ab], k = kitRaw(ab, t === 1, other);
    const tm = { t: t, ab: ab, name: N.name, city: N.city, col: { ui: k.ui }, kit: k, score: 0, qs: [0, 0, 0, 0], human: human, ros: [], on: [] };
    L.start.concat(L.bench).forEach((key, i) => tm.ros.push({ key: key, a: A5ARCH()[key], slot: i < 5 ? i : -1, starter: i < 5, st: newSt(), stam: 100, p: null }));
    return tm;
  }
  const A5ARCH = () => PH.game.ARCH;
  function mkP(tm, r, slot) {
    const id = tm.t * 5 + slot, p = A5.makePlayer(id, r.key, 'cpu', tm.kit);
    p.tm = tm.t; p.slot = slot; p.rk = r; p.stam = r.stam; p.ring = false; p.mark = null; p.opp = null; p.key = r.key; p.a = r.a;
    p.f5 = { dec: 0, cutNext: rr(2, 6), cut: null, scr: -9, scrD: 0.6, alley: -9, hold: 0, isoT: 0, opS: -9, opn: false };
    p.r5 = r5Of(r.key, T.adj && T.adj[tm.t]);
    { const BT = PH.game.BADGE_TIER; p.csT = BT ? BT.cs(p.r) : 0; }   // V3.9m 接球投篮徽章档位（1 铜 / 2 银 / 3 金 / 4 名人堂），不改共用的 r.badges，1V1 不受影响
    r.slot = slot; r.p = p; tm.on[slot] = p;
    return p;
  }
  function start(o) {
    A5 = PH.game.t5; G = PH.game.G; o = o || {};
    t5Tune();   // V4.0 tune.js 晚于本文件加载时在这里补注册
    // V3.9h 输入缓冲：5V5 人控球员和 1V1 同一套（硬直 / 落地 / 动作锁定时按的 a1/a2/a3 进缓冲，能动第一帧释放）
    if (PH.game.ibuf) { PH.game.ibuf.on5 = true; PH.game.ibuf.clearAll(); }
    const tl = teamList();
    const home = tl.indexOf(o.home) >= 0 ? o.home : 'LAL', away = tl.indexOf(o.away) >= 0 && o.away !== home ? o.away : home === 'BOS' ? 'LAL' : 'BOS';
    const hum = o.human == null ? 0 : o.human;
    for (const k in T) delete T[k];
    Object.assign(T, { on: true, qlen: o.qlen || 300, diff: o.diff == null ? 1 : o.diff, hum: hum, time: 0, q: 1, phase: 'tip', phaseT: 0, dir: [1, -1], gclock: o.qlen || 300, sclock: 24, off: 0,
      possT: 0, holdT: 0, trans: false, transT: -9, floats: [], banner: null, ctl: null, prev: {}, R: null, E: {}, aDown: null, yDown: null, bDown: null, icon: false, qPass: null, c2: null, ps: null, pick: null, dbl: null, help: null,
      adj: o.r5adj || null, lastPass: null, next: null, inb: null, tipW: -1, tipAt: -9, tipWin: -1, winner: -1, over: false, endPend: false, cam: CAMS, keyLog: [], passLog: [], lostPass: null, subEv: [], subQ: [], subPend: null, autoSub: true,
      cnt: { poss: 0, trans: 0, passes: 0, picks: 0, iconP: 0, passQ: 0, iconS: 0, switches: 0, autoSw: 0, subs: 0, viol: 0, oob: 0, tov: 0, steals: 0, intc: 0, dbl: 0, charge: 0, fumble: 0, veto: 0, cutSeen: 0, cutBlind: 0, cutBest: 0, alley: 0, lob: 0, bounce: 0, skip: 0, helps: 0, scrSw: 0 }, catchN: {} });
    T.tm = [mkTeam(0, home, away, hum === 0), mkTeam(1, away, home, hum === 1)];
    const P = [];
    for (const tm of T.tm) for (let s = 0; s < 5; s++) P[tm.t * 5 + s] = mkP(tm, tm.ros[s], s);
    A5.begin(P, { diff: T.diff, hooks: { pickup: hPickup, score: hScore, turnover: hTurnover, oob: hOob, clutch: () => T.q >= 4 && T.gclock < 24 && Math.abs(T.tm[0].score - T.tm[1].score) <= 5 } });
    G.off = 0;
    try { PH.audio.voPreload(P.map((p) => p.key)); } catch (e) { /* 语音可选 */ }
    setupTip();
    if (PH.render5) PH.render5.reset();
  }
  function stop() { if (T.on) { T.on = false; if (A5) A5.end(); } }

  // ---------- 场上状态工具 ----------
  function place(p, x, y, face) { p.x = x; p.y = y; p.z = 0; p.vx = p.vy = p.vz = 0; p.action = null; p.stun = 0; p.hasBall = false; p.post = false; if (face != null) p.face = face; p.ai.om = null; p.ai.dm = null; p.ai.t = 0; }
  function flipAll() {
    const neg = (o, ks) => { for (const k of ks) if (typeof o[k] === 'number') o[k] = -o[k]; };
    for (const p of ps()) {
      neg(p, ['x', 'y', 'vx', 'vy']); p.face += Math.PI;
      if (p.ai) { neg(p.ai, ['hx', 'hy', 'cdx', 'cdy']); p.ai.om = null; p.ai.dm = null; p.ai.t = 0; }
      if (p.action && /shot|layup|dunk|post|fake|dive/.test(p.action.type)) p.action = null;
      if (p.ghosts) for (const g of p.ghosts) { g.x = -g.x; g.y = -g.y; g.face += Math.PI; }
      p.post = false; p.f5.cut = null;
    }
    const b = G.ball; neg(b, ['x', 'y', 'vx', 'vy', 'cx', 'cy']);
    if (b.slam) neg(b.slam, ['x', 'y', 'rimY']);
    for (const q of G.fx.parts) neg(q, ['x', 'y', 'vx', 'vy']);
    for (const r of G.fx.rings) neg(r, ['x', 'y']);
    for (const f of G.floats) neg(f, ['x', 'y']);
    if (T.ps) neg(T.ps, ['x0', 'y0', 'tx', 'ty']);
  }
  function setOff(t) { if (G.off !== t) { G.off = t; flipAll(); } T.off = t; }
  const ptIs5 = (p, id) => !!(PH.game && PH.game.ptIs && PH.game.ptIs(p, id));
  function assignMarks() {
    const O = offs(), D = defs();
    for (let i = 0; i < 5; i++) { D[i].mark = O[i]; O[i].mark = null; }
    // V4.6 防守大闸：自动去防对方总评最高的人（和原本防他的人互换）
    const L = D.find((d) => ptIs5(d, 'lockdown')), star = O.reduce((b, o) => (!b || (o.a && b.a && o.a.ovr > b.a.ovr) ? o : b), null);
    if (L && star && L.mark !== star) { const o2 = D.find((d) => d.mark === star); if (o2) o2.mark = L.mark; L.mark = star; }
  }
  function setCtl(p, why) {
    if (!p || T.hum < 0 || p.tm !== T.hum) return;
    if (T.ctl === p) return;
    if (T.ctl) { T.ctl.ctrl = 'cpu'; T.ctl.ring = false; T.ctl.charge = false; }
    T.ctl = p; p.ctrl = 'p1'; p.ring = true; p.ai.om = null;
    if (why === 'manual') T.cnt.switches++; else if (why === 'icon') T.cnt.iconS++; else if (why === 'auto') T.cnt.autoSw++;
  }
  function nearestTo(list, x, y, ex) { let best = null, bd = 1e9; for (const p of list) { if (p === ex) continue; const d = hyp(p.x - x, p.y - y); if (d < bd) { bd = d; best = p; } } return best; }
  function autoDef() { if (T.hum < 0 || T.hum === G.off) return; const b = G.ball; setCtl(nearestTo(T.tm[T.hum].on, b.x, b.y), 'auto'); }
  function flt(text, p, col) { A5.float(text, p, col || '#ffffff', 1); }
  // 抢断 / 断球飘字：不绑定球员 id，避免同一帧该球员的其他飘字把它顶掉（每次被断都必须看得到）
  function fltS(text, p) { A5.float(text, { x: p.x, y: p.y, z: p.z || 0, h: p.h || 2 }, '#5ee0ff', 1); }

  // ---------- 跳球 / 节次 ----------
  function setupTip() {
    T.phase = 'tip'; T.phaseT = 0; G.phase = 'dead'; T.gclock = T.q <= 4 ? T.qlen : Math.max(60, Math.round(T.qlen * 5 / 12)); G.shotClock = 24; T.sclock = 24;
    G.off = 0; T.off = 0;
    // V3.9f 其余八人围在中圈外（半径 2.35 米，两队交错站位），两名中锋在圈内各站自己半场
    const R0 = 2.35, A0 = [225, 315, 180, 90].map((a) => [Math.cos(a * Math.PI / 180) * R0, Math.sin(a * Math.PI / 180) * R0]);
    const sp = [A0[0], A0[1], A0[2], A0[3], [0, -0.55]];
    for (const tm of T.tm) tm.on.forEach((p, i) => { const s = tm.t === 0 ? 1 : -1; place(p, sp[i][0] * s, sp[i][1] * s, tm.t === 0 ? Math.PI / 2 : -Math.PI / 2); });
    const b = G.ball; b.state = 'ext'; b.holder = -1; b.x = 0; b.y = 0; b.z = 1.9; b.vx = b.vy = b.vz = 0; b.dead = true; b.wasShot = false;
    assignMarks(); T.banner = { t: T.q === 1 ? '比赛开始' : '加时赛', d: 1.6, age: 0 };
    if (T.hum >= 0) setCtl(T.tm[T.hum].on[4], 'auto');
  }
  function setupQuarter() {
    T.gclock = T.q <= 4 ? T.qlen : Math.max(60, Math.round(T.qlen * 5 / 12));
    if (T.q > 4) { setupTip(); return; }
    T.dir = T.q <= 2 ? [1, -1] : [-1, 1];
    const t = T.q === 4 ? T.tipW : 1 - T.tipW;
    G.off = t; T.off = t; assignMarks();
    const ib = T.tm[t].on[1];
    for (const p of ps()) {
      if (p === ib) continue;
      const s = SPOT[p.slot], isOff = p.tm === t;
      if (isOff) place(p, s[0] * 0.8, -12 + s[1] * 0.9, Math.PI / 2); else { const m = p.mark; place(p, m.x * 0.6, m.y + 3, -Math.PI / 2); }
    }
    // V3.9f NBA 规则 6-I：第二、三节由输掉开场跳球的一队、第四节由赢得跳球的一队，在自己后场底线（对手的底线）发球
    place(ib, 1.3, -14.55, Math.PI / 2); beginInbound(ib, 1.3, -14.55);
    T.c2 = null; T.camSnap = true;   // 新一节换了场地方向：镜头直接切到发球机位（不做 180 度翻转）
    T.banner = { t: ['', '第一节', '第二节', '第三节', '第四节'][T.q], d: 1.5, age: 0 };
  }
  function endQuarter() {
    if (!T.bzOn) A5.sfx('buzzer'); T.endPend = false; T.bzOn = false;   // V3.9q 球在空中归零时蜂鸣器已经在 0.0 秒响过，这里不再响第二次
    const s0 = T.tm[0].score, s1 = T.tm[1].score;
    dropBall();
    G.phase = 'dead';
    if (T.q >= 4 && s0 !== s1) {
      T.phase = 'over'; T.phaseT = 0; T.over = true; const w = s0 > s1 ? 0 : 1; T.winner = w;
      try { PH.audio.play(T.hum < 0 ? 'cheer' : w === T.hum ? 'win' : 'lose'); } catch (e) { /* 可选 */ }
      T.banner = { t: '比赛结束', d: 99, age: 0 }; return;
    }
    T.phase = 'qbreak'; T.phaseT = 0;
    T.banner = { t: T.q < 4 ? ['', '第一节结束', '半场结束', '第三节结束'][T.q] : '进入加时', d: 2.2, age: 0 };
    if (T.q >= 4) T.dir = [T.dir[1], T.dir[0]];
  }
  function dropBall() {
    const b = G.ball, h = holder();
    if (h) h.hasBall = false;
    if (b.state === 'held' || b.state === 'pass' || b.state === 'ext') { b.state = 'loose'; b.holder = -1; b.vx = rr(-1, 1); b.vy = rr(-1, 1); b.vz = 1; }
    T.ps = null; b.dead = true;
  }

  // ---------- 死球 / 发球 ----------
  function deadBall(next, kind, bx, by) {
    const w = toW(bx || 0, by || 0);
    T.phase = 'dead'; T.phaseT = 0; G.phase = 'dead'; T.lgUsed = false; T.lgB = null; T.pick = null; T.dbl = null; T.help = null; T.aDown = T.yDown = null;
    if (kind !== 'made') dropBall(); else { const h = holder(); if (h) h.hasBall = false; T.ps = null; G.ball.dead = true; }
    setOff(next); assignMarks(); T.trans = false; defNew(true);
    subs();
    const O = offs();
    let x, y, by2;
    if (kind === 'made') { x = rnd() < 0.5 ? -1.3 : 1.3; y = -14.55; by2 = dist(O[3], { x: x, y: y }) < dist(O[4], { x: x, y: y }) ? O[3] : O[4]; }
    else { const g = fromW(w.X, w.Y); x = (g.x >= 0 ? 1 : -1) * 7.95; y = clamp(g.y, -11, 11); by2 = nearestTo(O.filter((p) => p.slot !== 0), x, y); }
    T.next = { by: by2, x: x, y: y, kind: kind };
    for (const p of ps()) p.f5.tgt = null;
    if (T.hum >= 0) { if (T.hum === next) setCtl(by2, 'auto'); }
  }
  function beginInbound(by, x, y) {
    // V3.9h 不瞬移：发球人是自己走到发球点的，这里只让他站定、转向场内（节初摆位时调用前已经 place 好）
    if (hyp(by.x - x, by.y - y) > 0.4) place(by, x, y, Math.atan2(-y, -x));
    else { by.vx = by.vy = 0; by.action = null; by.hasBall = false; by.face = Math.atan2(-by.y, -by.x); }
    T.phase = 'inb'; T.phaseT = 0; G.phase = 'live'; G.shotClock = 24; T.sclock = 24; T.holdT = 0; T.next = null; T.lastPass = null;
    const b = G.ball; b.state = 'held'; b.holder = by.id; by.hasBall = true; b.dead = false; b.wasShot = false; b.shot = null; b.lastTouch = by.id; b.noPick = 0; b.under = false;
    T.inb = { by: by, t0: T.time, wait: rr(0.5, 0.9) };
    if (T.hum === G.off) setCtl(by, 'auto'); else autoDef();
  }

  // ---------- 换人 ----------
  function foldStats(p) {
    const s = G.stats[p.id], r = p.rk.st; if (!s) return;
    r.reb += s.reb; r.oreb += s.oreb; r.dreb += s.dreb || 0; r.stl += s.stl; r.blk += s.blk; r.fgm += s.fg; r.fga += s.fga; r.tpm += s.tp; r.tpa += s.tpa; r.tov += s.tov;
    G.stats[p.id] = A5.newStats();
  }
  // V3.9h 换人：只在死球时换。T.subEv 事件队列（只 push）；T.subQ 手动换人排队（下一个死球生效）；T.autoSub 控制我方自动换人（电脑一方始终自动）
  // 我方自动换人先发 'pending' 事件，0.8 秒后执行（给 UI 提醒窗口）；电脑一方立即执行
  function swapIn(tm, i, best, reason) {
    const cur = tm.on[i], rc = cur.rk; rc.stam = cur.stam;
    foldStats(cur); rc.slot = -1; rc.p = null;
    const np = mkP(tm, best, i); best.inT = T.time;
    np.x = cur.x; np.y = cur.y; np.face = cur.face; np.mark = cur.mark; np.vx = cur.vx || 0; np.vy = cur.vy || 0;
    G.players[np.id] = np; G.streak[np.id] = 0; G.hz[np.id] = {}; G.scout[np.id] = {};
    for (const p of ps()) if (p.mark === cur) p.mark = np;
    if (T.ctl === cur) { T.ctl = null; setCtl(np, 'auto'); }
    if (T.next && T.next.by === cur) T.next.by = np;
    if (T.inb && T.inb.by === cur) T.inb.by = np;
    T.cnt.subs++;
    T.subEv.push({ t: T.time, tm: tm.t, out: rc.key, in: best.key, reason: reason, ph: 'done' });
  }
  function autoPlan(tm, skip) {
    const plan = [], used = new Set(skip || []);
    for (let i = 0; i < 5; i++) {
      const cur = tm.on[i], rc = cur.rk; rc.stam = cur.stam;
      const sc = Math.max(0.1, T.qlen / 720);
      if (used.has(rc.key) || (rc.manT != null && T.time - rc.manT < TV.t5_sub_man)) continue;
      if (rc.inT != null && T.time - rc.inT < TV.t5_sub_min * sc && (rc.fat || 0) < TV.t5_sub_keep) continue;   // 刚换上的人至少打一段（按节长比例），避免来回换
      const val = (r) => r.a.ovr - TV.t5_sub_pos * Math.abs(pv(r.a) - (i + 1)) - Math.max(0, TV.t5_sub_th - (100 - (r.fat || 0))) * TV.t5_sub_fatW + (r === rc ? TV.t5_sub_cur : 0);   // 按长期疲劳判断（短时喘气不触发换人）
      let best = rc, bv = val(rc);
      for (const r of tm.ros) { if (r.slot >= 0 || used.has(r.key) || (r.fat || 0) > TV.t5_sub_bench) continue; const v = val(r); if (v > bv + TV.t5_sub_gap) { bv = v; best = r; } }   // 板凳上要歇到疲劳 ≤ 12 才回场
      if (best === rc) continue;
      used.add(best.key); used.add(rc.key); plan.push({ i: i, out: rc, in: best });
    }
    return plan;
  }
  // 手动排队的换人：立即执行（调用时已是死球）
  function runQueue() {
    const done = [];
    for (const q of T.subQ.slice()) {
      const tm = T.tm[q.tm], i = tm.on.findIndex((p) => p.rk.key === q.out), inR = tm.ros.find((r) => r.key === q.in);
      T.subQ.splice(T.subQ.indexOf(q), 1);
      if (i < 0 || !inR || inR.slot >= 0) continue;
      inR.manT = T.time; swapIn(tm, i, inR, 'manual'); done.push(q.out, q.in);
    }
    return done;
  }
  function subs(now) {
    const done = runQueue();
    if (T.subPend) { execPend(); }
    for (const tm of T.tm) {
      const mine = tm.t === T.hum;
      if (mine && !T.autoSub) continue;
      const plan = autoPlan(tm, done);
      if (!plan.length) continue;
      if (mine && !now) {
        for (const x of plan) T.subEv.push({ t: T.time, tm: tm.t, out: x.out.key, in: x.in.key, reason: 'fatigue', ph: 'pending' });
        T.subPend = { at: T.time + 0.8, tm: tm.t, plan: plan };
      } else {
        if (mine) for (const x of plan) T.subEv.push({ t: T.time, tm: tm.t, out: x.out.key, in: x.in.key, reason: 'fatigue', ph: 'pending' });
        for (const x of plan) if (x.out.slot === x.i && x.in.slot < 0) swapIn(tm, x.i, x.in, 'fatigue');
      }
    }
  }
  function execPend() {
    const P = T.subPend; T.subPend = null; if (!P) return;
    const tm = T.tm[P.tm];
    for (const x of P.plan) if (x.out.slot === x.i && tm.on[x.i].rk === x.out && x.in.slot < 0) swapIn(tm, x.i, x.in, 'fatigue');
  }
  function sub(t, outKey, inKey) {
    const tm = T.tm && T.tm[t]; if (!tm) return false;
    const o = tm.ros.find((r) => r.key === outKey), n = tm.ros.find((r) => r.key === inKey);
    if (!o || !n || o.slot < 0 || n.slot >= 0) return false;
    if (T.subQ.some((q) => q.tm === t && (q.out === outKey || q.in === inKey))) return false;
    T.subQ.push({ tm: t, out: outKey, in: inKey });
    if (T.phase === 'dead' || T.phase === 'qbreak') runQueue();
    return true;
  }
  function unsub(t, outKey) { const n = T.subQ.length; T.subQ = T.subQ.filter((q) => !(q.tm === t && q.out === outKey)); return T.subQ.length < n; }

  // ---------- 输入工具 ----------
  function goInp(p, tx, ty, spr, o) {
    o = o || A5.zeroInp();
    const dx = tx - p.x, dy = ty - p.y, l = hyp(dx, dy);
    if (l > 0.15) { const k = Math.min(1, l / 0.7); o.mx = dx / l * k; o.my = dy / l * k; }
    o.sprint = !!spr && l > TV.t5_spr_d && p.stam > TV.l1_stLow;   // V3.9r 体力放宽：门槛 ×0.7
    return o;
  }
  // 摇杆 → 逻辑坐标（镜头相对）：转播镜头 屏幕右 = 世界 +X、屏幕上 = 世界 +Y；2K 镜头就是逻辑坐标本身
  function stick(sx, sy) {
    if (CAMS.preset === '2k') {
      // 2K 镜头：屏幕上 = 镜头朝向（进攻篮筐）。攻防转换镜头翻转期间（约 0.5 秒）保持翻转前的朝向映射，避免玩家跑反
      const d = T.dir[G.off], C = T.c2, f = C ? (C.t >= 0 ? C.from : C.phi) : (d === 1 ? 0 : Math.PI);
      const AX = sx * Math.sin(f) + sy * Math.cos(f), AY = -sx * Math.cos(f) + sy * Math.sin(f);
      return { x: -d * AY, y: d * AX };
    }
    const d = T.dir[G.off]; return { x: -d * sy, y: d * sx };
  }

  // ---------- 传球 ----------
  function openOf(m) { let dm = 9; for (const d of (m.tm === G.off ? defs() : offs())) dm = Math.min(dm, dist(d, m)); return clamp((dm - TV.t5_open0) / TV.t5_openW, 0, 1); }
  function shotQ(m) {
    const r = m.r, d = dHoop(m);
    if (m.y < 1) return 0.05;
    if (d < 2.6) return 2 * (0.45 + 0.4 * Math.max(r.lay, r.dunk * 0.95, r.close || 0));
    if (three(m.x, m.y)) return d > 8.6 ? 0.2 : 3 * (0.2 + 0.25 * r.three);
    return 2 * (0.25 + 0.25 * r.mid) * (d < 4.5 ? 1.05 : 1);
  }
  // V3.9d 接球人是否在空切（passVal 和 doPass 共用同一判断）
  function cutNow(m) { const dh = dHoop(m); return !!(m.f5 && m.f5.cut) || (m.speed > 3 && ((m.vx || 0) * (0 - m.x) + (m.vy || 0) * (HY - m.y)) > 0.6 * m.speed * dh); }
  // V3.9d 看球不看人：防守人面朝持球人、空切人在他身后时，传给空切人的球他反应慢（截传范围打折）。
  // 协防 hlp 越高越少犯这个错。返回 0.4~1 的截传范围倍率（1 = 完全不打折）
  function blindF(d, m, p) {
    const fx = Math.cos(d.face || 0), fy = Math.sin(d.face || 0);
    const bx = p.x - d.x, by = p.y - d.y, bl = hyp(bx, by) || 1, cx = m.x - d.x, cy = m.y - d.y, cl = hyp(cx, cy) || 1;
    const watchB = clamp((fx * bx + fy * by) / bl, 0, 1), behind = clamp((0.3 - (fx * cx + fy * cy) / cl) / 1.3, 0, 1);
    return 1 - TV.t5_blind * watchB * behind * clamp(0.5 - U(d, 'hlp'), 0, 1);
  }
  function laneRisk(p, m, kind) {
    // V3.9c 按接球点（接球人跑动方向的提前量，和 doPass 一样）算线路，跟在空切人身后的防守人不算挡线
    // V3.9d 传给空切人时，看球不看人的防守人的挡线风险按 blindF 打折；持球人球商 iq 越高越看得出这个空当（低球商的人照样当成有风险）
    let rk = 0; const tt = hyp(m.x - p.x, m.y - p.y) / 12.5, mx = m.x + (m.vx || 0) * tt * 0.6, my = m.y + (m.vy || 0) * tt * 0.6;
    const cut = cutNow(m), rd = cut ? clamp(0.6 + 1.2 * U(p, 'iq'), 0, 1.2) : 0;
    for (const d of defs()) { const s = segD(d.x, d.y, p.x, p.y, mx, my); if (s.k < 0.08 || s.k > 0.96) continue; const reach = TV.t5_lr_r0 + TV.t5_lr_rS * d.r.stl + (kind === 'lob' || kind === 'skip' ? -TV.t5_lr_lob : 0); if (s.d < reach + 0.5) { const fb = cut ? clamp(1 - (1 - blindF(d, m, p)) * rd, 0.3, 1) : 1; rk = Math.max(rk, fb * (reach + 0.5 - s.d) / (reach + 0.5)); } }
    return rk;
  }
  // V3.9p 客观目标价值（统计用 + 球商高的人决策向它靠拢）：空位 × 出手能力 × 区域价值 × 线路安全；空切的人按到篮下的终结价值
  function rimQ(m) { return 2 * (0.45 + 0.4 * Math.max(m.r.lay, m.r.dunk * 0.95, m.r.close || 0)); }
  function laneRisk0(p, m) {
    let rk = 0; const tt = hyp(m.x - p.x, m.y - p.y) / 12.5, mx = m.x + (m.vx || 0) * tt * 0.6, my = m.y + (m.vy || 0) * tt * 0.6, cut = cutNow(m);
    for (const d of defs()) { const s = segD(d.x, d.y, p.x, p.y, mx, my); if (s.k < 0.08 || s.k > 0.96) continue; const reach = TV.t5_lr_r0 + TV.t5_lr_rS * d.r.stl; if (s.d < reach + 0.5) { const fb = cut ? clamp(blindF(d, m, p), 0.3, 1) : 1; rk = Math.max(rk, fb * (reach + 0.5 - s.d) / (reach + 0.5)); } }
    return rk;
  }
  function oracleV(p, m, w) {   // w：空位权重（默认 0.7，仅用于统计口径）；传球决策里球商越高越看重空位
    let nd = 9; for (const d of defs()) nd = Math.min(nd, dist(d, m));
    const op = clamp((nd - TV.t5_open0) / TV.t5_openW, 0, 1), q = cutNow(m) && dHoop(m) < 7.5 ? Math.max(shotQ(m), rimQ(m)) : shotQ(m);
    const wo = w || 0.7;
    return q * (1 - wo + wo * op) * (1 - 0.6 * laneRisk0(p, m)) - (m.y < 1 ? 0.4 : 0);
  }
  function passVal(p, m) {
    // 传球视野 vis：越高越看重"谁空"；传球意识 piq：越高越会避开有人卡的传球线路
    const dd = dist(p, m), uv = U(p, 'vis'), wv = clamp(0.7 + 0.9 * uv, 0.25, 1);
    const up = U(p, 'piq'), ua = U(p, 'pac'), om = openOf(m), lr = laneRisk(p, m, dd > 9 ? 'skip' : 'chest');
    let v = shotQ(m) * ((1 - wv) + wv * om) - TV.t5_pv_lane * (1 + up) * (1 + 0.8 * uv) * lr - (dd > 14 ? TV.t5_pv_far : 0);   // 视野也决定看不看得清线路上的防守人
    // V3.9c 长传期望值：视野加分 × (1 − 预计被截率)，视野高的人同时更看得清风险（被截率按传球准确 pac 折算）
    if (dd > 7) { const ip = clamp(lr * 0.8 * (1 - 0.6 * ua) + Math.max(0, 0.3 - 0.6 * ua) * 0.15 * (dd / 10), 0, 0.9); v += 0.4 * uv * om * Math.min(1.3, shotQ(m)) * (1 - ip) - 0.8 * Math.max(0, uv) * ip; }   // 加分按接球人的投篮价值算，不把球转给空着但投不进的人
    // V3.9c 空切 / 甩开防守人：加分随持球人视野 + 传球意识变化（看得到、敢传）
    const md = defs().find((q) => q.mark === m), dh = dHoop(m);
    const cutting = cutNow(m);
    const beaten = !md || md.stun > 0.1 || (md.f5 && md.f5.scr > T.time - md.f5.scrD) || (dHoop(md) > dh + 0.8 && dist(md, m) > 1.2) || dist(md, m) > 3.2;
    if (dh < 7.5 && (cutting || beaten)) {
      const rimQ = 2 * (0.45 + 0.4 * Math.max(m.r.lay, m.r.dunk * 0.95, m.r.close || 0));   // 空切的价值按到篮下时的终结能力算
      const k = clamp(1 + 0.9 * (uv + up), 0.3, 1.9);
      if (cutting) v = Math.max(v, v + (rimQ - shotQ(m)) * ((1 - wv) + wv * om) * Math.min(1, k));   // 空切的人按"到篮下"的价值算（看得懂的持球人才算得出来）
      v += ((cutting ? TV.t5_pv_cut : 0) + (beaten ? TV.t5_pv_beat : 0)) * (0.5 + 0.5 * rimQ / 1.6) * k * (1 - lr);
    }
    if (p.y < 1 && m.slot === 0 && p.slot !== 0) v += TV.t5_pv_outlet;
    if (m.y < -1 && p.y > 1) v -= TV.t5_pv_back;
    if (PH.B5) v += PH.B5.passV(p, m, dd);   // V3.9o2 长传快攻 CPU 意愿（js/b5.js）
    return v;
  }
  // 传球视野：看得见的队友（视野角随 vis 变宽；3.5 米内都看得见；转移到弱侧的长传要"看到"才会考虑）
  function sees(p, m) {
    const dx = m.x - p.x, dy = m.y - p.y, dd = hyp(dx, dy) || 1; if (dd < TV.t5_see_near) return true;
    const cs = (dx * Math.cos(p.face) + dy * Math.sin(p.face)) / dd, u = U(p, 'vis');
    if (cs < -TV.t5_see_ang - 1.6 * u) return false;
    if (dd > 9 && rnd() > TV.t5_see_far0 + 0.8 * u) return false;
    return true;
  }
  function canPass(p) {
    if (!p.hasBall || G.ball.state !== 'held' || p.stun > 0.05) return false;
    const a = p.action;
    if (!a || a.type === 'move' || a.type === 'post' || a.type === 'fake') return true;
    if (a.type === 'shot' && !a.rel && !a.released && a.t < 0.4) return true;   // 跳投途中传球（跳传）
    return jpOk(p) > 0;
  }
  // V3.9i 突破传球（2K 跳传 / 上篮收球后传出）：上篮、扣篮起步到离手前都能取消出手改为传球；离出手点太近就来不及（继续原来的出手）
  // 返回 0 = 不能，1 = 正常窗口，2 = 偏晚（准度下降）
  function jpOk(p) {
    const a = p.action; if (!a || !p.hasBall) return 0;
    if (a.type === 'layup' && !a.released) return a.inSteps ? 1 : a.t < (a.ideal || 0.34) - 0.1 ? 1 : a.t < (a.ideal || 0.34) - 0.03 ? 2 : 0;
    if (a.type === 'dunk' && !a.done) return a.inSteps ? 1 : a.t < (a.T || 0.52) * 0.45 ? 1 : a.t < (a.T || 0.52) * 0.6 ? 2 : 0;
    if (a.type === 'shot' && !a.released) return a.t < 0.3 ? 1 : a.t < 0.4 ? 2 : 0;
    return 0;
  }
  function jumpPass(p, kind, m) {
    const w = jpOk(p); if (!w) return false;
    p.jpNow = w; const ok = doPass(p, m, kind); p.jpNow = 0;
    if (ok) { T.cnt.jp = (T.cnt.jp || 0) + 1; p.vx *= 0.5; p.vy *= 0.5; }
    return ok;
  }
  // V3.9h：传球目标只看摇杆方向和空位，与传球类型无关——场上高亮（T.passTgt）和 A/B/Y 传出的人用同一个函数，保证一致
  function pickTarget(p, L) {
    const mates = T.tm[p.tm].on.filter((m) => m !== p);
    const lm = hyp(L.x, L.y);
    const fx = lm > 0.3 ? L.x / lm : Math.cos(p.face), fy = lm > 0.3 ? L.y / lm : Math.sin(p.face);
    let best = null, bs = -1e9;
    for (const m of mates) {
      const dx = m.x - p.x, dy = m.y - p.y, dd = hyp(dx, dy) || 1, cs = (dx * fx + dy * fy) / dd;
      let s = cs * (lm > 0.3 ? 2.2 : 0.8) + openOf(m) * 0.5 * (1 + 1.2 * U(p, 'vis')) - dd * 0.02;   // 视野高的人自动选人更会找空位
      if (s > bs) { bs = s; best = m; }
    }
    return best;
  }
  function gatherPoint(points) {
    for (let i = 0; i < points.length; i++) for (let j = i + 1; j < points.length; j++) {
      const c = points[i].map((v, k) => (v + points[j][k]) / 2), radius = Math.hypot(...points[i].map((v, k) => v - c[k]));
      if (points.every(p => Math.hypot(...p.map((v, k) => v - c[k])) <= radius + 1e-9)) return c;
    }
    const a = points[0], u = points[1].map((v, i) => v - a[i]), v = points[2].map((v, i) => v - a[i]);
    const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    const n = cross(u, v), un = Math.hypot(...u) ** 2, vn = Math.hypot(...v) ** 2, nn = Math.hypot(...n) ** 2;
    const x = cross(v, n), y = cross(n, u);
    return a.map((v, i) => v + (un * x[i] + vn * y[i]) / (2 * nn));
  }
  function releasePass(P) {
    const p = P.from, m = P.to, kind = P.kind, ua = P.ua, kf = P.kf, tx = P.tx, ty = P.ty, d0 = hyp(tx - P.x0, ty - P.y0);
    // 预判拦截：路线上最先碰到球的防守人
    // V3.9h 2K 手感：开阔线路的短传几乎不丢；被断主要来自线路上有人且抢断/传球预判高、传得远、盲传（背身/侧身传）、传球属性低
    // 击地传球球在膝盖高度、线路低，防守人够得到的范围和截下概率都打折（同条件被断率不高于普通传球的 1.3 倍）
    let first = null, lane = 9; const cutP = cutNow(m);
    const blind = P.blind;
    const chK = (P.pointC ? 0.85 : 1) * TV.t5_int_chK * TV.l1_stealMul * (0.7 + TV.t5_int_long * Math.min(d0, 14)) * (blind ? TV.t5_int_blind : 1) * (kind === 'bounce' ? TV.t5_int_bnc : kind === 'lob' || kind === 'alley' ? TV.t5_int_lob : 1) * (P.playPass ? TV.t5_int_play : 1);  // C2 战术设计好的传球路线更安全
    for (const d of defs()) {
      const s = segD(d.x, d.y, P.x0, P.y0, tx, ty); if (s.k < 0.12 || s.k > 0.97) continue;
      lane = Math.min(lane, s.d);
      const hz = kind === 'bounce' ? 0.8 : kind === 'lob' || kind === 'alley' ? lerp(1, 4, 4 * s.k * (1 - s.k)) : kind === 'skip' ? 1.3 + 1.2 * 4 * s.k * (1 - s.k) : 1.3;
      // 传球预判 ppc：截传范围 ±20%、成功率 ±30%；传球人 pac 高 → 被截率最多 -30%
      const reach = (TV.t5_int_r0 + TV.t5_int_rS * d.r.stl) * (1 + TV.t5_int_rP * U(d, 'ppc')) * (d.action && d.action.type === 'steal' ? TV.t5_int_rStl : 1) * (d.stance ? 1.1 : 1) * (hz > d.h + 0.6 ? 0.15 : 1) * (cutP ? blindF(d, m, p) : 1) * (kind === 'bounce' ? 0.75 : 1) * (PH.B5 ? PH.B5.reachK(d, p) : 1) * Math.max(0.05, 1 - TV.t5_pass_rch * ua) * (kf ? 1.2 : 1);   // V4.2 能力低的球慢，更容易被够到   // V3.9d 看球不看人的防守人，截空切传球的范围打折
      if (s.d < reach && (!first || s.k < first.u)) first = { d: d, u: s.k, ch: clamp((reach - s.d) / reach * (TV.t5_int_c0 + TV.t5_int_cS * d.r.stl) * (1 + TV.t5_int_cP * U(d, 'ppc')) * Math.max(0.05, 1 - TV.t5_pass_int * ua) * (1 + TV.t5_pass_intL * 2 * Math.max(0, -ua) * clamp((d0 - 6) / 8, 0, 1)) * (d.ctrl === 'cpu' ? TV.l1_stlCpu0 + TV.l1_stlCpuD * T.diff : 1) * chK, 0, Math.min(0.95, 0.6 * Math.max(1, (1 + 0.5 * TV.t5_pass_int) / 1.6, 1 + TV.t5_pass_intL - 0.8))) };   // V4.4 截下概率上限 0.6 跟着 t5_pass_int / intL 放大
    }
    P.int = first; if (PH.B5) PH.B5.pass(p, m, kind, P, P.T, first);
    if (P.rec) { P.rec.ch = P.int ? +P.int.ch.toFixed(3) : 0; P.rec.blind = blind; P.rec.lane = +lane.toFixed(2); }
    return P.int;
  }
  function doPass(p, m, kind) {
    if (!m || !canPass(p)) return false;
    const cancelShot = p.action && (p.action.type === 'shot' || p.action.type === 'layup' || p.action.type === 'dunk');
    if (p.action) p.action = null;
    const b = G.ball, K = PASS[kind] || PASS.chest, ua = U(p, 'pac');
    // V4.2 传球能力差异化：高难度传球（击地 / 过顶长传 / 高吊 / 空中接力 / 背后 No-look / 跳传）按传球准确 pac + 控球 hnd 判失手
    const d00 = dist(p, m), uh = clamp(((p.r.hnd || 0.75) - 0.75) / 0.4, -0.5, 0.5), bl0 = d00 > 0.5 && ((m.x - p.x) * Math.cos(p.face) + (m.y - p.y) * Math.sin(p.face)) / d00 < -0.2;
    const kd = (kind === 'bounce' ? TV.t5_pass_kdB : kind === 'skip' ? TV.t5_pass_kdS : kind === 'lob' ? TV.t5_pass_kdL : kind === 'alley' ? TV.t5_pass_kdA : 0) + (bl0 ? TV.t5_pass_kdN : 0) + (p.jpNow ? TV.t5_pass_kdJ : 0);
    const kf = !T.plPassing && T.phase !== 'inb' && kd > 0 && rnd() < TV.t5_pass_kf * kd * clamp(TV.t5_pass_kfS - ua - 0.5 * uh, 0, 1);
    if (kf) T.cnt.ps_kf = (T.cnt.ps_kf || 0) + 1;
    const skill = clamp(ua + 0.5, 0, 1), windup = T.phase === 'inb' || p.jpNow || cancelShot ? 0 : lerp(TV.t5_pass_wSlow, TV.t5_pass_wFast, skill);
    const d0 = dist(p, m), Tt = Math.max(0.22, d0 / (K.v * (1 + TV.t5_pass_spd * ua + 0.06 * (U(p, 'vis') + U(p, 'iq'))) * (p.jpNow ? TV.t5_pass_jpV : 1) * (kf ? 0.85 : 1))) * (kind === 'lob' || kind === 'alley' ? TV.t5_pass_lobT : 1);   // V3.9q 跳传更慢；球商高的人出球更快
    const lead = lerp(TV.t5_pass_leadLow + rr(-TV.t5_pass_leadRnd, TV.t5_pass_leadRnd), 1, skill);
    let tx = m.x + (m.vx || 0) * (Tt + windup) * lead, ty = m.y + (m.vy || 0) * (Tt + windup) * lead;
    // V4.2 落点误差：传球准确越低越偏（失手的高难度传球再偏 0.9~1.8 米）；接球人在跑动时多半偏到身后，偏得多的有时偏到脚下
    const er = TV.t5_pass_er * Math.max(0, TV.t5_pass_er0 - ua) * (0.5 + d0 / 14) * (kind === 'skip' || kind === 'lob' || kind === 'alley' ? 1.4 : 1) * Math.sqrt(rnd()) + (kf ? rr(0.9, 1.8) : 0);
    let ea = rnd() * 6.2832; if ((m.speed || 0) > 1.2 && rnd() < TV.t5_pass_bh) ea = Math.atan2(-(m.vy || 0), -(m.vx || 0)) + rr(-0.7, 0.7);
    if (p.jpNow) {
      // 跳传准度：传球准确 pac、视野 vis；离防守人越近、出手越晚越偏
      let dn = 9; for (const d of defs()) dn = Math.min(dn, dist(d, p));
      const je = (TV.t5_jp_er0 + 0.45 * Math.max(0, 0.2 - ua) + (dn < 1.2 ? TV.t5_jp_crowd : dn < 2 ? 0.15 : 0) + (p.jpNow === 2 ? TV.t5_jp_late : 0)) * (1 - 0.6 * U(p, 'vis')) * Math.sqrt(rnd()), ja = rnd() * 6.2832;
      tx += Math.cos(ja) * je; ty += Math.sin(ja) * je;
    }
    tx += Math.cos(ea) * er; ty += Math.sin(ea) * er;
    if (kind === 'alley' || kind === 'lob') { const hl = dHoop(m); if (hl < 5.5) { tx = lerp(tx, 0, 0.35); ty = lerp(ty, HY - 0.6, 0.35); } }
    tx = clamp(tx, -7.4, 7.4); ty = clamp(ty, -13.8, 13.8);
    b.state = 'pass'; b.holder = -1; p.hasBall = false; b.lastTouch = p.id; b.wasShot = false; b.shot = null; b.trail = null;
    const leadEr = Math.min(TV.t5_pass_leadCap, hyp(m.vx || 0, m.vy || 0) * (Tt + windup) * Math.abs(1 - lead));
    T.ps = { from: p, to: m, kind: kind, x0: b.x, y0: b.y, z0: Math.max(0.6, b.z), tx: tx, ty: ty, t: -windup, windup: windup, lead: lead, T: Tt, int: null, bnc: false, inb: T.phase === 'inb', er: er, leadEr: leadEr, v: d0 / Tt, ua: ua, kf: kf,
      ap: kind === 'chest' || kind === 'skip' ? K.ap * Math.max(0.05, 1 - TV.t5_pass_arc * ua) : K.ap, feet: er > 0.3 && kind !== 'lob' && kind !== 'alley' && rnd() < TV.t5_pass_feet };   // V4.2 能力高的球更直、能力低的更飘
    if (windup > 0 && p.pose) {
      T.ps.pose0 = Object.assign({}, p.pose); T.ps.face0 = p.face;
      const H = PH.rig(p), axis = H.handR.map((v, i) => v - H.handL[i]), span = Math.hypot(...axis) || 1;
      T.ps.handAxis = axis.map(v => v / span * 0.108);
      const points = [[b.x, b.y, b.z], H.handL.map((v, i) => v + T.ps.handAxis[i]), H.handR.map((v, i) => v - T.ps.handAxis[i])];
      T.ps.gather = gatherPoint(points);
      const radius = Math.max(...points.map(q => Math.hypot(...q.map((v, i) => v - T.ps.gather[i]))));
      T.ps.gatherSpeed = Math.max(7.2, radius / windup);
      p.pose.passHands = { L: H.handL.slice(), R: H.handR.slice(), follow: 0.14 };
    }
    T.ps.playPass = !!T.plPassing;
    const blind = ((m.x - p.x) * Math.cos(p.face) + (m.y - p.y) * Math.sin(p.face)) / (d0 || 1) < -0.2;
    T.ps.blind = blind;
    T.ps.pointC = ptIs5(p, 'pointC') && dHoop(p) > 3.5 && dHoop(p) < 7.5;
    if (PH.B5 && PH.B5.passState) T.ps.badgeState = PH.B5.passState(p, m, kind);
    const first = windup > 0 ? null : releasePass(T.ps);
    // V3.9h 传球记录（统计被断率用）：类型、距离、线路上最近防守人距离、是否图标传球、结果
    { let lane = 9; for (const d of defs()) { const q = segD(d.x, d.y, T.ps.x0, T.ps.y0, tx, ty); if (q.k >= 0.12 && q.k <= 0.97) lane = Math.min(lane, q.d); }
      const rec = { t: T.time, tm: p.tm, kind: kind, d: +d0.toFixed(2), lane: +lane.toFixed(2), hum: p.ctrl === 'p1', icon: !!T.iconNow, inb: T.phase === 'inb', ch: first ? +first.ch.toFixed(3) : 0, blind: blind, kick: dHoop(p) < 5 || inPaint(p.x, p.y), jp: !!p.jpNow, res: 'fly', er: +er.toFixed(2), kf: kf ? 1 : 0 };
      // V3.9p 传球选择评估（只统计，不用随机数、不改行为）：所有队友的"客观"目标价值 = 空位 × 出手能力 × 区域价值 × 线路安全，看这次传的是不是最优
      if (T.phase !== 'inb') { const R = p.r5 && p.r5.raw; rec.iq = R ? R.iq : 0; rec.vis = R ? R.vis : 0; rec.pac = R ? R.pac : 0; rec.pl = !!T.plPassing;
        let mx = -9, mv = -9, n = 0; for (const q of T.tm[p.tm].on) { if (q === p) continue; const v = oracleV(p, q); if (q === m) mv = v; if (v > mx) mx = v; n++; }
        let nd = 9; for (const d of defs()) nd = Math.min(nd, dist(d, m)); rec.ov = +mv.toFixed(3); rec.om = +mx.toFixed(3); rec.nd = +nd.toFixed(2); rec.nm = n; }
      T.ps.rec = rec; if (T.passLog.length < 4000) T.passLog.push(rec); }
    if (p.f5.isoT > T.time) { T.cnt.isoP = (T.cnt.isoP || 0) + 1; p.f5.isoT = 0; }
    p.passT = G.time; p.f5.hold = 0; T.cnt.passes++; if (p.rk) p.rk.st.pass++; if (T.cnt[kind] != null) T.cnt[kind]++;
    T.pick = T.pick && T.pick.h === p ? null : T.pick; T.dbl = null; T.help = null;
    if (T.hum === p.tm && T.phase !== 'inb') setCtl(m, 'auto');   // 2K：传球后立刻切到接球人
    A5.sfx('squeak');
    return true;
  }
  function passUpdate(dt) {
    if (dt <= 0) return;
    const b = G.ball, P = T.ps;
    for (const p of ps()) {
      const Q = p.pose && p.pose.passHands;
      if (!Q || (b.state === 'pass' && P && P.from === p && P.t < 0)) continue;
      const k = PH.rig(p, p.pose, false); let done = Q.follow <= dt;
      for (const side of ['L', 'R']) {
        const delta = k['hand' + side].map((v, i) => v - Q[side][i]), d = Math.hypot(...delta);
        const move = Math.min(1, dt / Math.max(dt, Q.follow), 7.2 * dt / (d || 1));
        Q[side] = Q[side].map((v, i) => v + delta[i] * move);
        if (move < 1) done = false;
      }
      Q.follow = Math.max(0, Q.follow - dt);
      if (done) delete p.pose.passHands;
    }
    if (T.phase === 'inb' && b.state === 'loose') { T.phase = 'live'; G.shotClock = 24; }   // 发球没接住 / 被碰掉：直接转入活球抢球
    if (b.state !== 'pass' || !P) return;
    const prevT = P.t;
    P.t += dt; const r = P.to, K = PASS[P.kind] || PASS.chest;
    if (prevT < 0) {
      if (P.t > -1e-9) P.t = 0;
      const p = P.from, w = clamp(1 + P.t / P.windup, 0, 1);
      const face = Math.atan2(P.ty - p.y, P.tx - p.x), turn = Math.atan2(Math.sin(face - P.face0), Math.cos(face - P.face0));
      p.face = P.face0 + turn * w;
      if (p.pose) {
        const lift = clamp((b.z - p.z - p.h * 0.4) / (p.h * 0.35), 0, 1);
        const pose = { aLp: 0.2 + 1.1 * lift, aRp: 0.2 + 1.1 * lift, aLe: 0.6, aRe: 0.6, aLq: 0.18, aRq: 0.18, yaw: 0, lean: 0.08, tilt: 0 }, blend = w * w * (3 - 2 * w);
        for (const k in pose) p.pose[k] = lerp((P.pose0 && P.pose0[k]) || 0, pose[k], blend);
      }
      const H = P.gather || handPt(p, b, false), rem = -prevT, step = Math.min(dt, rem), cap = (P.gatherSpeed || 7.2) * step;
      const dx = H[0] - b.x, dy = H[1] - b.y, dz = H[2] - b.z, d = Math.hypot(dx, dy, dz), move = Math.min(step / rem, cap / (d || 1));
      b.x += dx * move; b.y += dy * move; b.z += dz * move;
      if (p.pose) {
        const Q = p.pose.passHands, axis = P.handAxis;
        for (const side of ['L', 'R']) {
          const target = H.map((v, i) => v + (side === 'L' ? -axis[i] : axis[i])), delta = target.map((v, i) => v - Q[side][i]);
          const move = Math.min(step / rem, cap / (Math.hypot(...delta) || 1));
          Q[side] = Q[side].map((v, i) => v + delta[i] * move);
        }
        Q.follow = 0.14;
      }
      P.x0 = b.x; P.y0 = b.y; P.z0 = b.z; b.vx = b.vy = b.vz = 0;
      P.t = Math.min(P.t, 0);
      if (P.t === 0) releasePass(P);
      return;
    }
    if (r && dt > 0) { if (P.rpx != null) P.rsp = lerp(P.rsp || 0, hyp(r.x - P.rpx, r.y - P.rpy) / dt, 0.35); P.rpx = r.x; P.rpy = r.y; }   // V3.9j 接球人移动速度（判“移动中接球”）
    // 球追着接球人走一点（不是瞬移）
    // 球追着接球人走一点（不是瞬移）——P.tx / P.ty 是接球人要去的落点（身体）
    if (r && P.t < P.T * 0.85 && !P.lin) { const rem = Math.max(0, P.T - P.t) * (P.lead == null ? 0.6 : P.lead), dx = r.x + (r.vx || 0) * rem - P.tx, dy = r.y + (r.vy || 0) * rem - P.ty, l = hyp(dx, dy), mv = Math.min(l, (P.kind === 'bounce' ? 4 : 2.5) * dt); if (l > 0.01) { P.tx += dx / l * mv; P.ty += dy / l * mv; } }
    // V3.9m 球的终点 P.ex / ey / ez 对准接球人的手（双手中点），一直跟到最后；后 35% 跟得更快，保证到达那一刻球就在手上
    if (P.ex == null) { P.ex = P.tx; P.ey = P.ty; P.ez = K.tz; }
    if (r && !P.lin) {
      const H = handPt(r, b), u0 = P.t / P.T, cap = (u0 < 0.65 ? 3 : 9) * dt * clamp(1 - (P.er || 0) / TV.t5_pass_trk, 0.12 * Math.min(1, TV.t5_pass_trk / 0.8), 1);   // V4.2 偏球修正不回来：真的偏到身后 / 脚下
      const dx = H[0] - P.ex, dy = H[1] - P.ey, l = hyp(dx, dy), mv = Math.min(l, cap); if (l > 0.01) { P.ex += dx / l * mv; P.ey += dy / l * mv; }
      if (u0 > 0.4) P.ez += clamp((P.feet ? Math.max(0.35, H[2] - 0.75) : H[2]) - P.ez, -4 * dt, 4 * dt);
    }
    const u = clamp(P.t / P.T, 0, 1), px = b.x, py = b.y;
    b.x = lerp(P.x0, P.ex, u); b.y = lerp(P.y0, P.ey, u);
    if (P.lin) { b.z = lerp(P.z0, P.ez, u); if (r && u < 1) { const H = handPt(r, b); P.ex = H[0]; P.ey = H[1]; P.ez = H[2]; } }
    else if (P.kind === 'bounce') { if (u < 0.55) b.z = lerp(P.z0, 0.13, u / 0.55); else { if (!P.bnc) { P.bnc = true; A5.sfx('bounce'); } b.z = lerp(0.13, P.ez, (u - 0.55) / 0.45) + 0.3 * Math.sin(Math.PI * (u - 0.55) / 0.45); } }
    else b.z = lerp(P.z0, P.ez, u) + (P.ap != null ? P.ap : K.ap) * 4 * u * (1 - u);
    b.vx = (b.x - px) / dt; b.vy = (b.y - py) / dt; b.spin += dt * 10;
    const I = P.int;
    if (I && !I.done && u >= I.u) {
      I.done = true; const d = I.d;
      if (d.stun <= 0 && dist(d, b) < TV.t5_int_grab && rnd() < I.ch) {
        G.stats[P.from.id].tov++; if (r && r.rk) r.rk.st.drop++; T.cnt.intc++; T.cnt.tov++; T.cnt.steals++;
        T.ps = null; b.state = 'loose'; b.vz = 0; b.vx = b.vy = 0; b.x = d.x; b.y = d.y; b.z = 1;
        G.stats[d.id].stl++; fltS('抢断', d); A5.sfx('steal'); A5.vo(d, 'steal');
        if (P.rec) P.rec.res = 'int';
        A5.pickup(d); return;
      }
      if (d.stun <= 0 && dist(d, b) < TV.t5_int_deflD && rnd() < I.ch * TV.t5_int_defl) {   // 碰到球：挡出
        T.ps = null; b.state = 'loose'; b.vx = -b.vx * 0.3 + rr(-2, 2); b.vy = -b.vy * 0.3 + rr(-2, 2); b.vz = 1.5; b.lastTouch = d.id; b.noPick = 0.15;
        A5.sfx('steal'); fltS('断球', d); if (P.rec) P.rec.res = 'defl';
        T.lostPass = { t: T.time, from: P.from, to: P.to, by: d, rec: P.rec, shown: true }; return;
      }
    }
    if (u >= 1 && r && !r.hasBall && r.stun <= 0.3 && G.players[r.id] === r && (P.ext || 0) < 2) {
      // V3.9m 到达时球离手还有距离：不瞬间吸过去，按球速再飞一小段到手上（离得远就是伸手够球）
      const H = handPt(r, b), d = Math.hypot(H[0] - b.x, H[1] - b.y, H[2] - b.z);
      if (d > 0.12 && hyp(r.x - b.x, r.y - b.y) < TV.t5_ck_reachD) {
        P.ext = (P.ext || 0) + 1; P.lin = true; P.x0 = b.x; P.y0 = b.y; P.z0 = b.z; P.ex = H[0]; P.ey = H[1]; P.ez = H[2];
        P.t = 0; P.T = clamp(d / Math.max(P.v || 8, 6), 1 / 60, 0.22); if (d > 0.75) r.reachC = T.time;
        if (P.int) P.int.done = true; T.cnt.cext = (T.cnt.cext || 0) + 1; return;
      }
    }
    if (u >= 1) {
      T.ps = null;
      // 手感 hands：低于中位数的人接快球 / 偏球会脱手（最多约 8%~13%）
      const fum = P.inb ? 0 : Math.max(0, -U(r, 'hands')) * TV.t5_pass_fum0 * (P.rec && P.rec.lane > 1.5 ? 0.5 : 1) * (P.v > 11 ? 1.3 : 1) * (P.er > 0.4 ? 1.3 : 1) + (P.inb ? 0 : TV.t5_pass_fum * clamp((P.er || 0) - 0.35, 0, 1.5) * clamp(0.6 - U(r, 'hands'), 0, 1.1));   // V4.2 偏球漏接
      if (r && dist(r, b) < 1.9 && r.stun <= 0.3 && !r.hasBall && G.players[r.id] === r && rnd() < fum) { T.cnt.fumble++; if (r.rk) r.rk.st.drop++; if (P.rec) P.rec.res = 'fum'; T.lostPass = { t: T.time, from: P.from, to: r, by: null, rec: P.rec }; b.state = 'loose'; b.vz = 1.2; b.vx = rr(-1.5, 1.5); b.vy = rr(-1.5, 1.5); b.lastTouch = r.id; b.noPick = 0.2; A5.sfx('bounce'); }
      else if (r && dist(r, b) < 1.9 && r.stun <= 0.3 && !r.hasBall && G.players[r.id] === r) { if (P.rec) P.rec.res = 'ok'; catchBall(r, P); }
      // 传偏 / 接球人慢半步：2.6 米内没被撞倒的接球人伸手够球（以前直接变活球，被对方捡走就是莫名其妙的失误）
      else if (r && dist(r, b) < TV.t5_ck_reachD && r.stun <= 0.3 && !r.hasBall && G.players[r.id] === r && rnd() < TV.t5_ck_reachP) { if (P.rec) P.rec.res = 'ok'; r.reachC = T.time; catchBall(r, P); }
      else { b.state = 'loose'; b.vz = 0.5; b.vx *= 0.35; b.vy *= 0.35; if (P.rec) P.rec.res = 'miss'; T.lostPass = { t: T.time, from: P.from, to: r, by: null, rec: P.rec }; }
    }
  }
  // 接球动作：dur 秒；pose 为像素小人的关节目标（和 game.js 的 pose 字段同名），w 曲线前 70% 保持、后 30% 淡出；
  // rdy = 接球后马上能出手（投篮准备度），不 ready 的接球接球即投不加成、电脑多读 0.2 秒
  const CATCH = {
    stand: { dur: 0.28, rdy: true, pose: { lean: 0.1, lA: 0.22, lB: 0.45, rA: 0.22, rB: 0.45, aLp: 1.25, aLq: 0.3, aLe: 0.35, aRp: 1.25, aRq: 0.3, aRe: 0.35 } },
    move: { dur: 0.24, rdy: true, legs: false, pose: { lean: 0.2, aLp: 1.15, aLq: 0.28, aLe: 0.3, aRp: 1.15, aRq: 0.28, aRe: 0.3 } },
    cs: { dur: 0.2, rdy: true, hop: 0.22, pose: { lean: 0.06, lA: 0.42, lB: 0.95, rA: 0.42, rB: 0.95, lS: 0.12, rS: 0.12, aLp: 1.45, aLq: 0.18, aLe: 1.35, aRp: 1.55, aRq: 0.12, aRe: 1.45 } },
    low: { dur: 0.3, rdy: false, pose: { lean: 0.48, lA: 0.38, lB: 0.85, rA: 0.38, rB: 0.85, aLp: 0.6, aLq: 0.2, aLe: 0.12, aRp: 0.6, aRq: 0.2, aRe: 0.12 } },
    high: { dur: 0.3, rdy: false, pose: { lean: -0.04, aLp: 2.6, aLq: 0.25, aLe: 0.2, aRp: 2.6, aRq: 0.25, aRe: 0.2 } },
    post: { dur: 0.34, rdy: false, pose: { lean: 0.22, lA: 0.32, lB: 0.62, rA: 0.32, rB: 0.62, lS: 0.3, rS: 0.3, aLp: 1.6, aLq: 0.55, aLe: 0.3, aRp: 1.6, aRq: 0.55, aRe: 0.3 } },
    reach: { dur: 0.3, rdy: false, legs: false, one: true, pose: { lean: 0.28, tilt: 0.28, aRp: 1.35, aRq: 1.05, aRe: 0.08, aLp: 0.9, aLq: 0.5, aLe: 0.6 } },
    protect: { dur: 0.36, rdy: false, pose: { lean: 0.32, lA: 0.3, lB: 0.62, rA: 0.3, rB: 0.62, lS: 0.3, rS: 0.3, aLp: 1.3, aLq: 1.45, aLe: 2.2, aRp: 1.3, aRq: 1.45, aRe: 2.2 } },
  };
  // 电脑接球即投：好射手、射程内、接球时最近防守人 ≥1.6 米（球商 / 投篮意识高的人更果断）
  function cpuCS(r, od) {
    { const L = left5(); if (L <= TV.t5_clk_force) return true; }   // V4.2 最后时刻接到球：直接接球就投，不再运球
    if (G.shotClock < 1.2 || r.y < 1) return false;
    const d = dHoop(r), t3 = three(r.x, r.y); if (d < 4.2 || d > 8.4) return false;
    const jr = t3 ? r.r.three : r.r.mid; if (od < TV.t5_cs_od || jr < (od >= TV.t5_cs_far ? TV.t5_cs_jrLo : TV.t5_cs_jr)) return false;   // V3.9r 投射 62–70 的人只在非常空（≥3.5 米）时才接球就投
    if (!t3 && d > 4.5 && r.r.mid < 0.86) return false;   // V3.9k 接球即投不投踩线长两分（中投好手除外）
    let pc = clamp(0.12 + 1.0 * (jr - 0.7) + 0.1 * (od - 1.6) + 0.2 * U(r, 'siq'), 0.05, 0.6);
    // V3.9r 大空位（≥2.5 米）：投射中等以上的人基本接球就投；只有防守人高速扑来、自己又会突破时才可能一步过人
    if (od >= TV.t5_cs_open) {
      let md = null, m = 9; for (const d of defs()) { const l = dist(d, r); if (l < m) { m = l; md = d; } }
      const cv = md ? ((md.vx || 0) * (r.x - md.x) + (md.vy || 0) * (r.y - md.y)) / (m || 1) : 0, fin = Math.max(r.r.lay, r.r.dunk);
      pc = jr >= TV.t5_cs_jr ? Math.max(pc, clamp(TV.t5_cs_base + 1.6 * (jr - TV.t5_cs_jr) + 0.08 * (od - TV.t5_cs_open) + 0.15 * U(r, 'siq'), 0, Math.max(0.97, Math.min(1, TV.t5_cs_base)))) : clamp(0.2 + 2 * (jr - TV.t5_cs_jrLo) + 0.1 * U(r, 'siq'), 0.05, 0.4);
      if (cv > TV.t5_cs_atkV && od < 3.4 && fin > 0.8 && rnd() < 0.35 + 1.5 * (fin - 0.8) - 1.2 * Math.max(0, jr - 0.8)) { r.f5.atk = T.time + 0.8; T.cnt.csAtk = (T.cnt.csAtk || 0) + 1; return false; }   // 扑防冲过头：一步突破
    }
    return rnd() < pc;
  }
  // V3.9m 接球人的手：双手中点（骨架 rig；没有 pose 时用身体前方 0.35 米、胸口高度估算）
  function handPt(r, b, grip = true) {
    if (r.pose && PH.rig) { const k = PH.rig(r, r.pose, grip); return [(k.handL[0] + k.handR[0]) / 2, (k.handL[1] + k.handR[1]) / 2, (k.handL[2] + k.handR[2]) / 2]; }
    const dx = b.x - r.x, dy = b.y - r.y, l = hyp(dx, dy) || 1; return [r.x + dx / l * 0.35, r.y + dy / l * 0.35, r.z + r.h * 0.6];
  }
  // V3.9m 接球前 0.25 秒：接球人转向来球、双手伸出去迎（高球举手 / 低球放低 / 偏到一侧单手够）
  function preCatch() {
    const P = T.ps, b = G.ball; if (!P || !P.to || b.state !== 'pass') return;
    const r = P.to, rem = P.T - P.t; if (P.lin ? false : rem > 0.25) return;
    if (r.action || r.hasBall || !r.pose) return;
    const w = P.lin ? 1 : clamp(1 - rem / 0.25, 0, 1), fa = Math.atan2(b.y - r.y, b.x - r.x);
    let da = fa - r.face; while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI;
    r.face += da * Math.min(1, 0.3 + 0.4 * w);
    const lat = Math.cos(r.face) * (P.ty - r.y) - Math.sin(r.face) * (P.tx - r.x);
    const k = (P.ez || 0) > 1.75 || P.kind === 'lob' || P.kind === 'alley' ? 'high' : P.kind === 'bounce' && (P.t / P.T) > 0.55 ? 'low' : Math.abs(lat) > 0.55 ? 'reach' : 'stand';
    const C = CATCH[k], side = lat > 0 ? -1 : 1, Q = r.pose;
    for (const key in C.pose) {
      if (key[0] === 'l' || key[0] === 'r') continue;   // 腿交给跑步动画
      let v = C.pose[key], k2 = key;
      if (C.one && side < 0) { if (key[1] === 'R') k2 = 'aL' + key.slice(2); else if (key[1] === 'L') k2 = 'aR' + key.slice(2); if (key === 'tilt') v = -v; }
      Q[k2] = lerp(Q[k2] || 0, v, w * 0.85);
    }
    r.f5.pre = { k: k, t: T.time };
  }
  // 每帧在 A5.step 之后把接球姿势叠到 pose 上（开始投篮 / 运球招式后让位）
  function catchPose() {
    for (const p of ps()) {
      const c = p.f5 && p.f5.ck; if (!c) continue;
      const C = CATCH[c.k], u = (T.time - c.t) / C.dur;
      if (u > 1 || !p.hasBall || (p.action && p.action.type !== 'fake') || T.phase !== 'live') {
        p.f5.ck = null; const b = G.ball;
        if (u > 1 && c.bx != null && p.hasBall && !p.action && b.holder === p.id) { b.cT = 0.1; b.cx = c.bx; b.cy = c.by; b.cz = c.bz; b.x = c.bx; b.y = c.by; b.z = c.bz; }   // 收球结束：从手上平滑过渡到运球
        continue;
      }
      const w = Math.min(u < 0.7 ? 1 : (1 - u) / 0.3, c.pre ? clamp((T.time - c.t) / 0.1, 0.25, 1) : 1), P = p.pose; if (!P) continue;   // V3.9m 有迎球预备动作时，接球姿势 0.1 秒内渐入，手不瞬移
      if (c.k === 'cs' && C.hop && u < 0.6) { const hx = -p.x, hy = HY - p.y, hl = hyp(hx, hy) || 1, st = C.hop * (1 / 60) / (C.dur * 0.6); p.x += hx / hl * st * 0.5; p.y += hy / hl * st * 0.5; p.face = Math.atan2(hy, hx); }
      for (const k in C.pose) { if (C.legs === false && (k[0] === 'l' || k[0] === 'r') && k !== 'lean') continue; let v = C.pose[k]; if (C.one && c.side < 0) { const k2 = k[1] === 'R' ? 'aL' + k.slice(2) : k[1] === 'L' ? 'aR' + k.slice(2) : k; if (k2 !== k) { P[k2] = lerp(P[k2], v, w); continue; } if (k === 'tilt') v = -v; } P[k] = lerp(P[k], v, w); }
      // V3.9m 接球动作期间球在手上（双手中点；单手够球时在够球那只手）
      if (!p.action && G.ball.holder === p.id && PH.rig) {
        const k = PH.rig(p), b = G.ball, hd = C.one ? (c.side < 0 ? k.handL : k.handR) : null;
        const hx = hd ? hd[0] : (k.handL[0] + k.handR[0]) / 2, hy = hd ? hd[1] : (k.handL[1] + k.handR[1]) / 2, hz = hd ? hd[2] : (k.handL[2] + k.handR[2]) / 2;
        b.x = hx; b.y = hy; b.z = hz; b.cT = 0; c.bx = hx; c.by = hy; c.bz = hz;
      }
      // 接球即投的 1-2 步 / hop 已移到摆姿势之前（球跟着移动后的手）
    }
  }
  // 接球即投：接球 0.5 秒内起跳的跳投出手更快（跳过一段收球），准备好的接球（面向篮筐、原地 / 移动 / hop 接球）有节奏加成，难接的球没有加成且稍差
  // V3.9m 接球投篮徽章（类 2K Catch & Shoot）：接球 0.6 秒内出手 → 命中 / 绿区 / 出手速度按档加成；
  // 配合收益：战术跑出来的接球（f5.playT，C2 战术写入）、挡拆或无球掩护后（自己是掩护人 / 自己的防守人刚被挡）、空位接球（最近防守人 > 1.8 米）再加一层
  const CSB = { p: [0, 0.02, 0.035, 0.055, 0.075], g: [0, 0.08, 0.15, 0.25, 0.36], t: [0, 0.02, 0.035, 0.05, 0.065] };
  function csBadge(p, a) {
    const k = p.csT || 0; if (!k) return;
    const now = T.time, play = (p.f5.playT || -9) > now - 3;
    const scr = (T.pick && T.pick.s === p) || !!p.f5.scrSet || (p.f5.setT || -9) > now - 2 || defs().some((d) => (d.opp === p || d.mark === p) && d.f5.scr > now - 1.5);
    let nd = 9; for (const d of defs()) nd = Math.min(nd, dist(d, p));
    const x = scr || nd > 1.8, xp = x ? (play ? 0.006 : 0.012) + 0.004 * k : 0, xg = x ? TV.t5_csb_xg : 0;
    a.t += CSB.t[k];
    a.V = Object.assign({}, a.V, { p: (a.V.p || 1) * (1 + CSB.p[k] + xp), g: (a.V.g || 1) * (1 + CSB.g[k] + xg) });
    T.cnt.csB = (T.cnt.csB || 0) + 1; if (x) T.cnt.csBx = (T.cnt.csBx || 0) + 1;
    a.csB = k;
    if (G.mode !== 'demo') {
      const L = G.bpops || (G.bpops = []);
      const gt = G.time; if (!L.some((y) => y.pid === p.id && y.key === 'cs' && gt - y.t0 < 2.5)) { L.push({ pid: p.id, key: 'cs', name: '接球投篮', tier: k, t0: gt }); if (L.length > 6) L.shift(); if (PH.audio) PH.audio.play('badge'); }   // V3.9r 档位不写字，tier 交给飘字按徽章颜色区分
    }
  }
  function csTick() {
    for (const p of ps()) {
      const a = p.action; if (!a || a.type !== 'shot' || a.released || a.csK) continue;
      a.csK = 1; const ct = T.time - (p.catchT || -9); if (ct > 0.6 || !p.hasBall) continue;
      const c = p.f5.ck, rdy = !c || c.rdy || c.k === 'cs';
      if (ct <= 0.5) {
        const q = rdy ? 0.04 + 0.04 * clamp((p.r.three - 0.6) / 0.35, 0, 1) : 0; a.t += q;
        const bon = rdy ? 1 + 0.03 + 0.04 * clamp((p.r.three - 0.7) / 0.25, 0, 1) : 0.96;
        a.V = Object.assign({}, a.V, { p: (a.V.p || 1) * bon, g: (a.V.g || 1) * (rdy ? 1.08 : 1) });
        T.cnt.cs = (T.cnt.cs || 0) + 1; p.f5.csW = false;
        if (p.f5.pq != null && p.f5.pqT === p.catchT) { const dq = p.f5.pq - TV.t5_pass_q0; a.t += TV.t5_pass_csT * dq; a.V = Object.assign({}, a.V, { p: a.V.p * (1 + TV.t5_pass_csP * dq), g: a.V.g * clamp(1 + TV.t5_pass_csG * dq, 0.3 / Math.max(1, TV.t5_pass_csG), 2 * Math.max(1, TV.t5_pass_csG)) }); }   // V4.2 传球质量 → 接球投篮绿区 / 命中 / 节奏
        const L = T.lastPass; if (L && L.to === p && L.rec) L.rec.cs = 1;
      }
      csBadge(p, a);
    }
    for (const p of ps()) { const a = p.action; if (a && a.V && (a.type === 'shot' || a.type === 'layup' || a.type === 'dunk') && !a.pmD && p.pmT != null && T.time - p.pmT < 1) { a.pmD = 1; a.V = Object.assign({}, a.V, { p: (a.V.p || 1) * 1.03 }); } }
  }
  // V3.9k 5V5 命中修正（只走 5V5，不碰 1V1 的公式）：1V1 的干扰 / 盖帽是按“永远一对一贴身”调的，5V5 里每次出手几乎都有人在 1 米内，
  // 结果整体命中只有 34%。按区域缩放这次出手的干扰系数 c、命中系数 p、被盖系数 blk（都是乘法，射手 / 非射手、强弱防守的差距保留）
  const K5 = {
    ra: { c: 0.56, p: 1.7, blk: 0.3 },      // V3.9r 双人封堵后 1.28 → 1.48   // 篮下（1.22 米内）上篮 / 挑篮
    lay: { c: 0.62, p: 1.85, blk: 0.4 },      // V3.9m C1 半场退防到位后内线更难打，p 1.2 → 1.27 保持命中率       // 篮下以外的上篮、抛投、勾手
    paint: { c: 0.8, p: 1.45, blk: 0.45 },    // V3.9m C1 1.1 → 1.16     // 禁区内跳投
    mid: { c: 0.8, p: 1.4, blk: 0.3 },
    three: { c: 0.92, p: 1.0, blk: 0.3 },   // V3.9m C1 1.01 → 1.05；V3.9q 扑防有了起步加速，空位三分变多 → p 1.05 → 0.92（V3.9r 外线绿区加宽 / 空位接球多投）、干扰权重 0.82 → 0.92
  };
  function zoneOf(p) { if (three(p.x, p.y)) return 'three'; const d = dHoop(p); return d < 1.22 ? 'ra' : Math.abs(p.x) < 2.45 && p.y > 8.2 ? 'paint' : 'mid'; }
  function shotAdj() {
    for (const p of ps()) {
      const a = p.action; if (!a || (a.type !== 'shot' && a.type !== 'layup') || a.released || a.k5 || !a.V) continue;
      const z = zoneOf(p), fin = a.type === 'layup' || a.V.hook;
      const k = K5[fin ? (a.type === 'layup' && !a.V.floater && dHoop(p) < 3.2 ? 'ra' : 'lay') : z === 'ra' ? 'paint' : z];
      // 防守强弱差距在 5V5 再放大一点：对位人的外线防守（终结看内线防守）比联盟平均（def 0.69 / intD 0.58）越好，干扰越实
      // V3.9k 用出手瞬间最近的防守人（多半是补防 / 换防的人，不一定是原对位）+ 场上五人整体防守
      const ik = fin || z === 'ra', rk = (q) => ik ? q.r.intD - 0.58 : q.r.def - 0.69, dl = defs();
      let o = p.opp, od = o ? dist(o, p) : 9; for (const d of dl) { const dd = dist(d, p); if (dd < od - 0.3) { o = d; od = dd; } }
      let tk = 0; for (const d of dl) tk += rk(d); tk /= dl.length || 1;
      const dk = clamp(1 + (o && od < 2.5 ? 1.6 * rk(o) : 0) + 1.4 * tk, 0.7, 1.4);
      a.k5 = z; a.V = Object.assign({}, a.V, { c: (a.V.c || 1) * k.c * dk, p: (a.V.p || 1) * k.p, blk: (a.V.blk == null ? 1 : a.V.blk) * k.blk });
    }
  }
  // V3.9r 双人封堵：出手时 2.7 米内所有防守人都算干扰（game.js contestInfo），按 c 从大到小合成 c1 + 0.4·c2 + 0.15·c3（上限 1，c2 < 0.1 忽略）。
  // game.js 只用对位人 OP 的 contestInfo，这里按比例改 a.V.c（每帧在出手前更新）；盖帽仍按各自起跳的人判定，不叠加
  function dblC() {
    for (const p of ps()) {
      const a = p.action; if (!a || (a.type !== 'shot' && a.type !== 'layup') || a.released || !a.k5 || !a.V || a.skill) continue;
      const cls = a.type === 'layup' || a.V.hook || a.v === 'postfade' ? 'in' : 'shot', L = [];
      for (const d of defs()) if (dist(d, p) < TV.t5_dbl_r) { const c = A5.contestInfo(p, d, cls).c; if (c > 0) L.push(c); }
      L.sort((x, y) => y - x);
      const o = p.opp, co = o ? A5.contestInfo(p, o, cls).c : 0, base = a.V.c / (a.dR || 1);
      let r = 1, dbl = false;
      if (L.length && co >= 0.03) { const c2 = L[1] >= TV.t5_dbl_min ? L[1] : 0, c3 = c2 && L[2] ? L[2] : 0; dbl = c2 > 0; r = clamp(Math.min(1, L[0] + TV.t5_dbl_w2 * c2 + TV.t5_dbl_w3 * c3) / co, 1, 4 * Math.max(1, (TV.t5_dbl_w2 + TV.t5_dbl_w3) / 0.55)); }   // V4.4 比值上限跟着第二 / 第三人权重放大
      a.dR = r; a.dbl = dbl; a.V = Object.assign({}, a.V, { c: base * r });
    }
  }
  // 出手结算后：双人封堵的投篮反馈副文字改成「双人封堵」，并记录
  function dblPost() {
    const L = G.lastShot; if (!L || L.id === T.lsId) return; T.lsId = L.id;
    const p = G.players[L.who], a = p && p.action; if (!a || !a.dbl || p.tm == null) return;
    if (L.contest > 0.04 && !L.blocked) { L.src = '双人封堵'; if (!L.skill && L.contest >= 0.2) for (const f of G.floats) if (f.shot && f.pid === p.id) f.sub = '双人封堵'; }   // V4.1 投篮反馈副文字也写「双人封堵」（颜色仍按干扰档位）
    (T.dblLog || (T.dblLog = [])).push({ m: L.made ? 1 : 0, p3: L.pts === 3 ? 1 : 0, c: +L.contest.toFixed(2) }); T.cnt.dblC = (T.cnt.dblC || 0) + 1;
  }
  function catchBall(r, P) {
    const b = G.ball, catchEr = (P.er || 0) + (P.leadEr || 0);
    if (b.z > r.z + r.h * 0.85) r.catchAt = G.time;
    b.cT = 0.1; b.cx = b.x; b.cy = b.y; b.cz = b.z;
    b.state = 'held'; b.holder = r.id; r.hasBall = true; b.shot = null; b.under = false; b.trail = null; b.lastTouch = r.id; r.drib = 0; r.catchT = T.time; r.gotT = G.time;
    if (P.rec && P.rec.ov != null) { let nd = 9; for (const d of defs()) nd = Math.min(nd, dist(d, r)); P.rec.cnd = +nd.toFixed(2); }
    if (P.inb || T.phase === 'inb') { T.phase = 'live'; G.shotClock = 24; }
    for (const p of ps()) { p.ai.t = 0.25; p.ai.hold = false; if (p.tm !== G.off) p.ai.dm = null; }
    r.ai.om = null; T.holdT = 0; r.f5.hold = 0; r.f5.dec = T.time + rr(0.35, 0.8);
    T.lastPass = { from: P.from, to: r, t: T.time, prev: T.lastPass && T.lastPass.to === P.from ? Object.assign({}, T.lastPass, { prev: null }) : null, pa: false, rec: P.rec };
    r.pmT = P.from && ptIs5(P.from, 'playmaker') ? T.time : null;
    let od = 9; for (const d of defs()) od = Math.min(od, dist(d, r));
    if (P.rec) P.rec.open = +od.toFixed(2);
    // V4.2 传球质量（0~1）：落点准、球快 → 高；偏球 / 失手的高难度传球 → 低。接球投篮按它加减成（csTick）
    r.f5.pq = clamp((1 - catchEr / 0.6) * (1 + 0.4 * (P.ua || 0)), 0, 1) * (P.kf ? 0.3 : 1); r.f5.pqT = T.time; if (P.rec) P.rec.q = +r.f5.pq.toFixed(2);
    r.f5.cOd = od;   // V3.9r 接球时最近防守人（空位接球不否决）
    // V3.9j 接球动作按情境区分（数据驱动，见 CATCH）：接球即投 / 高球 / 击地 / 背身 / 够偏球 / 贴身护球 / 移动中 / 原地
    { const hx = -r.x, hy = HY - r.y, hl = hyp(hx, hy) || 1, fh = (Math.cos(r.face) * hx + Math.sin(r.face) * hy) / hl;
      const csW = r.ctrl === 'cpu' ? (catchEr <= TV.t5_pass_csEr || left5() <= TV.t5_clk_force) && cpuCS(r, od) : !!((r.cq && r.cq.k === 'shot') || (r.ib && r.ib.k === 'a1' && r.ib.wc));
      const k = csW && od > 1.0 ? 'cs' : P.kind === 'lob' || P.kind === 'alley' || b.z > r.h * 0.95 ? 'high' : P.kind === 'bounce' ? 'low' : P.feet && P.er > 0.3 ? 'low' : r.reachC > T.time - 0.3 || catchEr > 0.38 ? 'reach' : (P.rsp || 0) > 1.3 && od >= 0.8 ? 'move' : od < 1.0 ? 'protect' : fh < -0.3 && dHoop(r) < 5.5 ? 'post' : 'stand';
      r.f5.ck = { k: k, t: T.time, side: (Math.cos(r.face) * (b.y - r.y) - Math.sin(r.face) * (b.x - r.x)) > 0 ? -1 : 1, rdy: CATCH[k].rdy && fh > 0.2, pre: !!(r.f5.pre && T.time - r.f5.pre.t < 0.1) };
      r.f5.csW = csW && k === 'cs'; T.catchN[k] = (T.catchN[k] || 0) + 1; if (P.rec) P.rec.ck = k;
      if (!CATCH[k].rdy) r.f5.dec = Math.max(r.f5.dec, T.time + 0.2);
      if (r.ctrl === 'cpu' && catchEr > 0.25) r.f5.dec = Math.max(r.f5.dec, T.time + 0.2 + TV.t5_pass_ckD * clamp((catchEr - 0.25) / 0.5, 0, 1)); }   // V4.2 偏球：接球人要停顿、调整
    if (r.rk) r.rk.st.catch++;
    if (P.kind === 'alley' && dHoop(r) < 4.2) r.f5.alley = T.time;
    // V3.9c 空切接球：接着往篮下冲 0.7 秒，不马上回传
    if (r.f5.cut && dHoop(r) < 6) { r.f5.atk = T.time + 0.7; r.f5.dec = Math.max(r.f5.dec, T.time + 0.7); r.f5.cut = null; }
    if (T.hum === r.tm) setCtl(r, 'auto');
  }

  // ---------- 1V1 钩子 ----------
  function hPickup(pl, change, wasShot) {
    if (T.phase === 'inb') T.phase = 'live';
    T.ps = null; T.holdT = 0; pl.f5.hold = 0; pl.f5.dec = T.time + rr(0.3, 0.7);
    const LP = T.lostPass; T.lostPass = null;
    if (LP && T.time - LP.t < 3 && !wasShot) {
      if (LP.rec) LP.rec.rec = change ? 'def' : 'off';
      if (change) {
        // 传球被碰飞 / 脱手 / 传偏后被对方拿到 = 抢断（记给碰到球的人，没人碰就记给捡到的人），传球人记失误
        const cr = LP.by && LP.by.tm === pl.tm ? LP.by : pl;
        if (G.stats[cr.id]) G.stats[cr.id].stl++; if (G.stats[LP.from.id]) G.stats[LP.from.id].tov++; T.cnt.tov++; T.cnt.steals++;
        if (!LP.shown) { A5.sfx('steal'); } fltS('抢断', pl);
      }
    }
    if (change) {
      flipAll(); T.off = G.off; assignMarks(); defNew(false); T.trans = true; T.transT = T.time; T.cnt.poss++; T.cnt.trans++; T.pick = null; T.dbl = null; T.help = null; T.lastPass = null;
      if (!wasShot) T.cnt.steals += 0;
      if (T.hum === pl.tm) setCtl(pl, 'auto'); else autoDef();
    } else {
      if (wasShot) T.lastPass = null;
      if (T.hum === pl.tm) setCtl(pl, 'auto');
    }
  }
  // V3.9p 助攻判定按 NBA 记录习惯：接球后运球不超过 2 次、没有转入单打（f5.isoT），后场发球后自己推进的不算
  function aOk(L) { const r = L.to; return Math.floor((r.drib || 0) / Math.PI) <= 2 && !(r.f5 && r.f5.isoT > L.t) && !(L.rec && L.rec.inb && T.time - L.t > 2); }
  function hScore(pl, pts, kind) {
    const tm = T.tm[pl.tm]; tm.score += pts; if (T.q <= 4) tm.qs[T.q - 1] += pts; pl.rk.st.pts += pts;
    if (T.endPend && T.bzOn) { flt('压哨', pl, '#ffd24a'); A5.sfx('combo'); A5.sfx('cheer2'); T.cnt.bzb = (T.cnt.bzb || 0) + 1; }   // V3.9q 压哨进球（复用 1V1 的欢呼音效）
    const L = T.lastPass; if (L && L.to === pl && L.pa && L.rec) L.rec.mk = 1;
    if (L && L.to === pl && T.time - L.t < 4 && L.from.rk && aOk(L)) { L.from.rk.st.ast++; const L2 = L.prev; if (L2 && L2.to === L.from && L.t - L2.t < 3 && L2.from.rk && L2.from !== pl) L2.from.rk.st.sAst++; }
    for (const t of T.tm) for (const q of t.on) q.rk.st.pm += q.tm === pl.tm ? pts : -pts;
    T.lastPass = null;
    deadBall(1 - pl.tm, 'made');
    if (T.gclock <= 0 || T.endPend) endQuarter();
  }
  function hTurnover(toId) { const p = G.players[toId]; deadBall(p ? p.tm : 1 - G.off, 'side', G.ball.x, G.ball.y); }
  function hOob(lt) {
    const p = G.players[lt]; const next = p ? 1 - p.tm : 1 - G.off;
    if (p && p.tm === G.off) { G.stats[p.id].tov++; T.cnt.tov++; }
    if (T.lostPass && T.time - T.lostPass.t < 3 && T.lostPass.rec) T.lostPass.rec.rec = 'oob'; T.lostPass = null;
    T.cnt.oob++; flt('出界', { x: G.ball.x, y: G.ball.y, z: 0, h: 2 }, '#ff6b6b'); A5.sfx('whistle');
    deadBall(next, 'side', G.ball.x, G.ball.y);
  }

  // ---------- 对位（每帧） ----------
  function shooting(p) { const a = p.action; return a && (a.type === 'shot' || a.type === 'layup' || a.type === 'dunk'); }
  function assignOpps() {
    const h = holder(), D = defs(), O = offs();
    for (const d of D) {
      let o = d.mark;
      if (h && (d.mark === h || (T.dbl && T.dbl.p === d) || (T.help && T.help.p === d && T.time >= T.help.t0) || (T.hedge && T.hedge.p === d && T.time < T.hedge.until) || (shooting(h) && dist(d, h) < TV.l1_contestRange * TV.t5_opp_shK))) o = h;
      d.opp = o || nearestTo(O, d.x, d.y);
    }
    for (const o of O) {
      let best = null, bs = 1e9;
      for (const d of D) { const s = dist(d, o) - (d.opp === o ? 0.8 : 0) - (d.action && d.action.type === 'block' && dist(d, o) < 2.5 ? 1.5 : 0); if (s < bs) { bs = s; best = d; } }
      o.opp = best;
    }
  }

  // ---------- 人类输入（Xbox 默认，完全对照 2K） ----------
  function humanInp(p) {
    const R = T.R, E = T.E, o = A5.zeroInp();
    const L = stick(R.lx, R.ly); o.mx = L.x; o.my = L.y; o.sprint = R.RT;
    const RS = stick(R.rx, R.ry), rsM = hyp(R.rx, R.ry);
    T.icon = R.RB && (T.phase === 'live' || T.phase === 'inb');
    T.passTgt = p.hasBall && !T.icon && (T.phase === 'live' || T.phase === 'inb') ? pickTarget(p, L) : null;
    if (T.phase === 'tip' || T.phase === 'dead') { if (T.phase === 'tip' && p.slot === 4 && R.Y) o.a1 = true; return o; }
    // V3.9d：传球输入缓冲（Q 见 qPass）。按了投篮键 X 就取消，避免先按传球、后按投篮时变成跳传
    const Q = T.qPass;
    if (Q) {
      if (p.z > 0.05 || p.stun > 0 || p.action) Q.ta = T.time;
      if (E.X || !p.hasBall || Q.p !== p || T.time - (Q.ta || Q.t) > 0.45 || T.time - Q.t > 1.5 || !(T.phase === 'live' || T.phase === 'inb') || (Q.m && T.tm[p.tm].on.indexOf(Q.m) < 0)) T.qPass = null;
      else if (canPass(p)) { T.qPass = null; T.cnt.passQ++; if (doPass(p, Q.m || pickTarget(p, L), Q.kind) && Q.icon) T.cnt.iconP++; }
    }
    if (T.icon) {
      const ks = ['A', 'B', 'X', 'Y', 'LT'];
      for (let i = 0; i < 5; i++) if (E[ks[i]]) {
        const m = T.tm[p.tm].on[i]; if (m === p) continue;
        if (p.hasBall) { T.iconNow = true; qPass(p, m, 'chest', true, L); T.iconNow = false; }
        else if (p.tm !== G.off) setCtl(m, 'icon');
      }
      return o;
    }
    const inbBy = T.phase === 'inb' && T.inb && T.inb.by === p;
    if (inbBy) { o.mx = o.my = 0; passKeys(p, L); return o; }
    if (p.hasBall && p.action && p.action.type !== 'move' && jpOk(p) && (E.A || E.B || E.Y)) {
      if (jumpPass(p, E.B ? 'bounce' : E.Y ? 'lob' : 'chest', pickTarget(p, L))) { T.aDown = null; T.yDown = null; return o; }
    }
    if (p.hasBall) {
      o.a1 = R.X;
      // V3.9j 接球缓冲统一进 ibuf：接球即投（a1）由 game.js 自己在拿到球那帧放出（点按 = 自动出手）；接球即传（cp）/ 接球即招式（cm）这里取
      const IB = PH.game.ibuf;
      if (IB.wc && p.ib && (p.ib.k === 'cp' || p.ib.k === 'cm') && T.time - (p.catchT || -9) < 0.45) {
        const e = IB.take(p, G.time);
        if (e && e.k === 'cp' && !E.A) { qPass(p, null, 'chest', false, L); return o; }
        if (e && e.k === 'cm') { IB.push(p, 'a3', G.time, { dx: e.dx, dy: e.dy, mx: e.dx, my: e.dy }); T.cnt.cm = (T.cnt.cm || 0) + 1; } // 转成标准 a3 条目，由 game.js 在招式冷却好时放出
      }
      if (p.cq) {
        const c = p.cq; p.cq = null;
        if (T.time - c.t < 1.6 && T.time - (p.catchT || -9) < 0.45) {
          if (c.k === 'shot') o.a1 = true;   // 点按 / 按住出手由 game.js 的 ibuf.wc 处理（V3.9q 删掉老的 cqVh → a.vh 路径）
          else if (c.k === 'pass' && !E.A) { qPass(p, null, 'chest', false, L); return o; }
        }
      }
      // 2K：RT + X 突破中 = 扣篮（1V1 的扣篮键 a2）
      if (R.X && R.RT && dHoop(p) < 6.5 && p.speed > 2.5) { o.a2 = true; o.a1 = false; }
      if (p.f5.alley > T.time - 0.35) { o.a2 = true; o.sprint = true; }
      if (rsM > 0.5) { o.a3 = true; o.dx = RS.x / rsM; o.dy = RS.y / rsM; }
      if (R.hesi) o.a3 = o.hesi = true;
      o.post = R.LT;
      passKeys(p, L);
      if (E.LB) callPick(p, true);
      return o;
    }
    if (G.ball.state === 'pass' && T.ps && T.ps.to === p && hyp(R.lx, R.ly) < 0.3) { goInp(p, T.ps.tx, T.ps.ty, true, o); }
    if (p.tm === G.off && G.ball.state === 'pass' && T.ps && T.ps.to === p) {
      // V3.9h 球正飞向我：X = 接球即投、A = 接球即传，记进接球缓冲，接到球再执行（以前 X 被当成无球起跳抢板，接球人会空跳）
      const IB = PH.game.ibuf, rsE = rsM > 0.5 && !(p.f5.rs0 > 0.5); p.f5.rs0 = rsM;
      if (IB.wc) {
        if (E.X) IB.push(p, 'a1', G.time, { catch: true, wc: true });
        else if (E.A) IB.push(p, 'cp', G.time, { catch: true, wc: true });
        else if (rsE) IB.push(p, 'cm', G.time, { catch: true, wc: true, dx: RS.x / rsM, dy: RS.y / rsM });
        if (p.ib) IB.hold(p, G.time);
      } else if (E.X) p.cq = { k: 'shot', t: T.time }; else if (E.A) p.cq = { k: 'pass', t: T.time };
      o.a3 = R.LT; return o;
    }
    if (p.tm === G.off) {
      // 无球进攻（抢篮板 / 接球途中）：Y 起跳抢板，LT 卡位
      // V4.1 和防守方一致（2K）：Y 起跳抢板，X 鱼跃扑散球（队友持球时 X 不做事，避免对队友"抢断"）
      o.a1 = R.Y; o.a2 = R.X && !holder(); o.a3 = R.LT;
      if (E.LB && holder() && holder().tm === p.tm) callPick(holder(), true);
      return o;
    }
    // 防守
    o.a1 = R.Y;
    const rsUp = rsM > 0.5 && R.ry > Math.abs(R.rx), rsSteal = rsM > 0.5 && !rsUp;
    o.a2 = R.X || rsSteal;
    o.a3 = R.LT || rsUp;
    if (R.B) { if (T.bDown == null) T.bDown = T.time; if (T.time - T.bDown > 0.15) { o.mx = o.my = 0; o.sprint = false; o.a3 = true; if (!p.charge) T.cnt.charge++; p.charge = true; } } else { T.bDown = null; p.charge = false; }
    if (E.A) T.aDown = T.time;
    if (T.aDown != null) {
      if (!R.A) { const b = G.ball, on = T.tm[p.tm].on, n = nearestTo(on, b.x, b.y); setCtl(n === p ? nearestTo(on, b.x, b.y, p) : n, 'manual'); T.aDown = null; }   // V4.1 2K：切到离球最近的人；自己已经最近就切到第二近（没过半场 / 发球 / 篮板时以前按了没反应）
      else if (T.time - T.aDown > 0.45) { swapMatch(p); T.aDown = null; }
    }
    if (E.LB) toggleDouble(p);
    return o;
  }
  function passKeys(p, L) {
    const R = T.R, E = T.E;
    if (E.A) T.aDown = T.time;
    if (T.aDown != null) {
      if (!R.A) { qPass(p, null, 'chest', false, L); T.aDown = null; }
      else if (T.time - T.aDown > 0.25) { qPass(p, null, 'skip', false, L); T.aDown = null; }
    }
    if (E.B) qPass(p, null, 'bounce', false, L);
    if (E.Y) { if (T.yDown != null && T.time - T.yDown < 0.25) { T.yDown = null; qPass(p, null, 'alley', false, L); } else T.yDown = T.time; }
    if (T.yDown != null && T.time - T.yDown >= 0.25) { T.yDown = null; qPass(p, null, 'lob', false, L); }
  }
  // V3.9d 传球输入缓冲：持球人还在空中抢板 / 落地硬直（block 动作、stun）时 canPass 为假，以前这一下按键边沿被直接吞掉
  // （手柄 / 键盘“偶发传球失败”的根因）。现在记下来，最多等 1 秒，一能传就传出；m 为空时到传出那一刻再按摇杆方向选人
  function qPass(p, m, kind, icon, L) {
    if (canPass(p)) { T.qPass = null; const ok = doPass(p, m || pickTarget(p, L), kind); if (ok && icon) T.cnt.iconP++; return ok; }
    T.qPass = { p: p, m: m, kind: kind, icon: icon, t: T.time }; return false;
  }
  function swapMatch(p) {
    // 长按 A：换防——把离自己最近的进攻人换成自己的对位
    const o = nearestTo(offs(), p.x, p.y); if (!o || o === p.mark) return;
    const other = defs().find((d) => d.mark === o);
    if (other) other.mark = p.mark; p.mark = o; T.cnt.switches++;
  }
  function toggleDouble(p) {
    if (T.dbl) { T.dbl = null; return; }
    const h = holder(); if (!h) return;
    const c = defs().filter((d) => d !== p && d.mark !== h && d !== T.ctl);
    const d = nearestTo(c, h.x, h.y); if (d) { T.dbl = { p: d, until: T.time + 4 }; T.cnt.dbl++; }
  }
  function callPick(h, hum) {
    if (T.pick && T.pick.h === h) { if (T.pick.ph !== 'roll') { T.pick.ph = 'roll'; T.pick.t0 = T.time; } return; }   // 再按一次 LB：顺下（slip）
    const c = T.tm[h.tm].on.filter((m) => m !== h && m.slot >= 3);
    const s = nearestTo(c.length ? c : T.tm[h.tm].on.filter((m) => m !== h), h.x, h.y); if (!s) return;
    T.pick = { s: s, h: h, ph: 'go', t0: T.time, side: h.x > 0 ? -1 : 1, hum: !!hum, pop: !ptIs5(s, 'lob') && (ptIs5(s, 'stretch') || (s.r.three > 0.62 && rnd() < TV.t5_pick_pop)), sw: false };
    T.cnt.picks++;
  }

  // ---------- 电脑：进攻 ----------
  // V3.9l 不踩线：电脑控制的进攻球员（持球 / 无球）活球时不会自己走出界——招式、退运、迎球都被边线 / 底线挡住，贴着线滑。
  // 例外（真出界）：传偏了、接球人伸手够（reach）后 0.6 秒内；或者被两人包夹逼在线边。用户控制的人不管。
  const LX = 7.45, LY = 13.85;
  function lineGuard() {
    if (T.phase !== 'live') return;
    for (const p of offs()) {
      if (p.z > 0.1) continue;
      if (p === T.ctl && T.hum >= 0) { userGuard(p); continue; }
      if (p.hasBall) {
        const c = p.f5.ck, P = T.lastPass;
        if (c && c.k === 'reach' && T.time - c.t < 0.6 && P && P.to === p && (P.er || 0) > 0.3) continue;
        if (defs().filter((d) => dist(d, p) < 1.2).length >= 2) continue;
      }
      if (Math.abs(p.x) > LX) { p.x = Math.sign(p.x) * LX; if (p.vx * p.x > 0) p.vx = 0; T.cnt.lg = (T.cnt.lg || 0) + 1; }
      if (Math.abs(p.y) > LY) { p.y = Math.sign(p.y) * LY; if (p.vy * p.y > 0) p.vy = 0; T.cnt.lg = (T.cnt.lg || 0) + 1; }
    }
  }
  function clampIn(p) {
    let hit = false;
    if (Math.abs(p.x) > LX) { p.x = Math.sign(p.x) * LX; if (p.vx * p.x > 0) p.vx = 0; hit = true; }
    if (Math.abs(p.y) > LY) { p.y = Math.sign(p.y) * LY; if (p.vy * p.y > 0) p.vy = 0; hit = true; }
    return hit;
  }
  // V3.9m 用户控制的人的出界保护（2K 空气墙）：
  // ① 传球飞向他 / 接球后 0.5 秒内 / 接球动作没做完 → 位置钳在界内（底线、边线都算）
  // ② 之后持球主动往线外走：每回合一次，到线前（0.35 米内）停顿约 0.3 秒；再推就真出界
  function userGuard(p) {
    const c = p.f5.ck, catching = (T.ps && T.ps.to === p) || (p.hasBall && (T.time - (p.catchT || -9) < 0.5 || (c && CATCH[c.k] && T.time - c.t < CATCH[c.k].dur)));
    if (catching) { if (clampIn(p)) T.cnt.lgU = (T.cnt.lgU || 0) + 1; return; }
    if (!p.hasBall) return;
    if (T.lgPoss !== T.cnt.poss) { T.lgPoss = T.cnt.poss; T.lgB = null; T.lgUsed = false; }
    const B = T.lgB;
    if (B && B.p === p && T.time < B.until) {
      const ex = 7.62 - 0.3, ey = 14 - 0.3;
      if (Math.abs(p.x) > ex) { p.x = Math.sign(p.x) * ex; if (p.vx * p.x > 0) p.vx = 0; }
      if (Math.abs(p.y) > ey) { p.y = Math.sign(p.y) * ey; if (p.vy * p.y > 0) p.vy = 0; }
      return;
    }
    if (T.lgUsed) return;
    const nx = Math.abs(p.x) > 7.62 - 0.35 && p.vx * p.x > 0.02, ny = Math.abs(p.y) > 14 - 0.35 && p.vy * p.y > 0.02;
    if (nx || ny) { T.lgUsed = true; T.lgB = { p: p, until: T.time + 0.3 }; T.cnt.lgB = (T.cnt.lgB || 0) + 1; if (nx) p.vx *= 0.1; if (ny) p.vy *= 0.1; }
  }
  // 摇杆方向贴线时去掉朝外的分量（1.4 米内开始收）
  function lineStick(p, o) {
    const ex = 7.62 - Math.abs(p.x), ey = 14 - Math.abs(p.y);
    if (ex < 1.4 && o.mx * p.x > 0) o.mx *= ex < 0.5 ? -0.3 : (ex - 0.5) / 0.9;
    if (ey < 1.4 && o.my * p.y > 0) o.my *= ey < 0.5 ? -0.3 : (ey - 0.5) / 0.9;
    if (o.dx != null && ex < 1.4 && o.dx * p.x > 0) o.dx = -o.dx * 0.3;
    if (o.dy != null && ey < 1.4 && o.dy * p.y > 0) o.dy = -o.dy * 0.3;
    return o;
  }
  function handlerInp(h, dt) { return lineStick(h, handlerInp0(h, dt)); }
  // V4.2 时间紧迫：剩余时间 = min(进攻时间, 小节时间)。原来电脑只看进攻时间，小节快结束时还在慢慢运球 / 否决出手，把时间耗完
  function left5() { return T.phase === 'live' || T.phase === 'inb' ? Math.min(G.shotClock, Math.max(0, T.gclock)) : G.shotClock; }
  // 持球人的 1V1 决策（A5.aiInput）只认 G.shotClock：调用时临时换成剩余时间，它里面「<2.2 秒强投」「<3 秒不做招」之类的判断就对小节末同样生效
  function aiH(h, dt, sc) {
    const s0 = G.shotClock, L = sc != null ? sc : left5(); if (L >= s0) return A5.aiInput(h, dt);
    G.shotClock = L; try { return A5.aiInput(h, dt); } finally { G.shotClock = s0; }
  }
  function clkCnt(k) { T.cnt[k] = (T.cnt[k] || 0) + 1; }
  // V3.9p 传球决策按球商（IQ / 视野 / 传球意识）分层：g = 0（低）~ 1（高）
  // 看到的范围：低球商只看近处（6 米外看不清），高球商连弱侧 / 跳传都看得到；反应延迟：队友空出来要过一会儿才"看见"（低 0.55 秒，高 0.05 秒）
  // 目标价值：球商越高越接近客观价值 oracleV（空位 × 出手能力 × 区域价值 × 线路安全），低球商有判断噪声
  const ISO_K = { s: 0.35, h: 0.2, b: 0.07, c: 0.8 };
  function passG(p) { return clamp(0.5 + 1.3 * (U(p, 'iq') + U(p, 'vis') + U(p, 'piq')) / 3, 0, 1); }
  function starK(p) { return clamp(((p.a && p.a.ovr) || 75) - 83, 0, 10) / 10; }
  function sees2(p, m, g) {
    if (!sees(p, m) || downB(m)) return false;
    const dd = dist(p, m); if (dd < TV.t5_see_near) return true;
    if (dd > TV.t5_pass_vr0 + TV.t5_pass_vr * g) return false;   // V4.2 视野距离按传球球商拉开
    if (Math.sign(m.x) !== Math.sign(p.x) && Math.abs(m.x) > 3 && Math.abs(p.x) > 2 && rnd() > 0.675 + TV.t5_pass_ws * (g - 0.5)) return false;   // 弱侧
    const lag = TV.t5_see_lag - 0.5 * g; return !(m.f5.opS > T.time - lag);   // 刚空出来的人还没"看见"
  }
  function passVal2(p, m, g) {
    const k = TV.t5_pv_or0 + TV.t5_pv_orG * g, dd = dist(p, m);
    let v = (1 - k) * passVal(p, m) + k * 1.15 * oracleV(p, m, 0.7 + 0.22 * g);
    // V4.2 AI 视野：球商低的只传近处的人；球商高的看得到弱侧 / 远角空位投手（转移球、hockey assist）
    v -= TV.t5_pass_near * (0.5 - g) * (dd - 5) / 5;
    if (g > 0.5 && (dd > 9 || (Math.sign(m.x) !== Math.sign(p.x) && Math.abs(m.x) > 3)) && three(m.x, m.y)) v += TV.t5_pass_skip * (g - 0.5) * 2 * openOf(m) * Math.min(1.3, shotQ(m));
    return v + (rnd() - 0.5) * TV.t5_pv_noise * (1 - g);
  }
  function handlerInp0(h, dt) {
    if (h.action && h.action.type !== 'move') {
      // V3.9i 电脑突破分球：上篮 / 扣篮起步时协防人已经补到面前、外线有空位队友 → 按视野 / 传球意识概率空中传出
      const a = h.action;
      if (!a.jpChk && jpOk(h) === 1 && (a.type === 'layup' || a.type === 'dunk')) {
        a.jpChk = true;
        const hd = defs().filter((d) => dist(d, h) < 1.6 && dHoop(d) < dHoop(h) + 0.6).length;
        if (hd >= 1) {
          let best = null, bv = 0.55; for (const m of T.tm[h.tm].on) { if (m === h || !sees(h, m)) continue; const v = openOf(m) + (three(m.x, m.y) ? 0.15 : 0) + (dHoop(m) < 2.5 ? 0.2 : 0); if (v > bv) { bv = v; best = m; } }
          if (best && rnd() < (hd >= 2 ? TV.t5_jp_p2 : TV.t5_jp_p1) * (1 + 0.8 * U(h, 'vis') + 0.5 * U(h, 'piq'))) { if (jumpPass(h, dHoop(best) < 2.5 ? 'bounce' : 'chest', best)) return A5.zeroInp(); }
        }
      }
      const o = aiH(h, dt);
      // V4.2 时间紧迫：投篮动作中剩余时间 ≤ t5_clk_rel 立刻出手（球在计时结束前离手）
      if (h.ctrl === 'cpu' && (a.type === 'shot' || a.type === 'layup') && left5() <= TV.t5_clk_rel && o[a.btn || 'a1']) { o[a.btn || 'a1'] = false; clkCnt('clkRel'); }
      return o;
    }
    const f = h.f5;
    // V4.2 时间紧迫（电脑持球人）：≤ t5_clk_heave 无论位置强投；≤ t5_clk_force 原地出手或直接突破（刚接到球就直接投）；领先时小节末先耗时
    if (h.ctrl === 'cpu' && T.phase === 'live' && !h.action) {
      const L = left5();
      if (L <= TV.t5_clk_heave || (L <= TV.t5_clk_force && (T.time - (h.catchT || -9) < 0.6 || dHoop(h) < 2.6 || !(f.atk > T.time)))) {
        let drive = false;
        if (L > TV.t5_clk_heave && T.time - (h.catchT || -9) >= 0.6 && dHoop(h) > 2.6 && dHoop(h) < 6.5 && !(f.atk > T.time)) {
          let lane = 9; for (const d of defs()) { const sd = segD(d.x, d.y, h.x, h.y, 0, HY - 0.6); if (sd.k > 0.05) lane = Math.min(lane, sd.d); }
          const fin = Math.max(h.r.lay, h.r.dunk), jq = three(h.x, h.y) ? h.r.three : h.r.mid;
          drive = lane > 0.9 && fin > jq - 0.05 && L > 1.8;
        }
        if (drive) { f.atk = T.time + L; clkCnt('clkDrive'); }
        else {
          const o = aiH(h, dt, Math.min(L, 2));   // 让 1V1 的 shootNow 选出手方式（扣篮 / 上篮 / 抛投 / 跳投）
          if (!o.a1 && !o.a2) o.a1 = true;
          o.a3 = false; f.veto = 0; f.isoT = 0; clkCnt(L <= TV.t5_clk_heave ? 'clkHeave' : 'clkForce'); return o;
        }
      }
      if (TV.t5_clk_hold > 0 && T.gclock < G.shotClock && L > TV.t5_clk_hold && h.y > 1.2 && T.tm[h.tm].score >= T.tm[1 - h.tm].score && !T.trans) {
        if (T.play) plEnd(T.play, 'hold'); f.isoT = 0; f.atk = 0; f.dec = T.time + 0.3; T.cnt.clkHold = (T.cnt.clkHold || 0) + dt;
        const o = goInp(h, clamp(h.x, -2.5, 2.5) * 0.6, 7.4, false); o.mx *= 0.6; o.my *= 0.6; return o;
      }
    }
    if (f.csW && !h.action && h.ctrl === 'cpu') { f.csW = false; if (T.time - (h.catchT || -9) < 0.4) { const o = A5.zeroInp(); o.a1 = true; f.veto = 0; return o; } }
    if (f.alley > T.time - 0.35) { const o = A5.zeroInp(); o.a2 = true; o.sprint = true; o.my = 1; return o; }
    { const pp = plHand(h); if (pp) return pp; }   // V3.9m C2 战术
    if (f.isoT > T.time && T.time >= (f.isoC || 0)) {   // V3.9p 单打中：被包夹、或者有人大空（球商高的人才看得到）就把球分出去
      f.isoC = T.time + 0.25;
      const nD = defs().filter((d) => dist(d, h) < 1.35).length;
      if (nD < 2) f.x2 = T.time; if (nD >= 2 && T.time - (f.x2 || 0) > 0.6) { f.dec = T.time; T.cnt.isoX2 = (T.cnt.isoX2 || 0) + 1; } else { const g = passG(h); for (const m of T.tm[h.tm].on) if (m !== h && sees2(h, m, g) && oracleV(h, m) > 1.0 && rnd() < 0.25 * g) { f.dec = T.time; T.cnt.isoXo = (T.cnt.isoXo || 0) + 1; break; } }
      if (f.dec <= T.time) f.isoT = 0;
    }
    if (T.time >= f.dec) {
      f.dec = T.time + rr(0.45, 0.95) * TV.t5_ai_dec * (1.3 - 0.4 * T.diff / 2) * (1 - 0.5 * U(h, 'piq'));   // 传球意识 piq：读秒快慢
      const g = passG(h); f.dec += (0.3 - 0.3 * g) * (1 - 0.5 * U(h, 'piq'));   // V3.9p 低球商读秒更慢
      f.dec = Math.max(T.time + 0.15, f.dec + TV.t5_pass_hes * (0.5 - g));   // V4.2 低球商出球犹豫、高球商出球快
      let best = null, bv = -1e9;
      for (const m of T.tm[h.tm].on) { if (m === h || !sees2(h, m, g)) continue; const v = passVal2(h, m, g); if (v > bv) { bv = v; best = m; } }
      const back = h.y < 1;
      // V3.9p 自己创造：明星 / 控球好的人更愿意自己打（单打、突破、干拔），不是每次都传——NBA 约 35% 的进球无助攻
      const cre = back ? 0 : ISO_K.s * starK(h) + ISO_K.h * clamp((h.r.hnd - 0.7) / 0.25, 0, 1) + ISO_K.b;
      const self = back ? (h.slot === 0 ? 0.6 : 0.15) : shotQ(h) * (0.3 + 0.7 * openOf(h)) + TV.t5_ai_self + 0.25 * h.r.hnd - 0.3 * U(h, 'siq') + cre;   // 投篮意识 siq 低 → 更爱自己单干
      const nDef = defs().filter((d) => dist(d, h) < 1.8).length;
      const urge = clamp((T.holdT - TV.t5_ai_urgeT) / 3.5, 0, 0.5) + (nDef >= 2 ? TV.t5_ai_urgeD : 0) - (left5() < 4 ? 0.6 : 0);
      const cm = T.tm[h.tm].on.find((m) => m !== h && m.f5.cut);
      if (cm) { T.cnt.cutSeen++; if (!sees(h, cm)) T.cnt.cutBlind++; else if (best === cm) T.cnt.cutBest++; }
      const Lc = left5();
      if (Lc <= TV.t5_clk_force) best = null;   // V4.2 时间紧迫：不再传球
      else if (Lc <= TV.t5_clk_late && best) { const jr = three(best.x, best.y) ? best.r.three : best.r.mid; if (openOf(best) > 0.45 && jr >= 0.72 && dHoop(best) > 2) { bv += TV.t5_clk_pass; clkCnt('clkPass'); } }
      if (best && bv > self + TV.t5_ai_passTh - urge) {
        const dd = dist(h, best), lr = laneRisk(h, best, 'chest');
        let kind = dHoop(best) < TV.t5_pk_lobD && lr > 0.2 ? ((best.r.dunk > 0.7 && best.speed > 3) || (ptIs5(best, 'lob') && best.speed > 2) ? 'alley' : 'lob') : dd > TV.t5_pk_skipD ? 'skip' : lr > TV.t5_pk_bncR && dd < 7 ? 'bounce' : 'chest';
        if (kind !== 'chest' && kind !== 'skip' && rnd() < Math.max(0, -U(h, 'piq')) * TV.t5_pk_err) kind = 'chest';   // 传球意识低：选错传球方式
        if (doPass(h, best, kind)) return A5.zeroInp();
      }
      if (!back && cre > 0 && !T.play && f.isoT < T.time - 2 && rnd() < ISO_K.c * (0.4 + starK(h) + 0.5 * clamp((h.r.hnd - 0.7) / 0.25, 0, 1))) {
        f.isoT = T.time + rr(1.8, 3.4); f.dec = f.isoT; f.isoGo = T.time + rr(0.4, 1.1); T.cnt.iso5 = (T.cnt.iso5 || 0) + 1;
        let lane = 9; for (const d of defs()) { const sd = segD(d.x, d.y, h.x, h.y, 0, HY - 0.6); if (sd.k > 0.05) lane = Math.min(lane, sd.d); }
        if (left5() > 4 && rnd() < (lane > 1.0 ? 0.5 : 0.2) * (0.6 + Math.max(h.r.lay, h.r.dunk))) f.atk = T.time + 0.9;   // 单打：有路就攻筐
      }
      if (!back && !T.pick && !T.play && !(f.isoT > T.time) && T.holdT > TV.t5_pick_hold && h.slot <= 2 && rnd() < STY[teamStyle(T.tm[h.tm])].pick * TV.t5_pick_k && left5() > 7) callPick(h, false);
    }
    if (h.y < 1.2 && left5() > 6) return goInp(h, clamp(h.x, -3.5, 3.5) * 0.8, 5, T.trans || h.y < -6);
    const P = T.pick;
    if (P && P.h === h && P.ph === 'set' && T.time - P.t0 < 1.0) {
      const s = P.s, px = P.side, o = goInp(h, s.x + px * 1.6, s.y + 1.2, true); return o;
    }
    const o = aiH(h, dt);
    // V3.9p 单打的出手选择：运一会儿之后——有空间就干拔，会投三分的后撤步，路线通就攻筐，不然再等一下（到时间还没机会就传）
    let isoShot = false;
    if (f.isoT > T.time && (!h.action || h.action.type === 'move') && T.time > (f.isoGo || 1e9) && !(h.cd > 0)) {
      f.isoGo = 1e9; let od = 9; for (const d of defs()) od = Math.min(od, dist(d, h));
      const dh = dHoop(h), t3 = three(h.x, h.y);
      let lane = 9; for (const d of defs()) { const sd = segD(d.x, d.y, h.x, h.y, 0, HY - 0.6); if (sd.k > 0.05) lane = Math.min(lane, sd.d); }
      const fin = Math.max(h.r.lay, h.r.dunk), jq = t3 ? h.r.three : h.r.mid;
      if (lane > 1.1 && dh > 2 && rnd() < TV.t5_iso_drv + 0.5 * fin) { f.atk = T.time + 1.0; T.cnt.isoD = (T.cnt.isoD || 0) + 1; }
      else if (od > TV.t5_iso_od && (t3 || dh < 5.2 || h.r.mid >= 0.82) && rnd() < 0.35 + jq) { o.a1 = true; isoShot = true; T.cnt.isoJ = (T.cnt.isoJ || 0) + 1; }
      else if (!t3 && dh > 5.5 && dh < 7.6 && h.r.three >= 0.78 && rnd() < 0.5) { const l = dh || 1; o.a3 = true; o.dx = h.x / l; o.dy = (h.y - HY) / l; o.mx = o.dx; o.my = o.dy; T.cnt.isoSB = (T.cnt.isoSB || 0) + 1; f.isoGo = T.time + 0.45; }
      else if (lane > 0.7 && rnd() < fin) { f.atk = T.time + 0.9; T.cnt.isoD = (T.cnt.isoD || 0) + 1; }
      else f.isoGo = T.time + rr(0.4, 0.8);
    }
    if (f.atk > T.time && !h.action && dHoop(h) > 1.6) { const g = goInp(h, 0, HY - 0.9, true); o.mx = g.mx; o.my = g.my; o.sprint = true; o.a1 = false; }
    // 投篮意识 siq：电脑准备出手的跳投如果被贴 / 位置差，按 siq 概率放弃，重新找传球
    if (o.a1 && f.isoT > T.time && !isoShot) { let od = 9; for (const d of defs()) od = Math.min(od, dist(d, h)); if (od > 1.05) { isoShot = true; T.cnt.isoA = (T.cnt.isoA || 0) + 1; } }   // 单打中电脑自己找的出手：没被贴死就投
    if (o.a1 && !isoShot && (!h.action || h.action.type === 'move') && left5() > 5 && dHoop(h) > 3.5) {
      // V3.9r 接球后 0.6 秒内的大空位跳投（接球时最近防守人 ≥2.2 米、投射中等以上）不否决：扑防的人越来越近不是放弃的理由
      let cOpen = false; if (T.time - (h.catchT || -9) < 0.6 && (h.f5.cOd || 0) >= TV.t5_cs_keep && (three(h.x, h.y) ? h.r.three : h.r.mid) >= TV.t5_cs_jr) cOpen = true;
      if (f.veto > T.time && !cOpen) o.a1 = false;
      else if (cOpen) T.cnt.csKeep = (T.cnt.csKeep || 0) + 1;
      else {
        const c = A5.contestOf(h, h.opp || nearestTo(defs(), h.x, h.y)), dh = dHoop(h), t3 = three(h.x, h.y);
        // V3.9k 5V5 选投：NBA 现在长两分（16 英尺到三分线）只占不到 5%——贴身的长两分（4.5 米外、三分线内）改成后撤到三分线外、突破或传球
        // 没被放空（最近防守人 <1.6 米）的长两分：除非是中投专家，否则基本不投（投篮意识低的人偶尔还是硬投）
        let od = 9; for (const d of defs()) od = Math.min(od, dist(d, h));
        const long2 = !t3 && dh > 4.5 && (od < 1.6 ? !(h.r.mid >= 0.86 && rnd() < 0.5) : left5() > 8 && rnd() < clamp(0.75 - 3 * (h.r.mid - 0.75), 0.1, 0.85)) ? 1 : 0;   // V3.9k 空位长两分也多数放弃（中投差的更坚决），换三分 / 突破
        const bad = clamp(c * TV.t5_veto_c + (0.95 - shotQ(h)) * TV.t5_veto_q, 0, 1);
        if (long2 ? rnd() > clamp(0.15 - 0.4 * U(h, 'siq'), 0.05, 0.35) : rnd() < bad * clamp(0.45 + U(h, 'siq'), 0.05, 0.95)) {
          o.a1 = false; f.veto = T.time + (long2 > 0 ? TV.t5_veto_t2 : TV.t5_veto_t); f.dec = T.time; T.cnt.veto++; if (f.isoT > T.time) T.cnt.isoV = (T.cnt.isoV || 0) + 1;
          // 放弃踩线长两分：会投三分的人后撤一步到三分线外（2K 的后撤步），不然看去篮下的路
          if (long2 > 0 && dh > 5.5 && h.r.three >= 0.74 && h.cd <= 0 && rnd() < 0.3 + 1.2 * (h.r.three - 0.74)) { const l = dh || 1; o.a3 = true; o.dx = h.x / l; o.dy = (h.y - HY) / l; o.mx = o.dx; o.my = o.dy; T.cnt.l2sb = (T.cnt.l2sb || 0) + 1; }
          // 放弃长两分后：去篮下的路上没人（离线路 1.3 米内没有防守人）就直接攻筐
          if (long2 > 0 && !o.a3 && left5() > 3) { let lane = 9; for (const d of defs()) { const sd = segD(d.x, d.y, h.x, h.y, 0, HY - 0.6); if (sd.k > 0.05) lane = Math.min(lane, sd.d); } if (lane > 1.3 && rnd() < 0.35 + 0.4 * Math.max(h.r.lay, h.r.dunk)) { f.atk = T.time + 0.8; T.cnt.v2d = (T.cnt.v2d || 0) + 1; } }
        }
      }
    }
    return o;
  }
  function screenInp(s, dt) {
    const P = T.pick, h = P.h, d = h.opp || nearestTo(defs(), h.x, h.y);
    if (!holder() || holder() !== h) { T.pick = null; return offBall(s, dt); }
    if (P.ph === 'go') {
      const hx = 0 - h.x, hy = HY - h.y, l = hyp(hx, hy) || 1, sx = d.x + (-hy / l) * P.side * 0.75 * -1, sy = d.y + (hx / l) * 0.2;
      const o = goInp(s, sx, sy, true);
      if (hyp(s.x - sx, s.y - sy) < 0.55 || T.time - P.t0 > 2.6) { P.ph = 'set'; P.t0 = T.time; }
      return o;
    }
    if (P.ph === 'set') {
      const o = A5.zeroInp(); o.a3 = true;
      // 掩护效果：防守人撞上掩护人 → 被卡 0.6 秒；电脑有机会换防
      // 掩护质量（沿用 1V1 力量 str / 体重 bw）：卡人范围、卡人时长；防守人协防意识 hlp 越高越快绕过，换防判断也更积极
      const sr = TV.t5_pnr_sr * (1 + 0.3 * (s.r.str - 0.7)) * (0.9 + 0.1 * (s.r.bw || 1));
      for (const dd of defs()) if (dd.opp === h && dist(dd, s) < sr && dd.f5.scr < T.time - 0.8) {
        s.f5.setT = T.time; if (PH.scr) { PH.scr.hit(s, dd, 'pnr', T.time, h); dd.f5.scrK = Math.min(dd.f5.scrK || 0.35, TV.t5_scr_pnrK); } else { dd.f5.scr = T.time; dd.f5.scrD = 0.6 * (0.8 + 0.4 * s.r.str) * (1 - 0.8 * U(dd, 'hlp')); dd.f5.scrK = 0.35; }   // V3.9n 被挡分档（render.js PH.scr）
        const sd0 = defs().find((q) => q.mark === s), hv = (U(dd, 'hlp') + U(sd0, 'hlp')) / 2;
        // V3.9m C1 挡拆对策（按球队设置，25% 的时候临场变化）：换防 / 挤过 / 绕过 / 延误 / 下沉 / 夹击
        if (!P.cv) { const S = T.dfS && T.dfS.S, ks = Object.keys(PNR_CN); const uP = T.uPnr && T.uPnr[1 - G.off]; P.cv = uP || (S ? (rnd() < TV.t5_pnr_fix ? S.pnr : ks[Math.floor(rnd() * ks.length)]) : 'over'); if (zoneOn() && P.cv === 'switch') P.cv = 'drop'; T.cnt['pnr_' + P.cv] = (T.cnt['pnr_' + P.cv] || 0) + 1; }
        const cv = P.cv, sd = sd0;
        if (cv === 'under') { dd.f5.scrD *= 0.5; dd.f5.scrK = 0.6; }
        else if (cv === 'hedge' && sd && sd !== T.ctl && !P.sw) { dd.f5.scrD *= 0.6; T.hedge = { p: sd, until: T.time + TV.t5_pnr_hdT, side: P.side }; P.sw = true; }
        else if (cv === 'drop' && sd && sd !== T.ctl && !P.sw) { T.drop = { p: sd, until: T.time + TV.t5_pnr_dpT }; P.sw = true; }
        else if (cv === 'trap' && sd && sd !== T.ctl && !P.sw) { dd.f5.scrD *= 0.5; T.dbl = { p: sd, until: T.time + TV.t5_pnr_trT }; T.cnt.dbl++; P.sw = true; }
        const swP = cv === 'switch' ? TV.t5_pnr_sw : cv === 'over' ? TV.t5_pnr_ovSw * (1 + 1.2 * hv) * 0.35 : 0;
        if (!P.sw && dd !== T.ctl && rnd() < swP) { if (sd && sd !== T.ctl) { sd.mark = h; dd.mark = s; P.sw = true; T.cnt.scrSw++; if (cv === 'switch') dd.f5.scrD *= 0.4; } }
      }
      if (T.time - P.t0 > 1.2) { P.ph = 'roll'; P.t0 = T.time; }
      return o;
    }
    const tx = P.pop ? P.side * -5.4 : P.side * -0.9, ty = P.pop ? 7.6 : 11.2;
    if (T.time - P.t0 > 2.2) T.pick = null;
    return goInp(s, tx, ty, !P.pop);
  }
  // V3.9h 后场出球（2K / NBA）：球在后场时，控卫（或离球最近的后卫）回来在球一侧 4~7 米处要球；另一名后卫/侧翼在弱侧中线附近做第二出球点；
  // 大个慢跑上前场；剩下的人填快攻通道。被贴身时接应人做 V 字摆脱、往空处让。返回 { t: Map(球员 → 目标), o1, o2 } 或 null
  function bcRoles() {
    if (T.bcF === T.time) return T.bcR; T.bcF = T.time; T.bcR = null;
    let bp = null, bx, by;
    if (T.phase === 'dead' && T.next) { bp = T.next.by; bx = T.next.x; by = T.next.y; }
    else if (T.phase === 'inb' && T.inb) { bp = T.inb.by; bx = bp.x; by = bp.y; }
    else if (T.phase === 'live') { const h = holder(); if (h && h.tm === G.off) { bp = h; bx = h.x; by = h.y; } else if (T.ps && T.ps.to && T.ps.to.tm === G.off && T.ps.ty < -1.5 && T.ps.from.y < -1.5) { bp = T.ps.to; bx = T.ps.tx; by = T.ps.ty; } }
    if (!bp || by > -1.5) return null;
    const O = offs().filter((m) => m !== bp), live = T.phase === 'live', guardH = live && bp.slot <= 1;
    const sg = Math.sign(bx) || (bp.id % 2 ? 1 : -1), edge = Math.abs(bx) > 6.5;
    const t = new Map(); let o1 = null, o2 = null;
    const pick = (order) => { for (const sl of order) { const m = O.find((q) => q.slot === sl && !t.has(q)); if (m) return m; } return null; };
    if (!guardH) {
      const m1 = pick([0, 1, 2]);
      if (m1) {
        let tx, ty;
        if (T.phase !== 'live' && by < -13.5) { tx = sg * 4.6; ty = -10.6; }                              // 底线发球：同侧肘区外 5 米
        else if (edge) { tx = sg * 3.4; ty = by + 1.6; }                                                // 边线发球：往场内回来接
        else { tx = sg * clamp(Math.abs(bx) + 3.6, 3.6, 6.4); ty = by + 3.4; }                          // 篮板后：边路 outlet
        o1 = { p: m1, x: clamp(tx, -6.6, 6.6), y: clamp(ty, -13, -1.2), spr: true };
        t.set(m1, o1);
      }
    }
    const m2 = pick(guardH ? [bp.slot === 0 ? 1 : 0, 2, 1] : [1, 2, 0]);
    if (m2) { o2 = { p: m2, x: -sg * (guardH ? 5.2 : 4.3), y: guardH ? clamp(by + 6, -2, 3) : -0.9, spr: true }; t.set(m2, o2); }
    for (const m of O) {
      if (t.has(m)) continue;
      const S0 = SPOT[m.slot];
      if (m.slot >= 3) t.set(m, { p: m, x: S0[0] * 0.8, y: S0[1] - 1.5, spr: false, jog: true });   // 大个慢跑上前场
      else t.set(m, { p: m, x: sg * 6.1, y: 7.5, spr: true });                                        // 填快攻通道
    }
    // 摆脱：防守人贴在接应点附近 → 往空处让 1.8 米、再往回迎一步（V 字）
    for (const o of [o1, o2]) {
      if (!o) continue;
      const d = nearestTo(defs(), o.x, o.y);
      if (d && hyp(d.x - o.x, d.y - o.y) < 1.4) {
        const f = o.p.f5; if (!f.jabT || T.time > f.jabT) { f.jab = -(f.jab || 1); f.jabT = T.time + rr(0.9, 1.4); }
        const ex = o.x - d.x, ey = o.y - d.y, el = hyp(ex, ey) || 1;
        o.x = clamp(o.x + ex / el * 1.8 + f.jab * 1.2, -6.8, 6.8); o.y = clamp(o.y + ey / el * 1.0 - 0.6, -13.4, -0.8);
      }
      o.d = hyp(o.p.x - o.x, o.p.y - o.y);
    }
    T.bcR = { t: t, o1: o1, o2: o2 };
    return T.bcR;
  }
  function bcGo(p, o) {
    const l = hyp(o.x - p.x, o.y - p.y), r = goInp(p, o.x, o.y, o.spr && l > 2.5);
    if (o.jog) { r.mx *= 0.7; r.my *= 0.7; r.sprint = false; }
    return r;
  }
  // ---------- V3.9i 站位 / 跑位智商（NBA / 2K 常规 spacing）----------
  // 落位点（进攻方坐标，篮筐 y=12.425）：底角、45°、弧顶都在三分线外；内线站 dunker spot（底线、油漆区外侧），不站油漆区正中
  const SP = { cL: [-6.8, 12.5], cR: [6.8, 12.5],   // V3.9l 底角离底线留 1.5 米（原 0.9 米），接球后有余地
    wL: [-5.8, 8.3], wR: [5.8, 8.3], top: [0, 5.2], sL: [-3.3, 6.0], sR: [3.3, 6.0],
    dL: [-3.0, 13.2], dR: [3.0, 13.2], eL: [-2.7, 8.4], eR: [2.7, 8.4], bL: [-2.6, 11.2], bR: [2.6, 11.2] };
  const inPaint = (x, y) => Math.abs(x) < 2.45 && y > 8.2;
  // 球队进攻风格：five 五外跑轰 / pnr 挡拆为主 / post 内线低位 / motion 动态无球 / iso 明星单打（按名单属性推导）
  const STY = {
    five: { spots: ['cL', 'cR', 'wL', 'wR', 'top'], bigIn: 0, cut: 1.0, pick: 0.18 },
    pnr: { spots: ['cL', 'cR', 'wL', 'wR', 'top', 'dL', 'dR'], bigIn: 1, cut: 0.8, pick: 0.38 },
    post: { spots: ['cL', 'cR', 'wL', 'wR', 'top', 'bL', 'bR', 'dL', 'dR'], bigIn: 2, cut: 0.9, pick: 0.15 },
    motion: { spots: ['cL', 'cR', 'wL', 'wR', 'top', 'eL', 'eR', 'dL', 'dR'], bigIn: 1, cut: 1.6, pick: 0.26 },
    iso: { spots: ['cL', 'cR', 'wL', 'wR', 'top', 'dL', 'dR'], bigIn: 1, cut: 0.6, pick: 0.12 },
  };
  function teamStyle(tm) {
    if (tm.style) return tm.style;
    const st = tm.ros.filter((r) => r.starter).map((r) => ({ r: r, a: A5ARCH()[r.key] || r.a }));
    const rt = (x, k) => (x.a && typeof x.a[k] === 'number' ? x.a[k] : 0.6);
    const sh = st.filter((x) => rt(x, 'three') >= 0.78).length;
    const bigs = st.filter((x) => pv(x.r.a) >= 4), post = Math.max(0, ...bigs.map((x) => Math.max(rt(x, 'post'), rt(x, 'hook'))));
    const ovr = st.map((x) => x.r.a.ovr || 75).sort((a, b) => b - a), pg = st.find((x) => pv(x.r.a) === 1) || st[0];
    const pgV = pg ? (r5Of(pg.r.key).vis || 0) + (r5Of(pg.r.key).pac || 0) : 0;
    const bigV = Math.max(0, ...bigs.map((x) => (r5Of(x.r.key).vis || 0)));
    tm.style = sh >= 4 ? 'five' : bigV > 0.25 ? 'motion' : post >= 0.8 ? 'post' : ovr[0] - ovr[1] >= 6 && ovr[0] >= 92 ? 'iso' : pgV > 0.25 ? 'pnr' : 'motion';
    return tm.style;
  }
  // 每队每 0.35 秒重新分配一次落位点；跑位智商 iq 低的人反应慢、站位误差大、偶尔扎堆
  function spacing(tm) {
    const h = holder(); if (!h || h.tm !== tm.t || h.y < 1.2) return null;
    const C = T.spc || (T.spc = {}), c = C[tm.t];
    if (c && T.time - c.t < 0.35 && c.h === h) return c;
    const S = STY[teamStyle(tm)], drive = dHoop(h) < 6.8 && h.speed > 2.2 && (h.vx * -h.x + h.vy * (HY - h.y)) > 0;
    const O = tm.on.filter((m) => m !== h && !(T.pick && T.pick.s === m) && !m.f5.cut);
    const bigs = O.filter((m) => m.slot >= 3).sort((a, b) => b.slot - a.slot).slice(0, S.bigIn);
    const sideH = h.x >= 0 ? 'R' : 'L', weak = sideH === 'R' ? 'L' : 'R';
    let pool = S.spots.filter((k) => { const q = SP[k]; return hyp(q[0] - h.x, q[1] - h.y) > (drive ? 4.2 : 3.6); });
    const map = new Map(), used = new Set();
    // 内线：dunker spot / 低位，突破时站到持球人另一侧的 dunker spot 等吃饼
    for (const b of bigs) {
      const pref = drive ? ['d' + weak, 'd' + sideH] : S.bigIn === 2 ? ['b' + sideH, 'd' + weak, 'b' + weak] : ['d' + weak, 'e' + weak, 'd' + sideH];
      const k = pref.find((k2) => pool.indexOf(k2) >= 0 && !used.has(k2)); if (!k) continue;
      used.add(k); map.set(b, SP[k]);
    }
    // 外线：贪心匹配（离自己最近的空落位点），只用三分线外的点
    const per = O.filter((m) => !map.has(m)), out = pool.filter((k) => !used.has(k) && k[0] !== 'd' && k[0] !== 'b' && k[0] !== 'e');
    const pairs = []; for (const m of per) for (const k of out) pairs.push([hyp(SP[k][0] - m.x, SP[k][1] - m.y) - (k[0] === 'c' && drive ? 1.5 : 0), m, k]);
    pairs.sort((a, b) => a[0] - b[0]);
    for (const [, m, k] of pairs) { if (map.has(m) || used.has(k)) continue; used.add(k); map.set(m, SP[k]); }
    for (const m of per) if (!map.has(m)) { const k = pool.find((k2) => !used.has(k2)); if (k) { used.add(k); map.set(m, SP[k]); } }
    // 跑位智商：反应和执行误差
    for (const [m, q] of map) {
      const ui = U(m, 'iq'), f = m.f5;
      if (f.spT && T.time < f.spT && f.sp) { map.set(m, f.sp); continue; }
      const err = Math.max(0, 0.35 - ui) * 2.2;
      const t2 = [clamp(q[0] + rr(-err, err), -7.1, 7.1), clamp(q[1] + rr(-err, err) * 0.6, 4.6, 13.4)];
      f.sp = t2; f.spT = T.time + clamp(0.35 - 0.6 * ui, 0.05, 0.7); map.set(m, t2);
    }
    C[tm.t] = { t: T.time, h: h, map: map, drive: drive, style: S };
    return C[tm.t];
  }
  function offBall(p, dt) {
    if (T.pick && T.pick.s === p) return screenInp(p, dt);
    const h = holder(), f = p.f5;
    let s = SPOT[p.slot], tx = s[0], ty = s[1];
    { const R0 = bcRoles(); if (R0 && R0.t.has(p)) return bcGo(p, R0.t.get(p)); }
    { const pd = plDir(p); if (pd) { const o = plGo(p, pd); if (o) return o; } }   // V3.9m C2 战术跑位 / 无球掩护
    const SPc = spacing(T.tm[p.tm]), sq = SPc && SPc.map.get(p);
    if (sq) { tx = sq[0]; ty = sq[1]; }
    else if (p.slot === 0 && h && h.slot !== 0) { tx = h.x > 0 ? -3.2 : 3.2; ty = 6.5; }
    if (T.trans && T.time - T.transT < 5 && p.y < 6) { const L = [[0, 4], [6, 9.5], [-6, 9.5], [4.5, 10.5], [0, 11]][p.slot]; tx = L[0]; ty = L[1]; }
    // 空切：有一定概率切向篮下，防守人离得远或者背对时更多
    if (!f.cut && T.time > f.cutNext && h && h !== p && h.y > 3 && p.slot !== 0 && !(T.play && T.play.noCut)) {
      // 球商 iq：空切频率、时机（防守人松时才切）。V3.9i：只在防守人盯球 / 背对我 / 离得远时切；油漆区已经有队友、持球人正在突破时不切
      const ui = U(p, 'iq'), stK = SPc ? SPc.style.cut : 1;
      f.cutNext = T.time + rr(3, 7) * TV.t5_cut_int * (1 - 0.6 * ui) / stK;
      const d = defs().find((q) => q.mark === p), loose = d ? dist(d, p) > 1.6 : true;
      const watch = d ? (Math.cos(d.face) * (p.x - d.x) + Math.sin(d.face) * (p.y - d.y)) < 0 : true;
      const paintN = offs().filter((m) => m !== h && m !== p && inPaint(m.x, m.y)).length;
      if (paintN === 0 && !(SPc && SPc.drive) && (loose || watch) && rnd() < (watch ? TV.t5_cut_pW : TV.t5_cut_p) * (1 + 1.2 * ui) * stK) {
        f.cut = { until: T.time + TV.t5_cut_dur, tx: (p.x > 0 ? 1 : -1) * 0.9, ty: 11.4 };
        // V3.9c 切入时机：球商高的人趁防守人看球时切，防守人反应慢一拍（对方协防意识可以抵消）
        if (d) d.f5.lag = T.time + clamp(TV.t5_cut_lag + 1.2 * (ui - U(d, 'hlp')), 0, 0.9);
      }
    }
    if (f.cut) { if (T.time > f.cut.until) f.cut = null; else { tx = f.cut.tx; ty = f.cut.ty; } }
    if (h && h !== p) {
      const dx = tx - h.x, dy = ty - h.y, l = hyp(dx, dy);
      if (l < 3.4) { const k = 3.6 / (l || 1); tx = clamp(h.x + dx * k, -7.1, 7.1); ty = clamp(h.y + dy * k, -12, 13.4); }
    }
    // V3.9c 球商 iq：不切的时候往防守人的反方向挪，找空位（中位数 0.45 米，球商高最多 0.9 米）
    if (!f.cut && h && h !== p) { const ui2 = U(p, 'iq'), dn = nearestTo(defs(), tx, ty); if (dn) { const ex = tx - dn.x, ey = ty - dn.y, el = hyp(ex, ey) || 1, k = 0.9 * (0.5 + ui2) * clamp((2.6 - el) / 2.6, 0, 1); tx = clamp(tx + ex / el * k * 1.6, -7.1, 7.1); ty = clamp(ty + ey / el * k * 1.6, -12, 13.4); } }
    const sp = TV.t5_spc_d * clamp(0.9 + 0.4 * U(p, 'iq'), 0.7, 1.1);   // V3.9i 队友最小间距 ~3.5 米（跑位智商低的人会挤得更近）
    for (const m of offs()) { if (m === p || m === h) continue; const mq = SPc && SPc.map.get(m), mx = mq ? mq[0] : m.x, my = mq ? mq[1] : m.y, dx = tx - mx, dy = ty - my, l = hyp(dx, dy); if (l < sp && l > 0.01) { tx += dx / l * (sp - l) * 0.5; ty += dy / l * (sp - l) * 0.5; } }
    // 走位途中也别贴着队友：当前位置 2.8 米内的队友，目标往远离他的方向推（跑位智商高推得更多）
    if (!f.cut) for (const m of offs()) { if (m === p || m === h) continue; const dx = p.x - m.x, dy = p.y - m.y, l = hyp(dx, dy); if (l < 2.8 && l > 0.01) { const k = (2.8 - l) * (0.8 + 0.8 * U(p, 'iq')); tx += dx / l * k; ty += dy / l * k; } }
    tx = clamp(tx, -7.1, 7.1); ty = clamp(ty, -12, 13.5);
    // 3 秒区：无球队员在油漆区待满 2.2 秒就出来（站到油漆区外侧）
    if (inPaint(p.x, p.y)) f.paintT = (f.paintT || 0) + dt; else f.paintT = 0;
    // 持球人已经杀进油漆区：油漆区里只留一个队友（位置号最大的内线 / 顺下的人），其他人马上让出来
    if (h && h !== p && inPaint(h.x, h.y) && inPaint(p.x, p.y)) {
      const inn = offs().filter((m) => m !== h && inPaint(m.x, m.y)).sort((a, b) => (T.pick && T.pick.s === b ? 9 : b.slot) - (T.pick && T.pick.s === a ? 9 : a.slot));
      if (inn.length > 1 && inn[0] !== p) { f.cut = null; const q = sq || SP[p.x >= 0 ? 'cR' : 'cL']; tx = q[0]; ty = q[1]; if (inPaint(tx, ty)) { tx = (p.x >= 0 ? 1 : -1) * 3.2; ty = 13.0; } }
    }
    if ((f.paintT > TV.t5_paint_t || (!f.cut && inPaint(tx, ty))) && !(f.cut && f.paintT < TV.t5_paint_t)) { tx = (p.x >= 0 ? 1 : -1) * 3.0; ty = Math.max(ty, 11.6); f.cut = null; }
    return goInp(p, tx, ty, dist(p, { x: tx, y: ty }) > 3 || !!f.cut);
  }
  function offInp(p, dt) {
    if (p.hasBall) return handlerInp(p, dt);
    const b = G.ball;
    if (b.state === 'pass' && T.ps && T.ps.to === p) {
      // V3.9j 迎球：长传 / 有人贴着时往传球人方向迎一两步接（空切的人继续往篮下切着接），不再原地站着等球
      const P = T.ps;
      if (P.meet === undefined) {
        P.meet = null; const fx = P.from.x - p.x, fy = P.from.y - p.y, fl = hyp(fx, fy) || 1;
        let od = 9; for (const d of defs()) od = Math.min(od, dist(d, p));
        if (!P.inb && T.phase === 'live' && fl > 4 && P.T > 0.35) {
          if (p.f5.cut) { const hx = -p.x, hy = HY - p.y, hl = hyp(hx, hy) || 1, m = Math.min(1.2, hl - 1); if (m > 0.3) P.meet = { x: p.x + hx / hl * m, y: p.y + hy / hl * m }; }
          else if (rnd() < (od < 2.2 ? 0.75 : 0.35)) { const m = od < 2.2 ? 0.9 : 0.55; P.meet = { x: p.x + fx / fl * m, y: p.y + fy / fl * m }; }
          if (P.meet && three(p.x, p.y) && !three(P.meet.x, P.meet.y)) P.meet = null;   // V3.9k 三分线外的人不迎进线内（不然接球就变成踩线长两分）
        }
      }
      if (P.meet && P.T - P.t > 0.08) return goInp(p, P.meet.x, P.meet.y, false);
      return goInp(p, P.tx, P.ty, true);
    }
    if (b.state === 'shot' || b.state === 'loose') {
      { const bd = defSet(T.tm[p.tm]).board, nb = bd === 'back' ? 3 : bd === 'crash' ? 1 : 2; if (b.state === 'shot' && p.slot < nb && !ptIs5(p, 'glass') && dHoop(p) > (bd === 'back' ? 5 : 6)) return goInp(p, p.x * 0.4, 3, false); }
      return A5.aiInput(p, dt);
    }
    return offBall(p, dt);
  }

  // ---------- V3.9m C2 进攻战术库（参考 2K Playbook）----------
  // 一套战术 = 若干步。每步给角色下指令：[x, y] 跑到点 / { x, y, scr } 跑到点站定做无球掩护（f5.scrSet = { type, t, for }，撞人由 render.js 的 PH.scr.step 判定）
  // / { hold } 站住（持球人 = 等人来接手递手）。pass：这一步持球人要找的角色；next(P) 进下一步的条件；d 这一步最长时间（超时也往下走）。
  // 角色：h 发起时的持球人 / b1 b2 两个内线（中锋优先）/ s1 s2 s3 外线按三分能力排序 / pk 低位单打人 / hp 高位策应人。坐标是进攻方坐标，sd = 球所在的一侧
  const PLAY_CN = { horns: '牛角', spain: '西班牙挡拆', dho: '手递手', elev: '电梯门', floppy: 'Floppy', post: '低位单打', pistol: 'Pistol', iso: '单打', zone: '高位策应', scr: '无球掩护', pnr: '挡拆' };
  const near = (p, x, y, r) => !!p && hyp(p.x - x, p.y - y) < (r || 1.0);
  const markOf = (m) => defs().find((d) => d.mark === m) || null;
  const PLAYS = {
    // 牛角：两个内线站两肘，两个射手在底角，持球人在弧顶；靠近球的内线上提挡拆，另一个内线投得准就外弹、投不准就下顺到篮下
    horns: { steps: [
      { d: 3.2, go: (P) => ({ b1: [-2.4, 7.3], b2: [2.4, 7.3], s1: [P.sd * 6.8, 12.4], s2: [-P.sd * 6.8, 12.4], h: [0, 4.7] }), next: (P) => near(P.R.h, 0, 4.7, 1.6) && near(P.R.b1, -2.4, 7.3, 1.3) && near(P.R.b2, 2.4, 7.3, 1.3) },
      { d: 4.5, on: (P) => { const h = P.R.h, sc = Math.abs(P.R.b1.x - h.x) < Math.abs(P.R.b2.x - h.x) ? P.R.b1 : P.R.b2; P.o = sc === P.R.b1 ? P.R.b2 : P.R.b1; pickS(h, sc, { pop: sc.r.three > 0.72 && rnd() < 0.6 }); },
        go: (P) => ({ [P.o === P.R.b1 ? 'b1' : 'b2']: P.o.r.three > 0.7 ? [-Math.sign(P.R.h.x || 1) * 5.6, 7.4] : [-Math.sign(P.R.h.x || 1) * 3.0, 13.2], s1: [P.sd * 6.8, 12.4], s2: [-P.sd * 6.8, 12.4] }), next: (P) => !T.pick && T.time - P.stT > 0.6 },
    ] },
    // 西班牙挡拆：中锋给持球人挡拆后下顺，射手从罚球线给下顺人的防守人做背掩护（back screen），然后外弹到弧顶接球
    spain: { steps: [
      { d: 3.0, go: (P) => ({ h: [P.sd * 1.2, 4.9], b1: [P.sd * 0.3, 6.4], s1: [0, 8.4], s2: [-P.sd * 6.8, 12.4], b2: [-P.sd * 3.0, 13.2], s3: [P.sd * 6.8, 12.4] }), next: (P) => near(P.R.h, P.sd * 1.2, 4.9, 1.6) && near(P.R.b1, P.sd * 0.3, 6.4, 1.4) },
      { d: 3.5, on: (P) => pickS(P.R.h, P.R.b1, { pop: false }), go: (P) => ({ s1: [0, 8.2], s2: [-P.sd * 6.8, 12.4], b2: [-P.sd * 3.0, 13.2], s3: [P.sd * 6.8, 12.4] }), next: (P) => !T.pick || T.pick.ph === 'roll' },
      { d: 1.2, go: (P) => { const d = markOf(P.R.b1), q = d ? [d.x - d.x * 0.15, d.y + (HY - d.y) * 0.18 + 0.5] : [0, 9.4]; return { s1: { x: q[0], y: q[1], scr: 'back', for: P.R.b1 }, s2: [-P.sd * 6.8, 12.4], b2: [-P.sd * 3.0, 13.2] }; } },
      { d: 2.4, go: (P) => ({ s1: [-P.sd * 1.6, 5.3], s2: [-P.sd * 6.8, 12.4] }), pass: (P) => (openOf(P.R.b1) > openOf(P.R.s1) + 0.1 && dHoop(P.R.b1) < 3.5 ? 'b1' : 's1'), next: (P) => holder() && holder() !== P.R.h },
    ] },
    // 手递手：内线上提到弧顶侧，持球人传给他；射手从侧翼绕过来，内线把球递给他（近距离传球），递完站定当掩护再下顺
    dho: { steps: [
      { d: 3.2, go: (P) => ({ b1: [P.sd * 2.6, 5.7], s1: [P.sd * 6.0, 8.7], s2: [-P.sd * 6.8, 12.4], b2: [-P.sd * 3.0, 13.2], h: [P.sd * 0.3, 4.4] }), pass: 'b1', pw: 0.7, force: (P, m) => near(m, P.sd * 2.6, 5.7, 1.3) && openOf(m) > 0.15, next: (P) => holder() === P.R.b1 },
      { d: 3.0, go: (P) => { const b = P.R.b1; return { b1: { hold: 1 }, s1: { x: b.x + P.sd * 0.5, y: b.y - 0.5, spr: 1 }, h: [-P.sd * 5.8, 8.2], s2: [-P.sd * 6.8, 12.4], b2: [-P.sd * 3.0, 13.2] }; }, pass: 's1', pw: 0.3, force: (P, m) => dist(m, P.R.b1) < 1.9, next: (P) => holder() === P.R.s1 },
      { d: 1.2, go: (P) => ({ b1: { x: P.R.b1.x, y: P.R.b1.y, scr: 'dho', for: P.R.s1 }, h: [-P.sd * 5.8, 8.2], s2: [-P.sd * 6.8, 12.4] }) },
    ] },
    // 电梯门：射手从底线跑出来，穿过罚球线上并排站的两个内线中间，穿过去以后两人合拢把追防的人关在门外，射手弧顶接球投
    elev: { steps: [
      { d: 3.6, go: (P) => ({ s1: [P.sd * 2.3, 11.8], b1: [-0.85, 6.4], b2: [0.85, 6.4], h: [-P.sd * 5.4, 6.9], s2: [P.sd * 6.8, 12.4], s3: [-P.sd * 6.8, 12.4] }), next: (P) => near(P.R.s1, P.sd * 2.3, 11.8, 1.3) && near(P.R.b1, -0.85, 6.4, 1.0) && near(P.R.b2, 0.85, 6.4, 1.0) },
      { d: 2.6, go: (P) => { const s = P.R.s1, shut = s.y < 6.4; return { s1: { x: s.y > 7.2 ? 0 : 0, y: 4.7, spr: 1 }, b1: { x: shut ? -0.3 : -0.85, y: 6.4, scr: 'elev', keep: 1, for: s }, b2: { x: shut ? 0.3 : 0.85, y: 6.4, scr: 'elev', keep: 1, for: s }, h: [-P.sd * 5.4, 6.9], s2: [P.sd * 6.8, 12.4], s3: [-P.sd * 6.8, 12.4] }; }, next: (P) => P.R.s1.y < 5.5 },
      { d: 1.6, go: (P) => ({ s1: [0, 4.7], b1: { x: -0.3, y: 6.4, scr: 'elev', keep: 1, for: P.R.s1 }, b2: { x: 0.3, y: 6.4, scr: 'elev', keep: 1, for: P.R.s1 } }), pass: 's1', pw: 0.05, force: (P, m) => openOf(m) > 0.1, next: (P) => holder() === P.R.s1 },
    ] },
    // Floppy：射手站篮下，两个内线在两侧低位做掩护；射手看自己的防守人在哪边，往另一边借掩护跑到侧翼接球
    floppy: { steps: [
      { d: 3.4, go: (P) => ({ s1: [0, 12.0], b1: [-2.5, 10.4], b2: [2.5, 10.4], h: [0, 4.8], s2: [-P.sd * 6.6, 6.4], s3: [P.sd * 6.6, 6.4] }), next: (P) => near(P.R.s1, 0, 12.0, 1.3) && near(P.R.b1, -2.5, 10.4, 1.0) && near(P.R.b2, 2.5, 10.4, 1.0) },
      { d: 2.4, on: (P) => { const d = markOf(P.R.s1); P.ex = d ? (d.x > P.R.s1.x ? -1 : 1) : P.sd; },
        go: (P) => { const bL = P.R.b1.x < P.R.b2.x ? 'b1' : 'b2', bR = bL === 'b1' ? 'b2' : 'b1'; return { s1: { x: P.ex * 5.9, y: 8.4, spr: 1 }, [bL]: { x: -2.5, y: 10.4, scr: P.ex < 0 ? 'down' : 'pin', for: P.R.s1 }, [bR]: { x: 2.5, y: 10.4, scr: P.ex > 0 ? 'down' : 'pin', for: P.R.s1 }, h: [0, 4.8], s2: [-P.ex * 6.6, 6.4], s3: [-P.ex * 6.8, 12.4] }; },
        next: (P) => near(P.R.s1, P.ex * 5.9, 8.4, 1.3) },
      { d: 1.6, go: (P) => ({ s1: [P.ex * 5.9, 8.4] }), pass: 's1', pw: 0.05, force: (P, m) => openOf(m) > 0.1, next: (P) => holder() === P.R.s1 },
    ] },
    // 低位单打：低位最强的人卡到强侧低位，其余三人拉到弱侧（底角 / 弱侧 45° / 弧顶），持球人在强侧 45° 喂球；接球后其他人不动、不空切
    post: { init: (P) => { const c = T.tm[P.tm].on.filter((m) => m !== P.R.h); c.sort((a, b) => (Math.max(b.r.post || 0, b.r.hook || 0) + 0.3 * b.r.str) - (Math.max(a.r.post || 0, a.r.hook || 0) + 0.3 * a.r.str)); P.R.pk = c[0]; const o = c.slice(1); P.R.c1 = o[0]; P.R.c2 = o[1]; P.R.c3 = o[2]; delete P.R.b1; delete P.R.b2; delete P.R.s1; delete P.R.s2; delete P.R.s3; P.noCut = 1; },
      steps: [
        { d: 3.6, go: (P) => ({ pk: [P.sd * 2.3, 10.8], h: [P.sd * 5.6, 8.0], c1: [-P.sd * 6.8, 12.4], c2: [-P.sd * 5.8, 7.2], c3: [-P.sd * 1.2, 4.9] }), pass: 'pk', pw: 0.9, force: (P, m) => near(m, P.sd * 2.3, 10.8, 1.4) && openOf(m) > 0.05, next: (P) => holder() === P.R.pk },
        { d: 4.5, go: (P) => ({ h: [P.sd * 6.2, 7.6], c1: [-P.sd * 6.8, 12.4], c2: [-P.sd * 5.8, 7.2], c3: [-P.sd * 1.2, 4.9] }), next: (P) => holder() !== P.R.pk },
      ] },
    // Pistol（早期进攻）：持球人推到侧翼上方，同侧底角的得分后卫往上迎、手递手接球，内线马上跟上给他挡拆
    pistol: { steps: [
      { d: 2.8, go: (P) => ({ h: [P.sd * 4.6, 4.6], s1: [P.sd * 6.8, 11.6], b1: [P.sd * 1.4, 5.0], s2: [-P.sd * 6.8, 12.2], b2: [-P.sd * 3.0, 13.2] }), next: (P) => P.R.h.y > 3.0 },
      { d: 2.4, go: (P) => ({ h: { hold: 1 }, s1: { x: P.R.h.x, y: P.R.h.y + 0.7, spr: 1 }, b1: [P.sd * 1.4, 5.0], s2: [-P.sd * 6.8, 12.2], b2: [-P.sd * 3.0, 13.2] }), pass: 's1', pw: 0.2, force: (P, m) => dist(m, P.R.h) < 2.3 || openOf(m) > 0.5, next: (P) => holder() === P.R.s1 },
      { d: 4.0, on: (P) => pickS(P.R.s1, P.R.b1, { pop: P.R.b1.r.three > 0.72 && rnd() < 0.5 }), go: (P) => ({ h: [-P.sd * 5.8, 6.4], s2: [-P.sd * 6.8, 12.2] }), next: (P) => !T.pick && T.time - P.stT > 0.6 },
    ] },
    // 无球掩护（十字键 → 叫的）：内线在强侧低位给射手做下掩护，射手从底线绕出到侧翼接球
    scr: { steps: [
      { d: 3.0, go: (P) => ({ s1: [P.sd * 2.2, 12.0], b1: [P.sd * 2.8, 9.8], s2: [-P.sd * 6.8, 12.4], b2: [-P.sd * 3.0, 13.2] }), next: (P) => near(P.R.s1, P.sd * 2.2, 12.0, 1.3) && near(P.R.b1, P.sd * 2.8, 9.8, 1.0) },
      { d: 2.4, go: (P) => ({ s1: { x: P.sd * 5.9, y: 7.9, spr: 1 }, b1: { x: P.sd * 2.8, y: 9.8, scr: 'down', for: P.R.s1 }, s2: [-P.sd * 6.8, 12.4], b2: [-P.sd * 3.0, 13.2] }), next: (P) => near(P.R.s1, P.sd * 5.9, 7.9, 1.3) },
      { d: 1.6, go: (P) => ({ s1: [P.sd * 5.9, 7.9] }), pass: 's1', pw: 0.05, force: (P, m) => openOf(m) > 0.1, next: (P) => holder() === P.R.s1 },
    ] },
    // 单打：其他四人拉开到弱侧和底角，不空切、不挡拆，持球人自己打（进攻时间不到 5 秒时自动转这个）
    iso: { init: (P) => { const o = T.tm[P.tm].on.filter((m) => m !== P.R.h); P.R = { h: P.R.h, c1: o[0], c2: o[1], c3: o[2], c4: o[3] }; P.noCut = 1; },
      steps: [{ d: 30, go: (P) => { const s = P.R.h.x >= 0 ? 1 : -1; return { c1: [-s * 6.8, 12.4], c2: [s * 6.8, 12.4], c3: [-s * 5.8, 7.0], c4: [-s * 3.0, 13.2] }; }, next: (P) => holder() !== P.R.h }] },
    // 打区域联防（高位策应）：传球最好的内线站罚球线中间接球，另一个内线去弱侧底线，射手占底角和 45°，球先进高位再找空位 / 底线空切
    zone: { init: (P) => { const B = [P.R.b1, P.R.b2].filter(Boolean).sort((a, b) => U(b, 'vis') - U(a, 'vis')); P.R.hp = B[0]; P.R.lo = B[1]; delete P.R.b1; delete P.R.b2; P.noCut = 1; },
      steps: [
        { d: 4.0, go: (P) => ({ hp: [0, 7.6], lo: [-P.sd * 4.2, 12.8], s1: [P.sd * 6.8, 12.4], s2: [-P.sd * 5.8, 7.8], s3: [P.sd * 5.8, 7.6], h: [P.sd * 2.6, 5.0] }), pass: 'hp', pw: 0.8, force: (P, m) => near(m, 0, 7.6, 1.3) && openOf(m) > 0.15, next: (P) => holder() === P.R.hp },
        { d: 3.0, go: (P) => ({ lo: [-P.sd * 1.4, 12.2], s1: [P.sd * 6.8, 12.4], s2: [-P.sd * 5.8, 7.8], s3: [P.sd * 5.8, 7.6], h: [P.sd * 3.4, 5.2] }), next: (P) => holder() !== P.R.hp },
      ] },
  };
  // 按风格的战术权重（free = 不跑战术，走原来的跑位 + 自由挡拆）；快速战术（十字键 ↑）取权重最高的 4 套
  const PLAY_W = {
    five: { spain: 2, floppy: 2, dho: 2, elev: 1.5, horns: 1, free: 2 },
    pnr: { horns: 2.5, spain: 2, dho: 1, floppy: 0.6, free: 2 },
    post: { post: 3, horns: 1.5, floppy: 1, dho: 0.6, free: 2 },
    motion: { dho: 2, elev: 2, floppy: 1.5, horns: 1, free: 2.5 },
    iso: { iso: 2.5, horns: 1.5, post: 1, spain: 0.6, free: 1.5 },
  };
  const PIST = { five: 0.4, pnr: 0.5, post: 0.2, motion: 0.4, iso: 0.25 };
  function plRoles(tm, h) {
    const O = tm.on.filter((m) => m !== h), bigs = O.filter((m) => m.slot >= 3).sort((a, b) => b.slot - a.slot), sh = O.filter((m) => bigs.indexOf(m) < 0).sort((a, b) => b.r.three - a.r.three);
    while (bigs.length < 2 && sh.length > 2) bigs.push(sh.pop());
    while (bigs.length > 2) sh.push(bigs.pop());
    return { h: h, b1: bigs[0], b2: bigs[1], s1: sh[0], s2: sh[1], s3: sh[2] };
  }
  function pickS(h, s, o) {
    if (!h || !s || holder() !== h) return;
    T.pick = { s: s, h: h, ph: 'go', t0: T.time, side: h.x > 0 ? -1 : 1, hum: !!(o && o.hum), pop: o && o.pop != null ? o.pop : s.r.three > 0.62 && rnd() < TV.t5_pick_pop, sw: false, pl: T.play ? T.play.k : null };
    T.cnt.picks++;
  }
  function plStart(k, t, hum) {
    const h = holder(), tm = T.tm[t]; if (!h || h.tm !== t || G.off !== t || !PLAYS[k]) return false;
    const P = { k: k, name: PLAY_CN[k], tm: t, off: G.off, t0: T.time, st: -1, stT: T.time, R: plRoles(tm, h), sd: h.x >= 0 ? 1 : -1, hum: !!hum, lh: h };
    const D = PLAYS[k]; if (D.init && D.init(P) === false) return false;
    if (T.play) plEnd(T.play, 'swap');
    T.play = P; T.pick = null; T.cnt['pl_' + k] = (T.cnt['pl_' + k] || 0) + 1; T.cnt.plays = (T.cnt.plays || 0) + 1; if (hum) T.cnt.plHum = (T.cnt.plHum || 0) + 1;
    plStep(P, 0); return true;
  }
  function plStep(P, i) { const D = PLAYS[P.k]; if (i >= D.steps.length) { plEnd(P, 'done'); return; } P.st = i; P.stT = T.time; P.MT = -1; const S = D.steps[i]; if (S.on) S.on(P); }
  function plEnd(P, why) {
    if (T.play === P) T.play = null;
    T.cnt['plE_' + why] = (T.cnt['plE_' + why] || 0) + 1; T.plLast = { k: P.k, t: T.time, tm: P.tm, why: why };
    for (const m of T.tm[P.tm].on) if (m.f5.scrSet && m.f5.scrSet.pl) m.f5.scrSet = null;
  }
  // 当前这一帧，球员 p 在战术里的指令（每帧只算一次）
  function plDir(p) {
    const P = T.play; if (!P || P.tm !== p.tm || (P.hum && p === T.ctl)) return null;
    const S = PLAYS[P.k].steps[P.st]; if (!S || !S.go) return null;
    if (P.MT !== T.time) { P.M = S.go(P) || {}; P.MT = T.time; }
    for (const r in P.M) if (P.R[r] === p) return P.M[r];
    return P.noCut ? { stay: 1 } : null;
  }
  function plGo(p, d) {
    const f = p.f5;
    if (d.stay) { f.cut = null; return null; }
    const x = clamp(d.x != null ? d.x : d[0], -7.1, 7.1), y = clamp(d.x != null ? d.y : d[1], -12, 13.5), at = hyp(p.x - x, p.y - y);
    f.cut = null;
    if (d.scr && (at < 0.6 || (d.keep && f.scrSet && f.scrSet.pl))) {
      if (!f.scrSet || f.scrSet.type !== d.scr) { f.scrSet = { type: d.scr, t: T.time, for: d.for || null, pl: 1 }; T.cnt.scrSet = (T.cnt.scrSet || 0) + 1; T.cnt['scr_' + d.scr] = (T.cnt['scr_' + d.scr] || 0) + 1; }
      f.scrF = T.time;
      if (at < 0.25) return A5.zeroInp();
      const o = goInp(p, x, y, false); o.mx *= 0.45; o.my *= 0.45; o.sprint = false; return o;
    }
    if (d.hold || at < 0.3) return A5.zeroInp();
    return goInp(p, x, y, !!d.spr || at > 3);
  }
  // 持球人（电脑）在战术里：到了该传的时候找人；要站住等手递手就站住；要跑位就运球过去。返回 null = 走平常的持球逻辑
  function plHand(h) {
    const P = T.play; if (!P || P.tm !== h.tm || h.ctrl !== 'cpu' || (T.pick && T.pick.h === h)) return null;
    if (h.action && h.action.type !== 'move') return null;
    const S = PLAYS[P.k].steps[P.st]; if (!S) return null;
    const pr = typeof S.pass === 'function' ? S.pass(P) : S.pass, tgt = pr ? P.R[pr] : null;
    if (tgt && tgt !== h && T.tm[h.tm].on.indexOf(tgt) >= 0 && T.time - P.stT > (S.pw || 0.25) && canPass(h)) {
      const ok = S.force ? S.force(P, tgt) : openOf(tgt) > 0.25 && laneRisk(h, tgt, 'chest') < 0.35;
      T.plPassing = true; const okP = ok && sees(h, tgt) && doPass(h, tgt, dist(h, tgt) > 9 ? 'skip' : 'chest'); T.plPassing = false;
      if (okP) { T.cnt.plPass = (T.cnt.plPass || 0) + 1; return A5.zeroInp(); }
    }
    if (P.k === 'iso') return null;
    const d = plDir(h); if (!d || d.stay) return pr ? A5.zeroInp() : null;
    if (h.y < 1.2) return null;
    return plGo(h, d);
  }
  function plIso() { const h = holder(); if (h && h.tm === G.off && T.phase === 'live') { plStart('iso', h.tm, false); T.cnt.plIso = (T.cnt.plIso || 0) + 1; } }
  // 每帧：结束 / 推进当前战术、记录战术接球、电脑选战术、快攻还是落阵
  function playTick() {
    for (const m of offs()) { let nd = 9; for (const d of defs()) nd = Math.min(nd, dist(d, m)); const o = nd >= 1.8; if (o && !m.f5.opn) m.f5.opS = T.time; m.f5.opn = o; }   // V3.9p 队友空出来的时刻（传球反应延迟用）
    if (T.plOff !== G.off) { T.plOff = G.off; T.plUsed = false; T.plPushT = -1; }
    const b = G.ball, h = holder();
    if (b.state === 'shot') T.plUsed = false;
    for (const m of offs()) if (m.f5.scrSet && m.f5.scrSet.pl && T.time - (m.f5.scrF || -9) > 0.12) m.f5.scrSet = null;
    // 防守读无球掩护（2K 的 off-ball switch）：被掩护的人从掩护人身边经过时，掩护人的防守人按协防意识 / 球队挡拆对策决定换防，不换就由原防守人自己绕（被挡由 PH.scr 判定）
    if (T.phase === 'live' && !zoneOn()) for (const s of offs()) {
      const ss = s.f5.scrSet; if (!ss || !ss.pl || !ss.for || ss.sw || dist(ss.for, s) > 1.7) continue;
      ss.sw = 1; const u = ss.for, du = markOf(u), ds = markOf(s); if (!du || !ds || du === T.ctl || ds === T.ctl) continue;
      const S = T.dfS && T.dfS.S, hv = (U(du, 'hlp') + U(ds, 'hlp')) / 2, pS = clamp((S && S.pnr === 'switch' ? TV.t5_scr_swS : TV.t5_scr_sw0) + 0.8 * hv, 0.15, 0.95);
      if (rnd() < pS * TV.t5_scr_swP) { (T.swQ || (T.swQ = [])).push({ du, ds, s, u, off: G.off, at: T.time + TV.t5_scr_swD + TV.t5_scr_swD2 * (1 - clamp(0.5 + hv, 0, 1)) }); T.cnt.offSw = (T.cnt.offSw || 0) + 1; } else T.cnt.offChase = (T.cnt.offChase || 0) + 1;   // V3.9r 换防要喊、要交接：延迟 0.3–0.65 秒才换过去，换防率 ×0.85
    }
    if (T.swQ && T.swQ.length) T.swQ = T.swQ.filter((q) => { if (T.time < q.at) return true; if (G.off === q.off && T.phase === 'live' && q.du.mark === q.u && q.ds.mark === q.s && q.du !== T.ctl && q.ds !== T.ctl) { q.du.mark = q.s; q.ds.mark = q.u; } return false; });
    const P = T.play;
    if (P) {
      if (G.off !== P.off || T.phase !== 'live' || b.state === 'shot' || b.state === 'loose' || b.state === 'dead') plEnd(P, b.state === 'shot' ? 'shot' : 'lost');
      else if (left5() < TV.t5_clk_late && P.k !== 'iso') { plEnd(P, 'clock'); plIso(); }
      else {
        if (h && h !== P.lh) { if (h.tm === P.tm) h.f5.playT = T.time; P.lh = h; }
        const S = PLAYS[P.k].steps[P.st];
        if (S && (T.time - P.stT > S.d || (S.next && S.next(P)))) plStep(P, P.st + 1);
      }
    }
    if (T.play || T.phase !== 'live' || !h || h.tm !== G.off || h.f5.isoT > T.time) return;
    const tm = T.tm[G.off], cpu = T.hum !== tm.t || (T.coach && T.coach[tm.t]);
    if (T.plQ && T.plQ.t === tm.t && T.time - T.plQ.at < 12 && h.y > -1.5) { const q = T.plQ; T.plQ = null; plStart(q.k, q.t, true); return; }
    if (!cpu) return;
    if (left5() < TV.t5_clk_late) { if (!T.plIsoD) { T.plIsoD = true; if (rnd() < TV.t5_clk_pick && h.slot <= 2 && left5() > TV.t5_clk_force + 2) callPick(h, false); else plIso(); } return; }
    T.plIsoD = false;
    const sty = teamStyle(tm);
    // 快攻 / 落阵：外线人数优势（持球人前面我方人数 > 对方回防人数）或者节奏快的球队 → 推快攻；不然收住落阵打战术
    if (T.trans && T.plPushT !== T.transT && h.y > -7) {
      T.plPushT = T.transT;
      const ahead = offs().filter((m) => m !== h && m.y > h.y + 1).length, back = defs().filter((d) => d.y > h.y - 0.5).length;
      const pace = clamp(0.5 + U(h, 'pac'), 0, 1);
      T.plPush = ahead > back - 1 || rnd() < TV.t5_tr_push0 + TV.t5_tr_pushP * pace;
      T.cnt[T.plPush ? 'tr_push' : 'tr_set'] = (T.cnt[T.plPush ? 'tr_push' : 'tr_set'] || 0) + 1;
      if (!T.plPush) T.trans = false;
    }
    if (T.trans && T.time - T.transT < 6) {
      if (T.plPush && !T.plUsed && h.y > -1.5 && h.y < 3.5 && left5() > 14) { T.plUsed = true; if (rnd() < PIST[sty] * TV.t5_pl_pist * 0.5) plStart('pistol', tm.t, false); }
      return;
    }
    if (T.plUsed || h.y < 3 || left5() < 9) return;
    T.plUsed = true;
    if (zoneOn() && rnd() < TV.t5_pl_zone) { plStart('zone', tm.t, false); T.cnt.plZone = (T.cnt.plZone || 0) + 1; return; }
    if (!T.trans && left5() > 16 && rnd() < PIST[sty] * TV.t5_pl_pist * 0.3) { plStart('pistol', tm.t, false); return; }
    const W = PLAY_W[sty] || PLAY_W.motion, wk = (k) => (k === 'free' ? W[k] * TV.t5_pl_free : W[k]); let s = 0; for (const k in W) s += wk(k);
    let r = rnd() * s, pick = 'free'; for (const k in W) { r -= wk(k); if (r <= 0) { pick = k; break; } }
    if (zoneOn() && (pick === 'horns' || pick === 'spain')) pick = 'dho';
    if (pick === 'free') { T.cnt.pl_free = (T.cnt.pl_free || 0) + 1; return; }
    plStart(pick, tm.t, false);
  }

  // ---------- V3.9m C2 十字键战术呼叫（2K 布局）----------
  // ↑ 快速战术 / ← 战术库（两页）/ → 挡拆呼叫（选人挡拆，第二页手递手、无球掩护）/ ↓ 换人页（main.js）。防守：↑ 包夹 / 紧盯外线 / 收缩禁区 / 自动，← 防守方式，→ 挡拆对策
  // 按下后屏幕下方弹出 4 格选择条（A / B / X / Y，键盘 K / L / J / I），按对应键选中；4 秒不选、再按同一方向（最后一页）、球权转换就收起
  const BAR_K = ['A', 'B', 'X', 'Y'];
  function qName(m) { const a = m.a || m.arch || {}; return a.short || a.name || m.key; }
  function barItems(g, t) {
    const off = G.off === t, tm = T.tm[t], it = (n, f) => ({ n: n, f: f });
    const call = (k) => () => { const h = holder(); if (h && h.tm === t && T.phase === 'live') plStart(k, t, true); else T.plQ = { k: k, t: t, at: T.time }; T.plCall = { n: PLAY_CN[k], t: t, at: T.time, off: G.off }; };
    if (off) {
      if (g === 'U') { const W = PLAY_W[teamStyle(tm)] || PLAY_W.motion; return Object.keys(W).filter((k) => k !== 'free').sort((a, b) => W[b] - W[a]).concat(['horns', 'spain', 'dho', 'floppy']).filter((k, i, A) => A.indexOf(k) === i).slice(0, 4).map((k) => it(PLAY_CN[k], call(k))); }
      if (g === 'L') return ['horns', 'spain', 'dho', 'elev', 'floppy', 'post', 'pistol'].map((k) => it(PLAY_CN[k], call(k))).concat([it(T.coach && T.coach[t] ? '自己叫' : '交给教练', () => { T.coach = T.coach || {}; T.coach[t] = !T.coach[t]; T.plCall = { n: T.coach[t] ? '教练' : '', t: t, at: T.time, off: G.off }; })]);
      if (g === 'R') {
        const h = holder(), ms = tm.on.filter((m) => m !== (h && h.tm === t ? h : T.ctl)).sort((a, b) => b.slot - a.slot).slice(0, 4);
        return ms.map((m) => it(qName(m), () => { const hh = holder(); if (hh && hh.tm === t && T.phase === 'live') { if (T.play) plEnd(T.play, 'swap'); pickS(hh, m, { hum: true }); T.cnt.plPnr = (T.cnt.plPnr || 0) + 1; T.plCall = { n: PLAY_CN.pnr, t: t, at: T.time, off: G.off }; } })).concat([it(PLAY_CN.dho, call('dho')), it(PLAY_CN.scr, call('scr'))]);
      }
    } else {
      const setD = (o) => { if (o && o.pres != null) { o.pick = clamp(Math.round(lerp(1.5, -4.5, o.pres) * 10) / 10, -4.5, 1.5); o.gapK = lerp(1.18, 0.84, o.pres); } T.uDs = T.uDs || {}; T.uDs[t] = o; if (T.dfS && T.dfS.off === G.off) T.dfS.S = Object.assign({}, defSet(tm), o || {}, T.uPnr && T.uPnr[t] ? { pnr: T.uPnr[t] } : {}); };
      const lab = (n) => { T.plCall = { n: n, t: t, at: T.time, off: G.off, d: 1 }; };
      if (g === 'U') return [
        it('包夹', () => { const hh = holder(); if (!hh) return; const c = defs().filter((d) => d !== T.ctl && d.mark !== hh); const d = nearestTo(c, hh.x, hh.y); if (d) { T.dbl = { p: d, until: T.time + 4 }; T.cnt.dbl++; } lab('包夹'); }),
        it('紧盯外线', () => { setD({ pres: 0.85, sag: 0.15, help: 0.35 }); lab('紧盯外线'); }),
        it('收缩禁区', () => { setD({ pres: 0.3, sag: 0.85, help: 0.9 }); lab('收缩禁区'); }),
        it('自动', () => { setD(null); T.uDef = T.uDef || {}; T.uDef[t] = null; T.uPnr = T.uPnr || {}; T.uPnr[t] = null; setD(null); T.plCall = null; }),
      ];
      if (g === 'L') return [['man', '人盯人'], ['zone', '2-3 联防'], ['press', '全场紧逼'], [null, '自动']].map(([k, n]) => it(n, () => {
        T.uDef = T.uDef || {}; T.uDef[t] = k;
        const D = T.dfS; if (D && D.off === G.off && k !== 'press') { const z = k === 'zone' || (k == null && D.base === 'zone'); D.k = D.press ? D.k : z ? 'zone' : 'man'; D.base = z ? 'zone' : 'man'; }
        if (D && D.off === G.off && k === 'press') { const hh = holder(); if (T.phase !== 'live' || (hh && hh.y < -1)) { D.press = true; D.k = 'press'; D.t = T.time; } }
        if (k) lab(n); else T.plCall = null;
      }));
      if (g === 'R') return ['switch', 'over', 'drop', 'trap'].map((k) => it(PNR_CN[k], () => { T.uPnr = T.uPnr || {}; T.uPnr[t] = k; if (T.dfS && T.dfS.off === G.off) T.dfS.S = Object.assign({}, T.dfS.S || defSet(tm), { pnr: k }); lab(PNR_CN[k]); }));
    }
    return [];
  }
  function uiTick() {
    const R = (T.R = Object.assign({}, T.R)), E = T.E, t = T.hum;   // 拷一份再改：T.prev 还是原始按键，边沿判断不受影响
    // 选中后按着的键：松开之前不当成比赛按键（不然选完马上投篮 / 传球）
    if (T.barMask) { let any = false; for (const k of BAR_K) if (T.barMask[k]) { if (R[k]) { R[k] = false; E[k] = false; any = true; } else T.barMask[k] = false; } if (!any) T.barMask = null; }
    if (t < 0 || !T.tm) { T.bar = null; return; }
    const kb = PH.input.keys || {}, cur = { U: !!(R.dU || kb.Digit1), L: !!(R.dL || kb.Digit2), R: !!(R.dR || kb.Digit3) }, pv = T.dPrev || {};
    T.dPrev = cur;
    const B = T.bar;
    if (B && (T.time - B.t0 > 4 || G.off !== B.off || T.phase === 'over')) T.bar = null;   // 被抢断 / 球权转换 → G.off 变了，条自动收起
    for (const g of ['U', 'L', 'R']) if (cur[g] && !pv[g]) {
      if (T.phase === 'over' || T.phase === 'tip') break;
      if (T.bar && T.bar.g === g) { if ((T.bar.pg + 1) * 4 < T.bar.items.length) { T.bar.pg++; T.bar.t0 = T.time; } else T.bar = null; }
      else { const items = barItems(g, t); T.bar = items.length ? { g: g, items: items, pg: 0, t0: T.time, off: G.off } : null; if (T.bar) T.cnt.uiBar = (T.cnt.uiBar || 0) + 1; }
      break;
    }
    if (!T.bar) return;
    for (let i = 0; i < 4; i++) if (E[BAR_K[i]]) { const it = T.bar.items[T.bar.pg * 4 + i]; if (it) { it.f(); T.cnt.uiPick = (T.cnt.uiPick || 0) + 1; T.bar = null; } break; }
    T.barMask = T.barMask || {}; for (const k of BAR_K) { if (R[k]) T.barMask[k] = true; R[k] = false; E[k] = false; }
  }
  // 画面角落的当前战术名（render5.js 画）：我方正在跑的战术 / 刚叫的挡拆 / 防守设置；观战时显示进攻方的战术
  function plHud() {
    const t = T.hum, P = T.play;
    if (t < 0) return P ? P.name : '';
    if (P && P.tm === t) return P.name;
    const c = T.plCall; if (!c || c.t !== t) return '';
    if (c.d) return G.off !== t && (c.n !== '包夹' || (T.dbl && T.time < T.dbl.until)) ? c.n : '';
    if (c.n === PLAY_CN.pnr) return T.pick && T.pick.hum && T.time - c.at < 6 ? c.n : '';
    if (T.plQ && T.plQ.t === t) return c.n;
    return '';
  }

  // ---------- V3.9m C1 防守分层（参考 2K 防守设置）----------
  // 每队默认防守设置（按阵容能力推导，少数球队有固定风格）：
  //   base 半场基础防守 man 人盯人 / zone 2-3 区域联防（zoneP = 每回合用区域联防的概率）
  //   pressT 紧逼型球队（死球后有一定概率全场紧逼）；pres 对持球人压迫 0~1（接防点 + 贴身距离）；help 协防强度 0~1；sag 放投篮差的人 0~1
  //   pnr 挡拆对策 switch 换防 / over 挤过 / under 绕过（走掩护下方）/ hedge 延误 / drop 下沉 / trap 夹击；board 冲抢板 crash / 正常 normal / 退防 back
  const DEF_FIX = {
    MIA: { base: 'zone', zoneP: 0.6, pressT: true, pnr: 'trap' },
    POR: { base: 'zone', zoneP: 0.5 },
    TOR: { base: 'zone', zoneP: 0.45, pnr: 'hedge' },
    MEM: { pressT: true, pnr: 'hedge', board: 'crash' },
    BOS: { pnr: 'switch' },
    OKC: { pnr: 'switch' },
    HOU: { pnr: 'switch', board: 'crash' },
    CLE: { pnr: 'drop' },
    MIN: { pnr: 'drop' },
    UTA: { board: 'back' },
  };
  const PNR_CN = { switch: '换防', over: '挤过', under: '绕过', hedge: '延误', drop: '下沉', trap: '夹击' };
  function defSet(tm) {
    if (tm.dset) return tm.dset;
    const st = tm.ros.filter((r) => r.starter).map((r) => A5ARCH()[r.key] || r.a || {});
    const v = (a, k, d) => (typeof a[k] === 'number' ? a[k] : d);
    const av = (L, k, d) => L.reduce((s, a) => s + v(a, k, d), 0) / (L.length || 1);
    const sorted = st.slice().sort((a, b) => pv(a) - pv(b)), per = sorted.slice(0, 3), big = sorted[sorted.length - 1] || {};
    const perD = av(per, 'def', 0.65), ath = av(st, 'spd', 0.65), allD = av(st, 'def', 0.65), bigS = v(big, 'spd', 0.5), rim = Math.max(v(big, 'intD', 0.6), v(big, 'blk', 0.6)), oreb = av(sorted.slice(3), 'oreb', 0.6);
    let pnr = 'over';
    if (Math.min(...st.map((a) => v(a, 'def', 0.6))) >= 0.66 && bigS >= 0.6) pnr = 'switch';
    else if (rim >= 0.82 && bigS < 0.62) pnr = 'drop';
    else if (bigS >= 0.62) pnr = 'hedge';
    else if (perD < 0.66) pnr = 'under';
    const D = {
      base: 'man', zoneP: perD < 0.62 ? TV.t5_zone_p : TV.t5_zone_p0, pressT: false,
      pres: clamp(0.5 + 1.6 * (perD - 0.7) + 0.8 * (ath - 0.68), 0.2, 0.85),
      help: clamp(0.5 + 1.5 * (allD - 0.68) + 0.6 * (rim - 0.7), 0.2, 0.9),
      sag: clamp(0.4 + 1.2 * (rim - 0.7), 0.2, 0.8),
      pnr: pnr, board: oreb >= 0.78 ? 'crash' : ath < 0.6 ? 'back' : 'normal',
    };
    Object.assign(D, DEF_FIX[tm.ab] || {});
    if (D.base === 'zone') D.zoneP = Math.max(D.zoneP, 0.45);
    D.pick = clamp(Math.round(lerp(1.5, -4.5, D.pres) * 10) / 10, -4.5, 1.5);   // 接防点（半场线为 0，负数 = 后场）
    D.gapK = lerp(1.18, 0.84, D.pres);
    tm.dset = D; return D;
  }
  // 每回合开始时决定防守方式；全场紧逼只在死球后：紧逼型球队约 30%，末节最后 30% 时间落后 3~20 分、下半场落后 12 分以上时更常用
  function defNew(dead) {
    const dt = T.tm[1 - G.off], ot = T.tm[G.off], S = defSet(dt), df = dt.score - ot.score;
    const late = T.q >= 4 && T.gclock < T.qlen * 0.3, h2 = T.q >= 3;
    let pp = 0;
    if (dead) { if (S.pressT) pp = TV.t5_prs_team; if (late && df <= -3 && df >= -20) pp = Math.max(pp, TV.t5_prs_late); else if (h2 && df <= -12) pp = Math.max(pp, TV.t5_prs_h2); }
    if (DBG.press != null) pp = DBG.press;
    let press = dead && rnd() < pp, zone = DBG.zone != null ? DBG.zone : rnd() < S.zoneP;
    // V3.9m C2 玩家十字键防守呼叫：防守方式 / 压迫协防设置 / 挡拆对策，覆盖球队默认
    const uD = T.uDef && T.uDef[dt.t]; if (uD === 'man') { press = false; zone = false; } else if (uD === 'zone') { press = false; zone = true; } else if (uD === 'press') press = dead;
    const S2 = (T.uDs && T.uDs[dt.t]) || (T.uPnr && T.uPnr[dt.t]) ? Object.assign({}, S, (T.uDs && T.uDs[dt.t]) || {}, T.uPnr && T.uPnr[dt.t] ? { pnr: T.uPnr[dt.t] } : {}) : S;
    T.dfS = { off: G.off, k: press ? 'press' : zone ? 'zone' : 'man', base: zone ? 'zone' : 'man', press: press, t: T.time, zs: null, xm: 0, S: S2 };
    T.cnt['df_' + T.dfS.k] = (T.cnt['df_' + T.dfS.k] || 0) + 1;
    T.hedge = null; T.drop = null;
  }
  function dfS() { if (!T.dfS || T.dfS.off !== G.off) defNew(T.phase === 'dead' || T.phase === 'inb'); return T.dfS; }
  function pressing() { const D = T.dfS; return !!(D && D.press && D.off === G.off); }
  function zoneOn() { const D = T.dfS; return !!(D && D.k === 'zone' && D.off === G.off); }
  // 紧逼结束：球过半场（或推进 10 秒）后转回半场防守
  function defTick() {
    const D = dfS(), h = holder();
    if (D.press && T.phase === 'live' && ((h && h.tm === G.off && h.y > 0.5) || T.time - D.t > 12)) { D.press = false; D.k = D.base; }
    if (zoneOn()) zoneMarks();
    else if (!D.press && !DBG.noXm && T.phase === 'live' && T.time - (D.xmT || 0) > 0.25) { D.xmT = T.time; matchUp(); }
  }
  // 转换防守找人：球还没在半场落定时，防守人按"谁离得近、谁在对方和篮筐之间"交叉换人（每回合最多 3 次），先保护篮下再找人
  function matchUp() {
    const D = T.dfS, h = holder(), b = G.ball, by = h ? h.y : b.y;
    if (D.xm >= TV.t5_xm_max || (!T.trans && by > 3) || by > 8) return;
    const cost = (d, o) => { const gx = o.x * 0.8, gy = o.y + (HY - o.y) * 0.3; return hyp(d.x - gx, d.y - gy) + (dHoop(d) > dHoop(o) + 1 ? 3 : 0) + (o === h ? 0.5 * hyp(d.x - o.x, d.y - o.y) : 0); };
    const L = defs().filter((d) => d !== T.ctl && d.mark && !(d.action && d.action.type === 'block'));
    let best = null, bg = TV.t5_xm_g;
    for (let i = 0; i < L.length; i++) for (let j = i + 1; j < L.length; j++) {
      const a = L[i], c = L[j], g = cost(a, a.mark) + cost(c, c.mark) - cost(a, c.mark) - cost(c, a.mark);
      if (g > bg) { bg = g; best = [a, c]; }
    }
    if (best) { const [a, c] = best, m = a.mark; a.mark = c.mark; c.mark = m; D.xm++; T.cnt.xMatch = (T.cnt.xMatch || 0) + 1; }
  }
  // 2-3 区域联防站位（进攻方坐标）：两个后卫在罚球线两侧上沿，两个前锋在两侧底线 / 低位外侧，中锋在篮下；整体随球平移
  const ZS = [[-2.4, 6.9], [2.4, 6.9], [-4.6, 11.0], [4.6, 11.0], [0, 11.5]];
  function zoneSpot(i, bx, by) {
    const s = clamp(bx / 7, -1, 1), deep = clamp((by - 8.5) / 3.5, 0, 1), top = clamp((7.5 - by) / 4, 0, 1);
    let [x, y] = ZS[i]; x += 1.5 * s;
    if (i <= 1) { const bs = Math.sign(x) === Math.sign(s) && Math.abs(s) > 0.3; y += deep * (bs ? 1.8 : 1.2) - top * 0.6; if (bs) x += 0.8 * s * deep; }
    else if (i <= 3) { const bs = Math.sign(x) === Math.sign(s) && Math.abs(s) > 0.2; if (!bs) { x -= 1.1 * Math.sign(x) * Math.abs(s); y += 0.3; } y -= top * 0.4; }
    else { x = 1.8 * s * (0.4 + 0.6 * deep); y = 11.5 + 0.2 * deep; }
    return [clamp(x, -6.6, 6.6), clamp(y, 5.5, 13.3)];
  }
  function zoneMarks() {
    const D = T.dfS, Dd = defs(), O = offs(), h = holder(), b = G.ball, P = T.ps;
    if (!D.zs) { D.zs = new Map(); const g = Dd.slice().sort((a, c) => a.slot - c.slot); const gu = g.slice(0, 2).sort((a, c) => a.x - c.x), fw = g.slice(2, 4).sort((a, c) => a.x - c.x); D.zs.set(gu[0], 0); D.zs.set(gu[1], 1); D.zs.set(fw[0], 2); D.zs.set(fw[1], 3); D.zs.set(g[4], 4); }
    for (const d of Dd) if (!D.zs.has(d)) D.zs.set(d, 4);   // 换人后补位
    const fx = P && P.to && P.to.tm === G.off ? P.tx : h ? h.x : b.x, fy = P && P.to && P.to.tm === G.off ? P.ty : h ? h.y : b.y;
    if (fy < 1) return;   // 球还在后场：大家先退到区域位置（offBallD 里处理），不换对位
    const focus = P && P.to && P.to.tm === G.off ? P.to : h && h.tm === G.off ? h : null;
    D.spot = new Map(); for (const d of Dd) D.spot.set(d, zoneSpot(D.zs.get(d), fx, fy));
    // 负责球的人：区域站位离球最近（有 1.2 米的迟滞，避免来回换）
    let rb = null, rd = 1e9; for (const d of Dd) { const s = D.spot.get(d), v = hyp(s[0] - fx, s[1] - fy) - (D.ball === d ? 1.2 : 0); if (v < rd) { rd = v; rb = d; } }
    if (focus && rb && rb !== T.ctl) { if (D.ball !== rb) T.cnt.znRot = (T.cnt.znRot || 0) + 1; D.ball = rb; }
    for (const d of Dd) {
      if (d === T.ctl) continue;
      if (focus && d === D.ball) { d.mark = focus; continue; }
      const s = D.spot.get(d); let m = null, md = 4.2;
      for (const o of O) { if (o === focus) continue; const v = hyp(o.x - s[0], o.y - s[1]); if (v < md) { md = v; m = o; } }
      d.mark = m || nearestTo(O.filter((o) => o !== focus), s[0], s[1]) || d.mark;
    }
  }

  // ---------- 电脑：防守 ----------
  // V3.9q 加速度限制（只用于电脑无球防守：扑防、协防回位、退防、区域轮转）：共用的移动代码起步约 0.2 秒就到最高速，5V5 里显得"瞬移"
  // 这里把指令速度按 NBA 的起步（约 0.5 秒到最高速，加速能力 acc / 体重决定）一帧一帧放出来；减速、急停照旧更快
  const ACC5 = { up: 13, upA: 6, dn: 24 };
  function accLim(p, o, dt) {
    if (!o || DBG.noAcc || p.ctrl !== 'cpu' || !(dt > 0)) return o;
    const ml = hyp(o.mx, o.my); if (ml < 0.05) return o;
    let ms = 4.2 + 1.7 * p.r.spd; if (o.sprint && p.stam > 2) ms *= 1.3; if (o.a3 && G.ball.state === 'held') ms *= 0.78 + 0.16 * p.r.def;
    const dx = o.mx * ms - p.vx, dy = o.my * ms - p.vy, dl = hyp(dx, dy); if (dl < 1e-3) return o;
    const up = ml * ms > (p.speed || 0) + 0.05;   // 在加速（目标速度比现在快）
    const A = (up ? ACC5.up + ACC5.upA * (p.r.acc - 0.5) : ACC5.dn) * clamp(1.15 - 0.15 * ((p.arch && p.arch.bw) || 1), 0.85, 1.05), lim = A * dt;
    if (dl <= lim) return o;
    const vx = p.vx + dx / dl * lim, vy = p.vy + dy / dl * lim;
    o.mx = vx / ms; o.my = vy / ms; const l2 = hyp(o.mx, o.my); if (l2 > 1) { o.mx /= l2; o.my /= l2; }
    return o;
  }
  // V3.9r 绕掩护：被挡之后（停滞期结束后 0.9 秒内），掩护人挡在去目标的路上就先绕到掩护人外侧（自己这一侧）再追，路线更长
  function scrAround(p, tx, ty) {
    const f = p.f5; if (!(f.scr > T.time - (f.scrD || 0) - TV.t5_scr_arT)) return null;
    let sc = null, sd = 1.7; for (const q of offs()) { if (q === p.mark || q.hasBall) continue; const l = dist(q, p); if (l < sd) { sd = l; sc = q; } }
    if (!sc) return null;
    const vx = tx - p.x, vy = ty - p.y, vl = hyp(vx, vy) || 1; if (((sc.x - p.x) * vx + (sc.y - p.y) * vy) / vl < 0.1) return null;   // 掩护人不在前方
    let nx = -vy / vl, ny = vx / vl; if (f.scrSd == null || f.scrSdT !== f.scr) { f.scrSdT = f.scr; f.scrSd = (nx * (p.x - sc.x) + ny * (p.y - sc.y)) >= 0 ? 1 : -1; }
    nx *= f.scrSd; ny *= f.scrSd; T.cnt.scrAr = (T.cnt.scrAr || 0) + (f.scrArT === f.scr ? 0 : 1); f.scrArT = f.scr;
    return goInp(p, sc.x + nx * TV.t5_scr_arW + vx / vl * 0.3, sc.y + ny * TV.t5_scr_arW + vy / vl * 0.3, true);
  }
  function offBallD(p, dt) {
    const m = p.mark || nearestTo(offs(), p.x, p.y), b = G.ball, h = holder();
    const bp = h || b, dB = dist(m, bp);
    // 协防意识 hlp：离球远时往篮下收缩的程度 ±30%
    // V3.9j 防守好的人离球远时也不会放太空（看人又看球），防守差的人更爱看球、站得更开
    const f = ((m.y < 0 && bp.y < 0) ? 0.12 : TV.t5_sag_0 + TV.t5_sag_far * clamp(dB / 10, 0, 1)) * (1 + 0.15 * U(p, 'hlp')) * clamp(1.2 - 1.5 * (p.r.def - 0.6), 0.75, 1.25);
    // V3.9i 突破收缩：持球人越接近篮下，弱侧 / 协防位置的人收得越深（协防意识 hlp 越高收得越积极），这样分球出去才有空位
    let dk = h && h.tm === G.off && m !== h ? clamp((7 - dHoop(h)) / 4.5, 0, 1) : 0;
    // 离持球人最近的协防人全力收缩，第二个一半多，其余的只是"做样子"，盯的是好射手时更不敢离开
    if (dk > 0) { const rk = defs().filter((q) => q !== p && q.opp !== h && dist(q, h) < dist(p, h)).length; dk *= rk === 0 ? 1 : rk === 1 ? TV.t5_col_2 : TV.t5_col_3; if (three(m.x, m.y) && m.r && m.r.three >= 0.78) dk *= TV.t5_col_sh; }
    const f2 = Math.min(TV.t5_col_max, f + dk * TV.t5_col_k * (1 + 0.6 * U(p, 'hlp')));
    let tx = m.x + (0 - m.x) * f2, ty = m.y + (HY - m.y) * f2;
    const k = TV.t5_ball_k * clamp(dB / 8, 0, 1) + dk * 0.22; tx += (bp.x - tx) * k; ty += (bp.y - ty) * k;
    if (dk > 0.5) p.f5.helpT = T.time;
    // V3.9m C1 防守分层：区域联防按区域站位；非紧逼时球在后场 → 先退防到前场（球越深退得越深），球推进过来再上提找人
    { const D = T.dfS, S = D && D.S;
      if (D && !D.press && T.phase !== 'dead') {
        if (S && !DBG.noHlp) { const sgK = m.r && m.r.three < 0.68 && three(m.x, m.y) && dB > 3 ? 0.12 * S.sag : 0, hk = lerp(-0.06, 0.08, S.help) * clamp(dB / 8, 0, 1); if (sgK + hk) { tx += (0 - tx) * (sgK + hk); ty += (HY - ty) * (sgK + hk); } }
        if (zoneOn() && bp.y > -1 && D.spot && D.spot.get(p)) { const z = D.spot.get(p), mk = m && hyp(m.x - z[0], m.y - z[1]) < 4.2 ? 0.28 : 0; tx = z[0] + (m.x - z[0]) * mk; ty = z[1] + (m.y - z[1]) * mk; }
        else if (bp.y < 1 && !DBG.noRet) {
          const u = clamp((bp.y + 13) / 14, 0, 1), fl = lerp(8.6, 2.6, u);
          if (zoneOn()) { const z = zoneSpot(D.zs && D.zs.get(p) != null ? D.zs.get(p) : Math.min(4, p.slot), bp.x * 0.5, 7); tx = z[0]; ty = Math.max(z[1], fl); }
          else if (ty < fl) { ty = fl; tx *= lerp(0.55, 0.9, u); }
        }
        if (T.drop && T.drop.p === p && T.time < T.drop.until && h) { tx = h.x * 0.35; ty = Math.max(h.y + 2.4, HY - 4.4); }
      } }
    // V3.9j 传球出手：防守人要反应 0.2–0.45 秒才转向新的球（协防意识 / 传球预判 / 防守能力越好越快；刚协防完、背对新接球人更慢），反应前按原来的方向继续跑
    const P = T.ps, F = p.f5;
    if (P && !P.inb && P.from.tm !== p.tm && !DBG.noRx) {
      if (F.rxP !== P) { F.rxP = P; F.rx0 = T.time - P.t; F.rx = F.rx0 + rxDelay(p, m, P); F.rxO = F.lastO ? Object.assign({}, F.lastO, { a1: false, a2: false }) : null; }
    }
    // 贴着自己人的防守人（2.5 米内）跟着人动，不算反应延迟；收缩协防、离得远的人才吃这一拍。反应期内从原来的跑动方向渐渐转到新的方向
    const rxW = P && !P.inb && P.from.tm !== p.tm && !DBG.noRx && T.time < F.rx && F.rxO && !(P.to === m && dist(p, m) < 2.5) ? 1 - clamp((T.time - F.rx0) / (F.rx - F.rx0), 0, 1) : 0;
    let o;
    if (P && P.to === m && !P.inb && !DBG.noCo) {
      // 扑防：反应过来后冲向落点和篮筐之间（射手贴得近、突破手留一步），最后两米小碎步；冲得太猛容易被一步过
      const g = coGap(m), hx = 0 - P.tx, hy = HY - P.ty, hl = hyp(hx, hy) || 1, cx = P.tx + hx / hl * g, cy = P.ty + hy / hl * g;
      const ka = clamp(0.85 + 0.4 * U(p, 'ppc'), 0.6, 1), dl = dist(p, { x: cx, y: cy });
      tx = lerp(tx, cx, ka); ty = lerp(ty, cy, ka);
      o = goInp(p, tx, ty, dl > 1.8);
      if (dl < 1.2) { const ch = TV.t5_co_ch + 0.3 * p.r.def; o.mx *= ch; o.my *= ch; o.sprint = false; if (p.speed > TV.t5_co_v) F.oc = T.time + TV.t5_co_t; }
    } else { if (P && P.to === m) { const ka = 0.6 * (1 + 0.8 * U(p, 'ppc')); tx = lerp(tx, P.tx, ka); ty = lerp(ty, P.ty, ka); } o = goInp(p, tx, ty, dist(p, { x: tx, y: ty }) > 2.4); }
    if (p.f5.scr > T.time - (p.f5.scrD || 0)) { const k = p.f5.scrK || TV.t5_scr_offK; o.mx *= k; o.my *= k; o.sprint = false; }   // V3.9r 被无球掩护挡住：停滞期内移动打折（原来只有一下 stun）
    else { const ao = scrAround(p, m.x, m.y); if (ao) o = ao; }
    if (p.f5.lag > T.time) { o.mx *= TV.t5_lag_k; o.my *= TV.t5_lag_k; o.sprint = false; }
    if (dB < 5 && dist(p, { x: tx, y: ty }) < 1) o.a3 = true;
    if (rxW > 0) { const w = rxW > 0.5 ? 1 : rxW * 2; o.mx = lerp(o.mx, F.rxO.mx, w); o.my = lerp(o.my, F.rxO.my, w); o.sprint = w > 0.5 ? F.rxO.sprint : o.sprint; }
    accLim(p, o, dt);
    F.lastO = o;
    return o;
  }
  // 扑防距离：好射手贴近（约 0.75 米）、突破手留一步（约 1.2 米）
  const DBG = {};
  function coGap(m) { const t3 = m.r ? m.r.three : 0.6, dr = m.r ? 0.5 * m.r.spd + 0.5 * m.r.hnd : 0.6; return clamp(TV.t5_co_gap - 0.9 * (t3 - 0.7) + 0.5 * Math.max(0, dr - 0.8), 0.7, 1.3); }
  function rxDelay(p, m, P) {
    let d = TV.t5_rx_base - 0.2 * U(p, 'hlp') - 0.1 * U(p, 'ppc') - 1.0 * (p.r.def - 0.7);
    if (P.to === m) d -= 0.03 + 0.06 * U(p, 'ppc');
    if (T.time - (p.f5.helpT || -9) < 0.6) d += 0.1 - 0.08 * U(p, 'hlp');
    const r = P.to, fx = Math.cos(p.face), fy = Math.sin(p.face); if (r && fx * (r.x - p.x) + fy * (r.y - p.y) < 0) d += 0.05;
    return clamp(d + rr(-0.04, 0.04), TV.t5_rx_min, TV.t5_rx_max);
  }
  function defInp(p, dt) {
    const b = G.ball, h = holder();
    if (b.state === 'shot' || b.state === 'loose') return A5.aiInput(p, dt);
    if (h && p.opp === h) {
      if (T.dbl && T.dbl.p === p && dist(p, h) > 1.6) { const o = goInp(p, h.x + (h.x > 0 ? -0.9 : 0.9), h.y + 0.6, true); o.a3 = true; return o; }
      const F = p.f5, ct = T.time - (h.catchT || -9);
      // V3.9j 接球后的扑防：还没贴上就继续冲到接球人和篮筐之间，最后两米小碎步（防守差的人收不住）
      if (!DBG.noCo2 && p.ctrl === 'cpu' && ct < 0.8 && !h.action && dist(p, h) > coGap(h) + 0.35) {
        const g = coGap(h), hx = -h.x, hy = HY - h.y, hl = hyp(hx, hy) || 1, dl = dist(p, h);
        const o = goInp(p, h.x + hx / hl * g, h.y + hy / hl * g, dl > 2.2);
        if (dl < 1.6) { const ch = TV.t5_co_ch + 0.3 * p.r.def; o.mx *= ch; o.my *= ch; o.sprint = false; if (p.speed > TV.t5_co_v) F.oc = T.time + TV.t5_co_t; }
        accLim(p, o, dt); F.lastO = o; return o;
      }
      // V3.9m C1 挡拆延误（hedge）：掩护人的防守人上提到持球人突破路线上，0.75 秒后回去找顺下的人
      if (T.hedge && T.hedge.p === p && T.time < T.hedge.until) { const hx = -h.x, hy = HY - h.y, hl = hyp(hx, hy) || 1, sd = T.hedge.side || 1; const o = goInp(p, h.x + hx / hl * 1.0 - hy / hl * 0.7 * sd, h.y + hy / hl * 1.0 + hx / hl * 0.7 * sd, true); o.a3 = true; F.lastO = o; return o; }
      // 非紧逼：持球人在接防点之前（后场）不上去贴，在接防点等（站在他和篮筐之间）
      const D = T.dfS, S = D && D.S;
      if (D && S && !D.press && !DBG.noRet && h.y < S.pick && !(T.dbl && T.dbl.p === p)) { const ty = Math.max(S.pick, h.y + 2.2), tx = h.x * 0.75, o = goInp(p, tx, ty, hyp(p.x - tx, p.y - ty) > 2.5); if (hyp(p.x - tx, p.y - ty) < 0.8) o.a3 = true; F.lastO = o; return o; }
      // 对持球人压迫程度：按球队设置缩放 1V1 防守距离（每换一个对位重新评估一次），投篮差的人放一步
      if (F.dmO !== h && !DBG.noDm) { F.dmO = h; p.ai.dm = null; }
      const o = A5.aiInput(p, dt);
      if (S && !DBG.noDm && p.ai.dm && !p.ai.dm.t5) { const dm = p.ai.dm; dm.t5 = 1; dm.gap *= D.press ? 0.85 : S.gapK; if (!D.press && h.r.three < 0.68) dm.gap += 0.35 * S.sag; }
      if (p.f5.scr > T.time - p.f5.scrD) { const k = p.f5.scrK || 0.35; o.mx *= k; o.my *= k; o.sprint = false; }
      else { const ao = scrAround(p, h.x, h.y); if (ao) { o.mx = ao.mx * TV.t5_scr_arV; o.my = ao.my * TV.t5_scr_arV; o.sprint = false; } }   // V3.9r 挡拆绕挡：先绕过掩护人（绕的时候跑不快）
      // 扑防冲过头：接球人马上突破，防守人要先刹住再转身（一步过）
      if (F.oc > T.time && h.speed > 3.2 && p.speed > 3 && (h.vx * -h.x + h.vy * (HY - h.y)) > 0 && !F.ocHit && (F.ocR = F.ocR === F.oc ? F.ocR : (F.ocOk = rnd() < clamp(TV.t5_co_beat - 0.8 * (p.r.def - 0.6) + 0.3 * (h.r.hnd - 0.7), 0.25, 0.85), F.oc)) && F.ocOk) { F.ocHit = T.time + 0.3 - 0.15 * p.r.def; T.cnt.ocBeat = (T.cnt.ocBeat || 0) + 1; }
      if (F.ocHit && F.ocHit > T.time) { o.mx *= 0.35; o.my *= 0.35; o.sprint = false; } else if (F.ocHit && F.oc < T.time) F.ocHit = 0;
      F.lastO = o;
      return o;
    }
    return offBallD(p, dt);
  }
  // V3.9r 被盖帽后中档 / 重档（game.js p.blkR tier ≥2，stun 期间）：倒地或踉跄，不能参与
  function downB(p) { const B = p.blkR; return !!(B && B.tier >= 2 && p.stun > 0 && G.time - B.t < B.dur); }
  function cpuInp(p, dt) {
    const ph = T.phase;
    if (ph === 'tip') { const o = A5.zeroInp(); if (p.slot === 4 && T.phaseT > 0.45 && T.phaseT < 0.55) o.a1 = true; return o; }
    if (ph === 'over' || ph === 'qbreak') return A5.zeroInp();
    if (ph === 'dead') return deadInp(p);
    if (downB(p)) return A5.zeroInp();   // V3.9r 被盖帽扇倒 / 踉跄期间：不抢板、不回防、不跑位（game.js blkR / stun）
    if (ph === 'inb') {
      if (T.inb && p === T.inb.by) return A5.zeroInp();
      if (p.tm === G.off) {
        const R0 = bcRoles(); if (R0 && R0.t.has(p)) return bcGo(p, R0.t.get(p));
        if (p.slot === 0 || (T.inb.by.slot === 0 && p.slot === 1)) { const ib = T.inb.by; return goInp(p, clamp(ib.x - Math.sign(ib.x || 1) * 3, -6, 6), clamp(ib.y + (ib.y < -13 ? 4 : 0.5), -12, 12), true); }
        return offBall(p, dt);
      }
      return offBallD(p, dt);
    }
    return p.tm === G.off ? offInp(p, dt) : defInp(p, dt);
  }
  // 球在发球点附近的地上（9 米内、已经落到 1.4 米以下）：发球人去捡；太远（飞进观众席等）就由裁判递球
  function ballPick(N) { const b = G.ball; return b.state === 'loose' && b.z < 1.4 && hyp(b.x - N.x, b.y - N.y) < 9 && Math.abs(b.x) < 9.5 && Math.abs(b.y) < 15.5 && T.phaseT < 6; }
  function deadInp(p) {
    const N = T.next;
    if (N && p === N.by) {
      // V3.9l 发球人先去捡球（球落在附近地上时），捡到再走到发球点；用户控制的发球人也自动走
      if (!N.got && ballPick(N)) { const b = G.ball, o = goInp(p, b.x, b.y, true); if (hyp(b.x - p.x, b.y - p.y) < 1.2) { o.mx *= 0.6; o.my *= 0.6; } return o; }
      const o = goInp(p, N.x, N.y, true); if (hyp(N.x - p.x, N.y - p.y) < 1.2) { o.mx *= 0.6; o.my *= 0.6; } return o;
    }
    if (p.tm === G.off) { const R0 = bcRoles(); if (R0 && R0.t.has(p)) return bcGo(p, R0.t.get(p)); const s = SPOT[p.slot]; return goInp(p, s[0] * 0.8, N && N.kind === 'made' ? -7 + s[1] * 0.5 : s[1], false); }
    const m = p.mark; if (m && T.dfS && T.dfS.press && T.dfS.off === G.off) return goInp(p, m.x * 0.9, m.y + 1.0, false);
    return m ? goInp(p, m.x * 0.7, Math.max(m.y + 2.5, 4), false) : A5.zeroInp();
  }

  // ---------- 规则 / 每帧 ----------
  function rules(dt) {
    const b = G.ball, h = holder();
    if (T.phase === 'live') {
      T.gclock -= dt;
      if (b.state !== 'shot') G.shotClock -= dt;
      if (h) T.holdT += dt;
      if (T.trans && (T.time - T.transT > 7 || (h && h.y > 7))) T.trans = false;
      if (T.dbl && (T.time > T.dbl.until || !h)) T.dbl = null;
      // 协防：持球人杀进禁区、防守人被甩在身后 → 离得最近的内线补防
      if (h && dHoop(h) < TV.t5_help_d && !T.help) {
        const md = defs().find((d) => d.mark === h);
        if (md && (dHoop(md) > dHoop(h) + 0.4 || md.stun > 0.1 || md.f5.scr > T.time - md.f5.scrD)) {
          const c = defs().filter((d) => d !== md && d !== T.ctl && d !== (T.dbl && T.dbl.p));
          // 协防意识 hlp：反应慢 0.05~0.45 秒；协防意识高的人更会被选中去补
          let best = null, bs = 1e9; for (const d of c) { const s = dist(d, h) - (d.slot >= 3 ? TV.t5_help_big : 0) - 2 * U(d, 'hlp'); if (s < bs) { bs = s; best = d; } }
          if (best && bs < TV.t5_help_r) { const t0 = T.time + TV.t5_help_t0 - TV.t5_help_tH * U(best, 'hlp'); T.help = { p: best, t0: t0, until: t0 + TV.t5_help_dur }; T.cnt.helps++; }
        }
      }
      if (T.help && (T.time > T.help.until || !h)) T.help = null;
      // 持球出界
      if (h && h.z < 0.1 && (Math.abs(h.x) > 7.6 || Math.abs(h.y) > 14.1)) { G.stats[h.id].tov++; T.cnt.tov++; T.cnt.oob++; flt('出界', h, '#ff6b6b'); A5.sfx('whistle'); deadBall(1 - G.off, 'side', h.x, h.y); return; }
      if (G.shotClock <= 0 && b.state !== 'shot' && T.gclock > 0) {
        T.cnt.viol++; T.cnt.tov++; const who = h || G.players[b.lastTouch]; if (who && who.tm === G.off) G.stats[who.id].tov++;
        A5.sfx('buzzer'); flt('24秒违例', who || offs()[0], '#ff6b6b'); deadBall(1 - G.off, 'side', b.x, b.y); return;
      }
      if (T.gclock <= 0) { T.gclock = 0; if (b.state === 'shot') { T.endPend = true; if (!T.bzOn) { T.bzOn = true; A5.sfx('buzzer'); } } else endQuarter(); return; }   // NBA：0.0 秒就响，出手在归零之前的球照样算（压哨）
      if (T.endPend && b.state !== 'shot') { endQuarter(); return; }
    }
    if (T.phase === 'inb' && T.inb) {
      const by = T.inb.by, wt = T.time - T.inb.t0;
      // V3.9h 发球人拿球后等接球人到位（或约 2.5 秒）再发；后场发球优先给回来要球的接应人
      const R0 = bcRoles(), o1 = R0 && R0.o1, ready = o1 ? o1.d < 1.1 && openOf(o1.p) > 0.3 : wt > T.inb.wait;
      if (G.ball.state === 'held' && G.ball.holder === by.id && ((T.ctl !== by && wt > T.inb.wait && (ready || wt > 2.5)) || wt > 5)) {
        let best = null, bv = -1e9;
        for (const m of offs()) { if (m === by) continue; const v = (R0 ? (o1 && m === o1.p ? 1.4 : R0.o2 && m === R0.o2.p ? 0.6 : 0) : m.slot === 0 ? 1.2 : 0) - dist(m, by) * 0.08 + openOf(m) * 1.2 - laneRisk(by, m, 'chest') * 2; if (v > bv) { bv = v; best = m; } }
        doPass(by, best, 'chest');
      }
    }
    if (T.subPend && T.time >= T.subPend.at) execPend();
    if (T.phase === 'dead' && T.next) {
      const N = T.next;
      // V3.9h 等发球人自己走到发球点（2K 一样：裁判把球递给已经站好位的发球人），不再超时瞬移；实在卡住 9 秒才摆位
      const dn = hyp(N.by.x - N.x, N.by.y - N.y), b = G.ball, by = N.by;
      if (!N.got && ballPick(N) && hyp(b.x - by.x, b.y - by.y) < 0.75) { N.got = true; T.cnt.inbPick = (T.cnt.inbPick || 0) + 1; }
      if (N.got) { b.state = 'ext'; b.holder = -1; b.vx = b.vy = b.vz = 0; b.x = by.x + Math.cos(by.face) * 0.32; b.y = by.y + Math.sin(by.face) * 0.32; b.z = 1.0; }
      const ready = N.got || !ballPick(N);
      // 用户控制发球人：捡到球、走到发球点附近（1.2 米内）后按传球键可以直接发
      if (T.hum === by.tm && T.ctl === by && T.E.A && N.got && dn < 1.2 && (Math.abs(by.y) > 14 || Math.abs(by.x) > 7.62) && T.phaseT > 0.9) {
        beginInbound(by, by.x, by.y); T.cnt.inbEarly = (T.cnt.inbEarly || 0) + 1;
        const L = stick(T.R.lx, T.R.ly); doPass(by, pickTarget(by, L), 'chest');
      } else if (T.phaseT > 0.9 && ((ready && dn < 0.3 && by.speed < 1.2) || (T.phaseT > 6 && dn < 0.4) || T.phaseT > 9)) beginInbound(by, dn < 0.4 ? by.x : N.x, dn < 0.4 ? by.y : N.y);
    }
    T.sclock = G.shotClock; T.off = G.off;
    // 体力 / 上场时间
    // V3.9h 2K 式两层体力：p.stam 是短时体力（冲刺/动作消耗、喘口气恢复，沿用 1V1 规则），r.fat 是长期疲劳（场上活球时间累积，只在板凳上缓慢恢复）。
    // 场上体力上限 = 100 - 长期疲劳；疲劳累积和板凳恢复随节长缩放。
    const live = T.phase === 'live', sc = Math.max(0.1, T.qlen / 720);
    for (const tm of T.tm) for (const r of tm.ros) {
      r.fat = r.fat || 0;
      if (r.p) {
        if (live) { r.st.sec += dt; r.fat = Math.min(TV.t5_fat_max, r.fat + TV.t5_fat_up / (420 * sc) * dt * (r.p.speed > TV.t5_fat_runV ? TV.t5_fat_run : 1) * clamp(1 + 1.2 * (0.81 - (r.p.r.dur || 0.81)), 0.7, 1.35)); }
        r.p.stam = Math.min(r.p.stam, 100 - r.fat); r.stam = r.p.stam;
      } else { r.fat = Math.max(0, r.fat - TV.t5_fat_dn / (240 * sc) * dt * (live ? 1 : TV.t5_fat_dead)); r.stam = 100 - r.fat; }
    }
  }
  function tick(dt) {
    if (!T.on) { PH.input.endTick(); return; }
    dt = Math.min(dt, 0.05);
    const R = PH.input.read5(); PH.input.endTick();
    const E = {}; for (const k of ['A', 'B', 'X', 'Y', 'LB', 'RB', 'LT', 'RT']) E[k] = R[k] && !T.prev[k];
    T.prev = R; T.R = R; T.E = E; T.dt = dt;
    uiTick();   // V3.9m C2 十字键战术呼叫
    // V3.9h 必杀技插画：和 1V1 一样冻结比赛约 1 秒（插画由 main.js 的 cutin() 显示），结束后 t5step 进入慢动作
    // V3.9o 专属插屏不再冻结 5V5：计时由 game.js t5step 推进
    camTurn(dt);
    T.time += dt; T.phaseT += dt;
    if (T.banner) { T.banner.age += dt; if (T.banner.age > T.banner.d) T.banner = null; }
    if (T.phase === 'qbreak' && T.phaseT > 2.2) { T.q++; subs(true); for (const tm of T.tm) for (const r of tm.ros) { r.fat = Math.max(0, (r.fat || 0) - TV.t5_fat_qb); r.stam = 100 - r.fat; if (r.p) r.p.stam = r.stam; } setupQuarter(); }
    if (T.phase === 'tip') {
      const b = G.ball, t = T.phaseT;
      b.state = 'ext'; b.x = 0; b.y = 0; b.z = t < 0.6 ? 1.9 + t * 4.2 - t * t * 2.5 : Math.max(2.5, 3.52 - (t - 0.6) * 1.5);
      if (t > 0.85) {
        const c0 = T.tm[0].on[4], c1 = T.tm[1].on[4], s0 = c0.h + c0.r.vert * 0.4 + rnd() * 0.3, s1 = c1.h + c1.r.vert * 0.4 + rnd() * 0.3, w = s0 >= s1 ? 0 : 1;
        if (T.tipW < 0) T.tipW = w;
        const tg = T.tm[w].on[0], dx = tg.x - b.x, dy = tg.y - b.y, dd = hyp(dx, dy) || 1;
        b.state = 'loose'; b.vx = dx / dd * 5; b.vy = dy / dd * 5; b.vz = 0.5; b.z = 3.3; b.lastTouch = T.tm[w].on[4].id; b.dead = false; b.noPick = 0.15;
        T.phase = 'live'; T.phaseT = 0; G.phase = 'live'; T.trans = true; T.transT = T.time; T.tipAt = T.time; T.tipWin = w; A5.sfx('whistle');
      }
    }
    if (T.phase === 'live' || T.phase === 'inb') { defTick(); playTick(); assignOpps(); }
    T.passTgt = null;
    const ctl0 = T.ctl;   // V4.1 本帧开头快照控制人：传球当帧切到接球人时，接球人不会再用同一个按键边沿跑一遍 humanInp
    const inps = ps().map((p) => (p === ctl0 && T.hum >= 0 && T.phase !== 'over' && T.phase !== 'qbreak' && !(T.phase === 'dead' && T.next && T.next.by === p) ? humanInp(p) : cpuInp(p, dt)));   // V3.9l 死球时发球人（哪怕是用户正控制的人）自动走去捡球 / 发球点
    if (T.phase !== 'live' && T.phase !== 'inb') T.icon = false;
    // V3.9h 死球 / 发球阶段不瞬移：身体碰撞的分离推挤也限制在跑速以内（每帧位移 ≤ 9.5 米/秒 × dt）
    const dz = T.phase === 'dead' || T.phase === 'inb', p0 = dz ? ps().map((p) => [p.x, p.y]) : null;
    if (T.phase === 'live') dblC();
    const ok = A5.step(inps, dt);
    if (T.phase !== 'over') dblPost();
    lineGuard();
    if (p0) { const cap = 9.5 * dt; ps().forEach((p, i) => { const dx = p.x - p0[i][0], dy = p.y - p0[i][1], l = hyp(dx, dy); if (l > cap) { p.x = p0[i][0] + dx / l * cap; p.y = p0[i][1] + dy / l * cap; } }); }
    if (!ok) return;
    passUpdate(dt);
    if (PH.scr && PH.scr.step) PH.scr.step(T, dt);   // 无球掩护检测 / 掩护统计（render.js）
    csTick(); if (PH.B5) PH.B5.tick(T, dt); shotAdj(); preCatch(); catchPose();
    { const L = T.lastPass; if (L && !L.pa && T.time - L.t < 4 && shooting(L.to) && L.from.rk && aOk(L)) { L.pa = true; L.from.rk.st.pAst++; if (L.rec) { L.rec.sh = 1; L.rec.sh3 = three(L.to.x, L.to.y) ? 1 : 0; let od = 9; for (const d of defs()) od = Math.min(od, dist(d, L.to)); L.rec.shOpen = +od.toFixed(2); } } }
    rules(dt);
  }

  // ---------- 导出 ----------
  function state() {
    if (!T.tm) return { on: false };
    const b = G.ball, h = holder(), w = (p) => { const q = toW(p.x, p.y); return { X: +q.X.toFixed(2), Y: +q.Y.toFixed(2) }; };
    return { on: T.on, phase: T.phase, q: T.q, gclock: Math.round(T.gclock * 10) / 10, sclock: Math.round(T.sclock * 10) / 10, off: G.off, dir: T.dir.slice(),
      score: [T.tm[0].score, T.tm[1].score], teams: [T.tm[0].ab, T.tm[1].ab], hum: T.hum, cam: Object.assign({}, CAMS), icon: T.icon,
      ball: { st: b.state, x: +b.x.toFixed(2), y: +b.y.toFixed(2), z: +b.z.toFixed(2), h: h ? h.key : null, ht: h ? h.tm : -1, pass: T.ps ? T.ps.kind : null },
      ctl: T.ctl ? { key: T.ctl.key, t: T.ctl.tm, slot: T.ctl.slot, id: T.ctl.id, act: T.ctl.action ? T.ctl.action.type + (T.ctl.action.kind ? ':' + T.ctl.action.kind : '') : null, stance: !!T.ctl.stance, post: !!T.ctl.post, charge: !!T.ctl.charge, mark: T.ctl.mark ? T.ctl.mark.key : null, x: +T.ctl.x.toFixed(2), y: +T.ctl.y.toFixed(2), sprint: !!(T.R && T.R.RT) } : null,
      pick: T.pick ? { s: T.pick.s.key, ph: T.pick.ph } : null, dbl: T.dbl ? T.dbl.p.key : null, help: T.help ? T.help.p.key : null, trans: T.trans, cnt: Object.assign({}, T.cnt), over: T.over, winner: T.winner,
      onCourt: T.tm.map((tm) => tm.on.map((p) => Object.assign({ key: p.key, slot: p.slot, x: +p.x.toFixed(2), y: +p.y.toFixed(2), stam: Math.round(p.stam), act: p.action ? p.action.type : null }, w(p)))) };
  }
  const POSN = ['', 'PG', 'SG', 'SF', 'PF', 'C'];
  // V3.9h 只读数据汇总：双方每人（含替补）数据 + 是否在场 / 体力 / 位置 / OVR / 是否在换人队列；数组上挂 .team 合计
  function box(t) {
    const pendK = new Set(T.subQ.filter((q) => q.tm === t).map((q) => q.out).concat(T.subPend && T.subPend.tm === t ? T.subPend.plan.map((x) => x.out.key) : []));
    const rows = T.tm[t].ros.map((r) => {
      const s = Object.assign({}, r.st), g = r.p && G.stats[r.p.id];
      if (g) { s.reb += g.reb; s.oreb += g.oreb; s.dreb += g.dreb || 0; s.stl += g.stl; s.blk += g.blk; s.fgm += g.fg; s.fga += g.fga; s.tpm += g.tp; s.tpa += g.tpa; s.tov += g.tov; }
      return Object.assign({ key: r.key, name: r.a.name, num: r.a.num, starter: r.starter, on: r.slot >= 0, slot: r.slot, pos: POSN[pv(r.a)] || 'SF', ovr: r.a.ovr, stam: Math.round(r.p ? r.p.stam : r.stam), min: r.st.sec / 60, pend: pendK.has(r.key), fat: Math.round(r.fat || 0) }, s, { ftm: null, fta: null, pf: null });   // 没有罚球 / 犯规机制：FT、PF 返回 null（UI 隐藏）
    });
    const team = {}; for (const r of rows) for (const k in r) if (typeof r[k] === 'number' && k !== 'num' && k !== 'slot' && k !== 'ovr' && k !== 'stam') team[k] = (team[k] || 0) + r[k];
    rows.team = team;
    return rows;
  }
  function setCam(o) {
    o = o || {};
    const np = o.preset == null ? CAMS.preset : o.preset === '2k' ? '2k' : 'broadcast';
    if (np !== CAMS.preset) { CAMS.mem[CAMS.preset] = { zoom: CAMS.zoom, height: CAMS.height }; CAMS.preset = np; CAMS.zoom = CAMS.mem[np].zoom; CAMS.height = CAMS.mem[np].height; }
    if (o.zoom != null) CAMS.zoom = o.zoom; if (o.height != null) CAMS.height = o.height;
    // V3.9f 2K 镜头：高度 10 是实机取景，滑条在它两边调（0–20）；转播镜头仍是 0–10
    CAMS.zoom = clamp(Math.round(CAMS.zoom), 0, 10); CAMS.height = clamp(Math.round(CAMS.height), 0, CAMS.preset === '2k' ? 20 : 10);
    CAMS.mem[CAMS.preset] = { zoom: CAMS.zoom, height: CAMS.height };
  }
  function resetCam() { CAMS.mem = JSON.parse(JSON.stringify(CAM_DEF5)); CAMS.preset = '2k'; CAMS.zoom = 5; CAMS.height = 10; }
  // V3.9e 2K 镜头朝向 phi（世界坐标里的角度，0 = 朝 +X 篮筐）。球权转换后用 0.5 秒平滑转 180 度，t ≥ 0 表示正在转
  function camTurn(dt) {
    const tg = T.dir[G.off] === 1 ? 0 : Math.PI;
    if (!T.c2) T.c2 = { phi: tg, from: tg, to: tg, t: -1 };
    const C = T.c2;
    if (C.t < 0) {
      let df = tg - C.phi; df = Math.atan2(Math.sin(df), Math.cos(df));
      if (Math.abs(df) > 0.01) { C.from = C.phi; C.to = C.phi + (Math.abs(df) > 3 ? Math.PI : df); C.t = 0; }   // 半圈翻转固定逆时针转
    }
    if (C.t >= 0) {
      C.t += dt; const u = Math.min(1, C.t / 0.5), e = u * u * (3 - 2 * u);
      C.phi = C.from + (C.to - C.from) * e;
      if (u >= 1) { C.phi = Math.atan2(Math.sin(C.to), Math.cos(C.to)); C.t = -1; }
    }
  }
  PH.T5 = { DBG: DBG, K5: K5, CATCH: CATCH, defSet: defSet, PNR_CN: PNR_CN, PLAYS: PLAYS, PLAY_CN: PLAY_CN, PLAY_W: PLAY_W, plStart: plStart, plHud: plHud, barItems: barItems, teamStyle: teamStyle, T: T, start: start, stop: stop, tick: tick, state: state, box: box, teamList: teamList, lineup: function (ab) { return lineup(ab); }, CL: CL, CW: CW, HX: HX, HZ: HZ,
    setCtl: setCtl, sub: sub, unsub: unsub, CAMS: CAMS, setCam: setCam, resetCam: resetCam, stick: function (x, y) { return stick(x, y); }, toW: toW, fromW: fromW, ICON: ICON, holder: holder, doPass: doPass, callPick: callPick, PASS: PASS, SPOT: SPOT };
  // V3.9r 挡拆加强（render.js PH.scr.hit 读这里）：分档门槛下调 → 中档 / 重档更多；停滞 dK、stun sK ×1.4；重档弹开 ×1.15，中档也往后顶一点
  PH.T5.scrCfg = { TH: [0.5, 1.0, 1.9], dK: 1.4, sK: 1.4, pK: 1.15, p2: 0.5 };
  PH.T5.CSB = CSB; PH.T5.TV = TV; PH.T5.T5REG = T5REG;   // V4.0 b5.js 读 CSB.g 算总上限
  // V4.0 TUNE → 对象表（原地改，render.js / b5.js 持有的引用不变）
  function t5Sync() {
    for (const z in K5) { const k = K5[z]; k.c = TV['t5_k5_' + z + '_c']; k.p = TV['t5_k5_' + z + '_p']; k.blk = TV['t5_k5_' + z + '_blk']; }
    for (let i = 1; i <= 4; i++) { CSB.g[i] = TV['t5_csb_g' + i]; CSB.p[i] = TV['t5_csb_p' + i]; CSB.t[i] = TV['t5_csb_t' + i]; }
    for (const k in PASS) PASS[k].v = TV['t5_pv_' + k];
    ISO_K.s = TV.t5_iso_s; ISO_K.h = TV.t5_iso_h; ISO_K.b = TV.t5_iso_b; ISO_K.c = TV.t5_iso_c;
    ACC5.up = TV.t5_acc_up; ACC5.upA = TV.t5_acc_upA; ACC5.dn = TV.t5_acc_dn;
    const C = PH.T5.scrCfg; C.TH[0] = TV.t5_scr_th1; C.TH[1] = TV.t5_scr_th2; C.TH[2] = TV.t5_scr_th3; C.dK = TV.t5_scr_dK; C.sK = TV.t5_scr_sK; C.pK = TV.t5_scr_pK; C.p2 = TV.t5_scr_p2;
  }
  t5Tune(); t5Sync();
})();
