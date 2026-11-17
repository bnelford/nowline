// Minimal static file server for local development and the Playwright smoke test.
// NowLine itself needs no server code: any static host works (see README).
// Usage: node scripts/serve.js [port] [--root dir] [--base /path/]
//   port    default 8080, or $PORT
//   --root  folder to serve (default: the repo), e.g. _site from scripts/site.js
//   --base  serve under a sub-path, like GitHub Pages project sites (https://<user>.github.io/<repo>/)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const flag = (name) => { const i = args.indexOf(name); return i >= 0 ? args.splice(i, 2)[1] : null; };
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const root = path.resolve(repo, flag('--root') || '.');
const base = ('/' + (flag('--base') || '').replace(/^\/+|\/+$/g, '') + '/').replace(/^\/\/$/, '/');
const port = Number(args[0] || process.env.PORT || 8080);
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.mp3': 'audio/mpeg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ics': 'text/calendar; charset=utf-8',
};

http.createServer((req, res) => {
  let urlPath = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  if (urlPath + '/' === base) { res.writeHead(301, { location: base }).end(); return; }   // /nowline → /nowline/
  if (!urlPath.startsWith(base)) { res.writeHead(404, { 'content-type': 'text/plain' }).end('Not found'); return; }
  urlPath = '/' + urlPath.slice(base.length);
  let file = path.join(root, urlPath);
  if (!file.startsWith(root + path.sep) && file !== root) { res.writeHead(403).end(); return; }
  if (urlPath.endsWith('/')) file = path.join(file, 'index.html');
  fs.readFile(file, (err, body) => {
    if (err) { res.writeHead(404, { 'content-type': 'text/plain' }).end('Not found'); return; }
    res.writeHead(200, { 'content-type': types[path.extname(file)] || 'application/octet-stream' }).end(body);
  });
}).listen(port, () => console.log(`NowLine at http://localhost:${port}${base}`));
