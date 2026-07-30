# 经验落盘：26策略App UI调试与修复

**阶段:** 26策略App UI调试与修复
**落盘日期:** 2026-07-30
**任务:** 修复26个独立App的UI问题、数据导入功能、字体协调

---

## 核心架构模式

### 1. 独立App架构模式
- 每个App是独立的Expo项目，有自己的package.json
- shared代码直接内嵌到每个App的src/shared/目录（避免file:../shared依赖问题）
- 父项目的StrategyEngine.ts作为策略实现参考

### 2. 数据库导入模式
- 使用expo-document-picker选择SQLite数据库文件
- 通过useDatabase()上下文获取getStocks()、getKlineByCode()等函数
- 导入后自动刷新数据（重新加载数据库信息和股票列表）

### 3. 字体协调模式
- 标签栏字体：16px，bold
- 标题字体：22-24px，bold
- 正文字体：16px
- 辅助文字：14px

---

## 踩坑记录

### 1. expo-dev-client 依赖问题
- **问题:** index.js中`import 'expo-dev-client'`导致"Unable to resolve module"错误
- **解决:** 从index.js移除该导入
- **教训:** Expo Go不需要expo-dev-client，仅在开发构建时需要

### 2. App entry not found 错误
- **问题:** 移除expo-dev-client后，直接`export default App`导致"App entry not found"
- **解决:** 使用`registerRootComponent` from 'expo'
- **教训:** Expo项目入口必须使用registerRootComponent注册

### 3. 缺少assets图标文件
- **问题:** app.json中引用`./assets/icon.png`但文件不存在
- **解决:** 从父项目复制icon.png、splash.png、adaptive-icon.png
- **教训:** 新建Expo项目必须包含assets目录和图标文件

### 4. DetailScreen stock undefined 错误
- **问题:** `route.params.stock`在未传参时为undefined
- **解决:** 使用`route?.params?.stock`可选链，添加空值检查
- **教训:** 导航参数必须做空值保护

### 5. Access to closed resource 错误
- **问题:** 直接使用`db`对象查询数据库，但db引用可能已关闭
- **解决:** 使用上下文提供的getStocks()、getKlineByCode()函数代替直接使用db
- **教训:** SQLiteProvider内部使用dbRef跟踪数据库连接，应通过上下文函数访问

### 6. 数据导入后首页不刷新
- **问题:** 导入数据库后首页不显示新数据
- **解决:** 导入成功后调用loadDatabaseInfo()和loadStocks()刷新数据
- **教训:** 数据变更后必须主动刷新UI状态

---

## 文件修改清单

| 文件 | 修改内容 |
|------|----------|
| app-T01-double-ma/index.js | 移除expo-dev-client，使用registerRootComponent |
| app-T01-double-ma/app.json | 添加splash.image、adaptiveIcon.foregroundImage |
| app-T01-double-ma/package.json | 移除kline-shared依赖，添加expo-document-picker |
| app-T01-double-ma/tsconfig.json | 添加skipLibCheck、types:["node"] |
| app-T01-double-ma/src/App.tsx | 添加tabBarLabelStyle字体配置 |
| app-T01-double-ma/src/screens/HomeScreen.tsx | 添加数据导入功能、使用getStocks/getKlineByCode |
| app-T01-double-ma/src/screens/DetailScreen.tsx | 添加stock空值检查、增大字体 |
| app-T01-double-ma/src/screens/SettingsScreen.tsx | 添加使用说明、移除导入功能 |
| app-T01-double-ma/src/config/strategy.ts | 实现T01双均线策略逻辑 |
| app-T01-double-ma/src/theme/colors.ts | 修复导入路径为../shared/theme/colors |
| app-T01-double-ma/assets/ | 添加icon.png、splash.png、adaptive-icon.png |

---

## 可扩展方向

### 1. 批量修复25个App
- 使用相同方法为25个App注入对应的策略实现
- 创建批量修复脚本

### 2. 统一UI组件库
- 将HomeScreen、DetailScreen、SettingsScreen抽取为共享组件
- 每个App只需配置策略，UI自动适配

### 3. 数据同步功能
- 添加联网获取K线数据功能
- 支持定时更新

---

## 关键数据

| 项目 | 数值 |
|------|------|
| 修复文件数 | 11个 |
| 解决Bug数 | 6个 |
| 新增功能 | 数据导入、使用说明 |
| 字体调整 | 标签栏16px、标题22-24px、正文16px |

---

## 下次执行建议

1. **先修复一个App作为模板** - 确认方案后再批量处理
2. **使用上下文函数访问数据库** - 避免直接使用db对象
3. **导航参数做空值保护** - 使用可选链和默认值
4. **数据变更后主动刷新** - 导入、修改后重新加载数据

---

**落盘完成:** 2026-07-30 17:00
