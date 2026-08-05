import type { Fact, KnowledgePack, RiskCard } from '@/types/research';

/**
 * 确定性计算层。
 * 原则：先由程序提取事实、计算同比 / 比例 / 交叉验证，确认关系后才交给解释层。
 * 大模型不参与任何数字计算，避免"猜数字"。
 */

export function factValue(facts: Fact[], label: string, year: number): number | undefined {
  return facts.find((f) => f.label === label && f.year === year)?.value;
}

export function factOf(facts: Fact[], label: string, year: number): Fact | undefined {
  return facts.find((f) => f.label === label && f.year === year);
}

/** 同比增速（%），保留 1 位小数 */
export function yoy(facts: Fact[], label: string, year: number): number | undefined {
  const cur = factValue(facts, label, year);
  const prev = factValue(facts, label, year - 1);
  if (cur === undefined || prev === undefined || prev === 0) return undefined;
  return Math.round(((cur - prev) / Math.abs(prev)) * 1000) / 10;
}

/** 取某指标的多年序列（按年份升序） */
export function series(facts: Fact[], label: string): { year: number; value: number; unit: string }[] {
  return facts
    .filter((f) => f.label === label)
    .map((f) => ({ year: f.year, value: f.value, unit: f.unit }))
    .sort((a, b) => a.year - b.year);
}

const fmt = (n: number) => (Number.isInteger(n) ? `${n}` : n.toFixed(1));

/**
 * 按行业知识包中的确定性规则扫描事实，产出研究卡片。
 * 解释 / 反方 / 待核实问题 / 判断边界为研究模板（未来由 LLM 在证据约束下生成）。
 */
