// Copies the files the deployed site needs into _site/ (or the folder given). Nothing is compiled:
// it's the same set you'd copy to any static host by hand. Used by .github/workflows/pages.yml and by
// the Playwright "subpath" project, which serves this folder under /nowline/ like GitHub Pages does.
// Usage: node scripts/site.js [out-dir]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const SITE_FILES = ['index.html', 'src', 'vendor', 'assets'];
// copied only when present: a self-hoster's config, and a venue overlay it may point at (docs/self-host.md)
export const OPTIONAL_FILES = ['nowline.config.json', 'venue.json'];

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.resolve(root, process.argv[2] || '_site');
if (!out.startsWith(root + path.sep)) { console.error(`Refusing to write outside the repo: ${out}`); process.exit(1); }

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
for (const f of SITE_FILES) fs.cpSync(path.join(root, f), path.join(out, f), { recursive: true });
const extra = OPTIONAL_FILES.filter((f) => fs.existsSync(path.join(root, f)));
for (const f of extra) fs.cpSync(path.join(root, f), path.join(out, f));
console.log(`Site staged in ${path.relative(root, out)}/: ${SITE_FILES.concat(extra).join(', ')}`);
