import React, { useEffect, useState, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, TouchableOpacity, Alert } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useDatabase } from '../database/SQLiteProvider';
import { getAnalysisSummary, getAllAnalysis, runAnalysis, getFilteredResults, getEnabledStrategyIds } from '../services/AnalysisService';
import * as DocumentPicker from 'expo-document-picker';
import SearchFilter, { FilterState } from '../components/SearchFilter';
import Dashboard from '../components/Dashboard';
import { SyncPanel } from '../components/SyncPanel'; // [wb修改] 联网补齐面板

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
  const { isConnected, db, getTables, getStockCount, getKlineCount, getStocks, getKlineByCode, importDatabase } = useDatabase();
  const [tables, setTables] = useState<string[]>([]);
  const [stockCount, setStockCount] = useState(0);
  const [klineCount, setKlineCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [filler] = useState(() => new KlineFiller());
  const [isFilling, setIsFilling] = useState(false);
  const [fillProgress, setFillProgress] = useState({ current: 0, total: 0, message: '' });
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
      const [ts, sc, kc] = await Promise.all([
        getTables(),
        getStockCount(),
        getKlineCount(),
      ]);
      setTables(ts);
      setStockCount(sc);
      setKlineCount(kc);
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
      const enabledIds = getEnabledStrategyIds();
      if (enabledIds.length === 0) {
        setTopStocks([]);
        setSummary(null);
        setIsRunning(false);
        return;
      }
      const results = await runAnalysis(stocks, getKlineByCode, (current, total) => {
        setProgress({ current, total });
      }, enabledIds);
      setTopStocks(results);
      setSummary(getAnalysisSummary());
    } catch (error) {
      console.error('Analysis failed:', error);
    } finally {
      setIsRunning(false);
    }
  };

  const handleFillAll = async () => {
    if (!isConnected || !db) {
      Alert.alert('提示', '数据库未连接，请先导入数据库', [{ text: '确定' }]);
      return;
    }

    const stocks = await getStocks();
    if (stocks.length === 0) {
      Alert.alert('提示', '没有可补齐的股票', [{ text: '确定' }]);
      return;
    }

    const total = stocks.length;
    const BATCH_SIZE = 50;
    const batchCount = Math.ceil(total / BATCH_SIZE);
    const confirmMessage =
      batchCount > 1
        ? `即将对 ${total} 只股票分 ${batchCount} 批进行补齐，是否继续？`
        : `即将对 ${total} 只股票进行补齐，是否继续？`;

    Alert.alert('确认补齐', confirmMessage, [
      { text: '取消', style: 'cancel' },
      {
        text: '确认',
        onPress: async () => {
          setIsFilling(true);
          setFillProgress({ current: 0, total, message: '准备补齐...' });

          try {
            const allCodes = stocks.map((s) => s.code);
            let totalSuccess = 0;
            let totalFailed = 0;
            let totalSkipped = 0;

            for (let b = 0; b < batchCount; b++) {
              const batchStart = b * BATCH_SIZE;
              const batchCodes = allCodes.slice(batchStart, batchStart + BATCH_SIZE);

              const result = await filler.fillBatch(batchCodes, db, (p) => {
                setFillProgress({
                  current: batchStart + p.current,
                  total,
                  message: `第${b + 1}/${batchCount}批: ${p.code} (${batchStart + p.current}/${total})`,
                });
              });

              totalSuccess += result.success;
              totalFailed += result.failed;
              totalSkipped += result.skipped;
            }

            // 刷新 K 线数量
            const newKlineCount = await getKlineCount();
            setKlineCount(newKlineCount);

            const message =
              `补齐完成\n` +
              `成功: ${totalSuccess}\n` +
              `失败: ${totalFailed}\n` +
              `跳过: ${totalSkipped}`;
            Alert.alert('补齐完成', message, [{ text: '确定' }]);
          } catch (error: any) {
            console.error('Fill failed:', error);
            Alert.alert('补齐失败', error?.message || '发生未知错误', [{ text: '确定' }]);
          } finally {
            setIsFilling(false);
            setFillProgress({ current: 0, total: 0, message: '' });
          }
        },
      },
    ]);
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

      {/* [wb修改] 联网补齐面板（自包含组件，仅此一行接入） */}
      <SyncPanel />

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
        <TouchableOpacity
          style={[styles.fillButton, isFilling && styles.fillButtonDisabled]}
          onPress={handleFillAll}
          disabled={isFilling || isRunning}
        >
          <Text style={styles.fillButtonText}>
            {isFilling
              ? `补齐中 ${fillProgress.current}/${fillProgress.total}...`
              : '补齐最新 K 线'}
          </Text>
        </TouchableOpacity>
        {isFilling && fillProgress.message.length > 0 && (
          <View style={styles.fillProgressSection}>
            <View style={styles.progressBarContainer}>
              <View
                style={[
                  styles.progressBarFill,
                  {
                    width:
                      fillProgress.total > 0
                        ? `${(fillProgress.current / fillProgress.total) * 100}%`
                        : '0%',
                  },
                ]}
              />
            </View>
            <Text style={styles.progressText}>{fillProgress.message}</Text>
          </View>
        )}
      </View>

      {summary && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>分析概览</Text>
          <Dashboard summary={summary} />
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
      )}

      {topStocks.length > 0 && (
        <SearchFilter
          totalCount={filteredResults.length}
          onFilterChange={setFilters}
        />
      )}

      {topStocks.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>筛选结果 ({filteredResults.length})</Text>
          <ScrollView horizontal style={styles.starTabs}>
            <TouchableOpacity
              style={[styles.starTab, filters.starRating === null && styles.starTabActive]}
              onPress={() => setFilters(f => ({ ...f, starRating: null }))}
            >
              <Text style={[styles.starTabText, filters.starRating === null && styles.starTabTextActive]}>全部</Text>
            </TouchableOpacity>
            {[5, 4, 3, 2, 1].map(star => (
              <TouchableOpacity
                key={star}
                style={[styles.starTab, filters.starRating === star && styles.starTabActive]}
                onPress={() => setFilters(f => ({ ...f, starRating: star }))}
              >
                <Text style={[styles.starTabText, filters.starRating === star && styles.starTabTextActive]}>{star}星</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
          {filteredResults.length > 0 && (
            <ScrollView style={styles.stockList} showsVerticalScrollIndicator={true} persistentScrollbar={true} nestedScrollEnabled={true}>
              {filteredResults.map(result => (
                <TouchableOpacity
                  key={result.stock.code}
                  style={styles.stockItem}
                  onPress={() => (navigation as any).navigate('详情', { stockCode: result.stock.code })}
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
            </ScrollView>
          )}
        </View>
      )}

      {topStocks.length > 0 && filteredResults.length === 0 && (
        <View style={styles.emptySection}>
          <Text style={styles.emptyText}>没有找到匹配的股票</Text>
        </View>
      )}

      {!summary && isConnected && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>开始分析</Text>
          <View style={styles.emptyAnalysis}>
            <Text style={styles.emptyAnalysisText}>点击下方按钮开始运行26个策略分析</Text>
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
  fillButton: {
    backgroundColor: '#10b981',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 16,
  },
  fillButtonDisabled: {
    backgroundColor: '#374151',
  },
  fillButtonText: {
    color: '#0a0a0f',
    fontSize: 18,
    fontWeight: 'bold',
  },
  fillProgressSection: {
    marginTop: 12,
  },
  progressBarContainer: {
    height: 8,
    backgroundColor: '#0f3460',
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#00d4ff',
    borderRadius: 4,
  },
  progressText: {
    color: '#94a3b8',
    fontSize: 12,
    marginTop: 8,
    textAlign: 'center',
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
  starTabs: {
    flexDirection: 'row',
    marginBottom: 12,
  },
  starTab: {
    backgroundColor: '#0f3460',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    marginRight: 8,
  },
  starTabActive: {
    backgroundColor: '#00d4ff',
  },
  starTabText: {
    color: '#ffffff',
    fontSize: 12,
  },
  starTabTextActive: {
    color: '#0a0a0f',
    fontWeight: 'bold',
  },
  stockList: {
    maxHeight: 400,
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
  emptyText: { // [wb修改] 补齐缺失样式：原引用不存在导致文字用默认黑色，深色背景下几乎不可见
    color: '#6b7280',
    fontSize: 15,
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
