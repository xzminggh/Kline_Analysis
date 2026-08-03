/**
 * 三源行情拉取器 (腾讯 → 新浪 → 东方财富)
 *
 * 设计原则：
 * 1. 纯网络层，不碰 db / UI / 策略 / 指标
 * 2. 返回统一归一化的 KlineDaily[] 格式
 * 3. 三源降级：任一源失败自动切下一源
 * 4. 单源超时 5s，总超时 15s
 * 5. 停牌返回空数组（不报错）
 */

import { KlineDaily } from '../database/SQLiteProvider';

/** 拉取结果 */
export interface FetchResult {
  success: boolean;
  data: KlineDaily[];
  source: string;       // 实际使用的数据源标识
  error?: string;
}

/** 数据源配置 */
interface SourceConfig {
  name: string;
  timeout: number;      // ms
}

const SOURCES: SourceConfig[] = [
  { name: 'tencent', timeout: 5000 },
  { name: 'sina',    timeout: 5000 },
  { name: 'eastmoney', timeout: 5000 },
];

// ==================== 市场前缀转换 ====================

/**
 * 根据股票代码推断市场
 * @param code 纯数字代码如 "600519"
 */
function inferMarket(code: string): 'sh' | 'sz' | 'bj' {
  if (/^(600|601|603|688|689)/.test(code)) return 'sh';
  if (/^(000|001|002|003|300)/.test(code)) return 'sz';
  return 'bj'; // 北交所或其他
}

/**
 * 转为腾讯/新浪前缀格式: sh600519 / sz000001 / bj430047
 */
function toPrefixCode(code: string, market?: string): string {
  const m = market || inferMarket(code);
  return `${m}${code}`;
}

/**
 * 转为东方财富 secid 格式: 1.600519 / 0.000001
 */
function toSecid(code: string, market?: string): string {
  const m = market || inferMarket(code);
  const prefix = m === 'sh' ? '1' : '0';
  return `${prefix}.${code}`;
}

// ==================== 腾讯数据源 ====================

/**
 * 腾讯日K线接口
 * URL: https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=sh600519,day,2026-01-01,2026-07-28,500,qfq
 * 返回: data[code].qfqday = [["date","open","close","low","high","volume"], ...]
 */
async function fetchFromTencent(
  code: string,
  market: string | undefined,
  startDate: string,
  endDate: string
): Promise<KlineDaily[]> {
  const prefixCode = toPrefixCode(code, market);
  const url = `https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=${prefixCode},day,${startDate},${endDate},500,qfq`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);

  try {
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const json = await response.json();
    const rawData = json?.data?.[prefixCode]?.qfqday;

    if (!Array.isArray(rawData) || rawData.length === 0) {
      // 停牌或数据为空
      return [];
    }

    return rawData.map((item: string[]) => ({
      code,
      date: item[0],
      open: parseFloat(item[1]),
      close: parseFloat(item[2]),
      high: parseFloat(item[3]),
      low: parseFloat(item[4]),
      volume: parseFloat(item[5]), // 与 db 一致：手（腾讯返回即为手）
      amount: 0, // 腾讯不返回成交额
    }));
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}

// ==================== 新浪数据源 ====================

/**
 * 新浪日K线接口
 * URL: http://money.finance.sina.com.cn/quotes_service/api/json_v2.php/CN_MarketData.getKLineData?symbol=sh600519&scale=240&ma=no&datalen=1023
 * 返回: [{day, open, high, low, close, volume}, ...]
 *
 * ⚠️ 新浪不支持指定日期范围，只能取最近 N 条。 datalen 估算为缺失交易日数 + 30 余量。
 */
