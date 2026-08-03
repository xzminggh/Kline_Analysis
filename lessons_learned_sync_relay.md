# 经验沉淀：联网 K 线中转层（Stage 0）

> 项目：kline_-analysis 联网自动补全 Loop · Stage 0（sync_relay）
> 日期：2026-07-27

## 1. 东方财富历史 K 线接口（真实可用）

- 域名：`https://push2his.eastmoney.com/api/qt/stock/kline/get`
- 参数：`secid`（如 `1.600000`）、`fields1=f1`、`fields2=f51,f52,f53,f54,f55,f56,f57,f58`、
  `klt=101`（日K）、`fqt=0/1/2`、`beg`、`end`（`YYYYMMDD` 或 `0`=全历史）。
- 必须带 `User-Agent` + `Referer: https://quote.eastmoney.com/`，否则易被拒。
- 返回的 `klines` 每行格式：`日期,开,收,高,低,量,额,振幅`
  → 注意**收在开后面**（与很多数据源不同），映射到 App `kline_daily` 时要 reorder：
  `open=p[1], high=p[3], low=p[4], close=p[2], volume=p[5], amount=p[6]`。
- `rc!==0` 或 `data.klines` 为空 = 该股票无行情（退市等），按"空数据"处理，**不要当错误**。

## 2. 代码 → secid 映射（App 用裸码 + market 字段）

- App 的 `Stock.code` 是裸码 `000001`，`market` 独立字段；东财 secid = `前缀.代码`。
- 前缀：SH(6/9开头)→`1`，SZ(0/3/2开头)→`0`，BJ(8/4开头)→`0`（best-effort，已实测可用）。
- 兼容 `000001.SZ` 后缀写法，也兼容不传 market 时按 code 首位推断。

## 3. 量纲与复权（关键，否则策略算错）

- 东财 `volume`=**手**、`amount`=**元**。App 的 26 策略对 volume 只做相对比较（对自身 MA），
  只要新数据与本地库单位一致即可，无需换算。
- `fqt` 默认**前复权(1)**。若本地库是**不复权**，请求必须改 `fqt=0`，否则新旧价格断层误触发信号。
  → 上线前真机核对一只股票最后几天的单位+复权一致性。

## 4. 沙箱出网限制（仅影响本地测试，不影响部署）

- 沙箱 `curl` 能到东财但**间歇失败**（exit 56 接收中断）；Node `fetch` 到东财失败（example.com 正常）。
  属沙箱出网白名单差异，**CF Workers / 腾讯 SCF 生产环境出网正常**。
- 应对：写 `verify_real.mjs` 对"落盘的真实返回 JSON"做离线解析校验，绕开网络波动也能验解析逻辑。

## 5. 测试断言坑

- `kline_daily.date` 是**字符串**，断言"全字段为数值"时会把 date 判失败。数值断言只覆盖
  `open/high/low/close/volume/amount`，date 单独用 `typeof===string && length>0` 校验。

## 6. 工程纪律（符合项目铁律）

- 中转层全部为**新增文件**（`relay/` 目录），零改动现有 App 源码；手机端接入留到 Stage 1。
- 核心逻辑 `core.mjs` 纯函数化，CF Worker / 腾讯 SCF 双入口共用，便于切换部署目标。
