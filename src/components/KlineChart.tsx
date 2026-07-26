import React, { useMemo, useState, useCallback } from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import Svg, { Line, Rect, Text as SvgText, G, Path } from 'react-native-svg';
import { KlineDaily } from '../database/SQLiteProvider';
import { calculateMA, calculateBollinger as calculateBOLL } from '../indicators/Indicators';

interface KlineChartProps {
  data: KlineDaily[];
  height?: number;
  showMA5?: boolean;
  showMA10?: boolean;
  showMA20?: boolean;
  showBOLL?: boolean;
  showVolume?: boolean;
  colorUp?: string;
  colorDown?: string;
}

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const DEFAULT_HEIGHT = 380;
const VOLUME_HEIGHT = 60;
const PADDING = { top: 20, right: 60, bottom: 10, left: 10 };

export default function KlineChart({
  data,
  height = DEFAULT_HEIGHT,
  showMA5 = true,
  showMA10 = true,
  showMA20 = true,
  showBOLL = false,
  showVolume = true,
  colorUp = '#10b981',
  colorDown = '#ef4444',
}: KlineChartProps) {
  const chartWidth = SCREEN_WIDTH - 40;
  const priceChartHeight = height - VOLUME_HEIGHT - PADDING.top - PADDING.bottom - 10;

  const [touchIndex, setTouchIndex] = useState<number | null>(null);

  const {
    priceMin,
    priceMax,
    volumeMax,
    ma5,
    ma10,
    ma20,
    boll,
    candleWidth,
    gap,
  } = useMemo(() => {
    if (data.length === 0) {
      return { priceMin: 0, priceMax: 0, volumeMax: 0, ma5: [], ma10: [], ma20: [], boll: null, candleWidth: 0, gap: 0 };
    }

    const closes = data.map(d => d.close);
    const highs = data.map(d => d.high);
    const lows = data.map(d => d.low);
    const volumes = data.map(d => d.volume);

    let allPrices = [...highs, ...lows];

    const ma5 = showMA5 ? calculateMA(closes, 5) : [];
    const ma10 = showMA10 ? calculateMA(closes, 10) : [];
    const ma20 = showMA20 ? calculateMA(closes, 20) : [];

    let boll: ReturnType<typeof calculateBOLL> | null = null;
    if (showBOLL) {
      boll = calculateBOLL(closes, 20, 2);
      allPrices = [...allPrices, ...boll.upper, ...boll.lower];
    }

    if (ma5.length > 0) allPrices = [...allPrices, ...ma5.filter(v => v > 0)];
    if (ma10.length > 0) allPrices = [...allPrices, ...ma10.filter(v => v > 0)];
    if (ma20.length > 0) allPrices = [...allPrices, ...ma20.filter(v => v > 0)];

    const priceMin = Math.min(...allPrices.filter(v => v > 0)) * 0.98;
    const priceMax = Math.max(...allPrices.filter(v => v > 0)) * 1.02;
    const volumeMax = Math.max(...volumes) * 1.1;

    const totalCandles = data.length;
    const availableWidth = chartWidth - PADDING.left - PADDING.right;
    const candleWidth = Math.max(2, (availableWidth / totalCandles) * 0.7);
    const gap = Math.max(1, (availableWidth / totalCandles) * 0.3);

    return { priceMin, priceMax, volumeMax, ma5, ma10, ma20, boll, candleWidth, gap };
  }, [data, chartWidth, showMA5, showMA10, showMA20, showBOLL]);

  const priceToY = useCallback((price: number): number => {
    if (priceMax === priceMin) return PADDING.top + priceChartHeight / 2;
    const ratio = (priceMax - price) / (priceMax - priceMin);
    return PADDING.top + ratio * priceChartHeight;
  }, [priceMax, priceMin, priceChartHeight]);

  const volumeToY = useCallback((volume: number): number => {
    const priceBottom = PADDING.top + priceChartHeight + 10;
    if (volumeMax === 0) return priceBottom + VOLUME_HEIGHT;
    const ratio = volume / volumeMax;
    return priceBottom + VOLUME_HEIGHT - ratio * VOLUME_HEIGHT;
  }, [volumeMax, priceChartHeight]);

  const indexToX = useCallback((index: number): number => {
    return PADDING.left + index * (candleWidth + gap) + candleWidth / 2;
  }, [candleWidth, gap]);

  const handleTouch = useCallback((event: any) => {
    if (data.length === 0) return;
    const { locationX } = event.nativeEvent;
    const x = locationX - PADDING.left;
    const idx = Math.floor(x / (candleWidth + gap));
    if (idx >= 0 && idx < data.length) {
      setTouchIndex(idx);
    }
  }, [data, candleWidth, gap]);

  const handleTouchEnd = useCallback(() => {
    setTouchIndex(null);
  }, []);

  const renderCandles = () => {
    if (data.length === 0) return null;
    const priceBottom = PADDING.top + priceChartHeight + 10;

    return data.map((d, i) => {
      const x = indexToX(i);
      const openY = priceToY(d.open);
      const closeY = priceToY(d.close);
      const highY = priceToY(d.high);
      const lowY = priceToY(d.low);
      const isUp = d.close >= d.open;
      const color = isUp ? colorUp : colorDown;
      const bodyTop = Math.min(openY, closeY);
      const bodyHeight = Math.max(1, Math.abs(closeY - openY));

      const volY = volumeToY(d.volume);
      const volHeight = priceBottom + VOLUME_HEIGHT - volY;

      return (
        <G key={i}>
          <Line x1={x} y1={highY} x2={x} y2={lowY} stroke={color} strokeWidth={1} />
          <Rect x={x - candleWidth / 2} y={bodyTop} width={candleWidth} height={bodyHeight} fill={color} />
          {showVolume && (
            <Rect
              x={x - candleWidth / 2}
              y={volY}
              width={candleWidth}
              height={Math.max(1, volHeight)}
              fill={color}
              opacity={0.6}
            />
          )}
        </G>
      );
    });
  };

  const renderMALine = (lineData: number[], color: string) => {
    if (lineData.length === 0) return null;
    const points: string[] = [];
    for (let i = 0; i < lineData.length; i++) {
      if (lineData[i] > 0 && lineData[i] >= priceMin && lineData[i] <= priceMax) {
        const x = indexToX(i);
        const y = priceToY(lineData[i]);
        if (points.length === 0) {
          points.push(`M${x},${y}`);
        } else {
          points.push(`L${x},${y}`);
        }
      }
    }
    if (points.length < 2) return null;
    return <Path d={points.join(' ')} stroke={color} strokeWidth={1.5} fill="none" />;
  };

  const renderBollinger = () => {
    if (!boll || boll.middle.length === 0) return null;
    const upperPoints: string[] = [];
    const middlePoints: string[] = [];
    const lowerPoints: string[] = [];

    for (let i = 0; i < boll.middle.length; i++) {
      if (boll.middle[i] > 0) {
        const x = indexToX(i);
        const upperY = priceToY(boll.upper[i]);
        const middleY = priceToY(boll.middle[i]);
        const lowerY = priceToY(boll.lower[i]);
        if (upperPoints.length === 0) {
          upperPoints.push(`M${x},${upperY}`);
          middlePoints.push(`M${x},${middleY}`);
          lowerPoints.push(`M${x},${lowerY}`);
        } else {
          upperPoints.push(`L${x},${upperY}`);
          middlePoints.push(`L${x},${middleY}`);
          lowerPoints.push(`L${x},${lowerY}`);
        }
      }
    }

    return (
      <G>
        <Path d={upperPoints.join(' ')} stroke="#fbbf24" strokeWidth={1} strokeDasharray="4,4" fill="none" />
        <Path d={middlePoints.join(' ')} stroke="#fbbf24" strokeWidth={1.5} fill="none" />
        <Path d={lowerPoints.join(' ')} stroke="#fbbf24" strokeWidth={1} strokeDasharray="4,4" fill="none" />
      </G>
    );
  };

  const renderPriceGrid = () => {
    const lines = 5;
    const gridElements = [];
    const priceBottom = PADDING.top + priceChartHeight + 10;
    for (let i = 0; i <= lines; i++) {
      const ratio = i / lines;
      const y = PADDING.top + ratio * priceChartHeight;
      const price = priceMax - ratio * (priceMax - priceMin);
      gridElements.push(
        <Line key={`grid-${i}`} x1={PADDING.left} y1={y} x2={chartWidth - PADDING.right} y2={y} stroke="#1a1a2e" strokeWidth={1} />
      );
      gridElements.push(
        <SvgText key={`label-${i}`} x={chartWidth - PADDING.right + 5} y={y + 4} fontSize={10} fill="#6b7280">
          {price.toFixed(2)}
        </SvgText>
      );
    }
    // 成交量分隔线
    gridElements.push(
      <Line key="vol-sep" x1={PADDING.left} y1={priceBottom} x2={chartWidth - PADDING.right} y2={priceBottom} stroke="#0f3460" strokeWidth={1} strokeDasharray="3,3" />
    );
    return gridElements;
  };

  const renderCrosshair = () => {
    if (touchIndex === null || data.length === 0) return null;
    const x = indexToX(touchIndex);
    const d = data[touchIndex];
    const priceBottom = PADDING.top + priceChartHeight + 10;

    return (
      <G>
        <Line x1={x} y1={PADDING.top} x2={x} y2={priceBottom + VOLUME_HEIGHT} stroke="#ffffff" strokeWidth={1} opacity={0.5} strokeDasharray="3,3" />
        <Line x1={PADDING.left} y1={priceToY(d.close)} x2={chartWidth - PADDING.right} y2={priceToY(d.close)} stroke="#ffffff" strokeWidth={1} opacity={0.5} strokeDasharray="3,3" />
        <Rect x={x - candleWidth / 2 - 2} y={PADDING.top} width={candleWidth + 4} height={priceChartHeight + 10 + VOLUME_HEIGHT} fill="rgba(255,255,255,0.05)" />
      </G>
    );
  };

  const renderDataPanel = () => {
    if (touchIndex === null || data.length === 0) return null;
    const d = data[touchIndex];
    const change = d.close - d.open;
    const changePct = (change / d.open * 100).toFixed(2);
    const isUp = d.close >= d.open;

    return (
      <View style={styles.dataPanel}>
        <View style={styles.dataRow}>
          <Text style={styles.dataLabel}>日期</Text>
          <Text style={styles.dataValue}>{d.date}</Text>
        </View>
        <View style={styles.dataRow}>
          <Text style={styles.dataLabel}>开</Text>
          <Text style={styles.dataValue}>{d.open.toFixed(2)}</Text>
          <Text style={styles.dataLabel}>高</Text>
          <Text style={[styles.dataValue, { color: colorUp }]}>{d.high.toFixed(2)}</Text>
        </View>
        <View style={styles.dataRow}>
          <Text style={styles.dataLabel}>低</Text>
          <Text style={[styles.dataValue, { color: colorDown }]}>{d.low.toFixed(2)}</Text>
          <Text style={styles.dataLabel}>收</Text>
          <Text style={[styles.dataValue, { color: isUp ? colorUp : colorDown, fontWeight: 'bold' }]}>{d.close.toFixed(2)}</Text>
        </View>
        <View style={styles.dataRow}>
          <Text style={styles.dataLabel}>涨跌</Text>
          <Text style={[styles.dataValue, { color: isUp ? colorUp : colorDown }]}>
            {isUp ? '+' : ''}{change.toFixed(2)} ({isUp ? '+' : ''}{changePct}%)
          </Text>
        </View>
        <View style={styles.dataRow}>
          <Text style={styles.dataLabel}>成交量</Text>
          <Text style={styles.dataValue}>{(d.volume / 10000).toFixed(2)}万</Text>
        </View>
      </View>
    );
  };

  if (data.length === 0) {
    return (
      <View style={styles.container}>
        <View style={[styles.chartWrapper, { height }]}>
          <SvgText fill="#6b7280">暂无数据</SvgText>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={[styles.chartWrapper, { height }]}>
        <Svg
          width={chartWidth}
          height={height}
          onTouchStart={handleTouch}
          onTouchMove={handleTouch}
          onTouchEnd={handleTouchEnd}
        >
          {renderPriceGrid()}
          {showBOLL && renderBollinger()}
          {showMA5 && renderMALine(ma5, '#00d4ff')}
          {showMA10 && renderMALine(ma10, '#a78bfa')}
          {showMA20 && renderMALine(ma20, '#fbbf24')}
          {renderCandles()}
          {renderCrosshair()}
        </Svg>
        {touchIndex !== null && renderDataPanel()}
      </View>
      <View style={styles.legend}>
        {showMA5 && (
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: '#00d4ff' }]} />
            <Text style={styles.legendText}>MA5</Text>
          </View>
        )}
        {showMA10 && (
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: '#a78bfa' }]} />
            <Text style={styles.legendText}>MA10</Text>
          </View>
        )}
        {showMA20 && (
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: '#fbbf24' }]} />
            <Text style={styles.legendText}>MA20</Text>
          </View>
        )}
        {showBOLL && (
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: '#fbbf24' }]} />
            <Text style={styles.legendText}>BOLL</Text>
          </View>
        )}
        {showVolume && (
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: '#6b7280' }]} />
            <Text style={styles.legendText}>成交量</Text>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#0a0a0f',
    borderRadius: 12,
    overflow: 'hidden',
  },
  chartWrapper: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#16213e',
  },
  legend: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#16213e',
    borderTopWidth: 1,
    borderTopColor: '#0f3460',
    flexWrap: 'wrap',
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 16,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 4,
  },
  legendText: {
    fontSize: 10,
    color: '#6b7280',
  },
  dataPanel: {
    position: 'absolute',
    top: 8,
    left: 8,
    backgroundColor: 'rgba(10, 10, 15, 0.9)',
    borderRadius: 8,
    padding: 8,
    minWidth: 160,
    borderWidth: 1,
    borderColor: '#0f3460',
  },
  dataRow: {
    flexDirection: 'row',
    marginBottom: 4,
    gap: 8,
  },
  dataLabel: {
    fontSize: 10,
    color: '#6b7280',
    width: 40,
  },
  dataValue: {
    fontSize: 10,
    color: '#ffffff',
  },
});
