/**
 * StockImporter 单元测试
 */

import { importNewStock, normalizeStockCode, fetchStockName, STOCK_IMPORT_DAYS } from './StockImporter';
import { KlineDaily } from '../database/SQLiteProvider';
import { AllSourcesFailedError, SourceFetchError } from './KlineFetcher';

jest.mock('./KlineFetcher', () => {
  const actual = jest.requireActual('./KlineFetcher') as any;
  return { ...actual, fetchDailyKline: jest.fn() };
});

import { fetchDailyKline } from './KlineFetcher';

function bar(code: string, date: string, close = 100): KlineDaily {
  return {
    code,
    date,
    open: close,
    high: close * 1.01,
    low: close * 0.99,
    close,
    volume: 100.0, // 万手
    amount: close * 100000,
  };
}

function createMockDb(rows: Record<string, any> = {}) {
  const dbRows: Record<string, any> = { ...rows };
  return {
    getFirstAsync: jest.fn(async (sql: string, params?: any[]) => ({
      lastDate: dbRows[params?.[0]] || null,
    })),
    runAsync: jest.fn(async () => ({ changes: 1 })),
    getAllAsync: jest.fn(async () => []),
  };
}

const nameFetchImpl: any = async () => ({
  ok: true,
  status: 200,
  json: async () => ({ data: { f57: '600519', f58: '贵州茅台' } }),
});

describe('normalizeStockCode', () => {
  it('纯 6 位数字通过', () => {
    expect(normalizeStockCode('600519')).toBe('600519');
    expect(normalizeStockCode('000001')).toBe('000001');
  });

  it('带市场前缀通过', () => {
    expect(normalizeStockCode('sh600519')).toBe('600519');
    expect(normalizeStockCode('SZ000001')).toBe('000001');
    expect(normalizeStockCode('bj430047')).toBe('430047');
  });

  it('非法输入抛错', () => {
    expect(() => normalizeStockCode('')).toThrow();
    expect(() => normalizeStockCode('abc')).toThrow();
    expect(() => normalizeStockCode('12345')).toThrow();
    expect(() => normalizeStockCode('60051a')).toThrow();
  });
});

describe('fetchStockName', () => {
  it('成功解析 f58', async () => {
    expect(await fetchStockName('600519', nameFetchImpl as any)).toBe('贵州茅台');
  });

  it('响应异常时回退空串', async () => {
    const badImpl: any = async () => ({ ok: false, status: 500, json: async () => ({}) });
    expect(await fetchStockName('600519', badImpl)).toBe('');
  });

  it('请求抛错时回退空串', async () => {
    const throwImpl: any = async () => {
      throw new Error('boom');
    };
    expect(await fetchStockName('600519', throwImpl)).toBe('');
  });
});

describe('importNewStock', () => {
  const mockDb: any = createMockDb();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('拉取全量历史入库并写 stocks（含股票名）', async () => {
    const bars = [
      bar('600519', '2022-08-01'),
      bar('600519', '2022-08-02'),
      bar('600519', '2022-08-03'),
    ];
    (fetchDailyKline as jest.Mock).mockResolvedValue({ bars, source: 'sina' });

    const result = await importNewStock(mockDb, '600519', { fetchImpl: nameFetchImpl as any });

    expect(result.insertedBars).toBe(3);
    expect(result.name).toBe('贵州茅台');
    expect(result.market).toBe('sh');
    expect(result.source).toBe('sina');
    expect(result.earliestDate).toBe('2022-08-01');
    expect(fetchDailyKline).toHaveBeenCalledWith('600519', STOCK_IMPORT_DAYS, expect.anything(), 'raw');
    expect(mockDb.runAsync).toHaveBeenCalledWith(
      expect.stringContaining('INSERT OR REPLACE INTO stocks'),
      ['600519', '贵州茅台', 'sh', '', '']
    );
  });

  it('本地已有数据时拒绝导入', async () => {
    const dbWithData: any = createMockDb({ '600519': '2026-07-25' });

    await expect(importNewStock(dbWithData, '600519')).rejects.toThrow('本地已有');
    expect(fetchDailyKline).not.toHaveBeenCalled();
  });

  it('非法代码抛错且不请求', async () => {
    await expect(importNewStock(mockDb, '9999')).rejects.toThrow(/6 位/);
    expect(fetchDailyKline).not.toHaveBeenCalled();
  });

  it('三源全挂转友好错误', async () => {
    (fetchDailyKline as jest.Mock).mockRejectedValue(
      new AllSourcesFailedError('999999', [new SourceFetchError('tencent', 'timeout')])
    );

    await expect(importNewStock(mockDb, '999999')).rejects.toThrow(/联网拉取失败/);
  });

  it('返回空 bars 时报无数据', async () => {
    (fetchDailyKline as jest.Mock).mockResolvedValue({ bars: [], source: 'tencent' });

    await expect(importNewStock(mockDb, '600519')).rejects.toThrow(/未查询到/);
    expect(mockDb.runAsync).not.toHaveBeenCalled();
  });

  it('名称获取失败时用代码占位', async () => {
    const bars = [bar('600519', '2024-08-01')];
    (fetchDailyKline as jest.Mock).mockResolvedValue({ bars, source: 'tencent' });
    const failName: any = async () => {
      throw new Error('net error');
    };

    const result = await importNewStock(mockDb, '600519', { fetchImpl: failName });

    expect(result.name).toBe('');
    expect(mockDb.runAsync).toHaveBeenCalledWith(
      expect.stringContaining('INSERT OR REPLACE INTO stocks'),
      ['600519', '600519', 'sh', '', '']
    );
  });
});