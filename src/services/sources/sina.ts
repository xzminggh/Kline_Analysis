// 三级兜底源：新浪财经（HTTPS，无 amount 需估算；默认不复权，作兜底）
import type { KlineSource, KlineQuery, FetchResult, KlineRow } from './types.ts';
import { toSinaSymbol, estimateAmount } from './symbol.ts';

const BASE = 'https://money.finance.sina.com.cn/quotes_service/api/json_v2.php/CN_MarketData.getKLineData';

export function buildSinaUrl(symbol: string, datalen = 320): string {
  const params = new URLSearchParams({
    symbol,
    scale: '240', // 日K
    ma: 'no',
    datalen: String(datalen),
  });
  return `${BASE}?${params.toString()}`;
}

interface SinaRow {
  day: string;
  open: string;
  high: string;
  low: string;
  close: string;
  volume: string | number;
}

function normalizeRow(r: SinaRow, code: string): KlineRow | null {
  const date = r.day;
  const open = Number(r.open);
  const high = Number(r.high);
  const low = Number(r.low);
  const close = Number(r.close);
  const volume = Number(r.volume);
  if (!date || [open, high, low, close, volume].some((v) => !Number.isFinite(v))) return null;
  const amount = estimateAmount(volume, open, close);
  return { code, date, open, high, low, close, volume, amount };
}

export const sinaSource: KlineSource = {
  name: 'sina',
  async fetchKline(q: KlineQuery, signal?: AbortSignal): Promise<FetchResult> {
    const symbol = toSinaSymbol(q.code, q.market);
    const url = buildSinaUrl(symbol);
    // 新浪接口默认不复权（兜底源，复权口径以主源为准）
    const resp = await fetch(url, {
      signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36' },
    });
    if (!resp.ok) throw new Error(`sina_http_${resp.status}`);
    const rows: SinaRow[] = await resp.json();
    if (!Array.isArray(rows)) return { code: q.code, data: [] };
    const data: KlineRow[] = [];
    for (const r of rows) {
      const item = normalizeRow(r, q.code);
      if (item) data.push(item);
    }
    return { code: q.code, data };
  },
};
