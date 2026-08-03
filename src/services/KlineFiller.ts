/**
 * 补齐业务编排 (KlineFiller)
 *
 * 设计原则：
 * 1. 编排层：协调 tradingCalendar + QuoteFetcher + FillCache + SQLiteProvider
 * 2. 单股补齐：查询最新日期 → 计算缺失交易日 → 拉取 → 写入 → 更新缓存
 * 3. 批量补齐：遍历股票列表，逐只补齐
 * 4. 互斥锁：isFilling 防止并发补齐同一批次
 * 5. 熔断：连续失败 > 3 次则暂停当前批次
 */

import { KlineDaily } from '../database/SQLiteProvider';
import { fetchKline, FetchResult } from './QuoteFetcher';
import { FillCache } from './FillCache';
import {
  isTradingDay,
  getLastTradingDay,
  getMissingTradingDays,
} from '../utils/tradingCalendar';

export interface FillerProgress {
  current: number;
  total: number;
  code: string;
  status: 'idle' | 'filling' | 'done' | 'error';
  addedCount: number;
  error?: string;
}

export interface FillResult {
  code: string;
  success: boolean;
  addedCount: number;
  source?: string;
  error?: string;
}

export interface BatchFillResult {
  total: number;
  success: number;
  failed: number;
  skipped: number;
  results: FillResult[];
}

export class KlineFiller {
  private cache: FillCache;
  private isFilling: boolean = false;
  private consecutiveFailures: number = 0;
  private readonly maxConsecutiveFailures = 3;

  constructor(cache?: FillCache) {
    this.cache = cache || new FillCache();
  }

  /**
   * 单股补齐
   *
   * @param code       股票代码
   * @param db         SQLiteDatabase 实例
   * @param force      强制补齐（忽略缓存）
   * @returns FillResult
   */
  async fillSingle(
    code: string,
    db: any, // SQLite.SQLiteDatabase | null
    force = false
  ): Promise<FillResult> {
    if (!db) {
      return { code, success: false, addedCount: 0, error: '数据库未连接' };
    }

    // 检查缓存（非强制模式下）
    if (!force && this.cache.has(code)) {
      const entry = this.cache.get(code);
      const today = this.formatDate(new Date());
      if (entry && entry.latestDate >= today) {
        return { code, success: true, addedCount: 0, source: 'cache' };
      }
    }

    try {
      // 1. 查询该股票最新 K 线日期
      const lastDate = await this.getLastKlineDate(db, code);

      // 2. 确定补齐日期范围
      const today = this.formatDate(new Date());
      const startDate = lastDate
        ? this.getNextDay(lastDate)
        : today;

      if (startDate > today) {
        // 已经是最新了
        this.cache.set(code, today);
        return { code, success: true, addedCount: 0, source: 'up-to-date' };
      }

      // 3. 计算需要补齐的交易日
      const missingDays = getMissingTradingDays(startDate, today);
      if (missingDays.length === 0) {
        this.cache.set(code, today);
        return { code, success: true, addedCount: 0, source: 'up-to-date' };
      }

      // 4. 拉取行情数据
      const fetchResult = await fetchKline(code, missingDays[0], missingDays[missingDays.length - 1]);
      if (!fetchResult.success) {
        this.consecutiveFailures++;
        return {
          code,
          success: false,
          addedCount: 0,
          error: fetchResult.error || '拉取失败',
        };
      }

      // 5. 写入数据库
      const klines = fetchResult.data;
      if (klines.length === 0) {
        // 停牌或空数据，更新缓存避免重复拉取
        this.cache.set(code, today);
        return { code, success: true, addedCount: 0, source: fetchResult.source };
      }

      const insertedCount = await this.insertKlines(db, klines);

      // 6. 更新缓存
      const latestDate = klines[klines.length - 1].date;
      this.cache.set(code, latestDate);
      this.consecutiveFailures = 0;

      return {
        code,
        success: true,
        addedCount: insertedCount,
        source: fetchResult.source,
      };
    } catch (err: any) {
      this.consecutiveFailures++;
      return {
        code,
        success: false,
        addedCount: 0,
        error: err.message || String(err),
      };
    }
  }

