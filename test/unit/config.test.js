import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { sanitizeConfig, safeUrl } from '../../src/config.js';

const page = 'https://me.github.io/roomhop/?x=1#here-a';

describe('sanitizeConfig', () => {
  it('keeps every documented field of the example, resolving relative URLs against the page', () => {
    const ex = JSON.parse(readFileSync(new URL('../../roomhop.config.example.json', import.meta.url), 'utf8'));
    expect(sanitizeConfig(ex, page)).toEqual({
      name: 'My Conference 2026',
      logo: 'https://me.github.io/roomhop/assets/brand/logo.svg',
      colors: { accent: '#7cc4ff', now: '#ff4d5e', bg: '#0e1116' },
      feed: 'https://myconf2026.sched.com/all.ics',
      venue: 'https://me.github.io/roomhop/venue.json',
      relay: 'https://nowline-relay.nelfordbc.workers.dev/?url=',
      tour: false,
      organizerTools: false,
    });
  });
  it('means the defaults for missing or non-object configs', () => {
    for (const raw of [null, undefined, 'x', 1, [], {}]) expect(sanitizeConfig(raw, page)).toEqual({});
  });
  it('drops hostile or malformed values', () => {
    const c = sanitizeConfig({
      name: '  Evil\u0000Conf\n' + 'x'.repeat(200),
      logo: 'javascript:alert(1)',
      colors: { accent: 'red;} body{display:none', now: '#12345', bg: 7, extra: '#fff' },
      feed: 'http://insecure.example/all.ics',
      venue: 'data:application/json,{}',
      relay: 'https://user:pw@r.example/?url=',
      tour: 'no', organizerTools: 1,
      __proto__: { polluted: true },
    }, page);
    expect(c.name).toHaveLength(80);
    expect(c.name.startsWith('Evil Conf')).toBe(true);
    expect(c).toEqual({ name: c.name, colors: { now: '#12345' } });
    expect({}.polluted).toBeUndefined();
  });
  it('requires the relay to be an https prefix ending in "=" or "/"', () => {
    expect(sanitizeConfig({ relay: 'https://r.example/?url=' }, page).relay).toBe('https://r.example/?url=');
    expect(sanitizeConfig({ relay: 'https://r.example/proxy/' }, page).relay).toBe('https://r.example/proxy/');
    expect(sanitizeConfig({ relay: 'https://r.example/?u' }, page).relay).toBeUndefined();
    expect(sanitizeConfig({ relay: 'http://localhost:1/?url=' }, 'http://localhost:1/').relay).toBeUndefined();
  });
});

describe('safeUrl', () => {
  it('allows https anywhere and http only on the page’s own origin', () => {
    expect(safeUrl('schedule.json', 'http://localhost:4173/')).toBe('http://localhost:4173/schedule.json');
    expect(safeUrl('http://other.example/x', 'http://localhost:4173/')).toBe(null);
    expect(safeUrl('https://x.example/a', 'http://localhost:4173/')).toBe('https://x.example/a');
    expect(safeUrl('//evil.example/x', page)).toBe('https://evil.example/x');   // https, so allowed like any https URL
    expect(safeUrl('', page)).toBe(null);
    expect(safeUrl(42, page)).toBe(null);
    expect(safeUrl('https://x.example/' + 'a'.repeat(3000), page)).toBe(null);
  });
});
