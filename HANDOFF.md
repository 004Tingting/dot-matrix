# HANDOFF — 交接文档

> 给下一个会话 / 接手的人：先读 [README](README.md)（功能与 API），再读本文件（**状态、决策、坑、待办**）。
> 最后更新：2026-10-17 16:20（站点侧已接入 boot / gutter / glitch / label / lang）

---

## 一句话现状

`dot-matrix` 是从个人站点 `personal-site` 抽出的 **5×7 LED 点阵屏**组件（纯 SVG + CSS、零依赖、无构建），
已独立成公开仓库并上线 Pages 演示。组件含 **P0 修复 + 错点效果 + 视觉/状态参数**，以**三片 patch**
的形式可以叠回站点；站点侧已全部应用，并启用了其中 5 项能力。

---

## 资产与入口

| 项 | 值 |
| --- | --- |
| 本仓库 | <https://github.com/004Tingting/dot-matrix>（public · MIT · 39 文件 · 7 提交） |
| 演示页（Pages） | <https://004tingting.github.io/dot-matrix/> · 自检单页 [/boot.html](https://004tingting.github.io/dot-matrix/boot.html) |
| 本地路径 | `P:\website_contents\dot-matrix` |
| 上游（组件出处） | `personal-site` 的 `components/DotMatrix.tsx` @ `43c00d6`（一稿 `427f1b6`） |
| 上游仓库 | <https://github.com/004Tingting/004Tingting.github.io> |
| 站点侧接入提交 | `6a4e1e2`（14:22，打补丁 + `boot`）· `9746af4`（16:15，`gutter` + `glitch` + `label`/`lang`） |

---

## 当前状态（2026-10-17）

**本仓库**

- `main` 与远端同步，工作树干净；`docs/origin.md` 是冻结的来源记录（按 Ting 要求不再修改）。
- 六项检查全绿：`typecheck` PASS · `react-parity` 23 用例 · `compare` 17 项 · `p0-regression` 12 项 ·
  `glitch-probe` 17 项 · `features-probe` 46 项。
- 三片 patch 与哈希（按序应用，每片都可单独停下）：

| 步骤 | 文件 SHA-256（前 8 位） | 内容 |
| --- | --- | --- |
| 上游 `43c00d6` | `0F7896CD` | 三组轮换原版 |
| + `0001` | `88694485` | P0 修复：作用域化 / 单组策略 / `primary` 夹取 |
| + `0002` | `0B834B38` | 错点效果 |
| + `0003` | `46700740` | 视觉与状态参数（= 本仓库 `src`） |

**站点侧**（`personal-site`，HEAD `1ad135e`，工作树干净）

- `components/DotMatrix.tsx` 哈希 = `46700740` → **三片补丁全部应用且已入库**。
- `components/TokenMonitor.tsx` 的 `aside` 分支已启用：`boot` · `gutter={{heartbeat, online}}` ·
  `glitch={GLITCH_BY_TIER[tier]}`（四档随数据新鲜度）· `label` · `lang`。
- **尚未启用**：`groupColors`（数值组配色）· 增量组（`+12M`）· `persistence` · `warmth` · `sweep`。
  接法见 [docs/site-upgrade.md](docs/site-upgrade.md) §4.2。

---

## 架构：一个组件，两个实现

| 文件 | 角色 | 谁在用 |
| --- | --- | --- |
| `src/DotMatrix.tsx` | **React 版**（正式交付物，无 hook 的纯函数组件，可 SSR） | 站点 `TokenMonitor.tsx` |
| `demo/dot-matrix.js` | **vanilla 版**（`window.DotMatrix`，同一算法的手工镜像） | 演示页、所有浏览器探针 |

为什么两份：本仓库刻意**不带构建链**（组件定位「复制即用」），而演示页与探针需要在浏览器里直接跑。

**怎么保证不走偏**（三条，缺一不可）：

1. `test/react-parity.mjs` —— 把 TSX 转译后 SSR，与 vanilla 版**逐用例分区比对**（CSS / 圆点 / 根属性），23 用例；
2. `test/typecheck.mjs` —— 用**站点同款** `strict` + `isolatedModules` 跑 `tsc`（parity 只转译不查类型，会漏类型错误）；
3. `test/compare.html` —— 以站点 SSG 真实输出为基准，逐节点 + 像素对照（守住「默认参数下与站点版一致」）。

> 改任何一处渲染逻辑，**两个文件都要改**，然后跑上面三条。

---

## 关键决策（为什么是现在这样）

