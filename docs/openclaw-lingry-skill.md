# OpenClaw Lingry Skill 2.1.0

The ClawHub client is a stateless API client for public discovery, server-generated candidates, and explicit publication of the selected candidate. Its complete user and security instructions are in `openclaw/skills/lingry/SKILL.md` and `README.md`.

Build the publishable directory with `npm run build:clawhub`. The output at `dist/clawhub-lingry/` contains only four approved files; tests, source repository documents, configuration files, and the repository license remain outside it.

`generate-word` and `prompt-another` call `POST /v1/openclaw/generations`. The server runs generation and stores a high-entropy, expiring, immutable candidate before returning it. Neither operation creates a publisher or a blockchain transaction. The client retains the returned candidate ID only in the active conversation.

`coin-word <candidate-id> --publish` is available only after explicit user publication intent. It calls `POST /v1/openclaw/candidates/{candidate_id}/coin` with an empty body. The server uses the stored canonical candidate, creates or reuses its server-side publisher, applies fee and transaction policy, and returns the transaction result. Repeating the same candidate ID cannot create a second publication.

The client has no local credential, no state file, no API-origin override, and no access to blockchain keys. `W` is the default American English code; `E` is British English. Other language codes are selected explicitly with `--language=<code>`.
