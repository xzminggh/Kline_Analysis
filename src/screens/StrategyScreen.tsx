import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useDatabase } from '../database/SQLiteProvider';
import { runAnalysis, getAllAnalysis, getAnalysisSummary, AnalysisResult, generateCSV } from '../services/AnalysisService';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';

const STRATEGIES = [
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

const CATEGORIES = ['趋势跟随', '均值回归', '动量突破', '经典形态', '关键价位', '波动率收缩', '成交量极端', '多周期背离'];

function StarRating({ rating }: { rating: number }) {
  return (
    <View style={styles.starContainer}>
      {[1, 2, 3, 4, 5].map(star => (
        <Text key={star} style={star <= rating ? styles.starFilled : styles.starEmpty}>
          ★
        </Text>
      ))}
    </View>
  );
}

function SignalBadge({ signal }: { signal: 'BUY' | 'SELL' | 'NEUTRAL' }) {
  const colors = {
    BUY: { bg: '#10b981', text: '#ffffff' },
    SELL: { bg: '#ef4444', text: '#ffffff' },
    NEUTRAL: { bg: '#6b7280', text: '#ffffff' },
  };
  return (
    <View style={[styles.signalBadge, { backgroundColor: colors[signal].bg }]}>
      <Text style={[styles.signalBadgeText, { color: colors[signal].text }]}>
        {signal === 'BUY' ? '买入' : signal === 'SELL' ? '卖出' : '中性'}
      </Text>
    </View>
  );
}

export default function StrategyScreen() {
  const { isConnected, getStocks, getKlineByCode } = useDatabase();
  const [strategies, setStrategies] = useState(STRATEGIES);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [analysisResults, setAnalysisResults] = useState<AnalysisResult[]>([]);
  const [showResults, setShowResults] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });

  useEffect(() => {
    const cached = getAllAnalysis();
    if (cached.length > 0) {
      setAnalysisResults(cached);
      setShowResults(true);
    }
  }, []);

  const toggleStrategy = (id: string) => {
    setStrategies(prev =>
      prev.map(s => (s.id === id ? { ...s, enabled: !s.enabled } : s))
    );
  };

  const toggleCategory = (category: string) => {
    setSelectedCategory(selectedCategory === category ? null : category);
  };

  const handleRunAnalysis = async () => {
    if (!isConnected) return;

    setIsRunning(true);
    setShowResults(false);
    setProgress({ current: 0, total: 0 });

    try {
      const stocks = await getStocks();
      const enabledIds = strategies.filter(s => s.enabled).map(s => s.id);
      const results = await runAnalysis(
        stocks,
        getKlineByCode,
        (current, total) => {
          setProgress({ current, total });
        },
        enabledIds.length > 0 ? enabledIds : undefined
      );
      setAnalysisResults(results);
      setShowResults(true);
    } catch (error) {
      console.error('Analysis failed:', error);
    } finally {
      setIsRunning(false);
    }
  };

  const handleExportCSV = async () => {
    const csv = generateCSV(analysisResults);
    const filePath = `${FileSystem.documentDirectory}analysis_report.csv`;
    await FileSystem.writeAsStringAsync(filePath, csv);
    await Sharing.shareAsync(filePath);
  };

  const enabledCount = strategies.filter(s => s.enabled).length;
  const summary = getAnalysisSummary();

  const filteredStrategies = selectedCategory
    ? strategies.filter(s => s.category === selectedCategory)
    : strategies;

  if (isRunning) {
    const pct = progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0;
    return (
      <View style={styles.container}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#00d4ff" />
          <Text style={styles.runningText}>正在运行25个策略分析...</Text>
          <Text style={styles.progressText}>{progress.current} / {progress.total} ({pct}%)</Text>
          <Text style={styles.runningSubText}>分片调度中，请稍候</Text>
        </View>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>策略配置</Text>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>已启用策略:</Text>
          <Text style={styles.summaryValue}>{enabledCount} / {strategies.length}</Text>
        </View>
        <TouchableOpacity
          style={styles.runButton}
          onPress={handleRunAnalysis}
          disabled={!isConnected}
        >
          <Text style={styles.runButtonText}>运行筛选</Text>
        </TouchableOpacity>
      </View>

      {showResults && summary && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>分析概览</Text>
          <View style={styles.statsGrid}>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>{summary.analyzedStocks}</Text>
              <Text style={styles.statLabel}>分析股票</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>{summary.buySignals}</Text>
              <Text style={styles.statLabel}>买入信号</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>{summary.sellSignals}</Text>
              <Text style={styles.statLabel}>卖出信号</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>{summary.star5Count}</Text>
              <Text style={styles.statLabel}>5星股票</Text>
            </View>
          </View>
          <TouchableOpacity style={styles.exportButton} onPress={handleExportCSV}>
            <Text style={styles.exportButtonText}>导出CSV报告</Text>
          </TouchableOpacity>
        </View>
      )}

      {showResults && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>筛选结果</Text>
          <View style={styles.resultList}>
            {analysisResults
              .sort((a, b) => b.analysis.overallScore - a.analysis.overallScore)
              .slice(0, 20)
              .map(result => (
                <View key={result.stock.code} style={styles.resultItem}>
                  <View style={styles.resultLeft}>
                    <Text style={styles.resultCode}>{result.stock.code}</Text>
                    <Text style={styles.resultName}>{result.stock.name}</Text>
                  </View>
                  <View style={styles.resultRight}>
                    <StarRating rating={result.analysis.starRating} />
                    <Text style={styles.resultScore}>{result.analysis.overallScore}分</Text>
                  </View>
                  <View style={styles.resultSignals}>
                    <SignalBadge signal="BUY" />
                    <Text style={styles.signalCount}>x{result.analysis.buySignals}</Text>
                    {result.analysis.sellSignals > 0 && (
                      <>
                        <SignalBadge signal="SELL" />
                        <Text style={styles.signalCount}>x{result.analysis.sellSignals}</Text>
                      </>
                    )}
                  </View>
                </View>
              ))}
          </View>
        </View>
      )}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>策略分类</Text>
        <ScrollView horizontal style={styles.categoryScroll}>
          {CATEGORIES.map(cat => (
            <TouchableOpacity
              key={cat}
              style={[styles.categoryItem, selectedCategory === cat && styles.categoryItemActive]}
              onPress={() => toggleCategory(cat)}
            >
              <Text style={styles.categoryText}>{cat}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>策略列表</Text>
        <View style={styles.strategyList}>
          {filteredStrategies.map(strategy => (
            <TouchableOpacity
              key={strategy.id}
              style={[styles.strategyItem, !strategy.enabled && styles.strategyItemDisabled]}
              onPress={() => toggleStrategy(strategy.id)}
            >
              <View style={styles.strategyLeft}>
                <Text style={styles.strategyId}>{strategy.id}</Text>
                <Text style={styles.strategyName}>{strategy.name}</Text>
              </View>
              <View style={[styles.strategyToggle, strategy.enabled && styles.strategyToggleOn]}>
                <Text style={styles.strategyToggleText}>{strategy.enabled ? 'ON' : 'OFF'}</Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0f',
    padding: 16,
  },
  section: {
    backgroundColor: '#16213e',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  sectionTitle: {
    color: '#00d4ff',
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 12,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  summaryLabel: {
    color: '#6b7280',
    fontSize: 16,
  },
  summaryValue: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  runButton: {
    backgroundColor: '#00d4ff',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  runButtonText: {
    color: '#0a0a0f',
    fontSize: 18,
    fontWeight: 'bold',
  },
  exportButton: {
    backgroundColor: '#10b981',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 12,
  },
  exportButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  runningText: {
    color: '#00d4ff',
    fontSize: 18,
    marginTop: 16,
    fontWeight: 'bold',
  },
  runningSubText: {
    color: '#6b7280',
    fontSize: 14,
    marginTop: 8,
  },
  progressText: {
    color: '#00d4ff',
    fontSize: 24,
    fontWeight: 'bold',
    marginTop: 12,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  statCard: {
    width: '50%',
    padding: 12,
    backgroundColor: '#0f3460',
    borderRadius: 8,
    marginBottom: 8,
    alignItems: 'center',
  },
  statValue: {
    color: '#00d4ff',
    fontSize: 24,
    fontWeight: 'bold',
  },
  statLabel: {
    color: '#6b7280',
    fontSize: 12,
    marginTop: 4,
  },
  resultList: {
    maxHeight: 400,
  },
  resultItem: {
    padding: 12,
    backgroundColor: '#0f3460',
    borderRadius: 8,
    marginBottom: 8,
  },
  resultLeft: {
    marginBottom: 8,
  },
  resultCode: {
    color: '#00d4ff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  resultName: {
    color: '#ffffff',
    fontSize: 16,
  },
  resultRight: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  starContainer: {
    flexDirection: 'row',
  },
  starFilled: {
    color: '#fbbf24',
    fontSize: 18,
  },
  starEmpty: {
    color: '#374151',
    fontSize: 18,
  },
  resultScore: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  resultSignals: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  signalBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  signalBadgeText: {
    fontSize: 12,
    fontWeight: 'bold',
  },
  signalCount: {
    color: '#6b7280',
    fontSize: 12,
  },
  categoryScroll: {
    flexDirection: 'row',
  },
  categoryItem: {
    backgroundColor: '#0f3460',
    padding: 8,
    borderRadius: 6,
    marginRight: 8,
  },
  categoryItemActive: {
    backgroundColor: '#00d4ff',
  },
  categoryText: {
    color: '#ffffff',
    fontSize: 12,
  },
  strategyList: {
    maxHeight: 600,
  },
  strategyItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    backgroundColor: '#0f3460',
    borderRadius: 8,
    marginBottom: 8,
  },
  strategyItemDisabled: {
    opacity: 0.5,
  },
  strategyLeft: {
    flex: 1,
  },
  strategyId: {
    color: '#00d4ff',
    fontSize: 12,
    marginBottom: 4,
  },
  strategyName: {
    color: '#ffffff',
    fontSize: 14,
  },
  strategyToggle: {
    backgroundColor: '#ef4444',
    padding: 6,
    borderRadius: 4,
  },
  strategyToggleOn: {
    backgroundColor: '#10b981',
  },
  strategyToggleText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: 'bold',
  },
});
