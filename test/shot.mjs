#!/usr/bin/env node
/**
 * shot.mjs — 确定性截图小工具（只依赖 Node 内置模块，Node ≥ 22 自带 WebSocket）
 *
 * 为什么不用 `chrome --screenshot --virtual-time-budget`：虚拟时间**不推进 CSS 动画时钟**
 * （见 verify.md §4），同一预算在不同机器/不同页面上拍到的相位不同。本工具改用 CDP：
 * 导航 → 真实等待 waitMs → 截图，因此「等 1200ms 就是动画跑到 1200ms」。
 *
 * 用法：
 *   node test/shot.mjs <url> <out.png> [waitMs=1200] [width=900] [height=1200] [scale=1]
 *
 * 例（拍错点效果出现的瞬间）：
 *   python -m http.server 8123
 *   node test/shot.mjs "http://127.0.0.1:8123/demo/index.html?theme=dark" preview/demo-dark.png 1400 900 3150
 *
 * Chrome 路径可用环境变量 CHROME 覆盖（默认走 Windows 常见安装位置）。
 */
import { spawn } from "node:child_process";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const [url, outFile, waitArg, wArg, hArg, scaleArg] = process.argv.slice(2);
if (!url || !outFile) {
  console.error("用法: node test/shot.mjs <url> <out.png> [waitMs] [width] [height] [scale]");
  process.exit(2);
}
const waitMs = Number(waitArg ?? 1200);
const width = Number(wArg ?? 900);
const height = Number(hArg ?? 1200);
const scale = Number(scaleArg ?? 1);

const CANDIDATES = [
  process.env.CHROME,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "/usr/bin/google-chrome",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
].filter(Boolean);
const chrome = CANDIDATES.find((p) => fs.existsSync(p));
if (!chrome) {
  console.error("找不到 Chrome/Edge，请设置环境变量 CHROME 指向可执行文件");
  process.exit(2);
}

const port = 9500 + Math.floor(Math.random() * 400);
const profile = path.join(os.tmpdir(), "dm-shot-" + port);
const proc = spawn(
  chrome,
  [
    "--headless=new",
    "--disable-gpu",
    "--no-first-run",
    "--no-default-browser-check",
    "--hide-scrollbars",
    "--force-device-scale-factor=" + scale,
    "--user-data-dir=" + profile,
    "--remote-debugging-port=" + port,
    "--window-size=" + width + "," + height,
    "about:blank",
  ],
  { stdio: "ignore" },
);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const getJSON = (p) =>
  new Promise((res, rej) => {
    http
      .get({ host: "127.0.0.1", port, path: p }, (r) => {
        let d = "";
        r.on("data", (c) => (d += c));
        r.on("end", () => {
          try {
            res(JSON.parse(d));
          } catch (e) {
            rej(e);
          }
        });
      })
      .on("error", rej);
  });

let target = null;
for (let i = 0; i < 80 && !target; i++) {
  await sleep(200);
  try {
    target = (await getJSON("/json/list")).find((t) => t.type === "page" && t.webSocketDebuggerUrl);
  } catch {}
}
if (!target) {
  proc.kill();
  console.error("无法连接 CDP（Chrome 未起来？）");
  process.exit(1);
}

const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener("open", r));
let id = 0;
const pending = new Map();
ws.addEventListener("message", (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) {
    pending.get(m.id)(m);
    pending.delete(m.id);
  }
});
const send = (method, params) =>
  new Promise((res) => {
    const i = ++id;
    pending.set(i, res);
    ws.send(JSON.stringify({ id: i, method, params }));
  });

await send("Page.enable");
/* 用 CDP 覆盖视口尺寸（比 --window-size 可靠：headless 下窗口尺寸不一定被采纳） */
await send("Emulation.setDeviceMetricsOverride", {
  width,
  height,
  deviceScaleFactor: scale,
  mobile: false,
});
await send("Page.navigate", { url });
await sleep(waitMs); // 真实等待：CSS 动画按真实时钟推进
const shot = await send("Page.captureScreenshot", { format: "png" });
if (!shot.result?.data) {
  console.error("截图失败", JSON.stringify(shot).slice(0, 300));
  proc.kill();
  process.exit(1);
}
fs.mkdirSync(path.dirname(path.resolve(outFile)), { recursive: true });
fs.writeFileSync(outFile, Buffer.from(shot.result.data, "base64"));
const meta = await send("Runtime.evaluate", {
  expression: "JSON.stringify({anim: document.getAnimations().length, els: document.querySelectorAll('*').length})",
  returnByValue: true,
});
console.log(`${outFile}  ${width}x${height}@${scale}  等待 ${waitMs}ms  ${meta.result?.result?.value ?? ""}`);
ws.close();
proc.kill();
