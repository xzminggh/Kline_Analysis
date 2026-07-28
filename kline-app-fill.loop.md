# Loop Manifest V2.0 — K线增量补齐循环

> 基于原 `kline-app-dev.loop.md` 的扩展循环。原循环已完成离线 K 线分析 App 构建;本循环新增"对上传 db 中的股票 K 线检查对比,对新 K 线进行实时手机端补齐"能力。
> **生成时间**: 2026-07-28
> **基础项目**: kline_-analysis (Expo SDK 57 + RN 0.86)
> **生成方式**: loop-architect 四步渐进式引导 → 用户确认

---

## mode
mode: "C - 混合补齐循环 (全量检查 + 单股实时)"

## 终止条件 (termination)
termination:
  success_criteria:
    - "全量入口: 一次补齐后, db 中全部股票 MAX(date) >= 今日交易日 (停牌股除外)"
    - "单股入口: 详情页打开后 3s 内完成缺失检测与补齐 (含网络拉取)"
    - "补齐后的股票可立即触发策略重算并刷新 UI"
    - "三源降级中至少一源可用时, 单只股票拉取成功率 >= 95%"
  max_retries:
    per_stock: 3        # 单只股票三源各试一次
    batch_round: 2      # 整批重试 1 轮
    circuit_breaker: 5  # 连续 5 只全失败 → 熔断
  timeout:
    per_stock_seconds: 10       # 单只超时
    full_batch_minutes: 8       # 全量补齐 288 只预算
    single_stock_ui_seconds: 3  # 单股 UI 不阻塞预算

## 工具箱 (tools)
tools:
  enabled:
    - file_io              # expo-file-system (已安装)
    - sqlite_io            # expo-sqlite (已安装, 复用现有 db 句柄)
    - network_fetch        # RN 内置 fetch + 轻量封装, 不引入 axios
    - backup_auto          # 复用 importDatabase 已有备份机制
    - state_log            # state.json + errors.log
  optional_enabled:
    - quote_fetcher_3source   # [1] 腾讯→新浪→东方财富 三源降级
    - lru_cache_30            # [3] 单股 LRU 缓存 30 只
  optional_disabled:
    - background_fetch        # [2] 不启用, 与"轻量"冲突
    - progress_notification   # [4] 不启用, 非必需

## 工作区 (workspace)
workspace:
  root: "./kline_-analysis/loop_workspace/"
  state_file: "state.json"           # 上次补齐时间, 最后成功股票
  history_dir: "history/"            # {timestamp}_before_fill.sqlite 快照
  errors_log: "errors.log"

## 流水线 (pipeline)
pipeline:
  # 入口 A: 全量检查补齐 (概览页「补齐」按钮触发)
  entry_a_full_batch:
    - step: "scan_missing"            # 扫描 MAX(date) per code, 输出缺失清单
    - step: "backup_db"               # 自动备份到 history/
    - step: "batch_fetch"             # 按清单逐只调用 QuoteFetcher (三源降级)
    - step: "incremental_write"       # INSERT OR REPLACE 批量写入
    - step: "progress_feedback"       # UI 进度条 + 失败重试
    - step: "summary_report"          # 输出补齐摘要
    - step: "ask_recompute"           # 询问是否重跑全部策略 (不自动)

  # 入口 B: 单股实时补齐 (详情页 useFocusEffect 触发)
  entry_b_single_stock:
    - step: "detect_missing"          # 读 MAX(date) 与今日对比
    - step: "cache_check"            # LRU 缓存命中则直接复用
    - step: "silent_fetch"           # 后台拉取, UI 显示 loading 占位
    - step: "incremental_write"       # 写回 db
    - step: "refresh_chart"           # 刷新该股 K 线图
    - step: "recompute_single"       # 自动重算该股策略, 刷新星级

  # 共享内核 (两个入口都调用)
  shared_kernel:
    quote_fetcher: "src/services/QuoteFetcher.ts"     # 三源降级拉取 + 归一化
    kline_filler: "src/services/KlineFiller.ts"        # 补齐业务编排
    fill_cache: "src/services/FillCache.ts"            # LRU 缓存
    trading_calendar: "src/utils/tradingCalendar.ts"  # A 股交易日历 (2026 节假日硬编码)

## 人工介入 (human_in_the_loop)
human_in_the_loop:
  triggers:
    - "首次 INSERT OR REPLACE 覆盖已有 kline_daily 记录前"
    - "三源全部失败, 批量任务暂停, 输出诊断报告"
    - "单次批量补齐 > 50 只股票, 分批之间需确认继续"
    - "连续 5 只三源全失败 → 整体熔断, 等待用户检查网络"
    - "db 写入 SQLITE_BUSY 重试 3 次仍失败"
  on_continuous_failure: "暂停并生成 FILL_FAILURE_REPORT.md"

## 模块边界铁律 (module_boundary)
module_boundary:
  network_layer:
    - "QuoteFetcher.ts 仅负责拉取与归一化, 禁止触碰 db 写入"
    - "QuoteFetcher.ts 禁止触碰 UI / 策略 / 指标文件"
  orchestration:
    - "KlineFiller.ts 负责编排, 调用 QuoteFetcher 与 db 写入"
  data_layer:
    - "db 写入仅通过 SQLiteProvider 已有接口或新增的增量写入方法"
    - "UI 改动不得修改 database/ 目录任何文件"
  backward_compat:
    - "保留现有 SQLiteProvider.importDatabase 行为不变"
    - "保留现有 25 策略与指标计算逻辑不变"

## 自动加载的陷阱防护 (pitfalls_auto_loaded)
pitfalls_auto_loaded:
  - "A 股交易日历准确性: 本地硬编码 2026 节假日表, 提供「手动指定截止日期」兜底"
  - "数据源字段差异: 三源字段名/单位不同, QuoteFetcher 内部统一归一化为 kline_daily 表结构"
  - "停牌股票: 拉取返回空不应判定为失败, 输出「停牌, 无新数据」状态"
  - "复权处理: 默认拉前复权 (qfq), 与 db 既有数据一致; 若 db 是不复权数据则拉不复权"
  - "db 锁竞争: 单股入口与全量入口互斥锁 isFilling 串行化, 不可并发"
  - "网络层错误蔓延: 三源全失败立即暂停批量, 不继续后续股票"

## 约束变更 (constraint_changes, 相对原 Manifest)
constraint_changes:
  - removed: "严禁联网 (原 Manifest 风险防护条款)"
    scope: "仅解除行情拉取模块的网络限制, 其他模块仍纯本地"
  - added: "网络层模块边界铁律 (见 module_boundary)"
  - preserved: "最小变更原则, 不改 API/加依赖 (除 fetch 轻量封装外不引入新包)"
  - preserved: "无 production 资源, 纯本地补齐 + 本地策略重算"
  - preserved: "矛盾时停下报告"

## 关键设计点回顾
| 维度 | 设计 |
|---|---|
| 入口 | A 全量(概览页按钮) + B 单股(详情页自动) |
| 内核 | 共享 QuoteFetcher + KlineFiller + FillCache |
| 数据源 | 三源降级(腾讯→新浪→东方财富) |
| 缓存 | LRU 30 只(单股入口专用) |
| 备份 | 自动备份到 history/{timestamp}_before_fill.sqlite |
| 熔断 | 连续 5 只全失败 → 暂停 |
| 模块边界 | 网络层独立,不碰 db/UI/策略/指标 |
| 向后兼容 | 保留现有 importDatabase / 25 策略 / 指标计算不变 |
