// Writes shields.io endpoint badges (https://shields.io/badges/endpoint-badge) from test reports, so the
// badges need no third-party coverage service. Used by .github/workflows/pages.yml, which publishes
// the files with the site at https://bnelford.github.io/nowline/<name>.json.
// Inputs (missing ones are skipped): coverage/coverage-summary.json (npm run test:coverage),
// reports/unit.json (Vitest json reporter), reports/e2e.json (Playwright json reporter).
// Usage: node scripts/badges.js [out-dir]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.resolve(root, process.argv[2] || 'reports/badges');
const read = f => { try { return JSON.parse(fs.readFileSync(path.join(root, f), 'utf8')); } catch { return null; } };

const coverageColor = pct =>
  pct >= 90 ? 'brightgreen' : pct >= 80 ? 'green' : pct >= 70 ? 'yellowgreen' : pct >= 60 ? 'yellow' : pct >= 40 ? 'orange' : 'red';
const badge = (label, message, color) => ({ schemaVersion: 1, label, message, color });

const badges = {};
const cov = read('coverage/coverage-summary.json');
if (cov) {
  const pct = cov.total.lines.pct;
  badges['coverage-badge.json'] = badge('unit coverage', `${Math.round(pct)}%`, coverageColor(pct));
}

// Playwright runs each spec once per project (root and /nowline/ sub-path); count a spec once, as passed
// only if it passed in every project (a pass on retry counts)
const specs = s => [...(s.specs || []), ...(s.suites || []).flatMap(specs)];
const unit = read('reports/unit.json'), e2e = read('reports/e2e.json');
if (unit || e2e) {
  const e2eSpecs = e2e ? e2e.suites.flatMap(specs) : [];
  const e2ePassed = e2eSpecs.filter(s => s.ok && s.tests.every(t => t.status === 'expected' || t.status === 'flaky')).length;
  const parts = [], failed = (unit?.numFailedTests || 0) + (e2e ? e2eSpecs.length - e2ePassed : 0);
  if (unit) parts.push(`${unit.numPassedTests} unit`);
  if (e2e) parts.push(`${e2ePassed} e2e`);
  badges['tests-badge.json'] = badge('tests', failed ? `${failed} failing` : `${parts.join(' · ')} passing`, failed ? 'red' : 'brightgreen');
}

fs.mkdirSync(out, { recursive: true });
for (const [name, b] of Object.entries(badges)) {
  fs.writeFileSync(path.join(out, name), JSON.stringify(b) + '\n');
  console.log(`${name}: ${b.label} ${b.message} (${b.color})`);
}
if (!Object.keys(badges).length) console.log('No reports found; no badges written.');
