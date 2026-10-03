-- Atomic public-schema cutover. See ATOMIC-CUTOVER.md before execution.
-- Requires candidate-only app admission control and drained legacy server writers.
-- One transaction; no Storage/Auth alteration, object restoration, or live overlap.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
SET LOCAL idle_in_transaction_session_timeout = '15s';
-- Fail rather than silently backfill a policy-filtered subset (including FORCE RLS).
SET LOCAL row_security = off;

-- Acquire the strongest locks up front, before reading the completion baseline.
-- FK checks/history reads/recording inserts may queue briefly behind these locks.
-- Fence child metadata writes first: otherwise an INSERT can hold a recordings
-- write lock while waiting on sessions and deadlock the new lease table's FK DDL.
LOCK TABLE public.analyses, public.recordings IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE public.sessions, public.questions, public.subscriptions IN ACCESS EXCLUSIVE MODE;

DO $preflight$
DECLARE rel text; obj text;
BEGIN
  IF to_regclass('public.security_billing_cutover') IS NOT NULL THEN
    RAISE EXCEPTION 'Cutover already applied; use forward repair, never rerun to extend access';
  END IF;
  FOREACH rel IN ARRAY ARRAY['sessions','questions','subscriptions','recordings','analyses'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_class c WHERE c.oid=to_regclass('public.'||rel)
        AND c.relkind='r' AND c.relrowsecurity
        AND (pg_has_role(current_user,c.relowner,'USAGE')
          OR (SELECT rolsuper FROM pg_roles WHERE rolname=current_user))
    ) THEN RAISE EXCEPTION 'Expected owned regular RLS table: public.%',rel; END IF;
  END LOOP;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role' AND rolbypassrls) THEN
    RAISE EXCEPTION 'service_role must retain platform BYPASSRLS';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname IN ('anon','authenticated') AND (rolsuper OR rolbypassrls)) THEN
    RAISE EXCEPTION 'Client role bypasses RLS';
  END IF;
  -- This is deliberately a one-shot baseline migration, not an expand upgrader.
  IF EXISTS (SELECT 1 FROM pg_attribute WHERE NOT attisdropped AND
      (attrelid='public.sessions'::regclass AND attname='access_expires_at'
       OR attrelid='public.subscriptions'::regclass AND attname IN ('stripe_synced_at','billing_revision'))) THEN
    RAISE EXCEPTION 'Unexpected preexisting entitlement columns; reconcile a reviewed forward migration';
  END IF;
  FOREACH obj IN ARRAY ARRAY['billing_events','billing_analytics_outbox','ai_usage_windows',
      'ai_operation_leases','practice_completed_usage','internal_test_entitlements'] LOOP
    IF to_regclass('public.'||obj) IS NOT NULL THEN
      RAISE EXCEPTION 'Unexpected preexisting cutover relation: %',obj;
    END IF;
  END LOOP;
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname IN ('preserve_billing_binding',
      'record_practice_completion','internal_test_access','sync_billing_subscription',
      'practice_access_status','consume_ai_budget','create_practice_session')) THEN
    RAISE EXCEPTION 'Unexpected preexisting cutover function';
  END IF;
  IF EXISTS (SELECT 1 FROM public.subscriptions GROUP BY stripe_customer_id
      HAVING count(DISTINCT user_id)>1) THEN
    RAISE EXCEPTION 'Conflicting customer ownership; reconcile without changing immutable bindings';
  END IF;
  IF EXISTS (SELECT 1 FROM public.sessions WHERE user_id IS NULL OR created_at IS NULL) THEN
    RAISE EXCEPTION 'Session ownership/creation baseline is incomplete';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id='dc869fa0-8652-4df1-bede-93a776ed70eb') THEN
    RAISE EXCEPTION 'Approved internal-test owner is absent';
  END IF;
END $preflight$;

-- Timestamp is captured only after prior writers have completed and locks are held.
-- No application role can edit this marker or renew the migration's access window.
CREATE TABLE public.security_billing_cutover (
  id text PRIMARY KEY CHECK (id='security_billing_2026_10_02'),
  cutover_at timestamptz NOT NULL,
  legacy_expires_at timestamptz NOT NULL,
  CHECK (legacy_expires_at=cutover_at+interval '24 hours')
);
ALTER TABLE public.security_billing_cutover ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.security_billing_cutover FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.security_billing_cutover TO service_role;
INSERT INTO public.security_billing_cutover
  SELECT 'security_billing_2026_10_02',instant,instant+interval '24 hours'
  FROM (SELECT clock_timestamp() AS instant) t;

