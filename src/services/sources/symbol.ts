// 股票代码 <-> 各厂商 symbol/secid 映射（App 裸码 + market -> 厂商标识）
export type Market = 'SH' | 'SZ' | 'BJ';

export function resolveMarket(code: string, market?: string): Market {
  let c = String(code == null ? '' : code).trim();
  let m = market ? String(market).trim().toUpperCase() : null;
  if (c.includes('.')) {
    const [base, suf] = c.split('.');
    c = base;
    if (!m) m = suf.toUpperCase();
  }
  c = c.padStart(6, '0');
  if (m === 'SH' || c.startsWith('6') || c.startsWith('9')) return 'SH';
  if (m === 'SZ' || c.startsWith('0') || c.startsWith('3') || c.startsWith('2')) return 'SZ';
  if (m === 'BJ' || c.startsWith('8') || c.startsWith('4')) return 'BJ';
  return c.startsWith('6') ? 'SH' : 'SZ';
}

// 东方财富 secid：上交所前缀 1，其余（深/北）前缀 0
export function toEastmoneySecid(code: string, market?: string): string {
  const m = resolveMarket(code, market);
  const prefix = m === 'SH' ? '1' : '0';
  return `${prefix}.${String(code).padStart(6, '0')}`;
}

// 腾讯 / 新浪 symbol：sh600000 / sz000001 / bj830799
export function toTencentSymbol(code: string, market?: string): string {
  const m = resolveMarket(code, market);
  const p = m === 'SH' ? 'sh' : m === 'SZ' ? 'sz' : 'bj';
  return `${p}${String(code).padStart(6, '0')}`;
}

export const toSinaSymbol = toTencentSymbol;

// 估算成交额(元)：1 手 = 100 股；amount ≈ 手数 × 100 × 均价
// 腾讯/新浪日K接口不返回 amount，用成交量估算，量级对齐东财(元)
export function estimateAmount(volumeInLots: number, open: number, close: number): number {
  if (!Number.isFinite(volumeInLots) || volumeInLots <= 0) return 0;
  return Math.round(volumeInLots * 100 * ((open + close) / 2));
}
