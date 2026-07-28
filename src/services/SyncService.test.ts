/**
 * [wb修改] SyncService 单测 — 断言 INSERT-only 铁律、diff 正确性、复权拒绝、失败不中断
 */

import type { SQLiteDatabase } from 'expo-sqlite';
import type { KlineDaily } from '../database/SQLiteProvider';
import {
  diffMissingBars,
  dropUnclosedTodayBar,
  checkAdjustBasis,
  insertMissingBars,
  prepareCursors,
  runFullSync,
  META_LAST_SYNC_TIME,
} from './SyncService';
import type { FetchLike } from './KlineFetcher';

// ---------------------------------------------------------------------------
// 内存假 DB：记录全部 SQL，模拟 stocks/kline_daily/meta
// ---------------------------------------------------------------------------

function bar(code: string, date: string, close: number, volume = 1000): KlineDaily {
  return { code, date, open: close, high: close * 1.01, low: close * 0.99, close, volume, amount: 0 };
}

class FakeDb {
  sqlLog: string[] = [];
  kline: Map<string, KlineDaily> = new Map(); // key = code|date
  stocks: string[] = [];
  meta: Map<string, string> = new Map();
  inTx = false;

  private key(code: string, date: string) {
    return `${code}|${date}`;
  }

  seedStocks(codes: string[]) {
    this.stocks = [...codes];
  }
  seedKline(bars: KlineDaily[]) {
    for (const b of bars) this.kline.set(this.key(b.code, b.date), b);
  }

  async execAsync(sql: string): Promise<void> {
    this.sqlLog.push(sql);
    if (/^BEGIN/i.test(sql)) this.inTx = true;
    if (/^(COMMIT|ROLLBACK)/i.test(sql)) this.inTx = false;
  }

  async runAsync(sql: string, params: unknown[] = []): Promise<{ changes: number }> {
    this.sqlLog.push(sql);
    if (/INSERT OR IGNORE INTO kline_daily/i.test(sql)) {
      const [code, date, open, high, low, close, volume, amount] = params as [
        string, string, number, number, number, number, number, number,
      ];
      const k = this.key(code, date);
      if (this.kline.has(k)) return { changes: 0 };
      this.kline.set(k, { code, date, open, high, low, close, volume, amount });
      return { changes: 1 };
    }
    if (/INSERT OR REPLACE INTO meta/i.test(sql)) {
      const [key, value] = params as [string, string];
      this.meta.set(key, value);
      return { changes: 1 };
    }
    throw new Error(`FakeDb 不认识的 runAsync SQL: ${sql}`);
  }

  async getAllAsync<T>(sql: string, params: unknown[] = []): Promise<T[]> {
    this.sqlLog.push(sql);
    if (/FROM stocks s LEFT JOIN kline_daily/i.test(sql)) {
      return this.stocks
        .sort()
        .map((code) => {
          const dates = [...this.kline.values()].filter((b) => b.code === code).map((b) => b.date);
          return { code, lastDate: dates.length > 0 ? dates.sort().at(-1)! : null };
        }) as T[];
    }
    if (/FROM kline_daily WHERE code = \?/i.test(sql)) {
      const [code, minDate] = params as [string, string];
      return [...this.kline.values()]
        .filter((b) => b.code === code && b.date >= minDate)
        .sort((a, b) => (a.date < b.date ? -1 : 1)) as T[];
    }
    throw new Error(`FakeDb 不认识的 getAllAsync SQL: ${sql}`);
  }

  asDb(): SQLiteDatabase {
    return this as unknown as SQLiteDatabase;
  }

  /** 铁律断言辅助：kline_daily 上出现过 UPDATE/DELETE/REPLACE 吗？ */
  hasDestructiveKlineSql(): boolean {
    return this.sqlLog.some(
      (s) => /kline_daily/i.test(s) && /(UPDATE|DELETE|INSERT OR REPLACE|^REPLACE)/i.test(s)
    );
  }
}

/** mock 三源：腾讯直接命中，返回给定 bars（腾讯响应格式） */
function tencentFetchFor(barsByCode: Record<string, KlineDaily[]>): FetchLike {
  return async (url: string) => {
    const m = url.match(/param=(sh|sz|bj)(\d{6})/);
    if (!m || !url.includes('gtimg')) return { ok: false, status: 500, json: async () => ({}) };
    const code = m[2];
    const bars = barsByCode[code] ?? [];
    return {
      ok: true,
      status: 200,
      json: async () => ({
        code: 0,
        data: {
          [`${m[1]}${code}`]: {
            qfqday: bars.map((b) => [b.date, String(b.open), String(b.close), String(b.high), String(b.low), String(b.volume)]),
          },
        },
      }),
    };
  };
}

