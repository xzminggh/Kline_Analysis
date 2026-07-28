# 经验落盘 — Stage2 fetcher（三源降级抓取实现）

日期：2026-07-28
操作人：WorkBuddy（老徐的伙计）

## 本阶段做了什么
- `KlineFetcher.ts` 从骨架升级为完整实现：三源 URL 构造 + 解析器（纯函数可测）+ 8s 超时 + 源级降级 + 去重升序
- 新增 `KlineFetcher.test.ts`：17 个断言（来源优先级、字段映射、单位归一、降级路径、坏 payload 容错）
- fetch 以 `FetchLike` 参数注入，单测全 mock，不依赖网络

## 三家接口实测校准（2026-07-28 沙箱直连验证，高价值）
| 源 | 端点 | 关键差异 |
|----|------|----------|
| 腾讯 | web.ifzq.gtimg.cn/appstock/app/fqkline/get | 字段序 **[date,open,close,high,low,volume]**（open/close 在前！）；volume 手；无 amount；qfq 前复权 |
| 新浪 | money.finance.sina.com.cn CN_MarketData.getKLineData | 对象数组 day/open/high/low/close/volume；**volume 是股 ÷100→手**；无 amount |
| 东财 | push2his.eastmoney.com/api/qt/stock/kline/get | **`lmt` 参数不生效（rc=102 data:null），必须 `beg=YYYYMMDD&end=20500101`**；CSV date,open,close,high,low,volume(手),amount(元)；fqt=1 前复权；唯一提供真实成交额的源 |
- 三源沙箱均可直连（无需代理）；东财需带 UA 头更稳
- 当日盘中 bar 三源都会返回（2026-07-28 盘中实测拿到当日数据）→ S3 补齐时要考虑「当日未收盘 bar」是否入库的问题

## 归一化决策
- volume 统一「手」、amount 统一「元」（腾讯/新浪无 amount 置 0）
- 本地 db 单位若不同，S3 diff 阶段用重叠 bar 自动检测倍率（与复权校验同思路）

## 踩坑
1. jest-expo 57 需要 peer 依赖 `@react-native/jest-preset`（RN 0.86 拆包），不装直接 Validation Error → `npm install --save-dev @react-native/jest-preset` 解决（package.json 新增 1 行 devDep，属质检基建必需）
2. 测试断言别写死跨年日期（beg=2026 挂在 120天×2 缓冲跨年上）→ 用格式断言 `/beg=\d{8}/`
3. npm 每次 install 都会「净化」lock 里的陈旧条目（-52 行 @react-navigation/stack 残留）——这次连同 devDep 一起提交，lock 与 package.json 保持一致

## 质检结果
- KlineFetcher.test.ts 17/17 ✅；全量 jest 4 套件 37/37 ✅（不改坏现有）
- tsc 基线 27→27，services 目录零错误 ✅

## 下一步（S3 diff_patch）
- SyncService 实现 prepare/diff/patch/report；INSERT-only；复权基准校验（重叠bar比对）
- 注意当日未收盘 bar 的处理策略（建议：交易时段内跳过当日 bar，只补已收盘的）
