import { useMemo } from 'react';
import type { RealFact } from '@/lib/extract';
import type { DocEntry, MergedFacts } from '@/lib/merge';
import { FileText } from 'lucide-react';

interface Props {
  docs: DocEntry[];
  merged: MergedFacts;
  /** 点击单元格：跳转到该事实的原文（自动切换到所属文档） */
  onSelect: (fact: RealFact) => void;
}

/** 对比视图的行顺序（确定性指标全集） */
const ROWS: { label: string; category: string }[] = [
  { label: '营业收入', category: '收入利润' },
  { label: '营业成本', category: '收入利润' },
  { label: '毛利率', category: '收入利润' },
  { label: '归母净利润', category: '收入利润' },
  { label: '扣非净利润', category: '收入利润' },
  { label: '非经常性损益', category: '收入利润' },
  { label: '经营活动现金流净额', category: '现金流' },
  { label: '应收账款', category: '资产负债' },
  { label: '存货', category: '资产负债' },
  { label: '商誉', category: '资产负债' },
  { label: '合同资产', category: '资产负债' },
  { label: '资产总计', category: '资产负债' },
  { label: '负债合计', category: '资产负债' },
  { label: '资产负债率', category: '资产负债' },
  { label: '前五大客户收入占比', category: '客户与板块' },
];

/** 多年报对比：合并 N 份年报的确定性事实，指标 × 年份矩阵，点击单元格回原文 */
export default function CompareSection({ docs, merged, onSelect }: Props) {
  const years = useMemo(
    () => [...new Set(merged.facts.map((f) => f.year))].sort((a, b) => b - a),
    [merged],
  );
  const byKey = useMemo(() => {
    const m = new Map<string, RealFact>();
    for (const f of merged.facts) m.set(`${f.label}|${f.year}`, f);
    return m;
  }, [merged]);

  const docLabel = (fy: number) => {
    const d = docs.find((x) => x.extraction.meta.fiscalYear === fy);
    return d ? `${fy} 年报 · ${d.pdf.numPages} 页` : '';
  };

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-stone-200 bg-paper-light px-4 py-3 text-sm leading-relaxed text-stone-600">
        对比视图合并了 {docs.length} 份年报的<b className="text-stone-800">确定性提取</b>结果。
        同一指标同一年份优先采用该财年报告主表数据；文字型事实（审计意见等）不参与对比。
        点击数值可回到对应年报原文。
      </div>

      <div className="flex flex-wrap gap-2 text-xs text-stone-500">
        {docs.map((d) => {
          const fy = d.extraction.meta.fiscalYear;
          return (
            <span key={d.id} className="rounded-full border border-stone-200 bg-stone-50 px-2.5 py-1">
              {fy ? docLabel(fy) : d.pdf.fileName}
            </span>
          );
        })}
      </div>

      <div className="overflow-x-auto rounded-lg border border-stone-200 bg-paper-light">
        <table className="w-full min-w-[560px] text-sm">
          <thead>
            <tr className="border-b border-stone-200 bg-stone-50 text-left text-xs text-stone-500">
              <th className="px-3 py-2 font-medium">指标</th>
              {years.map((y) => (
                <th key={y} className="px-3 py-2 text-right font-medium">{y}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ROWS.map((row, ri) => {
              const hasAny = years.some((y) => byKey.has(`${row.label}|${y}`));
              if (!hasAny) return null;
              return (
                <tr key={row.label} className={`border-b border-stone-100 last:border-0 ${ri % 2 ? 'bg-stone-50/50' : ''}`}>
                  <td className="px-3 py-2.5 font-medium text-stone-800">{row.label}</td>
                  {years.map((y) => {
                    const f = byKey.get(`${row.label}|${y}`);
                    if (!f) {
                      return <td key={y} className="px-3 py-2.5 text-right text-stone-300">—</td>;
                    }
                    return (
                      <td key={y} className="px-3 py-2.5 text-right">
                        <button
                          onClick={() => onSelect(f)}
                          title={`${f.label}（${f.year}）· P${f.anchor.page} · 点击回原文`}
                          className="group inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-semibold tabular-nums text-stone-900 transition-colors hover:bg-cinnabar-50 hover:text-cinnabar-800"
                        >
                          {f.value !== 0 ? f.value : '—'}
                          <span className="text-xs font-normal text-stone-500">{f.unit}</span>
                          <FileText className="h-3 w-3 text-stone-300 group-hover:text-cinnabar-600" />
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
    </div>
  );
}
