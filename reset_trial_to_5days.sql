-- Reset all existing users to the new 5-day trial terms.
--
-- What this does:
--   1. Updates trial_end in user metadata to be: signup_date + 5 days
--      (instead of the previous 7 days)
--   2. Cancels any 'trialing' subscription rows (from the old Stripe trial model)
--      so the app falls back to the free-tier session count logic
--
-- Run in Supabase SQL Editor (Dashboard → SQL Editor → New Query)

-- ── Step 1: Reset trial_end in auth.users metadata ────────────────────────────
-- This re-calculates trial_end as created_at + 5 days for every user that
-- has a trial_end in their metadata (i.e. signed up via email/password).
UPDATE auth.users
SET raw_user_meta_data = raw_user_meta_data || jsonb_build_object(
  'trial_end', (created_at + interval '5 days')::text,
  'trial_start', created_at::text
)
WHERE raw_user_meta_data ? 'trial_end';

-- ── Step 2: Mark any lingering 'trialing' subscription rows as canceled ────────
-- The app no longer uses Stripe trialing rows for the free trial —
-- it uses the session count limit instead. Cancel stale rows so they
-- don't grant unlimited sessions to users who should now be on 1-session trial.
UPDATE public.subscriptions
SET
  status = 'canceled',
  canceled_at = now(),
  updated_at = now()
WHERE status = 'trialing';

-- ── Verification ──────────────────────────────────────────────────────────────
-- Run these after to confirm the reset worked:

-- Check updated metadata (should show trial_end ~5 days after created_at)
SELECT
  id,
  email,
  created_at,
  raw_user_meta_data->>'trial_end' AS trial_end
FROM auth.users
WHERE raw_user_meta_data ? 'trial_end'
ORDER BY created_at DESC
LIMIT 20;

-- Check no trialing subscriptions remain
SELECT COUNT(*) AS trialing_count FROM public.subscriptions WHERE status = 'trialing';
