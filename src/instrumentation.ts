/**
 * Next.js Instrumentation
 * Registers Sentry for server + edge error tracking.
 *
 * IMPORTANT: this file MUST live at `src/instrumentation.ts` (not the repo
 * root). With a `src/` app directory, Next.js only scans `src/` for the
 * instrumentation hook — a root-level copy is silently never loaded, which is
 * why Sentry previously never initialized in production.
 *
 * The sentry.*.config files are at the repo root, hence the `../` import paths.
 * Each config no-ops unless NEXT_PUBLIC_SENTRY_DSN is set (see those files), so
 * this is safe to ship before a Sentry project exists.
 */

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('../sentry.server.config');
  }

  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('../sentry.edge.config');
  }
}

// Capture errors thrown in nested React Server Components / route handlers.
// No-ops when Sentry isn't initialized (no DSN).
export async function onRequestError(
  ...args: Parameters<typeof import('@sentry/nextjs').captureRequestError>
) {
  const Sentry = await import('@sentry/nextjs');
  Sentry.captureRequestError(...args);
}
