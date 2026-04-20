/**
 * Rotating pool of 5 audit test accounts.
 *
 * Why pooled: the /api/generate-questions route is rate-limited to 10/hr/user.
 * With 5 accounts rotating, the audit can run 50 times/hr before hitting a cap.
 *
 * Accounts are flagged as internal so they don't pollute analytics.
 *
 * Usage:
 *   - bootstrapAccounts() — run ONCE from a dev machine to provision the 5 accounts
 *   - pickAccount(runIndex) — called by the audit script, round-robins
 *   - resetAccount(email)  — wipes sessions for that account so next run is clean
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const POOL_PASSWORD = process.env.AUDIT_TEST_ACCOUNT_PASSWORD!;

if (!SUPABASE_URL || !SERVICE_ROLE) {
  throw new Error('Audit: missing Supabase envs (NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)');
}

const POOL_SIZE = 5;

export interface AuditAccount {
  email: string;
  password: string;
  userId?: string;
}

export function poolEmails(): string[] {
  return Array.from({ length: POOL_SIZE }, (_, i) => `audit-e2e-${i + 1}@pitcht.test`);
}

export function pickAccount(runIndex: number): AuditAccount {
  if (!POOL_PASSWORD) {
    throw new Error('AUDIT_TEST_ACCOUNT_PASSWORD not set');
  }
  const emails = poolEmails();
  return {
    email: emails[runIndex % POOL_SIZE],
    password: POOL_PASSWORD,
  };
}

function admin(): SupabaseClient {
  return createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Idempotently create the 5 pool accounts + mark them as internal.
 * Safe to re-run. Use from a dev machine, not from CI.
 */
export async function bootstrapAccounts(): Promise<void> {
  if (!POOL_PASSWORD) throw new Error('AUDIT_TEST_ACCOUNT_PASSWORD not set');
  const sb = admin();
  const emails = poolEmails();

  for (const email of emails) {
    // createUser is idempotent-ish: returns 422 if already exists, which we swallow.
    const { data, error } = await sb.auth.admin.createUser({
      email,
      password: POOL_PASSWORD,
      email_confirm: true,
      user_metadata: { is_audit_account: true, pool_bootstrap_at: new Date().toISOString() },
    });

    if (error && !error.message.toLowerCase().includes('already')) {
      throw new Error(`Failed to create ${email}: ${error.message}`);
    }
    if (data?.user) {
      console.log(`  created ${email} (${data.user.id})`);
    } else {
      console.log(`  exists  ${email}`);
    }
  }
}

/**
 * Nuke all sessions + recordings + analyses for a given audit account
 * so the next run starts from a clean free-tier state.
 */
export async function resetAccount(email: string): Promise<void> {
  const sb = admin();

  // Find the user
  const { data: users } = await sb.auth.admin.listUsers({ page: 1, perPage: 200 });
  const user = (users?.users ?? []).find((u: { email?: string }) => u.email === email);
  if (!user) {
    console.warn(`resetAccount: user ${email} not found, skipping`);
    return;
  }

  // Delete in dependency order: analyses → recordings → sessions → subscriptions
  // (subscriptions wiped so free-tier gate behaves consistently)
  await sb.from('analyses').delete().in(
    'recording_id',
    (await sb.from('recordings').select('id').eq('user_id', user.id)).data?.map((r) => r.id) ?? []
  );
  await sb.from('recordings').delete().eq('user_id', user.id);
  await sb.from('sessions').delete().eq('user_id', user.id);
  await sb.from('subscriptions').delete().eq('user_id', user.id);
}

// CLI entry: `npx tsx scripts/audit-test-accounts.ts bootstrap`
// CLI entry: `npx tsx scripts/audit-test-accounts.ts reset audit-e2e-1@pitcht.test`
if (require.main === module) {
  const cmd = process.argv[2];
  (async () => {
    if (cmd === 'bootstrap') {
      console.log('Bootstrapping audit account pool...');
      await bootstrapAccounts();
      console.log('Done.');
    } else if (cmd === 'reset' && process.argv[3]) {
      console.log(`Resetting ${process.argv[3]}...`);
      await resetAccount(process.argv[3]);
      console.log('Done.');
    } else {
      console.error('Usage: audit-test-accounts.ts <bootstrap|reset <email>>');
      process.exit(1);
    }
  })();
}
