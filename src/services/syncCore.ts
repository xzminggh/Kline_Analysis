// 纯函数：增量去重核心（不依赖 RN / sqlite，可 Node 单测）
import type { KlineRow } from './sources/types.ts';

// 返回远端中 date 严格大于 localLatestDate 的行，并按 date 升序去重
export function diffKlineRows(localLatestDate: string | null, rows: KlineRow[]): KlineRow[] {
  const sorted = [...rows].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const seen = new Set<string>();
  const out: KlineRow[] = [];
  for (const r of sorted) {
    if (seen.has(r.date)) continue;
    seen.add(r.date);
    if (localLatestDate == null || r.date > localLatestDate) out.push(r);
  }
  return out;
}
