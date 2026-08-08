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

### 5. V02 ATR绐勫箙绐佺牬 鈥?闃堝€间笉鍚堢悊锛堟湰娆′慨澶嶏級

**闂**锛氫袱涓槇鍊奸兘杩囦弗锛屽鑷?155鍙偂绁ㄤ腑0鍙鍚堟潯浠躲€?
| 鍙傛暟 | 鍘熷€?| 闂 | 鏂板€?|
|------|------|------|------|
| ATR鏀剁獎 | `< avg * 0.6` | A鑲℃渶绐凙TR涔熸湁鍧囧€肩殑72%锛?.6涓嶅彲鑳借揪鍒?| `< avg * 0.75` |
| 绐佺牬骞呭害 | `> ATR * 0.5` | 鏀剁獎鍚庢渶澶х獊鐮翠粎0.40x ATR | `> ATR * 0.3` |

**鏁版嵁楠岃瘉**锛?155鍙偂绁ㄦ祴璇曪級锛?- 鍘熼槇鍊硷細0鍙敹绐勶紝0鍙獊鐮?- 鏂伴槇鍊硷細10鍙敹绐勶紝1鍙狟UY锛?01177锛夛紝9鍙瓑寰呯獊鐮?
---

## 浜屻€丄ndroid鏋勫缓鍏抽敭淇

### 1. reactNativeArchitectures 鈥?鎺у埗CMake鏋勫缓鏋舵瀯

**闂**锛歚ndk.abiFilters` 鍙帶鍒禔PK鎵撳寘锛屼笉闃绘CMake缂栬瘧4涓灦鏋勶紙arm64-v8a, armeabi-v7a, x86, x86_64锛夛紝瀵艰嚧鏋勫缓鏃堕棿缈诲€嶃€丄PK浣撶Н83MB銆?
**鍏抽敭鍙戠幇**锛歊eact Native椤圭洰涓紝鐪熸鎺у埗CMake鏋勫缓鏋舵瀯鐨勬槸 `gradle.properties` 涓殑 `reactNativeArchitectures`锛岃€岄潪 `ndk.abiFilters`銆?
**淇**锛?```properties
# gradle.properties锛堟瘡涓狝pp鐨刟ndroid鐩綍涓嬶級
# 鏃э細
reactNativeArchitectures=armeabi-v7a,arm64-v8a,x86,x86_64

# 鏂帮細
reactNativeArchitectures=arm64-v8a
```

**鏁堟灉**锛?- 鏋勫缓鏃堕棿锛?4鍒?6绉?鈫?7鍒嗛挓锛堝噺鍗婏級
- APK浣撶Н锛?3MB 鈫?30MB锛堝噺灏?4%锛?
---

### 2. ndk.abiFilters 浣嶇疆瑕佹眰

**闂**锛歚ndk { abiFilters }` 鏀惧湪 `android {}` 椤跺眰浼氭姤閿?`Could not find method ndk()`銆?
**姝ｇ‘浣嶇疆**锛氬繀椤诲湪 `defaultConfig {}` 鍐呴儴
```groovy
// 閿欒 鉂?android {
    ndk {
        abiFilters 'arm64-v8a'
    }
    defaultConfig { ... }
}

// 姝ｇ‘ 鉁?android {
    defaultConfig {
        ndk {
            abiFilters 'arm64-v8a'
        }
    }
}
```

---

### 3. Gradle鐗堟湰鍏煎鎬?
**闂**锛欸radle 9.4.1 鍐呯疆 Kotlin 2.3.0 stdlib锛屼笌 RN 0.86.2 鐨?Kotlin 2.1.20 鍐茬獊銆?
**瑙ｅ喅鏂规**锛?- 浣跨敤 Gradle 9.3.1锛坄~/.gradle/wrapper/dists/gradle-9.3.1-bin/`锛?- 浣跨敤 JDK 17锛坄C:\Users\Administrator\.jdks\jdk-17.0.2`锛?- RN Gradle Plugin 瑕佹眰 `jvmToolchain(17)`

