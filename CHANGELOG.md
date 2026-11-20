# Changelog

All notable changes to RoomHop are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses
[Semantic Versioning](https://semver.org/spec/v2.0.0.html). Room-sign link parameters are covered by
the [stable links promise](docs/room-signs.md#stable-links).

## [Unreleased]

### Changed

- Renamed from NowLine to RoomHop. The repo is now `bnelford/roomhop` and the app is at
  `https://bnelford.github.io/roomhop/`. On-device data starts fresh (storage keys are now `roomhop:*`),
  and a self-hosted config is now `roomhop.config.json`.

### Added

- Automatic feed refresh while the app is open, with an "Updated HH:MM" status and a notice when a
  session moves to a different room.
- Offline support: RoomHop is an installable progressive web app, and keeps working without a
  connection once loaded.
- `&venue=<url>` loads a `venue.json` overlay with buildings, walk times and routes on top of any
  schedule export. See [docs/importing.md](docs/importing.md).
- `roomhop.config.json` for self-hosted copies, including branding. See [docs/self-host.md](docs/self-host.md).
- `?embed=1` for embedding RoomHop in an event's website.
- **Print all** prints every room's sign at once.
- Attendee mode: organizer tools are hidden unless the page is opened with `?admin`.
- README shows the map's walking route and a room sign being scanned ("Lost? Scan here") next to
  the timeline demo. (614d3a0)
- Docs: [PRIVACY.md](PRIVACY.md), [ACCESSIBILITY.md](ACCESSIBILITY.md), platform guides for
  [Sched](docs/platforms/sched.md), [pretalx](docs/platforms/pretalx.md) and
  [Sessionize](docs/platforms/sessionize.md), an [organizer one-pager](organizers.html) and a
  [press kit](docs/press.md).

### Changed

- Short room-sign wording that fits on two lines (like "Lost? Scan here") is set large and bold so
  it can be read from across a hallway. Longer wording is unchanged. (614d3a0)
- Room-sign link parameter names are now a documented compatibility promise.

### Fixed

- CONTRIBUTING.md no longer lists Indico as a supported source; there is no Indico importer.

## [0.1.0] - 2026-11-17

First open-source release.

### Added

- Live timeline: rooms as swim lanes, a now-line, and a now/next strip.
- Importers for Sched and other whole-event `.ics` feeds, pretalx/frab `schedule.json`, Sessionize
  "All data" and "Schedule grid" JSON, and RoomHop's simple JSON with buildings, walk times and routes.
- Personal agenda: stars, your own blocks, calendar import, and overlap and walk-time checks.
- Time-zone handling per event, with a choice of display zone.
- QR room signs that set "I'm here" and can carry the feed, relay and time zone.
- **Share…** gives a link that opens the same schedule on any phone. (43b33da)
- Open Graph and Twitter link-preview tags and a preview image. (43b33da)
- Optional Cloudflare Worker feed relay with a host allow-list. Fetching by link uses the public
  relay when the Relay URL field is empty. (8449f55)
- Guided tour with voiceover, tests, CI and GitHub Pages deployment.

### Removed

- The prototype sign URL format and the global-stars migration, which no released version wrote.
  (43b33da)

### Security

- Route text from imported schedules is escaped, and imported buildings are reduced to a text name,
  a hex colour and numeric walk times, so a crafted feed link or QR code can't inject script.
  (9ae3d4f)

[Unreleased]: https://github.com/bnelford/roomhop/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/bnelford/roomhop/releases/tag/v0.1.0
