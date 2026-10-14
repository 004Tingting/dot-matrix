# 直接改进版：怎么用到站点上

本仓库的 `src/DotMatrix.tsx` = **站点那份组件 + 可直接应用的改进**。改进以 patch 形式给出，
按顺序 `git apply` 即可，**不需要动站点的其它文件**；每一项都可单独取舍（默认全部关闭）。

```
personal-site/components/DotMatrix.tsx  ← 上游（43c00d6）
   │  git apply patches/0001-p0-scoped-keyframes.patch
   ├─→ ① P0 修复：样式作用域化 / 单组策略 / primary 夹取
   │  git apply patches/0002-glitch-effect.patch
   ├─→ ② 错点效果：glitch: { density, patterns, holdMs, seed, holes }
   │  git apply patches/0003-visual-state-params.patch
   └─→ ③ 视觉与状态参数：dotFill / warmth / groupColors / sweep / staggerMs /
          persistence / gutter / state / boot / label / lang
```

```bash
cd personal-site
for p in 0001-p0-scoped-keyframes 0002-glitch-effect 0003-visual-state-params; do
  git apply /path/to/dot-matrix/patches/$p.patch
done
```

三片都应用后，文件与本仓库 `src/DotMatrix.tsx` **逐字节一致**
（SHA-256 `C8039C7445E33654C0D24D494322C93CA45FAC678765882D4966B69C696B6D71`），已验 `git apply --check`。

> 只想先修 bug？只应用 `0001`。只想要错点效果？应用 `0001` + `0002`（`0002` 依赖 `0001` 的作用域化）。

---

## 一、改完组件后，站点侧建议怎么接

改动都在 `components/TokenMonitor.tsx` 的 `aside` 分支（首页侧栏那张卡），大约 15 行。
下面给的是**完整替换片段**，可直接对照现有实现改写。

```tsx
/** 首页侧栏点阵屏的轮换内容 */
const DOT_MATRIX_WORD = "STRIVE";
const DOT_MATRIX_TAG = "04Ting.";

/* ---------- aside 分支内 ---------- */
const allTime = periods?.allTime ?? null;
const today = periods?.today ?? null;

const matrixValue = allTime ? fmtTokensCompact(allTime.totalTokens) : "0";
/** 增量一栏：今日新增（为 0 时不显示，避免多占一个 5s 时段） */
const matrixDelta = today && today.totalTokens > 0 ? `+${fmtTokensCompact(today.totalTokens)}` : null;
const matrixTitle = allTime ? `${t.allTime} ${fmtTokensFull(allTime.totalTokens)} tokens` : undefined;

const matrixItems = [DOT_MATRIX_WORD, ...(matrixDelta ? [matrixDelta] : []), matrixValue, DOT_MATRIX_TAG];
/** 数值组单独配色：找出数值组下标，避免增量有无时索引错位 */
const valueIdx = matrixItems.indexOf(matrixValue);
const groupColors = matrixItems.map((_, i) => (i === valueIdx ? "var(--color-accent)" : undefined));

/** 数据新鲜度 → 错点语言：0 实时 / 1 实时停更 / 2 快照兜底 / 3 构建快照（离线） */
const tier = lastOk === false ? (liveAt ? 1 : repoOk ? 2 : 3) : 0;
const GLITCH_BY_TIER = [
  { density: 0.015, patterns: 8, holdMs: 140, seed: 3 },  // 正常：偶发孤点
  { density: 0.030, patterns: 2, holdMs: 300, seed: 5 },  // 停更：开始不稳
  { density: 0.045, patterns: 1, holdMs: 480, seed: 5 },  // 快照：同几处坏点反复闪
  { density: 0.060, patterns: 1, holdMs: 620, seed: 7 },  // 离线：持续故障
];

<DotMatrix
  items={matrixItems}
  primary={valueIdx}                        // reduced-motion 定格数值组
  title={matrixTitle}                       // 悬停看精确值
  label={`${t.allTime} ${matrixValue} tokens`}   // 读屏语义化（别念「斜杠」）
  lang={lang}                               // zh-CN / en
  groupColors={groupColors}                 // 数值组用 accent
  gutter={{ heartbeat: true, online: lastOk !== false }}   // 两侧固定状态指示
  glitch={GLITCH_BY_TIER[tier]}             // 错点 = 数据状态语言
  className="mt-2 block w-full"
/>
```

