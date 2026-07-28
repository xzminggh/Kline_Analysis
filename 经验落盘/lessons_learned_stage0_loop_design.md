# 经验落盘 — Stage0 联网补齐闭环设计

日期：2026-07-28
操作人：WorkBuddy（老徐的伙计）

## 关键决策
- 需求收敛走 loop-architect（D 模式：信息监控与汇总），再切 loop-constructor 出工程设计并过 linter，避免直接写码走偏
- 数据源 = 移植用户 `stock-data-fetcher` skill 的**三源降级**（腾讯 ifzq.gtimg.cn → 新浪 money.finance.sina.com.cn → 东财 push2his.eastmoney.com）为 App 内 TS 模块 `KlineFetcher`
  - 原因：该 skill 当前 `disable: true` 且是**桌面 Python 脚本**，Expo/RN 手机端跑不了 Python，只能当 spec 原样翻 TS
- 复权基准：**前复权 qfq**（与腾讯源一致），DB 须同为前复权方能无缝对齐
- 补齐范围：**全量**（db 所有股票）；**仅 WiFi** 补齐（省流量）；**后台定时**开启（复用已装的 `expo-background-fetch`）
- 写入铁律：**只 INSERT 缺失 bar，绝不 UPDATE/DELETE 用户上传的历史**（保护 db 第一位）

## 工程化要点（loop-constructor 产出）
- 分阶段 staged 设计：scaffold → fetcher → diff_patch → ui → background → integration_gate
- 每阶段门控检查：tsc / jest 单测 / 集成段全量测试 + `scripts/verify_sync.js` 数据完整性断言
- 质检策略：每阶段改完即 tsc + 单测；集成段跑全量测试 + 样例db完整性断言（无重复主键、日期连续、缺失bar=0）
- maker_checker：独立审查正确性（仅INSERT/不复权/复权对齐）与需求覆盖（三源降级/全量/仅WiFi/后台）

## 踩坑 / 注意
- `expo-background-fetch` iOS 端是 best-effort，不能保证准时；首次需用户手动授权注册
- Python skill 三家端点已抠准：腾讯 qfq 前复权、新浪 `scale=240&datalen=`、东财 `secid=1.x/0.x&klt=101&fqt=1`
- 沙箱限制：GitHub 走 git CLI 被墙（443），双推靠 Gitee CLI + GitHub connector/镜像；大文件走 API 易 JSON 转义出错

## 下一步
- S1 scaffold：建 `src/services/KlineFetcher.ts`、`src/services/SyncService.ts` 骨架 + 单测桩
- 之后每完成一个大阶段：写经验落盘 + 双推 + 更新本清单
