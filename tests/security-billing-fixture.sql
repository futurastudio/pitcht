-- Synthetic local fixture only. Run solely in the disposable pitcht_security_test DB.
DO $$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF;
END $$;
CREATE SCHEMA auth;
-- Exercise broad inherited service defaults; the internal grant must reduce them.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO service_role;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql AS $$ SELECT current_user::text $$;
GRANT USAGE ON SCHEMA auth TO anon,authenticated,service_role;
GRANT USAGE ON SCHEMA public TO anon,authenticated,service_role;
CREATE TABLE auth.users(id uuid PRIMARY KEY);
GRANT SELECT ON auth.users TO service_role;
CREATE TABLE public.sessions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid REFERENCES auth.users(id),
  session_type text CONSTRAINT sessions_session_type_check
    CHECK (session_type IN ('job-interview','presentation','sales-pitch')),
  context text,status text,completed_at timestamptz,created_at timestamptz DEFAULT clock_timestamp());
CREATE TABLE public.questions(id uuid PRIMARY KEY,session_id uuid REFERENCES sessions(id) ON DELETE CASCADE,
  question_text text,question_type text,difficulty integer,position integer);
CREATE TABLE public.recordings(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),session_id uuid REFERENCES sessions(id) ON DELETE CASCADE,
  question_id uuid REFERENCES questions(id),video_url text,transcript text,duration integer,
  words_per_minute integer,filler_word_count integer,clarity_score integer,pacing_score integer,
  eye_contact_percentage integer,dominant_emotion text,presence_score integer);
CREATE TABLE public.analyses(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),recording_id uuid REFERENCES recordings(id) ON DELETE CASCADE,
  overall_score integer,content_score integer,communication_score integer,delivery_score integer,summary text,
  communication_patterns jsonb,strengths jsonb,improvements jsonb,next_steps jsonb,diagnosis jsonb,created_at timestamptz DEFAULT clock_timestamp());
ALTER TABLE public.analyses ADD CONSTRAINT analyses_recording_id_key UNIQUE(recording_id);
GRANT ALL ON public.sessions,public.questions,public.recordings,public.analyses TO authenticated,service_role;
INSERT INTO auth.users VALUES('11111111-1111-4111-8111-111111111111'),('22222222-2222-4222-8222-222222222222');
-- Synthetic fixture row with the owner's approved identity; no customer data.
INSERT INTO auth.users VALUES('dc869fa0-8652-4df1-bede-93a776ed70eb');
