import type { CompanyReport } from '@/types/research';

/**
 * 演示数据集：宏远建设股份有限公司 2024 年年度报告（虚构）。
 * 数字按建筑行业特征构造，用于演示"先提取事实 → 确定性计算 → 再解释"的链条。
 */
export const demoReport: CompanyReport = {
  companyName: '宏远建设股份有限公司',
  reportTitle: '2024 年年度报告',
  industry: '建筑施工',
  totalPages: 136,
  fiscalYears: [2022, 2023, 2024],
  summary: [
    '公司主营房屋建筑工程与市政基础设施施工，2024 年营业收入 179.7 亿元，同比增长 18.0%，收入增长主要来自华东区域大型公建项目集中开工。',
    '归母净利润 8.6 亿元，同比增长 14.7%；但扣非净利润仅增长 4.2%，非经常性损益（主要为处置子公司收益与政府补助）对利润贡献明显上升。',
    '经营活动现金流净额 3.9 亿元，连续第二年下滑，同比下降 42.6%，与收入增长方向相反，收入向现金的转化明显变慢。',
    '应收账款 69.7 亿元（+35.1%）、合同资产 52.4 亿元（+34.7%），增速均显著高于收入增速；资产负债率升至 74.8%。',
    '审计意见为标准无保留意见；报告期内公司变更了合同资产减值准备的计提方法（附注 32），前五大客户收入占比升至 45%。',
  ],
  priorityChapters: [
    '管理层讨论与分析（P9–32）',
    '附注 · 应收款项（P91–104）',
    '附注 · 合同资产与存货（P105–118）',
    '重要事项（P46–58）',
  ],
  chapters: [
    { id: 'c1', title: '公司简介及主要财务指标', pageStart: 3, pageEnd: 8, status: 'parsed', tablesExtracted: 3 },
    { id: 'c2', title: '管理层讨论与分析', pageStart: 9, pageEnd: 32, status: 'parsed', tablesExtracted: 11 },
    { id: 'c3', title: '公司治理', pageStart: 33, pageEnd: 45, status: 'parsed', tablesExtracted: 5 },
    { id: 'c4', title: '重要事项', pageStart: 46, pageEnd: 58, status: 'parsed', tablesExtracted: 6 },
    { id: 'c5', title: '财务报告 · 审计意见', pageStart: 59, pageEnd: 62, status: 'parsed', tablesExtracted: 1 },
    { id: 'c6', title: '财务报表（三大报表）', pageStart: 63, pageEnd: 90, status: 'parsed', tablesExtracted: 9 },
    { id: 'c7', title: '附注 · 应收款项', pageStart: 91, pageEnd: 104, status: 'parsed', tablesExtracted: 7 },
    { id: 'c8', title: '附注 · 合同资产与存货', pageStart: 105, pageEnd: 118, status: 'parsed', tablesExtracted: 6 },
    {
      id: 'c9',
      title: '附注 · 关联方及或有事项',
      pageStart: 119,
      pageEnd: 130,
      status: 'partial',
      tablesExtracted: 2,
      note: '第 124 页关联交易表格为扫描图片，仅完成 OCR 部分识别，2 个单元格数值置信度低，建议人工复核。',
    },
    {
      id: 'c10',
      title: '备查文件目录',
      pageStart: 131,
      pageEnd: 136,
      status: 'failed',
      tablesExtracted: 0,
      note: '整章为扫描图片且无文字层，OCR 置信度不足，未纳入索引。',
    },
  ],
  facts: [
    // ---- 收入利润 ----
    {
      id: 'f-rev-2024', label: '营业收入', value: 179.7, unit: '亿元', year: 2024, category: '收入利润',
      anchor: { page: 6, chapter: '公司简介及主要财务指标', table: '主要会计数据', quote: '营业收入 17,970,286,431.55 元，比上年同期增长 18.0%' },
    },
    {
      id: 'f-rev-2023', label: '营业收入', value: 152.3, unit: '亿元', year: 2023, category: '收入利润',
      anchor: { page: 6, chapter: '公司简介及主要财务指标', table: '主要会计数据', quote: '营业收入 15,230,114,208.10 元（上年同期）' },
    },
    {
      id: 'f-rev-2022', label: '营业收入', value: 128.6, unit: '亿元', year: 2022, category: '收入利润',
      anchor: { page: 6, chapter: '公司简介及主要财务指标', table: '主要会计数据', quote: '营业收入 12,860,442,977.63 元（2022 年度）' },
    },
    {
      id: 'f-np-2024', label: '归母净利润', value: 8.6, unit: '亿元', year: 2024, category: '收入利润',
      anchor: { page: 6, chapter: '公司简介及主要财务指标', table: '主要会计数据', quote: '归属于上市公司股东的净利润 860,117,542.88 元，同比增长 14.7%' },
    },
    {
      id: 'f-np-2023', label: '归母净利润', value: 7.5, unit: '亿元', year: 2023, category: '收入利润',
      anchor: { page: 6, chapter: '公司简介及主要财务指标', table: '主要会计数据', quote: '归属于上市公司股东的净利润 750,064,118.20 元（上年同期）' },
    },
    {
      id: 'f-np-2022', label: '归母净利润', value: 6.8, unit: '亿元', year: 2022, category: '收入利润',
      anchor: { page: 6, chapter: '公司简介及主要财务指标', table: '主要会计数据', quote: '归属于上市公司股东的净利润 680,229,764.51 元（2022 年度）' },
    },
    {
      id: 'f-npd-2024', label: '扣非净利润', value: 7.4, unit: '亿元', year: 2024, category: '收入利润',
      anchor: { page: 7, chapter: '公司简介及主要财务指标', table: '主要会计数据（扣非）', quote: '扣除非经常性损益后的净利润 740,552,301.77 元，同比增长 4.2%' },
    },
    {
      id: 'f-npd-2023', label: '扣非净利润', value: 7.1, unit: '亿元', year: 2023, category: '收入利润',
      anchor: { page: 7, chapter: '公司简介及主要财务指标', table: '主要会计数据（扣非）', quote: '扣除非经常性损益后的净利润 710,883,455.09 元（上年同期）' },
    },
    {
      id: 'f-npd-2022', label: '扣非净利润', value: 6.5, unit: '亿元', year: 2022, category: '收入利润',
      anchor: { page: 7, chapter: '公司简介及主要财务指标', table: '主要会计数据（扣非）', quote: '扣除非经常性损益后的净利润 650,110,992.34 元（2022 年度）' },
    },
    {
      id: 'f-nri-2024', label: '非经常性损益', value: 1.2, unit: '亿元', year: 2024, category: '收入利润',
      anchor: { page: 8, chapter: '公司简介及主要财务指标', table: '非经常性损益明细', quote: '非经常性损益合计 119,565,241.11 元，其中处置子公司收益 86,300,000.00 元、政府补助 28,400,000.00 元' },
    },
    {
      id: 'f-gm-2024', label: '毛利率', value: 11.3, unit: '%', year: 2024, category: '收入利润',
      anchor: { page: 15, chapter: '管理层讨论与分析', table: '分行业经营情况', quote: '建筑施工业务毛利率 11.3%，同比下降 0.8 个百分点' },
    },
    {
      id: 'f-gm-2023', label: '毛利率', value: 12.1, unit: '%', year: 2023, category: '收入利润',
      anchor: { page: 15, chapter: '管理层讨论与分析', table: '分行业经营情况', quote: '建筑施工业务毛利率 12.1%（上年度）' },
    },
    {
      id: 'f-gm-2022', label: '毛利率', value: 12.8, unit: '%', year: 2022, category: '收入利润',
      anchor: { page: 15, chapter: '管理层讨论与分析', table: '分行业经营情况', quote: '建筑施工业务毛利率 12.8%（2022 年度）' },
    },
    // ---- 现金流 ----
    {
      id: 'f-ocf-2024', label: '经营活动现金流净额', value: 3.9, unit: '亿元', year: 2024, category: '现金流',
      anchor: { page: 68, chapter: '财务报表（三大报表）', table: '合并现金流量表', quote: '经营活动产生的现金流量净额 390,447,812.06 元' },
    },
    {
      id: 'f-ocf-2023', label: '经营活动现金流净额', value: 6.8, unit: '亿元', year: 2023, category: '现金流',
      anchor: { page: 68, chapter: '财务报表（三大报表）', table: '合并现金流量表', quote: '经营活动产生的现金流量净额 680,195,330.42 元（上年度）' },
    },
    {
      id: 'f-ocf-2022', label: '经营活动现金流净额', value: 9.2, unit: '亿元', year: 2022, category: '现金流',
      anchor: { page: 68, chapter: '财务报表（三大报表）', table: '合并现金流量表', quote: '经营活动产生的现金流量净额 920,771,154.90 元（2022 年度）' },
    },
    // ---- 资产负债 ----
    {
      id: 'f-ar-2024', label: '应收账款', value: 69.7, unit: '亿元', year: 2024, category: '资产负债',
      anchor: { page: 95, chapter: '附注 · 应收款项', table: '应收账款账龄结构', quote: '应收账款期末余额 6,970,338,521.44 元' },
    },
    {
      id: 'f-ar-2023', label: '应收账款', value: 51.6, unit: '亿元', year: 2023, category: '资产负债',
      anchor: { page: 95, chapter: '附注 · 应收款项', table: '应收账款账龄结构', quote: '应收账款期初余额 5,160,227,488.19 元' },
    },
    {
      id: 'f-ar-2022', label: '应收账款', value: 42.1, unit: '亿元', year: 2022, category: '资产负债',
      anchor: { page: 95, chapter: '附注 · 应收款项', table: '应收账款账龄结构', quote: '应收账款 2022 年末余额 4,210,554,903.67 元' },
    },
    {
      id: 'f-ca-2024', label: '合同资产', value: 52.4, unit: '亿元', year: 2024, category: '资产负债',
      anchor: { page: 108, chapter: '附注 · 合同资产与存货', table: '合同资产明细', quote: '合同资产期末余额 5,240,118,774.52 元，已完工未结算资产占比 81%' },
    },
    {
      id: 'f-ca-2023', label: '合同资产', value: 38.9, unit: '亿元', year: 2023, category: '资产负债',
      anchor: { page: 108, chapter: '附注 · 合同资产与存货', table: '合同资产明细', quote: '合同资产期初余额 3,890,447,102.36 元' },
    },
    {
      id: 'f-ca-2022', label: '合同资产', value: 30.5, unit: '亿元', year: 2022, category: '资产负债',
      anchor: { page: 108, chapter: '附注 · 合同资产与存货', table: '合同资产明细', quote: '合同资产 2022 年末余额 3,050,992,611.08 元' },
    },
    {
      id: 'f-inv-2024', label: '存货', value: 24.6, unit: '亿元', year: 2024, category: '资产负债',
      anchor: { page: 112, chapter: '附注 · 合同资产与存货', table: '存货分类', quote: '存货期末余额 2,460,783,115.29 元，跌价准备 45,120,000.00 元' },
    },
    {
      id: 'f-inv-2023', label: '存货', value: 21.0, unit: '亿元', year: 2023, category: '资产负债',
      anchor: { page: 112, chapter: '附注 · 合同资产与存货', table: '存货分类', quote: '存货期初余额 2,100,338,447.81 元' },
    },
    {
      id: 'f-debt-2024', label: '资产负债率', value: 74.8, unit: '%', year: 2024, category: '资产负债',
      anchor: { page: 64, chapter: '财务报表（三大报表）', table: '合并资产负债表', quote: '负债合计 30,447,902,115.63 元，资产总计 40,705,116,208.44 元' },
    },
    {
      id: 'f-debt-2023', label: '资产负债率', value: 71.2, unit: '%', year: 2023, category: '资产负债',
      anchor: { page: 64, chapter: '财务报表（三大报表）', table: '合并资产负债表', quote: '资产负债率（上年度）71.2%' },
    },
    {
      id: 'f-debt-2022', label: '资产负债率', value: 68.4, unit: '%', year: 2022, category: '资产负债',
      anchor: { page: 64, chapter: '财务报表（三大报表）', table: '合并资产负债表', quote: '资产负债率（2022 年度）68.4%' },
    },
    // ---- 客户与板块 ----
    {
      id: 'f-top5-2024', label: '前五大客户收入占比', value: 45, unit: '%', year: 2024, category: '客户与板块',
      anchor: { page: 47, chapter: '重要事项', table: '前五名客户销售情况', quote: '前五名客户销售额 80.9 亿元，占年度销售总额 45%' },
    },
    {
      id: 'f-top5-2023', label: '前五大客户收入占比', value: 36, unit: '%', year: 2023, category: '客户与板块',
      anchor: { page: 47, chapter: '重要事项', table: '前五名客户销售情况', quote: '前五名客户销售额占年度销售总额 36%（上年度）' },
    },
    {
      id: 'f-top5-2022', label: '前五大客户收入占比', value: 31, unit: '%', year: 2022, category: '客户与板块',
      anchor: { page: 47, chapter: '重要事项', table: '前五名客户销售情况', quote: '前五名客户销售额占年度销售总额 31%（2022 年度）' },
    },
    // ---- 审计与附注 ----
    {
      id: 'f-audit-2024', label: '审计意见', value: 0, unit: '标准无保留意见', year: 2024, category: '审计与附注',
      anchor: { page: 60, chapter: '财务报告 · 审计意见', quote: '我们认为，宏远建设股份有限公司财务报表在所有重大方面按照企业会计准则的规定编制，公允反映了……（标准无保留意见）' },
    },
    {
      id: 'f-policy-2024', label: '会计估计变更', value: 0, unit: '合同资产减值计提方法变更', year: 2024, category: '审计与附注',
      anchor: { page: 110, chapter: '附注 · 合同资产与存货', quote: '本公司自 2024 年起将合同资产减值准备由账龄组合法变更为预期信用损失三阶段模型，该变更减少本期资产减值损失约 7,200 万元' },
    },
  ],
};
