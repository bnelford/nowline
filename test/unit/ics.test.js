import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  parseICSEvents, icsTime, zonedToUtc, icsDur, scheduleFromICS, splitTitle, parseICS, parseICS_legacy,
} from '../../src/ics.js';
import { MIN, PALETTE } from '../../src/schedule.js';

const fixture = readFileSync(new URL('../../fixtures/sched.ics', import.meta.url), 'utf8');
const utc = (...a) => Date.UTC(...a);

describe('icsTime / zonedToUtc', () => {
  it('reads UTC (Z) times as UTC', () => {
    expect(icsTime('20261112T200000Z', '')).toBe(utc(2026, 10, 12, 20, 0));
  });
  it('reads TZID wall-clock times in that IANA zone (PST, after DST ends)', () => {
    expect(icsTime('20261112T090000', ';TZID=America/Los_Angeles')).toBe(utc(2026, 10, 12, 17, 0));
  });
  it('accepts a quoted TZID', () => {
    expect(icsTime('20261112T090000', ';TZID="America/Los_Angeles"')).toBe(utc(2026, 10, 12, 17, 0));
  });
  it('returns null for all-day (date-only) values', () => {
    expect(icsTime('20261112', ';VALUE=DATE')).toBeNull();
  });
  it('reads floating times in the device zone (UTC under test)', () => {
    expect(icsTime('20261112T090000', '')).toBe(utc(2026, 10, 12, 9, 0));
  });
  it('falls back to device zone for unknown zone names', () => {
    expect(icsTime('20261112T090000', ';TZID=Nowhere Standard Time')).toBe(utc(2026, 10, 12, 9, 0));
  });
  it('maps common Windows zone names to IANA', () => {
    expect(icsTime('20261112T090000', ';TZID=Pacific Standard Time')).toBe(utc(2026, 10, 12, 17, 0));
    expect(icsTime('20261112T090000', ';TZID="W. Europe Standard Time"')).toBe(utc(2026, 10, 12, 8, 0));
    expect(icsTime('20261112T090000', ';TZID=India Standard Time')).toBe(utc(2026, 10, 12, 3, 30));
  });
  it('handles DST, half-hour offsets and Europe', () => {
    expect(zonedToUtc([2026, 6, 1, 12, 0, 0], 'America/Los_Angeles')).toBe(utc(2026, 6, 1, 19, 0)); // PDT
    expect(zonedToUtc([2026, 10, 12, 10, 0, 0], 'Europe/Brussels')).toBe(utc(2026, 10, 12, 9, 0));
    expect(zonedToUtc([2026, 10, 12, 10, 0, 0], 'Asia/Kolkata')).toBe(utc(2026, 10, 12, 4, 30));
  });
});

describe('icsDur', () => {
  it('parses minutes, hours, days and combinations', () => {
    expect(icsDur('PT45M')).toBe(45 * MIN);
    expect(icsDur('PT1H30M')).toBe(90 * MIN);
    expect(icsDur('P1D')).toBe(24 * 60 * MIN);
    expect(icsDur('P1DT2H')).toBe(26 * 60 * MIN);
  });
  it('returns 0 for non-durations', () => {
    expect(icsDur('garbage')).toBe(0);
  });
});

