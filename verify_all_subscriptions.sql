-- Find All Invalid Subscriptions (Comprehensive Check)
-- Run this in Supabase SQL Editor to identify any subscriptions with
-- customer IDs that don't exist in your current Stripe environment

-- IMPORTANT: This query will show ALL subscriptions in your database
-- Review carefully before deleting anything

-- Step 1: View all current subscriptions with user details
SELECT
  s.id as subscription_id,
  s.user_id,
  u.email as user_email,
  s.stripe_customer_id,
  s.stripe_subscription_id,
  s.status,
  s.created_at,
  s.current_period_end,
  -- Flag potential test customer IDs (these start with cus_ but your app is using live keys)
  CASE
    WHEN s.stripe_customer_id LIKE 'cus_test_%' THEN '⚠️  TEST CUSTOMER ID'
    WHEN s.stripe_customer_id LIKE 'cus_%' THEN 'Live customer ID format'
    ELSE 'Unknown format'
  END as customer_id_type
FROM subscriptions s
LEFT JOIN auth.users u ON u.id = s.user_id
ORDER BY s.created_at DESC;

-- Step 2: Find subscriptions where user no longer exists
-- (Orphaned subscriptions)
SELECT
  s.id as subscription_id,
  s.user_id,
  s.stripe_customer_id,
  s.status,
  'User deleted but subscription remains' as issue
FROM subscriptions s
LEFT JOIN auth.users u ON u.id = s.user_id
WHERE u.id IS NULL;

-- Step 3: Find duplicate subscriptions for same user
-- (Users should only have one active subscription)
SELECT
  user_id,
  COUNT(*) as subscription_count,
  STRING_AGG(stripe_customer_id, ', ') as customer_ids,
  STRING_AGG(status, ', ') as statuses
FROM subscriptions
GROUP BY user_id
HAVING COUNT(*) > 1;

-- Step 4: Find subscriptions with specific invalid customer ID
-- (The one we know is invalid from the error)
SELECT
  s.id as subscription_id,
  s.user_id,
  u.email as user_email,
  s.stripe_customer_id,
  s.status
FROM subscriptions s
LEFT JOIN auth.users u ON u.id = s.user_id
WHERE s.stripe_customer_id = 'cus_TX8gQ7wdVm8UUf';

-- Step 5: CLEANUP SCRIPT (commented out for safety)
-- Only run this after reviewing the results above

-- Delete subscriptions with invalid customer ID 'cus_TX8gQ7wdVm8UUf'
-- DELETE FROM subscriptions
-- WHERE stripe_customer_id = 'cus_TX8gQ7wdVm8UUf';

-- Delete orphaned subscriptions (where user no longer exists)
-- DELETE FROM subscriptions
-- WHERE user_id NOT IN (SELECT id FROM auth.users);

-- Delete duplicate subscriptions (keep only the most recent)
-- DELETE FROM subscriptions s1
-- WHERE EXISTS (
--   SELECT 1 FROM subscriptions s2
--   WHERE s2.user_id = s1.user_id
--   AND s2.created_at > s1.created_at
-- );

-- Step 6: Verify cleanup
-- Run this after cleanup to confirm database is clean
-- SELECT COUNT(*) as total_subscriptions FROM subscriptions;
-- SELECT COUNT(DISTINCT user_id) as unique_users_with_subscriptions FROM subscriptions;
