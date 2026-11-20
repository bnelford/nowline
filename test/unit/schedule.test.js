import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { normalize, finish, hm, MIN, PALETTE, applyVenue } from '../../src/schedule.js';
import { walkBetween } from '../../src/agenda.js';
import { SAMPLE_SIMPLE } from '../../src/samples.js';

const load = (f) => JSON.parse(readFileSync(new URL('../../fixtures/' + f, import.meta.url), 'utf8'));
const utc = (...a) => Date.UTC(...a);

describe('hm', () => {
  it('parses H:MM durations', () => {
    expect(hm('00:45')).toBe(45 * MIN);
    expect(hm('01:30')).toBe(90 * MIN);
    expect(hm('2')).toBe(120 * MIN);
  });
});

describe('normalize: pretalx / frab schedule.json', () => {
  const d = normalize(load('pretalx-schedule.json'));

  it('reads the conference title and every dated event across days', () => {
    expect(d.name).toBe('FixtureCamp 2026');
    expect(d.sessions.map((s) => s.title)).toEqual(['Opening', 'Workshop: Packaging for distros', 'Lightning talks', 'Day two kickoff']);
  });
  it('uses the offset in `date` and `duration` for end', () => {
    const [open, ws] = d.sessions;
    expect(open.start).toBe(utc(2026, 10, 12, 9, 0));
    expect(open.end).toBe(utc(2026, 10, 12, 9, 45));
    expect(ws.end - ws.start).toBe(90 * MIN);
  });
  it('maps guid, track (falling back to type), persons and abstract/description', () => {
    const [open, ws, lt] = d.sessions;
    expect(open).toMatchObject({ id: '6f1d2a6e-0001-4c1e-9a1e-000000000001', track: 'Community', speakers: ['Ana Lima', 'Bo Chen'], desc: 'Welcome and logistics.', venue: 'Main Stage' });
    expect(ws).toMatchObject({ track: 'Workshop', speakers: [], desc: 'Hands-on.' });
    expect(lt).toMatchObject({ track: 'Lightning', speakers: ['Sam Patel'], venue: 'Room B' });
  });
  it('puts rooms in one generated building and colors lanes individually', () => {
    expect(d.venues.map((v) => v.name)).toEqual(['Main Stage', 'Room B']);
    expect(d.buildings).toEqual({ venue: { name: 'Venue', color: PALETTE[0], walk: { venue: 1 } } });
    expect(d.venues.map((v) => v.color)).toEqual([PALETTE[0], PALETTE[1]]);
  });
});

describe('normalize: Sessionize "All data"', () => {
  const d = normalize(load('sessionize-all.json'));

  it('skips unscheduled sessions and keeps the rest', () => {
    expect(d.name).toBe('Imported schedule');
    expect(d.sessions.map((s) => s.id)).toEqual(['501', '502', '503']);
  });
  it('reads offset-less times in the device zone (UTC under test)', () => {
    expect(d.sessions[0].start).toBe(utc(2026, 10, 12, 9, 0));
    expect(d.sessions[0].end).toBe(utc(2026, 10, 12, 9, 45));
  });
  it('resolves speaker ids to names, falling back to first + last name', () => {
    expect(d.sessions[0].speakers).toEqual(['Ana Lima', 'Bo Chen']);
    expect(d.sessions[1].speakers).toEqual(['Sam Patel']);
  });
  it('uses room ids as lane ids with room names', () => {
    expect(d.venues.map((v) => [v.id, v.name])).toEqual([['11', 'Room A'], ['12', 'Room B']]);
    expect(d.sessions[1]).toMatchObject({ venue: '12', desc: '' });
  });
});

describe('normalize: Sessionize "Schedule grid"', () => {
  const d = normalize(load('sessionize-grid.json'));

  it('reads every room on every day, registering each room once', () => {
    expect(d.sessions.map((s) => [s.id, s.venue])).toEqual([['501', '11'], ['502', '12'], ['601', '11']]);
    expect(d.venues.map((v) => [v.id, v.name])).toEqual([['11', 'Room A'], ['12', 'Room B']]);
  });
  it('maps speaker objects to names', () => {
    expect(d.sessions[0].speakers).toEqual(['Ana Lima', 'Bo Chen']);
    expect(d.sessions[0].start).toBe(utc(2026, 10, 12, 9, 0));
  });
});