GRANT USAGE ON SCHEMA public TO service_role;

-- Hosted Pitcht already has a valid UNIQUE(recording_id) constraint/index.
-- Preserve it rather than adding a second index; fail closed if a fixture differs.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_index i JOIN pg_attribute a
      ON a.attrelid=i.indrelid AND a.attnum=i.indkey[0]
    WHERE i.indrelid='public.analyses'::regclass AND i.indisunique AND i.indisvalid
      AND i.indisready AND i.indnkeyatts=1 AND i.indpred IS NULL AND i.indexprs IS NULL
      AND a.attname='recording_id'
  ) THEN RAISE EXCEPTION 'A valid full unique index on analyses(recording_id) is required'; END IF;
END $$;

ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS stripe_synced_at timestamptz;
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS billing_revision bigint NOT NULL DEFAULT 0;
ALTER TABLE public.subscriptions DROP CONSTRAINT IF EXISTS subscriptions_status_check;
ALTER TABLE public.subscriptions ADD CONSTRAINT subscriptions_status_check CHECK
  (status IN ('active','trialing','past_due','canceled','incomplete','incomplete_expired','unpaid','paused'));
ALTER TABLE public.sessions ADD COLUMN IF NOT EXISTS access_expires_at timestamptz;
-- The hosted constraint predates internship support. Keep historical sales pitches valid.
ALTER TABLE public.sessions DROP CONSTRAINT IF EXISTS sessions_session_type_check;
ALTER TABLE public.sessions ADD CONSTRAINT sessions_session_type_check CHECK
  (session_type IN ('job-interview','internship-interview','presentation','sales-pitch'));

