import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  validZone, zoneList, sameZone, searchZones, FALLBACK_ZONES, wallParts, offsetMin, zonedToUtc, parseWhen, dayKey, hhmm, dayStart, nextDayKey,
  floorHour, fmtTime, zoneLabel, rezone, shiftToToday, tzKey, loadZoneSettings, saveZoneSettings, resolveZones,
} from '../../src/tz.js';
import { normalize, rebaseToToday, MIN, HOUR } from '../../src/schedule.js';
import { scheduleFromICS } from '../../src/ics.js';
import { roomLink, parseSignLink, withoutFeed } from '../../src/signs.js';

// Unit tests run with TZ=UTC (vitest.config.js), so "the device zone" is UTC here.
const text = (f) => readFileSync(new URL('../../fixtures/' + f, import.meta.url), 'utf8');
const load = (f) => JSON.parse(text(f));
const utc = (...a) => Date.UTC(...a);
const memStore = () => {
  const m = new Map();
  return { m, get: (k, d) => (m.has(k) ? JSON.parse(m.get(k)) : d), set: (k, v) => m.set(k, JSON.stringify(v)), del: (k) => m.delete(k) };
};

describe('event zone from each importer', () => {
  it('Sched .ics: the TZID on the events', () => {
    const d = scheduleFromICS(text('sched.ics'));
    expect(d.tz).toBe('America/Los_Angeles');
    expect(d.floating).toBeUndefined();
  });
  it('.ics: X-WR-TIMEZONE wins, and applies to times without a TZID', () => {
    const ics = 'BEGIN:VCALENDAR\nX-WR-TIMEZONE:Europe/Brussels\nBEGIN:VEVENT\nUID:a\nSUMMARY:Talk\nDTSTART:20261112T100000\nDTEND:20261112T110000\nEND:VEVENT\nEND:VCALENDAR';
    const d = scheduleFromICS(ics);
    expect(d.tz).toBe('Europe/Brussels');
    expect(d.sessions[0].start).toBe(utc(2026, 10, 12, 9, 0));
    expect(d.floating).toBeUndefined();
  });
  it('.ics: floating times with no zone at all are marked as read in the device zone', () => {
    const ics = 'BEGIN:VCALENDAR\nBEGIN:VEVENT\nUID:a\nSUMMARY:Talk\nDTSTART:20261112T100000\nDTEND:20261112T110000\nEND:VEVENT\nEND:VCALENDAR';
    expect(scheduleFromICS(ics)).toMatchObject({ tz: null, floating: 'UTC' });
  });
  it('.ics: an unknown TZID is not taken as the event zone', () => {
    const ics = 'BEGIN:VCALENDAR\nBEGIN:VEVENT\nUID:a\nSUMMARY:Talk\nDTSTART;TZID=Nowhere Standard Time:20261112T100000\nDTEND;TZID=Nowhere Standard Time:20261112T110000\nEND:VEVENT\nEND:VCALENDAR';
    expect(scheduleFromICS(ics)).toMatchObject({ tz: null, floating: 'UTC' });
  });
  it('.ics: a Windows TZID is mapped and becomes the event zone', () => {
    const ics = 'BEGIN:VCALENDAR\nBEGIN:VEVENT\nUID:a\nSUMMARY:Talk\nDTSTART;TZID=Pacific Standard Time:20261112T100000\nDTEND;TZID=Pacific Standard Time:20261112T110000\nEND:VEVENT\nEND:VCALENDAR';
    const d = scheduleFromICS(ics);
    expect(d).toMatchObject({ tz: 'America/Los_Angeles' });
    expect(d.floating).toBeUndefined();
    expect(d.sessions[0].start).toBe(utc(2026, 10, 12, 18, 0));
  });
  it('pretalx: conference.time_zone_name', () => {
    const d = normalize(load('pretalx-schedule.json'));
    expect(d.tz).toBe('Europe/Brussels');
    expect(d.floating).toBeUndefined();
  });
  it('Sessionize "All data" and "Schedule grid": no zone, times are floating', () => {
    for (const f of ['sessionize-all.json', 'sessionize-grid.json']) {
      expect(normalize(load(f))).toMatchObject({ tz: null, floating: 'UTC' });
    }
  });
  it('Sessionize: a timeZone property is used if the export has one', () => {
    const d = normalize({ ...load('sessionize-all.json'), timeZone: 'America/New_York' });
    expect(d).toMatchObject({ tz: 'America/New_York', floating: 'America/New_York' });
    expect(d.sessions[0].start).toBe(utc(2026, 10, 12, 14, 0));   // 09:00 EST
  });
  it('simple JSON: no `timezone` field and offsets on every time', () => {
    const d = normalize(load('simple.json'));
    expect(d.tz).toBeNull();
    expect(d.floating).toBeUndefined();
  });
  it('simple JSON: `timezone` is the event zone, and offset-less times are read in it', () => {
    const d = normalize(load('simple-tz.json'));
    expect(d).toMatchObject({ name: 'Tokyo meetup', tz: 'Asia/Tokyo', floating: 'Asia/Tokyo' });
    const [doors, key, qa] = d.sessions;
    expect(doors.start).toBe(utc(2026, 10, 12, 0, 0));      // 09:00 JST
    expect(key.end - key.start).toBe(45 * MIN);
    expect(qa.start).toBe(utc(2026, 10, 12, 1, 0));         // explicit Z is kept
  });
  it('simple JSON: an invalid `timezone` is ignored', () => {
    const d = normalize({ timezone: 'Mars/Olympus', sessions: [{ title: 'x', start: '2026-11-12T09:00', end: '2026-11-12T10:00' }] });
    expect(d).toMatchObject({ tz: null, floating: 'UTC' });
    expect(d.sessions[0].start).toBe(utc(2026, 10, 12, 9, 0));
  });
});

