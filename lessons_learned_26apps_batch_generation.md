# 经验落盘：26策略App批量生成

**阶段:** 26策略App批量生成
**落盘日期:** 2026-07-29
**任务:** 为26个K线策略分别创建独立的Expo Go App

---

## 核心架构模式

### 1. 共享模块抽取模式
- 从母版项目抽取`indicators`、`services`、`database`、`components`到独立`shared/`目录
- 每个模块提供`index.ts`导出，方便其他App导入
- 使用`file:../shared`本地依赖引用

### 2. 模板克隆模式
- 创建`app-template/`母版App，包含完整UI框架
- 使用Node.js脚本批量克隆，替换策略配置
- 每个App独立维护自己的`package.json`

### 3. 策略注入模式
- 每个App有独立的`src/config/strategy.ts`
- 包含策略ID、名称、颜色、执行函数
- 执行函数从`shared/indicators`导入算法

---

## 踩坑记录

### 1. 路径空格问题
- **问题:** Windows路径`Single metric`包含空格，导致PowerShell和cmd命令执行失败
- **解决:** 使用`cmd /c`包裹命令，或使用`Copy-Item`替代`copy`
- **教训:** 跨平台脚本需要考虑路径空格

### 2. linter验证路径问题
- **问题:** `lint_loop_design.mjs`无法读取带空格的路径
- **解决:** 先复制到临时目录（无空格），验证后再移动
- **教训:** 工具链需要考虑路径兼容性

### 3. loop-constructor的escalate字段
- **问题:** `escalate` action不能带`to`字段
- **解决:** 只有`loopback`可以带`to`，`escalate`不带
- **教训:** 严格遵循linter验证规则

### 4. 本地依赖file:../shared问题（新增）
- **问题:** 使用`file:../shared`本地依赖导致npm install时ERESOLV错误
- **解决:** 改为直接复制shared/内容到每个App的src/shared/目录
- **教训:** Expo项目中本地文件依赖兼容性差，独立App更适合内嵌共享代码

### 5. TypeScript类型错误（新增）
- **问题:** 页面组件缺少类型定义，导致tsc报错
- **解决:** 添加Props类型定义，使用泛型指定数据库查询返回类型
- **教训:** 从一开始就应定义完整的类型，避免后续修复

### 6. npm依赖版本冲突（新增）
- **问题:** react-native和jest-expo的peer dependency冲突
- **解决:** 使用`--legacy-peer-deps`跳过依赖检查
- **教训:** Expo项目的依赖关系复杂，需要仔细处理版本兼容性

---

## 可扩展方向

### 1. 批量依赖安装
- 目前只生成了文件结构，未执行`npm install`
- 可以创建`install-all.js`脚本批量安装

### 2. 策略执行函数
- 目前策略执行函数是占位符
- 需要从`StrategyEngine.ts`提取每个策略的具体实现

### 3. 统一打包
- 测试完成后，可以使用EAS Build批量打包APK
- 需要配置`eas.json`和构建脚本

### 4. 共享组件优化
- `KlineChart`组件可以进一步抽取为独立包
- 主题色和间距可以统一到`shared/theme`

---

## 工具使用

### Loop Architect
- 使用四步渐进式引导设计Manifest
- 禁止开放式提问，选项控制在2-4个

### Loop Constructor
- 使用D0-D6决策程序设计执行循环
- 4个阶段：extract_shared → create_template → batch_generate → batch_test

### 批量生成脚本
- `generate-all.js`: 读取模板，替换策略配置，生成26个App
- `test-all.js`: 验证所有App的文件结构

---

## 关键数据

| 项目 | 数值 |
|------|------|
| 共享模块文件 | 7个 |
| 母版App文件 | 10个 |
| 生成App数量 | 26个 |
| 测试通过率 | 100% |
| 总耗时 | 约15分钟 |

---

## 下次执行建议

1. **先验证母版App** - 在Expo Go中测试母版App的交互
2. **完善策略实现** - 补充每个策略的执行函数
3. **批量测试** - 使用`npm test`验证每个App
4. **统一打包** - 使用EAS Build批量打包APK

---

**落盘完成:** 2026-07-29 23:30
