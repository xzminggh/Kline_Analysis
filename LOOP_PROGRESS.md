# 联网K线自动补全 Loop — 进度跟踪

> 分支：`feature/online-sync` · 双推目标：Gitee（✓）/ GitHub（待你本机补推）
> 纪律：每阶段 = 开发 → 质检 → 落盘经验 → 双推

## Stage 0 · sync_relay（中转层）— ✅ 完成
- commit：`a5bfcf2`（仅新增 `relay/` + `lessons_learned_sync_relay.md`，零改现有代码）
- 质检：codeToSecid 映射 5/5 通过；真实东财数据解析校验通过（600000，6 条、字段齐全、量/额>0）
- 落盘经验：`lessons_learned_sync_relay.md`（东财接口格式、量纲、复权、沙箱出网限制、断言坑）
- 部署文档：`relay/README.md`（Cloudflare Workers / 腾讯 SCF 双方案）
- 已知：沙箱出网到东财间歇阻断，仅影响本地测试；CF/SCF 生产环境出网正常
- 待办（真机/上线前）：核对一只股票的量纲+复权(fqt)与本地库一致

## Stage 1 · sync_service（手机端增量写入）— ⬜ 未开始
- 新增 `SyncService`：fetch 中转 → 比对本地最新 date → 增量 INSERT；分批+限流+失败重试退避
- 质检：mock 注入 N 条新数据 → 断言 INSERT 行数正确、无重复 date
- 不碰现有分析/UI 文件

## Stage 2 · watchlist（自选股清单）— ⬜ 未开始
## Stage 3 · trigger（启动自补 + 手动刷新）— ⬜ 未开始
## Stage 4 · compat_offline（向后兼容 + 离线降级）— ⬜ 未开始
## Stage 5 · package（EAS Build 安卓）— ⬜ 未开始
