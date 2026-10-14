/*!
 * dot-matrix.js — 点阵屏（LED 矩阵风）零依赖渲染器 · vanilla JS 移植版
 *
 * 与 src/DotMatrix.tsx（React 版）行为一致：同一套 5×7 字模、同一几何常数、同一套由组数生成的
 * @keyframes、同一套错点轮次算法与同一批视觉/状态参数（由 test/react-parity.mjs 逐用例比对）。
 * 包含 2026-10-15 的 P0 修复：
 *   · 样式作用域化：@keyframes dm-swap-{n} + 规则前缀 .dm-n{n}（同页多实例不再互相覆盖）
 *   · 单组（n = 1）策略显式化：animate: "auto"（默认静止）| "always"（单组也带闪）| "never"
 *   · primary 自动夹取到 [0, 组数-1]；n = 1 的关键帧不再有越界/重复百分比
 * 无构建、无依赖，可直接 <script src> 引入，也可双击 demo/index.html 打开。
 *
 * 用法一（命令式）：
 *   const svg = DotMatrix.create(["STRIVE", "6.63B", "04Ting."], {
 *     primary: 1, title: "累计 6,629,904,321 tokens",
 *     groupColors: [undefined, "var(--color-accent)"],   // 数值组单独配色
 *     gutter: { heartbeat: true, online: true },          // 两侧状态指示列
 *     glitch: { density: 0.02, patterns: 8, seed: 3 },    // 错点效果
 *   });
 *   document.querySelector("#host").appendChild(svg);
 *
 * 用法二（声明式，自动挂载）：
 *   <div data-dot-matrix='["STRIVE","6.63B"]' data-primary="1"
 *        data-group-colors='[null,"var(--color-accent)"]' data-gutter='{"heartbeat":true}'
 *        data-glitch='{"density":0.02,"patterns":8}'></div>
 *
 * 依赖宿主页面的 CSS 变量 --color-ink（亮点/底点颜色），未定义时回退到 currentColor。
 */
