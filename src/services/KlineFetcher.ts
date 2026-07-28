/**
 * [wb修改] KlineFetcher — 联网K线抓取模块（三源降级）S2 实现
 *
 * 降级顺序（源自用户 stock-data-fetcher skill v2.0.0 规范）：
 *   ① 腾讯 web.ifzq.gtimg.cn（支持 qfq 前复权 / raw 不复权）
 *   ② 新浪 money.finance.sina.com.cn（不复权）
 *   ③ 东方财富 push2his.eastmoney.com（fqt=1 前复权 / fqt=0 不复权）
 *
 * 铁律：
 *  - 默认前复权 qfq 基准，与本地 db 对齐；可切换 raw 模式适配不复权 DB
 *  - 单源请求超时 8s，失败即降级下一源
 *  - 三源全挂抛 AllSourcesFailedError，由调用方跳过该股并记错（不中断整批）
 *
 * 归一化口径（2026-07-28 沙箱实测校准）：
 *  - volume 统一为「万股」：腾讯原生手 ÷100；新浪返回股 ÷10000；东财原生手 ÷100
 *  - amount 统一为「元」：仅东财提供（f57），腾讯/新浪无 → 置 0
 *    （本地 kline_daily.volume 单位为「万股」，本模块已按此统一，补齐写入即匹配）
 *  - 东财实测：lmt 参数不生效，必须用 beg/end（YYYYMMDD）
 *  - 字段序：腾讯 [date,open,close,high,low,volume]；东财 CSV date,open,close,high,low,volume,amount
 */

import type { KlineDaily } from '../database/SQLiteProvider';

/** 抓取来源标识（按降级优先级排序） */
export type KlineSource = 'tencent' | 'sina' | 'eastmoney';

/** 复权模式：qfq=前复权（默认），raw=不复权（原始收盘价） */
export type AdjustMode = 'qfq' | 'raw';

/** 三源降级顺序（不可变） */
export const SOURCE_PRIORITY: readonly KlineSource[] = ['tencent', 'sina', 'eastmoney'] as const;

/** 单源请求超时（毫秒） */
export const FETCH_TIMEOUT_MS = 8000;

/** 默认抓取最近 N 天日K */
export const DEFAULT_FETCH_DAYS = 120;

/** 抓取结果：K线数组 + 实际使用的来源 */
export interface FetchResult {
  bars: KlineDaily[];
  source: KlineSource;
}

/** 单源抓取错误（内部用，触发降级） */
export class SourceFetchError extends Error {
  constructor(
    public readonly source: KlineSource,
    message: string
  ) {
    super(`[${source}] ${message}`);
    this.name = 'SourceFetchError';
  }
}

/** 三源全挂错误（调用方据此跳过该股票并记错） */
export class AllSourcesFailedError extends Error {
  constructor(
    public readonly code: string,
    public readonly errors: SourceFetchError[]
  ) {
    super(`所有数据源均失败: ${code} (${errors.map((e) => e.message).join('; ')})`);
    this.name = 'AllSourcesFailedError';
  }
}

/**
 * 将 6 位股票代码转换为各源需要的带市场前缀格式
 * 60xxxx/68xxxx → sh；00xxxx/30xxxx → sz；43xxxx/83xxxx/87xxxx/92xxxx → bj
 */
export function toMarketSymbol(code: string): { prefix: 'sh' | 'sz' | 'bj'; symbol: string } {
  const c = code.trim();
  if (/^(60|68)/.test(c)) return { prefix: 'sh', symbol: `sh${c}` };
  if (/^(43|83|87|92)/.test(c)) return { prefix: 'bj', symbol: `bj${c}` };
  return { prefix: 'sz', symbol: `sz${c}` };
}

// ---------------------------------------------------------------------------
// URL 构造（导出便于单测断言）
// ---------------------------------------------------------------------------

export function buildTencentUrl(code: string, days: number, mode: AdjustMode = 'qfq'): string {
  const { symbol } = toMarketSymbol(code);
  // 腾讯：末位参数 qfq=前复权，省略或空=不复权(raw)
  const qfqParam = mode === 'qfq' ? 'qfq' : '';
  return `https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=${symbol},day,,,${days},${qfqParam}`;
}

