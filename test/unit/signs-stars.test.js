import { describe, it, expect } from 'vitest';
import { roomSlug, roomLink, shareLink, defaultSignBase, signBaseFrom, parseSignLink, withoutFeed } from '../../src/signs.js';
import { loadStars, starsKey } from '../../src/stars.js';

describe('roomSlug / roomLink', () => {
  it('slugs room ids for the #here-… fragment', () => {
    expect(roomSlug({ id: 'wb' })).toBe('here-wb');
    expect(roomSlug({ id: 'Room 201 (Level 2)' })).toBe('here-room-201-level-2');
    expect(roomSlug({ id: '--Hall A--' })).toBe('here-hall-a');
    expect(roomSlug({ id: 11 })).toBe('here-11');
  });
  it('replaces any existing fragment on the base link', () => {
    expect(roomLink('https://example.org/roomhop/?e=1#here-old', { id: 'wb' })).toBe('https://example.org/roomhop/?e=1#here-wb');
    expect(roomLink('https://example.org/', { id: 'Room 201' })).toBe('https://example.org/#here-room-201');
  });
});

describe('room links that carry the schedule feed', () => {
  const feed = 'https://sessionize.com/api/v2/abc123/view/All';
  const relay = 'https://roomhop-relay.example.workers.dev/?url=';
  it('adds feed and relay to the query, before the room fragment', () => {
    const link = roomLink('https://example.org/roomhop/?e=1#old', { id: 'Room 201' }, { feed, relay });
    const u = new URL(link);
    expect(u.hash).toBe('#here-room-201');
    expect(u.searchParams.get('e')).toBe('1');
    expect(u.searchParams.get('feed')).toBe(feed);
    expect(u.searchParams.get('relay')).toBe(relay);
  });
  it('omits the relay when there is none', () => {
    const link = roomLink('https://example.org/', { id: 'wb' }, { feed, relay: null });
    expect(new URL(link).searchParams.has('relay')).toBe(false);
    expect(parseSignLink(link)).toEqual({ room: 'here-wb', feed, relay: null, tz: null, venue: null });
  });
  it('replaces a feed already on the base link instead of duplicating it', () => {
    const link = roomLink('https://example.org/?feed=https%3A%2F%2Fold.example%2Fx&relay=https%3A%2F%2Fr.example%2F', { id: 'wb' }, { feed });
    const u = new URL(link);
    expect(u.searchParams.getAll('feed')).toEqual([feed]);
    expect(u.searchParams.has('relay')).toBe(false);
  });
  it('keeps the old room-only link when there is no feed (pasted/file imports, demo)', () => {
    expect(roomLink('https://example.org/', { id: 'wb' }, null)).toBe('https://example.org/#here-wb');
    expect(roomLink('https://example.org/', { id: 'wb' }, {})).toBe('https://example.org/#here-wb');
    expect(roomLink('https://example.org/', { id: 'wb' }, { feed: 'http://insecure.example/x' })).toBe('https://example.org/#here-wb');
  });
  it('round-trips through parseSignLink', () => {
    const link = roomLink('https://example.org/n/', { id: 'Hall A' }, { feed, relay });
    expect(parseSignLink(link)).toEqual({ room: 'here-hall-a', feed, relay, tz: null, venue: null });
  });
});

describe('shareLink', () => {
  const feed = 'https://pretalx.com/conf/schedule/export/schedule.json';
  it('is the sign link without the room', () => {
    const src = { feed, relay: 'https://r.example/?url=', tz: 'Europe/Brussels' };
    expect(shareLink('https://example.org/n/#here-x', src) + '#here-wb').toBe(roomLink('https://example.org/n/', { id: 'wb' }, src));
    expect(parseSignLink(shareLink('https://example.org/n/', src))).toEqual({ room: null, feed, relay: src.relay, tz: 'Europe/Brussels', venue: null });
  });
  it('is just the page link without an https feed', () => {
    expect(shareLink('https://example.org/n/#x', null)).toBe('https://example.org/n/');
    expect(shareLink('https://example.org/n/', { feed: 'http://insecure.example/x' })).toBe('https://example.org/n/');
  });
});

describe('parseSignLink', () => {
  it('reads old room-only links', () => {
    expect(parseSignLink('https://example.org/#here-wb')).toEqual({ room: 'here-wb', feed: null, relay: null, tz: null, venue: null });
    expect(parseSignLink('https://example.org/#here-room%20201')).toEqual({ room: 'here-room 201', feed: null, relay: null, tz: null, venue: null });
  });
  it('ignores non-room fragments and bad input', () => {
    expect(parseSignLink('https://example.org/#tour').room).toBe(null);
    expect(parseSignLink('not a url')).toEqual({ room: null, feed: null, relay: null, tz: null, venue: null });
    expect(parseSignLink('https://example.org/#here-%E0%A4%A').room).toBe('here-%E0%A4%A');
  });
  it('only accepts https feeds and relays', () => {
    expect(parseSignLink('https://example.org/?feed=javascript:alert(1)#here-wb').feed).toBe(null);
    expect(parseSignLink('https://example.org/?feed=http%3A%2F%2Fx.example%2Fa#here-wb').feed).toBe(null);
    const p = parseSignLink('https://example.org/?feed=https%3A%2F%2Fx.example%2Fa&relay=data%3Atext%2Fplain%2Cx#here-wb');
    expect(p.feed).toBe('https://x.example/a');
    expect(p.relay).toBe(null);
  });
  it('ignores a relay without a feed', () => {
    expect(parseSignLink('https://example.org/?relay=https%3A%2F%2Fr.example%2F#here-wb').relay).toBe(null);
  });
});

