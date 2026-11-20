import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { normalize, finish, hm, MIN, PALETTE, diffSessions } from '../../src/schedule.js';
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

describe('diffSessions', () => {
  const s = (id, venue, start, title = 'T' + id) => ({ id, title, venue, start, end: start + 30 * MIN });
  it('reports a changed room, a changed start, and a removed session; ignores unchanged and added ones', () => {
    const a = [s('1', 'A', 0), s('2', 'A', 0), s('3', 'B', 0), s('4', 'B', 0)];
    const b = [s('1', 'A', 0), s('2', 'C', 0, 'Renamed'), s('3', 'B', 15 * MIN), s('5', 'A', 0)];
    expect(diffSessions(a, b).map(({ id, title, room, time, gone }) => ({ id, title, room, time, gone }))).toEqual([
      { id: '2', title: 'Renamed', room: true, time: false, gone: false },
      { id: '3', title: 'T3', room: false, time: true, gone: false },
      { id: '4', title: 'T4', room: false, time: false, gone: true },
    ]);
  });
  it('gives the old and new session', () => {
    const [c] = diffSessions([s('1', 'A', 0)], [s('1', 'B', 0)]);
    expect(c.was.venue).toBe('A');
    expect(c.now.venue).toBe('B');
  });
  it('ignores an end-only change and is empty for identical lists', () => {
    expect(diffSessions([s('1', 'A', 0)], [{ ...s('1', 'A', 0), end: 99 * MIN }])).toEqual([]);
    expect(diffSessions([], [])).toEqual([]);
  });
});

describe('floating marks per session', () => {
  it('simple format: only sessions read without an offset are marked', () => {
    const d = normalize({ sessions: [
      { title: 'Float', start: '2026-11-12T09:00:00', end: '2026-11-12T10:00:00', venue: 'A' },
      { title: 'Fixed', start: '2026-11-12T09:00:00Z', end: '2026-11-12T10:00:00Z', venue: 'A' },
    ] });
    expect(d.sessions.map((x) => !!x.floating)).toEqual([true, false]);
    expect(d.floating).toBe('UTC');
  });
  it('no zone recorded when the only floating session was dropped as invalid', () => {
    const d = normalize({ sessions: [
      { title: 'Bad', start: '2026-11-12T09:00:00', venue: 'A' },
      { title: 'Fixed', start: '2026-11-12T09:00:00Z', end: '2026-11-12T10:00:00Z', venue: 'A' },
    ] });
    expect(d.floating).toBeUndefined();
  });
  it('Sessionize sessions are all marked', () => {
    expect(normalize(load('sessionize-all.json')).sessions.every((x) => x.floating)).toBe(true);
  });
});
