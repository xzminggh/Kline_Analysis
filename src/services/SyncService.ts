/**
 * [wb修改] SyncService — K线比对与补齐服务 S3 实现
 *
 * 职责（对应 kline-sync 闭环 pipeline）：
 *   prepare  → 读 stocks 全量代码 + 各股 kline_daily 最后日期游标
 *   fetch    → 逐只调 KlineFetcher（三源降级）
 *   diff     → 按 (code, date) 比对本地，筛出缺失 bar
 *   patch    → 仅 INSERT 缺失 bar + 更新 meta 游标
 *   report   → 输出「补了 X 只 / Y 根」摘要
 *
 * 铁律（违反即停）：
 *  - 只 INSERT 新行，绝不 UPDATE/DELETE 用户上传的历史（INSERT OR IGNORE 双保险）
 *  - 复权基准与 db 不一致 → 该股整批拒绝（rejected），绝不写入尺度错乱的数据
 *  - 某股三源全挂 → 跳过记错，不中断整批
 *  - A股交易时段内（09:15–15:05）跳过「当日 bar」——盘中数据未定型，只补已收盘的
 */

import type { SQLiteDatabase } from 'expo-sqlite';
import type { KlineDaily } from '../database/SQLiteProvider';
import { fetchDailyKline, AllSourcesFailedError, DEFAULT_FETCH_DAYS, type FetchLike } from './KlineFetcher';

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
  rejected: boolean; // 有股票因复权基准不一致被拒绝
  errors: Array<{ code: string; error: string }>;
}

/** 补齐进度回调（UI 进度条用） */
export type SyncProgressCallback = (done: number, total: number, currentCode: string) => void;

/** meta 表游标键名 */
export const META_LAST_SYNC_TIME = 'wb_last_sync_time';
export const META_SYNC_ERRORS = 'wb_sync_errors';

/** 复权基准校验：重叠日收盘价相对偏差阈值（1% 内视为同基准，容忍四舍五入） */
export const ADJUST_BASIS_TOLERANCE = 0.01;

/** 复权校验最少重叠 bar 数（不足则跳过校验直接放行——本地无历史可比） */
export const ADJUST_BASIS_MIN_OVERLAP = 3;

/** 抓取分批大小（并发受控，不压垮手机/接口） */
export const FETCH_BATCH_SIZE = 5;

// ---------------------------------------------------------------------------
// prepare：读游标
// ---------------------------------------------------------------------------

/**
 * 读全量股票代码及各股本地最后K线日期。
 * 用 LEFT JOIN 保证 kline_daily 里没数据的股票也出现（lastDate=null）。
 */
export async function prepareCursors(db: SQLiteDatabase): Promise<SyncCursor[]> {
  const rows = await db.getAllAsync<{ code: string; lastDate: string | null }>(
    `SELECT s.code AS code, MAX(k.date) AS lastDate
     FROM stocks s LEFT JOIN kline_daily k ON k.code = s.code
     GROUP BY s.code ORDER BY s.code ASC`
  );
  return rows.map((r) => ({ code: r.code, lastDate: r.lastDate ?? null }));
}

// ---------------------------------------------------------------------------
// diff：纯函数
// ---------------------------------------------------------------------------

/** 在线 bars 与本地按 date 比对，返回本地缺失的 bar（纯函数，便于单测） */
export function diffMissingBars(localDates: Set<string>, onlineBars: KlineDaily[]): KlineDaily[] {
  return onlineBars.filter((bar) => !localDates.has(bar.date));
}

/**
 * 当日 bar 过滤：A股交易时段内（09:15–15:05 本地时间）盘中数据未定型，剔除当日 bar。
 * 收盘后（>=15:05）或非交易时段则保留当日 bar。纯函数，now 可注入便于单测。
 */
export function dropUnclosedTodayBar(bars: KlineDaily[], now: Date = new Date()): KlineDaily[] {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const today = `${y}-${m}-${d}`;
  const minutes = now.getHours() * 60 + now.getMinutes();
  const inTradingWindow = minutes >= 9 * 60 + 15 && minutes < 15 * 60 + 5;
  if (!inTradingWindow) return bars;
  return bars.filter((b) => b.date !== today);
}

// ---------------------------------------------------------------------------
// 复权基准校验：纯函数
// ---------------------------------------------------------------------------

/**
 * 复权基准校验：取本地与在线的重叠日期，比较收盘价相对偏差。
 * 任一重叠日偏差 > ADJUST_BASIS_TOLERANCE → 基准不一致，返回 false（调用方拒绝该股整批）。
 * 重叠不足 ADJUST_BASIS_MIN_OVERLAP 根时无从比对，放行（true）——如全新股票本地无历史。
 */
