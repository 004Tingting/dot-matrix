/**
 * 点阵屏（LED 矩阵风，零依赖纯 SVG + CSS 动画，2026-10-15；同日二稿改多组轮换）。
 *
 * 在若干组 5×7 字模间定时轮换（当前：STRIVE → 累计 tokens → 04TING.，每组 5s）：
 * 每个「亮点」按组相位（+5s）与列相位（+22ms）错峰，切换时旧组熄灭、新组亮起、
 * 两股扫掠同时进行——点阵小点在屏内「重组」。跨组共用的格位叠加多圈，各自按本组相位亮灭。
 *
 * 动画全部在 CSS（本组件注入 <style>：@keyframes 按组数生成 + .dm-item 规则），
 * no-JS 照常运转（SSR 即含 style）；prefers-reduced-motion 时定格显示 primary 组（数值）。
 *
 * ── 2026-10-15 P0 修复（相对站点版 ba1aa80；逐行差异见 patches/0001-p0-scoped-keyframes.patch）──
 * ① 样式作用域化：@keyframes 按组数命名（dm-swap-{n}），规则统一加 .dm-n{n} 前缀。
 *    旧版注入的是同名 dm-swap 与裸 .dm-item —— 那是**文档级**样式，同页第二个「组数不同」的实例
 *    会覆盖第一个（实测：2 组实例拿到 3 组的 15000ms，每个周期有 1/3 时间整屏空白）。
 *    同组数的实例注入内容完全相同，重复无害（想再省字节可按 n 去重，SSR 下收益不值得）。
 * ② 单组（n = 1）策略显式化：新增 animate。旧版 n = 1 时每个亮点都满足「全组共用」→ 退化为
 *    .dm-both，屏上**没有任何动画元素**（静态图，primary 无效）。现在 animate="always" 可让它同样带闪。
 * ③ primary 夹取到 [0, n-1]：避免 prefers-reduced-motion 定格到不存在的组 → 整屏不可见。
 * ④ n = 1 的关键帧不再产生 100.6% 越界帧与重复百分比（只在 animate="always" 的单组屏上生效）。
 * 几何、字模、相位与 n ≥ 2 的动画百分比与站点版完全一致（由 test/compare.html 逐节点校验）。
 */
import type { ReactNode } from "react";

/** 5×7 字模（7 行 × 5 列，"1" = 亮点）。已含 A–Z、0–9、'.'、'-'；新增字符按同格式补即可 */
const FONT: Record<string, string[]> = {
  A: ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
  B: ["11110", "10001", "10001", "11110", "10001", "10001", "11110"],
  C: ["01110", "10001", "10000", "10000", "10000", "10001", "01110"],
  D: ["11110", "10001", "10001", "10001", "10001", "10001", "11110"],
  E: ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
  F: ["11111", "10000", "10000", "11110", "10000", "10000", "10000"],
  G: ["01110", "10001", "10000", "10111", "10001", "10001", "01111"],
  H: ["10001", "10001", "10001", "11111", "10001", "10001", "10001"],
  I: ["11111", "00100", "00100", "00100", "00100", "00100", "11111"],
  J: ["00111", "00010", "00010", "00010", "00010", "10010", "01100"],
  K: ["10001", "10010", "10100", "11000", "10100", "10010", "10001"],
  L: ["10000", "10000", "10000", "10000", "10000", "10000", "11111"],
  M: ["10001", "11011", "10101", "10101", "10001", "10001", "10001"],
  N: ["10001", "11001", "10101", "10011", "10001", "10001", "10001"],
  O: ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
  P: ["11110", "10001", "10001", "11110", "10000", "10000", "10000"],
  Q: ["01110", "10001", "10001", "10001", "10101", "10010", "01101"],
  R: ["11110", "10001", "10001", "11110", "10100", "10010", "10001"],
  S: ["01111", "10000", "10000", "01110", "00001", "00001", "11110"],
  T: ["11111", "00100", "00100", "00100", "00100", "00100", "00100"],
  U: ["10001", "10001", "10001", "10001", "10001", "10001", "01110"],
  V: ["10001", "10001", "10001", "10001", "10001", "01010", "00100"],
  W: ["10001", "10001", "10001", "10101", "10101", "10101", "01010"],
  X: ["10001", "10001", "01010", "00100", "01010", "10001", "10001"],
  Y: ["10001", "10001", "01010", "00100", "00100", "00100", "00100"],
  Z: ["11111", "00001", "00010", "00100", "01000", "10000", "11111"],
  "0": ["01110", "10001", "10011", "10101", "11001", "10001", "01110"],
  "1": ["00100", "01100", "00100", "00100", "00100", "00100", "01110"],
  "2": ["01110", "10001", "00001", "00010", "00100", "01000", "11111"],
  "3": ["01110", "10001", "00001", "00110", "00001", "10001", "01110"],
  "4": ["00010", "00110", "01010", "10010", "11111", "00010", "00010"],
  "5": ["11111", "10000", "11110", "00001", "00001", "10001", "01110"],
  "6": ["00110", "01000", "10000", "11110", "10001", "10001", "01110"],
  "7": ["11111", "00001", "00010", "00100", "01000", "01000", "01000"],
  "8": ["01110", "10001", "10001", "01110", "10001", "10001", "01110"],
  "9": ["01110", "10001", "10001", "01111", "00001", "00010", "01100"],
  ".": ["00000", "00000", "00000", "00000", "00000", "00000", "00100"],
  "-": ["00000", "00000", "00000", "11111", "00000", "00000", "00000"],
};

