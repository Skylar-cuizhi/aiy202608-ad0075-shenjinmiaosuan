import type { AiNarrative } from './ai';

/**
 * 分析持久化（IndexedDB）：PDF 原件 + AI 研判结果。
 * 提取结果不存 —— 它是确定性的，恢复时从 PDF 重算，保证逻辑升级后结果自动更新。
 */

export interface AnalysisMeta {
  id: string;
  companyName: string;
  fiscalYears: number[];
  savedAt: string;
  fileNames: string[];
  narrativeCount: number;
}

interface StoredAnalysis extends AnalysisMeta {
  files: { name: string; data: ArrayBuffer }[];
  narratives: Record<string, AiNarrative>;
}

const DB_NAME = 'jianwei-db';
const STORE = 'analyses';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) {
        req.result.createObjectStore(STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(STORE, mode);
        const req = run(t.objectStore(STORE));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
        t.oncomplete = () => db.close();
      }),
  );
}

export function analysisId(companyName: string, fiscalYears: number[]): string {
  return `${companyName}::${[...fiscalYears].sort().join('-')}`;
}

export async function saveAnalysis(
  meta: Omit<AnalysisMeta, 'savedAt' | 'narrativeCount'>,
  files: { name: string; data: ArrayBuffer }[],
  narratives: Record<string, AiNarrative>,
): Promise<void> {
  const record: StoredAnalysis = {
    ...meta,
    savedAt: new Date().toISOString(),
    narrativeCount: Object.keys(narratives).length,
    files,
    narratives,
  };
  await tx('readwrite', (s) => s.put(record));
}

export async function listAnalyses(): Promise<AnalysisMeta[]> {
  const all = await tx('readonly', (s) => s.getAll() as IDBRequest<StoredAnalysis[]>);
  return all
    .map(({ files: _f, narratives: _n, ...meta }) => meta)
    .sort((a, b) => b.savedAt.localeCompare(a.savedAt));
}

export async function loadAnalysis(id: string): Promise<StoredAnalysis | undefined> {
  return tx('readonly', (s) => s.get(id) as IDBRequest<StoredAnalysis>);
}

export async function deleteAnalysis(id: string): Promise<void> {
  await tx('readwrite', (s) => s.delete(id));
}
