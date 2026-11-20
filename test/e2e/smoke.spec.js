import { readFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';

// A fork's own roomhop.config.json (docs/self-host.md) would load its real feed here: the tests always see none
// unless they serve one themselves.
const CONFIG = '**/roomhop.config.json';
const noConfig = (target) => target.route(CONFIG, (r) => r.fulfill({ status: 404, body: 'Not found' }));
test.beforeEach(async ({ page }) => { await noConfig(page); });
// Organizer controls (Load schedule…, Room signs…, + Block, Time zone…) sit in the "⋯ More" sheet.
const more = async (page, sel) => { await page.locator('#moreBtn').click(); await page.locator(sel).click(); };

// Thin end-to-end check of the main flows against a static server (see playwright.config.js).
// The clock is pinned to the morning of the simple fixture's day so "now" is deterministic.
test('demo → skip tour → import → star → conflicting block → warning → room signs', async ({ page, baseURL }) => {
  const problems = [];
  page.on('pageerror', (e) => problems.push('pageerror: ' + e.message));
  // roomhop.config.json is optional (docs/self-host.md): its 404 is expected
  const optional = (u) => /\/roomhop\.config\.json$/.test(u || '');
  page.on('console', (m) => { if (m.type() === 'error' && !optional(m.location().url)) problems.push('console: ' + m.text()); });
  page.on('response', (r) => { if (r.status() >= 400 && !optional(r.url())) problems.push(`${r.status()} ${r.url()}`); });

  await page.clock.install({ time: new Date('2026-11-12T07:00:00-08:00') });
  await page.goto('./');   // relative to baseURL, which is a sub-path in the "subpath" project

  // demo loads
  await expect(page.locator('#confName')).toContainText('Demo: AgentWeek');
  await expect(page.locator('.lane:not(.me) .s').first()).toBeVisible();

  // first visit offers the tour in a banner (no modal, no sound needed); dismiss it
  await expect(page.locator('#tourBanner')).toContainText('New here?');
  await page.locator('#tNo').click();
  await expect(page.locator('#tourBanner')).toBeHidden();
  await expect(page.locator('.tcard')).toHaveCount(0);

  // import the simple JSON fixture
  await more(page, '#importBtn');
  await page.locator('#impFile').setInputFiles('fixtures/simple.json');
  await expect(page.locator('#impInfo')).toContainText('Looks good: 2 sessions in 2 rooms');
  await page.locator('#doImp').click();
  await expect(page.locator('#confName')).toHaveText('My meetup');

  // star "Welcome" (Stage, 08:00–08:30 Pacific)
  await page.locator('.lane:not(.me) .s', { hasText: 'Welcome' }).click();
  await page.locator('#starOne').click();
  await expect(page.locator('#starOne')).toHaveText('★ In my schedule');
  await page.locator('#closeS').click();

  // add a block in the other building at the same time
  await more(page, '#addBlockBtn');
  await page.locator('#bTitle').fill('Conflicting call');
  await page.locator('#bDay').selectOption('2026-11-12');
  await page.locator('#bStart').fill('08:00');
  await page.locator('#bVenue').selectOption('Cafe');
  await expect(page.locator('#bCheck .warnbox')).toContainText('“Conflicting call” overlaps “Welcome” by 30 min');
  await page.locator('#bSave').click();

  // the warning shows in the now/next strip and on the Me lane
  await expect(page.locator('#strip .card.warn')).toContainText('Overlap');
  await expect(page.locator('.lane.me .cf')).toContainText('overlap');

  // room-sign preview renders and points at this page by default
  await more(page, '#signsBtn');
  await expect(page.locator('#sgBase')).toHaveValue(page.url().replace(/#.*$/, ''));
  expect(await page.locator('#sgBase').inputValue()).toBe(baseURL);   // keeps the sub-path when hosted under one
  // a pasted/file import can't travel in the QR link, so the generator says so
  await expect(page.locator('#sgWarn')).toContainText("can't carry it");
  await expect(page.locator('#sgOut [data-copy]').first()).toHaveAttribute('data-copy', /#here-stage$/);
  const signs = page.locator('#sgOut img');
  await expect(signs).toHaveCount(2);
  await expect(signs.first()).toHaveAttribute('src', /^data:image\/png;base64,/);
  expect(await signs.first().evaluate((img) => img.naturalWidth)).toBe(900);
  await page.locator('#sgOut [data-try]').first().click();
  await expect(page.locator('#sheet')).toContainText("You're here");
  await expect(page.locator('#sheet h2')).toHaveText('Stage');

  expect(problems).toEqual([]);
});

// Room signs for a schedule loaded from a link carry ?feed=, so a phone that has never opened
// RoomHop loads that schedule on the first scan. The feed host is faked with page.route.
const FEED = 'https://feeds.roomhop.test/simple.json';
// Serves the fixture at FEED, and through the default relay (app.js DEFAULT_RELAY) so tests never hit the real one.
const serveFeed = async (ctx, status = 200) => {
  const reply = (r) => r.fulfill({ status, path: 'fixtures/simple.json', contentType: 'application/json' });
  await ctx.route(FEED, reply);
  await ctx.route((u) => /^nowline-relay\./.test(u.hostname) && u.searchParams.get('url') === FEED, reply);
};
const fresh = async (browser) => {
  const ctx = await browser.newContext({ timezoneId: 'America/Los_Angeles', locale: 'en-US' });
  await noConfig(ctx);
  const page = await ctx.newPage();
  await page.clock.install({ time: new Date('2026-11-12T07:00:00-08:00') });
  return { ctx, page };
};
const skipTour = async (page) => { await page.locator('#tNo').click(); };

test('sign from a feed-loaded schedule opens that schedule and room on a fresh device', async ({ browser, baseURL }) => {
  // organizer: fetch the schedule by link, then make signs
  const org = await fresh(browser);
  await serveFeed(org.ctx);
  await org.page.goto(baseURL);
  await skipTour(org.page);
  await more(org.page, '#importBtn');
  await org.page.locator('#impUrl').fill(FEED);
  await org.page.locator('#impFetch').click();
  await expect(org.page.locator('#impInfo')).toContainText('Looks good: 2 sessions in 2 rooms');
  await org.page.locator('#doImp').click();
  await expect(org.page.locator('#confName')).toHaveText('My meetup');
  await more(org.page, '#signsBtn');
  await expect(org.page.locator('#sgFeed')).toBeVisible();
  await expect(org.page.locator('#sgWarn')).toHaveCount(0);
  const link = await org.page.locator('#sgOut [data-copy]').nth(1).getAttribute('data-copy');
  expect(new URL(link).searchParams.get('feed')).toBe(FEED);
  expect(new URL(link).hash).toBe('#here-cafe');

  // the organizer's own device already has it: no re-import, straight to the room
  await org.page.goto(link);
  await expect(org.page.locator('#sheet h2')).toHaveText('Cafe');
  await org.ctx.close();

  // attendee: never opened RoomHop
  const att = await fresh(browser);
  const problems = [];
  att.page.on('pageerror', (e) => problems.push('pageerror: ' + e.message));
  await serveFeed(att.ctx);
  await att.page.goto(link);
  await expect(att.page.locator('#confName')).toHaveText('My meetup');
  await expect(att.page.locator('#sheet')).toContainText("You're here");
  await expect(att.page.locator('#sheet h2')).toHaveText('Cafe');
  await expect(att.page.locator('.tcard')).toHaveCount(0);           // no tour over the room on a scan
  await expect(att.page.locator('#tourBanner')).toBeHidden();
  expect(new URL(att.page.url()).searchParams.has('feed')).toBe(false);
  expect(new URL(att.page.url()).hash).toBe('#here-cafe');
  // it stuck: a reload doesn't show the demo
  await att.page.reload();
  await expect(att.page.locator('#confName')).toHaveText('My meetup');
  expect(problems).toEqual([]);
  await att.ctx.close();
});

test('share link: opens a feed-loaded schedule on a fresh device; demo and file imports explain why there is none', async ({ browser, baseURL }) => {
  const org = await fresh(browser);
  await serveFeed(org.ctx);
  await org.page.goto(baseURL);
  await skipTour(org.page);
  await org.page.locator('#shareBtn').click();
  await expect(org.page.locator('#shWarn')).toContainText('The demo has no link to share.');
  await org.page.locator('#closeS').click();
  await more(org.page, '#importBtn');
  await org.page.locator('#impUrl').fill(FEED);
  await org.page.locator('#impFetch').click();
  await expect(org.page.locator('#impInfo')).toContainText('Looks good');
  await org.page.locator('#doImp').click();
  await org.page.locator('#shareBtn').click();
  const link = await org.page.locator('#shLink').inputValue();
  expect(new URL(link).searchParams.get('feed')).toBe(FEED);
  expect(new URL(link).searchParams.get('relay')).toMatch(/^https:\/\/nowline-relay\./);   // the default relay travels with the link
  expect(new URL(link).hash).toBe('');
  await org.ctx.close();

  const att = await fresh(browser);
  await serveFeed(att.ctx);
  await att.page.goto(link);
  await expect(att.page.locator('#confName')).toHaveText('My meetup');
  await expect(att.page.locator('#sheet.show')).toHaveCount(0);
  expect(new URL(att.page.url()).searchParams.has('feed')).toBe(false);

  // a shared link opens in attendee mode: no organizer controls
  await expect(att.page.locator('#importBtn')).toBeHidden();

  // a different imported schedule on this device: asks, worded as a shared link
  await att.page.goto(baseURL + '?admin');
  await more(att.page, '#importBtn');
  await att.page.locator('#impFile').setInputFiles('fixtures/pretalx-schedule.json');
  await att.page.locator('#doImp').click();
  await att.page.locator('#shareBtn').click();
  await expect(att.page.locator('#shWarn')).toContainText('loaded from a file or pasted text');
  await att.page.goto(link);
  await expect(att.page.locator('#sheet h2')).toHaveText('Load this shared schedule?');
  await att.ctx.close();
});

test('sign feed: asks before replacing a different schedule, and reports a failed fetch', async ({ browser, baseURL }) => {
  const { ctx, page } = await fresh(browser);
  await page.goto(baseURL);
  await skipTour(page);
  await more(page, '#importBtn');
  await page.locator('#impFile').setInputFiles('fixtures/pretalx-schedule.json');
  await page.locator('#doImp').click();
  const mine = await page.locator('#confName').textContent();

  const link = baseURL + '?feed=' + encodeURIComponent(FEED) + '#here-cafe';
  await serveFeed(ctx);
  await page.goto(link);
  await expect(page.locator('#sheet h2')).toHaveText("Load this sign's schedule?");
  await page.locator('#closeS').click();                               // keep mine
  await expect(page.locator('#confName')).toHaveText(mine);
  expect(new URL(page.url()).searchParams.has('feed')).toBe(false);

  await page.goto(link);
  await page.locator('#sfGo').click();
  await expect(page.locator('#confName')).toHaveText('My meetup');
  await expect(page.locator('#sheet h2')).toHaveText('Cafe');

  // feed unreachable on a fresh device: say so instead of silently showing the demo
  const f = await fresh(browser);
  await serveFeed(f.ctx, 500);
  await f.page.goto(link);
  await expect(f.page.locator('#sheet h2')).toHaveText("Couldn't load the schedule");
  await expect(f.page.locator('#sheet')).toContainText('HTTP 500');
  await f.ctx.close();
  await ctx.close();
});

test('sign feed: markup in imported routes and building colors is shown as text, not run', async ({ browser, baseURL }) => {
  const { ctx, page } = await fresh(browser);
  const j = JSON.parse(readFileSync('fixtures/simple.json', 'utf8'));
  j.routes = { 'hq>cafe': '<img src=x onerror="window.pwned=1">Cross the plaza.' };
  j.buildings.cafe.color = '#fff" onmouseover="window.pwned=1';
  await ctx.route(FEED, (r) => r.fulfill({ status: 200, body: JSON.stringify(j), contentType: 'application/json' }));
  await page.goto(baseURL + '?feed=' + encodeURIComponent(FEED) + '#here-stage');
  await expect(page.locator('#sheet h2')).toHaveText('Stage');
  await page.locator('#sheet [data-to="Cafe"]').click();
  await expect(page.locator('#dirOut')).toContainText('<img src=x onerror="window.pwned=1">Cross the plaza.');
  await expect(page.locator('#dirOut img')).toHaveCount(0);
  await expect(page.locator('[onmouseover]')).toHaveCount(0);
  expect(await page.evaluate(() => window.pwned)).toBeUndefined();
  await ctx.close();
});

test('old room-only sign links still work', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-11-12T07:00:00-08:00') });
  await page.goto('./#here-wb');
  await expect(page.locator('#confName')).toContainText('Demo: AgentWeek');
  await expect(page.locator('#sheet h2')).toHaveText('Workshop B');
  await expect(page.locator('#tourBanner')).toBeHidden();             // a scan lands on the room, not the tour
});

// Times are instants; the zone only changes how they're shown. pretalx gives Europe/Brussels, the
// browser is in Los Angeles. 09:10 UTC = 10:10 in Brussels = 01:10 in LA, during "Opening" (09:00–09:45 UTC).
test('time zone: event zone by default, then device, then a picked zone; "now" stays the same instant', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-11-12T09:10:00Z') });
  await page.goto('./');
  await skipTour(page);
  await more(page, '#importBtn');
  await page.locator('#impFile').setInputFiles('fixtures/pretalx-schedule.json');
  await page.locator('#doImp').click();
  const opening = page.locator('.lane:not(.me) .s', { hasText: 'Opening' });

  // event zone (from the feed), labelled because it isn't the device's
  await expect(opening.locator('.m')).toContainText(/^10:00\sAM–10:45\sAM/);
  await expect(page.locator('#clock')).toHaveText(/^10:10\sAM$/);
  await expect(page.locator('#tzLab')).toHaveText('UTC+1');
  await expect(opening).toHaveClass(/\blive\b/);

  // my device's zone: same sessions, same "now", different numbers, no label
  await more(page, '#tzBtn');
  await expect(page.locator('#tzEvInfo')).toContainText('From the schedule: Europe/Brussels');
  await page.locator('input[name=tzd][value=device]').check();
  await page.locator('#tzSave').click();
  await expect(opening.locator('.m')).toContainText(/^1:00\sAM–1:45\sAM/);
  await expect(page.locator('#clock')).toHaveText(/^1:10\sAM$/);
  await expect(page.locator('#tzLab')).toBeHidden();
  await expect(opening).toHaveClass(/\blive\b/);

  // a specific zone from the searchable list
  await more(page, '#tzBtn');
  await page.locator('input[name=tzd][value=pick]').check();
  await page.locator('#tzPickQ').fill('kolkata');
  await expect(page.locator('#tzPick option')).toHaveCount(1);
  await page.locator('#tzPick').selectOption('Asia/Kolkata');
  await page.locator('#tzSave').click();
  await expect(opening.locator('.m')).toContainText(/^2:30\sPM–3:15\sPM/);
  await expect(page.locator('#tzLab')).toHaveText('UTC+5:30');

  // saved for this event
  await page.reload();
  await expect(page.locator('#confName')).toHaveText('FixtureCamp 2026');
  await expect(page.locator('.lane:not(.me) .s', { hasText: 'Opening' }).locator('.m')).toContainText(/^2:30\sPM/);
});

// Sessionize gives no zone: times are read in the device zone until the event zone is set, then re-read in it.
test('time zone: setting the event zone for a feed without one re-reads its times', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-11-12T07:00:00-08:00') });
  await page.goto('./');
  await skipTour(page);
  await more(page, '#importBtn');
  await page.locator('#impFile').setInputFiles('fixtures/sessionize-all.json');
  await page.locator('#doImp').click();
  const s501 = page.locator('.lane:not(.me) .s', { hasText: 'Edge caching' });
  await expect(s501.locator('.m')).toContainText(/^9:00\sAM–9:45\sAM/);         // 09:00 in the device zone (LA)

  await more(page, '#tzBtn');
  await expect(page.locator('#tzEvInfo')).toContainText("The schedule doesn't say");
  await page.locator('#tzEvQ').fill('brussels');
  await page.locator('#tzEv').selectOption('Europe/Brussels');
  await page.locator('#tzSave').click();
  await expect(s501.locator('.m')).toContainText(/^9:00\sAM–9:45\sAM/);         // shown in the event zone: still 09:00
  await expect(page.locator('#tzLab')).toHaveText('UTC+1');

  await more(page, '#tzBtn');
  await page.locator('input[name=tzd][value=device]').check();
  await page.locator('#tzSave').click();
  await expect(s501.locator('.m')).toContainText(/^12:00\sAM–12:45\sAM/);       // 09:00 Brussels = 00:00 in LA
  await page.reload();
  await expect(page.locator('.lane:not(.me) .s', { hasText: 'Edge caching' }).locator('.m')).toContainText(/^12:00\sAM/);
});

// The simple example is 08:00 PST on 2026-11-12. Shifted to a PDT day it should still start at 08:00.
test('"Shift dates to today" keeps wall-clock times across a DST change', async ({ page }) => {
  await page.clock.install({ time: new Date('2027-07-01T07:30:00-07:00') });
  await page.goto('./');
  await skipTour(page);
  await more(page, '#importBtn');
  await page.locator('#fill').click();
  await expect(page.locator('#rebase')).toBeChecked();
  await page.locator('#doImp').click();
  const welcome = page.locator('.lane:not(.me) .s', { hasText: 'Welcome' });
  await expect(welcome.locator('.m')).toContainText(/^8:00\sAM–8:30\sAM/);
  await expect(page.locator('.ruler .corner')).toHaveText('Thu, Jul 1');
  await expect(page.locator('#strip')).toContainText('Welcome');          // starts in 30 min: "next"
});

// A schedule loaded from a link is re-fetched (here: the 10-minute timer). A starred session that moved
// rooms shows in its new lane with a notice; a failed fetch says the schedule is from the last good one.
test('feed refresh: a moved room updates the timeline and tells you; a failed fetch shows offline', async ({ browser, baseURL }) => {
  const { ctx, page } = await fresh(browser);
  const problems = [];
  page.on('pageerror', (e) => problems.push('pageerror: ' + e.message));
  const j = JSON.parse(readFileSync('fixtures/simple.json', 'utf8'));
  let status = 200, fetches = 0;
  await ctx.route(FEED, (r) => { fetches++; return r.fulfill({ status, body: JSON.stringify(j), contentType: 'application/json' }); });
  await page.goto(baseURL + '?feed=' + encodeURIComponent(FEED));
  await expect(page.locator('#confName')).toHaveText('My meetup');
  await expect(page.locator('#fresh')).toHaveText(/^Updated 7:00\sAM$/);
  const lane = (room) => page.locator(`.track[data-venue="${room}"]:not([data-me]) .s`, { hasText: 'Welcome' });
  await lane('Stage').click();
  await page.locator('#starOne').click();
  await page.locator('#closeS').click();

  j.sessions[0].venue = 'Cafe';
  await page.clock.fastForward('10:00');
  await expect(lane('Cafe')).toBeVisible();
  await expect(lane('Stage')).toHaveCount(0);
  await expect(page.locator('#toast')).toContainText('Room changed: Welcome → Cafe');
  await expect(page.locator('#fresh')).toHaveText(/^Updated 7:10\sAM$/);
  await expect(lane('Cafe')).toHaveClass(/\bstar\b/);                    // still starred
  expect(fetches).toBe(2);

  status = 500;
  await page.clock.fastForward('10:00');
  await expect(page.locator('#fresh')).toHaveText(/^Offline · schedule from 7:10\sAM$/);
  await expect(lane('Cafe')).toBeVisible();
  expect(problems).toEqual([]);
  await ctx.close();
});

test('a shared link through a relay other than RoomHop’s always asks and names the relay, even over the demo', async ({ browser, baseURL }) => {
  const { ctx, page } = await fresh(browser);
  let hit = false;
  await ctx.route((u) => u.hostname === 'relay.example.net', (r) => { hit = true; return r.abort(); });
  await page.goto(baseURL + '?feed=' + encodeURIComponent(FEED) + '&relay=' + encodeURIComponent('https://relay.example.net/?url='));
  await expect(page.locator('#sheet h2')).toHaveText('Load this shared schedule?');
  await expect(page.locator('#sfRelay')).toHaveText('relay.example.net');
  expect(hit).toBe(false);
  await ctx.close();
});

test('a malformed #here- fragment or a damaged save does not stop the app', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-11-12T07:00:00-08:00') });
  await page.addInitScript(() => localStorage.setItem('roomhop:data', '{"name":"Broken","sessions":5}'));
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  await page.goto('./#here-%E0%A4');
  await expect(page.locator('#confName')).toContainText('Demo: AgentWeek');
  await expect(page.locator('#clock')).not.toHaveText('--:--');
  expect(errs).toEqual([]);
});

