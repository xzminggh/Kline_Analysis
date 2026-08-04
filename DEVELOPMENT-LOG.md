# K-Line Strategy Apps 开发日志

> 26个独立Expo Go App，每个对应一个K线交易策略。本文档记录所有策略指标修改和程序关键改动，供后续项目复用。

---

## 一、策略指标修复

### 1. findLocalExtrema 返回值Bug（影响7个App）

**问题**：`findLocalExtrema` 返回稀疏数组 `{highs: [null, val, ...], lows: [null, val, ...]}`，后续代码直接访问 `.val` 属性导致崩溃。

**修复方案**：
```typescript
// 旧版：返回稀疏数组
{ highs: [null, 3.2, null, 4.1, ...], lows: [null, 2.8, null, ...] }

// 新版：返回对象数组
[{ idx: 1, val: 3.2 }, { idx: 3, val: 4.1 }]
```

**影响App**：D01, D02, K02, P03, S01, S02, S03

**关键代码模式**：
```typescript
// 访问方式改变
// 旧：const h = highs[i]; if (h && h.val > threshold) ...
// 新：const extrema = findLocalExtrema(klineData); 
//     extrema.highs.forEach(({idx, val}) => { if (val > threshold) ... })
```

---

### 2. S03 头肩顶策略 — 容错阈值过严

**问题**：`v > head` 要求左右肩严格高于头部，实际走势中头部和肩部往往接近相等。

**修复**：
```typescript
// 旧：v > head（严格大于）
// 新：v >= head * 1.01（允许1%误差）

// 旧：Math.abs(lShoulder - rShoulder) < 0.05（5%容差）
// 新：Math.abs(lShoulder - rShoulder) < head * 0.08（8%容差）
```

**新增"形成中"状态**：检测到潜在形态但尚未确认突破时，返回 `forming` 状态而非 `NEUTRAL`，让用户能看到正在形成的形态。

---

### 3. S01 双底策略 — 稀疏数组兼容

**问题**：`findLocalExtrema` 返回 `{highs: number[], lows: number[]}`（稀疏数组），但策略代码用 `.val` 属性访问普通数字。

**修复**：
```typescript
// 旧：直接访问 .val（对普通数字报undefined）
const lowVal = lows[i].val;

// 新：提取非null值并保留索引
const lowsFiltered = lows
  .map((val, idx) => val !== null ? { idx, val } : null)
  .filter(Boolean);
```

**容差调整**：
```typescript
// 旧：tolerance = 0.05（5%）
// 新：tolerance = 0.10（10%，适应A股波动）
```

---

### 4. T03 均线斗牛（Guppy MA）— 数组比较Bug

**问题**：`calculateGuppyMA` 返回 `{shortTerm: number[][], longTerm: number[][]}`（二维数组），代码直接比较整个数组而非单个值。

**根因**：
```typescript
// 错误：guppy.shortTerm[n] 是一个 number[]（5个EMA值的数组）
if (guppy.shortTerm[n] > guppy.shortTerm[n-1]) // 比较数组，永远为true
```

**修复**：取5个EMA的均值后比较
```typescript
// 正确：先计算均值再比较
const shortAvg = guppy.shortTerm[n].reduce((a, b) => a + b, 0) / guppy.shortTerm[n].length;
const prevShortAvg = guppy.shortTerm[n-1].reduce((a, b) => a + b, 0) / guppy.shortTerm[n-1].length;
if (shortAvg > prevShortAvg) // 比较数值
```

---

### 5. V02 ATR窄幅突破 — 阈值不合理（本次修复）

**问题**：两个阈值都过严，导致1155只股票中0只符合条件。

| 参数 | 原值 | 问题 | 新值 |
|------|------|------|------|
| ATR收窄 | `< avg * 0.6` | A股最窄ATR也有均值的72%，0.6不可能达到 | `< avg * 0.75` |
| 突破幅度 | `> ATR * 0.5` | 收窄后最大突破仅0.40x ATR | `> ATR * 0.3` |

**数据验证**（1155只股票测试）：
- 原阈值：0只收窄，0只突破
- 新阈值：10只收窄，1只BUY（301177），9只等待突破

---

## 二、Android构建关键修复

### 1. reactNativeArchitectures — 控制CMake构建架构

**问题**：`ndk.abiFilters` 只控制APK打包，不阻止CMake编译4个架构（arm64-v8a, armeabi-v7a, x86, x86_64），导致构建时间翻倍、APK体积83MB。

**关键发现**：React Native项目中，真正控制CMake构建架构的是 `gradle.properties` 中的 `reactNativeArchitectures`，而非 `ndk.abiFilters`。

**修复**：
```properties
# gradle.properties（每个App的android目录下）
# 旧：
reactNativeArchitectures=armeabi-v7a,arm64-v8a,x86,x86_64

# 新：
reactNativeArchitectures=arm64-v8a
```

