-- ============================================
-- RLS VERIFICATION SCRIPT
-- ============================================
-- Run this in Supabase SQL Editor AFTER applying add_rls_policies.sql
-- This will verify that all Row Level Security policies are correctly applied

-- ============================================
-- STEP 1: Verify RLS is Enabled on All Tables
-- ============================================
-- Expected: All 5 tables should show rowsecurity = true

SELECT
  tablename,
  rowsecurity,
  CASE
    WHEN rowsecurity THEN '✅ ENABLED'
    ELSE '❌ DISABLED'
  END as status
FROM pg_tables
WHERE schemaname = 'public'
AND tablename IN ('sessions', 'questions', 'recordings', 'analyses', 'subscriptions')
ORDER BY tablename;

-- ============================================
-- STEP 2: Count Policies Per Table
-- ============================================
-- Expected counts:
-- sessions: 5 policies (read, create, update, delete, service_role)
-- questions: 3 policies (read, create, service_role)
-- recordings: 5 policies (read, create, update, delete, service_role)
-- analyses: 3 policies (read, create, service_role)
-- subscriptions: 3 policies (read, update, service_role)

SELECT
  tablename,
  COUNT(*) as policy_count,
  CASE tablename
    WHEN 'sessions' THEN CASE WHEN COUNT(*) = 5 THEN '✅ CORRECT' ELSE '❌ MISSING POLICIES' END
    WHEN 'questions' THEN CASE WHEN COUNT(*) = 3 THEN '✅ CORRECT' ELSE '❌ MISSING POLICIES' END
    WHEN 'recordings' THEN CASE WHEN COUNT(*) = 5 THEN '✅ CORRECT' ELSE '❌ MISSING POLICIES' END
    WHEN 'analyses' THEN CASE WHEN COUNT(*) = 3 THEN '✅ CORRECT' ELSE '❌ MISSING POLICIES' END
    WHEN 'subscriptions' THEN CASE WHEN COUNT(*) = 3 THEN '✅ CORRECT' ELSE '❌ MISSING POLICIES' END
  END as status
FROM pg_policies
WHERE schemaname = 'public'
AND tablename IN ('sessions', 'questions', 'recordings', 'analyses', 'subscriptions')
GROUP BY tablename
ORDER BY tablename;

-- ============================================
-- STEP 3: List All Policies (Detailed View)
-- ============================================
-- This shows every policy with its operation type

SELECT
  tablename,
  policyname,
  cmd as operation,
  CASE
    WHEN policyname LIKE '%service%' THEN '🔑 Service Role Access'
    WHEN policyname LIKE '%read%' OR cmd = 'SELECT' THEN '👁️  Read Access'
    WHEN policyname LIKE '%create%' OR cmd = 'INSERT' THEN '➕ Create Access'
    WHEN policyname LIKE '%update%' OR cmd = 'UPDATE' THEN '✏️  Update Access'
    WHEN policyname LIKE '%delete%' OR cmd = 'DELETE' THEN '🗑️  Delete Access'
    ELSE '❓ Other'
  END as policy_type
FROM pg_policies
WHERE schemaname = 'public'
AND tablename IN ('sessions', 'questions', 'recordings', 'analyses', 'subscriptions')
ORDER BY tablename, policyname;

-- ============================================
-- STEP 4: Test RLS Enforcement (CRITICAL TEST)
-- ============================================
-- Run this to verify users CANNOT access other users' data

-- Test 1: Try to read all sessions (should only see your own)
-- If you see sessions from other users, RLS is NOT working!
SELECT
  COUNT(*) as my_sessions_count,
  'If this shows sessions from other users, RLS has FAILED' as warning
FROM sessions;

-- Test 2: Check session ownership
-- All returned sessions should have user_id matching auth.uid()
SELECT
  id,
  user_id,
  CASE
    WHEN user_id = auth.uid() THEN '✅ My Session'
    ELSE '❌ OTHER USER SESSION - RLS FAILED!'
  END as ownership_check
FROM sessions
LIMIT 10;

-- ============================================
-- STEP 5: Verify Subscriptions Table Security
-- ============================================
-- This is critical for payment security

-- Check subscriptions are secured
SELECT
  COUNT(*) as accessible_subscriptions,
  'You should only see your own subscriptions' as note
FROM subscriptions;

-- Verify subscription ownership
SELECT
  id,
  user_id,
  status,
  CASE
    WHEN user_id = auth.uid() THEN '✅ My Subscription'
    ELSE '❌ OTHER USER SUBSCRIPTION - RLS FAILED!'
  END as ownership_check
FROM subscriptions;

-- ============================================
-- INTERPRETATION GUIDE
-- ============================================

/*
STEP 1: All 5 tables should show "✅ ENABLED"
- If any show "❌ DISABLED", run add_rls_policies.sql again

STEP 2: Policy counts should match expected
- sessions: 5 policies
- questions: 3 policies
- recordings: 5 policies
- analyses: 3 policies
- subscriptions: 3 policies

STEP 3: Should show all policy details
- Look for "Service Role Access" policies on each table
- Verify each table has appropriate READ/CREATE/UPDATE/DELETE policies

STEP 4: CRITICAL SECURITY TEST
- You should ONLY see your own sessions
- If you see other users' sessions, RLS has FAILED - DO NOT LAUNCH!
- ownership_check should ALWAYS say "✅ My Session"

STEP 5: CRITICAL PAYMENT SECURITY TEST
- You should ONLY see your own subscriptions
- If you see other users' subscriptions, RLS has FAILED - DO NOT LAUNCH!
- ownership_check should ALWAYS say "✅ My Subscription"

IF ALL TESTS PASS: ✅ Database security is correctly configured
IF ANY TEST FAILS: ❌ DO NOT LAUNCH - Fix RLS policies first
*/

-- ============================================
-- FINAL VERIFICATION
-- ============================================
-- This query should return "✅ ALL SYSTEMS SECURE"

SELECT
  CASE
    WHEN (
      SELECT COUNT(*) FROM pg_tables
      WHERE schemaname = 'public'
      AND tablename IN ('sessions', 'questions', 'recordings', 'analyses', 'subscriptions')
      AND rowsecurity = true
    ) = 5
    THEN '✅ ALL SYSTEMS SECURE - READY FOR LAUNCH'
    ELSE '❌ SECURITY INCOMPLETE - DO NOT LAUNCH'
  END as final_status;
