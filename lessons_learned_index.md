# 经验目录清单

> 本文件是项目经验落盘的索引，每次新增经验文件时在此追加条目。

## 经验文件列表

| 序号 | 文件名 | 阶段 | 核心内容 | 落盘日期 |
|------|--------|------|----------|----------|
| 1 | lessons_learned_stage2_perf.md | Stage 2 | performance.now() 埋点 + setImmediate 分片调度，防 300s 超时 | 2026-07-25 |
| 2 | lessons_learned_stage4_report_ui.md | Stage 4 | SVG K线图 + 6维搜索过滤器 | 2026-07-25 |
| 3 | lessons_learned_stage5_sdk57_migration.md | Stage 5 | SDK 51→57升级 + EAS Build配置 + 大数据库流式导入 + 策略函数作用域修复 | 2026-07-26 |
| 4 | lessons_learned_loop_constructor_fill.md | loop-constructor | K线增量补齐循环工程设计: 5阶段STAGED + 三源降级 + 模块边界管理 + D0-D6决策 | 2026-07-28 |
| 5 | lessons_learned_stage1_tradingCalendar.md | Stage 1 | tradingCalendar: 可更新节假日配置 + 调休上班日优先级 + 左闭右开区间边界 | 2026-07-28 |
| 6 | lessons_learned_stage2_quoteFetcher.md | Stage 2 | QuoteFetcher: 三源降级拉取 + 东财请求头修复 + 模块边界管理 + Mock/真实网络测试 | 2026-07-28 |
| 7 | lessons_learned_stage3_klineFiller.md | Stage 3 | KlineFiller+FillCache: 补齐编排层 + LRU缓存 + 并发控制 + 熔断机制 | 2026-07-28 |
| 8 | lessons_learned_stage4_fill_ui.md | Stage 4 | 全量补齐UI + 指标nullable类型治理 + TS类型收窄实践 | 2026-07-28 |
| 9 | lessons_learned_stage5_fill_single_ui.md | Stage 5 | 单股补齐UI + 行内结果反馈 + 补齐后自动刷新策略分析 | 2026-07-28 |
| 10 | lessons_learned_v2_release.md | v2.0.0发布 | CSV功能移除 + 全量补齐分批优化 + 版本升级v2.0.0 | 2026-07-28 |
| 11 | lessons_learned_v2_1_volume_unit_fix.md | v2.0.1修复 | 成交量单位bug修复：去掉*100转换，与db一致用"手"单位 + Edit多行替换陷阱记录 | 2026-07-28 |

## 使用方式
- 新的经验文件命名为 `lessons_learned_<stage>_<topic>.md`
- 每次落盘后在上方表格追加一行
- 文件内容遵循模板：核心架构模式 / 踩坑记录 / 可扩展方向
