// Renders the PNG icons generated from SVG sources in assets/brand/, using the Playwright Chromium the
// E2E tests already install. Re-run after editing either SVG, and commit the PNGs.
// Usage: node scripts/icons.js
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const brand = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../assets/brand');
const ICONS = [
  { src: 'favicon-16.svg', out: 'favicon-16.png', size: 16 },
  { src: 'favicon-16.svg', out: 'favicon-32.png', size: 32 },          // same mark for 2x displays
  { src: 'icon-maskable.svg', out: 'icon-maskable-512.png', size: 512 },
];

const browser = await chromium.launch();
try {
  for (const { src, out, size } of ICONS) {
    const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
    const svg = fs.readFileSync(path.join(brand, src)).toString('base64');
    await page.setContent(`<style>html,body{margin:0;background:transparent}img{display:block}</style>
      <img width="${size}" height="${size}" src="data:image/svg+xml;base64,${svg}">`);
    await page.locator('img').evaluate((img) => img.decode());
    await page.screenshot({ path: path.join(brand, out), omitBackground: true });
    await page.close();
    console.log(`${out} (${size}x${size}) from ${src}`);
  }
} finally {
  await browser.close();
}
