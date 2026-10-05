# Review-gated rollout and reconciliation plan

No step in this document has been executed against production. The owner subsequently requested completion and deployment; that authorization does not replace credential availability, test evidence, or verification of the target environment. Keep the branch local until review is complete. Explicit approval for a private production public-data before-image is pending after automatic approval review rejected the broader data-copying operation under the original read-only scope.

For the current release, [ATOMIC-CUTOVER.md](ATOMIC-CUTOVER.md) supersedes the historical migration mechanism below. Apply only `atomic-cutover.sql` as one transaction after old server admission is closed and in-flight writers drain. Storage/Auth modification or a coordinated media-byte snapshot is not part of this public-schema release. Recovery after commit is forward-only; never restore vulnerable grants or a stale public dump across newer billing/usage/media state.

## 1. Prepare a sandbox and inventory the real schema

First read [SCHEMA-COMPATIBILITY.md](SCHEMA-COMPATIBILITY.md). It records the hosted CHECK/index/backfill correction and the separate decisions for real billing reconciliation, Jose's personal test Pro entitlement, reversible synthetic billing quarantine, webhook event alignment and legacy ACL follow-up. Those gates remain unresolved; do not deploy the earlier `f4fbc78` candidate.

Use a separate Supabase project, Stripe sandbox/test-mode resources, test webhook endpoint and isolated PostHog project. Give each environment its own secrets and allowlisted price IDs. Never copy production customers or transcripts into the sandbox. Ensure the selected Vercel project is the production application, rather than similarly named landing projects, before any later authorized operation.

Compare actual columns, nullability, constraints, indexes, table grants, RLS policies and existing triggers against the proposal. Verify the installed Supabase Postgres version, service_role/BYPASSRLS behavior, and `auth.users` foreign keys. Inspect whether the status constraint has a different name. Confirm no pre-existing function/table/index conflicts. Confirm existing own-user SELECT/DELETE policies remain appropriate. The proposal removes authenticated subscription writes and session/question insertion plus session updates; it intentionally preserves history reads and existing recording/analysis writes. Review those preserved policies separately rather than claiming complete storage/content integrity protection.

Run read-only preflight checks before preparing the approved migration:

```sql
SELECT recording_id, count(*) FROM public.analyses
GROUP BY recording_id HAVING count(*) > 1;
SELECT stripe_customer_id, count(DISTINCT user_id) FROM public.subscriptions
GROUP BY stripe_customer_id HAVING count(DISTINCT user_id) > 1;
SELECT stripe_subscription_id, count(*) FROM public.subscriptions
GROUP BY stripe_subscription_id HAVING count(*) > 1;
SELECT status, count(*) FROM public.subscriptions GROUP BY status;
SELECT status, count(*) FROM public.sessions GROUP BY status;
SELECT n.nspname, p.proname, p.prosecdef FROM pg_proc p
JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname IN
('sync_billing_subscription','practice_access_status','consume_ai_budget','create_practice_session');
```

Do not resolve duplicates by deleting customer analyses automatically. Decide which record is canonical, archive the full competing records, and approve a reversible reconciliation separately. Binding conflicts need human review of verified Stripe ownership; do not adopt an arbitrary posted user ID or email match. Prepare a database backup/PITR checkpoint and export existing grants/constraints/triggers for operational recovery.

Confirm all current and legitimate historical Stripe price IDs are in `NEXT_PUBLIC_STRIPE_PRICE_MONTHLY`, `NEXT_PUBLIC_STRIPE_PRICE_ANNUAL`, or `STRIPE_ALLOWED_PRICE_IDS`. Otherwise reconciliation deliberately rejects them. Confirm the webhook's actual configured API version and subscription item/period shape with sandbox fixtures. The application SDK version is not proof of the configured webhook payload version. Check recurring price activity, discounts/zero-payment checkout behavior, cancellation-at-period-end, paused/unpaid/past-due handling, and configured return domains.

## 2. Prove the complete sandbox flow

Apply the reviewed proposal only in the sandbox. Deploy this exact reviewed commit with test credentials. Test free admission, three completed sessions, deletion without quota reset, concurrent starts, admitted processing after completion, normal/skip/unload completion, cached result reads and provider failures. Exercise microphone/audio upload with the new recording ID contract. Check rejection of missing/foreign recording IDs, invalid files, expired free allowance and unsigned/unowned checkout requests.

Use Stripe test checkout to prove purchase -> signed webhook -> atomic entitlement -> authenticated access -> cancellation/renewal/payment failure. Replay the same test event, distinct events for the same checkout, delayed old-subscription events and simultaneous verification/webhook delivery. Assert one immutable mapping, one event acknowledgement only after persistence, one canonical purchase outbox row, and actual current Stripe status. Force a database error and verify webhook non-2xx so Stripe retries. Force transient Stripe errors to prove the agreed 72-hour verified-access bound; legacy/null sync timestamps must fail closed.

