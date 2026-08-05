import { useMemo, useState } from 'react';
import {
  Area, CartesianGrid, ComposedChart, Line, LineChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import {
  AlertTriangle, ChevronDown, FileCheck2, FileDiff, FileWarning, Flame, Gavel,
  Loader2, Sparkles, Wallet,
} from 'lucide-react';
import type { KnowledgePack, RiskCard, Severity } from '@/types/research';
import type { RealFact } from '@/lib/extract';
import type { DocEntry, MergedFacts } from '@/lib/merge';
import type { MultiYearAnalysis, YearEvent } from '@/lib/timeseries';
import { computeRiskCards, factOf, yoy } from '@/lib/signals';
import type { AiNarrative } from '@/lib/ai';
import { cn } from '@/lib/utils';

interface Props {
  docs: DocEntry[];
  merged: MergedFacts;
  analysis: MultiYearAnalysis;
  pack: KnowledgePack;
  onSelectFact: (f: RealFact) => void;
  onSwitchDoc: (docId: string) => void;
  aiSummary?: AiNarrative;
  aiSummaryPending: boolean;
}

const SEV_STYLE: Record<Severity, { bar: string; text: string; label: string }> = {
  high: { bar: 'bg-cinnabar-600', text: 'text-cinnabar-700', label: '高' },
  medium: { bar: 'bg-amber-500', text: 'text-amber-700', label: '中' },
  low: { bar: 'bg-stone-300', text: 'text-stone-500', label: '低' },
};
const SEV_RANK: Record<Severity, number> = { high: 3, medium: 2, low: 1 };

const EVENT_ICON: Record<YearEvent['kind'], typeof Flame> = {
  audit: FileCheck2,
  restatement: FileWarning,
  regulatory: Gavel,
  occupation: Wallet,
  bath: Flame,
  restateDiff: FileDiff,
};

/** 热力矩阵行（确定性指标全集，按主题分组） */
const HEAT_ROWS = [
  '营业收入', '归母净利润', '扣非净利润', '经营活动现金流净额',
  '应收账款', '存货', '商誉', '毛利率', '资产负债率', '前五大客户收入占比',
];

const fmtV = (v: number, unit: string) => (unit === '%' ? `${v}%` : `${v}`);

/** 同比异常度着色：|yoy| 分档，方向用箭头表达，缺失置灰 */
function heatClass(g: number | undefined): string {
  if (g === undefined) return 'bg-stone-50 text-stone-400';
  const a = Math.abs(g);
  if (a >= 50) return 'bg-cinnabar-100 text-cinnabar-900 hover:bg-cinnabar-200';
  if (a >= 25) return 'bg-amber-100 text-amber-900 hover:bg-amber-200';
  if (a >= 10) return 'bg-amber-50 text-amber-800 hover:bg-amber-100';
  return 'bg-paper-light text-stone-700 hover:bg-stone-100';
}

export default function MultiYearSection({
  docs, merged, analysis, pack, onSelectFact, onSwitchDoc, aiSummary, aiSummaryPending,
}: Props) {
  const [heatOpen, setHeatOpen] = useState(false);
  const { docYears, divergence, arRatio, gmSeries, events, cards, comboTriggered } = analysis;

  /** 每年单年卡片（确定性，供时间轴色块与计数） */
  const cardsByYear = useMemo(
    () => Object.fromEntries(docYears.map((y) => [y, computeRiskCards(merged.facts, pack, y)])),
    [docYears, merged, pack],
  );

  const docByYear = useMemo(() => {
    const m = new Map<number, DocEntry>();
    for (const d of docs) {
      const fy = d.extraction.meta.fiscalYear;
      if (fy !== undefined) m.set(fy, d);
    }
    return m;
  }, [docs]);

  const combo = cards.find((c) => c.id === 'rc-x-combo');
  const otherCards = cards.filter((c) => c.id !== 'rc-x-combo');

  /** 综合研判的确定性回退文案 */
  const fallbackSummary = useMemo(() => {
    const lines: string[] = [];
    lines.push(
      `本视图合并 ${docs.length} 份年报（${docYears.join('、')}）的确定性事实，共 ${merged.facts.length} 条可溯源数据。`,
    );
    if (analysis.profitRealization !== undefined) {
      lines.push(
        `区间累计归母净利润 ${analysis.cumProfit} 亿元，累计经营现金流 ${analysis.cumOcf} 亿元，利润变现率 ${analysis.profitRealization}%。`,
      );
    }
    if (comboTriggered) {
      lines.push('应收裂口、利润现金背离、毛利率异常稳定三条跨期信号同时成立，程序打出组合推测「盈余管理风险极高」。');
    } else if (cards.length > 0) {
      lines.push(`触发 ${cards.length} 条跨期信号，详见下方卡片。`);
    } else {
      lines.push('已覆盖年度内未触发跨期风险信号。');
    }
    return lines;
  }, [docs.length, docYears, merged.facts.length, analysis, cards.length, comboTriggered]);

  const jump = (factId?: string) => {
    if (!factId) return;
    const f = merged.facts.find((x) => x.id === factId);
    if (f) onSelectFact(f);
  };

  return (
    <div className="space-y-6">
      {/* ===== AI 综合研判（叙事弧） ===== */}
      <section className="rounded-xl border border-violet-200 bg-gradient-to-br from-violet-50/80 to-paper-light p-5">
        <div className="mb-3 flex items-center gap-2">
          <Sparkles size={15} className="text-violet-600" />
          <h3 className="font-song text-base font-semibold tracking-[0.12em] text-stone-800">多年综合研判</h3>
          {aiSummaryPending && (
            <span className="flex items-center gap-1 text-[11px] text-violet-500">
              <Loader2 size={11} className="animate-spin" /> AI 组织叙事弧…
            </span>
          )}
          {aiSummary && <span className="text-[10px] text-violet-400">AI 生成 · 证据约束 · {aiSummary.model}</span>}
          {!aiSummary && !aiSummaryPending && <span className="text-[10px] text-stone-400">确定性摘要（AI 不可用时的回退）</span>}
        </div>
        <div className="space-y-2.5">
          {(aiSummary ? aiSummary.explanation : fallbackSummary).map((p, i) => (
            <p key={i} className="text-[13px] leading-6 text-stone-700">{p}</p>
          ))}
        </div>
      </section>

      {/* ===== 组合结论卡（推测：盈余管理风险极高） ===== */}
      {combo && (
        <section className="rounded-xl border-2 border-cinnabar-400 bg-gradient-to-br from-cinnabar-50 to-paper-light p-5 shadow-[0_18px_44px_-22px_rgba(158,58,38,0.45)]">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-cinnabar-600 text-paper-50">
              <AlertTriangle size={18} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-song text-lg font-bold tracking-wide text-cinnabar-800">{combo.title}</h3>
                <span className="rounded-full bg-cinnabar-600 px-2 py-0.5 text-[10px] font-semibold tracking-wider text-paper-50">
                  三信号联合 · 非定性结论
                </span>
              </div>
              <p className="mt-2 text-[13px] leading-6 text-stone-700">{combo.signal}</p>
              <p className="mt-2 text-xs leading-5 text-stone-500">{combo.boundary}</p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {[...new Set(combo.evidenceFactIds)].slice(0, 10).map((id) => {
                  const f = merged.facts.find((x) => x.id === id);
                  if (!f) return null;
                  return (
                    <button
                      key={id}
                      onClick={() => jump(id)}
                      className="rounded-full border border-cinnabar-200 bg-paper-light px-2.5 py-1 text-[11px] text-stone-600 transition-colors hover:border-cinnabar-500 hover:text-cinnabar-800"
                      title={`P${f.anchor.page} · ${f.anchor.quote.slice(0, 60)}`}
                    >
                      {f.label} {f.year} = {fmtV(f.value, f.unit)} · P{f.anchor.page}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ===== 时间轴主视图 ===== */}
      <section className="rounded-xl border border-stone-200 bg-paper-light p-5">
        <h3 className="mb-4 font-song text-base font-semibold tracking-[0.12em] text-stone-800">
          时间轴 · {docYears[0]} — {docYears[docYears.length - 1]}
        </h3>
        <div className="relative grid gap-3" style={{ gridTemplateColumns: `repeat(${docYears.length}, minmax(0,1fr))` }}>
          {/* 轴线 */}
          <div className="absolute left-0 right-0 top-[52px] h-px bg-stone-300" />
          {docYears.map((y) => {
            const yCards: RiskCard[] = cardsByYear[y] ?? [];
            const maxSev = yCards.reduce<Severity | null>(
              (acc, c) => (acc === null || SEV_RANK[c.severity] > SEV_RANK[acc] ? c.severity : acc),
              null,
            );
            const yEvents = events.filter((e) => e.year === y);
            const rev = factOf(merged.facts, '营业收入', y);
            const np = factOf(merged.facts, '归母净利润', y);
            const ocf = factOf(merged.facts, '经营活动现金流净额', y);
            const revG = yoy(merged.facts, '营业收入', y);
            const npG = yoy(merged.facts, '归母净利润', y);
            const doc = docByYear.get(y);
            return (
              <div key={y} className="relative flex flex-col items-stretch">
          {/* 年份列：外层为可点击容器（嵌套按钮会破坏 DOM 结构） */}
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => doc && onSwitchDoc(doc.id)}
                  onKeyDown={(e) => { if (doc && (e.key === 'Enter' || e.key === ' ')) onSwitchDoc(doc.id); }}
                  className={cn(
                    'group relative z-10 cursor-pointer rounded-lg border bg-paper-light px-2 pb-2 pt-2.5 text-center transition-all',
                    doc ? 'hover:-translate-y-0.5 hover:border-cinnabar-400 hover:shadow-md' : 'cursor-default opacity-70',
                    maxSev === 'high' ? 'border-cinnabar-300' : maxSev === 'medium' ? 'border-amber-300' : 'border-stone-200',
                  )}
                >
                  <div className="font-song text-lg font-bold text-stone-800">{y}</div>
                  {/* 风险等级色块 */}
                  <div className={cn('mx-auto mt-1.5 h-1.5 w-10 rounded-full', maxSev ? SEV_STYLE[maxSev].bar : 'bg-emerald-300')} />
                  <div className="mt-1 text-[10px] text-stone-400">
                    {yCards.length > 0 ? `${yCards.length} 条信号` : '未见信号'}
                  </div>
                  <div className="mt-2 space-y-1 text-left text-[11px] leading-4">
                    <div className="flex justify-between gap-1">
                      <span className="text-stone-400">收入</span>
                      <button className="font-semibold tabular-nums text-stone-700 hover:text-cinnabar-700" onClick={(e) => { e.stopPropagation(); jump(rev?.id); }}>
                        {rev ? rev.value : '—'}
                      </button>
                    </div>
                    <div className="flex justify-between gap-1">
                      <span className="text-stone-400">净利</span>
                      <button className={cn('font-semibold tabular-nums hover:text-cinnabar-700', np && np.value < 0 ? 'text-cinnabar-700' : 'text-stone-700')} onClick={(e) => { e.stopPropagation(); jump(np?.id); }}>
                        {np ? np.value : '—'}
                      </button>
                    </div>
                    <div className="flex justify-between gap-1">
                      <span className="text-stone-400">现金</span>
                      <button className={cn('font-semibold tabular-nums hover:text-cinnabar-700', ocf && ocf.value < 0 ? 'text-cinnabar-700' : 'text-stone-700')} onClick={(e) => { e.stopPropagation(); jump(ocf?.id); }}>
                        {ocf ? ocf.value : '—'}
                      </button>
                    </div>
                    <div className="flex justify-between gap-1 text-[10px] text-stone-400">
                      <span>同比</span>
                      <span className="tabular-nums">
                        {revG !== undefined ? `收 ${revG > 0 ? '+' : ''}${revG}%` : ''}
                        {npG !== undefined ? ` 利 ${npG > 0 ? '+' : ''}${npG}%` : ''}
                      </span>
                    </div>
                  </div>
                </div>
                {/* 事件标记 */}
                <div className="mt-2 flex flex-wrap justify-center gap-1">
                  {yEvents.map((e, i) => {
                    const Icon = EVENT_ICON[e.kind];
                    return (
                      <button
                        key={i}
                        onClick={() => jump(e.factId)}
                        title={e.text}
                        className={cn(
                          'flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] transition-colors',
                          e.severity === 'high'
                            ? 'border-cinnabar-300 bg-cinnabar-50 text-cinnabar-700 hover:bg-cinnabar-100'
                            : 'border-stone-200 bg-stone-50 text-stone-500 hover:bg-stone-100',
                        )}
                      >
                        <Icon size={10} />
                        <span className="max-w-[92px] truncate">{e.text}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ===== 背离图 + 占比/毛利率 ===== */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <section className="rounded-xl border border-stone-200 bg-paper-light p-5 lg:col-span-2">
          <div className="mb-1 flex items-baseline justify-between">
            <h3 className="font-song text-base font-semibold tracking-[0.12em] text-stone-800">背离图 · 累计利润 vs 累计经营现金流</h3>
            {analysis.profitRealization !== undefined && (
              <span className={cn('text-xs font-semibold', analysis.profitRealization < 60 ? 'text-cinnabar-700' : 'text-stone-500')}>
                区间利润变现率 {analysis.profitRealization}%（累计净利 {analysis.cumProfit} 亿 / 累计现金流 {analysis.cumOcf} 亿）
              </span>
            )}
          </div>
          <p className="mb-3 text-[11px] text-stone-400">自 {divergence[0]?.year} 年起逐年累加；两条线的裂口即「未变现的利润」。单位：亿元。</p>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={divergence} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e7e0d2" />
                <XAxis dataKey="year" tick={{ fontSize: 12, fill: '#78716c' }} />
                <YAxis tick={{ fontSize: 11, fill: '#a8a29e' }} width={44} />
                <Tooltip
                  formatter={(v: number, name: string) => [`${v} 亿元`, name === 'cumProfit' ? '累计归母净利' : name === 'cumOcf' ? '累计经营现金流' : '裂口']}
                  labelFormatter={(y) => `${y} 年`}
                  contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e7e0d2', background: '#fcfaf4' }}
                />
                <Area type="monotone" dataKey="cumProfit" name="累计归母净利" stroke="#44403c" fill="#44403c" fillOpacity={0.08} strokeWidth={2} />
                <Area type="monotone" dataKey="cumOcf" name="累计经营现金流" stroke="#b0492f" fill="#b0492f" fillOpacity={0.14} strokeWidth={2} />
                <Line type="monotone" dataKey="gap" name="裂口" stroke="#d97706" strokeDasharray="5 4" dot={false} strokeWidth={1.5} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="rounded-xl border border-stone-200 bg-paper-light p-5">
          <h3 className="mb-1 font-song text-sm font-semibold tracking-[0.12em] text-stone-800">应收 / 收入占比</h3>
          <p className="mb-2 text-[11px] text-stone-400">占比持续爬升 = 收入越来越多停留在赊销环节。单位：%。</p>
          <div className="h-44">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={arRatio} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e7e0d2" />
                <XAxis dataKey="year" tick={{ fontSize: 12, fill: '#78716c' }} />
                <YAxis tick={{ fontSize: 11, fill: '#a8a29e' }} width={36} />
                <Tooltip formatter={(v: number) => [`${v}%`, '应收/收入']} labelFormatter={(y) => `${y} 年`} contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e7e0d2', background: '#fcfaf4' }} />
                <Line type="monotone" dataKey="ratio" stroke="#b0492f" strokeWidth={2} dot={{ r: 3, fill: '#b0492f' }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="rounded-xl border border-stone-200 bg-paper-light p-5">
          <h3 className="mb-1 font-song text-sm font-semibold tracking-[0.12em] text-stone-800">毛利率走势</h3>
          <p className="mb-2 text-[11px] text-stone-400">
            {analysis.gmStd !== undefined ? `四年标准差 σ=${analysis.gmStd}pp${analysis.gmStd < 1.5 ? '，异常稳定' : ''}。` : ''}单位：%。
          </p>
          <div className="h-44">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={gmSeries} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e7e0d2" />
                <XAxis dataKey="year" tick={{ fontSize: 12, fill: '#78716c' }} />
                <YAxis tick={{ fontSize: 11, fill: '#a8a29e' }} width={36} domain={['dataMin - 1', 'dataMax + 1']} />
                <Tooltip formatter={(v: number) => [`${v}%`, '毛利率']} labelFormatter={(y) => `${y} 年`} contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e7e0d2', background: '#fcfaf4' }} />
                <Line type="monotone" dataKey="value" stroke="#44403c" strokeWidth={2} dot={{ r: 3, fill: '#44403c' }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </section>
      </div>

      {/* ===== 跨期信号卡 ===== */}
      {otherCards.length > 0 && (
        <section className="space-y-3">
          <h3 className="font-song text-base font-semibold tracking-[0.12em] text-stone-800">跨期信号（确定性计算）</h3>
          {otherCards.map((c) => (
            <div key={c.id} className="rounded-xl border border-stone-200 bg-paper-light p-4">
              <div className="flex items-center gap-2">
                <span className={cn('h-2 w-2 rounded-full', SEV_STYLE[c.severity].bar)} />
                <h4 className="text-sm font-semibold text-stone-800">{c.title}</h4>
                <span className={cn('text-[10px]', SEV_STYLE[c.severity].text)}>{SEV_STYLE[c.severity].label}风险</span>
              </div>
              <p className="mt-2 text-[13px] leading-6 text-stone-700">{c.signal}</p>
              <p className="mt-1.5 text-xs leading-5 text-stone-500">{c.boundary}</p>
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                {[...new Set(c.evidenceFactIds)].slice(0, 8).map((id) => {
                  const f = merged.facts.find((x) => x.id === id);
                  if (!f) return null;
                  return (
                    <button
                      key={id}
                      onClick={() => jump(id)}
                      className="rounded-full border border-stone-200 bg-paper-light px-2.5 py-1 text-[11px] text-stone-600 transition-colors hover:border-cinnabar-400 hover:text-cinnabar-800"
                      title={`P${f.anchor.page} · ${f.anchor.quote.slice(0, 60)}`}
                    >
                      {f.label} {f.year} = {fmtV(f.value, f.unit)} · P{f.anchor.page}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </section>
      )}

      {/* ===== 热力矩阵（二级视图，折叠） ===== */}
      <section className="rounded-xl border border-stone-200 bg-paper-light">
        <button
          onClick={() => setHeatOpen((v) => !v)}
          className="flex w-full items-center justify-between px-5 py-3.5 text-left"
        >
          <div>
            <h3 className="font-song text-base font-semibold tracking-[0.12em] text-stone-800">异常热力矩阵 · 科目 × 年份</h3>
            <p className="mt-0.5 text-[11px] text-stone-400">按同比幅度着色（≥10% 浅 / ≥25% 中 / ≥50% 深），点击格子回溯原文。</p>
          </div>
          <ChevronDown size={16} className={cn('text-stone-400 transition-transform', heatOpen && 'rotate-180')} />
        </button>
        {heatOpen && (
          <div className="overflow-x-auto border-t border-stone-100 px-5 pb-5 pt-3">
            <table className="w-full min-w-[640px] text-xs">
              <thead>
                <tr className="text-left text-stone-400">
                  <th className="px-2 py-1.5 font-medium">指标</th>
                  {analysis.allYears.map((y) => (
                    <th key={y} className="px-2 py-1.5 text-right font-medium">
                      {y}
                      {!docYears.includes(y) && <span className="ml-1 text-[9px] text-stone-300">比较期</span>}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {HEAT_ROWS.map((label) => {
                  const hasAny = analysis.allYears.some((y) => factOf(merged.facts, label, y));
                  if (!hasAny) return null;
                  return (
                    <tr key={label} className="border-t border-stone-100">
                      <td className="px-2 py-1.5 font-medium text-stone-600">{label}</td>
                      {analysis.allYears.map((y) => {
                        const f = factOf(merged.facts, label, y);
                        if (!f) {
                          return <td key={y} className="px-1 py-1 text-right"><span className="inline-block w-full rounded bg-stone-50 px-1.5 py-1 text-center text-stone-300">缺</span></td>;
                        }
                        const g = yoy(merged.facts, label, y);
                        return (
                          <td key={y} className="px-1 py-1 text-right">
                            <button
                              onClick={() => jump(f.id)}
                              title={`${label}（${y}）= ${f.value}${f.unit} · P${f.anchor.page}${g !== undefined ? ` · 同比 ${g > 0 ? '+' : ''}${g}%` : ''}`}
                              className={cn('inline-block w-full rounded px-1.5 py-1 font-medium tabular-nums transition-colors', heatClass(g))}
                            >
                              {f.value !== 0 ? f.value : f.unit}
                              {g !== undefined && (
                                <span className="ml-0.5 text-[9px] opacity-75">{g > 0 ? '▲' : g < 0 ? '▼' : ''}</span>
                              )}
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
