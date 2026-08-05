import type { Fact } from '@/types/research';
import type { DetectedChapter, LoadedPdf, PdfTextItem, SearchMatchRect } from './pdf';

/**
 * 确定性结构化事实提取引擎（v2，经真实年报锤炼）。
 *
 * 真实年报的硬骨头（以索菱股份 2019 年报为基准）：
 * - 追溯重述表：调整前/调整后子列——只取"调整后"，造假数字在调整前；
 * - 数字跨行断片："1,430,458,946." + "77" 需要按 x 邻接合并；
 * - 负号是独立文字项：需要与后续数字合并；
 * - 分季度表、MD&A 资产构成表、附注表都会混入——需要列头映射 + 大数校验；
 * - 治理信号（保留意见/差错更正/立案调查/资金占用）藏在文字段落里。
 */

export interface RealFact extends Fact {
  rects: SearchMatchRect[];
}

export interface MetricDiagnostic {
  key: string;
  label: string;
  status: 'found' | 'missing';
  years: number[];
  pages: number[];
  note?: string;
}

/** 行业识别结果：确定性关键词匹配，附原文出处（页码 + 引文） */
export interface IndustryDetection {
  packId: string;
  /** 命中的行业表述原文，如「汽车零配件及配件制造业」 */
  raw: string;
  page: number;
  quote: string;
  /** explicit = 命中「行业性质 / 所属行业」句式；keyword = 全文关键词打分兜底 */
  method: 'explicit' | 'keyword';
}

export interface ExtractionResult {
  facts: RealFact[];
  diagnostics: MetricDiagnostic[];
  meta: {
    companyName?: string;
    reportTitle?: string;
    fiscalYear?: number;
    unit: '元' | '千元' | '万元' | '百万元' | '亿元';
    /** 是否检测到追溯重述 */
    restated: boolean;
    industry?: IndustryDetection;
  };
}

// ================= 行与行带 =================

interface PdfLine {
  y: number;
  items: PdfTextItem[];
  text: string;
}

function buildLines(items: PdfTextItem[]): PdfLine[] {
  const sorted = [...items].sort((a, b) => a.y - b.y || a.x - b.x);
  const lines: PdfLine[] = [];
  for (const it of sorted) {
    const last = lines[lines.length - 1];
    const tol = Math.max(3, it.h * 0.45);
    if (last && Math.abs(it.y - last.y) <= tol) {
      last.items.push(it);
      last.y = (last.y * (last.items.length - 1) + it.y) / last.items.length;
    } else {
      lines.push({ y: it.y, items: [it], text: '' });
    }
  }
  for (const ln of lines) {
    ln.items.sort((a, b) => a.x - b.x);
    ln.text = ln.items.map((i) => i.str).join('');
  }
  return lines;
}

const MINUS_RE = /^[-−–—‐‑‒﹣－]$/;
const NUM_RE = /^-?\d{1,3}(,\d{3})+(\.\d+)?%?$|^-?\d+(\.\d+)?%?$/;
/** 数字断片：以 . 或 , 结尾（如 "1,430,458,946."），需与下一个数字片段合并 */
const FRAG_RE = /^-?\d{1,3}(,\d{3})*[.,]?$/;

interface BandCell {
  value: number;
  isPercent: boolean;
  raw: string;
  x: number; // 中心 x
  rect: SearchMatchRect;
}