describe('parseICSEvents (Sched-like fixture)', () => {
  const evs = parseICSEvents(fixture);

  it('reads X-WR-CALNAME, skips all-day events and drops a repeated UID (first wins)', () => {
    expect(evs.cal.name).toBe('FixtureCon 2026');
    expect(evs.map((e) => e.uid)).toEqual([
      'fx-001@fixturecon.sched.com', 'fx-002@fixturecon.sched.com', 'fx-003@fixturecon.sched.com',
      'fx-005@fixturecon.sched.com', 'fx-006@fixturecon.sched.com',
    ]);
    expect(evs[0].title).not.toMatch(/duplicate/);
  });
  it('unfolds lines and unescapes text', () => {
    expect(evs[0].notes).toBe(
      'Welcome to FixtureCon.\nThis line is long enough that the exporter folds it across two physical lines, with an escaped comma.',
    );
    expect(evs[1].title).toBe('Scaling Agent Runtimes Without Losing Your Mind - Ana Lima, Acme Corp & Bo Chen, Initech');
  });
  it('converts TZID times and computes DTEND from DURATION', () => {
    expect(evs[0].start).toBe(utc(2026, 10, 12, 17, 0));
    expect(evs[0].end).toBe(utc(2026, 10, 12, 18, 0));
    expect(evs[1].start).toBe(utc(2026, 10, 12, 18, 30));
    expect(evs[1].end).toBe(utc(2026, 10, 12, 19, 15));
  });
  it('ignores properties inside VALARM / VTIMEZONE', () => {
    expect(evs[1].notes).toBeUndefined();
  });
  it('keeps LOCATION, CATEGORIES and URL', () => {
    expect(evs[0]).toMatchObject({ loc: 'Hall A (Level 1)', cats: 'Keynote Sessions', url: 'https://fixturecon.sched.com/event/fx-001' });
  });
  it('drops events whose end is not after start', () => {
    const t = 'BEGIN:VCALENDAR\nBEGIN:VEVENT\nDTSTART:20261112T100000Z\nDTEND:20261112T100000Z\nSUMMARY:Zero\nEND:VEVENT\nEND:VCALENDAR';
    expect(parseICSEvents(t)).toHaveLength(0);
  });
  it('applies X-WR-TIMEZONE to times without their own TZID', () => {
    const t = 'BEGIN:VCALENDAR\nX-WR-TIMEZONE:Europe/Brussels\nBEGIN:VEVENT\nDTSTART:20261112T100000\nDTEND:20261112T110000\nSUMMARY:x\nEND:VEVENT\nEND:VCALENDAR';
    expect(parseICSEvents(t)[0].start).toBe(utc(2026, 10, 12, 9, 0));
  });
});

describe('splitTitle', () => {
  it('splits "Title - Speaker, Company"', () => {
    expect(splitTitle('Keynote: Opening Remarks - Jane Doe, Example Foundation'))
      .toEqual({ title: 'Keynote: Opening Remarks', speakers: ['Jane Doe, Example Foundation'] });
  });
  it('splits multiple speakers on &, ; and "and"', () => {
    expect(splitTitle('A long enough title - Ana Lima, Acme & Bo Chen, Initech; Sam Patel, X and Kim Lee, Y').speakers)
      .toEqual(['Ana Lima, Acme', 'Bo Chen, Initech', 'Sam Patel, X', 'Kim Lee, Y']);
  });
  it('leaves titles alone without a comma in the tail, or with a dash too early', () => {
    expect(splitTitle('Hallway track - unstructured time')).toEqual({ title: 'Hallway track - unstructured time', speakers: [] });
    expect(splitTitle('Short - A, B')).toEqual({ title: 'Short - A, B', speakers: [] });
    expect(splitTitle('Lunch')).toEqual({ title: 'Lunch', speakers: [] });
  });
  it('leaves long tails alone (more than 16 words is probably a subtitle)', () => {
    const tail = Array.from({ length: 17 }, (_, i) => 'w' + i).join(' ') + ',';
    expect(splitTitle('Some talk title - ' + tail).speakers).toEqual([]);
  });
});

