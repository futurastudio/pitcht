# Pitcht security and billing review patch

This branch repairs the first security/billing tranche identified in the October 1, 2026 audit. It is a local review candidate. No production migration, deployment, push, real payment or customer contact was performed. Separately approved local/browser and bounded provider rehearsals are documented outside this commit; they do not establish Stripe sandbox lifecycle success. The original checkout and its unpublished drafts are preserved.

Base: `a2f81467d88e03c6631e22111f368c4074f660d9` (the application code matches production `3a47ec26cd8ccb1a6250ce5f2f6721c430663a78`; the difference is four documentation moves). The independent checkout branch is `codex/security-billing-repair`.

## Changes and their purpose

- Checkout ownership derives from a verified Supabase bearer token. Approved recurring prices are allowlisted; caller-supplied user IDs cannot claim another account. Verification requires matching checkout reference, subscription metadata, customer, subscription and completed payment state.
- Stripe state is read afresh before synchronization. Subscription/customer/user bindings cannot be reassigned. A privileged, transactional RPC persists the subscription, webhook ledger and unique purchase outbox together. Revision conflicts trigger a fresh Stripe read; failed or empty persistence produces an error instead of success. Invoice events use the current parent subscription shape and legacy compatibility; payment failure never blindly sets a subscription active.
- Entitlement decisions share a server path. Unverified legacy rows receive no paid access. Previously verified active access can survive a transient Stripe outage for at most 72 hours, bounded by both last successful verification and period expiry. Trialing access requires an unexpired period. Canceled/past-due/unpaid/paused rows receive no grace. This grace policy needs product approval before release.
- Session creation and completion use authenticated routes. Admission and completion accounting share a per-user database lock. Completed usage survives history deletion. Free admission allows at most three completed plus currently reserved sessions. Empty sessions do not consume completed usage. Normal completion and existing token-bearing unload beacons remain supported; both completion error paths stop navigation and allow retry.
- Question generation, transcription and feedback require authenticated ownership/allowance checks and database-backed hourly/daily budgets. Transcription requires an owned recording, valid audio MIME and a file at most 4 MiB. Feedback uses the owned saved transcript, question and session context. Results are persisted on the server, zero scores survive, and malformed output fails validation. A two-minute per-recording operation lease plus a second cache read after reservation prevents the tested overlapping-worker duplicate generation race. Failed release expires safely; a hard crash after provider completion but before persistence can still require another paid provider call.
- Successful checkout verification and Stripe webhooks produce one durable purchase identity per checkout. Delivery awaits HTTP ingestion acknowledgement, retains pending rows on failure, and uses stable UUID/$insert_id identities for deduplication. A protected hourly cron retries pending delivery. Analytics failure cannot roll back billing access. The client success page emits one page-view event per mounted checkout, rather than another canonical purchase event.
- Next.js and its ESLint configuration are pinned to 16.3.8; compatible dependency fixes and the server-only boundary package are included. AI model IDs and prompts are unchanged.

## Verification

The final recorded results and source locations are summarized in the accompanying implementation report. Tests execute the actual TypeScript route/service source with explicit offline provider boundaries. SQL tests execute the proposal against a disposable synthetic PostgreSQL cluster, including concurrent writes and privilege checks. Neither test set proves live Stripe, Supabase, PostHog or Vercel integration. A build uses an empty inherited environment and synthetic credentials, so production secrets are absent.

```sh
npm ci --ignore-scripts
npm test
npx tsc --noEmit --incremental false
npm run lint
npm audit --omit=dev
```

The SQL tests skip unless `PITCHT_TEST_PG_SOCKET` is set. To execute them, initialize a disposable PostgreSQL cluster named `pitcht-security-test-<suffix>` (or `repair-test-postgres`), with a Unix socket in a temporary directory, port 54379, a local superuser `pitcht_test`, and database `pitcht_security_test`. Start it with TCP disabled (`-h ''`). Then:

```sh
PITCHT_TEST_PG_SOCKET=/absolute/temporary/socket/directory npm test
```

**The SQL test setup deliberately drops and recreates the test database's public/auth schemas.** It refuses TCP hosts and clusters without the dedicated data-directory name. Never point it at an existing application database, production credentials or a shared development cluster. Shut down the disposable cluster after testing. The fixture mimics the application's schema/RLS; it is not a replica of hosted Supabase infrastructure.

## Release gates and remaining scope

Read [INTERNAL-PRO.md](INTERNAL-PRO.md) for the subsequently approved personal internal-test entitlement, exact-user restrictions, seven new regressions and reversible rollout. Automated demo retirement is still pending. This preserves personal practice access separately from canonical Stripe billing; no hosted grant or quarantine has been applied.

Read [SCHEMA-COMPATIBILITY.md](SCHEMA-COMPATIBILITY.md) for the subsequent hosted-schema correction, its regressions and unresolved data/webhook decisions. Candidate `f4fbc78` must not be deployed as written. The revised proposal preserves the hosted unique recording constraint, supports internships while retaining historical sales pitches, and preserves actual historical completion timestamps.

Read [ROLLOUT.md](ROLLOUT.md) before approving any deployment. `database-proposal.sql` is a review proposal, not an applied or automatically runnable production migration. It requires actual schema inventory, duplicate checks, sandbox integration, reconciliation and a maintenance window. Applying the database revocations before the new code breaks old client writes; deploying the new code first leaves required RPCs absent. There is no claim of a transparent rolling release.

The following remain outside this branch: unauthenticated signup-notification and waitlist abuse defenses; durable large-recording recovery and Safari/device capture fixes; analysis selection/loading UX; metric/transcript consistency; evidence-linked feedback, rubric/prompt/model evaluation; expanded funnel telemetry; storage privacy/deletion review; and Electron's major upgrade. The dependency audit still identifies two high advisories in the desktop-only Electron/extract-zip chain. This branch is not a desktop release approval or a claim that all security findings are closed.