/* ---------- organizer features: venue overlay, attendee mode, print all, embed, roomhop.config.json ---------- */
const PRETALX = 'https://feeds.roomhop.test/pretalx.json';
const VENUE = 'https://venues.roomhop.test/venue.json';
const venueJson = {
  buildings: {
    hall: { name: 'Hall', color: '#112233', walk: { hall: 1, annex: 6 } },
    annex: { name: 'Annex', color: '#445566', walk: { annex: 1, hall: 6 } },
  },
  rooms: { 'main stage': { building: 'hall', where: 'Ground floor' }, 'Room B': { building: 'annex', where: 'Up the stairs' } },
  routes: { 'hall>annex': 'Cross the courtyard.' },
};
const ORG_ONLY = ['#importBtn', '#signsBtn', '#demoBtn', '#backBtn', '#fwdBtn'];
// they live in the "⋯ More" sheet: open it so "hidden" means attendee mode, not a closed sheet
const orgTools = async (page, state) => {
  await page.locator('#moreBtn').click(); await expect(page.locator('#moreSheet')).toHaveClass(/\bshow\b/);
  await expect(page.locator('#liveBtn')).toBeVisible();
  for (const id of ORG_ONLY) await expect(page.locator(id))[state]();
  await page.keyboard.press('Escape');
};
const pretalxDevice = async (browser) => {
  const ctx = await browser.newContext({ timezoneId: 'America/Los_Angeles', locale: 'en-US' });
  await noConfig(ctx);
  const page = await ctx.newPage();
  await page.clock.install({ time: new Date('2026-11-12T09:10:00Z') });   // during "Opening" on Main Stage
  const relayHits = [];
  await ctx.route(PRETALX, (r) => r.fulfill({ status: 200, path: 'fixtures/pretalx-schedule.json', contentType: 'application/json' }));
  await ctx.route(VENUE, (r) => r.fulfill({ status: 200, body: JSON.stringify(venueJson), contentType: 'application/json', headers: { 'access-control-allow-origin': '*' } }));
  await ctx.route((u) => /^nowline-relay\./.test(u.hostname), (r) => { relayHits.push(r.request().url()); r.fulfill({ status: 502, body: 'relay not expected' }); });
  return { ctx, page, relayHits };
};