Use the separate analytics project to prove HTTP `/i/v0/e/` acknowledgement and stable UUID/$insert_id deduplication. Force a network failure and confirm outbox remains pending, billing verification still succeeds, and authenticated cron delivery recovers it. Configure `CRON_SECRET` and confirm the protected hourly route is compatible with the selected Vercel plan. The configuration in `vercel.json` has not created a running production schedule. Monitor backlog age, rather than treating HTTP 200 or an attempted count as delivery proof.

Execute fresh Chrome and Safari browser flows using test accounts and synthetic recordings. Test any supported Electron client separately. A successful local build or mocked route test does not satisfy these integration gates. Do not conduct these paid or write-capable flows with production users.

## 3. Reconcile legacy billing in the approved cutover

Personal internal Pro is approved only for the verified owner UUID. Follow [INTERNAL-PRO.md](INTERNAL-PRO.md) for its private grant and reversible personal-binding quarantine review; do not silently retire the other automated demo account, which remains undecided. The internal grant does not substitute for reconciliation of real paid/canceled Stripe bindings.

Before the window, produce a read-only reconciliation inventory: each local Stripe subscription/customer/user binding, current Stripe state, allowed price, item-level period, any cross-user/customer conflict, and the exact intended correction. Parent live evidence found two Stripe-canceled subscriptions still marked active locally. Validate the inventory again at cutover rather than trusting the earlier snapshot.

After the new schema exists, refresh each verified existing binding through the privileged synchronization contract, using current Stripe state and a revision check. Update status/period/sync timestamp without inventing a purchase event, changing ownership or replaying charges. Leave conflicts blocked for explicit review. Active/trialing rows need successful fresh verification before access can be restored; all legacy `stripe_synced_at` values begin null. Canceled and expired rows must not be granted grace. Re-run read-only comparison and verify no cross-user mappings or unexpected state changes. This branch supplies the synchronization RPC/service, not an approved bulk production execution script.

## 4. Use a maintenance window for the incompatible permission changes

Choose this maintenance strategy explicitly; do not apply SQL and code independently under active traffic. Prepare a tested maintenance response/gateway that stops new sessions and all mutating app routes. During the window, return a retryable non-2xx (preferably 503) for Stripe webhooks so Stripe queues retries instead of acknowledging unpersisted events. Prepare this gateway and its exact rollback before release approval; this patch does not implement an automatic traffic freeze.

1. Announce the approved window through an approved channel. Drain active recordings/transcriptions; allow users to finish before freezing writes. Account for open browser tabs, mobile beacons and Electron clients. Freeze mutating traffic and verify no old writer remains active. Preserve backups and pending webhook visibility.
2. Apply the reviewed transactional schema proposal. A failed preflight/index/constraint must abort the transaction; keep maintenance active. Do not bypass a failure by discarding data or weakening ownership checks.
3. Deploy the reviewed code as the matching half of the cutover. Configure the approved price IDs, service credentials and cron secret. Keep the public traffic freeze until legacy reconciliation and sandbox-derived smoke gates are satisfied.
4. Refresh verified legacy bindings, then verify actual grants and service-only RPC access. Use approved test identities for any write-capable production smoke; read-only inspection of a real paid user's binding/access can confirm mapping but does not impersonate that user or prove an entire browser session.
5. Require open browser tabs to refresh onto the new bundle before recording again. Old callers omit `recordingId` and old direct session writers are revoked, so they safely fail. Unsupported old Electron builds must be held until their compatible client update is available. This is a deliberate compatibility gate, not a promise that every stale tab can be updated remotely.
6. Remove the traffic freeze only after the owner accepts the checks. Observe Stripe retry recovery, error rates, paid/free access, operation leases, quota accounting and analytics backlog. Inspect these signals directly; a green health route does not cover the application flow.

## 5. Recovery and follow-up

Prefer keeping maintenance active and rolling forward if cutover validation fails. The former application is incompatible with revoked session writes and the new authenticated recording contract. A code-only rollback is unsafe. Restoring old writable subscription/session grants would re-open audited vulnerabilities and requires an explicit, time-bounded risk decision. Never drop billing events/outbox/completed-usage records merely to make a rollback work. Preserve Stripe webhook retries and export diagnostic state without secrets or customer content.

Do not introduce a permanent compatibility route that accepts an arbitrary client transcript, user ID or unowned audio to make stale callers work. Historical canceled rows and ownership conflicts need separate reviewed corrections. Periodically expire old budget windows/leases and review retention of webhook/outbox records; no destructive cleanup job is enabled here. Set operational thresholds for provider spend, 429/409/503 rates and backlog age before release.

After this branch, address notification abuse and recording recovery first, then the analysis page's stable per-recording state and evidence-linked feedback evaluation. Keep model/prompt changes in a separate evaluated release. Desktop Electron security remediation also needs its own tested upgrade rather than `npm audit fix --force` in this patch.
