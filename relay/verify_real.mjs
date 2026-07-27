// verify_real.mjs — 用真实东财返回（落盘 JSON）校验解析逻辑
// 沙箱出网到东财间歇性不稳定，故提供"离线解析校验"：把真实返回存成 /tmp/em_<code>.json 即可验证
// 运行：node relay/verify_real.mjs 600000 000001 300750
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { normalizeKlineRow } from './core.mjs';

const codes = process.argv.slice(2);
if (codes.length === 0) codes.push('600000');

let failures = 0;
for (const code of codes) {
  const file = join(tmpdir(), `em_${code}.json`);
  let json;
  try {
    json = JSON.parse(readFileSync(file, 'utf8'));
  } catch (e) {
    console.log(`== ${code} == 跳过（无落盘真实数据: ${file}）`);
    continue;
  }
  console.log(`== ${code} == 真实数据解析`);
  const src = json.data;
  if (!src || !Array.isArray(src.klines)) {
    failures++;
    console.error(`  ✗ 数据结构异常`);
    continue;
  }
  const data = [];
  for (const row of src.klines) {
    const item = normalizeKlineRow(row, code);
    if (item) data.push(item);
  }
  const numFields = ['open', 'high', 'low', 'close', 'volume', 'amount'];
  const ok =
    data.length > 0 &&
    data.every((d) => typeof d.date === 'string' && d.date.length > 0) &&
    data.every((d) => numFields.every((f) => f in d && Number.isFinite(d[f]))) &&
    data.every((d) => d.volume > 0 && d.amount > 0);
  if (ok) {
    console.log(`  ✓ 解析 ${data.length} 条，字段齐全、量/额>0`);
    console.log(
      `    样本: ${data[0].date} O=${data[0].open} H=${data[0].high} L=${data[0].low} C=${data[0].close} V=${data[0].volume} A=${data[0].amount}`
    );
  } else {
    failures++;
    console.error(`  ✗ 解析校验失败`);
  }
}
console.log(`\n==== ${failures === 0 ? '解析校验通过 ✓' : failures + ' 项失败 ✗'} ====`);
process.exit(failures === 0 ? 0 : 1);
