-- Cleanup Invalid Subscription for joseartigas281@gmail.com
-- Copy and paste each section into Supabase SQL Editor one at a time

-- ============================================
-- STEP 1: Verify Your Data is Safe
-- ============================================

-- Check your account exists
SELECT id, email, created_at
FROM auth.users
WHERE email = 'joseartigas281@gmail.com';

-- Count your sessions (should show your session count)
SELECT COUNT(*) as total_sessions
FROM sessions
WHERE user_id = (SELECT id FROM auth.users WHERE email = 'joseartigas281@gmail.com');

-- Count your recordings (should show your recording count)
SELECT COUNT(*) as total_recordings
FROM recordings
WHERE session_id IN (
  SELECT id FROM sessions
  WHERE user_id = (SELECT id FROM auth.users WHERE email = 'joseartigas281@gmail.com')
);

-- ============================================
-- STEP 2: View the Invalid Subscription
-- ============================================

SELECT
  s.id as subscription_id,
  s.user_id,
  u.email,
  s.stripe_customer_id,
  s.stripe_subscription_id,
  s.status,
  s.created_at
FROM subscriptions s
LEFT JOIN auth.users u ON u.id = s.user_id
WHERE u.email = 'joseartigas281@gmail.com';

-- Expected: Should show stripe_customer_id = 'cus_TX8gQ7wdVm8UUf'

-- ============================================
-- STEP 3: Delete ONLY the Invalid Subscription
-- ============================================

DELETE FROM subscriptions
WHERE user_id = (SELECT id FROM auth.users WHERE email = 'joseartigas281@gmail.com');

-- This deletes ONLY from the subscriptions table
-- Does NOT touch sessions, recordings, or your account

-- ============================================
-- STEP 4: Verify Deletion & Confirm Data Still Exists
-- ============================================

-- Confirm subscription is gone (should show 0)
SELECT COUNT(*) as subscriptions_remaining
FROM subscriptions
WHERE user_id = (SELECT id FROM auth.users WHERE email = 'joseartigas281@gmail.com');

-- Confirm sessions are STILL THERE (should match Step 1 count)
SELECT COUNT(*) as sessions_still_exist
FROM sessions
WHERE user_id = (SELECT id FROM auth.users WHERE email = 'joseartigas281@gmail.com');

-- Confirm recordings are STILL THERE (should match Step 1 count)
SELECT COUNT(*) as recordings_still_exist
FROM recordings
WHERE session_id IN (
  SELECT id FROM sessions
  WHERE user_id = (SELECT id FROM auth.users WHERE email = 'joseartigas281@gmail.com')
);

-- Confirm account is STILL THERE
SELECT email, created_at
FROM auth.users
WHERE email = 'joseartigas281@gmail.com';

-- ============================================
-- DONE! Now proceed to Step 5 in the app:
-- ============================================
-- 1. Go to Pricing page
-- 2. Click "Start 7-Day Free Trial" or "Subscribe Now"
-- 3. Complete Stripe checkout
-- 4. Go to Settings → "Manage Subscription & Billing"
-- 5. Billing portal should now work! ✅
