# Privacy

RoomHop has no accounts, no backend database, and no analytics. Your stars, blocks and location stay
on your device. The only things that leave it are the requests needed to load the page and the
schedule, described below.

## What's stored on your device

RoomHop keeps its data in the browser's `localStorage`, under keys that start with `roomhop:`. Nothing
here is sent anywhere.

| Key | What it holds |
| --- | --- |
| `roomhop:data` | The loaded schedule (sessions, rooms, buildings), and the feed and relay URLs it came from |
| `roomhop:stars:<event>` | The sessions you starred for that event |
| `roomhop:blocks:<event>` | Your own agenda blocks and imported calendar items for that event |
| `roomhop:here:<event>` | The room you last said you were in ("I'm here", set by you or by scanning a sign) |
| `roomhop:tz:<event>` | Time-zone settings for that event |
| `roomhop:hidden`, `roomhop:radius`, `roomhop:ppm` | View settings: hidden rooms, the **Show** (nearby rooms) filter, timeline zoom |
| `roomhop:impUrl`, `roomhop:impRelay` | The last feed link and relay URL you typed under **Load schedule…** |
| `roomhop:signBase`, `roomhop:signText` | Room-sign settings (page link and sign wording) |
| `roomhop:seenTour`, `roomhop:tourMuted` | Whether you've seen the tour, and whether its voiceover is muted |

To clear it, clear the site's data in your browser settings. Loading a different schedule replaces
`roomhop:data`; per-event keys stay until you clear them.

> TODO (maintainer): when the offline/installable version lands, add what the service worker keeps in
> Cache Storage (app files, and whether the last fetched feed is cached), and any keys added by
> automatic refresh, attendee mode or `roomhop.config.json`.

## No analytics or tracking

There are no analytics scripts, tracking pixels, third-party fonts or third-party scripts in the app.
You can check this yourself: `index.html` loads only `vendor/qrcode.js` and `src/app.js`, and the only
network request the app code makes is the schedule fetch (`fetchFeed` in `src/app.js`). A search of
`index.html` and `src/` for common analytics and error-reporting services finds nothing.

## What leaves your device

**The page itself.** Loading RoomHop requests its files from wherever it's hosted. For the public
copy that's GitHub Pages. A shared link or room sign carries the feed, relay and time zone in its
query string (`?feed=…&relay=…&tz=…`), so the page host receives those along with your IP address and
browser details, as for any web page. The room part of a sign link (`#here-<room>`) is a fragment and
is not sent to the server.

**The schedule fetch.** Loading a schedule from a link goes through the feed relay, because schedule
sites don't send CORS headers. The relay receives the feed URL and your IP address. It fetches the
feed on your behalf, so the schedule platform sees a request from the relay, not from your phone. The
relay adds no logging of its own (see [`roomhop-relay.js`](roomhop-relay.js)) and caches
each feed response at the edge for 5 minutes. Nothing about you, your stars or your agenda is sent.

Choosing a file or pasting text makes no network request at all.

## Platform logs

The public copy runs on two platforms, and each keeps its own standard request logs:

- **GitHub Pages** hosts the app at `bnelford.github.io/roomhop`.
- **Cloudflare Workers** runs the public relay at `nowline-relay.nelfordbc.workers.dev`.

Those are the platforms' logs. What they record, how long they keep it and who can see it is set by
GitHub's and Cloudflare's own policies, not by RoomHop. The maintainer doesn't add logging or
analytics on top of them.

> TODO (maintainer): link GitHub's and Cloudflare's current privacy statements here, and state what
> you can see in the Cloudflare dashboard for the public relay.

## Avoiding the public relay

If you don't want feed URLs and attendee IP addresses to pass through the public relay, run your own:

1. Deploy [`roomhop-relay.js`](roomhop-relay.js) to your own Cloudflare account with
   `npx wrangler deploy`, as described in [docs/relay.md](docs/relay.md). Set `ALLOWED_HOSTS` in
   `wrangler.toml` to the hosts you need.
2. Paste your relay URL into the **Relay URL** field under **Load schedule…** before you load the feed.
   Share links and room signs carry that relay, so attendees' phones use it too.
3. To also keep the page off GitHub Pages, host the static files yourself; see
   [docs/self-host.md](docs/self-host.md).

Or skip the relay entirely: download the export and load it as a file. No feed request is made, but
share links and signs made that way can't load the schedule on a phone that doesn't already have it
(see [docs/room-signs.md](docs/room-signs.md)).

## Questions

Open an issue on [GitHub](https://github.com/bnelford/roomhop/issues). Report security problems
privately as described in [SECURITY.md](SECURITY.md).
