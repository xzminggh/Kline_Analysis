// 一级源：东方财富 push2his（HTTPS，含 amount，复权支持完整）
import type { KlineSource, KlineQuery, FetchResult, KlineRow } from './types.ts';
import { toEastmoneySecid } from './symbol.ts';

const BASE = 'https://push2his.eastmoney.com/api/qt/stock/kline/get';

export function buildEastMoneyUrl(secid: string, start: string, end: string, fqt: number): string {
  const params = new URLSearchParams({
    secid,
    fields1: 'f1',
    fields2: 'f51,f52,f53,f54,f55,f56,f57,f58', // 日期,开,收,高,低,量,额,振幅
    klt: '101', // 日K
    fqt: String(fqt),
    beg: start ? start.replace(/-/g, '') : '0',
    end: end ? end.replace(/-/g, '') : '0',
  });
  return `${BASE}?${params.toString()}`;
}

// 东财顺序：date, open, close, high, low, volume, amount, amplitude
function normalizeRow(row: string, code: string): KlineRow | null {
  const p = String(row).split(',');
  if (p.length < 7) return null;
  const date = p[0];
  const open = Number(p[1]);
  const close = Number(p[2]);
  const high = Number(p[3]);
  const low = Number(p[4]);
  const volume = Number(p[5]);
  const amount = Number(p[6]);
  if (!date || [open, close, high, low, volume, amount].some((v) => !Number.isFinite(v))) return null;
  return { code, date, open, high, low, close, volume, amount };
}

export const eastmoneySource: KlineSource = {
  name: 'eastmoney',
  async fetchKline(q: KlineQuery, signal?: AbortSignal): Promise<FetchResult> {
    const secid = toEastmoneySecid(q.code, q.market);
    const url = buildEastMoneyUrl(secid, q.start || '', q.end || '', q.fqt ?? 1);
    const resp = await fetch(url, {
      signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile',
        Referer: 'https://quote.eastmoney.com/',
      },
    });
    if (!resp.ok) throw new Error(`eastmoney_http_${resp.status}`);
    const json = await resp.json();
    if (!json || json.rc !== 0) throw new Error(`eastmoney_rc_${json ? json.rc : 'null'}`);
    const src = json.data;
    if (!src || !Array.isArray(src.klines)) return { code: q.code, data: [] };
    const data: KlineRow[] = [];
    for (const r of src.klines) {
      const item = normalizeRow(r, q.code);
      if (item) data.push(item);
    }
    return { code: q.code, data };
  },
};
