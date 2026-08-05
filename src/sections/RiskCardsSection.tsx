import type { AnchorSelection, Fact, RiskCard, Severity } from '@/types/research';
import type { AiNarrative } from '@/lib/ai';
import { Badge } from '@/components/ui/badge';
import {
  AlertOctagon, Scale, HelpCircle, ShieldAlert, FileSearch, ListChecks, Ban, Sparkles,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  cards: RiskCard[];
  facts: Fact[];
  onSelectAnchor: (sel: AnchorSelection) => void;
  /** AI 生成的解释层（按卡片 id 索引）；缺失时回退知识包模板 */
  narratives?: Record<string, AiNarrative>;
  /** 仍在生成中的卡片数（用于顶部状态提示） */
  aiPending?: number;
  /** 生成失败回退模板的卡片数 */
  aiFailed?: number;
}

const severityMeta: Record<Severity, { label: string; className: string; bar: string }> = {
  high: { label: '优先核实', className: 'border-red-200 bg-red-50 text-red-700', bar: 'bg-red-500' },
  medium: { label: '需要关注', className: 'border-cinnabar-200 bg-cinnabar-50 text-cinnabar-700', bar: 'bg-cinnabar-500' },
  low: { label: '保持跟踪', className: 'border-stone-200 bg-stone-100 text-stone-600', bar: 'bg-stone-400' },
};

function SectionTitle({ icon: Icon, children }: { icon: typeof Scale; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-stone-500">
      <Icon className="h-3.5 w-3.5" /> {children}
    </div>
  );
}

