import { useMemo, useState } from 'react';
import type { AnchorSelection, Fact } from '@/types/research';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { FileText, Search } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  facts: Fact[];
  onSelectAnchor: (sel: AnchorSelection) => void;
}

const categories: Fact['category'][] = ['收入利润', '现金流', '资产负债', '客户与板块', '审计与附注'];

export default function FactsSection({ facts, onSelectAnchor }: Props) {
  const [query, setQuery] = useState('');
  const [activeCat, setActiveCat] = useState<Fact['category'] | '全部'>('全部');

  const filtered = useMemo(
    () =>
      facts.filter(
        (f) =>
          (activeCat === '全部' || f.category === activeCat) &&
          (query === '' || f.label.includes(query) || f.anchor.quote.includes(query)),
      ),
    [facts, activeCat, query],
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-stone-400" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索指标或原文…"
            className="h-9 w-56 border-stone-200 pl-8 text-sm"
          />
        </div>
        <div className="flex gap-1">
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
        </div>
        <span className="ml-auto text-xs text-stone-500">
          {filtered.length} 条事实 · 每条都绑定页码、表格与原文
        </span>
      </div>

      <div className="overflow-x-auto rounded-lg border border-stone-200 bg-paper-light">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-stone-200 bg-stone-50 text-left text-xs text-stone-500">
              <th className="px-3 py-2 font-medium">指标</th>
              <th className="px-3 py-2 font-medium">年份</th>
              <th className="px-3 py-2 text-right font-medium">数值</th>
              <th className="px-3 py-2 font-medium">来源</th>
              <th className="px-3 py-2 font-medium">原文片段</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {filtered.map((f) => (
              <tr key={f.id} className="border-b border-stone-100 last:border-0 hover:bg-cinnabar-50/40">
                <td className="px-3 py-2.5 font-medium text-stone-800">{f.label}</td>
                <td className="px-3 py-2.5 text-stone-600">{f.year}</td>
                <td className="px-3 py-2.5 text-right font-semibold tabular-nums text-stone-900">
                  {f.value !== 0 ? f.value : '—'}
                  <span className="ml-1 text-xs font-normal text-stone-500">{f.unit}</span>
                </td>
                <td className="px-3 py-2.5">
                  <Badge variant="outline" className="border-stone-300 text-[11px] text-stone-600">
                    P{f.anchor.page}{f.anchor.table ? ` · ${f.anchor.table}` : ''}
                  </Badge>
                </td>
                <td className="max-w-[280px] px-3 py-2.5">
                  <span className="line-clamp-2 text-xs leading-snug text-stone-500">{f.anchor.quote}</span>
                </td>
                <td className="px-3 py-2.5 text-right">
                  <button
                    onClick={() =>
                      onSelectAnchor({ page: f.anchor.page, quote: f.anchor.quote, chapter: f.anchor.chapter })
                    }
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
          <div className="px-4 py-10 text-center text-sm text-stone-500">没有匹配的事实记录</div>
        )}
      </div>
    </div>
  );
}
