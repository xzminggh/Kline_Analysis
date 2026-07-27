// worker.mjs — Cloudflare Workers 入口（轻量中转 API）
// 部署：在 relay/ 目录 `wrangler deploy`（需 wrangler.toml + 已登录）
export { handleSyncRequest, codeToSecid } from './core.mjs';

export default {
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname !== '/kline' && url.pathname !== '/') {
      return new Response(JSON.stringify({ error: 'not_found' }), {
        status: 404,
        headers: { 'content-type': 'application/json; charset=utf-8' },
      });
    }
    const q = url.searchParams;
    const code = q.get('code');
    const market = q.get('market');
    const start = q.get('start');
    const end = q.get('end');
    const fqt = q.get('fqt');
    const { status, body } = await handleSyncRequest({
      code,
      market,
      start,
      end,
      fqt: fqt == null ? 1 : Number(fqt),
    });
    const headers = {
      'content-type': 'application/json; charset=utf-8',
      'access-control-allow-origin': '*',
    };
    // 成功响应做日级边缘缓存：同一 code+范围 当天只打一次东财
    if (status === 200) {
      headers['cache-control'] = 'public, max-age=86400';
    }
    return new Response(JSON.stringify(body), { status, headers });
  },
};
