import { useState } from 'react'
import { X, ExternalLink, AlertTriangle, FileText, CheckCircle2, RefreshCw, ClipboardPaste, Loader2 } from 'lucide-react'
import { refetchSource, sourceFromText, TRACE_GRADE_STYLE, type TraceSource } from '@/lib/trace'

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

/** 溯源原文面板：展示某来源的原文，标红支撑报告主张的原句；获取失败诚实标注，并可原地补抓 */
export default function TraceSourcePanel({
  source,
  onClose,
  onPatch,
}: {
  source: TraceSource
  onClose: () => void
  onPatch?: (s: TraceSource) => void
}) {
  const matchedCount = source.anchors.filter((a) => a.matched).length
  const [fixing, setFixing] = useState(false)
  const [fixErr, setFixErr] = useState('')
  const [manualOpen, setManualOpen] = useState(false)
  const [manualText, setManualText] = useState('')

  async function handleRefetch() {
    if (!onPatch) return
    setFixing(true)
    setFixErr('')
    try {
      const next = await refetchSource(source)
      onPatch(next)
      if (next.status === 'fail') setFixErr('自动补抓未成功，可改用下方手动补录')
    } catch (err) {
      // 本地管线服务离线 → 降级为手动补录
      setFixErr('本地管线服务离线（python3 tools/trace/server.py），已切换为手动补录')
      setManualOpen(true)
    } finally {
      setFixing(false)
    }
  }

  function mergeText(text: string, how: string) {
    const t = text.trim()
    if (t.length < 200) {
      setFixErr(`内容过短（${t.length} 字）——请在原文页 ⌘A 全选、⌘C 复制后再试`)
      return
    }
    onPatch?.(sourceFromText(source, t, how))
    setManualOpen(false)
    setManualText('')
    setFixErr('')
  }

  async function readClipboard() {
    setFixErr('')
    try {
      mergeText(await navigator.clipboard.readText(), '手动补录（剪贴板）')
    } catch {
      setFixErr('读取剪贴板失败（浏览器权限限制）——请把原文直接粘贴到下方文本框')
    }
  }

  const fixBlock = onPatch && (
    <div className="mt-3 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={handleRefetch}
          disabled={fixing}
          className="flex items-center gap-1.5 rounded-md bg-cinnabar-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-cinnabar-700 disabled:opacity-60"
          title="本地管线服务先直连重试，失败则自动驱动本机真实浏览器抓取（标签归入「见微·溯源补抓」组）"
        >
          {fixing ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
          {fixing ? '补抓中（浏览器自动抓取，约 10–30 秒）…' : '补抓原文'}
        </button>
        <button
          onClick={() => { setManualOpen(true); setFixErr('') }}
          className="flex items-center gap-1.5 rounded-md border border-stone-300 px-3 py-1.5 text-xs font-medium text-stone-600 transition-colors hover:bg-stone-100"
          title="打开原文页手动复制全文，见微负责定位标红与分级"
        >
          <ClipboardPaste size={13} />
          手动补录
        </button>
      </div>
      {fixErr && <p className="text-xs leading-5 text-amber-700">{fixErr}</p>}
    </div>
  )

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
          {source.provenance && (
            <p className="text-sky-700">{source.provenance}</p>
          )}
        </div>
      </header>

      <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
        {source.status === 'fail' && source.anchors.length === 0 && (
          <div className="rounded-lg border border-stone-300 bg-stone-50 px-4 py-3 text-sm leading-6 text-stone-600">
            <p className="flex items-center gap-1.5 font-medium"><AlertTriangle size={15} /> 暂无原文锚点数据</p>
            <p className="mt-1">这是「粘贴浏览」模式下的占位来源，尚未核验。可直接补抓原文，见微会定位标红句并做可信度分级。</p>
            {fixBlock}
          </div>
        )}
        {source.status === 'fail' && source.anchors.length > 0 && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">
            <p className="flex items-center gap-1.5 font-medium"><AlertTriangle size={15} /> 原文未能获取</p>
            <p className="mt-1 text-amber-800">原因：{source.failReason}。该来源的 {source.anchors.length} 处引证暂无法回溯到原文，相关结论请人工核实。</p>
            {fixBlock}
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

      {/* 手动补录对话框：打开原文页 → 复制 → 见微完成定位/分级/合并 */}
      {manualOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-6" onClick={() => setManualOpen(false)}>
          <div
            className="w-[560px] max-w-full rounded-xl border border-stone-200 bg-paper-light shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-stone-200 px-5 py-3">
              <div className="font-song text-base font-semibold text-ink">手动补录 · {source.name}</div>
              <button onClick={() => setManualOpen(false)} className="rounded p-1 text-stone-400 hover:bg-stone-100 hover:text-stone-600">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-3 px-5 py-4 text-xs leading-6 text-stone-600">
              <ol className="list-decimal space-y-1.5 pl-4">
                <li>点「打开原文页」，等页面完整加载（如遇人机验证请正常通过）</li>
                <li>在原文页 <kbd className="rounded bg-stone-200 px-1">⌘A</kbd> 全选、<kbd className="rounded bg-stone-200 px-1">⌘C</kbd> 复制</li>
                <li>回到见微，点「从剪贴板读取」——定位标红与可信度分级由见微自动完成</li>
              </ol>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => window.open(source.url, '_blank', 'noopener')}
                  className="flex items-center gap-1.5 rounded-md border border-stone-300 px-3 py-1.5 font-medium text-stone-700 hover:bg-stone-100"
                >
                  <ExternalLink size={13} /> 打开原文页
                </button>
                <button
                  onClick={readClipboard}
                  className="flex items-center gap-1.5 rounded-md bg-cinnabar-600 px-3 py-1.5 font-medium text-white hover:bg-cinnabar-700"
                >
                  <ClipboardPaste size={13} /> 从剪贴板读取
                </button>
              </div>
              <textarea
                value={manualText}
                onChange={(e) => setManualText(e.target.value)}
                placeholder="浏览器权限受限时，也可以把原文全文直接粘贴到这里"
                className="h-28 w-full resize-none rounded-md border border-stone-300 bg-paper px-3 py-2 font-mono text-xs leading-5 text-ink outline-none placeholder:text-stone-400 focus:border-cinnabar-500"
              />
              {fixErr && <p className="text-amber-700">{fixErr}</p>}
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-stone-200 px-5 py-3">
              <button onClick={() => setManualOpen(false)} className="rounded-md border border-stone-300 px-3.5 py-1.5 text-sm text-stone-700 hover:bg-stone-100">
                取消
              </button>
              <button
                onClick={() => mergeText(manualText, '手动补录（页面粘贴）')}
                disabled={manualText.trim().length < 200}
                className="rounded-md bg-cinnabar-600 px-3.5 py-1.5 text-sm font-medium text-white hover:bg-cinnabar-700 disabled:opacity-50"
              >
                合并粘贴的原文
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
