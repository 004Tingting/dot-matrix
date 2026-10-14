#!/usr/bin/env node
/**
 * react-parity.mjs — 校验 src/DotMatrix.tsx（React 版）与 demo/dot-matrix.js（vanilla 版）输出是否一致
 *
 * 为什么需要：本仓库刻意不带构建链，浏览器探针只能跑 vanilla 镜像；而站点实际用的是 React 版。
 * 两者若走偏，只有站点构建后才会暴露。本脚本把 React 版转译后做 SSR，与 vanilla 版在同一页里
 * 用同一套「规范化序列化」（属性名排序 + 递归文本）逐字对比。
 *
 * 依赖（仅测试时需要；组件本身零依赖、零构建）：
 *   typescript / react / react-dom —— 默认从 personal-site/node_modules 借用（只读），也可：
 *     NODE_PATH=/path/to/node_modules node test/react-parity.mjs
 *   缺依赖时脚本会打印 SKIP 并以 0 退出（不阻塞其它测试）。
 *
 * 用法：
 *   node test/react-parity.mjs            # 跑内置用例
 *   node test/react-parity.mjs --dump     # 额外打印失败用例的首个差异
 */
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const DUMP = process.argv.includes("--dump");

/* ---------- 1. 依赖解析（typescript / react / react-dom） ---------- */
const FALLBACK = ["P:\\personal-site\\node_modules", path.join(ROOT, "node_modules")].filter((p) =>
  fs.existsSync(p),
);
let require_;
try {
  require_ = createRequire(path.join(FALLBACK[0] ?? ROOT, "noop.js"));
} catch {
  require_ = createRequire(import.meta.url);
}
let ts, React, renderToStaticMarkup;
try {
  ts = require_("typescript");
  React = require_("react");
  ({ renderToStaticMarkup } = require_("react-dom/server"));
} catch (e) {
  console.log("SKIP  react-parity：缺少测试依赖（typescript / react / react-dom）");
  console.log("      可设 NODE_PATH 指向任意安装位置，例如：");
  console.log("      NODE_PATH=P:\\personal-site\\node_modules node test/react-parity.mjs");
  process.exit(0);
}

/* ---------- 2. 转译并取出组件 ---------- */
const tsx = fs.readFileSync(path.join(ROOT, "src", "DotMatrix.tsx"), "utf8");
const js = ts.transpileModule(tsx, {
  compilerOptions: {
    jsx: ts.JsxEmit.React,
    target: ts.ScriptTarget.ES2020,
    module: ts.ModuleKind.CommonJS,
    esModuleInterop: true,
  },
}).outputText;
let DotMatrix;
try {
  const exports_ = {};
  // type-only import 会被转译抹掉，运行期只需要 React 作为 JSX 工厂
  new Function("React", "exports", "module", js)(React, exports_, { exports: exports_ });
  DotMatrix = exports_.default;
} catch (e) {
  console.log("FAIL  转译后的 src/DotMatrix.tsx 无法求值：" + e.message);
  process.exit(1);
}
if (typeof DotMatrix !== "function") {
  console.log("FAIL  转译后拿不到 default 导出（组件签名变了？）");
  process.exit(1);
}

