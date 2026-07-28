/**
 * FillCache 单元测试
 */

import { FillCache } from './FillCache';

describe('FillCache', () => {
  let cache: FillCache;

  beforeEach(() => {
    cache = new FillCache(3, 60000); // 容量3，TTL 1分钟
  });

  it('初始为空', () => {
    expect(cache.size()).toBe(0);
    expect(cache.has('600519')).toBe(false);
    expect(cache.get('600519')).toBeNull();
  });

  it('set 后 get 能取到', () => {
    cache.set('600519', '2026-07-25');
    expect(cache.size()).toBe(1);
    expect(cache.has('600519')).toBe(true);

    const entry = cache.get('600519');
    expect(entry).not.toBeNull();
    expect(entry!.code).toBe('600519');
    expect(entry!.latestDate).toBe('2026-07-25');
  });

  it('超出容量时淘汰最早记录', () => {
    cache.set('600519', '2026-07-25');
    cache.set('000001', '2026-07-25');
    cache.set('300001', '2026-07-25');
    cache.set('688001', '2026-07-25');

    expect(cache.size()).toBe(3);
    expect(cache.has('600519')).toBe(false); // 最早被淘汰
    expect(cache.has('000001')).toBe(true);
    expect(cache.has('300001')).toBe(true);
    expect(cache.has('688001')).toBe(true);
  });

  it('重复 set 同一 code 不重复计数', () => {
    cache.set('600519', '2026-07-24');
    cache.set('600519', '2026-07-25');
    expect(cache.size()).toBe(1);

    const entry = cache.get('600519');
    expect(entry!.latestDate).toBe('2026-07-25');
  });

  it('访问后移到末尾（LRU 顺序）', () => {
    cache.set('600519', '2026-07-25');
    cache.set('000001', '2026-07-25');
    cache.set('300001', '2026-07-25');

    // 访问 600519，它应该变成最新
    cache.get('600519');

    // 新增一个，应该淘汰 000001（最早）
    cache.set('688001', '2026-07-25');

    expect(cache.has('600519')).toBe(true);
    expect(cache.has('000001')).toBe(false);
    expect(cache.has('300001')).toBe(true);
    expect(cache.has('688001')).toBe(true);
  });

  it('过期后 get 返回 null', () => {
    const shortCache = new FillCache(10, 1); // TTL 1ms
    shortCache.set('600519', '2026-07-25');

    // 立即获取应存在
    expect(shortCache.has('600519')).toBe(true);

    // 等待过期
    const start = Date.now();
    while (Date.now() - start < 5) { /* busy wait */ }

    expect(shortCache.has('600519')).toBe(false);
  });

  it('clear 后为空', () => {
    cache.set('600519', '2026-07-25');
    cache.clear();
    expect(cache.size()).toBe(0);
    expect(cache.has('600519')).toBe(false);
  });

  it('entries 返回所有条目', () => {
    cache.set('600519', '2026-07-25');
    cache.set('000001', '2026-07-26');

    const entries = cache.entries();
    expect(entries).toHaveLength(2);
    expect(entries[0].code).toBe('600519');
    expect(entries[1].code).toBe('000001');
  });
});