**鐜鍙橀噺璁剧疆**锛?```powershell
$env:JAVA_HOME="C:\Users\Administrator\.jdks\jdk-17.0.2"
```

---

### 4. 鏋勫缓鑴氭湰璇垽闂

**闂**锛氳剼鏈敤 `Select-Object -Last 1` 鍒ゆ柇鏋勫缓缁撴灉锛孏radle鐨?`28 actionable tasks: 28 up-to-date` 琚鍒や负澶辫触銆?
**鏍瑰洜**锛氬閲忔瀯寤猴紙Incremental Build锛夋満鍒跺鑷碐radle璁や负"娌″彉"鐩存帴璺宠繃缂栬瘧銆?
**瑙ｅ喅鏂规**锛?```powershell
# 蹇呴』鍔?clean 寮哄埗閲嶆柊鏋勫缓
gradlew.bat clean assembleRelease --no-daemon

# 鑴氭湰鍒ゆ柇閫昏緫搴旀鏌ュ畬鏁磋緭鍑轰腑鐨?"BUILD SUCCESSFUL"
$result -match "BUILD SUCCESSFUL"
```

---

### 5. node_modules缂撳瓨鎹熷潖

**闂**锛氶儴鍒咥pp锛圡03, S02绛夛級鍦?`expo prebuild --clean` 鍚巒ode_modules缂撳瓨鎹熷潖銆?
**鐥囩姸**锛氱己灏?`cli-cursor` 绛変緷璧栵紝鏋勫缓鎶?`MODULE_NOT_FOUND`銆?
**淇**锛?```powershell
# 鍦ˋpp鐩綍涓嬫墽琛?npm install cli-cursor
# 鎴栧畬鏁撮噸瑁?npm install
```

---

## 涓夈€佹暟鎹簱鐩稿叧

### 1. SQLite琛ㄥ悕鍜岀粨鏋?
```sql
-- 鐢ㄦ埛鏁版嵁搴撹〃鍚?CREATE TABLE kline_daily (
    code TEXT,      -- 鑲＄エ浠ｇ爜
    date TEXT,      -- 鏃ユ湡
    open REAL,
    high REAL,
    low REAL,
    close REAL,
    volume REAL,
    amount REAL
);

-- 娉ㄦ剰锛氫笉鏄?kline锛屾槸 kline_daily
```

### 2. 鏁版嵁搴撹闂柟寮?
PowerShell鐨?`System.Data.SQLite` 涓嶅彲鐢紝蹇呴』鐢∟ode.js鐨?`better-sqlite3`锛?```javascript
const Database = require('better-sqlite3');
const db = new Database('path/to/database.sqlite', {readonly: true});
const rows = db.prepare('SELECT * FROM kline_daily WHERE code=? ORDER BY date').all(code);
```

### 3. 鐢ㄦ埛鏁版嵁搴撲綅缃?
```
F:\xwechat_files\xzmingweixin_28bf\msg\file\2026-08\kline_2y_2026-08-01.sqlite
```
- 1155鍙偂绁?- 姣忓彧504鏍筀绾?- 75.5MB

---

## 鍥涖€丒xpo棰勬瀯寤烘敞鎰忎簨椤?
### 1. prebuild --clean 浼氳鐩栨墜鍔ㄤ慨鏀?
`expo prebuild --clean` 浼氬畬鍏ㄩ噸鏂扮敓鎴?`android/` 鐩綍锛屾墜鍔ㄦ坊鍔犵殑 `ndk.abiFilters` 绛夐厤缃細涓㈠け銆?
**鎺ㄨ崘鏂规**锛氫娇鐢?`expo-build-properties` 鎻掍欢鎸佷箙鍖栭厤缃細
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

### 2. Expo CLI璺緞

