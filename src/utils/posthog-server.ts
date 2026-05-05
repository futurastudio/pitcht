import { PostHog } from 'posthog-node';

/**
 * Server-side PostHog client for tracking events from API routes.
 * Lazy-initialized singleton to avoid creating clients on every request.
 */

let posthogClient: PostHog | null = null;

function getPostHog(): PostHog | null {
  if (posthogClient) return posthogClient;

  const apiKey = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  if (!apiKey) {
    console.warn('[posthog-server] NEXT_PUBLIC_POSTHOG_KEY not set, skipping server-side tracking');
    return null;
  }

  posthogClient = new PostHog(apiKey, {
    host: process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com',
    flushAt: 1, // Send immediately for serverless functions
    flushInterval: 0,
  });

  return posthogClient;
}

export function trackServerEvent(
  event: string,
  distinctId: string,
  properties?: Record<string, unknown>
) {
  const client = getPostHog();
  if (!client) return;

  try {
    client.capture({
      distinctId,
      event,
      properties: {
        ...properties,
        $lib: 'posthog-node',
        $lib_version: '4.0.0',
      },
    });
  } catch (err) {
    console.error('[posthog-server] Failed to track event:', err);
  }
}

export function identifyServerUser(
  distinctId: string,
  properties?: Record<string, unknown>
) {
  const client = getPostHog();
  if (!client) return;

  try {
    client.identify({
      distinctId,
      properties,
    });
  } catch (err) {
    console.error('[posthog-server] Failed to identify user:', err);
  }
}

export async function flushPostHog() {
  const client = getPostHog();
  if (!client) return;

  try {
    await client.flush();
  } catch (err) {
    console.error('[posthog-server] Failed to flush:', err);
  }
}