export function buildSinaUrl(code: string, days: number): string {
  const { symbol } = toMarketSymbol(code);
  return `https://money.finance.sina.com.cn/quotes_service/api/json_v2.php/CN_MarketData.getKLineData?symbol=${symbol}&scale=240&ma=no&datalen=${days}`;
}

/** 东财 secid：sh→1.code，其余（sz/bj）→0.code；lmt 不生效须用 beg/end */
export function buildEastmoneyUrl(code: string, days: number, mode: AdjustMode = 'qfq', now: Date = new Date()): string {
  const { prefix } = toMarketSymbol(code);
  const secid = `${prefix === 'sh' ? 1 : 0}.${code.trim()}`;
  // 往前多取一倍日历日覆盖节假日，确保拿满 days 个交易日
  const begDate = new Date(now.getTime() - days * 2 * 86400000);
  const y = begDate.getFullYear();
  const m = String(begDate.getMonth() + 1).padStart(2, '0');
  const d = String(begDate.getDate()).padStart(2, '0');
  // fqt=1 前复权 / fqt=0 不复权
  const fqt = mode === 'qfq' ? '1' : '0';
  return (
    `https://push2his.eastmoney.com/api/qt/stock/kline/get?secid=${secid}` +
    `&klt=101&fqt=${fqt}&beg=${y}${m}${d}&end=20500101` +
    `&fields1=f1,f2,f3,f4,f5,f6&fields2=f51,f52,f53,f54,f55,f56,f57`
  );
}

// ---------------------------------------------------------------------------
// 各源解析（纯函数，导出便于单测）
// ---------------------------------------------------------------------------

function num(v: unknown): number {
  const n = typeof v === 'number' ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : 0;
}

/** 校验一根 bar 的基本合理性（解析前置 schema 校验，坏数据即弃） */
function isValidBar(b: KlineDaily): boolean {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(b.date) &&
    b.open > 0 &&
    b.high > 0 &&
    b.low > 0 &&
    b.close > 0 &&
    b.high >= b.low &&
    b.volume >= 0
  );
}

/**
 * 腾讯：data[symbol].qfqday（前复权）或 day（不复权），元素 [date, open, close, high, low, volume(手，归一化为万股), ...]
 * 注意字段序是 open,close,high,low —— 和常见 OHLC 不同！
 * @param mode qfq 时优先读 qfqday 字段，raw 时读 day 字段
 */
export function parseTencent(payload: unknown, code: string, mode: AdjustMode = 'qfq'): KlineDaily[] {
  const { symbol } = toMarketSymbol(code);
  const root = payload as { code?: number; data?: Record<string, { qfqday?: unknown[][]; day?: unknown[][] }> };
  if (!root || root.code !== 0 || !root.data || !root.data[symbol]) {
    throw new SourceFetchError('tencent', '响应结构不符');
  }
  // qfq 模式优先用 qfqday（前复权），回退到 day；raw 模式只用 day（不复权）
  let rows: unknown[][] | undefined;
  if (mode === 'qfq') {
    rows = root.data[symbol].qfqday ?? root.data[symbol].day;
  } else {
    rows = root.data[symbol].day;
  }
  if (!Array.isArray(rows)) throw new SourceFetchError('tencent', '无 qfqday/day 数组');
  const bars = rows
    .filter((r): r is unknown[] => Array.isArray(r) && r.length >= 6)
    .map((r) => ({
      code: code.trim(),
      date: String(r[0]),
      open: num(r[1]),
      close: num(r[2]),
      high: num(r[3]),
      low: num(r[4]),
      volume: Math.round(num(r[5]) / 100), // 腾讯原生「手」→ 万股（÷100）
      amount: 0, // 腾讯日K不含成交额
    }))
    .filter(isValidBar);
  if (bars.length === 0) throw new SourceFetchError('tencent', '解析后无有效bar');
  return bars;
}

/**
 * 新浪：数组 [{day, open, high, low, close, volume(股，归一化为万股)}]，volume ÷10000 → 万股
 */
