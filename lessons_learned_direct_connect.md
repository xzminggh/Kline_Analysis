# 经验沉淀 · 联网K线（手机端直连 + 三级降级）

## 一、架构决策变更（重要）
- 原方案：轻量中转 API（Cloudflare Workers / 腾讯 SCF），手机端只跟中转通信。
- 现方案：**手机端直连三大厂商 HTTPS 接口，三级降级**（东财主 → 腾讯备 → 新浪兜底），**已删除中转层 `relay/`**。
- 变更原因：腾讯 SCF 部署踩 ESM/CJS 坑（Node 运行时 `require` 不认 `.mjs`，报 `entryFile did not find`），加上 zip 套层 / API 网关联调繁琐，老徐判定"路径太复杂"。直连零后端部署、最轻量，契合"手端好用、相对轻量"目标。
- 删除中转：`git rm -r relay/` 已记录删除；未跟踪的 `relay.zip` / `core.cjs` / `scf.js` 物理清理。

## 二、三级数据源适配要点
| 源 | 接口 | 字段顺序/结构 | amount | 复权 |
|---|---|---|---|---|
| 东财(主) | `push2his.eastmoney.com/.../kline/get` | klines: `date,open,close,high,low,volume,amount,amp` | ✅ 原生 | fqt 支持完整(0/1/2) |
| 腾讯(备) | `web.ifzq.gtimg.cn/appstuff/app/kfqkline/` | `qfqday: [date,open,close,high,low,volume]` | ❌ 估算 | param 末位 `qfq`/`hfq`/空 |
| 新浪(兜底) | `money.finance.sina.com.cn/.../getKLineData` | 命名 JSON `{day,open,high,low,close,volume}` | ❌ 估算 | 默认**不复权** |

- **符号映射**：东财 secid = `前缀.代码`（SH→`1.`，其余→`0.`）；腾讯/新浪 symbol = `sh/sz/bj + 代码`。`resolveMarket` 统一推断（6/9→SH，0/3/2→SZ，8/4→BJ）。
- **amount 估算**（腾讯/新浪无 amount）：`volume(手) × 100 × 均价`，量级对齐东财(元)。兜底源精度可接受，因 26 策略对 amount 仅做相对 MA。

## 三、降级与容错机制
- `fetchKlineWithFallback(sources, q, signal)`：按 `SOURCE_ORDER` 依次尝试；某源 `fetchKline` 抛错（网络异常 / HTTP≠200 / `rc≠0` / 解析空）即自动下一个；全失败抛 `all_sources_failed`。
- 单源内 `trySourceWithRetry`：`AbortController` 超时（默认 8s）+ 指数退避重试（默认 2 次，600/1200ms）。
- `KlineSource.fetchKline(q, signal?)` 统一带 `signal`，由 SyncService 控制超时。

## 四、增量写入（不重不漏）
- `diffKlineRows(localLatestDate, rows)`：纯函数，返回 `date > 本地最新` 的行，按 date 升序去重。本地为空则全量。
- `SQLiteProvider.upsertKlineRows`：`INSERT OR IGNORE` + `withTransactionAsync` 事务包裹，双保险防重复。
- `syncStock`：`getLatestKlineDate` → `start=nextDay(latest)`、`end=today` → 抓增量 → 比对 → 写。

## 五、解耦与可测性
- `SyncService` 用**依赖注入** `SyncDeps { getLatestKlineDate, upsertKlineRows }`，不在纯模块里依赖 React context，组件侧从 `useDatabase()` 传入。好处：单测可传 mock db，且 SyncService 测试链路不加载 `SQLiteProvider`（避开 RN/expo 包）。
- 测试：`node --experimental-strip-types src/services/sync_test.ts`，**5/5 通过**（增量去重 3 项 + 三级降级 2 项）。仅一条 `MODULE_TYPELESS_PACKAGE_JSON` 警告（package.json 无 `type:module`），无害。

## 六、TS / 模块解析约定
- 自写文件互相 import **带 `.ts` 扩展名**：Node `--experimental-strip-types` 强制要求显式扩展名；Metro 也接受。
- `tsconfig.json` 加 `"allowImportingTsExtensions": true`（配合 `noEmit`），确保 `tsc` 不因 `.ts` 扩展名报错。

## 七、沙箱出网限制（仅影响本地测试，不影响生产）
- 沙箱 Node `fetch` 到东财间歇受限（curl 有时能、Node 有时不能），是环境白名单差异。手机端真实网络正常。
- 质检用 mock sources（不触发真实 fetch）绕开，纯逻辑全验证。

## 八、上线前必做核对（真机）
- 拿一只**已有本地数据**的股票，对比东财（同 `fqt`）与本地库最后几天：确认**量纲 + 复权口径一致**。
- `SYNC_CONFIG.fqt` 默认 `1`（前复权）。若本地库（PC 导入/演示库）是**不复权**，须改 `fqt=0`，否则补进来的新交易日与旧数据价格断层、误触发信号。
- `src/config.ts` 集中配置：`fqt / 超时 / 重试 / 股间限流 / 回填天数`。

## 九、待办（后续 Stage）
- Stage 2 自选股清单（watchlist 表 + UI 增删）。
- Stage 3 启动自补 + "刷新K线"按钮接入 `syncAll`（传 `getStocks()` 结果 + SyncDeps）。
- Stage 4 离线降级（无网时分析照常、同步失败仅提示不崩）。
- Stage 5 EAS Build 安卓 APK（直连 HTTPS 无需配明文白名单）。
