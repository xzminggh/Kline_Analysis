import { KlineDaily } from '../database/SQLiteProvider';
import {
  calculateMA,
  calculateEMA,
  calculateRSI,
  calculateMACD,
  calculateBollinger,
  calculateATR,
  calculateCCI,
  calculateMOM,
  calculateROC,
  calculateVolumeMA,
  calculateBollingerWidth,
  calculateGuppyMA,
  calculateSlope,
  calculateAmplitude,
  findLocalExtrema,
} from '../indicators/Indicators';

export type SignalType = 'BUY' | 'SELL' | 'NEUTRAL';

export interface StrategyResult {
  id: string;
  name: string;
  signal: SignalType;
  score: number;
  details: string;
}

export interface StockAnalysis {
  code: string;
  name: string;
  strategies: StrategyResult[];
  overallScore: number;
  starRating: number;
  buySignals: number;
  sellSignals: number;
}

export function analyzeStock(
  klineData: KlineDaily[],
  stockCode: string,
  stockName: string,
  enabledStrategies?: string[]
): StockAnalysis {
  if (klineData.length < 100) {
    return {
      code: stockCode,
      name: stockName,
      strategies: [],
      overallScore: 0,
      starRating: 0,
      buySignals: 0,
      sellSignals: 0,
    };
  }

  const isEnabled = (strategyId: string): boolean => {
    if (!enabledStrategies || enabledStrategies.length === 0) return true;
    return enabledStrategies.includes(strategyId);
  };

  const closes = klineData.map(k => k.close);
  const highs = klineData.map(k => k.high);
  const lows = klineData.map(k => k.low);
  const opens = klineData.map(k => k.open);
  const volumes = klineData.map(k => k.volume);

  const ema5 = calculateEMA(closes, 5);
  const ema20 = calculateEMA(closes, 20);
  const ma20 = calculateMA(closes, 20);
  const ma60 = calculateMA(closes, 60);
  const ma20Line = ma20; // [wb修改] 修复真bug：原第109行把 ma20 函数本身当数组传入K01，MA20支撑/压力分支从未生效
  const rsi14 = calculateRSI(closes, 14);
  const macd = calculateMACD(closes);
  const bollinger = calculateBollinger(closes, 20, 2);
  const atr14 = calculateATR(highs, lows, closes, 14);
  const cci20 = calculateCCI(highs, lows, closes, 20);
  const mom10 = calculateMOM(closes, 10);
  const roc10 = calculateROC(closes, 10);
  const volumeMa5 = calculateVolumeMA(volumes, 5);
  const volumeMa10 = calculateVolumeMA(volumes, 10);
  const volumeMa20 = calculateVolumeMA(volumes, 20);
  const volumeMa100 = calculateVolumeMA(volumes, 100);
  const bollingerUpper = bollinger.upper.map(v => v ?? 0);
  const bollingerLower = bollinger.lower.map(v => v ?? 0);
  const bollingerMiddle = bollinger.middle.map(v => v ?? 0);
  const bollingerWidth = calculateBollingerWidth(bollingerUpper, bollingerLower, bollingerMiddle);
  const guppyMa = calculateGuppyMA(closes);
  const ma60Values = ma60.map(v => v ?? 0);
  const ma60Slope = calculateSlope(ma60Values, 1);

  const n = closes.length - 1;
  const prevN = n - 1;
  const prev2N = n - 2;
  const prev3N = n - 3;

  const strategies: StrategyResult[] = [];

  if (isEnabled('T01')) strategies.push(t01DoubleMA(ema5, ema20, closes, n));
  if (isEnabled('T02')) strategies.push(t02Ma60Cross(closes, ma60, ma60Slope, n));
  if (isEnabled('T03')) strategies.push(t03GuppyCross(guppyMa, n));
  if (isEnabled('T04')) strategies.push(t04ThreeLineReversal(opens, closes, n));
  if (isEnabled('M01')) strategies.push(m01BollingerBounce(highs, lows, closes, bollinger, n));
  if (isEnabled('M02')) strategies.push(m02RsiOverboughtOversold(rsi14, opens, closes, n));
  if (isEnabled('M03')) strategies.push(m03TripleFilter(bollinger, rsi14, highs, lows, volumes, volumeMa5, n));
  if (isEnabled('M04')) strategies.push(m04GapFill(opens, closes, highs, lows, n));
  if (isEnabled('P01')) strategies.push(p01MomCrossZero(mom10, n));
  if (isEnabled('P02')) strategies.push(p02RocVolumeConfirm(roc10, volumes, volumeMa10, n));
  if (isEnabled('P03')) strategies.push(p03VolumeBreakout(closes, highs, lows, volumes, volumeMa10, n));
  if (isEnabled('P04')) strategies.push(p04EngulfingPattern(opens, closes, n));
  if (isEnabled('S01')) strategies.push(s01DoubleBottomTop(closes, highs, lows, n));
  if (isEnabled('S02')) strategies.push(s02TriangleBreakout(highs, lows, closes, n));
  if (isEnabled('S03')) strategies.push(s03HeadShoulder(closes, highs, lows, n));
  if (isEnabled('S04')) strategies.push(s04HammerShootingStar(highs, lows, opens, closes, n));
  if (isEnabled('K01')) strategies.push(k01MaSupportResistance(closes, ma20Line, n));
  if (isEnabled('K02')) strategies.push(k02PreviousHighLow(closes, opens, n));
  if (isEnabled('K03')) strategies.push(k03FibonacciRetracement(closes, opens, n));
  if (isEnabled('V01')) strategies.push(v01BollingerSqueeze(bollingerWidth, volumes, volumeMa5, closes, opens, bollinger, n));
  if (isEnabled('V02')) strategies.push(v02AtrBreakout(atr14, closes, n));
  if (isEnabled('Q01')) strategies.push(q01LowVolumeBottom(volumes, volumeMa20, lows, closes, n));
  if (isEnabled('Q02')) strategies.push(q02HighVolumeTop(volumes, volumeMa100, highs, opens, closes, n));
  if (isEnabled('D01')) strategies.push(d01MacdDivergence(closes, macd, opens, n));
  if (isEnabled('D02')) strategies.push(d02RsiDivergence(closes, rsi14, opens, n));
  if (isEnabled('D03')) strategies.push(d03CciExtreme(cci20, closes, ema5, n));

  const buySignals = strategies.filter(s => s.signal === 'BUY').length;
  const sellSignals = strategies.filter(s => s.signal === 'SELL').length;
  const totalScore = strategies.reduce((sum, s) => sum + s.score, 0);
  const overallScore = Math.min(100, Math.round(totalScore / strategies.length * 100));

  let starRating = 1;
  if (overallScore >= 80) starRating = 5;
  else if (overallScore >= 60) starRating = 4;
  else if (overallScore >= 40) starRating = 3;
  else if (overallScore >= 20) starRating = 2;

  return {
    code: stockCode,
    name: stockName,
    strategies,
    overallScore,
    starRating,
    buySignals,
    sellSignals,
  };
}

