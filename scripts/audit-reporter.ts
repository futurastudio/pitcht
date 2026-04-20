/**
 * Writes one audit_runs row to Supabase at the end of every audit run.
 * Also prints a human-readable summary to stdout so the GH Actions log is useful.
 */

import { createClient } from '@supabase/supabase-js';
import type { EvaluationResult } from './audit-evaluator';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export type Stage = 'health' | 'smoke' | 'e2e' | 'evaluator';
export type Verdict = 'PASS' | 'FAIL' | 'ERROR';

export interface AuditRun {
  startedAt: Date;
  finishedAt: Date;
  trigger: 'deploy' | 'cron' | 'manual';
  commitSha?: string;
  env: string;
  verdict: Verdict;
  failedStage?: Stage;
  failedReason?: string;
  checkpoints: Record<string, EvaluationResult | { verdict: Verdict; reason: string }>;
  artifactUrl?: string;
  accountUsed?: string;
}

export async function persistRun(run: AuditRun): Promise<void> {
  if (!SUPABASE_URL || !SERVICE_ROLE) {
    console.warn('audit-reporter: Supabase envs missing, skipping DB persist');
    return;
  }
  const sb = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false },
  });

  const { error } = await sb.from('audit_runs').insert({
    started_at: run.startedAt.toISOString(),
    finished_at: run.finishedAt.toISOString(),
    trigger: run.trigger,
    commit_sha: run.commitSha,
    env: run.env,
    verdict: run.verdict,
    failed_stage: run.failedStage,
    failed_reason: run.failedReason,
    checkpoints: run.checkpoints,
    duration_ms: run.finishedAt.getTime() - run.startedAt.getTime(),
    artifact_url: run.artifactUrl,
    account_used: run.accountUsed,
  });

  if (error) {
    console.error('audit-reporter: failed to insert audit_runs row:', error.message);
  } else {
    console.log('audit-reporter: run persisted ✓');
  }
}

export function printSummary(run: AuditRun): void {
  const RESET = '\x1b[0m';
  const GREEN = '\x1b[32m';
  const RED = '\x1b[31m';
  const DIM = '\x1b[2m';
  const BOLD = '\x1b[1m';

  const header = run.verdict === 'PASS' ? `${GREEN}${BOLD}PASS${RESET}` : `${RED}${BOLD}${run.verdict}${RESET}`;
  const duration = ((run.finishedAt.getTime() - run.startedAt.getTime()) / 1000).toFixed(1);
  console.log(`\n=== AUDIT RESULT: ${header} ${DIM}(${duration}s, trigger=${run.trigger})${RESET} ===`);

  if (run.failedStage) {
    console.log(`${RED}failed stage:${RESET} ${run.failedStage}`);
    console.log(`${RED}reason:${RESET}       ${run.failedReason ?? '(none)'}`);
  }

  const cps = Object.entries(run.checkpoints);
  if (cps.length > 0) {
    console.log(`\n${BOLD}Checkpoints:${RESET}`);
    for (const [name, r] of cps) {
      const color = r.verdict === 'PASS' ? GREEN : RED;
      console.log(`  ${color}${r.verdict}${RESET}  ${name}  ${DIM}${r.reason}${RESET}`);
    }
  }
  console.log('');
}