CREATE TABLE public.billing_events (
  id text PRIMARY KEY, subscription_id text NOT NULL, event_created bigint NOT NULL,
  processed_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE public.billing_analytics_outbox (
  id text PRIMARY KEY, subscription_id text NOT NULL, user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  properties jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT clock_timestamp(), delivered_at timestamptz
);
CREATE TABLE public.ai_usage_windows (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE, operation text NOT NULL,
  window_seconds integer NOT NULL, bucket bigint NOT NULL, requests integer NOT NULL DEFAULT 0,
  expires_at timestamptz NOT NULL, PRIMARY KEY (user_id, operation, window_seconds, bucket)
);
CREATE TABLE public.ai_operation_leases (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE, operation text NOT NULL,
  recording_id uuid NOT NULL REFERENCES public.recordings(id) ON DELETE CASCADE,
  token uuid NOT NULL DEFAULT gen_random_uuid(), expires_at timestamptz NOT NULL,
  PRIMARY KEY (operation, recording_id)
);
-- Intentionally not FK-linked to sessions: deleting history must not reset lifetime usage.
CREATE TABLE public.practice_completed_usage (
  session_id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  completed_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
-- Separate owner-approved test entitlement. Never represents a Stripe subscription.
CREATE TABLE public.internal_test_entitlements (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE
    CHECK (user_id='dc869fa0-8652-4df1-bede-93a776ed70eb'::uuid),
  purpose text NOT NULL CHECK (purpose='owner_internal_testing'),
  granted_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  expires_at timestamptz,
  revoked_at timestamptz
);
INSERT INTO public.internal_test_entitlements(user_id,purpose)
  VALUES('dc869fa0-8652-4df1-bede-93a776ed70eb','owner_internal_testing');
CREATE INDEX practice_completed_usage_user_id_idx ON public.practice_completed_usage(user_id);
CREATE INDEX billing_analytics_pending_idx ON public.billing_analytics_outbox(created_at)
  INCLUDE(subscription_id) WHERE delivered_at IS NULL;
CREATE INDEX billing_analytics_subscription_pending_idx ON public.billing_analytics_outbox(subscription_id)
  WHERE delivered_at IS NULL;
INSERT INTO public.practice_completed_usage(session_id,user_id,completed_at)
  -- Preserve existing completed-usage semantics, including rows whose recordings
  -- may have been deleted. Any grandfathering adjustment needs separate approval.
  SELECT id,user_id,coalesce(completed_at,created_at) FROM public.sessions WHERE status='completed';

ALTER TABLE public.billing_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_analytics_outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_usage_windows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_operation_leases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.practice_completed_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.internal_test_entitlements ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.billing_events, public.billing_analytics_outbox, public.ai_usage_windows,
  public.ai_operation_leases, public.practice_completed_usage FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.internal_test_entitlements FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, UPDATE ON public.internal_test_entitlements TO service_role;
GRANT ALL ON public.billing_events, public.billing_analytics_outbox, public.ai_usage_windows,
  public.ai_operation_leases, public.practice_completed_usage TO service_role;
-- Also remove PUBLIC and destructive DDL-like privileges from the legacy broad ACLs.
-- PostgreSQL table REVOKE also removes corresponding direct column privileges.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, TRIGGER, REFERENCES ON public.subscriptions FROM PUBLIC, anon, authenticated;
REVOKE INSERT, UPDATE, TRUNCATE, TRIGGER, REFERENCES ON public.sessions FROM PUBLIC, anon, authenticated;
REVOKE INSERT, TRUNCATE, TRIGGER, REFERENCES ON public.questions FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.subscriptions TO authenticated;
GRANT ALL ON public.subscriptions, public.sessions, public.questions, public.recordings, public.analyses TO service_role;


-- Owner-approved, one-time legacy admission. No request supplies eligible IDs.
-- Completed usage is never reset: only the first three lifetime completions qualify.
-- Recent in-progress work fills the remaining lifetime allowance, oldest first.
WITH completion_order AS (
  SELECT session_id,user_id,
    row_number() OVER (PARTITION BY user_id ORDER BY completed_at,session_id) AS ordinal
  FROM public.practice_completed_usage
), eligible_shape AS (
  SELECT s.id,s.user_id,s.status,s.created_at
  FROM public.sessions s CROSS JOIN public.security_billing_cutover c
  WHERE s.created_at>=c.cutover_at-interval '24 hours' AND s.created_at<=c.cutover_at
    AND s.status IN ('completed','in_progress')
    AND (SELECT count(*) FROM public.questions q WHERE q.session_id=s.id) BETWEEN 1 AND 10
), completed AS (
  SELECT e.id FROM eligible_shape e JOIN completion_order u ON u.session_id=e.id
  WHERE e.status='completed' AND u.ordinal<=3
), pending AS (
  SELECT e.id,e.user_id,
    row_number() OVER (PARTITION BY e.user_id ORDER BY e.created_at,e.id) AS ordinal
  FROM eligible_shape e WHERE e.status='in_progress'
), eligible AS (
  SELECT id FROM completed
  UNION ALL
  SELECT p.id FROM pending p WHERE p.ordinal<=greatest(0,3-
    (SELECT count(*) FROM public.practice_completed_usage u WHERE u.user_id=p.user_id))
)
UPDATE public.sessions s SET access_expires_at=c.legacy_expires_at
FROM eligible e CROSS JOIN public.security_billing_cutover c WHERE s.id=e.id;

CREATE FUNCTION public.preserve_billing_binding() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER
SET search_path=public,pg_temp AS $$ BEGIN
  IF NEW.user_id IS DISTINCT FROM OLD.user_id OR NEW.stripe_customer_id IS DISTINCT FROM OLD.stripe_customer_id
    OR NEW.stripe_subscription_id IS DISTINCT FROM OLD.stripe_subscription_id THEN
    RAISE EXCEPTION 'Immutable billing binding' USING ERRCODE='42501';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER preserve_billing_binding BEFORE UPDATE ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.preserve_billing_binding();
CREATE FUNCTION public.record_practice_completion() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER
SET search_path=public,pg_temp AS $$ BEGIN
  IF NEW.status='completed' THEN
    PERFORM pg_advisory_xact_lock(hashtextextended(NEW.user_id::text,2));
    INSERT INTO public.practice_completed_usage(session_id,user_id)
    VALUES(NEW.id,NEW.user_id) ON CONFLICT(session_id) DO NOTHING; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER record_practice_completion AFTER INSERT OR UPDATE ON public.sessions
  FOR EACH ROW EXECUTE FUNCTION public.record_practice_completion();

-- All privileged functions are SECURITY INVOKER and executable only by service_role.
-- There are deliberately no public SECURITY DEFINER APIs.
CREATE FUNCTION public.internal_test_access(p_user_id uuid) RETURNS boolean
LANGUAGE sql SECURITY INVOKER SET search_path=public,pg_temp AS $$
  SELECT p_user_id='dc869fa0-8652-4df1-bede-93a776ed70eb'::uuid AND EXISTS (
    SELECT 1 FROM public.internal_test_entitlements WHERE user_id=p_user_id
      AND purpose='owner_internal_testing' AND revoked_at IS NULL
      AND (expires_at IS NULL OR expires_at>clock_timestamp())
  );
$$;

CREATE FUNCTION public.sync_billing_subscription(p_snapshot jsonb, p_expected_revision bigint,
  p_event_id text DEFAULT NULL, p_event_created bigint DEFAULT NULL, p_purchase jsonb DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
DECLARE
  sid text := p_snapshot->>'stripe_subscription_id';
  uid uuid := (p_snapshot->>'user_id')::uuid;
  existing public.subscriptions%ROWTYPE;
  saved public.subscriptions%ROWTYPE;
BEGIN
  IF sid IS NULL OR uid IS NULL OR p_snapshot->>'stripe_customer_id' IS NULL THEN
    RAISE EXCEPTION 'Invalid billing snapshot';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_snapshot->>'stripe_customer_id', 3));
  PERFORM pg_advisory_xact_lock(hashtextextended(sid, 1));
  SELECT * INTO existing FROM public.subscriptions WHERE stripe_subscription_id = sid FOR UPDATE;
  IF FOUND AND (existing.user_id <> uid OR existing.stripe_customer_id <> p_snapshot->>'stripe_customer_id') THEN
    RAISE EXCEPTION 'Immutable subscription binding conflict' USING ERRCODE = '42501';
  END IF;
  IF EXISTS (SELECT 1 FROM public.subscriptions WHERE stripe_customer_id = p_snapshot->>'stripe_customer_id' AND user_id <> uid) THEN
    RAISE EXCEPTION 'Customer ownership conflict' USING ERRCODE = '42501';
  END IF;
  IF p_event_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.billing_events WHERE id = p_event_id) THEN
    IF existing.id IS NULL THEN RAISE EXCEPTION 'Event has no subscription binding'; END IF;
    RETURN jsonb_build_object('result','duplicate','subscription',to_jsonb(existing));
  END IF;
  IF (existing.id IS NULL AND p_expected_revision IS NOT NULL) OR
     (existing.id IS NOT NULL AND existing.billing_revision IS DISTINCT FROM p_expected_revision) THEN
    -- Application conflict: PostgREST 13 retries 40001 with the same stale input.
    -- PT409 returns promptly so the application can re-read Stripe and revision.
    RAISE EXCEPTION 'Billing revision changed' USING ERRCODE = 'PT409';
  END IF;
  INSERT INTO public.subscriptions(user_id,stripe_subscription_id,stripe_customer_id,stripe_price_id,status,
    current_period_start,current_period_end,canceled_at,stripe_synced_at,billing_revision,updated_at)
  VALUES(uid,sid,p_snapshot->>'stripe_customer_id',p_snapshot->>'stripe_price_id',p_snapshot->>'status',
    (p_snapshot->>'current_period_start')::timestamptz,(p_snapshot->>'current_period_end')::timestamptz,
    (p_snapshot->>'canceled_at')::timestamptz,clock_timestamp(),1,clock_timestamp())
  ON CONFLICT (stripe_subscription_id) DO UPDATE SET
    stripe_price_id = EXCLUDED.stripe_price_id, status = EXCLUDED.status,
    current_period_start = EXCLUDED.current_period_start, current_period_end = EXCLUDED.current_period_end,
    canceled_at = EXCLUDED.canceled_at, stripe_synced_at = EXCLUDED.stripe_synced_at,
    billing_revision = subscriptions.billing_revision + 1, updated_at = EXCLUDED.updated_at
  RETURNING * INTO saved;
  IF saved.id IS NULL THEN RAISE EXCEPTION 'No subscription persisted'; END IF;
  IF p_event_id IS NOT NULL THEN
    INSERT INTO public.billing_events(id,subscription_id,event_created) VALUES(p_event_id,sid,p_event_created);
  END IF;
  IF p_purchase IS NOT NULL THEN
    IF p_purchase->>'session_id' IS NULL THEN RAISE EXCEPTION 'Invalid purchase identity'; END IF;
    INSERT INTO public.billing_analytics_outbox(id,subscription_id,user_id,properties)
    VALUES('checkout:' || (p_purchase->>'session_id'),sid,uid,p_purchase || jsonb_build_object(
      'subscription_id',sid,'customer_id',saved.stripe_customer_id,'user_linked',true,
      'amount_total',(p_purchase->>'amount_total')::numeric / 100)) ON CONFLICT(id) DO NOTHING;
  END IF;
  RETURN jsonb_build_object('result','applied','subscription',to_jsonb(saved));