function t01DoubleMA(ema5: number[], ema20: number[], closes: number[], n: number): StrategyResult {
  const prevN = n - 1;
  if (ema5[n] === null || ema20[n] === null || ema5[prevN] === null || ema20[prevN] === null) {
    return { id: 'T01', name: '双均线金叉/死叉', signal: 'NEUTRAL', score: 0, details: '数据不足' };
  }
  const goldenCross = ema5[n] > ema20[n] && ema5[prevN] <= ema20[prevN] && closes[n] > ema5[n];
  const deathCross = ema5[n] < ema20[n] && ema5[prevN] >= ema20[prevN] && closes[n] < ema5[n];
  if (goldenCross) {
    return { id: 'T01', name: '双均线金叉/死叉', signal: 'BUY', score: 8, details: 'EMA5上穿EMA20金叉' };
  }
  if (deathCross) {
    return { id: 'T01', name: '双均线金叉/死叉', signal: 'SELL', score: -8, details: 'EMA5下穿EMA20死叉' };
  }
  return { id: 'T01', name: '双均线金叉/死叉', signal: 'NEUTRAL', score: 0, details: '无交叉信号' };
}

function t02Ma60Cross(closes: number[], ma60: (number | null)[], ma60Slope: (number | null)[], n: number): StrategyResult {
  const prevN = n - 1;
  if (ma60[n] === null || ma60[prevN] === null || ma60Slope[n] === null) {
    return { id: 'T02', name: '60日均线多空分界', signal: 'NEUTRAL', score: 0, details: '数据不足' };
  }
  const aboveMa60 = closes[n] > ma60[n] && ma60Slope[n] > 0;
  const belowMa60 = closes[n] < ma60[n] && ma60Slope[n] < 0;
  if (aboveMa60) {
    return { id: 'T02', name: '60日均线多空分界', signal: 'BUY', score: 10, details: '收盘价站上MA60且斜率向上' };
  }
  if (belowMa60) {
    return { id: 'T02', name: '60日均线多空分界', signal: 'SELL', score: -10, details: '收盘价跌破MA60且斜率向下' };
  }
  return { id: 'T02', name: '60日均线多空分界', signal: 'NEUTRAL', score: 0, details: '未突破MA60' };
}

function t03GuppyCross(guppyMa: { shortTerm: number[][], longTerm: number[][] }, n: number): StrategyResult {
  if (n < 1) {
    return { id: 'T03', name: '顾比均线组穿越', signal: 'NEUTRAL', score: 0, details: '数据不足' };
  }
  const prev = n - 1;
  const shortLatest = guppyMa.shortTerm.reduce((sum, arr) => sum + arr[n], 0) / guppyMa.shortTerm.length;
  const longLatest = guppyMa.longTerm.reduce((sum, arr) => sum + arr[n], 0) / guppyMa.longTerm.length;
  const shortPrev = guppyMa.shortTerm.reduce((sum, arr) => sum + arr[prev], 0) / guppyMa.shortTerm.length;
  const longPrev = guppyMa.longTerm.reduce((sum, arr) => sum + arr[prev], 0) / guppyMa.longTerm.length;

  if (shortLatest === null || longLatest === null || shortPrev === null || longPrev === null) {
    return { id: 'T03', name: '顾比均线组穿越', signal: 'NEUTRAL', score: 0, details: '数据不足' };
  }

  const crossUp = shortLatest > longLatest && shortPrev <= longPrev;
  const crossDown = shortLatest < longLatest && shortPrev >= longPrev;

  if (crossUp) return { id: 'T03', name: '顾比均线组穿越', signal: 'BUY', score: 8, details: '短期均线组上穿长期均线组' };
  if (crossDown) return { id: 'T03', name: '顾比均线组穿越', signal: 'SELL', score: -8, details: '短期均线组下穿长期均线组' };
  if (shortLatest > longLatest) return { id: 'T03', name: '顾比均线组穿越', signal: 'NEUTRAL', score: 2, details: '短期均线组在长期均线上方' };
  return { id: 'T03', name: '顾比均线组穿越', signal: 'NEUTRAL', score: -2, details: '短期均线组在长期均线下方' };
}

