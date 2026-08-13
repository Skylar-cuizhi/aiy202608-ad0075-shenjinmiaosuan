/** 逆读 · 作者思维训练：数据模型与进度存储 */

export interface NiduEvidence {
  quote: string
  /** 溯源包中的来源 id（如 S1），null = 作者自建框架/计算 */
  sourceId: string | null
  note: string
}

export interface NiduClaim {
  text: string
  evidence: NiduEvidence[]
}

export interface NiduSection {
  id: string
  /** 用于从报告原文中切出本章的标题前缀（如 "## 第 1 章"） */
  heading: string
  shortTitle: string
  gatePrompt: string
  question: string
  authorIntent: string
  claims: NiduClaim[]
  warrant: string
  limitation: string
  coach: string
  challenge: string
  writingMove: string
  teachBack: string
}

export interface NiduMap {
  reportTitle: string
  packRef: string
  sections: NiduSection[]
}

/** 每节的本地训练记录 */
export interface NiduRecord {
  prediction: string
  teachBack: string
  /** 四维自评 1–5：问题识别 / 论证识别 / 结构识别 / 迁移能力 */
  scores: [number, number, number, number]
  doneAt: string
}

export type NiduProgress = Record<string, NiduRecord>

const KEY = 'jianwei-nidu-progress-v1'

export function loadProgress(): NiduProgress {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}') as NiduProgress
  } catch {
    return {}
  }
}

export function saveProgress(p: NiduProgress) {
  try {
    localStorage.setItem(KEY, JSON.stringify(p))
  } catch {
    /* 隐私模式等场景下静默失败 */
  }
}

/** 从报告 markdown 中切出某章正文（heading 到下一个同级 ## 标题之间） */
export function sliceSection(reportMd: string, heading: string): string {
  const lines = reportMd.split('\n')
  const start = lines.findIndex((l) => l.startsWith(heading))
  if (start < 0) return ''
  let end = lines.length
  for (let i = start + 1; i < lines.length; i++) {
    if (/^## /.test(lines[i])) {
      end = i
      break
    }
  }
  return lines.slice(start, end).join('\n').trim()
}

/** Playbook 汇总：按训练记录统计已识别的论证元素与四维均分 */
export function playbookStats(map: NiduMap, progress: NiduProgress) {
  const done = map.sections.filter((s) => progress[s.id])
  const dims = [0, 0, 0, 0]
  let claims = 0
  let evid = 0
  const moves: string[] = []
  for (const s of done) {
    claims += s.claims.length
    evid += s.claims.reduce((n, c) => n + c.evidence.length, 0)
    moves.push(s.writingMove.split('：')[0])
    s && progress[s.id].scores.forEach((v, i) => (dims[i] += v))
  }
  const n = Math.max(done.length, 1)
  return {
    doneCount: done.length,
    total: map.sections.length,
    claims,
    evidence: evid,
    warrants: done.length,
    qualifications: done.length,
    moves,
    dimAvg: dims.map((d) => d / n) as [number, number, number, number],
  }
}

export const DIM_LABELS = ['问题识别', '论证识别', '结构识别', '迁移能力'] as const
export const DIM_HINTS = [
  '你发现作者真正在回答的问题了吗？',
  '你分清 Claim / Evidence / 推理机制了吗？',
  '你能讲清「为什么这一章必须接在这里」吗？',
  '换成你自己的研究，你会用同样的写作动作吗？',
] as const
