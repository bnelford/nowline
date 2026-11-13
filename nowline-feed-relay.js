/**
 * NowLine feed relay — a tiny Cloudflare Worker that lets a self-hosted NowLine
 * fetch public schedule feeds (Sched .ics, Sessionize JSON, pretalx JSON) that
 * browsers can't read directly because those sites don't send CORS headers.
 *
 * Deploy:  npx wrangler deploy nowline-feed-relay.js --name nowline-relay --compatibility-date 2026-11-01
 * Use:     https://nowline-relay.<you>.workers.dev/?url=https%3A%2F%2Fkccncna2026.sched.com%2Fall.ics
 *          (paste "https://nowline-relay.<you>.workers.dev/?url=" into NowLine's "Relay URL" field)
 *
 * Only allow-listed schedule hosts are relayed, so this can't be used as an open proxy.
 * Responses are cached at the edge for 5 minutes to keep load on the source low.
 */
const ALLOW = [
  /(^|\.)sched\.com$/,       // Sched (KubeCon, AGNTCon + MCPCon, Open Source Summit…)
  /(^|\.)sessionize\.com$/,  // Sessionize API
  /^pretalx\.[a-z0-9.-]+$/,  // pretalx instances, e.g. pretalx.com, pretalx.fosdem.org
];

export default {
  async fetch(request) {
    const cors = { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET, OPTIONS' };
    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });
    if (request.method !== 'GET') return new Response('GET only', { status: 405, headers: cors });

    const target = new URL(request.url).searchParams.get('url');
    let url;
    try { url = new URL(target); } catch { return new Response('Add ?url=<https schedule link>', { status: 400, headers: cors }); }
    if (url.protocol !== 'https:' || !ALLOW.some((re) => re.test(url.hostname))) {
      return new Response('Host not allowed: ' + url.hostname, { status: 403, headers: cors });
    }

    const upstream = await fetch(url.toString(), {
      headers: { 'user-agent': 'NowLine-relay/0.1 (+open-source conference timeline)' },
      cf: { cacheTtl: 300, cacheEverything: true },
    });
    const headers = new Headers(cors);
    headers.set('content-type', upstream.headers.get('content-type') || 'text/plain; charset=utf-8');
    headers.set('cache-control', 'public, max-age=300');
    return new Response(upstream.body, { status: upstream.status, headers });
  },
};