浠嶢pp鐩綍璋冪敤Expo CLI锛?```powershell
node "node_modules\expo\bin\cli" start
```

---

## 浜斻€丟it浠撳簱

### 杩滅▼浠撳簱
- **Gitee**: https://gitee.com/xzmingmy/kline-strategy-apps.git 锛堝彲鎺ㄩ€侊級
- **GitHub**: https://github.com/xzminggh/kline-strategy-apps.git 锛堥槻鐏闃绘柇锛?
### 鏁忔劅淇℃伅
- `debug-logs/` 宸插姞鍏?`.gitignore`
- 鏁版嵁搴撹矾寰勩€佸井淇℃枃浠惰矾寰勪笉搴旀彁浜?
---

## 鍏€?6涓狝pp绛栫暐涓€瑙?
| 缂栧彿 | 绛栫暐鍚?| 鏍稿績鎸囨爣 | 鐗规畩淇 |
|------|--------|----------|----------|
| D01 | MACD閲戝弶 | EMA(12,26) + MACD浜ゅ弶 | findLocalExtrema杩斿洖鍊?|
| D02 | MACD椤惰儗绂?| 浠锋牸鏂伴珮 + MACD鏈柊楂?| findLocalExtrema杩斿洖鍊?|
| D03 | MACD搴曡儗绂?| 浠锋牸鏂颁綆 + MACD鏈柊浣?| 鈥?|
| K01 | KDJ閲戝弶 | K/D/J + 瓒呭崠鍖?| 鈥?|
| K02 | KDJ瓒呭崠鍙嶅脊 | J鍊?< 0 | findLocalExtrema杩斿洖鍊?|
| K03 | KDJ椤惰儗绂?| 浠锋牸鏂伴珮 + K鍊兼湭鏂伴珮 | 鈥?|
| M01 | 鍧囩嚎澶氬ご鎺掑垪 | MA(5,10,20,60) 椤哄簭鎺掑垪 | 鈥?|
| M02 | 鍧囩嚎閲戝弶 | MA(5/10)涓婄┛MA(20) | 鈥?|
| M03 | 鍧囩嚎绮樺悎绐佺牬 | 澶氭潯鍧囩嚎鏀舵暃鍚庡彂鏁?| node_modules缂撳瓨 |
| M04 | 鍧囩嚎绌哄ご鎺掑垪 | MA鍊掑簭鎺掑垪 | 鈥?|
| P01 | 甯冩灄甯︿笅杞ㄥ弽寮?| 浠锋牸瑙﹀強涓嬭建 + 鍥炲崌 | 鈥?|
| P02 | 甯冩灄甯︽敹鍙ｇ獊鐮?| 甯﹀鏀剁獎鍚庣獊鐮?| 鈥?|
| P03 | 甯冩灄甯︿腑杞ㄦ敮鎾?| 鍥炶俯涓建涓嶇牬 | findLocalExtrema杩斿洖鍊?|
| P04 | 甯冩灄甯︿笂杞ㄥ帇鍔?| 瑙﹀強涓婅建鍥炶惤 | 鈥?|
| Q01 | 鍦伴噺瑙佸簳 | 鎴愪氦閲忓垱N鏃ユ柊浣?| 鈥?|
| Q02 | 鏀鹃噺绐佺牬 | 鎴愪氦閲忓€嶅 + 浠锋牸绐佺牬 | 鈥?|
| S01 | 鍙屽簳褰㈡€?| W搴?+ 棰堢嚎绐佺牬 | findLocalExtrema绋€鐤忔暟缁勫吋瀹?|
| S02 | 鍧囩嚎浜ゅ弶 | EMA浜ゅ弶 | node_modules缂撳瓨 |
| S03 | 澶磋偐椤跺舰鎬?| 澶磋偐褰㈡€?+ 棰堢嚎璺岀牬 | 瀹瑰樊闃堝€兼斁瀹?+ forming鐘舵€?|
| S04 | 涓夊彧涔岄甫 | 杩炵画涓夋牴闃寸嚎 | 鈥?|
| T01 | 鍙屽潎绾跨瓥鐣?| MA(5/20)浜ゅ弶 | 鈥?|
| T02 | 涓夊潎绾跨瓥鐣?| MA(5/10/20)浜ゅ弶 | 鈥?|
| T03 | 鍧囩嚎鏂楃墰(Guppy) | 澶欵MA缁勫悎 | 鏁扮粍姣旇緝Bug |
| T04 | 涓夌嚎寮€鑺?| MA(5/10/60)浜ゅ弶 | 鈥?|
| V01 | 甯冩灄甯︽尋鍘?| 甯冩灄甯﹀搴︽瀬灏?| 鈥?|
| V02 | ATR绐勫箙绐佺牬 | ATR鍘嬬缉 + 鏂瑰悜绐佺牬 | 闃堝€间笉鍚堢悊锛?.6鈫?.75, 0.5鈫?.3锛?|

