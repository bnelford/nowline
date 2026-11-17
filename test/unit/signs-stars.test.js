import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { roomSlug, roomLink, defaultSignBase, signBaseFrom, parseSignLink, withoutFeed, LEGACY_SIGN_BASE } from '../../src/signs.js';
import { loadStars, starsKey } from '../../src/stars.js';

describe('roomSlug / roomLink', () => {
  it('slugs room ids for the #here-… fragment', () => {
    expect(roomSlug({ id: 'wb' })).toBe('here-wb');
    expect(roomSlug({ id: 'Room 201 (Level 2)' })).toBe('here-room-201-level-2');
    expect(roomSlug({ id: '--Hall A--' })).toBe('here-hall-a');
    expect(roomSlug({ id: 11 })).toBe('here-11');
  });
  it('replaces any existing fragment on the base link', () => {
    expect(roomLink('https://example.org/nowline/?e=1#here-old', { id: 'wb' })).toBe('https://example.org/nowline/?e=1#here-wb');
    expect(roomLink('https://example.org/', { id: 'Room 201' })).toBe('https://example.org/#here-room-201');
  });
});

describe('room links that carry the schedule feed', () => {
  const feed = 'https://sessionize.com/api/v2/abc123/view/All';
  const relay = 'https://nowline-relay.example.workers.dev/?url=';
  it('adds feed and relay to the query, before the room fragment', () => {
    const link = roomLink('https://example.org/nowline/?e=1#old', { id: 'Room 201' }, { feed, relay });
    const u = new URL(link);
    expect(u.hash).toBe('#here-room-201');
    expect(u.searchParams.get('e')).toBe('1');
    expect(u.searchParams.get('feed')).toBe(feed);
    expect(u.searchParams.get('relay')).toBe(relay);
  });
  it('omits the relay when there is none', () => {
    const link = roomLink('https://example.org/', { id: 'wb' }, { feed, relay: null });
    expect(new URL(link).searchParams.has('relay')).toBe(false);
    expect(parseSignLink(link)).toEqual({ room: 'here-wb', feed, relay: null });
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
    expect(parseSignLink(link)).toEqual({ room: 'here-hall-a', feed, relay });
  });
});

