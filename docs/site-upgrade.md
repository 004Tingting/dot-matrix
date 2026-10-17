# 把点阵屏设计用到站点上（交付文档）

> **适用对象**：`personal-site`（Next.js 静态导出，`tsconfig` 为 `strict`，gh-pages 分支部署）
> **来源仓库**：`dot-matrix`（组件 + 演示 + 校验 + patch）
> **改完的效果**：首页侧栏 Token 卡从「三组轮换」升级为「数值组配色 + 增量一栏 + 两侧状态灯 +
> 错点随数据状态变化 + 可选的开机自检」，其余页面与文件不受影响。

---

## 0. 一页看懂

```
personal-site/
  components/DotMatrix.tsx      ← 打 3 片 patch（纯组件升级，不改变现有默认观感）
  components/TokenMonitor.tsx   ← 改 aside 分支约 20 行（接上新参数）
  其它文件                        ← 不动
```

- 只有 `TokenMonitor.tsx` 一个文件 import 了 `DotMatrix`（第 27 行），**影响面就这一张卡**。
- 三片 patch 必须**按序**应用；每片都能单独停下（0001 只修 bug，站点观感不变）。
- 新参数**默认全部关闭**，所以「只打 patch 不改 TokenMonitor」也是安全的：屏面行为与现在完全一致。

---

## 1. 交付物清单

| 文件 | 作用 | 站点是否需要 |
| --- | --- | --- |
| `patches/0001-p0-scoped-keyframes.patch` | P0 修复：样式作用域化 / 单组策略 / `primary` 夹取 | ✅ 必须（后两片依赖它） |
| `patches/0002-glitch-effect.patch` | 错点效果（`glitch`） | ✅ 想要错点就要 |
| `patches/0003-visual-state-params.patch` | `dotFill` / `warmth` / `groupColors` / `sweep` / `staggerMs` / `persistence` / `gutter` / `state` / `boot` / `label` / `lang` | ✅ 想要本批设计就要 |
| `src/DotMatrix.tsx` | 三片应用后的最终组件（对照用） | 参考 |
| `test/typecheck.mjs` | 用站点同款选项做类型检查 | ✅ 建议在构建前跑 |
| `test/react-parity.mjs` | React 版 ↔ vanilla 版逐字节比对 | 参考 |
| `demo/index.html`、`demo/boot.html` | 零构建演示（10 栏 + 自检单页） | 参考（可直接给站点做视觉验收） |
| `docs/glitch.md`、`docs/site-upgrade.md`（本文） | 语义与落地说明 | 参考 |

---

## 2. 改前检查（3 条命令）

```bash
cd personal-site
git status --short          # 期望：干净（或在你自己确认过的分支上）
git log -1 --oneline        # 记下当前 HEAD
sha256sum components/DotMatrix.tsx
# 期望：0f7896cd23b110205def4caf3a9b2b16bf87ba390dda633f512b7e5282d59221
```

> 那个哈希是上游 `43c00d6`（2026-10-15 二稿）里的 `DotMatrix.tsx`。**如果对不上**，说明这个文件被改过，
> 先 `git diff 43c00d6 -- components/DotMatrix.tsx` 看清差异再打补丁，不要硬 apply。
>
> **如果哈希已经是 `46700740…`**（= 本仓库 `src` 的版本），说明三片补丁**已经应用过**了 —— 直接跳到 §4。
> 也可以用 `git apply --check` 预检：报 `patch does not apply` 通常就是已经打过了。

建议开个分支：`git switch -c feat/dotmatrix-upgrade`

---

## 3. 第一步：给组件打补丁

```bash
# 在 personal-site 根目录，三片按序
git apply /path/to/dot-matrix/patches/0001-p0-scoped-keyframes.patch
git apply /path/to/dot-matrix/patches/0002-glitch-effect.patch
git apply /path/to/dot-matrix/patches/0003-visual-state-params.patch
```

**每片都能验证**（可选但推荐）：

