/**
 * [wb修改] KlineFetcher 单测 — 断言三源降级顺序、字段映射、单位归一
 * fixture 均来自 2026-07-28 沙箱对三家真实接口的实测响应（截断）
 */

import {
  SOURCE_PRIORITY,
  toMarketSymbol,
  buildTencentUrl,
  buildSinaUrl,
  buildEastmoneyUrl,
  parseTencent,
  parseSina,
  parseEastmoney,
  fetchDailyKline,
  AllSourcesFailedError,
  type FetchLike,
} from './KlineFetcher';

// ---------------------------------------------------------------------------
// 真实响应 fixture（2026-07-28 实测 sh600000 浦发银行）
// ---------------------------------------------------------------------------

const TENCENT_FIXTURE = {
  code: 0,
  msg: '',
  data: {
    sh600000: {
      qfqday: [
        ['2026-07-23', '8.920', '9.050', '9.060', '8.910', '501189.000'],
        ['2026-07-24', '9.080', '9.040', '9.120', '9.020', '506751.000'],
        ['2026-07-27', '9.000', '9.050', '9.130', '8.960', '557231.000'],
      ],
    },
  },
};

const SINA_FIXTURE = [
  { day: '2026-07-23', open: '8.920', high: '9.060', low: '8.910', close: '9.050', volume: '50118945' },
  { day: '2026-07-24', open: '9.080', high: '9.120', low: '9.020', close: '9.040', volume: '50675120' },
];

const EASTMONEY_FIXTURE = {
  rc: 0,
  data: {
    code: '600000',
    market: 1,
    klines: [
      '2026-07-23,8.92,9.05,9.06,8.91,501189,451566860.00,1.66,0.44,0.04,0.15',
      '2026-07-24,9.08,9.04,9.12,9.02,506751,458123456.00,1.10,-0.11,-0.01,0.15',
    ],
  },
};

function mockFetch(handler: (url: string) => { ok: boolean; status: number; body?: unknown }): FetchLike {
  return async (url: string) => {
    const r = handler(url);
    return {
      ok: r.ok,
      status: r.status,
      json: async () => {
        if (r.body === undefined) throw new Error('no body');
        return r.body;
      },
    };
  };
}

// ---------------------------------------------------------------------------
// 市场前缀与 URL 构造
// ---------------------------------------------------------------------------

describe('toMarketSymbol', () => {
  it('60/68 → sh，00/30 → sz，43/83/87/92 → bj', () => {
    expect(toMarketSymbol('600000')).toEqual({ prefix: 'sh', symbol: 'sh600000' });
    expect(toMarketSymbol('688981')).toEqual({ prefix: 'sh', symbol: 'sh688981' });
    expect(toMarketSymbol('000001')).toEqual({ prefix: 'sz', symbol: 'sz000001' });
    expect(toMarketSymbol('300750')).toEqual({ prefix: 'sz', symbol: 'sz300750' });
    expect(toMarketSymbol('832000')).toEqual({ prefix: 'bj', symbol: 'bj832000' });
  });
});

describe('URL 构造', () => {
  it('腾讯：qfq 前复权参数', () => {
    expect(buildTencentUrl('600000', 120)).toBe(
      'https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=sh600000,day,,,120,qfq'
    );
  });
  it('新浪：scale=240 日线 + datalen', () => {
    expect(buildSinaUrl('000001', 60)).toContain('symbol=sz000001');
    expect(buildSinaUrl('000001', 60)).toContain('scale=240');
    expect(buildSinaUrl('000001', 60)).toContain('datalen=60');
  });
  it('东财：sh→secid=1.x，sz→0.x，用 beg/end 而非 lmt（实测 lmt 不生效）', () => {
    const url = buildEastmoneyUrl('600000', 120, 'qfq', new Date('2026-07-28'));
    expect(url).toContain('secid=1.600000');
    expect(url).toContain('fqt=1'); // 前复权
    expect(url).toMatch(/beg=\d{8}/); // beg/end 模式（120天×2缓冲会跨年，只断言格式）
    expect(url).toContain('end=20500101');
    expect(url).not.toContain('lmt=');
    expect(buildEastmoneyUrl('000001', 120)).toContain('secid=0.000001');
  });

  it('腾讯 raw 模式：URL 末位无 qfq 参数', () => {
    const url = buildTencentUrl('600000', 30, 'raw');
    expect(url).not.toContain(',qfq');
    expect(url).not.toMatch(/,qfq$/);
    // 默认 qfq 模式应有 qfq
    expect(buildTencentUrl('600000', 30)).toContain(',qfq');
  });

  it('东财 raw 模式：fqt=0', () => {
    const url = buildEastmoneyUrl('600000', 120, 'raw');
    expect(url).toContain('fqt=0');
    // 默认 qfq 模式 fqt=1
    expect(buildEastmoneyUrl('600000', 120, 'qfq')).toContain('fqt=1');
  });
});

// ---------------------------------------------------------------------------
// 各源解析：字段映射与单位归一
// ---------------------------------------------------------------------------

describe('parseTencent', () => {
  it('字段序是 [date,open,close,high,low,volume]（open/close 在 high/low 前）', () => {
    const bars = parseTencent(TENCENT_FIXTURE, '600000');
    expect(bars).toHaveLength(3);
    expect(bars[0]).toEqual({
      code: '600000',
      date: '2026-07-23',
      open: 8.92,
      close: 9.05, // 第3位是 close 不是 high
      high: 9.06,
      low: 8.91,
      volume: 5012, // 腾讯原生「手」÷100 → 万股
      amount: 0,
    });
  });
  it('结构不符时抛 SourceFetchError', () => {
    expect(() => parseTencent({ code: -1 }, '600000')).toThrow('tencent');
    expect(() => parseTencent({ code: 0, data: {} }, '600000')).toThrow('tencent');
  });
});

