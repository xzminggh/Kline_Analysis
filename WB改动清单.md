# WB 改动清单（WorkBuddy 修改追踪）

> 本文件由 WorkBuddy 维护。所有带 **[wb修改]** 的条目均为 WB 在手机端 K线App 上做的改动，
> 记录每次**双推**（Gitee + GitHub）的主要改变要点，便于老徐快速 review。

## 图例
- **[wb修改]** 本次由 WB 改动
- 双推状态：`Gitee ✅` / `GitHub ✅` 表示已推；`待推` 表示本地已提交未推远程

## 阶段总览
| 阶段 | 日期 | 主要改变 | 双推状态 |
|------|------|----------|----------|
| S0 设计与清单 | 2026-07-28 | loop-constructor 工程设计并过 linter + 建立 WB 改动清单与经验落盘机制 | Gitee ✅ / GitHub ✅(API直推) |
| S1 scaffold | 待办 | 建 KlineFetcher / SyncService 模块骨架 | 待办 |
| S2 fetcher | 待办 | 三源降级抓取实现 | 待办 |
| S3 diff_patch | 待办 | 比对+仅INSERT补齐 | 待办 |
| S4 ui | 待办 | 一键补齐按钮+进度+摘要 | 待办 |
| S5 background | 待办 | 后台定时+仅WiFi守卫 | 待办 |
| S6 integration | 待办 | 全量测试+数据完整性断言 | 待办 |

## 详细记录

### S0 设计与清单（2026-07-28）
- **[wb修改]** 新增 `.loop/kline-sync.loop.json` + `.loop/kline-sync.loop.md`：联网补齐闭环工程设计并过 linter
- **[wb修改]** 新增 `kline-sync.design.json`：loop-constructor 原始分阶段设计（D0–D6 决策日志）
- **[wb修改]** 新增 `WB改动清单.md`：本双推追踪文件
- **[wb修改]** 新增 `经验落盘/lessons_learned_stage0_loop_design.md`：阶段经验
- 双推：`Gitee ✅`（commit `9a7f4d7`，已 rebase 到远程 `f174c35` 之上）/ `GitHub ✅`（老徐提供 PAT，走 REST API Git Data 直推；token 一次性使用不落盘）
- 既定双推通道：Gitee = 沙箱 git CLI 直推；GitHub = REST API（Git Data：blob→tree→commit→ref），git CLI 443 被沙箱墙不可用
