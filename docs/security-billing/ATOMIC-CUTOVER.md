# Atomic security/billing cutover

`atomic-cutover.sql` is the executable, one-shot replacement for applying the historical `database-proposal.sql` directly. It starts from the pre-repair public schema and incorporates the reviewed candidate at `be3364b9334a6dbc623c3e9563777ef854163963`. It must be paired with the compatible recording-first application. No production execution is recorded here.

There is no committed writable expand phase. Prepare the candidate, stop app admission, drain old server writers, apply one public-schema transaction, reconcile verified Stripe bindings, validate, and resume compatible traffic. This supersedes the earlier split-expand proposal and full-Storage-freeze recommendation for this release. It does not replace the independent hosted configuration, Stripe lifecycle, analytics, or deployment checks.

## Exact boundary and preflight

The migration changes public application tables, functions, triggers, and ACLs. It preserves all existing identifiers and row content except the new bounded session expiry values. It does not change Auth identities, Storage objects, bucket policies, media paths, recordings, or analyses. The new table foreign keys reference existing Auth and recording rows, as in the reviewed proposal.

Before execution, verify actual schema/roles/policies against the candidate and export a protected application before-image and permission inventory for diagnosis. Confirm all historical app URLs, aliases, webhooks, cron/background work, and other service-role writers are stopped or drained. A browser app pause alone cannot retire direct browser writes or old service credentials. Live-old-server overlap is unsupported: its service-role billing updates could bypass the new revision protocol even after client ACL revocation.

The SQL itself refuses:

- an existing cutover marker, entitlement columns, candidate tables, or candidate function names;
- missing regular/RLS application tables or operator ownership, missing service-role BYPASSRLS, or RLS-bypassing client roles;
- cross-user customer bindings, incomplete session ownership/creation metadata, a missing approved owner identity, or a missing valid unique analyses(recording_id) index;
- data incompatible with the retained/new CHECK constraints;
- remaining effective client privileges or missing required history/upload grants at transaction end.

`SET LOCAL row_security = off` makes policy-filtered reads fail instead of producing an incomplete usage baseline. This includes a table owner subject to FORCE ROW LEVEL SECURITY; the migration never assumes ownership alone guarantees an unfiltered snapshot.

It intentionally does not adopt arbitrary partially expanded schemas. Those require a separately reviewed forward migration. A preflight failure is not authorization to delete data, reset usage, adopt billing bindings, or broaden platform role membership.

## Atomicity, locking, and retry

The SQL owns its `BEGIN`/`COMMIT`. Use a client that stops on the first error and rolls back/disconnects, such as `psql -X --set ON_ERROR_STOP=1 --file docs/security-billing/atomic-cutover.sql` with the operator's approved connection already configured. Do not run individual sections, ignore errors, or wrap it in a runner that commits fragments.

Local settings bound every lock wait to 5 seconds and every statement to 60 seconds; an idle transaction is disconnected after 15 seconds. These are per-lock/per-statement bounds, not a promise that the entire script always finishes within 5 seconds. A lock timeout, deadlock, constraint, or permission failure rolls back the whole transaction. Keep admission closed, investigate contention, and retry the unchanged artifact after the conflicting writer drains. Do not kill customer connections to force progress.

The transaction acquires SHARE ROW EXCLUSIVE locks on analyses/recordings before ACCESS EXCLUSIVE locks on sessions/questions/subscriptions. Child metadata must be fenced first: otherwise an arriving recording INSERT can hold a child lock while waiting on sessions, and the new lease table's foreign key can deadlock on that same child. Existing transactions that already acquired locks in another order can still cause a bounded abort; retry is safe because nothing commits partially.

Direct browser session creation/completion can finish before locks are acquired and be included in the baseline. Queued writes after contraction fail permission checks. Recording metadata inserts and history reads/deletes can queue behind these public locks and resume afterward. Auth foreign-key DDL can briefly queue Auth database writes too. This is not an Auth/Storage platform freeze, nor a promise of zero request latency. A failed/timeout metadata insert must be retried against the same preserved session/question identifiers; retain uploaded media and local recording recovery state until its recording row is confirmed.

The backfill reads the completed-session baseline only while all relevant public writers are serialized. The unchanged invoker completion trigger becomes visible in the same commit as the private usage ledger and revoked direct completion grants. There is no interval that silently loses a completion followed by deletion between phases. Previously deleted legacy completions cannot be reconstructed by this migration.

## Approved bounded legacy processing policy

One timestamp is captured after the locks are acquired. Every selected session receives exactly `cutover_at + 24 hours`; the private `security_billing_cutover` marker records that fixed expiry. The migration has no caller-supplied eligibility inputs and cannot be rerun to extend the window.

The eligible session shape is: already present at cutover, created between cutover minus 24 hours and cutover inclusive, status completed/in_progress, and 1–10 saved question rows. Selection is independent of unverified legacy billing state.

