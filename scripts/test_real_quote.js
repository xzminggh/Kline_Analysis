/**
 * 真实网络测试：验证三源行情接口可用性
 * 运行: node scripts/test_real_quote.js
 */

const TEST_CODE = '600519';
const TEST_MARKET = 'sh';
const START_DATE = '2026-07-20';
const END_DATE = '2026-07-25';

async function testTencent() {
  const prefixCode = `${TEST_MARKET}${TEST_CODE}`;
  const url = `https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=${prefixCode},day,${START_DATE},${END_DATE},500,qfq`;
  console.log('\n[腾讯] 请求:', url);

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);

    console.log('[腾讯] HTTP 状态:', res.status);
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };

    const json = await res.json();
    const raw = json?.data?.[prefixCode]?.qfqday;
    console.log('[腾讯] 返回数据条数:', Array.isArray(raw) ? raw.length : 'N/A');

    if (Array.isArray(raw) && raw.length > 0) {
      console.log('[腾讯] 第一条:', raw[0]);
      return { ok: true, count: raw.length, sample: raw[0] };
    }
    return { ok: true, count: 0, error: '无数据（可能停牌）' };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

async function testSina() {
  const prefixCode = `${TEST_MARKET}${TEST_CODE}`;
  const url = `http://money.finance.sina.com.cn/quotes_service/api/json_v2.php/CN_MarketData.getKLineData?symbol=${prefixCode}&scale=240&ma=no&datalen=100`;
  console.log('\n[新浪] 请求:', url);

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);

    console.log('[新浪] HTTP 状态:', res.status);
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };

    const text = await res.text();
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      const m = text.match(/\[[\s\S]*\]/);
      if (m) json = JSON.parse(m[0]);
    }

    console.log('[新浪] 返回数据条数:', Array.isArray(json) ? json.length : 'N/A');

    if (Array.isArray(json) && json.length > 0) {
      console.log('[新浪] 第一条:', json[0]);
      return { ok: true, count: json.length, sample: json[0] };
    }
    return { ok: true, count: 0, error: '无数据（可能停牌）' };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

async function testEastmoney() {
  const secid = `1.${TEST_CODE}`;
  const beg = START_DATE.replace(/-/g, '');
  const end = END_DATE.replace(/-/g, '');
  const url = `https://push2his.eastmoney.com/api/qt/stock/kline/get?secid=${secid}&klt=101&fqt=1&beg=${beg}&end=${end}&fields2=f51,f52,f53,f54,f55,f56,f57`;
  console.log('\n[东财] 请求:', url);

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        'Referer': 'https://quote.eastmoney.com/',
      },
    });
    clearTimeout(timer);

    console.log('[东财] HTTP 状态:', res.status);
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };

    const json = await res.json();
    console.log('[东财] JSON 结构:', JSON.stringify(json).slice(0, 500));
    const raw = json?.data?.klines;
    console.log('[东财] 返回数据条数:', Array.isArray(raw) ? raw.length : 'N/A');

    if (Array.isArray(raw) && raw.length > 0) {
      console.log('[东财] 第一条:', raw[0]);
      return { ok: true, count: raw.length, sample: raw[0] };
    }
    return { ok: true, count: 0, error: '无数据（可能停牌）' };
  } catch (err) {
    console.error('[东财] 错误详情:', err);
    return { ok: false, error: err.message || String(err) };
  }
}

async function main() {
  console.log('=== 三源行情真实网络测试 ===');
  console.log('测试标的:', TEST_CODE, '日期:', START_DATE, '~', END_DATE);
  console.log('时间:', new Date().toLocaleString());

  const tencent = await testTencent();
  const sina = await testSina();
  const eastmoney = await testEastmoney();

  console.log('\n=== 测试结果汇总 ===');
  console.log(`腾讯   : ${tencent.ok ? '✅ 可用' : '❌ 失败'} ${tencent.error || `(${tencent.count}条)`}`);
  console.log(`新浪   : ${sina.ok ? '✅ 可用' : '❌ 失败'} ${sina.error || `(${sina.count}条)`}`);
  console.log(`东方财富: ${eastmoney.ok ? '✅ 可用' : '❌ 失败'} ${eastmoney.error || `(${eastmoney.count}条)`}`);

  const allFailed = !tencent.ok && !sina.ok && !eastmoney.ok;
  if (allFailed) {
    console.log('\n⚠️ 警告：三源全部不可用，请检查网络或接口变更');
    process.exit(1);
  }

  console.log('\n✅ 至少有一个数据源可用，降级机制可正常工作');
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