describe('parseWhen', () => {
  it('reads offset-less ISO times in the given zone, and everything else as before', () => {
    expect(parseWhen('2026-11-12T09:00:00', 'Europe/Brussels')).toEqual({ t: utc(2026, 10, 12, 8, 0), floating: true });
    expect(parseWhen('2026-11-12 09:00', null)).toEqual({ t: utc(2026, 10, 12, 9, 0), floating: true });
    expect(parseWhen('2026-11-12T09:00:00+01:00', 'Asia/Tokyo')).toEqual({ t: utc(2026, 10, 12, 8, 0), floating: false });
    expect(parseWhen('2026-11-12', 'Asia/Tokyo').floating).toBe(false);
  });
});

describe('one instant across zones', () => {
  const t = utc(2026, 10, 12, 16, 0); // 08:00 PST, 17:00 CET, 21:30 IST
  it('wall clock and day differ per zone', () => {
    expect(hhmm(t, 'America/Los_Angeles')).toBe('08:00');
    expect(hhmm(t, 'Europe/Brussels')).toBe('17:00');
    expect(hhmm(t, 'Asia/Kolkata')).toBe('21:30');
    expect(dayKey(utc(2026, 10, 12, 23, 0), 'Asia/Tokyo')).toBe('2026-11-13');
    expect(dayKey(utc(2026, 10, 12, 23, 0), 'America/Los_Angeles')).toBe('2026-11-12');
  });
  it('formats times in the zone asked for', () => {
    expect(fmtTime(t, 'America/Los_Angeles')).toMatch(/^8:00\s?AM$/);
    expect(fmtTime(t, 'Europe/Brussels')).toMatch(/^5:00\s?PM$/);
  });
  it('zonedToUtc and wallParts round-trip', () => {
    for (const tz of ['America/Los_Angeles', 'Europe/Brussels', 'Asia/Kolkata', 'Pacific/Chatham', 'UTC']) {
      const p = wallParts(t, tz);
      expect(zonedToUtc([p.y, p.mo, p.d, p.h, p.mi, p.s], tz)).toBe(t);
    }
  });
  it('floorHour snaps to the wall-clock hour, including half-hour zones', () => {
    expect(floorHour(utc(2026, 10, 12, 16, 45), 'Asia/Kolkata')).toBe(utc(2026, 10, 12, 16, 30)); // 22:15 → 22:00 IST
    expect(floorHour(utc(2026, 10, 12, 16, 45), 'Europe/Brussels')).toBe(utc(2026, 10, 12, 16, 0));
  });
  it('labels zones briefly', () => {
    expect(zoneLabel('America/Los_Angeles', t)).toBe('PST');
    expect(zoneLabel('UTC', t)).toBe('UTC');
    expect(zoneLabel('Europe/Brussels', t)).toBe('UTC+1');
    expect(zoneLabel('Asia/Kolkata', t)).toBe('UTC+5:30');
    expect(zoneLabel('America/Sao_Paulo', t)).toBe('UTC−3');
  });
});

