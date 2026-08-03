import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, TextInput, TouchableOpacity, Alert } from 'react-native';
import { useRoute } from '@react-navigation/native';
import { useDatabase, KlineDaily, Stock } from '../database/SQLiteProvider';
import { getAnalysisByCode } from '../services/AnalysisService';
import { analyzeStock, StockAnalysis } from '../strategies/StrategyEngine';
import KlineChart from '../components/KlineChart';
import ErrorBoundary from '../components/ErrorBoundary';
import { KlineFiller } from '../services/KlineFiller';

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

export default function DetailScreen() {
  const route = useRoute();
  const { getKlineByCode, getStocks, isConnected, db } = useDatabase();
  const routeParams = (route.params as { stockCode?: string }) || {};
  const [code, setCode] = useState(routeParams.stockCode || '000001');
  const [klineData, setKlineData] = useState<KlineDaily[]>([]);
  const [loading, setLoading] = useState(false);
  const [stockList, setStockList] = useState<Stock[]>([]);
  const [analysis, setAnalysis] = useState<StockAnalysis | null>(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [filler] = useState(() => new KlineFiller());
  const [isFilling, setIsFilling] = useState(false);
  const [fillResult, setFillResult] = useState<string>('');
  const [chartSettings, setChartSettings] = useState({
    showMA5: true,
    showMA10: true,
    showMA20: true,
    showBOLL: false,
  });
  const [showNeutralStrategies, setShowNeutralStrategies] = useState(false);
  const [inputHistory, setInputHistory] = useState<string[]>([]);

  useEffect(() => {
    const loadStockList = async () => {
      const stocks = await getStocks();
      setStockList(stocks);
    };
    loadStockList();
  }, [getStocks]);

  // 监听路由参数变化（从概览页点击跳转过来）
  useEffect(() => {
    if (routeParams.stockCode && routeParams.stockCode !== code) {
      setCode(routeParams.stockCode);
    }
  }, [routeParams.stockCode]);

  useEffect(() => {
    if (code) {
      loadKlineData();
    }
  }, [code]);

  useEffect(() => {
    if (klineData.length >= 100) {
      runStockAnalysis();
    }
  }, [klineData]);

  const loadKlineData = async () => {
    setLoading(true);
    try {
      const data = await getKlineByCode(code);
      setKlineData(data);
      setAnalysis(null);
    } catch (error) {
      console.error('Failed to load K-line data:', error);
    } finally {
      setLoading(false);
    }
  };

  const runStockAnalysis = async () => {
    setAnalysisLoading(true);
    try {
      const cached = getAnalysisByCode(code);
      if (cached) {
        setAnalysis(cached.analysis);
      } else if (klineData.length >= 100) {
        const stock = stockList.find(s => s.code === code);
        const result = analyzeStock(klineData, code, stock?.name || '未知');
        setAnalysis(result);
      }
    } catch (error) {
      console.error('Analysis failed:', error);
    } finally {
      setAnalysisLoading(false);
    }
  };

  // 提交输入：加载股票并加入历史
  const handleSubmitCode = () => {
    const trimmed = code.trim();
    if (!trimmed) return;
    setInputHistory(prev => {
      const filtered = prev.filter(c => c !== trimmed);
      return [trimmed, ...filtered].slice(0, 20);
    });
    loadKlineData();
  };

  const handleFillSingle = async () => {
    if (!isConnected || !db) {
      Alert.alert('提示', '数据库未连接，请先导入数据库', [{ text: '确定' }]);
      return;
    }
    setIsFilling(true);
    setFillResult('');
    try {
      const result = await filler.fillSingle(code.trim(), db);
      if (result.addedCount > 0) {
        setFillResult(`新增 ${result.addedCount} 条K线 (${result.source})`);
        // 补齐后刷新 K 线数据
        await loadKlineData();
      } else if (result.success) {
        setFillResult('已是最新数据');
      } else {
        setFillResult(`补齐失败: ${result.error}`);
        Alert.alert('补齐失败', result.error || '未知错误', [{ text: '确定' }]);
      }
    } catch (error: any) {
      console.error('Fill single failed:', error);
      setFillResult(`补齐异常: ${error?.message || '未知错误'}`);
      Alert.alert('补齐失败', error?.message || '未知错误', [{ text: '确定' }]);
    } finally {
      setIsFilling(false);
      // 3秒后自动清除结果提示
      setTimeout(() => setFillResult(''), 3000);
    }
  };

  const latestData = klineData[klineData.length - 1];
  // 关联股票名称
  const currentStockName = stockList.find(s => s.code === code)?.name || '未知';
  // 时间戳：最新K线日期
  const latestDate = latestData?.date || '--';

  return (
    <ScrollView style={styles.container}>
      <View style={styles.section}>
        <View style={styles.stockHeader}>
          <View style={styles.stockHeaderLeft}>
            <Text style={styles.sectionTitle}>{code}</Text>
            <Text style={styles.stockNameDisplay}>{currentStockName}</Text>
          </View>
          <View style={styles.stockHeaderRight}>
            <Text style={styles.timestamp}>数据日期: {latestDate}</Text>
            <TouchableOpacity
              style={[styles.fillBtn, isFilling && styles.fillBtnDisabled]}
              onPress={handleFillSingle}
              disabled={isFilling}
            >
              <Text style={styles.fillBtnText}>
                {isFilling ? '补齐中...' : '补齐此股'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
        {fillResult.length > 0 && (
          <Text style={[
            styles.fillResultText,
            fillResult.includes('失败') || fillResult.includes('异常') ? styles.fillResultError : styles.fillResultSuccess,
          ]}>
            {fillResult}
          </Text>
        )}
        <View style={styles.inputRow}>
          <TextInput
            style={styles.input}
            value={code}
            onChangeText={setCode}
            placeholder="输入股票代码"
            placeholderTextColor="#6b7280"
            keyboardType="numeric"
          />
          <TouchableOpacity style={styles.loadBtn} onPress={handleSubmitCode}>
            <Text style={styles.loadBtnText}>加载</Text>
          </TouchableOpacity>
        </View>
        {inputHistory.length > 0 && (
          <View style={styles.suggestions}>
            <Text style={styles.suggestionsTitle}>最近输入:</Text>
            <View style={styles.suggestionsScroll}>
              {inputHistory.map(c => (
                <TouchableOpacity
                  key={c}
                  style={[styles.suggestionItem, c === code && styles.suggestionItemActive]}
                  onPress={() => setCode(c)}
                >
                  <Text style={[styles.suggestionText, c === code && styles.suggestionTextActive]}>{c}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}
      </View>

      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator size="large" color="#00d4ff" />
        </View>
      ) : latestData ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>最新行情</Text>
          <View style={styles.priceCard}>
            <Text style={styles.price}>{latestData.close.toFixed(2)}</Text>
            <Text style={latestData.close >= latestData.open ? styles.changeUp : styles.changeDown}>
              {latestData.close >= latestData.open ? '+' : ''}
              {((latestData.close - latestData.open) / latestData.open * 100).toFixed(2)}%
            </Text>
          </View>
          <View style={styles.statsGrid}>
            <View style={styles.statItem}>
              <Text style={styles.statLabel}>开盘</Text>
              <Text style={styles.statValue}>{latestData.open.toFixed(2)}</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statLabel}>最高</Text>
              <Text style={styles.statValue}>{latestData.high.toFixed(2)}</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statLabel}>最低</Text>
              <Text style={styles.statValue}>{latestData.low.toFixed(2)}</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statLabel}>成交量</Text>
              <Text style={styles.statValue}>{(latestData.volume).toFixed(2)}万手</Text>
            </View>
          </View>
        </View>
      ) : (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>暂无数据</Text>
        </View>
      )}

      {(analysisLoading || analysis) && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>策略分析评分</Text>
          {analysisLoading ? (
            <View style={styles.loading}>
              <ActivityIndicator size="small" color="#00d4ff" />
            </View>
          ) : analysis ? (
            <>
              <View style={styles.ratingCard}>
                <View style={styles.ratingLeft}>
                  <StarRating rating={analysis.starRating} />
                  <Text style={styles.ratingScore}>{analysis.overallScore}分</Text>
                </View>
                <View style={styles.ratingRight}>
                  <View style={styles.signalRow}>
                    <SignalBadge signal="BUY" />
                    <Text style={styles.signalCount}>买入 {analysis.buySignals}</Text>
                  </View>
                  <View style={styles.signalRow}>
                    <SignalBadge signal="SELL" />
                    <Text style={styles.signalCount}>卖出 {analysis.sellSignals}</Text>
                  </View>
                </View>
              </View>

              <View style={styles.strategyResults}>
                <Text style={styles.subTitle}>买入信号策略 ({analysis.strategies.filter(s => s.signal === 'BUY').length}):</Text>
                <View style={styles.strategyList}>
                  {analysis.strategies
                    .filter(s => s.signal === 'BUY')
                    .map(s => (
                      <View key={s.id} style={styles.strategyDetailRow}>
                        <View style={styles.strategyHeader}>
                          <Text style={styles.strategyId}>{s.id}</Text>
                          <Text style={styles.strategyName}>{s.name}</Text>
                          <Text style={styles.strategyScore}>+{s.score}</Text>
                        </View>
                        <Text style={styles.strategyDetails}>{s.details}</Text>
                      </View>
                    ))}
                  {analysis.strategies.filter(s => s.signal === 'BUY').length === 0 && (
                    <Text style={styles.emptyText}>暂无买入信号</Text>
                  )}
                </View>
              </View>

              <View style={styles.strategyResults}>
                <Text style={styles.subTitle}>卖出信号策略 ({analysis.strategies.filter(s => s.signal === 'SELL').length}):</Text>
                <View style={styles.strategyList}>
                  {analysis.strategies
                    .filter(s => s.signal === 'SELL')
                    .map(s => (
                      <View key={s.id} style={styles.strategyDetailRow}>
                        <View style={styles.strategyHeader}>
                          <Text style={styles.strategyId}>{s.id}</Text>
                          <Text style={styles.strategyName}>{s.name}</Text>
                          <Text style={styles.strategyScoreNegative}>{s.score}</Text>
                        </View>
                        <Text style={styles.strategyDetails}>{s.details}</Text>
                      </View>
                    ))}
                  {analysis.strategies.filter(s => s.signal === 'SELL').length === 0 && (
                    <Text style={styles.emptyText}>暂无卖出信号</Text>
                  )}
                </View>
              </View>

              <View style={styles.strategyResults}>
                <TouchableOpacity 
                  style={styles.strategyHeaderRow} 
                  onPress={() => setShowNeutralStrategies(!showNeutralStrategies)}
                >
                  <Text style={styles.subTitle}>未触发策略 ({analysis.strategies.filter(s => s.signal === 'NEUTRAL').length}):</Text>
                  <Text style={styles.collapseIcon}>{showNeutralStrategies ? '▲' : '▼'}</Text>
                </TouchableOpacity>
                {showNeutralStrategies && (
                  <View style={styles.strategyList}>
                    {analysis.strategies
                      .filter(s => s.signal === 'NEUTRAL')
                      .map(s => (
                        <View key={s.id} style={styles.strategyDetailRowNeutral}>
                          <View style={styles.strategyHeader}>
                            <Text style={styles.strategyId}>{s.id}</Text>
                            <Text style={styles.strategyName}>{s.name}</Text>
                            <Text style={styles.strategyScoreNeutral}>0</Text>
                          </View>
                          <Text style={styles.strategyDetails}>{s.details}</Text>
                        </View>
                      ))}
                  </View>
                )}
              </View>
            </>
          ) : null}
        </View>
      )}

      {klineData.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>K线图</Text>
          <View style={styles.chartToggles}>
            <TouchableOpacity
              style={[styles.toggleBtn, chartSettings.showMA5 && styles.toggleBtnActive]}
              onPress={() => setChartSettings(s => ({ ...s, showMA5: !s.showMA5 }))}
            >
              <Text style={[styles.toggleBtnText, chartSettings.showMA5 && styles.toggleBtnTextActive]}>MA5</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.toggleBtn, chartSettings.showMA10 && styles.toggleBtnActive]}
              onPress={() => setChartSettings(s => ({ ...s, showMA10: !s.showMA10 }))}
            >
              <Text style={[styles.toggleBtnText, chartSettings.showMA10 && styles.toggleBtnTextActive]}>MA10</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.toggleBtn, chartSettings.showMA20 && styles.toggleBtnActive]}
              onPress={() => setChartSettings(s => ({ ...s, showMA20: !s.showMA20 }))}
            >
              <Text style={[styles.toggleBtnText, chartSettings.showMA20 && styles.toggleBtnTextActive]}>MA20</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.toggleBtn, chartSettings.showBOLL && styles.toggleBtnActive]}
              onPress={() => setChartSettings(s => ({ ...s, showBOLL: !s.showBOLL }))}
            >
              <Text style={[styles.toggleBtnText, chartSettings.showBOLL && styles.toggleBtnTextActive]}>BOLL</Text>
            </TouchableOpacity>
          </View>
          <ErrorBoundary>
            <KlineChart
              data={klineData}
              height={300}
              showMA5={chartSettings.showMA5}
              showMA10={chartSettings.showMA10}
              showMA20={chartSettings.showMA20}
              showBOLL={chartSettings.showBOLL}
              defaultVisibleCount={60}
              stockCode={code}
              stockName={currentStockName}
            />
          </ErrorBoundary>
        </View>
      )}

      {klineData.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>历史K线 (共{klineData.length}条，倒序)</Text>
          <View style={styles.klineTableHeader}>
            <Text style={styles.klineHeaderDate}>日期</Text>
            <Text style={styles.klineHeaderNum}>开盘</Text>
            <Text style={styles.klineHeaderNum}>最高</Text>
            <Text style={styles.klineHeaderNum}>最低</Text>
            <Text style={styles.klineHeaderNum}>收盘</Text>
            <Text style={styles.klineHeaderNum}>成交量(万)</Text>
          </View>
          <ScrollView style={styles.klineList} showsVerticalScrollIndicator={true} persistentScrollbar={true} nestedScrollEnabled={true}>
            {[...klineData].reverse().map((item, index) => {
              const isUp = item.close >= item.open;
              const colorUp = '#ef4444';
              const colorDown = '#10b981';
              return (
                <View key={index} style={styles.klineRow}>
                  <Text style={styles.klineDate}>{item.date.replace(/-/g, '')}</Text>
                  <Text style={styles.klineNum}>{item.open.toFixed(2)}</Text>
                  <Text style={[styles.klineNum, { color: isUp ? colorUp : colorDown }]}>{item.high.toFixed(2)}</Text>
                  <Text style={[styles.klineNum, { color: isUp ? colorUp : colorDown }]}>{item.low.toFixed(2)}</Text>
                  <Text style={[styles.klineNum, { color: isUp ? colorUp : colorDown, fontWeight: 'bold' }]}>
                    {item.close.toFixed(2)}
                  </Text>
                  <Text style={styles.klineNum}>{(item.volume).toFixed(2)}</Text>
                </View>
              );
            })}
          </ScrollView>
        </View>
      )}
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
  subTitle: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#0f3460',
    color: '#ffffff',
    padding: 12,
    borderRadius: 8,
    fontSize: 16,
  },
  suggestions: {
    marginTop: 12,
  },
  suggestionsTitle: {
    color: '#6b7280',
    fontSize: 12,
    marginBottom: 8,
  },
  suggestionsScroll: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  suggestionItem: {
    backgroundColor: '#0f3460',
    padding: 8,
    borderRadius: 6,
    marginRight: 8,
  },
  suggestionText: {
    color: '#00d4ff',
    fontSize: 14,
  },
  loading: {
    alignItems: 'center',
    padding: 32,
  },
  priceCard: {
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#0f3460',
    borderRadius: 12,
    marginBottom: 16,
  },
  price: {
    color: '#ffffff',
    fontSize: 32,
    fontWeight: 'bold',
  },
  changeUp: {
    color: '#10b981',
    fontSize: 20,
    marginTop: 8,
  },
  changeDown: {
    color: '#ef4444',
    fontSize: 20,
    marginTop: 8,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  statItem: {
    width: '50%',
    padding: 8,
    backgroundColor: '#0f3460',
    borderRadius: 8,
    marginBottom: 8,
  },
  statLabel: {
    color: '#6b7280',
    fontSize: 12,
    marginBottom: 4,
  },
  statValue: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '500',
  },
  ratingCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 16,
    backgroundColor: '#0f3460',
    borderRadius: 12,
    marginBottom: 16,
  },
  ratingLeft: {
    alignItems: 'center',
  },
  starContainer: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  starFilled: {
    color: '#fbbf24',
    fontSize: 24,
  },
  starEmpty: {
    color: '#374151',
    fontSize: 24,
  },
  ratingScore: {
    color: '#00d4ff',
    fontSize: 20,
    fontWeight: 'bold',
  },
  ratingRight: {
    alignItems: 'flex-end',
    gap: 8,
  },
  signalRow: {
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
    color: '#ffffff',
    fontSize: 14,
  },
  strategyResults: {
    marginBottom: 16,
  },
  strategyList: {
    // 移除maxHeight，使用外层ScrollView滚动
  },
  strategyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 8,
    backgroundColor: '#0f3460',
    borderRadius: 6,
    marginBottom: 4,
  },
  strategyId: {
    color: '#00d4ff',
    fontSize: 12,
    width: 40,
  },
  strategyName: {
    flex: 1,
    color: '#ffffff',
    fontSize: 12,
    marginLeft: 8,
  },
  strategyScore: {
    color: '#10b981',
    fontSize: 12,
    fontWeight: 'bold',
  },
  strategyScoreNegative: {
    color: '#ef4444',
    fontSize: 12,
    fontWeight: 'bold',
  },
  empty: {
    alignItems: 'center',
    padding: 32,
    backgroundColor: '#16213e',
    borderRadius: 12,
  },
  emptyText: {
    color: '#6b7280',
    fontSize: 16,
  },
  klineList: {
    maxHeight: 300,
  },
  klineRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a2e',
  },
  klineDate: {
    color: '#6b7280',
    fontSize: 11,
    width: 60,
  },
  klineNum: {
    color: '#ffffff',
    fontSize: 11,
    flex: 1,
    textAlign: 'center',
  },
  klineTableHeader: {
    flexDirection: 'row',
    padding: 8,
    backgroundColor: '#0f3460',
    borderRadius: 6,
    marginBottom: 4,
    borderBottomWidth: 2,
    borderBottomColor: '#00d4ff',
  },
  klineHeaderDate: {
    color: '#00d4ff',
    fontSize: 11,
    fontWeight: 'bold',
    width: 60,
  },
  klineHeaderNum: {
    color: '#00d4ff',
    fontSize: 11,
    fontWeight: 'bold',
    flex: 1,
    textAlign: 'center',
  },
  chartToggles: {
    flexDirection: 'row',
    marginBottom: 12,
    gap: 8,
  },
  toggleBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: '#0f3460',
  },
  toggleBtnActive: {
    backgroundColor: '#00d4ff',
  },
  toggleBtnText: {
    color: '#6b7280',
    fontSize: 12,
    fontWeight: '500',
  },
  toggleBtnTextActive: {
    color: '#0a0a0f',
  },
  // 新增样式
  stockHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  stockHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 12,
  },
  stockHeaderRight: {
    alignItems: 'flex-end',
    gap: 6,
  },
  stockNameDisplay: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '500',
  },
  timestamp: {
    color: '#6b7280',
    fontSize: 12,
  },
  inputRow: {
    flexDirection: 'row',
    gap: 8,
  },
  loadBtn: {
    backgroundColor: '#00d4ff',
    paddingHorizontal: 16,
    justifyContent: 'center',
    borderRadius: 8,
  },
  loadBtnText: {
    color: '#0a0a0f',
    fontSize: 14,
    fontWeight: 'bold',
  },
  suggestionItemActive: {
    backgroundColor: '#00d4ff',
  },
  suggestionTextActive: {
    color: '#0a0a0f',
    fontWeight: 'bold',
  },
  strategyDetailRow: {
    padding: 8,
    backgroundColor: '#0f3460',
    borderRadius: 6,
    marginBottom: 4,
    borderLeftWidth: 3,
    borderLeftColor: '#10b981',
  },
  strategyDetailRowNeutral: {
    padding: 8,
    backgroundColor: '#1a1a2e',
    borderRadius: 6,
    marginBottom: 4,
    borderLeftWidth: 3,
    borderLeftColor: '#6b7280',
    opacity: 0.7,
  },
  strategyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  strategyDetails: {
    color: '#94a3b8',
    fontSize: 11,
    marginLeft: 8,
  },
  strategyScoreNeutral: {
    color: '#6b7280',
    fontSize: 12,
    fontWeight: 'bold',
  },
  strategyHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  collapseIcon: {
    color: '#00d4ff',
    fontSize: 12,
  },
  fillBtn: {
    backgroundColor: '#10b981',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  fillBtnDisabled: {
    backgroundColor: '#374151',
  },
  fillBtnText: {
    color: '#0a0a0f',
    fontSize: 13,
    fontWeight: 'bold',
  },
  fillResultText: {
    fontSize: 13,
    marginTop: 8,
    textAlign: 'center',
  },
  fillResultSuccess: {
    color: '#10b981',
  },
  fillResultError: {
    color: '#ef4444',
  },
});
