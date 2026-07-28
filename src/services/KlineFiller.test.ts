/**
 * KlineFiller 单元测试
 */

import { KlineFiller, FillResult } from './KlineFiller';
import { FillCache } from './FillCache';
import { KlineDaily } from '../database/SQLiteProvider';

// 模拟 QuoteFetcher
jest.mock('./QuoteFetcher', () => ({
  fetchKline: jest.fn(),
}));

import { fetchKline } from './QuoteFetcher';

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

function createMockDb(rows: Record<string, any> = {}) {
  const dbRows: Record<string, any> = { ...rows };
  return {
    getFirstAsync: jest.fn(async (sql: string, params?: any[]) => {
      if (sql.includes('MAX(date)')) {
        const code = params?.[0];
        return { maxDate: dbRows[code] || null };
      }
      return null;
    }),
    runAsync: jest.fn(async () => ({ changes: 1 })),
    getAllAsync: jest.fn(async () => []),
  };
}

function mockKlines(code: string, dates: string[]): KlineDaily[] {
  return dates.map((date) => ({
    code,
    date,
    open: 100,
    high: 110,
    low: 90,
    close: 105,
    volume: 1000000,
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
        super(...(args.length ? args : ['2026-07-28T00:00:00']));
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

  it('拉取成功并写入数据', async () => {
    mockDb = createMockDb({ '600519': '2026-07-24' });
    (fetchKline as jest.Mock).mockResolvedValue({
      success: true,
      data: mockKlines('600519', ['2026-07-25', '2026-07-26', '2026-07-27']),
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
    (fetchKline as jest.Mock).mockResolvedValue({
      success: false,
      data: [],
      source: 'none',
      error: '网络错误',
    });

    const result = await filler.fillSingle('600519', mockDb);

    expect(result.success).toBe(false);
    expect(result.error).toBe('网络错误');
  });

  it('停牌返回空数据时不报错', async () => {
    mockDb = createMockDb({ '600519': '2026-07-24' });
    (fetchKline as jest.Mock).mockResolvedValue({
      success: true,
      data: [],
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
    (fetchKline as jest.Mock).mockResolvedValue({
      success: true,
      data: mockKlines('600519', ['2026-07-25']),
      source: 'tencent',
    });

    const result = await filler.fillSingle('600519', mockDb, true);

    expect(result.success).toBe(true);
    expect(result.addedCount).toBe(1);
  });

  it('数据库查询失败时继续执行（lastDate 为 null）', async () => {
    mockDb = createMockDb(); // 无数据
    (fetchKline as jest.Mock).mockResolvedValue({
      success: true,
      data: mockKlines('600519', ['2026-07-28']),
      source: 'tencent',
    });

    const result = await filler.fillSingle('600519', mockDb);

    expect(result.success).toBe(true);
    expect(result.addedCount).toBe(1);
  });

  // ==================== fillBatch ====================

  it('批量补齐多只', async () => {
    mockDb = createMockDb({ '600519': '2026-07-24', '000001': '2026-07-24' });
    (fetchKline as jest.Mock).mockResolvedValue({
      success: true,
      data: mockKlines('any', ['2026-07-25', '2026-07-26', '2026-07-27']),
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
    (fetchKline as jest.Mock).mockImplementation(
      () =>
        new Promise((resolve) => {
          setTimeout(() => resolve({ success: true, data: [], source: 'tencent' }), 100);
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
    (fetchKline as jest.Mock).mockResolvedValue({
      success: false,
      data: [],
      source: 'none',
      error: '网络错误',
    });

    const result = await filler.fillBatch(['600519', '000001', '300001', '688001'], mockDb);

    expect(result.total).toBe(4);
    expect(result.failed).toBe(3); // 前3只失败
    expect(result.skipped).toBe(1); // 第4只被熔断跳过
    expect(result.results[3].error).toBe('熔断：连续失败超过阈值');
  });

  it('批量补齐进度回调', async () => {
    mockDb = createMockDb({ '600519': '2026-07-24' });
    (fetchKline as jest.Mock).mockResolvedValue({
      success: true,
      data: mockKlines('any', ['2026-07-25']),
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
    (fetchKline as jest.Mock).mockImplementation(
      () =>
        new Promise((resolve) => {
          setTimeout(() => resolve({ success: true, data: [], source: 'tencent' }), 50);
        })
    );

    const promise = filler.fillBatch(['600519'], mockDb);
    expect(filler.getIsFilling()).toBe(true);

    await promise;
    expect(filler.getIsFilling()).toBe(false);
  });
});
