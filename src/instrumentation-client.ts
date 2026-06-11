/**
 * Next.js Client Instrumentation
 * Auto-loaded by Next.js (15.3+/16) on the browser to initialize Sentry.
 *
 * Previously the client Sentry config was never wired in — next.config.ts does
 * not use withSentryConfig and there was no client instrumentation file, so
 * browser errors were never captured. Importing the config here runs its
 * Sentry.init() side effect. The config no-ops unless NEXT_PUBLIC_SENTRY_DSN is
 * set, so this is safe to ship before a Sentry project exists.
 */

import '../sentry.client.config';

// Instruments App Router client-side navigations for Sentry tracing.
// Safe no-op when Sentry isn't initialized.
export { captureRouterTransitionStart as onRouterTransitionStart } from '@sentry/nextjs';
