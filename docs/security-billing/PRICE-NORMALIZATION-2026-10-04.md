# Checkout price normalization

The `pitcht.com` Vercel project has surrounding whitespace in its production-only
`NEXT_PUBLIC_STRIPE_PRICE_MONTHLY` and `NEXT_PUBLIC_STRIPE_PRICE_ANNUAL` values.
The primary `pitcht` project has clean values in production, preview and
development. The two projects identify the same prices after trimming.

A submitted value such as `" price_monthly\n"` previously failed the exact
allowlist comparison, although the configured allowlist already trimmed values.
The pricing page now trims its configured IDs, and the server normalizes submitted
IDs before checking the unchanged allowlist. Stripe price retrieval, checkout
line items, persisted snapshots and checkout idempotency keys use the canonical
ID. Unknown prices, internal whitespace and non-string/empty inputs still fail
before quota reservation or a Stripe operation.

Validation: the checkout-route regression covers padded configuration and input,
canonical Stripe arguments/idempotency keys, and invalid-input rejection; billing
tests and typecheck pass. All three isolated browser tests pass with Chromium
launch access. Full lint has no errors (13 existing warnings). The normal sandbox
test run had 82 passes and three Chromium launch failures; the three isolated
reruns passed. The 29 opt-in database tests remained skipped; no migration or
production data was changed.

Hosted environment corrections remain prepared, unapplied, and limited to the two
production values on `pitcht.com`. Automatic deployment remains disabled for
`codex/security-billing-repair` in `vercel.json`. The original independent-review
gate and other cutover prerequisites remain unresolved; this fix does not waive
them. The atomic SQL is unchanged.
