# Sessionize

RoomHop reads Sessionize's API JSON, in either the "All data" or the "Schedule grid" shape. The
public relay allows `sessionize.com` and its subdomains, so there's nothing to deploy.

## The export URL

```
https://sessionize.com/api/v2/<endpoint-id>/view/All
```

`<endpoint-id>` is the ID Sessionize gives the API endpoint you create for the event. The `All`
view is the "All data" JSON (sessions, speakers and rooms) and is the one to use.

RoomHop also reads the "Schedule grid" JSON (an array of days, each with rooms and their sessions).

> Unverified: the grid view's path (we believe it's `…/view/GridSmart`), and where in Sessionize's
> UI you create an API endpoint and copy its ID. The `…/view/All` shape is the one the relay's tests
> use; the JSON shapes are the ones in [`fixtures/`](../../fixtures/).

Only scheduled sessions are imported. Sessions without a start time are skipped.

## Time zones

**This is the part that goes wrong.** Sessionize timestamps have no offset or zone
(`"startsAt": "2026-11-12T09:00:00"`), and the export usually doesn't say what zone the event is in.
RoomHop uses a top-level `timeZone` or `timezone` field if the JSON has one. Otherwise it reads the
times in the device's zone, which is wrong for anyone not in the event's zone, and for every remote
attendee.

Fix it before you share anything:

1. Load the feed, then open **Time zone…** and set the event's zone (for example
   `Europe/Amsterdam`).
2. Make the share link and room signs **after** that. They then carry `&tz=<zone>`, and every phone
   that opens them reads the times in that zone.

You can also add `&tz=<IANA zone>` to a link that already has `?feed=` by hand. `tz` is only used
when the feed has no zone of its own; it doesn't override a zone the feed declares.

## What RoomHop reads

Session titles, descriptions, start and end, room, and speaker names. Sessionize categories aren't
used as tracks. The export has no buildings or walk times, so RoomHop assumes 1 minute between rooms;
add a venue overlay with `&venue=<url>` for real walk times (format in
[docs/importing.md](../importing.md)).

## How to test

1. Open RoomHop, choose **⋯ More → Load schedule…**, paste the `…/view/All` URL and choose **Fetch**. You
   should see "Looks good: N sessions in M rooms over D days."
2. **Load**, set the zone under **Time zone…**, and check that a session you know starts at the right
   local time.
3. Choose **Share…** and check the link contains `tz=`. Open it in a private window, or on a phone
   with its clock set to a different zone, and confirm the times still match the event.
4. Make one room sign and scan it with a phone that has never opened RoomHop.