test('venue overlay: &venue= replaces placeholder walk times, travels in share and sign links, and skips the relay', async ({ browser, baseURL }) => {
  const { ctx, page, relayHits } = await pretalxDevice(browser);
  const roomB = page.locator('.lab[data-venue="Room B"] small');

  // the feed alone: one generated building, 1-minute walks
  await page.goto(baseURL + '?feed=' + encodeURIComponent(PRETALX));
  await expect(page.locator('#confName')).toHaveText('FixtureCamp 2026');
  await page.locator('#hereSel').selectOption('Main Stage');
  await expect(roomB).toHaveText('Venue · 1 min');

  // the same feed with its venue file: asks (different overlay), then real buildings and walk times
  await page.goto(baseURL + '?feed=' + encodeURIComponent(PRETALX) + '&venue=' + encodeURIComponent(VENUE));
  await expect(page.locator('#sheet h2')).toHaveText('Load this shared schedule?');
  await page.locator('#sfGo').click();
  await expect(roomB).toHaveText('Annex · 6 min');
  await page.locator('.lane:not(.me) .s', { hasText: 'Lightning talks' }).click();
  await expect(page.locator('#sheet .note').first()).toContainText('6 min walk from you');
  await page.locator('#closeS').click();
  expect(relayHits).toEqual([]);   // both answered directly: the relay is only a fallback

  // the venue stays on the links this schedule hands out
  await page.locator('#shareBtn').click();
  expect(new URL(await page.locator('#shLink').inputValue()).searchParams.get('venue')).toBe(VENUE);
  await page.goto(baseURL + '?admin');
  await more(page, '#signsBtn');
  const sign = new URL(await page.locator('#sgOut [data-copy]').first().getAttribute('data-copy'));
  expect(sign.searchParams.get('venue')).toBe(VENUE);
  expect(sign.searchParams.get('feed')).toBe(PRETALX);
  await ctx.close();
});

