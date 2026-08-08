import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useDatabase } from '../database/SQLiteProvider';
import { runAnalysis, getAllAnalysis, getAnalysisSummary, AnalysisResult, STRATEGIES, CATEGORIES, toggleStrategy as toggleStrategyService, getStrategyState, getEnabledStrategyIds } from '../services/AnalysisService';
import { generateAnalysisReport } from '../utils/reportGenerator';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';

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
  const [strategies, setStrategies] = useState(getStrategyState());
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [analysisResults, setAnalysisResults] = useState<AnalysisResult[]>([]);
  const [showResults, setShowResults] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });

  useFocusEffect(
    useCallback(() => {
      const cached = getAllAnalysis();
      setAnalysisResults(cached);
      setShowResults(cached.length > 0);
    }, [])
  );

  const toggleStrategy = (id: string) => {
    const newState = toggleStrategyService(id);
    setStrategies(newState);
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

      if (enabledIds.length === 0) {
        setAnalysisResults([]);
        setShowResults(true);
        setIsRunning(false);
        return;
      }

      const results = await runAnalysis(
        stocks,
        getKlineByCode,
        (current, total) => {
          setProgress({ current, total });
        },
        enabledIds
      );
      setAnalysisResults(results);
      setShowResults(true);
    } catch (error) {
      console.error('Analysis failed:', error);
    } finally {
      setIsRunning(false);
    }
  };

  const handleGenerateReport = async (top20Only: boolean) => {
    const results = top20Only
      ? [...analysisResults].sort((a, b) => b.analysis.overallScore - a.analysis.overallScore).slice(0, 20)
      : analysisResults;
    const report = generateAnalysisReport(results, {
      dbName: '本地数据库',
      strategyCount: strategies.length,
      enabledStrategyIds: getEnabledStrategyIds(),
    });
    const filePath = `${FileSystem.documentDirectory}analysis_report.md`;
    await FileSystem.writeAsStringAsync(filePath, report);
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
          <Text style={styles.runningText}>正在运行26个策略分析...</Text>
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

      {showResults && analysisResults.length > 0 && (
        <View style={styles.section}>
          <View style={styles.resultHeader}>
            <Text style={styles.sectionTitle}>筛选结果 Top20</Text>
            <View style={styles.buttonRow}>
              <View style={styles.reportButtonGroup}>
                <TouchableOpacity style={styles.reportButton} onPress={() => handleGenerateReport(true)}>
                  <Text style={styles.reportButtonText}>Top20报告</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.reportButton} onPress={() => handleGenerateReport(false)}>
                  <Text style={styles.reportButtonText}>全部报告</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
          <Text style={styles.hintText}>
            共 {summary?.analyzedStocks || analysisResults.length} 只 · 买入 {summary?.buySignals || 0} · 卖出 {summary?.sellSignals || 0} · 5星 {summary?.star5Count || 0}
          </Text>
          <ScrollView style={styles.resultList} showsVerticalScrollIndicator={true} persistentScrollbar={true} nestedScrollEnabled={true}>
            {analysisResults
              .sort((a, b) => b.analysis.overallScore - a.analysis.overallScore)
              .slice(0, 20)
              .map(result => {
                const latestKline = result.latestKline;
                const price = latestKline ? latestKline.close.toFixed(2) : '--';
                const change = latestKline ? (latestKline.close - latestKline.open) : 0;
                const changePct = latestKline && latestKline.open > 0 ? ((change / latestKline.open) * 100).toFixed(2) : '0.00';
                const isUp = change >= 0;
                const colorUp = '#ef4444';
                const colorDown = '#10b981';

                const buyStrategies = result.analysis.strategies.filter(s => s.signal === 'BUY');
                const sellStrategies = result.analysis.strategies.filter(s => s.signal === 'SELL');

                return (
                  <View key={result.stock.code} style={styles.resultItem}>
                    <View style={styles.resultItemHeader}>
                      <View style={styles.resultLeft}>
                        <Text style={styles.resultCode}>{result.stock.code}</Text>
                        <Text style={styles.resultName}>{result.stock.name}</Text>
                      </View>
                      <View style={styles.resultRight}>
                        <StarRating rating={result.analysis.starRating} />
                        <Text style={styles.resultScore}>{result.analysis.overallScore}分</Text>
                      </View>
                    </View>
                    <View style={styles.resultPriceRow}>
                      <View style={styles.resultPrice}>
                        <Text style={[styles.priceValue, { color: isUp ? colorUp : colorDown }]}>{price}</Text>
                        <Text style={[styles.priceChange, { color: isUp ? colorUp : colorDown }]}>
                          {isUp ? '+' : ''}{changePct}%
                        </Text>
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
                    {(buyStrategies.length > 0 || sellStrategies.length > 0) && (
                      <View style={styles.resultStrategyTags}>
                        {buyStrategies.map(s => (
                          <View key={s.id} style={[styles.strategyTag, styles.strategyTagBuy]}>
                            <Text style={styles.strategyTagText}>▲ {s.name}</Text>
                          </View>
                        ))}
                        {sellStrategies.map(s => (
                          <View key={s.id} style={[styles.strategyTag, styles.strategyTagSell]}>
                            <Text style={styles.strategyTagText}>▼ {s.name}</Text>
                          </View>
                        ))}
                      </View>
                    )}
                  </View>
                );
              })}
          </ScrollView>
        </View>
      )}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>策略分类</Text>
        <ScrollView horizontal style={styles.categoryScroll} showsHorizontalScrollIndicator={true}>
          <TouchableOpacity
            style={[styles.categoryItem, selectedCategory === null && styles.categoryItemActive]}
            onPress={() => setSelectedCategory(null)}
          >
            <Text style={styles.categoryText}>全部</Text>
          </TouchableOpacity>
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
        <ScrollView style={styles.strategyList} showsVerticalScrollIndicator={true} persistentScrollbar={true} nestedScrollEnabled={true}>
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
        </ScrollView>
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
  // [wb修改] 删除重复的 resultHeader 定义（TS1117）：对象字面量后者覆盖前者，
  // 运行时一直生效的是下方版本（flex-start/marginBottom:8），删前者行为完全不变
  buttonRow: {
    flexDirection: 'row',
    gap: 8,
  },
  reportButtonGroup: {
    flexDirection: 'row',
    gap: 6,
  },
  reportButton: {
    backgroundColor: '#f59e0b',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 6,
  },
  reportButtonText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  hintText: {
    color: '#94a3b8',
    fontSize: 12,
    marginBottom: 12,
  },
  resultList: {
    maxHeight: 600,
  },
  resultItem: {
    padding: 12,
    backgroundColor: '#0f3460',
    borderRadius: 8,
    marginBottom: 8,
  },
  // [wb修改] resultHeader：重构时误删了仍在 JSX 引用的样式，补回（与原布局一致）
  resultHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  resultItemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  resultLeft: {
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
    alignItems: 'center',
    gap: 8,
  },
  resultPriceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
    paddingVertical: 6,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#1a1a2e',
  },
  resultPrice: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
  },
  priceValue: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  priceChange: {
    fontSize: 12,
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
  resultStrategyTags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  strategyTag: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
  },
  strategyTagBuy: {
    backgroundColor: 'rgba(239, 68, 68, 0.2)',
  },
  strategyTagSell: {
    backgroundColor: 'rgba(16, 185, 129, 0.2)',
  },
  strategyTagText: {
    fontSize: 11,
    color: '#ffffff',
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
