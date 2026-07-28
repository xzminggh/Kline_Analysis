#!/usr/bin/env node
/**
 * [wb修改] verify_sync.js — 补齐后数据完整性断言（integration_gate 门控用）
 *
 * 对样例 sqlite 数据库断言：
 *   1. kline_daily 无重复主键 (code, date)
 *   2. 每只股票日期序列无非法断点（以该股自身交易日序列衡量）
 *   3. 补齐后缺失 bar = 0（各股 MAX(date) 达到目标日期）
 *
 * 用法: node scripts/verify_sync.js [db路径] [--target-date YYYY-MM-DD]
 * 退出码: 0 = 全部通过, 1 = 有断言失败, 2 = 环境/参数错误
 *
 * S1 阶段：骨架（参数解析 + 断言框架）。S6 集成阶段接入真实样例 db 跑全量断言。
 */

'use strict';

const fs = require('fs');

function fail(msg) {
  console.error(`[verify_sync] FAIL: ${msg}`);
  process.exitCode = 1;
}

function ok(msg) {
  console.log(`[verify_sync] OK: ${msg}`);
}

async function main() {
  const args = process.argv.slice(2);
  const dbPath = args.find((a) => !a.startsWith('--'));

  if (!dbPath) {
    // S1 骨架模式：无 db 参数时仅自检框架可运行，不算失败
    console.log('[verify_sync] 骨架自检通过（未提供 db 路径，S6 集成阶段将强制要求样例 db）');
    process.exit(0);
  }

  if (!fs.existsSync(dbPath)) {
    console.error(`[verify_sync] 数据库文件不存在: ${dbPath}`);
    process.exit(2);
  }

  // S6 实现要点（使用 node:sqlite 或 better-sqlite3）：
  //  断言1: SELECT code, date, COUNT(*) c FROM kline_daily GROUP BY code, date HAVING c > 1 → 须为空
  //  断言2: 每股日期序列与全市场交易日历比对，无中间空洞
  //  断言3: SELECT code, MAX(date) FROM kline_daily GROUP BY code → 均 >= 目标日期
  fail('S6 集成阶段实现真实断言，当前为 S1 骨架');
}

main().catch((e) => {
  console.error('[verify_sync] 异常:', e);
  process.exit(2);
});