function t04ThreeLineReversal(opens: number[], closes: number[], n: number): StrategyResult {
  if (n < 3) {
    return { id: 'T04', name: '三线反向反转', signal: 'NEUTRAL', score: 0, details: '数据不足' };
  }
  const threeRed = closes[n - 1] < opens[n - 1] && closes[n - 2] < opens[n - 2] && closes[n - 3] < opens[n - 3];
  const threeGreen = closes[n - 1] > opens[n - 1] && closes[n - 2] > opens[n - 2] && closes[n - 3] > opens[n - 3];
  const todayGreen = closes[n] > opens[n];
  const todayRed = closes[n] < opens[n];
  const prevBody = Math.abs(closes[n - 1] - opens[n - 1]);
  const todayBody = Math.abs(closes[n] - opens[n]);
  if (threeRed && todayGreen && todayBody > prevBody * 0.5) {
    return { id: 'T04', name: '三线反向反转', signal: 'BUY', score: 6, details: '三连阴后收阳反转' };
  }
  if (threeGreen && todayRed && todayBody > prevBody * 0.5) {
    return { id: 'T04', name: '三线反向反转', signal: 'SELL', score: -6, details: '三连阳后收阴反转' };
  }
  return { id: 'T04', name: '三线反向反转', signal: 'NEUTRAL', score: 0, details: '无三连K线反转' };
}

function m01BollingerBounce(highs: number[], lows: number[], closes: number[], bollinger: { upper: (number | null)[], middle: (number | null)[], lower: (number | null)[] }, n: number): StrategyResult {
  if (bollinger.lower[n] === null || bollinger.upper[n] === null) {
    return { id: 'M01', name: '布林带触轨反弹', signal: 'NEUTRAL', score: 0, details: '数据不足' };
  }
  const touchLower = lows[n] <= bollinger.lower[n] && closes[n] > lows[n];
  const touchUpper = highs[n] >= bollinger.upper[n] && closes[n] < highs[n];
  if (touchLower) {
    return { id: 'M01', name: '布林带触轨反弹', signal: 'BUY', score: 7, details: '触及下轨后反弹' };
  }
  if (touchUpper) {
    return { id: 'M01', name: '布林带触轨反弹', signal: 'SELL', score: -7, details: '触及上轨后回落' };
  }
  return { id: 'M01', name: '布林带触轨反弹', signal: 'NEUTRAL', score: 0, details: '未触及布林带轨' };
}

function m02RsiOverboughtOversold(rsi14: (number | null)[], opens: number[], closes: number[], n: number): StrategyResult {
  if (rsi14[n] === null) {
    return { id: 'M02', name: 'RSI超买超卖', signal: 'NEUTRAL', score: 0, details: '数据不足' };
  }
  const oversold = rsi14[n] < 30 && closes[n] > opens[n];
  const overbought = rsi14[n] > 70 && closes[n] < opens[n];
  if (oversold) {
    return { id: 'M02', name: 'RSI超买超卖', signal: 'BUY', score: 6, details: 'RSI低于30且收阳' };
  }
  if (overbought) {
    return { id: 'M02', name: 'RSI超买超卖', signal: 'SELL', score: -6, details: 'RSI高于70且收阴' };
  }
  return { id: 'M02', name: 'RSI超买超卖', signal: 'NEUTRAL', score: 0, details: 'RSI在正常区间' };
}

function m03TripleFilter(bollinger: { upper: (number | null)[], middle: (number | null)[], lower: (number | null)[] }, rsi14: (number | null)[], highs: number[], lows: number[], volumes: number[], volumeMa5: (number | null)[], n: number): StrategyResult {
  if (bollinger.lower[n] === null || bollinger.upper[n] === null || rsi14[n] === null || volumeMa5[n] === null) {
    return { id: 'M03', name: '三重过滤', signal: 'NEUTRAL', score: 0, details: '数据不足' };
  }
  const buyCondition = lows[n] <= bollinger.lower[n] && rsi14[n] < 35 && volumes[n] < volumeMa5[n];
  const sellCondition = highs[n] >= bollinger.upper[n] && rsi14[n] > 65 && volumes[n] > volumeMa5[n];
  if (buyCondition) {
    return { id: 'M03', name: '三重过滤', signal: 'BUY', score: 9, details: '布林下轨+RSI<35+缩量' };
  }
  if (sellCondition) {
    return { id: 'M03', name: '三重过滤', signal: 'SELL', score: -9, details: '布林上轨+RSI>65+放量' };
  }
  return { id: 'M03', name: '三重过滤', signal: 'NEUTRAL', score: 0, details: '未满足三重条件' };
}