describe('DST boundaries', () => {
  const LA = 'America/Los_Angeles';
  it('spring forward (2026-03-08): the day is 23 h and a 01:30–03:30 session lasts 1 h', () => {
    expect(dayStart(nextDayKey('2026-03-08'), LA) - dayStart('2026-03-08', LA)).toBe(23 * HOUR);
    const a = zonedToUtc([2026, 2, 8, 1, 30, 0], LA), b = zonedToUtc([2026, 2, 8, 3, 30, 0], LA);
    expect(b - a).toBe(HOUR);
    expect(zoneLabel(LA, a)).toBe('PST');
    expect(zoneLabel(LA, b)).toBe('PDT');
    expect(offsetMin(a, LA)).toBe(-480);
    expect(offsetMin(b, LA)).toBe(-420);
  });
  it('fall back (2026-11-01): the day is 25 h, and hours are labelled from the instant', () => {
    expect(dayStart(nextDayKey('2026-11-01'), LA) - dayStart('2026-11-01', LA)).toBe(25 * HOUR);
    const first = utc(2026, 10, 1, 8, 30), second = utc(2026, 10, 1, 9, 30);   // both 01:30 wall clock
    expect(hhmm(first, LA)).toBe('01:30');
    expect(hhmm(second, LA)).toBe('01:30');
    expect(floorHour(first, LA)).toBe(utc(2026, 10, 1, 8, 0));
    expect(floorHour(second, LA)).toBe(utc(2026, 10, 1, 9, 0));
  });
  it('Europe changes on a different date (2026-03-29), and floating times keep their wall clock', () => {
    const d = { floating: 'Europe/Brussels', sessions: [{ start: zonedToUtc([2026, 2, 28, 10, 0, 0], 'Europe/Brussels'), end: zonedToUtc([2026, 2, 30, 10, 0, 0], 'Europe/Brussels') }] };
    expect(d.sessions[0].end - d.sessions[0].start).toBe(47 * HOUR);
    rezone(d, LA);
    expect(hhmm(d.sessions[0].start, LA)).toBe('10:00');
    expect(hhmm(d.sessions[0].end, LA)).toBe('10:00');
  });
  it('"Shift dates to today" keeps wall-clock times when it crosses a DST change', () => {
    const d = { sessions: [{ start: zonedToUtc([2026, 10, 12, 9, 0, 0], LA), end: zonedToUtc([2026, 10, 12, 10, 0, 0], LA) }] };
    const today = utc(2027, 6, 1, 18, 0);                       // 2027-07-01 11:00 PDT
    rebaseToToday(d, LA, today);
    expect(dayKey(d.sessions[0].start, LA)).toBe('2027-07-01');
    expect(hhmm(d.sessions[0].start, LA)).toBe('09:00');
    expect(d.sessions[0].end - d.sessions[0].start).toBe(HOUR);
  });
  it('"Shift dates to today" counts days in the event zone, not UTC', () => {
    const d = { sessions: [{ start: utc(2026, 10, 12, 0, 0), end: utc(2026, 10, 12, 1, 0) }] };  // 09:00 JST on the 12th
    shiftToToday(d, 'Asia/Tokyo', utc(2026, 10, 13, 20, 0));                                  // already the 14th in Tokyo
    expect(dayKey(d.sessions[0].start, 'Asia/Tokyo')).toBe('2026-11-14');
    expect(hhmm(d.sessions[0].start, 'Asia/Tokyo')).toBe('09:00');
  });
});

describe('rezone (floating times follow the event zone)', () => {
  it('moves Sessionize times to the chosen event zone and is idempotent', () => {
    const d = normalize(load('sessionize-all.json'));
    rezone(d, 'Europe/Brussels');
    expect(d.sessions[0].start).toBe(utc(2026, 10, 12, 8, 0));   // 09:00 CET
    expect(d.floating).toBe('Europe/Brussels');
    rezone(d, 'Europe/Brussels');
    expect(d.sessions[0].start).toBe(utc(2026, 10, 12, 8, 0));
  });
  it('leaves schedules with real offsets alone', () => {
    const d = normalize(load('pretalx-schedule.json')), before = d.sessions.map((s) => s.start);
    rezone(d, 'Asia/Tokyo');
    expect(d.sessions.map((s) => s.start)).toEqual(before);
  });
});

