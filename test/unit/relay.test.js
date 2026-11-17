import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import relay from '../../nowline-feed-relay.js';

let upstream;
beforeEach(() => {
  upstream = vi.fn(async () => new Response('BEGIN:VCALENDAR', { status: 200, headers: { 'content-type': 'text/calendar' } }));
  vi.stubGlobal('fetch', upstream);
});
afterEach(() => vi.unstubAllGlobals());

const call = (target, method = 'GET') =>
  relay.fetch(new Request('https://relay.test/' + (target == null ? '' : '?url=' + encodeURIComponent(target)), { method }));

describe('relay allow-list', () => {
  it.each([
    'https://kccncna2026.sched.com/all.ics',
    'https://sched.com/x.ics',
    'https://sessionize.com/api/v2/abc123/view/All',
    'https://pretalx.com/democon/schedule/export/schedule.json',
    'https://pretalx.fosdem.org/fosdem-2026/schedule/export/schedule.json',
  ])('relays %s', async (u) => {
    const res = await call(u);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('BEGIN:VCALENDAR');
    expect(upstream).toHaveBeenCalledTimes(1);
    expect(upstream.mock.calls[0][0]).toBe(new URL(u).toString());
    expect(upstream.mock.calls[0][1].cf).toEqual({ cacheTtl: 300, cacheEverything: true });
  });

  it.each([
    'https://example.com/all.ics',
    'https://notsched.com/all.ics',
    'https://sched.com.evil.example/all.ics',
    'https://evilsessionize.com/api',
    'https://pretalx-evil.example/x',
    'https://xpretalx.com/x',
  ])('refuses %s', async (u) => {
    const res = await call(u);
    expect(res.status).toBe(403);
    expect(await res.text()).toMatch(/^Host not allowed: /);
    expect(upstream).not.toHaveBeenCalled();
  });

  it('refuses non-https even for allowed hosts', async () => {
    const res = await call('http://kccncna2026.sched.com/all.ics');
    expect(res.status).toBe(403);
    expect(upstream).not.toHaveBeenCalled();
  });

  // Documents current behaviour: the pretalx rule matches on the first DNS label only, so any domain
  // with a "pretalx." subdomain passes (including one an attacker controls). See README "Feed relay".
  it('allows any host whose first label is "pretalx" (known looseness)', async () => {
    expect((await call('https://pretalx.attacker.example/x')).status).toBe(200);
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
