/**
 * Daily audit digest — runs once a day via GH Actions cron.
 *
 * Reads last 24h of audit_runs rows and emails a summary via Resend.
 * Silent when everything passed, loud when anything failed.
 *
 * Usage:
 *   npx tsx scripts/audit-digest.ts
 *
 * Required env:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   RESEND_API_KEY
 *   AUDIT_DIGEST_FROM   (e.g. "Pitcht Audit <audit@pitcht.us>")
 *   AUDIT_DIGEST_TO     (your email)
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const RESEND_KEY = process.env.RESEND_API_KEY!;
const FROM = process.env.AUDIT_DIGEST_FROM!;
const TO = process.env.AUDIT_DIGEST_TO!;

interface RunRow {
  id: string;
  started_at: string;
  trigger: string;
  verdict: 'PASS' | 'FAIL' | 'ERROR';
  failed_stage: string | null;
  failed_reason: string | null;
  duration_ms: number | null;
  artifact_url: string | null;
  checkpoints: Record<string, { verdict: string; reason: string }>;
}

async function main(): Promise<void> {
  // Hard requirements — the job can't run without these.
  for (const [k, v] of Object.entries({ SUPABASE_URL, SERVICE_ROLE })) {
    if (!v) throw new Error(`Missing env: ${k}`);
  }
  // Soft requirements — if email isn't configured yet, log and exit cleanly
  // instead of failing the GH Actions job every morning.
  if (!RESEND_KEY || !FROM || !TO) {
    console.log('digest: email config incomplete (RESEND_API_KEY / AUDIT_DIGEST_FROM / AUDIT_DIGEST_TO) — skipping send');
    return;
  }

  const sb = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await sb
    .from('audit_runs')
    .select('id, started_at, trigger, verdict, failed_stage, failed_reason, duration_ms, artifact_url, checkpoints')
    .gte('started_at', since)
    .order('started_at', { ascending: false });

  if (error) throw new Error(`Query failed: ${error.message}`);
  const rows = (data ?? []) as RunRow[];

  const total = rows.length;
  const passed = rows.filter((r) => r.verdict === 'PASS').length;
  const failed = rows.filter((r) => r.verdict !== 'PASS').length;

  // Silent day: if ZERO failures in last 24h, don't bother emailing.
  if (total === 0) {
    console.log('digest: no runs in last 24h — nothing to send');
    return;
  }
  if (failed === 0) {
    console.log(`digest: ${total} runs, all PASS — silent day, no email sent`);
    return;
  }

  const subject =
    failed > 0
      ? `[Pitcht Audit] ${failed} failure${failed === 1 ? '' : 's'} in last 24h`
      : `[Pitcht Audit] all green — ${passed}/${total}`;

  const html = renderHtml(rows, { total, passed, failed });

  const resp = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${RESEND_KEY}`,
    },
    body: JSON.stringify({ from: FROM, to: [TO], subject, html }),
  });

  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`Resend failed ${resp.status}: ${body}`);
  }
  console.log(`digest: sent ${subject}`);
}

function renderHtml(rows: RunRow[], stats: { total: number; passed: number; failed: number }): string {
  const failedRows = rows.filter((r) => r.verdict !== 'PASS');

  const failureBlocks = failedRows
    .map((r) => {
      const when = new Date(r.started_at).toLocaleString('en-US', { timeZone: 'America/New_York' });
      const dur = r.duration_ms ? `${(r.duration_ms / 1000).toFixed(1)}s` : '—';
      const failedCps = Object.entries(r.checkpoints || {})
        .filter(([, v]) => v.verdict !== 'PASS')
        .map(([k, v]) => `<li><strong>${escapeHtml(k)}</strong>: ${escapeHtml(v.reason)}</li>`)
        .join('');
      const artifactLink = r.artifact_url
        ? `<a href="${r.artifact_url}" style="color:#4a90e2">View run</a>`
        : '';
      return `
        <div style="background:#fff5f5;border:1px solid #feb2b2;border-radius:8px;padding:16px;margin:12px 0;font-family:ui-monospace,monospace;font-size:13px">
          <div style="color:#c53030;font-weight:600;margin-bottom:8px">
            ${r.verdict} — ${r.failed_stage ?? 'unknown'} — ${when} ET
          </div>
          <div style="color:#4a5568;margin-bottom:8px">
            ${escapeHtml(r.failed_reason ?? '')}
          </div>
          ${failedCps ? `<ul style="margin:8px 0;padding-left:20px;color:#4a5568">${failedCps}</ul>` : ''}
          <div style="color:#718096;font-size:11px;margin-top:8px">
            trigger=${r.trigger} duration=${dur} ${artifactLink}
          </div>
        </div>`;
    })
    .join('');

  return `
    <div style="max-width:640px;margin:0 auto;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;padding:24px">
      <h1 style="font-size:20px;margin:0 0 4px">Pitcht Audit — last 24h</h1>
      <div style="color:#718096;margin-bottom:20px">
        ${stats.passed} / ${stats.total} runs passed
        ${stats.failed > 0 ? `<span style="color:#c53030;font-weight:600"> · ${stats.failed} failed</span>` : ''}
      </div>
      ${stats.failed > 0 ? `<h2 style="font-size:16px;margin:24px 0 0">Failures</h2>${failureBlocks}` : ''}
      <div style="color:#a0aec0;font-size:11px;margin-top:32px;border-top:1px solid #edf2f7;padding-top:12px">
        Generated by scripts/audit-digest.ts
      </div>
    </div>`;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

main().catch((err) => {
  console.error('digest failed:', err);
  process.exit(1);
});
