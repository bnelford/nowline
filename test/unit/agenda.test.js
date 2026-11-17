import { describe, it, expect } from 'vitest';
import { walkBetween, agendaIssues } from '../../src/agenda.js';
import { MIN, HOUR } from '../../src/schedule.js';

const data = {
  buildings: {
    main: { name: 'Main', walk: { main: 1, annex: 7 } },
    annex: { name: 'Annex', walk: { annex: 1, main: 7 } },
    hotel: { name: 'Hotel' },                      // no walk table
  },
  venues: [
    { id: 'r1', building: 'main' }, { id: 'r2', building: 'main' },
    { id: 'wa', building: 'annex' }, { id: 'ball', building: 'hotel' }, { id: 'bar', building: 'hotel' },
  ],
};
const T0 = Date.UTC(2026, 10, 12, 9, 0);
const item = (id, startMin, lenMin, venue, kind = 'session') => ({ kind, id, title: id, start: T0 + startMin * MIN, end: T0 + (startMin + lenMin) * MIN, venue });

describe('walkBetween', () => {
  it('is null when either end is missing or unknown, 0 for the same room', () => {
    expect(walkBetween(data, null, 'r1')).toBeNull();
    expect(walkBetween(data, 'r1', 'nope')).toBeNull();
    expect(walkBetween(data, 'r1', 'r1')).toBe(0);
  });
  it('uses the building walk table', () => {
    expect(walkBetween(data, 'r1', 'r2')).toBe(1);
    expect(walkBetween(data, 'r1', 'wa')).toBe(7);
  });
  it('falls back to 1 (same building) or 8 (different) without a table entry', () => {
    expect(walkBetween(data, 'ball', 'bar')).toBe(1);
    expect(walkBetween(data, 'ball', 'r1')).toBe(8);
    expect(walkBetween(data, 'r1', 'ball')).toBe(8);
  });
});

describe('agendaIssues', () => {
  it('reports overlaps with their span', () => {
    const a = item('a', 0, 60, 'r1'), b = item('b', 30, 60, 'r2');
    const [o] = agendaIssues(data, [a, b]);
    expect(o).toMatchObject({ type: 'overlap', a, b, at: b.start, until: a.end });
  });
  it('flags a walk longer than the gap, with minutes late', () => {
    const a = item('a', 0, 60, 'r1', 'block'), b = item('b', 65, 30, 'wa');
    expect(agendaIssues(data, [a, b])).toEqual([{ type: 'walk', a, b, walk: 7, gap: 5, late: 2, bad: true, at: a.end }]);
  });
  it('reports a comfortable walk as not bad', () => {
    const a = item('a', 0, 60, 'r1'), b = item('b', 70, 30, 'wa');
    expect(agendaIssues(data, [a, b])[0]).toMatchObject({ type: 'walk', walk: 7, gap: 10, late: 0, bad: false });
  });
  it('ignores same-room hops and items with no place', () => {
    expect(agendaIssues(data, [item('a', 0, 60, 'r1'), item('b', 60, 30, 'r1')])).toEqual([]);
    expect(agendaIssues(data, [item('a', 0, 60, null, 'block'), item('b', 60, 30, 'wa')])).toEqual([]);
  });
  it('only checks the walk to whatever starts next', () => {
    const a = item('a', 0, 60, 'r1'), b = item('b', 70, 20, 'r2'), c = item('c', 2 * HOUR / MIN, 30, 'wa');
    const walks = agendaIssues(data, [a, b, c]).filter((x) => x.type === 'walk');
    expect(walks.map((w) => [w.a.id, w.b.id])).toEqual([['a', 'b'], ['b', 'c']]);
  });
  it('checks every item that starts at the same next time', () => {
    const a = item('a', 0, 60, 'r1'), b = item('b', 62, 30, 'wa'), c = item('c', 62, 30, 'ball');
    const walks = agendaIssues(data, [a, b, c]).filter((x) => x.type === 'walk');
    expect(walks.map((w) => [w.b.id, w.walk, w.bad])).toEqual([['b', 7, true], ['c', 8, true]]);
  });
});
