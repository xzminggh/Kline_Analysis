export function calculateMA(data: number[], period: number): number[] {
  const result: number[] = [];
  for (let i = period - 1; i < data.length; i++) {
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) {
      sum += data[j];
    }
    result.push(sum / period);
  }
  return Array(period - 1).fill(null).concat(result);
}

export function calculateEMA(data: number[], period: number): number[] {
  const result: number[] = [];
  const alpha = 2 / (period + 1);
  let ema = data[0];
  result.push(ema);
  for (let i = 1; i < data.length; i++) {
    ema = alpha * data[i] + (1 - alpha) * ema;
    result.push(ema);
  }
  return result;
}

export function calculateRSI(data: number[], period: number = 14): number[] {
  const result: (number | null)[] = [];
  for (let i = 0; i < period; i++) {
    result.push(null);
  }
  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const change = data[i] - data[i - 1];
    if (change > 0) {
      avgGain += change;
    } else {
      avgLoss += Math.abs(change);
    }
  }
  avgGain /= period;
  avgLoss /= period;
  const rs = avgGain / (avgLoss + 1e-10);
  result.push(100 - (100 / (1 + rs)));
  for (let i = period + 1; i < data.length; i++) {
    const change = data[i] - data[i - 1];
    const gain = change > 0 ? change : 0;
    const loss = change < 0 ? Math.abs(change) : 0;
    avgGain = ((avgGain * (period - 1)) + gain) / period;
    avgLoss = ((avgLoss * (period - 1)) + loss) / period;
    const rsVal = avgGain / (avgLoss + 1e-10);
    result.push(100 - (100 / (1 + rsVal)));
  }
  return result as number[];
}

export function calculateMACD(data: number[], fast: number = 12, slow: number = 26, signal: number = 9): { macd: number[], signal: number[], histogram: number[] } {
  const emaFast = calculateEMA(data, fast);
  const emaSlow = calculateEMA(data, slow);
  const macd: number[] = [];
  for (let i = 0; i < data.length; i++) {
    macd.push(emaFast[i] - emaSlow[i]);
  }
  const signalLine = calculateEMA(macd, signal);
  const histogram: number[] = [];
  for (let i = 0; i < data.length; i++) {
    histogram.push(macd[i] - signalLine[i]);
  }
  return { macd, signal: signalLine, histogram };
}

export function calculateBollinger(data: number[], period: number = 20, stdDev: number = 2): { upper: number[], middle: number[], lower: number[] } {
  const middle = calculateMA(data, period);
  const upper: (number | null)[] = [];
  const lower: (number | null)[] = [];
  for (let i = 0; i < data.length; i++) {
    if (middle[i] === null) {
      upper.push(null);
      lower.push(null);
      continue;
    }
    const start = i - period + 1;
    let sum = 0;
    for (let j = start; j <= i; j++) {
      sum += Math.pow(data[j] - middle[i], 2);
    }
    const std = Math.sqrt(sum / period);
    upper.push(middle[i] + stdDev * std);
    lower.push(middle[i] - stdDev * std);
  }
  return { upper: upper as number[], middle, lower: lower as number[] };
}

export function calculateATR(high: number[], low: number[], close: number[], period: number = 14): number[] {
  const result: (number | null)[] = [];
  for (let i = 0; i < period; i++) {
    result.push(null);
  }
  let atrSum = 0;
  for (let i = 1; i <= period; i++) {
    const tr = Math.max(
      high[i] - low[i],
      Math.abs(high[i] - close[i - 1]),
      Math.abs(low[i] - close[i - 1])
    );
    atrSum += tr;
  }
  result.push(atrSum / period);
  for (let i = period + 1; i < high.length; i++) {
    const tr = Math.max(
      high[i] - low[i],
      Math.abs(high[i] - close[i - 1]),
      Math.abs(low[i] - close[i - 1])
    );
    const atr = ((result[result.length - 1]! * (period - 1)) + tr) / period;
    result.push(atr);
  }
  return result as number[];
}

