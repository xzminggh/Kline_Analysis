/**
 * StockImporter — 任意股票代码联网全量导入
 *
 * [wb修改] 2026-08 新增：补齐「输入代码 → 联网拉全量历史 → 入库 → 策略分析」闭环。
 *
 * 职责：
 *  1. normalizeStockCode：校验/归一 6 位股票代码（支持 sh600519 / 600519）
 *  2. importNewStock：本地无数据时拉取全量历史（约 1000 根）→ INSERT 缺失 bar → 写 stocks 表
 *  3. 名称附带回退：东财 stock/get 取股票名（UTF-8 JSON），失败则落空名
 *
 * 铁律（与 SyncService 对齐）：
 *  - 数据源：KlineFetcher 三源降级（腾讯→新浪→东财），volume 归一化「万手」，与桌面版 db 一致
 *  - 只 INSERT 缺失 bar（INSERT OR IGNORE），绝不覆盖已有历史
 *  - 本地已有数据 → 抛错拒导（应走 KlineFiller 补齐路径）
 */

import type { SQLiteDatabase } from 'expo-sqlite';
import { fetchDailyKline, toMarketSymbol, AllSourcesFailedError, type FetchLike } from './KlineFetcher';
import { insertMissingBars } from './SyncService';

/** 全量历史目标根数（约 4 年日K；新浪 datalen 上限 1023，26 策略仅需 ≥100） */
export const STOCK_IMPORT_DAYS = 1000;

/** 股票名查询超时（ms） */
const NAME_TIMEOUT_MS = 5000;

export interface StockImportResult {
  code: string;
  name: string;
  market: 'sh' | 'sz' | 'bj';
  insertedBars: number;
  source: string;
  earliestDate: string;
}

/**
 * 归一化用户输入为 6 位纯数字代码
 * @throws Error 非法输入时
 */
export function normalizeStockCode(input: string): string {
  const m = String(input ?? '').trim().toLowerCase().match(/^(sh|sz|bj)?(\d{6})$/);
  if (!m) throw new Error('请输入 6 位数字股票代码');
  return m[2];
}

/** 股权名查询（东财 quote 接口，UTF-8 JSON 无需转码） */
export async function fetchStockName(
  code: string,
  fetchImpl: FetchLike = fetch as unknown as FetchLike
): Promise<string> {
  const { prefix } = toMarketSymbol(code);
  const secid = `${prefix === 'sh' ? '1' : '0'}.${code.trim()}`;
  const url = `https://push2.eastmoney.com/api/qt/stock/get?secid=${secid}&fields=f57,f58&invt=2&fltt=1`;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), NAME_TIMEOUT_MS);
    try {
      const res = await fetchImpl(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0',
          Referer: 'https://quote.eastmoney.com/',
        },
      });
      if (!res.ok) return '';
      const json = (await res.json()) as { data?: { f58?: unknown } };
      return String(json?.data?.f58 ?? '').trim();
    } finally {
      clearTimeout(timer);
    }
  } catch {
    // 名称失败不阻断导入，回退空串
    return '';
  }
}

/**
 * 联网全量导入一只新股票：拉历史 → 写 kline_daily → 写 stocks
 *
 * @throws Error 本地已有数据 / 代码非法 / 三源全挂 / 无数据时
 */
export async function importNewStock(
  db: SQLiteDatabase,
  code: string,
  options?: { days?: number; fetchImpl?: FetchLike }
): Promise<StockImportResult> {
  const days = options?.days ?? STOCK_IMPORT_DAYS;
  const normalized = normalizeStockCode(code);
  const { prefix } = toMarketSymbol(normalized);

  // 本地已有 K 线 → 拒绝全量（应走补齐）
  const local = await db.getFirstAsync<{ lastDate: string | null }>(
    'SELECT MAX(date) AS lastDate FROM kline_daily WHERE code = ?',
    [normalized]
  );
  if (local?.lastDate) {
    throw new Error(`本地已有 ${normalized} 的数据（最新 ${local.lastDate}），将走增量补齐`);
  }

  // 三源降级拉全量历史
  let fetched;
  try {
    fetched = await fetchDailyKline(normalized, days, options?.fetchImpl, 'raw');
  } catch (e) {
    if (e instanceof AllSourcesFailedError) {
      throw new Error(`联网拉取失败：${e.message}`);
    }
    throw e;
  }
  if (fetched.bars.length === 0) {
    throw new Error('未查询到该股票的K线数据（请检查代码是否正确或是否长期停牌）');
  }

  // 只 INSERT 缺失 bar
  const insertedBars = await insertMissingBars(db, fetched.bars);

  // 写入 stocks：名称回退用代码占位，保证列表可读
  const name = await fetchStockName(normalized, options?.fetchImpl);
  await db.runAsync(
    'INSERT OR REPLACE INTO stocks (code, name, market, sector_id, status) VALUES (?, ?, ?, ?, ?)',
    [normalized, name || normalized, prefix, '', '']
  );

  return {
    code: normalized,
    name,
    market: prefix,
    insertedBars,
    source: fetched.source,
    earliestDate: fetched.bars[0].date,
  };
}