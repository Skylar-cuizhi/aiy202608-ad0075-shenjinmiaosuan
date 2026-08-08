import { useEffect, useRef, useState } from 'react';
import { Loader2, SendHorizonal, Sparkles, X } from 'lucide-react';
import { chatWithEvidence, type ChatMessage } from '@/lib/ai';
import { cn } from '@/lib/utils';

interface Props {
  open: boolean;
  onClose: () => void;
  /** 卷宗确定性摘要（程序生成，作为对话的证据边界） */
  digest: string;
  companyName?: string;
  /** 顶栏高度对应的响应式定位类，抽屉从其下方开始 */
  topClassName?: string;
}

const SUGGESTED = [
  '这家公司最大的风险点是什么？',
  '帮我梳理一下叙事弧：哪一年是拐点？',
  '应收裂口意味着什么？严重吗？',
  '哪些事项需要我去查公告进一步核实？',
];

/** 最左侧 AI 对话抽屉：围绕当前卷宗的证据约束问答 */
export default function AiChatPanel({ open, onClose, digest, companyName, topClassName = 'top-[57px]' }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (open) setTimeout(() => taRef.current?.focus(), 260);
  }, [open]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, pending]);

  const send = async (text: string) => {
    const q = text.trim();
    if (!q || pending) return;
    setError(null);
    const next: ChatMessage[] = [...messages, { role: 'user', content: q }];
    setMessages(next);
    setInput('');
    setPending(true);
    try {
      const reply = await chatWithEvidence(digest, next);
      setMessages([...next, { role: 'assistant', content: reply }]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPending(false);
    }
  };

  return (
    <div
      className={cn(
        'fixed bottom-0 left-0 z-40 w-[380px] max-w-[92vw] transition-transform duration-300 ease-out',
        topClassName,
        open ? 'translate-x-0' : '-translate-x-full pointer-events-none',
      )}
      aria-hidden={!open}
    >
      <div className="flex h-full flex-col border-r border-stone-200 bg-paper-light shadow-[8px_0_32px_rgba(28,25,23,0.10)]">
        {/* 头部 */}
        <div className="flex items-center gap-2 border-b border-stone-200 px-4 py-3">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-ink text-paper-light">
            <Sparkles className="h-3.5 w-3.5" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold text-stone-900">AI 研判对话</div>
            <div className="truncate text-[11px] text-stone-500">
              {companyName ? `围绕「${companyName}」卷宗 · ` : ''}证据约束 · DeepSeek
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1.5 text-stone-400 transition-colors hover:bg-stone-100 hover:text-stone-700"
            title="收起对话"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* 消息流 */}
        <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          {messages.length === 0 && (
            <div className="mt-6 space-y-5">
              <div className="text-center">
                <p className="text-sm font-medium text-stone-700">溯于原文，察于细微</p>
                <p className="mt-1.5 text-[12px] leading-relaxed text-stone-500">
                  我只依据本卷宗已核实的数字与信号作答；
                  <br />
                  超出证据的断言，我会明确告诉你「需要查证」。
                </p>
              </div>
              <div className="space-y-2">
                {SUGGESTED.map((s) => (
                  <button
                    key={s}
                    onClick={() => send(s)}
                    className="w-full rounded-lg border border-stone-200 bg-paper px-3 py-2 text-left text-[12.5px] text-stone-600 transition-colors hover:border-cinnabar-300 hover:text-cinnabar-800"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-3">
            {messages.map((m, i) => (
              <div key={i} className={cn('flex', m.role === 'user' ? 'justify-end' : 'justify-start')}>
                <div
                  className={cn(
                    'max-w-[86%] whitespace-pre-wrap rounded-xl px-3.5 py-2.5 text-[13px] leading-6',
                    m.role === 'user'
                      ? 'bg-ink text-paper-light'
                      : 'border border-stone-200 border-l-2 border-l-cinnabar-500 bg-paper text-stone-800',
                  )}
                >
                  {m.content}
                </div>
              </div>
            ))}
            {pending && (
              <div className="flex justify-start">
                <div className="flex items-center gap-2 rounded-xl border border-stone-200 border-l-2 border-l-cinnabar-500 bg-paper px-3.5 py-2.5 text-[13px] text-stone-500">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> 研判中…
                </div>
              </div>
            )}
            {error && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[12px] leading-5 text-red-700">
                {error}（可重试；若为鉴权错误，请检查 .env 中的 DEEPSEEK_API_KEY）
              </div>
            )}
          </div>
        </div>

        {/* 输入区 */}
        <div className="border-t border-stone-200 p-3">
          <div className="flex items-end gap-2 rounded-xl border border-stone-300 bg-paper px-3 py-2 focus-within:border-cinnabar-400">
            <textarea
              ref={taRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  send(input);
                }
              }}
              rows={2}
              placeholder="就这份卷宗提问…（Enter 发送，Shift+Enter 换行）"
              className="max-h-32 min-h-[44px] flex-1 resize-none bg-transparent text-[13px] leading-6 text-stone-800 outline-none placeholder:text-stone-400"
            />
            <button
              onClick={() => send(input)}
              disabled={pending || !input.trim()}
              className="mb-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-ink text-paper-light transition-colors hover:bg-ink-light disabled:opacity-40"
              title="发送"
            >
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <SendHorizonal className="h-4 w-4" />}
            </button>
          </div>
          <p className="mt-1.5 px-1 text-[10.5px] text-stone-400">
            AI 回答受卷宗证据约束；重大结论请以年报原文与监管文书为准。
          </p>
        </div>
      </div>
    </div>
  );
}