/** 把行带内的文字项合并成数字单元：断片拼接 + 负号合并 */
function bandCells(bandItems: PdfTextItem[]): BandCell[] {
  const sorted = [...bandItems].sort((a, b) => a.x - b.x || a.y - b.y);
  const merged: { str: string; x: number; y: number; w: number; h: number }[] = [];
  for (const it of sorted) {
    const t = it.str.replace(/\s+/g, '').replace(/[−–—‐‑‒﹣－]/g, '-');
    if (!t) continue;
    const prev = merged[merged.length - 1];
    if (prev) {
      const prevEnd = prev.x + prev.w;
      const gap = it.x - prevEnd;
      // 负号与数字合并
      if (MINUS_RE.test(prev.str) && /^\d/.test(t) && gap < 18) {
        prev.str += t;
        prev.w = it.x + it.w - prev.x;
        continue;
      }
      // 断片合并：前段以 . 或 , 结尾且下一段以数字开头（数字右对齐时允许 x 范围重叠）
      if (
        FRAG_RE.test(prev.str) && /[.,]$/.test(prev.str) && /^\d{1,3}$/.test(t) &&
        it.x < prevEnd + 14 && it.x + it.w > prev.x - 4
      ) {
        prev.str += t;
        prev.w = Math.max(prev.w, it.x + it.w - prev.x);
        continue;
      }
      // 短尾组断片：前段千分位最后一组不足 3 位（如 "1,430,458,94"），下一段为剩余位数（可带小数）
      if (
        /^-?\d{1,3}(,\d{3})*,\d{1,2}$/.test(prev.str) && /^\d{1,3}(\.\d+)?$/.test(t) &&
        it.x < prevEnd + 14 && it.x + it.w > prev.x - 4
      ) {
        prev.str += t;
        prev.w = Math.max(prev.w, it.x + it.w - prev.x);
        continue;
      }
    }
    merged.push({ str: t, x: it.x, y: it.y, w: it.w, h: it.h });
  }

  const cells: BandCell[] = [];
  for (const m of merged) {
    // 断片未合并时尾部残留的 . 或 , 先剥除再校验
    const norm = m.str.replace(/[.,]$/, '');
    if (!NUM_RE.test(norm)) continue;
    const isPercent = norm.endsWith('%');
    const value = parseFloat(norm.replace(/[,%]/g, ''));
    if (Number.isNaN(value)) continue;
    cells.push({
      value,
      isPercent,
      raw: norm,
      x: m.x + m.w / 2,
      rect: { x: m.x, y: m.y, w: m.w, h: m.h },
    });
  }
  return cells;
}

// ================= 列头映射 =================

interface HeaderEntry {
  kind: 'year' | 'pre' | 'post' | 'delta' | 'cur' | 'prev';
  year?: number;
  x: number;
}

/** 在行带上方区域寻找表头项（年份 / 调整前后 / 期末期初 / 本期上期 / 增减） */
function headerEntries(pageItems: PdfTextItem[], bandTop: number): HeaderEntry[] {
  // 先按 y 聚行，只保留"像表头"的行（≥2 个表头关键词项），排除散文中散落的年份
  const region = pageItems.filter((it) => it.y < bandTop - 4 && it.y >= bandTop - 170);
  const byY = new Map<number, PdfTextItem[]>();
  for (const it of region) {
    const key = [...byY.keys()].find((y) => Math.abs(y - it.y) <= 4);
    if (key !== undefined) byY.get(key)!.push(it);
    else byY.set(it.y, [it]);
  }
  const isHeadItem = (t: string) =>
    /^(20\d{2})年?末?$/.test(t) || t.includes('调整前') || t.includes('调整后') ||
    t.includes('增减') || /^期末/.test(t) || /^期初/.test(t) || t === '本期金额' || t === '上期金额';
  const entries: HeaderEntry[] = [];
  for (const items of byY.values()) {
    const texts = items.map((i) => i.str.replace(/\s+/g, ''));
    if (texts.filter(isHeadItem).length < 2) continue; // 单行至少两个表头项才算表头行
    for (const it of items) {
      const t = it.str.replace(/\s+/g, '');
      const ym = t.match(/^(20\d{2})年?末?$/);
      if (ym) entries.push({ kind: 'year', year: parseInt(ym[1], 10), x: it.x + it.w / 2 });
      else if (t.includes('调整前')) entries.push({ kind: 'pre', x: it.x + it.w / 2 });
      else if (t.includes('调整后')) entries.push({ kind: 'post', x: it.x + it.w / 2 });
      else if (t.includes('增减')) entries.push({ kind: 'delta', x: it.x + it.w / 2 });
      else if (/^期末/.test(t) || t === '本期金额') entries.push({ kind: 'cur', x: it.x + it.w / 2 });
      else if (/^期初/.test(t) || t === '上期金额') entries.push({ kind: 'prev', x: it.x + it.w / 2 });
    }
  }
  return entries;
}

/**
 * 为每个目标年份解析列 x 位置。
 * 追溯重述表：本年列取年份表头 x；历史年取「调整后」列，按与年份表头的最近距离配对。
 */
