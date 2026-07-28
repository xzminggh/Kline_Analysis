/**
 * [wb修改] SyncService — K线比对与补齐服务
 *
 * 职责（对应 kline-sync 闭环 pipeline）：
 *   prepare  → 读 stocks 全量代码 + 各股 kline_daily 最后日期游标
 *   fetch    → 逐只调 KlineFetcher（三源降级）
 *   diff     → 按 (code, date) 比对本地，筛出缺失 bar
 *   patch    → 仅 INSERT 缺失 bar + 更新 meta 游标
 *   report   → 输出「补了 X 只 / Y 根」摘要
 *
 * 铁律（违反即停）：
 *  - 只 INSERT 新行，绝不 UPDATE/DELETE 用户上传的历史
 *  - 复权基准与 db 不一致 → 整批拒绝并报错
 *  - 某股三源全挂 → 跳过记错，不中断整批
 *
 * S1 阶段：骨架 + 类型。S3 阶段填充 diff/patch 实现。
 */

import type { SQLiteDatabase } from 'expo-sqlite';
import type { KlineDaily } from '../database/SQLiteProvider';

/** 单只股票的同步游标（本地最后一根K线日期） */
export interface SyncCursor {
  code: string;
  lastDate: string | null; // null = 本地无任何K线
}

/** 单只股票的补齐结果 */
export interface StockSyncResult {
  code: string;
  status: 'patched' | 'up_to_date' | 'failed' | 'rejected';
  insertedBars: number;
  source?: string;
  error?: string;
}

/** 整轮补齐摘要（report 步骤输出） */
export interface SyncSummary {
  startedAt: string;
  finishedAt: string;
  totalStocks: number;
  patchedStocks: number;
  insertedBars: number;
  failedStocks: number;
  rejected: boolean; // 复权基准不一致导致整批拒绝
  errors: Array<{ code: string; error: string }>;
}

/** 补齐进度回调（UI 进度条用） */
export type SyncProgressCallback = (done: number, total: number, currentCode: string) => void;

/** meta 表游标键名 */
export const META_LAST_SYNC_TIME = 'wb_last_sync_time';
export const META_SYNC_ERRORS = 'wb_sync_errors';

/**
 * prepare：读全量股票代码及各股本地最后K线日期
 * S3 实现：SELECT code, MAX(date) FROM kline_daily GROUP BY code 与 stocks 表左连
 */
export async function prepareCursors(db: SQLiteDatabase): Promise<SyncCursor[]> {
  void db;
  return []; // S1 骨架：S3 填充
}

/**
 * diff：在线 bars 与本地按 (code,date) 比对，返回本地缺失的 bar
 * 纯函数，便于单测。
 */
export function diffMissingBars(localDates: Set<string>, onlineBars: KlineDaily[]): KlineDaily[] {
  return onlineBars.filter((bar) => !localDates.has(bar.date));
}

/**
 * 复权基准校验：本地与在线在重叠日期上的收盘价偏差超阈值 → 判定基准不一致
 * S3 实现：取最近数个重叠交易日，|local.close - online.close| / local.close > 阈值即拒绝
 */
export function checkAdjustBasis(localBars: KlineDaily[], onlineBars: KlineDaily[]): boolean {
  void localBars;
  void onlineBars;
  return true; // S1 骨架：S3 填充真实校验
}

/**
 * 主入口：全量补齐一轮（prepare → fetch → diff → patch → report）
 * S3 实现，须遵守 INSERT-only 铁律。
 */
export async function runFullSync(
  db: SQLiteDatabase,
  onProgress?: SyncProgressCallback
): Promise<SyncSummary> {
  void db;
  void onProgress;
  const now = new Date().toISOString();
  return {
    startedAt: now,
    finishedAt: now,
    totalStocks: 0,
    patchedStocks: 0,
    insertedBars: 0,
    failedStocks: 0,
    rejected: false,
    errors: [{ code: 'N/A', error: 'S1 骨架未实现，S3 填充' }],
  };
}
