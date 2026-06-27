# Lingry Agent Candidate Lifecycle

Generated Lingry words must be preserved before an agent shows them to a user.

## Lifecycle

1. The generator returns one candidate.
2. The agent immediately persists it with `POST /v1/generations`.
3. The API stores a `GeneratedCandidate` record with `candidate_id`, `generation_id`, owner wallet, status, language, term, part of speech, meaning, etymology, canonical payload, and `candidate_hash`.
4. The agent saves `active_candidate_id` locally.
5. When the user says "coin it", the agent calls `POST /v1/candidates/{candidate_id}/coin/prepare`.
6. The prepare route never calls MiniMax and never accepts prompt fields.
7. The signed transaction must contain the exact OP_RETURN payload from the stored candidate. A mismatch returns `candidate_transaction_mismatch`.

## Statuses

- `available`: generated and ready to coin.
- `reserved`: a coin intent has been prepared.
- `submitted`: the signed transaction was accepted for broadcast.
- `confirmed`: the indexer found the matching OP_RETURN on chain.
- `failed`: reserved for failed candidate workflows.
- `expired`: the candidate was not coined before expiry.

## Direct Custom Words

Direct user-authored words remain a separate flow through `POST /v1/words`. They are not generated candidates unless the agent first stores them through `/v1/generations`.
