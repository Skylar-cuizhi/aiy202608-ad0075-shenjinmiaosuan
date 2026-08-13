import { useMemo, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import {
  ArrowRight, BookOpen, Brain, CheckCircle2, ExternalLink, HelpCircle, Lightbulb,
  Lock, PenLine, RefreshCw, Sparkles, Star, Swords, Trophy, X,
} from 'lucide-react'
import niduData from '@/data/nidu/glasses-15y.json'
import { glasses15yTracePack, TRACE_GRADE_STYLE } from '@/lib/trace'
import {
  DIM_HINTS, DIM_LABELS, loadProgress, playbookStats, saveProgress, sliceSection,
  type NiduMap, type NiduProgress, type NiduSection,
} from '@/lib/nidu'

const niduMap = niduData as unknown as NiduMap
const pack = glasses15yTracePack

/** 左侧原文渲染：精简 markdown，图片缺失自动隐藏，引证链接新窗口打开 */
function SourceText({ md }: { md: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        h2: ({ children }) => <h2 className="mb-3 font-song text-xl font-bold text-ink">{children}</h2>,
        h3: ({ children }) => <h3 className="mb-2 mt-5 font-song text-base font-semibold text-ink">{children}</h3>,
        p: ({ children }) => <p className="mb-3 text-[15px] leading-7 text-stone-700">{children}</p>,
        blockquote: ({ children }) => (
          <div className="my-3 rounded-r-lg border-l-2 border-cinnabar-400 bg-cinnabar-50/60 px-4 py-2 text-sm leading-6 text-stone-600 [&_p]:mb-1">{children}</div>
        ),
        table: ({ children }) => (
          <div className="my-3 overflow-x-auto rounded-lg border border-stone-200">
            <table className="w-full border-collapse text-xs">{children}</table>
          </div>
        ),
        th: ({ children }) => <th className="border-b border-stone-200 bg-stone-100 px-2 py-1.5 text-left font-semibold text-stone-700">{children}</th>,
        td: ({ children }) => <td className="border-b border-stone-100 px-2 py-1.5 align-top leading-5 text-stone-600">{children}</td>,
        img: () => null,
        a: ({ href, children }) => (
          <a href={href} target="_blank" rel="noreferrer" className="text-sky-700 underline decoration-sky-300 underline-offset-2 hover:decoration-sky-600">
            {children}
          </a>
        ),
        hr: () => null,
      }}
    >
      {md}
    </ReactMarkdown>
  )
}

function Dots({ value, onPick }: { value: number; onPick?: (v: number) => void }) {
  return (
    <span className="inline-flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <button
          key={i}
          disabled={!onPick}
          onClick={() => onPick?.(i)}
          className={onPick ? 'transition-transform hover:scale-125' : 'cursor-default'}
        >
          <Star
            className={`h-4 w-4 ${i <= value ? 'fill-amber-400 text-amber-500' : 'text-stone-300'}`}
          />
        </button>
      ))}
    </span>
  )
}

