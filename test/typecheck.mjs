#!/usr/bin/env node
/**
 * typecheck.mjs — 用站点同款编译选项对 src/DotMatrix.tsx 做类型检查
 *
 * 为什么需要：站点 `tsconfig.json` 是 `strict: true` + `isolatedModules: true`，
 * 组件里一个类型错误就会让 `npm run build` 失败。而 `test/react-parity.mjs` 用的是
 * `transpileModule`（只剥类型、不查类型）—— 会漏掉这类错误。本脚本照抄站点的编译选项跑一次真检查。
 *
 * 做法：生成一个临时 tsconfig（include 指向本仓库的 src/DotMatrix.tsx，paths 指向 react 类型），
 *       调 `tsc -p` 跑一次。比 createProgram 省事，且与站点 `tsc` 行为一致。
 *
 * 依赖（仅测试需要）：typescript + @types/react —— 默认从 personal-site/node_modules 借用（只读）：
 *   node test/typecheck.mjs
 *   NODE_PATH=/path/to/node_modules node test/typecheck.mjs
 * 缺依赖时打印 SKIP 并以 0 退出。
 *
 * 退出码：0 = 通过（或跳过）；1 = 有类型错误。
 */
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const FILE = path.join(ROOT, "src", "DotMatrix.tsx");

/* ---------- 依赖解析：typescript 与 @types/react ---------- */
const SITE = "P:\\personal-site\\node_modules";
const BASES = [process.env.NODE_PATH, SITE, path.join(ROOT, "node_modules")].filter(Boolean);

let tsPkg = null;
for (const base of BASES) {
  try {
    const r = createRequire(path.join(base, "noop.js"));
    tsPkg = r.resolve("typescript/package.json");
    break;
  } catch {}
}
if (!tsPkg) {
  console.log("SKIP  typecheck：缺少 typescript（可设 NODE_PATH 指向安装位置）");
  process.exit(0);
}
const tscBin = path.join(path.dirname(tsPkg), "bin", "tsc");

const reactTypes = [path.join(ROOT, "node_modules", "@types", "react"), path.join(SITE, "@types", "react")].find((p) =>
  fs.existsSync(p),
);
if (!reactTypes) {
  console.log("SKIP  typecheck：找不到 @types/react（可设 NODE_PATH）");
  process.exit(0);
}

/* ---------- 临时 tsconfig（照抄 personal-site/tsconfig.json 的关键项） ---------- */
const dir = path.join(os.tmpdir(), "dm-typecheck");
fs.mkdirSync(dir, { recursive: true });
const configPath = path.join(dir, "tsconfig.json");
const config = {
  compilerOptions: {
    target: "ES2022",
    lib: ["dom", "dom.iterable", "esnext"],
    module: "esnext",
    moduleResolution: "bundler",
    jsx: "preserve",
    strict: true,
    noEmit: true,
    skipLibCheck: true,
    isolatedModules: true,
    esModuleInterop: true,
    forceConsistentCasingInFileNames: true,
    baseUrl: dir,
    paths: {
      react: [reactTypes.replace(/\\/g, "/")],
      "react/*": [path.join(reactTypes, "*").replace(/\\/g, "/")],
    },
  },
  include: [FILE.replace(/\\/g, "/")],
};
fs.writeFileSync(configPath, JSON.stringify(config, null, 2), "utf8");

const res = spawnSync(process.execPath, [tscBin, "-p", configPath], { encoding: "utf8" });
const out = ((res.stdout || "") + (res.stderr || "")).trim();
if (res.status === 0) {
  console.log("PASS  typecheck：src/DotMatrix.tsx 通过（strict / isolatedModules / target ES2022 / jsx preserve）");
  process.exit(0);
}
console.log("FAIL  typecheck：src/DotMatrix.tsx 未通过类型检查");
console.log(out.split("\n").slice(0, 25).join("\n"));
process.exit(1);
