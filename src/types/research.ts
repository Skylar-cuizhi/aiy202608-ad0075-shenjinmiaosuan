/**
 * 财报透镜 · 核心数据契约
 *
 * 对应产品定位中的可信研究链条：
 * PDF原文 → 结构化事实 → 确定性计算 → 行业知识比较 → 风险假设 → 反方解释 → 待核实问题 → 研究员判断
 *
 * 未来对接真实后端 / 大模型时，后端只需按这些类型返回 JSON。
 */

/** 原文锚点：每个数字、判断都必须能回到 PDF 的具体位置 */
export interface SourceAnchor {
  /** PDF 页码（从 1 开始） */
  page: number;
  /** 所属章节名称 */
  chapter: string;
  /** 表格名称（如适用） */
  table?: string;
  /** 原文片段 / 表格单元格文字 */
  quote: string;
}

/** 结构化事实：从财报中提取的单个数字 */
export interface Fact {
  id: string;
  /** 指标名称，如「营业收入」 */
  label: string;
  /** 数值（原始单位由 unit 描述） */
  value: number;
  /** 单位，如「亿元」「%」 */
  unit: string;
  /** 所属年份 */
  year: number;
  /** 事实类别，用于分组展示 */
  category: '收入利润' | '现金流' | '资产负债' | '客户与板块' | '审计与附注';
  anchor: SourceAnchor;
}

/** 章节读取状态：系统"证明自己读过"的覆盖记录 */
export interface Chapter {
  id: string;
  title: string;
  pageStart: number;
  pageEnd: number;
  /** parsed=完整解析；partial=部分识别；failed=识别困难 */
  status: 'parsed' | 'partial' | 'failed';
  /** 已提取表格数 */
  tablesExtracted: number;
  /** 识别备注（识别困难时说明原因） */
  note?: string;
}

/** 一份财报（演示数据为虚构公司） */
export interface CompanyReport {
  companyName: string;
  reportTitle: string;
  industry: string;
  totalPages: number;
  fiscalYears: number[];
  /** 结构化摘要（建立在完整阅读与溯源之上） */
  summary: string[];
  /** 值得优先阅读的重点章节 */
  priorityChapters: string[];
  chapters: Chapter[];
  facts: Fact[];
}

/** 风险信号的严重程度（仅提示优先级，不下结论） */
export type Severity = 'high' | 'medium' | 'low';

/** 研究卡片：每个风险点都是一张完整的思考空间，而非结论 */
export interface RiskCard {
  id: string;
  title: string;
  severity: Severity;
  /** 命中的确定性规则 id（来自行业知识包） */
  ruleId: string;
  /** 1. 风险信号：程序确认的数字关系异常 */
  signal: string;
  /** 2. 原始证据：相关事实（含页码、表格、原文） */
  evidenceFactIds: string[];
  /** 3. 风险解释：这组数据为什么值得关注 */
  explanation: string[];
  /** 4. 反方解释：能够合理说明这一现象的原因 */
  counterExplanation: string[];
  /** 5. 待核实问题：转化为研究员下一步可调查的问题 */
  questions: string[];
  /** 6. 当前判断边界：证据能支持什么、不能支持什么 */
  boundary: string;
}

/** 确定性规则：由程序执行，不让大模型"猜数字" */
export interface SignalRule {
  id: string;
  description: string;
}

/** 行业知识包：可持续扩展的研究经验沉淀 */
export interface KnowledgePack {
  id: string;
  industry: string;
  /** 该行业的重要财务指标 */
  keyMetrics: string[];
  /** 常见风险信号（对应确定性规则） */
  rules: SignalRule[];
  /** 指标之间的交叉验证关系 */
  crossChecks: string[];
  /** 需要进一步查阅的附注 */
  notesToCheck: string[];
  /** 适合提出的核实问题 */
  typicalQuestions: string[];
}

/** 应用内当前选中的原文位置（用于右侧面板跳转高亮） */
export interface AnchorSelection {
  page: number;
  quote: string;
  chapter: string;
  /** 可选：来源事实 id（真实模式下用于回查坐标框） */
  id?: string;
}
