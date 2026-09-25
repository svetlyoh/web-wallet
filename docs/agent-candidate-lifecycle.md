# Lingry Candidate Lifecycle

## Current OpenClaw flow

1. `POST /v1/openclaw/generations` runs the generator and stores the exact candidate server-side before returning its high-entropy ID and display fields.
2. OpenClaw displays the candidate and offers **Coin this term** and **Prompt for another**. It keeps the ID only in the active conversation. Generation and prompting for another do not publish.
3. Only after explicit user publication intent, `POST /v1/openclaw/candidates/{candidate_id}/coin` submits the ID with an empty body.
4. The server verifies the candidate is unaltered, unexpired, and eligible; creates or reuses a server-controlled publisher; constructs the canonical `S<language>|<word>|<part-of-speech>|<meaning>` record; signs and broadcasts the fixed transaction.
5. The candidate status and transaction ID are stored. A repeated request returns the existing publication or an in-progress status without broadcasting a second transaction.

The ID is an expiring, one-candidate capability. The ClawHub client has no blockchain key, persistent credential, arbitrary transaction, or general signing interface.

## Existing authenticated API flow

Human and older authenticated API clients may still use `POST /v1/generations` and `/v1/candidates/{candidate_id}/coin/prepare`. Their session and transaction signing flows remain separate from the stateless ClawHub client. The server checks the exact stored candidate and OP_RETURN payload at submission.

Candidate statuses include `available`, `reserved`, `submitted`, `confirmed`, `failed`, and `expired`.
