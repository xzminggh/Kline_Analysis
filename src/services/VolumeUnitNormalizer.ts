/**
 * [wb修改] VolumeUnitNormalizer — 成交量单位自动识别与归一（自愈式）
 *
 * 背景：桌面导出的历史库 kline_daily.volume 可能是「手」（腾讯/新浪老口径）或「股」，
 * 而在线补齐（KlineFetcher）统一写入「万手」。同一只股票新旧 bar 单位混存会破坏
 * K线图/历史表的呈现（相差 1e4 / 1e6 倍）。
 *
 * 方案：以「在线 bar（万手）」为基准，与本地重叠日期比对 volume 比值中位数——
 *   ≈1     → 已一致（不动）
 *   ≈1e4   → 本地存量是「手」→ ÷10000
 *   ≈1e6   → 本地存量是「股」→ ÷1000000
 *   其他   → 无法确认（噪声/异常数据），保守不动（null）
 *
 * 归一化只针对检测到差异的股票执行一次（幂等：归一后再检测即 ≈1 无操作），
 * 且只动 volume 列，绝不改 open/high/low/close。
 */

import type { SQLiteDatabase } from 'expo-sqlite';
import type { KlineDaily } from '../database/SQLiteProvider';

/** 候选单位因子：手 / 股（相对「万手」） */
export type VolumeFactor = 10000 | 1000000;

const FACTOR_CANDIDATES: readonly VolumeFactor[] = [10000, 1000000];

/** 比值与候选因子允许的相对偏差（±15%，容忍四舍五入与零星噪声） */
const RATIO_TOLERANCE = 0.15;

/** 参与判定的重叠样本上限（取最近 N 根，避免历史远端口径漂移干扰） */
const MAX_OVERLAP_SAMPLES = 10;

/**
 * 识别本地存量 volume 相对「在线万手」的单位因子
 * @returns 1 = 已一致；10000 = 本地为「手」；1000000 = 本地为「股」；null = 无法确认（不动）
 */
export function detectVolumeFactor(
  localBars: KlineDaily[],
  onlineBars: KlineDaily[]
): 1 | VolumeFactor | null {
  const onlineByDate = new Map<string, KlineDaily>();
  for (const ob of onlineBars) onlineByDate.set(ob.date, ob);

  const ratios: number[] = [];
  for (const lb of localBars.slice(-MAX_OVERLAP_SAMPLES)) {
    const ob = onlineByDate.get(lb.date);
    if (!ob || ob.volume <= 0 || lb.volume <= 0) continue;
    ratios.push(lb.volume / ob.volume);
  }
  if (ratios.length === 0) return null;

  // 中位数抗噪声（个别异常 bar 不改变判定）
  const sorted = [...ratios].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];

  if (Math.abs(median - 1) / 1 <= RATIO_TOLERANCE) return 1;
  for (const f of FACTOR_CANDIDATES) {
    if (Math.abs(median - f) / f <= RATIO_TOLERANCE) return f;
  }
  return null;
}

/**
 * 把某股本地存量 volume 一次性归一为「万手」
 * @returns 受影响行数
 */
export async function normalizeStockVolume(
  db: SQLiteDatabase,
  code: string,
  factor: VolumeFactor
): Promise<number> {
  const r = await db.runAsync(
    'UPDATE kline_daily SET volume = ROUND(volume / ?, 2) WHERE code = ? AND volume > 0',
    [factor, code]
  );
  return r.changes ?? 0;
}