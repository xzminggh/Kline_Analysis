# Loop Runbook: K线增量补齐循环 (混合模式)

**Generated:** 2026-07-28
**Altitude:** staged (5 stages)
**Autonomy:** hybrid (内层自动, 阶段门限需人确认)
**Source Manifest:** [kline-app-fill.loop.md](../kline-app-fill.loop.md)

---

## Quick Start

1. 打开本 runbook
2. 按顺序阅读每个 stage
3. 每个 stage 完成后执行定义的 check
4. Check 通过则前进; 不通过则按 failure branch 处理
5. 每个 stage 通过后 → 质检 → git 双推 → 更新 [push_changelog.md](../push_changelog.md)
6. 每个大阶段结束后 → 经验落盘 → 更新 [lessons_learned_index.md](../lessons_learned_index.md)

## 核心铁律 (不可违反)

1. **向后兼容**: 保留现有 `importDatabase` / 25 策略 / 指标计算不变
2. **模块边界**: 网络层 (`QuoteFetcher.ts`) 不碰 db / UI / 策略 / 指标文件
3. **UI 改动不碰数据层**: 修改 UI 文件时绝不修改 `database/` 目录
4. **质检前置**: 每次修改后必须跑对应测试,确保不改坏现有功能
5. **双推纪律**: 每个 stage 通过后提交并双推 (Gitee + GitHub)
6. **经验落盘**: 每个大阶段后写经验总结,加入目录清单

---

## Stages

### Stage 1: 交易日历工具 (tradingCalendar)

- **Pattern:** generate-validate
- **Done check:** `npm test -- --testPathPattern='tradingCalendar'` exits 0
- **Max iterations:** 3
- **On failure:** 检查 2026 节假日表完整性,补充缺失测试用例
- **Risk guards:** 无
- **Depends on:** (entry stage)

**产出文件:**
- `src/utils/tradingCalendar.ts`
- `src/utils/tradingCalendar.test.ts`

**Verification Command**
```bash
npm test -- --testPathPattern='tradingCalendar'
```

**Falsifiable When**
2026 春节/国庆等法定假日漏列导致 `isTradingDay` 返回 true,或调休上班的周六周日没标记为交易日 → 测试用例断言失败

**Passing But Wrong**
测试只覆盖了周末判断,没覆盖调休上班日,也没覆盖 `getLastTradingDay` 在长假后的正确回退 → 测试全绿但实际业务场景会错

---

### Stage 2: 三源行情拉取器 (QuoteFetcher)

- **Pattern:** generate-validate
- **Done check:** `npm test -- --testPathPattern='QuoteFetcher'` exits 0
- **Max iterations:** 5
- **On failure:** 针对失败源调整解析逻辑,补充异常处理;三源全失败则升级到人
- **Risk guards:**
  - 首次真实网络请求前需确认
  - 修改归一化字段映射前需确认
- **Depends on:** stage_1

**产出文件:**
- `src/services/QuoteFetcher.ts`
- `src/services/QuoteFetcher.test.ts`

**Verification Command**
```bash
npm test -- --testPathPattern='QuoteFetcher'
```

**Falsifiable When**
某源返回格式变更导致解析失败但没有正确降级到下一源,或归一化后字段单位不对 (如成交量手 vs 股) → 测试断言失败

**Passing But Wrong**
mock 三源都返回固定硬编码数据,没测真实网络边界条件 (超时、空响应、停牌返回空数组) → 测试全绿但上线后网络异常时崩溃

---

### Stage 3: 补齐业务编排 + SQLite 增量写入 (KlineFiller + FillCache)

- **Pattern:** generate-validate
- **Done check:** `npm test -- --testPathPattern='KlineFiller|FillCache|SQLiteProvider'` exits 0
- **Max iterations:** 5
- **On failure:** 调整写入事务粒度,补充重试逻辑;数据一致性问题则升级到人
- **Risk guards:**
  - `INSERT OR REPLACE` 覆盖已有 `kline_daily` 记录前需确认
  - 修改 `SQLiteProvider` 公共接口前需确认
- **Depends on:** stage_2

**产出文件:**
- `src/services/KlineFiller.ts`
- `src/services/FillCache.ts`
- `src/database/SQLiteProvider.tsx` (新增 `insertKlinesIncremental` 方法,不删不改现有方法)
- 对应测试文件

**Verification Command**
```bash
npm test -- --testPathPattern='KlineFiller|FillCache|SQLiteProvider'
```

**Falsifiable When**
`INSERT OR REPLACE` 覆盖了旧数据但某些字段为 NULL,或写入后行数没增加 (重复数据未去重) → 测试断言失败

**Passing But Wrong**
只测了单只成功写入路径,没测批量写入部分失败场景,也没测 `SQLITE_BUSY` 重试和互斥锁 `isFilling` → 测试全绿但并发场景崩溃

---

### Stage 4: 全量补齐 UI (概览页入口)

- **Pattern:** batch-process
- **Done check:** `python3 scripts/verify_e2e_fill_full.py --db kline_5y_bigdemo.sqlite --timeout 480 --min-success-rate 0.95` exits 0
- **Max iterations:** 3
- **On failure:** 优化批量写入性能,调整分批策略;性能瓶颈需架构调整则升级到人
- **Risk guards:**
  - 修改现有 `OverviewScreen.tsx` 前需说明影响并确认
  - 单次批量 > 50 只需分批确认
