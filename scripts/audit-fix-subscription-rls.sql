-- ============================================================================
-- QW4 / Finding S2 — Remove self-service subscription escalation
-- ============================================================================
--
-- PROBLEM
-- `add_rls_policies.sql` (lines 191-196) grants logged-in users UPDATE on their
-- own `subscriptions` row:
--
--     CREATE POLICY "Users can update own subscriptions"
--     ON subscriptions FOR UPDATE
--     USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
--
-- Combined with canUserStartSession() granting unlimited access whenever
-- status = 'active', any ex-subscriber (who owns a 'canceled' row) can flip it
-- back to 'active' and extend current_period_end from the browser anon client —
-- i.e. grant themselves free unlimited Pro.
--
-- Subscriptions are provisioned exclusively by the Stripe webhook + the
-- verify-subscription endpoint, BOTH of which use the service-role client.
-- The "Service role full access to subscriptions" policy already covers those.
-- So users never need UPDATE on this table; removing it closes the hole with
-- zero impact on legitimate provisioning.
--
-- ----------------------------------------------------------------------------
-- HOW TO RUN (Supabase SQL Editor)
-- ----------------------------------------------------------------------------
-- 1. Run STEP 1 first and read the output. This tells you which policies are
--    actually live (the two SQL files in this repo disagree — see Open Q-A).
--      - If you see a row with cmd = 'UPDATE' named "Users can update own
--        subscriptions", the hole is OPEN and STEP 2 will close it.
--      - If you do NOT see that row, the hole is already absent; STEP 2 is a
--        harmless no-op (DROP ... IF EXISTS).
-- 2. Run STEP 2 to drop the policy (and ensure service-role access exists).
-- 3. Run STEP 3 to confirm the final state: a SELECT policy + a service-role
--    ALL policy, and NO user-facing UPDATE/INSERT/DELETE policy.
-- 4. Smoke-test: complete a real Stripe test checkout and confirm the webhook
--    still provisions Pro (it uses the service-role client, so it will).
-- ============================================================================


-- STEP 1 — Inspect current subscription policies (READ ONLY) -----------------
SELECT policyname, cmd, roles, qual AS using_expr, with_check
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'subscriptions'
ORDER BY cmd, policyname;


-- STEP 2 — Remove the user-facing UPDATE policy ------------------------------
-- Safe to run regardless of STEP 1 output (IF EXISTS).
DROP POLICY IF EXISTS "Users can update own subscriptions" ON subscriptions;

-- Defense in depth: make sure the service role still has full access so the
-- Stripe webhook + verify-subscription endpoint keep provisioning normally.
DROP POLICY IF EXISTS "Service role full access to subscriptions" ON subscriptions;
CREATE POLICY "Service role full access to subscriptions"
ON subscriptions FOR ALL
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');


-- STEP 3 — Verify final state (READ ONLY) ------------------------------------
-- Expected after this script:
--   * "Users can read own subscriptions"          | SELECT
--   * "Service role full access to subscriptions" | ALL
--   * (NO user-facing UPDATE / INSERT / DELETE policy)
SELECT policyname, cmd, roles
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'subscriptions'
ORDER BY cmd, policyname;