1. Completed sessions qualify only among the user's first three lifetime completed sessions, ordered by `coalesce(completed_at, created_at)` then session ID. The full completed-usage baseline is retained, including old sessions and completed rows without media.
2. Eligible in-progress sessions are selected oldest first (created_at then ID), up to `max(0, 3 - all lifetime completed usage)`.
3. The combined selected set contains at most three sessions per user. Active selected sessions count toward the existing reservation calculation. A completed third session may finish transcription/feedback during the fixed window, while new free admission remains denied.

Zero-question/half-created sessions, sessions with more than ten questions, future timestamps, older sessions, excess active sessions, and fourth/later completed sessions are preserved without a grant. Nothing resets completed usage or creates extra free allowance. Owner internal access and freshly verified paid/trial access continue through the original contracts; their AI budgets, ownership checks, and leases still apply.

The intentional SQL behavior difference is in `consume_ai_budget`: the historical proposal's implicit NULL-expiry fallback is removed. Free processing now requires a valid server-admitted expiry or the fixed selected legacy expiry. Spare free quota does not quietly admit an excluded legacy session. All six other reviewed function bodies, including both triggers, remain byte-identical to the proposal.

## Final permissions and recovery

The migration revokes subscription INSERT/UPDATE/DELETE and destructive table privileges from PUBLIC/anon/authenticated. Session INSERT/UPDATE and question INSERT are similarly removed, including direct column grants through PostgreSQL's table REVOKE semantics. Effective table/column/function checks reject unexpected inherited grants rather than claiming a revoke succeeded. Current history SELECT/DELETE and recording/analysis client behavior are retained. New billing/usage/lease tables and functions stay private to service_role; the owner-only internal entitlement remains pinned to the approved UUID. The cutover marker is service-role SELECT-only.

Legacy subscription rows keep their immutable identifiers and start unverified. Before opening traffic, refresh the exact approved bindings using current Stripe state through `sync_billing_subscription` and its revision contract. Never invent a sync timestamp or purchase/event identity for reconciliation. The migration itself makes no provider call, billing event, charge, or purchase outbox entry. Existing real canceled states, price allowlists, and the approved demo-binding decision still need the separate reconciler.

After commit, use forward repair and compatible code only. Preserve new events/outbox rows, completed usage, Auth changes, media uploads, and recording references. Do not restore an old public dump across newer data, restore vulnerable client grants, reset the marker, or rerun the historical proposal to roll back. A database before-image is diagnostic/recovery material, not automatic authority to overwrite newer data. This boundary does not require a coordinated media-byte snapshot or managed Storage-owner privilege. Ordinary hosted backup/disaster-recovery readiness remains a separate operational concern.

## Focused verification

`tests/atomic-cutover-db.test.ts` uses a separate explicit opt-in, Unix-only local PostgreSQL socket, `pitcht_test` role, and `pitcht_cutover_test` database. It checks `data_directory` begins `pitcht-security-test-` before resetting synthetic schemas. Do not point it at the local app/rehearsal database or run destructive suites against one database concurrently.

```sh
PITCHT_CUTOVER_TEST_PG_SOCKET=/absolute/disposable/socket \
  node --import tsx --test tests/atomic-cutover-db.test.ts
```

October 2 local results: the original 10/10 passed on PostgreSQL 18.6; the expanded suite passed 12/12 on a fresh PostgreSQL 17.6 container (`public.ecr.aws/supabase/postgres:17.6.1.011`). The existing security/billing SQL suite separately passed 16/16 on that container, run sequentially in its own synthetic database. No rehearsal database was used; the container and localhost socket relay were removed afterward. The first PostgreSQL 18 run exposed the recording/FK deadlock; after correcting the upfront lock order, the queued-insert test passed. Coverage includes:

- exact preservation of original row content, Auth/Storage metadata, canonical subscription fields, and the approved owner grant;
- fixed/capped legacy selection, excluded recent work, third completed session, expiry, and one-shot refusal;
- queued stale completion denial, pre-lock completion capture, recording insertion resuming after commit, and history deletion without quota reset;
- bounded lock failure and late inherited-privilege failure with complete transaction rollback;
- refusal to read a policy-filtered baseline under FORCE RLS with a non-bypass owner, and verified paid/trial processing of excluded legacy recordings;
- final private permissions, attempted entitlement forgery, concurrent free reservations, immutable billing, event replay, and canonical outbox identity;
- source comparison showing only the intended processing-fallback difference in reviewed RPC bodies.

This suite proves database behavior with synthetic rows on PostgreSQL 17.6. It does not prove hosted platform-role/policy equivalence, real HTTP upload continuity, browser recovery, Vercel admission/promotion behavior, a production backup, provider drain, or a genuine Stripe lifecycle. Those remain explicit release checks; no production fixture or live call was made by this work.

Reference: [PostgreSQL REVOKE](https://www.postgresql.org/docs/17/sql-revoke.html), [explicit locking](https://www.postgresql.org/docs/17/explicit-locking.html), and [statement/lock timeout settings](https://www.postgresql.org/docs/17/runtime-config-client.html).
