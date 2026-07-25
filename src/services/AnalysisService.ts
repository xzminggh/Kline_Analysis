import { KlineDaily, Stock } from '../database/SQLiteProvider';
import { analyzeStock, StockAnalysis, StrategyResult } from '../strategies/StrategyEngine';
import { PerformanceMonitor } from '../utils/PerformanceMonitor';

export interface AnalysisResult {
  stock: Stock;
  analysis: StockAnalysis;
  latestKline: KlineDaily | null;
}

export interface AnalysisSummary {
  totalStocks: number;
  analyzedStocks: number;
  buySignals: number;
  sellSignals: number;
  star5Count: number;
  star4Count: number;
  star3Count: number;
  star2Count: number;
  star1Count: number;
  performanceReport?: string;
}

let analysisCache: Map<string, AnalysisResult> = new Map();
let analysisSummary: AnalysisSummary | null = null;

// 分片配置：每批处理股票数，Hermes 下 setImmediate 无 4ms 钳制
const BATCH_SIZE = 5;

/**
 * 让出主线程，避免阻塞 UI
 * Hermes 下 setImmediate 无 4ms 钳制，优于 setTimeout(0)
 */
function yieldToMain(): Promise<void> {
  return new Promise(resolve => {
    if (typeof setImmediate !== 'undefined') {
      setImmediate(() => resolve());
    } else {
      setTimeout(() => resolve(), 0);
    }
  });
}

/**
 * 运行全量策略分析（分片调度 + 性能埋点）
 * @param onProgress 进度回调 (当前数, 总数)
 */
export async function runAnalysis(
  stocks: Stock[],
  getKlineByCode: (code: string) => Promise<KlineDaily[]>,
  onProgress?: (current: number, total: number) => void
): Promise<AnalysisResult[]> {
  analysisCache.clear();
  PerformanceMonitor.clear();

  const results: AnalysisResult[] = [];
  const total = stocks.length;

  PerformanceMonitor.start('total_analysis');

  // 分片处理：每批 BATCH_SIZE 只，批间让出主线程
  for (let i = 0; i < total; i += BATCH_SIZE) {
    const batch = stocks.slice(i, i + BATCH_SIZE);

    for (const stock of batch) {
      PerformanceMonitor.start('db_query');
      const klineData = await getKlineByCode(stock.code);
      PerformanceMonitor.end('db_query');

      if (klineData.length >= 100) {
        PerformanceMonitor.start('per_stock');
        PerformanceMonitor.start('indicator_calc');
        const analysis = analyzeStock(klineData, stock.code, stock.name);
        PerformanceMonitor.end('indicator_calc');

        const latestKline = klineData[klineData.length - 1];
        const result: AnalysisResult = { stock, analysis, latestKline };
        results.push(result);
        analysisCache.set(stock.code, result);
        PerformanceMonitor.end('per_stock');
      }

      // 进度回调
      if (onProgress) {
        onProgress(i + batch.indexOf(stock) + 1, total);
      }
    }

    // 批间让出主线程，保证 UI 响应
    await yieldToMain();
  }

  PerformanceMonitor.end('total_analysis');

  // 生成性能报告
  const perfReport = PerformanceMonitor.getReport();
  if (__DEV__) {
    console.log('=== 性能报告 ===\n' + perfReport);
  }

  updateSummary(results, perfReport);
  return results;
}

function updateSummary(results: AnalysisResult[], perfReport?: string) {
  const star5 = results.filter(r => r.analysis.starRating === 5).length;
  const star4 = results.filter(r => r.analysis.starRating === 4).length;
  const star3 = results.filter(r => r.analysis.starRating === 3).length;
  const star2 = results.filter(r => r.analysis.starRating === 2).length;
  const star1 = results.filter(r => r.analysis.starRating === 1).length;

  const buySignals = results.reduce((sum, r) => sum + r.analysis.buySignals, 0);
  const sellSignals = results.reduce((sum, r) => sum + r.analysis.sellSignals, 0);

  analysisSummary = {
    totalStocks: results.length,
    analyzedStocks: results.length,
    buySignals,
    sellSignals,
    star5Count: star5,
    star4Count: star4,
    star3Count: star3,
    star2Count: star2,
    star1Count: star1,
    performanceReport: perfReport,
  };
}

export function getAnalysisByCode(code: string): AnalysisResult | undefined {
  return analysisCache.get(code);
}

export function getAllAnalysis(): AnalysisResult[] {
  return Array.from(analysisCache.values());
}

export function getAnalysisSummary(): AnalysisSummary | null {
  return analysisSummary;
}

export function getFilteredResults(
  starRating?: number,
  signalType?: 'BUY' | 'SELL' | 'NEUTRAL',
  minScore?: number
): AnalysisResult[] {
  return getAllAnalysis().filter(result => {
    if (starRating !== undefined && result.analysis.starRating !== starRating) return false;
    if (minScore !== undefined && result.analysis.overallScore < minScore) return false;
    if (signalType) {
      const hasSignal = result.analysis.strategies.some(s => s.signal === signalType);
      if (!hasSignal) return false;
    }
    return true;
  });
}

export function generateCSV(results: AnalysisResult[]): string {
  const headers = [
    '代码', '名称', '星级', '总分', '买入信号', '卖出信号',
    '最新价', '涨跌幅', '成交量',
    ...Array.from({ length: 25 }, (_, i) => `策略${i + 1}_信号`),
    ...Array.from({ length: 25 }, (_, i) => `策略${i + 1}_得分`),
  ];

  const rows = results.map(result => {
    const strategies = result.analysis.strategies;
    const signalColumns = strategies.map(s => s.signal).concat(Array(25 - strategies.length).fill(''));
    const scoreColumns = strategies.map(s => s.score).concat(Array(25 - strategies.length).fill(''));

    const latestKline = result.latestKline;
    const change = latestKline ? ((latestKline.close - latestKline.open) / latestKline.open * 100).toFixed(2) : '';
    const volume = latestKline ? (latestKline.volume / 10000).toFixed(0) : '';
    const price = latestKline ? latestKline.close.toFixed(2) : '';

    return [
      result.stock.code,
      result.stock.name,
      result.analysis.starRating,
      result.analysis.overallScore,
      result.analysis.buySignals,
      result.analysis.sellSignals,
      price,
      change,
      volume,
      ...signalColumns,
      ...scoreColumns,
    ].join(',');
  });

  return [headers.join(','), ...rows].join('\n');
}

export function clearCache() {
  analysisCache.clear();
  analysisSummary = null;
}
