import type { Fact, RiskCard } from '@/types/research';

/**
 * 解释层：由 DeepSeek 在「确定性证据约束」下生成 风险解释 / 反方解释 / 待核实问题。
 *
 * 铁律：
 * - 信号与数字永远来自程序（signals.ts / extract.ts），模型只写文字；
 * - prompt 中注入全部证据事实（含页码原文），禁止模型引入证据之外的具体事实；
 * - 任何失败（网络 / 鉴权 / 解析）都回退到知识包模板文案，界面如实标注。
 */

export interface AiNarrative {
  explanation: string[];
  counter: string[];
  questions: string[];
  model: string;
  generatedAt: string;
}

export interface ExplainContext {
  companyName: string;
  /** 年报明示的行业原文，如「汽车零配件及配件制造业」 */
  industryRaw?: string;
  /** 加载的知识包行业，如「制造业」 */
  packIndustry: string;
  fiscalYear: number;
}

const CACHE_KEY = 'jianwei-ai-narratives-v1';

function hashOf(input: string): string {
  let h = 5381;
  for (let i = 0; i < input.length; i++) h = ((h << 5) + h + input.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

export function narrativeHash(card: RiskCard, facts: Fact[], ctx: ExplainContext): string {
  const ev = card.evidenceFactIds
    .map((id) => facts.find((f) => f.id === id))
    .filter((f): f is Fact => Boolean(f))
    .map((f) => `${f.label}@${f.year}=${f.value}${f.unit}`);
  return hashOf(JSON.stringify([card.ruleId, card.signal, ev, ctx.packIndustry, ctx.companyName, ctx.fiscalYear]));
}

function readCache(): Record<string, AiNarrative> {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY) ?? '{}');
  } catch {
    return {};
  }
}

export function getCachedNarrative(hash: string): AiNarrative | undefined {
  return readCache()[hash];
}

function putCache(hash: string, n: AiNarrative) {
  try {
    const all = readCache();
    all[hash] = n;
    // 缓存上限 200 条，超出按时间淘汰最旧
    const keys = Object.keys(all);
    if (keys.length > 200) {
      keys.sort((a, b) => all[a].generatedAt.localeCompare(all[b].generatedAt));
      for (const k of keys.slice(0, keys.length - 200)) delete all[k];
    }
    localStorage.setItem(CACHE_KEY, JSON.stringify(all));
  } catch {
    /* 存储满或私密模式：静默跳过缓存 */
  }
}

function buildMessages(card: RiskCard, facts: Fact[], ctx: ExplainContext) {
  const evidenceLines = card.evidenceFactIds
    .map((id) => facts.find((f) => f.id === id))
    .filter((f): f is Fact => Boolean(f))
    .map((f) => {
      const quote = f.anchor.quote.slice(0, 90).replace(/\s+/g, ' ');
      return `- ${f.label}（${f.year}）= ${f.value !== 0 ? `${f.value} ${f.unit}` : f.unit}｜年报 P${f.anchor.page}｜原文:「${quote}」`;
    })
    .join('\n');

  const system = `你是一名严谨的财务研究助手，为研究员整理风险线索，而不是替研究员下结论。
写作铁律：
1. 只允许基于下方提供的「确定性证据」展开，严禁编造证据之外的任何具体数字、公司、事件、日期或比例；
2. 可以使用行业常识性的分析框架（如因果链、会计处理逻辑），但凡涉及具体事实断言，必须能与证据对应；
3. 每条解释聚焦一条因果链，精炼有力，每条不超过 60 字；
4. 反方解释要真实可信，是给研究员的制衡视角，不是敷衍的安慰；
5. 待核实问题必须能通过查阅年报附注、公司公告或监管文书来回答，要具体、可执行，不要空泛提问；
6. 严格输出 JSON：{"explanation": [3 条], "counter": [2 条], "questions": [4 条]}，均为字符串数组，不要输出其他内容。`;

  const user = `公司：${ctx.companyName}${ctx.industryRaw ? `（年报明示行业：${ctx.industryRaw}）` : ''}
研究框架：${ctx.packIndustry}行业知识包 · 报告期：${ctx.fiscalYear} 年报
命中规则：${card.ruleId}
程序确认的风险信号（数字关系已由程序核实，直接采信）：${card.signal}

确定性证据（含年报页码与原文）：
${evidenceLines}

请围绕该信号输出 JSON：风险解释 3 条、反方解释 2 条、待核实问题 4 条。`;

  return [
    { role: 'system' as const, content: system },
    { role: 'user' as const, content: user },
  ];
}

function toStringArray(x: unknown, max: number): string[] {
  if (!Array.isArray(x)) return [];
  return x.filter((s): s is string => typeof s === 'string' && s.trim().length > 0).map((s) => s.trim()).slice(0, max);
}

/**
 * 请求 DeepSeek 为一张风险卡片生成解释层内容。
 * 命中 localStorage 缓存时直接返回（cached=true）；失败抛错由调用方回退模板。
 */
