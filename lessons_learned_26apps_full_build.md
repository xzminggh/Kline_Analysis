# 26策略App批量构建经验 — T01延伸到25个App

> 落盘日期：2026-07-31

## 核心架构模式

1. **T01作为Golden Reference**：所有共享模块、UI框架、配置文件从T01复制，T01在整个批量操作中不被修改。
2. **Indicators.ts是策略核心**：16个指标函数覆盖26个策略中绝大多数需求，仅少数K线形态（缺口、反包、锤子线）需要手写逻辑。
3. **tsc --noEmit作为Machine-verifiable Gate**：每个阶段用TypeScript编译检查作为质量门，快速且可靠。

## 踩坑记录

### 1. indicators/index.ts导出不完整（Stage 2阻塞）
- **问题**：Indicators.ts定义了`findLocalExtrema`和`calculateFibonacciLevels`，但index.ts未导出
- **影响**：8个策略文件（D01, D02, K02, K03, P03, S01, S02, S03）编译失败
- **解决**：在index.ts中添加缺失的两个导出
- **教训**：修改共享库后，必须检查index.ts的导出列表是否完整

### 2. Fibonacci Levels属性名错误（Stage 2阻塞）
- **问题**：K03策略使用`fibs.level500`，但Indicators.ts返回`fibs.level50`
- **影响**：1个策略文件编译失败
- **解决**：`level500`改为`level50`
- **教训**：使用共享函数时，必须确认返回类型的属性名

### 3. PowerShell路径空格问题（Stage 1阻塞）
- **问题**：路径`F:\opencode\Single metric\...`包含空格，PowerShell的Copy-Item命令报语法错误
- **影响**：PowerShell版本的sync-infra.ps1全部失败
- **解决**：改用Node.js版本的脚本（fs.copyFileSync/fs.mkdirSync不受空格影响）
- **教训**：Windows路径含空格时，Node.js比PowerShell更可靠

### 4. npm install超时（Stage 1-2过渡）
- **问题**：25个App逐个npm install，每个约60-120秒，批量执行时总时间超过10分钟
- **影响**：bash工具120秒超时
- **解决**：分批执行，每次并行处理6个App；实际npm install在后台完成
- **教训**：批量npm install应分批处理，或使用`npm workspaces`（需Node 15+）

### 5. app.json缺失android.package字段
- **问题**：旧版app.json没有`android.package`字段，导致slugs唯一但packages重复
- **影响**：Stage 3 gate check失败
- **解决**：编写fix-app-json.js脚本，从目录名自动生成slug和package
- **教训**：app.json模板必须包含完整的android.package和slug字段

## 可扩展方向

1. **策略函数作用域**：当前所有策略函数都是内联的execute函数，可考虑提取为独立函数便于测试
2. **批量测试脚本**：现有的test-all.js可扩展为对每个策略的execute()进行自动化测试
3. **统一EAS Build**：26个App可用EAS Build批量构建，但需注意每个App的projectId需要独立申请
4. **SVG图标部署**：icons/目录已有26个SVG，需找到SVG→PNG转换方案后批量部署

## 关键数据

| 指标 | 数值 |
|------|------|
| 总App数 | 26 |
| Stage 1 sync | 25/25 OK |
| Stage 2 tsc | 26/26 PASS |
| Stage 3 verify | 26/26 PASS |
| 策略实现 | 25 generated + 1 existing (T01) |
| 耗时 | 约15分钟（含npm install等待） |