const AFTER_CLOSE = new Date('2026-07-28T16:00:00'); // 收盘后，当日bar可入库

// ---------------------------------------------------------------------------
// 纯函数单测
// ---------------------------------------------------------------------------

describe('diffMissingBars', () => {
  it('只返回本地没有的日期', () => {
    const local = new Set(['2026-07-23', '2026-07-24']);
    const online = [bar('600000', '2026-07-23', 9), bar('600000', '2026-07-24', 9.1), bar('600000', '2026-07-27', 9.2)];
    const missing = diffMissingBars(local, online);
    expect(missing.map((b) => b.date)).toEqual(['2026-07-27']);
  });
});

describe('dropUnclosedTodayBar', () => {
  const bars = [bar('600000', '2026-07-27', 9), bar('600000', '2026-07-28', 9.1)];
  it('盘中（10:30）剔除当日bar', () => {
    const r = dropUnclosedTodayBar(bars, new Date('2026-07-28T10:30:00'));
    expect(r.map((b) => b.date)).toEqual(['2026-07-27']);
  });
  it('收盘后（16:00）保留当日bar', () => {
    const r = dropUnclosedTodayBar(bars, AFTER_CLOSE);
    expect(r.map((b) => b.date)).toEqual(['2026-07-27', '2026-07-28']);
  });
  it('盘前（08:00）保留（上一交易日已收盘，当日bar不会存在）', () => {
    const r = dropUnclosedTodayBar(bars, new Date('2026-07-28T08:00:00'));
    expect(r).toHaveLength(2);
  });
});

