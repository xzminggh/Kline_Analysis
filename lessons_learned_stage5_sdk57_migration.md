# Stage 5 经验落盘：SDK 57 升级 + EAS Build 踩坑实录

> 落盘日期：2026-07-26
> 阶段：从 SDK 51 升级到 SDK 57 + EAS Build 配置 + 大数据库导入优化

## 一、核心架构模式

### 1.1 SDK 升级流程（验证可行）
```
1. 删除 yarn.lock / node_modules
2. 修改 package.json 为 SDK 57 官方推荐版本
3. npm install --legacy-peer-deps
4. npx expo install --check  → 自动校正所有子模块版本
5. npx expo install --fix    → 应用建议版本
```

### 1.2 SDK 57 推荐版本（已验证可用）
```json
{
  "expo": "~57.0.0",
  "react": "19.2.3",
  "react-native": "0.86.0",
  "expo-sqlite": "~57.0.1",
  "expo-file-system": "~57.0.1",
  "expo-document-picker": "~57.0.1",
  "expo-sharing": "~57.0.7",
  "expo-dev-client": "~57.0.9",
  "react-native-svg": "15.15.4",
  "react-native-safe-area-context": "~5.7.0",
  "react-native-screens": "~4.26.0"
}
```

### 1.3 EAS Build 配置（成功构建）
```json
// eas.json
{
  "cli": { "version": ">= 21.2.0", "appVersionSource": "remote" },
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal",
      "node": "20.0.0",
      "image": "latest"
    }
  }
}
```

## 二、踩坑记录（按时间顺序）

### 坑 1：yarn install --production false exited with non-zero code: 1
**原因**：
- 项目 package.json 里有 `packageManager: "yarn@1.22.22+sha512..."` 字段
- EAS 云端 yarn 校验 hash 不匹配
- Node 版本不匹配（本地 22.x，云端默认 18.x）

**修复**：
1. 删除 `packageManager` 字段
2. eas.json 添加 `node: "20.0.0"` 和 `image: "latest"`
3. package.json 添加 `engines.node: ">=18.0.0"`
4. 创建 `.npmrc` 文件，写入 `legacy-peer-deps=true`
5. 改用 npm（eas.json 不需要额外配置，EAS 自动检测）

### 坑 2：expo-file-system API 已废弃
**错误**：`Method getInfoAsync imported from "expo-file-system" is deprecated`

**原因**：SDK 57 重写了 expo-file-system，推荐用 `File`/`Directory` 类

**修复**：改用 legacy 子路径（保持现有代码不变）
```typescript
// 旧（已废弃）
import * as FileSystem from 'expo-file-system';

// 新（兼容 SDK 57）
import * as FileSystem from 'expo-file-system/legacy';
```

### 坑 3：expo-sqlite API 完全重写（破坏性变更）
**错误**：`TypeError: undefined is not a function`

**原因**：SDK 57 的 expo-sqlite 改用 async/await API
- 旧：`SQLite.openDatabase(name)` + `db.transaction(tx => tx.executeSql())`
- 新：`openDatabaseAsync(name)` + `db.getAllAsync()` / `db.getFirstAsync()`

**修复**：重写 SQLiteProvider.tsx（保持 DatabaseContextType 接口不变）
```typescript
// 旧
const db = SQLite.openDatabase('kline');
db.transaction(tx => {
  tx.executeSql('SELECT * FROM stocks', [], (tx, result) => {...});
});

// 新
const db = await SQLite.openDatabaseAsync(DB_NAME, {}, directory);
const rows = await db.getAllAsync<Stock>('SELECT * FROM stocks');
const row = await db.getFirstAsync<{count: number}>('SELECT COUNT(*) as count FROM stocks');
```

### 坑 4：数据库路径错误（no such table）
**错误**：`no such table: stocks`

**原因**：`openDatabaseAsync` 默认在 `defaultDatabaseDirectory` 找文件，但我们的 DB 在 `SQLite/` 子目录

**修复**：传入 `directory` 参数
```typescript
const DB_DIR = `${FileSystemLegacy.documentDirectory}SQLite/`;
const db = await SQLite.openDatabaseAsync(
  DB_NAME, 
  {}, 
  DB_DIR.replace(/\/$/, '')  // 去掉末尾斜杠
);
```

### 坑 5：DocumentPicker 文件读取权限问题
**错误**：`Missing 'READ' permission for accessing the file`

**原因**：DocumentPicker 默认 `copyToCacheDirectory: true`，但 cache 目录的文件无读权限

**修复**：设置 `copyToCacheDirectory: false`
```typescript
const result = await DocumentPicker.getDocumentAsync({
  type: '*/*',
  copyToCacheDirectory: false,  // 关键：保留在原位置
});
```

### 坑 6：大数据库导入内存溢出
**错误**：`java.lang.OutOfMemoryError` （260MB 大数据库）

**原因**：用 `arrayBuffer()` + `Buffer` + `base64` 方案，整个文件读入内存

