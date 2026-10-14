/*!
 * dot-matrix.js — 点阵屏（LED 矩阵风）零依赖渲染器 · vanilla JS 移植版
 *
 * 与 src/DotMatrix.tsx（React 版）行为一致：同一套 5×7 字模、同一几何常数、同一套由组数生成的
 * @keyframes（见 test/compare.html 的对照校验），并同样包含 2026-10-15 的 P0 修复：
 *   · 样式作用域化：@keyframes dm-swap-{n} + 规则前缀 .dm-n{n}（同页多实例不再互相覆盖）
 *   · 单组（n = 1）策略显式化：animate: "auto"（默认静止）| "always"（单组也带闪）| "never"
 *   · primary 自动夹取到 [0, 组数-1]；n = 1 的关键帧不再有越界/重复百分比
 * 无构建、无依赖，可直接 <script src> 引入，也可双击 demo/index.html 打开。
 *
 * 用法一（命令式）：
 *   const svg = DotMatrix.create(["STRIVE", "6.63B", "04Ting."], { primary: 1, title: "累计 6,629,904,321 tokens" });
 *   document.querySelector("#host").appendChild(svg);
 *
 * 用法二（声明式，自动挂载）：
 *   <div data-dot-matrix='["STRIVE","6.63B"]' data-primary="1" data-title="累计 …"></div>
 *
 * 依赖宿主页面的 CSS 变量 --color-ink（亮点/底点颜色），未定义时回退到 currentColor。
 */
