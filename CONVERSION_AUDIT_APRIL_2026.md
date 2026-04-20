# Conversion Audit — April 2026

> **Started:** 2026-04-19
> **Context:** App has been live ~1.5–2 months with zero paid conversions. Audit aims to identify and fix P0/P1 blockers and stand up a repeatable auditor.
> **Base commit:** `7affe53` (Add first-time onboarding overlay for new signups)

---

## Infrastructure Status (as of 2026-04-19)

| Surface | URL | Status |
|---|---|---|
| Landing | `pitcht.us` (Framer) | HTTP 200, all CTAs point to `app.pitcht.us` |
| App | `app.pitcht.us` (Next.js on Vercel) | HTTP 200 |
| Health | `app.pitcht.us/api/health` | `healthy` — DB, Storage, Anthropic, OpenAI all pass |
| Routes tested | `/`, `/pricing`, `/interview`, `/success`, `/settings`, `/history`, `/analysis` | all 200 |
| DNS | `pitcht.com` | redirects to `atom.com` (domain parking) — unused |

**Finding:** infrastructure is healthy. No "app is broken" layer blockers — the problem is the funnel.

---

## Critical Findings (ranked)

### P0 — ship this week

1. **Onboarding bypass bug (commit 7affe53).**
   The new `OnboardingModal` only fires on `/` page mount. But the most common signup path is:
   `/` → click session tile → `SessionSetupModal` → signup → `router.push('/interview')`.
   The home page never remounts, so the highest-intent segment never sees the onboarding.
   *Fix strategy:* move trigger into a global component mounted in `layout.tsx` so it fires on any post-signup route.

2. **`LoginModal` has no "Forgot password?" link.**
   Returning users who forget their password are trapped — must email support.
   *Fix strategy:* add `resetPassword` to `AuthContext`, add inline "Forgot password?" flow in `LoginModal`, create `/auth/reset-password` recovery page.

3. **`/success` page activation anxiety.**
   When the Stripe webhook is late or fails, the page says "Activating…" until timeout (~30s), then shows a vague "Taking longer than expected" message with no retry button. Users who paid $14.99 panic.
   *Fix strategy:* better copy ("Your payment succeeded — we're finalizing your account"), add an explicit "Try again" refresh button, acknowledge payment was received.

4. **Stripe webhook silent failure on `customer.deleted`.**
   `/api/webhooks/stripe` skips subscription creation if `customer.deleted` is true and returns 200 — Stripe won't retry. User paid, gets nothing.

5. **Free tier too stingy.**
   `TRIAL_SESSION_LIMIT = 1` lifetime. No room for habit formation. Competitors give 3+ or a timed full-access trial.

### P1 — within 2 weeks

6. Logged-out `app.pitcht.us/` homepage has no hero, pricing, or social proof.
7. `PaywallModal` doesn't display the `sessionsUsed` value it receives; "Maybe later" button leads to a paywall loop next session.
8. Header shows "0/1 sessions used" on every page — demotivating.
9. `canStartSession` in `AuthContext` interface is dead code (set but never exported/read).
10. Emoji-prefixed console logs in `/api/webhooks/stripe/route.ts`, `/success/page.tsx`, `/interview/page.tsx`.
11. `SignupModal` has no ToS/Privacy checkbox — regulatory risk.
12. `SignupModal` password validation is 6 chars minimum (too weak).

### P2 — growth moves

13. Post-session upgrade nudge (highest-intent moment).
14. Email lifecycle (welcome, feedback-ready, trial-ending).
15. Analytics — no PostHog/Amplitude/Mixpanel events visible anywhere.
16. Stripe-native `trial_period_days` with card collection to lift conversion vs. cold upgrade.
17. "Continue →" in `SessionSetupModal:336` should be "Sign up free to start" for unauth users.

---

## Work Log

### 2026-04-19 — Initial audit + P0 batch 1

- [x] Full app walkthrough via curl + code review
- [x] Drafted this report
- [x] P0 #1: Onboarding bypass — global trigger in layout
- [x] P0 #2: Password reset in `LoginModal` + `/auth/reset-password`
- [x] P0 #3: Success page activation copy + retry button

---

## Automation Plan (next terminal / follow-up session)

**Layer A — Ops health monitor (every 5 min, lightweight):**
- GitHub Action cron hits `/api/health` → opens GH issue if 2 consecutive fails
- Playwright smoke: load `/`, open `SessionSetupModal`, verify no console errors

**Layer B — Weekly conversion auditor (Sunday 22:00):**
- `scripts/audit-agent.ts` — Claude-powered
- Pulls last 7 days: Vercel logs, Stripe events, Supabase `sessions` table
- Records cold-user Playwright journey to video
- Posts structured regression report as GitHub issue

Files that will be created (when this layer is built):
- `scripts/audit-agent.ts`
- `scripts/audit-playwright.ts`
- `scripts/audit-metrics.ts`
- `.github/workflows/audit.yml`

---

## Open Questions for Product

- Should free tier be **3 lifetime sessions** or a **7-day full-access trial with card**?
- Which analytics tool do we standardize on (PostHog vs Amplitude vs Mixpanel)?
- Is `pitcht.com` (currently parked at atom.com) worth reclaiming as a redirect to `pitcht.us`?
