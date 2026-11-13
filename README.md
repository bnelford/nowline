# NowLine

A live conference timeline: a single-page web app (`index.html`) that shows what's happening now and next at a conference, pulling public schedule feeds (Sched `.ics`, Sessionize JSON, pretalx JSON).

## Files
- `index.html`: the whole app (HTML, CSS, and JavaScript in one file). Open it in a browser, or host it on any static host.
- `nowline-feed-relay.js`: a small Cloudflare Worker that relays allow-listed schedule feeds (sched.com, sessionize.com, pretalx.*) with CORS headers, so the browser can read them. Edge-cached for 5 minutes.

## Feed relay
```
npx wrangler deploy nowline-feed-relay.js --name nowline-relay --compatibility-date 2026-11-01
```
Then paste `https://nowline-relay.<you>.workers.dev/?url=` into NowLine's "Relay URL" field.

Originally built in a Claude.ai chat (Nov 2026).
