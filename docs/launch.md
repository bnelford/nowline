# Launch checklist

For the maintainer. Work top to bottom; don't start on the channels until the prerequisites are done.

> Channel conventions below (posting rules, timing, what each community expects) are **unverified**.
> They're working assumptions. Read each community's current rules before posting.

## Prerequisites

- [ ] **Decide the name.** Check that "NowLine" is clear to use for this kind of product: search
      app stores, trademark databases and existing domains, and decide whether to keep it before
      anything is posted publicly. Renaming after launch breaks links and printed signs.
      TODO (maintainer): record the decision and what was checked.
- [ ] **Move the relay to your own domain.** The public relay is
      `nowline-relay.nelfordbc.workers.dev`. Share links and signs embed the relay URL, so whatever
      relay is the default at launch is the one printed signs depend on for good. Put it on a domain
      you control (for example `relay.<your-domain>`), make that the default, and keep the
      `workers.dev` one running so links already shared keep working.
      TODO (maintainer): choose the domain.
- [ ] **One design-partner event.** Run NowLine at one real event with an organizer who has agreed
      to it, before posting anywhere public. Get their permission before naming them, and only quote
      what they actually said.
      TODO (maintainer): the event, the date, and what you learned.
- [ ] The parallel features are merged and released: automatic refresh, offline/installable app,
      `&venue=`, `nowline.config.json`, `?embed=1`, **Print all**, attendee mode. Tag a release and
      move them from *Unreleased* in [CHANGELOG.md](../CHANGELOG.md).
- [ ] `organizers.html` is served by the deployed site. `scripts/site.js` currently copies only
      `index.html`, `src`, `vendor` and `assets`, so it needs `organizers.html` and the GIFs in
      `docs/` added (owned by whoever maintains the scripts).
- [ ] [docs/self-host.md](self-host.md) exists and has been followed once from a clean fork.
- [ ] Demo works on a phone on mobile data, and the tour plays.
- [ ] [PRIVACY.md](../PRIVACY.md) and [ACCESSIBILITY.md](../ACCESSIBILITY.md) TODOs are resolved.
- [ ] Issue templates and labels are ready for import problems and accessibility reports.

## Channels, in order

Each step should run on what you learned from the one before. Don't post everywhere on one day.

1. **Design partners.** The event from the prerequisites, then two or three more organizers you
   reach directly (see the email below). Aim for real use, not announcements.
2. **pretalx and Sessionize communities.** Organizers using those tools are the most direct fit.
   Look for their community forums, chats or issue trackers, and check whether third-party tool
   announcements are welcome before posting. (Unverified: which channels exist and their rules.)
   Sched: check whether there's a comparable community. (Unverified.)
3. **Mastodon and Bluesky.** A short post with `docs/demo.gif` and the demo link. Event-tech and
   open-source hashtags. (Unverified: which hashtags are active.)
4. **Show HN.** Draft below. (Unverified conventions: a Show HN should link to something people can
   try right away; the submitter is expected to stay in the thread and answer questions; asking
   others to upvote is against the rules.)
5. **Reddit.** Subreddits for event planning, self-hosting and open source. Read each subreddit's
   rules on self-promotion first. (Unverified: which subreddits allow it.)
6. **Newsletters.** Open-source, web-platform and event-tech newsletters that accept submissions.
   (Unverified: which ones accept submissions, and how.)

## Show HN

**Title**

```
Show HN: NowLine – a live timeline for any conference schedule, with walk times
```

**Link:** <https://bnelford.github.io/nowline/>

**First comment** (post it right after submitting):

```
Hi HN, I built NowLine because conference schedules are easy to read in advance and hard to use
on the day: you're in a hallway, the grid is six rooms wide, and you don't know whether you can
get from this talk to the next one before it starts.

NowLine reads the schedule an event already publishes (Sched's iCal feed, pretalx's
schedule.json, Sessionize's API JSON, or any whole-event .ics) and shows it as a live timeline:
every room is a lane, a red line is "now", and the sessions you star are checked against the walk
between rooms ("5 min between these, but it's an 8 min walk"). Organizers can print a QR sign per
room; scanning it tells the phone where it is and gives directions to the next session.

The demo generates a fake conference around the current time, so it's always mid-event. Press
Tour for a 90-second walkthrough.

Some details:
- Static files, plain ES modules, no build step and no framework.
- No accounts and no analytics; stars and agenda stay in localStorage.
- Schedule sites don't send CORS headers, so feeds go through a small Cloudflare Worker relay
  with a host allow-list. You can deploy your own.
- Apache-2.0.

TODO (maintainer): one or two sentences on the design-partner event: what worked, what didn't.

What I'd most like to hear: whether your conference's export loads, and what breaks when it doesn't.
```

## Cold email to organizers

Send from your own address, one at a time, to organizers whose schedule is already public on Sched,
pretalx or Sessionize. Load their schedule into NowLine first and include the link.

```
Subject: Your <EVENT> schedule as a live timeline

Hi <NAME>,

I maintain NowLine, a free, open-source web app that turns a published conference schedule into
a live timeline on attendees' phones: what's on now, what's next, and whether they'll make the
walk to their next session.

I loaded <EVENT>'s public schedule from <PLATFORM> to show you what it looks like:
<SHARE LINK>

Nothing to install, and no accounts. It reads the export you already publish, so your schedule in
<PLATFORM> stays the source of truth. You'd share one link with attendees and, if you want, print
a QR sign for each room so a scan tells a phone where it is.

A one-page overview is here: <ORGANIZERS PAGE LINK>

If you'd be up for trying it at <EVENT>, I'll help set it up and fix anything that doesn't work
with your schedule. If not, no reply needed.

Thanks,
<YOUR NAME>
<PROJECT LINK>
```

Before sending: check the share link opens on a phone that has never loaded NowLine, check the time
zone is right (especially for Sessionize, see [platforms/sessionize.md](platforms/sessionize.md)),
and send at most one follow-up to someone who doesn't reply.
