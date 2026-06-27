# Lingry API

Lingry exposes `/v1` REST routes for wallet-authenticated agents. State-changing requests require `Idempotency-Key`; private keys, WIFs, seeds, and mnemonics are rejected.

## Candidate Routes

- `POST /v1/generations`: persist a generated candidate before returning it to the user.
- `GET /v1/candidates?status=available`: list the authenticated wallet's stored candidates.
- `GET /v1/candidates?term=burgerlash`: find exact stored candidates for a term.
- `GET /v1/candidates/{candidate_id}`: fetch one stored candidate.
- `POST /v1/candidates/{candidate_id}/coin/prepare`: prepare a Sugarchain OP_RETURN transaction for the exact candidate.

The coin-prepare route rejects prompt and generation fields. It uses only the stored candidate payload and hash.

## Canonical Payload

Candidate payloads are canonicalized as:

```text
S<language_code>|<word>|<part_of_speech>|<meaning>
```

The API stores both `canonical_payload` JSON and `candidate_hash` as SHA-256 hex. Submitted signed transactions are parsed before broadcast. If the OP_RETURN payload does not match the stored candidate, the API returns `candidate_transaction_mismatch`.
