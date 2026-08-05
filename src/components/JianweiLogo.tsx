/**
 * 见微 Logo：笔墨眼形 + 朱砂印
 * 上眼睑重笔、下眼睑轻笔，取「察于细微」之意；右上角一点朱砂印。
 */
export default function JianweiLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 56 56" className={className} role="img" aria-label="见微">
      {/* 上眼睑 · 重笔 */}
      <path
        d="M6 28 C16 13, 40 13, 50 28"
        fill="none"
        stroke="#2c2a26"
        strokeWidth="4.6"
        strokeLinecap="round"
      />
      {/* 下眼睑 · 轻笔 */}
      <path
        d="M6 28 C16 42.5, 40 42.5, 50 28"
        fill="none"
        stroke="#2c2a26"
        strokeWidth="2.1"
        strokeLinecap="round"
        opacity="0.7"
      />
      {/* 瞳 */}
      <circle cx="28" cy="28" r="7.4" fill="#2c2a26" />
      <circle cx="30.6" cy="25.4" r="2.2" fill="#f6f2e9" />
      {/* 朱砂印 */}
      <circle cx="46.5" cy="10.5" r="3.4" fill="#b0492f" />
    </svg>
  );
}
