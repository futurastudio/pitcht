# Fabiana Incident Report — April 2026

> **Status:** All P0 fixes shipped to production 2026-04-23.
> **Next action owed:** reach out to Fabiana directly with acknowledgment + 1-month-on-the-house.

---

## Who

**Fabiana.gas29@gmail.com** — first paying-ish user (free tier, attempted Pro upgrade). Experience so bad across 3 separate bugs that she silently churned. Surfaced over email on 2026-04-19.

## The four bugs she hit

| # | User-visible symptom | Root cause | Fix commit |
|---|---|---|---|
| 1 | Free session never saved to history — recordings vanished between analysis page and history page | `addRecording` save path in `interview/page.tsx` was gated on `window.electron`; every web user's recordings were silently dropped. | `d8cd4c9` |
| 2 | "Practice Again" → second session — no recordings captured at all | `repeatSession()` reused the previous session's question UUIDs. `createSession()` uses them as primary keys in the `questions` table → PK collision (PG 23505) → `createSession` throws → `sessionId` stays `null` → every subsequent `addRecording` falls into the "no DB upload attempted" branch. | `d8cd4c9` |
| 3 | Every session's feedback looked identical ("felt like a demo") | Leftover demo feedback block shipped in an analysis code path was mixing with real per-recording feedback. | prior session, `60d0722`-ish |
| 4 | After paying, UI kept showing "free tier" CTAs for hours | `subscriptionStatus` was never refreshed client-side after the Stripe webhook wrote the new row. Tabs that were open during checkout never saw the update. | `d8cd4c9` |

## What actually shipped (2026-04-23)

### Commit `d8cd4c9` — Fix Fabiana's P0 production bugs
- **`src/app/interview/page.tsx`** — removed `if (window.electron)` gate around the save path. Save now runs unconditionally for web + Electron. Also added zero-byte blob guard.
- **`src/context/InterviewContext.tsx`**:
  - `addRecording` — wraps Supabase upload in try/catch, `Sentry.captureException` with `{userId, sessionId, questionId, blobSize, hasTranscript, duration}` tags. Toast on failure: "Recording upload failed — you may need to redo this answer".
  - No-blob branch adds a Sentry breadcrumb so production traces show the drop reason.
  - `repeatSession` — regenerates fresh UUIDs via `crypto.randomUUID()` for every question before calling `setQuestions`. Resets `isCreatingSessionRef.current = false` so `initSession` effect actually fires on the repeat run.
- **`src/app/analysis/page.tsx`** — added `refreshSubscriptionStatus()` on mount. Converted Practice Again `<Link>` → `<button>` with async handler that short-circuits for premium/trialing and calls `canUserStartSession(user.id)` for free tier, showing `PaywallModal` when denied.
- **`src/app/session/[id]/page.tsx`** — same paywall gate on the history-page Practice Again.
- **`src/app/settings/page.tsx`** — `refreshSubscriptionStatus()` on mount + on window-focus.

### Commit `86cfde5` — Harden conversion audit with DB assertions
- **`scripts/audit-db-assertions.ts`** (new) — uses service-role key to verify sessions/recordings/questions/analyses actually landed after each funnel run.
- **`scripts/audit-e2e.ts`** — wires DB assertions into the funnel so a green DOM walk can't mask silent data loss.
- **`.github/workflows/audit.yml`** — warn-only CI gate (`continue-on-error: true`) to collect signal without blocking deploys.

## Paywall gate logic (both `/analysis` and `/session/[id]`)

```
if (isPremium || isTrialing) → repeatSession() + router.push('/interview')   // Pro: no gate, no DB hit
else if (!user)              → repeatSession() + router.push('/interview')   // defensive fallthrough
else {
  check = await canUserStartSession(user.id)
  if (!check.allowed)        → show PaywallModal (reason from server)
  else                       → repeatSession() + router.push('/interview')
}
```

Pro-user safety is triple-layered:
1. Client short-circuit before any DB call.
2. `canUserStartSession` itself returns `allowed: true, isPremium: true` for active subscriptions (`subscriptionManager.ts:25-41`).
3. `refreshSubscriptionStatus()` on mount in `/analysis` and `/settings` keeps `subscriptionStatus` fresh so a just-upgraded tab doesn't get gated by stale state.

## Verification

- **Smoke test:** `npx tsx scripts/smoke-test.ts` → 25/25 pass.
- **Typecheck:** clean (0 errors).
- **Manual test scenario A (free tier paywall):** confirmed by José — paywall fires when a free user who's used 1/1 sessions clicks Practice Again.
- **Manual test scenario B (Pro user unaffected):** pending, blocked on Google account picker friction. Low risk — code is the standard Supabase pattern already in production via `SessionSetupModal`.

## Known friction left for future sessions

- **Google sign-in account picker** — `AuthContext.tsx:signInWithGoogle` doesn't pass `queryParams: { prompt: 'select_account' }`, so users with multiple Google accounts can't switch. Patch is 3 lines. Not shipped here.
- **Success page retry copy** — already improved in prior session but webhook-race can still produce a 30-second wait; consider a push-based event stream later.
- **Trial-reminder email scaffolding** was removed in `7b803b9` to stop confusion; real reminder flow not yet built.

## Owed to Fabiana

Direct personal email from José, not an automated apology. Acknowledge each of the four bugs by name, make it explicit they're fixed and deployed (link to commits), offer a free month of Pro on the house, invite her to DM directly if anything else breaks. She was the first real stress test of this funnel — she deserves a real response.

## For the next Claude Code session

If you're picking this up cold:

1. All the fixes above are in `main` at `86cfde5`. Vercel auto-deploys to `app.pitcht.us`.
2. The audit agent is warn-only — monitor it for the next 7 days, then flip to failing.
3. Sentry should now catch any recurrence of the save-path drop. Tag: `area:interview, subsystem:save-recording`.
4. If you re-open the paywall bypass, check **both** call sites — `src/app/analysis/page.tsx:~1215` and `src/app/session/[id]/page.tsx:~680`. They must stay in sync.
5. `repeatSession` must always regenerate UUIDs. Any new caller that bypasses that helper will re-introduce bug #2.
6. The active audit doc is `CONVERSION_AUDIT_APRIL_2026.md`. Root Claude memory is `CLAUDE.md` + the subdirectory ones in `src/app/api/`, `src/components/`, `src/services/`, `electron/`.
