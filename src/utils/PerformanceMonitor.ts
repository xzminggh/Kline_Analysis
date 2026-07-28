/**
 * 性能监控工具 — 防止 300s 超时
 * 使用 performance.now() 高精度埋点，统计 P50/P95/Max 耗时
 */

// 兼容性处理：Hermes 原生支持 performance.now()
// [wb修改] 类型修复：tsconfig lib 不含 DOM，为全局 performance 补类型声明（仅类型，无运行时代码）
declare const performance: undefined | { now: () => number };

const getNow = (): number => {
  if (typeof performance !== 'undefined' && performance.now) {
    return performance.now();
  }
  return Date.now();
};

export interface TimingRecord {
  label: string;
  duration: number; // 毫秒
  timestamp: number;
}

export interface PerfStats {
  label: string;
  count: number;
  totalMs: number;
  avgMs: number;
  p50Ms: number;
  p95Ms: number;
  maxMs: number;
  minMs: number;
}

class PerformanceMonitorImpl {
  private records: TimingRecord[] = [];
  private activeMarks: Map<string, number> = new Map();

  /**
   * 开始计时
   */
  start(label: string): void {
    this.activeMarks.set(label, getNow());
  }

  /**
   * 结束计时并记录
   */
  end(label: string): number {
    const startTime = this.activeMarks.get(label);
    if (startTime === undefined) {
      // 忽略未开始的标记（可能是clear()导致的状态丢失）
      return 0;
    }
    const duration = getNow() - startTime;
    this.activeMarks.delete(label);
    this.records.push({ label, duration, timestamp: Date.now() });
    return duration;
  }

  /**
   * 包裹同步函数，自动埋点
   */
  measure<T>(label: string, fn: () => T): T {
    this.start(label);
    const result = fn();
    this.end(label);
    return result;
  }

  /**
   * 包裹异步函数，自动埋点
   */
  async measureAsync<T>(label: string, fn: () => Promise<T>): Promise<T> {
    this.start(label);
    const result = await fn();
    this.end(label);
    return result;
  }

  /**
   * 获取某 label 的统计信息
   */
  getStats(label?: string): PerfStats | PerfStats[] {
    if (label) {
      return this.computeStats(label);
    }
    const labels = [...new Set(this.records.map(r => r.label))];
    return labels.map(l => this.computeStats(l));
  }

  private computeStats(label: string): PerfStats {
    const durations = this.records
      .filter(r => r.label === label)
      .map(r => r.duration)
      .sort((a, b) => a - b);

    if (durations.length === 0) {
      return {
        label,
        count: 0,
        totalMs: 0,
        avgMs: 0,
        p50Ms: 0,
        p95Ms: 0,
        maxMs: 0,
        minMs: 0,
      };
    }

    const total = durations.reduce((sum, d) => sum + d, 0);
    const p50Index = Math.floor(durations.length * 0.5);
    const p95Index = Math.floor(durations.length * 0.95);

    return {
      label,
      count: durations.length,
      totalMs: total,
      avgMs: total / durations.length,
      p50Ms: durations[p50Index] || 0,
      p95Ms: durations[p95Index] || 0,
      maxMs: durations[durations.length - 1],
      minMs: durations[0],
    };
  }

  /**
   * 检查是否超阈值
   */
  checkThreshold(label: string, thresholdMs: number): boolean {
    const stats = this.computeStats(label);
    return stats.p95Ms > thresholdMs;
  }

  /**
   * 输出完整性能报告
   */
  getReport(): string {
    const allStats = this.getStats() as PerfStats[];
    const lines = allStats.map(s => {
      return `[${s.label}] count=${s.count} avg=${s.avgMs.toFixed(1)}ms p50=${s.p50Ms.toFixed(1)}ms p95=${s.p95Ms.toFixed(1)}ms max=${s.maxMs.toFixed(1)}ms`;
    });
    const totalMs = allStats.reduce((sum, s) => sum + s.totalMs, 0);
    lines.push(`--- 总耗时: ${totalMs.toFixed(1)}ms ---`);

    // 性能验收门检查
    const perStock = this.computeStats('per_stock');
    if (perStock.count > 0 && perStock.p95Ms > 800) {
      lines.push(`⚠️ 警告: 单只股票 P95=${perStock.p95Ms.toFixed(1)}ms > 800ms 阈值，建议升级 EAS Build 多线程`);
    }

    return lines.join('\n');
  }

  /**
   * 清空记录
   */
  clear(): void {
    this.records = [];
    this.activeMarks.clear();
  }
}

export const PerformanceMonitor = new PerformanceMonitorImpl();