function resolveColumns(
  entries: HeaderEntry[],
  yearSeq: number[],
): Map<number, number> {
  const map = new Map<number, number>();
  const posts = entries.filter((e) => e.kind === 'post').sort((a, b) => a.x - b.x);
  const years = entries.filter((e) => e.kind === 'year').sort((a, b) => a.x - b.x);

  if (posts.length > 0) {
    const fyEntry = years.find((e) => e.year === yearSeq[0]);
    // fyEntry 缺失时用 -1 标记：调用方取行内最左侧数据单元作为本年列
    map.set(yearSeq[0], fyEntry ? fyEntry.x : -1);
    // 「调整后」列与历史年份表头做一对一最优配对（按距离贪心）
    const histYears = years.filter((e) => e.year !== yearSeq[0] && e.year !== undefined);
    const pairs = posts
      .flatMap((p) => histYears.map((y) => ({ p, y, d: Math.abs(y.x - p.x) })))
      .filter((c) => c.d < 130)
      .sort((a, b) => a.d - b.d);
    const usedPost = new Set<number>();
    const usedYear = new Set<number>();
    for (const { p, y } of pairs) {
      if (usedPost.has(p.x) || usedYear.has(y.year!)) continue;
      map.set(y.year!, p.x);
      usedPost.add(p.x);
      usedYear.add(y.year!);
    }
    return map;
  }

  for (const e of years) {
    if (e.year !== undefined && yearSeq.includes(e.year) && !map.has(e.year)) {
      map.set(e.year, e.x);
    }
  }
  if (map.size > 0) return map;

  const cur = entries.find((e) => e.kind === 'cur');
  const prev = entries.find((e) => e.kind === 'prev');
  if (cur) map.set(yearSeq[0], cur.x);
  if (prev && yearSeq[1] !== undefined) map.set(yearSeq[1], prev.x);
  return map;
}

// ================= 指标定义 =================

type MetricKey =
  | 'revenue' | 'netProfit' | 'netProfitDeducted' | 'ocf' | 'cost'
  | 'ar' | 'contractAsset' | 'inventory' | 'goodwill' | 'totalAssets' | 'totalLiab'
  | 'top5' | 'grossMargin';

interface MetricDef {
  key: MetricKey;
  label: string;
  category: Fact['category'];
  unit: '%' | 'money';
  aliases: string[];
  exclude?: string[];
  yearSpan: 1 | 2 | 3;
  cellType: 'money' | 'percent';
}

const METRICS: MetricDef[] = [
  { key: 'revenue', label: '营业收入', category: '收入利润', unit: 'money', cellType: 'money', yearSpan: 3,
    aliases: ['营业收入'], exclude: ['利息收入', '分行业', '比上年'] },
  { key: 'netProfit', label: '归母净利润', category: '收入利润', unit: 'money', cellType: 'money', yearSpan: 3,
    aliases: ['归属于上市公司股东的净利润', '归属于母公司股东的净利润', '归属于上市公司股东的净利'],
    exclude: ['扣除', '净资产'] },
  { key: 'netProfitDeducted', label: '扣非净利润', category: '收入利润', unit: 'money', cellType: 'money', yearSpan: 3,
    aliases: ['扣除非经常性损益的净利润'] },
  { key: 'ocf', label: '经营活动现金流净额', category: '现金流', unit: 'money', cellType: 'money', yearSpan: 3,
    aliases: ['经营活动产生的现金流量净额'], exclude: ['投资活动', '筹资活动'] },
  { key: 'cost', label: '营业成本', category: '收入利润', unit: 'money', cellType: 'money', yearSpan: 2,
    aliases: ['营业成本'], exclude: ['营业总成本', '比上年'] },
  { key: 'ar', label: '应收账款', category: '资产负债', unit: 'money', cellType: 'money', yearSpan: 2,
    aliases: ['应收账款'], exclude: ['周转', '应收账款融资', '坏账准备', '账龄', '回款'] },
  { key: 'contractAsset', label: '合同资产', category: '资产负债', unit: 'money', cellType: 'money', yearSpan: 2,
    aliases: ['合同资产'], exclude: ['合同资产减值', '合同负债'] },
  { key: 'inventory', label: '存货', category: '资产负债', unit: 'money', cellType: 'money', yearSpan: 2,
    aliases: ['存货'], exclude: ['周转', '跌价'] },
  { key: 'goodwill', label: '商誉', category: '资产负债', unit: 'money', cellType: 'money', yearSpan: 2,
    aliases: ['商誉'], exclude: ['减值', '形成', '测试', '账面价值', '准备'] },
  { key: 'totalAssets', label: '资产总计', category: '资产负债', unit: 'money', cellType: 'money', yearSpan: 2,
    aliases: ['资产总计', '总资产'], exclude: ['流动资产', '非流动资产'] },
  { key: 'totalLiab', label: '负债合计', category: '资产负债', unit: 'money', cellType: 'money', yearSpan: 2,
    aliases: ['负债合计', '负债总额'], exclude: ['流动负债', '非流动负债'] },
  { key: 'top5', label: '前五大客户收入占比', category: '客户与板块', unit: '%', cellType: 'percent', yearSpan: 1,
    aliases: ['前五名客户合计销售金额占', '前五名客户销售额占', '前五名客户销售额', '前五大客户销售额', '向前五名客户销售'] },
  { key: 'grossMargin', label: '毛利率', category: '收入利润', unit: '%', cellType: 'percent', yearSpan: 1,
    aliases: ['综合毛利率', '整体毛利率', '毛利率为', '毛利率　'] },
];

