import type { Fact, RiskCard, Severity } from '@/types/research';
import { factOf, factValue, yoy } from './signals';

/**
 * 跨期分析层（确定性计算，v1）。
 *
 * 单年管线产出的是「事实点」，本层把多年事实对齐为时间序列，并计算三类跨期信号：
 * - 裂口：应收增速 − 收入增速连续两年为正；
 * - 背离：区间累计归母净利 vs 累计经营现金流（利润变现率）；
 * - 稳定度：毛利率在收入大幅波动下的异常稳定。
 * 另有事件轴（审计意见 / 差错更正 / 监管处罚 / 资金占用 / 洗大澡）与组合结论卡。
 *
 * 铁律与 signals.ts 相同：模型不参与计算，所有数字由程序确认并锚定原文。
 */

export interface YearEvent {
  year: number;
  kind: 'audit' | 'restatement' | 'regulatory' | 'occupation' | 'bath' | 'restateDiff';
  text: string;
  severity: Severity;
  factId?: string;
}

/** 跨报告数据分歧：同一指标同一年份，在不同年度年报中披露的数值不一致 */
export interface CrossDocDiff {
  label: string;
  year: number;
  /** 披露出分歧数值的报告年度（取最晚者） */
  reportYear: number;
  versions: { fy: number; value: number; unit: string; factId: string }[];
}

export interface DivergencePoint {
  year: number;
  cumProfit: number;
  cumOcf: number;
  gap: number;
}

export interface MultiYearAnalysis {
  /** 有年报文档的会计年度（升序） */
  docYears: number[];
  /** 事实覆盖的全部年度（含比较期数据，升序）——图表用 */
  allYears: number[];
  /** 累计背离序列（亿元） */
  divergence: DivergencePoint[];
  /** 应收/收入占比（%） */
  arRatio: { year: number; ratio: number; factId?: string }[];
  /** 应收裂口明细：应收增速 − 收入增速（pp） */
  arGap: { year: number; arG: number; revG: number; gap: number }[];
  /** 区间利润变现率 = 累计经营现金流 / 累计归母净利（%）；累计净利 ≤0 时无意义 */
  profitRealization?: number;
  cumProfit: number;
  cumOcf: number;
  /** 毛利率标准差（pp） */
  gmStd?: number;
  /** 毛利率序列 */
  gmSeries: { year: number; value: number; factId: string }[];
  /** 洗大澡嫌疑年 */
  bathYear?: { year: number; loss: number; pctOfNetAssets: number };
  events: YearEvent[];
  /** 跨报告数据分歧（追溯重述的量化证据） */
  diffs: CrossDocDiff[];
  /** 跨期风险卡（含组合卡） */
  cards: RiskCard[];
  /** 组合卡是否触发（盈余管理三件套同时成立） */
  comboTriggered: boolean;
}

const r1 = (n: number) => Math.round(n * 10) / 10;
const r2 = (n: number) => Math.round(n * 100) / 100;

function std(xs: number[]): number {
  if (xs.length === 0) return 0;
  const m = xs.reduce((a, b) => a + b, 0) / xs.length;
  return Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / xs.length);
}

/**
 * @param facts   多年合并事实（mergeFacts 产物）
 * @param docYears 有年报文档的会计年度；不传则取事实覆盖的全部年度
 * @param docs    各年报的分文档事实（ fiscalYear + facts ），用于跨报告分歧检测
 */
