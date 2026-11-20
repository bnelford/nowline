# Self-hosting NowLine for your event

## Deploy your own in 5 minutes

1. **Fork** this repo on GitHub.
2. **Enable Pages.** In your fork, open *Settings → Pages* and set *Source* to **GitHub Actions**. The
   [Pages workflow](../.github/workflows/pages.yml) runs the tests and publishes the site to
   `https://<you>.github.io/<repo>/` on every push to `main`.
3. **Edit the config.** Copy [`nowline.config.example.json`](../nowline.config.example.json) to
   `nowline.config.json` in the repo root, set your event's `name` and `feed`, and commit. If you have a
   [venue file](importing.md#venue-file-venuejson), commit it as `venue.json` next to it and set
   `"venue": "venue.json"`. Both files are published with the site when present (`scripts/site.js`).
4. **Print signs.** Open `https://<you>.github.io/<repo>/?admin`, then **⋯ More → Room signs… → Print all**. One sign per
   page, each with a QR code for its room.

Attendees who open your site get your schedule straight away: no demo, no tour, and no organizer controls.

## `nowline.config.json`

Optional. It sits next to `index.html`. If it's missing (404), invalid, or takes longer than 1.5 seconds,
NowLine uses its defaults. It's requested in parallel with the app's own scripts, so it doesn't hold up
loading.

| Field | Type | What it does |
| --- | --- | --- |
| `name` | text, up to 80 characters | Page title, and the footer on room signs (`<name> · here-<room>` instead of `NowLine · here-<room>`) |
| `logo` | URL | Shown before the NowLine name in the header |
| `colors` | `{ "accent", "now", "bg" }` | Override the `--accent`, `--now` and `--bg` colors. `#hex` only |
| `feed` | URL | Schedule loaded instead of the demo when the page isn't opened with a `?feed=` link |
| `venue` | URL | [Venue file](importing.md#venue-file-venuejson) applied to `feed` |
| `relay` | URL | [Relay](relay.md) used when `feed` or `venue` can't be fetched directly, and the default in **Load schedule…**. Must be `https` and end in `=` or `/` |
| `tour` | `true`/`false` | `false` hides the **▶ Tour** button and never offers the tour |
| `organizerTools` | `true`/`false` | `true` always shows the organizer controls (see below) |

URLs may be relative to the page (`"venue.json"`). Otherwise they must be `https`. Anything that doesn't
match the table is ignored.

A configured feed replaces the demo, and replaces an older configured feed stored on a phone, but never
a schedule the person loaded themselves. Feeds and venue files are fetched directly first; the relay is
only used if that fails. A feed on the same site as NowLine, or on a host that sends CORS headers, never
touches the relay.

The tests never read your config: they serve a missing `nowline.config.json` unless a test provides one.

## Attendee mode

When NowLine is opened from a share link or a room sign, or a config sets `feed`, it starts in attendee
mode: no tour, and the organizer-only controls are hidden (**Load schedule…**, **Room signs…**, **▶ 60×**,
**−30m** / **+30m**). Add `?admin` to the address, or set `"organizerTools": true`, to show them.

These controls carry the `org-only` class in `index.html`; attendee mode is `body.attendee`.

## Embedding

Add `?embed=1` to show NowLine inside another page. The header and the organizer controls are hidden,
the tour never starts, and nothing is written to the browser's storage. Pass the schedule in the same
link, for example the one from **Share…**:

```html
<iframe src="https://<you>.github.io/<repo>/?embed=1&feed=https%3A%2F%2Fmyconf2026.sched.com%2Fall.ics"
        title="Conference schedule" style="width:100%;height:640px;border:0" loading="lazy"></iframe>
```

Without `feed=`, an embed shows the configured feed, or the demo. Because nothing is stored, the feed is
kept in the embed's address and fetched again on each load.
