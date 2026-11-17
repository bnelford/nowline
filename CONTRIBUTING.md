# Contributing to NowLine

Thanks for helping. NowLine is small on purpose, and these notes are mostly about keeping it that way.

## Ground rules

- **No required build step.** The app must keep working when served as plain files (`index.html`,
  `src/`, `vendor/`, `assets/`). Don't add a bundler, a transpiler or a UI framework. Use plain ES
  modules.
- **No required backend.** All personal data stays in the browser. Server-side pieces, like the feed
  relay, must stay optional, and the app must work without them.
- **Read, don't replace.** NowLine reads exports from Sessionize, pretalx, Indico, Sched and similar
  tools. It isn't a scheduling, CFP or registration system.
- **Keep pure logic pure.** Parsing, normalizing, and agenda/walk-time logic go in `src/*.js`
  modules with no DOM or `localStorage` access, so they can be unit-tested. `src/app.js` is the only
  module that touches the page.
- **Match the surrounding style.** The code is terse. Follow the conventions of the file you're editing.
- Discuss bigger changes (new import formats, new views, anything touching storage keys) in an issue
  before you start on them.

## Setup

```sh
npm install
npm run serve                      # http://localhost:8080/
npm test                           # unit tests (Vitest)
npx playwright install chromium    # once
npm run test:e2e                   # Playwright smoke test
```

Unit tests run with `TZ=UTC` (set in `vitest.config.js`) because floating `.ics` times and
Sessionize timestamps are read in the device's time zone when the event's zone is unknown. The E2E
tests pin the browser to `America/Los_Angeles` and fix the clock. They run twice: once from the repo
root, and once (the `subpath` project) against only the files in `scripts/site.js`, served under
`/nowline/` the way GitHub Pages serves this repo. Use relative paths (`./…`) for anything the page
loads, and in `page.goto`.

Store times as real instants (ms since epoch). Format and do day arithmetic with the helpers in
`src/tz.js`, which take an explicit zone, rather than `Date`'s local getters.

## Changing an importer

1. Add or extend a file in `fixtures/` with a small, **synthetic** example. Don't commit real
   attendee data or private feeds.
2. Add unit tests in `test/unit/` that cover the fields you rely on and the edge cases you fixed.
3. Update the import table in the README and [docs/importing.md](docs/importing.md) if the supported inputs change.

## Third-party code and assets

Don't re-license anything. If you add vendored code or generated assets, keep their original
notices and record source, version and license in [THIRD_PARTY.md](THIRD_PARTY.md) (and
[NOTICE](NOTICE) if attribution is required). Leave `vendor/qrcode.js` unmodified.

## Pull requests

- Keep each PR to one topic. Include tests for behavior changes.
- `npm test` and `npm run test:e2e` must pass. CI runs both.
- Describe any user-visible change and include a screenshot for UI changes.
- Changes to `localStorage` keys need a migration path for existing users (see `src/stars.js`).

## License

By contributing, you agree that your contributions are licensed under the
[Apache License 2.0](LICENSE), as described in section 5 of the license.

Everyone taking part is expected to follow the [Code of Conduct](CODE_OF_CONDUCT.md). Report
conduct concerns privately to <nelfordbc+nowlineconduct@gmail.com>. Report security issues privately
as described in [SECURITY.md](SECURITY.md), not in public issues.
