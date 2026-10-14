# 点阵屏可改进点（实测 + 建议）

> 全部结论都标注了来源：**【实测】**= 本次用 headless Chrome / CDP 真跑出来的数据，**【读码】**= 从源码推导。
> 复现命令附在每节末尾。测量环境：Chrome `--headless=new --disable-gpu`、DPR=1、Windows。

## 0. 优先级速览

| 级别 | 问题 | 影响 | 状态 |
| --- | --- | --- | --- |
| **P0-1** | 同页多实例样式互相覆盖 | 组数不同的实例时序全错（实测 2 组实例拿到 15s），每周期整屏空 1/3 | ✅ **已修**（keyframes 按组数命名 + `.dm-n{n}` 作用域；站点侧可用 `patches/0001-*.patch` 落地） |
| **P0-2** | 单组（n=1）没有任何动画元素 | 退化为静态图，与「轮换」语义不符 | ✅ **已修**（新增 `animate`；n=1 关键帧的越界/重复百分比一并修掉） |
| **P0-3** | `primary` 越界 → reduced-motion 下空屏 | 无障碍：定格到不存在的组 = 整屏不可见 | ✅ **已修**（夹取到 `[0, n-1]`） |
| P1-2 | 空格/未收录字符静默占位 | 中文文本整屏留白且不报错 | 待办（建议显式跳过或告警） |
| P1-3 | `--color-ink` 无回退 | 宿主漏定义时静默变黑 | 待办（一行：`var(--color-ink, currentColor)`） |
| P1-4 | 长文本只能整屏缩小 | >7 字符可读性骤降 | 待办（建议加滚动模式） |
| P2-1 | 每点一个 DOM 节点 | 333 节点 / 28.9 KB；主线程 39 ms/5 s | 待办：合批 path：−77% 节点、−65% 标记、−56% 主线程（已实测像素等价） |
| P2-2 | 动画永不停 | 后台标签页/离屏仍耗电 | 待办：IntersectionObserver + `visibilitychange` |
| P2-3 | 参数写死 | 时长/相位/点形/配色都改不了 | 待办：参数化 |
| P2-4 | 交互与动效单一 | 无法 hover 读数、无翻牌/滚动 | 按需（**错点效果**已实现，见 [glitch.md](glitch.md)） |
| P2-5 | 无障碍语义弱 | `aria-label` 是 `"A / B / C"` | 建议改为语义化 label |

> 修复只改了 `src/DotMatrix.tsx` 与 `demo/dot-matrix.js`（两者行为一致）：几何、字模、相位、
> n ≥ 2 的关键帧百分比一字未动，由 `test/compare.html` 逐节点校验（抹平作用域化差异后逐字一致）。

---

## 1. P0-1：同页多实例样式互相覆盖【实测】

### 机制【读码】

组件把 `<style>` 注入到自己的 `<svg>` 里，但 **CSS 作用域是整篇文档**，而 `@keyframes dm-swap` 与
`.dm-item` 的选择器在各实例间完全相同 —— 于是「文档中最后一张样式表」对所有实例生效：

```
@keyframes dm-swap { … }                       /* 每实例各注入一份，同名的最后一份胜出 */
.dm-item { animation: dm-swap 15000ms … }      /* 同理，最后一份的 duration 作用于全部实例 */
```

### 实测数据【实测】

两个实例同页（先 n=2，后 n=3），读 `getComputedStyle`：

```
A(2组) animation-duration = 15s      ← 应为 10s
B(3组) animation-duration = 15s
文档里的 @keyframes:  style#1 -> dm-swap [13 帧]   style#2 -> dm-swap [13 帧]   ← 两份同名，后者生效
```

演示页（8 个实例，组数 3/2/1/2/1/1/1/3）修复前后对比：

