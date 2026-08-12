import { X, ExternalLink, AlertTriangle, FileText, CheckCircle2 } from 'lucide-react'
import { TRACE_GRADE_STYLE, type TraceSource } from '@/lib/trace'

function Passage({ before, hit, after }: { before: string[]; hit: string; after: string[] }) {
  return (
    <div className="rounded-lg border border-stone-200 bg-[#FDFBF5] px-4 py-3 text-[15px] leading-7">
      {before.map((s, i) => (
        <p key={`b${i}`} className="text-stone-400">{s}</p>
      ))}
      <p className="my-1">
        <mark className="box-decoration-clone rounded bg-red-200/80 px-1 py-0.5 font-medium text-red-900">{hit}</mark>
      </p>
      {after.map((s, i) => (
        <p key={`a${i}`} className="text-stone-400">{s}</p>
      ))}
    </div>
  )
}

/** 溯源原文面板：展示某来源的原文，标红支撑报告主张的原句；获取失败诚实标注 */
export default function TraceSourcePanel({ source, onClose }: { source: TraceSource; onClose: () => void }) {
  const matchedCount = source.anchors.filter((a) => a.matched).length
  return (
    <div className="flex h-full flex-col bg-paper-light">
      <header className="border-b border-stone-200 px-5 pb-4 pt-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className={`rounded px-1.5 py-0.5 text-xs font-semibold ${TRACE_GRADE_STYLE[source.grade].badge}`}>
                {source.grade} 级 · {TRACE_GRADE_STYLE[source.grade].label}
              </span>
              <span className="text-xs text-stone-400">{source.id}</span>
            </div>
            <h2 className="mt-2 truncate font-song text-lg font-semibold text-ink">{source.name}</h2>
            {source.title && source.title !== source.name && (
              <p className="mt-1 line-clamp-2 text-xs text-stone-500">{source.title}</p>
            )}
          </div>
          <button onClick={onClose} className="rounded-md p-1.5 text-stone-400 hover:bg-stone-100 hover:text-stone-700" title="关闭原文面板">
            <X size={18} />
          </button>
        </div>
        <div className="mt-3 space-y-1 text-xs text-stone-500">
          <a href={source.url} target="_blank" rel="noreferrer" className="flex items-center gap-1 break-all text-sky-700 hover:underline">
            <ExternalLink size={12} className="shrink-0" /> {source.url}
          </a>
          <p>
            {source.date ? `发布日期 ${source.date} · ` : '发布日期不明 · '}
            评级依据：{source.gradeReason}
          </p>
          {source.status === 'ok' && (
            <p className="flex items-center gap-1 text-emerald-700">
              <FileText size={12} /> 原文已获取（{source.textLen.toLocaleString()} 字）· 命中 {matchedCount}/{source.anchors.length} 处主张
            </p>
          )}
        </div>
      </header>

      <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
        {source.status === 'fail' && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">
            <p className="flex items-center gap-1.5 font-medium"><AlertTriangle size={15} /> 原文未能获取</p>
            <p className="mt-1 text-amber-800">原因：{source.failReason}。该来源的 {source.anchors.length} 处引证暂无法回溯到原文，相关结论请人工核实。</p>
          </div>
        )}

        {source.anchors.map((a, i) => (
          <section key={i}>
            <p className="mb-1.5 text-xs font-medium text-stone-500">
              <span className="mr-1 inline-block rounded bg-stone-200 px-1.5 py-0.5 text-stone-600">报告主张 {i + 1}</span>
              {a.claim.length > 90 ? a.claim.slice(0, 90) + '…' : a.claim}
            </p>
            {a.matched ? (
              <Passage before={a.before} hit={a.hit} after={a.after} />
            ) : (
              source.status === 'ok' && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                  <p className="flex items-center gap-1.5"><AlertTriangle size={14} /> {a.note || '未定位到精确对应句'}</p>
                  {a.before.length > 0 && <p className="mt-2 text-xs text-stone-500">原文开头：{a.before[0].slice(0, 120)}…</p>}
                </div>
              )
            )}
          </section>
        ))}

        {source.status === 'ok' && matchedCount > 0 && (
          <p className="flex items-center gap-1.5 pt-1 text-xs text-stone-400">
            <CheckCircle2 size={13} className="text-emerald-600" />
            标红句为程序在原文中定位的对应句，上下文各取两句；匹配可能有偏差，请以上下游原文为准。
          </p>
        )}
      </div>
    </div>
  )
}
