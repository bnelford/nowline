# Feed relay

Sched, Sessionize and pretalx don't send CORS headers, so a browser can't fetch their feeds
directly. [`nowline-feed-relay.js`](../nowline-feed-relay.js) is a small Cloudflare Worker that does
that one job:

- Hosts are allow-listed by exact name, set by `ALLOWED_HOSTS` in [`wrangler.toml`](../wrangler.toml).
  The default is `sched.com .sched.com sessionize.com .sessionize.com pretalx.com`. An entry with a
  leading dot matches any subdomain (`.sched.com` covers `kccncna2026.sched.com`). Only use those for
  domains whose subdomains are all run by the platform. Add self-hosted pretalx instances by exact
  name, for example `ALLOWED_HOSTS = "… pretalx.fosdem.org"`.
- Targets must be `https` on the default port, with no username or password in the URL. IP
  literals, `localhost` and local names (`*.local`, `*.internal`, single-label hosts) are always
  refused, even if listed. Redirects are followed manually (at most 3) and each hop is re-checked.
- Only `GET`/`OPTIONS` requests are accepted. Upstream fetches time out after 10 seconds (504) and
  responses over 10 MB are refused (502).
- Responses are cached at the edge for 5 minutes and sent with `Access-Control-Allow-Origin: *`.

## Deploy

```sh
npx wrangler login
npx wrangler deploy        # uses wrangler.toml → worker "nowline-relay"
```

Then paste `https://nowline-relay.<your-subdomain>.workers.dev/?url=` into the **Relay URL** field
under **Load schedule…**.

> The relay checks hostnames, not resolved IP addresses. An allowed host's DNS is trusted as-is.