| 实例 | 修复前 duration | 修复后 duration |
| --- | --- | --- |
| 卡①（3 组） | 15s | 15s |
| 卡②（2 组） | **15s（错）** | 10s |
| 卡③（1 组） | 无 `dm-item`（见 §2） | 同 |
| 卡④（2 组） | **15s（错）** | 10s |
| 试验台（3 组） | 15s | 15s |
| 文档中的 keyframes 名 | `dm-swap` ×8（互相覆盖） | `dm-swap-3, dm-swap-2, dm-swap-1, …`（互不干扰） |

**用户可见症状**：2 组实例按 3 组时序跑，第 3 段（占周期 1/3）整屏空白；同时因为 `.dm-item` 是全局类名，
页面上任何其他元素只要叫 `dm-item` / `dm-both` / `dm-off` 都会被卷进来。

> 站点首页只有 1 个实例，所以线上没暴露；这是**复用/多实例**才会踩的坑。

### 已采用的修法 A（SSR 安全）

keyframes 按组数命名 + 根节点加作用域类：

```tsx
const name = `dm-swap-${n}`;            // 不再共用 dm-swap
const scope = `.dm-n${n} `;             // 不再写裸 .dm-item
const css = `@keyframes ${name} { … }
${scope}.dm-item { fill: var(--color-ink); opacity: 0; animation: ${name} ${n * ITEM_MS}ms linear infinite; }
${scope}.dm-both { … }
${scope}.dm-off { … }
@media (prefers-reduced-motion: reduce) {
  ${scope}.dm-item { animation: none; }
  ${scope}.dm-primary { opacity: 1; }
}`;
// 根节点：className={[className, `dm-n${n}`].filter(Boolean).join(" ")}
```

- 同组数的实例注入内容完全相同，重复 `<style>` 无害（可再加 `id` 去重省字节）；
- 不需要 `document`，SSR 下依旧「首帧即动画、no-JS 照常」；
- 代价：根节点多一个 class、keyframes 名字变长（gzip 后可忽略）。

### 修法 B：模块级按 n 去重

`if (document.getElementById('dm-style-' + n)) return;` 只注入一次 —— 字节更省，
但 SSR 阶段拿不到 `document`，首个实例判定要靠 layout 层配合，复杂度更高。收益（几个 `<style>` 块）不值得。

### 修法 C：CSS 变量驱动

`animation-duration: var(--dm-cycle)` 能省掉 per-n 的 duration，但 **keyframes 的百分比本身依赖 n**
（`seg = 100/n`），除非接受固定占空比，否则省不掉 per-n 的 keyframes。不划算。

### 本仓库的落地方式

修法 A **已作为默认行为**落进 `src/DotMatrix.tsx` 与 `demo/dot-matrix.js`（不再有开关）：

```js
DotMatrix.create(items, { primary: 1 });   // 输出 @keyframes dm-swap-{n} + .dm-n{n} 作用域规则
```

因此本仓库输出与站点版**不再逐字一致**（差异仅三处：keyframes 名后缀、规则作用域前缀、根 class 的作用域类），
`test/compare.html` 的判据相应改为「抹平这三处后逐字一致」，并额外断言「不存在未作用域规则」。
站点组件用 `patches/0001-p0-scoped-keyframes.patch` 落地同一修复。

复现（回归探针）：直接打开 [`test/p0-regression.html`](../test/p0-regression.html) —— 同页放 n=2 / n=3 / 单组两个实例，
读各自 `dm-item` 的实际 `animation-duration` 并检查是否存在未作用域规则。**修复后**的输出：

```
PASS  P0-1 实例 A（2 组）animation-duration = 10s     · 实际 10s
PASS  P0-1 实例 B（3 组）animation-duration = 15s     · 实际 15s
PASS  P0-1 keyframes 按组数命名                       · dm-swap-1, dm-swap-1, dm-swap-2, dm-swap-3
PASS  P0-1 不存在未作用域的 .dm-item/.dm-both/.dm-off/.dm-primary 规则   · 0 条
```

**修复前**（站点版行为，同一探针）是：

```
实例 A（2 组）animation-duration = 15s   期望 10s   错
文档中的 @keyframes 名 = dm-swap, dm-swap          ← 同名注入两次，后者生效
```

