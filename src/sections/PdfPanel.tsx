import { useEffect, useRef } from 'react';
import type { AnchorSelection, Fact } from '@/types/research';
import { FileText, X } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

interface Props {
  selection: AnchorSelection;
  facts: Fact[];
  onClose: () => void;
  onJump: (sel: AnchorSelection) => void;
}

/**
 * 模拟 PDF 原文面板：MVP 中以样式化文本页呈现。
 * 真实版本中这里替换为 PDF.js 渲染器，锚点映射为页面坐标高亮框。
 */
export default function PdfPanel({ selection, facts, onClose, onJump }: Props) {
  const highlightRef = useRef<HTMLDivElement>(null);
  const pageFacts = facts.filter((f) => f.anchor.page === selection.page);

  useEffect(() => {
    highlightRef.current?.scrollIntoView({ block: 'center' });
  }, [selection]);

  return (
    <aside className="flex h-full w-full flex-col border-l border-stone-200 bg-paper-light">
      <div className="flex items-center gap-2 border-b border-stone-200 px-4 py-2.5">
        <FileText className="h-4 w-4 text-cinnabar-600" />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-stone-800">PDF 原文 · 第 {selection.page} 页</div>
          <div className="truncate text-[11px] text-stone-500">{selection.chapter}</div>
        </div>
        <button onClick={onClose} className="rounded p-1 text-stone-400 hover:bg-stone-100 hover:text-stone-600">
          <X className="h-4 w-4" />
        </button>
      </div>

      <ScrollArea className="flex-1 bg-stone-100">
        {/* 纸张效果 */}
        <div className="m-3 rounded-sm border border-stone-200 bg-paper-light p-5 shadow-sm">
          <div className="mb-3 flex items-center justify-between border-b border-stone-100 pb-2 text-[10px] text-stone-400">
            <span>宏远建设股份有限公司 2024 年年度报告</span>
            <span>第 {selection.page} 页</span>
          </div>

          <div className="space-y-3">
            {pageFacts.length === 0 && (
              <p className="text-xs leading-relaxed text-stone-400">（本页无已提取的结构化事实）</p>
            )}
            {pageFacts.map((f) => {
              const isActive = f.anchor.quote === selection.quote;
              return (
                <div
                  key={f.id}
                  ref={isActive ? highlightRef : undefined}
                  onClick={() => onJump({ page: f.anchor.page, quote: f.anchor.quote, chapter: f.anchor.chapter })}
                  className={cn(
                    'cursor-pointer rounded px-2 py-1.5 transition-colors',
                    isActive ? 'bg-cinnabar-200/70 ring-1 ring-cinnabar-400' : 'hover:bg-cinnabar-50',
                  )}
                >
                  {f.anchor.table && (
                    <div className="mb-0.5 text-[10px] font-medium text-stone-400">〔表：{f.anchor.table}〕</div>
                  )}
                  <p className="text-xs leading-relaxed text-stone-700">
                    <mark className={cn(isActive ? 'bg-cinnabar-300/60' : 'bg-transparent')}>{f.anchor.quote}</mark>
                  </p>
                  <div className="mt-0.5 text-[10px] text-stone-400">
                    → 已提取：{f.label}（{f.year}）
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-4 border-t border-stone-100 pt-2 text-center text-[10px] text-stone-300">
            — 模拟渲染 · 真实版本由 PDF.js 呈现原始版式 —
          </div>
        </div>
      </ScrollArea>

      <div className="border-t border-stone-200 px-4 py-2 text-[11px] leading-relaxed text-stone-500">
        每个结论都能回到这里：数字与 PDF 页码、表格、原文逐字绑定。
      </div>
    </aside>
  );
}