function m04GapFill(opens: number[], closes: number[], highs: number[], lows: number[], n: number): StrategyResult {
  const prevN = n - 1;
  if (n < 1) {
    return { id: 'M04', name: '缺口回补', signal: 'NEUTRAL', score: 0, details: '数据不足' };
  }
  const gapDown = opens[n] < closes[prevN] && highs[n] > closes[prevN];
  const gapUp = opens[n] > closes[prevN] && lows[n] < closes[prevN];
  if (gapDown) {
    return { id: 'M04', name: '缺口回补', signal: 'BUY', score: 5, details: '低开后回补缺口' };
  }
  if (gapUp) {
    return { id: 'M04', name: '缺口回补', signal: 'SELL', score: -5, details: '高开后回补缺口' };
  }
  return { id: 'M04', name: '缺口回补', signal: 'NEUTRAL', score: 0, details: '无缺口或未回补' };
}

function p01MomCrossZero(mom10: (number | null)[], n: number): StrategyResult {
  const prevN = n - 1;
  if (mom10[n] === null || mom10[prevN] === null) {
    return { id: 'P01', name: 'MOM动量穿零轴', signal: 'NEUTRAL', score: 0, details: '数据不足' };
  }
  const crossAbove = mom10[n] > 0 && mom10[prevN] < 0;
  const crossBelow = mom10[n] < 0 && mom10[prevN] > 0;
  if (crossAbove) {
    return { id: 'P01', name: 'MOM动量穿零轴', signal: 'BUY', score: 7, details: 'MOM上穿零轴' };
  }
  if (crossBelow) {
    return { id: 'P01', name: 'MOM动量穿零轴', signal: 'SELL', score: -7, details: 'MOM下穿零轴' };
  }
  return { id: 'P01', name: 'MOM动量穿零轴', signal: 'NEUTRAL', score: 0, details: 'MOM未穿越零轴' };
}

function p02RocVolumeConfirm(roc10: (number | null)[], volumes: number[], volumeMa10: (number | null)[], n: number): StrategyResult {
  const roc10Value = roc10[n];
  const volumeMa10Value = volumeMa10[n];
  if (roc10Value === null || volumeMa10Value === null) {
    return { id: 'P02', name: 'ROC+放量确认', signal: 'NEUTRAL', score: 0, details: '数据不足' };
  }
  const buyCondition = roc10Value > 5 && volumes[n] > volumeMa10Value * 1.5;
  const sellCondition = roc10Value < -5 && volumes[n] > volumeMa10Value * 1.5;
  if (buyCondition) {
    return { id: 'P02', name: 'ROC+放量确认', signal: 'BUY', score: 8, details: 'ROC>5且放量1.5倍' };
  }
  if (sellCondition) {
    return { id: 'P02', name: 'ROC+放量确认', signal: 'SELL', score: -8, details: 'ROC<-5且放量1.5倍' };
  }
  return { id: 'P02', name: 'ROC+放量确认', signal: 'NEUTRAL', score: 0, details: '未满足放量条件' };
}

function p03VolumeBreakout(closes: number[], highs: number[], lows: number[], volumes: number[], volumeMa10: (number | null)[], n: number): StrategyResult {
  const volumeMa10Value = volumeMa10[n];
  if (volumeMa10Value === null || n < 5) {
    return { id: 'P03', name: '倍量突破前高/前低', signal: 'NEUTRAL', score: 0, details: '数据不足' };
  }
  const prev5High = Math.max(...highs.slice(n - 5, n));
  const prev5Low = Math.min(...lows.slice(n - 5, n));
  const prev5AvgVolume = volumes.slice(n - 5, n).reduce((a, b) => a + b, 0) / 5;
  const breakoutHigh = closes[n] > prev5High && volumes[n] > prev5AvgVolume * 2;
  const breakoutLow = closes[n] < prev5Low && volumes[n] > prev5AvgVolume * 1.5;
  if (breakoutHigh) {
    return { id: 'P03', name: '倍量突破前高/前低', signal: 'BUY', score: 9, details: '突破前高且倍量' };
  }
  if (breakoutLow) {
    return { id: 'P03', name: '倍量突破前高/前低', signal: 'SELL', score: -9, details: '跌破前低且放量' };
  }
  return { id: 'P03', name: '倍量突破前高/前低', signal: 'NEUTRAL', score: 0, details: '未突破关键价位' };
}

function p04EngulfingPattern(opens: number[], closes: number[], n: number): StrategyResult {
  const prevN = n - 1;
  if (n < 1) {
    return { id: 'P04', name: '大阴线/大阳线反包', signal: 'NEUTRAL', score: 0, details: '数据不足' };
  }
  const bearishEngulfing = opens[n] > closes[prevN] && closes[n] < opens[prevN];
  const bullishEngulfing = opens[n] < closes[prevN] && closes[n] > opens[prevN];
  if (bullishEngulfing) {
    return { id: 'P04', name: '大阴线/大阳线反包', signal: 'BUY', score: 8, details: '阳线完全反包阴线' };
  }
  if (bearishEngulfing) {
    return { id: 'P04', name: '大阴线/大阳线反包', signal: 'SELL', score: -8, details: '阴线完全反包阳线' };
  }
  return { id: 'P04', name: '大阴线/大阳线反包', signal: 'NEUTRAL', score: 0, details: '无反包形态' };
}

