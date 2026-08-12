import { useEffect, useMemo, useRef, useState } from 'react';
import { Routes, Route } from 'react-router';
import type { AnchorSelection } from '@/types/research';
import { demoReport } from '@/data/demoReport';
import { knowledgePacks } from '@/data/knowledgePacks';
import { computeRiskCards } from '@/lib/signals';
import type { SearchMatchRect } from '@/lib/pdf';
import { loadPdf, detectChapters } from '@/lib/pdf';
import { extractFacts } from '@/lib/extract';
import type { RealFact } from '@/lib/extract';
import { mergeFacts, type DocEntry } from '@/lib/merge';
import { analyzeMultiYear } from '@/lib/timeseries';
import {
  explainCard, getCachedNarrative, multiSummaryHash, narrativeHash, summarizeMultiYear,
  type AiNarrative, type ExplainContext, type MultiSummaryInput,
} from '@/lib/ai';
import {
  analysisId, deleteAnalysis, listAnalyses, loadAnalysis, saveAnalysis, type AnalysisMeta,
} from '@/lib/store';
import CoverageSidebar from '@/sections/CoverageSidebar';
import OverviewSection from '@/sections/OverviewSection';
import FactsSection from '@/sections/FactsSection';
import RiskCardsSection from '@/sections/RiskCardsSection';
import KnowledgePackSection from '@/sections/KnowledgePackSection';
import PdfPanel from '@/sections/PdfPanel';
import RealChaptersSidebar from '@/sections/RealChaptersSidebar';
import DocIndexSection from '@/sections/DocIndexSection';
import SearchSection from '@/sections/SearchSection';
import RealPdfPanel from '@/sections/RealPdfPanel';
import RealFactsSection from '@/sections/RealFactsSection';
import CompareSection from '@/sections/CompareSection';
import MultiYearSection from '@/sections/MultiYearSection';
import WelcomeSection from '@/sections/WelcomeSection';
import AiChatPanel from '@/sections/AiChatPanel';
import TraceDesk from '@/sections/TraceDesk';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Group, Panel, Separator } from 'react-resizable-panels';
import { Upload, Loader2, FlaskConical, ArrowLeftRight, History, Trash2, X, Sparkles, PanelLeftOpen } from 'lucide-react';
import JianweiLogo from '@/components/JianweiLogo';
import { cn } from '@/lib/utils';

/** 可拖拽分隔条 */
function ResizeHandle() {
  return (
    <Separator className="group relative w-1.5 bg-stone-200 transition-colors hover:bg-cinnabar-400">
      <div className="absolute inset-y-0 -left-1 -right-1 cursor-col-resize" />
      <div className="absolute left-1/2 top-1/2 h-8 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-stone-400 group-hover:bg-cinnabar-600" />
    </Separator>
  );
}

type DemoTab = 'overview' | 'facts' | 'risks' | 'pack';
type RealTab = 'multi' | 'index' | 'facts' | 'compare' | 'risks' | 'search' | 'pack';
/** 解析进度：done/total 为当前文件页进度；多文件时附带文件序号 */
interface ParseProgress { done: number; total: number; fileIndex?: number; fileTotal?: number; fileName?: string }

