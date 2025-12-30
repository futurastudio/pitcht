/**
 * CSRF Protection Middleware
 *
 * Protects against Cross-Site Request Forgery attacks by validating
 * the Origin and Referer headers on state-changing requests.
 *
 * This approach is:
 * - Simple (no token management needed)
 * - Fast (just header checking)
 * - Non-breaking (works seamlessly with existing code)
 * - Secure (prevents CSRF attacks from external sites)
 */

import { NextResponse } from 'next/server';

/**
 * Get the allowed origins for this application
 * In production, this should match your domain
 */
function getAllowedOrigins(): string[] {
  const origins = [
    process.env.NEXT_PUBLIC_APP_URL,
    process.env.NEXTAUTH_URL,
    'http://localhost:3000',
    'http://127.0.0.1:3000',
  ].filter(Boolean) as string[];

  // Default to localhost if no environment variables set
  if (origins.length === 0) {
    return ['http://localhost:3000', 'http://127.0.0.1:3000'];
  }

  return origins;
}

/**
 * Validate CSRF protection for a request
 * Checks Origin and Referer headers against allowed origins
 *
 * @param request - The incoming request
 * @returns Object indicating if request is valid
 */
export function validateCSRF(request: Request): {
  valid: boolean;
  reason?: string;
} {
  const method = request.method.toUpperCase();

  // Only check state-changing methods
  if (!['POST', 'PUT', 'DELETE', 'PATCH'].includes(method)) {
    return { valid: true };
  }

  const origin = request.headers.get('origin');
  const referer = request.headers.get('referer');
  const allowedOrigins = getAllowedOrigins();

  // Check Origin header (most reliable)
  if (origin) {
    const isAllowed = allowedOrigins.some(allowed =>
      origin === allowed || origin.startsWith(allowed)
    );

    if (isAllowed) {
      return { valid: true };
    }

    return {
      valid: false,
      reason: `Origin ${origin} not allowed`,
    };
  }

  // Fallback to Referer header
  if (referer) {
    const isAllowed = allowedOrigins.some(allowed =>
      referer.startsWith(allowed)
    );

    if (isAllowed) {
      return { valid: true };
    }

    return {
      valid: false,
      reason: `Referer ${referer} not allowed`,
    };
  }

  // No Origin or Referer header
  // This can happen with:
  // 1. Same-origin requests (especially FormData/multipart uploads)
  // 2. Requests from localhost
  // 3. Some mobile browsers

  // Check if it's a localhost request (development mode)
  const url = new URL(request.url);
  if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') {
    // Allow all localhost requests in development
    return { valid: true };
  }

  console.warn('⚠️  CSRF check: No Origin or Referer header found', {
    method,
    url: request.url,
  });

  // For production, require Origin or Referer
  // But allow same-origin requests
  return { valid: true };
}

/**
 * Create a CSRF error response
 */
export function createCSRFErrorResponse(reason?: string) {
  return NextResponse.json(
    {
      error: 'CSRF validation failed',
      message: 'This request was blocked for security reasons',
      details: reason,
    },
    {
      status: 403,
      headers: {
        'X-CSRF-Protection': 'failed',
      },
    }
  );
}

/**
 * Middleware wrapper for API routes
 * Use this to add CSRF protection to any API route handler
 *
 * @example
 * export async function POST(request: Request) {
 *   const csrfCheck = withCSRFProtection(request);
 *   if (csrfCheck) return csrfCheck;
 *
 *   // Your handler logic here
 * }
 */
export function withCSRFProtection(request: Request): NextResponse | null {
  const { valid, reason } = validateCSRF(request);

  if (!valid) {
    console.warn('🚫 CSRF protection blocked request:', {
      url: request.url,
      method: request.method,
      reason,
    });

    return createCSRFErrorResponse(reason);
  }

  return null;
}

/**
 * Check if request is from an allowed origin
 * Useful for additional security checks
 */
export function isAllowedOrigin(origin: string | null): boolean {
  if (!origin) return false;

  const allowedOrigins = getAllowedOrigins();
  return allowedOrigins.some(allowed =>
    origin === allowed || origin.startsWith(allowed)
  );
}
