import type { Chapter } from '@/types/research';
import { CheckCircle2, AlertTriangle, XCircle, PanelLeftClose } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

interface Props {
  chapters: Chapter[];
  totalPages: number;
  activePage?: number;
  onSelectPage: (page: number, chapter: string) => void;
  onCollapse?: () => void;
}

const statusMeta = {
  parsed: { icon: CheckCircle2, label: '已完整读取', className: 'text-emerald-600' },
  partial: { icon: AlertTriangle, label: '部分识别', className: 'text-cinnabar-600' },
  failed: { icon: XCircle, label: '识别困难', className: 'text-red-500' },
} as const;

export default function CoverageSidebar({ chapters, totalPages, activePage, onSelectPage, onCollapse }: Props) {
  const parsedPages = chapters
    .filter((c) => c.status === 'parsed')
    .reduce((s, c) => s + (c.pageEnd - c.pageStart + 1), 0);
  const coverage = Math.round((parsedPages / totalPages) * 100);
  const tables = chapters.reduce((s, c) => s + c.tablesExtracted, 0);

  return (
    <aside className="flex h-full w-full flex-col border-r border-stone-200 bg-paper-light">
      <div className="border-b border-stone-200 px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="text-xs font-medium uppercase tracking-wide text-stone-500">阅读覆盖证明</div>
          {onCollapse && (
            <button
              onClick={onCollapse}
              className="rounded-md p-1 text-stone-400 transition-colors hover:bg-stone-100 hover:text-stone-700"
              title="收起本栏（需要时从左侧细条重新展开）"
            >
              <PanelLeftClose className="h-4 w-4" />
            </button>
          )}
        </div>
        <div className="mt-2 flex items-end justify-between">
          <span className="text-2xl font-semibold text-stone-900">{coverage}%</span>
          <span className="text-xs text-stone-500">{parsedPages}/{totalPages} 页 · {tables} 张表格</span>
        </div>
        <Progress value={coverage} className="mt-2 h-1.5" />
        <p className="mt-2 text-[11px] leading-relaxed text-stone-500">
          系统在分析前先证明自己读过：逐章登记读取状态，识别困难的内容明确标记，不含糊。
        </p>
      </div>
      <ScrollArea className="flex-1">
        <ul className="py-2">
          {chapters.map((c) => {
            const meta = statusMeta[c.status];
            const Icon = meta.icon;
            const isActive = activePage !== undefined && activePage >= c.pageStart && activePage <= c.pageEnd;
            return (
              <li key={c.id}>
                <button
                  onClick={() => onSelectPage(c.pageStart, c.title)}
                  className={cn(
                    'w-full px-4 py-2.5 text-left transition-colors hover:bg-stone-50',
                    isActive && 'bg-cinnabar-50 hover:bg-cinnabar-50',
                  )}
                >
                  <div className="flex items-start gap-2">
                    <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', meta.className)} />
                    <div className="min-w-0">
                      <div className="line-clamp-2 text-sm font-medium text-stone-800">{c.title}</div>
                      <div className="mt-0.5 text-[11px] text-stone-500">
                        P{c.pageStart}–{c.pageEnd} · {meta.label} · {c.tablesExtracted} 表
                      </div>
                      {c.note && (
                        <div className="mt-1 rounded bg-stone-100 px-2 py-1 text-[11px] leading-snug text-stone-600">
                          {c.note}
                        </div>
                      )}
                    </div>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      </ScrollArea>
    </aside>
  );
}
