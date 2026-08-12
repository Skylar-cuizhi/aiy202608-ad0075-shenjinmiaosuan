import { useEffect, useRef, useState } from 'react';
import type { LoadedPdf, SearchMatchRect } from '@/lib/pdf';
import { ChevronLeft, ChevronRight, X, ZoomIn, ZoomOut } from 'lucide-react';

interface Props {
  pdf: LoadedPdf;
  page: number;
  highlights: SearchMatchRect[];
  onPageChange: (page: number) => void;
  onClose: () => void;
}

/**
 * 真实 PDF 渲染面板：canvas 渲染 + 坐标高亮覆盖。
 * 面板宽度可拖拽，页面始终按面板宽度自适应缩放（缩放按钮为倍率微调）。
 */
export default function RealPdfPanel({ pdf, page, highlights, onPageChange, onClose }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const highlightLayerRef = useRef<HTMLDivElement>(null);
  const [containerW, setContainerW] = useState(0);
  const [factor, setFactor] = useState(1); // 宽度适配的倍率微调
  const [pageInput, setPageInput] = useState(String(page));

  // 外部定位（点击事实、搜索结果、章节）后同步输入框显示。
  useEffect(() => {
    setPageInput(String(page));
  }, [page]);

  /** 将手动输入限制在有效页码范围内；非法输入恢复当前页。 */
  const commitPageInput = () => {
    const parsed = Number.parseInt(pageInput, 10);
    if (!Number.isFinite(parsed)) {
      setPageInput(String(page));
      return;
    }
    const next = Math.min(pdf.numPages, Math.max(1, parsed));
    setPageInput(String(next));
    if (next !== page) onPageChange(next);
  };

  // 监听面板宽度变化（拖拽分隔条时实时触发）
  useEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      setContainerW(entries[0].contentRect.width);
    });
    ro.observe(el);
    setContainerW(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const pageData = pdf.pages[page - 1];
  // 适配缩放：页面宽度铺满面板（留 24px 边距），再乘用户倍率
  const fitZoom = containerW > 0 && pageData ? (containerW - 24) / pageData.width : 1;
  const zoom = fitZoom * factor;

  const renderTaskRef = useRef<{ cancel: () => void } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const p = await pdf.doc.getPage(page);
      if (cancelled) return;
      const viewport = p.getViewport({ scale: zoom * 2 }); // 2x 保证清晰度
      const canvas = canvasRef.current;
      if (!canvas || cancelled) return;
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      canvas.style.width = `${viewport.width / 2}px`;
      canvas.style.height = `${viewport.height / 2}px`;
      const ctx = canvas.getContext('2d')!;
      // 同一 canvas 上的并发 render 会被 pdfjs 拒绝：先取消上一个任务
      renderTaskRef.current?.cancel();
      const task = p.render({ canvas, canvasContext: ctx, viewport });
      renderTaskRef.current = task;
      try {
        await task.promise;
      } catch (e) {
        // 取消渲染属正常竞态（翻页/缩放/切文档），静默忽略
        if (e instanceof Error && e.name === 'RenderingCancelledException') return;
        throw e;
      }
      if (cancelled) return;
      const first = highlightLayerRef.current?.querySelector<HTMLElement>('[data-hl]');
      first?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    })();
    return () => {
      cancelled = true;
      renderTaskRef.current?.cancel();
    };
  }, [pdf, page, zoom, highlights]);

  return (
    <aside className="flex h-full w-full flex-col border-l border-stone-200 bg-paper-light">
      <div className="flex items-center gap-0.5 overflow-x-auto border-b border-stone-200 px-2 py-2">
        <button
          onClick={() => onPageChange(Math.max(1, page - 1))}
          disabled={page <= 1}
          className="shrink-0 rounded p-1 text-stone-500 hover:bg-stone-100 disabled:opacity-30"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <div className="flex min-w-[7.25rem] flex-1 items-center justify-center gap-1 whitespace-nowrap text-center">
          <span className="text-xs text-stone-500">第</span>
          <input
            aria-label="跳转到页码"
            inputMode="numeric"
            pattern="[0-9]*"
            value={pageInput}
            onChange={(e) => setPageInput(e.target.value.replace(/\D/g, ''))}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                commitPageInput();
              }
            }}
            onBlur={commitPageInput}
            className="h-7 w-14 shrink-0 rounded border border-stone-200 bg-paper-light px-1 text-center text-sm font-semibold tabular-nums text-stone-800 outline-none transition-colors focus:border-cinnabar-400 focus:ring-2 focus:ring-cinnabar-200/60"
            title={`输入 1–${pdf.numPages} 后回车跳转`}
          />
          <span className="text-xs text-stone-400">页 / {pdf.numPages}</span>
          {pageData?.isImageOnly && (
            <span className="ml-1 rounded bg-red-50 px-1 text-[10px] text-red-500">无文字层</span>
          )}
        </div>
        <button
          onClick={() => onPageChange(Math.min(pdf.numPages, page + 1))}
          disabled={page >= pdf.numPages}
          className="shrink-0 rounded p-1 text-stone-500 hover:bg-stone-100 disabled:opacity-30"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
        <span className="h-4 w-px shrink-0 bg-stone-200" />
        <button
          onClick={() => setFactor((f) => Math.max(0.6, +(f - 0.15).toFixed(2)))}
          className="shrink-0 rounded p-1 text-stone-500 hover:bg-stone-100"
          title="缩小（基于面板宽度自适应）"
        >
          <ZoomOut className="h-4 w-4" />
        </button>
        <button
          onClick={() => setFactor((f) => Math.min(2.2, +(f + 0.15).toFixed(2)))}
          className="shrink-0 rounded p-1 text-stone-500 hover:bg-stone-100"
          title="放大（基于面板宽度自适应）"
        >
          <ZoomIn className="h-4 w-4" />
        </button>
        <button onClick={onClose} className="shrink-0 rounded p-1 text-stone-400 hover:bg-stone-100 hover:text-stone-600">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div ref={bodyRef} className="flex-1 overflow-auto bg-stone-200/60">
        <div className="flex min-w-fit justify-center p-3">
          <div className="relative h-fit shadow-md">
            <canvas ref={canvasRef} className="block bg-paper-light" />
            {/* 高亮覆盖层：坐标基于 scale=1 视口，乘以 zoom 缩放 */}
            <div ref={highlightLayerRef} className="pointer-events-none absolute inset-0">
              {highlights.map((r, i) => (
                <div
                  key={i}
                  data-hl
                  className="absolute rounded-[2px] bg-cinnabar-400/45 ring-1 ring-cinnabar-500/70"
                  style={{
                    left: r.x * zoom,
                    top: r.y * zoom,
                    width: r.w * zoom,
                    height: r.h * zoom,
                  }}
                />
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="border-t border-stone-200 px-3 py-1.5 text-[11px] text-stone-500">
        {highlights.length > 0
          ? `${highlights.length} 处命中已按坐标高亮 · 页面已适配面板宽度`
          : '在「全文检索」中搜索关键词，点击结果即可定位高亮'}
      </div>
    </aside>
  );
}
