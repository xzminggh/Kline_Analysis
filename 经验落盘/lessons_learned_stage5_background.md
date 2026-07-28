# 经验落盘 — Stage5 background（后台定时补齐 + 仅WiFi守卫 + 首次手动授权）

日期：2026-07-28
操作人：WorkBuddy（老徐的伙计）

## 本阶段做了什么
- **[wb修改]** 新增 `src/services/BackgroundSync.ts`：后台定时补齐模块
  - `registerBackgroundSync()`：幂等注册 expo-background-fetch 任务（24h 间隔，stopOnTerminate:false，startOnBoot:true）
  - `guardWifiOnly(getNetworkType)` + `isWifiOnly(type)`：**仅 WiFi 放行**，蜂窝/未知/无网/蓝牙/VPN 全拒；网络查询异常时保守返回 false（宁可跳过不耗流量）
  - `runBackgroundSyncHandler(deps)`：核心可测任务体（WiFi守卫→开库→补齐→关库），全部依赖注入
  - `enableBackgroundSync()` / `unregisterBackgroundSync()` / `isBackgroundSyncEnabled()`：首次手动授权入口 + 取消 + 状态查询
  - 模块加载即 `TaskManager.defineTask`（真机后台调度需要任务已在 bundle 定义），包 try/catch 防重复定义/HMR 崩
- **[wb修改]** 新增 `src/services/BackgroundSync.test.ts`：13 断言，全程注入假依赖（不依赖 jest 对原生模块 mock）
- **[wb修改]** `src/components/SyncPanel.tsx` 增加「后台自动补齐（仅 WiFi）」Switch：即**首次手动授权**入口，用户手势触发 enableBackgroundSync；失败回滚开关（UI 改动，不碰数据处理）
- **[wb修改]** `package.json` +1 行依赖 `expo-network@~57.0.0`（仅WiFi守卫需网络类型判断，Expo 官方轻量模块）

## 关键设计决策
1. **依赖全部可注入**：runBackgroundSyncHandler 收 getNetworkType/openDb/runSync/backgroundFetch，测试以此精确验证「仅 WiFi 执行补齐」——直接回应 DoD 的"passing_but_wrong: 注册存在但未校验仅在WiFi下执行"
2. **原生模块动态 import（守测试隔离）**：expo-network / expo-sqlite / expo-file-system 全部用 `await import(...)`（仅真机运行时加载），测试全程注入假依赖，不依赖 jest-expo 对原生模块的 mock
3. **jest-expo 不 mock expo-background-fetch / expo-task-manager**：测试顶部 `jest.mock(...)` 接管；模块顶层 `TaskManager.defineTask` 包 try/catch，避免 jsdom 下重复定义报错
4. **首次手动授权语义**：iOS/Android 都要求用户手势才能注册后台调度，故单独命名 `enableBackgroundSync()` 作为 UI 调用点，比直接调 register 更清晰地表达"授权"
5. **轻量依赖**：expo-network 是 Expo 官方、纯 JS、无重原生依赖；安装用 `--ignore-scripts --cache /f/workbuddy/npm-cache-s5`（避开 S1 的 hermes/缓存锁坑），4s 装好

## 踩坑（已修）
- **expo-background-fetch 枚举名是 `BackgroundFetchResult` 不是 `Result`**：本版类型 `BackgroundFetch.Result` 不存在（tsc 报 5 错）。改为 `BackgroundFetch.BackgroundFetchResult.NewData/NoData/Failed`，测试假对象同步改名。修后 tsc 回到基线 27
- SyncPanel 的 `.catch(() => {})` 触发 `no-empty-function` warning → 改为 `.catch(() => undefined)` 保持 WB 代码零 warning

## 测试手法（可复用）
- 假 `backgroundFetch`：`{ BackgroundFetchResult:{NewData,NoData,Failed}, registerTaskAsync, unregisterTaskAsync }`，registerTaskAsync 内翻转共享 `state.registered` → 可直接测"注册幂等"（第二次不重复调用）
- 假 `taskManager`：`{ isTaskRegisteredAsync: ()=>Promise.resolve(state.registered), defineTask:jest.fn() }`
- handler 分支全覆盖：WiFi→NewData+runSync/closeAsync 均调用；蜂窝/网络异常→NoData 且 runSync 不调用；开库失败→Failed；补齐抛错→Failed 但关库

## 质检结果
- tsc：27→27 ✅（WB 文件零错误）
- eslint：`.` exit 0 / 0 errors；WB 三文件（BackgroundSync/SyncPanel/测试）零 warning/error；全仓库 14 个 warning 全在历史代码
- jest：全量 6 套件 **65/65** ✅（S5 +13，S1–S4 无回归）

## 真机行为说明（沙箱无法验证）
- expo-background-fetch 实际调度由 OS 控制，沙箱跑不了；S5 以"守卫逻辑 + 注册/授权/幂等"为验证对象
- 用户需在「联网补齐」面板打开「后台自动补齐（仅WiFi）」开关完成首次授权；之后每天至多自动补齐一次，且仅 WiFi 下执行

## 下一步（S6 integration）
- 全量 jest + tsc + eslint + `node scripts/verify_sync.js`（抽样 DB 断言：无重复PK / 日期连续 / 缺失bar=0）
- maker_checker 复核：INSERT-only 铁律、复权拒绝、盘中剔当日bar 在真实 DB 上的端到端表现