/** 逆读工作台：左原文 / 中作者思维地图 / 右我的理解（Commitment Gate 先猜后看） */
export default function NiduDesk() {
  const [secId, setSecId] = useState(niduMap.sections[0].id)
  const [progress, setProgress] = useState<NiduProgress>(() => loadProgress())
  const [draft, setDraft] = useState('')
  const [teachBack, setTeachBack] = useState('')
  const [scores, setScores] = useState<[number, number, number, number]>([0, 0, 0, 0])
  const [playbookOpen, setPlaybookOpen] = useState(false)
  const [mobileTab, setMobileTab] = useState<'text' | 'map' | 'mine'>('text')

  const sec: NiduSection = niduMap.sections.find((s) => s.id === secId) ?? niduMap.sections[0]
  const rec = progress[sec.id]
  const unlocked = !!rec
  const stats = useMemo(() => playbookStats(niduMap, progress), [progress])
  const secMd = useMemo(() => sliceSection(pack.reportMd, sec.heading), [sec])
  const srcById = useMemo(() => new Map(pack.sources.map((s) => [s.id, s])), [])

  function pickSection(id: string) {
    setSecId(id)
    setDraft(progress[id]?.prediction ?? '')
    setTeachBack(progress[id]?.teachBack ?? '')
    setScores(progress[id]?.scores ?? [0, 0, 0, 0])
    setMobileTab('text')
  }

  function commitGate() {
    if (draft.trim().length < 5) return
    const next: NiduProgress = { ...progress, [sec.id]: { prediction: draft.trim(), teachBack: '', scores: [0, 0, 0, 0], doneAt: new Date().toISOString() } }
    setProgress(next)
    saveProgress(next)
    setMobileTab('map')
  }

  function finishSection() {
    const next: NiduProgress = {
      ...progress,
      [sec.id]: { prediction: rec?.prediction ?? draft.trim(), teachBack: teachBack.trim(), scores, doneAt: new Date().toISOString() },
    }
    setProgress(next)
    saveProgress(next)
  }

  const colMap = (
    <div className="flex h-full flex-col overflow-y-auto bg-paper-light px-4 py-4">
      {!unlocked ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
          <Lock className="h-8 w-8 text-stone-300" />
          <p className="max-w-[240px] text-sm leading-6 text-stone-500">
            作者思维地图已上锁。<br />先在「我的理解」里提交你的猜想，<br />再来看作者真正怎么做。
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="rounded-lg border border-violet-200 bg-violet-50 px-4 py-3">
            <p className="flex items-center gap-1.5 text-xs font-semibold text-violet-700"><HelpCircle className="h-3.5 w-3.5" /> 本章作者在回答的问题</p>
            <p className="mt-1.5 text-sm font-medium leading-6 text-violet-900">{sec.question}</p>
          </div>
          {sec.claims.map((c, i) => (
            <div key={i} className="rounded-lg border border-stone-200 bg-paper px-4 py-3">
              <p className="text-sm font-semibold leading-6 text-ink">
                <span className="mr-1.5 rounded bg-ink px-1.5 py-0.5 text-[10px] font-medium text-paper-light">判断 {i + 1}</span>
                {c.text}
              </p>
              <div className="mt-2.5 space-y-2 border-l-2 border-stone-200 pl-3">
                {c.evidence.map((e, j) => {
                  const src = e.sourceId ? srcById.get(e.sourceId) : null
                  return (
                    <div key={j} className="rounded-md bg-[#FDFBF5] px-3 py-2">
                      <p className="text-xs leading-5 text-stone-600">“{e.quote}”</p>
                      <p className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-stone-400">
                        {src ? (
                          <a
                            href={src.url}
                            target="_blank"
                            rel="noreferrer"
                            className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-medium ${TRACE_GRADE_STYLE[src.grade].badge}`}
                            title={`${src.grade} 级 · 点击打开来源原文`}
                          >
                            {src.name} <ExternalLink className="h-2.5 w-2.5" />
                          </a>
                        ) : (
                          <span className="rounded bg-stone-200 px-1.5 py-0.5 font-medium text-stone-500">作者框架</span>
                        )}
                        {e.note}
                      </p>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
          <div className="rounded-lg border border-stone-200 bg-paper px-4 py-3">
            <p className="flex items-center gap-1.5 text-xs font-semibold text-stone-600"><Brain className="h-3.5 w-3.5" /> 推理机制（Warrant）</p>
            <p className="mt-1 text-xs leading-5 text-stone-600">{sec.warrant}</p>
          </div>
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
            <p className="flex items-center gap-1.5 text-xs font-semibold text-amber-700"><Swords className="h-3.5 w-3.5" /> 边界与反证（Limitation）</p>
            <p className="mt-1 text-xs leading-5 text-amber-800">{sec.limitation}</p>
          </div>
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3">
            <p className="flex items-center gap-1.5 text-xs font-semibold text-emerald-700"><Lightbulb className="h-3.5 w-3.5" /> 写作动作（可以偷走的一招）</p>
            <p className="mt-1 text-xs leading-5 text-emerald-800">{sec.writingMove}</p>
          </div>
        </div>
      )}
    </div>
  )

  const colMine = (
    <div className="flex h-full flex-col overflow-y-auto bg-paper px-4 py-4">
      <div className="rounded-lg border border-cinnabar-300 bg-cinnabar-50/70 px-4 py-3">
        <p className="flex items-center gap-1.5 text-xs font-semibold text-cinnabar-700"><PenLine className="h-3.5 w-3.5" /> 我猜作者想干什么（Commitment Gate）</p>
        <p className="mt-1 text-xs leading-5 text-cinnabar-900/80">{sec.gatePrompt}</p>
      </div>
      {!unlocked ? (
        <div className="mt-3 space-y-3">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="写下你的猜想：作者这一章的目的是……（至少 5 个字，提交后才能看到答案）"
            className="h-32 w-full resize-none rounded-md border border-stone-300 bg-paper-light px-3 py-2 text-sm leading-6 text-ink outline-none placeholder:text-stone-400 focus:border-cinnabar-500"
          />
          <button
            onClick={commitGate}
            disabled={draft.trim().length < 5}
            className="flex w-full items-center justify-center gap-1.5 rounded-md bg-cinnabar-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-cinnabar-700 disabled:opacity-40"
          >
            提交猜想，解锁「作者真正怎么做」 <ArrowRight className="h-4 w-4" />
          </button>
          <p className="text-center text-[11px] leading-4 text-stone-400">先承诺一个答案再揭晓——预测与实际的差异，就是训练点</p>
        </div>
      ) : (
        <div className="mt-3 space-y-3">
          <div className="rounded-lg border border-stone-200 bg-paper-light px-4 py-3">
            <p className="text-[11px] font-semibold text-stone-400">你的预测</p>
            <p className="mt-1 text-sm leading-6 text-stone-700">{rec.prediction}</p>
          </div>
          <div className="rounded-lg border border-stone-200 bg-paper-light px-4 py-3">
            <p className="flex items-center gap-1 text-[11px] font-semibold text-emerald-600"><CheckCircle2 className="h-3 w-3" /> 作者实际动作</p>
            <p className="mt-1 text-sm leading-6 text-stone-700">{sec.authorIntent}</p>
          </div>
          <div className="rounded-lg border border-violet-200 bg-violet-50 px-4 py-3">
            <p className="flex items-center gap-1 text-[11px] font-semibold text-violet-600"><Sparkles className="h-3 w-3" /> 教练点评（差异即训练点）</p>
            <p className="mt-1 text-xs leading-5 text-violet-900">{sec.coach}</p>
          </div>
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3">
            <p className="flex items-center gap-1 text-[11px] font-semibold text-red-600"><Swords className="h-3 w-3" /> 挑战问题（别急着总结）</p>
            <p className="mt-1 text-xs leading-5 text-red-900">{sec.challenge}</p>
          </div>
          <div className="rounded-lg border border-stone-200 bg-paper-light px-4 py-3">
            <p className="flex items-center gap-1 text-[11px] font-semibold text-stone-500"><RefreshCw className="h-3 w-3" /> Teach Back：你重新讲一遍</p>
            <p className="mt-1 text-[11px] leading-4 text-stone-400">{sec.teachBack}</p>
            <textarea
              value={teachBack}
              onChange={(e) => setTeachBack(e.target.value)}
              placeholder="用自己的话复述……"
              className="mt-2 h-24 w-full resize-none rounded-md border border-stone-300 bg-paper px-3 py-2 text-sm leading-6 text-ink outline-none placeholder:text-stone-400 focus:border-cinnabar-500"
            />
          </div>
          <div className="rounded-lg border border-stone-200 bg-paper-light px-4 py-3">
            <p className="text-[11px] font-semibold text-stone-500">本节四维自评</p>
            <div className="mt-2 space-y-1.5">
              {DIM_LABELS.map((label, i) => (
                <div key={label} className="flex items-center justify-between gap-2" title={DIM_HINTS[i]}>
                  <span className="text-xs text-stone-600">{label}</span>
                  <Dots value={scores[i]} onPick={(v) => setScores((s) => { const n = [...s] as typeof s; n[i] = v; return n })} />
                </div>
              ))}
            </div>
            <button
              onClick={finishSection}
              disabled={scores.some((s) => s === 0)}
              className="mt-3 w-full rounded-md bg-ink px-3 py-2 text-sm font-medium text-paper-light transition-colors hover:bg-ink-light disabled:opacity-40"
            >
              完成本节，计入我的 Playbook
            </button>
          </div>
        </div>
      )}
    </div>
  )

  const colText = (
    <div className="h-full overflow-y-auto bg-paper px-5 py-4">
      <p className="mb-3 flex items-center gap-1.5 text-[11px] font-medium text-stone-400">
        <BookOpen className="h-3 w-3" /> 原文 · {niduMap.reportTitle}
      </p>
      <SourceText md={secMd} />
    </div>
  )

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col">
      {/* 工具条 */}
      <div className="flex flex-wrap items-center gap-2 border-b border-stone-200 bg-paper-light px-4 py-2 text-xs">
        <span className="font-song text-sm font-semibold text-ink">逆读 · 作者思维训练</span>
        <span className="rounded-full border border-stone-300 bg-paper px-2.5 py-1 text-stone-600">
          {stats.doneCount}/{stats.total} 节已完成
        </span>
        <div className="flex flex-wrap items-center gap-1">
          {niduMap.sections.map((s) => (
            <button
              key={s.id}
              onClick={() => pickSection(s.id)}
              className={`flex items-center gap-1 rounded-full border px-2.5 py-1 font-medium transition-colors ${
                s.id === secId
                  ? 'border-cinnabar-500 bg-cinnabar-50 text-cinnabar-700'
                  : 'border-stone-300 text-stone-500 hover:bg-stone-100'
              }`}
              title={s.shortTitle}
            >
              {progress[s.id] ? <CheckCircle2 className="h-3 w-3 text-emerald-600" /> : <span className="text-stone-300">○</span>}
              {s.id.replace('ch', '第') + '章'}
            </button>
          ))}
        </div>
        <button
          onClick={() => setPlaybookOpen(true)}
          className="flex items-center gap-1.5 rounded-md border border-amber-300 bg-amber-50 px-2.5 py-1 font-medium text-amber-800 transition-colors hover:bg-amber-100 lg:ml-auto"
        >
          <Trophy className="h-3.5 w-3.5" /> 我的 Playbook
        </button>
      </div>

      {/* 桌面三栏 */}
      <div className="hidden min-h-0 flex-1 lg:grid lg:grid-cols-[minmax(0,5fr)_minmax(0,4fr)_minmax(0,4fr)]">
        <div className="min-h-0 border-r border-stone-200">{colText}</div>
        <div className="min-h-0 border-r border-stone-200">{colMap}</div>
        <div className="min-h-0">{colMine}</div>
      </div>

      {/* 移动端：单栏三步切换 */}
      <div className="flex min-h-0 flex-1 flex-col lg:hidden">
        <div className="flex border-b border-stone-200 bg-paper-light text-xs">
          {([['text', '① 读原文'], ['map', '② 思维地图'], ['mine', '③ 我的理解']] as const).map(([k, label]) => (
            <button
              key={k}
              onClick={() => setMobileTab(k)}
              className={`flex-1 border-b-2 px-2 py-2.5 font-medium transition-colors ${
                mobileTab === k ? 'border-cinnabar-600 text-cinnabar-700' : 'border-transparent text-stone-500'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="min-h-0 flex-1">{mobileTab === 'text' ? colText : mobileTab === 'map' ? colMap : colMine}</div>
      </div>

      {/* Playbook 抽屉 */}
      {playbookOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-5" onClick={() => setPlaybookOpen(false)}>
          <div
            className="max-h-[86vh] w-[640px] max-w-full overflow-y-auto rounded-xl border border-stone-200 bg-paper-light p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="flex items-center gap-2 font-song text-lg font-semibold text-ink"><Trophy className="h-5 w-5 text-amber-500" /> 我的 Research Writing Playbook</h3>
              <button onClick={() => setPlaybookOpen(false)} className="rounded p-1 text-stone-400 hover:bg-stone-100"><X className="h-4 w-4" /></button>
            </div>
            <p className="mt-1 text-xs leading-5 text-stone-500">
              逆读不是帮你少读——读得越多，这里沉淀的论证元素与写作动作越多，最后长成你自己的研究写作手册。
            </p>
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                ['已识别判断 Claim', stats.claims],
                ['已识别证据 Evidence', stats.evidence],
                ['推理机制 Warrant', stats.warrants],
                ['边界 Qualification', stats.qualifications],
              ].map(([label, v]) => (
                <div key={label as string} className="rounded-lg border border-stone-200 bg-paper px-3 py-3 text-center">
                  <div className="font-song text-2xl font-bold text-ink">{v}</div>
                  <div className="mt-1 text-[10px] leading-3 text-stone-500">{label}</div>
                </div>
              ))}
            </div>
            <div className="mt-4 rounded-lg border border-stone-200 bg-paper px-4 py-3">
              <p className="text-xs font-semibold text-stone-600">四维能力均分</p>
              <div className="mt-2 space-y-2">
                {DIM_LABELS.map((label, i) => (
                  <div key={label} className="flex items-center gap-2">
                    <span className="w-16 shrink-0 text-xs text-stone-600">{label}</span>
                    <div className="h-2 flex-1 rounded-full bg-stone-100">
                      <div
                        className="h-full rounded-full bg-cinnabar-500 transition-all"
                        style={{ width: `${(stats.dimAvg[i] / 5) * 100}%` }}
                      />
                    </div>
                    <span className="w-8 text-right text-xs text-stone-500">{stats.dimAvg[i].toFixed(1)}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="mt-4 rounded-lg border border-stone-200 bg-paper px-4 py-3">
              <p className="text-xs font-semibold text-stone-600">已收集的写作动作（Narrative Moves）</p>
              {stats.moves.length === 0 ? (
                <p className="mt-2 text-xs text-stone-400">完成任意一节训练后，这里会沉淀作者用过的写作动作。</p>
              ) : (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {stats.moves.map((m, i) => (
                    <span key={i} className="rounded-full border border-emerald-300 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-800">{m}</span>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