describe('parseSina', () => {
  it('volume 从「股」归一为「万股」（÷10000）', () => {
    const bars = parseSina(SINA_FIXTURE, '600000');
    expect(bars).toHaveLength(2);
    expect(bars[0].volume).toBe(5012); // 50118945 股 ÷ 10000 = 5012 万股
    expect(bars[0].open).toBe(8.92);
    expect(bars[0].high).toBe(9.06);
    expect(bars[0].low).toBe(8.91);
    expect(bars[0].close).toBe(9.05);
  });
  it('非数组响应抛错', () => {
    expect(() => parseSina({ error: 1 }, '600000')).toThrow('sina');
  });
});

describe('parseEastmoney', () => {
  it('CSV 字段序 date,open,close,high,low,volume,amount，amount 单位元', () => {
    const bars = parseEastmoney(EASTMONEY_FIXTURE, '600000');
    expect(bars).toHaveLength(2);
    expect(bars[0]).toEqual({
      code: '600000',
      date: '2026-07-23',
      open: 8.92,
      close: 9.05,
      high: 9.06,
      low: 8.91,
      volume: 5012, // 东财原生「手」÷100 → 万股
      amount: 451566860, // 东财提供真实成交额
    });
  });
  it('rc!=0 或 data null 抛错（实测 lmt 参数会导致 rc=102 data:null）', () => {
    expect(() => parseEastmoney({ rc: 102, data: null }, '600000')).toThrow('eastmoney');
  });
});

// ---------------------------------------------------------------------------
// 三源降级顺序（核心断言）
// ---------------------------------------------------------------------------

describe('fetchDailyKline 三源降级', () => {
  it('优先级常量固定为 腾讯→新浪→东财', () => {
    expect(SOURCE_PRIORITY).toEqual(['tencent', 'sina', 'eastmoney']);
  });

  it('腾讯可用时用腾讯，不碰其他源', async () => {
    const called: string[] = [];
    const f = mockFetch((url) => {
      called.push(url);
      if (url.includes('gtimg')) return { ok: true, status: 200, body: TENCENT_FIXTURE };
      return { ok: false, status: 500 };
    });
    const r = await fetchDailyKline('600000', 120, f);
    expect(r.source).toBe('tencent');
    expect(r.bars).toHaveLength(3);
    expect(called).toHaveLength(1);
    expect(called[0]).toContain('gtimg');
  });

  it('腾讯挂 → 降级新浪', async () => {
    const called: string[] = [];
    const f = mockFetch((url) => {
      called.push(url);
      if (url.includes('gtimg')) return { ok: false, status: 500 };
      if (url.includes('sina')) return { ok: true, status: 200, body: SINA_FIXTURE };
      return { ok: false, status: 500 };
    });
    const r = await fetchDailyKline('600000', 120, f);
    expect(r.source).toBe('sina');
    expect(called[0]).toContain('gtimg'); // 先试了腾讯
    expect(called[1]).toContain('sina');
  });

  it('腾讯+新浪挂 → 降级东财', async () => {
    const f = mockFetch((url) => {
      if (url.includes('eastmoney')) return { ok: true, status: 200, body: EASTMONEY_FIXTURE };
      return { ok: false, status: 500 };
    });
    const r = await fetchDailyKline('600000', 120, f);
    expect(r.source).toBe('eastmoney');
    expect(r.bars[0].amount).toBe(451566860);
  });

  it('三源全挂 → AllSourcesFailedError，含三条源级错误', async () => {
    const f = mockFetch(() => ({ ok: false, status: 500 }));
    await expect(fetchDailyKline('600000', 120, f)).rejects.toThrow(AllSourcesFailedError);
    try {
      await fetchDailyKline('600000', 120, f);
    } catch (e) {
      const err = e as AllSourcesFailedError;
      expect(err.errors).toHaveLength(3);
      expect(err.errors.map((x) => x.source)).toEqual(['tencent', 'sina', 'eastmoney']);
    }
  });

  it('坏 payload（腾讯返回垃圾）也触发降级而非崩溃', async () => {
    const f = mockFetch((url) => {
      if (url.includes('gtimg')) return { ok: true, status: 200, body: { garbage: true } };
      if (url.includes('sina')) return { ok: true, status: 200, body: SINA_FIXTURE };
      return { ok: false, status: 500 };
    });
    const r = await fetchDailyKline('600000', 120, f);
    expect(r.source).toBe('sina');
  });

  it('返回的 bars 按日期升序且无重复', async () => {
    const dup = {
      ...TENCENT_FIXTURE,
      data: {
        sh600000: {
          qfqday: [
            ['2026-07-24', '9.080', '9.040', '9.120', '9.020', '506751'],
            ['2026-07-23', '8.920', '9.050', '9.060', '8.910', '501189'],
            ['2026-07-24', '9.080', '9.040', '9.120', '9.020', '506751'], // 重复
          ],
        },
      },
    };
    const f = mockFetch(() => ({ ok: true, status: 200, body: dup }));
    const r = await fetchDailyKline('600000', 120, f);
    expect(r.bars.map((b) => b.date)).toEqual(['2026-07-23', '2026-07-24']);
  });
});
