# Accessibility

RoomHop's target is [WCAG 2.2](https://www.w3.org/TR/WCAG22/) level AA, for both attendees and
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

- **Keyboard.** Now/next cards, session blocks, room chips and map rooms can be focused and opened
  with Enter or Space, with a visible focus ring.
- **Dialogs.** Sheets are `role="dialog"` with `aria-modal`; focus moves in on open, Tab stays
  inside, Escape closes, and focus returns to the control that opened it.
- **Labels.** Selects have real labels, icon-only buttons have `aria-label`s, and the now/next strip is
  a polite live region that announces only when its content changes.
- **Reduced motion.** With `prefers-reduced-motion`, the pulsing marker, animated route, tour
  effects, transitions and smooth scrolling are off.
- **Contrast.** Faint text is `#8a93a6` (about 6.1:1 on the background). Past and out-of-range
  sessions are dimmed to 70% opacity, which keeps their text at 4.6:1 or more on every track colour.
- **Tap targets.** Buttons, selects, chips and map rows are at least 44px tall.

## Known gaps

- **Colour carries meaning.** Building and track colours, and the red now-line, aren't always backed
  by text.
- **The timeline is a visual grid.** It's operable by keyboard, but there's no list view that reads
  sessions in time order; a screen-reader user hears blocks lane by lane.
- **The tour** advances on its own timer, and its narration text isn't announced to screen readers.
- **Room signs** are generated as PNG images. The room name and wording are printed on the sign,
  but the image file itself has no text alternative.
- **No light theme** for people who need one.

> TODO (maintainer): record which screen readers and browsers this was tested with.


## Reporting a problem

Open an issue on [GitHub](https://github.com/bnelford/roomhop/issues/new/choose) using the bug report
template, and put "Accessibility" in the title. It helps to include:

- what you were trying to do, and what happened;
- your device, browser, and any assistive technology (screen reader, switch access, magnification)
  with versions;
- the schedule you were using, if it's public (a link to the feed is enough).

> TODO (maintainer): add a private contact for people who'd rather not report in public, and say how
> quickly you aim to respond.