站点侧落地：`git apply patches/0001-p0-scoped-keyframes.patch`（已验应用后与本仓库 `src/DotMatrix.tsx` 逐字节一致）。

---

## 2. P0-2：单组（n = 1）时屏上没有任何动画元素【实测 + 读码】

### 机制【读码】

```ts
const owners = [];                      // 含该格位的组
for (let k = 0; k < n; k++) if (cellSets[k].has(cell)) owners.push(k);
if (owners.length === 0) → .dm-off      // 底点
else if (owners.length === n) → .dm-both // 全组共用 → 常亮
else → 每含它的组一个 .dm-item            // 只有「部分组含」才有动画
```

n = 1 时每个格位要么 0 个组（底点）、要么 1 个组 = n（共用）→ **永远走不到 `.dm-item`**。
所以单组屏是一张静态点阵图：不扫掠、不带闪、`primary` 无效。

### 实测【实测】

```
section.card:nth-of-type(3) .dm-host .dm-i1 -> 无此类节点（单组=静态）
```

> ⚠️ 本仓库 README 早期版本写过「单组时每周期末尾带闪重播一次」——**那是错的**，已按实测更正。
> 这条也解释了为什么演示页卡③ 在任何相位截图里都长亮不变。

### 修法（已采用第二种）

- 简单：`n === 1` 时把「全组共用」降级为 `dm-item`（单组也走动画路径），代价是单组屏会周期性熄灭；
- ✅ **更可控：加 `animate` 选项（`"auto" | "always" | "never"`）**，单组默认静态、需要动就显式开
  （`auto` 保持旧行为，不改变站点观感；`always` 让单组也带闪）；
- 若做 §4.3 的逐位翻牌，单组场景本来就该静态（只有数字在变），所以 `auto` 作为默认是合适的。

实现要点：`animated = n > 1 || animate === "always"`；`singleAnimated = animated && n === 1` 时，
「全组共用」的常亮点改为走 `.dm-item`（延迟 `0 × ITEM_MS + col × 22ms`，仍是逐列扫掠）。
顺带修掉 n = 1 暴露出的关键帧问题：`seg + 0.6 = 100.6%` 越界帧被夹到 100%，并与自身时段重叠的
「预演帧」（97.6/98.4/99.2/100）一并跳过 —— 否则会出现重复百分比定义、后者覆盖前者。
n ≥ 2 时这两处判断都为假，输出与站点版完全一致（`test/compare.html` 逐字校验）。

---

## 3. 性能：实测数据与结论

### 3.1 测量方法

CDP `Performance.getMetrics`，页面稳定 2 s 后采样 5 s，取 `TaskDuration` / `RecalcStyleDuration` 增量；
对照组用 `animation-play-state: paused` 关掉动画。

### 3.2 结果【实测】

| 页面 | SVG 元素 | 动画数 | TaskDuration / 5 s | RecalcStyleDuration | RecalcStyleCount |
| --- | --- | --- | --- | --- | --- |
| 333 圆点，动画中 | 335 | 214 | **0.039 s** | 0.014 s | 35 |
| 333 圆点，暂停 | 335 | 214 | 0.000 s | 0.000 s | 0 |
| 76 path，动画中 | 76 | 74 | **0.017 s** | 0.005 s | 36 |
| 76 path，暂停 | 76 | 74 | 0.000 s | 0.000 s | 0 |

**结论**：

1. **主线程不是瓶颈**：333 个 opacity 动画只占 39 ms / 5 s ≈ **0.8% 单核**（GPU 合成器的开销本方法测不到，
   但 `--disable-gpu` 下已属可接受）。所以「点阵屏拖慢首页」的说法站不住，不必为 CPU 重写。
2. **成本主要在 DOM 节点数、标记体积与样式解析**（333 个节点、333 个内联 `animation-delay`、214 个动画实例）。
3. 暂停后 TaskDuration 归零 → 开销确实全部来自动画本身，没有隐藏的定时器/轮询。

### 3.3 体积【实测】