---

## 涓冦€佸叧閿粡楠屾€荤粨

### 绛栫暐寮€鍙?1. **闃堝€煎繀椤荤敤鐪熷疄鏁版嵁楠岃瘉** 鈥?鍏堣窇鍏ㄩ噺娴嬭瘯鐪嬪垎甯冿紝鍐嶅畾闃堝€?2. **绋€鐤忔暟缁勮鏄惧紡澶勭悊** 鈥?`null` 鍊间笉鑳界洿鎺ヨ闂睘鎬?3. **浜岀淮鏁扮粍瑕侀檷缁?* 鈥?鍙栧潎鍊兼垨鐗瑰畾浣嶇疆鍐嶆瘮杈?4. **瀹瑰樊瑕侀€傚簲甯傚満鐗规€?* 鈥?A鑲℃尝鍔ㄥぇ锛屽宸姣旂編鑲″

### Android鏋勫缓
1. **reactNativeArchitectures > ndk.abiFilters** 鈥?鍓嶈€呮帶鍒禖Make锛屽悗鑰呭彧鎺у埗鎵撳寘
2. **clean鏄繀椤荤殑** 鈥?澧為噺鏋勫缓浼氳烦杩囦慨鏀规娴?3. **Gradle鐗堟湰瑕佸尮閰?* 鈥?RN 0.86.x闇€瑕丟radle 9.3.x + JDK 17
4. **node_modules浼氭崯鍧?* 鈥?prebuild鍚庡閬嘙ODULE_NOT_FOUND锛屽厛npm install

### 璋冭瘯鎶€宸?1. **PowerShell瓒呮椂** 鈥?Gradle鏋勫缓闇€瑕?`timeout 1800000`锛?0鍒嗛挓锛?2. **鑴氭湰鍒ゆ柇涓嶈兘鍙湅鏈€鍚庝竴琛?* 鈥?瑕佸尮閰?"BUILD SUCCESSFUL" 鍏抽敭瀛?3. **APK澶у皬楠岃瘉** 鈥?鐢╖ipFile妫€鏌?so鏂囦欢纭鏋舵瀯

---

## 2026-08-04 浼氳瘽锛欱ug淇 + v3.0.0 鍙戠増

### 1. OverviewScreen 缂哄皯 KlineFiller 瀵煎叆

**闂**锛歚OverviewScreen.tsx` 浣跨敤 `KlineFiller` 浣嗘湭瀵煎叆锛屽鑷?`Property 'KlineFiller' doesn't exist` 杩愯鏃舵姤閿欍€?
**淇**锛氬湪 imports 涓坊鍔?`import { KlineFiller } from '../services/KlineFiller';`

### 2. 姒傝椤甸噸澶?琛ラ綈鏈€鏂癒绾?鎸夐挳