function s01DoubleBottomTop(closes: number[], highs: number[], lows: number[], n: number): StrategyResult {
  if (n < 30) {
    return { id: 'S01', name: '双底/双顶颈线突破', signal: 'NEUTRAL', score: 0, details: '数据不足' };
  }
  const extrema = findLocalExtrema(lows, 5);
  const highExtrema = findLocalExtrema(highs, 5);

  const lowVals: { idx: number, val: number }[] = [];
  extrema.lows.forEach((v, i) => { if (v !== null) lowVals.push({ idx: i, val: v }); });

  if (lowVals.length >= 2) {
    const lastTwoLows = lowVals.slice(-2);
    const lowDiff = Math.abs(lastTwoLows[0].val - lastTwoLows[1].val) / lastTwoLows[0].val;
    if (lowDiff < 0.10) {
      const neckline = Math.max(...closes.slice(n - 15, n));
      if (closes[n] > neckline) {
        return { id: 'S01', name: '双底/双顶颈线突破', signal: 'BUY', score: 7, details: '双底突破颈线' + neckline.toFixed(2) };
      }
    }
  }

  const highVals: { idx: number, val: number }[] = [];
  highExtrema.highs.forEach((v, i) => { if (v !== null) highVals.push({ idx: i, val: v }); });

  if (highVals.length >= 2) {
    const lastTwoHighs = highVals.slice(-2);
    const highDiff = Math.abs(lastTwoHighs[0].val - lastTwoHighs[1].val) / lastTwoHighs[0].val;
    if (highDiff < 0.10) {
      const neckline = Math.min(...closes.slice(n - 15, n));
      if (closes[n] < neckline) {
        return { id: 'S01', name: '双底/双顶颈线突破', signal: 'SELL', score: -7, details: '双顶跌破颈线' + neckline.toFixed(2) };
      }
    }
  }

  return { id: 'S01', name: '双底/双顶颈线突破', signal: 'NEUTRAL', score: 0, details: '未形成有效双底/双顶' };
}

function s02TriangleBreakout(highs: number[], lows: number[], closes: number[], n: number): StrategyResult {
  if (n < 20) {
    return { id: 'S02', name: '三角形整理末端突破', signal: 'NEUTRAL', score: 0, details: '数据不足' };
  }
  const recentHighs = highs.slice(n - 20, n);
  const recentLows = lows.slice(n - 20, n);
  const upperTrend = recentHighs.slice(-5).every((h, i, arr) => i === 0 || h <= arr[i - 1]);
  const lowerTrend = recentLows.slice(-5).every((l, i, arr) => i === 0 || l >= arr[i - 1]);
  const amplitude = (Math.max(...recentHighs) - Math.min(...recentLows)) / Math.min(...recentLows);
  const breakoutUp = upperTrend && lowerTrend && amplitude < 0.05 && closes[n] > Math.max(...recentHighs.slice(-5));
  const breakoutDown = upperTrend && lowerTrend && amplitude < 0.05 && closes[n] < Math.min(...recentLows.slice(-5));
  if (breakoutUp) {
    return { id: 'S02', name: '三角形整理末端突破', signal: 'BUY', score: 7, details: '三角形向上突破' };
  }
  if (breakoutDown) {
    return { id: 'S02', name: '三角形整理末端突破', signal: 'SELL', score: -7, details: '三角形向下跌破' };
  }
  return { id: 'S02', name: '三角形整理末端突破', signal: 'NEUTRAL', score: 0, details: '未形成三角形突破' };
}

function s03HeadShoulder(closes: number[], highs: number[], lows: number[], n: number): StrategyResult {
  if (n < 40) {
    return { id: 'S03', name: '头肩底/顶颈线突破', signal: 'NEUTRAL', score: 0, details: '数据不足' };
  }
  const lowExtrema = findLocalExtrema(lows, 5);
  const highExtrema = findLocalExtrema(highs, 5);

  const lowVals: { idx: number, val: number }[] = [];
  lowExtrema.lows.forEach((v, i) => { if (v !== null) lowVals.push({ idx: i, val: v }); });

  if (lowVals.length >= 3) {
    const last3 = lowVals.slice(-3).map(l => l.val);
    const head = Math.min(...last3);
    const shoulders = last3.filter(v => v >= head * 1.01);
    if (shoulders.length === 2 && Math.abs(shoulders[0] - shoulders[1]) / head < 0.08) {
      const neckline = Math.max(...closes.slice(n - 20, n));
      if (closes[n] > neckline) {
        return { id: 'S03', name: '头肩底/顶颈线突破', signal: 'BUY', score: 7, details: '头肩底突破颈线' + neckline.toFixed(2) };
      }
      return { id: 'S03', name: '头肩底/顶颈线突破', signal: 'NEUTRAL', score: 3, details: '头肩底形成，颈线' + neckline.toFixed(2) + '，待突破' };
    }
  }

  const highVals: { idx: number, val: number }[] = [];
  highExtrema.highs.forEach((v, i) => { if (v !== null) highVals.push({ idx: i, val: v }); });

  if (highVals.length >= 3) {
    const last3 = highVals.slice(-3).map(h => h.val);
    const head = Math.max(...last3);
    const shoulders = last3.filter(v => v <= head * 0.99);
    if (shoulders.length === 2 && Math.abs(shoulders[0] - shoulders[1]) / head < 0.08) {
      const neckline = Math.min(...closes.slice(n - 20, n));
      if (closes[n] < neckline) {
        return { id: 'S03', name: '头肩底/顶颈线突破', signal: 'SELL', score: -7, details: '头肩顶跌破颈线' + neckline.toFixed(2) };
      }
      return { id: 'S03', name: '头肩底/顶颈线突破', signal: 'NEUTRAL', score: -3, details: '头肩顶形成，颈线' + neckline.toFixed(2) + '，待跌破' };
    }
  }

  return { id: 'S03', name: '头肩底/顶颈线突破', signal: 'NEUTRAL', score: 0, details: '未形成有效头肩形态' };
}

