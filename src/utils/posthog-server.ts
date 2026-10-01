import { PostHog } from 'posthog-node';
import { createHash } from 'node:crypto';

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

export async function trackDurableEvent(event: string, distinctId: string,
  properties: Record<string, unknown>, insertId: string): Promise<boolean> {
  const apiKey = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  if (!apiKey) return false;
  try {
    // SDK capture/flush queue completion is not an ingestion acknowledgement.
    const url = new URL('/i/v0/e/', process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com');
    // RFC UUIDv5 with URL namespace; stable event UUID survives outbox retries.
    const hash = createHash('sha1').update(Buffer.from('6ba7b8119dad11d180b400c04fd430c8','hex'))
      .update('https://app.pitcht.us/billing/' + insertId).digest('hex');
    const variant = (8 | (parseInt(hash[16],16) & 3)).toString(16);
    const uuid = `${hash.slice(0,8)}-${hash.slice(8,12)}-5${hash.slice(13,16)}-${variant}${hash.slice(17,20)}-${hash.slice(20,32)}`;
    const response = await fetch(url, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ api_key: apiKey, event, distinct_id: distinctId, uuid,
        properties: { ...properties, distinct_id: distinctId, $insert_id: insertId } }),
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) return false;
    const acknowledgement: unknown = await response.json();
    return !!acknowledgement && typeof acknowledgement === 'object' &&
      'status' in acknowledgement && acknowledgement.status === 1;
  } catch {
    console.error('[posthog-server] Durable event remains pending');
    return false;
  }
}
