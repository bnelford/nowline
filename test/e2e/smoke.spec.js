import { test, expect } from '@playwright/test';

// Thin end-to-end check of the main flows against a static server (see playwright.config.js).
// The clock is pinned to the morning of the simple fixture's day so "now" is deterministic.
test('demo → skip tour → import → star → conflicting block → warning → room signs', async ({ page }) => {
  const problems = [];
  page.on('pageerror', (e) => problems.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') problems.push('console: ' + m.text()); });
  page.on('response', (r) => { if (r.status() >= 400) problems.push(`${r.status()} ${r.url()}`); });

  await page.clock.install({ time: new Date('2026-11-12T07:00:00-08:00') });
  await page.goto('/');

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
  const signs = page.locator('#sgOut img');
  await expect(signs).toHaveCount(2);
  await expect(signs.first()).toHaveAttribute('src', /^data:image\/png;base64,/);
  expect(await signs.first().evaluate((img) => img.naturalWidth)).toBe(900);
  await page.locator('#sgOut [data-try]').first().click();
  await expect(page.locator('#sheet')).toContainText("You're here");
  await expect(page.locator('#sheet h2')).toHaveText('Stage');

  expect(problems).toEqual([]);
});
