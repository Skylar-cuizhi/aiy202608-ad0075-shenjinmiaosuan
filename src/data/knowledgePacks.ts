import type { KnowledgePack } from '@/types/research';

/** 跨行业通用的治理与合规规则：披露存在性由程序确认，不涉及主观判断 */
const GOVERNANCE_RULES = [
  { id: 'audit-nonstandard', description: '审计意见为非标准意见（保留意见 / 无法表示意见 / 否定意见）' },
  { id: 'restatement', description: '发生会计差错更正并对以前年度追溯重述' },
  { id: 'regulatory', description: '存在证监会立案调查或行政处罚披露' },
  { id: 'fund-occupation', description: '存在控股股东或关联方非经营性资金占用披露' },
] as const;

/**
 * 行业知识包：可持续扩展的研究经验沉淀。
 * MVP 内置三个知识包，建筑行业为完整版；规则由程序确定性执行（见 lib/signals.ts）。
 */
export const knowledgePacks: KnowledgePack[] = [
  {
    id: 'kp-construction',
    industry: '建筑施工',
    keyMetrics: [
      '营业收入与增长率', '经营活动现金流净额', '应收账款及账龄', '合同资产（已完工未结算）',
      '存货与跌价准备', '资产负债率', '前五大客户集中度', '非经常性损益占比',
    ],
    rules: [
      { id: 'rev-ocf-diverge', description: '收入增长 >5% 且经营现金流下降 >10%：收入与回款背离' },
      { id: 'ar-outpace-rev', description: '应收账款增速超过收入增速 10 个百分点以上' },
      { id: 'ca-outpace-rev', description: '合同资产增速超过收入增速 10 个百分点以上（已完工未结算堆积）' },
      { id: 'nri-heavy', description: '非经常性损益占归母净利润超过 10%：利润质量依赖一次性收益' },
      { id: 'customer-concentration', description: '前五大客户收入占比超过 40% 或一年内上升超过 8 个百分点' },
      { id: 'leverage-high', description: '资产负债率超过 70% 且持续上升' },
      ...GOVERNANCE_RULES,
    ],
    crossChecks: [
      '营业收入 vs 经营现金流：收入是否转化为真实现金',
      '应收账款增速 vs 收入增速：信用政策是否放宽',
      '合同资产增速 vs 收入增速：已完工未结算是否堆积',
      '归母净利润 vs 扣非净利润：利润是否依赖一次性收益',
      '客户集中度 vs 应收账龄：大客户议价是否拉长账期',
    ],
    notesToCheck: [
      '应收账款账龄表与坏账准备（附注）',
      '合同资产明细及减值计提方法（附注）',
      '关联方交易与资金占用（附注）',
      '会计政策 / 会计估计变更（附注）',
      '期后回款与期后事项（附注）',
    ],
    typicalQuestions: [
      '应收账款主要来自哪些客户？账龄是否显著延长？',
      '期后回款情况如何？',
      '公司是否调整过信用政策或结算条款？',
      '已完工未结算项目对应哪些业主？是否存在结算争议？',
      '同行业公司的现金流表现是否出现类似变化？',
      '减值计提方法变更对当期利润的影响有多大？',
    ],
  },
  {
    id: 'kp-manufacturing',
    industry: '制造业',
    keyMetrics: [
      '营业收入与增长率', '毛利率', '存货与跌价准备', '应收账款及账龄',
      '经营活动现金流净额', '商誉与减值', '资产负债率', '前五大客户集中度', '非经常性损益占比',
    ],
    rules: [
      { id: 'rev-ocf-diverge', description: '收入增长 >5% 且经营现金流下降 >10%：收入与回款背离' },
      { id: 'ar-outpace-rev', description: '应收账款增速超过收入增速 10 个百分点以上' },
      { id: 'inv-outpace-rev', description: '存货增速超过收入增速 10 个百分点以上（备货激进或产品积压）' },
      { id: 'gross-margin-drop', description: '毛利率同比下降超过 5 个百分点（价格竞争或成本失控）' },
      { id: 'goodwill-heavy', description: '商誉占净资产比例超过 30%（并购扩张的减值悬顶）' },
      { id: 'nri-heavy', description: '非经常性损益占归母净利润超过 10%：利润质量依赖一次性收益' },
      { id: 'customer-concentration', description: '前五大客户收入占比超过 40% 或一年内上升超过 8 个百分点' },
      { id: 'leverage-high', description: '资产负债率超过 60% 且持续上升' },
      ...GOVERNANCE_RULES,
    ],
    crossChecks: [
      '营业收入 vs 经营现金流：收入是否转化为真实现金',
      '存货增速 vs 收入增速：备货是否超前于订单',
      '毛利率 vs 收入增速：以价换量还是竞争力恶化',
      '商誉 vs 净资产：并购资产的占比与减值空间',
      '归母净利润 vs 扣非净利润：利润是否依赖一次性收益',
      '客户集中度 vs 应收账龄：大客户议价是否拉长账期',
    ],
    notesToCheck: [
      '存货分类与跌价准备计提比例（附注）',
      '应收账款账龄表与坏账准备（附注）',
      '商誉减值测试的关键假设（附注）',
      '关联方交易与资金占用（附注）',
      '分行业 / 分产品收入与毛利率（经营讨论）',
    ],
    typicalQuestions: [
      '存货中产成品占比是否上升？跌价准备计提是否充分？',
      '毛利率下滑来自售价还是成本？分产品毛利率如何变化？',
      '大客户（主机厂 / 渠道商）的账期是否拉长？',
      '商誉对应哪些并购标的？减值测试的增长率假设是否乐观？',
      '产能利用率与在手订单是否匹配？',
      '研发投入的费用化 / 资本化口径是否发生变化？',
    ],
  },
  {
    id: 'kp-financial',
    industry: '银行与保险',
    keyMetrics: ['资本充足率', '不良贷款率', '拨备覆盖率', '流动性覆盖率', '资产质量迁徙'],
    rules: [
      { id: 'fin-npl-coverage', description: '不良率上升且拨备覆盖率下降' },
      ...GOVERNANCE_RULES,
    ],
    crossChecks: ['不良率 vs 拨备覆盖率', '关注类贷款迁徙率 vs 不良生成'],
    notesToCheck: ['贷款五级分类', '重组贷款与展期'],
    typicalQuestions: ['关注类贷款是否向下迁徙？', '拨备计提是否充分？'],
  },
];
