// 统一数据源接口与类型（各厂商适配器实现 KlineSource）
export interface KlineRow {
  code: string;
  date: string;      // YYYY-MM-DD
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;    // 手
  amount: number;    // 元（无则返回估算值）
}

export interface KlineQuery {
  code: string;       // 裸码，如 600000
  market?: string;    // SH / SZ / BJ
  start?: string;     // YYYYMMDD / YYYY-MM-DD，缺省全历史
  end?: string;
  fqt?: number;       // 复权
}

export interface FetchResult {
  code: string;
  data: KlineRow[];
}

// 每个行情源实现一个：fetchKline(q, signal?) -> 归一化结果
export interface KlineSource {
  name: string;
  fetchKline(q: KlineQuery, signal?: AbortSignal): Promise<FetchResult>;
}
