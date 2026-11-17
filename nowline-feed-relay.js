/**
 * NowLine feed relay — a tiny Cloudflare Worker that lets a self-hosted NowLine
 * fetch public schedule feeds (Sched .ics, Sessionize JSON, pretalx JSON) that
 * browsers can't read directly because those sites don't send CORS headers.
 *
 * Deploy:  npx wrangler deploy        (uses wrangler.toml)
 * Use:     https://nowline-relay.<you>.workers.dev/?url=https%3A%2F%2Fkccncna2026.sched.com%2Fall.ics
 *          (paste "https://nowline-relay.<you>.workers.dev/?url=" into NowLine's "Relay URL" field)
 *
 * Only allow-listed schedule hosts are relayed, so this can't be used as an open proxy.
 * The list comes from the ALLOWED_HOSTS variable (wrangler.toml), or DEFAULT_ALLOWED_HOSTS if unset:
 * comma- or space-separated entries, each either an exact hostname ("pretalx.com") or, with a leading
 * dot, any subdomain of it (".sched.com" matches "kccncna2026.sched.com" but not "sched.com").
 * Only list domains whose subdomains are all run by the platform itself.
 * Targets must be https on the default port, with no credentials, and not an IP literal or a
 * local/private name. Redirects are re-checked against the same rules.
 * Responses are capped at MAX_BYTES, upstream requests time out after TIMEOUT_MS, and results are
 * cached at the edge for 5 minutes to keep load on the source low.
 */
export const DEFAULT_ALLOWED_HOSTS = 'sched.com .sched.com sessionize.com .sessionize.com pretalx.com';
export const MAX_BYTES = 10 * 1024 * 1024;
export const TIMEOUT_MS = 10000;
const MAX_REDIRECTS = 3;

export const parseAllowList = (s) => String(s ?? DEFAULT_ALLOWED_HOSTS).toLowerCase().split(/[\s,]+/).filter(Boolean);
const hostAllowed = (host, list) => list.some((e) => (e[0] === '.' ? host.endsWith(e) && host.length > e.length : host === e));

// IP literals (the URL parser already normalizes 0x7f.1, 2130706433, … to dotted quads) and local names
const isIpLiteral = (host) => /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.startsWith('[');
const isLocalName = (host) => !host.includes('.') || /(^|\.)(localhost|local|internal|localdomain|home\.arpa)$/.test(host);

// Returns an error string, or null if the URL may be fetched.
export function checkTarget(url, list) {
  if (url.protocol !== 'https:') return 'Only https links are relayed';
  if (url.username || url.password) return 'Links with credentials are not relayed';
  if (url.port) return 'Only the default https port is relayed';
  const host = url.hostname.toLowerCase().replace(/\.$/, '');
  if (isIpLiteral(host) || isLocalName(host)) return 'Host not allowed: ' + host;
  if (!hostAllowed(host, list)) return 'Host not allowed: ' + host;
  return null;
}

async function readCapped(body, max) {
  if (!body) return new Uint8Array(0);
  const reader = body.getReader(), parts = [];
  let n = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    n += value.byteLength;
    if (n > max) { reader.cancel().catch(() => {}); return null; }
    parts.push(value);
  }
  const out = new Uint8Array(n);
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.byteLength; }
  return out;
}

export default {
  async fetch(request, env = {}) {
    const cors = { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET, OPTIONS' };
    const fail = (status, msg) => new Response(msg, { status, headers: cors });
    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });
    if (request.method !== 'GET') return fail(405, 'GET only');

    const allow = parseAllowList(env.ALLOWED_HOSTS);
    let url;
    try { url = new URL(new URL(request.url).searchParams.get('url')); } catch { return fail(400, 'Add ?url=<https schedule link>'); }

    const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
    try {
      let upstream;
      for (let hop = 0; ; hop++) {
        const err = checkTarget(url, allow);
        if (err) return fail(403, err);
        upstream = await fetch(url.toString(), {
          headers: { 'user-agent': 'NowLine-relay/0.1 (+open-source conference timeline)' },
          redirect: 'manual',
          signal: ctl.signal,
          cf: { cacheTtl: 300, cacheEverything: true },
        });
        const loc = upstream.status >= 300 && upstream.status < 400 && upstream.headers.get('location');
        if (!loc) break;
        if (hop >= MAX_REDIRECTS) return fail(502, 'Too many redirects');
        try { url = new URL(loc, url); } catch { return fail(502, 'Bad redirect'); }
      }
      if (Number(upstream.headers.get('content-length')) > MAX_BYTES) return fail(502, 'Feed too large');
      const body = await readCapped(upstream.body, MAX_BYTES);
      if (!body) return fail(502, 'Feed too large');
      const headers = new Headers(cors);
      headers.set('content-type', upstream.headers.get('content-type') || 'text/plain; charset=utf-8');
      headers.set('cache-control', 'public, max-age=300');
      return new Response(body, { status: upstream.status, headers });
    } catch (e) {
      return ctl.signal.aborted ? fail(504, 'Upstream timed out') : fail(502, 'Upstream fetch failed');
    } finally {
      clearTimeout(timer);
    }
  },
};
