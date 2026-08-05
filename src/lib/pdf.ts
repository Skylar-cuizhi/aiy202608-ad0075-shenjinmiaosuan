import * as pdfjs from 'pdfjs-dist';

// worker 仅在浏览器环境配置（Node/测试环境使用 disableWorker）
if (typeof window !== 'undefined') {
  import('pdfjs-dist/build/pdf.worker.min.mjs?url').then((m) => {
    pdfjs.GlobalWorkerOptions.workerSrc = m.default;
  });
}

/** 页内文字项，带视口坐标（scale=1 的 CSS 像素坐标系） */
export interface PdfTextItem {
  str: string;
  x: number; // left
  y: number; // top
  w: number;
  h: number;
}

export interface PdfPageData {
  page: number; // 1-based
  width: number;
  height: number;
  items: PdfTextItem[];
  /** 整页拼接文本（用于检索） */
  text: string;
  /** 是否无文字层（扫描图片页 → 识别困难） */
  isImageOnly: boolean;
}

export interface LoadedPdf {
  doc: pdfjs.PDFDocumentProxy;
  fileName: string;
  numPages: number;
  pages: PdfPageData[];
}

/** 检测到的章节 */
export interface DetectedChapter {
  title: string;
  pageStart: number;
  pageEnd: number; // 含
  /** parsed=有文字层；image=整章扫描图片 */
  status: 'parsed' | 'image';
}

export interface SearchMatchRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface SearchMatch {
  page: number;
  /** 命中片段（上下文） */
  snippet: string;
  /** 命中文字的坐标框（scale=1 视口坐标） */
  rects: SearchMatchRect[];
}

/** 加载并解析 PDF：逐页提取带坐标的文字项 */
export async function loadPdf(file: File, onProgress?: (done: number, total: number) => void): Promise<LoadedPdf> {
  const buf = await file.arrayBuffer();
  const doc = await pdfjs.getDocument({
    data: buf,
    cMapUrl: './cmaps/',
    cMapPacked: true,
    standardFontDataUrl: './standard_fonts/',
  }).promise;
  const pages: PdfPageData[] = [];

  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const viewport = page.getViewport({ scale: 1 });
    const tc = await page.getTextContent();

    const items: PdfTextItem[] = [];
    for (const raw of tc.items) {
      if (!('str' in raw) || !raw.str.trim()) continue;
      const tx = pdfjs.Util.transform(viewport.transform, raw.transform);
      const fontH = Math.hypot(tx[2], tx[3]) || raw.height || 10;
      const x = tx[4];
      const y = tx[5] - fontH; // 基线 → 顶部
      const w = raw.width * viewport.scale || raw.str.length * fontH * 0.5;
      items.push({ str: raw.str, x, y, w, h: fontH * 1.15 });
    }

    const text = items.map((i) => i.str).join(' ');
    pages.push({
      page: p,
      width: viewport.width,
      height: viewport.height,
      items,
      text,
      isImageOnly: text.trim().length < 20,
    });
    onProgress?.(p, doc.numPages);
  }

  return { doc, fileName: file.name, numPages: doc.numPages, pages };
}

/**
 * 章节识别启发式：扫描每页前若干行文字，匹配常见年报章节标题模式。
 * 真实版本可由版式分析 / LLM 增强；此处保证零依赖、确定性。
 */
export function detectChapters(pdf: LoadedPdf): DetectedChapter[] {
  const patterns = [
    /^第[一二三四五六七八九十百]+[章节][　\s]*(.{2,30})/,
    /^第[一二三四五六七八九十]+部分[　\s]*(.{2,30})/,
    /^([一二三四五六七八九十]+)、(.{2,30})/,
    /^(目\s*录)/,
    /^(审计报告|财务报告|财务报表|管理层讨论与分析|重要事项|公司治理|备查文件)/,
  ];

  const hits: { title: string; page: number }[] = [];
  for (const page of pdf.pages) {
    if (page.isImageOnly) continue;
    // 只看每页前 12 个文字项，避免正文误命中
    const head = page.items.slice(0, 12).map((i) => i.str);
    for (const line of head) {
      const t = line.replace(/\s+/g, '');
      if (t.length > 34) continue;
      for (const re of patterns) {
        const m = t.match(re);
        if (m) {
          const title = t.length <= 4 ? t : t;
          // 同一标题只记第一次出现
          if (!hits.some((h) => h.title === title)) hits.push({ title, page: page.page });
          break;
        }
      }
      if (hits.length > 0 && hits[hits.length - 1].page === page.page) break;
    }
  }

  const chapters: DetectedChapter[] = hits.map((h, i) => {
    const next = hits[i + 1];
    const pageEnd = next ? next.page - 1 : pdf.numPages;
    const seg = pdf.pages.filter((p) => p.page >= h.page && p.page <= pageEnd);
    const imagePages = seg.filter((p) => p.isImageOnly).length;
    return {
      title: h.title,
      pageStart: h.page,
      pageEnd: Math.max(pageEnd, h.page),
      status: seg.length > 0 && imagePages / seg.length > 0.8 ? 'image' : 'parsed',
    };
  });
  return chapters;
}

/**
 * 全文检索：跨文字项滑窗匹配，命中后把字符区间映射回坐标框。
 * 返回每个命中页的片段与坐标高亮框（scale=1）。
 */
export function searchPdf(pdf: LoadedPdf, query: string, maxResults = 60): SearchMatch[] {
  const q = query.trim().replace(/\s+/g, '');
  if (!q) return [];
  const results: SearchMatch[] = [];

  for (const page of pdf.pages) {
    if (page.isImageOnly || results.length >= maxResults) continue;
    const items = page.items;

    // 拼接文本 + 记录每个字符属于哪个 item
    let joined = '';
    const charItemIdx: number[] = [];
    items.forEach((it, idx) => {
      for (const ch of it.str) {
        joined += ch;
        charItemIdx.push(idx);
      }
      joined += ' ';
      charItemIdx.push(-1);
    });
    const joinedNorm = joined.replace(/\s+/g, '');

    // 规范化字符串与原字符串的偏移映射
    const normToRaw: number[] = [];
    {
      let raw = 0;
      for (let i = 0; i < joined.length; i++) {
        if (!/\s/.test(joined[i])) {
          normToRaw.push(raw);
        }
        raw++;
      }
    }

    let from = 0;
    while (results.length < maxResults) {
      const hit = joinedNorm.toLowerCase().indexOf(q.toLowerCase(), from);
      if (hit === -1) break;
      const rawStart = normToRaw[hit];
      const rawEnd = normToRaw[Math.min(hit + q.length - 1, normToRaw.length - 1)];

      // 命中区间覆盖的 item → 坐标框
      const itemIdxSet = new Set<number>();
      for (let i = rawStart; i <= rawEnd && i < charItemIdx.length; i++) {
        const idx = charItemIdx[i];
        if (idx >= 0) itemIdxSet.add(idx);
      }
      const rects: SearchMatchRect[] = [...itemIdxSet].map((idx) => {
        const it = items[idx];
        return { x: it.x, y: it.y, w: it.w, h: it.h };
      });

      const snippet = joined.slice(Math.max(0, rawStart - 40), Math.min(joined.length, rawEnd + 41));
      results.push({ page: page.page, snippet: snippet.replace(/\s+/g, ' ').trim(), rects });
      from = hit + q.length;
    }
  }
  return results;
}
