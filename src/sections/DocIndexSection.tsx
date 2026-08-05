import type { DetectedChapter, LoadedPdf } from '@/lib/pdf';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { FileText, Layers, ScanSearch, Wrench } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  pdf: LoadedPdf;
  chapters: DetectedChapter[];
  /** 点击「可检索」/ 章节行：跳转 PDF 面板到章节起始页 */
  onJump?: (page: number) => void;
}

/** 真实模式下的文档索引概览 */
export default function DocIndexSection({ pdf, chapters, onJump }: Props) {
  const imagePages = pdf.pages.filter((p) => p.isImageOnly);
  const textPages = pdf.numPages - imagePages.length;
  const coverage = Math.round((textPages / pdf.numPages) * 100);
  const totalItems = pdf.pages.reduce((s, p) => s + p.items.length, 0);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card className="border-stone-200">
          <CardContent className="flex items-center gap-3 px-4 py-3">
            <FileText className="h-5 w-5 text-stone-400" />
            <div>
              <div className="text-xl font-semibold">{pdf.numPages}</div>
              <div className="text-xs text-stone-500">总页数</div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-stone-200">
          <CardContent className="flex items-center gap-3 px-4 py-3">
            <Layers className="h-5 w-5 text-stone-400" />
            <div>
              <div className="text-xl font-semibold">{chapters.length}</div>
              <div className="text-xs text-stone-500">识别章节</div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-stone-200">
          <CardContent className="flex items-center gap-3 px-4 py-3">
            <ScanSearch className="h-5 w-5 text-stone-400" />
            <div>
              <div className="text-xl font-semibold">{totalItems.toLocaleString()}</div>
              <div className="text-xs text-stone-500">带坐标文字项</div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-stone-200">
          <CardContent className="flex items-center gap-3 px-4 py-3">
            <Wrench className="h-5 w-5 text-stone-400" />
            <div>
              <div className="text-xl font-semibold text-red-500">{imagePages.length}</div>
              <div className="text-xs text-stone-500">扫描图片页（无文字层）</div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-stone-200">
        <CardHeader className="pb-2"><CardTitle className="text-base">文字层覆盖</CardTitle></CardHeader>
        <CardContent>
          <div className="flex items-end justify-between">
            <span className="text-2xl font-semibold">{coverage}%</span>
            <span className="text-xs text-stone-500">{textPages}/{pdf.numPages} 页含可提取文字</span>
          </div>
          <Progress value={coverage} className="mt-2 h-1.5" />
          {imagePages.length > 0 && (
            <div className="mt-3 rounded-md bg-red-50 px-3 py-2 text-xs leading-relaxed text-red-700">
              以下页面没有文字层（扫描图片），全文检索无法覆盖，需 OCR 或人工阅读：
              第 {imagePages.slice(0, 20).map((p) => p.page).join('、')} 页
              {imagePages.length > 20 && ` 等共 ${imagePages.length} 页`}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-stone-200">
        <CardHeader className="pb-2"><CardTitle className="text-base">章节索引</CardTitle></CardHeader>
        <CardContent>
          {chapters.length === 0 ? (
            <p className="text-sm text-stone-500">
              未检测到标准章节标题。这份文档可能是非标准版式，章节识别将在后续版本中由版式分析增强。
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-stone-200 text-left text-xs text-stone-500">
                  <th className="py-1.5 pr-3 font-medium">章节</th>
                  <th className="py-1.5 pr-3 font-medium">页码范围</th>
                  <th className="py-1.5 font-medium">状态</th>
                </tr>
              </thead>
              <tbody>
                {chapters.map((c) => {
                  const jumpable = c.status === 'parsed' && onJump;
                  return (
                  <tr
                    key={c.title + c.pageStart}
                    onClick={() => jumpable && onJump(c.pageStart)}
                    title={jumpable ? `跳转到 P${c.pageStart} 阅读原文` : undefined}
                    className={cn(
                      'border-b border-stone-100 last:border-0',
                      jumpable && 'cursor-pointer transition-colors hover:bg-cinnabar-50/60',
                    )}
                  >
                    <td className="py-2 pr-3 text-stone-800">{c.title}</td>
                    <td className="py-2 pr-3 text-stone-600">P{c.pageStart}–{c.pageEnd}</td>
                    <td className="py-2">
                      {c.status === 'parsed' ? (
                        <Badge
                          variant="outline"
                          className={cn(
                            'border-emerald-200 bg-emerald-50 text-emerald-700',
                            jumpable && 'group-hover:border-emerald-400',
                          )}
                        >
                          可检索
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="border-red-200 bg-red-50 text-red-600">扫描图片</Badge>
                      )}
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
