import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, TextInput, TouchableOpacity } from 'react-native';
import { useDatabase, KlineDaily, Stock } from '../database/SQLiteProvider';
import { getAnalysisByCode, runAnalysis, AnalysisResult } from '../services/AnalysisService';
import { analyzeStock, StockAnalysis } from '../strategies/StrategyEngine';
import KlineChart from '../components/KlineChart';

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
  const { getKlineByCode, getStocks } = useDatabase();
  const [code, setCode] = useState('000001');
  const [klineData, setKlineData] = useState<KlineDaily[]>([]);
  const [loading, setLoading] = useState(false);
  const [stockList, setStockList] = useState<Stock[]>([]);
  const [analysis, setAnalysis] = useState<StockAnalysis | null>(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [chartSettings, setChartSettings] = useState({
    showMA5: true,
    showMA10: true,
    showMA20: true,
    showBOLL: false,
  });

  useEffect(() => {
    const loadStockList = async () => {
      const stocks = await getStocks();
      setStockList(stocks);
    };
    loadStockList();
  }, [getStocks]);

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

  const latestData = klineData[klineData.length - 1];

  return (
    <ScrollView style={styles.container}>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>股票代码</Text>
        <TextInput
          style={styles.input}
          value={code}
          onChangeText={setCode}
          placeholder="输入股票代码"
          placeholderTextColor="#6b7280"
          keyboardType="numeric"
        />
        {stockList.length > 0 && (
          <View style={styles.suggestions}>
            <Text style={styles.suggestionsTitle}>热门股票:</Text>
            <ScrollView horizontal style={styles.suggestionsScroll}>
              {stockList.slice(0, 10).map(s => (
                <TouchableOpacity
                  key={s.code}
                  style={styles.suggestionItem}
                  onPress={() => setCode(s.code)}
                >
                  <Text style={styles.suggestionText}>{s.code}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
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
              <Text style={styles.statValue}>{(latestData.volume / 10000).toFixed(0)}万</Text>
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
                <Text style={styles.subTitle}>买入信号策略:</Text>
                <ScrollView style={styles.strategyList}>
                  {analysis.strategies
                    .filter(s => s.signal === 'BUY')
                    .map(s => (
                      <View key={s.id} style={styles.strategyRow}>
                        <Text style={styles.strategyId}>{s.id}</Text>
                        <Text style={styles.strategyName}>{s.name}</Text>
                        <Text style={styles.strategyScore}>{s.score}</Text>
                      </View>
                    ))}
                  {analysis.strategies.filter(s => s.signal === 'BUY').length === 0 && (
                    <Text style={styles.emptyText}>暂无买入信号</Text>
                  )}
                </ScrollView>
              </View>

              <View style={styles.strategyResults}>
                <Text style={styles.subTitle}>卖出信号策略:</Text>
                <ScrollView style={styles.strategyList}>
                  {analysis.strategies
                    .filter(s => s.signal === 'SELL')
                    .map(s => (
                      <View key={s.id} style={styles.strategyRow}>
                        <Text style={styles.strategyId}>{s.id}</Text>
                        <Text style={styles.strategyName}>{s.name}</Text>
                        <Text style={styles.strategyScoreNegative}>{s.score}</Text>
                      </View>
                    ))}
                  {analysis.strategies.filter(s => s.signal === 'SELL').length === 0 && (
                    <Text style={styles.emptyText}>暂无卖出信号</Text>
                  )}
                </ScrollView>
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
          <KlineChart
            data={klineData.slice(-60)}
            height={300}
            showMA5={chartSettings.showMA5}
            showMA10={chartSettings.showMA10}
            showMA20={chartSettings.showMA20}
            showBOLL={chartSettings.showBOLL}
          />
        </View>
      )}

      {klineData.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>历史K线 ({klineData.length}条)</Text>
          <ScrollView style={styles.klineList}>
            {klineData.slice(-20).reverse().map((item, index) => (
              <View key={index} style={styles.klineRow}>
                <Text style={styles.klineDate}>{item.date}</Text>
                <Text style={styles.klineOpen}>{item.open.toFixed(2)}</Text>
                <Text style={styles.klineHigh}>{item.high.toFixed(2)}</Text>
                <Text style={styles.klineLow}>{item.low.toFixed(2)}</Text>
                <Text style={item.close >= item.open ? styles.klineCloseUp : styles.klineCloseDown}>
                  {item.close.toFixed(2)}
                </Text>
              </View>
            ))}
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
    maxHeight: 200,
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
    maxHeight: 400,
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
    fontSize: 12,
    width: 70,
  },
  klineOpen: {
    color: '#ffffff',
    fontSize: 12,
    width: 60,
  },
  klineHigh: {
    color: '#10b981',
    fontSize: 12,
    width: 60,
  },
  klineLow: {
    color: '#ef4444',
    fontSize: 12,
    width: 60,
  },
  klineCloseUp: {
    color: '#10b981',
    fontSize: 12,
    fontWeight: '500',
    width: 60,
  },
  klineCloseDown: {
    color: '#ef4444',
    fontSize: 12,
    fontWeight: '500',
    width: 60,
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
});
