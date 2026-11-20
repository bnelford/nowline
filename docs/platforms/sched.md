# Sched

NowLine reads Sched's whole-event iCal feed. The public relay allows every `*.sched.com` host, so
there's nothing to deploy.

## The export URL

```
https://<event>.sched.com/all.ics
```

`<event>` is the event's Sched subdomain, the part before `.sched.com` in the schedule's address
(for example `https://kccncna2026.sched.com/all.ics`). The URL must be `https`.

To find it in Sched, open the event's Sched site **while logged out** and look for *Mobile App +
iCal*. Use the whole-event feed, not a personal "my schedule" feed, which only holds one person's
picks.

> Unverified: the exact label and location of the iCal link in Sched's UI, and whether every Sched
> plan exposes the whole-event feed. We know the `all.ics` path from the app's own example and the
> relay's tests, not from Sched's documentation.

If the event's Sched site is on a custom domain rather than `*.sched.com`, the public relay will
refuse it. Deploy your own relay and add that host by exact name (see [docs/relay.md](../relay.md)).

## What NowLine reads

- `LOCATION` becomes the room. Hints like "(Level 2)" group rooms into floors.
- Titles like `Talk - Speaker, Company` are split into a title and speakers.
- `TZID`, `X-WR-TIMEZONE`, `DURATION` and folded lines are handled.

Sched's feed has no buildings or walk times, so NowLine uses defaults: 1 minute within a building
and 3 minutes between floors. To give real walk times and routes, add a venue overlay with
`&venue=<url>` (format in [docs/importing.md](../importing.md)).

## Time zones

Sched feeds normally carry their zone as `TZID` on each event and as `X-WR-TIMEZONE`, and NowLine
uses it. You don't need `&tz=`. If a feed has only floating times (no zone and no offset), set the
event's zone under **Time zone…** before making signs; share links and signs then carry it as
`&tz=<zone>`.

## How to test

1. Open NowLine, choose **Load schedule…**, paste the `all.ics` URL and choose **Fetch**. You should
   see "Looks good: N sessions in M rooms over D days." Check the counts against the Sched site.
2. **Load**, then check a few sessions you know: title, room, start time and speakers.
3. Choose **Share…**, open the link in a private window or on another phone, and confirm the same
   schedule loads.
4. Make one room sign, scan it with a phone that has never opened NowLine, and confirm it says
   you're in that room.

If the fetch fails, try the feed URL in a browser while logged out. A 403 with "Host not allowed"
comes from the relay (see above); anything else is coming from Sched.