const UNIT_DIVISOR: Record<ExtractionResult['meta']['unit'], number> = {
  元: 1e8, 千元: 1e5, 万元: 1e4, 百万元: 1e2, 亿元: 1,
};

function chapterOf(chapters: DetectedChapter[], page: number): string {
  return chapters.find((c) => page >= c.pageStart && page <= c.pageEnd)?.title ?? '';
}

function snippet(text: string, key: string, radius = 45): string {
  const i = text.indexOf(key);
  if (i === -1) return '';
  return text.slice(Math.max(0, i - radius), i + key.length + radius).replace(/\s+/g, ' ').trim();
}

// ================= 行业自动识别（确定性关键词） =================

/** 明示句式命中时的行业映射（顺序即优先级：金融最特异，最先判） */
const INDUSTRY_EXPLICIT: [string, RegExp][] = [
  ['kp-financial', /银行|保险|证券|信托/],
  ['kp-construction', /建筑|工程施工|总承包|基建|市政|房建|路桥/],
  ['kp-manufacturing', /制造|汽车|零部件|电子|装备|机械|电气|家电|医药|化工|食品|纺织|生产/],
];

/** 兜底打分用的特异性词组（避免「金融」「生产」等泛词污染） */
const INDUSTRY_SCORE: [string, string[]][] = [
  ['kp-financial', ['不良贷款', '资本充足率', '拨备覆盖率', '贷款总额', '保费收入']],
  ['kp-construction', ['工程施工', '总承包', '已完工未结算', '项目部', '中标价']],
  ['kp-manufacturing', ['生产线', '产能', '产量', '库存商品', '主机厂', '贴片']],
];

/**
 * 识别企业所属行业 → 知识包 id。
 * 优先命中年报「公司简介」中的明示句式（如「本公司行业性质：汽车零配件及配件制造业」）；
 * 否则用特异性词组在前 15 页打分兜底。全程确定性，附原文出处。
 */
