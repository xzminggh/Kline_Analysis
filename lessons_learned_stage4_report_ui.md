# Stage 4 经验落盘：K线图与搜索过滤器

> 落盘时间：2026-07-25
> 阶段：Stage 4 — report_ui
> 核心目标：可视化K线 + 多维筛选

## 一、核心架构模式

### 1. SVG K线图组件（react-native-svg）

**问题**：在 Expo Go 环境下渲染可交互的K线图，蜡烛图 + 均线 + 布林带。

**解决方案**：基于 `react-native-svg` 构建纯 SVG K线图组件，支持 MA5/MA10/MA20/BOLL 切换显示。

**关键代码**：
```tsx
import Svg, { Line, Rect, Path, Text as SvgText, G } from 'react-native-svg';

// 坐标映射
const priceToY = (price: number) => {
  const ratio = (priceMax - price) / (priceMax - priceMin);
  return PADDING.top + ratio * chartHeight;
};
const indexToX = (index: number) => {
  return PADDING.left + index * (candleWidth + gap) + candleWidth / 2;
};

// 蜡烛渲染
<G key={i}>
  <Line x1={x} y1={highY} x2={x} y2={lowY} stroke={color} strokeWidth={1} />
  <Rect x={x - w/2} y={bodyTop} width={w} height={bodyH} fill={color} />
</G>

// 均线渲染 (Path)
<Path d={points.join(' ')} stroke={color} strokeWidth={1.5} fill="none" />
```

### 2. 6维搜索过滤器

**问题**：用户需要快速从全量股票中筛选出符合条件的标的。

**解决方案**：可折叠的 SearchFilter 组件，6个维度：
- 关键词搜索（代码/名称）
- 星级筛选（1-5星）
- 信号类型（全部/买入/卖出）
- 最低分数（不限/20+/40+/60+/80+）
- 排序方式（综合分数/买入信号数/卖出信号数）
- 升降序切换

**关键代码**：
```typescript
// useMemo 计算过滤结果
const filteredResults = useMemo(() => {
  let results = [...topStocks];
  if (filters.keyword) { /* 关键词过滤 */ }
  if (filters.starRating !== null) { /* 星级过滤 */ }
  if (filters.signalType !== 'ALL') { /* 信号类型过滤 */ }
  if (filters.minScore !== null) { /* 最低分数过滤 */ }
  results.sort((a, b) => { /* 排序 */ });
  return results;
}, [topStocks, filters]);
```

## 二、踩坑记录

### 1. react-native-svg Text 组件命名冲突
**现象**：`import { Text } from 'react-native-svg'` 与 RN 自带 Text 重名。
**解决**：重命名为 `Text as SvgText`，或使用 `<Text>` 标签时确保从正确模块导入。

### 2. 初始数据量为0时的崩溃
**现象**：`Math.min(...[]) = Infinity` 导致坐标计算 NaN。
**解决**：空数据时直接返回空状态，不进入图表渲染逻辑。

### 3. 均线数据前部为0（预热期）
**现象**：MA20 前 19 个值为 0，画出来从左下角飞上去一根线。
**解决**：过滤掉 `v > 0` 的点再连线，且 `points.length < 2` 时不渲染。

## 三、可扩展方向

- [ ] K线图交互：十字光标 + 数据面板（触摸显示当日OHLCV）
- [ ] 成交量子图（底部画成交量柱子）
- [ ] 周期切换（日K/周K/月K）
- [ ] 指标参数自定义（RSI周期、BOLL带宽等）
- [ ] 长按股票条目跳转到详情页
- [ ] 分页加载（大数据量时虚拟列表）
- [ ] 收藏/自选股功能