test('feed fetch goes direct first, and falls back to the relay only when that fails', async ({ browser, baseURL }) => {
  const relay = 'https://roomhop-relay.example.test/?url=';
  const link = baseURL + '?feed=' + encodeURIComponent(FEED) + '&relay=' + encodeURIComponent(relay);
  const viaRelay = async (ctx, hits) => ctx.route((u) => u.hostname === 'roomhop-relay.example.test' && u.searchParams.get('url') === FEED,
    (r) => { hits.push(1); r.fulfill({ status: 200, path: 'fixtures/simple.json', contentType: 'application/json' }); });

  const a = await fresh(browser), aHits = [];
  await a.ctx.route(FEED, (r) => r.fulfill({ status: 200, path: 'fixtures/simple.json', contentType: 'application/json' }));
  await viaRelay(a.ctx, aHits);
  await a.page.goto(link);
  await a.page.locator('#sfGo').click();   // a relay that isn't the default always asks first
  await expect(a.page.locator('#confName')).toHaveText('My meetup');
  expect(aHits).toEqual([]);
  await a.ctx.close();

  const b = await fresh(browser), bHits = [];
  await b.ctx.route(FEED, (r) => r.abort('failed'));   // like a CORS or network failure
  await viaRelay(b.ctx, bHits);
  await b.page.goto(link);
  await b.page.locator('#sfGo').click();   // a relay that isn't the default always asks first
  await expect(b.page.locator('#confName')).toHaveText('My meetup');
  expect(bHits).toEqual([1]);
  await b.ctx.close();
});

