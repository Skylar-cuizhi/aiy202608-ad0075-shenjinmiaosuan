import { useState } from 'react';
import type { KnowledgePack } from '@/types/research';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Package, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  packs: KnowledgePack[];
  activeIndustry: string;
}

function PackList({ title, items, ordered }: { title: string; items: string[]; ordered?: boolean }) {
  return (
    <div>
      <div className="text-xs font-semibold uppercase tracking-wide text-stone-500">{title}</div>
      <ul className="mt-1.5 space-y-1 text-sm leading-relaxed text-stone-700">
        {items.map((it, i) => (
          <li key={i} className="flex gap-2">
            <span className="shrink-0 text-stone-400">{ordered ? `${i + 1}.` : '·'}</span>
            {it}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function KnowledgePackSection({ packs, activeIndustry }: Props) {
  const [activeId, setActiveId] = useState(
    packs.find((p) => p.industry === activeIndustry)?.id ?? packs[0].id,
  );
  const pack = packs.find((p) => p.id === activeId)!;

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-stone-200 bg-paper-light px-4 py-3 text-sm leading-relaxed text-stone-600">
        不同行业的风险逻辑不同。系统识别企业所属行业后加载对应<b className="text-stone-800">行业知识包</b>，
        用该行业的指标、规则与交叉验证关系扫描财务事实。知识包可持续扩展，未来支持研究员沉淀个人知识包。
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {packs.map((p) => (
          <button
            key={p.id}
            onClick={() => setActiveId(p.id)}
            className={cn(
              'flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors',
              activeId === p.id
                ? 'border-stone-800 bg-stone-800 text-white'
                : 'border-stone-200 bg-paper-light text-stone-600 hover:border-stone-400',
            )}
          >
            <Package className="h-3.5 w-3.5" /> {p.industry}
            {p.industry === activeIndustry && (
              <Badge className="ml-1 border-cinnabar-300 bg-cinnabar-100 text-[10px] text-cinnabar-800" variant="outline">
                本报告加载
              </Badge>
            )}
          </button>
        ))}
        <button className="flex items-center gap-1 rounded-full border border-dashed border-stone-300 px-3.5 py-1.5 text-sm text-stone-400 hover:text-stone-600">
          <Plus className="h-3.5 w-3.5" /> 新建知识包
        </button>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="border-stone-200">
          <CardHeader className="pb-2"><CardTitle className="text-sm">重要财务指标</CardTitle></CardHeader>
          <CardContent><PackList title="" items={pack.keyMetrics} /></CardContent>
        </Card>
        <Card className="border-stone-200">
          <CardHeader className="pb-2"><CardTitle className="text-sm">常见风险信号（确定性规则）</CardTitle></CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {pack.rules.map((r) => (
                <li key={r.id} className="rounded-md bg-stone-50 px-3 py-2">
                  <code className="text-[11px] text-cinnabar-700">{r.id}</code>
                  <div className="text-sm leading-relaxed text-stone-700">{r.description}</div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
        <Card className="border-stone-200">
          <CardHeader className="pb-2"><CardTitle className="text-sm">指标交叉验证关系</CardTitle></CardHeader>
          <CardContent><PackList title="" items={pack.crossChecks} /></CardContent>
        </Card>
        <Card className="border-stone-200">
          <CardHeader className="pb-2"><CardTitle className="text-sm">需进一步查阅的附注</CardTitle></CardHeader>
          <CardContent><PackList title="" items={pack.notesToCheck} /></CardContent>
        </Card>
        <Card className="border-stone-200 lg:col-span-2">
          <CardHeader className="pb-2"><CardTitle className="text-sm">适合提出的核实问题</CardTitle></CardHeader>
          <CardContent><PackList title="" items={pack.typicalQuestions} ordered /></CardContent>
        </Card>
      </div>
    </div>
  );
}
