import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Circle, Path, Rect, Text as SvgText, G } from 'react-native-svg';
import { AnalysisSummary } from '../services/AnalysisService';

interface DashboardProps {
  summary: AnalysisSummary;
}

// 星级分布饼图配色
const STAR_COLORS = ['#ef4444', '#f97316', '#fbbf24', '#84cc16', '#10b981'];
const STAR_LABELS = ['1星', '2星', '3星', '4星', '5星'];

export default function Dashboard({ summary }: DashboardProps) {
  const starCounts = [
    summary.star1Count,
    summary.star2Count,
    summary.star3Count,
    summary.star4Count,
    summary.star5Count,
  ];
  const totalStar = starCounts.reduce((a, b) => a + b, 0) || 1;

  // 饼图参数
  const pieSize = 140;
  const pieRadius = 60;
  const pieCx = pieSize / 2;
  const pieCy = pieSize / 2;

  // 计算饼图扇形路径
  let currentAngle = -Math.PI / 2; // 从顶部开始
  const slices = starCounts.map((count, i) => {
    const percent = count / totalStar;
    const angle = percent * Math.PI * 2;
    const startAngle = currentAngle;
    const endAngle = currentAngle + angle;
    currentAngle = endAngle;

    const x1 = pieCx + pieRadius * Math.cos(startAngle);
    const y1 = pieCy + pieRadius * Math.sin(startAngle);
    const x2 = pieCx + pieRadius * Math.cos(endAngle);
    const y2 = pieCy + pieRadius * Math.sin(endAngle);
    const largeArc = angle > Math.PI ? 1 : 0;

    const pathData = `M ${pieCx} ${pieCy} L ${x1} ${y1} A ${pieRadius} ${pieRadius} 0 ${largeArc} 1 ${x2} ${y2} Z`;

    return {
      index: i,
      pathData,
      percent,
      count,
      color: STAR_COLORS[i],
      label: STAR_LABELS[i],
    };
  });

  // 柱状图参数
  const barChartWidth = 300;
  const barChartHeight = 120;
  const barMaxHeight = 80;
  const barWidth = 60;
  const barGap = 20;

  const maxValue = Math.max(summary.buySignals, summary.sellSignals, 1);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>分析仪表盘</Text>

      <View style={styles.row}>
        {/* 星级分布饼图 */}
        <View style={styles.pieSection}>
          <Text style={styles.sectionLabel}>星级分布</Text>
          <Svg width={pieSize} height={pieSize}>
            {slices.map(slice => (
              <Path
                key={slice.index}
                d={slice.pathData}
                fill={slice.color}
                stroke="#0a0a0f"
                strokeWidth={1}
              />
            ))}
            <Circle cx={pieCx} cy={pieCy} r={24} fill="#0a0a0f" />
            <SvgText
              x={pieCx}
              y={pieCy - 4}
              fontSize={11}
              fill="#00d4ff"
              textAnchor="middle"
              fontWeight="bold"
            >
              {totalStar}
            </SvgText>
            <SvgText
              x={pieCx}
              y={pieCy + 8}
              fontSize={8}
              fill="#6b7280"
              textAnchor="middle"
            >
              总数
            </SvgText>
          </Svg>
        </View>

        {/* 星级图例 */}
        <View style={styles.legendSection}>
          {slices.map(slice => (
            <View key={slice.index} style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: slice.color }]} />
              <Text style={styles.legendLabel}>{slice.label}</Text>
              <Text style={styles.legendValue}>{slice.count}</Text>
              <Text style={styles.legendPercent}>
                ({(slice.percent * 100).toFixed(1)}%)
              </Text>
            </View>
          ))}
        </View>
      </View>

      {/* 信号统计柱状图 */}
      <View style={styles.barSection}>
        <Text style={styles.sectionLabel}>信号统计</Text>
        <Svg width={barChartWidth} height={barChartHeight}>
          {/* Y轴基准线 */}
          <Rect x={0} y={0} width={barChartWidth} height={barChartHeight} fill="#0f3460" rx={6} />

          {/* 买入信号柱 */}
          <G>
            <Rect
              x={40}
              y={20 + (1 - summary.buySignals / maxValue) * barMaxHeight}
              width={barWidth}
              height={(summary.buySignals / maxValue) * barMaxHeight}
              fill="#10b981"
              rx={3}
            />
            <SvgText x={40 + barWidth / 2} y={15} fontSize={11} fill="#10b981" textAnchor="middle" fontWeight="bold">
              {summary.buySignals}
            </SvgText>
            <SvgText x={40 + barWidth / 2} y={110} fontSize={11} fill="#ffffff" textAnchor="middle">
              买入信号
            </SvgText>
          </G>

          {/* 卖出信号柱 */}
          <G>
            <Rect
              x={40 + barWidth + barGap}
              y={20 + (1 - summary.sellSignals / maxValue) * barMaxHeight}
              width={barWidth}
              height={(summary.sellSignals / maxValue) * barMaxHeight}
              fill="#ef4444"
              rx={3}
            />
            <SvgText x={40 + barWidth + barGap + barWidth / 2} y={15} fontSize={11} fill="#ef4444" textAnchor="middle" fontWeight="bold">
              {summary.sellSignals}
            </SvgText>
            <SvgText x={40 + barWidth + barGap + barWidth / 2} y={110} fontSize={11} fill="#ffffff" textAnchor="middle">
              卖出信号
            </SvgText>
          </G>

          {/* 分析股票数柱 */}
          <G>
            <Rect
              x={40 + (barWidth + barGap) * 2}
              y={20 + (1 - summary.analyzedStocks / Math.max(summary.analyzedStocks, maxValue)) * barMaxHeight}
              width={barWidth}
              height={(summary.analyzedStocks / Math.max(summary.analyzedStocks, maxValue)) * barMaxHeight}
              fill="#00d4ff"
              rx={3}
            />
            <SvgText x={40 + (barWidth + barGap) * 2 + barWidth / 2} y={15} fontSize={11} fill="#00d4ff" textAnchor="middle" fontWeight="bold">
              {summary.analyzedStocks}
            </SvgText>
            <SvgText x={40 + (barWidth + barGap) * 2 + barWidth / 2} y={110} fontSize={11} fill="#ffffff" textAnchor="middle">
              分析股票
            </SvgText>
          </G>
        </Svg>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#0f3460',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  title: {
    color: '#00d4ff',
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 12,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  pieSection: {
    alignItems: 'center',
    marginRight: 16,
  },
  sectionLabel: {
    color: '#6b7280',
    fontSize: 12,
    marginBottom: 8,
    textAlign: 'center',
  },
  legendSection: {
    flex: 1,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 6,
  },
  legendLabel: {
    color: '#ffffff',
    fontSize: 11,
    width: 36,
  },
  legendValue: {
    color: '#00d4ff',
    fontSize: 12,
    fontWeight: 'bold',
    width: 36,
  },
  legendPercent: {
    color: '#6b7280',
    fontSize: 10,
  },
  barSection: {
    alignItems: 'center',
    marginTop: 4,
  },
});
