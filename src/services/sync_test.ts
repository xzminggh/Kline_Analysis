// 离线单测：纯逻辑断言，Node 直接跑（不需要 RN / sqlite 环境）
// 运行：node --experimental-strip-types src/services/sync_test.ts
// [wb修改] fetchKlineWithFallback 随旧 syncCore 重构移除，三级降级测试已由 KlineFetcher/SyncService 单测覆盖
import { diffKlineRows } from './syncCore.ts';
import type { KlineRow } from './sources/types.ts';

let pass = 0;
let fail = 0;
function assert(cond: boolean, msg: string): void {
  if (cond) {
    pass++;
    console.log('  ✓', msg);
  } else {
    fail++;
    console.log('  ✗', msg);
  }
}

const rows: KlineRow[] = [
  { code: '600000', date: '2026-07-22', open: 9, high: 9.5, low: 8.8, close: 9.2, volume: 100, amount: 920 },
  { code: '600000', date: '2026-07-23', open: 9.2, high: 9.6, low: 9.0, close: 9.4, volume: 110, amount: 1024 },
  { code: '600000', date: '2026-07-23', open: 9.2, high: 9.6, low: 9.0, close: 9.4, volume: 110, amount: 1024 }, // 重复
];

async function main(): Promise<void> {
  console.log('== diffKlineRows (增量去重) ==');
  assert(diffKlineRows(null, rows).length === 2, '空本地 → 全量(去重后 2 条)');
  assert(diffKlineRows('2026-07-22', rows).length === 1, '本地最新 22 → 仅新增 23(1 条)');
  assert(diffKlineRows('2026-07-23', rows).length === 0, '本地最新 23 → 无新增');

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
}

main();