**效果**：
- 构建时间：14分56秒 → 7分钟（减半）
- APK体积：83MB → 30MB（减少64%）

---

### 2. ndk.abiFilters 位置要求

**问题**：`ndk { abiFilters }` 放在 `android {}` 顶层会报错 `Could not find method ndk()`。

**正确位置**：必须在 `defaultConfig {}` 内部
```groovy
// 错误 ❌
android {
    ndk {
        abiFilters 'arm64-v8a'
    }
    defaultConfig { ... }
}

// 正确 ✅
android {
    defaultConfig {
        ndk {
            abiFilters 'arm64-v8a'
        }
    }
}
```

---

### 3. Gradle版本兼容性

**问题**：Gradle 9.4.1 内置 Kotlin 2.3.0 stdlib，与 RN 0.86.2 的 Kotlin 2.1.20 冲突。

**解决方案**：
- 使用 Gradle 9.3.1（`~/.gradle/wrapper/dists/gradle-9.3.1-bin/`）
- 使用 JDK 17（`C:\Users\Administrator\.jdks\jdk-17.0.2`）
- RN Gradle Plugin 要求 `jvmToolchain(17)`

**环境变量设置**：
```powershell
$env:JAVA_HOME="C:\Users\Administrator\.jdks\jdk-17.0.2"
```

---

### 4. 构建脚本误判问题

**问题**：脚本用 `Select-Object -Last 1` 判断构建结果，Gradle的 `28 actionable tasks: 28 up-to-date` 被误判为失败。

**根因**：增量构建（Incremental Build）机制导致Gradle认为"没变"直接跳过编译。

**解决方案**：
```powershell
# 必须加 clean 强制重新构建
gradlew.bat clean assembleRelease --no-daemon

# 脚本判断逻辑应检查完整输出中的 "BUILD SUCCESSFUL"
$result -match "BUILD SUCCESSFUL"
```

---

### 5. node_modules缓存损坏

**问题**：部分App（M03, S02等）在 `expo prebuild --clean` 后node_modules缓存损坏。

**症状**：缺少 `cli-cursor` 等依赖，构建报 `MODULE_NOT_FOUND`。

**修复**：
```powershell
# 在App目录下执行
npm install cli-cursor
# 或完整重装
npm install
```

---

## 三、数据库相关

### 1. SQLite表名和结构

```sql
-- 用户数据库表名
CREATE TABLE kline_daily (
    code TEXT,      -- 股票代码
    date TEXT,      -- 日期
    open REAL,
    high REAL,
    low REAL,
    close REAL,
    volume REAL,
    amount REAL
);

-- 注意：不是 kline，是 kline_daily
```

### 2. 数据库访问方式

PowerShell的 `System.Data.SQLite` 不可用，必须用Node.js的 `better-sqlite3`：
```javascript
const Database = require('better-sqlite3');
const db = new Database('path/to/database.sqlite', {readonly: true});
const rows = db.prepare('SELECT * FROM kline_daily WHERE code=? ORDER BY date').all(code);
```

### 3. 用户数据库位置

```
F:\xwechat_files\xzmingweixin_28bf\msg\file\2026-08\kline_2y_2026-08-01.sqlite
```
- 1155只股票
- 每只504根K线
- 75.5MB

---

## 四、Expo预构建注意事项

### 1. prebuild --clean 会覆盖手动修改

`expo prebuild --clean` 会完全重新生成 `android/` 目录，手动添加的 `ndk.abiFilters` 等配置会丢失。

**推荐方案**：使用 `expo-build-properties` 插件持久化配置：
```json
{
  "expo": {
    "plugins": [
      ["expo-build-properties", {
        "android": {
          "ndk": {
            "abiFilters": ["arm64-v8a"]
          }
        }
      }]
    ]
  }
}
```

### 2. Expo CLI路径

从App目录调用Expo CLI：
```powershell
node "node_modules\expo\bin\cli" start
```

---

## 五、Git仓库

### 远程仓库
- **Gitee**: https://gitee.com/xzmingmy/kline-strategy-apps.git （可推送）
- **GitHub**: https://github.com/xzminggh/kline-strategy-apps.git （防火墙阻断）

### 敏感信息
- `debug-logs/` 已加入 `.gitignore`
- 数据库路径、微信文件路径不应提交

---

## 六、26个App策略一览