export function checkAdjustBasis(localBars: KlineDaily[], onlineBars: KlineDaily[]): boolean {
  const localByDate = new Map<string, KlineDaily>();
  for (const b of localBars) localByDate.set(b.date, b);
  const overlaps: Array<{ local: KlineDaily; online: KlineDaily }> = [];
  for (const ob of onlineBars) {
    const lb = localByDate.get(ob.date);
    if (lb) overlaps.push({ local: lb, online: ob });
  }
  if (overlaps.length < ADJUST_BASIS_MIN_OVERLAP) return true;
  // 取最近的若干重叠日（复权差异越近期越明显可辨）
  const recent = overlaps.slice(-10);
  for (const { local, online } of recent) {
    if (local.close <= 0) return false;
    const dev = Math.abs(local.close - online.close) / local.close;
    if (dev > ADJUST_BASIS_TOLERANCE) return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// patch：INSERT-only 写入
// ---------------------------------------------------------------------------

/**
 * 仅 INSERT 缺失 bar。
 *  - 每条 INSERT OR IGNORE 自身原子，无需显式事务（避免并发 batch 时嵌套事务冲突）
 *  - OR IGNORE 兜底防重复插入撞主键（绝不 REPLACE——REPLACE 会先删后插，违反铁律）
 *  - 返回实际插入行数（changes 累计）
 */
export async function insertMissingBars(db: SQLiteDatabase, bars: KlineDaily[]): Promise<number> {
  if (bars.length === 0) return 0;
  let inserted = 0;
  for (const b of bars) {
    const r = await db.runAsync(
      `INSERT OR IGNORE INTO kline_daily (code, date, open, high, low, close, volume, amount)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [b.code, b.date, b.open, b.high, b.low, b.close, b.volume, b.amount]
    );
    inserted += r.changes ?? 0;
  }
  return inserted;
}

/** 写 meta 游标（meta 表是 WB 自己的状态区，允许 upsert） */
export async function writeMeta(db: SQLiteDatabase, key: string, value: string): Promise<void> {
  await db.runAsync('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)', [key, value]);
}

// ---------------------------------------------------------------------------
// 主入口：全量补齐一轮
// ---------------------------------------------------------------------------

export interface RunSyncOptions {
  /** 抓取天数（默认 120） */
  days?: number;
  /** 注入 fetch（单测 mock 用） */
  fetchImpl?: FetchLike;
  /** 注入当前时间（单测/当日bar过滤用） */
  now?: Date;
  /** 分批大小（默认 FETCH_BATCH_SIZE） */
  batchSize?: number;
}

/**
 * 全量补齐一轮：prepare → (fetch → diff → 复权校验 → patch) × 每股 → report。
 * 单股失败不中断整批；复权不一致该股拒绝；结束写 meta 游标。
 */
export async function runFullSync(
  db: SQLiteDatabase,
  onProgress?: SyncProgressCallback,
  options: RunSyncOptions = {}
): Promise<SyncSummary> {
  const days = options.days ?? DEFAULT_FETCH_DAYS;
  const batchSize = options.batchSize ?? FETCH_BATCH_SIZE;
  const startedAt = new Date().toISOString();

  const cursors = await prepareCursors(db);
  const results: StockSyncResult[] = [];
  let done = 0;

  for (let i = 0; i < cursors.length; i += batchSize) {
    const batch = cursors.slice(i, i + batchSize);
    const batchResults = await Promise.all(
      batch.map(async (cursor): Promise<StockSyncResult> => {
        try {
          const { bars: onlineBarsRaw, source } = await fetchDailyKline(
            cursor.code,
            days,
            options.fetchImpl ?? (fetch as unknown as FetchLike)
          );
          const onlineBars = dropUnclosedTodayBar(onlineBarsRaw, options.now ?? new Date());

          // 读本地该股 bars（近段即可：只需覆盖在线窗口做重叠校验与 diff）
          const minOnlineDate = onlineBars.length > 0 ? onlineBars[0].date : '';
          const localBars = await db.getAllAsync<KlineDaily>(
            `SELECT code, date, open, high, low, close, volume, amount
             FROM kline_daily WHERE code = ? AND date >= ? ORDER BY date ASC`,
            [cursor.code, minOnlineDate]
          );

          // 复权基准校验（重叠不足时放行）
          if (!checkAdjustBasis(localBars, onlineBars)) {
            return {
              code: cursor.code,
              status: 'rejected',
              insertedBars: 0,
              source,
              error: '复权基准与本地不一致，拒绝写入（防价格尺度错乱）',
            };
          }

          const localDates = new Set(localBars.map((b) => b.date));
          const missing = diffMissingBars(localDates, onlineBars);
          if (missing.length === 0) {
            return { code: cursor.code, status: 'up_to_date', insertedBars: 0, source };
          }
          const inserted = await insertMissingBars(db, missing);
          return { code: cursor.code, status: 'patched', insertedBars: inserted, source };
        } catch (e) {
          const msg =
            e instanceof AllSourcesFailedError ? e.message : e instanceof Error ? e.message : String(e);
          return { code: cursor.code, status: 'failed', insertedBars: 0, error: msg };
        }
      })
    );
    for (const r of batchResults) {
      results.push(r);
      done += 1;
      onProgress?.(done, cursors.length, r.code);
    }
  }

  const finishedAt = new Date().toISOString();
  const errors = results
    .filter((r) => r.status === 'failed' || r.status === 'rejected')
    .map((r) => ({ code: r.code, error: r.error ?? '未知错误' }));
  const summary: SyncSummary = {
    startedAt,
    finishedAt,
    totalStocks: cursors.length,
    patchedStocks: results.filter((r) => r.status === 'patched').length,
    insertedBars: results.reduce((s, r) => s + r.insertedBars, 0),
    failedStocks: results.filter((r) => r.status === 'failed').length,
    rejected: results.some((r) => r.status === 'rejected'),
    errors,
  };

  // 写 meta 游标（失败不影响补齐结果本身）
  try {
    await writeMeta(db, META_LAST_SYNC_TIME, finishedAt);
    await writeMeta(db, META_SYNC_ERRORS, JSON.stringify(errors.slice(0, 50)));
  } catch {
    // meta 表可能不存在于极老 db——不让游标写入失败毁掉整轮补齐
  }

  return summary;
}
