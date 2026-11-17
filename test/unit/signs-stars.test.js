import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { roomSlug, roomLink, defaultSignBase, signBaseFrom, LEGACY_SIGN_BASE } from '../../src/signs.js';
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

describe('sign base default', () => {
  const href = 'https://events.example.org/nowline/index.html?x=1#here-wb';
  it('defaults to the current page without its fragment', () => {
    expect(defaultSignBase(href)).toBe('https://events.example.org/nowline/index.html?x=1');
    expect(signBaseFrom(null, href)).toBe('https://events.example.org/nowline/index.html?x=1');
  });
  it('honours an organizer override', () => {
    expect(signBaseFrom('https://signs.example.org/', href)).toBe('https://signs.example.org/');
  });
  it('ignores the old hardcoded Claude.ai artifact URL if a browser still has it saved', () => {
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
  it('migrates the old global list to the loaded event once, then drops it', () => {
    const st = fakeStore({ stars: ['d1', 'd2'] });
    expect([...loadStars(st, 'Demo')]).toEqual(['d1', 'd2']);
    expect(st.m.has('stars')).toBe(false);
    expect(st.m.get('stars:Demo')).toEqual(['d1', 'd2']);
    expect([...loadStars(st, 'Other event')]).toEqual([]);   // not copied again
  });
  it('does not overwrite stars already saved for that event', () => {
    const st = fakeStore({ stars: ['old'], 'stars:Demo': ['new'] });
    expect([...loadStars(st, 'Demo')]).toEqual(['new']);
    expect(st.m.has('stars')).toBe(false);
  });
});
