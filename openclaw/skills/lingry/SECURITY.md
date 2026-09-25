# Security

The OpenClaw client is a stateless API client. It stores no local authentication credential, wallet secret, or candidate file. Its only network destination is `https://lingry.net`.

Candidate IDs use `^cand_[A-Za-z0-9_-]{16,128}$`. The client validates the ID immediately upon generation and again before publication. Its action response contains structured intents, not executable commands. A coin request has an empty JSON body and is available only through the explicit `--publish` command path.

The backend generates and stores canonical candidates. The candidate ID is a high-entropy, expiring, one-candidate publication capability. The backend publisher is created or reused only when publication is requested. Its blockchain key remains encrypted server-side. The server rejects arbitrary outputs and payloads, fixes change to the publisher, caps fees, and records operations for idempotency.

Do not paste human or server wallet secrets into OpenClaw. Report a security issue privately to the Lingry maintainers.
