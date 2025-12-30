/**
 * Sentry Server Configuration
 * Error tracking for server-side errors (API routes, SSR)
 */

import * as Sentry from "@sentry/nextjs";

const SENTRY_DSN = process.env.NEXT_PUBLIC_SENTRY_DSN;
const SENTRY_ENVIRONMENT = process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT || 'development';

// Only initialize Sentry in production or if DSN is explicitly set
if (SENTRY_DSN && (SENTRY_ENVIRONMENT === 'production' || process.env.NODE_ENV === 'production')) {
  Sentry.init({
    dsn: SENTRY_DSN,

    // Environment
    environment: SENTRY_ENVIRONMENT,

    // Performance Monitoring
    tracesSampleRate: 0.1, // 10% of transactions

    // Don't send sensitive data
    beforeSend(event) {
      // Remove sensitive headers
      if (event.request?.headers) {
        delete event.request.headers['authorization'];
        delete event.request.headers['cookie'];
        delete event.request.headers['x-api-key'];
      }

      // Remove sensitive data from breadcrumbs
      if (event.breadcrumbs) {
        event.breadcrumbs = event.breadcrumbs.map(breadcrumb => {
          if (breadcrumb.data) {
            // Remove potential API keys or tokens
            const sanitized = { ...breadcrumb.data };
            Object.keys(sanitized).forEach(key => {
              if (
                key.toLowerCase().includes('key') ||
                key.toLowerCase().includes('token') ||
                key.toLowerCase().includes('secret') ||
                key.toLowerCase().includes('password')
              ) {
                sanitized[key] = '[Filtered]';
              }
            });
            breadcrumb.data = sanitized;
          }
          return breadcrumb;
        });
      }

      return event;
    },

    // Ignore errors from specific routes
    ignoreErrors: [
      // Ignore auth errors (logged separately)
      'Invalid authentication token',
      'Unauthorized',
      // Ignore rate limit errors (expected)
      'Rate limit exceeded',
    ],
  });
}
