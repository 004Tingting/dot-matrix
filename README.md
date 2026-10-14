# 点阵屏 · DotMatrix

5×7 LED 字模点阵屏：**纯 SVG + CSS 动画，零依赖、无构建**。多组内容按「组相位 + 列相位（22ms）」错峰亮灭，
切换时旧组熄灭、新组亮起、两股扫掠同时进行——点阵小点在屏内「重组」。
另有可调的**错点（glitch）效果**：切换后残留一批鬼点，第二次闪烁才纠正。

提取自个人站点 `personal-site` 首页侧栏 Token 卡（2026-10-15 上线），本目录是**只含点阵屏**的独立可上传版本。

![STRIVE](preview/strive.png)
![累计 tokens](preview/value.png)
![署名](preview/tag.png)
![重组扫掠中](preview/swap.png)
![错点效果](preview/glitch.png)

> 前四张是站点上的实拍（`.workbuddy/verify/v2-matrix-*.png`，深色主题 300px 宽侧栏卡）；浅色主题见
> [preview/light-word.png](preview/light-word.png)、[preview/light-value.png](preview/light-value.png)。
> 最后一张是错点效果与对照（左：`density .03 / patterns 8`，错点染红便于观察）。
> 完整演示页截图：[preview/demo-light.png](preview/demo-light.png) · [preview/demo-dark.png](preview/demo-dark.png)

---

## 来源与灵感

来自个人站点 **004Tingting.github.io** 首页侧栏「Token 卡」的主显示（2026-10-15 上线）。
原始 brief 只有三句（`personal-site/WORKLOG.md` 原文）：

> **② 首页 Token 卡点阵屏**（Ting：改成点阵字符显示累计 tokens；推荐代表「上进」的英文词；定时闪烁重组互换）

对应到实现就是：5×7 字模显示 `6.63B`、`STRIVE` 代表「上进」、组相位 + 列相位错峰扫掠实现「重组」。
视觉母题属 LED 点阵招牌 / 机场翻牌屏 / 点阵打印机这一系：**离散的点、逐格刷新、刷新时带残影** ——
本组件的「重组扫掠」是刷新，「错点」就是残影。

上游版本、提取基准（`43c00d6`，SHA-256 一致）、设计约束的来龙去脉、以及本次整理相对站点的增量，
都写在 **[docs/origin.md](docs/origin.md)**。

---

## 目录

```
dot-matrix/
├─ src/DotMatrix.tsx          React 组件（零依赖，注入 <style>，可 SSR；含 P0 修复 + 错点效果）
├─ demo/
│  ├─ index.html              零构建演示页（双击即可打开，含试验台与错点调参面板）
│  └─ dot-matrix.js           同一算法的 vanilla JS 实现（window.DotMatrix）
├─ patches/
│  ├─ 0001-p0-scoped-keyframes.patch   站点版 → P0 修复版的 diff（可 git apply）
│  └─ 0002-glitch-effect.patch         P0 修复版 → 带错点效果的 diff（可叠加）
├─ test/
│  ├─ reference-home-aside.svg  站点 SSG 的真实输出（对照基准，335 节点）
│  ├─ compare.html              站点版 vs 本仓库：DOM 逐节点 + 像素对照
│  ├─ compare-result.png        校验结果截图
│  ├─ p0-regression.html        P0 回归探针（多实例时序 / 单组策略 / primary 夹取）
│  ├─ glitch-probe.html         错点效果探针（数量 / 轮次 / 确定性 / reduced-motion）
│  ├─ phase-probe.html          动画相位探针（核对组相位/列相位时序）
│  ├─ shot.mjs                  确定性截图工具（CDP + 真实等待，预览图由它产出）
│  └─ verify.md                 复跑步骤与结论
├─ docs/
│  ├─ origin.md               来源与灵感：上游提交、brief 原文、设计语境、时间线、增量归属
│  ├─ integration.md          在 personal-site 里的接入方式与设计取舍
│  ├─ glitch.md               错点效果：参数语义、轮次算法、DOM 代价、时间轴
│  └─ improvements.md         可改进点：实测数据 + 优先级 + 修法（P0 已修，P1/P2 待办）
├─ preview/                  预览截图
└─ .github/workflows/pages.yml  可选：把 demo/ 发到 GitHub Pages
```

## P0 修复（2026-10-15）

本仓库相对上游 `43c00d6:components/DotMatrix.tsx` 修掉了两个 P0 缺陷；**几何、字模、相位与 n ≥ 2 的关键帧百分比一字未动**，
由 `test/compare.html` 逐节点校验（去掉作用域化差异后逐字一致）。