function ResearchDesk() {
  // ---- 真实 PDF 模式状态（支持多年报） ----
  const [docs, setDocs] = useState<DocEntry[]>([]);
  const [activeDocId, setActiveDocId] = useState<string | null>(null);
  const [parsing, setParsing] = useState<ParseProgress | null>(null);
  const [realTab, setRealTab] = useState<RealTab>('index');
  const [realPage, setRealPage] = useState(1);
  const [highlights, setHighlights] = useState<SearchMatchRect[]>([]);
  const [pdfPanelOpen, setPdfPanelOpen] = useState(false);
  /** 手动覆盖的知识包；null = 跟随行业自动识别 */
  const [riskPackOverride, setRiskPackOverride] = useState<string | null>(null);
  /** AI 解释层结果（按卡片 id 索引） */
  const [aiMap, setAiMap] = useState<Record<string, AiNarrative>>({});
  const [aiPending, setAiPending] = useState(0);
  const [aiFailed, setAiFailed] = useState(0);
  /** 历史分析面板 */
  const [historyOpen, setHistoryOpen] = useState(false);
  const [history, setHistory] = useState<AnalysisMeta[]>([]);
  const [restoring, setRestoring] = useState(false);
  /** AI 对话抽屉（最左侧） */
  const [chatOpen, setChatOpen] = useState(false);
  /** 左侧「阅读覆盖证明」栏收起状态 */
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  /** 演示模式：默认关闭，初始为空白工作台 */
  const [demoMode, setDemoMode] = useState(false);
  /** 调研溯源模式：展示带网络来源锚点的调研报告（左报告右原文标红） */
  const [traceMode, setTraceMode] = useState(false);
  /** 欢迎页：leaving=正在做离场过渡；welcomeGone=已离场 */
  const [welcomeGone, setWelcomeGone] = useState(false);
  const [leaving, setLeaving] = useState(false);
  /** 产品页镜头：from-near=由近拉远入场；to-near=推向近处离场 */
  const [deskFx, setDeskFx] = useState<'' | 'from-near' | 'to-near'>('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 深链：?trace=1 直接进入调研溯源模式（跳过欢迎页）
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('trace') === '1') {
      setTraceMode(true);
      setWelcomeGone(true);
    }
  }, []);

  const activeDoc = docs.find((d) => d.id === activeDocId) ?? null;
  const realPdf = activeDoc?.pdf ?? null;
  const chapters = useMemo(() => activeDoc?.chapters ?? [], [activeDoc]);
  const extraction = activeDoc?.extraction ?? null;
  const latestDoc = useMemo(
    () => [...docs].sort((a, b) => (b.extraction.meta.fiscalYear ?? 0) - (a.extraction.meta.fiscalYear ?? 0))[0] ?? null,
    [docs],
  );
  const latestFy = latestDoc?.extraction.meta.fiscalYear;

  /** 多年报合并事实（同指标同年份优先本财年主表） */
  const merged = useMemo(() => mergeFacts(docs), [docs]);

  /** 有年报文档的会计年度（升序）与跨期分析 */
  const docYears = useMemo(
    () => docs
      .map((d) => d.extraction.meta.fiscalYear)
      .filter((y): y is number => Boolean(y))
      .sort((a, b) => a - b),
    [docs],
  );
  const multiAnalysis = useMemo(
    () => (docYears.length > 1
      ? analyzeMultiYear(
          merged.facts,
          docYears,
          docs.map((d) => ({ fiscalYear: d.extraction.meta.fiscalYear, facts: d.extraction.facts })),
        )
      : null),
    [merged, docYears, docs],
  );
  /** 多年综合研判（AI 叙事弧） */
  const [aiSummary, setAiSummary] = useState<AiNarrative | undefined>(undefined);
  const [aiSummaryPending, setAiSummaryPending] = useState(false);

  const detectedPackId = latestDoc?.extraction.meta.industry?.packId;
  const riskPackId = riskPackOverride ?? detectedPackId ?? 'kp-manufacturing';
  const riskPack = knowledgePacks.find((p) => p.id === riskPackId) ?? knowledgePacks[0];
  const realRiskCards = useMemo(
    () => (latestFy ? computeRiskCards(merged.facts, riskPack, latestFy) : []),
    [merged, riskPack, latestFy],
  );

  // ---- AI 解释层：证据约束下生成 解释 / 反方 / 问题；失败回退模板 ----
  useEffect(() => {
    if (realRiskCards.length === 0 || !latestDoc || !latestFy) return;
    const meta = latestDoc.extraction.meta;
    const ctx: ExplainContext = {
      companyName: meta.companyName ?? latestDoc.pdf.fileName,
      industryRaw: meta.industry?.raw,
      packIndustry: riskPack.industry,
      fiscalYear: latestFy,
    };
    let cancelled = false;
    (async () => {
      const fromCache: Record<string, AiNarrative> = {};
      const todo = realRiskCards.filter((c) => {
        if (aiMap[c.id]) return false;
        const cached = getCachedNarrative(narrativeHash(c, merged.facts, ctx));
        if (cached) {
          fromCache[c.id] = cached;
          return false;
        }
        return true;
      });
      if (cancelled) return;
      if (Object.keys(fromCache).length > 0) setAiMap((m) => ({ ...fromCache, ...m }));
      setAiFailed(0);
      setAiPending(todo.length);
      // 并发 2，避免触发上游限流
      for (let i = 0; i < todo.length; i += 2) {
        const batch = todo.slice(i, i + 2);
        const results = await Promise.allSettled(batch.map((c) => explainCard(c, merged.facts, ctx)));
        if (cancelled) return;
        const got: Record<string, AiNarrative> = {};
        let failed = 0;
        results.forEach((r, j) => {
          if (r.status === 'fulfilled') got[batch[j].id] = r.value.narrative;
          else failed += 1;
        });
        if (Object.keys(got).length > 0) setAiMap((m) => ({ ...m, ...got }));
        if (failed > 0) setAiFailed((f) => f + failed);
        setAiPending((p) => Math.max(0, p - batch.length));
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [realRiskCards, riskPack, merged, latestDoc, latestFy]);

  // ---- AI 多年综合研判：确定性跨期结果 → 叙事弧；失败回退确定性摘要 ----
  useEffect(() => {
    if (!multiAnalysis || !latestDoc) {
      setAiSummary(undefined);
      setAiSummaryPending(false);
      return;
    }
    const meta = latestDoc.extraction.meta;
    const val = (label: string, y: number) => merged.facts.find((f) => f.label === label && f.year === y)?.value;
    const input: MultiSummaryInput = {
      companyName: meta.companyName ?? latestDoc.pdf.fileName,
      packIndustry: riskPack.industry,
      years: multiAnalysis.docYears,
      yearlyLines: multiAnalysis.docYears.map((y) =>
        `${y} 年：营业收入 ${val('营业收入', y) ?? '缺'} 亿元；归母净利润 ${val('归母净利润', y) ?? '缺'} 亿元；扣非净利润 ${val('扣非净利润', y) ?? '缺'} 亿元；经营活动现金流净额 ${val('经营活动现金流净额', y) ?? '缺'} 亿元；应收账款 ${val('应收账款', y) ?? '缺'} 亿元；资产负债率 ${val('资产负债率', y) ?? '缺'}%`,
      ),
      eventLines: multiAnalysis.events.map((e) => `${e.year} 年：${e.text}`),
      signalLines: multiAnalysis.cards.map((c) => `【${c.title}】${c.signal}`),
      evidenceLines: multiAnalysis.cards
        .flatMap((c) => c.evidenceFactIds)
        .slice(0, 10)
        .map((id) => merged.facts.find((f) => f.id === id))
        .filter((f): f is NonNullable<typeof f> => Boolean(f))
        .map((f) => `- ${f.label}（${f.year}）= ${f.value !== 0 ? `${f.value} ${f.unit}` : f.unit}｜年报 P${f.anchor.page}`),
    };
    let cancelled = false;
    (async () => {
      const cached = getCachedNarrative(multiSummaryHash(input));
      if (cached) {
        if (!cancelled) setAiSummary(cached);
        return;
      }
      setAiSummaryPending(true);
      try {
        const { narrative } = await summarizeMultiYear(input);
        if (!cancelled) setAiSummary(narrative);
      } catch {
        /* 失败时界面回退为确定性摘要 */
      } finally {
        if (!cancelled) setAiSummaryPending(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [multiAnalysis, latestDoc, riskPack]);

  // ---- 分析持久化：文档或 AI 研判变化后自动保存 ----
  useEffect(() => {
    if (docs.length === 0 || !latestDoc) return;
    const t = setTimeout(async () => {
      try {
        const company = latestDoc.extraction.meta.companyName ?? '未知公司';
        const fiscalYears = docs
          .map((d) => d.extraction.meta.fiscalYear)
          .filter((y): y is number => Boolean(y))
          .sort((a, b) => a - b);
        const files = await Promise.all(docs.map(async (d) => ({ name: d.file.name, data: await d.file.arrayBuffer() })));
        await saveAnalysis(
          { id: analysisId(company, fiscalYears), companyName: company, fiscalYears, fileNames: files.map((f) => f.name) },
          files,
          aiMap,
        );
      } catch {
        /* 存储不可用（私密模式等）：静默跳过 */
      }
    }, 1500);
    return () => clearTimeout(t);
  }, [docs, aiMap, latestDoc]);

  // ---- 历史分析面板数据（打开面板或处于欢迎页时加载） ----
  useEffect(() => {
    if (historyOpen || (docs.length === 0 && !demoMode)) {
      listAnalyses().then(setHistory).catch(() => setHistory([]));
    }
  }, [historyOpen, docs.length, demoMode]);

  /** 云海 → 产品页：相机穿门而入（场景内推近），光涌满屏后产品页由近拉远落定 */
  function enterWithTransition() {
    setLeaving(true);
    // 产品页立即挂 from-near（fill both + 1.5s 延迟）：延迟期间保持 opacity 0，
    // 保证欢迎页淡出时产品页不会提前闪现；动画本体 1.5s–2.6s 与光涌淡出交叉溶解。
    setDeskFx('from-near');
    window.setTimeout(() => {
      setWelcomeGone(true);
      setLeaving(false);
    }, 2000);
    window.setTimeout(() => setDeskFx(''), 2750);
  }

  /** 产品页 → 云海：产品页推向近处隐去，云海由远拉近浮现 */
  function leaveToHome() {
    setDeskFx('to-near');
    setWelcomeGone(false);
    window.setTimeout(() => {
      setDocs([]);
      setActiveDocId(null);
      setAiMap({});
      setAiFailed(0);
      setAiPending(0);
      setRiskPackOverride(null);
      setDemoMode(false);
      setTraceMode(false);
      setDeskFx('');
    }, 700);
  }

  /** 批量导入：逐份解析，按财年排序归位；公司名不一致逐份确认 */
  async function handleFiles(files: File[]) {
    if (files.length === 0) return;
    const total = files.length;
    let added = 0;
    let companySoFar = docs[0]?.extraction.meta.companyName;
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      setParsing({ done: 0, total: 0, fileIndex: i + 1, fileTotal: total, fileName: file.name });
      try {
        const pdf = await loadPdf(file, (done, t) =>
          setParsing({ done, total: t, fileIndex: i + 1, fileTotal: total, fileName: file.name }));
        const chs = detectChapters(pdf);
        const ext = extractFacts(pdf, chs);
        const newCompany = ext.meta.companyName;
        if (companySoFar && newCompany && companySoFar !== newCompany) {
          const ok = window.confirm(
            `文件「${file.name}」识别为「${newCompany}」，与已载入的「${companySoFar}」不一致。\n多年报对比应使用同一家公司，确定仍要加入吗？`,
          );
          if (!ok) continue;
        }
        if (newCompany) companySoFar = newCompany;
        const entry: DocEntry = { id: crypto.randomUUID(), file, pdf, chapters: chs, extraction: ext };
        setDocs((prev) => {
          const fy = ext.meta.fiscalYear;
          // 同一财年重复上传：以新文件替换；随后按财年排序归位
          return [...prev.filter((d) => d.extraction.meta.fiscalYear !== fy), entry]
            .sort((a, b) => (a.extraction.meta.fiscalYear ?? 0) - (b.extraction.meta.fiscalYear ?? 0));
        });
        added += 1;
      } catch (err) {
        alert(`「${file.name}」解析失败：${err instanceof Error ? err.message : String(err)}`);
      }
    }
    setParsing(null);
    if (added > 0) {
      // 落定到最新财年的文档；≥2 份时进入多年总览
      setDocs((cur) => {
        const latest = [...cur].sort(
          (a, b) => (b.extraction.meta.fiscalYear ?? 0) - (a.extraction.meta.fiscalYear ?? 0),
        )[0];
        if (latest) setActiveDocId(latest.id);
        setRealTab(cur.length > 1 ? 'multi' : 'index');
        return cur;
      });
      setRealPage(1);
      setHighlights([]);
      setRiskPackOverride(null);
      if (!welcomeGone) {
        // 转场期间暂不渲染 PDF 画布（避免主线程阻塞动画），落定后再开
        enterWithTransition();
        window.setTimeout(() => setPdfPanelOpen(true), 2100);
      } else {
        setPdfPanelOpen(true);
      }
    }
  }

  async function restoreAnalysis(id: string) {
    setHistoryOpen(false);
    setRestoring(true);
    setParsing({ done: 0, total: 0 });
    try {
      const rec = await loadAnalysis(id);
      if (!rec) return;
      const entries: DocEntry[] = [];
      for (const f of rec.files) {
        const file = new File([f.data], f.name, { type: 'application/pdf' });
        const pdf = await loadPdf(file, (done, total) => setParsing({ done, total }));
        const chs = detectChapters(pdf);
        const ext = extractFacts(pdf, chs);
        entries.push({ id: crypto.randomUUID(), file, pdf, chapters: chs, extraction: ext });
      }
      if (entries.length === 0) return;
      entries.sort((a, b) => (a.extraction.meta.fiscalYear ?? 0) - (b.extraction.meta.fiscalYear ?? 0));
      setDocs(entries);
      const latest = [...entries].sort(
        (a, b) => (b.extraction.meta.fiscalYear ?? 0) - (a.extraction.meta.fiscalYear ?? 0),
      )[0];
      setActiveDocId(latest.id);
      setAiMap(rec.narratives ?? {});
      setAiFailed(0);
      setRiskPackOverride(null);
      setRealTab(entries.length > 1 ? 'multi' : 'risks');
      setRealPage(1);
      setHighlights([]);
      if (!welcomeGone) {
        enterWithTransition();
        window.setTimeout(() => setPdfPanelOpen(true), 2100);
      } else {
        setPdfPanelOpen(true);
      }
    } catch (err) {
      alert(`恢复失败：${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setRestoring(false);
      setParsing(null);
    }
  }

  /** 真实模式：事实/证据点击 → 切到所属文档并按坐标跳转高亮 */
  function jumpToRealFact(sel: AnchorSelection) {
    const fact =
      merged.facts.find((f) => f.id === sel.id) ?? extraction?.facts.find((f) => f.id === sel.id);
    const ownerId = fact ? merged.ownerById.get(fact.id) : undefined;
    if (ownerId && ownerId !== activeDocId) setActiveDocId(ownerId);
    setRealPage(fact?.anchor.page ?? sel.page);
    setHighlights((fact as RealFact | undefined)?.rects ?? []);
    setPdfPanelOpen(true);
  }

  // ---- 演示模式状态 ----
  const report = demoReport;
  const year = Math.max(...report.fiscalYears);
  const activePack = useMemo(
    () => knowledgePacks.find((p) => p.industry === report.industry) ?? knowledgePacks[0],
    [report.industry],
  );
  const riskCards = useMemo(() => computeRiskCards(report.facts, activePack, year), [report.facts, activePack, year]);
  const [demoTab, setDemoTab] = useState<DemoTab>('overview');
  const [selection, setSelection] = useState<AnchorSelection | null>(null);

  const demoTabs: { key: DemoTab; label: string; count?: number }[] = [
    { key: 'overview', label: '概览' },
    { key: 'facts', label: '财务事实库', count: report.facts.length },
    { key: 'risks', label: '风险研究卡片', count: riskCards.length },
    { key: 'pack', label: '行业知识包' },
  ];
  const compareYears = new Set(merged.facts.map((f) => f.year)).size;
  const realTabs: { key: RealTab; label: string; count?: number }[] = [
    ...(docs.length > 1 && multiAnalysis
      ? [{ key: 'multi' as RealTab, label: '多年总览', count: multiAnalysis.cards.length }]
      : []),
    { key: 'index', label: '文档索引' },
    { key: 'facts', label: '财务事实库', count: extraction?.facts.length },
    ...(docs.length > 1
      ? [{ key: 'compare' as RealTab, label: '多年对比', count: compareYears }]
      : []),
    { key: 'risks', label: '风险研究卡片', count: realRiskCards.length },
    { key: 'search', label: '全文检索' },
    { key: 'pack', label: '行业知识包' },
  ];

  const fiscalYearsLabel = docs
    .map((d) => d.extraction.meta.fiscalYear)
    .filter((y): y is number => Boolean(y))
    .sort((a, b) => b - a)
    .join('、');

  /** AI 对话的证据边界：把当前卷宗的确定性结果压缩成一份摘要注入系统提示 */
  const chatDigest = useMemo(() => {
    const lines: string[] = [];
    if (realPdf && merged.facts.length > 0) {
      const name = latestDoc?.extraction.meta.companyName ?? realPdf.fileName;
      lines.push(`公司：${name}`);
      lines.push(`行业：${latestDoc?.extraction.meta.industry?.raw ?? riskPack.industry}`);
      lines.push(`卷宗：${docs.length} 份年报（${fiscalYearsLabel}），程序提取 ${merged.facts.length} 条确定性事实，全部可回溯原文页码`);
      const keyLabels = ['营业收入', '归母净利润', '经营活动现金流净额', '应收账款', '营业成本', '毛利率', '资产负债率'];
      const years = [...new Set(merged.facts.map((f) => f.year))].sort((a, b) => a - b);
      for (const y of years) {
        const parts = keyLabels
          .map((l) => {
            const f = merged.facts.find((x) => x.label === l && x.year === y);
            return f ? `${l}=${f.value !== 0 ? `${f.value}${f.unit === '%' ? '%' : '亿'}` : f.unit}(P${f.anchor.page})` : null;
          })
          .filter(Boolean);
        if (parts.length > 0) lines.push(`${y} 年：${parts.join('，')}`);
      }
      if (multiAnalysis) {
        if (multiAnalysis.events.length > 0) {
          lines.push('治理事件轴：');
          for (const e of multiAnalysis.events) lines.push(`- ${e.year} 年｜${e.text}`);
        }
        if (multiAnalysis.diffs.length > 0) {
          lines.push('跨报告数值分歧（历史被重述的直接证据）：');
          for (const d of multiAnalysis.diffs.slice(0, 8)) {
            lines.push(`- ${d.label}@${d.year}：${d.versions.map((v) => `${v.fy}年报=${v.value}`).join(' → ')}`);
          }
        }
        lines.push(`跨期组合判定：${multiAnalysis.comboTriggered
          ? '「推测：盈余管理风险极高」已触发（应收裂口 + 毛利率异常稳定 + 信任基础受损，三条证据链互为印证）'
          : '组合卡未触发'}`);
        if (multiAnalysis.bathYear) {
          lines.push(`洗大澡信号：${multiAnalysis.bathYear.year} 年巨亏 ${multiAnalysis.bathYear.loss} 亿，占上年末净资产 ${multiAnalysis.bathYear.pctOfNetAssets}%`);
        }
      }
      if (realRiskCards.length > 0) {
        lines.push('命中的风险规则（含程序核实的信号描述）：');
        for (const c of realRiskCards.slice(0, 10)) lines.push(`- [${c.severity}] ${c.title}：${c.signal}`);
      }
    } else if (demoMode) {
      const r = report;
      lines.push(`公司：${r.companyName}（演示数据，虚构公司）`);
      lines.push(`行业：${r.industry} · ${r.reportTitle}`);
      const years = [...new Set(r.facts.map((f) => f.year))].sort((a, b) => a - b);
      for (const y of years) {
        const parts = r.facts.filter((f) => f.year === y).map((f) => `${f.label}=${f.value}${f.unit}`);
        if (parts.length > 0) lines.push(`${y} 年：${parts.join('，')}`);
      }
      if (riskCards.length > 0) {
        lines.push('命中的风险规则：');
        for (const c of riskCards) lines.push(`- [${c.severity}] ${c.title}：${c.signal}`);
      }
    }
    return lines.join('\n').slice(0, 6000);
  }, [realPdf, merged, latestDoc, docs, fiscalYearsLabel, riskPack, multiAnalysis, realRiskCards, demoMode, report, riskCards]);

  return (
    <div
      className={cn(
        'flex h-screen flex-col bg-paper text-ink',
        deskFx === 'from-near' && 'desk-from-near',
        deskFx === 'to-near' && 'desk-to-near',
      )}
    >
      {/* 顶栏 */}
      <header className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-4 gap-y-2 border-b border-paper-dark bg-paper-light px-5 py-2.5 xl:grid-cols-[auto_auto_minmax(12rem,1fr)_auto] xl:gap-y-0">
        <div className="flex shrink-0 items-center gap-2.5">
          <JianweiLogo className="h-10 w-10 shrink-0" />
          <div>
            <div className="font-song text-xl font-bold leading-tight tracking-[0.15em] text-ink">见微</div>
            <div className="hidden whitespace-nowrap font-song text-[10px] leading-tight tracking-[0.18em] text-stone-500 sm:block">
              溯于原文 · 察于细微 · 成于研判
            </div>
          </div>
        </div>
        <div className="hidden h-6 w-px bg-paper-dark xl:block" />

        {realPdf ? (
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold">
              {latestDoc?.extraction.meta.companyName
                ? `${latestDoc.extraction.meta.companyName} · ${docs.length > 1 ? `${fiscalYearsLabel} 年报对比` : (latestDoc.extraction.meta.reportTitle ?? realPdf.fileName)}`
                : realPdf.fileName}
            </div>
            <div className="truncate whitespace-nowrap text-[11px] text-stone-500">
              {docs.length > 1 ? `${docs.length} 份年报 · ` : ''}{realPdf.numPages} 页 · 提取 {merged.facts.length} 条事实 · 命中 {realRiskCards.length} 条风险规则
              {latestDoc?.extraction.meta.industry?.raw
                ? ` · 行业：${latestDoc.extraction.meta.industry.raw}`
                : ''}
            </div>
          </div>
        ) : demoMode ? (
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold">
              {report.companyName} · {report.reportTitle}
            </div>
            <div className="flex min-w-0 items-center gap-1 text-[11px] text-stone-500">
              <FlaskConical className="h-3 w-3 shrink-0" />
              <span className="truncate whitespace-nowrap">
                演示数据（虚构公司）· {report.totalPages} 页 · 行业：{report.industry}
              </span>
            </div>
          </div>
        ) : (
          <div className="min-w-0 flex-1" />
        )}

        <div className="col-span-2 flex min-w-0 items-center gap-2 overflow-x-auto xl:col-span-1 xl:justify-end xl:overflow-visible">
          {(realPdf || demoMode) && (
            <button
              onClick={() => setChatOpen((v) => !v)}
              className={cn(
                'flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md border px-3 py-1.5 text-sm font-medium transition-colors',
                chatOpen
                  ? 'border-violet-300 bg-violet-100 text-violet-800'
                  : 'border-violet-200 bg-violet-50 text-violet-700 hover:bg-violet-100',
              )}
              title="打开 / 收起 AI 研判对话"
            >
              {aiPending > 0 ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              AI 研判{aiPending > 0 ? `中 ${aiPending}` : ''}
            </button>
          )}
          {(realPdf || traceMode) && (
            <button
              onClick={leaveToHome}
              className="flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md border border-stone-300 px-3 py-1.5 text-sm font-medium text-stone-700 transition-colors hover:bg-stone-100"
            >
              <ArrowLeftRight className="h-4 w-4" /> 返回首页
            </button>
          )}
          {!realPdf && demoMode && (
            <button
              onClick={leaveToHome}
              className="flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md border border-stone-300 px-3 py-1.5 text-sm font-medium text-stone-700 transition-colors hover:bg-stone-100"
            >
              <ArrowLeftRight className="h-4 w-4" /> 退出演示
            </button>
          )}
          <button
            onClick={() => setHistoryOpen((v) => !v)}
            className="flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md border border-stone-300 px-3 py-1.5 text-sm font-medium text-stone-700 transition-colors hover:bg-stone-100"
          >
            {restoring ? <Loader2 className="h-4 w-4 animate-spin" /> : <History className="h-4 w-4" />}
            历史分析
          </button>
          {(realPdf || demoMode) && (
            <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700">
              {realPdf ? '确定性提取 · 零模型读数' : '索引完整 · 全程可溯源'}
            </Badge>
          )}
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={parsing !== null}
            className="flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md bg-ink px-3 py-1.5 text-sm font-medium text-paper-light transition-colors hover:bg-ink-light disabled:opacity-50"
          >
            {parsing ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                解析中 {parsing.total > 0 ? `${parsing.done}/${parsing.total}` : '…'}
              </>
            ) : (
              <>
                <Upload className="h-4 w-4" /> {docs.length > 0 ? '追加年报 PDF' : '上传财报 PDF'}
              </>
            )}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf"
            multiple
            className="hidden"
            onChange={(e) => {
              const fs = e.target.files ? [...e.target.files] : [];
              if (fs.length > 0) handleFiles(fs);
              e.target.value = '';
            }}
          />
        </div>
      </header>

      {/* 历史分析面板 */}
      {historyOpen && (
        <div className="fixed right-4 top-[103px] z-50 w-96 max-w-[calc(100vw-2rem)] overflow-hidden rounded-lg border border-stone-200 bg-paper-light shadow-xl xl:top-[61px]">
          <div className="flex items-center justify-between border-b border-stone-100 px-4 py-2.5">
            <div className="text-sm font-semibold text-stone-800">历史分析（保存在本机）</div>
            <button onClick={() => setHistoryOpen(false)} className="rounded p-1 text-stone-400 hover:bg-stone-100 hover:text-stone-600">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="max-h-80 overflow-y-auto">
            {history.length === 0 && (
              <div className="px-4 py-8 text-center text-sm text-stone-500">
                暂无历史分析。上传年报后会自动保存，可随时恢复。
              </div>
            )}
            {history.map((h) => (
              <div key={h.id} className="flex items-center gap-3 border-b border-stone-100 px-4 py-3 last:border-0">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-stone-800">{h.companyName}</div>
                  <div className="mt-0.5 flex items-center gap-2 text-[11px] text-stone-500">
                    <span>{h.fiscalYears.join('、')} 年报</span>
                    {h.narrativeCount > 0 && (
                      <span className="flex items-center gap-0.5 text-violet-600">
                        <Sparkles className="h-3 w-3" /> {h.narrativeCount} 条 AI 研判
                      </span>
                    )}
                    <span>{new Date(h.savedAt).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                </div>
                <button
                  onClick={() => restoreAnalysis(h.id)}
                  className="rounded-md bg-ink px-2.5 py-1 text-xs font-medium text-paper-light hover:bg-ink-light"
                >
                  恢复
                </button>
                <button
                  onClick={async () => {
                    await deleteAnalysis(h.id);
                    setHistory(await listAnalyses().catch(() => []));
                  }}
                  className="rounded-md border border-stone-200 p-1.5 text-stone-400 hover:border-red-200 hover:text-red-600"
                  title="删除该分析"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex min-h-0 min-w-0 flex-1">
        {realPdf && extraction ? (
          <Group orientation="horizontal" className="min-w-0 flex-1">
            {sidebarCollapsed ? (
              <Panel defaultSize="3%" minSize="3%" maxSize="3%">
                {/* 收起态：细长 Rail，点击恢复覆盖证明与章节索引 */}
                <button
                  onClick={() => setSidebarCollapsed(false)}
                  className="flex h-full w-full flex-col items-center gap-3 border-r border-stone-200 bg-paper-light py-3 text-stone-400 transition-colors hover:bg-stone-50 hover:text-cinnabar-700"
                  title="展开「阅读覆盖证明」与章节索引"
                >
                  <PanelLeftOpen className="h-4 w-4 shrink-0" />
                  <span className="text-[10px] tracking-widest [writing-mode:vertical-rl]">
                    覆盖证明 · 章节索引
                  </span>
                </button>
              </Panel>
            ) : (
              <Panel defaultSize="18%" minSize="12%" maxSize="32%">
                <RealChaptersSidebar
                  pdf={realPdf}
                  chapters={chapters}
                  activePage={realPage}
                  onSelectPage={(p) => { setRealPage(p); setHighlights([]); setPdfPanelOpen(true); }}
                  onCollapse={() => setSidebarCollapsed(true)}
                />
              </Panel>
            )}
            <ResizeHandle />
            <Panel defaultSize={pdfPanelOpen ? "52%" : "82%"} minSize="30%">
              <main className="flex h-full min-w-0 flex-1 flex-col">
              <Tabs value={realTab} onValueChange={(v) => setRealTab(v as RealTab)} className="flex min-h-0 flex-1 flex-col">
                <div className="overflow-x-auto border-b border-stone-200 bg-paper-light px-5">
                  <TabsList className="h-11 gap-1 bg-transparent p-0">
                    {realTabs.map((t) => (
                      <TabsTrigger
                        key={t.key}
                        value={t.key}
                        className={cn(
                          'relative h-11 rounded-none border-b-2 border-transparent bg-transparent px-3 text-sm shadow-none',
                          'data-[state=active]:border-cinnabar-600 data-[state=active]:bg-transparent data-[state=active]:font-semibold data-[state=active]:shadow-none',
                        )}
                      >
                        {t.label}
                        {t.count !== undefined && (
                          <span className="ml-1.5 rounded-full bg-stone-100 px-1.5 py-0.5 text-[10px] font-medium text-stone-600">
                            {t.count}
                          </span>
                        )}
                      </TabsTrigger>
                    ))}
                  </TabsList>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto p-5">
                  {realTab === 'multi' && multiAnalysis && (
                    <MultiYearSection
                      docs={docs}
                      merged={merged}
                      analysis={multiAnalysis}
                      pack={riskPack}
                      onSelectFact={(f) => jumpToRealFact({ id: f.id, page: f.anchor.page, quote: f.anchor.quote, chapter: f.anchor.chapter })}
                      onSwitchDoc={(id) => { setActiveDocId(id); setRealTab('index'); }}
                      aiSummary={aiSummary}
                      aiSummaryPending={aiSummaryPending}
                    />
                  )}
                  {realTab === 'index' && (
                    <DocIndexSection
                      pdf={realPdf}
                      chapters={chapters}
                      onJump={(p) => { setRealPage(p); setHighlights([]); setPdfPanelOpen(true); }}
                    />
                  )}
                  {realTab === 'facts' && <RealFactsSection extraction={extraction} onSelect={jumpToRealFact} />}
                  {realTab === 'compare' && docs.length > 1 && (
                    <CompareSection
                      docs={docs}
                      merged={merged}
                      onSelect={(f) => jumpToRealFact({ id: f.id, page: f.anchor.page, quote: f.anchor.quote, chapter: f.anchor.chapter })}
                    />
                  )}
                  {realTab === 'risks' && (
                    <div className="space-y-4">
                      <div className="flex flex-wrap items-center gap-2 text-sm text-stone-600">
                        <span>风险规则来自知识包：</span>
                        {knowledgePacks.map((p) => (
                          <button
                            key={p.id}
                            onClick={() => setRiskPackOverride(p.id)}
                            className={cn(
                              'flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                              riskPackId === p.id
                                ? 'border-stone-800 bg-stone-800 text-white'
                                : 'border-stone-200 bg-paper-light text-stone-600 hover:border-stone-400',
                            )}
                          >
                            {p.industry}
                            {p.id === detectedPackId && (
                              <span
                                className={cn(
                                  'rounded-full px-1.5 py-px text-[10px]',
                                  riskPackId === p.id ? 'bg-cinnabar-500 text-white' : 'bg-cinnabar-100 text-cinnabar-800',
                                )}
                              >
                                自动识别
                              </span>
                            )}
                          </button>
                        ))}
                        {riskPackOverride && riskPackOverride !== detectedPackId && (
                          <button
                            onClick={() => setRiskPackOverride(null)}
                            className="text-xs text-cinnabar-700 underline underline-offset-2 hover:text-cinnabar-800"
                          >
                            恢复自动识别
                          </button>
                        )}
                      </div>
                      {latestDoc?.extraction.meta.industry && (
                        <button
                          onClick={() => {
                            const det = latestDoc.extraction.meta.industry!;
                            const ownerId = latestDoc.id;
                            if (ownerId !== activeDocId) setActiveDocId(ownerId);
                            setRealPage(det.page);
                            setHighlights([]);
                            setPdfPanelOpen(true);
                          }}
                          className="block max-w-full truncate text-left text-xs text-stone-500 hover:text-cinnabar-700"
                          title="点击跳转到识别依据原文"
                        >
                          {latestDoc.extraction.meta.industry.method === 'explicit'
                            ? `识别依据：年报明示「${latestDoc.extraction.meta.industry.raw}」（P${latestDoc.extraction.meta.industry.page}）· ${latestDoc.extraction.meta.industry.quote}`
                            : '识别依据：全文特异性关键词打分（未找到明示行业句式）'}
                        </button>
                      )}
                      {realRiskCards.length === 0 ? (
                        <div className="rounded-lg border border-stone-200 bg-paper-light px-4 py-10 text-center text-sm text-stone-500">
                          该知识包的确定性规则在这份财报的已提取事实上未命中风险信号。
                          <br />
                          这可能意味着指标缺失（见财务事实库的诊断面板），或确实没有异常关系。
                        </div>
                      ) : (
                        <RiskCardsSection
                          cards={realRiskCards}
                          facts={merged.facts}
                          onSelectAnchor={jumpToRealFact}
                          narratives={aiMap}
                          aiPending={aiPending}
                          aiFailed={aiFailed}
                        />
                      )}
                    </div>
                  )}
                  {realTab === 'search' && (
                    <SearchSection
                      pdf={realPdf}
                      onJump={(page, rects) => { setRealPage(page); setHighlights(rects); setPdfPanelOpen(true); }}
                    />
                  )}
                  {realTab === 'pack' && (
                    <KnowledgePackSection key={riskPackId} packs={knowledgePacks} activeIndustry={riskPack.industry} />
                  )}
                </div>
              </Tabs>
            </main>
            </Panel>
            {pdfPanelOpen && (
              <>
                <ResizeHandle />
                <Panel defaultSize="30%" minSize="18%" maxSize="50%">
                  <RealPdfPanel
                    pdf={realPdf}
                    page={realPage}
                    highlights={highlights}
                    onPageChange={(p) => { setRealPage(p); setHighlights([]); }}
                    onClose={() => setPdfPanelOpen(false)}
                  />
                </Panel>
              </>
            )}
          </Group>
        ) : traceMode ? (
          /* 调研溯源模式：左侧调研报告，点击引证，右侧弹出网络原文标红（PDF 模式优先于本模式） */
          <TraceDesk />
        ) : demoMode ? (
          <Group orientation="horizontal" className="min-w-0 flex-1">
            {sidebarCollapsed ? (
              <Panel defaultSize="3%" minSize="3%" maxSize="3%">
                <button
                  onClick={() => setSidebarCollapsed(false)}
                  className="flex h-full w-full flex-col items-center gap-3 border-r border-stone-200 bg-paper-light py-3 text-stone-400 transition-colors hover:bg-stone-50 hover:text-cinnabar-700"
                  title="展开「阅读覆盖证明」与章节索引"
                >
                  <PanelLeftOpen className="h-4 w-4 shrink-0" />
                  <span className="text-[10px] tracking-widest [writing-mode:vertical-rl]">
                    覆盖证明 · 章节索引
                  </span>
                </button>
              </Panel>
            ) : (
              <Panel defaultSize="18%" minSize="12%" maxSize="32%">
                <CoverageSidebar
                  chapters={report.chapters}
                  totalPages={report.totalPages}
                  activePage={selection?.page}
                  onSelectPage={(page, chapter) => setSelection({ page, chapter, quote: '' })}
                  onCollapse={() => setSidebarCollapsed(true)}
                />
              </Panel>
            )}
            <ResizeHandle />
            <Panel defaultSize={selection ? "55%" : "82%"} minSize="30%">
              <main className="flex h-full min-w-0 flex-1 flex-col">
              <Tabs value={demoTab} onValueChange={(v) => setDemoTab(v as DemoTab)} className="flex min-h-0 flex-1 flex-col">
                <div className="overflow-x-auto border-b border-stone-200 bg-paper-light px-5">
                  <TabsList className="h-11 gap-1 bg-transparent p-0">
                    {demoTabs.map((t) => (
                      <TabsTrigger
                        key={t.key}
                        value={t.key}
                        className={cn(
                          'relative h-11 rounded-none border-b-2 border-transparent bg-transparent px-3 text-sm shadow-none',
                          'data-[state=active]:border-cinnabar-600 data-[state=active]:bg-transparent data-[state=active]:font-semibold data-[state=active]:shadow-none',
                        )}
                      >
                        {t.label}
                        {t.count !== undefined && (
                          <span className="ml-1.5 rounded-full bg-stone-100 px-1.5 py-0.5 text-[10px] font-medium text-stone-600">
                            {t.count}
                          </span>
                        )}
                      </TabsTrigger>
                    ))}
                  </TabsList>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto p-5">
                  {demoTab === 'overview' && <OverviewSection report={report} onOpenFacts={() => setDemoTab('facts')} />}
                  {demoTab === 'facts' && <FactsSection facts={report.facts} onSelectAnchor={setSelection} />}
                  {demoTab === 'risks' && <RiskCardsSection cards={riskCards} facts={report.facts} onSelectAnchor={setSelection} />}
                  {demoTab === 'pack' && <KnowledgePackSection packs={knowledgePacks} activeIndustry={report.industry} />}
                </div>
              </Tabs>
              </main>
            </Panel>
            {selection && (
              <>
                <ResizeHandle />
                <Panel defaultSize="27%" minSize="18%" maxSize="45%">
                  <PdfPanel
                    selection={selection}
                    facts={report.facts}
                    onClose={() => setSelection(null)}
                    onJump={setSelection}
                  />
                </Panel>
              </>
            )}
          </Group>
        ) : (
          /* 欢迎页以全屏覆盖层呈现，此处仅垫底 */
          <div className="flex-1 bg-paper" />
        )}
      </div>

      {/* 最左侧 AI 对话抽屉：围绕当前卷宗的证据约束问答 */}
      <AiChatPanel
        open={chatOpen && Boolean(realPdf || demoMode)}
        onClose={() => setChatOpen(false)}
        digest={chatDigest}
        companyName={realPdf ? (latestDoc?.extraction.meta.companyName ?? realPdf.fileName) : report.companyName}
        topClassName="top-[103px] xl:top-[61px]"
      />

      {/* 云海欢迎页覆盖层：初始在场；离场时场景内相机穿门，覆盖层只作光涌淡出 */}
      {((!welcomeGone && !realPdf && !demoMode) || leaving) && (
        <div
          className={cn(
            'fixed inset-0 z-50',
            leaving
              ? 'pointer-events-none opacity-100'
              : 'welcome-fade-in opacity-100',
          )}
        >
          <WelcomeSection
            departing={leaving}
            parsing={parsing}
            restoring={restoring}
            history={history}
            onPick={() => fileInputRef.current?.click()}
            onDropFiles={(fs) => handleFiles(fs)}
            onDemo={() => { setDemoMode(true); enterWithTransition(); }}
            onTrace={() => { setTraceMode(true); enterWithTransition(); }}
            onRestore={restoreAnalysis}
            onDelete={async (id) => {
              await deleteAnalysis(id);
              setHistory(await listAnalyses().catch(() => []));
            }}
          />
        </div>
      )}
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<ResearchDesk />} />
    </Routes>
  );
}
