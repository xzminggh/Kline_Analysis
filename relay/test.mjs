// test.mjs — 真实行情集成测试（沙箱可直连东财，不靠 mock）
// 运行：node relay/test.mjs
import { codeToSecid, fetchKline } from './core.mjs';

let failures = 0;
function assert(cond, msg) {
  if (cond) {
    console.log(`  ✓ ${msg}`);
  } else {
    failures++;
    console.error(`  ✗ ${msg}`);
  }
}

async function main() {
  console.log('== codeToSecid 映射 ==');
  assert(codeToSecid('600000', 'SH') === '1.600000', "600000+SH -> 1.600000");
  assert(codeToSecid('000001', 'SZ') === '0.000001', "000001+SZ -> 0.000001");
  assert(codeToSecid('000001.SZ') === '0.000001', "000001.SZ 后缀 -> 0.000001");
  assert(codeToSecid('688981', 'SH') === '1.688981', "688 科创板 -> 1.688981");
  assert(codeToSecid('300750') === '0.300750', "300 创业板(无market) -> 0.300750");

  const cases = [
    { code: '600000', market: 'SH', label: '上交所 浦发银行' },
    { code: '000001', market: 'SZ', label: '深交所 平安银行' },
    { code: '300750', market: 'SZ', label: '创业板 宁德时代' },
  ];

  for (const c of cases) {
    console.log(`\n== 真实行情：${c.label} (${c.code}.${c.market}) ==`);
    let res;
    try {
      res = await fetchKline({ code: c.code, market: c.market, start: '20260720', end: '20260727' });
    } catch (e) {
      failures++;
      console.error(`  ✗ 抓取失败: ${e.message}`);
      continue;
    }
    assert(res.code === c.code, `返回 code 一致 (${res.code})`);
    assert(Array.isArray(res.data) && res.data.length > 0, `返回 ${res.data.length} 条日K（非空）`);
    if (res.data.length) {
      const first = res.data[0];
      const numFields = ['open', 'high', 'low', 'close', 'volume', 'amount'];
      assert(
        typeof first.date === 'string' && first.date.length > 0 &&
          numFields.every((f) => f in first && Number.isFinite(first[f])),
        `每行含 date(字符串) + 6 个数值字段: date,${numFields.join(',')}`
      );
      assert(first.volume > 0, `volume>0 (${first.volume})`);
      assert(first.amount > 0, `amount>0 (${first.amount})`);
      // 日期升序
      let asc = true;
      for (let i = 1; i < res.data.length; i++) {
        if (res.data[i].date < res.data[i - 1].date) asc = false;
      }
      assert(asc, '日期升序');
      console.log(
        `    样本: ${first.date} O=${first.open} H=${first.high} L=${first.low} C=${first.close} V=${first.volume} A=${first.amount}`
      );
    }
  }

  console.log(`\n==== 结果：${failures === 0 ? '全部通过 ✓' : failures + ' 项失败 ✗'} ====`);
  process.exit(failures === 0 ? 0 : 1);
}

main();
