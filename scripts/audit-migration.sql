-- Audit runs table — stores one row per full audit run
-- Run once against the production Supabase project:
--   psql "$SUPABASE_DB_URL" -f scripts/audit-migration.sql
--
-- Referenced by:
--   scripts/audit-reporter.ts  (INSERT on every run)
--   scripts/audit-digest.ts    (SELECT last 24h for email digest)

create table if not exists public.audit_runs (
  id              uuid primary key default gen_random_uuid(),
  started_at      timestamptz not null default now(),
  finished_at     timestamptz,
  trigger         text not null check (trigger in ('deploy', 'cron', 'manual')),
  commit_sha      text,
  env             text not null default 'production',
  verdict         text not null check (verdict in ('PASS', 'FAIL', 'ERROR')),
  failed_stage    text,                   -- 'health' | 'smoke' | 'e2e' | 'evaluator'
  failed_reason   text,
  checkpoints     jsonb not null default '{}'::jsonb,
  duration_ms     integer,
  artifact_url    text,                   -- link to GitHub Actions run
  account_used    text                    -- which pooled test account ran this
);

create index if not exists audit_runs_started_idx on public.audit_runs (started_at desc);
create index if not exists audit_runs_verdict_idx on public.audit_runs (verdict, started_at desc);

-- Only service role can read/write; never exposed to anon
alter table public.audit_runs enable row level security;

-- No policies needed — service role bypasses RLS. Anon has zero access.

comment on table public.audit_runs is
  'One row per end-to-end audit run (health + smoke + Playwright + Claude evaluator). Populated by scripts/audit-reporter.ts.';
