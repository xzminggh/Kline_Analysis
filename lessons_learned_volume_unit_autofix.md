# 成交量单位「存量自愈」自动归一万手（lessons_learned_volume_unit_autofix.md）

> 2026-08-08 · kline_-analysis · 承接 `lessons_learned_import_unit_unify.md`（新旧写入侧已统一万手，本文件解决**存量历史**侧）

## 背景

- 桌面导出的历史库 `kline_daily.volume` 可能是「手」或「股」口径，与新补齐 bar（万手）混存，
  K线图条形/成交量轴与历史表格出现同一只股票差 **1e4 / 1e6 倍**的断崖。
- 已核对 fund-screener：`fund_flow` 不存 volume（放弃该列→问题不存在），此能力是 K 线产品线独有。
- 用户确认：**检测到差异后自动把该股存量归一万手**（A 方案），不要求人工重导库。

## 方案

新增 `src/services/VolumeUnitNormalizer.ts`：

```ts
detectVolumeFactor(localBars, onlineBars): 1 | 10000 | 1000000 | null
normalizeStockVolume(db, code, factor): Promise<number>
```

- **判定**：取最近 ≤10 根重叠 bar 的 `local.volume / online.volume` 比值，**中位数**抗噪声；
  在 ±15% 容差内命中 1 / 1e4 / 1e6 之一即判定；无重叠、比值不成体系 → `null`（保守不动）。
- **清洗**：`UPDATE kline_daily SET volume = ROUND(volume / ?, 2) WHERE code = ? AND volume > 0`，
  只动 volume 列，不触碰 open/high/low/close/amount。
- **幂等**：归一后再检测比值即 ≈1，天然不重复清洗。

### 接入点（两条在线补库路径）

| 路径 | 接入位置 | 细节 |
| --- | --- | --- |
| `SyncService.runFullSync` | fetch 后、diff/insert 前（模式循环内） | `volumeNormalized` 标志：qfq 重试轮不再重复清洗 |
| `KlineFiller.fillSingle` | fetch 后、缺失日过滤前 | 归一失败仅 `console.warn`，不阻断主流程 |

## 测试

- `VolumeUnitNormalizer.test.ts`：三因子判定 / ±15% 容差 / 中位数抗离群 / 无重叠 / 超 10 根只取最近 /
  volume=0 跳过 / UPDATE SQL 语义与参数。共 9 用例。
- `SyncService.test.ts` 追加：本地「手」→ 自动归一后再写（断言 ÷10000 恰一次 + 新旧 bar 同值）、
  万手+噪声不触发（铁律 `hasDestructiveKlineSql()` 保持 false）。
- `KlineFiller.test.ts` 追加：本地手 → UPDATE 一次；本地万手 → 0 次 UPDATE。

## 关键坑（务必记住）

1. **测试 fixture 必须模拟真实口径**：`tencentFetchFor` 的 mock 原先把「万手 bar」原样塞进 rows，
   解析器 ÷1e6 后行内 volume 变成 0.001，会被归一检测误判为「股」→ 既有用例的 `hasDestructiveKlineSql` 断言全部炸掉。
   修正：bar 默认 3（万手），mock rows 用 `b.volume * 1000000` 模拟腾讯原生「股」，解析回 3 → 比值 1 不触发。✔
2. **`db` 是 `any` 时不能带泛型 `getAllAsync<K>()`**，改成 `const r = (await db.getAllAsync(...)) as K[]`。
3. **开发日志是 UTF-8 无 BOM**：用 PowerShell `Add-Content -Encoding Default` 追加会混入 GBK 段，
   Unicode 解码 `replacement char 0xFFFD` 计数法可定位混码边界；重编码（GBK 解尾 + UTF-8 写回）修复。
   本次直接报错 → 先探测（`GetEncoding(936)` 计数）→ 重建字节数组写回。

## 验证

- `npx tsc --noEmit`：0 错；`npx jest --ci --silent`：12 套件 149 用例全过；
  `npx eslint`：0 error（存量 warning 未新增）。
- 真机 Expo Go：导入库股票点「联网更新」后，成交量与新增股票同一量级。