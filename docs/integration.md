# 在 personal-site 里的接入方式

> 本文记录点阵屏在原站点中的真实用法与设计取舍，方便移植到别处时对照。
> 来源：`personal-site` 提交 `43c00d6`（2026-10-15 03:08，三组轮换二稿；一稿为 `427f1b6`）。
> 完整来源与灵感见 [origin.md](origin.md)。

## 1. 接入点：首页侧栏 Token 卡的 `aside` 变体

`components/TokenMonitor.tsx` 顶部（第 41–44 行）：

```tsx
/** 首页侧栏点阵屏的轮换内容：单词（代表「上进」，Ting 2026-10-15 采用推荐）、标签署名。
    换内容只改这里（渲染自动大写），建议每组 ≤7 字符 */
const DOT_MATRIX_WORD = "STRIVE";
const DOT_MATRIX_TAG = "04Ting.";
```

`variant === "aside"` 分支（第 314–341 行，节选）：

```tsx
/* 主显示（2026-10-15 二稿）：点阵屏在 单词 / 累计 tokens / 标签 三组间定时重组轮换；
   不参与骨架——动画即时可见，数字随轮询静默更新（点阵逐帧本来就在变）。
   状态行只留一行、粒度到日：●/○ hub 在线/离线 · 更新于 YYYY年M月D日 */
const allTime = periods?.allTime ?? null;
const matrixValue = allTime ? fmtTokensCompact(allTime.totalTokens) : "0";
const matrixTitle = allTime ? `${t.allTime} ${fmtTokensFull(allTime.totalTokens)} tokens` : undefined;
const asideStatus = `${lastOk === false ? t.offline : t.online} · ${t.updatedAt} ${
  updatedAt ? fmtHubDate(updatedAt, lang) : "—"
}`;

return (
  <section>
    <p className="font-mono text-xs tracking-widest text-muted">
      <span className="text-accent">·</span> {t.kicker}
    </p>
    <DotMatrix
      items={[DOT_MATRIX_WORD, matrixValue, DOT_MATRIX_TAG]}
      title={matrixTitle}
      className="mt-2 block w-full"
    />
    <p className={`mt-2 flex items-center gap-1.5 font-mono text-[11px] leading-snug text-muted ${pendingCls ?? ""}`}>
      {dot}
      {live(<span className="min-w-0">{asideStatus}</span>)}
    </p>
    <NoScriptFallback />
  </section>
);
```

要点：

| 取舍 | 原因 |
| --- | --- |
| 点阵屏**不参与骨架屏**（`tm-pending` 只作用于状态行） | 动画即时可见，不必等数据；点阵逐帧本就在变，静默更新数字不会闪 |
| `matrixValue` 用 `fmtTokensCompact`（如 `6.63B`）而不是完整数字 | 5×7 字模下 7 字符内最清晰；完整值放 `title` 悬停提示 |
| `title` 同时承担无障碍名称补充 | `aria-label` 只有 `"STRIVE / 6.63B / 04Ting."`，悬停才看到精确 token 数 |
| 轮换内容写死在模块常量 | 换词只改 `DOT_MATRIX_WORD` / `DOT_MATRIX_TAG` 两处，不动组件 |

## 2. 宿主页面的 CSS 变量

屏面颜色不写死，取自站点令牌（`app/globals.css` 第 15–27 行）：

```css
:root {
  --color-paper: #faf8f5;
  --color-ink: #1a1a1a;
  --color-accent: #b4432e;
  --color-rule: rgba(26, 26, 26, 0.15);
  --color-muted: rgba(26, 26, 26, 0.55);
}
/* 深色主题 */
html[data-theme="dark"] {
  --color-paper: #141414;
  --color-ink: #edeae4;
  --color-accent: #d0604a;
  --color-rule: rgba(237, 234, 228, 0.15);
  --color-muted: rgba(237, 234, 228, 0.55);
}
```

`DotMatrix.tsx` 只依赖 `--color-ink`（亮点 / 底点 / 共用锚点同色，靠 `opacity` 区分层级）。
主题切换不需要重挂组件：变量变了，`fill: var(--color-ink)` 自动跟随。

## 3. 一稿 → 二稿：CSS 从 `globals.css` 搬进组件