(function (global) {
  "use strict";

  var SVG_NS = "http://www.w3.org/2000/svg";

  /** 5×7 字模（7 行 × 5 列，"1" = 亮点）。已含 A–Z、0–9、常用标点与几个 5×7 图标；
   *  未收录字符（含中文）会占 1 格宽度但不点亮。新增字形按同格式补即可。 */
  var FONT = {
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

  var ROWS = 7;
  var COLS_PER_CHAR = 5;
  var CHAR_GAP = 1; // 字符间空列
  var PITCH = 6.5; // 单格边长（viewBox 单位）
  var DOT_R = 2.0; // 默认点半径（= dotFill 4/6.5）
  /** 列相位延迟（ms）：重组扫掠从左到右 */
  var COL_STEP_MS = 22;
  /** 每组显示时长（ms）——注入的动画周期 = 组数 × ITEM_MS */
  var ITEM_MS = 5000;
  /** 状态指示列宽（列）与它到文字的空隙（列） */
  var GUTTER_W = 1;
  var GUTTER_GAP = 1;
  /** 暖白（色温 1 时的目标色） */
  var WARM = "#ffd9a0";

  function el(name) {
    return document.createElementNS(SVG_NS, name);
  }

  /** 文本 → 点亮格位集合（cell = col * ROWS + row；在 cols 宽度内水平居中） */
  function litCells(text, cols) {
    var out = new Set();
    var chars = String(text).toUpperCase().split("");
    var width = chars.length * (COLS_PER_CHAR + CHAR_GAP) - CHAR_GAP;
    var cc = Math.floor((cols - width) / 2);
    for (var i = 0; i < chars.length; i++) {
      var glyph = FONT[chars[i]];
      if (glyph) {
        for (var r = 0; r < ROWS; r++) {
          for (var c = 0; c < COLS_PER_CHAR; c++) {
            if (glyph[r][c] === "1") out.add((cc + c) * ROWS + r);
          }
        }
      }
      cc += COLS_PER_CHAR + CHAR_GAP;
    }
    return out;
  }

  /** 确定性伪随机（mulberry32）——与 src/DotMatrix.tsx 一致，保证同 seed 同输出 */
  function mulberry32(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /** 原地 Fisher–Yates 洗牌 */
  function shuffle(arr, rnd) {
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(rnd() * (i + 1));
      var t = arr[i];
      arr[i] = arr[j];
      arr[j] = t;
    }
    return arr;
  }

  function normalizeGlitch(g) {
    var o = typeof g === "number" ? { density: g } : g || {};
    var density = Math.min(1, Math.max(0, o.density == null ? 0 : o.density));
    var holes = Math.min(1, Math.max(0, o.holes == null ? 0 : o.holes));
    return {
      on: density > 0 || holes > 0,
      density: density,
      holes: holes,
      patterns: Math.max(1, Math.round(o.patterns == null ? 1 : o.patterns)),
      holdMs: Math.max(0, Math.round(o.holdMs == null ? 260 : o.holdMs)),
      seed: Math.round(o.seed == null ? 1 : o.seed) >>> 0,
      className: o.className,
    };
  }

  function normalizeGutter(g) {
    if (g === undefined || g === false) return { on: false, heartbeat: false, online: null };
    var o = g === true ? {} : g;
    return { on: true, heartbeat: o.heartbeat !== false, online: o.online === undefined ? true : o.online };
  }

  /** 错点：@keyframes 按 (组数, 轮次数) 命名并加 .dm-n{n} 作用域；规则同 src/DotMatrix.tsx */
  function buildGlitchCss(n, effP, holdMs, cycle) {
    var dur = effP * cycle;
    var gp = Math.min(99, (holdMs / dur) * 100);
    var gName = "dm-glitch-" + n + "-" + effP;
    return `@keyframes ${gName} {
  0% { opacity: 1; }
  ${(gp * 0.45).toFixed(4)}% { opacity: 0.25; }
  ${(gp * 0.72).toFixed(4)}% { opacity: 0.9; }
  ${gp.toFixed(4)}% { opacity: 0; }
  100% { opacity: 0; }
}
.dm-n${n} .dm-glitch { fill: var(--dm-glitch-ink, var(--color-ink)); opacity: 0; animation: ${gName} ${dur}ms linear infinite; }
@media (prefers-reduced-motion: reduce) {
  .dm-n${n} .dm-glitch { animation: none; opacity: 0; }
}`;
  }

  /** 主体动画规则（与 src/DotMatrix.tsx 同序）：keyframes → .dm-item → 逐组配色 → .dm-both → .dm-off。
      不含 reduced-motion 媒体块（它必须排在所有规则之后，见 buildReducedMotion）。 */
  function buildCssParts(n, fillParts) {
    var seg = 100 / n;
    var name = "dm-swap-" + n;
    var p = ".dm-n" + n + " ";
    var offAt = Math.min(100, seg + 0.6);
    var withTail = 100 - 2.4 > seg - 0.2;
    var tail = withTail
      ? `
  97.6% { opacity: 0; }
  98.4% { opacity: 0.85; }
  99.2% { opacity: 0.3; }
  100% { opacity: 1; }`
      : "";
    var out = [];
    out.push(`@keyframes ${name} {
  0% { opacity: 0; }
  0.7% { opacity: 0.85; }
  1.5% { opacity: 0.25; }
  2.4% { opacity: 1; }
  ${(seg - 3.4).toFixed(1)}% { opacity: 1; }
  ${(seg - 2.4).toFixed(1)}% { opacity: 0.15; }
  ${(seg - 1.5).toFixed(1)}% { opacity: 1; }
  ${(seg - 0.2).toFixed(1)}% { opacity: 0.2; }
  ${offAt.toFixed(1)}% { opacity: 0; }${tail}
}`);
    out.push(`${p}.dm-item { fill: var(--color-ink); opacity: 0; animation: ${name} ${n * ITEM_MS}ms linear infinite; }`);
    for (var i = 0; i < (fillParts || []).length; i++) out.push(fillParts[i]);
    out.push(`${p}.dm-both { fill: var(--color-ink); }`);
    out.push(`${p}.dm-off { fill: var(--color-ink); opacity: 0.13; }`);
    return out;
  }

  /** reduced-motion 媒体块（rmExtra = 追加行，已含缩进） */
  function buildReducedMotion(n, rmExtra) {
    var p = ".dm-n" + n + " ";
    var rm = ["  " + p + ".dm-item { animation: none; }", "  " + p + ".dm-primary { opacity: 1; }"].concat(rmExtra || []);
    return `@media (prefers-reduced-motion: reduce) {
${rm.join("\n")}
}`;
  }

  /** 主体动画 CSS 全文（默认路径 = 旧版逐字节一致） */
  function buildCss(n, rmExtra) {
    return buildCssParts(n, []).concat([buildReducedMotion(n, rmExtra)]).join("\n");
  }

  function dot(cx, cy, className, delayMs, r) {
    var c = el("circle");
    c.setAttribute("cx", cx);
    c.setAttribute("cy", cy);
    c.setAttribute("r", r === undefined ? DOT_R : r);
    c.setAttribute("class", className);
    if (delayMs !== undefined) c.setAttribute("style", `animation-delay:${delayMs}ms`);
    return c;
  }

  /**
   * 生成点阵屏 SVG 元素。
   * @param {string[]} items 轮换显示的内容（渲染自动大写；建议 ≤7 字符，超长整屏按宽度缩放）
   * @param {object} [options]
   *   primary       定格组下标（reduced-motion 用，自动夹取）
   *   title         悬停提示
   *   className     根节点额外 class
   *   animate       单组策略："auto"（默认）| "always" | "never"
   *   glitch        错点：{ density, patterns, holdMs, seed, holes, className }（默认关闭）
   *   label / lang  无障碍：aria-label 覆盖与语言标注
   *   dotFill       点径比例（点直径 ÷ 格距），默认 4/6.5
   *   warmth        色温 0–1（color-mix，老浏览器自动降级）
   *   groupColors   逐组配色数组（空项用 --color-ink）
   *   sweep         重组方向："col"（默认）| "row" | "diag" | "radial" | "dissolve"
   *   staggerMs     相位步进（ms），默认 22
   *   persistence   余晖：数字 = 延后 ms；或 { ms, opacity }
   *   gutter        两侧状态指示列：true 或 { heartbeat, online }
   *   state         "run"（默认）| "idle"
   *   boot          开机自检（一次性）
   */
  function create(items, options) {
    options = options || {};
    var list = items && items.length > 0 ? items.map(String) : [""];
    var n = list.length;
    var animated = n > 1 || options.animate === "always";
    var singleAnimated = animated && n === 1;
    var rawPrimary = options.primary === undefined || options.primary === null ? 1 : Number(options.primary);
    var primary = Math.min(Math.max(0, Math.trunc(rawPrimary) || 0), n - 1);
    var gl = normalizeGlitch(options.glitch);
    var gu = normalizeGutter(options.gutter);
    var idle = options.state === "idle";
    var bootOn = !!options.boot && !idle;

    var textCols = Math.max(
      COLS_PER_CHAR * 2,
      ...list.map(function (s) {
        return (COLS_PER_CHAR + CHAR_GAP) * s.length - CHAR_GAP;
      })
    );
    var padL = gu.on ? GUTTER_W + GUTTER_GAP : 0;
    var padR = gu.on ? GUTTER_W + GUTTER_GAP : 0;
    var cols = textCols + padL + padR;
    var cellSets = list.map(function (s) {
      var set = litCells(s, textCols);
      if (padL === 0) return set;
      var shifted = new Set();
      set.forEach(function (cell) {
        shifted.add(cell + padL * ROWS);
      });
      return shifted;
    });

    var cycle = n * ITEM_MS;
    var dotR = options.dotFill == null ? DOT_R : (PITCH * Math.min(0.9, Math.max(0.3, Number(options.dotFill)))) / 2;
    var staggerMs = options.staggerMs == null ? COL_STEP_MS : Number(options.staggerMs);
    var sweep = options.sweep || "col";

    /* 重组相位 */
    var delayOf;
    if (sweep === "row") delayOf = function (cell) { return (cell % ROWS) * staggerMs; };
    else if (sweep === "diag") delayOf = function (cell) { return (Math.floor(cell / ROWS) + (cell % ROWS)) * staggerMs; };
    else if (sweep === "radial") {
      var rcx = (cols - 1) / 2, rcy = (ROWS - 1) / 2;
      delayOf = function (cell) {
        return Math.round(Math.hypot(Math.floor(cell / ROWS) - rcx, (cell % ROWS) - rcy) * staggerMs);
      };
    } else if (sweep === "dissolve") {
      var drnd = mulberry32((gl.seed + 0x9e37) >>> 0);
      var darr = [];
      for (var dcell = 0; dcell < cols * ROWS; dcell++) darr.push(Math.floor(drnd() * staggerMs * 14));
      delayOf = function (cell) { return darr[cell]; };
    } else delayOf = function (cell) { return Math.floor(cell / ROWS) * staggerMs; };

    /* 余晖 */
    var persistMs = typeof options.persistence === "number"
      ? Math.max(0, Math.round(options.persistence))
      : Math.max(0, Math.round((options.persistence && options.persistence.ms) || 0));
    var persistOp = typeof options.persistence === "number"
      ? 0.35
      : Math.min(1, Math.max(0.05, (options.persistence && options.persistence.opacity) || 0.35));

    /* 逐组配色 / 色温 */
    var warm = Math.min(1, Math.max(0, Number(options.warmth) || 0));
    var groupColors = options.groupColors || [];
    var needGroupFill = warm > 0 || groupColors.some(function (c) { return !!c; });
    function colorOf(k) { return groupColors[k] || "var(--color-ink)"; }
    function fillOf(k) {
      return warm > 0 ? `color-mix(in srgb, ${colorOf(k)} ${Math.round((1 - warm) * 100)}%, ${WARM})` : colorOf(k);
    }

    /* ---------- 错点 ---------- */
    var seg = 100 / n;
    var name = "dm-swap-" + n;
    var scope = ".dm-n" + n + " ";
    var glitchDots = [];
    var victimShift = {};
    var glitchCss = "";
    if (gl.on && !idle) {
      var rnd = mulberry32(gl.seed);
      var perCycle = Math.max(1, Math.round(gl.density * textCols * ROWS));
      var cands = [];
      for (var gk = 0; gk < n; gk++) {
        var cand = [];
        for (var gc = padL; gc < cols - padR; gc++) {
          for (var gr = 0; gr < ROWS; gr++) {
            var gcell = gc * ROWS + gr;
            if (cellSets[gk].has(gcell)) continue;
            var shared = true;
            for (var gj = 0; gj < n; gj++) {
              if (!cellSets[gj].has(gcell)) { shared = false; break; }
            }
            if (!shared) cand.push(gcell);
          }
        }
        cands.push(shuffle(cand, rnd));
      }
      var minCand = Infinity;
      for (var mi = 0; mi < cands.length; mi++) minCand = Math.min(minCand, cands[mi].length);
      if (!isFinite(minCand)) minCand = 0;
      var effP = Math.max(1, Math.min(gl.patterns, Math.floor(minCand / perCycle) || 1));

      if (gl.density > 0 && effP > 0) {
        for (var k2 = 0; k2 < n; k2++) {
          var pool = Math.min(cands[k2].length, perCycle * effP);
          for (var pi = 0; pi < pool; pi++) {
            var pcell = cands[k2][pi];
            var pc = Math.floor(pcell / ROWS);
            var pr = pcell % ROWS;
            glitchDots.push(
              dot(
                (pc + 0.5) * PITCH,
                (pr + 0.5) * PITCH,
                `dm-glitch dm-g${k2}${gl.className ? " " + gl.className : ""}`,
                (pi % effP) * cycle + k2 * ITEM_MS + delayOf(pcell),
                dotR
              )
            );
          }
        }
      }

      if (gl.holes > 0) {
        for (var hk = 0; hk < n; hk++) {
          var own = [];
          cellSets[hk].forEach(function (hcell) {
            var sh = true;
            for (var hj = 0; hj < n; hj++) {
              if (!cellSets[hj].has(hcell)) { sh = false; break; }
            }
            if (!sh) own.push(hcell);
          });
          shuffle(own, rnd);
          var hcount = Math.max(1, Math.round(gl.holes * own.length));
          for (var hi = 0; hi < Math.min(hcount, own.length); hi++) victimShift[own[hi] * n + hk] = gl.holdMs;
        }
      }

      if (glitchDots.length > 0) glitchCss = buildGlitchCss(n, effP, gl.holdMs, cycle);
    }

    /* ---------- 样式 ---------- */
    var rmExtra = [];
    if (persistMs > 0) rmExtra.push(`  ${scope}.dm-after { opacity: 0; }`);
    if (gu.on && gu.heartbeat) rmExtra.push(`  ${scope}.dm-hb { animation: none; opacity: 0.6; }`);
    if (gu.on && gu.online === false) rmExtra.push(`  ${scope}.dm-on-off { animation: none; opacity: 1; }`);
    if (idle) rmExtra.push(`  ${scope}.dm-idle { animation: none; opacity: 0.13; }`);
    if (bootOn) rmExtra.push(`  .dm-n${n}.dm-boot .dm-off { animation: none; opacity: 0.13; }`);

    var fillParts = [];
    if (needGroupFill) {
      for (var fk = 0; fk < n; fk++) {
        fillParts.push(warm > 0
          ? `${scope}.dm-c${fk} { fill: ${colorOf(fk)}; fill: ${fillOf(fk)}; }`
          : `${scope}.dm-c${fk} { fill: ${colorOf(fk)}; }`);
      }
    }

    var parts = buildCssParts(n, fillParts);
    if (persistMs > 0) parts.push(`${scope}.dm-after { fill-opacity: ${persistOp}; }`);
    if (gu.on) {
      var hb = "dm-hb-" + n;
      parts.push(`@keyframes ${hb} {
  0%, 100% { opacity: 0.15; }
  18% { opacity: 1; }
  45% { opacity: 0.15; }
}`);
      if (gu.heartbeat) parts.push(`${scope}.dm-hb { fill: var(--color-ink); opacity: 0.15; animation: ${hb} 1200ms linear infinite; }`);
      if (gu.online !== null) {
        parts.push(`${scope}.dm-on { fill: var(--color-ink); }`);
        if (!gu.online) {
          var warn = "dm-warn-" + n;
          parts.push(`@keyframes ${warn} {
  0%, 22% { opacity: 1; }
  23%, 44% { opacity: 0.12; }
  45%, 66% { opacity: 1; }
  67%, 100% { opacity: 0.12; }
}`);
          parts.push(`${scope}.dm-on-off { animation: ${warn} 1800ms linear infinite; }`);
        }
      }
    }
    if (idle) {
      var idleName = "dm-idle-" + n;
      parts.push(`@keyframes ${idleName} {
  0% { opacity: 0.13; }
  14% { opacity: 0.95; }
  30% { opacity: 0.13; }
  100% { opacity: 0.13; }
}`);
      parts.push(`${scope}.dm-idle { animation: ${idleName} 1600ms linear infinite; }`);
    }
    if (bootOn) {
      var bootName = "dm-boot-" + n;
      parts.push(`@keyframes ${bootName} {
  0% { opacity: 1; }
  100% { opacity: 0.13; }
}`);
      parts.push(`.dm-n${n}.dm-boot .dm-off { animation: ${bootName} 520ms ease-out both; }`);
    }
    /* reduced-motion 媒体块必须排在所有规则之后（与 React 版同序） */
    parts.push(buildReducedMotion(n, rmExtra));
    var css = parts.join("\n") + glitchCss;

    /* ---------- 根节点 ---------- */
    var svg = el("svg");
    svg.setAttribute("viewBox", `0 0 ${cols * PITCH} ${ROWS * PITCH}`);
    svg.setAttribute("class", [options.className, "dm-n" + n, bootOn ? "dm-boot" : ""].filter(Boolean).join(" "));
    svg.setAttribute("style", "height:auto");
    svg.setAttribute("role", "img");
    svg.setAttribute("aria-label", options.label == null ? list.join(" / ") : String(options.label));
    if (options.lang != null) svg.setAttribute("lang", String(options.lang));

    var styleEl = el("style");
    styleEl.textContent = css;
    svg.appendChild(styleEl);

    if (options.title) {
      var titleEl = el("title");
      titleEl.textContent = options.title;
      svg.appendChild(titleEl);
    }

    /* ---------- 圆点 ---------- */
    function groupCls(k) { return needGroupFill ? " dm-c" + k : ""; }
    if (idle) {
      for (var ic = 0; ic < cols; ic++) {
        for (var ir = 0; ir < ROWS; ir++) {
          var icell = ic * ROWS + ir;
          var pulse = ir === 3 && ic >= padL && ic < cols - padR;
          svg.appendChild(
            dot((ic + 0.5) * PITCH, (ir + 0.5) * PITCH,
              pulse ? "dm-off dm-idle" : "dm-off",
              pulse ? (ic - padL) * 40 : undefined, dotR)
          );
        }
      }
    } else {
      for (var c = 0; c < cols; c++) {
        for (var r = 0; r < ROWS; r++) {
          var cell = c * ROWS + r;
          var cx = (c + 0.5) * PITCH;
          var cy = (r + 0.5) * PITCH;
          var owners = [];
          for (var k = 0; k < n; k++) if (cellSets[k].has(cell)) owners.push(k);
          if (owners.length === 0) {
            svg.appendChild(dot(cx, cy, "dm-off", bootOn ? c * 18 : undefined, dotR));
          } else if (owners.length === n && !singleAnimated) {
            svg.appendChild(dot(cx, cy, "dm-both", undefined, dotR));
          } else {
            for (var j = 0; j < owners.length; j++) {
              var o = owners[j];
              var delay = o * ITEM_MS + delayOf(cell) + (victimShift[cell * n + o] || 0);
              svg.appendChild(
                dot(cx, cy, `dm-item dm-i${o}${o === primary ? " dm-primary" : ""}${groupCls(o)}`, delay, dotR)
              );
              if (persistMs > 0) {
                svg.appendChild(
                  dot(cx, cy, `dm-item dm-after dm-i${o}${groupCls(o)}`, delay + persistMs, dotR)
                );
              }
            }
          }
        }
      }
    }

    /* ---------- 状态指示列 ---------- */
    if (gu.on) {
      if (gu.heartbeat) {
        [1, 3, 5].forEach(function (row, i) {
          svg.appendChild(dot(0.5 * PITCH, (row + 0.5) * PITCH, "dm-hb", i * 400, dotR));
        });
      }
      if (gu.online !== null) {
        svg.appendChild(
          dot((cols - 0.5) * PITCH, 3.5 * PITCH, gu.online ? "dm-on" : "dm-on dm-on-off", undefined, dotR)
        );
      }
    }

    for (var gi = 0; gi < glitchDots.length; gi++) svg.appendChild(glitchDots[gi]);
    return svg;
  }

  /** 把页面里所有 [data-dot-matrix] 占位元素替换为点阵屏（幂等） */
  function mount(root) {
    var scope = root || document;
    var hosts = scope.querySelectorAll("[data-dot-matrix]");
    function json(attr, fallback) {
      if (attr == null || attr === "") return fallback;
      try {
        return JSON.parse(attr);
      } catch (e) {
        return fallback;
      }
    }
    for (var i = 0; i < hosts.length; i++) {
      var host = hosts[i];
      if (host.getAttribute("data-dm-mounted")) continue;
      var raw = host.getAttribute("data-dot-matrix") || "[]";
      var items;
      try {
        items = JSON.parse(raw);
      } catch (e) {
        items = raw.split(",").map(function (s) { return s.trim(); }).filter(Boolean);
      }
      var primary = host.getAttribute("data-primary");
      var animate = host.getAttribute("data-animate");
      var stagger = host.getAttribute("data-stagger");
      var persistence = host.getAttribute("data-persistence");
      var warmth = host.getAttribute("data-warmth");
      var dotFill = host.getAttribute("data-dot-fill");
      host.appendChild(
        create(items, {
          primary: primary === null ? undefined : Number(primary),
          title: host.getAttribute("data-title") || undefined,
          className: host.getAttribute("data-class") || undefined,
          animate: animate || undefined,
          label: host.getAttribute("data-label") || undefined,
          lang: host.getAttribute("data-lang") || undefined,
          dotFill: dotFill === null ? undefined : Number(dotFill),
          warmth: warmth === null ? undefined : Number(warmth),
          groupColors: json(host.getAttribute("data-group-colors"), undefined),
          sweep: host.getAttribute("data-sweep") || undefined,
          staggerMs: stagger === null ? undefined : Number(stagger),
          persistence: json(persistence, persistence === null ? undefined : Number(persistence)),
          gutter: json(host.getAttribute("data-gutter"), undefined),
          state: host.getAttribute("data-state") || undefined,
          boot: host.hasAttribute("data-boot"),
          glitch: json(host.getAttribute("data-glitch"), undefined),
        })
      );
      host.setAttribute("data-dm-mounted", "1");
    }
  }

  var api = {
    create: create,
    mount: mount,
    litCells: litCells,
    buildCss: buildCss,
    buildGlitchCss: buildGlitchCss,
    mulberry32: mulberry32,
    FONT: FONT,
    ROWS: ROWS,
    COLS_PER_CHAR: COLS_PER_CHAR,
    CHAR_GAP: CHAR_GAP,
    PITCH: PITCH,
    DOT_R: DOT_R,
    COL_STEP_MS: COL_STEP_MS,
    ITEM_MS: ITEM_MS,
    GUTTER_W: GUTTER_W,
    GUTTER_GAP: GUTTER_GAP,
  };

  if (typeof module === "object" && module.exports) module.exports = api;
  global.DotMatrix = api;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      mount();
    });
  } else {
    mount();
  }
})(typeof window !== "undefined" ? window : globalThis);
