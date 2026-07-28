# 经验落盘 — Stage6 integration（集成质检 + maker_checker 复核）

日期：2026-07-28
操作人：WorkBuddy（老徐的伙计）

## 本阶段做了什么
- **[wb修改]** 落地 `scripts/verify_sync.js` 三大断言（S1 骨架 → 真实实现）：
  1. kline_daily 无重复主键 (code,date)
  2. 每只股票日期序列连续（以该股自身交易日历=工作日衡量，无中间空洞）
  3. 补齐后缺失 bar=0（各股 MAX(date) ≥ 目标日期）
- 用 **Node 22 内置 `node:sqlite`**（零新依赖）开真库；沙箱无真机/无样例 db/无网络，无法跑真实端到端 sync
- 默认模式：合成「补齐前缺口态」库 → `INSERT OR IGNORE` 模拟补齐 → 三大断言须全过（exit 0）
- `--selftest` 模式：造 3 类故意破坏的库（重复PK / 日期空洞 / 缺失尾部），断言引擎须分别判 FAIL → 证明断言是"真检查"而非只数行数（回应 DoD 警告"passing_but_wrong"）
- maker_checker 复核：铁律合规逐条核验

## 关键设计决策
1. **node:sqlite 而非 better-sqlite3**：Node 22.22 自带实验性 `node:sqlite`，免装新依赖；`DatabaseSync` 同步 API 简洁。仅 stderr 有一条 ExperimentalWarning，不影响退出码
2. **日期连续性用"工作日"而非"自然日"**：A股日K只有工作日，用全市场交易日历比对无意义；改为每只股取自身 MIN~MAX 内的工作日集合，缺任一即判不连续。更贴合业务
3. **默认模式造"缺口→补齐→断言"闭环**：直接证明断言引擎对正确补齐结果放行；selftest 反向证明能抓坏数据。两者合起来才是可信集成门禁
4. **重复主键用例的特殊处理**：带 PRIMARY KEY 的表根本插不进真重复行（UNIQUE 直接抛错）。dup-PK 断言要测的是"缺主键的坏库出现重复"——故 selftest 该用例先 DROP 掉 PK 再建可重复表插真重复，断言才能命中

## 集成门控结果（machine_verifiable）
- `npx jest`：**65/65 ✅**（exit 0）；S1–S5 共 65 用例，无回归
- `npx tsc --noEmit`：27 个错误，**全部为历史遗留**（Indicators/StrategyEngine/OverviewScreen[2个原有]/StrategyScreen/App/PerformanceMonitor），**WB 文件零新增错误**（基线 27→27）
  - 注：tsc 原始退出码=2（非零）纯粹因这 27 个历史错误；修它们会动已有代码，违反铁律#2/#3，故不碰。`WB 零新错` 才是对 WB 的有效判定
- `node scripts/verify_sync.js`：**exit 0 ✅**（默认模式通过）；`--selftest` 亦 exit 0（3 类坏库全命中）
- `npx eslint .`：**exit 0 / 0 errors**；全仓库 14 个 warning 全在历史代码（WB 文件零 warning）

## maker_checker 复核（铁律合规）
- **只新增代码，未删/改已有数据处理逻辑**：`git diff c994392 HEAD` 全仓库 +2088/-57；源码文件全为新增，OverviewScreen 仅 +4 行（import + 注释 + `<SyncPanel />`），SQLiteProvider / AnalysisService / 策略引擎均未触碰；-57 全在 package-lock.json（依赖锁随 expo-network 合理更新，非源码删除）
- **改动界面不碰数据**：SyncPanel 自包含，OverviewScreen 仅一行接入；BackgroundSync 仅调 runFullSync，不写任何 SQL
- **kline_daily 仅 INSERT OR IGNORE**：SyncService.test.ts 的 `hasDestructiveKlineSql()` 硬断言——kline_daily 上出现任何 UPDATE/DELETE/REPLACE 即测试失败；15 用例全绿，机器验证铁律
- **双推完整**：S1–S5 全部 Gitee ✅ + GitHub(API) ✅

## 沙箱限制（真机行为需老徐在设备上验证）
- expo-background-fetch 实际调度由 OS 控制，沙箱跑不了；S5 以"守卫逻辑+注册/授权/幂等"为验证对象
- 真实端到端网络补齐需在手机上：导入 db → 点「一键补齐最新K线」(WiFi) / 开「后台自动补齐(仅WiFi)」授权
- verify_sync.js 断言引擎已在合成 db 上充分验证，可直连真实 db：`node scripts/verify_sync.js <真实db路径> [--target-date YYYY-MM-DD]`

## 全功能交付清单（S1–S6）
| 文件 | 作用 |
|------|------|
| src/services/KlineFetcher.ts (+test) | 三源降级抓取(腾讯→新浪→东财) |
| src/services/SyncService.ts (+test) | 比对+仅INSERT补齐+复权校验+盘中剔当日bar |
| src/components/SyncPanel.tsx | 一键补齐面板+后台开关(自包含) |
| src/screens/OverviewScreen.tsx | 仅 +4 行接入 SyncPanel |
| src/services/BackgroundSync.ts (+test) | 后台定时+仅WiFi守卫+手动授权 |
| scripts/verify_sync.js | 补齐后数据完整性断言 |
| .eslintrc.js | 补齐仓库缺失的 lint 配置 |
| WB改动清单.md / 经验落盘/* | 双推追踪 + 阶段经验 |

## 下一步
- 真机验证：老徐在手机上导入 db，点一次「一键补齐」确认拉到最新日K；开后台开关确认次日 WiFi 下自动补
- 如需让 `npx tsc --noEmit` 也原始退出 0，需另立项修 27 个历史类型错误（超出 WB 范围，需老徐明确授权）
