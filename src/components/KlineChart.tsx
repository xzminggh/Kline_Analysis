import React, { useMemo, useState, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, Dimensions, PanResponder, TouchableOpacity, Alert } from 'react-native';
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
  defaultVisibleCount?: number;
  stockCode?: string;
  stockName?: string;
}

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const DEFAULT_HEIGHT = 400;
const VOLUME_HEIGHT = 60;
const TIME_LABEL_HEIGHT = 20;
const PADDING = { top: 20, right: 60, bottom: 10, left: 10 };
const MIN_VISIBLE = 20;
const MAX_VISIBLE = 500;

export default function KlineChart({
  data,
  height = DEFAULT_HEIGHT,
  showMA5 = true,
  showMA10 = true,
  showMA20 = true,
  showBOLL = false,
  showVolume = true,
  colorUp = '#ef4444',
  colorDown = '#10b981',
  defaultVisibleCount = 60,
  stockCode,
  stockName,
}: KlineChartProps) {
  const chartWidth = SCREEN_WIDTH - 40;
  const priceChartHeight = height - VOLUME_HEIGHT - TIME_LABEL_HEIGHT - PADDING.top - PADDING.bottom - 10;

  // 视图状态：控制可见K线范围（双指缩放/单指拖动）
  const [visibleCount, setVisibleCount] = useState(defaultVisibleCount);
  const [endIndex, setEndIndex] = useState(data.length); // 可见范围结束索引（不含）
  const [touchIndex, setTouchIndex] = useState<number | null>(null);

  // 手势辅助状态
  const lastTapTime = useRef(0);
  const lastTapX = useRef(0);
  const movedDuringTouch = useRef(false);

  // 数据全量重置时同步 endIndex
  React.useEffect(() => {
    setEndIndex(data.length);
    setVisibleCount(defaultVisibleCount);
  }, [data, defaultVisibleCount]);

  // 计算可见数据切片
  const totalCount = data.length;
  const actualVisible = Math.min(visibleCount, totalCount);
  const actualEnd = Math.min(Math.max(endIndex, actualVisible), totalCount);
  const startIndex = Math.max(0, actualEnd - actualVisible);
  const visibleData = data.slice(startIndex, actualEnd);

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
    if (visibleData.length === 0) {
      return { priceMin: 0, priceMax: 0, volumeMax: 0, ma5: [], ma10: [], ma20: [], boll: null, candleWidth: 0, gap: 0 };
    }

    const closes = visibleData.map(d => d.close);
    const highs = visibleData.map(d => d.high);
    const lows = visibleData.map(d => d.low);
    const volumes = visibleData.map(d => d.volume);

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

    const positivePrices = allPrices.filter(v => v > 0);
    if (positivePrices.length === 0) {
      return { priceMin: 0, priceMax: 0, volumeMax: 0, ma5, ma10, ma20, boll, candleWidth: 0, gap: 0 };
    }

    const priceMin = Math.min(...positivePrices) * 0.98;
    const priceMax = Math.max(...positivePrices) * 1.02;
    const volumeMax = Math.max(...volumes) * 1.1;

    const totalCandles = visibleData.length;
    const availableWidth = chartWidth - PADDING.left - PADDING.right;
    const candleWidth = Math.max(2, (availableWidth / totalCandles) * 0.7);
    const gap = Math.max(1, (availableWidth / totalCandles) * 0.3);

    return { priceMin, priceMax, volumeMax, ma5, ma10, ma20, boll, candleWidth, gap };
  }, [visibleData, chartWidth, showMA5, showMA10, showMA20, showBOLL]);

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

  // 手势辅助：跨多帧追踪触摸状态
  const pinchState = useRef({
    startDistance: 0,
    startVisibleCount: 0,
    active: false,
  });
  const panState = useRef({
    startEndIndex: 0,
    active: false,
  });

  // PanResponder: 双指缩放 + 单指拖动 + 双击重置
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onStartShouldSetPanResponderCapture: () => true,
      onMoveShouldSetPanResponder: (evt, gestureState) => {
        if (evt.nativeEvent.touches.length === 2) return true;
        return Math.abs(gestureState.dx) > 3 || Math.abs(gestureState.dy) > 3;
      },
      onMoveShouldSetPanResponderCapture: (evt) => {
        return evt.nativeEvent.touches.length === 2;
      },
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (evt) => {
        movedDuringTouch.current = false;
        if (evt.nativeEvent.touches.length === 2) {
          const t = evt.nativeEvent.touches;
          const dx = t[0].locationX - t[1].locationX;
          const dy = t[0].locationY - t[1].locationY;
          const distance = Math.sqrt(dx * dx + dy * dy);
          pinchState.current = {
            startDistance: distance,
            startVisibleCount: visibleCount,
            active: true,
          };
          panState.current.active = false;
        } else if (evt.nativeEvent.touches.length === 1) {
          panState.current = { startEndIndex: actualEnd, active: true };
          pinchState.current.active = false;
        }
      },
      onPanResponderMove: (evt, gestureState) => {
        if (Math.abs(gestureState.dx) > 4 || Math.abs(gestureState.dy) > 4) {
          movedDuringTouch.current = true;
          setTouchIndex(null);
        }

        if (evt.nativeEvent.touches.length === 2 && pinchState.current.active) {
          // 双指缩放
          const t = evt.nativeEvent.touches;
          const dx = t[0].locationX - t[1].locationX;
          const dy = t[0].locationY - t[1].locationY;
          const distance = Math.sqrt(dx * dx + dy * dy);
          if (distance > 10 && pinchState.current.startDistance > 0) {
            // 核心：手指分开→distance变大→ratio变小→可见K线变多（缩小）
            // 手指合拢→distance变小→ratio变大→可见K线变少（放大）
            const ratio = pinchState.current.startDistance / distance;
            const newVisible = Math.round(pinchState.current.startVisibleCount * ratio);
            setVisibleCount(Math.max(MIN_VISIBLE, Math.min(MAX_VISIBLE, newVisible)));
          }
        } else if (evt.nativeEvent.touches.length === 1 && panState.current.active && gestureState.dx !== 0) {
          // 单指拖动 - 平移可见范围
          const candlePlusGap = candleWidth + gap;
          if (candlePlusGap > 0) {
            const movedCandles = Math.round(gestureState.dx / candlePlusGap);
            const newEnd = panState.current.startEndIndex - movedCandles;
            setEndIndex(Math.max(actualVisible, Math.min(totalCount, newEnd)));
          }
        }
      },
      onPanResponderRelease: (evt) => {
        pinchState.current.active = false;
        panState.current.active = false;
        // 双击检测
        if (!movedDuringTouch.current && evt.nativeEvent.touches.length === 0) {
          const now = Date.now();
          const tapX = evt.nativeEvent.locationX;
          if (now - lastTapTime.current < 300 && Math.abs(tapX - lastTapX.current) < 30) {
            // 双击 - 重置
            setVisibleCount(defaultVisibleCount);
            setEndIndex(totalCount);
            setTouchIndex(null);
          } else {
            // 单击 - 显示十字光标
            const x = tapX - PADDING.left;
            const idx = Math.floor(x / (candleWidth + gap));
            if (idx >= 0 && idx < visibleData.length) {
              setTouchIndex(idx);
            }
          }
          lastTapTime.current = now;
          lastTapX.current = tapX;
        }
      },
      onPanResponderTerminate: () => {
        pinchState.current.active = false;
        panState.current.active = false;
      },
    })
  ).current;

  const renderCandles = () => {
    if (visibleData.length === 0) return null;
    const priceBottom = PADDING.top + priceChartHeight + 10;

    return visibleData.map((d, i) => {
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
    gridElements.push(
      <Line key="vol-sep" x1={PADDING.left} y1={priceBottom} x2={chartWidth - PADDING.right} y2={priceBottom} stroke="#0f3460" strokeWidth={1} strokeDasharray="3,3" />
    );
    return gridElements;
  };

  const renderTimeLabels = () => {
    if (visibleData.length === 0) return null;
    const labels = [];
    const step = Math.max(1, Math.floor(visibleData.length / 6));
    const priceBottom = PADDING.top + priceChartHeight + 10;
    const labelY = priceBottom + VOLUME_HEIGHT + 4;

    for (let i = 0; i < visibleData.length; i += step) {
      const x = indexToX(i);
      const date = visibleData[i].date;
      const displayDate = date.length > 5 ? date.substring(5) : date;
      labels.push(
        <SvgText
          key={`time-${i}`}
          x={x}
          y={labelY}
          fontSize={9}
          fill="#6b7280"
          textAnchor="middle"
        >
          {displayDate}
        </SvgText>
      );
    }
    return labels;
  };

  const renderCrosshair = () => {
    if (touchIndex === null || visibleData.length === 0) return null;
    const x = indexToX(touchIndex);
    const d = visibleData[touchIndex];
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
    if (touchIndex === null || visibleData.length === 0) return null;
    const d = visibleData[touchIndex];
    const prevClose = data[touchIndex + startIndex - 1]?.close || d.open;
    const change = d.close - prevClose;
    const changePct = prevClose > 0 ? (change / prevClose * 100).toFixed(2) : '0.00';
    const isUp = change >= 0;

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
      <View style={styles.rangeInfo}>
        <View style={styles.stockInfo}>
          {stockCode && <Text style={styles.stockCode}>{stockCode}</Text>}
          {stockName && <Text style={styles.stockName}>{stockName}</Text>}
        </View>
        <Text style={styles.rangeInfoText}>
          显示 {startIndex + 1}-{actualEnd} / 共 {totalCount} 条
        </Text>
        <Text style={styles.rangeInfoHint}>双指缩放 · 双击重置 · 单指拖动平移</Text>
      </View>
      <View
        style={[styles.chartWrapper, { height }]}
        {...panResponder.panHandlers}
      >
        <Svg width={chartWidth} height={height}>
          {renderPriceGrid()}
          {showBOLL && renderBollinger()}
          {showMA5 && renderMALine(ma5, '#00d4ff')}
          {showMA10 && renderMALine(ma10, '#a78bfa')}
          {showMA20 && renderMALine(ma20, '#fbbf24')}
          {renderCandles()}
          {renderCrosshair()}
          {renderTimeLabels()}
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
  rangeInfo: {
    flexDirection: 'column',
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#0f3460',
  },
  stockInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
    gap: 8,
  },
  stockCode: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  stockName: {
    color: '#00d4ff',
    fontSize: 12,
  },
  rangeInfoText: {
    color: '#00d4ff',
    fontSize: 11,
    fontWeight: 'bold',
  },
  rangeInfoHint: {
    color: '#6b7280',
    fontSize: 10,
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
