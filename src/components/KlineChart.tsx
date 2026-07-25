import React, { useMemo } from 'react';
import { View, StyleSheet, Dimensions } from 'react-native';
import Svg, { Line, Rect, Text as SvgText, G, Path } from 'react-native-svg';
import { KlineDaily } from '../database/SQLiteProvider';
import { calculateMA, calculateBOLL } from '../indicators/Indicators';

interface KlineChartProps {
  data: KlineDaily[];
  height?: number;
  showMA5?: boolean;
  showMA10?: boolean;
  showMA20?: boolean;
  showBOLL?: boolean;
  colorUp?: string;
  colorDown?: string;
}

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const DEFAULT_HEIGHT = 300;
const PADDING = { top: 20, right: 60, bottom: 30, left: 10 };

export default function KlineChart({
  data,
  height = DEFAULT_HEIGHT,
  showMA5 = true,
  showMA10 = true,
  showMA20 = true,
  showBOLL = false,
  colorUp = '#10b981',
  colorDown = '#ef4444',
}: KlineChartProps) {
  const chartWidth = SCREEN_WIDTH - 40;
  const chartHeight = height - PADDING.top - PADDING.bottom;

  const { priceMin, priceMax, ma5, ma10, ma20, boll, candleWidth, gap } = useMemo(() => {
    if (data.length === 0) {
      return { priceMin: 0, priceMax: 0, ma5: [], ma10: [], ma20: [], boll: null, candleWidth: 0, gap: 0 };
    }

    const closes = data.map(d => d.close);
    const highs = data.map(d => d.high);
    const lows = data.map(d => d.low);

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

    const totalCandles = data.length;
    const availableWidth = chartWidth - PADDING.left - PADDING.right;
    const candleWidth = Math.max(2, (availableWidth / totalCandles) * 0.7);
    const gap = Math.max(1, (availableWidth / totalCandles) * 0.3);

    return { priceMin, priceMax, ma5, ma10, ma20, boll, candleWidth, gap };
  }, [data, chartWidth, showMA5, showMA10, showMA20, showBOLL]);

  const priceToY = (price: number): number => {
    if (priceMax === priceMin) return PADDING.top + chartHeight / 2;
    const ratio = (priceMax - price) / (priceMax - priceMin);
    return PADDING.top + ratio * chartHeight;
  };

  const indexToX = (index: number): number => {
    return PADDING.left + index * (candleWidth + gap) + candleWidth / 2;
  };

  const renderCandles = () => {
    if (data.length === 0) return null;

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

      return (
        <G key={i}>
          <Line
            x1={x}
            y1={highY}
            x2={x}
            y2={lowY}
            stroke={color}
            strokeWidth={1}
          />
          <Rect
            x={x - candleWidth / 2}
            y={bodyTop}
            width={candleWidth}
            height={bodyHeight}
            fill={color}
          />
        </G>
      );
    });
  };

  const renderMALine = (data: number[], color: string) => {
    if (data.length === 0) return null;
    const points: string[] = [];
    for (let i = 0; i < data.length; i++) {
      if (data[i] > 0 && data[i] >= priceMin && data[i] <= priceMax) {
        const x = indexToX(i);
        const y = priceToY(data[i]);
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
    for (let i = 0; i <= lines; i++) {
      const ratio = i / lines;
      const y = PADDING.top + ratio * chartHeight;
      const price = priceMax - ratio * (priceMax - priceMin);
      gridElements.push(
        <Line
          key={`grid-${i}`}
          x1={PADDING.left}
          y1={y}
          x2={chartWidth - PADDING.right}
          y2={y}
          stroke="#1a1a2e"
          strokeWidth={1}
        />
      );
      gridElements.push(
        <SvgText
          key={`label-${i}`}
          x={chartWidth - PADDING.right + 5}
          y={y + 4}
          fontSize={10}
          fill="#6b7280"
        >
          {price.toFixed(2)}
        </SvgText>
      );
    }
    return gridElements;
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
        <Svg width={chartWidth} height={height}>
          {renderPriceGrid()}
          {showBOLL && renderBollinger()}
          {showMA5 && renderMALine(ma5, '#00d4ff')}
          {showMA10 && renderMALine(ma10, '#a78bfa')}
          {showMA20 && renderMALine(ma20, '#fbbf24')}
          {renderCandles()}
        </Svg>
      </View>
      <View style={styles.legend}>
        {showMA5 && (
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: '#00d4ff' }]} />
            <SvgText style={styles.legendText}>MA5</SvgText>
          </View>
        )}
        {showMA10 && (
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: '#a78bfa' }]} />
            <SvgText style={styles.legendText}>MA10</SvgText>
          </View>
        )}
        {showMA20 && (
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: '#fbbf24' }]} />
            <SvgText style={styles.legendText}>MA20</SvgText>
          </View>
        )}
        {showBOLL && (
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: '#fbbf24' }]} />
            <SvgText style={styles.legendText}>BOLL</SvgText>
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
});