test('attendee mode: share links and a configured feed hide organizer controls unless ?admin or organizerTools', async ({ browser, baseURL }) => {
  const { ctx, page } = await fresh(browser);
  await serveFeed(ctx);
  await page.goto(baseURL + '?feed=' + encodeURIComponent(FEED));
  await expect(page.locator('#confName')).toHaveText('My meetup');
  await expect(page.locator('body')).toHaveClass(/\battendee\b/);
  await orgTools(page, 'toBeHidden');
  await expect(page.locator('#shareBtn')).toBeVisible();
  await expect(page.locator('.tcard')).toHaveCount(0);

  await page.goto(baseURL + '?admin');
  await orgTools(page, 'toBeVisible');
  await ctx.close();

  // a self-hosted copy with a config feed: loads it instead of the demo, no tour, attendee mode, branding applied
  const cfg = { name: 'Acme Conf', feed: FEED, colors: { accent: '#123456', bg: 'red;}' }, tour: false };
  const s = await fresh(browser);
  await serveFeed(s.ctx);
  const serveConfig = async (c) => { await s.ctx.unroute(CONFIG); await s.ctx.route(CONFIG, (r) => r.fulfill({ status: 200, body: JSON.stringify(c), contentType: 'application/json' })); };
  await serveConfig(cfg);
  await s.page.goto(baseURL);
  await expect(s.page.locator('#confName')).toHaveText('My meetup');
  await expect(s.page).toHaveTitle('Acme Conf · RoomHop');
  await expect(s.page.locator('.tcard')).toHaveCount(0);
  await expect(s.page.locator('#tourBtn')).toBeHidden();
  await orgTools(s.page, 'toBeHidden');
  expect(await s.page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--accent').trim())).toBe('#123456');
  expect(await s.page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--bg').trim())).toBe('#0e1116');

  // organizerTools:true keeps the controls
  await serveConfig({ ...cfg, organizerTools: true });
  await s.page.reload();
  await expect(s.page.locator('#confName')).toHaveText('My meetup');
  await orgTools(s.page, 'toBeVisible');
  await s.ctx.close();
});

test('room signs: "Print all" fills the print container, one sign per room, and long links are flagged', async ({ page }) => {
  await page.addInitScript(() => { window.print = () => { window.__printed = (window.__printed || 0) + 1; }; });
  await page.clock.install({ time: new Date('2026-11-12T07:00:00-08:00') });
  await page.goto('./');
  await skipTour(page);
  await more(page, '#signsBtn');
  const rooms = await page.locator('#sgOut img').count();
  expect(rooms).toBeGreaterThan(1);
  await expect(page.locator('#sgOut .sglen')).toHaveCount(rooms);
  await expect(page.locator('#sgOut .sglen').first()).toContainText('QR link:');
  await expect(page.locator('#sgOut .sglen.warnbox')).toHaveCount(0);

  await page.locator('#sgPrint').click();
  await expect.poll(() => page.evaluate(() => window.__printed)).toBe(1);
  const printed = page.locator('#printSigns .psign img');
  await expect(printed).toHaveCount(rooms);
  await expect(printed.first()).toHaveAttribute('src', /^data:image\/png;base64,/);
  await expect(page.locator('body')).toHaveClass(/\bprinting\b/);
  await page.emulateMedia({ media: 'print' });
  await expect(page.locator('#printSigns')).toBeVisible();
  await expect(page.locator('#tl')).toBeHidden();
  expect(await page.locator('#printSigns .psign').first().evaluate((el) => getComputedStyle(el).breakAfter)).toBe('page');
  await page.emulateMedia({ media: 'screen' });

  // a long page link makes a dense QR: each sign says so
  await page.locator('#sgBase').fill('https://events.example.org/' + 'a'.repeat(320) + '/');
  await page.locator('#sgGo').click();
  await expect(page.locator('#sgOut .sglen.warnbox')).toHaveCount(rooms);
  await expect(page.locator('#sgOut .sglen.warnbox').first()).toContainText('Long link');
});

test('embed mode: no header, organizer controls or tour, and nothing written to localStorage', async ({ browser, baseURL }) => {
  const { ctx, page } = await fresh(browser);
  await serveFeed(ctx);
  await page.goto(baseURL + '?embed=1&feed=' + encodeURIComponent(FEED) + '&admin');
  await expect(page.locator('.lane:not(.me) .s', { hasText: 'Welcome' })).toBeVisible();
  await expect(page.locator('body')).toHaveClass(/\bembed\b/);
  await expect(page.locator('header')).toBeHidden();
  await orgTools(page, 'toBeHidden');   // even with ?admin
  await expect(page.locator('.tcard')).toHaveCount(0);
  await expect(page.locator('#sheet.show')).toHaveCount(0);                  // no "Load this schedule?" prompt
  await page.locator('#hereSel').selectOption('Stage');
  expect(new URL(page.url()).searchParams.get('feed')).toBe(FEED);           // kept: nothing is stored, so a reload needs it
  expect(await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('roomhop:')))).toEqual([]);
  await page.reload();
  await expect(page.locator('.lane:not(.me) .s', { hasText: 'Welcome' })).toBeVisible();
  await ctx.close();
});

