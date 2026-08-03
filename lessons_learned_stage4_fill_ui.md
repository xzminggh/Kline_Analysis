# Stage 4 经验落盘：全量补齐 UI + TypeScript 全量修复

> 阶段：Stage 4
> 主题：OverviewScreen 全量补齐入口 / KlineFiller UI 编排 / 指标 nullable 类型治理
> 落盘日期：2026-07-28
> 对应提交：`1d9b0f9`

---

## 1. 核心架构模式

### 1.1 UI 层只负责「触发 + 反馈」，不碰数据层
- `OverviewScreen` 只调用 `KlineFiller.fillBatch(codes, db, onProgress)`
- 所有交易日历、数据源降级、SQLite 写入、缓存逻辑全部留在 `services/` 层
- 进度回调仅更新 React state，UI 与业务编排通过纯函数接口解耦

### 1.2 批量补齐的用户体验设计
- **分批保护**：超过 50 只股票时默认只处理前 50 只，避免一次拉取过多导致超时或流量过大
- **互斥锁**：`isFilling` 与 `isRunning` 共同禁用「补齐」和「运行筛选」按钮，防止并发操作
- **进度可视化**：进度条 + 当前股票代码 + `(current/total)` 文案，让用户感知到任务在前进
- **结果反馈**：弹窗展示成功/失败/跳过数量，并刷新 K 线数据量，形成完整闭环

### 1.3 指标函数返回 `(number | null)[]` 的类型治理
- 早期指标函数在「数据不足」位置 push `null`，但声明为 `number[]`，导致 TypeScript 严格模式下编译失败
- 统一将 `calculateMA/RSI/Bollinger/ATR/CCI/MOM/ROC/BollingerWidth/Slope/Amplitude/findLocalExtrema` 等返回类型改为 `(number | null)[]`
- 策略函数签名同步接受 nullable 数组，并在入口处用局部变量缓存数组元素，利用 TypeScript 类型收窄保证后续运算安全

---

## 2. 踩坑记录

### 2.1 TypeScript 数组元素不会跨语句收窄
**问题**：
```ts
if (middle[i] === null) continue;
const std = Math.sqrt(sum / period);
upper.push(middle[i] + stdDev * std); // TS2531: Object is possibly 'null'
```
**原因**：TypeScript 不会对数组索引访问做跨语句的 null 收窄。
**解决**：在循环内用局部变量缓存值：
```ts
const middleValue = middle[i];
if (middleValue === null) continue;
upper.push(middleValue + stdDev * std);
```

### 2.2 函数声明与变量重名导致诡异类型错误
**问题**：`StrategyEngine.ts` 末尾有一个未使用的 `function ma20(data: number[])`，而 `analyzeStock` 内计划新增 `const ma20 = calculateMA(closes, 20)`。调用 `k01MaSupportResistance(..., ma60, ma20, n)` 时报错：
```
Argument of type '(data: number[]) => number[]' is not assignable to parameter of type 'number[]'
```
**原因**：函数声明提升后，与局部变量同名产生冲突。
**解决**：删除未使用的 `ma20` 辅助函数，新增局部变量 `const ma20 = calculateMA(closes, 20)`。

### 2.3 `reduce` 空数组推断为 `never[]`
**问题**：
```ts
const recentLows = closes.slice(...).reduce((acc, val, idx) => { ... acc.push({ idx, val }); ... }, []);
```
报错 `acc` 类型为 `never[]`。
**解决**：显式指定累加器类型：
```ts
.reduce<{ idx: number; val: number }[]>((acc, val, idx) => { ... }, [])
```

### 2.4 KlineChart 渲染 nullable 指标
**问题**：MA/布林带改为 nullable 后，`renderMALine` 和 `renderBollinger` 直接使用 `lineData[i] > 0` 会触发 TS 错误。
**解决**：
- 函数签名改为 `(number | null)[]`
- 渲染前用局部变量取值并判断 `!== null`
- 计算价格范围时用类型谓词过滤：`allPrices.filter((v): v is number => v !== null && v > 0)`

### 2.5 样式对象重复键
**问题**：`StrategyScreen.tsx` 中 `resultHeader` 被定义了两次，TypeScript 报 `TS1117`。
**解决**：将结果项的 header 重命名为 `resultItemHeader`，保持两个不同语义 styles 独立。

---

## 3. 可扩展方向

### 3.1 单股实时补齐 UI
- Stage 5 可在 `DetailScreen` 增加「补齐此股」按钮
- 调用 `KlineFiller.fillSingle(code, db)`，复用同一套缓存与熔断逻辑

### 3.2 补齐任务后台化
- 当前批量补齐阻塞 UI 线程（逐只 await）
- 后续可结合 `expo-task-manager` 或 `BackgroundFetch` 将大批量补齐放入后台，前台仅展示任务状态

### 3.3 失败重试与断点续传
- 当前熔断机制会跳过剩余股票
- 可扩展为记录失败列表，允许用户单独对失败股票二次补齐

### 3.4 指标类型进一步收敛
- 建议统一所有指标消费侧使用 `number | null`，避免未来新增指标时重复出现类型修复
- 可考虑引入指标结果封装对象，避免策略函数签名过长

---

## 4. 质检 checklist（本阶段已验证）

- [x] `npx tsc --noEmit` 无错误
- [x] `npx jest --ci --silent` 73/73 通过
- [x] 未删除/重命名已有业务函数
- [x] UI 层未修改数据层代码
- [x] 新增代码向后兼容
