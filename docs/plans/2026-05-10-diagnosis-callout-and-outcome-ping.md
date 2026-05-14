# Diagnosis Callout + Outcome Ping — Implementation Plan

> **Branch:** `feat/diagnosis-callout-and-outcome-ping`
> **Goal:** Add a single "one thing to fix" pattern callout to the analysis page and a 3-day post-session "how did it go?" email ping. No breaking changes. Both shipped behind feature flags.

## Architecture
- **Callout:** Extend `generateFeedback()` Claude prompt + response schema with a single `diagnosis` object (one observable pattern, transcript quote, one drill). New UI block at top of `/analysis` page, behind `NEXT_PUBLIC_DIAGNOSIS_CALLOUT` flag. Existing scores/strengths/improvements remain.
- **Outcome ping:** New `session_outcomes` table. New `/api/log-outcome` endpoint (token-authenticated link from email). New `/api/cron/outcome-ping` Vercel cron (daily 10am UTC, disabled by default). Reuses existing Resend integration (raw fetch, `from: contact@pitcht.us`). New `/outcome/[token]` thank-you page.

## Tech Stack
Next.js 14 App Router, Supabase (Postgres + Auth), Claude Sonnet 4 via `@anthropic-ai/sdk`, Resend (raw fetch), Vercel cron, TypeScript, Tailwind, lucide-react icons.

## Safety Constraints
1. Branch `feat/diagnosis-callout-and-outcome-ping` only. **Never touch `main`.**
2. Both features behind flags: `NEXT_PUBLIC_DIAGNOSIS_CALLOUT`, `OUTCOME_PING_ENABLED`. Default off.
3. SQL migration written but **NOT executed** — Jose runs it manually against prod.
4. Cron registered in `vercel.json` but reads `OUTCOME_PING_ENABLED` env var — bails immediately when unset/false.
5. No real Resend sends during testing. Use `RESEND_DRY_RUN=true` env to log payload instead.
6. Every commit must `npm run build` + `npm run lint` clean.

## Pitch Pattern Taxonomy (8 observable patterns, no psychology)
Adapted for **interview answers** (job seekers, students):
1. `buried_lede` — strongest proof/result delivered after 60% of answer
2. `no_specific_example` — claim made without concrete instance ("I'm a strong communicator" with no story)
3. `metric_absent` — story told without quantified outcome
4. `hedge_cascade` — 3+ qualifiers around the key claim ("I think maybe sort of")
5. `wrong_frame` — answered a different question than asked
6. `pacing_panic` — WPM > 180 or < 90, or wide variance signaling nerves
7. `filler_overload` — filler ratio > 8% drowning the substance
8. `closing_collapse` — strong open + middle, weak/abrupt finish (no callback to question)

Claude picks the SINGLE most-impactful pattern per session, with transcript evidence.

---

## Tasks

### Task A1 — Extend feedback schema with diagnosis object
**Files:**
- Modify: `src/services/claude.ts` (the `generateFeedback` function and its prompt)
- Modify: `src/app/api/generate-feedback/route.ts` (add `diagnosis` to `GenerateFeedbackResponse`)

**Schema addition:**
```ts
diagnosis?: {
  pattern: 'buried_lede' | 'no_specific_example' | 'metric_absent' | 'hedge_cascade'
         | 'wrong_frame' | 'pacing_panic' | 'filler_overload' | 'closing_collapse';
  patternLabel: string;          // human-readable: "Buried lede"
  oneLineFix: string;            // <120 chars: "Lead with the result, then explain how you got there."
  evidenceQuote: string;         // exact span from transcript, <200 chars
  evidenceTimestamp?: number;    // seconds into recording, if Claude can infer
  drill: {
    title: string;               // "Re-record this answer starting with the outcome"
    durationMinutes: number;     // 1-5
    instructions: string;        // 2-3 sentences
  };
};
```

**Prompt addition** (append to existing Claude prompt):
> "Identify the SINGLE pattern from the following list that hurt this answer most. Quote the exact transcript span as evidence. Be specific and observable — never speculate about psychology or personality. Patterns: [list with 1-line definitions]. Return as `diagnosis` field. If no pattern clearly applies (answer was strong), omit `diagnosis` entirely."

**Verification:** Type-check passes. Existing test sessions still produce valid feedback. New `diagnosis` field present when issues exist.

### Task A2 — Add diagnosis taxonomy module
**Files:**
- Create: `src/utils/diagnosisTaxonomy.ts` — exports the 8 pattern definitions, labels, and default drill templates as a typed constant. Used by both Claude prompt builder and UI to render labels/icons consistently.

### Task B1 — Build DiagnosisCallout React component
**Files:**
- Create: `src/components/DiagnosisCallout.tsx`
- Modify: `src/app/analysis/page.tsx` (insert callout near top of results section, behind `process.env.NEXT_PUBLIC_DIAGNOSIS_CALLOUT === 'true'` guard)

**Component contract:**
```tsx
<DiagnosisCallout
  diagnosis={feedback.diagnosis}
  onPracticeClick={() => router.push(`/interview?repeat=${recordingId}`)}
/>
```