END $$;

CREATE FUNCTION public.practice_access_status(p_user_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
DECLARE sub public.subscriptions%ROWTYPE; used integer; active integer; internal_access boolean;
BEGIN
  internal_access:=public.internal_test_access(p_user_id);
  SELECT * INTO sub FROM public.subscriptions WHERE user_id = p_user_id AND stripe_synced_at > clock_timestamp() - interval '72 hours'
    AND (status IN ('active','trialing') AND current_period_end > clock_timestamp()
      OR status = 'active' AND current_period_end > clock_timestamp() - interval '72 hours'
        AND stripe_synced_at > clock_timestamp() - interval '72 hours')
    ORDER BY current_period_end DESC LIMIT 1;
  SELECT count(*) INTO used FROM public.practice_completed_usage WHERE user_id = p_user_id;
  SELECT count(*) INTO active FROM public.sessions WHERE user_id = p_user_id AND status = 'in_progress'
    AND access_expires_at > clock_timestamp();
  RETURN jsonb_build_object('isPremium',internal_access OR coalesce(sub.status = 'active',false),
    'isTrialing',NOT internal_access AND coalesce(sub.status = 'trialing',false),
    'trialEndsAt',CASE WHEN NOT internal_access AND sub.status = 'trialing' THEN sub.current_period_end ELSE NULL END,
    'entitlementSource',CASE WHEN internal_access THEN 'internal_test' WHEN sub.id IS NOT NULL THEN 'stripe' ELSE 'free' END,
    'sessionsThisMonth',used,'sessionsRemaining',CASE WHEN internal_access OR sub.id IS NOT NULL THEN -1 ELSE greatest(0,3-used) END,
    'allowed',internal_access OR sub.id IS NOT NULL OR used + active < 3,
    'reason',CASE WHEN NOT internal_access AND sub.id IS NULL AND used + active >= 3 THEN 'Your free sessions are used or in progress. Upgrade or finish an existing session.' ELSE NULL END);
END $$;

CREATE FUNCTION public.consume_ai_budget(p_user_id uuid, p_operation text, p_recording_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
DECLARE access jsonb; owned public.sessions%ROWTYPE; lease public.ai_operation_leases%ROWTYPE;
  hourly integer; daily integer; win integer; maximum integer; bucket_id bigint; used integer; new_token uuid;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::text, 2));
  access := public.practice_access_status(p_user_id);
  IF p_operation = 'questions' AND NOT (access->>'allowed')::boolean THEN
    RETURN jsonb_build_object('allowed',false,'reason','quota_exhausted');
  END IF;
  IF p_operation IN ('transcribe','feedback') THEN
    SELECT s.* INTO owned FROM public.recordings r JOIN public.sessions s ON s.id = r.session_id
      WHERE r.id = p_recording_id AND s.user_id = p_user_id;
    IF owned.id IS NULL THEN RETURN jsonb_build_object('allowed',false,'reason','not_owned'); END IF;
    IF NOT (coalesce((access->>'isPremium')::boolean,false) OR coalesce((access->>'isTrialing')::boolean,false))
      AND NOT coalesce(owned.access_expires_at > clock_timestamp(),false) THEN
      -- Only server-admitted sessions or the fixed cutover selection can process.
      -- NULL/expired legacy rows never acquire access implicitly from spare quota.
      RETURN jsonb_build_object('allowed',false,'reason','quota_exhausted');
    END IF;
    SELECT * INTO lease FROM public.ai_operation_leases WHERE operation=p_operation AND recording_id=p_recording_id;
    IF lease.expires_at > clock_timestamp() THEN RETURN jsonb_build_object('allowed',false,'reason','work_in_progress'); END IF;
  END IF;
  CASE p_operation
    WHEN 'questions' THEN hourly:=10; daily:=20;
    WHEN 'session' THEN hourly:=10; daily:=20;
    WHEN 'transcribe' THEN hourly:=60; daily:=200;
    WHEN 'feedback' THEN hourly:=60; daily:=200;
    WHEN 'checkout' THEN hourly:=10; daily:=30;
    WHEN 'verify' THEN hourly:=30; daily:=100;
    WHEN 'notify_signup' THEN hourly:=1; daily:=1;
    ELSE RAISE EXCEPTION 'Unknown operation';
  END CASE;
  -- Check both budgets before incrementing either.
  FOREACH win IN ARRAY ARRAY[3600,86400] LOOP
    maximum:=CASE WHEN win=3600 THEN hourly ELSE daily END;
    bucket_id:=floor(extract(epoch FROM clock_timestamp())/win)::bigint;
    SELECT requests INTO used FROM public.ai_usage_windows WHERE user_id=p_user_id AND operation=p_operation
      AND window_seconds=win AND bucket=bucket_id;
    IF coalesce(used,0)>=maximum THEN RETURN jsonb_build_object('allowed',false,'reason','rate_limited'); END IF;
  END LOOP;
  FOREACH win IN ARRAY ARRAY[3600,86400] LOOP
    bucket_id:=floor(extract(epoch FROM clock_timestamp())/win)::bigint;
    INSERT INTO public.ai_usage_windows(user_id,operation,window_seconds,bucket,requests,expires_at)
    VALUES(p_user_id,p_operation,win,bucket_id,1,to_timestamp((bucket_id+2)*win))
    ON CONFLICT(user_id,operation,window_seconds,bucket) DO UPDATE SET requests=ai_usage_windows.requests+1;
  END LOOP;
  IF p_recording_id IS NOT NULL AND p_operation IN ('transcribe','feedback') THEN
    new_token:=gen_random_uuid();
    INSERT INTO public.ai_operation_leases(user_id,operation,recording_id,token,expires_at)
      VALUES(p_user_id,p_operation,p_recording_id,new_token,clock_timestamp()+interval '2 minutes')
    ON CONFLICT(operation,recording_id) DO UPDATE SET token=EXCLUDED.token,expires_at=EXCLUDED.expires_at;
  END IF;
  RETURN jsonb_build_object('allowed',true,'token',new_token);
