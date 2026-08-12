import { useRef, useState } from 'react'
import { Group, Panel, Separator } from 'react-resizable-panels'
import { FileJson2, Loader2 } from 'lucide-react'
import TraceReport from '@/sections/TraceReport'
import TraceSourcePanel from '@/sections/TraceSourcePanel'
import {
  demoTracePack, packStats, parseTracePack, TRACE_GRADE_STYLE,
  type TraceGrade, type TracePack, type TraceSource,
} from '@/lib/trace'

function ResizeHandle() {
  return (
    <Separator className="group relative w-1.5 bg-stone-200 transition-colors hover:bg-cinnabar-400">
      <div className="absolute inset-y-0 -left-1 -right-1 cursor-col-resize" />
      <div className="absolute left-1/2 top-1/2 h-8 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-stone-400 group-hover:bg-cinnabar-600" />
    </Separator>
  )
}

/** 调研溯源工作台：左侧调研报告，点击引证，右侧弹出网络原文并标红对应句 */
export default function TraceDesk({ onPackTitle }: { onPackTitle?: (t: string) => void }) {
  const [pack, setPack] = useState<TracePack>(demoTracePack)
  const [sel, setSel] = useState<TraceSource | null>(null)
  const [importing, setImporting] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const stats = packStats(pack)

  async function importPack(file: File) {
    setImporting(true)
    try {
      const p = parseTracePack(await file.text())
      setPack(p)
      setSel(null)
      onPackTitle?.(p.title)
    } catch (err) {
      alert(`导入失败：${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setImporting(false)
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col">
      {/* 工具条 */}
      <div className="flex flex-wrap items-center gap-2 border-b border-stone-200 bg-paper-light px-5 py-2 text-xs">
        <span className="mr-1 max-w-[380px] truncate font-song text-sm font-semibold text-ink" title={pack.title}>
          {pack.title}
        </span>
        <span className="rounded-full border border-stone-300 bg-paper px-2.5 py-1 text-stone-600">来源 {stats.total} 个</span>
        <span className="rounded-full border border-emerald-300 bg-emerald-50 px-2.5 py-1 text-emerald-800">原文已获取 {stats.ok}</span>
        <span className="rounded-full border border-amber-300 bg-amber-50 px-2.5 py-1 text-amber-800">未能获取 {stats.fail}（诚实标记）</span>
        <span className="rounded-full border border-stone-300 bg-paper px-2.5 py-1 text-stone-600">锚点定位 {stats.matched}/{stats.anchorTotal}</span>
        <span className="flex items-center gap-1.5 rounded-full border border-stone-300 bg-paper px-2.5 py-1">
          {(['A', 'B', 'C', 'D'] as TraceGrade[]).map((g) => (
            <span key={g} className="flex items-center gap-0.5 text-stone-600" title={`${g} 级：${TRACE_GRADE_STYLE[g].label}`}>
              <span className={`inline-block h-2 w-2 rounded-full ${TRACE_GRADE_STYLE[g].dot}`} />
              {g}×{stats.grades[g]}
            </span>
          ))}
        </span>
        <span className="ml-auto hidden text-stone-400 lg:block">
          点击报告中的〔来源〕标记，右侧弹出原文并<span className="bg-red-200/80 px-1 text-red-900">标红</span>支撑原句
        </span>
        <button
          onClick={() => fileRef.current?.click()}
          disabled={importing}
          className="flex items-center gap-1.5 rounded-md border border-stone-300 px-2.5 py-1 text-xs font-medium text-stone-700 transition-colors hover:bg-stone-100 disabled:opacity-50"
          title="导入由 tools/trace 管线生成的溯源包 JSON"
        >
          {importing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileJson2 className="h-3.5 w-3.5" />}
          导入溯源包
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) importPack(f)
            e.target.value = ''
          }}
        />
      </div>

      {/* 报告 + 原文面板 */}
      <Group orientation="horizontal" className="min-h-0 flex-1">
        <Panel defaultSize={sel ? '62%' : '100%'} minSize="35%">
          <div className="h-full overflow-y-auto bg-paper px-6 py-6">
            <TraceReport reportMd={pack.reportMd} sources={pack.sources} onSelect={setSel} />
          </div>
        </Panel>
        {sel && (
          <>
            <ResizeHandle />
            <Panel defaultSize="38%" minSize="24%" maxSize="55%">
              <TraceSourcePanel source={sel} onClose={() => setSel(null)} />
            </Panel>
          </>
        )}
      </Group>
    </div>
  )
}