describe('scheduleFromICS', () => {
  const d = scheduleFromICS(fixture, 'fallback');

  it('names the schedule from X-WR-CALNAME and dedupes by UID', () => {
    expect(d.name).toBe('FixtureCon 2026');
    expect(d.sessions.map((s) => s.id)).toEqual([
      'fx-001@fixturecon.sched.com', 'fx-002@fixturecon.sched.com', 'fx-003@fixturecon.sched.com',
      'fx-005@fixturecon.sched.com', 'fx-006@fixturecon.sched.com',
    ]);
  });
  it('turns LOCATION into room lanes and "(Level N)" into buildings, sorted', () => {
    expect(d.venues.map((v) => [v.name, v.building])).toEqual([
      ['Hall A (Level 1)', 'Level 1'],
      ['Room 201 (Level 2)', 'Level 2'],
      ['Expo Hall', 'venue'],
      ['Room TBA', 'venue'],
    ]);
    expect(d.buildings['Level 1'].walk).toEqual({ 'Level 1': 1, 'Level 2': 3, venue: 3 });
    expect(d.buildings.venue.name).toBe('Venue');
    expect(d.venues[0].color).toBe(PALETTE[0]);
    expect(d.venues[1].color).toBe(PALETTE[1]);
  });
  it('splits speakers out of titles and keeps track + url', () => {
    const [k, s] = d.sessions;
    expect(k).toMatchObject({ title: 'Keynote: Opening Remarks', speakers: ['Jane Doe, Example Foundation'], track: 'Keynote Sessions', url: 'https://fixturecon.sched.com/event/fx-001' });
    expect(s).toMatchObject({ title: 'Scaling Agent Runtimes Without Losing Your Mind', speakers: ['Ana Lima, Acme Corp', 'Bo Chen, Initech'], track: 'Talks' });
  });
  it('uses the fallback name when the calendar has none, and throws on no timed events', () => {
    const t = 'BEGIN:VCALENDAR\nBEGIN:VEVENT\nUID:1\nDTSTART:20261112T100000Z\nDTEND:20261112T110000Z\nSUMMARY:x\nEND:VEVENT\nEND:VCALENDAR';
    expect(scheduleFromICS(t, 'My cal').name).toBe('My cal');
    expect(() => scheduleFromICS('BEGIN:VCALENDAR\nEND:VCALENDAR')).toThrow(/No timed events/);
  });
});

describe('parseICS (personal calendar import)', () => {
  it('maps events to block candidates', () => {
    const [e] = parseICS(fixture);
    expect(e).toEqual({
      title: 'Keynote: Opening Remarks - Jane Doe, Example Foundation', loc: 'Hall A (Level 1)',
      notes: expect.stringMatching(/^Welcome to FixtureCon/), uid: 'fx-001@fixturecon.sched.com',
      start: utc(2026, 10, 12, 17, 0), end: utc(2026, 10, 12, 18, 0),
    });
  });
});

describe('parseICS_legacy (unused)', () => {
  it('is not referenced by the app', () => {
    const app = readFileSync(new URL('../../src/app.js', import.meta.url), 'utf8');
    expect(app).not.toMatch(/parseICS_legacy|icsDate|icsUnesc/);
  });
  it('differs from parseICSEvents: ignores TZID and leaks VALARM fields', () => {
    const legacy = parseICS_legacy(fixture);
    expect(legacy[0].start).toBe(utc(2026, 10, 12, 9, 0));        // wall clock read as device-local, not Los Angeles
    expect(parseICSEvents(fixture)[0].start).toBe(utc(2026, 10, 12, 17, 0));
    expect(legacy[1].notes).toBe('Reminder');                     // the VALARM DESCRIPTION overwrote the event's
  });
});

const cal = (...ev) => 'BEGIN:VCALENDAR\n' + ev.map((e) => 'BEGIN:VEVENT\n' + e.join('\n') + '\nEND:VEVENT').join('\n') + '\nEND:VCALENDAR';

describe('X-WR-TIMEZONE with other DTSTART params', () => {
  it('applies when DTSTART has params but no TZID (VALUE=DATE-TIME)', () => {
    const t = 'BEGIN:VCALENDAR\nX-WR-TIMEZONE:Europe/Brussels\nBEGIN:VEVENT\nUID:a\nSUMMARY:x\nDTSTART;VALUE=DATE-TIME:20261112T100000\nDTEND;VALUE=DATE-TIME:20261112T110000\nEND:VEVENT\nEND:VCALENDAR';
    const [e] = parseICSEvents(t);
    expect(e.start).toBe(utc(2026, 10, 12, 9, 0));
    expect(e.fl).toBeUndefined();
  });
  it("doesn't override an explicit TZID", () => {
    const t = 'BEGIN:VCALENDAR\nX-WR-TIMEZONE:Europe/Brussels\nBEGIN:VEVENT\nUID:a\nSUMMARY:x\nDTSTART;VALUE=DATE-TIME;TZID=Asia/Tokyo:20261112T100000\nDTEND;TZID=Asia/Tokyo:20261112T110000\nEND:VEVENT\nEND:VCALENDAR';
    expect(parseICSEvents(t)[0].start).toBe(utc(2026, 10, 12, 1, 0));
  });
});

