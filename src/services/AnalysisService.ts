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

export interface StrategyConfig {
  id: string;
  name: string;
  category: string;
  enabled: boolean;
}

export const STRATEGIES: StrategyConfig[] = [
  { id: 'T01', name: '双均线金叉/死叉', category: '趋势跟随', enabled: true },
  { id: 'T02', name: '60日均线多空分界', category: '趋势跟随', enabled: true },
  { id: 'T03', name: '顾比均线组穿越', category: '趋势跟随', enabled: true },
  { id: 'T04', name: '三线反向反转', category: '趋势跟随', enabled: true },
  { id: 'M01', name: '布林带触轨反弹', category: '均值回归', enabled: true },
  { id: 'M02', name: 'RSI超买超卖', category: '均值回归', enabled: true },
  { id: 'M03', name: '三重过滤', category: '均值回归', enabled: true },
  { id: 'M04', name: '缺口回补', category: '均值回归', enabled: true },
  { id: 'P01', name: 'MOM动量穿零轴', category: '动量突破', enabled: true },
  { id: 'P02', name: 'ROC+放量确认', category: '动量突破', enabled: true },
  { id: 'P03', name: '倍量突破前高/前低', category: '动量突破', enabled: true },
  { id: 'P04', name: '大阴线/大阳线反包', category: '动量突破', enabled: true },
  { id: 'S01', name: '双底/双顶颈线突破', category: '经典形态', enabled: true },
  { id: 'S02', name: '三角形整理末端突破', category: '经典形态', enabled: true },
  { id: 'S03', name: '头肩底/顶颈线突破', category: '经典形态', enabled: true },
  { id: 'S04', name: '锤子线/流星线确认', category: '经典形态', enabled: true },
  { id: 'K01', name: '均线支撑/压力回踩', category: '关键价位', enabled: true },
  { id: 'K02', name: '前高变支撑/前低变阻力', category: '关键价位', enabled: true },
  { id: 'K03', name: '斐波那契回撤共振', category: '关键价位', enabled: true },
  { id: 'V01', name: '布林带收口突破', category: '波动率收缩', enabled: true },
  { id: 'V02', name: 'ATR窄幅后方向选择', category: '波动率收缩', enabled: true },
  { id: 'Q01', name: '地量见底', category: '成交量极端', enabled: true },
  { id: 'Q02', name: '天量逃顶', category: '成交量极端', enabled: true },
  { id: 'D01', name: 'MACD底/顶背离', category: '多周期背离', enabled: true },
  { id: 'D02', name: 'RSI隐性背离', category: '多周期背离', enabled: true },
  { id: 'D03', name: 'CCI极端拐点', category: '多周期背离', enabled: true },
];

export const CATEGORIES = ['趋势跟随', '均值回归', '动量突破', '经典形态', '关键价位', '波动率收缩', '成交量极端', '多周期背离'];

let strategyState: StrategyConfig[] = [...STRATEGIES];
let analysisCache: Map<string, AnalysisResult> = new Map();
let analysisSummary: AnalysisSummary | null = null;

export function toggleStrategy(id: string): StrategyConfig[] {
  strategyState = strategyState.map(s => (s.id === id ? { ...s, enabled: !s.enabled } : s));
  return strategyState;
}

export function getStrategyState(): StrategyConfig[] {
  return strategyState;
}

export function getEnabledStrategyIds(): string[] {
  return strategyState.filter(s => s.enabled).map(s => s.id);
}

export function resetStrategies(): StrategyConfig[] {
  strategyState = STRATEGIES.map(s => ({ ...s, enabled: true }));
  return strategyState;
}

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
 * @param enabledStrategies 启用的策略ID列表，不传则全部启用
 */
export async function runAnalysis(
  stocks: Stock[],
  getKlineByCode: (code: string) => Promise<KlineDaily[]>,
  onProgress?: (current: number, total: number) => void,
  enabledStrategies?: string[]
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
        const analysis = analyzeStock(klineData, stock.code, stock.name, enabledStrategies);
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

export function clearCache() {
  analysisCache.clear();
  analysisSummary = null;
}
