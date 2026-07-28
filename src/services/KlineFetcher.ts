/**
 * [wb修改] KlineFetcher — 联网K线抓取模块（三源降级）
 *
 * 降级顺序（源自用户 stock-data-fetcher skill v2.0.0 规范）：
 *   ① 腾讯 web.ifzq.gtimg.cn（qfq 前复权）
 *   ② 新浪 money.finance.sina.com.cn
 *   ③ 东方财富 push2his.eastmoney.com（fqt=1 前复权）
 *
 * 铁律：
 *  - 前复权 qfq 基准，与本地 db 对齐
 *  - 单源请求超时 8s，失败即降级下一源
 *  - 三源全挂抛 AllSourcesFailedError，由调用方跳过该股并记错（不中断整批）
 *
 * S1 阶段：骨架 + 类型 + 源配置。S2 阶段填充抓取与解析实现。
 */

import type { KlineDaily } from '../database/SQLiteProvider';

/** 抓取来源标识（按降级优先级排序） */
export type KlineSource = 'tencent' | 'sina' | 'eastmoney';

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

/**
 * 抓取单只股票最近 N 天日K（前复权 qfq），按 SOURCE_PRIORITY 三源降级。
 *
 * S2 实现要点：
 *  - 腾讯: https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param={symbol},day,,,{N},qfq
 *  - 新浪: https://money.finance.sina.com.cn/quotes_service/api/json_v2.php/CN_MarketData.getKLineData?symbol={symbol}&scale=240&ma=no&datalen={N}
 *  - 东财: https://push2his.eastmoney.com/api/qt/stock/kline/get?secid={1|0}.{code}&klt=101&fqt=1&lmt={N}&fields1=f1,f2,f3&fields2=f51,f52,f53,f54,f55,f56,f57
 *
 * @throws AllSourcesFailedError 三源全部失败时
 */
export async function fetchDailyKline(
  code: string,
  days: number = DEFAULT_FETCH_DAYS
): Promise<FetchResult> {
  // S1 骨架：S2 阶段实现真实抓取与解析
  void code;
  void days;
  throw new AllSourcesFailedError(code, [
    new SourceFetchError('tencent', 'S1 骨架未实现，S2 填充'),
  ]);
}
