import type { CompanyReport, Fact } from '@/types/research';
import { series, yoy } from '@/lib/signals';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { BookOpenCheck, TrendingDown, TrendingUp } from 'lucide-react';
import {
  Bar, BarChart, CartesianGrid, ComposedChart, Legend, Line,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';

interface Props {
  report: CompanyReport;
  onOpenFacts: () => void;
}

function StatTile({ facts, label, year, inverse }: { facts: Fact[]; label: string; year: number; inverse?: boolean }) {
  const cur = facts.find((f) => f.label === label && f.year === year);
  const g = yoy(facts, label, year);
  if (!cur) return null;
  const good = g === undefined ? undefined : inverse ? g < 0 : g >= 0;
  return (
    <div className="rounded-lg border border-stone-200 bg-paper-light px-4 py-3">
      <div className="text-xs text-stone-500">{label}</div>
      <div className="mt-1 flex items-baseline gap-1.5">
        <span className="text-xl font-semibold text-stone-900">{cur.value}</span>
        <span className="text-xs text-stone-500">{cur.unit}</span>
      </div>
      {g !== undefined && (
        <div className={`mt-1 flex items-center gap-1 text-xs font-medium ${good ? 'text-emerald-600' : 'text-red-500'}`}>
          {g >= 0 ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
          同比 {g >= 0 ? '+' : ''}{g}%
        </div>
      )}
    </div>
  );
}

export default function OverviewSection({ report, onOpenFacts }: Props) {
  const year = Math.max(...report.fiscalYears);
  const rev = series(report.facts, '营业收入');
  const ocf = series(report.facts, '经营活动现金流净额');
  const np = series(report.facts, '归母净利润');
  const npd = series(report.facts, '扣非净利润');
  const debt = series(report.facts, '资产负债率');
  const gm = series(report.facts, '毛利率');

  const revOcfData = rev.map((r) => ({
    year: `${r.year}`,
    营业收入: r.value,
    经营现金流: ocf.find((o) => o.year === r.year)?.value,
  }));
  const profitData = np.map((n) => ({
    year: `${n.year}`,
    归母净利润: n.value,
    扣非净利润: npd.find((d) => d.year === n.year)?.value,
  }));
  const ratioData = debt.map((d) => ({
    year: `${d.year}`,
    资产负债率: d.value,
    毛利率: gm.find((g) => g.year === d.year)?.value,
  }));

  return (
    <div className="space-y-4">
      {/* 结构化摘要 */}
      <Card className="border-stone-200">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">结构化摘要</CardTitle>
            <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700">
              基于 {report.totalPages} 页完整索引 · 逐条可溯源
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <ol className="list-decimal space-y-2 pl-5 text-sm leading-relaxed text-stone-700">
            {report.summary.map((s, i) => <li key={i}>{s}</li>)}
          </ol>
        </CardContent>
      </Card>

      {/* 核心指标速览 */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile facts={report.facts} label="营业收入" year={year} />
        <StatTile facts={report.facts} label="经营活动现金流净额" year={year} />
        <StatTile facts={report.facts} label="归母净利润" year={year} />
        <StatTile facts={report.facts} label="资产负债率" year={year} inverse />
      </div>

      {/* 可视化 */}
      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="border-stone-200">
          <CardHeader className="pb-0"><CardTitle className="text-sm">收入 vs 经营现金流（亿元）</CardTitle></CardHeader>
          <CardContent className="h-56 pt-2">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={revOcfData} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" />
                <XAxis dataKey="year" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="营业收入" fill="#d6d3d1" radius={[3, 3, 0, 0]} />
                <Line dataKey="经营现金流" stroke="#dc2626" strokeWidth={2} dot={{ r: 3 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card className="border-stone-200">
          <CardHeader className="pb-0"><CardTitle className="text-sm">归母净利润 vs 扣非净利润（亿元）</CardTitle></CardHeader>
          <CardContent className="h-56 pt-2">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={profitData} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" />
                <XAxis dataKey="year" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="归母净利润" fill="#78716c" radius={[3, 3, 0, 0]} />
                <Bar dataKey="扣非净利润" fill="#f59e0b" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card className="border-stone-200">
          <CardHeader className="pb-0"><CardTitle className="text-sm">资产负债率 vs 毛利率（%）</CardTitle></CardHeader>
          <CardContent className="h-56 pt-2">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={ratioData} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" />
                <XAxis dataKey="year" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="资产负债率" fill="#44403c" radius={[3, 3, 0, 0]} />
                <Line dataKey="毛利率" stroke="#f59e0b" strokeWidth={2} dot={{ r: 3 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* 优先阅读章节 */}
      <Card className="border-stone-200">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <BookOpenCheck className="h-4 w-4 text-cinnabar-600" /> 建议优先阅读
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-2">
          {report.priorityChapters.map((c) => (
            <Badge key={c} variant="secondary" className="bg-stone-100 text-stone-700">{c}</Badge>
          ))}
          <button onClick={onOpenFacts} className="ml-auto text-sm font-medium text-cinnabar-700 hover:underline">
            查看全部 {report.facts.length} 条溯源事实 →
          </button>
        </CardContent>
      </Card>
    </div>
  );
}
