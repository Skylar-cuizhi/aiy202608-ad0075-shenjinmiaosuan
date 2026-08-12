import { useMemo } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { TRACE_GRADE_STYLE, type TraceSource } from '@/lib/trace'

/** 去掉文末来源列表区（形如 " [(x)](url) : url" 的行），正文保留内联引证 */
function stripSourceList(md: string): string {
  return md
    .split('\n')
    .filter((line) => !/^\s*\[\([^)]*\)\]\([^)]*\)\s*:\s*https?:\/\//.test(line))
    .join('\n')
    .replace(/---\n\s*$/, '')
}

interface Props {
  reportMd: string
  sources: TraceSource[]
  onSelect: (s: TraceSource) => void
}

/** 调研报告阅读器：正文内联引证渲染为可点击的溯源标记（带可信度彩点） */
export default function TraceReport({ reportMd, sources, onSelect }: Props) {
  const md = useMemo(() => stripSourceList(reportMd), [reportMd])
  const byUrl = useMemo(() => Object.fromEntries(sources.map((s) => [s.url, s])), [sources])

  return (
    <article className="mx-auto max-w-[860px] rounded-xl border border-stone-200 bg-paper-light px-10 py-10 shadow-sm">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => (
            <h1 className="mb-6 border-b-2 border-cinnabar-600 pb-4 font-song text-3xl font-bold text-ink">{children}</h1>
          ),
          h2: ({ children }) => <h2 className="mb-4 mt-10 font-song text-2xl font-bold text-ink">{children}</h2>,
          h3: ({ children }) => (
            <h3 className="mb-3 mt-7 border-l-4 border-cinnabar-600 pl-3 font-song text-lg font-semibold text-stone-800">{children}</h3>
          ),
          p: ({ children }) => <p className="mb-4 text-[15.5px] leading-8 text-stone-700">{children}</p>,
          strong: ({ children }) => <strong className="font-semibold text-cinnabar-800">{children}</strong>,
          hr: () => <hr className="my-8 border-stone-200" />,
          blockquote: ({ children }) => (
            <blockquote className="my-4 rounded-r-lg border-l-4 border-stone-300 bg-stone-50 px-4 py-2 text-sm text-stone-500">{children}</blockquote>
          ),
          table: ({ children }) => (
            <div className="my-5 overflow-x-auto rounded-lg border border-stone-200">
              <table className="w-full border-collapse text-sm">{children}</table>
            </div>
          ),
          th: ({ children }) => <th className="border-b border-stone-200 bg-stone-100 px-3 py-2 text-left font-semibold text-stone-700">{children}</th>,
          td: ({ children }) => <td className="border-b border-stone-100 px-3 py-2 align-top leading-6 text-stone-600">{children}</td>,
          img: ({ src, alt }) => (
            <span className="my-5 block">
              <img
                src={src}
                alt={alt ?? ''}
                className="w-full rounded-lg border border-stone-200 shadow-sm"
                onError={(e) => {
                  const wrap = (e.target as HTMLImageElement).closest('span')
                  if (wrap) (wrap as HTMLElement).style.display = 'none' // 配图缺失时整块隐藏，不留破图
                }}
              />
              {alt && <span className="mt-1.5 block text-center text-xs text-stone-400">{alt}</span>}
            </span>
          ),
          a: ({ href, children }) => {
            const text = String(children ?? '')
            const m = text.match(/^\(([^)]{1,40})\)$/)
            const src = href ? byUrl[href] : undefined
            if (m && src) {
              return (
                <button
                  onClick={() => onSelect(src)}
                  title={`${src.grade} 级来源 · 点击查看原文标红`}
                  className="mx-0.5 inline-flex translate-y-[-1px] items-center gap-1 rounded border border-stone-300 bg-paper px-1.5 py-px align-baseline text-[12.5px] text-stone-600 transition-colors hover:border-cinnabar-500 hover:bg-cinnabar-50 hover:text-cinnabar-800"
                >
                  <span className={`inline-block h-1.5 w-1.5 rounded-full ${TRACE_GRADE_STYLE[src.grade].dot}`} />
                  {m[1]}
                </button>
              )
            }
            return (
              <a href={href} target="_blank" rel="noreferrer" className="text-sky-700 hover:underline">
                {children}
              </a>
            )
          },
        }}
      >
        {md}
      </ReactMarkdown>
    </article>
  )
}
