import { PerformanceMonitor } from './PerformanceMonitor';

describe('PerformanceMonitor', () => {
  beforeEach(() => {
    PerformanceMonitor.clear();
  });

  test('start/end 记录耗时', () => {
    PerformanceMonitor.start('test1');
    // 模拟一些工作
    for (let i = 0; i < 1000; i++) { Math.sqrt(i); }
    const duration = PerformanceMonitor.end('test1');
    expect(duration).toBeGreaterThanOrEqual(0);
  });

  test('measure 包裹同步函数', () => {
    const result = PerformanceMonitor.measure('sync_test', () => {
      let sum = 0;
      for (let i = 0; i < 100; i++) sum += i;
      return sum;
    });
    expect(result).toBe(4950);
    const stats = PerformanceMonitor.getStats('sync_test') as any;
    expect(stats.count).toBe(1);
  });

  test('多次记录后 P50/P95 统计正确', () => {
    for (let i = 0; i < 20; i++) {
      PerformanceMonitor.start('multi');
      // 变量延时，确保有可测量的耗时
      for (let j = 0; j < i * 10000; j++) { Math.sqrt(j); }
      PerformanceMonitor.end('multi');
    }
    const stats = PerformanceMonitor.getStats('multi') as any;
    expect(stats.count).toBe(20);
    expect(stats.p95Ms).toBeGreaterThanOrEqual(stats.p50Ms);
    expect(stats.maxMs).toBeGreaterThanOrEqual(stats.p95Ms);
  });

  test('checkThreshold 阈值检查', () => {
    PerformanceMonitor.start('threshold_test');
    for (let i = 0; i < 10000; i++) { Math.sqrt(i); }
    PerformanceMonitor.end('threshold_test');
    // 0ms 阈值应该触发
    const exceeded = PerformanceMonitor.checkThreshold('threshold_test', 0);
    expect(exceeded).toBe(true);
  });

  test('getReport 生成报告', () => {
    PerformanceMonitor.start('report_test');
    for (let i = 0; i < 100; i++) { Math.sqrt(i); }
    PerformanceMonitor.end('report_test');
    const report = PerformanceMonitor.getReport();
    expect(report).toContain('report_test');
    expect(report).toContain('count=1');
  });

  test('clear 清空记录', () => {
    PerformanceMonitor.start('clear_test');
    PerformanceMonitor.end('clear_test');
    PerformanceMonitor.clear();
    const stats = PerformanceMonitor.getStats('clear_test') as any;
    expect(stats.count).toBe(0);
  });
});