可选再加「刷新瞬间爆发」（数值刚变化时短促抖一下）：

```tsx
const [burst, setBurst] = useState(false);
useEffect(() => {
  if (!matrixValue) return;
  setBurst(true);
  const id = setTimeout(() => setBurst(false), 900);
  return () => clearTimeout(id);
}, [matrixValue]);

glitch={burst ? { density: 0.035, patterns: 1, holdMs: 120, seed: 2 } : GLITCH_BY_TIER[tier]}
```

> `lastOk` / `liveAt` / `repoOk` 是 `TokenMonitor.tsx` 现有的状态变量（第 226、291–293 行附近）；
> 若之后重命名，按同样的三层兜底逻辑替换即可。

---

## 二、每项改进会看到什么

| 改动 | 视觉/信息效果 | 代价 |
| --- | --- | --- |
| `groupColors` 数值组用 accent | 「态度 / 增量 / 数据 / 签名」四类内容一眼分层，数值最显眼 | 无（多 4 条 CSS 规则） |
| 增量一栏 `+12M` | 屏上多一条真正会变的信息（今日新增），比静态总量有信息量 | 多一组 → 周期 20s（见下） |
| `gutter` 状态指示列 | 左列心跳点（在跑）、右列在线点（离线转闪烁）——像真机的状态灯 | 屏宽 +4 列 → 点径约小 9% |
| `glitch` 接数据状态 | 离线/陈旧时屏面「不稳定」，一眼看出数据不可信 | 离线档错点节点约 +190 个 |
| `label` / `lang` | 读屏念「累计 tokens 6.63B」而不是「STRIVE 斜杠 6.63B」 | 无 |
| `warmth: 0.4` | 深色主题下点阵偏暖白，更像真 LED | 需 `color-mix`（2023+ 浏览器），老浏览器自动降级为纯 ink |
| `sweep: "diag"` / `"dissolve"` | 重组方式从逐列变成对角/溶解，同一屏换性格 | 无 |
| `persistence: 120` | 点亮位带一点余晖拖尾 | DOM ×2（动画点 214 → 428） |
| `boot` | 每次上电整屏先全亮再逐列退回底点 | 无额外节点（复用底点） |
| `state="idle"` | 无数据时不留空屏，中间行来回扫一个脉冲 | 无 |

**周期问题**：现在是「每组 5s」固定值，4 组 = 20s 一轮。若嫌慢，两个选择：
① 不加增量组（保持 3 组 15s）；② 把 `DOT_MATRIX_WORD` 与 `DOT_MATRIX_TAG` 合并/去掉一个。
（「逐组时长」是待办项，本批没做，见 `docs/improvements.md`。）

---

## 三、只记录、暂不实现的构想

这两条按你的要求只写进文档，不动代码：

1. **hub 离线 → 错点变多**：已在上面第一节写成 `GLITCH_BY_TIER`（第 3 档），
   属于「错点作为状态语言」的落地；完整清单见 [glitch.md](glitch.md) 的「状态语言」一节。
2. **按时间段切换语气**（如深夜显示 `REST`、清晨 `KEEP ON`）：需要站点侧按本地时间选词，
   组件不需要改动 —— 把 `DOT_MATRIX_WORD` 换成 `hour >= 23 || hour < 6 ? "REST" : "STRIVE"` 即可。
   暂不实现。

---

## 四、反向操作（不想要就少传一个 prop）

`dotFill` / `warmth` / `groupColors` / `sweep` / `staggerMs` / `persistence` / `gutter` /
`state` / `boot` / `glitch` **全部可选，默认关闭**，且默认参数下的输出与 P0 修复版**逐字节一致**
（由 `test/compare.html` 的 17 项判据守住）。所以可以先只应用 patch 不接参数 —— 站点行为不变，
之后逐项打开。

同理，`0001` 是纯 bug 修复（对站点首页的单实例、n=3、默认 `primary` 场景**没有任何可见变化**），
可以先只上它。
