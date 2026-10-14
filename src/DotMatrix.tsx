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
 *
 * ── 错点效果（glitch，默认关闭）──
 * 模拟 LED 屏刷新后残留的鬼点：每次切换后多亮出一批「不属于本内容」的点，闪烁一下后熄灭。
 *   density  = 每次切换后错点数占整屏格位的比例（错点的「多少」）
 *   patterns = 错点集合多少轮切换才重复一次（1 = 每次都一样，越大每次越不一样 = 「随机性」）
 *   holdMs   = 错点存活时长（亮起到「再次闪烁」熄灭）
 *   seed     = 换一组错点的「性格」（同 seed 输出逐字节一致，SSR/hydration 安全）
 *   holes    = 正确点里「先缺后补」的比例（可选，不随 patterns 轮换）
 * 错点集合由「轮次」决定：每个候选点只在第 p 轮亮起，错点动画时长 = patterns × 周期，
 * 因此 density 与 patterns 相互独立，且完全不引入 JS（no-JS / SSR / reduced-motion 行为见 docs/glitch.md）。
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

/** 错点（glitch）效果参数：模拟 LED 屏刷新后残留的鬼点，第二次闪烁才纠正 */
export type DotMatrixGlitch = {
  /** 每次切换后错点数占整屏格位的比例（0–1）；0 或不传 = 关闭 */
  density?: number;
  /** 错点集合多少轮切换才重复一次（≥1）：1 = 每次都是同一批点，越大每次越不一样（=随机性） */
  patterns?: number;
  /** 错点存活时长（ms）：从亮起到「再次闪烁」熄灭，默认 260 */
  holdMs?: number;
  /** 换一组错点的「性格」；同 seed 输出完全一致（SSR 与 hydration 安全） */
  seed?: number;
  /** 正确点里「先缺后补」的比例（0–1），默认 0；不随 patterns 轮换 */
  holes?: number;
  /** 追加到错点元素上的 class（也可用 CSS 变量 --dm-glitch-ink 改色） */
  className?: string;
};

/** 确定性伪随机（mulberry32）：SSR 与客户端必须给出同一批错点，故不用 Math.random */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 原地 Fisher–Yates 洗牌 */
function shuffle<T>(arr: T[], rnd: () => number) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    const t = arr[i];
    arr[i] = arr[j];
    arr[j] = t;
  }
  return arr;
}

function normalizeGlitch(g?: DotMatrixGlitch | number) {
  const o = typeof g === "number" ? { density: g } : g || {};
  const density = Math.min(1, Math.max(0, o.density ?? 0));
  const holes = Math.min(1, Math.max(0, o.holes ?? 0));
  return {
    on: density > 0 || holes > 0,
    density,
    holes,
    patterns: Math.max(1, Math.round(o.patterns ?? 1)),
    holdMs: Math.max(0, Math.round(o.holdMs ?? 260)),
    seed: Math.round(o.seed ?? 1) >>> 0,
    className: o.className,
  };
}

