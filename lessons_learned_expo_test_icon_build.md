# 26 Apps Expo Go测试 + 图标部署 + EAS Build 经验

## 日期
2026-07-31

## 背景
完成26个App的基础设施修复、图标部署、Expo Go测试启动、EAS Build尝试。

## 完成的工作

### 1. 图标部署
- 26个SVG→PNG图标已在`icons/`目录
- 脚本`scripts/deploy-icons.js`复制到各App的`assets/`目录
- 修复：脚本路径问题（`__dirname`→`path.join(__dirname, '..', 'icons')`）
- 每个App部署3个文件：`icon.png`, `adaptive-icon.png`, `splash.png`
- **经验**：Node.js脚本中`__dirname`是脚本所在目录，不是工作目录

### 2. app.json修复
- 移除26个App的`splash`字段（Expo schema验证失败）
- `expo-doctor`检查通过
- **经验**：Expo SDK 53+移除了`splash`字段，使用`expo-splash-screen`插件替代

### 3. 数据库自动建表
- 问题：Expo Go无seed库→空数据库无`stocks`表→崩溃
- 修复：`SQLiteProvider.tsx`的`initDatabase`中添加`CREATE TABLE IF NOT EXISTS`
- 同步到25个App（T01为参考不动）
- **经验**：Expo Go没有bundle目录的seed文件，必须保证表结构存在

### 4. EAS Build尝试
- eas-cli v21.4.0已安装
- T01 build成功上传（9.5MB）→构建失败
- 原因：Expo免费计划每月15次Android构建已用完
- 重置时间：8月1日（1天3小时后）
- **经验**：`.easignore`排除node_modules后上传从380MB降到9.5MB，显著加速

## 踩坑记录

### 图标缓存问题
- Expo Go会缓存App图标
- 修复：清除Metro缓存（`npx expo start --clear`）+ 在Expo Go中删除项目重新扫码
- **经验**：更换图标后必须清除缓存

### 深色背景splash
- 当前3个图标用同一个PNG，splash背景应为深色（#0a0a0f）
- **经验**：`splash.png`应该用深色背景+居中Logo，不是简单的App图标

## 文件变更
- `scripts/deploy-icons.js` — 图标部署脚本（新增）
- `docs/expo-go-test-checklist.md` — 26个App测试清单（新增）
- `app-*/assets/icon.png` — 26个App主图标（更新）
- `app-*/assets/adaptive-icon.png` — 26个App自适应图标（更新）
- `app-*/assets/splash.png` — 26个App启动画面（更新）
- `app-*/app.json` — 移除splash字段（26个App）
- `app-*/src/shared/database/SQLiteProvider.tsx` — 自动建表（26个App）

## Git提交
- `f1199ed` fix: remove invalid splash field from all 26 app.json
- `6b6d50f` fix: auto-create tables on first launch (stocks/kline_daily/meta)
- `3314385` fix: deploy adaptive-icon.png and splash.png to all 26 apps

## 下一步
1. 等8月1日重置后批量EAS Build
2. 或用`eas build --local`本地构建（需Java+Android SDK）
3. 26个App逐个Expo Go测试
4. 修正splash.png为深色背景版本
