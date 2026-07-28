import { fetchKline, getSourceStatus, FetchResult } from './QuoteFetcher';

describe('QuoteFetcher', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = jest.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.clearAllMocks();
  });

  // ==================== Mock 数据构造器 ====================

  function mockTencentResponse(data: string[][]): Response {
    return {
      ok: true,
      status: 200,
      json: async () => ({
        code: 0,
        data: {
          'sh600519': { qfqday: data },
        },
      }),
    } as Response;
  }

  function mockSinaResponse(data: any[]): Response {
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify(data),
    } as Response;
  }

  function mockEastmoneyResponse(klines: string[]): Response {
    return {
      ok: true,
      status: 200,
      json: async () => ({
        rc: 0,
        data: { klines },
      }),
    } as Response;
  }

  function mockErrorResponse(status: number): Response {
    return {
      ok: false,
      status,
      json: async () => ({}),
      text: async () => '',
    } as Response;
  }

  // ==================== 腾讯源成功 ====================

  it('腾讯源成功时返回数据且不再尝试其他源', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(
      mockTencentResponse([
        ['2026-07-20', '1300.00', '1310.00', '1320.00', '1290.00', '10000'],
        ['2026-07-21', '1310.00', '1320.00', '1330.00', '1300.00', '12000'],
      ])
    );

    const result = await fetchKline('600519', '2026-07-20', '2026-07-21');

    expect(result.success).toBe(true);
    expect(result.source).toBe('tencent');
    expect(result.data).toHaveLength(2);
    expect(result.data[0]).toMatchObject({
      code: '600519',
      date: '2026-07-20',
      open: 1300.00,
      close: 1310.00,
      high: 1320.00,
      low: 1290.00,
      volume: 1000000, // 手 × 100
      amount: 0,
    });
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  // ==================== 降级逻辑 ====================

  it('腾讯失败 → 新浪成功', async () => {
    (global.fetch as jest.Mock)
      .mockRejectedValueOnce(new Error('Network error')) // 腾讯失败
      .mockResolvedValueOnce(
        mockSinaResponse([
          { day: '2026-07-20', open: '1300.00', high: '1320.00', low: '1290.00', close: '1310.00', volume: '10000' },
          { day: '2026-07-21', open: '1310.00', high: '1330.00', low: '1300.00', close: '1320.00', volume: '12000' },
        ])
      );

    const result = await fetchKline('600519', '2026-07-20', '2026-07-21');

    expect(result.success).toBe(true);
    expect(result.source).toBe('sina');
    expect(result.data).toHaveLength(2);
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it('腾讯+新浪失败 → 东财成功', async () => {
    (global.fetch as jest.Mock)
      .mockRejectedValueOnce(new Error('Network error')) // 腾讯
      .mockRejectedValueOnce(new Error('Timeout'))        // 新浪
      .mockResolvedValueOnce(
        mockEastmoneyResponse([
          '2026-07-20,1300.00,1310.00,1320.00,1290.00,10000,1300000000',
          '2026-07-21,1310.00,1320.00,1330.00,1300.00,12000,1584000000',
        ])
      );

    const result = await fetchKline('600519', '2026-07-20', '2026-07-21');

    expect(result.success).toBe(true);
    expect(result.source).toBe('eastmoney');
    expect(result.data).toHaveLength(2);
    expect(result.data[0].amount).toBe(1300000000); // 东财返回成交额
    expect(global.fetch).toHaveBeenCalledTimes(3);
  });

  it('三源全部失败时返回错误信息', async () => {
    (global.fetch as jest.Mock)
      .mockRejectedValueOnce(new Error('Tencent timeout'))
      .mockRejectedValueOnce(new Error('Sina timeout'))
      .mockRejectedValueOnce(new Error('Eastmoney timeout'));

    const result = await fetchKline('600519', '2026-07-20', '2026-07-21');

    expect(result.success).toBe(false);
    expect(result.source).toBe('none');
    expect(result.data).toHaveLength(0);
    expect(result.error).toContain('tencent');
    expect(result.error).toContain('sina');
    expect(result.error).toContain('eastmoney');
  });

  // ==================== 停牌处理 ====================

  it('腾讯返回空数组时应视为停牌，返回空数据', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(
      mockTencentResponse([])
    );

    const result = await fetchKline('600519', '2026-07-20', '2026-07-21');

    expect(result.success).toBe(true);
    expect(result.source).toBe('tencent');
    expect(result.data).toHaveLength(0);
  });

  // ==================== 市场前缀推断 ====================

  it('深市代码正确构造前缀', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(
      mockTencentResponse([['2026-07-21', '10.00', '10.50', '11.00', '9.80', '50000']])
    );

    await fetchKline('000001', '2026-07-21', '2026-07-21');

    const callUrl = (global.fetch as jest.Mock).mock.calls[0][0];
    expect(callUrl).toContain('sz000001');
  });

  it('北交所代码正确构造前缀', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(
      mockTencentResponse([['2026-07-21', '5.00', '5.20', '5.50', '4.90', '10000']])
    );

    await fetchKline('430047', '2026-07-21', '2026-07-21');

    const callUrl = (global.fetch as jest.Mock).mock.calls[0][0];
    expect(callUrl).toContain('bj430047');
  });

  it('显式传入 market 参数覆盖自动推断', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(
      mockTencentResponse([['2026-07-21', '100.00', '101.00', '102.00', '99.00', '20000']])
    );

    await fetchKline('600519', '2026-07-21', '2026-07-21', 'sz');

    const callUrl = (global.fetch as jest.Mock).mock.calls[0][0];
    expect(callUrl).toContain('sz600519');
  });

  // ==================== 新浪日期过滤 ====================

  it('新浪返回的数据应按日期范围过滤', async () => {
    (global.fetch as jest.Mock)
      .mockRejectedValueOnce(new Error('Tencent fail'))
      .mockResolvedValueOnce(
        mockSinaResponse([
          { day: '2026-07-15', open: '1280.00', high: '1290.00', low: '1270.00', close: '1285.00', volume: '8000' },
          { day: '2026-07-20', open: '1300.00', high: '1320.00', low: '1290.00', close: '1310.00', volume: '10000' },
          { day: '2026-07-21', open: '1310.00', high: '1330.00', low: '1300.00', close: '1320.00', volume: '12000' },
          { day: '2026-07-22', open: '1320.00', high: '1340.00', low: '1310.00', close: '1330.00', volume: '15000' },
        ])
      );

    const result = await fetchKline('600519', '2026-07-20', '2026-07-21');

    expect(result.success).toBe(true);
    expect(result.source).toBe('sina');
    expect(result.data).toHaveLength(2);
    expect(result.data[0].date).toBe('2026-07-20');
    expect(result.data[1].date).toBe('2026-07-21');
  });

  // ==================== HTTP 错误处理 ====================

  it('腾讯返回 HTTP 500 应降级到新浪', async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(mockErrorResponse(500))
      .mockResolvedValueOnce(
        mockSinaResponse([{ day: '2026-07-21', open: '100.00', high: '102.00', low: '99.00', close: '101.00', volume: '5000' }])
      );

    const result = await fetchKline('600519', '2026-07-21', '2026-07-21');

    expect(result.success).toBe(true);
    expect(result.source).toBe('sina');
  });

  // ==================== 东财日期格式 ====================

  it('东财 URL 应将日期格式化为 YYYYMMDD', async () => {
    (global.fetch as jest.Mock)
      .mockRejectedValueOnce(new Error('fail'))
      .mockRejectedValueOnce(new Error('fail'))
      .mockResolvedValueOnce(mockEastmoneyResponse([]));

    await fetchKline('600519', '2026-07-20', '2026-07-21');

    const eastmoneyUrl = (global.fetch as jest.Mock).mock.calls[2][0];
    expect(eastmoneyUrl).toContain('beg=20260720');
    expect(eastmoneyUrl).toContain('end=20260721');
  });

  // ==================== 状态查询 ====================

  it('getSourceStatus 返回三源状态', () => {
    const status = getSourceStatus();
    expect(status).toHaveProperty('tencent');
    expect(status).toHaveProperty('sina');
    expect(status).toHaveProperty('eastmoney');
    expect(status.tencent.healthy).toBe(true);
  });
});
