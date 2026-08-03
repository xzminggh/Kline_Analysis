# 经验落盘: 成交量单位 bug 修复 (v2.0.1)

> **阶段**: v2.0.0 发布后紧急 bug 修复
> **日期**: 2026-07-28
> **影响版本**: v2.0.0 → 修复后版本 v2.0.1
> **触发路径**: 用户在云打包过程中反馈"成交量应该转换成以手为单位，才和db里的匹配起来"

---

## 一、Bug 现象

用户在云打包 v2.0.0 时反馈：抓取的成交量应该转换成以手为单位，才和 db 里的匹配起来。

## 二、根因分析

### 历史代码逻辑（错误）

[QuoteFetcher.ts](file:///f:/trae%20solo/coze%20stock-screener联网版/kline_-analysis/src/services/QuoteFetcher.ts) 三个数据源原本统一做了 `* 100` 转换：

```ts
// 腾讯源 L105 (修复前)
volume: parseFloat(item[5]) * 100, // 手 → 股
// 新浪源 L160 (修复前)
volume: parseFloat(item.volume) * 100, // 手 → 股
// 东方财富源 L220 (修复前)
volume: parseFloat(parts[5]) * 100, // 手 → 股
```

**错误假设**：原代码以为三个数据源返回的是"手"，需要乘以 100 转成"股"。
**实际情况**：三个源返回的本来就是"手"单位，而 db 中存储的也是"手"单位。
**结果**：补齐的 K 线成交量比真实值大 100 倍，与 db 原有数据严重不一致。

### 影响范围

- ✅ 范围：仅 [QuoteFetcher.ts](file:///f:/trae%20solo/coze%20stock-screener联网版/kline_-analysis/src/services/QuoteFetcher.ts) 三处 volume 字段
- ✅ 不影响：db 原有数据（未写入）、UI 显示（KlineChart.tsx 用 `volume / 10000` 显示"万"）、策略计算（StrategyEngine.ts 用相对值比较）、AnalysisService.ts、KlineFiller.ts

## 三、修复方案

### 三处 volume 字段去掉 `* 100`，保持原值

```ts
// 腾讯源 (修复后)
volume: parseFloat(item[5]), // 与 db 一致：手（腾讯返回即为手）
// 新浪源 (修复后)
volume: parseFloat(item.volume), // 与 db 一致：手
// 东方财富源 (修复后)
volume: parseFloat(parts[5]), // 与 db 一致：手
```

### 测试用例同步修正

[QuoteFetcher.test.ts](file:///f:/trae%20solo/coze%20stock-screener联网版/kline_-analysis/src/services/QuoteFetcher.test.ts) L80 原本期待 `volume: 1000000`（10000 × 100），
修正为 `volume: 10000`（与抓取原值一致）。

```ts
// 修复前
volume: 1000000, // 手 × 100
// 修复后
volume: 10000, // 与 db 一致：手（抓取原值，不再 ×100）
```

## 四、踩坑记录

### 1. 单位假设必须验证，不能凭注释

原代码注释写着"手 → 股"，看似合理，但从未真正对照 db 验证过。直到用户在云打包时发现才暴露。
**教训**：数据单位这类关键转换，必须与 db 实际数据交叉验证。

### 2. Edit 工具陷阱：多行替换时小心 `}));` 被吞

在修复腾讯源时，Edit 的 old_string 同时包含了 `volume` 和 `amount` 两行，第一次替换导致 `amount` 字段被删除，违反了铁律"不删除已有代码"。

**正确做法**：
- Edit 的 old_string/new_string 行数尽量对齐
- 修改后立即用 Read 验证文件结构完整
- 发现字段缺失立即补回

### 3. Bug 修复时同步检查测试预期值

测试用例的预期值经常写死了"假设值"。如果只改源码不改测试，测试会因为旧预期值而通过（实际上 bug 未修复）。
**教训**：修 bug 时搜索测试文件中相关字段（如 `volume`），同步更新预期值。

## 五、质检结果

| 项目 | 结果 |
|------|------|
| TypeScript 编译 (`tsc --noEmit`) | ✅ 0 错误 |
| 单元测试 (`jest --ci --silent`) | ✅ 73/73 全通过 |
| 模块边界 | ✅ 仅改 services/QuoteFetcher.ts + 对应 test |
| 向后兼容 | ✅ 不影响 db 数据、UI 显示、策略计算 |

## 六、可扩展方向

1. **单位校验脚本**：新增 `scripts/verify_volume_unit.js`，对真实数据源和 db 各取同一天同股的 volume 字段，自动比对单位是否一致。
2. **统一单位约定**：在 [SQLiteProvider.tsx](file:///f:/trae%20solo/coze%20stock-screener联网版/kline_-analysis/src/database/SQLiteProvider.tsx) 的 `KlineDaily` 类型注释中明确写明 `volume: 手`，避免后续开发再次踩坑。
3. **集成测试**：补齐"抓取 → 入库 → 读出 → 单位一致性检查"的端到端测试。

## 七、本次变更文件清单

- [src/services/QuoteFetcher.ts](file:///f:/trae%20solo/coze%20stock-screener联网版/kline_-analysis/src/services/QuoteFetcher.ts) — 3 处 volume 去掉 `* 100`
- [src/services/QuoteFetcher.test.ts](file:///f:/trae%20solo/coze%20stock-screener联网版/kline_-analysis/src/services/QuoteFetcher.test.ts) — 1 处测试预期值修正

## 八、核心代码片段（可调用参考）

```ts
/**
 * 成交量单位约定（项目级铁律）
 * - 数据库 KlineDaily.volume 单位：手
 * - 三个数据源返回的 volume 单位：手
 * - UI 显示时用 (volume / 10000).toFixed(0) + "万" 转换
 * - 不要在 QuoteFetcher 里做任何 ×100 / ÷100 转换
 */
```

---

*本经验落盘于 v2.0.0 → v2.0.1 bug 修复时同步双推。*