**Visual spec (must match existing dark Pitcht aesthetic):**
- Card: `bg-zinc-900/50 border border-zinc-800 rounded-2xl p-6 mb-6`
- Top label: `text-xs uppercase tracking-wider text-amber-400` reading "🎯 The one thing to fix"
- Pattern title: `text-2xl font-bold text-white`
- One-line fix: `text-zinc-300 text-base mt-2`
- Evidence quote in italic blockquote: `border-l-2 border-zinc-700 pl-4 italic text-zinc-400 my-4`
- Drill button: white background, black text, rounded-lg, matches existing CTA style on the page
- Renders nothing when `diagnosis` is undefined

**Verification:** Component renders gracefully when diagnosis is missing. Tailwind classes match existing analysis-page card styles. Mobile responsive (stack on <640px).

### Task C1 — SQL migration for session_outcomes table
**Files:**
- Create: `add_session_outcomes_table.sql` (root, matches existing SQL file convention)

**Schema:**
```sql
create table if not exists session_outcomes (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  outcome text check (outcome in ('offer', 'next_round', 'rejected', 'no_response', 'pending')),
  notes text,
  email_token text unique,           -- single-use token from email link
  email_sent_at timestamptz,
  responded_at timestamptz,
  created_at timestamptz default now()
);

create index idx_session_outcomes_user on session_outcomes(user_id);
create index idx_session_outcomes_token on session_outcomes(email_token);

alter table session_outcomes enable row level security;

create policy "Users can read own outcomes" on session_outcomes
  for select using (auth.uid() = user_id);
create policy "Users can update own outcomes" on session_outcomes
  for update using (auth.uid() = user_id);
-- Inserts/updates from server use service role
```

**Verification:** SQL syntactically valid. Includes RLS. Token column for stateless email link auth.

### Task C2 — POST /api/log-outcome endpoint
**Files:**
- Create: `src/app/api/log-outcome/route.ts`

**Contract:**
```
POST /api/log-outcome
Body: { token: string, outcome: 'offer'|'next_round'|'rejected'|'no_response', notes?: string }
Response: { success: true } | { error }
```
- Look up row by `email_token`, verify exists and `responded_at` is null
- Update outcome, set `responded_at = now()`
- Uses service role client (token IS the auth)
- Rate limit: 20/hr per IP via existing `rateLimiter` middleware
- Returns 404 for invalid/expired tokens

### Task C3 — /outcome/[token] thank-you landing page
**Files:**
- Create: `src/app/outcome/[token]/page.tsx`

Lightweight server component. Renders 4 buttons (Got an offer / Next round / Rejected / No response yet) that POST to `/api/log-outcome`. After response: thank-you state with CTA back to `/interview` for the next session. Match existing dark aesthetic.

### Task D1 — Email template + Resend send helper
**Files:**
- Create: `src/services/outcomeEmail.ts` — exports `sendOutcomeEmail({ userEmail, sessionId, sessionType, token, recordedAt })`. Uses raw fetch matching `notify-signup/route.ts` pattern. Honors `RESEND_DRY_RUN=true` (logs payload, returns success without sending).
- Email template: from `Jose from Pitcht <contact@pitcht.us>`. Subject: "How did your interview go?". Dark theme matching welcome email. 4 link buttons pointing to `https://app.pitcht.us/outcome/{token}?response={offer|next_round|rejected|no_response}`. Single-tap response.

### Task D2 — /api/cron/outcome-ping cron route
**Files:**
- Create: `src/app/api/cron/outcome-ping/route.ts`
- Modify: `vercel.json` — add cron entry `{ path: '/api/cron/outcome-ping', schedule: '0 10 * * *' }`

**Cron logic:**
1. Bail immediately if `process.env.OUTCOME_PING_ENABLED !== 'true'` (return 200 with `{ skipped: true }`)
2. Verify Vercel cron auth header (`Authorization: Bearer ${process.env.CRON_SECRET}`)
3. Query sessions completed exactly 3 days ago (UTC date math) with no row in `session_outcomes`
4. For each: generate token, insert `session_outcomes` row with `email_sent_at = now()`, send email via `outcomeEmail.ts`
5. Return `{ sent: N, skipped: M }`. Errors per-row don't fail the whole run.

**Verification:** Returns `{ skipped: true }` immediately when env flag off. Manual local test with flag on + `RESEND_DRY_RUN=true` logs payloads.

### Task QA — Final integration review
**Scope:**
- All files compile, lint, build clean
- No regression in `/api/generate-feedback` for sessions where `diagnosis` is undefined
- DiagnosisCallout renders nothing without env flag
- Cron route returns 200 + skipped without env flag
- SQL file is valid Postgres
- No new Stripe/Supabase auth surfaces touched
- Visual check: take screenshot of `/analysis` page state (with mock diagnosis data) using Playwright if available
- Open PR with summary, screenshots, and explicit list of env vars Jose needs to set in Vercel before flipping flags on

## Env Vars (to set in Vercel only when ready to enable)
- `NEXT_PUBLIC_DIAGNOSIS_CALLOUT=true` — turn on UI block
- `OUTCOME_PING_ENABLED=true` — turn on cron sends
- `RESEND_DRY_RUN=false` — already implicit; set `=true` to test cron without sending
- `CRON_SECRET=<random>` — Vercel cron auth (generate with `openssl rand -hex 32`)

## Non-Goals (explicitly NOT in this PR)
- Outcome correlation analytics ("80+ scores closed 3x more often") — defer until 50+ data points
- Landing page rewrite — separate repo, separate PR
- Pitch-type variants beyond existing (job-interview/internship/presentation already exist) — existing prompt branches are sufficient