| # | 缺陷 | 修法 |
| --- | --- | --- |
| P0-1 | `@keyframes dm-swap` 与裸 `.dm-item` 是**文档级**样式：同页第二个「组数不同」的实例会覆盖第一个（实测 2 组实例拿到 15000ms，每周期空 1/3） | keyframes 按组数命名 `dm-swap-{n}`，规则统一加 `.dm-n{n} ` 作用域前缀；根节点带 `dm-n{n}` 类 |
| P0-2 | 单组（n = 1）时每个亮点都满足「全组共用」→ 全部退化成 `.dm-both`，屏上**没有任何动画元素** | 新增 `animate`：`auto`（默认，静止）/ `always`（单组也带闪）/ `never`；顺带修掉 n = 1 时 `100.6%` 越界帧与重复百分比 |
| P0-3 | `primary` 越界时 `prefers-reduced-motion` 会定格到不存在的组 → 整屏不可见 | `primary` 自动夹取到 `[0, n-1]` |

给 `personal-site` 应用同一修复（**需要你确认后自行执行**，本仓库没有改动该仓库）：

```bash
cd personal-site
git apply /path/to/dot-matrix/patches/0001-p0-scoped-keyframes.patch
```

`patches/0001-*.patch` 已用 `git apply --check` + 应用后哈希比对验证过：单独应用即得 P0 修复版；
再叠加 `patches/0002-glitch-effect.patch` 与本仓库 `src/DotMatrix.tsx` **逐字节一致**。

## 快速开始

### ① React（推荐，SSR 友好）

把 `src/DotMatrix.tsx` 放进你的项目（它只 `import type { ReactNode } from "react"`），然后：

```tsx
import DotMatrix from "@/components/DotMatrix";

<DotMatrix
  items={["STRIVE", "6.63B", "04Ting."]}   // 轮换内容，渲染自动大写
  primary={1}                              // reduced-motion 时定格第 2 组（数值）
  title="累计 6,629,904,321 tokens"        // 悬停提示
  className="mt-2 block w-full"
/>
```

组件在渲染时把 `@keyframes` 与 `.dm-*` 规则作为 `<style>` 注入 SVG 内部，所以 **SSR 首帧就带动画，
no-JS 照常运转**；`prefers-reduced-motion: reduce` 时定格 `primary` 组。

### ② 零构建（双击即看）

```html
<div id="host"></div>
<script src="demo/dot-matrix.js"></script>
<script>
  const svg = DotMatrix.create(["STRIVE", "6.63B", "04Ting."], { primary: 1 });
  document.getElementById("host").appendChild(svg);
</script>
```

声明式自动挂载（页面加载时扫描一次）：

```html
<div data-dot-matrix='["STRIVE","6.63B","04Ting."]' data-primary="1" data-title="累计 …"></div>
```

直接打开 [`demo/index.html`](demo/index.html) 可看到 7 个示例（原版三组轮换 / 两组互换 / 单组 / 超长文本 /
字模表 / 可编辑试验台 / **错点效果调参面板**），支持 `?theme=light|dark|auto`。

### ③ 宿主页面必须提供

屏面颜色取自 CSS 变量，宿主页面需要定义（否则 `fill` 失效退回黑色）：

```css
:root { --color-ink: #1a1a1a; }               /* 亮点 / 底点颜色 */
html[data-theme="dark"] { --color-ink: #edeae4; }
```

屏宽由 `viewBox` 决定、`height:auto`，外层给宽度即可（站点侧栏卡是 300px）：

```css
#host svg { display: block; width: 100%; height: auto; }
```

## API

| 参数（React / `create` 选项） | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `items` | `string[]` | — | 轮换内容，**每行一组**；渲染自动大写；建议每组 ≤ 7 字符 |
| `primary` | `number` | `1` | `prefers-reduced-motion` 时定格显示的组下标；自动夹取到 `[0, 组数-1]` |
| `title` | `string` | — | SVG `<title>`，悬停提示（也是无障碍名称的补充） |
| `className` | `string` | — | 传给根 `<svg>` 的 class（作用域类 `dm-n{n}` 会自动追加） |
| `animate` | `"auto" \| "always" \| "never"` | `"auto"` | 单组（组数 = 1）时的动画策略：`auto` 静止、`always` 单组也带闪、`never` 强制静止。声明式：`data-animate` |
| `glitch` | `object \| number` | 关闭 | 错点效果：切换后残留一批鬼点，第二次闪烁才纠正。`number` 等价于 `{ density }`。字段见下 |

