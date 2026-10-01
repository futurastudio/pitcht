# Hosted-schema compatibility correction — October 1, 2026

The earlier candidate `f4fbc78437a884723e96f94ae2338e7ace712db1` must not be deployed as written. Read-only hosted inspection found a session-type constraint incompatible with internship practice, a redundant index in the proposal, and an inaccurate historical completion timestamp backfill. This correction changes the SQL proposal, synthetic fixture, regressions and release documentation only. It does not alter application routes, AI models/prompts, hosted data or payment configuration.

## Corrected proposal and evidence

| Observed hosted condition | Candidate correction | Regression evidence |
| --- | --- | --- |
| `sessions_session_type_check` permits `job-interview`, `presentation`, `sales-pitch`; the current app/RPC also supports `internship-interview`. | Replace that named CHECK with all three current types plus historical `sales-pitch`. The RPC continues to accept only current types. Historical sales rows remain valid. | The fixture reproduces the old hosted CHECK. An internship insert fails with PostgreSQL 23514 before migration. After the actual proposal, the actual RPC creates job, internship and presentation sessions; a seeded historical sales row survives. Unsupported types still fail. |
| `analyses_recording_id_key` already provides a valid full `UNIQUE(recording_id)` constraint. No duplicate analyses were observed. | Require a valid full unique index on that column at preflight; preserve it. Remove redundant `analyses_recording_id_unique` creation. Missing uniqueness aborts without deleting records. | The hosted-style fixture includes the named existing constraint. The migrated catalog has exactly that unique recording index, without a second one. |
| All 69 hosted completed sessions have a non-null `completed_at` distinct from `created_at`; five have no current recordings. | Backfill completed usage with `coalesce(completed_at, created_at)` for every completed session. Preserve lifetime usage semantics, including sessions whose recordings may have been deleted. | Seeded legacy rows prove the completion timestamp is retained and a missing timestamp falls back to creation. Both usage rows remain counted. |

The red regression against the previous proposal reproduced the internship CHECK violation. The corrected proposal passes all 38 tests: 13 real PostgreSQL tests, 22 behavior/fault tests and three existing permissions tests. See `verification/schema-compatibility-red.tap`, `verification/tests.tap` and `VERIFICATION.md`. The disposable PostgreSQL cluster is separate from local Supabase and contains only synthetic data. These checks establish compatibility with the inspected constraints; they are not hosted migration proof or Stripe lifecycle proof.

## Decisions and operational gates still required

**Real customer preservation.** Hosted evidence identifies three real immutable user/customer/subscription bindings: the recent paid subscription is active through October 21; two older subscriptions are canceled in Stripe but locally active. Re-read all three at cutover and synchronize current Stripe status, item-level periods and verification timestamps through the privileged contract. Preserve ownership and all histories. Do not create purchase events, replay charges or invent verification timestamps. Confirm the legitimate active user's access from its verified binding before opening traffic.

**Synthetic billing quarantine and personal test access.** Two extra hosted rows use fabricated subscription and customer identifiers. One belongs to Jose's personal Gmail test account (`sub_demo_pro_screenshots`); the other is an automated `pitcht.test` identity (`sub_test_d49f2e60_vyw3qmjq`). They are separate from the real paid subscriber. Refreshing fabricated subscription IDs fails in Stripe; changing only status leaves fabricated customer IDs available to checkout and portal calls. Do not silently disable personal Pro, add a broad bypass, treat fabricated IDs as Stripe entitlement, or fabricate `stripe_synced_at`.

The owner subsequently approved preserving personal Pro through an explicit exact-user internal test entitlement; see `INTERNAL-PRO.md` for its implementation, tests and reversible rollout. Retirement of the automated demo account remains unanswered. Preserve complete restricted-access before-images before separately reviewed quarantine outside canonical Stripe billing. No hosted grant or quarantine is applied. Existing Auth users and all practice histories remain intact. The personal grant is separate from real customer preservation and cannot claim a Stripe purchase or another account's access.

**Webhook event alignment.** The live endpoint uses API version `2025-11-17.clover`, and its selected events omit candidate-handled `checkout.session.async_payment_succeeded`, `invoice.paid`, `customer.subscription.paused` and `customer.subscription.resumed`. Before release, review and approve its subscription set and prove the actual payload shape. The candidate handles these ten events:

```text
checkout.session.completed
checkout.session.async_payment_succeeded
customer.subscription.created
customer.subscription.updated
customer.subscription.deleted
customer.subscription.paused
customer.subscription.resumed
invoice.paid
invoice.payment_succeeded
invoice.payment_failed
```

An approved endpoint update must retain every required existing event and add the missing relevant events. Do not silently change its API version. Test signed sandbox checkout, delayed asynchronous payment, duplicate delivery, cancellation, renewal/failure, pause/resume and actual owned checkout metadata against that version. A generic CLI trigger without the app's verified ownership metadata does not prove this path. No endpoint modification or remote test object creation has occurred here.

**Permissions scope.** Existing tables retain broad `TRUNCATE`, `REFERENCES`, `TRIGGER` and/or `MAINTAIN` grants from old ACLs. The candidate revokes ordinary subscription and session writes and denies privileged RPCs to public/anon/authenticated; it does not claim complete least-privilege cleanup of every legacy ACL. The read-only review did not demonstrate a PostgREST exploit of those extra privileges. Inventory role membership and table/sequence/default grants, validate required client operations in the sandbox, and propose explicit least-privilege revocations separately. Do not expand this correction into untested blanket grant changes.

**Cutover and rollback.** The proposal still requires a fresh complete schema inventory, backup/PITR checkpoint, owner-approved entitlement/data decisions, successful sandbox Stripe lifecycle, fresh Astra review, and a concrete maintenance/drain/rollback plan. A code-only or SQL-only live rollout remains incompatible. If validation fails, keep maintenance active and preserve billing, usage and outbox ledgers. No production deployment, SQL mutation, push or account change is authorized by this document.