| 对象 | 原始 | gzip |
| --- | --- | --- |
| 点阵屏 SVG（`out/index.html` 中那一块） | 28.9 KB | 2.0 KB |
| 站点首页 HTML 全文 | 75.9 KB | 14.1 KB |
| 占比 | **38.1%** | **14.2%** |

即：**原始 HTML 里近四成是这一个装饰性组件**；但 gzip 后只占 14%（点阵坐标高度重复，压缩率极好）。
所以「首屏传输」不是主要矛盾，**解析/建树**才是（333 个元素 × 4~5 个属性）。

### 3.4 P2-1 建议：按「组 × 列」合批成 `<path>`【实测可行】

同一列上的同组圆点 `animation-delay` 完全相同（`k × 5000 + col × 22`），因此可以把它们合成**一条 path**：
用零长子路径 + 圆头线帽画点（`M x y h0` + `stroke-linecap: round` + `stroke-width: 2R`）。

实测（同一份基准，333 圆点 → 合批后）：

| 指标 | 现状 | 合批 path | 变化 |
| --- | --- | --- | --- |
| 元素数 | 333（+style/title） | **76**（74 动画 + 2 静态） | −77% |
| 最大合批点数 | — | 107（底点网格一条 path 搞定） | — |
| 标记字节 | 29 629 | **10 429** | −65% |
| 主线程 TaskDuration / 5 s | 0.039 s | **0.017 s** | −56% |
| 视觉 | — | 点内部完全一致（#1a1a1a），仅**边缘抗锯齿亚像素差**（最大通道差 44/255，肉眼不可分辨） | ≈ |

渲染片段（每「组 × 列」一条）：

```html
<path class="dm-item dm-i1 dm-primary" style="animation-delay:5132ms"
      d="M3.25 9.75h0M3.25 16.25h0M9.75 9.75h0…"></path>
```

```css
.dm-item { fill: none; stroke: var(--color-ink); stroke-width: 4; stroke-linecap: round;
           opacity: 0; animation: dm-swap 15000ms linear infinite; }
```

要点：

- **逐列扫掠原样保留**（相位本来就是按列算的），不需要改成整屏擦除；
- 仍是纯 SVG + CSS，**SSR / no-JS / reduced-motion 全部不变**；
- 顺带消掉 333 个内联 `style`（React 侧就是 333 个 style 对象与属性序列化）；
- 想做到**逐像素**一致就继续用 `<circle>`；实测差异只在边缘 AA。

> 不建议改成 Canvas：会丢掉 SSR/no-JS，且需要常驻 rAF，功耗反而更高（当前是 opacity 动画，可合成）。

### 3.5 P2-2 建议：离屏/后台暂停

```css
.dm-host[data-offscreen] svg * { animation-play-state: paused; }
```

```js
new IntersectionObserver(([e]) => host.toggleAttribute("data-offscreen", !e.isIntersecting)).observe(host);
document.addEventListener("visibilitychange", () => host.toggleAttribute("data-offscreen", document.hidden));
```

站点首页的点阵屏一直在视口内，收益主要是**后台标签页/移动端**；实现成本很低。
（实测已证明暂停后主线程开销归零。）

### 3.6 其它小项

- **React 侧**：`items` 每次渲染都是新数组（TokenMonitor 每 90 s 轮询更新数值组），
  可用 `useMemo` 稳定引用，或让组件按 `items.join("\0")` 做浅比较 + `memo`，避免每次轮询重建 333 个元素的 props。
  【读码】key 是 `o{cell}` / `b{cell}` / `i{cell}-{k}`，与文本无关，所以 React 能复用大部分节点，
  但 214 个 `style={{animationDelay}}` 对象每轮都会新建并比对。
- **`content-visibility: auto`** 对首屏内的组件无收益，不需要。

---

## 4. 功能向改进

