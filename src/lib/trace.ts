import sourcesJson from '../data/trace/sources.json'

/** 调研溯源 · 来源可信度等级（对齐 traceable-research 技能的 rubric）；U = 粘贴浏览模式下未评级 */
export type TraceGrade = 'A' | 'B' | 'C' | 'D' | 'U'

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
  const grades: Record<TraceGrade, number> = { A: 0, B: 0, C: 0, D: 0, U: 0 }
  pack.sources.forEach((s) => (grades[s.grade] += 1))
  return { total, ok, fail: total - ok, anchorTotal: anchors.length, matched, grades }
}

export const TRACE_GRADE_STYLE: Record<TraceGrade, { badge: string; dot: string; label: string }> = {
  A: { badge: 'bg-emerald-100 text-emerald-800 border border-emerald-300', dot: 'bg-emerald-600', label: '一手权威' },
  B: { badge: 'bg-sky-100 text-sky-800 border border-sky-300', dot: 'bg-sky-600', label: '专业署名报道' },
  C: { badge: 'bg-amber-100 text-amber-800 border border-amber-300', dot: 'bg-amber-500', label: '二手转述' },
  D: { badge: 'bg-red-100 text-red-800 border border-red-300', dot: 'bg-red-600', label: '不可追责' },
  U: { badge: 'bg-stone-200 text-stone-600 border border-stone-300', dot: 'bg-stone-400', label: '未评级' },
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

/**
 * 仅粘贴浏览：不做来源抓取与评级，只把报告中的 [(名称)](URL) 引证解析成占位来源。
 * 启动本地管线服务（tools/trace/server.py）重新生成后，才会有原文标红与可信度分级。
 */
export function packFromMdOnly(reportMd: string): TracePack {
  const CITE_RE = /\[\(([^)]{1,40})\)\]\((https?:\/\/[^)]+)\)/g
  const byUrl = new Map<string, string>()
  for (const line of reportMd.split('\n')) {
    if (line.trimStart().startsWith('[(') && (line.match(/http/g) ?? []).length >= 2) continue // 跳过文末来源列表
    for (const m of line.matchAll(CITE_RE)) {
      if (!byUrl.has(m[2].trim())) byUrl.set(m[2].trim(), m[1].trim())
    }
  }
  const sources: TraceSource[] = [...byUrl.entries()].map(([url, name], i) => ({
    id: `S${i + 1}`,
    name,
    url,
    grade: 'U',
    gradeReason: '未评级（粘贴浏览模式，未做来源核验）',
    status: 'fail',
    failReason: '仅粘贴浏览：未生成原文锚点数据',
    title: '',
    date: '',
    textLen: 0,
    anchors: [],
  }))
  const h1 = reportMd.match(/^#\s+(.+)$/m)
  return { title: h1?.[1].trim() ?? '粘贴的调研报告', reportMd, sources }
}

import reportMdRaw from '../data/trace/report.md?raw'

/** 内置演示溯源包：智能眼镜市场深度调研报告（网络来源已离线抓取并定位锚点） */
export const demoTracePack: TracePack = {
  title: '智能眼镜市场深度调研报告（2026 年 8 月）',
  reportMd: reportMdRaw,
  sources: sourcesJson as TraceSource[],
}
