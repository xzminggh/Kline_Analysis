import { KlineDaily, Stock } from '../database/SQLiteProvider';
import { analyzeStock, StockAnalysis, StrategyResult } from '../strategies/StrategyEngine';

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
}

let analysisCache: Map<string, AnalysisResult> = new Map();
let analysisSummary: AnalysisSummary | null = null;

export async function runAnalysis(
  stocks: Stock[],
  getKlineByCode: (code: string) => Promise<KlineDaily[]>
): Promise<AnalysisResult[]> {
  analysisCache.clear();
  const results: AnalysisResult[] = [];

  for (const stock of stocks) {
    const klineData = await getKlineByCode(stock.code);
    if (klineData.length >= 100) {
      const analysis = analyzeStock(klineData, stock.code, stock.name);
      const latestKline = klineData[klineData.length - 1];
      const result: AnalysisResult = { stock, analysis, latestKline };
      results.push(result);
      analysisCache.set(stock.code, result);
    }
  }

  updateSummary(results);
  return results;
}

function updateSummary(results: AnalysisResult[]) {
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