END $$;

CREATE FUNCTION public.create_practice_session(p_user_id uuid,p_session_type text,p_context text,p_questions jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
DECLARE access jsonb; sid uuid; q jsonb; pos integer:=0; prior public.sessions%ROWTYPE;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::text, 2));
  SELECT s.* INTO prior FROM public.questions q JOIN public.sessions s ON s.id=q.session_id
    WHERE q.id=(p_questions->0->>'id')::uuid;
  IF prior.id IS NOT NULL THEN
    IF prior.user_id<>p_user_id OR prior.session_type<>p_session_type OR prior.context<>p_context OR
      (SELECT count(*) FROM public.questions WHERE session_id=prior.id)<>jsonb_array_length(p_questions) OR
      EXISTS(SELECT 1 FROM jsonb_array_elements(p_questions) requested WHERE NOT EXISTS
        (SELECT 1 FROM public.questions stored WHERE stored.session_id=prior.id AND stored.id=(requested->>'id')::uuid
          AND stored.question_text=requested->>'text' AND stored.question_type=requested->>'type'
          AND stored.difficulty=(requested->>'difficulty')::integer)) THEN
      RAISE EXCEPTION 'Session request ownership or content conflict' USING ERRCODE='42501';
    END IF;
    RETURN prior.id;
  END IF;
  access:=public.practice_access_status(p_user_id);
  IF NOT (access->>'allowed')::boolean THEN RAISE EXCEPTION 'quota_exhausted' USING ERRCODE='P0001'; END IF;
  IF p_session_type NOT IN ('job-interview','internship-interview','presentation') OR length(p_context)>20000
    OR jsonb_array_length(p_questions) NOT BETWEEN 1 AND 10 THEN RAISE EXCEPTION 'Invalid practice session'; END IF;
  INSERT INTO public.sessions(user_id,session_type,context,status,access_expires_at)
    VALUES(p_user_id,p_session_type,p_context,'in_progress',clock_timestamp()+
      CASE WHEN coalesce((access->>'isPremium')::boolean,false) OR coalesce((access->>'isTrialing')::boolean,false)
        THEN interval '14 days' ELSE interval '24 hours' END) RETURNING id INTO sid;
  FOR q IN SELECT value FROM jsonb_array_elements(p_questions) LOOP
    INSERT INTO public.questions(id,session_id,question_text,question_type,difficulty,position)
      VALUES((q->>'id')::uuid,sid,q->>'text',q->>'type',(q->>'difficulty')::integer,pos);
    pos:=pos+1;
  END LOOP;
  RETURN sid;
