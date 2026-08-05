import { useMemo, useState } from 'react';
import type { LoadedPdf, SearchMatch } from '@/lib/pdf';
import { searchPdf } from '@/lib/pdf';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Search, MousePointerClick } from 'lucide-react';

interface Props {
  pdf: LoadedPdf;
  onJump: (page: number, rects: SearchMatch['rects']) => void;
}

/** 全文检索：接入 LLM 提取管线之前的真实溯源通道 */
export default function SearchSection({ pdf, onJump }: Props) {
  const [query, setQuery] = useState('');
  const [submitted, setSubmitted] = useState('');

  const results: SearchMatch[] = useMemo(
    () => (submitted ? searchPdf(pdf, submitted) : []),
    [pdf, submitted],
  );

  const suggestions = ['营业收入', '经营活动现金流', '应收账款', '合同资产', '审计意见', '会计政策变更'];

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-stone-200 bg-paper-light px-4 py-3 text-sm leading-relaxed text-stone-600">
        检索在<b className="text-stone-800">逐页文字索引</b>上进行，每个命中结果都带有 PDF 坐标，
        点击即可在右侧原文面板中<b className="text-stone-800">精准定位并高亮</b>。
        接入提取管线（下一步）后，这里将升级为结构化事实库。
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          setSubmitted(query);
        }}
        className="flex items-center gap-2"
      >
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-stone-400" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="输入关键词，回车检索全文…"
            className="h-9 border-stone-200 bg-paper-light pl-8 text-sm"
          />
        </div>
      </form>

      {!submitted && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-stone-500">试试：</span>
          {suggestions.map((s) => (
            <button
              key={s}
              onClick={() => { setQuery(s); setSubmitted(s); }}
              className="rounded-full bg-stone-100 px-3 py-1 text-xs text-stone-600 hover:bg-cinnabar-100 hover:text-cinnabar-800"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {submitted && (
        <div className="text-xs text-stone-500">
          「{submitted}」共命中 {results.length} 处
          {results.length >= 60 && '（仅显示前 60 条）'}
        </div>
      )}

      <div className="space-y-2">
        {results.map((m, i) => (
          <button
            key={i}
            onClick={() => onJump(m.page, m.rects)}
            className="group w-full rounded-lg border border-stone-200 bg-paper-light px-4 py-2.5 text-left transition-colors hover:border-cinnabar-300 hover:bg-cinnabar-50/40"
          >
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="border-stone-300 text-[11px] text-stone-600">P{m.page}</Badge>
              <MousePointerClick className="h-3.5 w-3.5 text-stone-300 group-hover:text-cinnabar-600" />
            </div>
            <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-stone-600">{m.snippet}</p>
          </button>
        ))}
        {submitted && results.length === 0 && (
          <div className="rounded-lg border border-stone-200 bg-paper-light px-4 py-10 text-center text-sm text-stone-500">
            未找到「{submitted}」。可能是扫描图片页（无文字层），或换个关键词试试。
          </div>
        )}
      </div>
    </div>
  );
}