describe('normalize: simple JSON', () => {
  it('fixtures/simple.json is the in-app "Insert simple example"', () => {
    expect(load('simple.json')).toEqual(JSON.parse(SAMPLE_SIMPLE));
  });

  const d = normalize(load('simple.json'));
  it('keeps the name, buildings with walk times, and venue buildings', () => {
    expect(d.name).toBe('My meetup');
    expect(d.buildings.hq.walk).toEqual({ hq: 1, cafe: 4 });
    expect(d.venues.map((v) => [v.id, v.building, v.color])).toEqual([['Stage', 'hq', '#7cc4ff'], ['Cafe', 'cafe', '#ffb066']]);
    expect(d.routes).toEqual({});
  });
  it('parses ISO times with offsets and speaker lists', () => {
    expect(d.sessions[0]).toMatchObject({ id: '0', title: 'Welcome', start: utc(2026, 10, 12, 16, 0), end: utc(2026, 10, 12, 16, 30), venue: 'Stage', speakers: ['Host'] });
    expect(d.sessions[1]).toMatchObject({ venue: 'Cafe', speakers: [] });
  });
  it('passes routes through when buildings are given', () => {
    const j = { ...load('simple.json'), routes: { 'hq>cafe': 'Cross the plaza.' } };
    expect(normalize(j).routes).toEqual({ 'hq>cafe': 'Cross the plaza.' });
  });
  it('keeps venue `where` hints', () => {
    const j = { venues: [{ id: 'r1', name: 'Room 1', where: '2nd floor' }], sessions: [{ title: 't', start: '2026-11-12T09:00:00Z', end: '2026-11-12T10:00:00Z', venue: 'r1' }] };
    expect(normalize(j).venues[0]).toMatchObject({ id: 'r1', name: 'Room 1', where: '2nd floor', building: 'venue' });
  });
  it('accepts a bare array, `room` instead of `venue`, and a single `speaker`', () => {
    const d2 = normalize([{ title: 'Solo', start: '2026-11-12T09:00:00Z', end: '2026-11-12T09:30:00Z', room: 'Side', speaker: 'Kim' }]);
    expect(d2.sessions[0]).toMatchObject({ venue: 'Side', speakers: ['Kim'] });
    expect(d2.venues).toEqual([{ id: 'Side', name: 'Side', building: 'venue', color: PALETTE[0] }]);
  });
  it('throws when nothing has valid times', () => {
    expect(() => normalize({ sessions: [{ title: 'x', start: 'nope', end: 'nope' }] })).toThrow(/No sessions with valid start\/end/);
  });
});

describe('finish', () => {
  const venues = () => [{ id: 'a', name: 'A', building: 'n' }, { id: 'b', name: 'B', building: 's' }];
  const ok = { title: 'ok', start: 1, end: 2, venue: 'a' };

  it('drops untitled, invalid and zero/negative-length sessions', () => {
    const d = finish('x', venues(), [ok, { ...ok, title: '' }, { ...ok, start: NaN }, { ...ok, end: 1 }, { ...ok, end: 0 }], null);
    expect(d.sessions).toEqual([ok]);
  });
  it('generates buildings with 1 min inside and 8 min between when none are given', () => {
    const d = finish('x', venues(), [ok], null);
    expect(d.buildings.n.walk).toEqual({ n: 1, s: 8 });
    expect(d.venues.map((v) => v.color)).toEqual([PALETTE[0], PALETTE[1]]);   // multi-building: building colors
  });
  it('keeps valid given buildings', () => {
    const b = { n: { name: 'North', color: '#111', walk: { n: 1, s: 5 } }, s: { name: 'South', color: '#222', walk: { s: 1, n: 5 } } };
    const d = finish('x', venues(), [ok], b);
    expect(d.buildings).toEqual(b);
    expect(d.venues.map((v) => v.color)).toEqual(['#111', '#222']);
  });
  it('sanitizes given buildings: hex colors only, numeric walk times, text names, no extra fields', () => {
    const b = {
      n: { name: 'North', color: '#111" onload="alert(1)', walk: { n: '1', s: '5"><script>', w: -2 }, map: { x: '"' } },
      s: { color: 'red;}', walk: null },
    };
    const d = finish('x', venues(), [ok], b);
    expect(d.buildings).toEqual({
      n: { name: 'North', color: PALETTE[0], walk: { n: 1 } },
      s: { name: 's', color: PALETTE[1], walk: {} },
    });
    expect(d.venues.map((v) => v.color)).toEqual([PALETTE[0], PALETTE[1]]);
  });
});

