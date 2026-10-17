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
 * ── 2026-10-15 P0 修复（相对上游 43c00d6:components/DotMatrix.tsx；逐行差异见 patches/0001-p0-scoped-keyframes.patch）──
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
 *
 * ── 视觉 / 状态参数（都可选，默认全部关闭 → 输出与 P0 修复版逐字节一致）──
 *   dotFill     点径比例（点直径 ÷ 格距；默认 4/6.5 ≈ 0.615，即原来的 DOT_R = 2.0）
 *   warmth      色温 0–1：0 = 用 --color-ink，1 = 暖白 #ffd9a0（color-mix，老浏览器自动降级）
 *   groupColors 逐组配色（如数值组用 --color-accent）→ 输出 .dm-c{k} 规则
 *   sweep       重组方向：col（默认）/ row / diag / radial / dissolve
 *   staggerMs   相邻列（行）的相位步进，默认 22ms
 *   persistence 余晖：给每个亮点加一个延后 ms、fill-opacity 变暗的副本
 *   gutter      两侧固定状态指示列（左：心跳；右：在线/离线），会占宽并让文字整体内缩
 *   state       "run"（默认）/ "idle"（待机：只留底点 + 中间行一个来回扫的脉冲）
 *   boot        开机自检：整屏先全亮，再按列逐列退回底点（一次性动画）
 *   label/lang  无障碍：aria-label 覆盖（默认 items.join(" / ")）与语言标注
 */
import type { CSSProperties, ReactNode } from "react";

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

/** 两侧固定状态指示列 */
export type DotMatrixGutter = {
  /** 左列「心跳」：3 个点自上而下循环点亮（默认 true） */
  heartbeat?: boolean;
  /** 右列在线指示：true = 常亮，false = 闪烁（离线/告警）；默认 true */
  online?: boolean;
};

/** 重组方向 */
export type DotMatrixSweep = "col" | "row" | "diag" | "radial" | "dissolve";

/** 5×7 字模（7 行 × 5 列，"1" = 亮点）。已含 A–Z、0–9、常用标点、几个 5×7 图标；
 *  未收录字符（含中文）会占 1 格宽度但不点亮。新增字形按同格式补即可。 */
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
  _: ["00000", "00000", "00000", "00000", "00000", "00000", "11111"],
  " ": ["00000", "00000", "00000", "00000", "00000", "00000", "00000"],
  ":": ["00000", "00100", "00100", "00000", "00100", "00100", "00000"],
  ",": ["00000", "00000", "00000", "00000", "00100", "00100", "01000"],
  "!": ["00100", "00100", "00100", "00100", "00100", "00000", "00100"],
  "?": ["01110", "10001", "00001", "00010", "00100", "00000", "00100"],
  "'": ["00100", "00100", "00000", "00000", "00000", "00000", "00000"],
  "/": ["00001", "00001", "00010", "00100", "01000", "10000", "10000"],
  "%": ["11000", "11000", "00001", "00010", "00100", "01011", "00011"],
  "+": ["00000", "00100", "00100", "11111", "00100", "00100", "00000"],
  "=": ["00000", "00000", "11111", "00000", "11111", "00000", "00000"],
  "*": ["00000", "10101", "01110", "11111", "01110", "10101", "00000"],
  "#": ["01010", "01010", "11111", "01010", "11111", "01010", "01010"],
  "@": ["01110", "10001", "10111", "10101", "10111", "10000", "01110"],
  "(": ["00010", "00100", "01000", "01000", "01000", "00100", "00010"],
  ")": ["01000", "00100", "00010", "00010", "00010", "00100", "01000"],
  "♥": ["00000", "01010", "11111", "11111", "01110", "00100", "00000"],
  "★": ["00100", "00100", "11111", "01110", "01110", "10001", "00000"],
  "↑": ["00100", "01110", "10101", "00100", "00100", "00100", "00000"],
  "↓": ["00000", "00100", "00100", "00100", "10101", "01110", "00100"],
  "→": ["00000", "00010", "00110", "11111", "00110", "00010", "00000"],
  "←": ["00000", "01000", "01100", "11111", "01100", "01000", "00000"],
  "✓": ["00000", "00000", "00001", "00010", "10100", "01100", "00000"],
  "♪": ["00111", "00110", "00100", "00100", "00100", "11100", "11100"],
  "●": ["00000", "01110", "11111", "11111", "11111", "01110", "00000"],
  "■": ["00000", "11111", "11111", "11111", "11111", "11111", "00000"],
};