export function parseSina(payload: unknown, code: string): KlineDaily[] {
  if (!Array.isArray(payload)) throw new SourceFetchError('sina', '响应非数组');
  const bars = (payload as Array<Record<string, unknown>>)
    .map((r) => ({
      code: code.trim(),
      date: String(r.day ?? ''),
      open: num(r.open),
      high: num(r.high),
      low: num(r.low),
      close: num(r.close),
      volume: Math.round(num(r.volume) / 10000), // 新浪「股」→「万股」（÷10000）
      amount: 0, // 新浪日K不含成交额
    }))
    .filter(isValidBar);
  if (bars.length === 0) throw new SourceFetchError('sina', '解析后无有效bar');
  return bars;
}

/**
 * 东财：data.klines[] CSV "date,open,close,high,low,volume(手→万股),amount(元),..."
 */
export function parseEastmoney(payload: unknown, code: string): KlineDaily[] {
  const root = payload as { rc?: number; data?: { klines?: unknown[] } };
  if (!root || root.rc !== 0 || !root.data || !Array.isArray(root.data.klines)) {
    throw new SourceFetchError('eastmoney', '响应结构不符');
  }
  const bars = root.data.klines
    .map((line) => {
      const p = String(line).split(',');
      return {
        code: code.trim(),
        date: p[0] ?? '',
        open: num(p[1]),
        close: num(p[2]),
        high: num(p[3]),
        low: num(p[4]),
        volume: Math.round(num(p[5]) / 100), // 东财原生「手」→ 万股（÷100）
        amount: Math.round(num(p[6])), // 东财「元」
      };
    })
    .filter(isValidBar);
  if (bars.length === 0) throw new SourceFetchError('eastmoney', '解析后无有效bar');
  return bars;
}

// ---------------------------------------------------------------------------
// 抓取主流程
// ---------------------------------------------------------------------------

/** 可注入 fetch（默认 RN 全局 fetch），便于单测 mock */
export type FetchLike = (url: string, init?: { signal?: AbortSignal; headers?: Record<string, string> }) => Promise<{
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}>;

async function fetchJsonWithTimeout(fetchImpl: FetchLike, url: string, source: KlineSource): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetchImpl(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json,text/plain,*/*' },
    });
    if (!res.ok) throw new SourceFetchError(source, `HTTP ${res.status}`);
    return await res.json();
  } catch (e) {
    if (e instanceof SourceFetchError) throw e;
    const msg = e instanceof Error ? (e.name === 'AbortError' ? `超时 ${FETCH_TIMEOUT_MS}ms` : e.message) : String(e);
    throw new SourceFetchError(source, msg);
  } finally {
    clearTimeout(timer);
  }
}

const SOURCE_IMPL: Record<
  KlineSource,
  {
    buildUrl: (code: string, days: number, mode: AdjustMode) => string;
    parse: (payload: unknown, code: string, mode: AdjustMode) => KlineDaily[];
  }
> = {
  tencent: { buildUrl: buildTencentUrl, parse: parseTencent },
  sina: { buildUrl: buildSinaUrl, parse: parseSina },       // 新浪无复权参数，mode 不影响
  eastmoney: { buildUrl: buildEastmoneyUrl, parse: parseEastmoney },
};

/**
 * 抓取单只股票最近 N 天日K，按 SOURCE_PRIORITY 三源降级。
 * 返回按日期升序、去重后的 bars。
 *
 * @param mode 复权模式：'qfq'=前复权（默认），'raw'=不复权
 * @throws AllSourcesFailedError 三源全部失败时
 */
export async function fetchDailyKline(
  code: string,
  days: number = DEFAULT_FETCH_DAYS,
  fetchImpl: FetchLike = fetch as unknown as FetchLike,
  mode: AdjustMode = 'qfq'
): Promise<FetchResult> {
  const errors: SourceFetchError[] = [];
  for (const source of SOURCE_PRIORITY) {
    const impl = SOURCE_IMPL[source];
    try {
      const payload = await fetchJsonWithTimeout(fetchImpl, impl.buildUrl(code, days, mode), source);
      const raw = impl.parse(payload, code, mode);
      // 去重 + 升序（防上游偶发重复/乱序）
      const seen = new Set<string>();
      const bars = raw
        .filter((b) => (seen.has(b.date) ? false : (seen.add(b.date), true)))
        .sort((a, b) => (a.date < b.date ? -1 : 1));
      return { bars, source };
    } catch (e) {
      errors.push(e instanceof SourceFetchError ? e : new SourceFetchError(source, String(e)));
    }
  }
  throw new AllSourcesFailedError(code, errors);
}