export function analyzeMultiYear(
  facts: Fact[],
  docYears?: number[],
  docFacts?: { fiscalYear?: number; facts: Fact[] }[],
): MultiYearAnalysis {
  const allYears = [...new Set(facts.map((f) => f.year))].sort((a, b) => a - b);
  const docs = (docYears && docYears.length > 0 ? [...docYears] : allYears).sort((a, b) => a - b);

  // ---- 累计背离：净利 vs 经营现金流 ----
  const divergence: DivergencePoint[] = [];
  let cumProfit = 0;
  let cumOcf = 0;
  let hasProfit = false;
  let hasOcf = false;
  for (const y of allYears) {
    const np = factValue(facts, '归母净利润', y);
    const ocf = factValue(facts, '经营活动现金流净额', y);
    if (np !== undefined) { cumProfit += np; hasProfit = true; }
    if (ocf !== undefined) { cumOcf += ocf; hasOcf = true; }
    if (hasProfit && hasOcf) {
      divergence.push({ year: y, cumProfit: r2(cumProfit), cumOcf: r2(cumOcf), gap: r2(cumProfit - cumOcf) });
    }
  }
  const profitRealization =
    hasProfit && hasOcf && cumProfit > 0 ? r1((cumOcf / cumProfit) * 100) : undefined;

  // ---- 应收裂口与应收/收入比 ----
  const arGap: MultiYearAnalysis['arGap'] = [];
  const arRatio: MultiYearAnalysis['arRatio'] = [];
  for (const y of allYears) {
    const rev = factValue(facts, '营业收入', y);
    const ar = factValue(facts, '应收账款', y);
    if (rev !== undefined && ar !== undefined && rev > 0) {
      arRatio.push({ year: y, ratio: r1((ar / rev) * 100), factId: factOf(facts, '应收账款', y)?.id });
    }
    const arG = yoy(facts, '应收账款', y);
    const revG = yoy(facts, '营业收入', y);
    if (arG !== undefined && revG !== undefined) {
      arGap.push({ year: y, arG, revG, gap: r1(arG - revG) });
    }
  }

  // ---- 毛利率稳定度 ----
  const gmSeries = allYears.flatMap((y) => {
    const f = factOf(facts, '毛利率', y);
    return f ? [{ year: y, value: f.value, factId: f.id }] : [];
  });
  const gmStd = gmSeries.length >= 3 ? r2(std(gmSeries.map((g) => g.value))) : undefined;

  // ---- 洗大澡检测：当年巨亏且吞掉上年末净资产的 15% 以上 ----
  let bathYear: MultiYearAnalysis['bathYear'];
  for (const y of docs) {
    const np = factValue(facts, '归母净利润', y);
    const assets = factValue(facts, '资产总计', y - 1);
    const liab = factValue(facts, '负债合计', y - 1);
    if (np !== undefined && np < 0 && assets !== undefined && liab !== undefined) {
      const netAssets = assets - liab;
      if (netAssets > 0 && Math.abs(np) > 0.15 * netAssets) {
        bathYear = { year: y, loss: np, pctOfNetAssets: r1((Math.abs(np) / netAssets) * 100) };
      }
    }
  }

  // ---- 跨报告分歧检测：同一指标同一年份，不同年报披露的数值不一致（>2%） ----
  const diffs: CrossDocDiff[] = [];
  if (docFacts && docFacts.length > 1) {
    const byKey = new Map<string, { fy: number; value: number; unit: string; factId: string }[]>();
    for (const d of docFacts) {
      if (d.fiscalYear === undefined) continue;
      for (const f of d.facts) {
        // 文字型事实（单位即内容）不参与数值分歧
        if (f.unit === '已披露' || f.label === '审计意见') continue;
        const key = `${f.label}|${f.year}`;
        const arr = byKey.get(key) ?? [];
        if (!arr.some((v) => v.fy === d.fiscalYear)) {
          arr.push({ fy: d.fiscalYear, value: f.value, unit: f.unit, factId: f.id });
          byKey.set(key, arr);
        }
      }
    }
    for (const [key, versions] of byKey) {
      if (versions.length < 2) continue;
      const vals = versions.map((v) => v.value);
      const maxAbs = Math.max(...vals.map(Math.abs), 1e-9);
      const spread = (Math.max(...vals) - Math.min(...vals)) / maxAbs;
      if (spread <= 0.02) continue;
      const [label, ys] = key.split('|');
      versions.sort((a, b) => a.fy - b.fy);
      diffs.push({ label, year: parseInt(ys, 10), reportYear: versions[versions.length - 1].fy, versions });
    }
    // 影响最大的排前面
    diffs.sort((a, b) => {
      const imp = (d: CrossDocDiff) => {
        const vals = d.versions.map((v) => v.value);
        return (Math.max(...vals) - Math.min(...vals)) / Math.max(...vals.map(Math.abs), 1e-9);
      };
      return imp(b) - imp(a);
    });
  }

  // ---- 事件轴（每年治理事实 + 洗大澡） ----
  const events: YearEvent[] = [];
  for (const y of docs) {
    const audit = factOf(facts, '审计意见', y);
    if (audit) {
      const clean = audit.unit.includes('无保留');
      events.push({
        year: y, kind: 'audit', factId: audit.id,
        text: clean ? '标准无保留意见' : `非标意见：${audit.unit}`,
        severity: clean ? 'low' : 'high',
      });
    }
    const restate = factOf(facts, '会计差错更正', y);
    if (restate) events.push({ year: y, kind: 'restatement', factId: restate.id, text: '会计差错更正', severity: 'high' });
    const reg = factOf(facts, '监管调查与处罚', y);
    if (reg) events.push({ year: y, kind: 'regulatory', factId: reg.id, text: '立案调查 / 行政处罚披露', severity: 'high' });
    const occ = factOf(facts, '控股股东资金占用', y);
    if (occ) events.push({ year: y, kind: 'occupation', factId: occ.id, text: '资金占用披露', severity: 'high' });
  }
  if (bathYear) {
    events.push({
      year: bathYear.year, kind: 'bath', severity: 'high',
      text: `巨亏 ${Math.abs(bathYear.loss)} 亿元（≈上年末净资产 ${bathYear.pctOfNetAssets}%），洗大澡嫌疑`,
    });
  }
  // 跨报告分歧入轴（取影响最大的 5 条）
  for (const d of diffs.slice(0, 5)) {
    const first = d.versions[0];
    const last = d.versions[d.versions.length - 1];
    events.push({
      year: d.reportYear, kind: 'restateDiff', severity: 'high', factId: last.factId,
      text: `${d.reportYear} 年报将 ${d.year} 年${d.label}由 ${first.value}${first.unit} 重述为 ${last.value}${last.unit}`,
    });
  }

  // ---- 跨期风险卡 ----
  const cards: RiskCard[] = [];
  const ev = (...pairs: [string, number][]) =>
    pairs.map(([l, y]) => factOf(facts, l, y)?.id).filter((x): x is string => Boolean(x));

  // X1：应收裂口连续两年
  const gapHits = arGap.filter((g) => g.gap > 10);
  let arGapPersist = false;
  for (let i = 1; i < gapHits.length; i++) {
    if (gapHits[i].year - gapHits[i - 1].year === 1) arGapPersist = true;
  }
  if (arGapPersist) {
    const span = `${gapHits[0].year}–${gapHits[gapHits.length - 1].year}`;
    cards.push({
      id: 'rc-x-ar-gap',
      title: '应收增速连续跑赢收入增速（跨期裂口）',
      severity: 'high',
      ruleId: 'x-ar-gap-persist',
      signal: `${span} 年间，应收账款增速连续超过营业收入增速：${gapHits.map((g) => `${g.year} 年应收 ${g.arG > 0 ? '+' : ''}${g.arG}% vs 收入 ${g.revG > 0 ? '+' : ''}${g.revG}%（裂口 ${g.gap}pp）`).join('；')}。`,
      evidenceFactIds: ev(...gapHits.flatMap((g): [string, number][] => [['应收账款', g.year], ['应收账款', g.year - 1], ['营业收入', g.year], ['营业收入', g.year - 1]])),
      explanation: [
        '收入扩张年复一年停留在应收环节，收入向现金的转化持续恶化，不是单年偶发。',
        '连续多年裂口是虚增收入或激进信用政策的典型痕迹——真实扩张的应收终会回款收敛。',
      ],
      counterExplanation: [
        '若下游客户结构在这些年发生根本变化（如转向长账期大客户），裂口可有商业解释。',
        '需看各年账龄表：若长账龄占比未同步恶化，风险等级下调。',
      ],
      questions: [
        '各年应收账款前五名欠款方是谁？是否存在同一批客户持续拖欠？',
        '期后回款率（次年收回比例）是否逐年下降？',
        '坏账准备计提比例是否随账龄恶化而同步提高？',
      ],
      boundary: '程序只确认「增速差连续两年为正」这一相对关系，不构成收入造假的定性；需结合账龄、客户与期后回款核实。',
    });
  }

  // X2：利润与现金的长期背离
  if (profitRealization !== undefined && divergence.length >= 2 && profitRealization < 60) {
    cards.push({
      id: 'rc-x-profit-cash',
      title: '区间利润长期未变现（累计净利 vs 累计经营现金流）',
      severity: 'high',
      ruleId: 'x-profit-cash-gap',
      signal: `${divergence[0].year}–${divergence[divergence.length - 1].year} 年累计归母净利润 ${r2(cumProfit)} 亿元，累计经营现金流净额仅 ${r2(cumOcf)} 亿元，利润变现率 ${profitRealization}%。`,
      evidenceFactIds: ev(...divergence.flatMap((d): [string, number][] => [['归母净利润', d.year], ['经营活动现金流净额', d.year]])),
      explanation: [
        '利润是意见，现金是事实：多年累计利润的变现率过低，说明账面利润大量停留在应收/存货等资产形态。',
        '健康企业在完整周期内累计经营现金流通常覆盖累计净利润；长期覆盖不足是盈余质量差的硬信号。',
      ],
      counterExplanation: [
        '高速扩张期的营运资本吞占会暂时压低变现率，但扩张结束后应收应收敛为现金。',
        '需剔除票据结算、供应链金融等结算方式变化的影响后再判断。',
      ],
      questions: [
        '累计未变现利润沉淀在哪个科目？应收、存货还是其他？',
        '销售商品收到的现金 / 营业收入（收现比）逐年如何变化？',
        '是否存在通过关联方或保理出表调节现金流的行为？',
      ],
      boundary: '变现率是区间汇总指标，不能定位到单笔收入；它证明「利润质量差」，不直接证明「利润是假的」。',
    });
  }

  // X3：毛利率异常稳定
  // 剔除单点离群年（如洗大澡年）再评估：造假期毛利率纹丝不动、出清年一次性崩塌，恰是典型指纹；
  // 用全期 σ 反而会被出清年的崩盘「洗白」。
  let gmStable = false;
  let gmStdEff = gmStd;
  let gmExcludedYear: number | undefined;
  if (gmSeries.length >= 3 && gmStd !== undefined) {
    const vals = gmSeries.map((g) => g.value);
    const median = [...vals].sort((a, b) => a - b)[Math.floor(vals.length / 2)];
    let worst: { year: number; dev: number } | undefined;
    for (const g of gmSeries) {
      const dev = Math.abs(g.value - median);
      if (!worst || dev > worst.dev) worst = { year: g.year, dev };
    }
    const rest = gmSeries.filter((g) => g.year !== worst!.year);
    if (worst && worst.dev > 8 && rest.length >= 2) {
      const stdRest = r2(std(rest.map((g) => g.value)));
      if (stdRest < gmStd) {
        gmStdEff = stdRest;
        gmExcludedYear = worst.year;
      }
    }
  }
  if (gmStdEff !== undefined && gmStdEff < 3.0) {
    const revVals = allYears.map((y) => factValue(facts, '营业收入', y)).filter((v): v is number => v !== undefined);
    const revRange = revVals.length >= 2 ? (Math.max(...revVals) - Math.min(...revVals)) / Math.min(...revVals) : 0;
    if (revRange > 0.15) {
      gmStable = true;
      const exclNote = gmExcludedYear !== undefined ? `（剔除 ${gmExcludedYear} 年离群值后）` : '';
      cards.push({
        id: 'rc-x-gm-stable',
        title: '毛利率在收入大幅波动下异常稳定',
        severity: 'medium',
        ruleId: 'x-gm-stable',
        signal: `${gmSeries[0].year}–${gmSeries[gmSeries.length - 1].year} 年毛利率分别为 ${gmSeries.map((g) => `${g.value}%`).join(' / ')}，标准差仅 ${gmStdEff}pp${exclNote}；同期收入从 ${Math.min(...revVals)} 亿元波动至 ${Math.max(...revVals)} 亿元。`,
        evidenceFactIds: gmSeries.map((g) => g.factId),
        explanation: [
          '制造业毛利率受价格竞争、原材料、产能利用率牵引，天然波动；收入大幅起落而毛利率纹丝不动，违背经营常识。',
          '异常稳定的毛利率可能来自成本的人为平滑（如存货计价调节）或收入成本的同比例虚构。',
        ],
        counterExplanation: [
          '若产品定价为「成本加成」长协模式，毛利率确有制度性稳定的可能。',
          '需对比同行业可比公司同期毛利率波动幅度后再下结论。',
        ],
        questions: [
          '分产品毛利率各年如何变化？是否同样稳定？',
          '单位成本与售价的年度变化率是否惊人地同步？',
          '存货计价方法与跌价准备政策这些年是否发生过变化？',
        ],
        boundary: '稳定度是统计特征而非事实错误；它提示「值得追问」，不构成任何定性。',
      });
    }
  }

  // X4：洗大澡
  if (bathYear) {
    const { year, loss, pctOfNetAssets } = bathYear;
    cards.push({
      id: 'rc-x-bath',
      title: `${year} 年疑似「洗大澡」：一次性出清式巨亏`,
      severity: 'high',
      ruleId: 'x-bath',
      signal: `${year} 年归母净利润 ${loss} 亿元，亏损额相当于上年末净资产的 ${pctOfNetAssets}%。`,
      evidenceFactIds: ev(['归母净利润', year], ['资产总计', year - 1], ['负债合计', year - 1]),
      explanation: [
        '一次亏掉净资产的显著比例，常见于把历史累积问题（减值、坏账、商誉）集中在单年出清——「洗大澡」后为后续年度轻装上阵。',
        '巨亏年的减值明细往往藏着以前年度利润为何好看的答案。',
      ],
      counterExplanation: [
        '行业系统性崩塌（需求消失、技术替代）也会造成同级别亏损，需区分「出清」与「恶化」。',
        '若减值经审计充分论证且与外部事件对应，可能是真实经营结果。',
      ],
      questions: [
        '巨亏的构成是什么？商誉减值、应收减值、存货跌价各占多少？',
        '这些减值资产是哪些年度形成的？当年为何不计提？',
        '亏损次年是否立即扭亏——若是，出清动机进一步增强。',
      ],
      boundary: '程序确认「亏损额 / 上年净资产」的比例关系；是否构成盈余管理需看减值明细与对应年度的资产形成过程。',
    });
  }

  // X5：跨报告数据分歧（追溯重述的量化证据）
  const nonStdAudit = events.some((e) => e.kind === 'audit' && e.severity === 'high');
  if (diffs.length > 0) {
    const top = diffs.slice(0, 3);
    cards.push({
      id: 'rc-x-restate-diff',
      title: '历史数据被后续年报重述（跨报告数值分歧）',
      severity: 'high',
      ruleId: 'x-cross-restate',
      signal: `同一指标同一年份在不同年报中披露不一致：${top.map((d) => {
        const first = d.versions[0];
        const last = d.versions[d.versions.length - 1];
        return `${d.year} 年${d.label}由 ${first.fy} 年报的 ${first.value}${first.unit} 变为 ${last.fy} 年报的 ${last.value}${last.unit}`;
      }).join('；')}${diffs.length > 3 ? ` 等 ${diffs.length} 处` : ''}。`,
      evidenceFactIds: diffs.slice(0, 6).map((d) => d.versions[d.versions.length - 1].factId),
      explanation: [
        '同一年的数字在两份年报里不一样，说明至少有一份说了谎或犯了错——历史披露的可信度被公司自己推翻。',
        '重述若导致盈亏方向改变（盈转亏），则原披露期间的市场定价建立在错误信息之上。',
      ],
      counterExplanation: [
        '会计政策变更（新收入准则等）也会造成口径性重述，需看公司披露的重述原因归类。',
      ],
      questions: [
        '重述的归因是「会计政策变更」还是「前期差错更正」？后者严重得多。',
        '被重述年度的审计机构是否出具过专项说明？',
        '重述前后差异是否触发监管问询或立案？',
      ],
      boundary: '程序只做数值比对并呈现分歧事实；分歧成因以公司重述公告与审计专项说明为准。',
    });
  }

  // X6：组合结论——三条独立证据链同时成立才打出
  // ① 应收裂口连续 ② 毛利率异常稳定 ③ 数据可信度崩塌（重述分歧 / 非标意见 / 洗大澡任一）
  const trustBroken = diffs.length > 0 || nonStdAudit || bathYear !== undefined;
  const comboTriggered = arGapPersist && gmStable && trustBroken;
  if (comboTriggered) {
    const third = diffs.length > 0
      ? `历史数据被后续年报重述（${diffs.length} 处分歧）`
      : nonStdAudit
        ? '连续多年非标审计意见'
        : '出现一次性出清式巨亏（洗大澡嫌疑）';
    const span = `${docs[0]}–${docs[docs.length - 1]}`;
    cards.unshift({
      id: 'rc-x-combo',
      title: '推测：盈余管理风险极高',
      severity: 'high',
      ruleId: 'x-combo',
      signal: `${span} 年间三条独立证据链同时成立：① 应收增速连续多年跑赢收入（裂口 ${arGap.filter((g) => g.gap > 10).map((g) => `${g.year} 年 ${g.gap}pp`).join('、')}）；② 毛利率在收入大幅波动下异常稳定（σ=${gmStdEff}pp${gmExcludedYear !== undefined ? `，剔除 ${gmExcludedYear} 年离群值后` : ''}）；③ ${third}。三者互为印证，指向利润可能存在系统性美化。`,
      evidenceFactIds: [...new Set(cards.flatMap((c) => c.evidenceFactIds))].slice(0, 24),
      explanation: [
        '单看每一条信号都有无辜解释；三条独立证据链同时成立且互为因果（虚增收入→应收堆积→毛利率被人为稳定→历史数据被迫重述），无辜解释的概率极低。',
        '这是造假公司的典型财务指纹：利润持续增长、应收持续堆积、毛利率违背经营常识、报表被迫推倒重来。',
      ],
      counterExplanation: [
        '理论上存在极端商业情形同时解释三条信号（如长账期垄断客户 + 成本加成长协 + 政策性重述），需要逐一核实其商业实质。',
      ],
      questions: [
        '将三条证据链与监管文书交叉验证：哪些年份、哪些科目被事后更正？',
        '前五大客户与欠款方的工商背景是否与公司存在隐性关联？',
        '若以重述后数据重算历年增速与比率，真实经营轨迹如何？',
      ],
      boundary: '「推测」基于三条确定性证据链的联合印证，不构成违法违规的定性结论；最终认定以监管文书与司法程序为准。',
    });
  }

  return {
    docYears: docs,
    allYears,
    divergence,
    arRatio,
    arGap,
    profitRealization,
    cumProfit: r2(cumProfit),
    cumOcf: r2(cumOcf),
    gmStd,
    gmSeries,
    bathYear,
    events,
    cards,
    diffs,
    comboTriggered,
  };
}