  /**
   * 批量补齐
   *
   * @param codes  股票代码列表
   * @param db     SQLiteDatabase 实例
   * @param onProgress  进度回调
   * @returns BatchFillResult
   */
  async fillBatch(
    codes: string[],
    db: any,
    onProgress?: (progress: FillerProgress) => void
  ): Promise<BatchFillResult> {
    if (this.isFilling) {
      return {
        total: codes.length,
        success: 0,
        failed: 0,
        skipped: codes.length,
        results: codes.map((code) => ({
          code,
          success: false,
          addedCount: 0,
          error: '已有补齐任务进行中',
        })),
      };
    }

    this.isFilling = true;
    this.consecutiveFailures = 0;

    const results: FillResult[] = [];
    let successCount = 0;
    let failedCount = 0;
    let skippedCount = 0;

    try {
      for (let i = 0; i < codes.length; i++) {
        const code = codes[i];

        // 熔断检查
        if (this.consecutiveFailures >= this.maxConsecutiveFailures) {
          skippedCount += codes.length - i;
          for (let j = i; j < codes.length; j++) {
            results.push({
              code: codes[j],
              success: false,
              addedCount: 0,
              error: '熔断：连续失败超过阈值',
            });
          }
          break;
        }

        if (onProgress) {
          onProgress({
            current: i + 1,
            total: codes.length,
            code,
            status: 'filling',
            addedCount: 0,
          });
        }

        const result = await this.fillSingle(code, db);
        results.push(result);

        if (result.success) {
          successCount++;
        } else if (result.error === '已有补齐任务进行中') {
          skippedCount++;
        } else {
          failedCount++;
        }

        if (onProgress) {
          onProgress({
            current: i + 1,
            total: codes.length,
            code,
            status: result.success ? 'done' : 'error',
            addedCount: result.addedCount,
            error: result.error,
          });
        }
      }
    } finally {
      this.isFilling = false;
      this.consecutiveFailures = 0;
    }

    return {
      total: codes.length,
      success: successCount,
      failed: failedCount,
      skipped: skippedCount,
      results,
    };
  }

  /** 获取补齐状态 */
  getIsFilling(): boolean {
    return this.isFilling;
  }

  /** 获取缓存实例（供外部访问） */
  getCache(): FillCache {
    return this.cache;
  }

  // ==================== 私有方法 ====================

  /**
   * 查询某股票最新 K 线日期
   */
  private async getLastKlineDate(db: any, code: string): Promise<string | null> {
    try {
      const row = await db.getFirstAsync(
        'SELECT MAX(date) as maxDate FROM kline_daily WHERE code = ?',
        [code]
      ) as { maxDate: string } | null;
      return row?.maxDate || null;
    } catch (error) {
      console.error('getLastKlineDate failed:', error);
      return null;
    }
  }

  /**
   * 批量写入 K 线数据
   * 使用 INSERT OR REPLACE 避免重复
   */
  private async insertKlines(db: any, klines: KlineDaily[]): Promise<number> {
    if (klines.length === 0) return 0;

    const sql = `
      INSERT OR REPLACE INTO kline_daily
        (code, date, open, high, low, close, volume, amount)
      VALUES
        (?, ?, ?, ?, ?, ?, ?, ?)
    `;

    let insertedCount = 0;

    for (const k of klines) {
      try {
        await db.runAsync(sql, [
          k.code,
          k.date,
          k.open,
          k.high,
          k.low,
          k.close,
          k.volume,
          k.amount,
        ]);
        insertedCount++;
      } catch (error) {
        console.error(`insertKlines failed for ${k.code} ${k.date}:`, error);
        // 单条失败继续写入其他
      }
    }

    return insertedCount;
  }

  /** 获取下一天日期字符串 */
  private getNextDay(dateStr: string): string {
    const date = new Date(dateStr + 'T00:00:00');
    date.setDate(date.getDate() + 1);
    return this.formatDate(date);
  }

  /** 日期格式化 YYYY-MM-DD */
  private formatDate(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
}
