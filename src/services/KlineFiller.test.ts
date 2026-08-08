/**
 * KlineFiller 单元测试
 * [wb修改] 2026-08 数据源自 QuoteFetcher 切换为 KlineFetcher（万手归一化），
 *   mock 结构与抛错语义随之更新：fetchDailyKline 返回 { bars, source }，失败时抛错。
 */

import { KlineFiller, FillResult } from './KlineFiller';
import { FillCache } from './FillCache';
import { KlineDaily } from '../database/SQLiteProvider';

// 模拟 KlineFetcher（三源降级、万手归一）
jest.mock('./KlineFetcher', () => ({
  fetchDailyKline: jest.fn(),
}));

import { fetchDailyKline } from './KlineFetcher';

// 模拟 tradingCalendar
jest.mock('../utils/tradingCalendar', () => ({
  isTradingDay: jest.fn(() => true),
  getLastTradingDay: jest.fn((date: string) => date),
  getMissingTradingDays: jest.fn((start: string, end: string) => {
    // 简单返回 start 到 end 之间每一天
    const days: string[] = [];
    const cur = new Date(start + 'T00:00:00');
    const limit = new Date(end + 'T00:00:00');
    while (cur <= limit) {
      days.push(
        `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}-${String(cur.getDate()).padStart(2, '0')}`
      );
      cur.setDate(cur.getDate() + 1);
    }
    return days;
  }),
}));

function createMockDb(rows: Record<string, any> = {}, recentBars: Record<string, KlineDaily[]> = {}) {
  const dbRows: Record<string, any> = { ...rows };
  const recent: Record<string, KlineDaily[]> = { ...recentBars };
  return {
    getFirstAsync: jest.fn(async (sql: string, params?: any[]) => {
      if (sql.includes('MAX(date)')) {
        const code = params?.[0];
        return { maxDate: dbRows[code] || null };
      }
      return null;
    }),
    runAsync: jest.fn(async () => ({ changes: 1 })),
    getAllAsync: jest.fn(async (sql: string, params?: any[]) => {
      if (sql.includes('ORDER BY date DESC LIMIT 15')) {
        return recent[params?.[0]] || [];
      }
      return [];
    }),
  };
}

function mockKlines(code: string, dates: string[], volume = 100.0): KlineDaily[] {
  return dates.map((date) => ({
    code,
    date,
    open: 100,
    high: 110,
    low: 90,
    close: 105,
    volume, // 默认万手（KlineFetcher 归一化口径）
    amount: 105000000,
  }));
}

