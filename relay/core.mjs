// core.mjs — 中转层核心逻辑（纯函数，可单测、CF Worker / 腾讯 SCF 共用）
// 不依赖任何浏览器/平台 API，仅用全局 fetch（Node18+ / Workers / SCF Node 均支持）

const EM_BASE = 'https://push2his.eastmoney.com/api/qt/stock/kline/get';

/**
 * 把 App 的股票代码映射成东方财富 secid。
 * App 里 code 是裸码（如 '000001'）+ 独立 market 字段（'SH'|'SZ'|'BJ'）。
 * 也兼容 '000001.SZ' 这种后缀写法。
 * 返回 '1.600000' / '0.000001' 形式。
 */
export function codeToSecid(code, market) {
  let c = String(code == null ? '' : code).trim();
  let m = market ? String(market).trim().toUpperCase() : null;

  // 兼容 code 带后缀形式：000001.SZ
  if (c.includes('.')) {
    const [base, suf] = c.split('.');
    c = base;
    if (!m) m = suf.toUpperCase();
  }

  c = c.padStart(6, '0'); // 保留前导零：000001 → 000001

  let prefix;
  if (m === 'SH' || c.startsWith('6') || c.startsWith('9')) {
    prefix = '1'; // 上交所（含 600/601/603/605/688 科创板、900 B股）
  } else if (m === 'SZ' || c.startsWith('0') || c.startsWith('3') || c.startsWith('2')) {
    prefix = '0'; // 深交所（含 000/001、002/003、300/301 创业板、200 B股）
  } else if (m === 'BJ' || c.startsWith('8') || c.startsWith('4')) {
    prefix = '0'; // 北交所 best-effort（东财 secid 前缀同深交所 0，已实测 8/4 开头可用）
  } else {
    prefix = c.startsWith('6') ? '1' : '0'; // 兜底按代码首位
  }
  return `${prefix}.${c}`;
}

/** 构造东方财富 K 线请求 URL。start/end 支持 YYYYMMDD 或 YYYY-MM-DD，'0' 表示全历史。 */
export function buildEastMoneyUrl(secid, start, end, fqt = 1) {
  const norm = (d) => (d == null ? '' : String(d).replace(/[-/]/g, ''));
  const beg = norm(start) || '0';
  const en = norm(end) || '0';
  const params = new URLSearchParams({
    secid,
    fields1: 'f1',
    fields2: 'f51,f52,f53,f54,f55,f56,f57,f58', // 日期,开,收,高,低,量,额,振幅
    klt: '101', // 101 = 日K
    fqt: String(fqt), // 0 不复权 / 1 前复权 / 2 后复权
    beg,
    end: en,
  });
  return `${EM_BASE}?${params.toString()}`;
}

/**
 * 把东财一行 kline 字符串解析成 App 的 kline_daily 字段。
 * 东财顺序：date, open, close, high, low, volume, amount, amplitude
 * App 需要：date, open, high, low, close, volume, amount
 */
export function normalizeKlineRow(row, code) {
  const p = String(row).split(',');
  if (p.length < 7) return null;
  const date = p[0];
  const open = Number(p[1]);
  const close = Number(p[2]);
  const high = Number(p[3]);
  const low = Number(p[4]);
  const volume = Number(p[5]); // 单位：手
  const amount = Number(p[6]); // 单位：元
  if (!date || [open, close, high, low, volume, amount].some((v) => !Number.isFinite(v))) {
    return null;
  }
  return { code, date, open, high, low, close, volume, amount };
}

/** 抓取并归一化单只股票的历史 K 线。返回 { code, data:[...] }。失败时抛错。 */
export async function fetchKline({ code, market, start, end, fqt = 1 }) {
  const secid = codeToSecid(code, market);
  const url = buildEastMoneyUrl(secid, start, end, fqt);
  const resp = await fetch(url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile',
      Referer: 'https://quote.eastmoney.com/',
    },
  });
  if (!resp.ok) {
    throw new Error(`upstream_http_${resp.status}`);
  }
  const json = await resp.json();
  if (!json || json.rc !== 0) {
    throw new Error(`upstream_rc_${json ? json.rc : 'null'}`);
  }
  const src = json.data;
  if (!src || !Array.isArray(src.klines)) {
    // 空数据（如退市/无行情）不视为错误，回空数组
    return { code, data: [] };
  }
  const data = [];
  for (const row of src.klines) {
    const item = normalizeKlineRow(row, code);
    if (item) data.push(item);
  }
  return { code, data };
}

/** 统一的请求入口：从 query 解析参数并调用 fetchKline。被 worker / scf 复用。 */
export async function handleSyncRequest({ code, market, start, end, fqt }) {
  if (!code) {
    return { status: 400, body: { error: 'missing_code', detail: 'code 参数必填' } };
  }
  try {
    const result = await fetchKline({ code, market, start, end, fqt });
    return { status: 200, body: result };
  } catch (e) {
    return {
      status: 502,
      body: { error: 'upstream_unavailable', detail: String(e && e.message ? e.message : e) },
    };
  }
}
