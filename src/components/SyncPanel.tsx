/**
 * [wb修改] SyncPanel — 一键补齐面板（自包含组件）
 *
 * 功能：一键补齐按钮 + 实时进度条 + 补齐摘要（补了 X 只 / Y 根）+ 错误明细
 * 设计约束：
 *  - 全部逻辑自包含，OverviewScreen 只需插入 <SyncPanel /> 一行
 *  - 补齐前弹确认框（联网操作先确认；流量提示）
 *  - 运行中禁用按钮防重入
 *  - 复权拒绝/三源全挂等错误在摘要区展示前 5 条
 */

import React, { useCallback, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { useDatabase } from '../database/SQLiteProvider';
import { runFullSync, type SyncSummary } from '../services/SyncService';

interface ProgressState {
  done: number;
  total: number;
  currentCode: string;
}

export const SyncPanel: React.FC = () => {
  const { db, isConnected } = useDatabase();
  const [syncing, setSyncing] = useState(false);
  const [progress, setProgress] = useState<ProgressState | null>(null);
  const [summary, setSummary] = useState<SyncSummary | null>(null);

  const doSync = useCallback(async () => {
    if (!db) return;
    setSyncing(true);
    setSummary(null);
    setProgress(null);
    try {
      const result = await runFullSync(db, (done, total, currentCode) => {
        setProgress({ done, total, currentCode });
      });
      setSummary(result);
      if (result.rejected) {
        Alert.alert(
          '部分股票被拒绝',
          '检测到复权基准与本地数据不一致的股票，已拒绝写入以保护数据。详见下方错误明细。',
          [{ text: '知道了' }]
        );
      }
    } catch (e) {
      Alert.alert('补齐失败', e instanceof Error ? e.message : String(e), [{ text: '确定' }]);
    } finally {
      setSyncing(false);
      setProgress(null);
    }
  }, [db]);

  const handlePress = useCallback(() => {
    if (!isConnected || !db) {
      Alert.alert('未连接数据库', '请先导入数据库后再补齐', [{ text: '确定' }]);
      return;
    }
    Alert.alert(
      '联网补齐K线',
      '将联网抓取最新日K并补齐本地缺失数据。\n\n· 只新增缺失K线，绝不修改已有历史\n· 建议在 WiFi 环境下执行\n\n开始补齐？',
      [
        { text: '取消', style: 'cancel' },
        { text: '开始补齐', onPress: () => void doSync() },
      ]
    );
  }, [isConnected, db, doSync]);

  const pct = progress && progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>联网补齐</Text>

      <TouchableOpacity
        style={[styles.syncButton, syncing && styles.syncButtonDisabled]}
        onPress={handlePress}
        disabled={syncing}
      >
        <Text style={styles.syncButtonText}>
          {syncing
            ? progress
              ? `补齐中 ${progress.done}/${progress.total} (${progress.currentCode})`
              : '准备中...'
            : '一键补齐最新K线'}
        </Text>
      </TouchableOpacity>

      {syncing && progress && (
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${pct}%` }]} />
        </View>
      )}

      {summary && !syncing && (
        <View style={styles.summaryBox}>
          <Text style={styles.summaryTitle}>
            补齐完成：补了 {summary.patchedStocks} 只 / {summary.insertedBars} 根
          </Text>
          <Text style={styles.summaryLine}>
            共 {summary.totalStocks} 只 · 补齐 {summary.patchedStocks} · 跳过 {summary.skippedStocks}（指数）
            {summary.failedStocks > 0 ? ` · 失败 ${summary.failedStocks}` : ''}
            {summary.rejected ? ' · 有复权拒绝' : ''}
          </Text>
          {summary.errors.slice(0, 5).map((e) => (
            <Text key={e.code} style={styles.errorLine}>
              {e.code}: {e.error}
            </Text>
          ))}
          {summary.errors.length > 5 && (
            <Text style={styles.errorLine}>…另有 {summary.errors.length - 5} 条错误</Text>
          )}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  section: {
    backgroundColor: '#16213e',
    borderRadius: 8,
    padding: 16,
    marginBottom: 16,
  },
  sectionTitle: {
    color: '#00d4ff',
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 12,
  },
  syncButton: {
    backgroundColor: '#00d4ff',
    borderRadius: 6,
    paddingVertical: 12,
    alignItems: 'center',
  },
  syncButtonDisabled: {
    backgroundColor: '#3a5068',
  },
  syncButtonText: {
    color: '#1a1a2e',
    fontSize: 15,
    fontWeight: 'bold',
  },
  progressTrack: {
    height: 6,
    backgroundColor: '#0f3460',
    borderRadius: 3,
    marginTop: 12,
    overflow: 'hidden',
  },
  progressFill: {
    height: 6,
    backgroundColor: '#00d4ff',
    borderRadius: 3,
  },
  summaryBox: {
    marginTop: 12,
    backgroundColor: '#0f3460',
    borderRadius: 6,
    padding: 12,
  },
  summaryTitle: {
    color: '#4ade80',
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  summaryLine: {
    color: '#e0e0e0',
    fontSize: 12,
    marginBottom: 4,
  },
  errorLine: {
    color: '#f87171',
    fontSize: 11,
    marginTop: 2,
  },
});
