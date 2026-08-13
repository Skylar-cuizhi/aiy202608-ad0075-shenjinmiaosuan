import { useEffect, useLayoutEffect, useRef } from 'react';
import type { DragEvent } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { CloudSun, Loader2, Trash2, UploadCloud } from 'lucide-react';
import JianweiLogo from '../components/JianweiLogo';
import type { AnalysisMeta } from '../lib/store';

gsap.registerPlugin(ScrollTrigger);

interface Props {
  parsing: { done: number; total: number; fileIndex?: number; fileTotal?: number; fileName?: string } | null;
  restoring: boolean;
  departing: boolean;
  history: AnalysisMeta[];
  onPick: () => void;
  onDropFiles: (files: File[]) => void;
  onDemo: () => void;
  onTrace: () => void;
  onNidu: () => void;
  onRestore: (id: string) => void;
  onDelete: (id: string) => void;
}

const CAPS = [
  { icon: '證', title: '证据定位', desc: '结论可点击回溯原文页码与章节' },
  { icon: '險', title: '风险信号', desc: '勾稽校验 · 行业风险卡片 · AI 研判' },
  { icon: '案', title: '工作台研判', desc: '批注、问题清单与摘要有序归档' },
];

/** 光门在画面中的聚焦点（百分比），一切运镜以此为锚 */
const DOOR_ORIGIN = '50% 40%';

