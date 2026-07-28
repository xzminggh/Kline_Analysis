# 经验落盘: Stage 3 - 补齐编排 + SQLite 增量写入 (KlineFiller + FillCache)

> 落盘日期: 2026-07-28
> 阶段: Stage 3
> 核心内容: 补齐编排层设计 + LRU 缓存 + 并发控制 + 熔断机制

---

## 1. 核心架构模式

### 分层设计
```
UI 层 (Stage 4/5)
  ↓ 调用
KlineFiller (编排层)
  ├─ FillCache (内存缓存)
  ├─ QuoteFetcher (网络层)
  ├─ tradingCalendar (工具层)
  └─ SQLiteProvider (数据层)
```

**KlineFiller 职责**:
- 单股补齐: 查最新日期 → 算缺失交易日 → 拉取 → 写入 → 更新缓存
- 批量补齐: 遍历股票列表，进度回调，逐只补齐
- 并发控制: `isFilling` 互斥锁防止并发补齐同一批次
- 熔断: 连续失败 > 3 次则暂停当前批次

**FillCache 职责**:
- LRU 缓存最近 30 只股票
- TTL 过期机制（默认 5 分钟）
- 纯内存，不碰 db

---

## 2. 踩坑记录

### 坑点 1: Jest mock 与 Date 全局替换冲突
- **现象**: KlineFiller 测试中用 `global.Date = class extends originalDate` 固定日期，但 Jest 的 mock 系统在某些版本下会缓存模块
- **解决**: 在 `beforeEach` 中 `jest.clearAllMocks()`，mock 放在测试文件顶部，确保每个测试独立

### 坑点 2: FillCache TTL 测试的精度问题
- **现象**: `Date.now() - entry.filledAt > this.ttlMs` 当 ttlMs=0 时，0>0 为 false，不会过期
- **解决**: 测试中使用 ttlMs=1 配合 busy wait (5ms) 确保过期
  ```typescript
  const shortCache = new FillCache(10, 1);
  shortCache.set('600519', '2026-07-25');
  const start = Date.now();
  while (Date.now() - start < 5) {}
  expect(shortCache.has('600519')).toBe(false);
  ```

### 坑点 3: 批量补齐并发拒绝逻辑
- **现象**: `fillBatch` 内部调用 `fillSingle`，而 `fillSingle` 不检查 `isFilling`，只有 `fillBatch` 检查
- **解决**: 保持设计——`fillSingle` 可独立调用，`fillBatch` 做并发控制。并发场景下第二个 `fillBatch` 直接被拒

---

## 3. 单元测试策略

### Mock 分层
```typescript
// 1. mock QuoteFetcher
jest.mock('./QuoteFetcher', () => ({
  fetchKline: jest.fn(),
}));

// 2. mock tradingCalendar
jest.mock('../utils/tradingCalendar', () => ({
  isTradingDay: jest.fn(() => true),
  getLastTradingDay: jest.fn((date) => date),
  getMissingTradingDays: jest.fn((start, end) => [...]),
}));

// 3. mock db 对象
function createMockDb(rows) {
  return {
    getFirstAsync: jest.fn(async (sql, params) => ({ maxDate: rows[params[0]] || null })),
    runAsync: jest.fn(async () => ({ changes: 1 })),
  };
}
```

### 测试覆盖场景
- FillCache: 初始为空 / set/get / LRU 淘汰 / 重复 set / TTL 过期 / clear / entries
- KlineFiller: 数据库未连接 / 已有最新数据 / 缓存命中 / 拉取成功写入 / 拉取失败 / 停牌 / force 模式 / 批量补齐 / 并发拒绝 / 熔断 / 进度回调 / isFilling 状态

---

## 4. 可扩展方向

### 运行时健康状态监控
```typescript
// 当前熔断仅统计连续失败次数，可扩展为：
interface SourceHealth {
  success: number;
  fail: number;
  avgLatency: number;
  lastSuccess: number;
}
```

### 批量写入优化
- 当前为逐条 `runAsync`，可扩展为事务批量写入
- SQLite 事务可大幅提升写入性能

### 智能重试
- 当前失败立即切换下一源，可考虑指数退避重试
- 不同错误类型采用不同策略（网络错误重试，HTTP 500 降级）

---

## 5. 关键代码片段

### 互斥锁 + 熔断
```typescript
async fillBatch(codes, db, onProgress) {
  if (this.isFilling) {
    return { total: codes.length, skipped: codes.length, ... };
  }

  this.isFilling = true;
  this.consecutiveFailures = 0;

  try {
    for (let i = 0; i < codes.length; i++) {
      if (this.consecutiveFailures >= this.maxConsecutiveFailures) {
        // 熔断：跳过剩余
        break;
      }
      // ... 单股补齐
    }
  } finally {
    this.isFilling = false;
    this.consecutiveFailures = 0;
  }
}
```

### INSERT OR REPLACE
```typescript
const sql = `
  INSERT OR REPLACE INTO kline_daily
    (code, date, open, high, low, close, volume, amount)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`;

for (const k of klines) {
  try {
    await db.runAsync(sql, [k.code, k.date, ...]);
  } catch (error) {
    // 单条失败继续写入其他
  }
}
```

---

## 6. 质检清单

- [x] 单元测试: 73/73 ✅ (新增 21 个)
- [x] 全量回归: 73/73 ✅ (无现有测试被破坏)
- [x] 模块边界: ✅ (新增在 services/, 未碰 db/UI/策略/指标)
- [x] 双推: Gitee ✅ / GitHub ✅

---

## 7. 双推状态

- Commit: `d255972`
- Gitee: ✅ 已推送
- GitHub: ✅ 已推送

---

> 落盘原则：成功案例提炼 + 核心代码保存 + 可复用模式沉淀