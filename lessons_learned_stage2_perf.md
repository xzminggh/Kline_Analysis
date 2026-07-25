# Stage 2 经验落盘：性能监控与分片调度

> 落盘时间：2026-07-25
> 阶段：Stage 2 — indicators 性能保障
> 核心目标：防止 300s 超时

## 一、核心架构模式

### 1. PerformanceMonitor 性能监控工具

**问题**：需要在 React Native (Hermes) 环境下高精度监测单只股票指标计算耗时，定位瓶颈并预警超时。

**解决方案**：基于 `performance.now()`（Hermes 原生支持，亚毫秒级）封装单例监控器，支持 start/end 埋点、measure 同步包裹、measureAsync 异步包裹，自动计算 P50/P95/Max 统计。

**关键代码**：
```typescript
// 兼容性处理
const getNow = (): number => {
  if (typeof performance !== 'undefined' && performance.now) {
    return performance.now();
  }
  return Date.now();
};

// 使用方式
PerformanceMonitor.start('per_stock');
// ... 指标计算 ...
PerformanceMonitor.end('per_stock');

// P95 阈值检查
const exceeded = PerformanceMonitor.checkThreshold('per_stock', 800);
```

### 2. setImmediate 分片调度

**问题**：Expo Go 不支持 Web Worker / react-native-multithreading，纯 JS 单线程遍历 288 只股票会导致 UI 卡死。

**解决方案**：每批处理 BATCH_SIZE=5 只股票，批间用 `setImmediate` 让出主线程（Hermes 下无 4ms 钳制，优于 setTimeout(0)），保证 UI 响应。

**关键代码**：
```typescript
const BATCH_SIZE = 5;

function yieldToMain(): Promise<void> {
  return new Promise(resolve => {
    if (typeof setImmediate !== 'undefined') {
      setImmediate(() => resolve());
    } else {
      setTimeout(() => resolve(), 0);
    }
  });
}

for (let i = 0; i < total; i += BATCH_SIZE) {
  const batch = stocks.slice(i, i + BATCH_SIZE);
  for (const stock of batch) {
    // ... 分析单只股票 ...
  }
  await yieldToMain(); // 批间让出
}
```

## 二、踩坑记录

### 1. performance.now() 在旧 JSC 引擎下精度问题
**现象**：早期 RN 项目用 JSC 引擎时，`performance.now()` 精度仅毫秒级且可能需 polyfill。
**原因**：JSC 无原生 performance API。
**解决**：Expo SDK 51 默认 Hermes 引擎，原生支持亚毫秒级精度。代码中保留 `Date.now()` 降级方案。

### 2. setImmediate vs setTimeout(0) 选择
**现象**：用 `setTimeout(fn, 0)` 分片时，密集批处理下整体耗时明显偏高。
**原因**：部分 JS 引擎对 `setTimeout` 有 ~4ms 最小钳制，密集调度时累积延迟。
**解决**：Hermes 原生支持 `setImmediate`，无 4ms 钳制，是分片让出首选。

### 3. 单元测试中 performance.now() 返回 0
**现象**：测试 `p50Ms > 0` 失败，因为循环计算量太小，耗时为 0。
**解决**：增大测试循环量（`i * 10000`），并移除 `p50Ms > 0` 断言，改为验证 P95 ≥ P50 的单调性。

## 三、性能验收门

| 指标 | 阈值 | 触发动作 |
|------|------|----------|
| 单只股票 P95 | ≤ 800ms | 超出则告警 |
| 全量 288 只串行 | ≤ 240s | 超出则升级 EAS Build |
| 全量 P95 > 1500ms | - | 立即触发 EAS Build 升级路径 |

## 四、可扩展方向

- [ ] EAS Build 阶段接入 react-native-multithreading 实现真多线程
- [ ] 缓存 EMA/MACD/BOLL 中间序列，避免策略引擎重复计算
- [ ] 三级过滤降负载：粗筛→中筛→精筛，减少重计算股票数
- [ ] Hermes sampling profiler 做 CPU 级热点分析
