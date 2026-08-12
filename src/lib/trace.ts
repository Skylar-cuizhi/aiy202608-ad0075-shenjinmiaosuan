import sourcesJson from '../data/trace/sources.json'

/** 调研溯源 · 来源可信度等级（对齐 traceable-research 技能的 rubric） */
export type TraceGrade = 'A' | 'B' | 'C' | 'D'

export interface TraceAnchor {
  claim: string
  matched: boolean
  hit: string
  before: string[]
  after: string[]
  note: string
}

export interface TraceSource {
  id: string
  name: string
  url: string
  grade: TraceGrade
  gradeReason: string
  status: 'ok' | 'fail'
  failReason: string
  title: string
  date: string
  textLen: number
  anchors: TraceAnchor[]
}

/** 溯源包：一份调研报告 + 其全部网络来源的原文锚点数据（由 tools/trace 管线离线生成） */
export interface TracePack {
  title: string
  reportMd: string
  sources: TraceSource[]
}

export function packStats(pack: TracePack) {
  const total = pack.sources.length
  const ok = pack.sources.filter((s) => s.status === 'ok').length
  const anchors = pack.sources.flatMap((s) => s.anchors)
  const matched = anchors.filter((a) => a.matched).length
  const grades: Record<TraceGrade, number> = { A: 0, B: 0, C: 0, D: 0 }
  pack.sources.forEach((s) => (grades[s.grade] += 1))
  return { total, ok, fail: total - ok, anchorTotal: anchors.length, matched, grades }
}

export const TRACE_GRADE_STYLE: Record<TraceGrade, { badge: string; dot: string; label: string }> = {
  A: { badge: 'bg-emerald-100 text-emerald-800 border border-emerald-300', dot: 'bg-emerald-600', label: '一手权威' },
  B: { badge: 'bg-sky-100 text-sky-800 border border-sky-300', dot: 'bg-sky-600', label: '专业署名报道' },
  C: { badge: 'bg-amber-100 text-amber-800 border border-amber-300', dot: 'bg-amber-500', label: '二手转述' },
  D: { badge: 'bg-red-100 text-red-800 border border-red-300', dot: 'bg-red-600', label: '不可追责' },
}

/** 解析导入的溯源包 JSON 文件；非法时抛错 */
export function parseTracePack(text: string): TracePack {
  const raw = JSON.parse(text) as Partial<TracePack>
  if (!raw || typeof raw.reportMd !== 'string' || !Array.isArray(raw.sources)) {
    throw new Error('不是合法的溯源包（需要 { title, reportMd, sources }）')
  }
  for (const s of raw.sources) {
    if (!s.url || !Array.isArray(s.anchors)) throw new Error('溯源包 sources 字段不完整')
  }
  return { title: raw.title || '未命名调研报告', reportMd: raw.reportMd, sources: raw.sources as TraceSource[] }
}

import reportMdRaw from '../data/trace/report.md?raw'

/** 内置演示溯源包：智能眼镜市场深度调研报告（网络来源已离线抓取并定位锚点） */
export const demoTracePack: TracePack = {
  title: '智能眼镜市场深度调研报告（2026 年 8 月）',
  reportMd: reportMdRaw,
  sources: sourcesJson as TraceSource[],
}
