/**
 * Sentry Edge Configuration
 * Error tracking for edge runtime (middleware)
 */

import * as Sentry from "@sentry/nextjs";

const SENTRY_DSN = process.env.NEXT_PUBLIC_SENTRY_DSN;
const SENTRY_ENVIRONMENT = process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT || 'development';

// Only initialize Sentry in production or if DSN is explicitly set
if (SENTRY_DSN && (SENTRY_ENVIRONMENT === 'production' || process.env.NODE_ENV === 'production')) {
  Sentry.init({
    dsn: SENTRY_DSN,
    environment: SENTRY_ENVIRONMENT,
    tracesSampleRate: 0.1,
  });
}
