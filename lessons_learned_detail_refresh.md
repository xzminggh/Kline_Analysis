# 详情页实时刷新修复

## 日期
2026-08-01

## 问题
联网补齐最新K线后，详情页的K线图、策略信号、走势概况仍然是旧数据。

## 根因
`DetailScreen`的`stock.klineData`是从`HomeScreen`传入的**静态快照**，同步后不会自动更新。

## 修复方案
1. `DetailScreen`新增`useDatabase`钩子，直接从数据库读取最新K线
2. 用`useState`管理`klineData`、`signal`、`details`，替代直接读`stock`属性
3. 新增`refreshFromDB`函数：从DB读最新kline → 重新执行策略 → 刷新市场概况
4. `useEffect`中同时调用`loadStockInfo()`和`refreshFromDB()`

## 数据流变化
```
之前: HomeScreen → stock.klineData(静态) → DetailScreen
之后: DetailScreen → getKlineByCode(实时) → STRATEGY_CONFIG.execute → 刷新UI
```

## 文件变更
- `app-*/src/screens/DetailScreen.tsx` — 26个App全部更新

## Git提交
- `cf8cad2` fix: DetailScreen refreshes from DB after sync
