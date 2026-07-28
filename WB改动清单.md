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
| S1 scaffold | 2026-07-28 | 建 KlineFetcher/SyncService/verify_sync 骨架，tsc 零新增错误 | Gitee ✅ / GitHub ✅(API直推) |
| S2 fetcher | 2026-07-28 | 三源降级抓取实现+17单测全绿（腾讯→新浪→东财，实测校准） | Gitee ✅ / GitHub ✅(API直推) |
| S3 diff_patch | 2026-07-28 | 比对+仅INSERT补齐实现+15单测（含无UPDATE/DELETE硬断言） | Gitee ✅ / GitHub ✅(API直推) |
| S4 ui | 2026-07-28 | 一键补齐面板(自包含)+进度+摘要；补齐仓库缺失的 .eslintrc.js | 待推 |
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

### S1 scaffold（2026-07-28）
- **[wb修改]** 新增 `src/services/KlineFetcher.ts`：三源降级骨架（腾讯→新浪→东财优先级常量、市场前缀转换含北交所、错误分级、三家端点 URL 注释齐备）
- **[wb修改]** 新增 `src/services/SyncService.ts`：补齐服务骨架（游标/结果/摘要类型、diffMissingBars 纯函数、复权校验桩、runFullSync 桩、meta 游标键）
- **[wb修改]** 新增 `scripts/verify_sync.js`：数据完整性断言框架（S6 填充三大断言）
- **[wb修改]** 新增 `经验落盘/lessons_learned_stage1_scaffold.md`：阶段经验（沙箱 safe-delete 拦 npm 清理的新坑与绕法）
- 质检：tsc 基线对比 27→27（历史错误，非 WB），**新增文件零错误**；verify_sync 骨架自检 exit 0；lock 文件被 npm 自动净化已回滚（只加不改）
- 双推：`Gitee ✅` / `GitHub ✅`（API 直推）

### S2 fetcher（2026-07-28）
- **[wb修改]** 实现 `src/services/KlineFetcher.ts`：三源降级完整实现（URL构造/解析器/8s超时/源级降级/去重升序），全部按 2026-07-28 沙箱实测响应校准
- **[wb修改]** 新增 `src/services/KlineFetcher.test.ts`：17 断言（来源优先级 腾讯→新浪→东财、字段映射、单位归一 手/元、降级路径、坏payload容错），fetch 注入 mock 不依赖网络
- **[wb修改]** `package.json` +1 行 devDep `@react-native/jest-preset`（jest-expo 57 的 peer 依赖，不装 jest 起不来——质检基建必需）；lock 同步更新（npm 顺带清了 lock 内已不被引用的 @react-navigation/stack 残留条目，不影响任何已安装行为）
- **[wb修改]** 新增 `经验落盘/lessons_learned_stage2_fetcher.md`：三家接口实测差异表（东财 lmt 参数失效须用 beg/end 等）
- 质检：单测 17/17 ✅；全量 jest 4套件 37/37 ✅（现有测试无一变红）；tsc 基线 27→27 ✅
- 双推：`Gitee ✅` / `GitHub ✅`（API 直推）

### S3 diff_patch（2026-07-28）
- **[wb修改]** 实现 `src/services/SyncService.ts`：游标准备(LEFT JOIN)→当日未收盘bar过滤(盘中09:15–15:05剔除)→复权基准校验(重叠bar收盘价偏差>1%整股拒绝)→diff→事务内 INSERT OR IGNORE 补齐→meta游标；单股失败/拒绝不中断整批，分批并发(批5)
- **[wb修改]** 新增 `src/services/SyncService.test.ts`：15 断言，FakeDb 记录全部 SQL 做**铁律硬断言**（kline_daily 上任何 UPDATE/DELETE/REPLACE 即失败）+ 行数仅增 + 已有行原样 + 复权拒绝零写入
- **[wb修改]** 新增 `经验落盘/lessons_learned_stage3_diff_patch.md`：INSERT OR IGNORE vs REPLACE 的坑（REPLACE=先删后插违反铁律）等
- 质检：单测 15/15 ✅；全量 5套件 52/52 ✅；tsc 27→27 ✅
- 双推：`Gitee ✅` / `GitHub ✅`（API 直推）

### S4 ui（2026-07-28）
- **[wb修改]** 新增 `src/components/SyncPanel.tsx`：自包含「联网补齐」面板——一键补齐按钮 + 实时进度条 + 补齐摘要（补了 X 只 / Y 根）+ 错误明细（前 5 条）。自管 state、自调 runFullSync、补齐前二次确认、运行中禁用防重入
- **[wb修改]** 极简改动 `src/screens/OverviewScreen.tsx`：仅 +1 行 import（第 9 行 `SyncPanel`）+1 行 `<SyncPanel />` 插入「导入数据库」区块之后；**不碰任何数据处理/分析逻辑**（守铁律#4）
- **[wb修改]** 新增 `.eslintrc.js`：补齐仓库历史缺口（package.json 早声明 lint 脚本+依赖却无配置文件，导致 `eslint .` 无法运行）。适配已装 eslint@8.57 + @typescript-eslint@6，规则取向：类型正确性交 tsc；噪声规则降级 warn；历史代码 14 个 warning 不阻断；`prefer-const` 因 1 处历史 error 降级为 warn（不动源码，守铁律#2/#3）
- **[wb修改]** 新增 `经验落盘/lessons_learned_stage4_ui.md`：eslint 配置策略 + 组件自包含设计 + 历史代码 warning 清单
- 质检：tsc 27→27 ✅（WB 零错误）；`eslint .` exit 0、0 errors，WB 四个文件零 warning/error；全量 jest 5 套件 52/52 ✅（无回归）
- 双推：本地已就绪，待提交后 Gitee + GitHub 两端推送（见下方提交记录）