// Simple fixture: Welcome is 08:00–08:30 Pacific on Stage (HQ); the Cafe is a 4 min walk away.
const loadSimple = async (page) => {
  await page.goto('./');
  await skipTour(page);
  await more(page, '#importBtn');
  await page.locator('#impFile').setInputFiles('fixtures/simple.json');
  await page.locator('#doImp').click();
  await expect(page.locator('#confName')).toHaveText('My meetup');
};

test('keyboard: a session block opens with Enter, the sheet traps Tab, Escape returns focus', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-11-12T07:00:00-08:00') });
  await loadSimple(page);
  const welcome = page.locator('.lane:not(.me) .s', { hasText: 'Welcome' });
  await expect(welcome).toHaveAttribute('tabindex', '0');
  await expect(welcome).toHaveAttribute('role', 'button');
  await welcome.focus();
  await page.keyboard.press('Enter');
  const sheet = page.locator('#sheet');
  await expect(sheet).toHaveClass(/\bshow\b/);
  await expect(sheet).toHaveAttribute('role', 'dialog');
  await expect(sheet).toHaveAttribute('aria-modal', 'true');
  await expect(page.locator('#sheet h2')).toHaveText('Welcome');
  await expect(sheet).toBeFocused();
  for (let i = 0; i < 8; i++) {                                         // Tab cycles inside the dialog
    await page.keyboard.press('Tab');
    expect(await page.evaluate(() => document.getElementById('sheet').contains(document.activeElement))).toBe(true);
  }
  await page.keyboard.press('Escape');
  await expect(sheet).not.toHaveClass(/\bshow\b/);
  await expect(welcome).toBeFocused();

  // Space works too, on a map room (SVG); focus comes back to it although the map re-renders every few seconds
  await page.locator('#vMap').click();
  const stage = page.locator('#mapSvg [data-room="Stage"]');
  await stage.focus();
  await page.keyboard.press(' ');
  await expect(page.locator('#sheet h2')).toHaveText('Stage');
  await page.keyboard.press('Escape');
  await expect(sheet).not.toHaveClass(/\bshow\b/);
  await expect(page.locator('#mapSvg [data-room="Stage"]')).toBeFocused();
});

