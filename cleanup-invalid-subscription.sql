-- Cleanup Invalid Stripe Subscription
-- Run this in Supabase SQL Editor to remove the invalid subscription record
-- that's preventing billing portal access

-- Step 1: Find your user ID and check current subscriptions
SELECT
  u.id as user_id,
  u.email,
  s.id as subscription_id,
  s.stripe_customer_id,
  s.status,
  s.created_at
FROM auth.users u
LEFT JOIN subscriptions s ON s.user_id = u.id
WHERE u.email = 'joseartigas281@gmail.com';

-- Expected result: You should see a subscription with stripe_customer_id = 'cus_TX8gQ7wdVm8UUf'
-- This is a TEST customer ID that doesn't exist in your LIVE Stripe account

-- Step 2: Delete the invalid subscription(s)
-- IMPORTANT: Only run this after verifying the result from Step 1
-- Replace 'YOUR_USER_ID_HERE' with the actual user_id from Step 1

-- DELETE FROM subscriptions
-- WHERE user_id = 'YOUR_USER_ID_HERE';

-- Step 3: Verify cleanup was successful
-- SELECT * FROM subscriptions WHERE user_id = 'YOUR_USER_ID_HERE';
-- Expected result: No rows (empty result)

-- After cleanup, you can:
-- 1. Go to the Pricing page (/pricing)
-- 2. Subscribe to a plan - this will create a fresh subscription with a valid LIVE Stripe customer ID
-- 3. The billing portal should then work correctly
