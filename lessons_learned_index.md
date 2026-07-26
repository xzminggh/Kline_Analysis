# 经验目录清单

> 本文件是项目经验落盘的索引，每次新增经验文件时在此追加条目。

## 经验文件列表

| 序号 | 文件名 | 阶段 | 核心内容 | 落盘日期 |
|------|--------|------|----------|----------|
| 1 | lessons_learned_stage2_perf.md | Stage 2 | performance.now() 埋点 + setImmediate 分片调度，防 300s 超时 | 2026-07-25 |
| 2 | lessons_learned_stage4_report_ui.md | Stage 4 | SVG K线图 + 6维搜索过滤器 | 2026-07-25 |
| 3 | lessons_learned_stage5_sdk57_migration.md | Stage 5 | SDK 51→57升级 + EAS Build配置 + 大数据库流式导入 + 策略函数作用域修复 | 2026-07-26 |

## 使用方式
- 新的经验文件命名为 `lessons_learned_<stage>_<topic>.md`
- 每次落盘后在上方表格追加一行
- 文件内容遵循模板：核心架构模式 / 踩坑记录 / 可扩展方向