/* ---------- 3. 用例（同一组 props 同时喂给 React 版与 vanilla 版） ---------- */
const ITEMS3 = ["STRIVE", "6.63B", "04Ting."];
const CASES = [
  { name: "默认（三组）", props: { items: ITEMS3, primary: 1, title: "累计 6,629,904,321 tokens" } },
  { name: "默认（两组）", props: { items: ["STRIVE", "6.63B"], primary: 1 } },
  { name: "单组 auto", props: { items: ["ONE"] } },
  { name: "单组 always", props: { items: ["ONE"], animate: "always" } },
  { name: "错点", props: { items: ITEMS3, glitch: { density: 0.02, patterns: 8, seed: 3 } } },
  { name: "错点 + holes", props: { items: ITEMS3, glitch: { density: 0.01, holes: 0.05, patterns: 4, seed: 9 } } },
  { name: "点径 dotFill", props: { items: ITEMS3, dotFill: 0.8 } },
  { name: "色温 warmth", props: { items: ITEMS3, warmth: 0.6 } },
  { name: "分组配色", props: { items: ITEMS3, groupColors: ["#1a1a1a", "#b4432e", "#1a1a1a"] } },
  { name: "配色 + 色温", props: { items: ITEMS3, groupColors: ["#111", "#b4432e", "#111"], warmth: 0.4 } },
  { name: "sweep=row", props: { items: ITEMS3, sweep: "row" } },
  { name: "sweep=diag", props: { items: ITEMS3, sweep: "diag" } },
  { name: "sweep=radial", props: { items: ITEMS3, sweep: "radial", staggerMs: 30 } },
  { name: "sweep=dissolve", props: { items: ITEMS3, sweep: "dissolve", staggerMs: 22 } },
  { name: "余晖 persistence", props: { items: ITEMS3, persistence: { ms: 140, opacity: 0.35 } } },
  { name: "状态指示列", props: { items: ITEMS3, gutter: { heartbeat: true, online: true } } },
  { name: "指示列 + 离线", props: { items: ITEMS3, gutter: { heartbeat: true, online: false } } },
  { name: "待机 idle", props: { items: ITEMS3, state: "idle" } },
  { name: "开机自检 boot", props: { items: ITEMS3, boot: true } },
  { name: "无障碍 label/lang", props: { items: ITEMS3, label: "累计 tokens 6.63B", lang: "zh-CN" } },
  { name: "全开", props: {
      items: ["STRIVE", "+12M", "6.63B", "04Ting."],
      primary: 2,
      groupColors: ["#1a1a1a", "#b4432e", "#1a1a1a", "#1a1a1a"],
      warmth: 0.3,
      dotFill: 0.7,
      sweep: "diag",
      persistence: 120,
      gutter: { heartbeat: true, online: true },
      glitch: { density: 0.015, patterns: 6, seed: 7, holes: 0.03 },
      boot: true,
      label: "累计 tokens 6.63B",
    } },
];

const rendered = CASES.map((c) => {
  let markup = "";
  let error = "";
  try {
    markup = renderToStaticMarkup(React.createElement(DotMatrix, c.props));
  } catch (e) {
    error = e.message;
  }
  return { name: c.name, props: c.props, markup, error };
});

/* ---------- 4. 生成对比页：React SSR 标记 vs vanilla 现渲染 ---------- */
const page = `<!doctype html><html><head><meta charset="utf-8"><title>react-parity</title>
<style>html,body{margin:0;padding:8px;background:#faf8f5;color:#1a1a1a;font:12px/1.6 ui-monospace,monospace}
:root{--color-ink:#1a1a1a;--color-accent:#b4432e}
#out{white-space:pre-wrap}.ok{color:#1f7a3d;font-weight:700}.bad{color:#b4432e;font-weight:700}
.dim{color:rgba(26,26,26,.55)}</style></head><body>
<div id="stage" style="position:absolute;left:-9999px"></div>
<pre id="out">running…</pre>
<script src="file:///${path.join(ROOT, "demo", "dot-matrix.js").replace(/\\/g, "/")}"></script>
<script>
window.__CASES__ = ${JSON.stringify(rendered)};
(function () {
  var lines = [], failed = 0;
  function attrsOf(node) {
    return Array.prototype.slice.call(node.attributes).map(function (a) { return a.name + "=" + a.value; }).sort().join(" | ");
  }
  function canonical(node) {
    var tag = node.nodeName.toLowerCase();
    var s = "<" + tag + " " + attrsOf(node) + ">";
    for (var i = 0; i < node.childNodes.length; i++) {
      var c = node.childNodes[i];
      if (c.nodeType === 3) s += c.textContent;
      else if (c.nodeType === 1) s += canonical(c);
    }
    return s + "</" + tag + ">";
  }
  var stage = document.getElementById("stage");
  function firstDiff(a, b) {
    var p = 0; while (p < a.length && a[p] === b[p]) p++;
    return "\\n    React:   " + JSON.stringify(a.slice(Math.max(0, p - 60), p + 90)) +
           "\\n    vanilla: " + JSON.stringify(b.slice(Math.max(0, p - 60), p + 90));
  }
  window.__CASES__.forEach(function (c) {
    if (c.error) { failed++; lines.push('<span class="bad">FAIL</span>  ' + c.name + '  React 渲染抛错: ' + c.error); return; }
    stage.innerHTML = c.markup;
    var reactSvg = stage.querySelector("svg");
    if (!reactSvg) { failed++; lines.push('<span class="bad">FAIL</span>  ' + c.name + '  React 输出里没有 <svg>'); return; }
    var portSvg = DotMatrix.create(c.props.items, c.props);

    /* 分区比较：注入 CSS / 圆点与其它子节点 —— 失败时能直接看出是哪一半走偏 */
    var rc = reactSvg.querySelector("style").textContent, pc = portSvg.querySelector("style").textContent;
    var rd = [], pd = [];
    Array.prototype.forEach.call(reactSvg.childNodes, function (nd) { if (nd.nodeType === 1 && nd.nodeName.toLowerCase() !== "style") rd.push(canonical(nd)); });
    Array.prototype.forEach.call(portSvg.childNodes, function (nd) { if (nd.nodeType === 1 && nd.nodeName.toLowerCase() !== "style") pd.push(canonical(nd)); });
    var rs = [reactSvg.getAttribute("viewBox"), reactSvg.getAttribute("class"), reactSvg.getAttribute("aria-label"), reactSvg.getAttribute("lang")].join("|");
    var ps = [portSvg.getAttribute("viewBox"), portSvg.getAttribute("class"), portSvg.getAttribute("aria-label"), portSvg.getAttribute("lang")].join("|");

    var bad = [];
    if (rc !== pc) bad.push("注入 CSS" + firstDiff(rc, pc));
    if (rd.join("") !== pd.join("")) bad.push("圆点/子节点（React " + rd.length + " 个 vs vanilla " + pd.length + " 个）" + firstDiff(rd.join(""), pd.join("")));
    if (rs !== ps) bad.push("根属性" + firstDiff(rs, ps));

    if (bad.length === 0) { lines.push('<span class="ok">PASS</span>  ' + c.name + '  <span class="dim">' + canonical(reactSvg).length + ' 字符</span>'); return; }
    failed++;
    lines.push('<span class="bad">FAIL</span>  ' + c.name + '\\n  ' + bad.join('\\n  '));
  });
  lines.push("");
  lines.push(failed === 0 ? '<span class="ok">全部一致</span>（' + window.__CASES__.length + ' 个用例）'
    : '<span class="bad">' + failed + " / " + window.__CASES__.length + " 个用例不一致</span>");
  document.getElementById("out").innerHTML = lines.join("\\n");
  document.title = (failed === 0 ? "PASS · " : "FAIL · ") + "react-parity";
})();
</script></body></html>`;

