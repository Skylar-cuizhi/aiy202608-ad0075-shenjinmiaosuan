import type { LoadedPdf, DetectedChapter } from './pdf';
import type { ExtractionResult, RealFact } from './extract';

/** 一份已载入的年报文档（PDF + 章节 + 确定性提取结果） */
export interface DocEntry {
  id: string;
  /** 原始 File，用于持久化到 IndexedDB */
  file: File;
  pdf: LoadedPdf;
  chapters: DetectedChapter[];
  extraction: ExtractionResult;
}

export interface MergedFacts {
  facts: RealFact[];
  /** 事实 id → 所属文档 id（用于跨文档跳转溯源） */
  ownerById: Map<string, string>;
}

/**
 * 合并多份年报的事实，按「指标 + 年份」去重：
 * 同一指标同一年份可能出现在多份报告中（如 2018 年收入既在 2018 年报主表，
 * 又在 2019 年报比较期列），优先采用该财年报告中的主表数据。
 */
export function mergeFacts(docs: DocEntry[]): MergedFacts {
  const byKey = new Map<string, { fact: RealFact; docId: string; primary: boolean }>();
  for (const d of docs) {
    const fy = d.extraction.meta.fiscalYear;
    for (const f of d.extraction.facts) {
      const key = `${f.label}|${f.year}`;
      const primary = fy === f.year;
      const existing = byKey.get(key);
      if (!existing || (primary && !existing.primary)) {
        byKey.set(key, { fact: f, docId: d.id, primary });
      }
    }
  }
  const entries = [...byKey.values()];
  const facts = entries
    .map((e) => e.fact)
    .sort((a, b) => a.label.localeCompare(b.label, 'zh') || b.year - a.year);
  const ownerById = new Map<string, string>(entries.map((e) => [e.fact.id, e.docId]));
  return { facts, ownerById };
}