function detectIndustry(pdf: LoadedPdf): IndustryDetection | undefined {
  // 第一遍：全文找明示行业句式（可能在「公司简介」，也可能在附注「公司基本情况」）
  // 只匹配触发词、手工截取后续文本，避免贪婪捕获吞掉下一个触发词
  const triggerRe = /行业性质|所属行业|行业类别|所处行业(?!环境)/g;
  for (const p of pdf.pages) {
    // PDF 文字项之间以空格连接，正文中关键词可能不连续，先去空白再匹配
    const t = p.text.replace(/\s+/g, '');
    for (const m of t.matchAll(triggerRe)) {
      const rest = t.slice(m.index + m[0].length).replace(/^[：:为是]?[，,、]?/, '');
      const end = rest.search(/[。；;，,、\n]/);
      const raw = rest.slice(0, end === -1 ? 30 : Math.min(end, 30));
      // 排除标题式表述（「行业性质、经营范围及主要产品」）与风险披露句式（「行业环境变化」）
      if (!raw || /环境|变化|政策|风险|影响|趋势|波动|情况|行业性质|所属行业|行业类别|经营范围|主要产品|劳务/.test(raw)) continue;
      for (const [packId, re] of INDUSTRY_EXPLICIT) {
        if (re.test(raw)) {
          return { packId, raw, page: p.page, quote: snippet(t, t.slice(m.index, m.index + 8), 45), method: 'explicit' };
        }
      }
    }
  }
  // 第二遍：前 25 页找「主营业务是 / 为……」句式
  for (const p of pdf.pages.slice(0, 25)) {
    const t = p.text.replace(/\s+/g, '');
    const m = t.match(/主营业务(?:是|为|包括)[：:]?([^\n。；;]{2,40})/);
    if (!m) continue;
    const raw = m[1];
    for (const [packId, re] of INDUSTRY_EXPLICIT) {
      if (re.test(raw)) {
        return { packId, raw: `主营业务：${raw}`, page: p.page, quote: snippet(t, m[0].slice(0, 8), 45), method: 'explicit' };
      }
    }
  }
  // 第三遍：特异性词组打分兜底（前 15 页）
  const scores = new Map<string, number>();
  for (const p of pdf.pages.slice(0, 15)) {
    const t = p.text.replace(/\s+/g, '');
    for (const [packId, kws] of INDUSTRY_SCORE) {
      const hits = kws.reduce((acc, kw) => acc + t.split(kw).length - 1, 0);
      scores.set(packId, (scores.get(packId) ?? 0) + hits);
    }
  }
  const ranked = [...scores.entries()].sort((a, b) => b[1] - a[1]);
  if (ranked[0] && ranked[0][1] >= 8) {
    return { packId: ranked[0][0], raw: '', page: 1, quote: '', method: 'keyword' };
  }
  return undefined;
}

// ================= 主流程 =================

