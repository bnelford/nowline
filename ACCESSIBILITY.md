# Accessibility

NowLine's target is [WCAG 2.2](https://www.w3.org/TR/WCAG22/) level AA, for both attendees and
organizers. It doesn't meet that target yet. This page says where it stands, so you can judge
whether it works for your event and tell us what's missing.

## Supported now

- **Native controls.** Toolbar buttons, the sheets (Load schedule, Time zone, Room signs, Share) and
  their form fields are standard HTML `button`, `input`, `select` and `label` elements, so they can
  be reached and used with a keyboard and are announced by screen readers by their visible text.
- **Page language** is declared (`lang="en"`), and the brand logos have text titles.
- **Zoom.** The page doesn't block pinch-zoom (the viewport allows scaling).
- **Times in your zone.** Times can be shown in the event's zone, your device's zone, or any zone you
  choose, with a short label so it's clear which one you're reading.

## Being added now

These are in progress and will be listed in [CHANGELOG.md](CHANGELOG.md) when they land:

- **Keyboard navigation** for the timeline and map: reaching and opening session blocks and rooms
  without a pointer, with a visible focus indicator.
- **Screen-reader labels** for icon-only buttons, session blocks (title, room, time, starred), the
  now-line and the map.
- **Reduced motion.** Honouring `prefers-reduced-motion` for the pulsing location marker, the
  animated walking route, sheet transitions and the tour spotlight.
- **Contrast.** Checking text and controls against AA contrast ratios in the dark theme, including
  dimmed text and track colours on session blocks.

## Known gaps

- **Session blocks and the map are pointer-only.** Session blocks on the timeline are `div`
  elements with click handlers, and the map is an SVG with pointer and wheel handlers. Neither can be
  focused or operated from a keyboard yet.
- **No ARIA labelling.** Icon-only buttons rely on `title` attributes, and the timeline, now-line and
  map have no accessible names or descriptions.
- **Motion** is not reduced for users who ask for it.
- **Colour carries meaning.** Building and track colours, and the red now-line, aren't always backed
  by text.
- **Faint text fails contrast.** On the `#0e1116` background, the dim text colour `#8a93a6` is about
  6.1:1 and passes, but the faint colour `#566074` is about 3.0:1, below the 4.5:1 AA minimum for
  normal text. Text on coloured session blocks hasn't been measured.
- **The tour** shows each step's narration as on-screen text alongside the voiceover, but it advances
  on its own timer, and that text isn't announced to screen readers.
- **Room signs** are generated as PNG images. The room name and wording are printed on the sign,
  but the image file itself has no text alternative.
- **No light theme** for people who need one.

> TODO (maintainer): re-check this list against the app once the keyboard, screen-reader,
> reduced-motion and contrast work merges, and record which screen readers and browsers it was
> tested with.

## Reporting a problem

Open an issue on [GitHub](https://github.com/bnelford/nowline/issues/new/choose) using the bug report
template, and put "Accessibility" in the title. It helps to include:

- what you were trying to do, and what happened;
- your device, browser, and any assistive technology (screen reader, switch access, magnification)
  with versions;
- the schedule you were using, if it's public (a link to the feed is enough).

> TODO (maintainer): add a private contact for people who'd rather not report in public, and say how
> quickly you aim to respond.
