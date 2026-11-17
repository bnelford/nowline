import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import relay, { DEFAULT_ALLOWED_HOSTS, MAX_BYTES, TIMEOUT_MS, parseAllowList } from '../../nowline-feed-relay.js';

let upstream;
beforeEach(() => {
  upstream = vi.fn(async () => new Response('BEGIN:VCALENDAR', { status: 200, headers: { 'content-type': 'text/calendar' } }));
  vi.stubGlobal('fetch', upstream);
});
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

const call = (target, method = 'GET', env) =>
  relay.fetch(new Request('https://relay.test/' + (target == null ? '' : '?url=' + encodeURIComponent(target)), { method }), env);

describe('relay allow-list (defaults)', () => {
  it.each([
    'https://kccncna2026.sched.com/all.ics',
    'https://sched.com/x.ics',
    'https://sessionize.com/api/v2/abc123/view/All',
    'https://pretalx.com/democon/schedule/export/schedule.json',
    'https://KCCNCNA2026.Sched.com./all.ics',
  ])('relays %s', async (u) => {
    const res = await call(u);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('BEGIN:VCALENDAR');
    expect(upstream).toHaveBeenCalledTimes(1);
    expect(upstream.mock.calls[0][0]).toBe(new URL(u).toString());
    expect(upstream.mock.calls[0][1].cf).toEqual({ cacheTtl: 300, cacheEverything: true });
    expect(upstream.mock.calls[0][1].redirect).toBe('manual');
  });

  it.each([
    'https://example.com/all.ics',
    'https://notsched.com/all.ics',
    'https://sched.com.evil.example/all.ics',
    'https://evilsessionize.com/api',
    'https://pretalx-evil.example/x',
    'https://xpretalx.com/x',
    'https://pretalx.attacker.example/x',          // formerly allowed by the pretalx.* pattern
    'https://pretalx.fosdem.org/x',                // self-hosted instances must be listed explicitly
    'https://evil.pretalx.com/x',                  // pretalx.com is exact-only
  ])('refuses %s', async (u) => {
    const res = await call(u);
    expect(res.status).toBe(403);
    expect(await res.text()).toMatch(/^Host not allowed: /);
    expect(upstream).not.toHaveBeenCalled();
  });

  it('wrangler.toml ships the same defaults as the code', () => {
    const toml = readFileSync(new URL('../../wrangler.toml', import.meta.url), 'utf8');
    expect(toml).toMatch(new RegExp('^ALLOWED_HOSTS = "' + DEFAULT_ALLOWED_HOSTS.replace(/\./g, '\\.') + '"$', 'm'));
  });
});

describe('relay allow-list (ALLOWED_HOSTS)', () => {
  const env = { ALLOWED_HOSTS: 'pretalx.fosdem.org, .example.org  feeds.test' };
  it('parses comma/space separated entries, lowercased', () => {
    expect(parseAllowList('A.com, .B.org  c.net')).toEqual(['a.com', '.b.org', 'c.net']);
    expect(parseAllowList(undefined)).toEqual(parseAllowList(DEFAULT_ALLOWED_HOSTS));
    expect(parseAllowList('')).toEqual([]);
  });
  it.each(['https://pretalx.fosdem.org/x', 'https://a.example.org/x', 'https://a.b.example.org/x', 'https://feeds.test/x'])('allows %s', async (u) => {
    expect((await call(u, 'GET', env)).status).toBe(200);
  });
  it.each(['https://example.org/x', 'https://sched.com/x.ics', 'https://x.feeds.test/x', 'https://badexample.org/x'])('refuses %s', async (u) => {
    expect((await call(u, 'GET', env)).status).toBe(403);
    expect(upstream).not.toHaveBeenCalled();
  });
  it('an empty list allows nothing', async () => {
    expect((await call('https://sched.com/x.ics', 'GET', { ALLOWED_HOSTS: '' })).status).toBe(403);
  });
});

describe('relay target rules', () => {
  // even if an operator lists them, these never get through
  const env = { ALLOWED_HOSTS: 'localhost 127.0.0.1 [::1] 10.0.0.1 2130706433 printer.local intranet sched.com .sched.com' };
  it.each([
    ['http://kccncna2026.sched.com/all.ics', /https/],
    ['ftp://sched.com/x', /https/],
    ['https://user:pw@sched.com/x.ics', /credentials/],
    ['https://user@sched.com/x.ics', /credentials/],
    ['https://sched.com:8443/x.ics', /port/],
    ['https://localhost/x', /not allowed/],
    ['https://foo.localhost/x', /not allowed/],
    ['https://127.0.0.1/x', /not allowed/],
    ['https://2130706433/x', /not allowed/],
    ['https://0x7f.1/x', /not allowed/],
    ['https://10.0.0.1/x', /not allowed/],
    ['https://169.254.169.254/x', /not allowed/],
    ['https://[::1]/x', /not allowed/],
    ['https://printer.local/x', /not allowed/],
    ['https://intranet/x', /not allowed/],
  ])('refuses %s', async (u, msg) => {
    const res = await call(u, 'GET', env);
    expect(res.status).toBe(403);
    expect(await res.text()).toMatch(msg);
    expect(upstream).not.toHaveBeenCalled();
  });
  it('accepts an explicit :443 (normalized away)', async () => {
    expect((await call('https://sched.com:443/x.ics')).status).toBe(200);
  });
});