function s04HammerShootingStar(highs: number[], lows: number[], opens: number[], closes: number[], n: number): StrategyResult {
  const prevN = n - 1;
  if (n < 1) {
    return { id: 'S04', name: '锤子线/流星线确认', signal: 'NEUTRAL', score: 0, details: '数据不足' };
  }
  const body = Math.abs(closes[n] - opens[n]);
  const lowerShadow = Math.min(opens[n], closes[n]) - lows[n];
  const upperShadow = highs[n] - Math.max(opens[n], closes[n]);
  const isHammer = lowerShadow > body * 2 && upperShadow < body * 0.5;
  const isShootingStar = upperShadow > body * 2 && lowerShadow < body * 0.5;
  const prevTrendDown = closes.slice(n - 5, n).every((c, i, arr) => i === 0 || c <= arr[i - 1]);
  const prevTrendUp = closes.slice(n - 5, n).every((c, i, arr) => i === 0 || c >= arr[i - 1]);
  if (isHammer && prevTrendDown && opens[prevN] < closes[n]) {
    return { id: 'S04', name: '锤子线/流星线确认', signal: 'BUY', score: 7, details: '下跌末端锤子线' };
  }
  if (isShootingStar && prevTrendUp && opens[prevN] > closes[n]) {
    return { id: 'S04', name: '锤子线/流星线确认', signal: 'SELL', score: -7, details: '上涨末端流星线' };
  }
  return { id: 'S04', name: '锤子线/流星线确认', signal: 'NEUTRAL', score: 0, details: '无锤子线/流星线' };
}

function k01MaSupportResistance(closes: number[], ma20: (number | null)[], n: number): StrategyResult {
  if (n < 25) {
    return { id: 'K01', name: '均线支撑/压力回踩', signal: 'NEUTRAL', score: 0, details: '数据不足' };
  }
  const prev = n - 1;
  if (ma20[n] === null || ma20[prev] === null) {
    return { id: 'K01', name: '均线支撑/压力回踩', signal: 'NEUTRAL', score: 0, details: '数据不足' };
  }
  const dist = Math.abs(closes[n] - ma20[n]!) / ma20[n]! * 100;
  const wasAbove = closes[prev] > ma20[prev]!;
  const nowAbove = closes[n] > ma20[n]!;
  const touched = dist < 2;

  if (wasAbove && touched && nowAbove) {
    return { id: 'K01', name: '均线支撑/压力回踩', signal: 'BUY', score: 6, details: '回踩MA20获支撑（距离' + dist.toFixed(1) + '%）' };
  }
  if (!wasAbove && touched && !nowAbove) {
    return { id: 'K01', name: '均线支撑/压力回踩', signal: 'SELL', score: -6, details: '回踩MA20受阻（距离' + dist.toFixed(1) + '%）' };
  }
  if (closes[n] > ma20[n]!) {
    return { id: 'K01', name: '均线支撑/压力回踩', signal: 'NEUTRAL', score: 1, details: '价格在MA20上方（距离' + dist.toFixed(1) + '%）' };
  }
  return { id: 'K01', name: '均线支撑/压力回踩', signal: 'NEUTRAL', score: -1, details: '价格在MA20下方（距离' + dist.toFixed(1) + '%）' };
}

function k02PreviousHighLow(closes: number[], opens: number[], n: number): StrategyResult {
  if (n < 10) {
    return { id: 'K02', name: '前高变支撑/前低变阻力', signal: 'NEUTRAL', score: 0, details: '数据不足' };
  }
  const prevHigh = Math.max(...closes.slice(n - 10, n));
  const prevLow = Math.min(...closes.slice(n - 10, n));
  const inRangeHigh = Math.abs(closes[n] - prevHigh) / prevHigh < 0.02;
  const inRangeLow = Math.abs(closes[n] - prevLow) / prevLow < 0.02;
  const volumeMa5 = calculateVolumeMA(closes.slice(n - 10, n).map(() => 1), 5);
  const isLowVolume = n >= 5 && closes[n] < closes.slice(n - 5, n).reduce((a, b) => a + b, 0) / 5;
  if (inRangeHigh && closes[n] > opens[n] && isLowVolume) {
    return { id: 'K02', name: '前高变支撑/前低变阻力', signal: 'BUY', score: 6, details: '回踩前高支撑' };
  }
  if (inRangeLow && closes[n] < opens[n] && isLowVolume) {
    return { id: 'K02', name: '前高变支撑/前低变阻力', signal: 'SELL', score: -6, details: '回抽前低阻力' };
  }
  return { id: 'K02', name: '前高变支撑/前低变阻力', signal: 'NEUTRAL', score: 0, details: '未触及前高/前低' };
}

