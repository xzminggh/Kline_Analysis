// 手机端直连同步编排：三级降级(东财->腾讯->新浪) + 超时重试 + 增量写入
import { SYNC_CONFIG, SOURCE_ORDER } from '../config.ts';
import type { KlineQuery, KlineRow, KlineSource, FetchResult } from './sources/types.ts';
import { eastmoneySource } from './sources/eastmoney.ts';
import { tencentSource } from './sources/tencent.ts';
import { sinaSource } from './sources/sina.ts';
import { diffKlineRows } from './syncCore.ts';

const SOURCES: Record<string, KlineSource> = {
  eastmoney: eastmoneySource,
  tencent: tencentSource,
  sina: sinaSource,
};

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}
function fmt(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
export function todayStr(): string {
  return fmt(new Date());
}
export function nextDay(date: string): string {
  const d = new Date(`${date}T00:00:00`);
  d.setDate(d.getDate() + 1);
  return fmt(d);
}

// 单源：超时(AbortController) + 指数退避重试
async function trySourceWithRetry(
  source: KlineSource,
  q: KlineQuery,
  signal?: AbortSignal
): Promise<FetchResult> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= SYNC_CONFIG.retry; attempt++) {
    try {
      return await source.fetchKline(q, signal);
    } catch (e) {
      lastErr = e;
      if (attempt < SYNC_CONFIG.retry) {
        await delay(SYNC_CONFIG.retryBaseMs * Math.pow(2, attempt));
      }
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

// 三级降级：依次尝试 sources，上一个整体失败自动降级下一个
export async function fetchKlineWithFallback(
  sources: KlineSource[],
  q: KlineQuery,
  signal?: AbortSignal
): Promise<{ result: FetchResult; used: string }> {
  let lastErr: unknown;
  for (const src of sources) {
    try {
      const result = await trySourceWithRetry(src, q, signal);
      return { result, used: src.name };
    } catch (e) {
      lastErr = e;
      console.warn(`[Sync] 源 ${src.name} 失败，降级下一个:`, e instanceof Error ? e.message : e);
    }
  }
  throw new Error(`all_sources_failed: ${lastErr instanceof Error ? lastErr.message : String(lastErr)}`);
}

// 默认三级：东财 -> 腾讯 -> 新浪
export function defaultSources(): KlineSource[] {
  return SOURCE_ORDER.map((n) => SOURCES[n]);
}

// 依赖注入：由调用方(组件)从 useDatabase() 传入，避免在纯模块里依赖 React context
export interface SyncDeps {
  getLatestKlineDate: (code: string) => Promise<string | null>;
  upsertKlineRows: (rows: KlineRow[]) => Promise<number>;
}

export interface SyncStockResult {
  code: string;
  added: number;
  used: string;
  error?: string;
}

export interface SyncOptions {
  fqt?: number;
  onLog?: (msg: string) => void;
  sources?: KlineSource[];
}

// 单股同步：取本地最新 date -> 抓 [latest+1, 今天] -> 增量 -> 写入
export async function syncStock(
  deps: SyncDeps,
  stock: { code: string; market?: string },
  opts?: SyncOptions
): Promise<SyncStockResult> {
  const latest = await deps.getLatestKlineDate(stock.code);
  const start = latest ? nextDay(latest) : '';
  const end = todayStr();
  const q: KlineQuery = {
    code: stock.code,
    market: stock.market,
    start,
    end,
    fqt: opts?.fqt ?? SYNC_CONFIG.fqt,
  };
  const ctrl = new AbortController();
  const { result, used } = await fetchKlineWithFallback(opts?.sources ?? defaultSources(), q, ctrl.signal);
  const toAdd = diffKlineRows(latest, result.data);
  const added = await deps.upsertKlineRows(toAdd);
  opts?.onLog?.(`${stock.code} 补全 ${added} 条 (源:${used})`);
  return { code: stock.code, added, used };
}

// 批量同步：逐股、股间限流、单股失败隔离（不中断整体）
export async function syncAll(
  deps: SyncDeps,
  stocks: { code: string; market?: string }[],
  opts?: SyncOptions
): Promise<SyncStockResult[]> {
  const results: SyncStockResult[] = [];
  for (const s of stocks) {
    try {
      results.push(await syncStock(deps, s, opts));
    } catch (e) {
      results.push({
        code: s.code,
        added: 0,
        used: '',
        error: e instanceof Error ? e.message : String(e),
      });
    }
    await delay(SYNC_CONFIG.perStockDelayMs);
  }
  return results;
}
