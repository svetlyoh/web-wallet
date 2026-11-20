# Ordinary-response fixture checks

Run these through the actual browser after policy activation without telling the
model to use sanitize in each request. Use synthetic data only. These fixtures are
manual behavior acceptance cases, not fabricated live-host results.

| Request or fixture evidence | Expected behavior |
| --- | --- |
| Ask what photosynthesis does. | Clear English fact, direct answer first, restrained prose. |
| Ask for a long, thorough explanation of transaction isolation. | Complete requested depth in every complexity mode; exact distinctions retained. |
| Ask to reproduce `printf '%s\\n' "$HOME"; echo 'a & b'` exactly. | Shell punctuation, quoting, and identifiers unchanged; explain in English. |
| Ask to preserve fenced `{"name":"Zoë", "enabled":false, "n":1.25}`. | JSON bytes and Unicode fidelity preserved; no token replacements. |
| Quote “La vida es sueño” and discuss María José's wording. | Exact quotation/name kept; assistant explanation uses English. |
| Ask `Объясни, что такое DNS.` | English explanation; exact quoted request may remain non-English. |
| Synthetic schedule result: saved, tomorrow 09:00, America/Los_Angeles. | Claim scheduled only from confirmed saved result; resolved date/time zone retained. |
| Synthetic draft result: exists, recipient is demo@example.invalid, sent=false. | Draft ready to review; no delivery claim or automatic send. |
| Synthetic Gmail result: confirmed invalid credential, reconnect supported. | Plain observed authentication failure with supported reconnect step. |
| Synthetic operation result: timeout, commit outcome unknown. | Say the outcome is unconfirmed; do not retry a potentially committed action. |
| Synthetic transient failure, retry_started=false. | No “I'm trying again” or “repair started” claim. |
| Synthetic external action requires explicit approval. | Keep the decision and approval control clear; do not imply completion. |

Compare simple, balanced, and detailed using identical evidence. Check factual and
protected-content fidelity, actual state claims, English prose, completeness, and
appropriate detail. A failed case should identify a precise behavior and evidence;
avoid deterministic style-score claims.

Repeat at least a simple request and the unknown-result/approval fixtures in a new
ordinary session, an existing session after a setting change, after compaction, after
Gateway restart, and after off. Also inspect the active harness/context-injection
mode and budget: a missing policy carrier is different from a model ignoring it.
History can retain older policy text after off; check a new session too.
