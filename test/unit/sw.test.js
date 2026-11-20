import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import { SITE_FILES, stampVersion } from '../../scripts/site.js';

// The service worker's precache list is hand-written (there's no build step), so these checks keep it in
// step with the files on disk, the manifest, and the Pages artifact.
const root = path.resolve(__dirname, '../..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const swSrc = read('sw.js');
const PRECACHE = JSON.parse(swSrc.match(/const PRECACHE = (\[[\s\S]*?\]);/)[1].replace(/'/g, '"').replace(/,\s*\]/, ']'));
const manifest = JSON.parse(read('manifest.webmanifest'));
const ls = (d) => fs.readdirSync(path.join(root, d)).filter((f) => f !== '.DS_Store').map((f) => `${d}/${f}`);

describe('sw.js precache', () => {
  it('lists every src module, every vendor file and the manifest', () => {
    for (const f of [...ls('src').filter((f) => f.endsWith('.js')), ...ls('vendor'), 'index.html', './', 'manifest.webmanifest']) {
      expect(PRECACHE).toContain(f);
    }
  });

  it('lists the manifest icons and every icon index.html links', () => {
    for (const i of manifest.icons) expect(PRECACHE).toContain(i.src);
    const head = read('index.html').split('</head>')[0];
    for (const [, href] of head.matchAll(/<link rel="(?:icon|apple-touch-icon)" href="\.\/([^"]+)"/g)) expect(PRECACHE).toContain(href);
  });

  it('only lists files that exist, are relative, and ship in the Pages artifact', () => {
    for (const f of PRECACHE.filter((f) => f !== './')) {
      expect(f).not.toMatch(/^\/|^https?:/);
      expect(fs.existsSync(path.join(root, f)), f).toBe(true);
      expect(SITE_FILES.some((s) => f === s || f.startsWith(s + '/')), f).toBe(true);
    }
  });
});

describe('manifest.webmanifest', () => {
  it('uses relative URLs so it works under any sub-path', () => {
    expect(manifest).toMatchObject({ start_url: './', scope: './', display: 'standalone', theme_color: '#0e1116', background_color: '#0e1116' });
    for (const i of manifest.icons) expect(i.src).not.toMatch(/^\/|^https?:/);
    expect(manifest.icons.map((i) => i.purpose)).toContain('maskable');
  });
});

describe('scripts/site.js', () => {
  it('ships the PWA files', () => {
    for (const f of ['manifest.webmanifest', 'sw.js']) expect(SITE_FILES).toContain(f);
  });

  it('stamps the service worker cache version', () => {
    const out = stampVersion(swSrc, 'abc123def456');
    expect(out).toContain("const VERSION = 'abc123def456';");
    expect(out).not.toContain("const VERSION = 'dev';");
    expect(() => stampVersion('const X = 1;', 'v')).toThrow(/VERSION/);
  });
});
