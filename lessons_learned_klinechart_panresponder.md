# KlineChart PanResponder 闭包 Bug 修复 (2026-08-04)

## 问题描述

详情页 K 线图双击无法显示最新补齐的数据。

## 根因分析

`KlineChart.tsx` 中 `panResponder` 使用 `useRef(PanResponder.create(...)).current` 创建。

```typescript
// 旧版：useRef 创建，闭包捕获初始 totalCount
const panResponder = useRef(
  PanResponder.create({
    onPanResponderRelease: (evt) => {
      // 双击重置 —— totalCount 是组件挂载时的旧值
      setEndIndex(totalCount);
    },
  })
).current;
```

问题：`totalCount` 在 `PanResponder.create()` 时被闭包捕获，之后 `data.length` 变化（补齐数据后），`totalCount` 仍是旧值。双击重置时 `setEndIndex(totalCount)` 用的是旧长度，图表不会滚动到最新数据。

## 修复方案

改为 `useMemo`，依赖 `data.length` 等状态，数据变更时重建 PanResponder：

```typescript
const panResponder = useMemo(
  () =>
    PanResponder.create({
      onPanResponderRelease: (evt) => {
        setEndIndex(totalCount); // 此时 totalCount 是最新值
      },
    }),
  [data.length, defaultVisibleCount, candleWidth, gap, actualVisible, actualEnd, visibleData.length]
);
```

## 关键教训

1. **useRef vs useMemo**：`useRef` 适合存不随渲染变化的引用（如定时器ID、DOM引用）；`useMemo` 适合依赖状态的创建逻辑（如 PanResponder、配置对象）。
2. **闭包陷阱**：在回调中使用外部变量时，必须确认该变量是最新的。如果回调创建时机早于变量更新，就会 stale。
3. **PanResponder 特殊性**：PanResponder 一旦创建就不变，如果用 `useRef`，其闭包中的值永远是首次创建时的快照。

## 影响文件

- `src/components/KlineChart.tsx`：`useRef` → `useMemo`