| 应用完 | 文件 SHA-256 应为 |
| --- | --- |
| 0001 | `886944859202162F80F3BAA465EB6F16F85345E94C72FA8D311F16E2A24224DC` |
| 0001 + 0002 | `0B834B3872565DFF7CB249AA2692CA925BF1F60077F5B8C0070A524270442D3F` |
| 0001 + 0002 + 0003 | `4670074039DB852F80256444C4B84AEB922FE92C7CF7BFAA351FEC8C9682F8E5` |

三片分别做了什么：

| patch | 内容 | 对站点当前用法的可见影响 |
| --- | --- | --- |
| 0001 | ① `@keyframes` 按组数命名（`dm-swap-3`）+ 规则加 `.dm-n3 ` 作用域 ② 单组策略 `animate` ③ `primary` 夹取 | **无**（单实例、3 组、默认 `primary`） |
| 0002 | `glitch` 错点效果 | 无（默认关闭） |
| 0003 | 视觉/状态参数 | 无（默认关闭） |

> 只想先修 bug：只应用 0001。
> 想要错点：0001 + 0002。
> 想要本批设计：三片都上。

---

## 4. 第二步：改 `components/TokenMonitor.tsx`

### 4.1 现在的样子（第 314–342 行）

```tsx
  if (variant === "aside") {
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
        ...
```

### 4.2 改后（整段替换，可直接粘贴）

```tsx
  if (variant === "aside") {
    /* 点阵屏：单词 / 增量 / 累计 / 标签 四组轮换；数值组用 accent 单独配色；
       两侧状态指示列（心跳 + 在线）；错点密度随数据新鲜度变化（= 屏面的「稳定程度」） */
    const allTime = periods?.allTime ?? null;
    const today = periods?.today ?? null;

    const matrixValue = allTime ? fmtTokensCompact(allTime.totalTokens) : "0";
    /** 增量一栏：今日新增；为 0 时不占一个时段 */
    const matrixDelta = today && today.totalTokens > 0 ? `+${fmtTokensCompact(today.totalTokens)}` : null;
    const matrixTitle = allTime ? `${t.allTime} ${fmtTokensFull(allTime.totalTokens)} tokens` : undefined;

    const matrixItems = [DOT_MATRIX_WORD, ...(matrixDelta ? [matrixDelta] : []), matrixValue, DOT_MATRIX_TAG];
    /** 数值组下标（增量有无时会变，别写死） */
    const valueIdx = matrixItems.indexOf(matrixValue);
    const groupColors = matrixItems.map((_, i) => (i === valueIdx ? "var(--color-accent)" : undefined));

    /** 数据新鲜度：0 实时 / 1 实时停更 / 2 快照兜底 / 3 构建快照 —— 与下面 status 的三层兜底一致 */
    const tier = lastOk === false ? (liveAt ? 1 : repoOk ? 2 : 3) : 0;
    const GLITCH_BY_TIER = [
      { density: 0.015, patterns: 8, holdMs: 140, seed: 3 }, // 正常：偶发孤点
      { density: 0.03, patterns: 2, holdMs: 300, seed: 5 },  // 停更：开始不稳
      { density: 0.045, patterns: 1, holdMs: 480, seed: 5 }, // 快照：同几处坏点反复闪
      { density: 0.06, patterns: 1, holdMs: 620, seed: 7 },  // 离线：持续故障
    ];

    const asideStatus = `${lastOk === false ? t.offline : t.online} · ${t.updatedAt} ${
      updatedAt ? fmtHubDate(updatedAt, lang) : "—"
    }`;
    return (
      <section>
        <p className="font-mono text-xs tracking-widest text-muted">
          <span className="text-accent">·</span> {t.kicker}
        </p>
        <DotMatrix
          items={matrixItems}
          primary={valueIdx}
          title={matrixTitle}
          label={`${t.allTime} ${matrixValue} tokens`}
          lang={lang}
          groupColors={groupColors}
          gutter={{ heartbeat: true, online: lastOk !== false }}
          glitch={GLITCH_BY_TIER[tier]}
          className="mt-2 block w-full"
        />
        <p className={`mt-2 flex items-center gap-1.5 font-mono text-[11px] leading-snug text-muted ${pendingCls ?? ""}`}>
          {dot}
          {live(<span className="min-w-0">{asideStatus}</span>)}
        </p>
        <NoScriptFallback />
      </section>
    );
  }
```