const ROWS = 7;
const COLS_PER_CHAR = 5;
const CHAR_GAP = 1; // 字符间空列
const PITCH = 6.5; // 单格边长（viewBox 单位）
const DOT_R = 2.0;
/** 列相位延迟（ms）：重组扫掠从左到右 */
const COL_STEP_MS = 22;
/** 每组显示时长（ms）——注入的动画周期 = 组数 × ITEM_MS */
const ITEM_MS = 5000;

/** 文本 → 点亮格位集合（cell = col * ROWS + row；在 cols 宽度内水平居中） */
function litCells(text: string, cols: number): Set<number> {
  const out = new Set<number>();
  const chars = text.toUpperCase().split("");
  const width = chars.length * (COLS_PER_CHAR + CHAR_GAP) - CHAR_GAP;
  let cc = Math.floor((cols - width) / 2);
  for (const ch of chars) {
    const glyph = FONT[ch];
    if (glyph) {
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS_PER_CHAR; c++) {
          if (glyph[r][c] === "1") out.add((cc + c) * ROWS + r);
        }
      }
    }
    cc += COLS_PER_CHAR + CHAR_GAP;
  }
  return out;
}

export default function DotMatrix({
  items,
  primary = 1,
  title,
  className,
  animate = "auto",
}: {
  /** 轮换显示的内容（渲染自动大写；建议 ≤7 字符，超长会整体缩小） */
  items: string[];
  /** prefers-reduced-motion 时定格显示的组下标（自动夹取到 [0, 组数-1]） */
  primary?: number;
  /** 悬停提示（如「累计 6,623,213,267 tokens」） */
  title?: string;
  className?: string;
  /** 单组（组数 = 1）时的动画策略：auto = 静止（默认，与旧行为一致）/ always = 单组也带闪 / never = 强制静止 */
  animate?: "auto" | "always" | "never";
}) {
  const list = items.length > 0 ? items : [""];
  const n = list.length;
  /** 是否启用动画：n ≥ 2 恒为真；n = 1 由 animate 决定 */
  const animated = n > 1 || animate === "always";
  /** 单组且启用动画 → 把「全组共用」的常亮点降级为动画点（否则 n = 1 时屏上没有任何动画元素） */
  const singleAnimated = animated && n === 1;
  /** 夹取定格组下标，避免 prefers-reduced-motion 下定格到不存在的组 → 整屏不可见 */
  const fixedPrimary = Math.min(Math.max(0, Math.trunc(primary)), n - 1);
  const cols = Math.max(COLS_PER_CHAR * 2, ...list.map((s) => (COLS_PER_CHAR + CHAR_GAP) * s.length - CHAR_GAP));
  const cellSets = list.map((s) => litCells(s, cols));

  /* 注入动画：@keyframes 按组数命名（dm-swap-{n}）+ 规则加 .dm-n{n} 作用域，避免同页多实例互相覆盖。
     每组占周期 1/n；组末「带闪熄灭」、组首「带闪点亮」（后者是周期最后 2.4% 的一次预演，
     与下一轮的 0%→2.4% 相接）。n = 1 时自身时段已覆盖整个周期，跳过预演并夹住越界百分比。 */
  const seg = 100 / n;
  const name = `dm-swap-${n}`;
  const scope = `.dm-n${n} `;
  const offAt = Math.min(100, seg + 0.6); // 本组时段末尾的「熄灭」
  const withTail = 100 - 2.4 > seg - 0.2; // n ≥ 2 为真；n = 1 时与自身时段重叠 → 跳过
  const css = `@keyframes ${name} {
  0% { opacity: 0; }
  0.7% { opacity: 0.85; }
  1.5% { opacity: 0.25; }
  2.4% { opacity: 1; }
  ${(seg - 3.4).toFixed(1)}% { opacity: 1; }
  ${(seg - 2.4).toFixed(1)}% { opacity: 0.15; }
  ${(seg - 1.5).toFixed(1)}% { opacity: 1; }
  ${(seg - 0.2).toFixed(1)}% { opacity: 0.2; }
  ${offAt.toFixed(1)}% { opacity: 0; }${
    withTail
      ? `
  97.6% { opacity: 0; }
  98.4% { opacity: 0.85; }
  99.2% { opacity: 0.3; }
  100% { opacity: 1; }`
      : ""
  }
}
${scope}.dm-item { fill: var(--color-ink); opacity: 0; animation: ${name} ${n * ITEM_MS}ms linear infinite; }
${scope}.dm-both { fill: var(--color-ink); }
${scope}.dm-off { fill: var(--color-ink); opacity: 0.13; }
@media (prefers-reduced-motion: reduce) {
  ${scope}.dm-item { animation: none; }
  ${scope}.dm-primary { opacity: 1; }
}`;

  const dots: ReactNode[] = [];
  for (let c = 0; c < cols; c++) {
    for (let r = 0; r < ROWS; r++) {
      const cell = c * ROWS + r;
      const cx = (c + 0.5) * PITCH;
      const cy = (r + 0.5) * PITCH;
      const owners: number[] = [];
      for (let k = 0; k < n; k++) if (cellSets[k].has(cell)) owners.push(k);
      if (owners.length === 0) {
        // 全组都不含 → 底点（屏质感）
        dots.push(<circle key={`o${cell}`} cx={cx} cy={cy} r={DOT_R} className="dm-off" />);
      } else if (owners.length === n && !singleAnimated) {
        // 全组共用 → 常亮锚点（单组且开动画时不走这条，见 singleAnimated）
        dots.push(<circle key={`b${cell}`} cx={cx} cy={cy} r={DOT_R} className="dm-both" />);
      } else {
        for (const k of owners) {
          dots.push(
            <circle
              key={`i${cell}-${k}`}
              cx={cx}
              cy={cy}
              r={DOT_R}
              className={`dm-item dm-i${k}${k === fixedPrimary ? " dm-primary" : ""}`}
              style={{ animationDelay: `${k * ITEM_MS + c * COL_STEP_MS}ms` }}
            />,
          );
        }
      }
    }
  }

  return (
    <svg
      viewBox={`0 0 ${cols * PITCH} ${ROWS * PITCH}`}
      className={[className, `dm-n${n}`].filter(Boolean).join(" ")}
      style={{ height: "auto" }}
      role="img"
      aria-label={list.join(" / ")}
    >
      <style>{css}</style>
      {title ? <title>{title}</title> : null}
      {dots}
    </svg>
  );
}
