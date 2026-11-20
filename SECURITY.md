# Security policy

## Reporting a vulnerability

Please **don't** open a public issue for security problems.

Report them privately through GitHub's
[private vulnerability reporting](https://docs.github.com/en/code-security/security-advisories/guidance-on-reporting-and-writing-information-about-vulnerabilities/privately-reporting-a-security-vulnerability):
go to this repository's **Security** tab and choose **Report a vulnerability**.

Please include what you found, how to reproduce it (a minimal schedule file or URL if relevant),
and the impact you expect. You should get an acknowledgement within a week. We'll coordinate a fix
and a disclosure date with you, and credit you if you'd like.

## Supported versions

Only the latest release is supported. Fixes land on `main` and ship in the next release; they are
not backported to older ones.

Fixes won't rename or repurpose the room-sign link parameters listed under
[stable links](docs/room-signs.md#stable-links), so printed signs keep working after you update.

## Scope

In scope:

- The web app (`index.html`, `src/`), for example script injection through an imported schedule,
  an `.ics` file, or a `#here-…` link.
- The web app's handling of room-sign links, including the `feed=` and `relay=` parameters, which
  make the app fetch and load a schedule.
- The optional feed relay (`roomhop-relay.js`), for example ways to make it fetch hosts outside
  its `ALLOWED_HOSTS` list (including through redirects), reach IP literals or local names, or
  bypass its size cap or timeout. The relay checks hostnames, not resolved addresses. A deployment
  whose `ALLOWED_HOSTS` lists a domain the operator doesn't trust is a configuration problem, not a
  vulnerability.

Out of scope:

- Problems in third-party schedule platforms (Sched, Sessionize, pretalx, …). Report those to the platform.
- Anything that needs an already-compromised device or browser.