describe('KlineFiller', () => {
  let filler: KlineFiller;
  let mockDb: any;
  const originalDate = global.Date;

  beforeEach(() => {
    jest.clearAllMocks();
    filler = new KlineFiller();
    mockDb = createMockDb();

    // 固定日期为 2026-07-28
    global.Date = class extends originalDate {
      constructor(...args: any[]) {
        if (args.length === 0) {
          super('2026-07-28T00:00:00');
        } else if (args.length === 1) {
          super(args[0]);
        } else {
          super(args[0], args[1], args[2], args[3], args[4], args[5], args[6]);
        }
      }
    } as any;
  });

  afterEach(() => {
    global.Date = originalDate;
  });

  // ==================== fillSingle ====================

  it('数据库未连接时返回错误', async () => {
    const result = await filler.fillSingle('600519', null);
    expect(result.success).toBe(false);
    expect(result.error).toBe('数据库未连接');
  });

  it('已有最新数据时返回 up-to-date', async () => {
    mockDb = createMockDb({ '600519': '2026-07-28' });
    const result = await filler.fillSingle('600519', mockDb);
    expect(result.success).toBe(true);
    expect(result.source).toBe('up-to-date');
    expect(result.addedCount).toBe(0);
  });

  it('缓存命中且已是最新时直接返回', async () => {
    filler.getCache().set('600519', '2026-07-28');
    const result = await filler.fillSingle('600519', mockDb);
    expect(result.success).toBe(true);
    expect(result.source).toBe('cache');
    expect(result.addedCount).toBe(0);
  });

  it('拉取成功并写入数据（只写缺失交易日）', async () => {
    mockDb = createMockDb({ '600519': '2026-07-24' });
    (fetchDailyKline as jest.Mock).mockResolvedValue({
      bars: mockKlines('600519', ['2026-07-25', '2026-07-26', '2026-07-27']),
      source: 'tencent',
    });

    const result = await filler.fillSingle('600519', mockDb);

    expect(result.success).toBe(true);
    expect(result.source).toBe('tencent');
    expect(result.addedCount).toBe(3);
    expect(mockDb.runAsync).toHaveBeenCalledTimes(3);
  });

  it('拉取失败时返回错误并累计失败次数', async () => {
    mockDb = createMockDb({ '600519': '2026-07-24' });
    (fetchDailyKline as jest.Mock).mockRejectedValue(new Error('网络错误'));

    const result = await filler.fillSingle('600519', mockDb);

    expect(result.success).toBe(false);
    expect(result.error).toBe('网络错误');
  });

  it('停牌返回空数据时不报错', async () => {
    mockDb = createMockDb({ '600519': '2026-07-24' });
    (fetchDailyKline as jest.Mock).mockResolvedValue({
      bars: [],
      source: 'tencent',
    });

    const result = await filler.fillSingle('600519', mockDb);

    expect(result.success).toBe(true);
    expect(result.addedCount).toBe(0);
    expect(result.source).toBe('tencent');
  });

  it('force=true 时忽略缓存', async () => {
    filler.getCache().set('600519', '2026-07-28');
    mockDb = createMockDb({ '600519': '2026-07-24' });
    (fetchDailyKline as jest.Mock).mockResolvedValue({
      bars: mockKlines('600519', ['2026-07-25']),
      source: 'tencent',
    });

    const result = await filler.fillSingle('600519', mockDb, true);

    expect(result.success).toBe(true);
    expect(result.addedCount).toBe(1);
  });

  it('数据库查询失败时继续执行（lastDate 为 null）', async () => {
    mockDb = createMockDb(); // 无数据
    (fetchDailyKline as jest.Mock).mockResolvedValue({
      bars: mockKlines('600519', ['2026-07-28']),
      source: 'tencent',
    });

    const result = await filler.fillSingle('600519', mockDb);

    expect(result.success).toBe(true);
    expect(result.addedCount).toBe(1);
  });

  it('拉取返回的已存在日期不会重复写入', async () => {
    mockDb = createMockDb({ '600519': '2026-07-24' });
    (fetchDailyKline as jest.Mock).mockResolvedValue({
      bars: mockKlines('600519', ['2026-07-20', '2026-07-25', '2026-07-26']),
      source: 'tencent',
    });

    const result = await filler.fillSingle('600519', mockDb);

    // 07-20 不在缺失集合内，不应写入
    expect(result.success).toBe(true);
    expect(result.addedCount).toBe(2);
  });

  it('本地存量是「手」→ 自动归一万手后再写缺失bar（新旧单位一致）', async () => {
    // 本地近 15 根（24、25、26 与在线重叠）是「手」口径：100万手 = 1,000,000 手
    mockDb = createMockDb(
      { '600519': '2026-07-24' },
      { '600519': mockKlines('600519', ['2026-07-24', '2026-07-25', '2026-07-26'], 1000000) }
    );
    (fetchDailyKline as jest.Mock).mockResolvedValue({
      bars: mockKlines('600519', ['2026-07-25', '2026-07-26', '2026-07-27']), // 100 万手
      source: 'tencent',
    });

    const result = await filler.fillSingle('600519', mockDb);

    expect(result.success).toBe(true);
    expect(result.addedCount).toBe(3);
    const updateCalls = mockDb.runAsync.mock.calls.filter(
      (c: any[]) => /UPDATE kline_daily SET volume/i.test(String(c[0]))
    );
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0][1]).toEqual([10000, '600519']);
  });

  it('本地已是万手 → 不触发归一', async () => {
    mockDb = createMockDb(
      { '600519': '2026-07-24' },
      { '600519': mockKlines('600519', ['2026-07-25', '2026-07-26'], 100) }
    );
    (fetchDailyKline as jest.Mock).mockResolvedValue({
      bars: mockKlines('600519', ['2026-07-25', '2026-07-26', '2026-07-27']),
      source: 'tencent',
    });

    const result = await filler.fillSingle('600519', mockDb);

    expect(result.success).toBe(true);
    const updateCalls = mockDb.runAsync.mock.calls.filter(
      (c: any[]) => /UPDATE kline_daily SET volume/i.test(String(c[0]))
    );
    expect(updateCalls).toHaveLength(0);
  });

  // ==================== fillBatch ====================

  it('批量补齐多只', async () => {
    mockDb = createMockDb({ '600519': '2026-07-24', '000001': '2026-07-24' });
    (fetchDailyKline as jest.Mock).mockResolvedValue({
      bars: mockKlines('any', ['2026-07-25', '2026-07-26', '2026-07-27']),
      source: 'tencent',
    });

    const result = await filler.fillBatch(['600519', '000001'], mockDb);

    expect(result.total).toBe(2);
    expect(result.success).toBe(2);
    expect(result.failed).toBe(0);
    expect(result.results).toHaveLength(2);
  });

  it('并发补齐时拒绝新请求', async () => {
    mockDb = createMockDb({ '600519': '2026-07-24' });
    (fetchDailyKline as jest.Mock).mockImplementation(
      () =>
        new Promise((resolve) => {
          setTimeout(() => resolve({ bars: [], source: 'tencent' }), 100);
        })
    );

    // 启动第一个批次
    const promise1 = filler.fillBatch(['600519'], mockDb);
    // 立即启动第二个批次
    const promise2 = filler.fillBatch(['000001'], mockDb);

    const [result1, result2] = await Promise.all([promise1, promise2]);

    expect(result1.success).toBe(1);
    expect(result2.skipped).toBe(1);
    expect(result2.results[0].error).toBe('已有补齐任务进行中');
  });

  it('连续失败 3 次后熔断', async () => {
    mockDb = createMockDb({
      '600519': '2026-07-24',
      '000001': '2026-07-24',
      '300001': '2026-07-24',
      '688001': '2026-07-24',
    });
    (fetchDailyKline as jest.Mock).mockRejectedValue(new Error('网络错误'));

    const result = await filler.fillBatch(['600519', '000001', '300001', '688001'], mockDb);

    expect(result.total).toBe(4);
    expect(result.failed).toBe(3); // 前3只失败
    expect(result.skipped).toBe(1); // 第4只被熔断跳过
    expect(result.results[3].error).toBe('熔断：连续失败超过阈值');
  });

  it('批量补齐进度回调', async () => {
    mockDb = createMockDb({ '600519': '2026-07-24' });
    (fetchDailyKline as jest.Mock).mockResolvedValue({
      bars: mockKlines('any', ['2026-07-25']),
      source: 'tencent',
    });

    const progressList: any[] = [];
    await filler.fillBatch(['600519'], mockDb, (p) => progressList.push(p));

    expect(progressList.length).toBeGreaterThanOrEqual(2);
    expect(progressList[0].status).toBe('filling');
    expect(progressList[progressList.length - 1].status).toBe('done');
  });

  // ==================== getIsFilling ====================

  it('getIsFilling 状态正确', async () => {
    expect(filler.getIsFilling()).toBe(false);

    mockDb = createMockDb({ '600519': '2026-07-24' });
    (fetchDailyKline as jest.Mock).mockImplementation(
      () =>
        new Promise((resolve) => {
          setTimeout(() => resolve({ bars: [], source: 'tencent' }), 50);
        })
    );

    const promise = filler.fillBatch(['600519'], mockDb);
    expect(filler.getIsFilling()).toBe(true);

    await promise;
    expect(filler.getIsFilling()).toBe(false);
  });
});