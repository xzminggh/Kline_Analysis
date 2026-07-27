// 二级源：腾讯财经 gtimg（HTTPS，无 amount，需估算；复权 qfq/hfq）
import type { KlineSource, KlineQuery, FetchResult, KlineRow } from './types.ts';
import { toTencentSymbol, estimateAmount } from './symbol.ts';

const BASE = 'https://web.ifzq.gtimg.cn/appstuff/app/kfqkline/';

function fqtToParam(fqt?: number): string {
  if (fqt === 2) return 'hfq';
  if (fqt === 0) return ''; // 不复权
  return 'qfq'; // 默认前复权
}

export function buildTencentUrl(symbol: string, start: string, end: string, fqt?: number): string {
  const q = fqtToParam(fqt);
  const param = [symbol, 'day', start || '', end || '', '320', q].filter(Boolean).join(',');
  return `${BASE}?param=${encodeURIComponent(param)}`;
}

// 腾讯 qfqday: [date, open, close, high, low, volume]
function normalizeRow(row: unknown[], code: string): KlineRow | null {
  if (!row || row.length < 6) return null;
  const date = String(row[0]);
  const open = Number(row[1]);
  const close = Number(row[2]);
  const high = Number(row[3]);
  const low = Number(row[4]);
  const volume = Number(row[5]);
  if (!date || [open, close, high, low, volume].some((v) => !Number.isFinite(v))) return null;
  const amount = estimateAmount(volume, open, close);
  return { code, date, open, high, low, close, volume, amount };
}

export const tencentSource: KlineSource = {
  name: 'tencent',
  async fetchKline(q: KlineQuery, signal?: AbortSignal): Promise<FetchResult> {
    const symbol = toTencentSymbol(q.code, q.market);
    const url = buildTencentUrl(symbol, q.start || '', q.end || '', q.fqt);
    const resp = await fetch(url, {
      signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36' },
    });
    if (!resp.ok) throw new Error(`tencent_http_${resp.status}`);
    const json = await resp.json();
    const node = json && json.data && json.data[symbol];
    if (!node || !Array.isArray(node.qfqday)) return { code: q.code, data: [] };
    const data: KlineRow[] = [];
    for (const r of node.qfqday) {
      const item = normalizeRow(r as unknown[], q.code);
      if (item) data.push(item);
    }
    return { code: q.code, data };
  },
};
