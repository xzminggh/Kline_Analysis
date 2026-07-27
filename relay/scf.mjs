// scf.mjs — 腾讯云函数 SCF 入口（国内低延迟，推荐生产用）
// 部署：在 relay/ 目录打包上传，入口函数填 `scf.main_handler`（Node18+ 运行时，支持 ESM）
export { handleSyncRequest, codeToSecid } from './core.mjs';

function parseEvent(event) {
  // SCF 既可能把参数放进 queryString，也可能在 body（API 网关集成响应）
  const q = (event && event.queryString) || {};
  let body = {};
  if (event && event.body) {
    try {
      body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
    } catch (_) {
      body = {};
    }
  }
  return {
    code: q.code || body.code,
    market: q.market || body.market,
    start: q.start || body.start,
    end: q.end || body.end,
    fqt: q.fqt != null ? q.fqt : body.fqt,
  };
}

export async function main_handler(event, context) {
  const p = parseEvent(event);
  const { status, body } = await handleSyncRequest({
    code: p.code,
    market: p.market,
    start: p.start,
    end: p.end,
    fqt: p.fqt == null ? 1 : Number(p.fqt),
  });
  return {
    statusCode: status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify(body),
  };
}
