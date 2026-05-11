-- ============================================
-- Session Outcomes Table Migration
-- ============================================
-- Purpose: Creates the session_outcomes table that tracks the result
-- (offer, next_round, rejected, etc.) of each interview session.
-- Rows are inserted by the /api/cron/outcome-ping server-side cron via
-- service role. Users update their own outcome via a single-use email
-- token link; no direct client-side INSERT is permitted.
--
-- When to run: Manually in the Supabase SQL Editor after the
--   feat/diagnosis-callout-and-outcome-ping PR is merged to main.
--   Do NOT run against production until Jose has reviewed and the
--   OUTCOME_PING_ENABLED env var is ready to be flipped on.
--
-- Idempotent: Safe to re-run. Uses CREATE TABLE IF NOT EXISTS,
--   CREATE INDEX IF NOT EXISTS, and DROP POLICY IF EXISTS before
--   every CREATE POLICY so repeated runs produce no errors.
-- ============================================

-- ============================================
-- TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS public.session_outcomes (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id     UUID        NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  user_id        UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  outcome        TEXT        CHECK (outcome IN ('offer', 'next_round', 'rejected', 'no_response', 'pending')),
  notes          TEXT,
  email_token    TEXT        UNIQUE,           -- single-use token from email link
  email_sent_at  TIMESTAMPTZ,
  responded_at   TIMESTAMPTZ,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- INDEXES
-- ============================================

-- Faster lookups when querying all outcomes for a user
CREATE INDEX IF NOT EXISTS idx_session_outcomes_user  ON public.session_outcomes (user_id);

-- Faster lookup when validating/consuming an email token
CREATE INDEX IF NOT EXISTS idx_session_outcomes_token ON public.session_outcomes (email_token);

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================

-- Enable RLS
ALTER TABLE public.session_outcomes ENABLE ROW LEVEL SECURITY;

-- Policy: Users can read their own outcomes
DROP POLICY IF EXISTS "Users can read own outcomes" ON public.session_outcomes;
CREATE POLICY "Users can read own outcomes" ON public.session_outcomes
  FOR SELECT
  USING (auth.uid() = user_id);

-- Policy: Users can update their own outcomes (record response via email link)
DROP POLICY IF EXISTS "Users can update own outcomes" ON public.session_outcomes;
CREATE POLICY "Users can update own outcomes" ON public.session_outcomes
  FOR UPDATE
  USING (auth.uid() = user_id);

-- NOTE: No INSERT policy for authenticated users.
-- Inserts are performed exclusively by the /api/cron/outcome-ping route
-- running under the Supabase service role, which bypasses RLS.