describe('applyVenue', () => {
  // pretalx: rooms "Main Stage" and "Room B", one generated building ("venue") with 1-minute walks
  const base = () => normalize(load('pretalx-schedule.json'));
  const venue = {
    buildings: {
      hall: { name: 'Hall', color: '#112233', walk: { hall: 1, annex: 6 } },
      annex: { name: 'Annex', color: '#445566', walk: { annex: 1, hall: 6 } },
    },
    rooms: { 'main stage': { building: 'hall', where: 'Ground floor' }, 'Room B': { building: 'annex', where: 'Up the stairs' } },
    routes: { 'hall>annex': 'Cross the courtyard.' },
  };

  it('replaces placeholder walks with the venue file’s, matching rooms by case-insensitive name', () => {
    const d0 = base();
    expect(walkBetween(d0, 'Main Stage', 'Room B')).toBe(1);
    const d = applyVenue(d0, venue);
    expect(walkBetween(d, 'Main Stage', 'Room B')).toBe(6);
    expect(d.venues.find((v) => v.id === 'Room B')).toMatchObject({ building: 'annex', where: 'Up the stairs', color: '#445566' });
    expect(d.buildings).toEqual(venue.buildings);
    expect(d.routes).toEqual({ 'hall>annex': 'Cross the courtyard.' });
    expect(d.sessions).toBe(d0.sessions);
    expect(d0.venues[0].building).toBe('venue');   // pure: the input is untouched
  });
  it('matches by room id before name, and keeps the feed’s building for unmatched rooms', () => {
    const d0 = normalize({ venues: [{ id: 'r1', name: 'Alpha', building: 'b' }, { id: 'r2', name: 'r1' }],
      sessions: [{ title: 'x', start: '2026-11-12T09:00Z', end: '2026-11-12T10:00Z', venue: 'r1' }, { title: 'y', start: '2026-11-12T09:00Z', end: '2026-11-12T10:00Z', venue: 'r2' }] });
    const d = applyVenue(d0, { buildings: { n: { name: 'North' } }, rooms: { r1: { building: 'n' } } });
    expect(d.venues.map((v) => [v.id, v.building])).toEqual([['r1', 'n'], ['r2', 'venue']]);
    expect(Object.keys(d.buildings).sort()).toEqual(['n', 'venue']);
    expect(walkBetween(d, 'r1', 'r2')).toBe(8);    // no walk given between them: the usual default
  });
  it('drops cached map positions so the map is laid out again', () => {
    const d0 = base(); d0.site = { w: 1 }; d0.venues[0].map = { x: 1, y: 1 }; d0.buildings.venue.map = { x: 1 };
    const d = applyVenue(d0, venue);
    expect(d.site).toBeUndefined();
    expect(d.venues.every((v) => !('map' in v))).toBe(true);
  });
  it('rejects or neutralizes hostile input', () => {
    for (const bad of [null, 'x', 42, [], ['a']]) expect(() => applyVenue(base(), bad)).toThrow(/JSON object/);
    const hostile = JSON.parse(`{
      "buildings": {
        "__proto__": { "name": "pwn", "walk": {} },
        "constructor": { "name": "c" },
        "a>b": { "name": "arrow" },
        "${'x'.repeat(65)}": { "name": "long" },
        "ok": { "name": "<img src=x onerror=alert(1)>\\u0000", "color": "#fff\\" onload=\\"x", "walk": { "ok": "1", "two": 3, "nope": 2, "__proto__": 5 }, "map": { "x": 1 } },
        "two": { "name": 7, "color": "#abc", "walk": { "ok": -1, "two": 1e9 } },
        "arr": [1, 2],
        "nul": null
      },
      "rooms": {
        "Main Stage": { "building": "__proto__", "where": "${'w'.repeat(300)}" },
        "room b": { "building": "two", "where": { "toString": "x" } },
        "__proto__": { "building": "ok" },
        "No such room": { "building": "ok" },
        "constructor": "nope"
      },
      "routes": { "ok>two": "<script>alert(1)</script>", "ok>nowhere": "x", "ok>two>ok": "x", "two>ok": 5 }
    }`);
    const d = applyVenue(base(), hostile);
    expect(Object.getPrototypeOf(d.buildings)).toBe(Object.prototype);
    expect({}.name).toBeUndefined();
    expect(Object.keys(d.buildings).sort()).toEqual(['ok', 'two', 'venue']);
    expect(d.buildings.ok).toEqual({ name: '<img src=x onerror=alert(1)>', color: PALETTE[0], walk: { two: 3 } });   // text, escaped by the UI
    expect(d.buildings.two).toEqual({ name: 'two', color: '#abc', walk: {} });
    const [main, b] = d.venues;
    expect(main.building).toBe('venue');
    expect(main.where).toHaveLength(200);
    expect(b.building).toBe('two');
    expect(b.where).toBeUndefined();
    expect(d.routes).toEqual({ 'ok>two': '<script>alert(1)</script>' });   // plain text; directions() escapes it
  });
});
