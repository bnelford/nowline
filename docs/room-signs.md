# Room signs

**Room signs…** generates one printable PNG sign per room, each with a QR code that links to
`<page link>#here-<room-slug>`. Opening that link sets "I'm here" to the room and shows what's on
there, plus directions and a leave-by time for your next stop.

If the schedule was loaded **from a link** (Load schedule… → From a link), the QR link also carries
that feed, plus the relay used to fetch it: `<page link>?feed=<feed URL>&relay=<relay URL>#here-<room-slug>`.
If the feed has no time zone of its own and you set one under **Time zone…**, the link also carries
`&tz=<zone>`, so a scanning phone reads the feed's times in the same zone.
A phone that has never opened NowLine fetches the schedule from it on the first scan, then jumps to
the room. If a different imported schedule is already stored on the phone, NowLine asks before
replacing it. The `feed`/`relay`/`tz` parameters are removed from the address bar once handled.

The **Page link** defaults to the page you have open, without its `#fragment`. Before printing,
make sure it's the public URL attendees will be able to open. If you host the page somewhere
other than where you're generating signs, set **Page link** to that URL.

If the schedule was loaded from a **file or pasted text**, there's no link to carry, so the QR link
only identifies the room. The sign generator warns about this: a scan only works on a phone that
already has the same schedule loaded, and shows the demo otherwise. Load the schedule from its feed
link and regenerate the signs to fix that.

The same link without the room is what **Share…** gives you: it loads the schedule but doesn't set "I'm here". Feed links without a room ask "Load this shared schedule?" instead of mentioning a sign.

Keep the feed URL stable for the event: if it changes, printed signs keep pointing at the old one.