| 编号 | 策略名 | 核心指标 | 特殊修复 |
|------|--------|----------|----------|
| D01 | MACD金叉 | EMA(12,26) + MACD交叉 | findLocalExtrema返回值 |
| D02 | MACD顶背离 | 价格新高 + MACD未新高 | findLocalExtrema返回值 |
| D03 | MACD底背离 | 价格新低 + MACD未新低 | — |
| K01 | KDJ金叉 | K/D/J + 超卖区 | — |
| K02 | KDJ超卖反弹 | J值 < 0 | findLocalExtrema返回值 |
| K03 | KDJ顶背离 | 价格新高 + K值未新高 | — |
| M01 | 均线多头排列 | MA(5,10,20,60) 顺序排列 | — |
| M02 | 均线金叉 | MA(5/10)上穿MA(20) | — |
| M03 | 均线粘合突破 | 多条均线收敛后发散 | node_modules缓存 |
| M04 | 均线空头排列 | MA倒序排列 | — |
| P01 | 布林带下轨反弹 | 价格触及下轨 + 回升 | — |
| P02 | 布林带收口突破 | 带宽收窄后突破 | — |
| P03 | 布林带中轨支撑 | 回踩中轨不破 | findLocalExtrema返回值 |
| P04 | 布林带上轨压力 | 触及上轨回落 | — |
| Q01 | 地量见底 | 成交量创N日新低 | — |
| Q02 | 放量突破 | 成交量倍增 + 价格突破 | — |
| S01 | 双底形态 | W底 + 颈线突破 | findLocalExtrema稀疏数组兼容 |
| S02 | 均线交叉 | EMA交叉 | node_modules缓存 |
| S03 | 头肩顶形态 | 头肩形态 + 颈线跌破 | 容差阈值放宽 + forming状态 |
| S04 | 三只乌鸦 | 连续三根阴线 | — |
| T01 | 双均线策略 | MA(5/20)交叉 | — |
| T02 | 三均线策略 | MA(5/10/20)交叉 | — |
| T03 | 均线斗牛(Guppy) | 多EMA组合 | 数组比较Bug |
| T04 | 三线开花 | MA(5/10/60)交叉 | — |
| V01 | 布林带挤压 | 布林带宽度极小 | — |
| V02 | ATR窄幅突破 | ATR压缩 + 方向突破 | 阈值不合理（0.6→0.75, 0.5→0.3） |

---

## 七、关键经验总结

### 策略开发
1. **阈值必须用真实数据验证** — 先跑全量测试看分布，再定阈值
2. **稀疏数组要显式处理** — `null` 值不能直接访问属性
3. **二维数组要降维** — 取均值或特定位置再比较
4. **容差要适应市场特性** — A股波动大，容差要比美股宽

### Android构建
1. **reactNativeArchitectures > ndk.abiFilters** — 前者控制CMake，后者只控制打包
2. **clean是必须的** — 增量构建会跳过修改检测
3. **Gradle版本要匹配** — RN 0.86.x需要Gradle 9.3.x + JDK 17
4. **node_modules会损坏** — prebuild后如遇MODULE_NOT_FOUND，先npm install

### 调试技巧
1. **PowerShell超时** — Gradle构建需要 `timeout 1800000`（30分钟）
2. **脚本判断不能只看最后一行** — 要匹配 "BUILD SUCCESSFUL" 关键字
3. **APK大小验证** — 用ZipFile检查.so文件确认架构

---

## 2026-08-04 会话：Bug修复 + v3.0.0 发版

### 1. OverviewScreen 缺少 KlineFiller 导入

**问题**：`OverviewScreen.tsx` 使用 `KlineFiller` 但未导入，导致 `Property 'KlineFiller' doesn't exist` 运行时报错。

**修复**：在 imports 中添加 `import { KlineFiller } from '../services/KlineFiller';`

### 2. 概览页重复"补齐最新K线"按钮

**问题**：概览页有两处补齐按钮 — `SyncPanel` 组件内一个，"数据库信息"区块内一个，功能重复。

**修复**：移除"数据库信息"区块内的 `TouchableOpacity` 补齐按钮及其进度条。

### 3. KlineChart 双击重置不显示最新数据

**问题**：详情页补齐数据后双击 K 线图，图表仍显示旧数据范围。

**根因**：`panResponder` 用 `useRef` 创建，闭包捕获了初始 `data.length`，双击 `setEndIndex(totalCount)` 用旧值。

**修复**：改为 `useMemo` 依赖 `[data.length, defaultVisibleCount, candleWidth, gap, actualVisible, actualEnd, visibleData.length]`，数据更新时重建 PanResponder。

**详见**：`lessons_learned_klinechart_panresponder.md`

### 4. 版本升级至 v3.0.0

- `app.json`: version 2.0.0 → 3.0.0
- `package.json`: version 2.0.0 → 3.0.0
- `android/app/build.gradle`: versionCode 1 → 3, versionName "2.0.0" → "3.0.0"

### 经验总结

1. **useRef 闭包陷阱** — PanResponder 等在组件挂载时创建的对象，用 useRef 会永久捕获初始值。依赖状态的创建逻辑应用 useMemo。
2. **Expo Go 测试优先** — 先在 Expo Go 验证功能，再打包 APK，可以快速迭代避免反复构建。
3. **重复 UI 组件检查** — 新增功能组件（如 SyncPanel）后，需检查页面是否已有同类按钮。
