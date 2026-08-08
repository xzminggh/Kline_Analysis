/**
 * [wb修改] VolumeUnitNormalizer 单测 — detectVolumeFactor 判定边界 + 归一的 SQL 语义
 */

import type { SQLiteDatabase } from 'expo-sqlite';
import type { KlineDaily } from '../database/SQLiteProvider';
import { detectVolumeFactor, normalizeStockVolume } from './VolumeUnitNormalizer';

function bar(date: string, volume: number): KlineDaily {
  return { code: '600000', date, open: 9, high: 9.1, low: 8.9, close: 9.05, volume, amount: 0 };
}

describe('detectVolumeFactor', () => {
  const mkLocal = (vols: number[]) => vols.map((v, i) => bar(`2026-07-${String(10 + i).padStart(2, '0')}`, v));
  const mkOnline = (vols: number[]) => vols.map((v, i) => bar(`2026-07-${String(10 + i).padStart(2, '0')}`, v));

  it('已一致（万手）→ 1', () => {
    const local = mkLocal([3, 3.5, 3.2]);
    const online = mkOnline([3, 3.5, 3.2]);
    expect(detectVolumeFactor(local, online)).toBe(1);
  });

  it('本地存量是「手」→ 10000', () => {
    const local = mkLocal([30000, 35000, 32000]);
    const online = mkOnline([3, 3.5, 3.2]);
    expect(detectVolumeFactor(local, online)).toBe(10000);
  });

  it('本地存量是「股」→ 1000000', () => {
    const local = mkLocal([3000000, 3500000, 3200000]);
    const online = mkOnline([3, 3.5, 3.2]);
    expect(detectVolumeFactor(local, online)).toBe(1000000);
  });

  it('±15% 容差内噪声 → 仍正确判定', () => {
    // 中位数抗噪：一根离群不改变结论
    const local = mkLocal([30000, 35000, 99999, 32000]);
    const online = mkOnline([3, 3.5, 3.0, 3.2]);
    expect(detectVolumeFactor(local, online)).toBe(10000);
  });

  it('比值偏离全部候选因子 → null（保守不动，如停牌/异常数据）', () => {
    const local = mkLocal([3, 5, 7]);
    // 比值 1.5 / 1.25 / 0.5，中位数 1.25 → 偏离 ±15% 判定圈
    const odd = mkOnline([2, 4, 14]);
    expect(detectVolumeFactor(local, odd)).toBe(null);
  });

  it('无重叠日期 → null', () => {
    const local = [bar('2026-07-01', 30000), bar('2026-07-02', 30000)];
    const online = [bar('2026-07-10', 3), bar('2026-07-11', 3)];
    expect(detectVolumeFactor(local, online)).toBe(null);
  });

  it('超过 10 根时只取最近 10 根重叠样本', () => {
    const local: KlineDaily[] = [];
    const online: KlineDaily[] = [];
    // 第 1~15 根本地全是「股」，最近 10 根（后10）是「手」→ 应判「手」
    for (let i = 1; i <= 15; i++) {
      const d = `2026-07-${String(i).padStart(2, '0')}`;
      const isRecent = i > 5;
      local.push(bar(d, isRecent ? 30000 : 3000000));
      online.push(bar(d, 3));
    }
    expect(detectVolumeFactor(local, online)).toBe(10000);
  });

  it('volume 为零或缺失的重叠 → 跳过不参与', () => {
    const local = mkLocal([0, 30000, 30000]);
    const online = mkOnline([3, 3, 3]);
    expect(detectVolumeFactor(local, online)).toBe(10000);
  });
});

describe('normalizeStockVolume', () => {
  it('只按 code 归一 volume 列（ROUND 2 位），不触碰价格', async () => {
    const sqls: string[] = [];
    let lastParams: unknown[] = [];
    const db = {
      runAsync: async (sql: string, params: unknown[] = []) => {
        sqls.push(sql);
        lastParams = params;
        return { changes: 7 };
      },
    } as unknown as SQLiteDatabase;
    const changes = await normalizeStockVolume(db, '600000', 10000);
    expect(changes).toBe(7);
    expect(sqls).toHaveLength(1);
    expect(sqls[0]).toMatch(/UPDATE kline_daily SET volume = ROUND\(volume \/ \?, 2\) WHERE code = \? AND volume > 0/i);
    expect(lastParams).toEqual([10000, '600000']);
  });
});