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

Only the latest `main` is supported. There are no released versions yet.

## Scope

In scope:

- The web app (`index.html`, `src/`), for example script injection through an imported schedule,
  an `.ics` file, or a `#here-…` link.
- The optional feed relay (`nowline-feed-relay.js`), for example ways to make it fetch hosts outside
  its allow-list. The broad `pretalx.*` rule is a known, documented looseness; see the README.

Out of scope:

- Problems in third-party schedule platforms (Sched, Sessionize, pretalx, …). Report those to the platform.
- Anything that needs an already-compromised device or browser.
