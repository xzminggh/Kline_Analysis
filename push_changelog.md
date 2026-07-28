# 推送变更清单 (Push Changelog)

> 记录每次 git 双推 (Gitee + GitHub) 的主要变更内容要点，便于快速查看历史推进。
> 格式：日期 · commit hash · 分支 · 阶段 · 要点摘要
>
> **分支说明**：
> - `master` — 主分支，稳定版本
> - `trae` — Trae AI 开发分支，所有 AI 辅助开发的改动都在此分支

---

## 2026-07-28 · `95e8863` · **trae** · Stage 2 · 三源行情拉取器 (QuoteFetcher)

- **分支**: `trae`
- **文件**:
  - [src/services/QuoteFetcher.ts](file:///f:/trae%20solo/coze%20stock-screener联网版/kline_-analysis/src/services/QuoteFetcher.ts) — 三源行情拉取核心模块
  - [src/services/QuoteFetcher.test.ts](file:///f:/trae%20solo/coze%20stock-screener联网版/kline_-analysis/src/services/QuoteFetcher.test.ts) — 11 个单元测试
  - [scripts/test_real_quote.js](file:///f:/trae%20solo/coze%20stock-screener联网版/kline_-analysis/scripts/test_real_quote.js) — 真实网络验证脚本
- **功能**:
  - `fetchKline(code, startDate, endDate)` — 三源降级拉取日K线数据
  - 三源优先级：腾讯 → 新浪 → 东方财富
  - 返回统一归一化 `KlineDaily[]` 格式
  - 单源超时 5s，支持 AbortController
  - 停牌返回空数组（不报错）
  - 市场前缀自动推断（沪/深/北交所）
- **修复**:
  - 东财源添加 `User-Agent` 和 `Referer` 请求头，解决直连被服务器重置问题
- **测试覆盖**:
  - 单元测试: 11 个场景（腾讯成功/降级逻辑/三源全败/停牌/市场前缀/新浪日期过滤/HTTP错误/东财日期格式/状态查询）
  - 真实网络测试: 腾讯 ✅ 新浪 ✅ 东财 ✅
- **质检结果**:
  - 单元测试: 52/52 ✅ (新增 11 个)
  - 全量回归: 52/52 ✅ (无现有测试被破坏)
  - 模块边界: ✅ (新增在 services/, 未碰 db/UI/策略/指标)
- **双推状态**: Gitee ✅ / GitHub ⚠️ (网络连接失败)

---

## 2026-07-28 · `1d9b0f9` · **trae** · Stage 4 · 全量补齐 UI + TypeScript 全量修复

- **分支**: `trae`
- **文件**:
  - [src/screens/OverviewScreen.tsx](file:///f:/trae%20solo/coze%20stock-screener联网版/kline_-analysis/src/screens/OverviewScreen.tsx) — 全量补齐 UI 入口
  - [src/services/KlineFiller.ts](file:///f:/trae%20solo/coze%20stock-screener联网版/kline_-analysis/src/services/KlineFiller.ts) — fillBatch 进度回调与结果统计
  - [src/indicators/Indicators.ts](file:///f:/trae%20solo/coze%20stock-screener联网版/kline_-analysis/src/indicators/Indicators.ts) — 指标返回类型修正
  - [src/strategies/StrategyEngine.ts](file:///f:/trae%20solo/coze%20stock-screener联网版/kline_-analysis/src/strategies/StrategyEngine.ts) — 策略函数签名适配 nullable 指标
  - [src/components/KlineChart.tsx](file:///f:/trae%20solo/coze%20stock-screener联网版/kline_-analysis/src/components/KlineChart.tsx) — K 线图 nullable 指标渲染
  - [src/screens/StrategyScreen.tsx](file:///f:/trae%20solo/coze%20stock-screener联网版/kline_-analysis/src/screens/StrategyScreen.tsx) — 修复重复样式键
- **功能**:
  - OverviewScreen 新增「补齐最新 K 线」按钮，支持一键批量补齐
  - 分批保护：超过 50 只股票时默认只处理前 50 只，并提示分批
  - 实时进度条 + 当前股票代码提示
  - 补齐完成后弹窗展示成功/失败/跳过数量，并刷新 K 线数据量
  - 补齐过程中禁用分析运行按钮，避免并发操作
- **TypeScript 修复**:
  - 统一 calculateMA/RSI/Bollinger/ATR/CCI/MOM/ROC/BollingerWidth/Slope/Amplitude/findLocalExtrema 等函数返回 `(number | null)[]`
  - StrategyEngine 所有策略函数适配 nullable 指标参数
  - 删除未使用的 `ma20` 辅助函数，避免与变量名冲突
  - 修复 StrategyScreen 中重复的 `resultHeader` 样式键
  - KlineChart 渲染 MA/布林带时过滤 null 值
- **测试覆盖**:
  - KlineFiller 新增批量补齐进度回调 / 并发拒绝 / 熔断 / isFilling 状态等用例
- **质检结果**:
  - TypeScript 编译: `npx tsc --noEmit` ✅ 无错误
  - 单元测试: 73/73 ✅ (无现有测试被破坏)
  - 模块边界: ✅ (UI 层只调用 KlineFiller，不碰数据层)
- **双推状态**: Gitee ✅ / GitHub ⚠️ (网络连接 reset)

---

## 2026-07-28 · `d255972` · **trae** · Stage 3 · 补齐编排 + SQLite 增量写入 (KlineFiller + FillCache)

- **分支**: `trae`
- **文件**:
  - [src/services/KlineFiller.ts](file:///f:/trae%20solo/coze%20stock-screener联网版/kline_-analysis/src/services/KlineFiller.ts) — 补齐业务编排核心
  - [src/services/KlineFiller.test.ts](file:///f:/trae%20solo/coze%20stock-screener联网版/kline_-analysis/src/services/KlineFiller.test.ts) — 14 个单元测试
  - [src/services/FillCache.ts](file:///f:/trae%20solo/coze%20stock-screener联网版/kline_-analysis/src/services/FillCache.ts) — LRU 补齐缓存
  - [src/services/FillCache.test.ts](file:///f:/trae%20solo/coze%20stock-screener联网版/kline_-analysis/src/services/FillCache.test.ts) — 8 个单元测试
- **功能**:
  - `KlineFiller.fillSingle()` — 单股补齐：查最新日期 → 算缺失交易日 → 拉取 → 写入 → 更新缓存
  - `KlineFiller.fillBatch()` — 批量补齐：遍历股票列表，进度回调，逐只补齐
  - `FillCache` — LRU 缓存最近 30 只股票，防止短期内重复补齐，支持 TTL
  - 互斥锁 `isFilling` 防止并发补齐同一批次
  - 熔断机制：连续失败 > 3 次则暂停当前批次
  - `INSERT OR REPLACE` 批量写入 K 线，单条失败不影响其他
- **模块边界**:
  - KlineFiller 仅编排 tradingCalendar + QuoteFetcher + FillCache + db，不碰 UI/策略/指标
  - FillCache 纯内存，不碰 db
- **测试覆盖**:
  - FillCache: LRU 淘汰 / 重复 set / TTL 过期 / clear / entries
  - KlineFiller: 数据库未连接 / 已有最新数据 / 缓存命中 / 拉取成功写入 / 拉取失败 / 停牌 / force 模式 / 批量补齐 / 并发拒绝 / 熔断 / 进度回调 / isFilling 状态
- **质检结果**:
  - 单元测试: 73/73 ✅ (新增 21 个)
  - 全量回归: 73/73 ✅ (无现有测试被破坏)
  - 模块边界: ✅ (新增在 services/, 未碰 db/UI/策略/指标)
- **双推状态**: Gitee ✅ / GitHub ✅

---

## 2026-07-28 · `eaaaa7d` · **trae** · Stage 1 · 交易日历工具 (tradingCalendar)

- **分支**: `trae`
- **文件**:
  - [src/utils/tradingCalendar.ts](file:///f:/trae%20solo/coze%20stock-screener%E8%81%94%E7%BD%91%E7%89%88/kline_-analysis/src/utils/tradingCalendar.ts) — 交易日历核心工具
  - [src/utils/tradingCalendar.test.ts](file:///f:/trae%20solo/coze%20stock-screener%E8%81%94%E7%BD%91%E7%89%88/kline_-analysis/src/utils/tradingCalendar.test.ts) — 15 个单元测试
- **功能**:
  - `isTradingDay(date)` — 判断是否为 A 股交易日 (支持节假日 + 调休上班)
  - `getLastTradingDay(date)` — 获取前一个交易日
  - `getMissingTradingDays(start, end)` — 获取两个日期之间所有缺失交易日
  - `updateHolidays()` — 支持外部注入自定义节假日表
- **测试覆盖**: 工作日/周末/节假日/调休/Date对象输入/跨长假回退/配置更新
- **质检结果**:
  - 单元测试: 15/15 ✅
  - 全量回归: 40/40 ✅ (无现有测试被破坏)
  - 模块边界: ✅ (新增在 utils/, 未碰 db/UI/策略/指标)
  - TS 编译: tradingCalendar.ts 无错误 ✅ (已有文件历史错误未引入)
- **双推状态**: Gitee ✅ / GitHub ✅

---

## 2026-07-28 · `c9680f4` · **trae** · docs(init) · Trae AI 开发分支初始化

- **分支**: `trae` (从 master 切出,用于 AI 辅助开发)
- **要点**:
  - 创建 trae 分支,标记所有 Trae AI 开发改动
  - 更新 push_changelog.md 格式: 新增「分支」列
  - 添加分支说明: master = 稳定版, trae = AI 开发版
- **双推状态**: Gitee ✅ / GitHub ✅

---

## 2026-07-28 · `9e77ec7` · **master** · docs(loop-constructor) · loop-constructor 工程设计图产出 (5 阶段)

- **文件**:
  - [.loop/kline-fill.loop.json](file:///f:/trae%20solo/coze%20stock-screener%E8%81%94%E7%BD%91%E7%89%88/kline_-analysis/.loop/kline-fill.loop.json) — 机器可校验 JSON 设计图
  - [.loop/kline-fill.loop.md](file:///f:/trae%20solo/coze%20stock-screener%E8%81%94%E7%BD%91%E7%89%88/kline_-analysis/.loop/kline-fill.loop.md) — 人类可读 Runbook
- **D0-D6 决策**:
  - D0: YES (5 个可运行检查)
  - D1: STAGED (4 seams, 5 stages)
  - D2: 见各阶段 (generate-validate ×4 + batch-process ×1)
  - D3: hybrid (内层自动, 阶段门限人确认)
  - D4: medium (5 阶段串行)
  - D5: 各阶段 3-5 次 cap + 风险守卫
  - D6: completeness-first (金融数据正确性优先)
- **5 个阶段**:
  1. 交易日历工具 (tradingCalendar.ts)
  2. 三源行情拉取器 (QuoteFetcher.ts)
  3. 补齐编排 + SQLite 增量写入 (KlineFiller + FillCache)
  4. 全量补齐 UI (概览页入口)
  5. 单股实时补齐 UI (详情页入口)
- **核心铁律**: 向后兼容 / 模块边界 / UI 不碰数据层 / 质检前置 / 双推纪律 / 经验落盘
- **Linter 校验**: 全部通过 (version / altitude / selection_log / stages / human / outer / acyclic)
- **双推状态**: Gitee ✅ / GitHub ✅

---

## 2026-07-28 · `4d407da` · **master** · docs(loop) · 新增 K 线增量补齐循环 Manifest

- **文件**: [kline-app-fill.loop.md](file:///f:/trae%20solo/coze%20stock-screener联网版/kline_-analysis/kline-app-fill.loop.md)
- **要点**:
  - 混合补齐模式 (C): 全量检查入口 + 单股实时入口
  - 三源降级 (腾讯→新浪→东方财富), LRU 30 只缓存
  - 网络层模块边界铁律: QuoteFetcher 不碰 db/UI/策略
  - 解除原 Manifest 严禁联网约束 (仅限行情拉取模块)
  - 保留现有 25 策略/指标/importDatabase 行为不变
- **双推状态**: Gitee ✅ / GitHub ✅

---
