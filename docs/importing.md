# Loading a schedule

Use **⋯ More → Load schedule…** to choose a file, paste text, or fetch a link (fetching needs the
[relay](relay.md)). Tick **Shift dates to today** to try out a past conference as if it
were live: whole days are moved so the first day is today in the event's time zone, keeping each
session's wall-clock time.

| Source | What to load | Notes |
| --- | --- | --- |
| **Sched** (KubeCon, Open Source Summit, …) | The whole-event iCal feed: on the event's Sched site, log out, then go to *Mobile App + iCal* | `LOCATION` becomes the room. "(Level 2)"-style hints group rooms into floors. Titles like `Talk - Speaker, Company` are split into title and speakers. `TZID`, `X-WR-TIMEZONE`, `DURATION` and folded lines are handled. |
| **Swapcard, Cvent**, other whole-event `.ics` | The event calendar export | Parsed the same way as Sched. Only Sched-style feeds are covered by tests. |
| **pretalx / frab** | `schedule.json` (`…/schedule/export/schedule.json`) | Uses the conference title, rooms, `date` + `duration`, `track` (or `type`), persons, and abstract. |
| **Sessionize** | API "All data" JSON | Unscheduled sessions are skipped. Times have no offset or zone, so set the event's zone under **Time zone…** (a top-level `timeZone`/`timezone` is used if present). |
| **Sessionize** | API "Schedule grid" JSON | Same caveat on time zones. |
| **Simple JSON** | See below | The only format that can describe buildings, walk times, room directions and routes. |

## Time zones

Every event has a time zone. NowLine takes it from the schedule when it can: `X-WR-TIMEZONE` or
the events' `TZID` in an `.ics`, `time_zone_name` in pretalx/frab, or `timezone` in simple JSON.
Otherwise it uses the device's zone, and you can set the event's zone under **Time zone…**. Times
written without an offset (Sessionize, floating `.ics` times) are read in the event's zone.

**Time zone…** also picks where times are *shown*: the event's zone (default), your device's zone,
or any IANA zone from a searchable list. The choice is saved per event. When times are shown in a
zone other than the device's, a short label such as `PST` or `UTC+1` appears next to the clock.
"Now", the live timeline, "starting soon", and conflict and walk-time checks all work on real
instants, so they don't change with the display zone. DST is handled through `Intl.DateTimeFormat`.


Everything is converted to one internal shape (documented at the top of [`src/schedule.js`](../src/schedule.js)).
Imported schedules without geometry get a schematic map layout and default walk times: 1 minute
within a building and 8 minutes between buildings (3 minutes between floors for `.ics` imports).

## Simple event JSON

```json
{
  "name": "My meetup",
  "buildings": {
    "hq":   { "name": "HQ",   "color": "#7cc4ff", "walk": { "hq": 1, "cafe": 4 } },
    "cafe": { "name": "Cafe", "color": "#ffb066", "walk": { "hq": 4, "cafe": 1 } }
  },
  "timezone": "America/Denver",
  "venues": [
    { "id": "Stage", "name": "Stage", "building": "hq", "where": "Ground floor, through the main doors" },
    { "id": "Cafe",  "name": "Cafe",  "building": "cafe" }
  ],
  "routes": {
    "hq>cafe": "Leave by the front doors and cross the plaza.",
    "cafe>hq": "Cross the plaza to the HQ front doors."
  },
  "sessions": [
    { "title": "Welcome", "start": "2026-11-12T09:00:00-07:00", "end": "2026-11-12T09:30:00-07:00",
      "venue": "Stage", "speakers": ["Host"], "track": "Keynote", "description": "…" },
    { "title": "Coffee chat", "start": "2026-11-12T09:15:00-07:00", "end": "2026-11-12T10:00:00-07:00", "venue": "Cafe" }
  ]
}
```

- `sessions` is required. Each session needs `title`, `start` and `end` (anything `Date` can parse).
  ISO times without an offset, like `2026-11-12T09:00`, are read in `timezone`.
- `timezone` (optional) is the event's IANA zone, for example `"Europe/Brussels"`. `venue` (or `room`) defaults to `"Main"`. `speakers` may be a list, or a
  single `speaker` string. `id` is optional.
- `buildings[*].walk` gives minutes from this building to each other building.
- `venues[*].where` is shown in directions and on signs. `routes` holds turn-by-turn text keyed by
  `"<from building id>><to building id>"`, for example `"hq>cafe"`.
- A bare array of sessions also works.
- This example (without `timezone`) is [`fixtures/simple.json`](../fixtures/simple.json), and is also
  available in the app as **Insert simple example**. [`fixtures/simple-tz.json`](../fixtures/simple-tz.json)
  shows `timezone` with offset-less times.

## Venue file (`venue.json`)

Sched, Sessionize and pretalx feeds only name rooms, so every room gets the placeholder walk times above.
A venue file adds the geography to any feed, without editing the feed: buildings, walk minutes between
them, which building each room is in, directions to each room, and turn-by-turn routes.

```json
{
  "buildings": {
    "hall":  { "name": "Main Hall", "color": "#7cc4ff", "walk": { "hall": 1, "annex": 6 } },
    "annex": { "name": "Annex",     "color": "#b48cff", "walk": { "annex": 1, "hall": 6 } }
  },
  "rooms": {
    "Main Stage": { "building": "hall",  "where": "Ground floor, through the center doors" },
    "1234":       { "building": "annex", "where": "1st floor, end of the hall" }
  },
  "routes": {
    "hall>annex": "Leave by the side doors and cross 2nd St.",
    "annex>hall": "Cross 2nd St to the Main Hall side doors."
  }
}
```

- `rooms` keys are matched against the feed's room **id** first (Sessionize room ids; pretalx room names; the `LOCATION` text in `.ics` feeds such as Sched),
  then its **name**, ignoring case. Rooms the file doesn't mention keep their placeholder building.
- `buildings[*].walk` is minutes from this building to the others. Pairs you leave out fall back to 1 minute
  within a building and 8 between. `routes` is keyed `"<from building id>><to building id>"`.
- Everything is checked on load: building ids up to 64 characters (no `>`), `#hex` colors only (others get
  a palette color), walk times must be numbers from 0 to 1440, and names, `where` and route text are plain
  text (capped at 80, 200 and 500 characters) shown escaped. Anything else is ignored.

To use it, put the file somewhere a browser can fetch it (GitHub Pages, next to NowLine, works without the
relay), then under **Load schedule… → From a link** fill in **Venue file URL** next to the feed link. The
venue is then carried in **Share…** links and room signs as `&venue=<url>`, so scanning phones get the same
walk times. A self-hosted copy can set it in `nowline.config.json` instead (see [self-host.md](self-host.md)).
If the venue file can't be loaded from a link, the schedule still loads with placeholder walk times.

Fetching tries the URL directly first and only uses the [relay](relay.md) if that fails, so a feed or venue
file on a host that sends CORS headers (or on the same site as NowLine) never goes through it.
