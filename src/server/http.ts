import 'server-only';
import { NextResponse } from 'next/server';
import { getAdmin } from './clients';
import { ApiError } from './errors';
import { CLIENT_UPGRADE_MESSAGE } from '@/utils/recordingContract';

export async function authenticate(request: Request) {
  const match = /^Bearer ([^\s]+)$/i.exec(request.headers.get('authorization') ?? '');
  if (!match) throw new ApiError(401, 'Sign in to continue.', 'unauthorized');
  const { data, error } = await getAdmin().auth.getUser(match[1]);
  if (error || !data.user || data.user.is_anonymous) {
    throw new ApiError(401, 'Sign in to continue.', 'unauthorized');
  }
  return data.user;
}

export async function readJson(request: Request, maxBytes = 100_000): Promise<Record<string, unknown>> {
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > maxBytes) throw new ApiError(413, 'Request is too large.');
  try {
    const value: unknown = JSON.parse(text);
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error();
    return value as Record<string, unknown>;
  } catch { throw new ApiError(400, 'Invalid JSON request.'); }
}

export function fail(error: unknown) {
  if (error instanceof ApiError) {
    return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
  }
  // Avoid returning SDK errors, tokens, customer details or internal schema to callers.
  console.error('[server] Operation failed', error instanceof Error ? error.name : 'unknown');
  return NextResponse.json({ error: 'Service temporarily unavailable. Please try again.', code: 'service_unavailable' }, { status: 503 });
}

export function requireUuid(value: unknown, label: string): string {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
    throw new ApiError(400, `Invalid ${label}.`);
  }
  return value;
}

export function requireRecordingId(value: unknown): string {
  if (value === undefined || value === null || value === '') {
    throw new ApiError(409, CLIENT_UPGRADE_MESSAGE, 'client_upgrade_required');
  }
  return requireUuid(value, 'recording ID');
}