export async function explainCard(
  card: RiskCard,
  facts: Fact[],
  ctx: ExplainContext,
): Promise<{ narrative: AiNarrative; cached: boolean }> {
  const hash = narrativeHash(card, facts, ctx);
  const hit = getCachedNarrative(hash);
  if (hit) return { narrative: hit, cached: true };

  const res = await fetch('/api/explain', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages: buildMessages(card, facts, ctx) }),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`解释层请求失败 HTTP ${res.status}：${errText.slice(0, 120)}`);
  }
  const data = await res.json();
  const content: string = data?.choices?.[0]?.message?.content ?? '';
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error('解释层返回非 JSON，已回退模板');
  }
  const explanation = toStringArray(parsed.explanation, 3);
  const counter = toStringArray(parsed.counter, 2);
  const questions = toStringArray(parsed.questions, 4);
  if (explanation.length === 0 && counter.length === 0 && questions.length === 0) {
    throw new Error('解释层返回内容为空，已回退模板');
  }
  const narrative: AiNarrative = {
    explanation,
    counter,
    questions,
    model: data?.model ?? 'deepseek',
    generatedAt: new Date().toISOString(),
  };
  putCache(hash, narrative);
  return { narrative, cached: false };
}

// ================= 多年综合研判 =================

export interface MultiSummaryInput {
  companyName: string;
  packIndustry: string;
  years: number[];
  /** 每年关键数字（程序算好，模型只许引用） */
  yearlyLines: string[];
  /** 治理事件行 */
  eventLines: string[];
  /** 触发的跨期信号行 */
  signalLines: string[];
  /** 证据锚点样例（含页码） */
  evidenceLines: string[];
}

export function multiSummaryHash(input: MultiSummaryInput): string {
  return hashOf(JSON.stringify(input));
}

/**
 * 多年综合研判：把跨期确定性结果组织成「叙事弧」。
 * 输出映射到 AiNarrative.explanation（counter/questions 置空），以复用持久化与缓存。
 */
export async function summarizeMultiYear(input: MultiSummaryInput): Promise<{ narrative: AiNarrative; cached: boolean }> {
  const hash = multiSummaryHash(input);
  const hit = getCachedNarrative(hash);
  if (hit) return { narrative: hit, cached: true };

  const system = `你是一名严谨的财务研究助手，为研究员把多年的确定性分析结果组织成一条「叙事弧」。
写作铁律：
1. 只允许基于下方提供的「确定性事实与信号」展开，严禁编造任何证据之外的数字、事件、日期或比例；
2. 按时间顺序讲故事：造假期长什么样、拐点出现在哪一年、哪些信号互相印证；
3. 措辞保持研究语言，克制、有据，每段不超过 90 字；
4. 凡涉及定性词（如"盈余管理""造假嫌疑"）必须保留「推测」前缀，并说明这是相对关系的联合推断；
5. 最后一段必须是「判断边界」：说明证据能支持什么、不能支持什么；
6. 严格输出 JSON：{"narrative": [4 到 6 段字符串]}，不要输出其他内容。`;

  const user = `公司：${input.companyName}
研究框架：${input.packIndustry}行业知识包 · 覆盖年度：${input.years.join('、')}

各年关键数字（程序确定性提取，直接采信）：
${input.yearlyLines.join('\n')}

治理与合规事件轴：
${input.eventLines.length > 0 ? input.eventLines.join('\n') : '（无）'}

程序触发的跨期信号：
${input.signalLines.length > 0 ? input.signalLines.join('\n') : '（无）'}

证据锚点样例（均可回溯原文页码）：
${input.evidenceLines.join('\n')}

请输出 JSON：{"narrative": [...]}。`;

  const res = await fetch('/api/explain', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages: [
      { role: 'system' as const, content: system },
      { role: 'user' as const, content: user },
    ] }),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`综合研判请求失败 HTTP ${res.status}：${errText.slice(0, 120)}`);
  }
  const data = await res.json();
  const content: string = data?.choices?.[0]?.message?.content ?? '';
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error('综合研判返回非 JSON');
  }
  const paragraphs = toStringArray(parsed.narrative, 6);
  if (paragraphs.length === 0) throw new Error('综合研判返回内容为空');
  const narrative: AiNarrative = {
    explanation: paragraphs,
    counter: [],
    questions: [],
    model: data?.model ?? 'deepseek',
    generatedAt: new Date().toISOString(),
  };
  putCache(hash, narrative);
  return { narrative, cached: false };
}

// ================= AI 对话（证据约束下的自由问答） =================

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

/**
 * 证据约束对话：系统提示中注入当前卷宗的确定性摘要（公司 / 关键数字 / 信号 / 事件），
 * 模型只能基于摘要与年报常识作答，超出证据的断言必须声明「需要查证」。
 */
export async function chatWithEvidence(digest: string, history: ChatMessage[]): Promise<string> {
  const system = `你是「见微」的 AI 研判助手，服务于财务研究员。你正在与研究员围绕一份已解析的年报卷宗对话。

铁律：
1. 下方「卷宗确定性摘要」中的数字、信号、事件均由程序从年报原文提取并核实，可以直接引用（引用时带页码，如 P48）；
2. 摘要之外的具体事实（具体金额、客户名称、日期、处罚文号等）你不掌握，一律说「这需要查阅年报原文/公告核实」，严禁编造；
3. 可以运用财务分析框架与会计常识帮助研究员推理，但推理与事实要分清：事实来自摘要，推理标注为推断；
4. 回答精炼，多用短句与分点；涉及定性时必须保留「推测」前缀；
5. 研究员的问题若与本案无关（如闲聊），礼貌引导回卷宗本身。

卷宗确定性摘要：
${digest}`;

  const res = await fetch('/api/explain', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      mode: 'chat',
      messages: [
        { role: 'system', content: system },
        ...history.slice(-16).map((m) => ({ role: m.role, content: m.content })),
      ],
    }),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`对话请求失败 HTTP ${res.status}：${errText.slice(0, 120)}`);
  }
  const data = await res.json();
  const content: string = data?.choices?.[0]?.message?.content ?? '';
  if (!content.trim()) throw new Error('对话返回为空');
  return content.trim();
}
