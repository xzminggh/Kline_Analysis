import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView } from 'react-native';

export interface FilterState {
  keyword: string;
  starRating: number | null;
  signalType: 'ALL' | 'BUY' | 'SELL';
  minScore: number | null;
  sortBy: 'score' | 'buySignals' | 'sellSignals';
  sortOrder: 'asc' | 'desc';
}

const defaultFilters: FilterState = {
  keyword: '',
  starRating: null,
  signalType: 'ALL',
  minScore: null,
  sortBy: 'score',
  sortOrder: 'desc',
};

interface SearchFilterProps {
  totalCount: number;
  onFilterChange: (filters: FilterState) => void;
}

export default function SearchFilter({ totalCount, onFilterChange }: SearchFilterProps) {
  const [filters, setFilters] = useState<FilterState>(defaultFilters);
  const [expanded, setExpanded] = useState(false);

  const updateFilters = (updates: Partial<FilterState>) => {
    const newFilters = { ...filters, ...updates };
    setFilters(newFilters);
    onFilterChange(newFilters);
  };

  const resetFilters = () => {
    setFilters(defaultFilters);
    onFilterChange(defaultFilters);
  };

  const StarButton({ star }: { star: number }) {
    const active = filters.starRating === star;
    return (
      <TouchableOpacity
      style={[styles.starBtn, active && styles.starBtnActive]}
      onPress={() => updateFilters({ starRating: active ? null : star })}
    >
      <Text style={[styles.starBtnText, active && styles.starBtnTextActive]}>
        ★ {star}
      </Text>
    </TouchableOpacity>
  );
}

  return (
    <View style={styles.container}>
      <View style={styles.searchRow}>
        <TextInput
          style={styles.searchInput}
          placeholder="搜索代码/名称"
          placeholderTextColor="#6b7280"
          value={filters.keyword}
          onChangeText={text => updateFilters({ keyword: text })}
        />
        <TouchableOpacity style={styles.expandBtn} onPress={() => setExpanded(!expanded)}>
          <Text style={styles.expandBtnText}>{expanded ? '收起' : '筛选'}</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.resultCount}>共 {totalCount} 只股票</Text>

      {expanded && (
        <View style={styles.expandedPanel}>
          <Text style={styles.filterLabel}>星级筛选</Text>
          <View style={styles.starRow}>
            {[5, 4, 3, 2, 1].map(s => (
              <StarButton key={s} star={s} />
            ))}
          </View>

          <Text style={styles.filterLabel}>信号类型</Text>
          <View style={styles.signalRow}>
            {[
              { key: 'ALL', label: '全部' },
              { key: 'BUY', label: '买入' },
              { key: 'SELL', label: '卖出' },
            ].map(opt => (
                <TouchableOpacity
                  key={opt.key}
                  style={[styles.signalBtn, filters.signalType === opt.key && styles.signalBtnActive]}
                  onPress={() => updateFilters({ signalType: opt.key as any })}
                >
                  <Text style={[styles.signalBtnText, filters.signalType === opt.key && styles.signalBtnTextActive]}>
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              ))}
          </View>

          <Text style={styles.filterLabel}>最低分数</Text>
          <View style={styles.scoreRow}>
            {[0, 20, 40, 60, 80].map(score => (
              <TouchableOpacity
                key={score}
                style={[styles.scoreBtn, filters.minScore === score && styles.scoreBtnActive]}
                onPress={() => updateFilters({ minScore: filters.minScore === score ? null : score })}
              >
                <Text style={[styles.scoreBtnText, filters.minScore === score && styles.scoreBtnTextActive]}>
                  {score === 0 ? '不限' : `${score}+`}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.filterLabel}>排序方式</Text>
          <View style={styles.sortRow}>
            {[
              { key: 'score', label: '综合分数' },
              { key: 'buySignals', label: '买入信号' },
              { key: 'sellSignals', label: '卖出信号' },
            ].map(opt => (
                <TouchableOpacity
                  key={opt.key}
                  style={[styles.sortBtn, filters.sortBy === opt.key && styles.sortBtnActive]}
                  onPress={() => {
                    const newOrder = filters.sortBy === opt.key && filters.sortOrder === 'desc' ? 'asc' : 'desc';
                    updateFilters({ sortBy: opt.key as any, sortOrder: newOrder });
                  }}
                >
                  <Text style={[styles.sortBtnText, filters.sortBy === opt.key && styles.sortBtnTextActive]}>
                    {opt.label} {filters.sortBy === opt.key ? (filters.sortOrder === 'desc' ? '↓' : '↑') : ''}
                  </Text>
                </TouchableOpacity>
              ))}
          </View>

          <TouchableOpacity style={styles.resetBtn} onPress={resetFilters}>
            <Text style={styles.resetBtnText}>重置筛选</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#16213e',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  searchInput: {
    flex: 1,
    backgroundColor: '#0f3460',
    color: '#ffffff',
    padding: 10,
    borderRadius: 8,
    fontSize: 14,
  },
  expandBtn: {
    backgroundColor: '#00d4ff',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
  },
  expandBtnText: {
    color: '#0a0a0f',
    fontSize: 14,
    fontWeight: 'bold',
  },
  resultCount: {
    color: '#6b7280',
    fontSize: 12,
    marginTop: 8,
  },
  expandedPanel: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#0f3460',
  },
  filterLabel: {
    color: '#6b7280',
    fontSize: 12,
    marginBottom: 8,
    marginTop: 12,
  },
  starRow: {
    flexDirection: 'row',
    gap: 8,
  },
  starBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: '#0f3460',
  },
  starBtnActive: {
    backgroundColor: '#fbbf24',
  },
  starBtnText: {
    color: '#6b7280',
    fontSize: 12,
    fontWeight: '500',
  },
  starBtnTextActive: {
    color: '#0a0a0f',
  },
  signalRow: {
    flexDirection: 'row',
    gap: 8,
  },
  signalBtn: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: '#0f3460',
  },
  signalBtnActive: {
    backgroundColor: '#10b981',
  },
  signalBtnText: {
    color: '#6b7280',
    fontSize: 12,
    fontWeight: '500',
  },
  signalBtnTextActive: {
    color: '#ffffff',
  },
  scoreRow: {
    flexDirection: 'row',
    gap: 8,
  },
  scoreBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: '#0f3460',
  },
  scoreBtnActive: {
    backgroundColor: '#6366f1',
  },
  scoreBtnText: {
    color: '#6b7280',
    fontSize: 12,
    fontWeight: '500',
  },
  scoreBtnTextActive: {
    color: '#ffffff',
  },
  sortRow: {
    flexDirection: 'row',
    gap: 8,
  },
  sortBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: '#0f3460',
  },
  sortBtnActive: {
    backgroundColor: '#a78bfa',
  },
  sortBtnText: {
    color: '#6b7280',
    fontSize: 12,
    fontWeight: '500',
  },
  sortBtnTextActive: {
    color: '#0a0a0f',
  },
  resetBtn: {
    marginTop: 16,
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#6b7280',
    alignItems: 'center',
  },
  resetBtnText: {
    color: '#6b7280',
    fontSize: 14,
  },
});
