# Git双推与Expo云打包经验

> 落盘日期：2026-07-30

## 1. Git双远端推送

### 1.1 初始化仓库并添加两个远端

```powershell
cd "项目目录"
git init
git remote add gitee https://gitee.com/用户名/仓库名.git
git remote add github https://github.com/用户名/仓库名.git
git remote -v  # 验证
```

### 1.2 推送代码

```powershell
git add -A
git commit -m "feat: 初始提交"
git push -u gitee master
git push -u github master
```

### 1.3 常见问题与解决方案

## 重要：用户名差异
- **Gitee**: xzmingmy
- **GitHub**: xzminggh（注意不是xzmingmy）

## 常见问题与解决方案

| 问题 | 原因 | 解决方案 |
|------|------|----------|
| `404 not found` | 远端仓库未创建 | 先在网站创建空仓库，**不要**勾选初始化 |
| `Host key verification failed` | SSH不知道GitHub主机 | `ssh-keyscan github.com >> ~/.ssh/known_hosts` |
| `Connection refused/timeout` | 网络无法直连GitHub | 方案1：开代理；方案2：用Gitee导入功能；方案3：换SSH协议 |
| `Repository not found` | URL错误或仓库不存在 | 检查URL拼写，确认仓库已创建 |

### 1.4 GitHub无法直连时的替代方案

本机网络无法直连GitHub（SSH/HTTPS均超时），但浏览器可访问时：

1. 先推到Gitee
2. 在GitHub网站使用 **Import repository**：`https://github.com/new?import=true`
3. 填入Gitee仓库URL，点击Begin import
4. 用 `git fetch github` 验证是否同步成功

### 1.5 认证Token方式（临时）

```powershell
# HTTPS + Token（不要提交到代码库）
git remote set-url gitee https://用户名:TOKEN@gitee.com/用户名/仓库名.git
git remote set-url github https://用户名:TOKEN@github.com/用户名/仓库名.git
```

⚠️ Token会出现在git历史中，推送完成后建议在网站 revoke/regenerate。

---

## 2. Expo云打包APK（EAS Build）

### 2.1 前置条件

```powershell
# 安装EAS CLI
npm install -g eas-cli

# 登录Expo账号（会打开浏览器）
eas login

# 验证登录
eas whoami
```

### 2.2 配置eas.json

项目根目录需要 `eas.json`：

```json
{
  "cli": { "version": ">= 3.0.0" },
  "build": {
    "preview": {
      "distribution": "internal",
      "android": { "buildType": "apk" }
    },
    "production": {
      "android": { "buildType": "app-bundle" }
    }
  }
}
```

- `preview` → 生成APK（可直接安装测试）
- `production` → 生成AAB（上架Google Play）

### 2.3 配置.easignore

排除不需要上传的文件，减小上传体积：

```
node_modules/
**/node_modules/
.expo/
dist/
web-build/
.git/
debug-logs/
*.log
```

### 2.4 构建命令

```powershell
cd 项目目录

# 构建APK（非交互模式，自动确认）
eas build --platform android --profile preview --non-interactive

# 构建后不等待，后台运行
eas build --platform android --profile preview --non-interactive --no-wait

# 查看最近构建记录
eas build:list --platform android --limit 3
```

### 2.5 构建流程说明

1. **认证** → 使用Expo服务器上的远程Android凭证
2. **压缩上传** → 项目文件打包上传到EAS Build服务器
3. **计算指纹** → 项目指纹识别（可用 `EAS_SKIP_AUTO_FINGERPRINT=1` 跳过）
4. **云端构建** → Expo服务器自动编译（约10-20分钟）
5. **下载APK** → 构建完成后提供下载链接

### 2.6 常见问题

| 问题 | 原因 | 解决方案 |
|------|------|----------|
| 压缩上传卡住 | node_modules过大（300MB+） | 确认 `.easignore` 正确排除node_modules |
| `Empty reply from server` | 网络问题 | 检查代理配置 |
| 构建超时 | 项目文件过大 | 清理 `.expo` 缓存、确认.easignore |
| 浏览器能访问但git/curl不行 | 浏览器走系统代理，命令行没走 | 设置代理：`git config --global http.proxy http://127.0.0.1:端口` |

### 2.7 清理缓存后重试

```powershell
Remove-Item -Recurse -Force .expo, node_modules\.cache -ErrorAction SilentlyContinue
eas build --platform android --profile preview --non-interactive
```

---

## 3. SVG图标生成

### 3.1 流程

1. 用Node.js脚本生成SVG（每个策略对应独特图形）
2. 用sharp库转换为1024x1024 PNG
3. 复制到每个app的 `assets/icon.png` 和 `assets/adaptive-icon.png`

### 3.2 依赖安装

```powershell
npm install sharp
```

### 3.3 关键代码

```javascript
const sharp = require('sharp');
const svgBuffer = fs.readFileSync('icon.svg');
await sharp(svgBuffer).resize(1024, 1024).png().toFile('icon.png');
```

---

## 4. 踩坑记录

1. **PowerShell不支持 `&&`** → 用 `;` 链接命令
2. **`curl` 在PowerShell中是Invoke-WebRequest别名** → 用 `& "C:\Windows\System32\curl.exe"` 调用真实curl
3. **`Start-Process` 需要完整路径** → npm全局包用 `npx` 调用，不能直接 `Start-Process eas`
4. **Node.js `path` 变量名冲突** → 函数命名避开 `path`（与 `require('path')` 冲突）
5. **中文文件名在某些命令中显示乱码** → Node.js内部处理正常，只是PowerShell输出显示问题