| # | 建议 | 说明 |
| --- | --- | --- |
| 4.1 | 参数化 | `itemMs`、`colStepMs`、`dotShape: "circle" \| "square" \| "round"`、`baseOpacity`（现写死 0.13）、`items` 支持 `{ text, holdMs }` 逐组时长 |
| 4.2 | 分组配色 | 让数值组用 `--color-accent`（红）、单词用 ink —— 站点已有 accent 令牌，改动只是给每组加一个 class/变量 |
| 4.3 | 长文本滚动模式 | 固定 N 列视窗 + 内容左移（`transform: translateX`），比整屏缩小可读得多；`>7` 字符时自动切换 |
| 4.4 | 逐位翻牌 | 数值变化时只让**变化的字形**做一次短翻牌（每格 0→9 快速扫），比整帧重组更像仪表；需要 JS，可渐进增强（无 JS 时退回整帧重组） |
| 4.5 | 交互 | hover 暂停（读数）、点击手动切组、`onGroupChange` 回调；顺便让自动化测试不再依赖"猜相位" |
| 4.6 | 视觉 | LED 拖尾（persistence：每个点亮位再叠一个 120 ms 延迟淡出的圆）、发光（`filter: drop-shadow`）、扫描线 —— 都能做成 opt-in |
| 4.7 | 字模工程化 | `FONT` 抽成数据文件 + 启动校验（7 行 × 5 列、字符齐全）；支持 `font` 合并注入；补 `space` `:` `/` `%` `+` `,` `!` `?` |
| 4.8 | 自适应排布 | 文本过长时优先**压缩字距**（`CHAR_GAP` 1→0）再考虑整屏缩放，避免点距过密 |

---

## 5. 工程与无障碍

- **5.1 无障碍语义**：现在 `aria-label = items.join(" / ")`，屏幕阅读器会念「STRIVE 斜杠 6.63B 斜杠 04Ting.」，
  且轮换内容对读屏是噪音。建议加 `label` 属性（如「累计 tokens 6.63B」），默认才回退到 join 结果；
  `<title>` 与 `aria-label` 目前语义重复，可二选一。
- **5.2 `--color-ink` 回退**：`fill: var(--color-ink)` 改成 `var(--color-ink, currentColor)`，
  宿主没定义令牌时跟随文字色，而不是静默变黑。
- **5.3 `primary` 夹取**：`primary = Math.min(Math.max(0, primary), n - 1)`，避免定格到不存在的组导致空屏。
- **5.4 单测**：`litCells` 的居中/宽度、合批不变量、keyframes 生成（n = 1..6 时百分比单调且 ≤ 100%）。
- **5.5 视觉回归**：沿用 `test/compare.html` 的做法 —— DOM 规范化序列化逐字比对 + 像素差阈值，
  比截图人眼比对可靠（本仓库已验证该流程可自动化）。
- **5.6 字符处理显式化**：空格 = 留白 1 格（现状其实如此），未收录字符 = 留白 1 格（中文会整屏空白）；
  建议加 `onUnknownChar` 回调或 dev 环境告警，避免"以为渲染了其实没有"。

---

## 6. 建议落地顺序

| 阶段 | 内容 | 状态 |
| --- | --- | --- |
| **P0** | §1 keyframes 按 n 命名 + `.dm-n{n}` 作用域、§2 `animate` 选项、§5.3 `primary` 夹取 | ✅ 已完成（`src/DotMatrix.tsx` + `demo/dot-matrix.js`，站点侧用 `patches/0001-*.patch`） |
| **P1** | §3.4 合批 path、§4.1 参数化、§3.5 离屏暂停、§5.2 变量回退、§5.6 未知字符告警 | 待办（半天） |
| **P2** | §4.3 滚动模式、§4.4 逐位翻牌、§4.5 交互 API、§5.1 无障碍语义 | 按需 |
| 不做 | Canvas 重写、§3.6 之外的微优化 | — |

> P0 修复只动本仓库（`P:\website_contents\dot-matrix`），**没有改动 `personal-site` 的任何文件**；
> 站点若要同步，自行执行 `git apply patches/0001-p0-scoped-keyframes.patch`（已验应用后逐字节一致）。
