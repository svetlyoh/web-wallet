# Lingry public index recovery

The production Worker runs every minute. UTC minutes divisible by five advance
recent coverage; the other minutes repair historical coverage. Legacy hourly and
15-minute triggers remain understood while Cloudflare propagates the new trigger.

Each scan has its own 32-request upstream budget and 45-second deadline. Every
Sugarchain request, including retries, pagination, and provider fallback, consumes
that budget. A recent run can additionally spend at most eight requests reconciling
agent coins. Redirects are rejected so they cannot consume uncounted requests.
The configuration works within the Free plan's 50 external requests without
raising platform limits or changing the account plan.

Historical batches request at most 1,000 blocks. Recent batches request at most
500 blocks and persist an independent contiguous cursor. That cursor is initially
seeded 1,800 blocks behind the confirmed tip; older missing periods remain the
historical scan's responsibility. Neither cursor skips failed transactions or
blocks. Both validate their checkpoint hash and rewind on a detected reorg.

A budget pause is `yielded`, not an upstream failure. Fully checked blocks and
words are persisted before releasing the lease. The next batch starts at the
first unchecked block. An atomic two-minute D1 lease prevents overlapping batches
from overwriting each other's checkpoints. Checkpoint updates are replay-safe.
Completed transaction checks in an unfinished block are cached under its exact
block hash. This lets blocks with more transactions than the request budget finish
over multiple invocations. The cache is cleared when the block is fully checked.

`GET /v1/index-health` reports historical backlog, recent coverage, errors, the
request budget, and the eight latest batches. A current snapshot timestamp alone
does not imply complete blockchain coverage. `catching_up` means the scans are
making progress while coverage remains behind; `healthy` requires both cursors
to have reached the observed confirmed tip and recent coverage to be current.

The `lingry_index_runs` table retains 30 days of invocation outcomes: `progress`,
`yielded`, `caught_up`, `failed`, and `skipped`. Migration 0008 records the schema;
the Worker also ensures the table exists for backwards-compatible deployment.
Run the following read-only query to inspect recovery and detect schedule gaps:

```sql
SELECT mode, started_at, finished_at, status, start_height, end_height,
       checkpoint_height, scanned_blocks, upstream_requests, error
FROM lingry_index_runs
ORDER BY started_at DESC
LIMIT 120;
```

Do not manually advance a checkpoint or reset it to the chain tip. Clearing a
backlog means fetching and inspecting its blocks, not marking them scanned.