1. **纯 CSS / 零依赖 / no-JS**：站点是静态导出，组件要能在 SSR 首帧就带动画。所有动效都在 CSS 里，
   错点与溶解用**确定性伪随机**（mulberry32）在渲染期算好，不依赖运行时随机。
2. **keyframes 按组数命名 + `.dm-n{n}` 作用域**（P0-1 的教训）：`<style>` 虽然写在 SVG 里，但**作用于整篇文档**；
   旧版同名 `dm-swap` + 裸 `.dm-item` 会让同页第二个「组数不同」的实例覆盖第一个（实测 2 组实例拿到 15000ms，
   每周期空 1/3）。现在 `dm-swap-{n}` + `.dm-n{n} ` 前缀，多实例互不干扰。
3. **单组（n=1）默认静止 + `animate` 开关**：n=1 时所有亮点都满足「全组共用」，旧版会退化成静态图；
   为了不改变站点观感，默认保持静止，要动就显式 `animate="always"`。
4. **错点用「轮次分配」而不是 JS 随机**：每个候选点分配一个轮次 `p ∈ [0, patterns)`，只在第 p 轮亮起，
   错点动画时长 = `patterns × 周期`。于是 `density`（多少）与 `patterns`（随机性）**相互独立**，且仍是纯 CSS。
   代价是 DOM：池 = 每轮点数 × patterns × 组数。
5. **种子化伪随机**：SSR 与 hydration 必须算出同一批点，所以 `seed` 决定一切，**永远不要**把 `Math.random()`
   的结果传进去。
6. **`boot` 复用底点**：自检不是独立图层，而是给已有的 `.dm-off` 挂一条一次性动画
   （`opacity 1 → 0.13`，`animation-fill-mode: both` + 每列 `delay = 列号 × colStepMs`），零新增节点。
7. **`gutter` 占宽而不是挤进「常空列」**：常空列取决于内容长度（不可靠），所以显式保留每侧 1 列 + 1 列空隙，
   代价是屏宽 +4 列、点径约小 9%。
8. **每组 ≤ 7 字符**：侧栏卡约 300px + 5×7 字模 → 41 列，超长只能整屏缩小。
9. **新参数默认全关**：默认参数下输出与 P0 修复版**逐字节一致**（`compare.html` 17 项守着），
   所以站点可以「先打补丁、再逐项打开」。

---

## 校验体系

| 检查 | 防什么 | 命令 / 入口 |
| --- | --- | --- |
| `typecheck.mjs` | 类型错误（站点 `strict` 会让构建失败） | `node test/typecheck.mjs` |
| `react-parity.mjs` | 两个实现走偏 | `node test/react-parity.mjs` |
| `compare.html` | 与站点 SSG 输出不一致 / 像素回归 | 起 `python -m http.server 8123` → `/test/compare.html` |
| `p0-regression.html` | P0 三个缺陷复发 | 同上 → `/test/p0-regression.html` |
| `glitch-probe.html` | 错点数量 / 轮次 / 确定性 / reduced-motion | 同上 → `/test/glitch-probe.html` |
| `features-probe.html` | 新参数「语义」是否做对（parity 只保证两边一致） | 同上 → `/test/features-probe.html` |

**不覆盖**：真机视觉回归（截图靠人眼）、`prefers-reduced-motion` 的实际生效（只检查 CSS 文本）、
站点接入后的端到端表现。站点侧回归要跑它自己的构建。

`test/shot.mjs` 是确定性截图工具（CDP + 真实等待）。**不要用 `--virtual-time-budget` 截动画**——
虚拟时间不推进 CSS 动画时钟，同一预算在不同机器上拍到的相位不同。

---

## 踩过的坑（别再踩）

| # | 坑 | 教训 |
| --- | --- | --- |
| 1 | SVG 里的 `<style>` 是**文档级**的 | 多实例必须作用域化（`dm-swap-{n}` / `.dm-n{n}`） |
| 2 | `image/svg+xml` 解析基准会把 `<style>` 当文本渲染 | 对照页必须用 `text/html` 解析 |
| 3 | XML 序列化 `<circle/>`、HTML 序列化 `<circle></circle>` | 比较用自建规范化序列化，别用 `innerHTML` |
| 4 | headless 的 `--virtual-time-budget` **不推进** CSS 动画 | 截图用 `shot.mjs`（真实等待） |
| 5 | PIL 默认字体没有 CJK | 预览图文字要 `ImageFont.truetype("msyh.ttc")` |
| 6 | `transpileModule` 只剥类型、不查类型 | 必须另跑 `tsc`（见 `typecheck.mjs`）；曾漏掉 `bootCfg` 的 strict 报错 |
| 7 | patch 基准用了**陈旧的临时副本** | 生成 patch 一律从 git 取（`git show <rev>:path`），不要用目录里的旧拷贝 |
| 8 | 首次 `gh repo create --push` 时 Pages 还没启用 | workflow 会红（`Get Pages site failed`）；启用 Pages 后重跑即可 |
| 9 | 后台任务里调 `pwsh` | 本机只有 Windows PowerShell，用 `& script.ps1` 或 `powershell -File` |
| 10 | PowerShell 把 jq 表达式里的引号吞掉 | 调 `gh api --jq` 时改用 `git`/`jq` 文件，或单引号包整段 |

