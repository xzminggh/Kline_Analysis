# 本地 APK 构建经验 (2026-08-01)

## 核心架构模式

### 构建流程
1. `expo prebuild --platform android --clean` 生成 `android/` 目录
2. 安装 JDK 17 (React Native Gradle Plugin 需要)
3. 设置 `JAVA_HOME` 指向 JDK 17
4. 运行 `gradlew assembleRelease --no-daemon`

### 快速构建技巧
- 设置 `reactNativeArchitectures=arm64-v8a` 只构建一种架构，时间从 15min+ 降到 7min
- 使用 `--parallel` 参数加速

## 踩坑记录

### 1. Gradle 版本与 Kotlin 版本不兼容
**现象**: Gradle 9.4.1 自带 Kotlin 2.3.0 stdlib，但 React Native 0.86.2 的 Gradle Plugin 使用 Kotlin 2.1.20 编译器，无法读取 2.3.0 的 metadata。

**解决方案**: 
- 下载 Gradle 9.3.1 (Expo SDK 57 原始生成版本)
- 从 `services.gradle.org` 用 curl 下载 (PowerShell Invoke-WebRequest 超时)
- 解压到 `~/.gradle/wrapper/dists/gradle-9.3.1-bin/` 对应 hash 目录
- 创建 `.ok` 标记文件

### 2. JDK 17 缺失
**现象**: React Native Gradle Plugin 的 `jvmToolchain(17)` 找不到 JDK 17

**解决方案**: 
- 从华为镜像下载 OpenJDK 17: `https://mirrors.huaweicloud.com/openjdk/17.0.2/openjdk-17.0.2_windows-x64_bin.zip`
- 解压到 `C:\Users\Administrator\.jdks\jdk-17.0.2`
- 在 `gradle.properties` 设置:
  ```
  org.gradle.java.installations.auto-download=false
  org.gradle.java.installations.paths=C:\\Users\\Administrator\\.jdks\\jdk-17.0.2
  ```

### 3. CMake 版本不匹配
**现象**: Android SDK 中 CMake 3.22.1 目录存在但缺少 `cmake.exe`

**解决方案**: 
- 将 CMake 3.30.5 的完整内容复制到 3.22.1 目录
- 关键: 必须复制整个目录 (bin + share)，不只是 exe

### 4. services.gradle.org 连接超时
**现象**: 中国网络环境下 `services.gradle.org` 连接超时

**解决方案**:
- 使用 curl 而非 PowerShell Invoke-WebRequest (curl 支持断点续传)
- 使用 `-C -` 参数继续中断的下载
- 设置较长超时时间 (600s)

## 可扩展方向

1. **构建脚本化**: 编写 `scripts/local-build.ps1` 自动处理 JDK/CMake/Gradle 配置
2. **CI/CD**: 使用 GitHub Actions 或自建 CI 进行自动化构建
3. **APK 签名**: 生成正式签名 keystore 替代 debug 签名
4. **多架构优化**: 使用 `--split-per-abi` 生成小体积 APK