export function calculateCCI(high: number[], low: number[], close: number[], period: number = 20): number[] {
  const result: (number | null)[] = [];
  for (let i = 0; i < period; i++) {
    result.push(null);
  }
  for (let i = period - 1; i < high.length; i++) {
    const start = i - period + 1;
    let tpSum = 0;
    for (let j = start; j <= i; j++) {
      tpSum += (high[j] + low[j] + close[j]) / 3;
    }
    const tpAvg = tpSum / period;
    let mdSum = 0;
    for (let j = start; j <= i; j++) {
      mdSum += Math.abs(((high[j] + low[j] + close[j]) / 3) - tpAvg);
    }
    const md = mdSum / period;
    const tp = (high[i] + low[i] + close[i]) / 3;
    result.push((tp - tpAvg) / (0.015 * md));
  }
  return result as number[];
}

export function calculateMOM(data: number[], period: number = 10): number[] {
  const result: (number | null)[] = [];
  for (let i = 0; i < period; i++) {
    result.push(null);
  }
  for (let i = period; i < data.length; i++) {
    result.push(data[i] - data[i - period]);
  }
  return result as number[];
}

export function calculateROC(data: number[], period: number = 10): number[] {
  const result: (number | null)[] = [];
  for (let i = 0; i < period; i++) {
    result.push(null);
  }
  for (let i = period; i < data.length; i++) {
    result.push((data[i] - data[i - period]) / data[i - period] * 100);
  }
  return result as number[];
}

export function calculateVolumeMA(volume: number[], period: number): number[] {
  return calculateMA(volume, period);
}

export function calculateFibonacciLevels(high: number, low: number): { level0: number, level236: number, level382: number, level50: number, level618: number, level786: number, level100: number } {
  const range = high - low;
  return {
    level0: high,
    level236: high - range * 0.236,
    level382: high - range * 0.382,
    level50: high - range * 0.5,
    level618: high - range * 0.618,
    level786: high - range * 0.786,
    level100: low,
  };
}

export function calculateBollingerWidth(upper: number[], lower: number[], middle: number[]): number[] {
  const width: (number | null)[] = [];
  for (let i = 0; i < upper.length; i++) {
    if (upper[i] === null || lower[i] === null || middle[i] === null || middle[i] === 0) {
      width.push(null);
    } else {
      width.push((upper[i] - lower[i]) / middle[i]);
    }
  }
  return width as number[];
}

export function calculateGuppyMA(data: number[]): { shortTerm: number[][], longTerm: number[][] } {
  const shortPeriods = [3, 5, 8, 10, 12];
  const longPeriods = [30, 35, 40, 45, 50];
  const shortTerm = shortPeriods.map(p => calculateEMA(data, p));
  const longTerm = longPeriods.map(p => calculateEMA(data, p));
  return { shortTerm, longTerm };
}

export function findLocalExtrema(data: number[], windowSize: number): { highs: number[], lows: number[] } {
  const highs: (number | null)[] = [];
  const lows: (number | null)[] = [];
  for (let i = 0; i < data.length; i++) {
    if (i < windowSize || i >= data.length - windowSize) {
      highs.push(null);
      lows.push(null);
      continue;
    }
    let isHigh = true;
    let isLow = true;
    for (let j = i - windowSize; j <= i + windowSize; j++) {
      if (data[j] > data[i]) isHigh = false;
      if (data[j] < data[i]) isLow = false;
    }
    highs.push(isHigh ? data[i] : null);
    lows.push(isLow ? data[i] : null);
  }
  return { highs: highs as number[], lows: lows as number[] };
}

export function calculateSlope(data: number[], period: number = 1): number[] {
  const result: (number | null)[] = [];
  for (let i = 0; i < period; i++) {
    result.push(null);
  }
  for (let i = period; i < data.length; i++) {
    if (data[i - period] === null || data[i] === null) {
      result.push(null);
    } else {
      result.push(data[i] - data[i - period]);
    }
  }
  return result as number[];
}

export function calculateAmplitude(high: number[], low: number[], period: number = 20): number[] {
  const result: (number | null)[] = [];
  for (let i = 0; i < period; i++) {
    result.push(null);
  }
  for (let i = period - 1; i < high.length; i++) {
    const start = i - period + 1;
    let maxHigh = high[start];
    let minLow = low[start];
    for (let j = start + 1; j <= i; j++) {
      if (high[j] > maxHigh) maxHigh = high[j];
      if (low[j] < minLow) minLow = low[j];
    }
    result.push((maxHigh - minLow) / minLow * 100);
  }
  return result as number[];
}
