# 数据库文件损坏自愈（lessons_learned_corrupt_db_selfheal.md）

> 2026-08-08 · kline_-analysis · SQLiteProvider.tsx

## 现象

- 启动即报：`getStocks failed: Call to function 'NativeDatabase.prepareAsync' has been rejected → Error code: file is not a database`
- 所有依赖库的页面全挂（股票列表、详情、补齐、分析）。

## 根因（两个叠加）

1. **懒校验**：SQLite 打开文件时不做内容检查，错误推迟到第一条 prepare 才暴露（`SELECT`/`getAllAsync`）。
2. **导入流程无校验**：`importDatabase` 直接把选择器文件 `copyAsync` 覆盖线上 `kline.sqlite`——
   - 拷贝中断/0 字节 → 坏文件落盘；
   - 用户误选非 SQLite 文件（CSV/旧备份/加密库）→ 坏文件落盘；
   - 启动时 `copyDatabase()` 因 localExists 直接跳过 seed 拷贝，于是每次都打开坏文件，**永久性故障**。

## 修复（三步自愈）

| 位置 | 行为 |
| --- | --- |
| `probeDatabaseHealth(db)` | `SELECT 1` 探活，prepare 阶段即暴露坏文件 |
| initDatabase | open 后探活；坏 → `closeAsync` → 坏文件改名 `kline_corrupt_<ts>.sqlite`（保留现场）→ 重建空库 → 自动建表继续 |
| importDatabase | 复制后三重校验（exists + size≥16 + probe）；失败回滚：有备份→复制回原库并重开连接（migrate 万手）；无备份→删坏文件建空库；返回可读错误文案 |

## 关键点

- **重命名优于删除**：坏文件保留为 `kline_corrupt_*.sqlite`，可事后分析/找回数据。
- **回滚要重开连接**：导入把旧库关闭了，恢复备份后必须重新 `openDatabaseAsync` 并把新句柄接入 `dbRef/setDb`，否则 App 停留在「无库连接」状态。
- 类似错误文案还含 `not a database`（SQLite 标准码 SQLITE_NOTADB），判断用 `msg.includes('not a database')` 即可，无需区分大小写变体。

## 测试

- 既有 12 套件 149 用例全过（SQLiteProvider 无损坏场景用例，靠 tsc + 回归门兜底）。
- 真机路径：杀掉 App 重开 → 自愈为空库 → 重新选择正确的 .sqlite 导入。

## 验证

`npx tsc --noEmit` 0 错 / `npx jest --ci --silent` 全过。