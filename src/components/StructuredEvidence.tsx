import type { Fact } from '@/types/research';
import { ChevronDown } from 'lucide-react';
import type { ReactNode } from 'react';

interface Props {
  fact: Fact;
}

/**
 * PDF 文字层经常把相邻表格单元直接拼接（例如「...105.083,390...」）。
 * 这里仅为展示补充分隔符，不改写 anchor.quote，因此坐标高亮仍使用原始文本契约。
 */
const NUMBER_RE = /-?(?:\d+(?:,\d{3})+|\d+)(?:\.\d{1,2})?%?/g;

function isCellBoundary(gap: string): boolean {
  return gap.trim() === '' || /^[)\]}]\s*[(\[{]$/.test(gap);
}

function readableGap(gap: string): string {
  if (gap.trim() === '') return `${gap} · `;
  return gap.replace(/\s*([([{])/, ' · $1');
}

function addLabelSpacing(gap: string, source: string, start: number): string {
  const previous = source[start - 1];
  return previous && /[\u3400-\u9fff]/.test(previous) && !/\s$/.test(gap) ? `${gap} ` : gap;
}

function separateNumberAndLabel(text: string): string {
  return text.replace(/([0-9%)\]])(?=[\u3400-\u9fff])/g, '$1 ');
}

function addTrailingLabelSpacing(tail: string, source: string, cursor: number): string {
  const previous = source[cursor - 1];
  return previous && /[0-9%)\]]/.test(previous) && /^[\u3400-\u9fff]/.test(tail) ? ` ${tail}` : tail;
}

/** 修复文字层把首个千分位逗号吞掉的显示（如 3460,192 → 3,460,192）。 */
function normalizeNumberToken(raw: string): string {
  const sign = raw.startsWith('-') ? '-' : '';
  const percent = raw.endsWith('%') ? '%' : '';
  const body = raw.slice(sign.length, raw.length - percent.length);
  const [integer, fraction] = body.split('.');
  const groups = integer.split(',');
  if (groups.length > 1 && groups[0].length > 3) {
    const first = groups.shift()!;
    groups.unshift(first.slice(0, -3), first.slice(-3));
  }
  return `${sign}${groups.join(',')}${fraction ? `.${fraction}` : ''}${percent}`;
}

/** 将原文数字按可读单元展示，保留数字值与上下文。 */
export function ReadableEvidenceText({ text }: { text: string }) {
  const source = text.replace(/\s+/g, ' ').trim();
  const matches = [...source.matchAll(NUMBER_RE)];
  if (matches.length < 2) return <>{source}</>;

  const parts: ReactNode[] = [];
  let cursor = 0;
  let previousEnd = -1;

  matches.forEach((match, index) => {
    const start = match.index ?? 0;
    let gap = source.slice(cursor, start);
    if (previousEnd >= 0 && isCellBoundary(gap)) gap = readableGap(gap);
    if (previousEnd < 0) gap = addLabelSpacing(gap, source, start);
    gap = separateNumberAndLabel(gap);
    parts.push(gap);
    parts.push(
      <span key={`evidence-number-${index}`} className="whitespace-nowrap font-mono tabular-nums text-stone-700">
        {normalizeNumberToken(match[0])}
      </span>,
    );
    cursor = start + match[0].length;
    previousEnd = cursor;
  });
  parts.push(addTrailingLabelSpacing(separateNumberAndLabel(source.slice(cursor)), source, cursor));
  return <>{parts}</>;
}

export default function StructuredEvidence({ fact }: Props) {
  return (
    <div className="min-w-0 space-y-1.5">
      <div className="flex min-w-0 flex-wrap items-center gap-1.5 text-[10px] text-stone-400">
        <span className="rounded bg-stone-100 px-1.5 py-0.5 text-stone-600">P{fact.anchor.page}</span>
        {fact.anchor.table && <span className="max-w-full truncate">表：{fact.anchor.table}</span>}
        {fact.anchor.chapter && <span className="max-w-full truncate">章节：{fact.anchor.chapter}</span>}
      </div>

      <details className="group min-w-0">
        <summary className="flex cursor-pointer list-none items-center gap-1 text-[10px] text-stone-400 hover:text-cinnabar-700 [&::-webkit-details-marker]:hidden">
          <span>查看证据片段</span>
          <ChevronDown className="h-3 w-3" />
        </summary>
        <p className="mt-1 break-words border-l-2 border-stone-200 pl-2 text-[11px] leading-relaxed text-stone-500">
          {fact.anchor.quote ? <ReadableEvidenceText text={fact.anchor.quote} /> : '未提供原文片段'}
        </p>
      </details>
    </div>
  );
}