export default function DotMatrix({
  items,
  primary = 1,
  title,
  className,
  animate = "auto",
  glitch,
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
  /** 错点效果（默认关闭；传数字等价于 { density }） */
  glitch?: DotMatrixGlitch | number;
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
  const gl = normalizeGlitch(glitch);
  const cycle = n * ITEM_MS;

  /* 注入动画：@keyframes 按组数命名（dm-swap-{n}）+ 规则加 .dm-n{n} 作用域，避免同页多实例互相覆盖。
     每组占周期 1/n；组末「带闪熄灭」、组首「带闪点亮」（后者是周期最后 2.4% 的一次预演，
     与下一轮的 0%→2.4% 相接）。n = 1 时自身时段已覆盖整个周期，跳过预演并夹住越界百分比。 */
  const seg = 100 / n;
  const name = `dm-swap-${n}`;
  const scope = `.dm-n${n} `;
  const offAt = Math.min(100, seg + 0.6); // 本组时段末尾的「熄灭」
  const withTail = 100 - 2.4 > seg - 0.2; // n ≥ 2 为真；n = 1 时与自身时段重叠 → 跳过
  const baseCss = `@keyframes ${name} {
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

  /* ---------- 错点（glitch） ----------
     每组在自己的时段开始时，多亮出一批「不属于本组」的点，闪烁一下后熄灭 → 恢复正确显示。
     错点集合按「轮次」轮换：每个候选点被分配一个轮次 p ∈ [0, effP)，只在第 p 轮亮起，
     因此每轮换一批点、effP 轮后重复（patterns = 1 即每次都一样，越大越随机）。
     候选点数量固定为「每轮 perCycle 个」× effP，所以 density 与 patterns 相互独立。
     错点动画时长 = effP × 周期，延迟 = p × 周期 + 组相位 + 列相位，纯 CSS、no-JS、SSR 一致。 */
  const glitchDots: ReactNode[] = [];
  let glitchCss = "";
  const victimShift = new Map<number, number>(); // cell * n + k → 额外延迟（缺孔）
  if (gl.on) {
    const rnd = mulberry32(gl.seed);
    const perCycle = Math.max(1, Math.round(gl.density * cols * ROWS));
    /** 每组可用的「错点」候选：本组未点亮、且不是全组共用的常亮点 */
    const cands: number[][] = [];
    for (let k = 0; k < n; k++) {
      const cand: number[] = [];
      for (let c = 0; c < cols; c++) {
        for (let r = 0; r < ROWS; r++) {
          const cell = c * ROWS + r;
          if (cellSets[k].has(cell)) continue;
          let shared = true;
          for (let j = 0; j < n; j++) {
            if (!cellSets[j].has(cell)) {
              shared = false;
              break;
            }
          }
          if (!shared) cand.push(cell);
        }
      }
      cands.push(shuffle(cand, rnd));
    }
    /* 有效轮次数：受候选点数量限制（点太少就轮不开），全组取同一个值以共用一份 keyframes */
    const minCand = cands.reduce((m, c) => Math.min(m, c.length), Infinity);
    const effP = Math.max(1, Math.min(gl.patterns, Math.floor((Number.isFinite(minCand) ? minCand : 0) / perCycle) || 1));

    if (gl.density > 0 && effP > 0) {
      for (let k = 0; k < n; k++) {
        const pool = Math.min(cands[k].length, perCycle * effP);
        for (let i = 0; i < pool; i++) {
          const cell = cands[k][i];
          const c = Math.floor(cell / ROWS);
          const r = cell % ROWS;
          glitchDots.push(
            <circle
              key={`g${cell}-${k}`}
              cx={(c + 0.5) * PITCH}
              cy={(r + 0.5) * PITCH}
              r={DOT_R}
              className={`dm-glitch dm-g${k}${gl.className ? ` ${gl.className}` : ""}`}
              style={{ animationDelay: `${(i % effP) * cycle + k * ITEM_MS + c * COL_STEP_MS}ms` }}
            />,
          );
        }
      }
    }

    /* 缺孔：把本组自己的点延后 holdMs → 先缺后补（不随 patterns 轮换，见 docs/glitch.md） */
    if (gl.holes > 0) {
      for (let k = 0; k < n; k++) {
        const own: number[] = [];
        for (const cell of cellSets[k]) {
          let shared = true;
          for (let j = 0; j < n; j++) {
            if (!cellSets[j].has(cell)) {
              shared = false;
              break;
            }
          }
          if (!shared) own.push(cell);
        }
        shuffle(own, rnd);
        const count = Math.max(1, Math.round(gl.holes * own.length));
        for (const cell of own.slice(0, count)) victimShift.set(cell * n + k, gl.holdMs);
      }
    }

    if (glitchDots.length > 0) {
      const dur = effP * cycle;
      const g = Math.min(99, (gl.holdMs / dur) * 100); // 错点窗口占动画周期的百分比
      const gName = `dm-glitch-${n}-${effP}`;
      glitchCss = `@keyframes ${gName} {
  0% { opacity: 1; }
  ${(g * 0.45).toFixed(4)}% { opacity: 0.25; }
  ${(g * 0.72).toFixed(4)}% { opacity: 0.9; }
  ${g.toFixed(4)}% { opacity: 0; }
  100% { opacity: 0; }
}
${scope}.dm-glitch { fill: var(--dm-glitch-ink, var(--color-ink)); opacity: 0; animation: ${gName} ${dur}ms linear infinite; }
@media (prefers-reduced-motion: reduce) {
  ${scope}.dm-glitch { animation: none; opacity: 0; }
}`;
    }
  }
  const css = baseCss + glitchCss;

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
              style={{ animationDelay: `${k * ITEM_MS + c * COL_STEP_MS + (victimShift.get(cell * n + k) ?? 0)}ms` }}
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
      {glitchDots}
    </svg>
  );
}