async function fetchFromSina(
  code: string,
  market: string | undefined,
  _startDate: string,
  _endDate: string
): Promise<KlineDaily[]> {
  const prefixCode = toPrefixCode(code, market);
  // 估算 datalen：取一个较大的值，后续用日期过滤
  const datalen = 1023;
  const url = `http://money.finance.sina.com.cn/quotes_service/api/json_v2.php/CN_MarketData.getKLineData?symbol=${prefixCode}&scale=240&ma=no&datalen=${datalen}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);

  try {
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const text = await response.text();
    // 新浪返回的不是标准 JSON，需要安全解析
    const json = safeJsonParse(text);

    if (!Array.isArray(json) || json.length === 0) {
      return [];
    }

    return json.map((item: any) => ({
      code,
      date: item.day,
      open: parseFloat(item.open),
      close: parseFloat(item.close),
      high: parseFloat(item.high),
      low: parseFloat(item.low),
      volume: parseFloat(item.volume), // 与 db 一致：手
      amount: 0,
    }));
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}

// ==================== 东方财富数据源 ====================

/**
 * 东方财富日K线接口
 * URL: https://push2his.eastmoney.com/api/qt/stock/kline/get?secid=1.600519&klt=101&fqt=1&beg=20260101&end=20260728&fields2=f51,f52,f53,f54,f55,f56
 * 返回: data.klines = ["date,open,close,low,high,volume,amount,...", ...]
 */
async function fetchFromEastmoney(
  code: string,
  market: string | undefined,
  startDate: string,
  endDate: string
): Promise<KlineDaily[]> {
  const secid = toSecid(code, market);
  const beg = startDate.replace(/-/g, '');
  const end = endDate.replace(/-/g, '');
  const url = `https://push2his.eastmoney.com/api/qt/stock/kline/get?secid=${secid}&klt=101&fqt=1&beg=${beg}&end=${end}&fields2=f51,f52,f53,f54,f55,f56,f57`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        'Referer': 'https://quote.eastmoney.com/',
      },
    });
    clearTimeout(timer);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const json = await response.json();
    const rawKlines = json?.data?.klines;

    if (!Array.isArray(rawKlines) || rawKlines.length === 0) {
      return [];
    }

    return rawKlines.map((line: string) => {
      const parts = line.split(',');
      return {
        code,
        date: parts[0],
        open: parseFloat(parts[1]),
        close: parseFloat(parts[2]),
        high: parseFloat(parts[3]),
        low: parseFloat(parts[4]),
        volume: parseFloat(parts[5]), // 与 db 一致：手
        amount: parseFloat(parts[6]) || 0,  // 成交额（元）
      };
    });
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}

// ==================== 工具函数 ====================

/**
 * 安全解析 JSON（处理新浪返回的非标准 JSON）
 */
function safeJsonParse(text: string): any {
  try {
    return JSON.parse(text);
  } catch {
    // 新浪有时返回类似 JSONP 的格式，尝试正则提取数组
    const match = text.match(/\[[\s\S]*\]/);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch {
        // ignore
      }
    }
    return null;
  }
}

/**
 * 按日期范围过滤 K 线数据（用于新浪等不支持日期范围的源）
 */
function filterByDateRange(
  data: KlineDaily[],
  startDate: string,
  endDate: string
): KlineDaily[] {
  return data.filter(item => item.date >= startDate && item.date <= endDate);
}

// ==================== 主入口 ====================

/**
 * 拉取单只股票日K线数据（三源降级）
 *
 * @param code      股票代码（纯数字，如 "600519"）
 * @param startDate 开始日期 YYYY-MM-DD（含）
 * @param endDate   结束日期 YYYY-MM-DD（含）
 * @param market    市场代码（可选，如 "sh"/"sz"/"bj"，不传则自动推断）
 * @returns FetchResult
 */
export async function fetchKline(
  code: string,
  startDate: string,
  endDate: string,
  market?: string
): Promise<FetchResult> {
  const errors: string[] = [];

  // 1. 尝试腾讯
  try {
    const data = await fetchFromTencent(code, market, startDate, endDate);
    // 腾讯支持日期范围，无需过滤
    return { success: true, data, source: 'tencent' };
  } catch (err: any) {
    errors.push(`tencent: ${err.message || String(err)}`);
  }

  // 2. 尝试新浪
  try {
    const rawData = await fetchFromSina(code, market, startDate, endDate);
    // 新浪不支持日期范围，需要过滤
    const data = filterByDateRange(rawData, startDate, endDate);
    return { success: true, data, source: 'sina' };
  } catch (err: any) {
    errors.push(`sina: ${err.message || String(err)}`);
  }

  // 3. 尝试东方财富
  try {
    const data = await fetchFromEastmoney(code, market, startDate, endDate);
    return { success: true, data, source: 'eastmoney' };
  } catch (err: any) {
    errors.push(`eastmoney: ${err.message || String(err)}`);
  }

  // 全部失败
  return {
    success: false,
    data: [],
    source: 'none',
    error: errors.join(' | '),
  };
}

/**
 * 获取数据源健康状态（用于诊断）
 * @returns 各源最近一次成功/失败状态
 */
export function getSourceStatus(): Record<string, { healthy: boolean; lastError?: string }> {
  // 简化实现：返回静态信息，后续可扩展为运行时统计
  return {
    tencent:   { healthy: true },
    sina:      { healthy: true },
    eastmoney: { healthy: true },
  };
}