END $$;

REVOKE ALL ON FUNCTION public.sync_billing_subscription(jsonb,bigint,text,bigint,jsonb),
  public.internal_test_access(uuid),
  public.practice_access_status(uuid), public.consume_ai_budget(uuid,text,uuid),
  public.create_practice_session(uuid,text,text,jsonb), public.preserve_billing_binding(),
  public.record_practice_completion() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sync_billing_subscription(jsonb,bigint,text,bigint,jsonb),
  public.internal_test_access(uuid),
  public.practice_access_status(uuid), public.consume_ai_budget(uuid,text,uuid),
  public.create_practice_session(uuid,text,text,jsonb), public.preserve_billing_binding(),
  public.record_practice_completion() TO service_role;


-- Abort rather than silently accept inherited/default/column privilege surprises.
DO $permissions$
DECLARE role_name text; rel text; fn record;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['anon','authenticated'] LOOP
    IF has_table_privilege(role_name,'public.subscriptions','INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER,REFERENCES')
      OR has_any_column_privilege(role_name,'public.subscriptions','INSERT,UPDATE,REFERENCES')
      OR has_table_privilege(role_name,'public.sessions','INSERT,UPDATE,TRUNCATE,TRIGGER,REFERENCES')
      OR has_any_column_privilege(role_name,'public.sessions','INSERT,UPDATE,REFERENCES')
      OR has_table_privilege(role_name,'public.questions','INSERT,TRUNCATE,TRIGGER,REFERENCES')
      OR has_any_column_privilege(role_name,'public.questions','INSERT,REFERENCES') THEN
      RAISE EXCEPTION 'Unexpected effective legacy write privilege for %',role_name;
    END IF;
    FOREACH rel IN ARRAY ARRAY['security_billing_cutover','billing_events','billing_analytics_outbox',
        'ai_usage_windows','ai_operation_leases','practice_completed_usage','internal_test_entitlements'] LOOP
      IF has_table_privilege(role_name,'public.'||rel,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
        OR has_any_column_privilege(role_name,'public.'||rel,'SELECT,INSERT,UPDATE,REFERENCES') THEN
        RAISE EXCEPTION 'Unexpected private relation privilege: % / %',role_name,rel;
      END IF;
    END LOOP;
    FOR fn IN SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public' AND p.proname IN ('preserve_billing_binding','record_practice_completion',
        'internal_test_access','sync_billing_subscription','practice_access_status','consume_ai_budget',
        'create_practice_session') LOOP
      IF has_function_privilege(role_name,fn.oid,'EXECUTE') THEN
        RAISE EXCEPTION 'Unexpected private function privilege for %',role_name;
      END IF;
    END LOOP;
  END LOOP;
  IF has_table_privilege('service_role','public.security_billing_cutover','INSERT,UPDATE,DELETE,TRUNCATE')
    OR has_table_privilege('service_role','public.internal_test_entitlements','INSERT,DELETE,TRUNCATE') THEN
    RAISE EXCEPTION 'Server can create/erase a migration or internal entitlement';
  END IF;
  IF NOT has_table_privilege('authenticated','public.sessions','SELECT')
    OR NOT has_table_privilege('authenticated','public.sessions','DELETE')
    OR NOT has_table_privilege('authenticated','public.questions','SELECT')
    OR NOT has_table_privilege('authenticated','public.recordings','SELECT')
    OR NOT has_table_privilege('authenticated','public.recordings','INSERT')
    OR NOT has_table_privilege('authenticated','public.analyses','SELECT') THEN
    RAISE EXCEPTION 'Required existing client history/upload privileges are missing';
  END IF;
END $permissions$;

-- Delivered on commit; new RPC signatures/columns become visible together.
NOTIFY pgrst, 'reload schema';
COMMIT;
