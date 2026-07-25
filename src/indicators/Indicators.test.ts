import { calculateMA, calculateEMA, calculateRSI, calculateMACD, calculateBollinger } from './Indicators';

const TEST_DATA = [44.3389, 44.0902, 44.1773, 43.6114, 44.3333, 44.8338, 45.1056, 45.4278, 45.8483, 46.0853, 45.8959, 46.0060, 45.6111, 46.2828, 46.2828];

describe('Indicators', () => {
  describe('calculateMA', () => {
    it('should calculate moving average correctly', () => {
      const ma = calculateMA(TEST_DATA, 5);
      expect(ma.length).toBe(TEST_DATA.length);
      expect(ma[4]).toBeCloseTo((44.3389 + 44.0902 + 44.1773 + 43.6114 + 44.3333) / 5, 4);
    });

    it('should return null for periods before the window', () => {
      const ma = calculateMA(TEST_DATA, 5);
      expect(ma[0]).toBeNull();
      expect(ma[1]).toBeNull();
      expect(ma[2]).toBeNull();
      expect(ma[3]).toBeNull();
      expect(ma[4]).not.toBeNull();
    });
  });

  describe('calculateEMA', () => {
    it('should calculate exponential moving average correctly', () => {
      const ema = calculateEMA(TEST_DATA, 5);
      expect(ema.length).toBe(TEST_DATA.length);
      expect(ema[0]).toBe(TEST_DATA[0]);
    });

    it('should produce values in reasonable range', () => {
      const ema = calculateEMA(TEST_DATA, 5);
      const min = Math.min(...TEST_DATA);
      const max = Math.max(...TEST_DATA);
      ema.forEach(value => {
        expect(value).toBeGreaterThanOrEqual(min);
        expect(value).toBeLessThanOrEqual(max);
      });
    });
  });

  describe('calculateRSI', () => {
    it('should calculate RSI correctly', () => {
      const rsi = calculateRSI(TEST_DATA, 14);
      expect(rsi.length).toBe(TEST_DATA.length);
      expect(rsi[14]).not.toBeNull();
    });

    it('should return values between 0 and 100', () => {
      const rsi = calculateRSI(TEST_DATA, 14);
      rsi.forEach(value => {
        if (value !== null) {
          expect(value).toBeGreaterThanOrEqual(0);
          expect(value).toBeLessThanOrEqual(100);
        }
      });
    });

    it('should return null for periods before the window', () => {
      const rsi = calculateRSI(TEST_DATA, 14);
      for (let i = 0; i < 14; i++) {
        expect(rsi[i]).toBeNull();
      }
      expect(rsi[14]).not.toBeNull();
    });
  });

  describe('calculateMACD', () => {
    it('should calculate MACD correctly', () => {
      const result = calculateMACD(TEST_DATA);
      expect(result.macd.length).toBe(TEST_DATA.length);
      expect(result.signal.length).toBe(TEST_DATA.length);
      expect(result.histogram.length).toBe(TEST_DATA.length);
    });

    it('should calculate histogram as macd minus signal', () => {
      const result = calculateMACD(TEST_DATA);
      for (let i = 0; i < TEST_DATA.length; i++) {
        expect(result.histogram[i]).toBeCloseTo(result.macd[i] - result.signal[i], 10);
      }
    });
  });

  describe('calculateBollinger', () => {
    it('should calculate Bollinger Bands correctly', () => {
      const result = calculateBollinger(TEST_DATA, 5);
      expect(result.upper.length).toBe(TEST_DATA.length);
      expect(result.middle.length).toBe(TEST_DATA.length);
      expect(result.lower.length).toBe(TEST_DATA.length);
    });

    it('should have upper >= middle >= lower', () => {
      const result = calculateBollinger(TEST_DATA, 5);
      for (let i = 0; i < TEST_DATA.length; i++) {
        if (result.upper[i] !== null && result.middle[i] !== null && result.lower[i] !== null) {
          expect(result.upper[i]).toBeGreaterThanOrEqual(result.middle[i]);
          expect(result.middle[i]).toBeGreaterThanOrEqual(result.lower[i]);
        }
      }
    });
  });
});
