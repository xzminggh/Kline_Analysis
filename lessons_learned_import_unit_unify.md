# 经验落盘: 输入代码联网导入 + 成交量单位统一 (2026-08-08)

> **阶段**: v3.0.0 之后的功能增强
> **触发**: 用户确认 kline_-analysis 只能筛导入库、无法输入任意股票代码在线分析；同时发现补齐数据与桌面版 db 单位不一致

---

## 一、功能背景

kline_-analysis 原有数据来源只有「导入 SQLite 文件」，在线抓取（KlineFetcher/QuoteFetcher）只服务于「库内已有股票的增量补齐」：

- 详情页输入任意代码 → `getKlineByCode` **只查本地库**，库里没有就「暂无数据」
- 「补齐此股」→ `KlineFiller.fillSingle`：本地无数据时 `startDate = today` → `getMissingTradingDays(today, today)` 返回空 → **误报「已是最新数据」**，且不写 `stocks` 表

`SyncService.prepareCursors` 只从 `stocks` 表读代码（SyncService.ts:84）——所以新代码永远进不了同步/分析闭环。

## 二、解决方案

### 1. 新增 StockImporter（服务层）

- `normalizeStockCode`：`^(sh|sz|bj)?(\d{6})$` 归一化；非法抛错
- `fetchStockName`：东财 `push2.eastmoney.com/api/qt/stock/get?secid=1.600519&fields=f57,f58`，UTF-8 JSON 无转码负担（对比腾讯 GBK 需要 iconv）；失败回退空串，不阻断导入
- `importNewStock`：`fetchDailyKline(code, 1000, undefined, 'raw')` 三源降级 → `SyncService.insertMissingBars`（INSERT OR IGNORE）→ `INSERT OR REPLACE INTO stocks`

### 2. 关键：数据源统一为 KlineFetcher（万手）

| 旧 QuoteFetcher（弃用） | 新 KlineFetcher（统一） |
|---|---|
| 腾讯/新浪原样写入（实为「股」） | 腾讯÷1000000、新浪÷1000000、东财÷10000 → **万手** |
| 东财「手」原样写入 | 同上归一化，四舍五入2位 |
| 按月范围拉取 | 按天数拉取 + 缺日集合过滤 |

**教训分级**：v2.0.1 时的经验固化（「源返回已是手，db 存手」）只对了一半——那是 **QuoteFetcher 时代的 db 口径**；后来 wb 加了 `migrateVolumeToWanShou`（db 改为万手）+ 新版 KlineFetcher 归一化，**旧路径没跟上，留下单位混存**。修同一类单位 bug 前必须先确认**当前 db 真实口径**（查 `migrateVolumeToWanShou` / user_version），再决定匹配哪个 fetcher。

### 3. 建表兜底

kline_-analysis 的 SQLiteProvider **没有**自动建表（26 个策略 App 的 shared SQLiteProvider 有）。Expo Go 无 seed 库时为空库无表 → `INSERT OR IGNORE INTO kline_daily` 会 `no such table`。补上与 shared 一致的 `CREATE TABLE IF NOT EXISTS stocks/kline_daily/meta`（幂等，不干扰导入库）。

## 三、易错点

1. **`loadStockList` 提为组件函数时要用 `useCallback`**——裸函数导致 `useEffect` 每轮渲染重跑,死循环/闪烁
2. **INSERT OR IGNORE 语义**：已存在行不动；混合了 `INSERT OR REPLACE INTO stocks`（stocks 允许替换，kline 铁律禁止 REPLACE）
3. **新浪 datalen 上限 1023** → 全量导入 1000 根安全；腾讯 count 参数同样会被上游截断，不做循环分页（26 策略只需 ≥100 根，1000 根富余）
4. **expo-sqlite `getFirstAsync` 返回 null 需要判空**：`local?.lastDate` 前必须处理 null

## 五、验证结果

- `tsc --noEmit`：0 错误（顺手修复 2 个存量 tsc 错误：StrategyScreen resultHeader 样式误删、sync_test fetchKlineWithFallback 残留引用）
- `jest`：11 套件 136 用例全过，新增 StockImporter 8 用例 + KlineFiller 新语义用例
- `eslint`：0 error（**只警告，全是存量**，未新增）

## 六、后续

- 真机 Expo Go 验证：600519 输入 → 导入 → 图表/表格数值与桌面版一致
- 可选：给「已被旧路径污染的行」加单股重建入口（删 kline_daily 重补）