describe('parseSignLink', () => {
  it('reads old room-only links', () => {
    expect(parseSignLink('https://example.org/#here-wb')).toEqual({ room: 'here-wb', feed: null, relay: null });
    expect(parseSignLink('https://example.org/#here-room%20201')).toEqual({ room: 'here-room 201', feed: null, relay: null });
  });
  it('ignores non-room fragments and bad input', () => {
    expect(parseSignLink('https://example.org/#tour').room).toBe(null);
    expect(parseSignLink('not a url')).toEqual({ room: null, feed: null, relay: null });
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

describe('withoutFeed', () => {
  it('drops feed and relay, keeping other params and the fragment', () => {
    expect(withoutFeed('https://example.org/n/?e=1&feed=https%3A%2F%2Fx%2Fa&relay=https%3A%2F%2Fr%2F#here-wb')).toBe('https://example.org/n/?e=1#here-wb');
  });
  it('leaves links without them untouched', () => {
    expect(withoutFeed('https://example.org/n/?a=b c#here-wb')).toBe('https://example.org/n/?a=b c#here-wb');
    expect(withoutFeed('relative/path')).toBe('relative/path');
  });
});

describe('sign base default', () => {
  const href = 'https://events.example.org/nowline/index.html?x=1#here-wb';
  it('defaults to the current page without its fragment', () => {
    expect(defaultSignBase(href)).toBe('https://events.example.org/nowline/index.html?x=1');
    expect(signBaseFrom(null, href)).toBe('https://events.example.org/nowline/index.html?x=1');
  });
  it('does not carry the feed the page was opened with', () => {
    expect(defaultSignBase('https://e.example/n/?feed=https%3A%2F%2Fx%2Fa#here-wb')).toBe('https://e.example/n/');
  });
  it('honours an organizer override', () => {
    expect(signBaseFrom('https://signs.example.org/', href)).toBe('https://signs.example.org/');
  });
  it('ignores the old hardcoded prototype URL if a browser still has it saved', () => {
    expect(signBaseFrom(LEGACY_SIGN_BASE, href)).toBe('https://events.example.org/nowline/index.html?x=1');
  });
  it('no app code uses the legacy URL as a default', () => {
    const app = readFileSync(new URL('../../src/app.js', import.meta.url), 'utf8');
    expect(app).not.toMatch(/claude\.ai/);
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
  it('moves legacy stars to an event only if the session exists there', () => {
    const st = fakeStore({ stars: ['d1', 'd2'] });
    expect([...loadStars(st, 'Demo', ['d1', 'd2', 'd3'])]).toEqual(['d1', 'd2']);
    expect(st.m.has('stars')).toBe(false);
    expect(st.m.get('stars:Demo')).toEqual(['d1', 'd2']);
    expect([...loadStars(st, 'Other event', ['d1'])]).toEqual([]);   // already moved, not copied again
  });
  it('splits a list mixed from several events across the events that have each id', () => {
    const st = fakeStore({ stars: ['a1', 'b1', 'a2', 'c1'] });
    expect([...loadStars(st, 'A', ['a1', 'a2', 'a3'])]).toEqual(['a1', 'a2']);
    expect(st.m.get('stars')).toEqual(['b1', 'c1']);                  // kept for later events
    expect([...loadStars(st, 'Z', ['z1'])]).toEqual([]);               // no match: nothing moves
    expect(st.m.get('stars')).toEqual(['b1', 'c1']);
    expect(st.m.has('stars:Z')).toBe(false);
    expect([...loadStars(st, 'B', ['b1'])]).toEqual(['b1']);
    expect(st.m.get('stars')).toEqual(['c1']);
    expect([...loadStars(st, 'C', ['c1', 'c2'])]).toEqual(['c1']);
    expect(st.m.has('stars')).toBe(false);                             // dropped once empty
    expect([...loadStars(st, 'A', ['a1', 'a2', 'a3'])]).toEqual(['a1', 'a2']);
  });
  it('is idempotent', () => {
    const st = fakeStore({ stars: ['a1', 'b1'], 'stars:A': ['a9'] });
    loadStars(st, 'A', ['a1', 'a9']);
    const snap = new Map(st.m);
    expect([...loadStars(st, 'A', ['a1', 'a9'])]).toEqual(['a9', 'a1']);
    expect(st.m).toEqual(snap);
  });
  it('merges into stars already saved for that event without duplicates', () => {
    const st = fakeStore({ stars: ['old', 'x'], 'stars:Demo': ['new', 'x'] });
    expect([...loadStars(st, 'Demo', ['old', 'new', 'x'])]).toEqual(['new', 'x', 'old']);
    expect(st.m.has('stars')).toBe(false);
  });
  it('leaves unmatched legacy stars alone and keeps saved ones', () => {
    const st = fakeStore({ stars: ['old'], 'stars:Demo': ['new'] });
    expect([...loadStars(st, 'Demo', ['new'])]).toEqual(['new']);
    expect(st.m.get('stars')).toEqual(['old']);
  });
  it('drops an empty or malformed legacy key', () => {
    const a = fakeStore({ stars: [] }); loadStars(a, 'A', ['a1']); expect(a.m.has('stars')).toBe(false);
    const b = fakeStore({ stars: 'nope' }); loadStars(b, 'A', ['a1']); expect(b.m.has('stars')).toBe(false);
  });
  it('without session ids, moves nothing', () => {
    const st = fakeStore({ stars: ['a1'] });
    expect([...loadStars(st, 'A')]).toEqual([]);
    expect(st.m.get('stars')).toEqual(['a1']);
  });
});