### 4.3 逐处说明（不想要就删那一行）

> **最小接入**：如果只想先要开机自检，其实只加一个 prop 就够 ——
> `<DotMatrix … boot />`（其余照旧）。这是「只打补丁 + 一个 prop」的最小改动，
> 也是最先能肉眼确认「补丁生效了」的方式。下面这些是进一步的可选项。

| 改动 | 为什么 | 删掉会怎样 |
| --- | --- | --- |
| `matrixDelta` + `items` 加一组 | 「增量」比静态总量有信息量；为 0 时不加，避免白占一个时段 | 回到三组轮换 |
| `valueIdx` 动态找下标 | 增量有无会改变数值组下标，写死 1 会配错色 | 配色可能落到增量组上 |
| `groupColors` | 数值组用 `--color-accent`，四类内容一眼分层 | 全屏同色 |
| `gutter` | 左列心跳（在跑）+ 右列在线灯（离线转闪烁） | 少两条状态灯；屏宽少 4 列、点径大 9% |
| `glitch={GLITCH_BY_TIER[tier]}` | 屏面「稳定程度」直接表达数据可信度 | 屏面永远干净（也可以只留这一行、不接 tier） |
| `label` + `lang` | 读屏念「累计 tokens 6.63B」而不是「STRIVE 斜杠 6.63B」 | 无障碍退化（不影响视觉） |
| `primary={valueIdx}` | `prefers-reduced-motion` 时定格在数值组 | 定格组可能不是数值 |

### 4.4 可选：数值刷新时「爆发一下」

```tsx
const [burst, setBurst] = useState(false);
useEffect(() => {
  if (!matrixValue) return;
  setBurst(true);
  const id = setTimeout(() => setBurst(false), 900);
  return () => clearTimeout(id);
}, [matrixValue]);

// 然后把 glitch 换成：
glitch={burst ? { density: 0.035, patterns: 1, holdMs: 120, seed: 2 } : GLITCH_BY_TIER[tier]}
```

> `TokenMonitor.tsx` 已经是 `"use client"`，加 hook 没问题；`DotMatrix.tsx` 本身无 hook，仍是纯函数组件。

---

## 5. 第三步：类型检查与构建

```bash
# ① 先单独验组件类型（不需要站点依赖，从 personal-site/node_modules 借用 typescript）
cd /path/to/dot-matrix
node test/typecheck.mjs
# 期望：PASS  typecheck：src/DotMatrix.tsx 通过（strict / isolatedModules / target ES2022 / jsx preserve）

# ② 再在站点里做整仓类型检查
cd personal-site
npx tsc --noEmit

# ③ 完整构建（注意：会先跑 4 个 fetch 脚本，需要网络）
npm run build
```

> `npm run build` 的链路是 `fetch-now → fetch-monthly → fetch-playlist → fetch-token-stats → next build → postbuild`，
> 产物在 `out/`。发布按你现有流程（`scripts/deploy.sh` 走 gh-pages 分支模式）。

---

## 6. 第四步：验收清单

打开首页（`npm run dev` 或构建后本地预览），逐条对照：

- [ ] 侧栏卡在 **单词 → 增量 → 累计 → 标签** 之间轮换（有增量时是 4 组、20s 一轮；无增量时 3 组 15s）
- [ ] 累计 tokens 那一组是 **accent 色**，其余组是正文墨色
- [ ] 悬停屏面能看到精确 token 数（`title`）
- [ ] 屏面左右各多一条状态灯：左侧心跳点上下走、右侧常亮（hub 正常时）
- [ ] 断网/改错 hub 地址后：右侧变闪烁，且屏面**错点明显变多**（离线档）
- [ ] 深色/浅色主题切换后屏面颜色跟随（`--color-ink` / accent）
- [ ] 系统开「减少动态效果」后：屏面定格在数值组、无错点、无心跳（`prefers-reduced-motion`）
- [ ] 侧栏窄屏（手机）下屏面不变形、不溢出
- [ ] 读屏（VoiceOver/NVDA）读到「累计 tokens 6.63B」而不是逐组内容
- [ ] 其它页面（关于页摘要栅格、看板明细页）**没有变化**（它们用的是 `grid` / `full` 变体，不受影响）

