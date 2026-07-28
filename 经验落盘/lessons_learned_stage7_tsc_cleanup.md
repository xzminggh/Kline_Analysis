# 经验落盘 S7：历史 tsc 错误清零（27→0）

> 日期：2026-07-28 ｜ 阶段：S7 tsc-cleanup（用户明确授权修改已有代码）
> 门禁结果：tsc exit 0 ✅ ｜ jest 65/65 ✅ ｜ eslint 0 错 ✅ ｜ verify_sync exit 0 ✅

## 背景

S1–S6 期间坚持铁律不碰历史代码，tsc 基线一直是 27 个历史错误。本阶段用户明确指令"清掉"，
授权修复历史类型错误，要求"确保程序的功能完整，使用流畅，体验好"。

## 错误分布与修法（全部最小改动）

| 文件 | 错误数 | 根因 | 修法 | 运行时影响 |
|---|---|---|---|---|
| Indicators.ts | 15 | 指标数组预热期 push(null)，但声明为 number[] | 局部数组改 `(number\|null)[]`，return 处 `as number[]` 保持对外签名不变 | **零**（纯类型） |
| StrategyEngine.ts | 5 | ① K01 把 `ma20` **函数本身**当数组传入（真bug）② reduce 空数组推断 never[] | ① 新增 `ma20Line = ma20(closes)` 传数组 ② `[] as {idx,val}[]` | ① **修复真bug** ② 零 |
| PerformanceMonitor.ts | 3 | tsconfig lib 无 DOM，`performance` 未声明 | `declare const performance`（纯类型声明） | 零 |
| OverviewScreen.tsx | 2 | ① navigate 参数 never ② styles.emptyText 不存在 | ① 新增 `src/types/navigation.d.ts` 全局路由参数表 ② 补 emptyText 样式 | ① 零 ② **UX修复** |
| StrategyScreen.tsx | 1 | styles 对象重复 key `resultHeader`（TS1117） | 删**前者**（运行时本来就被后者覆盖） | 零 |
| App.tsx | 1 | Promise resolve 直传 setTimeout 类型不匹配 | `Promise<void>` + `() => resolve()` | 零 |

## 关键发现（最有价值）

### 1. tsc 错误里藏着真 bug —— K01 策略 MA20 分支从未生效
`StrategyEngine.ts` 只算了 ma60，第 109 行传给 K01 的 `ma20` 解析到了文件底部的**同名辅助函数**。
运行时 `ma20[n]` 恒为 undefined → `lows[n] <= ma20[n]` 恒 false → **MA20 支撑/压力判断静默失效**，
且第 435 行的 `=== null` 守卫拦不住 undefined（`undefined === null` 为 false），错误悄悄穿透。
**教训：TS2345"函数不能赋给数组"这类错误优先怀疑是真 bug，不是噪声。**

### 2. styles.emptyText 缺失也是 UX bug
引用不存在的样式 key 运行时得 undefined → 文字用 RN 默认黑色，深色背景 (#16213e) 下几乎不可见。
"没有找到匹配的股票"这行提示用户此前基本看不见。补样式 = 类型和体验双修复。

### 3. 重复对象 key 的删除原则
TS1117 重复属性：**运行时生效的是后者**。删除时必须删前者、保留后者，行为才完全不变。
先 diff 两份定义确认差异（本例 alignItems/marginBottom 不同，删错会变 UI）。

### 4. 预热期 null 数组的最小类型修法
指标库惯用 `[null,null,...,值]` 数组（消费端 `=== null` 判断预热期）。不动消费端的最小修法：
局部声明 `(number|null)[]` + return 处 `as number[]`。对外签名不变，下游零涟漪。
彻底改成 `(number|null)[]` 对外暴露虽更"正确"，但会强迫全部下游改判空逻辑——风险大不值得。

### 5. node:sqlite 的 verify_sync 与 jest 组成双保险
类型修复后 verify_sync（数据链路）+ jest 65 测试（行为快照）都绿，才敢说"没改坏"。
纯 tsc 通过不能证明行为不变。

## 门禁快照
- tsc：27 → **0**，exit 0（首次全绿）
- jest：6 套件 65/65（无回归）
- eslint：0 error / 14 历史 warning（数量不变）
- verify_sync 默认模式 exit 0