**闂**锛氭瑙堥〉鏈変袱澶勮ˉ榻愭寜閽?鈥?`SyncPanel` 缁勪欢鍐呬竴涓紝"鏁版嵁搴撲俊鎭?鍖哄潡鍐呬竴涓紝鍔熻兘閲嶅銆?
**淇**锛氱Щ闄?鏁版嵁搴撲俊鎭?鍖哄潡鍐呯殑 `TouchableOpacity` 琛ラ綈鎸夐挳鍙婂叾杩涘害鏉°€?
### 3. KlineChart 鍙屽嚮閲嶇疆涓嶆樉绀烘渶鏂版暟鎹?
**闂**锛氳鎯呴〉琛ラ綈鏁版嵁鍚庡弻鍑?K 绾垮浘锛屽浘琛ㄤ粛鏄剧ず鏃ф暟鎹寖鍥淬€?
**鏍瑰洜**锛歚panResponder` 鐢?`useRef` 鍒涘缓锛岄棴鍖呮崟鑾蜂簡鍒濆 `data.length`锛屽弻鍑?`setEndIndex(totalCount)` 鐢ㄦ棫鍊笺€?
**淇**锛氭敼涓?`useMemo` 渚濊禆 `[data.length, defaultVisibleCount, candleWidth, gap, actualVisible, actualEnd, visibleData.length]`锛屾暟鎹洿鏂版椂閲嶅缓 PanResponder銆?
**璇﹁**锛歚lessons_learned_klinechart_panresponder.md`

### 4. 鐗堟湰鍗囩骇鑷?v3.0.0

- `app.json`: version 2.0.0 鈫?3.0.0
- `package.json`: version 2.0.0 鈫?3.0.0
- `android/app/build.gradle`: versionCode 1 鈫?3, versionName "2.0.0" 鈫?"3.0.0"

### 缁忛獙鎬荤粨

1. **useRef 闂寘闄烽槺** 鈥?PanResponder 绛夊湪缁勪欢鎸傝浇鏃跺垱寤虹殑瀵硅薄锛岀敤 useRef 浼氭案涔呮崟鑾峰垵濮嬪€笺€備緷璧栫姸鎬佺殑鍒涘缓閫昏緫搴旂敤 useMemo銆?2. **Expo Go 娴嬭瘯浼樺厛** 鈥?鍏堝湪 Expo Go 楠岃瘉鍔熻兘锛屽啀鎵撳寘 APK锛屽彲浠ュ揩閫熻凯浠ｉ伩鍏嶅弽澶嶆瀯寤恒€?3. **閲嶅 UI 缁勪欢妫€鏌?* 鈥?鏂板鍔熻兘缁勪欢锛堝 SyncPanel锛夊悗锛岄渶妫€鏌ラ〉闈㈡槸鍚﹀凡鏈夊悓绫绘寜閽€?
---

## 2026-08-08 浼氳瘽锛氥€愯仈缃戝鍏ユ柊鑲＄エ + 鎴愪氦閲忓崟浣嶇粺涓€銆?
### 1. 鍔熻兘锛氳鎯呴〉杈撳叆浠绘剰鑲＄エ浠ｇ爜 鈫?鑱旂綉瀵煎叆鍏ㄩ噺鍘嗗彶 鈫?26 绛栫暐鍒嗘瀽