**修复**：改用 `FileSystemLegacy.copyAsync` 原生流式复制
```typescript
// 失败方案：内存溢出
const fileBuffer = await sourceFile.arrayBuffer();
const base64Data = Buffer.from(fileBuffer).toString('base64');
await FileSystemLegacy.writeAsStringAsync(localDbPath, base64Data, {...});

// 成功方案：原生流式复制，几乎不占内存
await FileSystemLegacy.copyAsync({
  from: fileUri,
  to: localDbPath,
});
```

### 坑 7：React Hooks 顺序错误
**错误**：`Rendered more hooks than during the previous render`

**原因**：`useMemo` 在 `if (loading) return` 之后，hooks 数量不一致

**修复**：把所有 hooks 移到提前返回之前
```typescript
// 错误：useMemo 在 return 之后
if (loading) return <Loading />;
const filteredStocks = useMemo(() => ..., [stocks]);

// 正确：所有 hooks 在 return 之前
const filteredStocks = useMemo(() => ..., [stocks]);
if (loading) return <Loading />;
```

### 坑 8：策略函数变量作用域错误（重大bug）
**错误**：`ReferenceError: Property 'prevN' doesn't exist` / `Property 'highs' doesn't exist`

**原因**：策略函数定义在外部，但内部引用了 `analyzeStock` 函数的局部变量（`prevN`、`highs`、`lows`、`opens`、`closes`、`volumes`）

**修复**：在每个策略函数内部定义 `const prevN = n - 1;`，并把缺失的变量加入参数列表

**影响范围**：修复了 17 个策略函数（共 26 个）
- 9 个函数缺少 `prevN` 定义
- 8 个函数缺少 `highs`/`lows`/`opens` 参数

## 三、可复用代码片段

### 3.1 SDK 57 SQLite 数据库初始化模板
```typescript
import * as SQLite from 'expo-sqlite';
import * as FileSystemLegacy from 'expo-file-system/legacy';

const DB_NAME = 'kline.sqlite';
const DB_DIR = `${FileSystemLegacy.documentDirectory}SQLite/`;

const initDatabase = async () => {
  await FileSystemLegacy.makeDirectoryAsync(DB_DIR, { intermediates: true });
  const db = await SQLite.openDatabaseAsync(DB_NAME, {}, DB_DIR.replace(/\/$/, ''));
  return db;
};
```

### 3.2 大文件流式导入模板
```typescript
const importDatabase = async (fileUri: string) => {
  const localDbPath = `${DB_DIR}${DB_NAME}`;
  
  // 备份旧数据库
  const localExists = await FileSystemLegacy.getInfoAsync(localDbPath);
  if (localExists.exists) {
    await FileSystemLegacy.copyAsync({
      from: localDbPath,
      to: `${DB_DIR}kline_backup_${Date.now()}.sqlite`,
    });
  }
  
  // 原生流式复制（不占内存）
  await FileSystemLegacy.copyAsync({
    from: fileUri,
    to: localDbPath,
  });
  
  // 关闭旧连接，打开新数据库
  if (oldDb) await oldDb.closeAsync();
  const newDb = await SQLite.openDatabaseAsync(DB_NAME, {}, DB_DIR.replace(/\/$/, ''));
  return newDb;
};
```

### 3.3 DocumentPicker 配置模板
```typescript
const result = await DocumentPicker.getDocumentAsync({
  type: '*/*',
  copyToCacheDirectory: false,  // 关键：避免权限问题
});
if (result.canceled) return;
const fileUri = result.assets[0].uri;
```

## 四、性能数据

### 大数据库测试结果
- 数据规模：1,745 只股票 × 2,021,507 条 K线
- 导入耗时：< 5 秒（原生流式复制）
- 内存占用：几乎不增加（流式复制）
- 数据库文件大小：约 260MB

## 五、可扩展方向

1. **多线程优化**：考虑引入 `react-native-multithreading` 实现真多线程，进一步提升大数据库分析速度
2. **增量更新**：支持增量导入 K线数据，避免每次全量替换
3. **数据库索引**：确认 `stock_code + date` 复合索引存在，优化查询性能
4. **错误日志收集**：将运行时错误收集到本地，方便后续排查

## 六、关键决策记录

| 决策点 | 选项 | 选择 | 理由 |
|--------|------|------|------|
| 包管理器 | yarn / npm | npm | EAS 云端兼容性更好，无 hash 校验问题 |
| Node 版本 | 18 / 20 | 20 | 更稳定，兼容性更好 |
| FileSystem API | 新 / legacy | legacy | 保持现有代码不变，减少改动量 |
| SQLite API | 重写 / 兼容层 | 重写 | 破坏性变更无法绕过，必须改 |
| 大文件导入 | arrayBuffer / copyAsync | copyAsync | 内存占用低，支持大文件 |
| DocumentPicker | cache / 原位置 | 原位置 | 避免权限问题 |