---

## 7. 回滚

```bash
git checkout -- components/DotMatrix.tsx components/TokenMonitor.tsx
# 或者整体放弃分支
git switch - && git branch -D feat/dotmatrix-upgrade
```

---

## 8. 常见坑

| 现象 | 原因 | 处理 |
| --- | --- | --- |
| `git apply` 报 `patch does not apply` | 文件哈希对不上（被改过），或补丁顺序错 | 先按 §2 核对哈希；确认按 0001→0002→0003 顺序 |
| 站点里自定义过的 `.dm-item { … }` 不生效了 | 0001 之后规则变成 `.dm-n3 .dm-item` | 自定义样式加 `.dm-n3 ` 前缀 |
| 屏面变宽、点变小了 | `gutter` 占了 4 列 | 不传 `gutter`，或接受 9% 的点径缩小 |
| 轮换一轮要 20 秒，太慢 | 每组固定 5s × 4 组 | 不加增量组，或合并/去掉一组（「逐组时长」还没做） |
| 深色下点阵没变暖 | `warmth` 需要 `color-mix`（2023+ 浏览器） | 老浏览器会自动降级成纯 ink，不报错 |
| 每次改主题/重渲染屏面都「开机自检」一遍 | `boot` 是一次性动画，重新挂载就重播 | 不想反复播就别传 `boot`，或用 `state="idle"` 场景才开 |
| 错点太多、看着脏 | 离线档 `density 0.06` 是按「明显故障」调的 | 把 `GLITCH_BY_TIER` 各档整体乘 0.5 |
| 水合（hydration）告警 | 错点/溶解用了随机数 | 组件内部是**带种子的确定性伪随机**，只要不传 `Math.random()` 结果进去就不会不一致 |
| 类型报错 `Property 'fadeMs' does not exist` | 传了 `boot: {}` 之类 | `boot` 传 `true` 或 `{ fadeMs, colStepMs }` |
| 想只让「数值组」出错点 | 当前错点是整屏的 | 需要 per-group glitch（待办，见 `docs/glitch.md` §6 第 16 条） |

---

## 9. 参数速查

| 参数 | 默认 | 一句话 |
| --- | --- | --- |
| `items` | — | 轮换内容，每组 ≤ 7 字符，自动大写 |
| `primary` | `1` | reduced-motion 定格哪一组（自动夹取） |
| `title` | — | 悬停提示 |
| `label` / `lang` | `items.join(" / ")` / — | 读屏名称与语言 |
| `animate` | `"auto"` | 单组时是否也带闪（`always` / `never`） |
| `glitch` | 关 | `{ density, patterns, holdMs, seed, holes }` |
| `groupColors` | — | 逐组配色，未配色的组回退 `--color-ink` |
| `dotFill` | `0.615` | 点径比例（点直径 ÷ 格距） |
| `warmth` | `0` | 色温 0–1（暖白 `#ffd9a0`） |
| `sweep` / `staggerMs` | `"col"` / `22` | 重组方向与相位步进 |
| `persistence` | `0` | 余晖（ms 或 `{ ms, opacity }`，DOM ×2） |
| `gutter` | — | 两侧状态指示列（占宽 4 列） |
| `state` | `"run"` | `"idle"` = 待机脉冲 |
| `boot` | `false` | 开机自检；`{ fadeMs, colStepMs }` 调节奏 |

完整语义见 `README.md` 的 API 表与 `docs/glitch.md`。

---

## 10. 还没做的（下一批候选）

| 项 | 说明 |
| --- | --- |
| 逐组时长 | 现在每组固定 5s，4 组 = 20s；给 `items` 支持 `{ text, holdMs }` 就能让数值停久一点 |
| per-group glitch | 只让数值组出错点（需要候选点按组限定） |
| 离屏/后台暂停 | `IntersectionObserver` + `visibilitychange` 停 `animation-play-state` |
| 节点合批 | 333 个圆点合批成 ~76 条 path（实测主线程 −56%，像素等价），见 `docs/improvements.md` |
| 按时间段切换语气 | 深夜 `REST` / 清晨 `KEEP ON`；只需站点侧按小时选词，组件不用改（暂不实现） |
