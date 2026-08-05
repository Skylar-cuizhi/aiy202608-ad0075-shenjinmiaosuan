import type { DetectedChapter, LoadedPdf } from '@/lib/pdf';
import { CheckCircle2, ImageOff, File, PanelLeftClose } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

interface Props {
  pdf: LoadedPdf;
  chapters: DetectedChapter[];
  activePage?: number;
  onSelectPage: (page: number) => void;
  onCollapse?: () => void;
}

/** 真实模式左侧栏：解析进度、章节列表、扫描页提示 */
export default function RealChaptersSidebar({ pdf, chapters, activePage, onSelectPage, onCollapse }: Props) {
  const imagePages = pdf.pages.filter((p) => p.isImageOnly).length;
  const coverage = Math.round(((pdf.numPages - imagePages) / pdf.numPages) * 100);

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
          <span className="text-xs text-stone-500">{pdf.numPages - imagePages}/{pdf.numPages} 页含文字层</span>
        </div>
        <Progress value={coverage} className="mt-2 h-1.5" />
        <p className="mt-2 text-[11px] leading-relaxed text-stone-500">
          {imagePages > 0
            ? `${imagePages} 页为扫描图片（无文字层），已明确标记，不会假装读过。`
            : '全部页面均含文字层，已逐页建立带坐标的文字索引。'}
        </p>
      </div>

      <ScrollArea className="flex-1">
        {chapters.length > 0 ? (
          <ul className="py-2">
            {chapters.map((c) => {
              const isActive = activePage !== undefined && activePage >= c.pageStart && activePage <= c.pageEnd;
              return (
                <li key={c.title + c.pageStart}>
                  <button
                    onClick={() => onSelectPage(c.pageStart)}
                    className={cn(
                      'w-full px-4 py-2.5 text-left transition-colors hover:bg-stone-50',
                      isActive && 'bg-cinnabar-50 hover:bg-cinnabar-50',
                    )}
                  >
                    <div className="flex items-start gap-2">
                      {c.status === 'parsed' ? (
                        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                      ) : (
                        <ImageOff className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
                      )}
                      <div className="min-w-0">
                        <div className="line-clamp-2 text-sm font-medium text-stone-800">{c.title}</div>
                        <div className="mt-0.5 text-[11px] text-stone-500">
                          P{c.pageStart}–{c.pageEnd} · {c.status === 'parsed' ? '已建立索引' : '扫描图片'}
                        </div>
                      </div>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="px-4 py-6 text-center">
            <File className="mx-auto h-6 w-6 text-stone-300" />
            <p className="mt-2 text-xs leading-relaxed text-stone-500">
              未检测到标准章节标题。
              <br />
              可继续用全文检索浏览文档。
            </p>
          </div>
        )}
      </ScrollArea>

      <div className="border-t border-stone-200 px-4 py-2">
        <div className="text-[10px] uppercase tracking-wide text-stone-400">跳转页码</div>
        <div className="mt-1 flex flex-wrap gap-1">
          {[1, ...chapters.map((c) => c.pageStart)]
            .filter((v, i, a) => a.indexOf(v) === i)
            .slice(0, 12)
            .map((p) => (
              <button
                key={p}
                onClick={() => onSelectPage(p)}
                className={cn(
                  'rounded border px-1.5 py-0.5 text-[11px]',
                  activePage === p
                    ? 'border-cinnabar-400 bg-cinnabar-100 text-cinnabar-800'
                    : 'border-stone-200 text-stone-500 hover:border-stone-400',
                )}
              >
                {p}
              </button>
            ))}
        </div>
      </div>
    </aside>
  );
}
