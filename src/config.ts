// 联网同步配置（手机端直连行情源，无中转层）
export const SYNC_CONFIG = {
  fqt: 1,                  // 复权：1=前复权（上线前需与本地库口径核对；本地不复权则改 0）
  requestTimeoutMs: 8000,  // 单源请求超时
  retry: 2,                // 单源失败后重试次数
  retryBaseMs: 600,        // 重试退避基数（指数：600 / 1200ms）
  perStockDelayMs: 120,    // 逐股同步间隔，规避厂商限频
  backfillDays: 400,       // 历史回填窗口（天）
};

// 三级降级顺序：东财(主) -> 腾讯(备) -> 新浪(兜底)
export const SOURCE_ORDER = ['eastmoney', 'tencent', 'sina'] as const;
export type SourceName = (typeof SOURCE_ORDER)[number];
