/**
 * Sentry Client Configuration
 * Error tracking for client-side errors
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
    tracesSampleRate: 0.1, // 10% of transactions for performance monitoring

    // Session Replay
    replaysSessionSampleRate: 0.01, // 1% of sessions
    replaysOnErrorSampleRate: 1.0, // 100% of sessions with errors

    integrations: [
      Sentry.replayIntegration({
        maskAllText: true, // Mask all text for privacy
        blockAllMedia: true, // Block all media for privacy
      }),
    ],

    // Don't send errors in development (unless forced)
    beforeSend(event, hint) {
      // Filter out specific errors
      if (event.exception) {
        const error = hint.originalException;

        // Ignore network errors (user's internet issue)
        if (error instanceof Error && error.message.includes('NetworkError')) {
          return null;
        }

        // Ignore third-party errors
        if (event.exception.values?.some(v =>
          v.stacktrace?.frames?.some(f =>
            f.filename?.includes('chrome-extension://') ||
            f.filename?.includes('moz-extension://') ||
            f.filename?.includes('safari-extension://')
          )
        )) {
          return null;
        }
      }

      return event;
    },

    // Ignore common browser errors
    ignoreErrors: [
      // Browser extensions
      'top.GLOBALS',
      // Random plugins/extensions
      'originalCreateNotification',
      'canvas.contentDocument',
      'MyApp_RemoveAllHighlights',
      // Facebook borked
      'fb_xd_fragment',
      // IE exceptions
      "Can't execute code from freed script",
      // Network errors
      'NetworkError',
      'Failed to fetch',
      'Load failed',
      // Aborted requests (user navigated away)
      'AbortError',
    ],
  });
}
