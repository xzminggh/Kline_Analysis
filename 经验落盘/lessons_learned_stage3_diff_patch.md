# 经验落盘 — Stage3 diff_patch（比对 + 仅INSERT补齐）

日期：2026-07-28
操作人：WorkBuddy（老徐的伙计）

## 本阶段做了什么
- `SyncService.ts` 完整实现：prepareCursors（LEFT JOIN 保证无K线股票也有游标）→ fetch → dropUnclosedTodayBar → checkAdjustBasis → diffMissingBars → insertMissingBars（事务+INSERT OR IGNORE）→ writeMeta 游标 → SyncSummary
- 新增 `SyncService.test.ts`：15 断言，含 FakeDb（记录全部 SQL）实现的**铁律硬断言** `hasDestructiveKlineSql()` —— kline_daily 上出现任何 UPDATE/DELETE/REPLACE 即测试失败

## 关键设计决策
1. **INSERT OR IGNORE 而非 INSERT OR REPLACE**：REPLACE 在 SQLite 里是先 DELETE 再 INSERT，会改写用户历史，违反铁律。OR IGNORE 撞主键静默跳过，天然幂等
2. **当日未收盘 bar 过滤**：交易时段（09:15–15:05）内剔除当日 bar（盘中数据未定型），收盘后才允许入库。now 可注入，纯函数可测
3. **复权校验用重叠 bar 收盘价**：取最近 ≤10 个重叠日，任一偏差 >1% 即拒绝该股整批；重叠 <3 根（新股票）放行。阈值 1% 容忍四舍五入
4. **单股失败隔离**：分批 Promise.all（批大小 5），单股 rejected/failed 都只记 errors，绝不中断整批
5. meta 写入 try-catch 包裹——极老 db 可能没 meta 表，游标写失败不毁补齐成果

## 测试手法（可复用）
- **FakeDb 模式**：内存 Map 模拟三张表 + sqlLog 记录全部 SQL → 可以断言"没发生过什么"（无破坏性 SQL），比只断言结果更硬
- mock fetch 走腾讯响应格式（qfqday 数组），一个 helper 服务所有端到端用例
- 时间敏感逻辑全部注入 now，测试用固定时刻（盘中 10:30 / 收盘后 16:00 / 盘前 08:00）

## 质检结果
- SyncService.test.ts 15/15 ✅；全量 5 套件 52/52 ✅；tsc 27→27 ✅

## 下一步（S4 ui）
- OverviewScreen 增「一键补齐」按钮 + 进度条 + 摘要弹窗，调 runFullSync
- 铁律：只加组件/入口，不碰现有数据处理文件