function k03FibonacciRetracement(closes: number[], opens: number[], n: number): StrategyResult {
  if (n < 30) {
    return { id: 'K03', name: '斐波那契回撤共振', signal: 'NEUTRAL', score: 0, details: '数据不足' };
  }
  const recentHigh = Math.max(...closes.slice(n - 30, n));
  const recentLow = Math.min(...closes.slice(n - 30, n));
  const range = recentHigh - recentLow;
  const level50 = recentHigh - range * 0.5;
  const level618 = recentHigh - range * 0.618;
  const inRange50 = Math.abs(closes[n] - level50) / level50 < 0.01;
  const inRange618 = Math.abs(closes[n] - level618) / level618 < 0.01;
  const isGreen = closes[n] > opens[n];
  const isRed = closes[n] < opens[n];
  if ((inRange50 || inRange618) && isGreen) {
    return { id: 'K03', name: '斐波那契回撤共振', signal: 'BUY', score: 5, details: '斐波那契位收阳' };
  }
  if ((inRange50 || inRange618) && isRed) {
    return { id: 'K03', name: '斐波那契回撤共振', signal: 'SELL', score: -5, details: '斐波那契位收阴' };
  }
  return { id: 'K03', name: '斐波那契回撤共振', signal: 'NEUTRAL', score: 0, details: '未触及斐波那契位' };
}

function v01BollingerSqueeze(bollingerWidth: (number | null)[], volumes: number[], volumeMa5: (number | null)[], closes: number[], opens: number[], bollinger: { upper: (number | null)[], middle: (number | null)[], lower: (number | null)[] }, n: number): StrategyResult {
  const bollingerWidthValue = bollingerWidth[n];
  const volumeMa5Value = volumeMa5[n];
  const bollingerMiddleValue = bollinger.middle[n];
  if (n < 5 || bollingerWidthValue === null || volumeMa5Value === null || bollingerMiddleValue === null) {
    return { id: 'V01', name: '布林带收口突破', signal: 'NEUTRAL', score: 0, details: '数据不足' };
  }
  const avgWidth = bollingerWidth.slice(n - 5, n).reduce((a: number, b) => a + (b || 0), 0) / 5;
  const isSqueezed = bollingerWidthValue < avgWidth;
  const isVolumeUp = volumes[n] > volumeMa5Value * 1.2;
  const isBreakUp = closes[n] > bollingerMiddleValue && closes[n] > opens[n];
  const isBreakDown = closes[n] < bollingerMiddleValue && closes[n] < opens[n];
  if (isSqueezed && isVolumeUp && isBreakUp) {
    return { id: 'V01', name: '布林带收口突破', signal: 'BUY', score: 8, details: '布林收口后放量上破' };
  }
  if (isSqueezed && isVolumeUp && isBreakDown) {
    return { id: 'V01', name: '布林带收口突破', signal: 'SELL', score: -8, details: '布林收口后放量下破' };
  }
  return { id: 'V01', name: '布林带收口突破', signal: 'NEUTRAL', score: 0, details: '布林未收口或未突破' };
}

function v02AtrBreakout(atr14: (number | null)[], closes: number[], n: number): StrategyResult {
  const prevN = n - 1;
  if (n < 30 || atr14[n] === null) {
    return { id: 'V02', name: 'ATR窄幅后方向选择', signal: 'NEUTRAL', score: 0, details: '数据不足' };
  }
  const recentATR = atr14.slice(n - 20, n).filter((a): a is number => a !== null);
  if (recentATR.length < 10) {
    return { id: 'V02', name: 'ATR窄幅后方向选择', signal: 'NEUTRAL', score: 0, details: '数据不足' };
  }
  const avgATR = recentATR.reduce((a, b) => a + b, 0) / recentATR.length;
  const currentATR = atr14[n]!;
  const isNarrow = currentATR < avgATR * 0.75;
  const breakout = closes[n] - closes[prevN];

  if (isNarrow && breakout > currentATR * 0.3) {
    return { id: 'V02', name: 'ATR窄幅后方向选择', signal: 'BUY', score: 7, details: 'ATR窄幅后向上突破' };
  }
  if (isNarrow && breakout < -currentATR * 0.3) {
    return { id: 'V02', name: 'ATR窄幅后方向选择', signal: 'SELL', score: -7, details: 'ATR窄幅后向下突破' };
  }
  if (isNarrow) {
    return { id: 'V02', name: 'ATR窄幅后方向选择', signal: 'NEUTRAL', score: 0, details: 'ATR收窄，等待方向选择' };
  }
  return { id: 'V02', name: 'ATR窄幅后方向选择', signal: 'NEUTRAL', score: 0, details: 'ATR正常波动' };
}

function q01LowVolumeBottom(volumes: number[], volumeMa20: (number | null)[], lows: number[], closes: number[], n: number): StrategyResult {
  if (n < 20 || volumeMa20[n] === null) {
    return { id: 'Q01', name: '地量见底', signal: 'NEUTRAL', score: 0, details: '数据不足' };
  }
  const isLowVolume = volumes[n] < volumeMa20[n] / 3;
  const notNewLow = lows[n] > Math.min(...lows.slice(n - 5, n));
  const hasLowerShadow = closes[n] > lows[n];
  if (isLowVolume && notNewLow && hasLowerShadow) {
    return { id: 'Q01', name: '地量见底', signal: 'BUY', score: 6, details: '地量且未创新低' };
  }
  return { id: 'Q01', name: '地量见底', signal: 'NEUTRAL', score: 0, details: '未出现地量见底' };
}