describe('checkAdjustBasis 复权基准校验', () => {
  const local = [bar('600000', '2026-07-23', 9.05), bar('600000', '2026-07-24', 9.04), bar('600000', '2026-07-27', 9.05)];
  it('重叠收盘价一致 → 通过', () => {
    const online = [bar('600000', '2026-07-23', 9.05), bar('600000', '2026-07-24', 9.04), bar('600000', '2026-07-27', 9.05), bar('600000', '2026-07-28', 9.09)];
    expect(checkAdjustBasis(local, online)).toBe(true);
  });
  it('重叠收盘价偏差大（不复权 vs 前复权）→ 拒绝', () => {
    const online = [bar('600000', '2026-07-23', 12.5), bar('600000', '2026-07-24', 12.48), bar('600000', '2026-07-27', 12.5)];
    expect(checkAdjustBasis(local, online)).toBe(false);
  });
  it('重叠不足3根（新股票）→ 放行', () => {
    const online = [bar('600000', '2026-07-27', 99), bar('600000', '2026-07-28', 100)];
    expect(checkAdjustBasis(local, online)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// insertMissingBars：INSERT-only + 幂等
// ---------------------------------------------------------------------------

describe('insertMissingBars', () => {
  it('只 INSERT，撞主键忽略，返回真实插入数', async () => {
    const db = new FakeDb();
    db.seedKline([bar('600000', '2026-07-24', 9.04)]);
    const inserted = await insertMissingBars(db.asDb(), [
      bar('600000', '2026-07-24', 9.04), // 已存在 → ignore
      bar('600000', '2026-07-27', 9.05),
      bar('600000', '2026-07-28', 9.09),
    ]);
    expect(inserted).toBe(2);
    expect(db.kline.size).toBe(3);
    expect(db.hasDestructiveKlineSql()).toBe(false); // 铁律
    // 已存在行未被改动
    expect(db.kline.get('600000|2026-07-24')!.close).toBe(9.04);
  });
  it('空数组不开事务', async () => {
    const db = new FakeDb();
    expect(await insertMissingBars(db.asDb(), [])).toBe(0);
    expect(db.sqlLog).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// prepareCursors
// ---------------------------------------------------------------------------

describe('prepareCursors', () => {
  it('无K线的股票 lastDate=null，有则取最大日期', async () => {
    const db = new FakeDb();
    db.seedStocks(['600000', '000001']);
    db.seedKline([bar('600000', '2026-07-23', 9), bar('600000', '2026-07-27', 9.05)]);
    const cursors = await prepareCursors(db.asDb());
    expect(cursors).toEqual([
      { code: '000001', lastDate: null },
      { code: '600000', lastDate: '2026-07-27' },
    ]);
  });
});

// ---------------------------------------------------------------------------
// runFullSync 端到端（假DB + mock三源）
// ---------------------------------------------------------------------------

describe('runFullSync', () => {
  it('补齐缺失bar：只增行、已有行原样、摘要正确、meta游标已写', async () => {
    const db = new FakeDb();
    db.seedStocks(['600000']);
    db.seedKline([bar('600000', '2026-07-23', 9.05), bar('600000', '2026-07-24', 9.04), bar('600000', '2026-07-25', 9.0)]);
    const online = [
      bar('600000', '2026-07-23', 9.05),
      bar('600000', '2026-07-24', 9.04),
      bar('600000', '2026-07-25', 9.0),
      bar('600000', '2026-07-27', 9.05),
      bar('600000', '2026-07-28', 9.09),
    ];
    const before = db.kline.size;
    const summary = await runFullSync(db.asDb(), undefined, {
      fetchImpl: tencentFetchFor({ '600000': online }),
      now: AFTER_CLOSE,
    });
    expect(summary.patchedStocks).toBe(1);
    expect(summary.insertedBars).toBe(2);
    expect(summary.failedStocks).toBe(0);
    expect(summary.rejected).toBe(false);
    expect(db.kline.size).toBe(before + 2); // 行数仅增
    expect(db.hasDestructiveKlineSql()).toBe(false); // 铁律：无 UPDATE/DELETE/REPLACE
    expect(db.kline.get('600000|2026-07-28')).toBeDefined(); // 缺失bar已存在
    expect(db.meta.get(META_LAST_SYNC_TIME)).toBeTruthy(); // 游标已写
  });

  it('已是最新 → up_to_date，零写入', async () => {
    const db = new FakeDb();
    db.seedStocks(['600000']);
    const bars = [bar('600000', '2026-07-27', 9.05), bar('600000', '2026-07-28', 9.09)];
    db.seedKline(bars);
    const summary = await runFullSync(db.asDb(), undefined, {
      fetchImpl: tencentFetchFor({ '600000': bars }),
      now: AFTER_CLOSE,
    });
    expect(summary.patchedStocks).toBe(0);
    expect(summary.insertedBars).toBe(0);
  });

  it('复权基准不一致 → 该股 rejected 且零写入', async () => {
    const db = new FakeDb();
    db.seedStocks(['600000']);
    db.seedKline([bar('600000', '2026-07-23', 9.05), bar('600000', '2026-07-24', 9.04), bar('600000', '2026-07-25', 9.0)]);
    // 在线是不复权价（尺度差 40%）
    const online = [
      bar('600000', '2026-07-23', 12.6),
      bar('600000', '2026-07-24', 12.65),
      bar('600000', '2026-07-25', 12.6),
      bar('600000', '2026-07-28', 12.7),
    ];
    const before = db.kline.size;
    const summary = await runFullSync(db.asDb(), undefined, {
      fetchImpl: tencentFetchFor({ '600000': online }),
      now: AFTER_CLOSE,
    });
    expect(summary.rejected).toBe(true);
    expect(summary.insertedBars).toBe(0);
    expect(db.kline.size).toBe(before); // 一行都没写
    expect(summary.errors[0].error).toContain('复权');
  });

  it('某股三源全挂 → 跳过记错，其他股照常补齐（不中断整批）', async () => {
    const db = new FakeDb();
    db.seedStocks(['600000', '000001']);
    db.seedKline([bar('000001', '2026-07-27', 11.0)]);
    const online000001 = [bar('000001', '2026-07-27', 11.0), bar('000001', '2026-07-28', 11.1)];
    // 600000 三源全挂（mock 里没配它的数据也让腾讯 500）
    const f: FetchLike = async (url: string) => {
      if (url.includes('600000') || !url.includes('gtimg')) return { ok: false, status: 500, json: async () => ({}) };
      return tencentFetchFor({ '000001': online000001 })(url);
    };
    const summary = await runFullSync(db.asDb(), undefined, { fetchImpl: f, now: AFTER_CLOSE });
    expect(summary.failedStocks).toBe(1);
    expect(summary.patchedStocks).toBe(1); // 000001 照常补
    expect(db.kline.get('000001|2026-07-28')).toBeDefined();
    expect(summary.errors.some((e) => e.code === '600000')).toBe(true);
  });

  it('进度回调按股票数推进', async () => {
    const db = new FakeDb();
    db.seedStocks(['600000', '000001', '300750']);
    const progress: Array<[number, number]> = [];
    await runFullSync(db.asDb(), (d, t) => progress.push([d, t]), {
      fetchImpl: async () => ({ ok: false, status: 500, json: async () => ({}) }),
      now: AFTER_CLOSE,
    });
    expect(progress).toEqual([
      [1, 3],
      [2, 3],
      [3, 3],
    ]);
  });
});
