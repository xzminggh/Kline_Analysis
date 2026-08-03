# 经验落盘: Stage 2 - 三源行情拉取器 (QuoteFetcher)

> 落盘日期: 2026-07-28
> 阶段: Stage 2
> 核心内容: 三源降级行情拉取 + 模块边界管理 + 真实网络验证

---

## 1. 核心架构模式

### 三源降级策略
```typescript
// 腾讯 → 新浪 → 东方财富 优先级
async function fetchKline(code, startDate, endDate) {
  try {
    return await fetchFromTencent(...);  // 首选：支持日期范围
  } catch {}

  try {
    return await fetchFromSina(...);     // 备选：需要日期过滤
  } catch {}

  try {
    return await fetchFromEastmoney(...); // 最后：需要请求头
  } catch {}

  return { success: false, error: '三源全部失败' };
}
```

**设计要点**:
- 腾讯：支持精确日期范围，返回数据量最小
- 新浪：不支持日期范围，需要拉取后过滤
- 东方财富：需要添加 `User-Agent` 和 `Referer` 请求头才能连通

### 模块边界铁律
```
QuoteFetcher.ts 只做网络层，不碰:
  - db (SQLiteProvider)
  - UI (React Native components)
  - 策略 (strategies/)
  - 指标 (indicators/)

返回统一格式 KlineDaily[]，方便后续处理
```

---

## 2. 踩坑记录

### 坑点 1: 东财直连被服务器重置
- **现象**: `SocketError: other side closed` / `UND_ERR_SOCKET`
- **原因**: 东方财富服务器对非浏览器请求进行拦截
- **解决**: 添加请求头模拟浏览器
  ```typescript
  headers: {
    'User-Agent': 'Mozilla/5.0 ...',
    'Referer': 'https://quote.eastmoney.com/',
  }
  ```

### 坑点 2: 新浪返回非标准 JSON
- **现象**: `JSON.parse()` 失败
- **原因**: 新浪有时返回类似 JSONP 的格式
- **解决**: 正则提取数组部分
  ```typescript
  const match = text.match(/\[[\s\S]*\]/);
  if (match) json = JSON.parse(match[0]);
  ```

### 坑点 3: 成交量单位不一致
- **现象**: 数据源返回的成交量是"手"而非"股"
- **解决**: 统一乘以 100 转换
  ```typescript
  volume: parseFloat(item.volume) * 100  // 手 → 股
  ```

---

## 3. 单元测试策略

### Mock vs 真实网络测试
- **单元测试**: 使用 Jest mock `global.fetch`，覆盖降级逻辑、错误处理、边界条件
- **真实网络测试**: 独立脚本 `scripts/test_real_quote.js`，验证接口可用性

### 测试覆盖场景
1. 腾讯成功 → 直接返回，不尝试其他源
2. 腾讯失败 → 新浪成功 → 降级成功
3. 腾讯+新浪失败 → 东财成功 → 二级降级
4. 三源全败 → 返回错误信息
5. 停牌 → 返回空数组（不报错）
6. 市场前缀推断 → 沪/深/北交所
7. 新浪日期过滤 → 按范围裁剪
8. HTTP 错误 → 降级到下一源

---

## 4. 可扩展方向

### 运行时健康状态监控
```typescript
// 当前实现为静态状态，可扩展为：
const sourceStats = {
  tencent: { success: 0, fail: 0, avgLatency: 0 },
  sina: { success: 0, fail: 0, avgLatency: 0 },
  eastmoney: { success: 0, fail: 0, avgLatency: 0 },
};
```

### 批量拉取优化
- 当前为单股拉取，可扩展为批量接口
- LRU 缓存最近 30 只股票数据

### 重试策略
- 当前失败立即切换下一源
- 可考虑指数退避重试

---

## 5. 关键代码片段

### 超时控制
```typescript
const controller = new AbortController();
const timer = setTimeout(() => controller.abort(), 5000);

try {
  const response = await fetch(url, { signal: controller.signal });
  clearTimeout(timer);
  // ...
} catch (err) {
  clearTimeout(timer);
  throw err;
}
```

### 数据归一化
```typescript
// 腾讯格式: ["date", "open", "close", "high", "low", "volume"]
return rawData.map((item: string[]) => ({
  code,
  date: item[0],
  open: parseFloat(item[1]),
  close: parseFloat(item[2]),
  high: parseFloat(item[3]),
  low: parseFloat(item[4]),
  volume: parseFloat(item[5]) * 100,
  amount: 0,
}));

// 东方财富格式: "date,open,close,high,low,volume,amount"
return rawKlines.map((line: string) => {
  const parts = line.split(',');
  return {
    code,
    date: parts[0],
    open: parseFloat(parts[1]),
    close: parseFloat(parts[2]),
    high: parseFloat(parts[3]),
    low: parseFloat(parts[4]),
    volume: parseFloat(parts[5]) * 100,
    amount: parseFloat(parts[6]) || 0,
  };
});
```

---

## 6. 质检清单

- [x] 单元测试: 52/52 ✅ (新增 11 个)
- [x] 全量回归: 52/52 ✅ (无现有测试被破坏)
- [x] 模块边界: ✅ (新增在 services/, 未碰 db/UI/策略/指标)
- [x] 真实网络测试: 腾讯 ✅ 新浪 ✅ 东财 ✅
- [x] 双推: Gitee ✅ / GitHub ⚠️ (网络问题)

---

## 7. 双推状态

- Commit: `95e8863`
- Gitee: ✅ 已推送
- GitHub: ⚠️ 网络连接失败（需手动重试）

---

> 落盘原则：成功案例提炼 + 核心代码保存 + 可复用模式沉淀