**鑳屾櫙**锛歬line_-analysis 涔嬪墠鍙兘瀵广€屽鍏ョ殑鑲＄エ搴撱€嶅仛澧為噺琛ラ綈锛涙湰鍦版棤鏁版嵁鐨勪唬鐮佺偣銆岃ˉ榻愭鑲°€嶄細璇姤銆屽凡鏄渶鏂版暟鎹€嶏紝涓斾笉鍐?stocks 琛紝鏃犳硶褰㈡垚銆岃緭鍏ヤ唬鐮佲啋鎶撳彇鈫掑垎鏋愩€嶉棴鐜紙fund-screener 宸叉湁姝よ兘鍔涳級銆?
**鏀瑰姩**锛?- 鏂板 `src/services/StockImporter.ts`锛歚normalizeStockCode`锛?浣嶆牎楠岋紝鏀寔 sh600519 鍓嶇紑锛夈€乣fetchStockName`锛堜笢璐?stock/get 鍙?f58锛孶TF-8 鏃犻渶杞爜锛屽け璐ュ洖閫€锛夈€乣importNewStock`锛坄fetchDailyKline(code, 1000, 'raw')` 鈫?`insertMissingBars`锛堝彧 INSERT锛夆啋 `INSERT OR REPLACE INTO stocks`锛?- `src/screens/DetailScreen.tsx`锛氥€岃ˉ榻愭鑲°€嶅崌绾т负銆岃仈缃戞洿鏂般€嶆櫤鑳藉垎娴佲€斺€旀湰鍦版棤K绾?鈫?鍏ㄩ噺瀵煎叆锛涘簱鍐呭凡鏈?鈫?澧為噺琛ラ綈銆傛垚鍔熷悗鍒锋柊 stockList + klineData锛岃嚜鍔ㄨЕ鍙?26 绛栫暐鍒嗘瀽鍛堢幇
- `src/database/SQLiteProvider.tsx`锛氬垵濮嬪寲琛?`CREATE TABLE IF NOT EXISTS stocks/kline_daily/meta`锛圗xpo Go 绌哄簱鏃惰嚜鍔ㄥ鍏ュ彲鐢級锛涙柊澧?`upsertStock` 鏂规硶

