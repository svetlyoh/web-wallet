# Visual QA evidence

The screenshots were captured against OpenClaw's deterministic mocked Gateway.

- `normal-1280x720.png`: feature off, original sidebar and typography.
- `streaming-1280x720.png`: drawer layout, full-width transcript, larger text.
- `streaming-composer-collapsed-1280x720.png`: composer reduced to one restore control.
- `streaming-short-800x400.png`: short OBS-style window with composer minimized.
- `streaming-phone-390x844.png`: phone viewport with visible exit and composer controls.

The browser verification also reloads the page to prove persistence, exits the mode to prove normal-layout restoration, checks an 18 px minimum font, line-height of at least 1.5, no justified text, no horizontal overflow, drawer closure after enabling, and composer minimize/restore.