一稿（`427f1b6`）把动画规则写在 `app/globals.css`，只支持「单词 ⇄ 数字」两组：

```css
/* ---------- 点阵屏（首页侧栏 Token 卡，DotMatrix.tsx） ----------
   单词 ⇄ 数字定时交换：每个亮点按列相位错峰（内联 animation-delay），
   切换时旧图形熄灭、新图形亮起、两股扫掠同时进行——点阵小点在屏内「重组」。
   周期 10s：前 5s 单词、后 5s 数字（数字相位 = +5s，与 HALF_CYCLE_MS 对应）。
   dm-both = 两图形共用亮点，常亮（重组时的视觉锚点）；dm-off = 未点亮底点。
   纯 CSS 动画：no-JS 照常运转；prefers-reduced-motion 时定格显示数字。 */
.dm-both { fill: var(--color-ink); }
.dm-off { fill: var(--color-ink); opacity: 0.13; }
.dm-word,
.dm-num { fill: var(--color-ink); opacity: 0; animation: dm-swap 10s linear infinite; }
@keyframes dm-swap {
  0% { opacity: 0; } 1% { opacity: 0.85; } 2.2% { opacity: 0.25; } 3.5% { opacity: 1; }
  46% { opacity: 1; } 47.2% { opacity: 0.15; } 48.4% { opacity: 1; } 50% { opacity: 0.2; }
  53% { opacity: 0; } 100% { opacity: 0; }
}
@media (prefers-reduced-motion: reduce) {
  .dm-word, .dm-num { animation: none; }
  .dm-num { opacity: 1; }
}
```

二稿改为**由组数生成 `@keyframes` 并在组件内注入 `<style>`**：

- 支持任意组数（当前 3 组），周期 = `组数 × 5000ms`，第 k 组延迟 `k × 5000ms`；
- 每组「带闪点亮 → 长亮 → 带闪熄灭」的百分比按 `seg = 100 / n` 计算；
- 规则随 SSR 输出（`<style>` 在 SVG 内），**no-JS 首帧即动画**，且不再污染全局样式表；
- `globals.css` 里的 `.dm-*` 全部删除。

## 4. 相关文件清单

| 文件 | 作用 |
| --- | --- |
| `components/DotMatrix.tsx` | 组件本体（字模 + 几何 + 注入动画），本目录 `src/DotMatrix.tsx` 为其逐字节副本 |
| `components/TokenMonitor.tsx` | 首页侧栏 `aside` 变体的接入点 |
| `app/globals.css` | 提供 `--color-ink` 等令牌（一稿的 `.dm-*` 已移除） |
| `.workbuddy/verify/v2-matrix-*.png` | 站点侧的验证截图（本目录 `preview/` 内副本） |
| `WORKLOG.md` / `HANDOFF.md` | 上线记录：`427f1b6`（一稿点阵屏）、`43c00d6`（二稿三组轮换）、`ba1aa80`（数据副产品） |

## 5. 本仓库与站点的差异（P0 修复）

本仓库 `src/DotMatrix.tsx` 是上面这份站点文件**应用 P0 修复后**的版本（几何、字模、相位、n ≥ 2 的关键帧
百分比一字未动）：

| 项 | 站点版 | 本仓库 |
| --- | --- | --- |
| keyframes 名 | `dm-swap`（所有实例共用） | `dm-swap-{n}`（按组数） |
| 规则选择器 | `.dm-item` / `.dm-both` / `.dm-off` / `.dm-primary`（文档级） | 统一加 `.dm-n{n} ` 前缀 |
| 根节点 class | 仅调用方传入的 class | 追加 `dm-n{n}` |
| 单组（n = 1） | 所有亮点退化成 `.dm-both`，屏上无动画元素 | 新增 `animate`：`auto`（同旧行为）/ `always` / `never` |
| `primary` | 越界即定格到不存在的组 → 空屏 | 夹取到 `[0, n-1]` |

对站点首页（单实例、n = 3、`primary` 默认）而言，这四处改动**不改变任何可见行为**——
只有多实例复用、单组用法与越界 `primary` 才会体现差异。

给站点落地：`cd personal-site && git apply <dot-matrix>/patches/0001-p0-scoped-keyframes.patch`。
本仓库没有改动 `personal-site` 的任何文件。
