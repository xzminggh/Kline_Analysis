# 经验总结: Loop Constructor — K 线增量补齐循环工程设计

> **阶段**: loop-constructor (工程编译期)
> **落盘日期**: 2026-07-28
> **关联文件**: [.loop/kline-fill.loop.json](../.loop/kline-fill.loop.json) / [.loop/kline-fill.loop.md](../.loop/kline-fill.loop.md)

---

## 一、核心架构模式

### 1. 从 Manifest 到工程设计的映射

| Manifest 概念 | 工程设计落地 |
|---|---|
| 混合补齐模式 (C) | 5 阶段 STAGED 循环,共享 KlineFiller 内核 |
| 三源降级 | Stage 2 独立模块 QuoteFetcher, mock 可测 |
| LRU 30 只缓存 | Stage 3 FillCache 与 KlineFiller 同层 |
| 全量入口 + 单股入口 | Stage 4 / Stage 5 两个 UI 入口,依赖 Stage 3 |
| 模块边界铁律 | 阶段划分即边界: S2(网络) → S3(数据编排) → S4/S5(UI) |

### 2. 5 阶段依赖图

```
Stage 1: tradingCalendar (交易日历)
        ↓
Stage 2: QuoteFetcher (三源降级拉取 + 归一化)
        ↓
Stage 3: KlineFiller + FillCache + SQLite 增量写入
        ↓           ↓
   Stage 4     Stage 5
 (全量补齐UI) (单股补齐UI)
```

Stage 4 和 Stage 5 是兄弟节点,都依赖 Stage 3 的稳定内核。两者并行开发互不影响。

### 3. D0-D6 决策要点速查

| 决策 | 答案 | 关键理由 |
|---|---|---|
| D0 | YES | 5 个可运行检查: 单元测试 ×3 + e2e ×2 |
| D1 | STAGED | 4 条 seam, 每阶段产物独立可校验 |
| D2 | 混合 | generate-validate ×4 + batch-process ×1 |
| D3 | hybrid | 金融数据敏感 + 解除联网约束 = 架构级变更 |
| D4 | medium | 5 阶段串行, RN 单线程无法并行拉取写入 |
| D5 | 3-5 cap | S2/S3 风险高给 5 次, S4/S5 UI 给 3 次 |
| D6 | completeness-first | 基础设施错了全下游污染 |

---

## 二、踩坑记录与避坑指南

### 坑 1: 解除"严禁联网"约束的边界管理

**问题**: 原 Manifest 明确"严禁联网",现在要开一个口子。口子开多大?会不会蔓延到其他模块?

**解决方案**:
- 只解除 `QuoteFetcher.ts` 一个文件的网络权限
- 用阶段划分强制边界: S2 只做拉取+归一化,不碰 db / UI / 策略
- Maker/Checker 角色专门检查模块边界违反
- `INSERT OR REPLACE` 列为风险守卫,首次使用需确认

**经验**: 架构约束的解除必须用"最小口子 + 多层防护"模式,不能一撤到底。

### 坑 2: 单股入口 vs 全量入口的并发安全

**问题**: 用户可能在全量补齐进行中打开详情页,触发单股补齐,两个写入并发导致 SQLITE_BUSY。

**解决方案**:
- Stage 3 设计互斥锁 `isFilling`,单股入口与全量入口串行化
- 写入方法带重试逻辑 (SQLITE_BUSY 重试 3 次)
- Stage 5 的单股补齐检测到全量正在进行时,显示"全量补齐中,请稍候"

**经验**: 多入口共享资源必须有显式互斥,不能指望 db 层自己处理。

### 坑 3: 三源降级的"假成功"陷阱

**问题**: 某源返回了数据但格式不对 (比如成交量单位是手不是股),如果不做归一化校验,会写坏 db。

**解决方案**:
- QuoteFetcher 返回前做 schema 校验: 字段类型、范围 (收盘价 > 0, 成交量 ≥ 0)
- 单元测试覆盖三源各自的真实响应格式 (用录制的 fixture)
- 归一化函数独立可测,不与网络逻辑混在一起

**经验**: "有数据返回" ≠ "数据正确"。数据源越多,归一化层越要厚。

### 坑 4: e2e 脚本的编写时机

**问题**: Stage 4/5 的 e2e 验证脚本 (`verify_e2e_fill_full.py`, `verify_e2e_fill_single.py`) 是 Python,但被测对象是 RN App,怎么联调?

**解决方案**:
- e2e 脚本不驱动 UI,直接调用核心业务模块 (KlineFiller)
- 用 bigdemo db 做输入,验证补齐后的 db 状态
- UI 层的验证靠人工 + 单元测试 (组件渲染测试)
- e2e 主要验证数据层正确性和性能预算

**经验**: RN App 的 e2e 成本高,优先把核心逻辑做成纯函数/可独立调用的模块,用脚本验证。

---

## 三、可扩展方向

### 1. 数据源扩展
- 目前三源: 腾讯 / 新浪 / 东方财富
- 可加: 同花顺、雪球、网易财经
- QuoteFetcher 设计为插件式,新增源只需实现 `fetch + normalize` 两个方法

### 2. 补齐策略扩展
- 目前是"缺多少补多少"的简单策略
- 可加: 只补关注股票、按板块分批补、按活跃度排序补
- KlineFiller 支持策略注入,不硬编码

### 3. 缓存升级
- 目前是内存 LRU 30 只
- 可升级为磁盘缓存 (补齐结果存独立 sqlite 表)
- 跨启动复用,减少重复拉取

### 4. 后台自动补齐
- 目前是手动触发 (全量按钮 / 详情页打开)
- 可接入 expo-background-fetch,盘后 16:00 自动补齐
- Manifest 中已预留此选项 (optional_disabled),需要时启用

### 5. 多设备同步
- 目前是单机本地 db
- 可加: 导出补齐增量包 (新增 k 线打包),传到另一设备导入
- 类似 git patch 的思路

---

## 四、质检清单模板 (每个阶段必跑)

```
□ 单元测试通过 (npm test -- testPathPattern='<stage>')
□ 现有测试无回归 (npm test 全量跑一遍)
□ 模块边界检查 (网络层没碰 db/UI, UI 没碰数据层)
□ 向后兼容检查 (importDatabase / 25 策略 / 指标计算 未修改)
□ TypeScript 编译通过 (npx tsc --noEmit)
□ Lint 通过 (npm run lint)
□ 代码 review (自己过一遍 diff)
□ push_changelog.md 更新
□ 经验落盘 (如该阶段有新经验)
□ git 双推 (Gitee + GitHub)
```

---

## 五、关键文件索引

| 文件 | 作用 |
|---|---|
| `.loop/kline-fill.loop.json` | 机器可校验循环设计图 |
| `.loop/kline-fill.loop.md` | 人类可读 Runbook |
| `kline-app-fill.loop.md` | Loop Manifest (需求文档) |
| `push_changelog.md` | 每次推送的变更要点清单 |
| `lessons_learned_index.md` | 经验目录索引 |
