import { readFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';

// Thin end-to-end check of the main flows against a static server (see playwright.config.js).
// The clock is pinned to the morning of the simple fixture's day so "now" is deterministic.
test('demo → skip tour → import → star → conflicting block → warning → room signs', async ({ page, baseURL }) => {
  const problems = [];
  page.on('pageerror', (e) => problems.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') problems.push('console: ' + m.text()); });
  page.on('response', (r) => { if (r.status() >= 400) problems.push(`${r.status()} ${r.url()}`); });

  await page.clock.install({ time: new Date('2026-11-12T07:00:00-08:00') });
  await page.goto('./');   // relative to baseURL, which is a sub-path in the "subpath" project

  // demo loads
  await expect(page.locator('#confName')).toContainText('Demo: AgentWeek');
  await expect(page.locator('.lane:not(.me) .s').first()).toBeVisible();

  // first visit offers the tour; skip it
  await page.locator('#tNo').click();
  await expect(page.locator('.tcard')).toHaveCount(0);

  // import the simple JSON fixture
  await page.locator('#importBtn').click();
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
  await page.locator('#addBlockBtn').click();
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
  await page.locator('#signsBtn').click();
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
// NowLine loads that schedule on the first scan. The feed host is faked with page.route.
const FEED = 'https://feeds.nowline.test/simple.json';
const serveFeed = (ctx, status = 200) => ctx.route(FEED, (r) => r.fulfill({ status, path: 'fixtures/simple.json', contentType: 'application/json' }));
const fresh = async (browser) => {
  const ctx = await browser.newContext({ timezoneId: 'America/Los_Angeles', locale: 'en-US' });
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
  await org.page.locator('#importBtn').click();
  await org.page.locator('#impUrl').fill(FEED);
  await org.page.locator('#impFetch').click();
  await expect(org.page.locator('#impInfo')).toContainText('Looks good: 2 sessions in 2 rooms');
  await org.page.locator('#doImp').click();
  await expect(org.page.locator('#confName')).toHaveText('My meetup');
  await org.page.locator('#signsBtn').click();
  await expect(org.page.locator('#sgFeed')).toBeVisible();
  await expect(org.page.locator('#sgWarn')).toHaveCount(0);
  const link = await org.page.locator('#sgOut [data-copy]').nth(1).getAttribute('data-copy');
  expect(new URL(link).searchParams.get('feed')).toBe(FEED);
  expect(new URL(link).hash).toBe('#here-cafe');

  // the organizer's own device already has it: no re-import, straight to the room
  await org.page.goto(link);
  await expect(org.page.locator('#sheet h2')).toHaveText('Cafe');
  await org.ctx.close();

  // attendee: never opened NowLine
  const att = await fresh(browser);
  const problems = [];
  att.page.on('pageerror', (e) => problems.push('pageerror: ' + e.message));
  await serveFeed(att.ctx);
  await att.page.goto(link);
  await expect(att.page.locator('#confName')).toHaveText('My meetup');
  await expect(att.page.locator('#sheet')).toContainText("You're here");
  await expect(att.page.locator('#sheet h2')).toHaveText('Cafe');
  await expect(att.page.locator('.tcard')).toHaveCount(0);           // no tour over the room on a scan
  expect(new URL(att.page.url()).searchParams.has('feed')).toBe(false);
  expect(new URL(att.page.url()).hash).toBe('#here-cafe');
  // it stuck: a reload doesn't show the demo
  await att.page.reload();
  await expect(att.page.locator('#confName')).toHaveText('My meetup');
  expect(problems).toEqual([]);
  await att.ctx.close();
});

test('sign feed: asks before replacing a different schedule, and reports a failed fetch', async ({ browser, baseURL }) => {
  const { ctx, page } = await fresh(browser);
  await page.goto(baseURL);
  await skipTour(page);
  await page.locator('#importBtn').click();
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
  await skipTour(page);
  await expect(page.locator('#sheet h2')).toHaveText('Workshop B');
});

// Times are instants; the zone only changes how they're shown. pretalx gives Europe/Brussels, the
// browser is in Los Angeles. 09:10 UTC = 10:10 in Brussels = 01:10 in LA, during "Opening" (09:00–09:45 UTC).
test('time zone: event zone by default, then device, then a picked zone; "now" stays the same instant', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-11-12T09:10:00Z') });
  await page.goto('./');
  await skipTour(page);
  await page.locator('#importBtn').click();
  await page.locator('#impFile').setInputFiles('fixtures/pretalx-schedule.json');
  await page.locator('#doImp').click();
  const opening = page.locator('.lane:not(.me) .s', { hasText: 'Opening' });

  // event zone (from the feed), labelled because it isn't the device's
  await expect(opening.locator('.m')).toContainText(/^10:00\sAM–10:45\sAM/);
  await expect(page.locator('#clock')).toHaveText(/^10:10\sAM$/);
  await expect(page.locator('#tzLab')).toHaveText('UTC+1');
  await expect(opening).toHaveClass(/\blive\b/);

  // my device's zone: same sessions, same "now", different numbers, no label
  await page.locator('#tzBtn').click();
  await expect(page.locator('#tzEvInfo')).toContainText('From the schedule: Europe/Brussels');
  await page.locator('input[name=tzd][value=device]').check();
  await page.locator('#tzSave').click();
  await expect(opening.locator('.m')).toContainText(/^1:00\sAM–1:45\sAM/);
  await expect(page.locator('#clock')).toHaveText(/^1:10\sAM$/);
  await expect(page.locator('#tzLab')).toBeHidden();
  await expect(opening).toHaveClass(/\blive\b/);

  // a specific zone from the searchable list
  await page.locator('#tzBtn').click();
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
  await page.locator('#importBtn').click();
  await page.locator('#impFile').setInputFiles('fixtures/sessionize-all.json');
  await page.locator('#doImp').click();
  const s501 = page.locator('.lane:not(.me) .s', { hasText: 'Edge caching' });
  await expect(s501.locator('.m')).toContainText(/^9:00\sAM–9:45\sAM/);         // 09:00 in the device zone (LA)

  await page.locator('#tzBtn').click();
  await expect(page.locator('#tzEvInfo')).toContainText("The schedule doesn't say");
  await page.locator('#tzEvQ').fill('brussels');
  await page.locator('#tzEv').selectOption('Europe/Brussels');
  await page.locator('#tzSave').click();
  await expect(s501.locator('.m')).toContainText(/^9:00\sAM–9:45\sAM/);         // shown in the event zone: still 09:00
  await expect(page.locator('#tzLab')).toHaveText('UTC+1');

  await page.locator('#tzBtn').click();
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
  await page.locator('#importBtn').click();
  await page.locator('#fill').click();
  await expect(page.locator('#rebase')).toBeChecked();
  await page.locator('#doImp').click();
  const welcome = page.locator('.lane:not(.me) .s', { hasText: 'Welcome' });
  await expect(welcome.locator('.m')).toContainText(/^8:00\sAM–8:30\sAM/);
  await expect(page.locator('.ruler .corner')).toHaveText('Thu, Jul 1');
  await expect(page.locator('#strip')).toContainText('Welcome');          // starts in 30 min: "next"
});
