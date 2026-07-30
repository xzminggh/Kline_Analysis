# 26策略App UI重构经验

> 落盘日期：2026-07-30 | 阶段：26策略App UI调试

## 核心问题与解决方案

### 1. 市场走势概况数据不准确

**问题**：均线排列判断错误，近5日涨跌数据离谱

**根因**：
- 均线粘合状态未检测（只检查多头/空头排列）
- 近5日涨跌用实时价格对比数据库旧数据，数据源不一致
- 无大盘整体状况显示

**解决方案**：
- 新增 `fetchRecentKline()` 从Sina API获取最近20日K线数据
- 新增 `fetchMarketIndices()` 从腾讯API获取三大指数
- 重构 `MarketOverview` 接口，分大盘+个股两区块
- 添加均线粘合检测（MA5/MA20价差<2%）

### 2. 详情页UI布局问题

**问题**：
- 头部三行布局浪费空间
- 分数显示无实际意义
- K线图重复显示代码名称
- 数据来源标签超出屏幕

**解决方案**：
- 头部改为两行布局（代码+名称+信号 | 价格+涨跌）
- 移除分数显示
- KlineChart移除stockCode/stockName显示
- 数据来源标签与趋势徽章同行显示

### 3. 数据库导入进度条问题

**问题**：进度显示"10/10"（权重系统），不是实际股票数量

**解决方案**：
- 导入后查询新数据库股票数量，返回 `stockCount`
- HomeScreen分两阶段显示进度：
  - 阶段1：导入数据库文件（权重进度）
  - 阶段2：加载股票数据（实际股票数 150/1745）

### 4. SQLite LogBox错误

**问题**：`console.error('getKlineByCode failed:', error)` 触发 "bad parameter or other API misuse"

**根因**：SQLite error对象包含React Native LogBox无法处理的特殊属性

**解决方案**：将error转换为字符串
```typescript
console.error('getKlineByCode failed:', String(error?.message || error));
```

### 5. K线图双击重置失效

**问题**：双击K线图无法重置到最新K线

**根因**：`evt.nativeEvent.touches.length === 0` 条件在某些设备上不满足

**解决方案**：移除该条件，简化双击检测逻辑
```typescript
if (!movedDuringTouch.current) {
  const timeDiff = now - lastTapTime.current;
  const xDiff = Math.abs(tapX - lastTapX.current);
  if (timeDiff < 300 && xDiff < 30) {
    // 双击重置
  }
}
```

---

## 技术要点

### API数据源

| API | 用途 | 格式 |
|-----|------|------|
| 腾讯API `web.sqt.gtimg.cn` | 实时行情、大盘指数 | `~`分隔字段 |
| Sina API `money.finance.sina.com.cn` | 近期K线数据 | JSON数组 |

### 腾讯API字段（以~分隔）

```
[1]=名称, [2]=代码, [3]=现价, [31]=涨跌额, [32]=涨跌幅
[39]=PE(动), [44]=总市值(亿), [45]=流通市值(亿), [46]=PB
```

### Sina K线API返回格式

```json
[{"day":"2026-07-30","open":"2.870","high":"2.960","low":"2.860","close":"2.920","volume":"123073164"}]
```

### MarketOverview接口

```typescript
interface MarketOverview {
  indices: MarketIndex[];        // 大盘指数
  marketTrend: 'bullish' | 'bearish' | 'neutral';
  marketSummary: string;
  stockTrend: 'bullish' | 'bearish' | 'neutral';
  stockSummary: string;
  keyPoints: string[];
  dataSource: 'realtime' | 'database';
  dataDate: string;
  riskWarning: string;
}
```

### 均线粘合检测

```typescript
const maSpread = latestMA20 > 0 ? Math.abs(latestMA5 - latestMA20) / latestMA20 * 100 : 0;
if (maSpread < 2) {
  keyPoints.push(`均线粘合（MA5与MA20价差${maSpread.toFixed(1)}%），方向待确认`);
}
```

### 市场情绪判断

```typescript
const avgChangePct = indices.reduce((sum, idx) => sum + idx.changePct, 0) / indices.length;
if (avgChangePct > 0.5) marketTrend = 'bullish';
else if (avgChangePct < -0.5) marketTrend = 'bearish';
```

### 个股走势投票系统

| 指标 | 多头加分 | 空头加分 |
|------|---------|---------|
| 均线排列 | 多头+2，短期多头+1 | 空头+2，短期空头+1 |
| MACD | 金叉+2，红柱放大+1 | 死叉+2，绿柱放大+1 |
| RSI | <30超卖+1，>50多方+1 | >70超买+1，<50空方+1 |
| 量价 | 放量上涨+1 | 放量下跌+1 |

---

## 踩坑记录

1. **PowerShell不支持curl**：使用 `Invoke-WebRequest`，需正确设置Headers
2. **Sina API返回JSON**：直接用 `res.json()` 解析
3. **数据源降级**：实时数据获取失败时降级使用数据库数据，并标注日期
4. **LogBox错误**：SQLite error对象需转换为字符串再传递给console.error
5. **双击检测**：移除 `touches.length === 0` 条件，提高设备兼容性
6. **进度条混淆**：SyncPanel是独立组件，有自己的进度状态，与HomeScreen的importProgress无关

---

## UI布局规范

### 详情页头部（两行）

```
┌─────────────────────────────────────────────────────┐
│  600515 海南高速                    [BUY]            │
│  2.92                              +0.04  +1.39%    │
└─────────────────────────────────────────────────────┘
```

### 大盘概况（含市场情绪）

```
┌─────────────────────────────────────────────────────┐
│  📊 大盘概况          市场情绪：偏弱                  │
│  ┌─────────────┬─────────────┬─────────────┐        │
│  │  上证指数    │  深证成指    │  创业板指    │        │
│  │  3804.69    │  13285.80   │  3244.62    │        │
│  │  -0.62%     │  -2.73%     │  -3.97%     │        │
│  └─────────────┴─────────────┴─────────────┘        │
└─────────────────────────────────────────────────────┘
```

### 走势概况（数据来源同行）

```
┌─────────────────────────────────────────────────────┐
│  600515 海南高速 走势概况                             │
│  ┌──────────┐  ┌──────────────────────────────┐    │
│  │  看多    │  │ 实时数据（2026-07-30）         │    │
│  └──────────┘  └──────────────────────────────┘    │
│  ...                                                │
└─────────────────────────────────────────────────────┘
```

### 进度条（两阶段）

```
阶段1：导入数据库
[██████████] 导入数据库文件 (3/6)

阶段2：加载股票
[████░░░░░░] 加载股票 (150/1745)
```

---

## 可扩展方向

1. 添加更多技术指标（KDJ、CCI、BOLL）
2. 添加板块热度分析
3. 添加涨跌家数统计
4. 添加资金流向分析
5. 添加自选股功能
6. 添加预警提醒功能

---

## 文件修改清单

| 文件 | 修改内容 |
|------|----------|
| `StockInfoFetcher.ts` | 新增 `fetchRecentKline()`、`fetchMarketIndices()`；重构 `fetchMarketOverview()` |
| `DetailScreen.tsx` | 头部两行布局、大盘概况卡片、走势概况重构、移除分数 |
| `HomeScreen.tsx` | 分两阶段进度条（导入+加载股票） |
| `SQLiteProvider.tsx` | 导入后查询股票数量、console.error修复 |
| `KlineChart.tsx` | 移除重复代码名称、双击重置修复 |
| `SettingsScreen.tsx` | 使用说明完善（新增数据来源说明） |