---

## 待办（按优先级）

| 优先级 | 项 | 说明 / 入口 |
| --- | --- | --- |
| P1 | **逐组时长** | 现在每组固定 5s，4 组 = 20s；让 `items` 支持 `{ text, holdMs }` 就能让数值停久一点。这是站点启用「增量组」的前置 |
| P1 | **per-group glitch** | 目前错点是整屏的；做到「只有数值组出错」需要候选点按组限定（`docs/glitch.md` §6 第 16 条） |
| P2 | 离屏 / 后台暂停 | `IntersectionObserver` + `visibilitychange` → `animation-play-state: paused` |
| P2 | 节点合批成 path | 333 圆点 → ~76 条 path（实测主线程 −56%、像素等价），见 `docs/improvements.md` §3.4 |
| P2 | 错点「真随机」模式 | 当前是周期性轮换；「永不重复」需要 JS 每轮改 class（`docs/glitch.md` §5） |
| P3 | 打 tag | 目前无 tag；建议从下一次行为变更开始用语义化版本 |
| P3 | 按时间段切换语气 | 深夜 `REST` / 清晨 `KEEP ON`；只需站点侧按小时选词（暂不实现） |

---

## 站点侧还能接什么（本仓库已支持，站点未启用）

| 能力 | 怎么接 | 代价 |
| --- | --- | --- |
| 数值组配色 `groupColors` | `groupColors={matrixItems.map((_, i) => i === valueIdx ? "var(--color-accent)" : undefined)}` | 无（多 4 条 CSS） |
| 增量一栏 | `items` 里加 `+12M`（今日增量），`primary` 跟着 `valueIdx` | 多一组 → 20s 一轮 |
| 余晖 `persistence` | `persistence={120}` | DOM ×2（214 → 428） |
| 色温 `warmth` | `warmth={0.4}`（深色主题更「真机」） | 需 `color-mix`（老浏览器降级） |
| 重组方向 `sweep` | `sweep="diag"` / `"dissolve"` | 无 |

完整片段（可直接粘贴）见 [docs/site-upgrade.md](docs/site-upgrade.md) §4.2。

---

## 常用命令

```bash
# 校验
node test/typecheck.mjs
node test/react-parity.mjs
python -m http.server 8123        # 然后开 /test/compare.html 等四个探针页

# 截图（确定性）
node test/shot.mjs "http://127.0.0.1:8123/demo/index.html?theme=dark" preview/demo-dark.png 9000 900 5000 1

# 重新生成某片 patch（务必从 git 取基准，别用目录里的旧副本）
git show <rev>:src/DotMatrix.tsx > /tmp/a.tsx   # 基准
# 修改后：
git diff --no-index --src-prefix= --dst-prefix= /tmp/a.tsx src/DotMatrix.tsx
# 再把路径改成 a/components/DotMatrix.tsx / b/components/DotMatrix.tsx，并验 git apply --check

# 站点侧（在 personal-site 里）
git apply ../dot-matrix/patches/0001-*.patch     # 按序
npx tsc --noEmit && npm run build
```

---

## 文档索引

| 文档 | 读它是为了 |
| --- | --- |
| [README](README.md) | 功能、API、参数表、预览图、测试命令 |
| [docs/origin.md](docs/origin.md) | 来源与灵感（**冻结**，不再修改） |
| [docs/site-upgrade.md](docs/site-upgrade.md) | **把设计用到站点上**：patch 链、TokenMonitor 片段、验收清单、常见坑 |
| [docs/glitch.md](docs/glitch.md) | 错点的参数语义、轮次算法、DOM 代价、状态语言清单 |
| [docs/integration.md](docs/integration.md) | 站点里的原始接入方式与设计取舍（历史记录） |
| [docs/improvements.md](docs/improvements.md) | 实测数据、优先级、剩余优化（性能/功能/无障碍） |
| [test/verify.md](test/verify.md) | 六项检查的判据、复跑步骤、覆盖范围与缺口 |