export default function WelcomeSection({
  parsing, restoring, departing, history, onPick, onDropFiles, onDemo, onTrace, onNidu, onRestore, onDelete,
}: Props) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const mistARef = useRef<HTMLDivElement | null>(null);
  const mistBRef = useRef<HTMLDivElement | null>(null);
  const hudRef = useRef<HTMLDivElement | null>(null);
  const veilRef = useRef<HTMLDivElement | null>(null);
  const act2Ref = useRef<HTMLDivElement | null>(null);
  const busy = !!parsing || restoring;

  /* —— 入场编排 + 呼吸与雾流 + 滚动推镜（GSAP + ScrollTrigger） —— */
  useLayoutEffect(() => {
    const ctx = gsap.context(() => {
      // 开场：镜头从微远处缓缓落定
      gsap.fromTo(stageRef.current, { scale: 1.14 }, { scale: 1.05, duration: 2.6, ease: 'power2.out' });
      // 云海呼吸（作用于内层 img，与外层运镜互不干扰）
      gsap.to(imgRef.current, { scale: 1.045, duration: 7, ease: 'sine.inOut', yoyo: true, repeat: -1 });
      // 双层流动雾霭
      gsap.to(mistARef.current, { xPercent: 9, duration: 17, ease: 'sine.inOut', yoyo: true, repeat: -1 });
      gsap.to(mistBRef.current, { xPercent: -11, duration: 23, ease: 'sine.inOut', yoyo: true, repeat: -1 });

      gsap.timeline({ defaults: { ease: 'power3.out' } })
        .fromTo('.w-logo', { opacity: 0, scale: 0.7 }, { opacity: 1, scale: 1, duration: 1.1 }, 0.4)
        .fromTo('.w-title', { opacity: 0, y: 42 }, { opacity: 1, y: 0, duration: 1.0 }, '-=0.55')
        .fromTo('.w-slogan', { opacity: 0, y: 26 }, { opacity: 1, y: 0, duration: 0.8 }, '-=0.55')
        .fromTo('.w-desc', { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.7 }, '-=0.45')
        .fromTo('.w-hint', { opacity: 0 }, { opacity: 1, duration: 0.8 }, '-=0.3')
        .fromTo('.w-side', { opacity: 0 }, { opacity: 1, duration: 1.2 }, '-=0.7');

      if (scrollerRef.current && trackRef.current && stageRef.current) {
        // 滚动推镜：沿云路走向天门
        const setScale = gsap.quickSetter(stageRef.current, 'scale');
        const setY = gsap.quickSetter(stageRef.current, 'yPercent');
        ScrollTrigger.create({
          scroller: scrollerRef.current,
          trigger: trackRef.current,
          start: 'top top',
          end: 'bottom bottom',
          scrub: 0.7,
          onUpdate: (self) => {
            const p = self.progress;
            setScale(1.05 + p * 0.8);
            setY(-p * 5);
          },
        });
        gsap.to(hudRef.current, {
          opacity: 0, y: -56, ease: 'none',
          scrollTrigger: { scroller: scrollerRef.current, trigger: trackRef.current, start: 'top top', end: '45% bottom', scrub: true },
        });
      }
      if (act2Ref.current && scrollerRef.current) {
        gsap.fromTo(act2Ref.current.querySelectorAll('.a2-rise'),
          { opacity: 0, y: 54 },
          {
            opacity: 1, y: 0, duration: 0.9, stagger: 0.12, ease: 'power3.out',
            scrollTrigger: { scroller: scrollerRef.current, trigger: act2Ref.current, start: 'top 72%' },
          });
      }
    });
    return () => ctx.revert();
  }, []);

  /* —— 指针视差：云随眼动 —— */
  useEffect(() => {
    const stage = stageRef.current;
    const root = rootRef.current;
    if (!stage || !root) return;
    const qx = gsap.quickTo(stage, 'x', { duration: 0.9, ease: 'power2.out' });
    const qy = gsap.quickTo(stage, 'y', { duration: 0.9, ease: 'power2.out' });
    const onMove = (e: MouseEvent) => {
      const r = root.getBoundingClientRect();
      qx(((e.clientX - r.left) / r.width - 0.5) * 18);
      qy(((e.clientY - r.top) / r.height - 0.5) * 10);
    };
    root.addEventListener('mousemove', onMove);
    return () => root.removeEventListener('mousemove', onMove);
  }, []);

  /* —— 离场：卷合一瞬（ blackout 换场）→ 已至门前 → 加速穿门 → 光涌 → 淡出 —— */
  useEffect(() => {
    if (!departing) return;
    const sc = scrollerRef.current;
    gsap.killTweensOf(imgRef.current); // 停呼吸，让位穿门
    const tl = gsap.timeline();
    tl.to(rootRef.current, { opacity: 0, duration: 0.3, ease: 'power1.in' })
      .add(() => {
        // 黑场期间：解除滚动驱动，瞬回云海入口，归位舞台
        ScrollTrigger.getAll().forEach((st) => st.kill());
        gsap.killTweensOf([stageRef.current, mistARef.current, mistBRef.current]);
        if (sc) sc.scrollTop = 0;
        gsap.set(stageRef.current, { scale: 1.05, yPercent: 0, x: 0, y: 0 });
        gsap.set(imgRef.current, { scale: 1 });
        gsap.set([hudRef.current, act2Ref.current], { opacity: 0 });
        gsap.set([mistARef.current, mistBRef.current], { opacity: 0.4 });
      })
      .to(rootRef.current, { opacity: 1, duration: 0.35, ease: 'power1.out' }, '+=0.05')
      .to(stageRef.current, { scale: 3.4, yPercent: -8, duration: 1.2, ease: 'power2.in' }, '<')
      .to(veilRef.current, { opacity: 1, duration: 0.9, ease: 'power1.in' }, '<+=0.35')
      .to(rootRef.current, { opacity: 0, duration: 0.5, ease: 'power1.out' }, '-=0.15');
  }, [departing]);

  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    const fs = [...(e.dataTransfer.files ?? [])].filter(
      (f) => f.type === 'application/pdf' || /\.pdf$/i.test(f.name),
    );
    if (fs.length > 0) onDropFiles(fs);
  };

  return (
    <div
      ref={rootRef}
      className="relative h-full overflow-hidden bg-paper"
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleDrop}
    >
      <div ref={scrollerRef} className="h-full overflow-y-auto">
        {/* 第一幕 · 240vh 滚动轨道：云海天门 */}
        <div ref={trackRef} className="relative h-[240vh]">
          <div className="sticky top-0 h-screen overflow-hidden">
            {/* 云海底图：运镜舞台 */}
            <div ref={stageRef} className="absolute inset-0 will-change-transform" style={{ transformOrigin: DOOR_ORIGIN }}>
              <img
                ref={imgRef}
                src="/welcome-bg.jpg"
                alt="云海天门"
                className="h-full w-full object-cover will-change-transform"
                style={{ transformOrigin: DOOR_ORIGIN }}
                draggable={false}
              />
            </div>
            {/* 流动雾霭（前后两层，速度错落） */}
            <div
              ref={mistARef}
              className="pointer-events-none absolute -left-1/4 top-[38%] h-[46%] w-[90%] rounded-full bg-[radial-gradient(closest-side,rgba(255,250,236,0.5),transparent_72%)] blur-2xl"
            />
            <div
              ref={mistBRef}
              className="pointer-events-none absolute -right-1/4 top-[58%] h-[42%] w-[85%] rounded-full bg-[radial-gradient(closest-side,rgba(255,246,226,0.42),transparent_70%)] blur-2xl"
            />
            {/* 顶部宣纸渐变（护字） + 标题区软雾 + 四缘晕影 */}
            <div className="pointer-events-none absolute inset-x-0 top-0 h-[34%] bg-[linear-gradient(180deg,rgba(246,242,233,0.72),transparent)]" />
            <div className="pointer-events-none absolute inset-x-0 top-0 h-[56%] bg-[radial-gradient(54%_58%_at_50%_30%,rgba(247,243,234,0.6),transparent_76%)]" />
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(115%_88%_at_50%_42%,transparent_58%,rgba(96,72,38,0.18)_100%)]" />
            {/* 穿门光涌 */}
            <div ref={veilRef} className="pointer-events-none absolute inset-0 bg-[#fdf0d8] opacity-0" />

            {/* HUD */}
            <div ref={hudRef} className="pointer-events-none absolute inset-0 flex flex-col items-center pt-[12vh]">
              <div className="w-logo mb-6 text-ink-800 opacity-0">
                <JianweiLogo className="h-[58px] w-[58px]" />
              </div>
              <h1 className="w-title font-song text-6xl font-semibold tracking-[0.32em] text-ink-900 opacity-0 [text-indent:0.32em] [text-shadow:0_1px_18px_rgba(246,242,233,0.9)] md:text-7xl">
                见微
              </h1>
              <p className="w-slogan mt-6 font-kai text-lg tracking-[0.28em] text-cinnabar-700 opacity-0 [text-indent:0.28em] [text-shadow:0_1px_12px_rgba(246,242,233,0.9)]">
                溯于原文 · 察于细微 · 成于研判
              </p>
              <p className="w-desc mt-4 max-w-md text-center text-[13px] leading-7 tracking-wider text-ink-600 opacity-0 [text-shadow:0_1px_10px_rgba(246,242,233,0.85)]">
                年报皆为原文呈现，风险皆有证据可溯 ——
                <br />
                一双慧眼，随你穿越云海，直抵真相之门。
              </p>
              <div className="w-hint mt-14 flex flex-col items-center gap-2 text-ink-500 opacity-0">
                <span className="text-[11px] tracking-[0.34em] [text-indent:0.34em]">向下滚动 · 穿云入门</span>
                <svg width="16" height="26" viewBox="0 0 16 26" className="animate-bounce">
                  <path d="M8 2v18m0 0l-5-5m5 5l5-5" stroke="currentColor" strokeWidth="1.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
            </div>
            <div className="w-side pointer-events-none absolute right-9 top-1/2 hidden -translate-y-1/2 select-none opacity-0 lg:block">
              <span className="vertical-rl font-kai text-sm tracking-[0.5em] text-ink-500/90 [text-shadow:0_1px_10px_rgba(246,242,233,0.8)]">
                云路漫漫 · 见微知著
              </span>
            </div>
          </div>
        </div>

        {/* 第二幕 · 朱砂印 · 启卷 */}
        <div
          ref={act2Ref}
          className="relative flex min-h-screen flex-col items-center justify-center bg-[linear-gradient(180deg,#f2e3c6_0%,#f6f2e9_26%)] px-6 py-16"
        >
          <p className="a2-rise font-kai text-sm tracking-[0.4em] text-ink-500 [text-indent:0.4em]">
            已至门前 · 落印启卷
          </p>

          {/* 朱砂印章 */}
          <div className="a2-rise group relative mt-10">
            <div className="absolute -inset-7 rounded-full bg-cinnabar-500/15 blur-2xl transition-all duration-700 group-hover:bg-cinnabar-500/30" />
            <button
              onClick={onPick}
              disabled={busy}
              className="relative flex h-36 w-36 items-center justify-center rounded-[1.6rem] bg-gradient-to-br from-cinnabar-500 to-cinnabar-700 text-paper-50 shadow-[0_22px_48px_-14px_rgba(158,58,38,0.6)] transition-all duration-300 hover:-translate-y-1 hover:rotate-1 hover:shadow-[0_30px_60px_-14px_rgba(158,58,38,0.7)] active:translate-y-0 active:rotate-0 disabled:cursor-wait disabled:opacity-90"
            >
              <span className="pointer-events-none absolute inset-[7px] rounded-[1.25rem] border border-paper-100/50" />
              {busy ? (
                <span className="flex flex-col items-center gap-2.5">
                  <Loader2 size={30} className="animate-spin" />
                  <span className="font-kai text-xs tracking-[0.24em]">求索中</span>
                </span>
              ) : (
                <span className="grid grid-cols-2 place-items-center gap-x-1.5 gap-y-1 font-song text-[1.75rem] font-semibold leading-none drop-shadow-sm">
                  <span>落</span><span>印</span><span>启</span><span>卷</span>
                </span>
              )}
            </button>
          </div>

          <p className="a2-rise mt-9 text-sm tracking-[0.2em] text-ink-600">
            {parsing
              ? parsing.fileTotal && parsing.fileTotal > 1
                ? `云路求索 · 卷宗 ${parsing.fileIndex}/${parsing.fileTotal} · 逐页解析 ${parsing.done}/${parsing.total || '…'}`
                : `云路求索 · 逐页解析 ${parsing.done}/${parsing.total || '…'}`
              : restoring
                ? '正在展卷恢复上次研判现场'
                : '点击落印，或直接将 PDF 年报（可多选多年）拖入此间云海'}
          </p>
          <p className="a2-rise mt-2 text-[11px] tracking-[0.26em] text-ink-400">
            溯于原文 · 察于细微 · 成于研判
          </p>

          {!busy && (
            <button
              onClick={onDemo}
              className="a2-rise mt-4 text-[11px] tracking-[0.2em] text-ink-400 underline decoration-ink-300 underline-offset-4 transition-colors hover:text-cinnabar-600"
            >
              未备卷宗 · 先览演示
            </button>
          )}

          {!busy && (
            <button
              onClick={onTrace}
              className="a2-rise mt-2.5 text-[11px] tracking-[0.2em] text-ink-400 underline decoration-ink-300 underline-offset-4 transition-colors hover:text-cinnabar-600"
              title="打开调研报告溯源：左侧报告，点击引证，右侧弹出网络原文并标红对应句"
            >
              研于网海 · 溯源调研报告
            </button>
          )}

          {!busy && (
            <button
              onClick={onNidu}
              className="a2-rise mt-2.5 text-[11px] tracking-[0.2em] text-ink-400 underline decoration-ink-300 underline-offset-4 transition-colors hover:text-cinnabar-600"
              title="打开逆读训练：先猜作者想干什么，再看作者真正怎么做——问题·判断·证据·推理·边界"
            >
              逆读训练 · 先猜再看作者怎么做
            </button>
          )}

          {busy && (
            <div className="a2-rise mt-6 h-px w-44 overflow-hidden bg-ink-200">
              <div className="h-full w-1/2 animate-[progress-slide_1.2s_ease-in-out_infinite] bg-cinnabar-500" />
            </div>
          )}

          {/* 续研卷宗 */}
          {!busy && history.length > 0 && (
            <div className="a2-rise mt-12 flex max-w-md flex-wrap items-center justify-center gap-2">
              <span className="text-[10px] tracking-[0.3em] text-ink-400">续研卷宗</span>
              {history.map((h) => (
                <span
                  key={h.id}
                  className="group flex items-center gap-1.5 rounded-full border border-ink-200 bg-paper-50/85 py-1.5 pl-4 pr-2 text-xs text-ink-600 shadow-sm transition-all hover:-translate-y-0.5 hover:border-cinnabar-300"
                >
                  <button onClick={() => onRestore(h.id)} className="max-w-[180px] truncate tracking-wide">
                    {h.companyName} · {Math.max(...h.fiscalYears)} 年报
                  </button>
                  <button
                    onClick={() => onDelete(h.id)}
                    className="rounded-full p-0.5 text-ink-300 opacity-0 transition-opacity hover:text-cinnabar-600 group-hover:opacity-100"
                    title="删除记录"
                  >
                    <Trash2 size={12} />
                  </button>
                </span>
              ))}
            </div>
          )}

          {/* 三能 */}
          <div className="a2-rise mt-16 grid w-full max-w-2xl grid-cols-1 gap-4 sm:grid-cols-3">
            {CAPS.map((c) => (
              <div
                key={c.title}
                className="rounded-xl border border-ink-200/70 bg-paper-50/75 p-5 text-center backdrop-blur-sm transition-all duration-300 hover:-translate-y-1 hover:border-cinnabar-300/70 hover:shadow-[0_16px_36px_-18px_rgba(60,45,20,0.4)]"
              >
                <div className="mx-auto flex h-9 w-9 items-center justify-center rounded-lg bg-cinnabar-600/10 font-song text-base text-cinnabar-700">
                  {c.icon}
                </div>
                <div className="mt-3 font-song text-sm font-semibold tracking-[0.18em] text-ink-800">{c.title}</div>
                <div className="mt-1.5 text-[11px] leading-5 text-ink-500">{c.desc}</div>
              </div>
            ))}
          </div>

          <div className="a2-rise mt-14 flex items-center gap-2 text-[10px] tracking-[0.3em] text-ink-300">
            <UploadCloud size={12} />
            <span>本地解析 · 卷宗不出此间</span>
            <CloudSun size={12} className="ml-2" />
            <span>见微 · 慧眼研报工作台</span>
          </div>
        </div>
      </div>
    </div>
  );
}
