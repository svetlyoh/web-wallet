# Visual QA evidence

The screenshots were captured against OpenClaw's deterministic mocked Gateway.

- `normal-1280x720.png`: feature off, original sidebar and typography.
- `streaming-1280x720.png`: full-width transcript, 24 px model text, 24 px composer text, larger commands, and a visible session-header accessory probe.
- `streaming-code-1280x720.png`: receipt-style fenced output at 20 px with 1.4 line spacing and distinct, non-overlapping rows.
- `streaming-short-800x400.png`: short OBS-style window with the composer and accessory host still usable.
- `streaming-phone-390x844.png`: phone viewport with a visible exit control, composer, and accessory host.

The browser verification types into the real OpenClaw textarea before, during, and after Streaming Mode, exits the mode to prove normal-layout restoration, and verifies the native `session-header` plugin accessory remains visible at every tested size. It also checks computed sizes for model prose, tables, fenced code, composer text, and top and bottom commands, plus a minimum 1.4 line-height ratio for compact block-art output. The probe marks the exact host used by Gear Engine; Gear Engine's own suite separately verifies its native registration and responsive SVG sizing.