describe('venue overlay link param', () => {
  const feed = 'https://x.example/all.ics', venue = 'https://e.example/venue.json';
  it('carries &venue= in share and room links, and reads it back', () => {
    const link = roomLink('https://example.org/n/?venue=https%3A%2F%2Fold.example%2Fv.json', { id: 'wb' }, { feed, venue });
    expect(new URL(link).searchParams.getAll('venue')).toEqual([venue]);
    expect(parseSignLink(link)).toEqual({ room: 'here-wb', feed, relay: null, tz: null, venue });
    expect(parseSignLink(shareLink('https://example.org/n/', { feed, venue })).venue).toBe(venue);
  });
  it('drops non-https venues, and a venue without a feed', () => {
    expect(new URL(shareLink('https://example.org/', { feed, venue: 'javascript:alert(1)' })).searchParams.has('venue')).toBe(false);
    expect(parseSignLink('https://example.org/?feed=' + encodeURIComponent(feed) + '&venue=http%3A%2F%2Fe.example%2Fv').venue).toBe(null);
    expect(parseSignLink('https://example.org/?venue=' + encodeURIComponent(venue)).venue).toBe(null);
    expect(shareLink('https://example.org/', { venue })).toBe('https://example.org/');
  });
});

describe('withoutFeed', () => {
  it('drops feed and relay, keeping other params and the fragment', () => {
    expect(withoutFeed('https://example.org/n/?e=1&feed=https%3A%2F%2Fx%2Fa&relay=https%3A%2F%2Fr%2F#here-wb')).toBe('https://example.org/n/?e=1#here-wb');
    expect(withoutFeed('https://example.org/n/?feed=https%3A%2F%2Fx%2Fa&venue=https%3A%2F%2Fv%2F&admin#here-wb')).toBe('https://example.org/n/?admin=#here-wb');
  });
  it('leaves links without them untouched', () => {
    expect(withoutFeed('https://example.org/n/?a=b c#here-wb')).toBe('https://example.org/n/?a=b c#here-wb');
    expect(withoutFeed('relative/path')).toBe('relative/path');
  });
});

describe('sign base default', () => {
  const href = 'https://events.example.org/roomhop/index.html?x=1#here-wb';
  it('defaults to the current page without its fragment', () => {
    expect(defaultSignBase(href)).toBe('https://events.example.org/roomhop/index.html?x=1');
    expect(signBaseFrom(null, href)).toBe('https://events.example.org/roomhop/index.html?x=1');
  });
  it('does not carry the feed the page was opened with', () => {
    expect(defaultSignBase('https://e.example/n/?feed=https%3A%2F%2Fx%2Fa#here-wb')).toBe('https://e.example/n/');
  });
  it('honours an organizer override', () => {
    expect(signBaseFrom('https://signs.example.org/', href)).toBe('https://signs.example.org/');
  });
});

describe('per-event stars', () => {
  const fakeStore = (init = {}) => {
    const m = new Map(Object.entries(init));
    return { m, get: (k, d) => (m.has(k) ? m.get(k) : d), set: (k, v) => m.set(k, v), del: (k) => m.delete(k) };
  };

  it('keys stars by event name', () => {
    const st = fakeStore({ [starsKey('A')]: ['a1'], [starsKey('B')]: ['b1'] });
    expect([...loadStars(st, 'A')]).toEqual(['a1']);
    expect([...loadStars(st, 'B')]).toEqual(['b1']);
    expect([...loadStars(st, 'C')]).toEqual([]);
  });
});

describe('stars keyed by feed, falling back to the event name', () => {
  const fakeStore = (o) => ({ get: (k, d) => (k in o ? o[k] : d) });
  it('reads the new key, else the old one', () => {
    const st = fakeStore({ [starsKey('Imported schedule')]: ['old'], [starsKey('https://a/feed')]: ['new'] });
    expect([...loadStars(st, 'https://a/feed', 'Imported schedule')]).toEqual(['new']);
    expect([...loadStars(st, 'https://b/feed', 'Imported schedule')]).toEqual(['old']);
    expect([...loadStars(st, 'https://b/feed', 'Other')]).toEqual([]);
  });
  it('an emptied new key does not fall back', () => {
    const st = fakeStore({ [starsKey('Imported schedule')]: ['old'], [starsKey('https://a/feed')]: [] });
    expect([...loadStars(st, 'https://a/feed', 'Imported schedule')]).toEqual([]);
  });
});
