-- ============================================
-- Row Level Security (RLS) Policies
-- ============================================
-- Run this in Supabase SQL Editor to secure all tables
--
-- This ensures users can only access their own data through
-- the Supabase client, even if there's a bug in application code.
--
-- CRITICAL: This is the main security layer for your database!

-- ============================================
-- SESSIONS TABLE
-- ============================================

-- Enable RLS
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;

-- Policy: Users can read their own sessions
DROP POLICY IF EXISTS "Users can read own sessions" ON sessions;
CREATE POLICY "Users can read own sessions"
ON sessions FOR SELECT
USING (auth.uid() = user_id);

-- Policy: Users can create their own sessions
DROP POLICY IF EXISTS "Users can create own sessions" ON sessions;
CREATE POLICY "Users can create own sessions"
ON sessions FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Policy: Users can update their own sessions
DROP POLICY IF EXISTS "Users can update own sessions" ON sessions;
CREATE POLICY "Users can update own sessions"
ON sessions FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Policy: Users can delete their own sessions
DROP POLICY IF EXISTS "Users can delete own sessions" ON sessions;
CREATE POLICY "Users can delete own sessions"
ON sessions FOR DELETE
USING (auth.uid() = user_id);

-- Policy: Service role has full access (for backend operations)
DROP POLICY IF EXISTS "Service role full access to sessions" ON sessions;
CREATE POLICY "Service role full access to sessions"
ON sessions FOR ALL
USING (auth.role() = 'service_role');

-- ============================================
-- QUESTIONS TABLE
-- ============================================

-- Enable RLS
ALTER TABLE questions ENABLE ROW LEVEL SECURITY;

-- Policy: Users can read questions from their own sessions
DROP POLICY IF EXISTS "Users can read own questions" ON questions;
CREATE POLICY "Users can read own questions"
ON questions FOR SELECT
USING (
  session_id IN (
    SELECT id FROM sessions WHERE user_id = auth.uid()
  )
);

-- Policy: Users can create questions in their own sessions
DROP POLICY IF EXISTS "Users can create own questions" ON questions;
CREATE POLICY "Users can create own questions"
ON questions FOR INSERT
WITH CHECK (
  session_id IN (
    SELECT id FROM sessions WHERE user_id = auth.uid()
  )
);

-- Policy: Service role has full access
DROP POLICY IF EXISTS "Service role full access to questions" ON questions;
CREATE POLICY "Service role full access to questions"
ON questions FOR ALL
USING (auth.role() = 'service_role');

-- ============================================
-- RECORDINGS TABLE
-- ============================================

-- Enable RLS
ALTER TABLE recordings ENABLE ROW LEVEL SECURITY;

-- Policy: Users can read recordings from their own sessions
DROP POLICY IF EXISTS "Users can read own recordings" ON recordings;
CREATE POLICY "Users can read own recordings"
ON recordings FOR SELECT
USING (
  session_id IN (
    SELECT id FROM sessions WHERE user_id = auth.uid()
  )
);

-- Policy: Users can create recordings in their own sessions
DROP POLICY IF EXISTS "Users can create own recordings" ON recordings;
CREATE POLICY "Users can create own recordings"
ON recordings FOR INSERT
WITH CHECK (
  session_id IN (
    SELECT id FROM sessions WHERE user_id = auth.uid()
  )
);

-- Policy: Users can update recordings in their own sessions
DROP POLICY IF EXISTS "Users can update own recordings" ON recordings;
CREATE POLICY "Users can update own recordings"
ON recordings FOR UPDATE
USING (
  session_id IN (
    SELECT id FROM sessions WHERE user_id = auth.uid()
  )
)
WITH CHECK (
  session_id IN (
    SELECT id FROM sessions WHERE user_id = auth.uid()
  )
);

-- Policy: Users can delete recordings from their own sessions
DROP POLICY IF EXISTS "Users can delete own recordings" ON recordings;
CREATE POLICY "Users can delete own recordings"
ON recordings FOR DELETE
USING (
  session_id IN (
    SELECT id FROM sessions WHERE user_id = auth.uid()
  )
);

-- Policy: Service role has full access
DROP POLICY IF EXISTS "Service role full access to recordings" ON recordings;
CREATE POLICY "Service role full access to recordings"
ON recordings FOR ALL
USING (auth.role() = 'service_role');

-- ============================================
-- ANALYSES TABLE
-- ============================================

-- Enable RLS
ALTER TABLE analyses ENABLE ROW LEVEL SECURITY;

-- Policy: Users can read analyses for their own recordings
DROP POLICY IF EXISTS "Users can read own analyses" ON analyses;
CREATE POLICY "Users can read own analyses"
ON analyses FOR SELECT
USING (
  recording_id IN (
    SELECT r.id FROM recordings r
    JOIN sessions s ON r.session_id = s.id
    WHERE s.user_id = auth.uid()
  )
);

-- Policy: Users can create analyses for their own recordings
DROP POLICY IF EXISTS "Users can create own analyses" ON analyses;
CREATE POLICY "Users can create own analyses"
ON analyses FOR INSERT
WITH CHECK (
  recording_id IN (
    SELECT r.id FROM recordings r
    JOIN sessions s ON r.session_id = s.id
    WHERE s.user_id = auth.uid()
  )
);

-- Policy: Service role has full access
DROP POLICY IF EXISTS "Service role full access to analyses" ON analyses;
CREATE POLICY "Service role full access to analyses"
ON analyses FOR ALL
USING (auth.role() = 'service_role');

-- ============================================
-- SUBSCRIPTIONS TABLE
-- ============================================

-- Enable RLS
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

-- Policy: Users can read their own subscriptions
DROP POLICY IF EXISTS "Users can read own subscriptions" ON subscriptions;
CREATE POLICY "Users can read own subscriptions"
ON subscriptions FOR SELECT
USING (auth.uid() = user_id);

-- Policy: Users can update their own subscriptions (for status changes)
DROP POLICY IF EXISTS "Users can update own subscriptions" ON subscriptions;
CREATE POLICY "Users can update own subscriptions"
ON subscriptions FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Policy: Service role has full access (for Stripe webhooks)
DROP POLICY IF EXISTS "Service role full access to subscriptions" ON subscriptions;
CREATE POLICY "Service role full access to subscriptions"
ON subscriptions FOR ALL
USING (auth.role() = 'service_role');

-- NOTE: Users should NOT be able to INSERT or DELETE subscriptions directly
-- These operations should only happen via Stripe webhooks using service_role

-- ============================================
-- VERIFICATION QUERIES
-- ============================================
-- Run these to verify RLS is enabled and policies are created

-- Check RLS is enabled on all tables
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
AND tablename IN ('sessions', 'questions', 'recordings', 'analyses', 'subscriptions')
ORDER BY tablename;

-- Check all policies created
SELECT schemaname, tablename, policyname, cmd, qual
FROM pg_policies
WHERE schemaname = 'public'
AND tablename IN ('sessions', 'questions', 'recordings', 'analyses', 'subscriptions')
ORDER BY tablename, policyname;

-- ✅ Done! Your database tables are now secured with Row Level Security.
