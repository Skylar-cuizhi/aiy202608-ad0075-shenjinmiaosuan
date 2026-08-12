import { useEffect, useRef, useState } from 'react'
import { Group, Panel, Separator } from 'react-resizable-panels'
import { ClipboardPaste, FileJson2, Loader2, Wifi, WifiOff, X } from 'lucide-react'
import TraceReport from '@/sections/TraceReport'
import TraceSourcePanel from '@/sections/TraceSourcePanel'
import {
  BUILTIN_PACKS, demoTracePack, packFromMdOnly, packStats, parseTracePack, TRACE_GRADE_STYLE,
  type TraceGrade, type TracePack, type TraceSource,
} from '@/lib/trace'

const SVC_URL = 'http://127.0.0.1:8787'

function ResizeHandle() {
  return (
    <Separator className="group relative w-1.5 bg-stone-200 transition-colors hover:bg-cinnabar-400">
      <div className="absolute inset-y-0 -left-1 -right-1 cursor-col-resize" />
      <div className="absolute left-1/2 top-1/2 h-8 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-stone-400 group-hover:bg-cinnabar-600" />
    </Separator>
  )
}

type SvcState = 'checking' | 'online' | 'offline'

/** 调研溯源工作台：左侧调研报告，点击引证，右侧弹出网络原文并标红对应句 */
export default function TraceDesk({ onPackTitle }: { onPackTitle?: (t: string) => void }) {
  const [pack, setPack] = useState<TracePack>(demoTracePack)
  const [sel, setSel] = useState<TraceSource | null>(null)
  const [importing, setImporting] = useState(false)
  // 粘贴导入
  const [pasteOpen, setPasteOpen] = useState(false)
  const [pasteMd, setPasteMd] = useState('')
  const [pasteTitle, setPasteTitle] = useState('')
  const [svc, setSvc] = useState<SvcState>('checking')
  const [building, setBuilding] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const fileRef = useRef<HTMLInputElement>(null)
  const stats = packStats(pack)

  useEffect(() => {
    if (!pasteOpen) return
    setSvc('checking')
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), 2000)
    fetch(`${SVC_URL}/health`, { signal: ctrl.signal })
      .then((r) => setSvc(r.ok ? 'online' : 'offline'))
      .catch(() => setSvc('offline'))
      .finally(() => clearTimeout(t))
  }, [pasteOpen])

  useEffect(() => {
    if (!building) return
    const t = setInterval(() => setElapsed((e) => e + 1), 1000)
    return () => clearInterval(t)
  }, [building])

  function applyPack(p: TracePack) {
    setPack(p)
    setSel(null)
    setPasteOpen(false)
    setPasteMd('')
    setPasteTitle('')
    onPackTitle?.(p.title)
  }

  async function importPack(file: File) {
    setImporting(true)
    try {
      applyPack(parseTracePack(await file.text()))
    } catch (err) {
      alert(`导入失败：${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setImporting(false)
    }
  }

  async function buildFromPaste() {
    setBuilding(true)
    setElapsed(0)
    try {
      const resp = await fetch(`${SVC_URL}/build`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: pasteTitle.trim(), reportMd: pasteMd }),
      })
      const data = await resp.json()
      if (!resp.ok) throw new Error(data?.error ?? `HTTP ${resp.status}`)
      applyPack(parseTracePack(JSON.stringify(data)))
    } catch (err) {
      alert(`生成失败：${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setBuilding(false)
    }
  }

  const mdReady = pasteMd.trim().length > 50

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col">
      {/* 工具条 */}
      <div className="flex flex-wrap items-center gap-2 border-b border-stone-200 bg-paper-light px-5 py-2 text-xs">
        <span className="mr-1 max-w-[40vw] truncate font-song text-sm font-semibold text-ink md:max-w-[380px]" title={pack.title}>
          {pack.title}
        </span>
        <span className="rounded-full border border-stone-300 bg-paper px-2.5 py-1 text-stone-600">来源 {stats.total} 个</span>
        <span className="rounded-full border border-emerald-300 bg-emerald-50 px-2.5 py-1 text-emerald-800">原文已获取 {stats.ok}</span>
        <span className="rounded-full border border-amber-300 bg-amber-50 px-2.5 py-1 text-amber-800">未能获取 {stats.fail}（诚实标记）</span>
        <span className="rounded-full border border-stone-300 bg-paper px-2.5 py-1 text-stone-600">锚点定位 {stats.matched}/{stats.anchorTotal}</span>
        <span className="flex items-center gap-1.5 rounded-full border border-stone-300 bg-paper px-2.5 py-1">
          {(['A', 'B', 'C', 'D', 'U'] as TraceGrade[]).map((g) =>
            stats.grades[g] > 0 ? (
              <span key={g} className="flex items-center gap-0.5 text-stone-600" title={`${g} 级：${TRACE_GRADE_STYLE[g].label}`}>
                <span className={`inline-block h-2 w-2 rounded-full ${TRACE_GRADE_STYLE[g].dot}`} />
                {g}×{stats.grades[g]}
              </span>
            ) : null,
          )}
        </span>
        <span className="ml-auto hidden text-stone-400 lg:block">
          点击报告中的〔来源〕标记，右侧弹出原文并<span className="bg-red-200/80 px-1 text-red-900">标红</span>支撑原句
        </span>
        <button
          onClick={() => setPasteOpen(true)}
          className="flex items-center gap-1.5 rounded-md bg-ink px-2.5 py-1 text-xs font-medium text-paper-light transition-colors hover:bg-ink-light"
          title="直接粘贴 GPT / Kimi 深度研究产出的 Markdown 报告"
        >
          <ClipboardPaste className="h-3.5 w-3.5" />
          粘贴报告
        </button>
        <select
          value={BUILTIN_PACKS.findIndex((b) => b.pack === pack)}
          onChange={(e) => {
            const b = BUILTIN_PACKS[Number(e.target.value)]
            if (b) applyPack(b.pack)
          }}
          className="rounded-md border border-stone-300 bg-paper px-2 py-1 text-xs font-medium text-stone-700 outline-none hover:bg-stone-50"
          title="切换内置溯源报告"
        >
          <option value={-1} disabled hidden={BUILTIN_PACKS.some((b) => b.pack === pack)}>
            自定义报告
          </option>
          {BUILTIN_PACKS.map((b, i) => (
            <option key={b.label} value={i}>{b.label}</option>
          ))}
        </select>
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

      {/* 粘贴报告对话框 */}
      {pasteOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-6" onClick={() => !building && setPasteOpen(false)}>
          <div
            className="flex max-h-[86vh] w-[720px] max-w-full flex-col rounded-xl border border-stone-200 bg-paper-light shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-stone-200 px-5 py-3">
              <div className="font-song text-base font-semibold text-ink">粘贴调研报告</div>
              <button
                onClick={() => !building && setPasteOpen(false)}
                className="rounded p-1 text-stone-400 hover:bg-stone-100 hover:text-stone-600"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-3 overflow-y-auto px-5 py-4">
              <p className="text-xs leading-5 text-stone-500">
                把 GPT / Kimi 深度研究产出的 Markdown 报告整段粘贴进来（需保留 <code>[(来源)](URL)</code> 形式的引证）。
                见微会在本机抓取全部来源原文、定位标红句并做可信度分级——数据不出本机。
              </p>
              <input
                value={pasteTitle}
                onChange={(e) => setPasteTitle(e.target.value)}
                placeholder="报告标题（可留空，自动取首个一级标题）"
                className="w-full rounded-md border border-stone-300 bg-paper px-3 py-2 text-sm text-ink outline-none placeholder:text-stone-400 focus:border-cinnabar-500"
              />
              <textarea
                value={pasteMd}
                onChange={(e) => setPasteMd(e.target.value)}
                placeholder="# 调研报告标题&#10;&#10;正文……根据 IDC 数据 [(人民网)](https://……)……"
                className="h-56 w-full resize-none rounded-md border border-stone-300 bg-paper px-3 py-2 font-mono text-xs leading-5 text-ink outline-none placeholder:text-stone-400 focus:border-cinnabar-500"
              />
              <div className="flex items-center gap-2 text-xs">
                {svc === 'checking' && (
                  <span className="flex items-center gap-1.5 text-stone-500"><Loader2 className="h-3.5 w-3.5 animate-spin" /> 正在检测本地管线服务…</span>
                )}
                {svc === 'online' && (
                  <span className="flex items-center gap-1.5 text-emerald-700"><Wifi className="h-3.5 w-3.5" /> 本地管线服务在线（127.0.0.1:8787）</span>
                )}
                {svc === 'offline' && (
                  <span className="flex items-start gap-1.5 text-amber-700">
                    <WifiOff className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <span>
                      本地管线服务未启动。在 reportlens 目录运行
                      <code className="mx-1 rounded bg-stone-200 px-1.5 py-0.5">python3 tools/trace/server.py</code>
                      后即可生成原文标红；或先选择「仅粘贴浏览」。
                    </span>
                  </span>
                )}
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-stone-200 px-5 py-3">
              <button
                onClick={() => mdReady && applyPack(packFromMdOnly(pasteMd.trim()))}
                disabled={!mdReady || building}
                className="rounded-md border border-stone-300 px-3.5 py-1.5 text-sm text-stone-700 transition-colors hover:bg-stone-100 disabled:opacity-50"
                title="不抓取原文，仅展示报告与引证标记"
              >
                仅粘贴浏览
              </button>
              <button
                onClick={buildFromPaste}
                disabled={!mdReady || svc !== 'online' || building}
                className="flex items-center gap-1.5 rounded-md bg-cinnabar-600 px-3.5 py-1.5 text-sm font-medium text-white transition-colors hover:bg-cinnabar-700 disabled:opacity-50"
                title={svc === 'online' ? '抓取全部来源原文并定位标红句（大报告约 1–3 分钟）' : '需先启动本地管线服务'}
              >
                {building ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    正在抓取原文… {elapsed}s
                  </>
                ) : (
                  '生成原文标红（推荐）'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 报告 + 原文面板：桌面端左右分栏；移动端报告全屏、原文以全屏抽屉弹出 */}
      <div className="hidden min-h-0 flex-1 md:block">
        <Group orientation="horizontal" className="h-full">
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
      <div className="min-h-0 flex-1 overflow-y-auto bg-paper px-4 py-4 md:hidden">
        <TraceReport reportMd={pack.reportMd} sources={pack.sources} onSelect={setSel} />
      </div>
      {sel && (
        <div className="fixed inset-0 z-40 bg-paper-light md:hidden">
          <TraceSourcePanel source={sel} onClose={() => setSel(null)} />
        </div>
      )}
    </div>
  )
}
