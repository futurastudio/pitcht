/**
 * Startup Health Checks
 * Validates critical configuration before app fully loads
 * Helps catch deployment issues early
 */

export interface HealthCheckResult {
  passed: boolean;
  checks: {
    name: string;
    status: 'pass' | 'fail' | 'warn';
    message?: string;
  }[];
}

/**
 * Run all health checks
 * Call this early in app initialization to catch config issues
 */
export async function runHealthChecks(): Promise<HealthCheckResult> {
  const checks = [];

  // Check 1: Supabase URL configured
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  checks.push({
    name: 'Supabase URL',
    status: (supabaseUrl ? 'pass' : 'fail') as 'pass' | 'fail',
    message: supabaseUrl ? undefined : 'NEXT_PUBLIC_SUPABASE_URL not set',
  });

  // Check 2: Supabase Anon Key configured
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  checks.push({
    name: 'Supabase Anon Key',
    status: (supabaseKey ? 'pass' : 'fail') as 'pass' | 'fail',
    message: supabaseKey ? undefined : 'NEXT_PUBLIC_SUPABASE_ANON_KEY not set',
  });

  // Check 3: Anthropic API Key (server-side only)
  if (typeof window === 'undefined') {
    const anthropicKey = process.env.ANTHROPIC_API_KEY;
    checks.push({
      name: 'Anthropic API Key',
      status: (anthropicKey ? 'pass' : 'fail') as 'pass' | 'fail',
      message: anthropicKey ? undefined : 'ANTHROPIC_API_KEY not set',
    });

    // Check 4: OpenAI API Key (server-side only)
    const openaiKey = process.env.OPENAI_API_KEY;
    checks.push({
      name: 'OpenAI API Key',
      status: (openaiKey ? 'pass' : 'fail') as 'pass' | 'fail',
      message: openaiKey ? undefined : 'OPENAI_API_KEY not set',
    });
  }

  // Check 5: Stripe keys (warnings only - optional feature)
  const stripePublishable = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
  const stripeSecret = process.env.STRIPE_SECRET_KEY;
  if (!stripePublishable || !stripeSecret) {
    checks.push({
      name: 'Stripe Configuration',
      status: 'warn' as const,
      message: 'Stripe keys not configured - payment features disabled',
    });
  }

  const allPassed = checks.every(c => c.status === 'pass' || c.status === 'warn');

  return {
    passed: allPassed,
    checks,
  };
}

/**
 * Log health check results to console
 */
export function logHealthChecks(result: HealthCheckResult): void {
  console.log('\n🏥 Startup Health Checks:');

  result.checks.forEach(check => {
    const icon = check.status === 'pass' ? '✅' : check.status === 'warn' ? '⚠️' : '❌';
    console.log(`   ${icon} ${check.name}`);
    if (check.message) {
      console.log(`      ${check.message}`);
    }
  });

  if (result.passed) {
    console.log('\n✅ All critical checks passed!\n');
  } else {
    console.error('\n❌ Some critical checks failed - app may not work correctly\n');
  }
}

/**
 * Test Supabase anonymous auth is enabled
 * This catches the most common deployment issue
 */
export async function testAnonymousAuth(): Promise<boolean> {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      return false;
    }

    // Try to sign in anonymously
    const response = await fetch(`${supabaseUrl}/auth/v1/signup`, {
      method: 'POST',
      headers: {
        'apikey': supabaseKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        provider: 'anonymous',
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      if (error.msg?.includes('Anonymous sign-ins are disabled')) {
        console.error('\n❌ DEPLOYMENT ERROR: Anonymous authentication is DISABLED');
        console.error('📝 Fix in Supabase Dashboard: Authentication → Providers → Enable "Anonymous Sign-In"\n');
        return false;
      }
    }

    return response.ok;
  } catch (error) {
    console.error('Failed to test anonymous auth:', error);
    return false;
  }
}