describe('relay redirects', () => {
  const redirect = (loc, status = 302) => new Response(null, { status, headers: { location: loc } });
  it('follows redirects that stay on allowed hosts', async () => {
    upstream.mockResolvedValueOnce(redirect('https://kccncna2026.sched.com/all.ics'));
    const res = await call('https://sched.com/x.ics');
    expect(res.status).toBe(200);
    expect(upstream).toHaveBeenCalledTimes(2);
    expect(upstream.mock.calls[1][0]).toBe('https://kccncna2026.sched.com/all.ics');
  });
  it('resolves relative Location headers', async () => {
    upstream.mockResolvedValueOnce(redirect('/v2/all.ics', 301));
    expect((await call('https://sched.com/x.ics')).status).toBe(200);
    expect(upstream.mock.calls[1][0]).toBe('https://sched.com/v2/all.ics');
  });
  it.each(['https://evil.example/x', 'http://sched.com/x', 'https://127.0.0.1/x'])('refuses a redirect to %s', async (loc) => {
    upstream.mockResolvedValueOnce(redirect(loc));
    const res = await call('https://sched.com/x.ics');
    expect(res.status).toBe(403);
    expect(upstream).toHaveBeenCalledTimes(1);
  });
  it('gives up after 3 redirects', async () => {
    upstream.mockImplementation(async () => redirect('https://sched.com/loop'));
    const res = await call('https://sched.com/x.ics');
    expect(res.status).toBe(502);
    expect(upstream).toHaveBeenCalledTimes(4);
  });
});

describe('relay limits', () => {
  it('refuses a response whose content-length is over the cap', async () => {
    upstream.mockResolvedValueOnce(new Response('x', { headers: { 'content-length': String(MAX_BYTES + 1) } }));
    const res = await call('https://sched.com/x.ics');
    expect(res.status).toBe(502);
    expect(await res.text()).toBe('Feed too large');
  });
  it('refuses a streamed body that grows past the cap', async () => {
    const chunk = new Uint8Array(1024 * 1024);
    let sent = 0;
    const body = new ReadableStream({ pull(c) { if (sent++ > 12) c.close(); else c.enqueue(chunk); } });
    upstream.mockResolvedValueOnce(new Response(body));
    const res = await call('https://sched.com/x.ics');
    expect(res.status).toBe(502);
    expect(sent).toBeLessThan(13);   // stopped reading once over the cap
  });
  it('passes a body under the cap through unchanged', async () => {
    const big = 'x'.repeat(2 * 1024 * 1024);
    upstream.mockResolvedValueOnce(new Response(big));
    const res = await call('https://sched.com/x.ics');
    expect(res.status).toBe(200);
    expect((await res.text()).length).toBe(big.length);
  });
  it('times out a slow upstream with 504', async () => {
    vi.useFakeTimers();
    upstream.mockImplementationOnce((u, init) => new Promise((_, reject) =>
      init.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))));
    const pending = call('https://sched.com/x.ics');
    await vi.advanceTimersByTimeAsync(TIMEOUT_MS + 1);
    const res = await pending;
    expect(res.status).toBe(504);
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
  });
  it('502s when the upstream fetch throws', async () => {
    upstream.mockRejectedValueOnce(new TypeError('network down'));
    expect((await call('https://sched.com/x.ics')).status).toBe(502);
  });
});

describe('relay methods and errors', () => {
  it('answers OPTIONS preflight with CORS headers', async () => {
    const res = await call(null, 'OPTIONS');
    expect(res.status).toBe(200);
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
    expect(res.headers.get('access-control-allow-methods')).toBe('GET, OPTIONS');
  });
  it.each(['POST', 'PUT', 'DELETE'])('rejects %s with 405', async (m) => {
    const res = await call('https://sched.com/x.ics', m);
    expect(res.status).toBe(405);
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
    expect(upstream).not.toHaveBeenCalled();
  });
  it('400s on a missing or unparseable url', async () => {
    expect((await call(null)).status).toBe(400);
    expect((await call('not a url')).status).toBe(400);
  });
  it('adds CORS + 5-minute cache headers and passes content-type and status through', async () => {
    upstream.mockResolvedValueOnce(new Response('nope', { status: 404, headers: { 'content-type': 'text/html' } }));
    const res = await call('https://sched.com/missing.ics');
    expect(res.status).toBe(404);
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
    expect(res.headers.get('cache-control')).toBe('public, max-age=300');
    expect(res.headers.get('content-type')).toBe('text/html');
  });
});
