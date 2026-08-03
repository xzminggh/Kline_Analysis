/**
 * 补齐缓存 (LRU)
 *
 * 设计原则：
 * 1. 缓存最近补齐过的股票代码及其时间戳
 * 2. 防止短期内重复补齐同一股票
 * 3. 容量上限 30，超限淘汰最早记录
 * 4. 纯内存，不碰 db
 */

export interface CacheEntry {
  code: string;
  filledAt: number;      // 补齐时间戳
  latestDate: string;    // 补齐到的最新日期
}

const DEFAULT_CAPACITY = 30;
const DEFAULT_TTL_MS = 5 * 60 * 1000; // 5 分钟默认 TTL

export class FillCache {
  private cache: Map<string, CacheEntry>;
  private capacity: number;
  private ttlMs: number;

  constructor(capacity = DEFAULT_CAPACITY, ttlMs = DEFAULT_TTL_MS) {
    this.cache = new Map();
    this.capacity = capacity;
    this.ttlMs = ttlMs;
  }

  /** 记录某股已补齐 */
  set(code: string, latestDate: string): void {
    const entry: CacheEntry = {
      code,
      filledAt: Date.now(),
      latestDate,
    };

    // 删除旧记录再插入，确保顺序正确（最新在最后）
    this.cache.delete(code);
    this.cache.set(code, entry);

    // 淘汰最早记录
    if (this.cache.size > this.capacity) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) {
        this.cache.delete(firstKey);
      }
    }
  }

  /** 查询某股是否已缓存且未过期 */
  get(code: string): CacheEntry | null {
    const entry = this.cache.get(code);
    if (!entry) return null;

    // 检查 TTL
    if (Date.now() - entry.filledAt > this.ttlMs) {
      this.cache.delete(code);
      return null;
    }

    // 访问后移到末尾（LRU）
    this.cache.delete(code);
    this.cache.set(code, entry);
    return entry;
  }

  /** 是否已缓存且未过期 */
  has(code: string): boolean {
    return this.get(code) !== null;
  }

  /** 清除缓存 */
  clear(): void {
    this.cache.clear();
  }

  /** 当前缓存数量 */
  size(): number {
    return this.cache.size;
  }

  /** 所有缓存条目（按时间升序） */
  entries(): CacheEntry[] {
    return Array.from(this.cache.values());
  }
}