const dir = path.join(os.tmpdir(), "dm-parity");
fs.mkdirSync(dir, { recursive: true });
const pageFile = path.join(dir, "parity.html");
fs.writeFileSync(pageFile, page, "utf8");

/* ---------- 5. 无头 Chrome 跑页面，读回判定 ---------- */
const CHROME = [
  process.env.CHROME,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "/usr/bin/google-chrome",
].filter(Boolean).find((p) => fs.existsSync(p));
if (!CHROME) {
  console.log("SKIP  react-parity：找不到 Chrome（可用 CHROME 环境变量指定）");
  process.exit(0);
}

const port = 9700 + Math.floor(Math.random() * 200);
const proc = spawn(
  CHROME,
  [
    "--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check",
    "--allow-file-access-from-files",
    "--user-data-dir=" + path.join(os.tmpdir(), "dm-parity-profile-" + port),
    "--remote-debugging-port=" + port,
    "--window-size=1200,900",
    "about:blank",
  ],
  { stdio: "ignore" },
);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const getJSON = (p) =>
  new Promise((res, rej) => {
    http.get({ host: "127.0.0.1", port, path: p }, (r) => {
      let d = ""; r.on("data", (c) => (d += c));
      r.on("end", () => { try { res(JSON.parse(d)); } catch (e) { rej(e); } });
    }).on("error", rej);
  });

let target = null;
for (let i = 0; i < 80 && !target; i++) {
  await sleep(200);
  try { target = (await getJSON("/json/list")).find((t) => t.type === "page" && t.webSocketDebuggerUrl); } catch {}
}
if (!target) { proc.kill(); console.log("FAIL  react-parity：无法连接 CDP"); process.exit(1); }

const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener("open", r));
let id = 0; const pending = new Map();
ws.addEventListener("message", (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
});
const send = (method, params) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });

await send("Page.enable");
await send("Page.navigate", { url: "file:///" + pageFile.replace(/\\/g, "/") });
await sleep(1200);
const r = await send("Runtime.evaluate", {
  expression: "document.getElementById('out').innerText",
  returnByValue: true,
});
ws.close(); proc.kill();

const text = r.result?.result?.value ?? "(读不到页面输出)";
console.log(text);
if (DUMP) console.log("\n（--dump：失败详情已在上面的 React/vanilla 对比里）");
const failed = /个用例不一致|FAIL/.test(text);
process.exit(failed ? 1 : 0);