test('Escape closes a sheet and focus goes back to the button that opened it', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-11-12T07:00:00-08:00') });
  await page.goto('./');
  await skipTour(page);
  await page.locator('#moreBtn').focus();
  await page.keyboard.press('Enter');
  const m = page.locator('#moreSheet');
  await expect(m).toBeVisible();
  await expect(m).toBeFocused();
  await page.keyboard.press('Shift+Tab');                               // wraps to the last control in the sheet
  await expect(page.locator('#moreClose')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.locator('#liveBtn')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(m).toBeHidden();
  await expect(page.locator('#moreBtn')).toBeFocused();
  // the opener is restored through a nested sheet too: More → Rooms… → Escape lands on More
  await page.locator('#moreBtn').click();
  await page.locator('#lanesBtn').click();
  await expect(page.locator('#sheet h2')).toHaveText('Rooms & venues');
  await page.keyboard.press('Escape');
  await expect(page.locator('#sheet')).toBeHidden();
  await expect(page.locator('#moreBtn')).toBeFocused();
});

test('"Your next" card: pinned first for a starred session over 45 min away, with walk and leave-by', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-11-12T07:00:00-08:00') });
  await loadSimple(page);
  await page.locator('.lane:not(.me) .s', { hasText: 'Welcome' }).click();
  await page.locator('#starOne').click();
  await page.locator('#closeS').click();
  await page.locator('#hereSel').selectOption('Cafe');
  const first = page.locator('#strip .card').first();
  await expect(first).toHaveClass(/\byours\b/);
  await expect(first).toContainText('Your next');
  await expect(first).toContainText('Welcome');
  await expect(first).toContainText('Stage');
  await expect(first.locator('.go')).toHaveText(/^4 min walk · leave by 7:56\sAM$/);
  // past the leave-by time: you'll be late, and the session isn't listed twice now that it's "next"
  await page.clock.fastForward('57:30');
  await expect(first.locator('.go')).toContainText("You'll be late: 4 min walk");
  await expect(page.locator('#strip .card', { hasText: 'Welcome' })).toHaveCount(1);
});