export function extractFacts(pdf: LoadedPdf, chapters: DetectedChapter[]): ExtractionResult {
  const pageLines = new Map<number, PdfLine[]>();
  for (const p of pdf.pages) {
    if (!p.isImageOnly) pageLines.set(p.page, buildLines(p.items));
  }

  // ---- 元信息 ----
  const fullTextHead = pdf.pages.slice(0, 3).map((p) => p.text).join('\n');
  const titleM = fullTextHead.match(/20\d{2}\s*年\s*年度报告/);
  const reportTitle = titleM?.[0].replace(/\s+/g, '');
  const nameM = fullTextHead.match(/[\u4e00-\u9fa5A-Za-z（）()]{2,30}股份有限公司/);
  const companyName = nameM?.[0];
  let fiscalYear = reportTitle ? parseInt(reportTitle.slice(0, 4), 10) : undefined;
  if (!fiscalYear) {
    outer: for (const p of pdf.pages.slice(0, 15)) {
      const ys = [...p.text.matchAll(/(20\d{2})\s*年/g)].map((m) => parseInt(m[1], 10));
      if (ys.length >= 2) { fiscalYear = Math.max(...ys); break outer; }
    }
  }
  const fy = fiscalYear ?? new Date().getFullYear() - 1;

  const unitM = pdf.pages.slice(0, 40).map((p) => p.text).join('').match(/单位[:：]\s*(百万元|千元|万元|亿元|元)/);
  const unit = (unitM?.[1] as ExtractionResult['meta']['unit']) ?? '元';
  const divisor = UNIT_DIVISOR[unit];

  const restated = pdf.pages.some((p) => p.text.includes('追溯调整或重述原因') && p.text.includes('会计差错更正'));

  const industry = detectIndustry(pdf);

  const facts: RealFact[] = [];
  const diagnostics: MetricDiagnostic[] = [];

  const pushFact = (
    def: { key: string; label: string; category: Fact['category'] },
    year: number,
    value: number,
    unitLabel: string,
    pageNum: number,
    quote: string,
    rects: SearchMatchRect[],
  ) => {
    if (facts.some((f) => f.label === def.label && f.year === year)) return;
    facts.push({
      id: `rf-${def.key}-${year}`,
      label: def.label,
      value,
      unit: unitLabel,
      year,
      category: def.category,
      anchor: { page: pageNum, chapter: chapterOf(chapters, pageNum), quote: quote.slice(0, 160) },
      rects,
    });
  };

  // ---- 表格指标提取 ----
  const BAND_TOL = 13;

  for (const def of METRICS) {
    const yearsFound: number[] = [];
    const pagesFound: number[] = [];
    const yearSeq = def.yearSpan === 3 ? [fy, fy - 1, fy - 2] : def.yearSpan === 2 ? [fy, fy - 1] : [fy];

    pageLoop: for (const p of pdf.pages) {
      const lines = pageLines.get(p.page);
      if (!lines) continue;

      for (const line of lines) {
        // 行带文本（覆盖换行的长标签与断片数字）
        const bandItems = p.items.filter((it) => Math.abs(it.y - line.y) <= BAND_TOL);
        const bandText = bandItems.map((i) => i.str).join('').replace(/\s+/g, '');
        const alias = def.aliases.find((a) => bandText.includes(a));
        if (!alias) continue;
        if (def.exclude?.some((e) => bandText.includes(e))) continue;

        // 分季度表守卫（表头可能距数据行较远，窗口放大到 150px）
        const quarterNear = p.items.some(
          (it) => it.y >= line.y - 150 && it.y <= line.y + BAND_TOL && it.str.includes('季度'),
        );
        if (quarterNear) continue;

        const cells = bandCells(bandItems);

        if (def.cellType === 'percent') {
          const m = bandText.match(/([\d,]+(?:\.\d+)?)\s*%/);
          if (!m) continue;
          const value = Math.round(parseFloat(m[1].replace(/,/g, '')) * 10) / 10;
          const first = bandItems[0];
          pushFact(def, fy, value, '%', p.page, bandText.slice(0, 120), first ? [{ x: first.x, y: first.y, w: first.w, h: first.h }] : []);
          yearsFound.push(fy);
          pagesFound.push(p.page);
          break pageLoop;
        }

        // money：至少一个"大数"单元（含逗号或 ≥1e5），过滤散文中的年份等小数字
        const moneyCells = cells.filter((c) => !c.isPercent);
        if (!moneyCells.some((c) => c.raw.includes(',') || Math.abs(c.value) >= 1e5)) continue;
        // 主表指标（3 年列）数值必然≥一定量级，丢弃断片残留的小数字（按单位自适应阈值）
        const pool =
          def.yearSpan === 3
            ? moneyCells.filter((c) => Math.abs(c.value) >= 0.0001 * divisor)
            : moneyCells;
        if (pool.length === 0) continue;

// 这些科目在年报中不可能为负；出现负值说明抓到了错位的单元格（如上期调整数、小字脚注）
const NONNEG_KEYS = new Set(['revenue', 'cost', 'ar', 'contractAsset', 'inventory', 'goodwill', 'totalAssets', 'totalLiab']);

        // 营业成本 sanity：整行最大数应与当年收入同量级（剔除分产品 / 其他业务成本等局部小行）
        if (def.key === 'cost') {
          const refRev = facts.find((f) => f.label === '营业收入' && f.year === fy)?.value; // 亿元
          if (refRev !== undefined) {
            const rowMax = Math.max(...pool.map((c) => Math.abs(c.value))) / divisor;
            if (rowMax < refRev * 0.15 || rowMax > refRev * 1.6) continue;
          }
        }

        const colMap = resolveColumns(headerEntries(p.items, line.y - BAND_TOL), yearSeq);
        const rects0 = bandItems.slice(0, 2).map((it) => ({ x: it.x, y: it.y, w: it.w, h: it.h }));

        if (colMap.size > 0) {
          for (const [year, colX] of colMap) {
            // colX = -1：本年列表头缺失，取行内最左侧数据单元
            const cell =
              colX === -1
                  ? [...pool].sort((a, b) => a.x - b.x)[0]
                  : pool
                      .filter((c) => Math.abs(c.x - colX) <= 95)
                      .sort((a, b) => Math.abs(a.x - colX) - Math.abs(b.x - colX))[0];
            if (!cell) continue;
            const value = Math.round((cell.value / divisor) * 100) / 100;
            if (value === 0) continue; // 0 亿元 = 凑数小格（合计空列等），无研判价值
            if (value < 0 && NONNEG_KEYS.has(def.key)) continue; // 收入/成本/资产类不可能为负，负值 = 抓错格
            pushFact(def, year, value, '亿元', p.page, bandText.slice(0, 120), [...rects0, cell.rect]);
            yearsFound.push(year);
            pagesFound.push(p.page);
          }
        } else {
          // 顺序回退（无表头时），剔除数量级异常的小数列
          let picked = pool;
          if (picked.length > def.yearSpan) {
            const max = Math.max(...picked.map((c) => Math.abs(c.value)));
            const filtered = picked.filter((c) => Math.abs(c.value) >= max / 10000);
            if (filtered.length >= def.yearSpan) picked = filtered;
          }
          picked.slice(0, def.yearSpan).forEach((cell, i) => {
            const value = Math.round((cell.value / divisor) * 100) / 100;
            if (value === 0) return;
            if (value < 0 && NONNEG_KEYS.has(def.key)) return;
            pushFact(def, yearSeq[i], value, '亿元', p.page, bandText.slice(0, 120), [...rects0, cell.rect]);
            yearsFound.push(yearSeq[i]);
            pagesFound.push(p.page);
          });
        }

        if (yearsFound.length >= def.yearSpan) break pageLoop;
      }
    }

    diagnostics.push({
      key: def.key,
      label: def.label,
      status: yearsFound.length > 0 ? 'found' : 'missing',
      years: [...new Set(yearsFound)].sort(),
      pages: [...new Set(pagesFound)].sort((a, b) => a - b),
      note: restated && def.yearSpan === 3 && yearsFound.length > 0 ? '检测到追溯重述，历史年份采用「调整后」数据' : undefined,
    });
  }

  // ---- 派生指标（程序计算） ----
  const val = (label: string, year: number) => facts.find((f) => f.label === label && f.year === year)?.value;

  for (const y of [fy, fy - 1]) {
    const liab = val('负债合计', y);
    const assets = val('资产总计', y);
    if (liab !== undefined && assets) {
      const src = facts.find((f) => f.label === '负债合计' && f.year === y)!;
      pushFact(
        { key: 'debtRatio', label: '资产负债率', category: '资产负债' },
        y, Math.round((liab / assets) * 1000) / 10, '%', src.anchor.page,
        `程序计算：负债合计 ${liab} / 资产总计 ${assets}（亿元）`, src.rects,
      );
    }
  }
  diagnostics.push({
    key: 'debtRatio', label: '资产负债率',
    status: facts.some((f) => f.label === '资产负债率') ? 'found' : 'missing',
    years: facts.filter((f) => f.label === '资产负债率').map((f) => f.year),
    pages: facts.filter((f) => f.label === '资产负债率').map((f) => f.anchor.page),
    note: '由程序计算（负债合计 ÷ 资产总计）',
  });

  for (const y of [fy, fy - 1, fy - 2]) {
    const np = val('归母净利润', y);
    const npd = val('扣非净利润', y);
    if (np !== undefined && npd !== undefined) {
      const src = facts.find((f) => f.label === '归母净利润' && f.year === y)!;
      pushFact(
        { key: 'nri', label: '非经常性损益', category: '收入利润' },
        y, Math.round((np - npd) * 100) / 100, '亿元', src.anchor.page,
        `程序计算：归母净利润 ${np} − 扣非净利润 ${npd}（亿元）`, src.rects,
      );
    }
  }
  diagnostics.push({
    key: 'nri', label: '非经常性损益',
    status: facts.some((f) => f.label === '非经常性损益') ? 'found' : 'missing',
    years: facts.filter((f) => f.label === '非经常性损益').map((f) => f.year),
    pages: facts.filter((f) => f.label === '非经常性损益').map((f) => f.anchor.page),
    note: '由程序计算（归母净利润 − 扣非净利润）',
  });

  for (const y of [fy, fy - 1]) {
    const rev = val('营业收入', y);
    const cost = val('营业成本', y);
    if (rev !== undefined && cost !== undefined && rev !== 0 && !facts.some((f) => f.label === '毛利率' && f.year === y)) {
      const src = facts.find((f) => f.label === '营业成本' && f.year === y)!;
      pushFact(
        { key: 'grossMargin', label: '毛利率', category: '收入利润' },
        y, Math.round(((rev - cost) / rev) * 1000) / 10, '%', src.anchor.page,
        `程序计算：(营业收入 ${rev} − 营业成本 ${cost}) / 营业收入（亿元）`, src.rects,
      );
    }
  }

  // ---- 审计意见 ----
  const auditM = pdf.pages
    .map((p) => ({ page: p.page, m: p.text.match(/标准的无保留意见|保留意见|无法表示意见|否定意见/) }))
    .find((x) => x.m);
  if (auditM?.m) {
    const pageData = pdf.pages[auditM.page - 1];
    const it = pageData.items.find((i) => i.str.includes(auditM.m![0].slice(0, 3)));
    pushFact(
      { key: 'audit', label: '审计意见', category: '审计与附注' },
      fy, 0, auditM.m[0], auditM.page, snippet(pageData.text, auditM.m[0], 50),
      it ? [{ x: it.x, y: it.y, w: it.w, h: it.h }] : [],
    );
  }
  diagnostics.push({
    key: 'audit', label: '审计意见',
    status: auditM ? 'found' : 'missing',
    years: auditM ? [fy] : [], pages: auditM ? [auditM.page] : [],
  });

  // ---- 治理与合规信号（文字型事实，确定性关键词 + 语境判定 + 原文定位） ----
  // 真实年报的模板陷阱：监管问答模板（「□适用√不适用」「□是√否」）会让裸关键词大量误报。
  // 因此每类信号都要求「阳性语境」（表决结果 / 专项说明 / 余额披露），模板否定句式一律不计。
  const govSignals: {
    key: string;
    label: string;
    /** 返回命中关键词（供高亮定位）；未命中返回 undefined */
    match: (pageText: string) => string | undefined;
  }[] = [
    {
      key: 'restatement',
      label: '会计差错更正',
      match: (t) => {
        if (!t.includes('会计差错更正')) return undefined;
        if (/√\s*是[\s\S]{0,30}会计差错更正/.test(t)) return '会计差错更正'; // 追溯重述问答「√是□否」
        if (/会计差错更正[\s\S]{0,25}√\s*适用/.test(t)) return '会计差错更正'; // 重大差错更正「√适用」
        if (t.includes('前期会计差错更正')) return '前期会计差错更正'; // 公告名称引用
        if (t.includes('差错更正的专项说明')) return '差错更正的专项说明'; // 审计专项说明
        return undefined;
      },
    },
    {
      key: 'regulatory',
      label: '监管调查与处罚',
      match: (t) => {
        if (!t.includes('立案调查') || !t.includes('行政处罚')) return undefined;
        const i = t.indexOf('立案调查');
        const w = t.slice(Math.max(0, i - 50), i + 60);
        if (/不存在|未受到|未被|免于/.test(w)) return undefined; // 「不存在被立案调查…」模板否定
        return '立案调查';
      },
    },
    {
      key: 'occupation',
      label: '控股股东资金占用',
      match: (t) => {
        if (!t.includes('占用')) return undefined;
        if (/(?<!不)存在控股股东[\s\S]{0,30}非经营性占用/.test(t)) return '非经营性占用'; // 「存在控股股东…非经营性占用」（排除「不存在」）
        if (/非经营性占用资金[\s\S]{0,40}(余额|归还|清偿|利息)/.test(t)) return '非经营性占用资金'; // 占用余额 / 清偿进展披露
        return undefined;
      },
    },
  ];
  for (const sig of govSignals) {
    let hit: { page: number; key: string } | undefined;
    for (const p of pdf.pages) {
      const key = sig.match(p.text.replace(/\s+/g, ''));
      if (key) { hit = { page: p.page, key }; break; }
    }
    if (hit) {
      const pageData = pdf.pages[hit.page - 1];
      const it = pageData.items.find((i) => i.str.includes(hit!.key.slice(0, 3)));
      pushFact(
        { key: sig.key, label: sig.label, category: '审计与附注' },
        fy, 0, '已披露', hit.page, snippet(pageData.text, hit.key, 55),
        it ? [{ x: it.x, y: it.y, w: it.w, h: it.h }] : [],
      );
    }
    diagnostics.push({
      key: sig.key, label: sig.label,
      status: hit ? 'found' : 'missing',
      years: hit ? [fy] : [], pages: hit ? [hit.page] : [],
      note: '文字型事实：披露存在性确认',
    });
  }

  return {
    facts: facts.sort((a, b) => a.anchor.page - b.anchor.page || a.year - b.year),
    diagnostics,
    meta: { companyName, reportTitle, fiscalYear, unit, restated, industry },
  };
}