describe('zone settings, per event', () => {
  it('defaults to the event zone with nothing saved', () => {
    expect(loadZoneSettings(memStore(), 'Ev')).toEqual({ event: null, display: 'event' });
  });
  it('round-trips under tz:<event name>, separately per event', () => {
    const st = memStore();
    saveZoneSettings(st, 'A', { event: 'Asia/Tokyo', display: 'device' });
    saveZoneSettings(st, 'B', { event: null, display: 'Europe/Brussels' });
    expect(tzKey('A')).toBe('tz:A');
    expect(loadZoneSettings(st, 'A')).toEqual({ event: 'Asia/Tokyo', display: 'device' });
    expect(loadZoneSettings(st, 'B')).toEqual({ event: null, display: 'Europe/Brussels' });
  });
  it('drops invalid values and removes the key when back to defaults', () => {
    const st = memStore();
    st.set('tz:X', { event: 'Nowhere/Land', display: 'bogus' });
    expect(loadZoneSettings(st, 'X')).toEqual({ event: null, display: 'event' });
    saveZoneSettings(st, 'X', { event: null, display: 'event' });
    expect(st.m.has('tz:X')).toBe(false);
  });
  it('resolves: the feed zone wins, then the saved one, then the device', () => {
    const s = { event: 'Asia/Tokyo', display: 'event' };
    expect(resolveZones({ tz: 'Europe/Brussels' }, s, 'UTC')).toEqual({ event: 'Europe/Brussels', display: 'Europe/Brussels', fromFeed: true });
    expect(resolveZones({ tz: null }, s, 'UTC')).toEqual({ event: 'Asia/Tokyo', display: 'Asia/Tokyo', fromFeed: false });
    expect(resolveZones({}, { event: null, display: 'event' }, 'America/Denver').event).toBe('America/Denver');
    expect(resolveZones({ tz: 'Europe/Brussels' }, { event: null, display: 'device' }, 'America/Denver').display).toBe('America/Denver');
    expect(resolveZones({ tz: 'Europe/Brussels' }, { event: null, display: 'Asia/Kolkata' }, 'UTC').display).toBe('Asia/Kolkata');
  });
});

describe('zone list', () => {
  it('uses Intl.supportedValuesOf, with UTC first, plus current names it may lack', () => {
    const z = zoneList({ supportedValuesOf: () => ['Europe/Paris', 'Asia/Calcutta', 'Etc/GMT+5'] });
    expect(z[0]).toBe('UTC');
    expect(z).toContain('Etc/GMT+5');
    expect(z).toContain('Asia/Calcutta');
    expect(z).toContain('Asia/Kolkata');
    expect(z).toEqual([...z.slice(0, 1), ...z.slice(1).sort((a, b) => a.localeCompare(b))]);
    expect(zoneList().length).toBeGreaterThan(100);
  });
  it('treats aliases as the same zone', () => {
    expect(sameZone('Asia/Kolkata', 'Asia/Calcutta')).toBe(true);
    expect(sameZone('Asia/Kolkata', 'Asia/Tokyo')).toBe(false);
    expect(sameZone('Nope/Zone', 'Nope/Zone')).toBe(true);
  });
  it('falls back to a built-in list when Intl.supportedValuesOf is missing', () => {
    const z = zoneList({});
    expect(z[0]).toBe('UTC');
    expect(z.length).toBe(new Set(['UTC', ...FALLBACK_ZONES]).size);
    expect(FALLBACK_ZONES.every(validZone)).toBe(true);
  });
  it('searches by city with spaces or by region prefix', () => {
    expect(searchZones(zoneList(), 'new york')).toContain('America/New_York');
    expect(searchZones(['Europe/Paris', 'Asia/Tokyo'], 'europe/')).toEqual(['Europe/Paris']);
    expect(searchZones(['A', 'B'], '  ')).toEqual(['A', 'B']);
  });
});