function q02HighVolumeTop(volumes: number[], volumeMa100: (number | null)[], highs: number[], opens: number[], closes: number[], n: number): StrategyResult {
  const volumeMa100Value = volumeMa100[n];
  if (n < 100 || volumeMa100Value === null) {
    return { id: 'Q02', name: '天量逃顶', signal: 'NEUTRAL', score: 0, details: '数据不足' };
  }
  const isHighVolume = volumes[n] > volumeMa100Value * 2.5;
  const hasUpperShadow = highs[n] > closes[n] && (highs[n] - closes[n]) > Math.abs(closes[n] - opens[n]);
  const isRed = closes[n] < opens[n];
  if (isHighVolume && (hasUpperShadow || isRed)) {
    return { id: 'Q02', name: '天量逃顶', signal: 'SELL', score: -8, details: '天量且收长上影或阴线' };
  }
  return { id: 'Q02', name: '天量逃顶', signal: 'NEUTRAL', score: 0, details: '未出现天量逃顶' };
}

function d01MacdDivergence(closes: number[], macd: { macd: number[], signal: number[], histogram: number[] }, opens: number[], n: number): StrategyResult {
  const prevN = n - 1;
  if (n < 30 || macd.histogram[n] === null || macd.histogram[prevN] === null) {
    return { id: 'D01', name: 'MACD底/顶背离', signal: 'NEUTRAL', score: 0, details: '数据不足' };
  }
  const recentLowIdx = closes.slice(n - 30, n).reduce((minIdx, val, idx) => closes[n - 30 + idx] < closes[n - 30 + minIdx] ? idx : minIdx, 0) + n - 30;
  const recentHighIdx = closes.slice(n - 30, n).reduce((maxIdx, val, idx) => closes[n - 30 + idx] > closes[n - 30 + maxIdx] ? idx : maxIdx, 0) + n - 30;
  const isNewLow = closes[n] < closes[recentLowIdx];
  const isNewHigh = closes[n] > closes[recentHighIdx];
  const histImproving = macd.histogram[n] > macd.histogram[prevN] && macd.histogram[n] > 0;
  const histWorsening = macd.histogram[n] < macd.histogram[prevN] && macd.histogram[n] < 0;
  if (isNewLow && histImproving && closes[n] > opens[n]) {
    return { id: 'D01', name: 'MACD底/顶背离', signal: 'BUY', score: 9, details: 'MACD底背离' };
  }
  if (isNewHigh && histWorsening && closes[n] < opens[n]) {
    return { id: 'D01', name: 'MACD底/顶背离', signal: 'SELL', score: -9, details: 'MACD顶背离' };
  }
  return { id: 'D01', name: 'MACD底/顶背离', signal: 'NEUTRAL', score: 0, details: '无MACD背离' };
}

function d02RsiDivergence(closes: number[], rsi14: (number | null)[], opens: number[], n: number): StrategyResult {
  if (n < 30 || rsi14[n] === null) {
    return { id: 'D02', name: 'RSI隐性背离', signal: 'NEUTRAL', score: 0, details: '数据不足' };
  }
  const recentLowIdx = closes.slice(n - 30, n).reduce((minIdx, val, idx) => closes[n - 30 + idx] < closes[n - 30 + minIdx] ? idx : minIdx, 0) + n - 30;
  const recentHighIdx = closes.slice(n - 30, n).reduce((maxIdx, val, idx) => closes[n - 30 + idx] > closes[n - 30 + maxIdx] ? idx : maxIdx, 0) + n - 30;
  const isNewLow = closes[n] < closes[recentLowIdx];
  const isNewHigh = closes[n] > closes[recentHighIdx];
  const rsiHigher = rsi14[n] > (rsi14[recentLowIdx] || 0);
  const rsiLower = rsi14[n] < (rsi14[recentHighIdx] || 100);
  if (isNewLow && rsiHigher && closes[n] > opens[n]) {
    return { id: 'D02', name: 'RSI隐性背离', signal: 'BUY', score: 8, details: 'RSI底背离' };
  }
  if (isNewHigh && rsiLower && closes[n] < opens[n]) {
    return { id: 'D02', name: 'RSI隐性背离', signal: 'SELL', score: -8, details: 'RSI顶背离' };
  }
  return { id: 'D02', name: 'RSI隐性背离', signal: 'NEUTRAL', score: 0, details: '无RSI背离' };
}

function d03CciExtreme(cci20: (number | null)[], closes: number[], ema5: number[], n: number): StrategyResult {
  const prevN = n - 1;
  if (cci20[n] === null || cci20[prevN] === null || ema5[n] === null) {
    return { id: 'D03', name: 'CCI极端拐点', signal: 'NEUTRAL', score: 0, details: '数据不足' };
  }
  const crossAbove = cci20[n] > -100 && cci20[prevN] <= -100 && closes[n] > ema5[n];
  const crossBelow = cci20[n] < 100 && cci20[prevN] >= 100 && closes[n] < ema5[n];
  if (crossAbove) {
    return { id: 'D03', name: 'CCI极端拐点', signal: 'BUY', score: 6, details: 'CCI从-100以下上穿' };
  }
  if (crossBelow) {
    return { id: 'D03', name: 'CCI极端拐点', signal: 'SELL', score: -6, details: 'CCI从+100以上下穿' };
  }
  return { id: 'D03', name: 'CCI极端拐点', signal: 'NEUTRAL', score: 0, details: 'CCI未穿越极端区间' };
}
