# 市场走势概况修复经验

> 落盘日期：2026-07-30 | 阶段：26策略App UI调试

## 核心问题

1. **数据不准确**：均线排列判断错误，近5日涨跌数据离谱
2. **无大盘整体状况**：只分析个股，没有市场整体信息

## 根因分析

| 问题 | 原因 |
|------|------|
| 均线粘合未检测 | 只检查多头/空头排列，未检测MA价差<2%的粘合状态 |
| 近5日涨跌不准 | 用实时价格对比数据库旧数据，数据源不一致 |
| 无大盘指数 | 缺少大盘指数获取功能 |

## 解决方案

### 1. 实时K线数据获取（Sina API）

```
https://money.finance.sina.com.cn/quotes_service/api/json_v2.php/CN_MarketData.getKLineData?symbol=sh600515&scale=240&ma=5&datalen=20
```

- 返回最近20个交易日K线数据
- JSON格式，可直接解析
- 用于替代过期的数据库数据

### 2. 大盘指数获取（腾讯API）

```
https://web.sqt.gtimg.cn/q=sh000001,sz399001,sz399006
```

- 同时获取上证/深证/创业板三大指数
- 用于显示市场整体状况

### 3. 均线粘合检测

```typescript
const maSpread = latestMA20 > 0 ? Math.abs(latestMA5 - latestMA20) / latestMA20 * 100 : 0;
if (maSpread < 2) {
  keyPoints.push(`均线粘合（MA5与MA20价差${maSpread.toFixed(1)}%），方向待确认`);
}
```

### 4. MarketOverview接口重构

```typescript
interface MarketOverview {
  indices: MarketIndex[];        // 大盘指数
  marketTrend: 'bullish' | 'bearish' | 'neutral';  // 大盘趋势
  marketSummary: string;         // 大盘摘要
  stockTrend: 'bullish' | 'bearish' | 'neutral';   // 个股趋势
  stockSummary: string;          // 个股摘要
  keyPoints: string[];           // 技术要点
  dataSource: 'realtime' | 'database';  // 数据来源
  dataDate: string;              // 数据截止日期
  riskWarning: string;
}
```

## 踩坑记录

1. **PowerShell不支持curl**：使用Invoke-WebRequest，需正确设置Headers
2. **Sina API返回JSON**：直接用res.json()解析，不用res.text()
3. **数据源降级**：实时数据获取失败时降级使用数据库数据，并标注日期

## 可扩展方向

1. 添加更多技术指标（KDJ、CCI等）
2. 添加板块热度分析
3. 添加涨跌家数统计
4. 添加资金流向分析
