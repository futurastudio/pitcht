-- REVIEW PROPOSAL ONLY. Not a production migration; do not run against Pitcht.
-- Validate schema/constraints and reconcile legacy rows before an approved rollout.
BEGIN;
GRANT USAGE ON SCHEMA public TO service_role;

ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS stripe_synced_at timestamptz;
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS billing_revision bigint NOT NULL DEFAULT 0;
ALTER TABLE public.subscriptions DROP CONSTRAINT IF EXISTS subscriptions_status_check;
ALTER TABLE public.subscriptions ADD CONSTRAINT subscriptions_status_check CHECK
  (status IN ('active','trialing','past_due','canceled','incomplete','incomplete_expired','unpaid','paused'));
ALTER TABLE public.sessions ADD COLUMN IF NOT EXISTS access_expires_at timestamptz;

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
CREATE INDEX practice_completed_usage_user_id_idx ON public.practice_completed_usage(user_id);
CREATE INDEX billing_analytics_pending_idx ON public.billing_analytics_outbox(created_at)
  INCLUDE(subscription_id) WHERE delivered_at IS NULL;
CREATE INDEX billing_analytics_subscription_pending_idx ON public.billing_analytics_outbox(subscription_id)
  WHERE delivered_at IS NULL;
INSERT INTO public.practice_completed_usage(session_id,user_id,completed_at)
  SELECT id,user_id,created_at FROM public.sessions WHERE status='completed';

ALTER TABLE public.billing_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_analytics_outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_usage_windows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_operation_leases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.practice_completed_usage ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.billing_events, public.billing_analytics_outbox, public.ai_usage_windows,
  public.ai_operation_leases, public.practice_completed_usage FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.billing_events, public.billing_analytics_outbox, public.ai_usage_windows,
  public.ai_operation_leases, public.practice_completed_usage TO service_role;
REVOKE INSERT, UPDATE, DELETE ON public.subscriptions FROM anon, authenticated;
REVOKE INSERT ON public.sessions, public.questions FROM anon, authenticated;
REVOKE UPDATE ON public.sessions FROM anon, authenticated;
GRANT SELECT ON public.subscriptions TO authenticated;
GRANT ALL ON public.subscriptions, public.sessions, public.questions, public.recordings, public.analyses TO service_role;

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
    RAISE EXCEPTION 'Billing revision changed' USING ERRCODE = '40001';
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
DECLARE sub public.subscriptions%ROWTYPE; used integer; active integer;
BEGIN
  SELECT * INTO sub FROM public.subscriptions WHERE user_id = p_user_id AND stripe_synced_at > clock_timestamp() - interval '72 hours'
    AND (status IN ('active','trialing') AND current_period_end > clock_timestamp()
      OR status = 'active' AND current_period_end > clock_timestamp() - interval '72 hours'
        AND stripe_synced_at > clock_timestamp() - interval '72 hours')
    ORDER BY current_period_end DESC LIMIT 1;
  SELECT count(*) INTO used FROM public.practice_completed_usage WHERE user_id = p_user_id;
  SELECT count(*) INTO active FROM public.sessions WHERE user_id = p_user_id AND status = 'in_progress'
    AND access_expires_at > clock_timestamp();
  RETURN jsonb_build_object('isPremium',coalesce(sub.status = 'active',false),'isTrialing',coalesce(sub.status = 'trialing',false),
    'trialEndsAt',CASE WHEN sub.status = 'trialing' THEN sub.current_period_end ELSE NULL END,
    'sessionsThisMonth',used,'sessionsRemaining',CASE WHEN sub.id IS NOT NULL THEN -1 ELSE greatest(0,3-used) END,
    'allowed',sub.id IS NOT NULL OR used + active < 3,
    'reason',CASE WHEN sub.id IS NULL AND used + active >= 3 THEN 'Your free sessions are used or in progress. Upgrade or finish an existing session.' ELSE NULL END);
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
      -- Transitional processing for old saved answers is deliberately bounded.
      -- Paid users are covered above; free legacy sessions must still have allowance.
      IF NOT coalesce((access->>'allowed')::boolean,false) OR owned.created_at < clock_timestamp() - interval '24 hours' THEN
        RETURN jsonb_build_object('allowed',false,'reason','quota_exhausted');
      END IF;
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
  public.practice_access_status(uuid), public.consume_ai_budget(uuid,text,uuid),
  public.create_practice_session(uuid,text,text,jsonb), public.preserve_billing_binding(),
  public.record_practice_completion() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sync_billing_subscription(jsonb,bigint,text,bigint,jsonb),
  public.practice_access_status(uuid), public.consume_ai_budget(uuid,text,uuid),
  public.create_practice_session(uuid,text,text,jsonb), public.preserve_billing_binding(),
  public.record_practice_completion() TO service_role;

-- Preflight duplicates first. This proposal must fail instead of deleting customer analyses.
CREATE UNIQUE INDEX IF NOT EXISTS analyses_recording_id_unique ON public.analyses(recording_id);
COMMIT;