test('multi-day: after Day 1 ends the strip says when Day 2 starts; other-day times carry the weekday', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-11-12T20:00:00-08:00') });   // Thu evening, after Day 1
  const j = { name: 'Two-day camp', buildings: { hq: { name: 'HQ', color: '#7cc4ff', walk: {} } },
    venues: [{ id: 'Stage', name: 'Stage', building: 'hq' }],
    sessions: [
      { title: 'Day one talk', start: '2026-11-12T09:00:00-08:00', end: '2026-11-12T10:00:00-08:00', venue: 'Stage' },
      { title: 'Day two talk', start: '2026-11-13T09:00:00-08:00', end: '2026-11-13T10:00:00-08:00', venue: 'Stage' }] };
  await page.goto('./');
  await skipTour(page);
  await more(page, '#importBtn');
  await page.locator('#impFile').setInputFiles({ name: 'two-day.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(j)) });
  await page.locator('#doImp').click();
  await expect(page.locator('#confName')).toHaveText('Two-day camp');
  await expect(page.locator('#strip .empty')).toHaveText(/^Day 2 starts Fri 9:00\sAM\.$/);
  await expect(page.locator('#strip')).not.toContainText('ended');
  await page.locator('#daySel').selectOption('2026-11-13');
  await page.locator('.lane:not(.me) .s', { hasText: 'Day two talk' }).click();
  await expect(page.locator('#sheet .note').first()).toHaveText(/^Fri 9:00\sAM–10:00\sAM$/);   // no "Starts in 13h 0m"
});
