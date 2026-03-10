/**
 * Health Check Endpoint
 *
 * Used by:
 * - Load balancers to verify app is running
 * - Uptime monitoring services (UptimeRobot, Pingdom)
 * - Deployment pipelines to verify successful deploy
 *
 * Returns:
 * - 200 OK: All critical systems operational
 * - 503 Service Unavailable: One or more critical systems down
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  version: string;
  checks: {
    database: CheckResult;
    storage: CheckResult;
    anthropic: CheckResult;
    openai: CheckResult;
  };
  uptime?: number;
}

interface CheckResult {
  status: 'pass' | 'fail' | 'warn';
  responseTime?: number;
  message?: string;
}

const startTime = Date.now();

/**
 * GET /api/health
 * Performs health checks on all critical services
 */
export async function GET(_request: NextRequest) {
  const checks = await performHealthChecks();

  // Determine overall status
  const hasFailures = Object.values(checks.checks).some(check => check.status === 'fail');
  const hasWarnings = Object.values(checks.checks).some(check => check.status === 'warn');

  let overallStatus: 'healthy' | 'degraded' | 'unhealthy';
  let httpStatus: number;

  if (hasFailures) {
    overallStatus = 'unhealthy';
    httpStatus = 503; // Service Unavailable
  } else if (hasWarnings) {
    overallStatus = 'degraded';
    httpStatus = 200; // Still operational, but with warnings
  } else {
    overallStatus = 'healthy';
    httpStatus = 200;
  }

  const response: HealthStatus = {
    status: overallStatus,
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '1.0.0',
    uptime: Math.floor((Date.now() - startTime) / 1000),
    checks: checks.checks,
  };

  return NextResponse.json(response, { status: httpStatus });
}

/**
 * Perform all health checks in parallel
 */
async function performHealthChecks() {
  const [database, storage, anthropic, openai] = await Promise.all([
    checkDatabase(),
    checkStorage(),
    checkAnthropicAPI(),
    checkOpenAIAPI(),
  ]);

  return {
    checks: {
      database,
      storage,
      anthropic,
      openai,
    },
  };
}

/**
 * Check 1: Database connectivity
 * Verifies we can connect to Supabase and query data
 */
async function checkDatabase(): Promise<CheckResult> {
  const start = Date.now();

  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      return {
        status: 'fail',
        message: 'Supabase credentials not configured',
      };
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Simple query to verify database connectivity
    const { error } = await supabase
      .from('sessions')
      .select('id')
      .limit(1);

    const responseTime = Date.now() - start;

    if (error) {
      return {
        status: 'fail',
        responseTime,
        message: error.message,
      };
    }

    return {
      status: 'pass',
      responseTime,
    };
  } catch (error) {
    return {
      status: 'fail',
      responseTime: Date.now() - start,
      message: error instanceof Error ? error.message : 'Unknown database error',
    };
  }
}

/**
 * Check 2: Storage availability
 * Verifies Supabase Storage is accessible
 */
async function checkStorage(): Promise<CheckResult> {
  const start = Date.now();

  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    // Use service role key so private buckets are visible
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      return {
        status: 'fail',
        message: 'Supabase credentials not configured',
      };
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // List buckets to verify storage connectivity
    const { data, error } = await supabase.storage.listBuckets();

    const responseTime = Date.now() - start;

    if (error) {
      return {
        status: 'fail',
        responseTime,
        message: error.message,
      };
    }

    // Check if 'recordings' bucket exists
    const recordingsBucket = data?.find(bucket => bucket.name === 'recordings');
    if (!recordingsBucket) {
      return {
        status: 'warn',
        responseTime,
        message: 'Recordings bucket not found',
      };
    }

    return {
      status: 'pass',
      responseTime,
    };
  } catch (error) {
    return {
      status: 'fail',
      responseTime: Date.now() - start,
      message: error instanceof Error ? error.message : 'Unknown storage error',
    };
  }
}

/**
 * Check 3: Anthropic API availability
 * Verifies Claude API is accessible (lightweight check)
 */
async function checkAnthropicAPI(): Promise<CheckResult> {
  const start = Date.now();

  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;

    if (!apiKey) {
      return {
        status: 'fail',
        message: 'Anthropic API key not configured',
      };
    }

    // Simple HEAD request to verify API is reachable
    // We don't make actual API calls to avoid costs
    const response = await fetch('https://api.anthropic.com', {
      method: 'HEAD',
      signal: AbortSignal.timeout(5000), // 5 second timeout
    });

    const responseTime = Date.now() - start;

    // Note: Anthropic API returns 404 for root endpoint, which is expected
    // We just want to verify network connectivity
    if (response.status === 404 || response.status === 200) {
      return {
        status: 'pass',
        responseTime,
      };
    }

    return {
      status: 'warn',
      responseTime,
      message: `Unexpected status: ${response.status}`,
    };
  } catch (error) {
    return {
      status: 'warn',
      responseTime: Date.now() - start,
      message: error instanceof Error ? error.message : 'API unreachable',
    };
  }
}

/**
 * Check 4: OpenAI API availability
 * Verifies Whisper API is accessible (lightweight check)
 */
async function checkOpenAIAPI(): Promise<CheckResult> {
  const start = Date.now();

  try {
    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) {
      return {
        status: 'fail',
        message: 'OpenAI API key not configured',
      };
    }

    // Simple HEAD request to verify API is reachable
    // Any HTTP response (including 404, 421) means the API is reachable
    const response = await fetch('https://api.openai.com', {
      method: 'HEAD',
      signal: AbortSignal.timeout(5000), // 5 second timeout
    });

    const responseTime = Date.now() - start;

    // Any response (200, 404, 421, etc.) means the API is reachable
    // We only fail if we get a network error (caught below)
    if (response.status < 500) {
      return {
        status: 'pass',
        responseTime,
      };
    }

    return {
      status: 'warn',
      responseTime,
      message: `Unexpected status: ${response.status}`,
    };
  } catch (error) {
    return {
      status: 'warn',
      responseTime: Date.now() - start,
      message: error instanceof Error ? error.message : 'API unreachable',
    };
  }
}