**`glitch` 字段**（完整语义与算法见 [docs/glitch.md](docs/glitch.md)）：

| 字段 | 默认 | 说明 |
| --- | --- | --- |
| `density` | `0` | 每次切换后错点数**占整屏格位**的比例（「多少」）；`0.02` 在 287 格的屏上 ≈ 6 个/次 |
| `patterns` | `1` | 错点集合**多少轮切换才重复**（「随机性」）：`1` = 每次都同一批，越大每次越不一样 |
| `holdMs` | `260` | 错点存活时长（亮起到熄灭）；建议 < 每组时长 |
| `seed` | `1` | 换一组「性格」；同 seed 输出逐字节一致（SSR/hydration 安全） |
| `holes` | `0` | 正确点里「先缺后补」的比例（不随 `patterns` 轮换） |
| `className` | — | 追加到错点元素上的 class；改色推荐 `--dm-glitch-ink` |

无障碍：根节点是 `role="img"`，`aria-label` 为各组以 `" / "` 连接；`title` 另作悬停说明。

> 样式作用域：注入的规则形如 `.dm-n3 .dm-item { … }`，keyframes 名为 `dm-swap-3`。
> 宿主若要覆盖样式，请带上作用域前缀（如 `.dm-n3 .dm-item { fill: var(--color-accent) }`）。

## 工作原理

- **字模**：`FONT` 是 5 列 × 7 行的位图，`"1"` 为亮点；已收录 `A–Z`、`0–9`、`.`、`-`。空格与未收录字符（如中文）各占 1 格宽度但不点亮，即留白。
- **几何**：单格边长 `PITCH = 6.5`、点半径 `DOT_R = 2.0`；字符宽 5 列 + 1 列间隔；屏宽 = 最长组所需列数，
  每组的字形在屏内**水平居中**。`cell = col * 7 + row` 作为格位编号。
- **三类圆点**：全组都不含 → `.dm-off`（13% 透明底点，给屏质感）；全组共用 → `.dm-both`（常亮锚点，
  重组时视觉不散）；部分组含 → 每含它的组各一个 `.dm-item dm-i{k}`，靠各自相位亮灭。
- **动画**：`@keyframes dm-swap-{n}` 由**组数**生成，周期 = `组数 × 5000ms`；第 k 组延迟 `k × 5000ms`，
  组内每个点再按列加 `col × 22ms` 延迟 → 从左到右的扫掠。每组在自己的时段内「带闪点亮 → 长亮 → 带闪熄灭」。
- **不变式**：同一点的多组圆点叠加，各自按本组相位亮灭，因此切换瞬间必然出现「旧组残影 + 新组初亮」的
  重组感，而共用格位始终常亮。

## 错点效果（glitch）

模拟 LED 屏刷新后残留的鬼点：切换后多出一批「不属于本内容」的亮点，闪烁一下才熄灭。两个旋钮相互独立：

- **`density`** 管「多少」= 每次切换后错点数占整屏格位的比例；
- **`patterns`** 管「随机性」= 错点集合多少轮切换才重复一次（`1` 每次都一样，越大越不一样）。

做法是**轮次分配**：每个候选点（本组未点亮、且非全组共用的格子）被分到一个轮次 `p ∈ [0, patterns)`，
只在第 p 轮亮起；错点动画时长 = `patterns × 周期`，因此每轮换一批点、`patterns` 轮后重复，
而每轮点数恒为 `round(density × 整屏格位)`。全程**不引入 JS**：确定性伪随机（mulberry32）保证
服务端与客户端算出同一批点，no-JS 照常、`prefers-reduced-motion` 下整体禁用。

代价是 DOM（池 = 每轮点数 × patterns × 组数，`patterns 8 / density .02 / 3 组` ≈ +144 个节点），
取舍与时间轴见 **[docs/glitch.md](docs/glitch.md)**；想要「永不重复」需要 JS 每轮改 class，该文末有说明。

## 与站点版本的对照校验

`test/compare.html` 把站点 SSG 输出的真实 SVG（`test/reference-home-aside.svg`，从 `out/index.html` 原样提取）
与 `demo/dot-matrix.js` 现场渲染的结果逐项对照。因为本仓库含 P0 修复，判据是
**「抹平作用域化差异后逐字一致」**（差异只有三处：keyframes 名后缀、规则作用域前缀、根 class 的作用域类）：

