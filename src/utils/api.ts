/**
 * API Utility Functions
 * Handles API URL construction for hybrid Electron + Vercel architecture
 */

import { supabase } from '@/services/supabase';

/**
 * Detect if running inside Electron (no native browser window.location origin)
 */
function isElectron(): boolean {
  return typeof window !== 'undefined' &&
    typeof (window as Window & { electron?: unknown }).electron !== 'undefined';
}

/**
 * Get the base API URL
 * - In browser (Vercel/web): Use relative path — browser resolves against its own origin
 * - In Electron dev: Use localhost:3000 — local Next.js server has the correct env vars
 * - In Electron prod: Use NEXT_PUBLIC_URL (Vercel backend)
 * - In SSR/Node: Use NEXT_PUBLIC_URL or localhost fallback
 */
export function getApiUrl(endpoint: string): string {
  // Ensure endpoint starts with /
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;

  // Browser context on web: use relative URL — always matches the deployment origin
  if (typeof window !== 'undefined' && !isElectron()) {
    return cleanEndpoint;
  }

  // Electron: in development always use localhost so API calls hit the local
  // Next.js server which has the correct env vars (STRIPE_SECRET_KEY etc).
  // In production builds (app.isPackaged), use the Vercel deployment URL.
  if (isElectron()) {
    const isDev = process.env.NODE_ENV === 'development';
    const baseUrl = isDev
      ? 'http://localhost:3000'
      : (process.env.NEXT_PUBLIC_URL || 'https://app.pitcht.us');
    return `${baseUrl}${cleanEndpoint}`;
  }

  // SSR/Node: need absolute URL
  const baseUrl = process.env.NEXT_PUBLIC_URL || 'http://localhost:3000';
  return `${baseUrl}${cleanEndpoint}`;
}

/**
 * Fetch wrapper that automatically uses the correct API URL and attaches the
 * Supabase session token as an Authorization header when the user is logged in.
 *
 * - Runs the token lookup only in the browser (safe for SSR).
 * - Never overrides an Authorization header already set by the caller, so
 *   pages that build their own token (e.g. pricing/page.tsx) are unaffected.
 */
export async function apiFetch(endpoint: string, options?: RequestInit): Promise<Response> {
  const url = getApiUrl(endpoint);

  // Auto-attach the Supabase access token in browser contexts only.
  if (typeof window !== 'undefined') {
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;

    if (token) {
      // Normalise whatever headers format the caller passed into a plain object
      // so we can inspect and extend it without mutating the original options.
      let normalised: Record<string, string> = {};
      if (options?.headers) {
        if (options.headers instanceof Headers) {
          options.headers.forEach((v, k) => { normalised[k] = v; });
        } else if (Array.isArray(options.headers)) {
          for (const [k, v] of options.headers) { normalised[k] = v; }
        } else {
          normalised = { ...(options.headers as Record<string, string>) };
        }
      }

      // Only inject if the caller has not already supplied an Authorization header.
      if (!normalised['Authorization'] && !normalised['authorization']) {
        options = {
          ...options,
          headers: { ...normalised, 'Authorization': `Bearer ${token}` },
        };
      }
    }
  }

  return fetch(url, options);
}
