# Visual QA evidence

The screenshots were captured against OpenClaw's deterministic mocked Gateway.

- `normal-1280x720.png`: feature off, original sidebar and typography.
- `streaming-1280x720.png`: full-width transcript, larger text, editable standard composer, and a visible session-header accessory probe.
- `streaming-short-800x400.png`: short OBS-style window with the composer and accessory host still usable.
- `streaming-phone-390x844.png`: phone viewport with a visible exit control, composer, and accessory host.

The browser verification types into the real OpenClaw textarea before, during, and after Streaming Mode, exits the mode to prove normal-layout restoration, and verifies the native `session-header` plugin accessory remains visible at every tested size. The probe marks the exact host used by Gear Engine; Gear Engine's own suite separately verifies its native registration and responsive SVG sizing.
