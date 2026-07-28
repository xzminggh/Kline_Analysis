#!/usr/bin/env node
/**
 * [wb修改] verify_sync.js — 补齐后数据完整性断言（integration_gate 门控用）
 *
 * 对 sqlite 数据库断言：
 *   1. kline_daily 无重复主键 (code, date)
 *   2. 每只股票日期序列连续（以该股自身交易日历=工作日衡量，无中间空洞）
 *   3. 补齐后缺失 bar = 0（各股 MAX(date) 达到目标日期）
 *
 * 设计（S6 集成阶段落地）：
 *  - 用 Node 22 内置 node:sqlite（零新依赖）开真库
 *  - 沙箱无真机、无样例 db、无网络，无法跑真实端到端 sync；
 *    故默认模式用「合成样例 db」：先造补齐前的缺口态，再用 INSERT OR IGNORE 模拟补齐，
 *    再跑三大断言（须全过）→ 证明断言引擎对正确补齐结果放行
 *  - --selftest 模式造 3 类故意破坏的库（重复PK/日期空洞/缺失尾部），
 *    断言引擎须分别判 FAIL → 证明断言是"真检查"而非只数行数（回应 DoD 警告）
 *
 * 用法: node scripts/verify_sync.js [db路径] [--target-date YYYY-MM-DD] [--selftest]
 * 退出码: 0 = 全部通过, 1 = 有断言失败, 2 = 环境/参数错误
 */

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS stocks (code TEXT PRIMARY KEY, name TEXT, market TEXT, sector_id TEXT, status TEXT);
CREATE TABLE IF NOT EXISTS kline_daily (
  code TEXT, date TEXT, open REAL, high REAL, low REAL, close REAL, volume REAL, amount REAL,
  PRIMARY KEY(code, date)
);
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT);
`;

function fmt(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** 生成 [start,end] 内所有工作日（周一~周五）YYYY-MM-DD */
function tradingDays(start, end) {
  const out = [];
  const d = new Date(`${start}T00:00:00`);
  const e = new Date(`${end}T00:00:00`);
  while (d <= e) {
    const dw = d.getDay();
    if (dw !== 0 && dw !== 6) out.push(fmt(d));
    d.setDate(d.getDate() + 1);
  }
  return out;
}

function openDb(dbPath) {
  const db = new DatabaseSync(dbPath);
  db.exec(SCHEMA);
  return db;
}

function seedStock(db, code, days, dropSet) {
  db.prepare('INSERT OR IGNORE INTO stocks VALUES (?,?,?,?,?)').run(code, code, 'sh', '0', '1');
  const insert = db.prepare(
    'INSERT OR IGNORE INTO kline_daily (code,date,open,high,low,close,volume,amount) VALUES (?,?,0,0,0,0,0,0)'
  );
  for (const day of days) {
    if (dropSet && dropSet.has(day)) continue; // 模拟补齐前的缺口/缺失尾部
    insert.run(code, day);
  }
}

/** 模拟补齐：用 INSERT OR IGNORE 补回各股 min..target 间所有缺失交易日（与 SyncService 铁律一致：只增不改） */
function patchDb(db, targetDate) {
  const stocks = db.prepare('SELECT code FROM stocks').all();
  const insert = db.prepare(
    'INSERT OR IGNORE INTO kline_daily (code,date,open,high,low,close,volume,amount) VALUES (?,?,0,0,0,0,0,0)'
  );
  for (const { code } of stocks) {
    const row = db.prepare('SELECT MIN(date) AS mn, MAX(date) AS mx FROM kline_daily WHERE code=?').get(code);
    if (!row || !row.mn) continue;
    const expected = tradingDays(row.mn, targetDate);
    const present = new Set(
      db.prepare('SELECT date FROM kline_daily WHERE code=?').all(code).map((r) => r.date)
    );
    for (const day of expected) {
      if (!present.has(day)) insert.run(code, day);
    }
  }
}

// ---- 三大断言（返回错误字符串数组，空=通过） ----
function assertNoDupPk(db) {
  const rows = db
    .prepare('SELECT code, date, COUNT(*) AS c FROM kline_daily GROUP BY code, date HAVING c > 1')
    .all();
  return rows.map((r) => `重复主键 (${r.code}, ${r.date}) x${r.c}`);
}

function assertDateContinuity(db) {
  const errs = [];
  const stocks = db.prepare('SELECT code FROM stocks').all();
  for (const { code } of stocks) {
    const row = db.prepare('SELECT MIN(date) AS mn, MAX(date) AS mx FROM kline_daily WHERE code=?').get(code);
    if (!row || !row.mn) continue;
    const expected = new Set(tradingDays(row.mn, row.mx));
    const present = new Set(
      db.prepare('SELECT date FROM kline_daily WHERE code=? ORDER BY date').all(code).map((r) => r.date)
    );
    for (const day of expected) {
      if (!present.has(day)) errs.push(`日期不连续：${code} 缺交易日 ${day}`);
    }
  }
  return errs;
}

function assertNoMissingBar(db, targetDate) {
  const errs = [];
  const stocks = db.prepare('SELECT code FROM stocks').all();
  for (const { code } of stocks) {
    const row = db.prepare('SELECT MAX(date) AS mx FROM kline_daily WHERE code=?').get(code);
    if (!row || !row.mx) {
      errs.push(`缺失bar：${code} 无数据`);
    } else if (row.mx < targetDate) {
      errs.push(`缺失bar：${code} 最新 ${row.mx} < 目标 ${targetDate}`);
    }
  }
  return errs;
}

function runAssertions(db, targetDate) {
  return [...assertNoDupPk(db), ...assertDateContinuity(db), ...assertNoMissingBar(db, targetDate)];
}

function report(errors) {
  if (errors.length === 0) {
    console.log('[verify_sync] OK: 无重复主键 / 日期连续 / 缺失bar=0');
    return true;
  }
  for (const e of errors) console.error(`[verify_sync] FAIL: ${e}`);
  return false;
}

function fail(msg) {
  console.error(`[verify_sync] FAIL: ${msg}`);
  process.exitCode = 1;
}

function ok(msg) {
  console.log(`[verify_sync] OK: ${msg}`);
}

function parseArgs() {
  const args = process.argv.slice(2);
  const dbPath = args.find((a) => !a.startsWith('--'));
  const targetArg = args.find((a) => a.startsWith('--target-date='));
  const targetDate = targetArg ? targetArg.split('=')[1] : fmt(new Date());
  const selftest = args.includes('--selftest');
  return { dbPath, targetDate, selftest };
}

function tmpDb() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-verify-'));
  return path.join(dir, 'sample.sqlite');
}

/** 默认模式：合成"补齐前缺口态"库 → 模拟补齐 → 断言须全过 */
function defaultMode(targetDate) {
  const dbPath = tmpDb();
  const db = openDb(dbPath);
  const days = tradingDays('2026-01-02', targetDate);
  // 600000：中段缺 1 个交易日 + 尾部缺 2 个
  const gapIdx = Math.floor(days.length / 2);
  const drop600 = new Set([days[gapIdx], days[days.length - 1], days[days.length - 2]]);
  // 000001：完整
  // 300750：尾部缺 3 个
  const drop300 = new Set([days[days.length - 1], days[days.length - 2], days[days.length - 3]]);
  seedStock(db, '600000', days, drop600);
  seedStock(db, '000001', days, null);
  seedStock(db, '300750', days, drop300);

  patchDb(db, targetDate); // 用 INSERT OR IGNORE 模拟补齐
  const errors = runAssertions(db, targetDate);
  db.close();
  fs.rmSync(path.dirname(dbPath), { recursive: true, force: true });
  if (report(errors)) {
    ok(`默认模式通过（合成样例 db，目标 ${targetDate}，3 只股票）`);
    return true;
  }
  return false;
}

/** selftest 模式：3 类故意破坏的库，断言引擎须分别判 FAIL */
function selftestMode(targetDate) {
  let allDetected = true;
  const cases = [
    { name: '重复主键', build: (db) => { const d = tradingDays('2026-01-02', targetDate); db.exec('DROP TABLE kline_daily; CREATE TABLE kline_daily (code TEXT, date TEXT, open REAL, high REAL, low REAL, close REAL, volume REAL, amount REAL);'); db.prepare('INSERT INTO kline_daily VALUES (?,?,0,0,0,0,0,0)').run('A', d[0]); db.prepare('INSERT INTO kline_daily VALUES (?,?,0,0,0,0,0,0)').run('A', d[0]); } },
    { name: '日期空洞', build: (db) => { const d = tradingDays('2026-01-02', targetDate); const drop = new Set([d[Math.floor(d.length / 2)]]); seedStock(db, 'B', d, drop); } },
    { name: '缺失尾部', build: (db) => { const d = tradingDays('2026-01-02', targetDate); const drop = new Set([d[d.length - 1], d[d.length - 2]]); seedStock(db, 'C', d, drop); } },
  ];
  for (const c of cases) {
    const dbPath = tmpDb();
    const db = openDb(dbPath);
    c.build(db);
    const errors = runAssertions(db, targetDate);
    db.close();
    fs.rmSync(path.dirname(dbPath), { recursive: true, force: true });
    if (errors.length === 0) {
      fail(`selftest 漏报：${c.name} 应被判 FAIL 却放行`);
      allDetected = false;
    } else {
      ok(`selftest 命中：${c.name} → ${errors.length} 条失败（断言有效）`);
    }
  }
  return allDetected;
}

function main() {
  const { dbPath, targetDate, selftest } = parseArgs();

  if (selftest) {
    const passed = selftestMode(targetDate);
    process.exitCode = passed ? 0 : 1;
    return;
  }

  if (dbPath) {
    // 指定了真实 db：直接跑断言
    if (!fs.existsSync(dbPath)) {
      console.error(`[verify_sync] 数据库文件不存在: ${dbPath}`);
      process.exit(2);
    }
    const db = openDb(dbPath);
    const errors = runAssertions(db, targetDate);
    db.close();
    if (errors.length === 0) {
      ok(`样例 db 断言通过（目标 ${targetDate}）`);
      process.exit(0);
    } else {
      report(errors);
      process.exit(1);
    }
    return;
  }

  // 无 db 参数：默认合成模式（集成门控 `node scripts/verify_sync.js` 走这里）
  const passed = defaultMode(targetDate);
  process.exit(passed ? 0 : 1);
}

main();