### 2. 淇锛氳ˉ榻愭暟鎹垚浜ら噺鍗曚綅涓庢闈㈢増 SQLite 涓嶄竴鑷?
**闂**锛氳€佽矾寰?`KlineFiller 鈫?QuoteFetcher` 鎶婅吘璁?鏂版氮鍘熺敓銆岃偂銆嶃€佷笢璐€屾墜銆嶇洿鎺ュ啓鍏?db锛涜€?db 缁?`migrateVolumeToWanShou` 宸叉槸銆屼竾鎵嬨€嶏紝涓旀柊鐗?SyncService 鐢?`KlineFetcher` 褰掍竴鍖栥€屼竾鎵嬨€嶃€傝鎯呴〉 K 绾垮浘/鍘嗗彶琛ㄥ洜姝ゅ嚭鐜板悓涓€涓簱涓ょ鏁伴噺绾ф贩瀛樸€?
**淇**锛歚KlineFiller` 鏁版嵁婧愭暣浣撳垏鎹?`QuoteFetcher.fetchKline` 鈫?`KlineFetcher.fetchDailyKline`锛堜笁婧愰檷绾?+ 鑵捐梅1000000/鏂版氮梅1000000/涓滆储梅10000 褰掍竴涓囨墜锛夛紝骞跺彧琛ョ己澶变氦鏄撴棩锛堣缃?`new Set(missingDays)` 杩囨护锛岀粷涓嶈鐩栧凡鏈夊巻鍙诧級銆備笁鏉¤矾寰勶紙鍗曡偂琛ラ綈 / 鎵归噺琛ラ綈 / 鏂板搧瀵煎叆锛夌幇鍦ㄥ叡鐢ㄥ悓涓€褰掍竴鍖栧彛寰勩€?
**娉ㄦ剰**锛氬凡琚棫璺緞姹℃煋鐨勮鏃犳硶鑷姩璇嗗埆娓呮礂鈥斺€旇嫢鍙戠幇鏌愯偂鎴愪氦閲忎笌鍏朵粬鑲″樊 100 鍊嶏紝鍒犻櫎璇ヨ偂 kline_daily 琛屽悗閲嶆柊琛ラ綈鍗冲彲銆?
### 3. 瀛橀噺璐ㄩ噺闂椤烘墜淇

- `StrategyScreen.tsx`锛歚resultHeader` 鏍峰紡鍦ㄤ笂娆″幓閲嶆椂琚鍒狅紙JSX 浠嶅紩鐢級鈫?琛ュ洖
- `sync_test.ts`锛氱Щ闄ゅ凡涓嶅瓨鍦ㄧ殑 `fetchKlineWithFallback` 鏂█娈碉紙闄嶇骇瑕嗙洊宸茶縼绉昏嚦 KlineFetcher/SyncService 鍗曟祴锛?
### 4. 璐ㄩ噺闂?
- `tsc --noEmit` 鉁?/ `jest` 11濂椾欢136鐢ㄤ緥鍏ㄨ繃锛堟柊澧?KlineFiller 鏂拌涔夌敤渚?+ StockImporter 8 鐢ㄤ緥锛夆渽 / `eslint` 0 error锛堝瓨閲?warning 鏈柊澧烇級鉁?
**璇﹁**锛歚lessons_learned_import_unit_unify.md`
### 5. 成交量单位「存量自愈」：导入库历史分类自动归一万手

**背景**：桌面导出的 SQLite 历史库 kline_daily.volume 可能是「手」或「股」口径（非万手），与新补齐 bar（万手）混存，K线图/历史表呈现同一股差 1e4/1e6 倍。已核对 fund-screener：fund_flow 不存 volume（放弃该列回避了单位问题），此归一化是 K 线产品线独有需求。

**方案**（用户确认 A 方案，无需重导库）：
- 新增 `src/services/VolumeUnitNormalizer.ts`：`detectVolumeFactor(localBars, onlineBars)` 取最近 ≤10 根重叠 bar 之 volume 比值中位数，±15% 容差内判定 1 / 10000 / 1000000；无重叠或不成体系 → null 保守不动。`normalizeStockVolume(db, code, factor)` 执行 `UPDATE kline_daily SET volume = ROUND(volume / ?, 2) WHERE code = ? AND volume > 0`，只动 volume 列。
- 接入 `SyncService.runFullSync`（每股 fetch 后、diff 前，volumeNormalized 标记保证只洗一次）与 `KlineFiller.fillSingle`（fetch 后、过滤插入前；归一失败仅告警不影响主流程）。
- 幂等方式：归一后再检测即 ≈1 无操作。

**质量门**：tsc 0 错 / jest 12 套件 149 用例全过（VolumeUnitNormalizer 9 + SyncService 2 + KlineFiller 2 新增用例）/ eslint 0 error（存量 warning 未新增）。

**测试口径注意**：tencentFetchFor fixture 改为 bar×1e6 模拟腾讯「股」原生值，与解析 ÷1e6 还原万手一致，既有铁律断言（hasDestructiveKlineSql）全部保持。

**详见**：`lessons_learned_volume_unit_autofix.md`

### 6. 数据库文件损坏自愈：「file is not a database」根治

**现象**：启动即报 `getStocks failed: Call to function 'NativeDatabase.prepareAsync' has been rejected → file is not a database`，App 完全不可用。
**根因**：`importDatabase` 复制文件时若拷贝失败/用户误选非 SQLite 文件，会把 kline.sqlite 覆盖成损坏内容；SQLite 打开时是懒校验，prepare 阶段才爆「不是数据库」，且启动流程（copyDatabase 见 localExists 就跳过 seed）每次都打开坏文件。
**修复**（SQLiteProvider.tsx）：
- 新增 `probeDatabaseHealth`（SELECT 1 探活）与 `quarantineCorruptDb`（坏文件改名 kline_corrupt_*.sqlite 保留现场）。
- initDatabase 打开后立即探活：坏 → 隔离 + 重建空库（自动建表逻辑照旧）。
- importDatabase 复制后三重校验（存在 + size≥16 + probe），失败自动回滚：有备份则复制回原库并重开恢复连接；无备份则删坏文件建空库，绝不落库不可用状态，并返回可读错误。
**详见**：lessons_learned_corrupt_db_selfheal.md