describe('recurrence (RRULE / EXDATE / RECURRENCE-ID)', () => {
  const LA = ';TZID=America/Los_Angeles';
  const base = ['UID:r1', 'SUMMARY:Standup', 'DTSTART' + LA + ':20261030T090000', 'DTEND' + LA + ':20261030T093000'];
  it('DAILY with COUNT, stepping in the wall clock across the DST change', () => {
    const evs = parseICSEvents(cal([...base, 'RRULE:FREQ=DAILY;COUNT=4']));
    expect(evs.map((e) => e.start)).toEqual([
      utc(2026, 9, 30, 16, 0), utc(2026, 9, 31, 16, 0), utc(2026, 10, 1, 17, 0), utc(2026, 10, 2, 17, 0),   // DST ends Nov 1
    ]);
    expect(evs.every((e) => e.end - e.start === 30 * MIN)).toBe(true);
    expect(new Set(evs.map((e) => e.id)).size).toBe(4);
  });
  it('WEEKLY with INTERVAL and UNTIL (inclusive)', () => {
    const evs = parseICSEvents(cal([...base, 'RRULE:FREQ=WEEKLY;INTERVAL=2;UNTIL=20261127T170000Z']));
    expect(evs.map((e) => e.start)).toEqual([utc(2026, 9, 30, 16, 0), utc(2026, 10, 13, 17, 0), utc(2026, 10, 27, 17, 0)]);
  });
  it('date-only UNTIL includes that whole day', () => {
    expect(parseICSEvents(cal([...base, 'RRULE:FREQ=DAILY;UNTIL=20261031']))).toHaveLength(2);
  });
  it('EXDATE removes instances (COUNT still counts them)', () => {
    const evs = parseICSEvents(cal([...base, 'RRULE:FREQ=DAILY;COUNT=4', 'EXDATE' + LA + ':20261031T090000,20261102T090000']));
    expect(evs.map((e) => e.start)).toEqual([utc(2026, 9, 30, 16, 0), utc(2026, 10, 1, 17, 0)]);
  });
  it('a RECURRENCE-ID override replaces its instance, keeping its id; a cancelled one removes it', () => {
    const evs = parseICSEvents(cal(
      ['UID:r1', 'RECURRENCE-ID' + LA + ':20261031T090000', 'SUMMARY:Standup (moved)', 'DTSTART' + LA + ':20261031T110000', 'DTEND' + LA + ':20261031T113000'],
      [...base, 'RRULE:FREQ=DAILY;COUNT=3'],
      ['UID:r1', 'RECURRENCE-ID' + LA + ':20261101T090000', 'STATUS:CANCELLED', 'SUMMARY:Standup', 'DTSTART' + LA + ':20261101T090000', 'DTEND' + LA + ':20261101T093000'],
    ));
    expect(evs.map((e) => [e.title, e.start])).toEqual([['Standup', utc(2026, 9, 30, 16, 0)], ['Standup (moved)', utc(2026, 9, 31, 18, 0)]]);
    expect(evs[1].id).toBe('r1@' + utc(2026, 9, 31, 16, 0));
  });
  it('scheduleFromICS keeps every instance as its own session', () => {
    const d = scheduleFromICS(cal([...base, 'LOCATION:Room 1', 'RRULE:FREQ=DAILY;COUNT=3']));
    expect(d.sessions).toHaveLength(3);
    expect(d.tz).toBe('America/Los_Angeles');
  });
  it('unsupported frequencies keep the first instance', () => {
    expect(parseICSEvents(cal([...base, 'RRULE:FREQ=MONTHLY;COUNT=3']))).toHaveLength(1);
  });
  it('an unbounded rule is capped', () => {
    expect(parseICSEvents(cal([...base, 'RRULE:FREQ=DAILY'])).length).toBe(1000);
  });
});
