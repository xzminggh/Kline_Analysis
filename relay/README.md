# 联网 K 线中转层（Sync Relay）

轻量中转 API：手机端只跟它通信，它去东方财富抓行情、归一化成 App 的 `kline_daily` 字段。
手机端零爬虫、零缓存逻辑，APK 体积几乎不变。

## 接口

```
GET /kline?code=600000&market=SH&start=20260101&end=20261231&fqt=1
```

| 参数   | 必填 | 说明 |
|--------|------|------|
| code   | 是   | App 裸码，如 `600000`；也兼容 `000001.SZ` 后缀写法 |
| market | 否   | `SH` / `SZ` / `BJ`；缺省时按 code 首位推断（6→SH，0/3→SZ，8/4→BJ） |
| start  | 否   | 起期 `YYYYMMDD`，缺省 `0`（全历史） |
| end    | 否   | 止期 `YYYYMMDD`，缺省 `0`（全历史） |
| fqt    | 否   | 复权：`0` 不复权 / `1` 前复权(默认) / `2` 后复权 |

成功响应（字段顺序对齐 `kline_daily`，可直接 INSERT）：

```json
{ "code": "600000", "data": [
  {"date":"2026-07-24","open":9.08,"high":9.12,"low":9.02,"close":9.04,"volume":506751,"amount":459278079}
]}
```

失败响应（手机端进入重试退避）：

```json
{ "error": "upstream_unavailable", "detail": "upstream_rc_-1" }
```

成功响应带 `cache-control: public, max-age=86400` —— 同一 code+范围 当天只打一次东财。

## 部署

### A. Cloudflare Workers（免费、零运维、全球边缘）

```bash
cd relay
npm i -g wrangler
wrangler login
wrangler deploy        # 产出 https://kline-sync-relay.<sub>.workers.dev
```

可选：在 CF 面板给 Worker 绑自定义域名（国内访问更稳），App 端只改一个 URL。

### B. 腾讯云函数 SCF（国内低延迟，推荐生产）

1. 把 `relay/` 目录打包成 zip（含 `core.mjs` / `scf.mjs`）。
2. 新建云函数：运行环境选 **Node.js 18+**，入口函数填 `scf.main_handler`。
3. 通过 API 网关暴露 HTTPS 地址，填入 App 端。

## ⚠ 量纲与复权（真机核对项）

- `volume` 单位 = **手**，`amount` 单位 = **元**，与东财原生输出一致。26 个策略对 volume 只做相对比较（对自身的 MA），只要新数据与本地库单位一致即可。
- `fqt` 默认 **前复权（1）**。若你的本地库（PC 导入 / 演示库）是**不复权**，需把请求改为 `fqt=0`，否则补进来的新交易日会和旧数据出现价格断层、误触发信号。
- 上线前在真机用一只已有本地数据的股票，对比最后几天东财（同 fqt）与本地库，确认单位+复权一致后再全量补全。

## 沙箱测试说明

本仓库 `relay/test.mjs`（真实抓取）依赖运行环境能出网到 `push2his.eastmoney.com`。
沙箱出网到东财间歇不稳定时，可用 `relay/verify_real.mjs <code>` 对落盘的真实返回 JSON 做离线解析校验：

```bash
curl -s "https://push2his.eastmoney.com/...&secid=1.600000&..." -o "$(echo $TMPDIR)/em_600000.json"
node relay/verify_real.mjs 600000
```

> 注：仅沙箱测试受出网限制影响；Cloudflare Workers / 腾讯 SCF 生产环境出网正常。
