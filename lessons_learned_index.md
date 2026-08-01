# 经验目录清单

> 本文件是项目经验落盘的索引，每次新增经验文件时在此追加条目。

## 经验文件列表

| 序号 | 文件名 | 阶段 | 核心内容 | 落盘日期 |
|------|--------|------|----------|----------|
| 1 | lessons_learned_stage2_perf.md | Stage 2 | performance.now() 埋点 + setImmediate 分片调度，防 300s 超时 | 2026-07-25 |
| 2 | lessons_learned_stage4_report_ui.md | Stage 4 | SVG K线图 + 6维搜索过滤器 | 2026-07-25 |
| 3 | lessons_learned_stage5_sdk57_migration.md | Stage 5 | SDK 51→57升级 + EAS Build配置 + 大数据库流式导入 + 策略函数作用域修复 | 2026-07-26 |
| 4 | lessons_learned_loop_constructor_fill.md | loop-constructor | K线增量补齐循环工程设计: 5阶段STAGED + 三源降级 + 模块边界管理 + D0-D6决策 | 2026-07-28 |
| 5 | lessons_learned_26apps_batch_generation.md | 26策略App批量生成 | 共享模块抽取 + 模板克隆 + 策略注入 + 批量生成脚本 + 本地依赖踩坑 + TypeScript类型修复 | 2026-07-29 |
| 6 | lessons_learned_user_preferences.md | 用户偏好 | 推荐选项放A位 + 选项数量2-4个 | 2026-07-29 |
| 7 | lessons_learned_26apps_ui_debug.md | 26策略App UI调试 | expo-dev-client移除、registerRootComponent、assets图标、stock空值检查、Access to closed resource、数据导入刷新 | 2026-07-30 |
| 8 | lessons_learned_market_overview_fix.md | 市场走势概况修复 | Sina K线API实时数据获取、大盘指数获取、均线粘合检测、数据时效性处理、MarketOverview重构 | 2026-07-30 |
| 9 | lessons_learned_26apps_ui_refactor.md | 26策略App UI重构 | 详情页布局优化、实时数据集成、进度条优化、K线图交互修复、SQLite错误处理 | 2026-07-30 |
| 10 | lessons_learned_26apps_full_build.md | 26策略App完整构建 | T01延伸到25个App: 基础设施同步 + 26策略实现 + 编译验证 + app.json唯一性 | 2026-07-31 |
| 11 | lessons_learned_git_push_and_eas_build.md | Git双推与Expo云打包 | Gitee+GitHub双远端、EAS Build APK、.easignore配置、SVG图标生成 | 2026-07-31 |
| 12 | lessons_learned_expo_test_icon_build.md | Expo Go测试+图标部署+EAS | 图标部署脚本、app.json修复、数据库自动建表、Expo免费额度限制 | 2026-07-31 |
| 13 | lessons_learned_detail_refresh.md | 详情页实时刷新 | 联网补齐后DetailScreen从DB重读kline+重跑策略+刷新UI | 2026-08-01 |

## 使用方式
- 新的经验文件命名为 `lessons_learned_<stage>_<topic>.md`
- 每次落盘后在上方表格追加一行
- 文件内容遵循模板：核心架构模式 / 踩坑记录 / 可扩展方向