(function (global) {
  "use strict";

  var SVG_NS = "http://www.w3.org/2000/svg";

  /** 5×7 字模（7 行 × 5 列，"1" = 亮点）。已含 A–Z、0–9、'.'、'-'；新增字符按同格式补即可 */
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
  };

  var ROWS = 7;
  var COLS_PER_CHAR = 5;
  var CHAR_GAP = 1; // 字符间空列
  var PITCH = 6.5; // 单格边长（viewBox 单位）
  var DOT_R = 2.0;
  /** 列相位延迟（ms）：重组扫掠从左到右 */
  var COL_STEP_MS = 22;
  /** 每组显示时长（ms）——注入的动画周期 = 组数 × ITEM_MS */
  var ITEM_MS = 5000;

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

  /** 注入动画：@keyframes 按组数命名（dm-swap-{n}）+ 规则加 .dm-n{n} 作用域 —— 与 src/DotMatrix.tsx 一致。
      每组占周期 1/n；组末「带闪熄灭」、组首「带闪点亮」（后者是周期最后 2.4% 的预演，与下一轮 0%→2.4% 相接）。
      n = 1 时自身时段已覆盖整个周期：跳过预演，并把越界的 seg+0.6 夹到 100%。 */
  function buildCss(n) {
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
    return `@keyframes ${name} {
  0% { opacity: 0; }
  0.7% { opacity: 0.85; }
  1.5% { opacity: 0.25; }
  2.4% { opacity: 1; }
  ${(seg - 3.4).toFixed(1)}% { opacity: 1; }
  ${(seg - 2.4).toFixed(1)}% { opacity: 0.15; }
  ${(seg - 1.5).toFixed(1)}% { opacity: 1; }
  ${(seg - 0.2).toFixed(1)}% { opacity: 0.2; }
  ${offAt.toFixed(1)}% { opacity: 0; }${tail}
}
${p}.dm-item { fill: var(--color-ink); opacity: 0; animation: ${name} ${n * ITEM_MS}ms linear infinite; }
${p}.dm-both { fill: var(--color-ink); }
${p}.dm-off { fill: var(--color-ink); opacity: 0.13; }
@media (prefers-reduced-motion: reduce) {
  ${p}.dm-item { animation: none; }
  ${p}.dm-primary { opacity: 1; }
}`;
  }

  function dot(cx, cy, className, delayMs) {
    var c = el("circle");
    c.setAttribute("cx", cx);
    c.setAttribute("cy", cy);
    c.setAttribute("r", DOT_R);
    c.setAttribute("class", className);
    if (delayMs !== undefined) c.setAttribute("style", `animation-delay:${delayMs}ms`);
    return c;
  }

  /**
   * 生成点阵屏 SVG 元素。
   * @param {string[]} items 轮换显示的内容（渲染自动大写；建议 ≤7 字符，超长整屏按宽度缩放）
   * @param {{primary?:number,title?:string,className?:string,animate?:"auto"|"always"|"never"}} [options]
   *        primary — prefers-reduced-motion 时定格显示的组下标（自动夹取到 [0, 组数-1]）
   *        animate — 单组（组数 = 1）时的策略：auto = 静止（默认）/ always = 单组也带闪 / never = 强制静止
   */
  function create(items, options) {
    options = options || {};
    var list = items && items.length > 0 ? items.map(String) : [""];
    var n = list.length;
    var animated = n > 1 || options.animate === "always";
    var singleAnimated = animated && n === 1;
    var rawPrimary = options.primary === undefined || options.primary === null ? 1 : Number(options.primary);
    var primary = Math.min(Math.max(0, Math.trunc(rawPrimary) || 0), n - 1);
    var cols = Math.max(
      COLS_PER_CHAR * 2,
      ...list.map(function (s) {
        return (COLS_PER_CHAR + CHAR_GAP) * s.length - CHAR_GAP;
      })
    );
    var cellSets = list.map(function (s) {
      return litCells(s, cols);
    });

    var svg = el("svg");
    svg.setAttribute("viewBox", `0 0 ${cols * PITCH} ${ROWS * PITCH}`);
    svg.setAttribute("class", [options.className, "dm-n" + n].filter(Boolean).join(" "));
    svg.setAttribute("style", "height:auto");
    svg.setAttribute("role", "img");
    svg.setAttribute("aria-label", list.join(" / "));

    var styleEl = el("style");
    styleEl.textContent = buildCss(n);
    svg.appendChild(styleEl);

    if (options.title) {
      var titleEl = el("title");
      titleEl.textContent = options.title;
      svg.appendChild(titleEl);
    }

    for (var c = 0; c < cols; c++) {
      for (var r = 0; r < ROWS; r++) {
        var cell = c * ROWS + r;
        var cx = (c + 0.5) * PITCH;
        var cy = (r + 0.5) * PITCH;
        var owners = [];
        for (var k = 0; k < n; k++) if (cellSets[k].has(cell)) owners.push(k);
        if (owners.length === 0) {
          // 全组都不含 → 底点（屏质感）
          svg.appendChild(dot(cx, cy, "dm-off"));
        } else if (owners.length === n && !singleAnimated) {
          // 全组共用 → 常亮锚点（单组且开动画时不走这条）
          svg.appendChild(dot(cx, cy, "dm-both"));
        } else {
          for (var j = 0; j < owners.length; j++) {
            var o = owners[j];
            svg.appendChild(
              dot(cx, cy, `dm-item dm-i${o}${o === primary ? " dm-primary" : ""}`, o * ITEM_MS + c * COL_STEP_MS)
            );
          }
        }
      }
    }
    return svg;
  }

  /** 把页面里所有 [data-dot-matrix] 占位元素替换为点阵屏（幂等） */
  function mount(root) {
    var scope = root || document;
    var hosts = scope.querySelectorAll("[data-dot-matrix]");
    for (var i = 0; i < hosts.length; i++) {
      var host = hosts[i];
      if (host.getAttribute("data-dm-mounted")) continue;
      var raw = host.getAttribute("data-dot-matrix") || "[]";
      var items;
      try {
        items = JSON.parse(raw);
      } catch (e) {
        items = raw.split(",").map(function (s) {
          return s.trim();
        }).filter(Boolean);
      }
      var primary = host.getAttribute("data-primary");
      var title = host.getAttribute("data-title");
      var className = host.getAttribute("data-class");
      var animate = host.getAttribute("data-animate");
      host.appendChild(
        create(items, {
          primary: primary === null ? undefined : Number(primary),
          title: title || undefined,
          className: className || undefined,
          animate: animate || undefined,
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
    FONT: FONT,
    ROWS: ROWS,
    COLS_PER_CHAR: COLS_PER_CHAR,
    CHAR_GAP: CHAR_GAP,
    PITCH: PITCH,
    DOT_R: DOT_R,
    COL_STEP_MS: COL_STEP_MS,
    ITEM_MS: ITEM_MS,
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