const ROWS = 7;
const COLS_PER_CHAR = 5;
const CHAR_GAP = 1; // 字符间空列
const PITCH = 6.5; // 单格边长（viewBox 单位）
const DOT_R = 2.0; // 默认点半径（= dotFill 4/6.5）
/** 列相位延迟（ms）：重组扫掠从左到右 */
const COL_STEP_MS = 22;
/** 每组显示时长（ms）——注入的动画周期 = 组数 × ITEM_MS */
const ITEM_MS = 5000;
/** 状态指示列宽（列）与它到文字的空隙（列） */
const GUTTER_W = 1;
const GUTTER_GAP = 1;
/** 暖白（色温 1 时的目标色） */
const WARM = "#ffd9a0";

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

/** 确定性伪随机（mulberry32）：SSR 与客户端必须给出同一批错点/同一套溶解相位，故不用 Math.random */
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

function normalizeGutter(g?: boolean | DotMatrixGutter) {
  if (g === undefined || g === false) return { on: false, heartbeat: false, online: null as boolean | null };
  const o = g === true ? {} : g;
  return { on: true, heartbeat: o.heartbeat !== false, online: o.online === undefined ? true : o.online };
}

export default function DotMatrix({
  items,
  primary = 1,
  title,
  className,
  animate = "auto",
  glitch,
  label,
  lang,
  dotFill,
  warmth = 0,
  groupColors,
  sweep = "col",
  staggerMs = COL_STEP_MS,
  persistence = 0,
  gutter,
  state = "run",
  boot = false,
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
  /** 无障碍名称（默认 items.join(" / ")）；轮换内容对读屏是噪音时建议显式给一个语义化标签 */
  label?: string;
  /** aria 语言标注（如 "zh-CN"），影响读屏发音 */
  lang?: string;
  /** 点径比例 = 点直径 ÷ 格距（0.3–0.9），默认 0.615（= 原 DOT_R 2.0） */
  dotFill?: number;
  /** 色温 0–1：0 = 用 --color-ink，1 = 暖白；需要 color-mix 支持，老浏览器自动降级 */
  warmth?: number;
  /** 逐组配色（CSS 颜色值），如 ["#1a1a1a", "var(--color-accent)"]；空项用 --color-ink */
  groupColors?: (string | undefined)[];
  /** 重组方向：col（默认）/ row / diag / radial / dissolve（确定性溶解） */
  sweep?: DotMatrixSweep;
  /** 相邻列（行）的相位步进（ms），默认 22 */
  staggerMs?: number;
  /** 余晖：数字 = 延后 ms（默认不透明度 0.35）；对象可同时给 ms / opacity */
  persistence?: number | { ms?: number; opacity?: number };
  /** 两侧固定状态指示列（左心跳 / 右在线） */
  gutter?: boolean | DotMatrixGutter;
  /** "run"（默认）/ "idle"（待机：底点 + 中间行来回扫的脉冲，不显示内容） */
  state?: "run" | "idle";
  /** 开机自检：整屏先全亮，再按列逐列退回底点（一次性）。
   *  `true` 用默认节奏（fadeMs 520 / colStepMs 18）；也可传 { fadeMs, colStepMs } 调。 */
  boot?: boolean | { fadeMs?: number; colStepMs?: number };
}) {
  const list = items.length > 0 ? items : [""];
  const n = list.length;
  /** 是否启用动画：n ≥ 2 恒为真；n = 1 由 animate 决定 */
  const animated = n > 1 || animate === "always";
  /** 单组且启用动画 → 把「全组共用」的常亮点降级为动画点（否则 n = 1 时屏上没有任何动画元素） */
  const singleAnimated = animated && n === 1;
  /** 夹取定格组下标，避免 prefers-reduced-motion 下定格到不存在的组 → 整屏不可见 */
  const fixedPrimary = Math.min(Math.max(0, Math.trunc(primary)), n - 1);
  const gl = normalizeGlitch(glitch);
  const gu = normalizeGutter(gutter);
  const idle = state === "idle";
  const bootCfg: { fadeMs?: number; colStepMs?: number } = typeof boot === "object" ? boot : {};
  const bootOn = !!boot && !idle;
  /** 自检节奏：单点淡出时长 / 相邻列错峰 */
  const bootFade = Math.max(80, Math.round(bootCfg.fadeMs ?? 520));
  const bootStep = Math.max(0, Math.round(bootCfg.colStepMs ?? 18));

  /** 文字区宽度（不含两侧指示列） */
  const textCols = Math.max(COLS_PER_CHAR * 2, ...list.map((s) => (COLS_PER_CHAR + CHAR_GAP) * s.length - CHAR_GAP));
  const padL = gu.on ? GUTTER_W + GUTTER_GAP : 0;
  const padR = gu.on ? GUTTER_W + GUTTER_GAP : 0;
  const cols = textCols + padL + padR;
  /** 字模格位整体右移 padL 列（cell = col * ROWS + row） */
  const cellSets = list.map((s) => {
    const set = litCells(s, textCols);
    if (padL === 0) return set;
    const shifted = new Set<number>();
    for (const cell of set) shifted.add(cell + padL * ROWS);
    return shifted;
  });

  const cycle = n * ITEM_MS;
  const dotR = dotFill === undefined ? DOT_R : (PITCH * Math.min(0.9, Math.max(0.3, dotFill))) / 2;

  /* 重组相位：col（默认，与原实现一致）/ row / diag / radial / dissolve（确定性伪随机） */
  const delayOf = (() => {
    if (sweep === "row") return (cell: number) => (cell % ROWS) * staggerMs;
    if (sweep === "diag") return (cell: number) => (Math.floor(cell / ROWS) + (cell % ROWS)) * staggerMs;
    if (sweep === "radial") {
      const cx = (cols - 1) / 2;
      const cy = (ROWS - 1) / 2;
      return (cell: number) =>
        Math.round(Math.hypot(Math.floor(cell / ROWS) - cx, (cell % ROWS) - cy) * staggerMs);
    }
    if (sweep === "dissolve") {
      const rnd = mulberry32((gl.seed + 0x9e37) >>> 0);
      const arr: number[] = [];
      for (let cell = 0; cell < cols * ROWS; cell++) arr.push(Math.floor(rnd() * staggerMs * 14));
      return (cell: number) => arr[cell];
    }
    return (cell: number) => Math.floor(cell / ROWS) * staggerMs;
  })();

  /* 余晖参数：ms = 0 表示关闭 */
  const persistMs = typeof persistence === "number" ? Math.max(0, Math.round(persistence)) : Math.max(0, Math.round(persistence?.ms ?? 0));
  const persistOp = typeof persistence === "number" ? 0.35 : Math.min(1, Math.max(0.05, persistence?.opacity ?? 0.35));

  /* 逐组配色 / 色温：只有用到时才输出 .dm-c{k} 规则（默认路径保持逐字节不变） */
  const warm = Math.min(1, Math.max(0, warmth));
  const needGroupFill = warm > 0 || (groupColors?.some((c) => !!c) ?? false);
  const colorOf = (k: number) => groupColors?.[k] || "var(--color-ink)";
  const fillOf = (k: number) => (warm > 0 ? `color-mix(in srgb, ${colorOf(k)} ${Math.round((1 - warm) * 100)}%, ${WARM})` : colorOf(k));

  /* ---------- 错点（glitch） ---------- */
  const seg = 100 / n;
  const name = `dm-swap-${n}`;
  const scope = `.dm-n${n} `;
  const glitchDots: ReactNode[] = [];
  const victimShift = new Map<number, number>(); // cell * n + k → 额外延迟（缺孔）
  let glitchCss = "";
  if (gl.on && !idle) {
    const rnd = mulberry32(gl.seed);
    const perCycle = Math.max(1, Math.round(gl.density * textCols * ROWS));
    /** 每组可用的「错点」候选：本组未点亮、且不是全组共用的常亮点（指示列不参与） */
    const cands: number[][] = [];
    for (let k = 0; k < n; k++) {
      const cand: number[] = [];
      for (let c = padL; c < cols - padR; c++) {
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
              r={dotR}
              className={`dm-glitch dm-g${k}${gl.className ? ` ${gl.className}` : ""}`}
              style={{ animationDelay: `${(i % effP) * cycle + k * ITEM_MS + delayOf(cell)}ms` }}
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
      const gp = Math.min(99, (gl.holdMs / dur) * 100); // 错点窗口占动画周期的百分比
      const gName = `dm-glitch-${n}-${effP}`;
      glitchCss = `@keyframes ${gName} {
  0% { opacity: 1; }
  ${(gp * 0.45).toFixed(4)}% { opacity: 0.25; }
  ${(gp * 0.72).toFixed(4)}% { opacity: 0.9; }
  ${gp.toFixed(4)}% { opacity: 0; }
  100% { opacity: 0; }
}
${scope}.dm-glitch { fill: var(--dm-glitch-ink, var(--color-ink)); opacity: 0; animation: ${gName} ${dur}ms linear infinite; }
@media (prefers-reduced-motion: reduce) {
  ${scope}.dm-glitch { animation: none; opacity: 0; }
}`;
    }
  }

  /* ---------- 注入样式 ---------- */
  const offAt = Math.min(100, seg + 0.6); // 本组时段末尾的「熄灭」
  const withTail = 100 - 2.4 > seg - 0.2; // n ≥ 2 为真；n = 1 时与自身时段重叠 → 跳过
  const cssParts: string[] = [];
  cssParts.push(`@keyframes ${name} {
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
}`);
  cssParts.push(
    `${scope}.dm-item { fill: var(--color-ink); opacity: 0; animation: ${name} ${n * ITEM_MS}ms linear infinite; }`,
  );
  if (needGroupFill) {
    for (let k = 0; k < n; k++) {
      const plain = `${scope}.dm-c${k} { fill: ${colorOf(k)};`;
      cssParts.push(warm > 0 ? `${plain} fill: ${fillOf(k)}; }` : `${plain} }`);
    }
  }
  cssParts.push(`${scope}.dm-both { fill: var(--color-ink); }`);
  cssParts.push(`${scope}.dm-off { fill: var(--color-ink); opacity: 0.13; }`);
  if (persistMs > 0) cssParts.push(`${scope}.dm-after { fill-opacity: ${persistOp}; }`);

  /* 状态指示列 */
  if (gu.on) {
    const hb = `dm-hb-${n}`;
    cssParts.push(`@keyframes ${hb} {
  0%, 100% { opacity: 0.15; }
  18% { opacity: 1; }
  45% { opacity: 0.15; }
}`);
    if (gu.heartbeat) cssParts.push(`${scope}.dm-hb { fill: var(--color-ink); opacity: 0.15; animation: ${hb} 1200ms linear infinite; }`);
    if (gu.online !== null) {
      cssParts.push(`${scope}.dm-on { fill: var(--color-ink); }`);
      if (!gu.online) {
        const warn = `dm-warn-${n}`;
        cssParts.push(`@keyframes ${warn} {
  0%, 22% { opacity: 1; }
  23%, 44% { opacity: 0.12; }
  45%, 66% { opacity: 1; }
  67%, 100% { opacity: 0.12; }
}`);
        cssParts.push(`${scope}.dm-on-off { animation: ${warn} 1800ms linear infinite; }`);
      }
    }
  }

  /* 待机脉冲 */
  if (idle) {
    const idleName = `dm-idle-${n}`;
    cssParts.push(`@keyframes ${idleName} {
  0% { opacity: 0.13; }
  14% { opacity: 0.95; }
  30% { opacity: 0.13; }
  100% { opacity: 0.13; }
}`);
    cssParts.push(`${scope}.dm-idle { animation: ${idleName} 1600ms linear infinite; }`);
  }

  /* 开机自检 */
  if (bootOn) {
    const bootName = `dm-boot-${n}`;
    cssParts.push(`@keyframes ${bootName} {
  0% { opacity: 1; }
  100% { opacity: 0.13; }
}`);
    cssParts.push(`.dm-n${n}.dm-boot .dm-off { animation: ${bootName} ${bootFade}ms ease-out both; }`);
  }

  /* reduced-motion：定格 primary 组；新增的装饰动画一并停掉 */
  const rm: string[] = [`  ${scope}.dm-item { animation: none; }`, `  ${scope}.dm-primary { opacity: 1; }`];
  if (persistMs > 0) rm.push(`  ${scope}.dm-after { opacity: 0; }`);
  if (gu.on && gu.heartbeat) rm.push(`  ${scope}.dm-hb { animation: none; opacity: 0.6; }`);
  if (gu.on && gu.online === false) rm.push(`  ${scope}.dm-on-off { animation: none; opacity: 1; }`);
  if (idle) rm.push(`  ${scope}.dm-idle { animation: none; opacity: 0.13; }`);
  if (bootOn) rm.push(`  .dm-n${n}.dm-boot .dm-off { animation: none; opacity: 0.13; }`);
  cssParts.push(`@media (prefers-reduced-motion: reduce) {
${rm.join("\n")}
}`);

  const css = cssParts.join("\n") + glitchCss;

  /* ---------- 圆点 ---------- */
  const dots: ReactNode[] = [];
  const groupCls = (k: number) => (needGroupFill ? ` dm-c${k}` : "");
  if (idle) {
    for (let c = 0; c < cols; c++) {
      for (let r = 0; r < ROWS; r++) {
        const cell = c * ROWS + r;
        const pulse = r === 3 && c >= padL && c < cols - padR;
        dots.push(
          <circle
            key={`o${cell}`}
            cx={(c + 0.5) * PITCH}
            cy={(r + 0.5) * PITCH}
            r={dotR}
            className={pulse ? "dm-off dm-idle" : "dm-off"}
            style={pulse ? { animationDelay: `${(c - padL) * 40}ms` } : undefined}
          />,
        );
      }
    }
  } else {
    for (let c = 0; c < cols; c++) {
      for (let r = 0; r < ROWS; r++) {
        const cell = c * ROWS + r;
        const cx = (c + 0.5) * PITCH;
        const cy = (r + 0.5) * PITCH;
        const owners: number[] = [];
        for (let k = 0; k < n; k++) if (cellSets[k].has(cell)) owners.push(k);
        if (owners.length === 0) {
          // 全组都不含 → 底点（屏质感）
          dots.push(
            <circle
              key={`o${cell}`}
              cx={cx}
              cy={cy}
              r={dotR}
              className="dm-off"
              style={bootOn ? { animationDelay: `${c * bootStep}ms` } : undefined}
            />,
          );
        } else if (owners.length === n && !singleAnimated) {
          // 全组共用 → 常亮锚点（单组且开动画时不走这条，见 singleAnimated）
          dots.push(<circle key={`b${cell}`} cx={cx} cy={cy} r={dotR} className="dm-both" />);
        } else {
          for (const k of owners) {
            const delay = k * ITEM_MS + delayOf(cell) + (victimShift.get(cell * n + k) ?? 0);
            dots.push(
              <circle
                key={`i${cell}-${k}`}
                cx={cx}
                cy={cy}
                r={dotR}
                className={`dm-item dm-i${k}${k === fixedPrimary ? " dm-primary" : ""}${groupCls(k)}`}
                style={{ animationDelay: `${delay}ms` }}
              />,
            );
            if (persistMs > 0) {
              // 余晖：延后 persistMs 的暗副本，模拟荧光余辉（不参与 reduced-motion 定格）
              dots.push(
                <circle
                  key={`p${cell}-${k}`}
                  cx={cx}
                  cy={cy}
                  r={dotR}
                  className={`dm-item dm-after dm-i${k}${groupCls(k)}`}
                  style={{ animationDelay: `${delay + persistMs}ms` }}
                />,
              );
            }
          }
        }
      }
    }
  }

  /* ---------- 状态指示列 ---------- */
  const gutterDots: ReactNode[] = [];
  if (gu.on) {
    const leftCol = 0;
    const rightCol = cols - 1;
    if (gu.heartbeat) {
      [1, 3, 5].forEach((row, i) => {
        gutterDots.push(
          <circle
            key={`hb${row}`}
            cx={(leftCol + 0.5) * PITCH}
            cy={(row + 0.5) * PITCH}
            r={dotR}
            className="dm-hb"
            style={{ animationDelay: `${i * 400}ms` }}
          />,
        );
      });
    }
    if (gu.online !== null) {
      gutterDots.push(
        <circle
          key="on"
          cx={(rightCol + 0.5) * PITCH}
          cy={3.5 * PITCH}
          r={dotR}
          className={gu.online ? "dm-on" : "dm-on dm-on-off"}
        />,
      );
    }
  }

  const rootStyle: CSSProperties = { height: "auto" };
  return (
    <svg
      viewBox={`0 0 ${cols * PITCH} ${ROWS * PITCH}`}
      className={[className, `dm-n${n}`, bootOn ? "dm-boot" : ""].filter(Boolean).join(" ")}
      style={rootStyle}
      role="img"
      aria-label={label ?? list.join(" / ")}
      lang={lang}
    >
      <style>{css}</style>
      {title ? <title>{title}</title> : null}
      {dots}
      {gutterDots}
      {glitchDots}
    </svg>
  );
}
