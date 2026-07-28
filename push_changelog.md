# 推送变更清单 (Push Changelog)

> 记录每次 git 双推 (Gitee + GitHub) 的主要变更内容要点，便于快速查看历史推进。
> 格式：日期 · commit hash · 分支 · 阶段 · 要点摘要
>
> **分支说明**：
> - `master` — 主分支，稳定版本
> - `trae` — Trae AI 开发分支，所有 AI 辅助开发的改动都在此分支

---

## 2026-07-28 · `待推送` · **trae** · Stage 1 · 交易日历工具 (tradingCalendar)

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
- **双推状态**: 待推送

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
