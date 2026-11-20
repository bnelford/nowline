# pretalx

NowLine reads pretalx's (and frab's) `schedule.json` export. The public relay allows events hosted
on `pretalx.com`. A self-hosted pretalx needs its own relay, or its host added to an allow-list.

## The export URL

```
https://pretalx.com/<event-slug>/schedule/export/schedule.json
```

For a self-hosted pretalx, use the same path on your own host:

```
https://pretalx.example.org/<event-slug>/schedule/export/schedule.json
```

`<event-slug>` is the event's short name in its pretalx URLs. The schedule has to be published for
the export to have sessions in it.

> Unverified: where pretalx's UI links to this export, and whether an unpublished or hidden schedule
> returns an error or an empty export. The path is the one NowLine's docs and relay tests use.

## Self-hosted pretalx

The public relay only fetches from the exact host `pretalx.com`. A self-hosted instance (for example
`pretalx.fosdem.org`) is refused with "Host not allowed". You have two options:

1. **Run your own relay** and add your host by exact name in `wrangler.toml`:

   ```toml
   ALLOWED_HOSTS = "sched.com .sched.com sessionize.com .sessionize.com pretalx.com pretalx.example.org"
   ```

   Then `npx wrangler deploy`, and paste your relay URL into the **Relay URL** field under
   **Load schedule…**. Share links and signs carry that relay. See [docs/relay.md](../relay.md).
2. **Ask for the host to be added to the public relay's allow-list.** Open an issue with the host
   name; the maintainer decides what the public relay allows.

You can also download `schedule.json` and load it as a file, but then share links and signs can't
load the schedule on a phone that doesn't already have it (see [docs/room-signs.md](../room-signs.md)).

Don't add a leading-dot entry (`.example.org`) unless every subdomain of that domain is yours.

## Time zones

pretalx exports include `time_zone_name` and each session's `date` carries an offset, so times are
right without any setting. You don't need `&tz=`.

## What NowLine reads

The conference title, rooms, `date` + `duration`, `track` (or `type` if there's no track), persons
and abstract. pretalx has no buildings or walk times, so NowLine assumes 1 minute between rooms; add
a venue overlay with `&venue=<url>` for real walk times (format in [docs/importing.md](../importing.md)).

## How to test

1. Open the export URL in a browser and check it returns JSON with your sessions.
2. Open NowLine, choose **Load schedule…**, paste the URL and choose **Fetch**. You should see
   "Looks good: N sessions in M rooms over D days." A 403 "Host not allowed" means the relay doesn't
   allow your host (see above).
3. **Load**, check a few sessions, then choose **Share…** and open the link in a private window.
4. Make one room sign and scan it with a phone that has never opened NowLine.
