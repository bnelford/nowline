// Copies the files the deployed site needs into _site/ (or the folder given). Nothing is compiled:
// it's the same set you'd copy to any static host by hand. Used by .github/workflows/pages.yml and by
// the Playwright "subpath" project, which serves this folder under /nowline/ like GitHub Pages does.
// The one change made on the way: sw.js gets a cache version that is a hash of the staged files, so a
// deploy that changes anything replaces visitors' offline cache, and an unchanged deploy keeps it.
// Usage: node scripts/site.js [out-dir]
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const SITE_FILES = ['index.html', 'organizers.html', 'docs', 'manifest.webmanifest', 'sw.js', 'src', 'vendor', 'assets'];

// Hash of every file under `dir` (paths and contents, in a stable order). Run it before stamping sw.js.
export function contentHash(dir) {
  const h = crypto.createHash('sha256');
  const walk = (d) => {
    for (const name of fs.readdirSync(d).sort()) {
      const p = path.join(d, name), rel = path.relative(dir, p).split(path.sep).join('/');
      if (fs.statSync(p).isDirectory()) { walk(p); continue; }
      if (name === '.DS_Store') continue;
      h.update(rel + '\0').update(fs.readFileSync(p)).update('\0');
    }
  };
  walk(dir);
  return h.digest('hex').slice(0, 12);
}

// Replaces the `const VERSION = '...'` line in sw.js source.
export function stampVersion(src, version) {
  const re = /^const VERSION = '[^']*';$/m;
  if (!re.test(src)) throw new Error("sw.js: no `const VERSION = '...';` line to stamp");
  return src.replace(re, `const VERSION = '${version}';`);
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const out = path.resolve(root, process.argv[2] || '_site');
  if (!out.startsWith(root + path.sep)) { console.error(`Refusing to write outside the repo: ${out}`); process.exit(1); }

  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(out, { recursive: true });
  for (const f of SITE_FILES) fs.cpSync(path.join(root, f), path.join(out, f), { recursive: true });
  const version = contentHash(out);
  const sw = path.join(out, 'sw.js');
  fs.writeFileSync(sw, stampVersion(fs.readFileSync(sw, 'utf8'), version));
  console.log(`Site staged in ${path.relative(root, out)}/: ${SITE_FILES.join(', ')} (sw cache ${version})`);
}