describe('sign links: optional tz=', () => {
  const feed = 'https://sessionize.com/api/v2/abc/view/All';
  it('adds tz only when given, and reads it back with the feed', () => {
    expect(new URL(roomLink('https://x.org/', { id: 'a' }, { feed })).searchParams.has('tz')).toBe(false);
    const link = roomLink('https://x.org/?tz=Old/Zone', { id: 'a' }, { feed, tz: 'Europe/Brussels' });
    expect(new URL(link).searchParams.getAll('tz')).toEqual(['Europe/Brussels']);
    expect(parseSignLink(link)).toEqual({ room: 'here-a', feed, relay: null, tz: 'Europe/Brussels', venue: null });
  });
  it('ignores tz without a feed or when malformed, and strips it with the feed', () => {
    expect(parseSignLink('https://x.org/?tz=Europe/Brussels#here-a').tz).toBeNull();
    expect(parseSignLink('https://x.org/?feed=' + encodeURIComponent(feed) + '&tz=%3Cscript%3E#here-a').tz).toBeNull();
    expect(withoutFeed('https://x.org/roomhop/?feed=' + encodeURIComponent(feed) + '&tz=Asia/Tokyo#here-a')).toBe('https://x.org/roomhop/#here-a');
  });
});

describe('rezone moves only times marked floating', () => {
  it('leaves sessions with real offsets alone in a mixed schedule', () => {
    const d = normalize({ sessions: [
      { title: 'Float', start: '2026-11-12T09:00:00', end: '2026-11-12T10:00:00', venue: 'A' },
      { title: 'Fixed', start: '2026-11-12T09:00:00Z', end: '2026-11-12T10:00:00Z', venue: 'A' },
    ] });
    rezone(d, 'Europe/Brussels');
    expect(d.sessions[0].start).toBe(utc(2026, 10, 12, 8, 0));
    expect(d.sessions[1].start).toBe(utc(2026, 10, 12, 9, 0));
  });
  it('.ics: a floating event moves, a UTC one does not', () => {
    const ics = 'BEGIN:VCALENDAR\nBEGIN:VEVENT\nUID:f\nSUMMARY:Float\nDTSTART:20261112T090000\nDTEND:20261112T100000\nEND:VEVENT\n' +
      'BEGIN:VEVENT\nUID:z\nSUMMARY:Utc\nDTSTART:20261112T090000Z\nDTEND:20261112T100000Z\nEND:VEVENT\nEND:VCALENDAR';
    const d = rezone(scheduleFromICS(ics), 'Asia/Tokyo');
    expect(d.sessions.find((s) => s.id === 'f').start).toBe(utc(2026, 10, 12, 0, 0));
    expect(d.sessions.find((s) => s.id === 'z').start).toBe(utc(2026, 10, 12, 9, 0));
  });
  it('saves from before the marks: every session moves, as before', () => {
    const d = { floating: 'UTC', sessions: [{ start: utc(2026, 10, 12, 9, 0), end: utc(2026, 10, 12, 10, 0) }] };
    rezone(d, 'Europe/Brussels');
    expect(d.sessions[0].start).toBe(utc(2026, 10, 12, 8, 0));
  });
});

describe('zone settings keyed by feed, falling back to the event name', () => {
  it('reads the new key, else the old one', () => {
    const st = memStore();
    st.set('tz:Imported schedule', { event: 'Asia/Tokyo', display: 'event' });
    expect(loadZoneSettings(st, 'https://a/feed', 'Imported schedule').event).toBe('Asia/Tokyo');
    saveZoneSettings(st, 'https://a/feed', { event: 'Europe/Brussels', display: 'event' }, 'Imported schedule');
    expect(loadZoneSettings(st, 'https://a/feed', 'Imported schedule').event).toBe('Europe/Brussels');
  });
  it('resetting to defaults under the new key does not fall back to the old one', () => {
    const st = memStore();
    st.set('tz:Imported schedule', { event: 'Asia/Tokyo', display: 'event' });
    saveZoneSettings(st, 'https://a/feed', { event: null, display: 'event' }, 'Imported schedule');
    expect(loadZoneSettings(st, 'https://a/feed', 'Imported schedule')).toEqual({ event: null, display: 'event' });
  });
});