- **Depends on:** stage_3

**产出文件:**
- `src/screens/OverviewScreen.tsx` (新增补齐按钮 + 进度条,不删不改现有功能)
- `scripts/verify_e2e_fill_full.py`

**Verification Command**
```bash
python3 scripts/verify_e2e_fill_full.py --db kline_5y_bigdemo.sqlite --timeout 480 --min-success-rate 0.95
```

**Falsifiable When**
进度条显示 100% 但实际有大量失败被静默跳过,或补齐后 db 中数据不对但 UI 不报错 → e2e 脚本断言失败

**Passing But Wrong**
e2e 只测了全成功场景,没测 50 只分批确认逻辑,也没测熔断后手动恢复 → 测试全绿但真实使用中用户体验差

---

### Stage 5: 单股实时补齐 UI (详情页入口)

- **Pattern:** generate-validate
- **Done check:** `python3 scripts/verify_e2e_fill_single.py --db kline_5y_bigdemo.sqlite --stock 600519 --ui-timeout 3 --cache-timeout 0.1` exits 0
- **Max iterations:** 3
- **On failure:** 优化单股拉取+写入路径,排查 UI 刷新时序问题
- **Risk guards:**
  - 修改现有 `DetailScreen.tsx` 前需说明影响并确认
  - `useFocusEffect` 触发逻辑变更前需确认
- **Depends on:** stage_3

**产出文件:**
- `src/screens/DetailScreen.tsx` (新增自动补齐 + loading,不删不改现有功能)
- `scripts/verify_e2e_fill_single.py`

**Verification Command**
```bash
python3 scripts/verify_e2e_fill_single.py --db kline_5y_bigdemo.sqlite --stock 600519 --ui-timeout 3 --cache-timeout 0.1
```

**Falsifiable When**
UI 显示「已补齐」但 db 实际没写入,或补齐后策略没重算导致星级不更新 → e2e 脚本断言失败

**Passing But Wrong**
只测了有缺失场景,没测无缺失场景 (当天已补齐后再打开应直接命中缓存) → 测试全绿但重复拉取浪费流量

---

## Outer Stop Conditions

- **Total max iterations:** 40
- **Success criterion:** All 5 stages pass; full batch e2e on bigdemo 288 stocks in ≤ 8min with ≥ 95% success; single stock e2e fills within 3s; all unit tests green; 25 existing strategies still pass regression tests; db data integrity verified
- **All failures escalation:** Produce stage-by-stage failure diagnosis with recommendations. If root cause is architectural (e.g. network layer needs native module), escalate to human for design review.

## Human Placement

**hybrid** — 内层迭代自动重试 (代码写错自动改);阶段门限需人确认才前进 (金融数据正确性敏感 + 解除联网约束属架构变更)。

## Maker/Checker

- **Role:** adversarial_reviewer
- **Scope:**
  1. 金融数据正确性 vs 三源归一化
  2. 模块边界无违反 (网络层不碰 db/UI/策略/指标)
  3. 现有 `SQLiteProvider.importDatabase` 和 25 策略的向后兼容
  4. `INSERT OR REPLACE` 不损坏已有数据

## Decision Log

| Decision | Answer | Justification |
|----------|--------|---------------|
| D0 | YES | Runnable checks exist: full batch count check, single stock date check, QuoteFetcher unit tests, SQLite write tests |
| D1 | STAGED | 4 seams: trading calendar → QuoteFetcher → KlineFiller+write → full batch UI → single stock UI. Each has independent verification. |
| D2 | See per-stage | S1:generate-validate, S2:generate-validate, S3:generate-validate, S4:batch-process, S5:generate-validate |
| D3 | hybrid | Inner auto-retry on test/code fixes; stage gates human review due to financial sensitivity + architectural change |
| D4 | medium | 5 stages strictly sequential. S4 internal batch is single-threaded on RN. S2 fallback is serial. |
| D5 | See per-stage caps | S1=3, S2=5, S3=5, S4=3, S5=3. Risk guards on INSERT OR REPLACE, first real network, SQLiteProvider API changes, UI file changes |
| D6 | completeness-first | Financial data correctness > speed. Network/data layer is infrastructure — wrong poisons all downstream. |

## Risk Guards

| Operation | Guard Type | Approval Required |
|-----------|-----------|-------------------|
| INSERT OR REPLACE overwrite | data integrity | Yes — before first use |
| First real network request | permission blast | Yes — before stage 2 real test |
| SQLiteProvider public API change | backward compat | Yes — before stage 3 |
| Existing UI file modification | module boundary | Yes — before stage 4/5 |
| Batch > 50 stocks | performance | Yes — batch confirmation in app |

## Harness Primitives

- jest (expo-jest preset)
- expo-sqlite (in-memory for tests)
- mock fetch for QuoteFetcher tests
- python3 e2e verify scripts
- git dual-remote (Gitee origin + GitHub github)
- `.loop/run-state.md` scratch ledger
- [push_changelog.md](../push_changelog.md) change log