export default function RiskCardsSection({ cards, facts, onSelectAnchor, narratives, aiPending = 0, aiFailed = 0 }: Props) {
  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-stone-200 bg-paper-light px-4 py-3 text-sm leading-relaxed text-stone-600">
        系统不下结论。每个风险信号都被整理成一张<b className="text-stone-800">研究卡片</b>：程序先确认数字关系，
        再同时给出<b className="text-stone-800">风险解释</b>与<b className="text-stone-800">反方解释</b>，
        最后把判断权交还给研究员。共命中 {cards.length} 条确定性规则。
        {aiPending > 0 && <span className="ml-2 text-cinnabar-700">AI 研判生成中（剩余 {aiPending} 张）…</span>}
        {aiPending === 0 && aiFailed > 0 && (
          <span className="ml-2 text-stone-500">{aiFailed} 张卡片的 AI 研判不可用，已回退知识包模板。</span>
        )}
      </div>

      {cards.map((card) => {
        const sev = severityMeta[card.severity];
        const ai = narratives?.[card.id];
        const explanation = ai && ai.explanation.length > 0 ? ai.explanation : card.explanation;
        const counter = ai && ai.counter.length > 0 ? ai.counter : card.counterExplanation;
        const questions = ai && ai.questions.length > 0 ? ai.questions : card.questions;
        const evidence = card.evidenceFactIds
          .map((id) => facts.find((f) => f.id === id))
          .filter((f): f is Fact => Boolean(f));
        return (
          <article key={card.id} className="overflow-hidden rounded-lg border border-stone-200 bg-paper-light">
            <header className="flex items-center gap-3 border-b border-stone-100 px-5 py-3">
              <span className={cn('h-8 w-1 rounded-full', sev.bar)} />
              <div className="min-w-0 flex-1">
                <h3 className="truncate text-base font-semibold text-stone-900">{card.title}</h3>
                <p className="text-xs text-stone-500">命中规则：{card.ruleId}</p>
              </div>
              {ai && (
                <Badge variant="outline" className="border-violet-200 bg-violet-50 text-violet-700" title={`解释 / 反方 / 问题由 ${ai.model} 在证据约束下生成`}>
                  <Sparkles className="mr-1 h-3 w-3" /> AI 研判
                </Badge>
              )}
              <Badge variant="outline" className={sev.className}>{sev.label}</Badge>
            </header>

            <div className="space-y-5 px-5 py-4">
              {/* 1. 风险信号 */}
              <section className="space-y-1.5">
                <SectionTitle icon={AlertOctagon}>1 · 风险信号（程序确认的数字关系）</SectionTitle>
                <p className="rounded-md bg-red-50/60 px-3 py-2 text-sm font-medium leading-relaxed text-stone-800">
                  {card.signal}
                </p>
              </section>

              {/* 2. 原始证据 */}
              <section className="space-y-1.5">
                <SectionTitle icon={FileSearch}>2 · 原始证据（点击回到 PDF 原文）</SectionTitle>
                <div className="flex flex-wrap gap-2">
                  {evidence.map((f) => (
                    <button
                      key={f.id}
                      onClick={() => onSelectAnchor({ id: f.id, page: f.anchor.page, quote: f.anchor.quote, chapter: f.anchor.chapter })}
                      className="group rounded-md border border-stone-200 bg-stone-50 px-2.5 py-1.5 text-left transition-colors hover:border-cinnabar-300 hover:bg-cinnabar-50"
                    >
                      <div className="text-xs font-medium text-stone-800">
                        {f.label}（{f.year}）：{f.value !== 0 ? `${f.value} ${f.unit}` : f.unit}
                      </div>
                      <div className="text-[11px] text-stone-500 group-hover:text-cinnabar-700">
                        P{f.anchor.page}{f.anchor.table ? ` · ${f.anchor.table}` : ''}
                      </div>
                    </button>
                  ))}
                </div>
              </section>

              {/* 3+4 双栏：风险解释 / 反方解释 */}
              <div className="grid gap-4 md:grid-cols-2">
                <section className="space-y-1.5">
                  <SectionTitle icon={ShieldAlert}>3 · 风险解释{ai ? '（AI · 证据约束生成）' : '（知识包模板）'}</SectionTitle>
                  <ul className="space-y-1 text-sm leading-relaxed text-stone-700">
                    {explanation.map((e, i) => <li key={i} className="flex gap-2"><span className="text-red-400">•</span>{e}</li>)}
                  </ul>
                </section>
                <section className="space-y-1.5">
                  <SectionTitle icon={Scale}>4 · 反方解释{ai ? '（AI · 证据约束生成）' : '（知识包模板）'}</SectionTitle>
                  <ul className="space-y-1 text-sm leading-relaxed text-stone-700">
                    {counter.map((e, i) => <li key={i} className="flex gap-2"><span className="text-emerald-500">•</span>{e}</li>)}
                  </ul>
                </section>
              </div>

              {/* 5. 待核实问题 */}
              <section className="space-y-1.5">
                <SectionTitle icon={HelpCircle}>5 · 待核实问题（研究员的下一步）{ai ? '（AI）' : '（模板）'}</SectionTitle>
                <ol className="list-decimal space-y-1 pl-5 text-sm leading-relaxed text-stone-700">
                  {questions.map((q, i) => <li key={i}>{q}</li>)}
                </ol>
              </section>

              {/* 6. 判断边界 */}
              <section className="space-y-1.5">
                <SectionTitle icon={Ban}>6 · 当前判断边界</SectionTitle>
                <p className="rounded-md border border-dashed border-stone-300 bg-stone-50 px-3 py-2 text-sm leading-relaxed text-stone-600">
                  {card.boundary}
                </p>
              </section>
            </div>

            <footer className="flex items-center gap-2 border-t border-stone-100 bg-stone-50/60 px-5 py-2 text-[11px] text-stone-500">
              <ListChecks className="h-3.5 w-3.5" />
              {ai
                ? '数字与信号由程序确定性核实；解释与问题由 AI 在证据约束下生成 —— 判断、验证与最终结论由研究员完成。'
                : 'AI 负责阅读、整理、比较和提出问题 —— 判断、验证与最终结论由研究员完成。'}
            </footer>
          </article>
        );
      })}
    </div>
  );
}
