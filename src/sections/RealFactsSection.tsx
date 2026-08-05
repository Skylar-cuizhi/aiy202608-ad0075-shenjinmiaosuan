import { useMemo, useState } from 'react';
import type { AnchorSelection, Fact } from '@/types/research';
import type { ExtractionResult } from '@/lib/extract';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, CircleDashed, FileText, Calculator } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  extraction: ExtractionResult;
  onSelect: (sel: AnchorSelection) => void;
}

const categories: Fact['category'][] = ['收入利润', '现金流', '资产负债', '客户与板块', '审计与附注'];

/** 真实模式：确定性提取出的财务事实库 + 提取诊断面板 */
export default function RealFactsSection({ extraction, onSelect }: Props) {
  const { facts, diagnostics, meta } = extraction;
  const [activeCat, setActiveCat] = useState<Fact['category'] | '全部'>('全部');
  const filtered = useMemo(
    () => facts.filter((f) => activeCat === '全部' || f.category === activeCat),
    [facts, activeCat],
  );
  const foundCount = diagnostics.filter((d) => d.status === 'found').length;
  const computed = new Set(['资产负债率', '非经常性损益']);

  return (
    <div className="space-y-4">
      {/* 提取诊断 */}
      <div className="rounded-lg border border-stone-200 bg-paper-light px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold text-stone-800">提取诊断</div>
          <div className="text-xs text-stone-500">
            {meta.fiscalYear} 财年 · 原始单位「{meta.unit}」已统一换算为亿元 · 命中 {foundCount}/{diagnostics.length} 项指标
          </div>
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {diagnostics.map((d) => (
            <span
              key={d.key}
              title={d.status === 'found' ? `年份：${d.years.join('、')} · 页码：${d.pages.join('、')}${d.note ? `\n${d.note}` : ''}` : '未在文档中找到该指标'}
              className={cn(
                'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px]',
                d.status === 'found'
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                  : 'border-stone-200 bg-stone-50 text-stone-400',
              )}
            >
              {d.status === 'found' ? <CheckCircle2 className="h-3 w-3" /> : <CircleDashed className="h-3 w-3" />}
              {d.label}
              {computed.has(d.label) && d.status === 'found' && <Calculator className="h-3 w-3 text-cinnabar-600" />}
            </span>
          ))}
        </div>
        <p className="mt-2 text-[11px] leading-relaxed text-stone-500">
          提取完全由确定性规则完成（表格结构 + 正则），未使用大模型读数；
          <Calculator className="mx-0.5 inline h-3 w-3 text-cinnabar-600" />
          标记的指标由程序计算得出。找不到的指标如实标记缺失，不会编造。
        </p>
      </div>

      {/* 分类过滤 */}
      <div className="flex flex-wrap items-center gap-1">
        {(['全部', ...categories] as const).map((c) => (
          <button
            key={c}
            onClick={() => setActiveCat(c)}
            className={cn(
              'rounded-full px-3 py-1 text-xs font-medium transition-colors',
              activeCat === c ? 'bg-stone-800 text-white' : 'bg-stone-100 text-stone-600 hover:bg-stone-200',
            )}
          >
            {c}
          </button>
        ))}
        <span className="ml-auto text-xs text-stone-500">{filtered.length} 条事实 · 点击「原文」按坐标高亮</span>
      </div>

      {/* 事实表 */}
      <div className="overflow-x-auto rounded-lg border border-stone-200 bg-paper-light">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-stone-200 bg-stone-50 text-left text-xs text-stone-500">
              <th className="px-3 py-2 font-medium">指标</th>
              <th className="px-3 py-2 font-medium">年份</th>
              <th className="px-3 py-2 text-right font-medium">数值</th>
              <th className="px-3 py-2 font-medium">来源</th>
              <th className="px-3 py-2 font-medium">原文行</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {filtered.map((f) => (
              <tr key={f.id} className="border-b border-stone-100 last:border-0 hover:bg-cinnabar-50/40">
                <td className="px-3 py-2.5 font-medium text-stone-800">
                  {f.label}
                  {computed.has(f.label) && <Calculator className="ml-1 inline h-3 w-3 text-cinnabar-600" />}
                </td>
                <td className="px-3 py-2.5 text-stone-600">{f.year}</td>
                <td className="px-3 py-2.5 text-right font-semibold tabular-nums text-stone-900">
                  {f.value !== 0 ? f.value : '—'}
                  <span className="ml-1 text-xs font-normal text-stone-500">{f.unit}</span>
                </td>
                <td className="px-3 py-2.5">
                  <Badge variant="outline" className="border-stone-300 text-[11px] text-stone-600">
                    P{f.anchor.page}{f.anchor.chapter ? ` · ${f.anchor.chapter.slice(0, 12)}` : ''}
                  </Badge>
                </td>
                <td className="max-w-[260px] px-3 py-2.5">
                  <span className="line-clamp-2 text-xs leading-snug text-stone-500">{f.anchor.quote}</span>
                </td>
                <td className="px-3 py-2.5 text-right">
                  <button
                    onClick={() => onSelect({ id: f.id, page: f.anchor.page, quote: f.anchor.quote, chapter: f.anchor.chapter })}
                    className="inline-flex items-center gap-1 rounded-md border border-cinnabar-200 bg-cinnabar-50 px-2 py-1 text-xs font-medium text-cinnabar-800 transition-colors hover:bg-cinnabar-100"
                  >
                    <FileText className="h-3 w-3" /> 原文
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div className="px-4 py-10 text-center text-sm text-stone-500">该分类下暂无提取到的事实</div>
        )}
      </div>
    </div>
  );
}
