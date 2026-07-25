import sys
import numpy as np

def calculate_ma(data, period):
    return np.convolve(data, np.ones(period)/period, mode='valid')

def calculate_ema(data, period):
    alpha = 2 / (period + 1)
    ema = np.zeros(len(data))
    ema[0] = data[0]
    for i in range(1, len(data)):
        ema[i] = alpha * data[i] + (1 - alpha) * ema[i-1]
    return ema

def calculate_rsi(data, period=14):
    deltas = np.diff(data)
    gains = np.where(deltas > 0, deltas, 0)
    losses = np.where(deltas < 0, -deltas, 0)
    avg_gain = np.convolve(gains, np.ones(period)/period, mode='valid')
    avg_loss = np.convolve(losses, np.ones(period)/period, mode='valid')
    rs = avg_gain / (avg_loss + 1e-10)
    rsi = 100 - (100 / (1 + rs))
    return np.concatenate([np.full(period, np.nan), rsi])

def calculate_macd(data, fast=12, slow=26, signal=9):
    ema_fast = calculate_ema(data, fast)
    ema_slow = calculate_ema(data, slow)
    macd = ema_fast - ema_slow
    signal_line = calculate_ema(macd, signal)
    histogram = macd - signal_line
    return macd, signal_line, histogram

def calculate_boll(data, period=20, std_dev=2):
    ma = calculate_ma(data, period)
    ma_full = np.concatenate([np.full(period-1, np.nan), ma])
    rolling_std = []
    for i in range(len(data)):
        if i >= period - 1:
            rolling_std.append(np.std(data[i-period+1:i+1]))
        else:
            rolling_std.append(np.nan)
    rolling_std = np.array(rolling_std)
    upper = ma_full + std_dev * rolling_std
    lower = ma_full - std_dev * rolling_std
    return upper, ma_full, lower

def calculate_atr(high, low, close, period=14):
    tr1 = np.diff(high)
    tr2 = np.diff(low)
    tr3 = np.diff(close)
    tr = np.maximum(np.maximum(np.abs(tr1), np.abs(tr2)), np.abs(tr3))
    atr = np.convolve(tr, np.ones(period)/period, mode='valid')
    return np.concatenate([np.full(period, np.nan), atr])

def calculate_cci(high, low, close, period=20):
    tp = (high + low + close) / 3
    sma = calculate_ma(tp, period)
    sma_full = np.concatenate([np.full(period-1, np.nan), sma])
    rolling_std = []
    for i in range(len(tp)):
        if i >= period - 1:
            rolling_std.append(np.std(tp[i-period+1:i+1]))
        else:
            rolling_std.append(np.nan)
    rolling_std = np.array(rolling_std)
    cci = (tp - sma_full) / (0.015 * rolling_std)
    return cci

def calculate_mom(data, period=10):
    return np.concatenate([np.full(period, np.nan), np.diff(data, period)])

def calculate_roc(data, period=10):
    roc = np.zeros(len(data))
    for i in range(period, len(data)):
        roc[i] = (data[i] - data[i-period]) / data[i-period] * 100
    roc[:period] = np.nan
    return roc

def main():
    if len(sys.argv) < 2:
        print("Usage: python3 indicator_oracle.py <command> [args]")
        sys.exit(0)
    
    command = sys.argv[1]
    
    if command == 'test':
        test_data = np.array([44.3389, 44.0902, 44.1773, 43.6114, 44.3333,
                             44.8338, 45.1056, 45.4278, 45.8483, 46.0853,
                             45.8959, 46.0060, 45.6111, 46.2828, 46.2828])
        
        rsi = calculate_rsi(test_data, 14)
        print(f"RSI(14) test: {rsi[-1]:.6f}")
        
        macd, signal, hist = calculate_macd(test_data)
        print(f"MACD test: {macd[-1]:.6f}, Signal: {signal[-1]:.6f}, Histogram: {hist[-1]:.6f}")
        
        upper, middle, lower = calculate_boll(test_data, 20)
        print(f"Bollinger test - Upper: {upper[-1] if not np.isnan(upper[-1]) else 'NaN'}")
        
        sys.exit(0)
    
    print(f"Oracle command: {command}")
    sys.exit(0)

if __name__ == '__main__':
    main()
