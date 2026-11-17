<h1>
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="assets/brand/logo-dark.svg">
    <img src="assets/brand/logo.svg" alt="NowLine" width="312" height="64">
  </picture>
</h1>

[![CI](https://github.com/bnelford/nowline/actions/workflows/ci.yml/badge.svg)](https://github.com/bnelford/nowline/actions/workflows/ci.yml)
[![License: Apache-2.0](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)

**What's on now, what's next, and whether you'll make it there in time.**

NowLine turns a conference's published schedule (Sched, pretalx, Sessionize, or any whole-event
`.ics`) into a live, phone-first timeline. Every room is a lane, a red line marks the current time,
and your own agenda is checked against the walk between rooms.

**[Try the live demo →](https://bnelford.github.io/nowline/)** The demo's data is generated around the
current time, so it's always mid-conference. **▶ Tour** plays a 90-second walkthrough.

<img src="docs/demo.gif" width="400" alt="NowLine demo at 60× speed: rooms as swim lanes, a red now-line moving across them, the now/next strip, and a tight-connection warning for a walk longer than the gap">

## What it does

- **Live timeline.** Rooms as swim lanes, a now-line, and a now/next strip for what's starting soon.
- **Your agenda, checked.** Star sessions, add your own blocks, or import your calendar. NowLine warns
  about overlaps and connections that are too tight: *"5 min between these, but it's an 8 min walk."*
- **"I'm here" room signs.** Print a QR sign per room. Scanning one tells the phone where you are and
  gives directions and a leave-by time for your next stop.
- **No account, no backend.** Static files. Stars and blocks stay in your browser.

It's not a CFP, ticketing, or schedule-authoring tool. Sessionize, pretalx, Sched and the rest stay the
source of truth; NowLine reads what they already publish.

## Use it with your conference

Open NowLine, choose **Load schedule…**, and give it the event's export:

| Platform | Export |
| --- | --- |
| Sched | Whole-event iCal feed (on the event's Sched site, logged out: *Mobile App + iCal*) |
| pretalx / frab | `…/schedule/export/schedule.json` |
| Sessionize | API "All data" or "Schedule grid" JSON |
| Swapcard, Cvent, others | Whole-event `.ics` |
| Anything else | NowLine's [simple JSON](docs/importing.md#simple-event-json), which can also describe buildings, walk times and routes |

Choosing a file or pasting text always works. Fetching by link needs a small [feed relay](docs/relay.md),
because schedule sites don't send CORS headers.

## Run it for your event

1. **Host it.** Fork the repo, then in *Settings → Pages* set *Source* to **GitHub Actions**. The
   [Pages workflow](.github/workflows/pages.yml) tests and publishes the site to
   `https://<you>.github.io/<repo>/` on every push to `main`. Any other static host works too:
   `node scripts/site.js` copies the site into `_site/`, and all paths are relative.
2. **Deploy the relay** (optional, needed to load by link): `npx wrangler deploy`. See [docs/relay.md](docs/relay.md).
3. **Load the schedule from its feed link and print room signs.** Signs made from a feed-loaded schedule
   work on any phone, including one that has never opened NowLine. See [docs/room-signs.md](docs/room-signs.md).

## Docs

- [Loading a schedule](docs/importing.md): every format, time zones, and the simple JSON format
- [Your agenda](docs/agenda.md): stars, blocks, calendar import, and conflict checks
- [Room signs](docs/room-signs.md): QR links, feed links, and printing
- [Feed relay](docs/relay.md): what it allows, its limits, and deploying it

## Development

NowLine uses ES modules, which browsers won't load from `file://`. Serve the folder over HTTP:

```sh
npm install
npm run serve                     # → http://localhost:8080/  (or: python3 -m http.server 8080)
npm test                          # unit tests (Vitest): importers, .ics parsing, agenda checks, signs, stars, relay
npm run test:coverage             # the same, with a V8 coverage report (src/ and the relay)
npx playwright install chromium   # once
npm run test:e2e                  # Playwright smoke: demo → import → star → conflict → signs → time zones,
                                  # run at / and again under /nowline/ against the staged site, like Pages
```

```
index.html               markup + CSS; loads vendor/qrcode.js and src/app.js
src/app.js               UI: rendering, sheets, map, tour, storage
src/schedule.js          normalized model + JSON importers (pretalx/frab, Sessionize, simple)
src/ics.js               .ics parsing and whole-event calendar import
src/agenda.js            walk times and conflict detection
src/tz.js                time zones: Intl-based conversion, labels, per-event zone settings
src/signs.js, stars.js   room-sign links, per-event stars
src/demo.js, samples.js  synthetic demo data, the simple-format example
vendor/qrcode.js         QR Code Generator (MIT), unmodified
assets/tour/*.mp3        tour voiceover
assets/brand/            logo, mark, monochrome variants, favicon and app icons
fixtures/                sample exports used by tests
nowline-feed-relay.js    optional Cloudflare Worker (wrangler.toml)
scripts/serve.js         static dev server (--base /nowline/ serves under a sub-path)
scripts/site.js          copies the site files into _site/ for deployment
scripts/badges.js        writes the coverage/test-count badge JSON from test reports (pages.yml)
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines. The short version: no bundler, no framework,
no required backend.

## License

NowLine is licensed under the [Apache License 2.0](LICENSE), © 2026 Beau Nelford. Third-party material
keeps its own license; see [THIRD_PARTY.md](THIRD_PARTY.md) and [NOTICE](NOTICE). This includes the
MIT-licensed QR Code Generator by Kazuhiko Arase, and voiceover generated with Kokoro-82M (Apache-2.0).
"QR Code" is a registered trademark of DENSO WAVE INCORPORATED.
