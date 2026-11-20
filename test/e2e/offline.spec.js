import { test, expect } from '@playwright/test';

// Installable and offline: once the service worker (sw.js) controls the page, a reload with no network
// still opens the app from cache. Runs at / and under /nowline/ (see playwright.config.js).
test('works offline after the first visit', async ({ browser, baseURL }) => {
  const ctx = await browser.newContext({ timezoneId: 'America/Los_Angeles', locale: 'en-US' });
  const page = await ctx.newPage();
  const problems = [];
  page.on('pageerror', (e) => problems.push('pageerror: ' + e.message));
  await page.clock.install({ time: new Date('2026-11-12T07:00:00-08:00') });

  await page.goto(baseURL);
  await expect(page.locator('#confName')).toContainText('Demo: AgentWeek');

  // the manifest is linked and fetchable relative to the page
  const manifestUrl = await page.locator('link[rel=manifest]').evaluate((l) => l.href);
  expect(manifestUrl).toBe(baseURL + 'manifest.webmanifest');
  const manifest = await (await page.request.get(manifestUrl)).json();
  expect(manifest.start_url).toBe('./');

  // wait until the worker has installed (precache done) and claimed this page
  await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 15_000 });
  expect(await page.evaluate(() => navigator.serviceWorker.controller.scriptURL)).toBe(baseURL + 'sw.js');

  await ctx.setOffline(true);
  // the network really is gone, including for the worker: an uncached URL fails
  expect(await page.evaluate(() => fetch('src/app.js?offline-probe=' + Date.now()).then(() => 'ok', () => 'failed'))).toBe('failed');

  const res = await page.reload();
  expect(res.fromServiceWorker()).toBe(true);
  await expect(page.locator('#confName')).toContainText('Demo: AgentWeek');
  await expect(page.locator('.lane:not(.me) .s').first()).toBeVisible();
  expect(problems).toEqual([]);
  await ctx.close();
});
