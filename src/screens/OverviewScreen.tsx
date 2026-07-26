import React, { useEffect, useState, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, TouchableOpacity, Alert } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useDatabase } from '../database/SQLiteProvider';
import { getAnalysisSummary, getAllAnalysis, runAnalysis, getFilteredResults } from '../services/AnalysisService';
import * as DocumentPicker from 'expo-document-picker';
import SearchFilter, { FilterState } from '../components/SearchFilter';

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

export default function OverviewScreen() {
  const navigation = useNavigation();
  const { isConnected, getTables, getStockCount, getKlineCount, getMeta, getStocks, getKlineByCode, importDatabase } = useDatabase();
  const [tables, setTables] = useState<string[]>([]);
  const [stockCount, setStockCount] = useState(0);
  const [klineCount, setKlineCount] = useState(0);
  const [meta, setMeta] = useState<Record<string, string>>({});
  const [showMeta, setShowMeta] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [showPerfReport, setShowPerfReport] = useState(false);
  const [summary, setSummary] = useState(getAnalysisSummary());
  const [topStocks, setTopStocks] = useState(getAllAnalysis());
  const [filters, setFilters] = useState<FilterState>({
    keyword: '',
    starRating: null,
    signalType: 'ALL',
    minScore: null,
    sortBy: 'score',
    sortOrder: 'desc',
  });

  useEffect(() => {
    loadData();
    checkAnalysisCache();
  }, [isConnected]);

  const loadData = async () => {
    if (!isConnected) return;
    setLoading(true);
    try {
      const [ts, sc, kc, mt] = await Promise.all([
        getTables(),
        getStockCount(),
        getKlineCount(),
        getMeta(),
      ]);
      setTables(ts);
      setStockCount(sc);
      setKlineCount(kc);
      setMeta(mt);
    } catch (error) {
      console.error('Failed to load overview data:', error);
    } finally {
      setLoading(false);
    }
  };

  const checkAnalysisCache = () => {
    const cachedSummary = getAnalysisSummary();
    const cachedResults = getAllAnalysis();
    if (cachedSummary) setSummary(cachedSummary);
    if (cachedResults.length > 0) setTopStocks(cachedResults);
  };

  const handleRunAnalysis = async () => {
    if (!isConnected) return;
    setIsRunning(true);
    setProgress({ current: 0, total: 0 });
    try {
      const stocks = await getStocks();
      const results = await runAnalysis(stocks, getKlineByCode, (current, total) => {
        setProgress({ current, total });
      });
      setTopStocks(results);
      setSummary(getAnalysisSummary());
    } catch (error) {
      console.error('Analysis failed:', error);
    } finally {
      setIsRunning(false);
    }
  };

  const handleImportDatabase = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: '*/*',
        copyToCacheDirectory: false,
      });
      if (result.canceled) return;
      if (result.assets && result.assets[0]) {
        const fileUri = result.assets[0].uri;
        const fileName = result.assets[0].name || '未知文件';

        Alert.alert(
          '确认导入数据库',
          `即将导入文件：${fileName}\n\n导入后将自动备份当前数据库，原数据不会丢失。\n\n是否继续？`,
          [
            { text: '取消', style: 'cancel' },
            {
              text: '确认导入',
              style: 'destructive',
              onPress: async () => {
                const importResult = await importDatabase(fileUri);
                if (importResult.success) {
                  loadData();
                  Alert.alert(
                    '导入成功',
                    importResult.backupPath
                      ? `数据库已更新\n备份已保存至：${importResult.backupPath}`
                      : '数据库已成功导入',
                    [{ text: '确定' }]
                  );
                } else {
                  Alert.alert('导入失败', importResult.error || '请检查文件格式', [{ text: '确定' }]);
                }
              },
            },
          ]
        );
      }
    } catch (error) {
      console.error('Import failed:', error);
      Alert.alert('导入失败', '发生未知错误', [{ text: '确定' }]);
    }
  };

  const filteredResults = useMemo(() => {
    let results = [...topStocks];

    if (filters.keyword) {
      const kw = filters.keyword.toLowerCase();
      results = results.filter(r =>
        r.stock.code.includes(kw) || r.stock.name.toLowerCase().includes(kw)
      );
    }

    if (filters.starRating !== null) {
      results = results.filter(r => r.analysis.starRating === filters.starRating);
    }

    if (filters.signalType !== 'ALL') {
      results = results.filter(r =>
        r.analysis.strategies.some(s => s.signal === filters.signalType)
      );
    }

    if (filters.minScore !== null) {
      results = results.filter(r => r.analysis.overallScore >= filters.minScore!);
    }

    results.sort((a, b) => {
      let diff = 0;
      if (filters.sortBy === 'score') {
        diff = a.analysis.overallScore - b.analysis.overallScore;
      } else if (filters.sortBy === 'buySignals') {
        diff = a.analysis.buySignals - b.analysis.buySignals;
      } else if (filters.sortBy === 'sellSignals') {
        diff = a.analysis.sellSignals - b.analysis.sellSignals;
      }
      return filters.sortOrder === 'desc' ? -diff : diff;
    });

    return results;
  }, [topStocks, filters]);

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#00d4ff" />
      </View>
    );
  }

  const topRatedStocks = topStocks
    .filter(s => s.analysis.starRating >= 4)
    .sort((a, b) => b.analysis.overallScore - a.analysis.overallScore)
    .slice(0, 10);

  const buySignalStocks = topStocks
    .filter(s => s.analysis.buySignals >= 3)
    .sort((a, b) => b.analysis.buySignals - a.analysis.buySignals)
    .slice(0, 5);

  return (
    <ScrollView style={styles.container}>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>数据库连接状态</Text>
        <View style={styles.statusRow}>
          <Text style={styles.statusLabel}>连接状态:</Text>
          <Text style={isConnected ? styles.statusConnected : styles.statusDisconnected}>
            {isConnected ? '已连接' : '未连接'}
          </Text>
        </View>
        <TouchableOpacity style={styles.importButton} onPress={handleImportDatabase}>
          <Text style={styles.importButtonText}>导入数据库</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>数据库信息</Text>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>表数量:</Text>
          <Text style={styles.infoValue}>{tables.length}</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>股票数量:</Text>
          <Text style={styles.infoValue}>{stockCount}</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>K线数据量:</Text>
          <Text style={styles.infoValue}>{klineCount.toLocaleString()}</Text>
        </View>
      </View>

      {summary && (
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
          <TouchableOpacity
            style={styles.runButton}
            onPress={handleRunAnalysis}
            disabled={isRunning}
          >
            <Text style={styles.runButtonText}>
              {isRunning ? `分析中 ${progress.current}/${progress.total}...` : '运行策略筛选'}
            </Text>
          </TouchableOpacity>

          {summary?.performanceReport && (
            <TouchableOpacity
              style={styles.perfToggle}
              onPress={() => setShowPerfReport(!showPerfReport)}
            >
              <Text style={styles.perfToggleText}>
                {showPerfReport ? '▼ 性能报告' : '▶ 性能报告'}
              </Text>
            </TouchableOpacity>
          )}

          {showPerfReport && summary?.performanceReport && (
            <View style={styles.perfReport}>
              {summary.performanceReport.split('\n').map((line, i) => (
                <Text key={i} style={styles.perfLine}>
                  {line}
                </Text>
              ))}
            </View>
          )}
        </View>
      )}

      {topStocks.length > 0 && (
        <SearchFilter
          totalCount={filteredResults.length}
          onFilterChange={setFilters}
        />
      )}

      {filteredResults.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>筛选结果</Text>
          <View style={styles.stockList}>
            {filteredResults.map(result => (
              <TouchableOpacity
                key={result.stock.code}
                style={styles.stockItem}
                onPress={() => navigation.navigate('详情', { stockCode: result.stock.code })}
                activeOpacity={0.7}
              >
                <View style={styles.stockTop}>
                  <View style={styles.stockLeft}>
                    <Text style={styles.stockCode}>{result.stock.code}</Text>
                    <Text style={styles.stockName}>{result.stock.name}</Text>
                  </View>
                  <View style={styles.stockRight}>
                    <StarRating rating={result.analysis.starRating} />
                    <Text style={styles.stockScore}>{result.analysis.overallScore}分</Text>
                  </View>
                </View>
                <View style={styles.stockBottom}>
                  {result.latestKline && (
                    <View style={styles.stockPrice}>
                      <Text style={styles.priceValue}>{result.latestKline.close.toFixed(2)}</Text>
                      <Text style={result.latestKline.close >= result.latestKline.open ? styles.priceUp : styles.priceDown}>
                        {result.latestKline.close >= result.latestKline.open ? '+' : ''}
                        {((result.latestKline.close - result.latestKline.open) / result.latestKline.open * 100).toFixed(2)}%
                      </Text>
                    </View>
                  )}
                  <View style={styles.stockSignals}>
                    <SignalBadge signal="BUY" />
                    <Text style={styles.signalCount}>{result.analysis.buySignals}</Text>
                    {result.analysis.sellSignals > 0 && (
                      <>
                        <SignalBadge signal="SELL" />
                        <Text style={styles.signalCount}>{result.analysis.sellSignals}</Text>
                      </>
                    )}
                  </View>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}

      {topStocks.length > 0 && filteredResults.length === 0 && (
        <View style={styles.emptySection}>
          <Text style={styles.emptyText}>没有找到匹配的股票</Text>
        </View>
      )}

      {topRatedStocks.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>高评分股票 (4星及以上)</Text>
          <View style={styles.stockList}>
            {topRatedStocks.map(result => (
              <View key={result.stock.code} style={styles.stockItem}>
                <View style={styles.stockLeft}>
                  <Text style={styles.stockCode}>{result.stock.code}</Text>
                  <Text style={styles.stockName}>{result.stock.name}</Text>
                </View>
                <View style={styles.stockRight}>
                  <StarRating rating={result.analysis.starRating} />
                  <Text style={styles.stockScore}>{result.analysis.overallScore}分</Text>
                </View>
                {result.latestKline && (
                  <View style={styles.stockPrice}>
                    <Text style={styles.priceValue}>{result.latestKline.close.toFixed(2)}</Text>
                    <Text style={result.latestKline.close >= result.latestKline.open ? styles.priceUp : styles.priceDown}>
                      {result.latestKline.close >= result.latestKline.open ? '+' : ''}
                      {((result.latestKline.close - result.latestKline.open) / result.latestKline.open * 100).toFixed(2)}%
                    </Text>
                  </View>
                )}
              </View>
            ))}
          </View>
        </View>
      )}

      {buySignalStocks.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>买入信号较多股票 (≥3个)</Text>
          <View style={styles.signalList}>
            {buySignalStocks.map(result => (
              <View key={result.stock.code} style={styles.signalItem}>
                <View style={styles.signalLeft}>
                  <Text style={styles.signalCode}>{result.stock.code}</Text>
                  <Text style={styles.signalName}>{result.stock.name}</Text>
                </View>
                <View style={styles.signalRight}>
                  <SignalBadge signal="BUY" />
                  <Text style={styles.signalCount}>{result.analysis.buySignals}个</Text>
                </View>
              </View>
            ))}
          </View>
        </View>
      )}

      {!summary && isConnected && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>开始分析</Text>
          <View style={styles.emptyAnalysis}>
            <Text style={styles.emptyAnalysisText}>点击下方按钮开始运行25个策略分析</Text>
            <TouchableOpacity
              style={styles.runButton}
              onPress={handleRunAnalysis}
              disabled={isRunning}
            >
              <Text style={styles.runButtonText}>
                {isRunning ? `分析中 ${progress.current}/${progress.total}...` : '运行策略筛选'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {Object.keys(meta).length > 0 && (
        <View style={styles.section}>
          <TouchableOpacity
            style={styles.sectionHeader}
            onPress={() => setShowMeta(!showMeta)}
            activeOpacity={0.7}
          >
            <Text style={styles.sectionTitle}>元数据 ({Object.keys(meta).length})</Text>
            <Text style={styles.toggleIcon}>{showMeta ? '▼' : '▶'}</Text>
          </TouchableOpacity>
          {showMeta && (
            <View>
              {Object.entries(meta).map(([key, value]) => (
                <View key={key} style={styles.infoRow}>
                  <Text style={styles.infoLabel}>{key}:</Text>
                  <Text style={styles.infoValue}>{value}</Text>
                </View>
              ))}
            </View>
          )}
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
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  toggleIcon: {
    color: '#00d4ff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  statusLabel: {
    color: '#6b7280',
    fontSize: 16,
  },
  statusConnected: {
    color: '#10b981',
    fontSize: 16,
    fontWeight: 'bold',
  },
  statusDisconnected: {
    color: '#ef4444',
    fontSize: 16,
    fontWeight: 'bold',
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  infoLabel: {
    color: '#6b7280',
    fontSize: 14,
  },
  infoValue: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '500',
  },
  importButton: {
    backgroundColor: '#6366f1',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 8,
  },
  importButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  runButton: {
    backgroundColor: '#00d4ff',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 12,
  },
  runButtonText: {
    color: '#0a0a0f',
    fontSize: 18,
    fontWeight: 'bold',
  },
  perfToggle: {
    marginTop: 12,
    padding: 8,
    alignItems: 'center',
  },
  perfToggleText: {
    color: '#00d4ff',
    fontSize: 12,
  },
  perfReport: {
    marginTop: 8,
    padding: 12,
    backgroundColor: '#0f3460',
    borderRadius: 8,
  },
  perfLine: {
    color: '#94a3b8',
    fontSize: 11,
    fontFamily: 'monospace',
    lineHeight: 18,
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
  stockList: {
    // 移除maxHeight限制，让外层ScrollView自然滚动
  },
  stockItem: {
    padding: 12,
    backgroundColor: '#0f3460',
    borderRadius: 8,
    marginBottom: 8,
  },
  stockLeft: {
    marginBottom: 8,
  },
  stockCode: {
    color: '#00d4ff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  stockName: {
    color: '#ffffff',
    fontSize: 16,
  },
  stockRight: {
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
  stockScore: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  stockPrice: {
    flexDirection: 'row',
    gap: 12,
  },
  priceValue: {
    color: '#ffffff',
    fontSize: 14,
  },
  priceUp: {
    color: '#10b981',
    fontSize: 14,
  },
  priceDown: {
    color: '#ef4444',
    fontSize: 14,
  },
  stockTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  stockBottom: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  stockSignals: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  emptySection: {
    backgroundColor: '#16213e',
    borderRadius: 12,
    padding: 32,
    alignItems: 'center',
    marginBottom: 16,
  },
  signalList: {
    // 移除maxHeight限制
  },
  signalItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    backgroundColor: '#0f3460',
    borderRadius: 8,
    marginBottom: 8,
  },
  signalLeft: {
    flex: 1,
  },
  signalCode: {
    color: '#00d4ff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  signalName: {
    color: '#ffffff',
    fontSize: 14,
  },
  signalRight: {
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
  emptyAnalysis: {
    alignItems: 'center',
    padding: 32,
  },
  emptyAnalysisText: {
    color: '#6b7280',
    fontSize: 16,
    marginBottom: 16,
  },
});