| 判据 | 结果 |
| --- | --- |
| `viewBox` / `aria-label` / `role` / 根 `style` | 一致 |
| 根 class（去掉 `dm-n3` 后） | 一致，且必须含 `dm-n3` |
| 注入的 `@keyframes` + `.dm-*` CSS（去掉作用域后） | 逐字一致（630 → 669 字符，差额即作用域前缀） |
| P0-1 守卫 | 无未作用域规则；keyframes 名为 `dm-swap-3`；5 条规则均带前缀 |
| 子节点数量 / 每个节点的 `cx/cy/r/class/style` 与文本 | 335 / 335、333 个圆点逐一相同 |
| 整棵 DOM 树规范化序列化（抹平作用域化后） | 逐字一致（28 625 字符） |
| P0-2 守卫 | 单组 `auto` 无动画节点、`always` 有；n = 1 关键帧无越界百分比 |
| 两块屏并排渲染的像素差 | 15 600 像素中 4 个不同，最大通道差 8/255（亚像素抗锯齿） |

另有 `test/p0-regression.html`：12 项断言覆盖 P0-1/P0-2/P0-3（多实例时长、无全局规则、单组策略、primary 夹取）。
复跑步骤见 [test/verify.md](test/verify.md)。

## 已知边界

- 每组建议 **≤ 7 字符**：超长不会截断，而是整屏 `viewBox` 变宽，在 `width:100%` 下等比缩小、点距变密（见 demo 第 ④ 例）。
- **单组（n = 1）默认静止**：唯一的组与「全组共用」等价，所有亮点走 `.dm-both`（常亮），
  所以是一张静态点阵图；需要它动就传 `animate="always"`（demo 第 ③ 例给了两种对照）。
- 未收录字符（含空格、中文）占 1 格宽度但不点亮；新增字形只需往 `FONT` 里按同格式加一行。
- 动画是纯 CSS，`prefers-reduced-motion` 下由浏览器直接定格；数值更新不需要重挂动画（点阵逐帧本就在变）。
- 同组数的实例会各自注入一份内容相同的 `<style>`（重复无害，只是多几十字节）；若要按 n 去重，
  需在 layout 层收集，SSR 下收益不值得。

> 完整的实测数据、优先级与剩余修法（含把 333 个节点合批成 76 条 path、主线程开销 −56% 的可行性验证）
> 见 **[docs/improvements.md](docs/improvements.md)**。

## 来源与许可

- 上游仓库：`https://github.com/004Tingting/004Tingting.github.io`（作者 `004Tingting`）
  - 一稿 `427f1b6`（2026-10-15 02:33，两组轮换）→ 二稿 `43c00d6`（03:08，三组轮换）
  - **提取基准** = `43c00d6:components/DotMatrix.tsx`，SHA-256 `0F7896CD23B110205DEF4CAF3A9B2B16BF87BA390DDA633F512B7E5282D59221`
    （提取时该二稿尚未提交，从工作树取；内容与 `43c00d6` 逐字节一致。站点侧此后到 `997e410` 未再改动该文件）
    - `patches/0001-p0-scoped-keyframes.patch` 应用后 = P0 修复版（SHA-256 `886944859202162F80F3BAA465EB6F16F85345E94C72FA8D311F16E2A24224DC`，6 hunk，+44 / −15）
    - 再叠 `patches/0002-glitch-effect.patch` = 本仓库 `src/DotMatrix.tsx`（SHA-256 `0B834B3872565DFF7CB249AA2692CA925BF1F60077F5B8C0070A524270442D3F`，8 hunk，+160 / −2）
    - 两个 patch 均已验：`git apply` 后与对应版本**逐字节一致**
  - `components/TokenMonitor.tsx` — 首页侧栏 `variant === "aside"` 的接入点（`DOT_MATRIX_WORD` / `DOT_MATRIX_TAG`）
  - `app/globals.css` — 一稿的 `.dm-*` 规则（二稿已改为组件内注入）
- 完整来源梳理与灵感说明：[docs/origin.md](docs/origin.md)
- 许可：[MIT](LICENSE)

## 上传到 GitHub

```bash
cd dot-matrix
git init -b main
git add .
git commit -m "feat: 点阵屏 DotMatrix（5×7 LED 字模，纯 SVG + CSS）"
git remote add origin git@github.com:<你>/dot-matrix.git
git push -u origin main
```

想在线看演示页：仓库 **Settings → Pages → Source 选 "GitHub Actions"**，
[`.github/workflows/pages.yml`](.github/workflows/pages.yml) 会把 `demo/` 发布到 Pages
（访问 `https://<你>.github.io/dot-matrix/`）。若更习惯「Deploy from a branch」，
把 `demo/` 内容挪到仓库根目录（或分支根目录）即可，演示页只依赖 `index.html` + `dot-matrix.js` 两个文件。
