# Stage 5 经验落盘：单股实时补齐 UI (DetailScreen 入口)

> 阶段：Stage 5
> 主题：DetailScreen 单股补齐按钮 + 行内结果反馈
> 落盘日期：2026-07-28
> 对应提交：`6411cd4`

---

## 1. 核心架构模式

### 1.1 单股补齐 vs 批量补齐
- 单股补齐直接调用 `KlineFiller.fillSingle(code, db)`，无需进度条
- 不触发互斥锁（`isFilling` 仅在 `fillBatch` 中使用），批量补齐期间单股补齐可以并行
- 补齐成功后自动调用 `loadKlineData()` 刷新 K 线和策略分析，形成闭环

### 1.2 行内结果反馈设计
- 不使用 Alert 弹窗（打断用户操作），改用行内文字提示
- 成功：绿色文字「新增 N 条K线 (source)」
- 已最新：绿色文字「已是最新数据」
- 失败：红色文字 + Alert 弹窗（需要用户关注）
- 3 秒后自动清除提示，保持界面整洁

### 1.3 按钮状态管理
- 补齐中按钮变灰 + 文字变为「补齐中...」+ `disabled={true}`
- 防止用户快速连击导致重复拉取

---

## 2. 踩坑记录

### 2.1 `useDatabase()` 解构需确认可用字段
**问题**：DetailScreen 原来只解构了 `{ getKlineByCode, getStocks }`，新增补齐需要 `isConnected` 和 `db`。
**解决**：扩展解构为 `{ getKlineByCode, getStocks, isConnected, db }`，确保 `useDatabase` hook 提供了这些字段。

### 2.2 补齐后需要重新加载策略分析
**要点**：`loadKlineData()` 更新 `klineData` state 后，已有的 `useEffect` 监听 `klineData` 变化会自动触发 `runStockAnalysis()`，不需要手动调用。这种设计让补齐 → 刷新 K 线 → 重新分析形成自动链路。

---

## 3. 可扩展方向

### 3.1 补齐范围选择
- 当前 `fillSingle` 只补齐到最新交易日
- 可扩展为「补齐近 N 日」或「补齐到指定日期」

### 3.2 单股补齐历史记录
- 记录每只股票的补齐时间、新增条数，方便用户回顾

### 3.3 补齐动画效果
- 可为补齐按钮添加 lottie 动画，提升体验

---

## 4. 质检 checklist（本阶段已验证）

- [x] `npx tsc --noEmit` 无错误
- [x] `npx jest --ci --silent` 73/73 通过
- [x] 未删除/重命名已有业务函数
- [x] UI 层未修改数据层代码
- [x] 新增代码向后兼容