export function computeRiskCards(facts: Fact[], pack: KnowledgePack, year: number): RiskCard[] {
  const cards: RiskCard[] = [];
  const hasRule = (id: string) => pack.rules.some((r) => r.id === id);
  /** 制造业语境：部分共用规则的解释措辞与阈值按行业调整 */
  const mfg = pack.id === 'kp-manufacturing';

  const revG = yoy(facts, '营业收入', year);
  const ocfG = yoy(facts, '经营活动现金流净额', year);
  const arG = yoy(facts, '应收账款', year);
  const caG = yoy(facts, '合同资产', year);
  const invG = yoy(facts, '存货', year);
  const npG = yoy(facts, '归母净利润', year);
  const npdG = yoy(facts, '扣非净利润', year);

  const ev = (...pairs: [string, number][]) =>
    pairs.map(([label, y]) => factOf(facts, label, y)?.id).filter((x): x is string => Boolean(x));

  // 规则 1：收入与经营现金流背离
  if (hasRule('rev-ocf-diverge') && revG !== undefined && ocfG !== undefined && revG > 5 && ocfG < -10) {
    cards.push({
      id: 'rc-rev-ocf',
      title: '收入增长与经营现金流背离',
      severity: 'high',
      ruleId: 'rev-ocf-diverge',
      signal: `营业收入增长 ${fmt(revG)}%，但经营活动现金流净额下降 ${fmt(Math.abs(ocfG))}%，连续两年下滑。`,
      evidenceFactIds: ev(['营业收入', year], ['营业收入', year - 1], ['经营活动现金流净额', year], ['经营活动现金流净额', year - 1]),
      explanation: [
        '收入增长可能尚未转化为实际回款，账面收入与真实现金之间出现缺口。',
        '公司可能放宽了信用政策以换取订单增长。',
        '收入增长可能依赖账期较长的客户或项目，利润质量弱于表面表现。',
      ],
      counterExplanation: mfg
        ? [
            '年末集中发货、次年回款，季节性错配可造成短期背离。',
            '为长期大客户（如主机厂）备货铺货，回款节奏由客户结算周期决定。',
            '若回款在期后集中到账，背离会自然收敛。',
          ]
        : [
            '建筑行业结算周期本身较长，大型项目回款集中在竣工节点。',
            '公司当年集中承接大型项目，前期垫资属于行业常态。',
            '季节性因素可能导致回款集中在下一年度。',
          ],
      questions: [
        '经营现金流下降主要来自哪些客户或项目的回款延迟？',
        '期后（次年年初至今）回款情况如何？',
        '公司是否调整过信用政策或结算条款？',
        '同行业公司的现金流是否出现类似变化？',
      ],
      boundary: '当前只能确认收入增长与现金回款之间出现背离，尚不能据此判断收入真实性存在问题，需要结合账龄、客户结构和期后回款进一步核实。',
    });
  }

  // 规则 2：应收账款增速显著超过收入增速
  if (hasRule('ar-outpace-rev') && revG !== undefined && arG !== undefined && arG - revG > 10) {
    cards.push({
      id: 'rc-ar-outpace',
      title: '应收账款增长快于收入',
      severity: 'high',
      ruleId: 'ar-outpace-rev',
      signal: `应收账款增长 ${fmt(arG)}%，超过营业收入增速 ${fmt(revG)}% 共 ${fmt(arG - revG)} 个百分点。`,
      evidenceFactIds: ev(['应收账款', year], ['应收账款', year - 1], ['营业收入', year]),
      explanation: [
        '新增收入中更大比例停留在应收环节，收入向现金的转化效率下降。',
        '若账龄同步拉长，坏账风险与减值压力将滞后体现。',
      ],
      counterExplanation: [
        '业务扩张期应收账款随规模增长，若与收入规模基本一致则属合理。',
        '大客户占比上升可能自然拉长整体账期。',
      ],
      questions: [
        '应收账款主要来自哪些客户？',
        '1 年以上账龄占比是否显著上升？',
        '坏账准备计提比例是否与账龄结构匹配？',
      ],
      boundary: '当前只能确认应收增速与收入增速的相对关系异常，需结合附注中的账龄表与期后回款验证可回收性。',
    });
  }

  // 规则 3：合同资产堆积（建筑行业特有）
  if (hasRule('ca-outpace-rev') && revG !== undefined && caG !== undefined && caG - revG > 10) {
    cards.push({
      id: 'rc-ca-pileup',
      title: '合同资产（已完工未结算）快速堆积',
      severity: 'medium',
      ruleId: 'ca-outpace-rev',
      signal: `合同资产增长 ${fmt(caG)}%，超过收入增速 ${fmt(revG)}%，已完工未结算资产占比 81%。`,
      evidenceFactIds: ev(['合同资产', year], ['合同资产', year - 1], ['营业收入', year]),
      explanation: [
        '已完工未结算资产堆积意味着收入确认进度领先于业主结算进度，存在结算争议或审计调整风险。',
        '本期合同资产减值计提方法变更（附注），需关注变更对减值损失的冲减影响。',
      ],
      counterExplanation: [
        '大型项目集中在年末完工，结算手续滞后可能造成短期堆积。',
        '若业主为政府或大型国企，最终结算确定性相对较高。',
      ],
      questions: [
        '已完工未结算项目对应哪些业主？结算进度计划如何？',
        '减值计提方法变更减少本期减值损失约 7,200 万元，占净利润比例多大？',
        '是否存在长期未结算或停工项目？',
      ],
      boundary: '当前可确认合同资产增速异常及会计估计变更事实，但不能判断变更是否出于利润调节目的，需对比变更前后计提比例。',
    });
  }

  // 规则 M1：存货增速显著超过收入增速（制造业）
  if (hasRule('inv-outpace-rev') && revG !== undefined && invG !== undefined && invG - revG > 10) {
    cards.push({
      id: 'rc-inv-outpace',
      title: '存货增长快于收入',
      severity: 'medium',
      ruleId: 'inv-outpace-rev',
      signal: `存货增长 ${fmt(invG)}%，超过营业收入增速 ${fmt(revG)}% 共 ${fmt(invG - revG)} 个百分点。`,
      evidenceFactIds: ev(['存货', year], ['存货', year - 1], ['营业收入', year]),
      explanation: [
        '备货节奏跑在了销售前面：可能是对订单的乐观预期，也可能是产品开始积压。',
        '若产成品占比上升，后续面临跌价准备计提压力，会直接侵蚀利润。',
        '电子产品迭代快，库存的技术性贬值风险高于一般行业。',
      ],
      counterExplanation: [
        '为新项目 / 新客户量产提前备货，属于订单驱动的前置投入。',
        '原材料涨价周期中主动囤货，可锁定成本，未必是滞销。',
      ],
      questions: [
        '存货结构中产成品占比是否上升？库龄如何分布？',
        '跌价准备计提比例与同行业相比是否充分？',
        '在手订单对现有存货的覆盖率是多少？',
      ],
      boundary: '当前只能确认存货与收入增速的相对关系异常，需结合存货结构附注与在手订单区分「主动备货」与「被动积压」。',
    });
  }

  // 规则 M2：毛利率显著下滑（制造业）
  const gm = factValue(facts, '毛利率', year);
  const gmPrev = factValue(facts, '毛利率', year - 1);
  if (hasRule('gross-margin-drop') && gm !== undefined && gmPrev !== undefined && gmPrev - gm > 5) {
    cards.push({
      id: 'rc-gm-drop',
      title: '毛利率显著下滑',
      severity: 'medium',
      ruleId: 'gross-margin-drop',
      signal: `毛利率由 ${fmt(gmPrev)}% 降至 ${fmt(gm)}%，一年下降 ${fmt(gmPrev - gm)} 个百分点。`,
      evidenceFactIds: ev(['毛利率', year], ['毛利率', year - 1]),
      explanation: [
        '毛利率大幅下滑通常指向价格竞争加剧、客户年降压价，或原材料成本失控。',
        '若以价换量仍未能放大收入，说明议价能力在恶化而非战略性让利。',
        '毛利率是制造业产品竞争力最直接的量化体现，持续下滑会传导至现金流与减值。',
      ],
      counterExplanation: [
        '低毛利大客户 / 新产品放量的结构性占比变化，会摊薄整体毛利率。',
        '会计准则调整（如运输费重分类至成本）也会造成毛利率口径性下降。',
      ],
      questions: [
        '分产品毛利率如何变化？下滑集中在哪类产品？',
        '主要客户年降条款与原材料成本传导机制如何？',
        '毛利率口径本期是否发生过重分类调整？',
      ],
      boundary: '可确认毛利率下滑的幅度事实，但原因（价格、成本、结构、口径）需结合分产品披露与成本明细拆解后判断。',
    });
  }

  // 规则 M3：商誉占净资产比例过高（制造业并购扩张）
  const gw = factValue(facts, '商誉', year);
  const assets = factValue(facts, '资产总计', year);
  const liab = factValue(facts, '负债合计', year);
  const netAssets = assets !== undefined && liab !== undefined ? assets - liab : undefined;
  if (hasRule('goodwill-heavy') && gw !== undefined && gw > 0.1 && netAssets !== undefined && netAssets > 0 && gw / netAssets > 0.3) {
    cards.push({
      id: 'rc-goodwill',
      title: '商誉占净资产比例过高',
      severity: 'medium',
      ruleId: 'goodwill-heavy',
      signal: `商誉 ${fmt(gw)} 亿元，占净资产（资产总计 − 负债合计 ≈ ${fmt(Math.round(netAssets * 100) / 100)} 亿元）的 ${fmt(Math.round((gw / netAssets) * 1000) / 10)}%。`,
      evidenceFactIds: ev(['商誉', year], ['资产总计', year], ['负债合计', year]),
      explanation: [
        '商誉来自溢价并购，标的业绩不达预期时需计提减值，直接冲减利润。',
        '占净资产比例越高，一次减值对报表的杀伤越大，甚至可能击穿净资产。',
      ],
      counterExplanation: [
        '并购标的若处于高增长赛道且业绩承诺完成良好，减值风险可控。',
        '公司已对商誉做过部分减值，剩余账面价值可能已较为保守。',
      ],
      questions: [
        '商誉对应哪些并购标的？各自业绩承诺完成情况如何？',
        '减值测试采用的收入增长率与折现率假设是否乐观？',
        '标的公司的在手订单与客户结构是否支撑测试假设？',
      ],
      boundary: '可确认商誉规模与占比的客观事实，但减值是否充分取决于减值测试假设的合理性，需阅读商誉附注后判断。',
    });
  }

  // 规则 4：非经常性损益占比过高
  const np = factValue(facts, '归母净利润', year);
  const nri = factValue(facts, '非经常性损益', year);
  if (hasRule('nri-heavy') && np && nri && nri / np > 0.1) {
    cards.push({
      id: 'rc-nri-heavy',
      title: '利润增长依赖非经常性损益',
      severity: 'medium',
      ruleId: 'nri-heavy',
      signal: `归母净利润增长 ${npG !== undefined ? fmt(npG) : '—'}%，扣非净利润仅增长 ${npdG !== undefined ? fmt(npdG) : '—'}%；非经常性损益 ${fmt(nri)} 亿元，占归母净利润 ${fmt(Math.round((nri / np) * 1000) / 10)}%。`,
      evidenceFactIds: ev(['归母净利润', year], ['扣非净利润', year], ['非经常性损益', year]),
      explanation: [
        '利润增长的主要来源是处置子公司收益与政府补助，不具备可持续性。',
        '主业盈利能力（扣非口径）的实际增速远低于表观利润增速。',
      ],
      counterExplanation: [
        '资产处置可能是主动的业务结构调整，一次性出清低效资产。',
        '政府补助若与主业相关（如产业扶持），具有一定持续性。',
      ],
      questions: [
        '处置子公司的交易对手方是谁？是否存在关联关系？',
        '政府补助的具体性质与持续年限？',
        '剔除一次性损益后，主业毛利率与费用率趋势如何？',
      ],
      boundary: '可确认利润结构的一次性特征，但无法据此判断交易定价是否公允，需查阅重要事项章节的交易披露。',
    });
  }

  // 规则 5：客户集中度
  const top5 = factValue(facts, '前五大客户收入占比', year);
  const top5Prev = factValue(facts, '前五大客户收入占比', year - 1);
  if (hasRule('customer-concentration') && top5 !== undefined && (top5 > 40 || (top5Prev !== undefined && top5 - top5Prev > 8))) {
    cards.push({
      id: 'rc-concentration',
      title: '客户集中度显著上升',
      severity: 'medium',
      ruleId: 'customer-concentration',
      signal: `前五大客户收入占比升至 ${fmt(top5)}%${top5Prev !== undefined ? `，一年内上升 ${fmt(top5 - top5Prev)} 个百分点` : ''}。`,
      evidenceFactIds: ev(['前五大客户收入占比', year], ['前五大客户收入占比', year - 1]),
      explanation: [
        '收入对少数大客户的依赖加深，单一客户的经营波动或结算争议影响被放大。',
        '集中度上升与应收账款、合同资产增长叠加，需交叉验证大客户账期。',
      ],
      counterExplanation: mfg
        ? [
            '前装配套模式下绑定少数头部客户（如主机厂）是行业常态。',
            '大客户若为信用等级较高的大型企业，回款风险可能反而更低。',
          ]
        : [
            '承接大型地标项目本身会推高集中度，未必代表客户结构恶化。',
            '大客户若为信用等级较高的主体，回款风险可能反而更低。',
          ],
      questions: [
        '前五大客户分别是谁？与公司是否存在关联关系？',
        '大客户的账期与中小客户相比是否更长？',
        '在手订单中大客户占比是否继续上升？',
      ],
      boundary: '可确认集中度上升的客观事实，但客户质量与关联关系需查阅重要事项与关联方附注后判断。',
    });
  }

  // 规则 6：杠杆水平（制造业阈值 60%，建筑业 70%）
  const debt = factValue(facts, '资产负债率', year);
  const debtPrev = factValue(facts, '资产负债率', year - 1);
  const leverageThreshold = mfg ? 60 : 70;
  if (hasRule('leverage-high') && debt !== undefined && debt > leverageThreshold && debtPrev !== undefined && debt > debtPrev) {
    cards.push({
      id: 'rc-leverage',
      title: '资产负债率高企且持续上升',
      severity: 'low',
      ruleId: 'leverage-high',
      signal: `资产负债率 ${fmt(debt)}%，超过 ${leverageThreshold}% 阈值，且较上年 ${fmt(debtPrev)}% 继续上升。`,
      evidenceFactIds: ev(['资产负债率', year], ['资产负债率', year - 1]),
      explanation: mfg
        ? ['扩产与备货依赖负债驱动，需求下行时存货贬值与偿债压力会同时放大。']
        : ['垫资施工模式下，收入扩张依赖负债驱动，现金流紧张时偿债压力会快速传导。'],
      counterExplanation: mfg
        ? [
            '扩产周期中举债建厂属于主动投资，若订单充足可在投产后消化。',
            '若负债以经营性占款（应付账款、合同负债）为主，实际有息压力有限。',
          ]
        : [
            '建筑行业普遍高杠杆经营，该水平仍处于上市建企常见区间。',
            '若负债以经营性占款（应付账款、合同负债）为主，实际有息压力有限。',
          ],
      questions: ['有息负债规模与短期债务占比是多少？', '授信额度与未使用授信是否充足？'],
      boundary: '杠杆绝对水平需拆分有息 / 无息结构后才有判断意义，当前仅能确认趋势。',
    });
  }

  // ---- 治理与合规规则（披露存在性由程序确认，原文可溯） ----
  const govFact = (label: string) => facts.find((f) => f.label === label && f.year === year);

  // 规则 A：非标准审计意见
  const audit = govFact('审计意见');
  if (hasRule('audit-nonstandard') && audit && !audit.unit.includes('无保留')) {
    cards.push({
      id: 'rc-audit',
      title: `审计机构出具了${audit.unit}的审计报告`,
      severity: 'high',
      ruleId: 'audit-nonstandard',
      signal: `审计意见类型为「${audit.unit}」，属于非标准审计意见。`,
      evidenceFactIds: [audit.id],
      explanation: [
        '非标意见意味着审计师对报表的某些重大方面无法确认或无保留背书，是财报可信度层面的直接警示。',
        '需优先阅读审计报告中"形成意见的基础"部分，明确审计师无法确认的具体事项。',
      ],
      counterExplanation: [
        `${audit.unit}针对的是特定事项，不必然代表财务报表整体失真；部分公司在事项消除后会回归标准意见。`,
      ],
      questions: [
        '形成该意见的具体事项是什么？涉及金额多大？',
        '该事项在本报告期是否已消除或仍将持续？',
        '公司以前年度的审计意见类型是什么，是否连续非标？',
      ],
      boundary: '当前只能确认审计意见类型这一披露事实，意见所涉事项的性质与影响需阅读审计报告原文后判断。',
    });
  }

  // 规则 B：会计差错更正与追溯重述
  const restate = govFact('会计差错更正');
  if (hasRule('restatement') && restate) {
    cards.push({
      id: 'rc-restatement',
      title: '公司对以前年度财务数据进行了追溯重述（会计差错更正）',
      severity: 'high',
      ruleId: 'restatement',
      signal: '报告披露存在会计差错更正并对可比期间数据追溯调整。历史年份的"调整前"数据与"调整后"数据可能存在重大差异。',
      evidenceFactIds: [restate.id],
      explanation: [
        '会计差错更正意味着以前年度已披露的财务数据存在错误，需追问错误是技术性差错还是更深层问题的暴露。',
        '重述前后差异越大，原披露的可信度受损越严重；应对比"调整前/调整后"两列评估影响幅度。',
        '若重述导致以前年度由盈转亏，性质明显更严重。',
      ],
      counterExplanation: [
        '部分重述源于会计政策衔接或对准则理解的修正，属于技术性调整，不必然指向舞弊。',
        '公司主动更正差错也可视为治理改善的信号。',
      ],
      questions: [
        '差错的具体内容是什么？影响了哪些科目、多大幅度？',
        '差错更正是否由监管立案或审计发现倒逼，还是公司自查？',
        '重述是否导致以前年度盈亏性质改变或触发退市指标？',
        '本报告的事实提取已优先采用"调整后"数据——调整前数据曾是对外披露的版本，当时的市场决策建立在其上。',
      ],
      boundary: '可确认追溯重述的披露事实，但差错成因（技术性 vs 舞弊性）必须结合监管文件与审计说明判断，本系统不作定性。',
    });
  }

  // 规则 C：监管立案调查 / 行政处罚
  const regulatory = govFact('监管调查与处罚');
  if (hasRule('regulatory') && regulatory) {
    cards.push({
      id: 'rc-regulatory',
      title: '存在证监会立案调查或行政处罚披露',
      severity: 'high',
      ruleId: 'regulatory',
      signal: '报告中同时出现「立案调查」与「行政处罚」相关披露。',
      evidenceFactIds: [regulatory.id],
      explanation: [
        '监管立案或处罚通常指向信息披露违法违规，是判断财报可信度时权重最高的一类外部信号。',
        '处罚事先告知书所列违法事实，是研究财报何处不可信的最直接线索。',
      ],
      counterExplanation: [
        '立案调查不等于最终认定，公司有权陈述申辩；需以正式处罚决定书为准。',
        '部分处罚针对程序性违规（如未及时披露），不必然涉及财务数据造假。',
      ],
      questions: [
        '立案/处罚所涉的具体违法事实是什么？涉及哪些年度、哪些科目？',
        '正式处罚决定书是否已下达？结论与事先告知书是否一致？',
        '相关年度的财务数据是否需要重述？审计机构与董事、高管的责任认定如何？',
      ],
      boundary: '当前仅确认报告内存在相关披露，违法事实的认定应以监管正式文书为准，本系统不作法律定性。',
    });
  }

  // 规则 D：控股股东 / 关联方资金占用
  const occupation = govFact('控股股东资金占用');
  if (hasRule('fund-occupation') && occupation) {
    cards.push({
      id: 'rc-occupation',
      title: '存在控股股东或关联方非经营性资金占用披露',
      severity: 'high',
      ruleId: 'fund-occupation',
      signal: '报告披露存在控股股东或关联方非经营性资金占用相关事项。',
      evidenceFactIds: [occupation.id],
      explanation: [
        '资金占用直接侵蚀上市公司资产，且往往伴随披露不实，与公司治理失效高度相关。',
        '占用资金常以其他应收款等科目挂账，需交叉核对其规模、账龄与可回收性。',
      ],
      counterExplanation: [
        '部分占用已在报告期内归还或计提减值，需确认期末余额与清偿进度。',
        '经营性往来与占用性质不同，需看披露中是否明确界定为"非经营性"。',
      ],
      questions: [
        '占用金额、形成路径与起始时间？期末余额还有多少未归还？',
        '是否已计提减值？计提是否充分？',
        '控股股东的偿付能力与还款安排是否可信（股权冻结、质押情况）？',
      ],
      boundary: '披露事实可确认；占用的最终可回收性与责任追偿存在重大不确定性，需跟踪清偿进展与司法程序。',
    });
  }

  return cards;
}
