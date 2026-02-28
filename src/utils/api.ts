/**
 * API Utility Functions
 * Handles API URL construction for hybrid Electron + Vercel architecture
 */

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
 * - In Electron: Use NEXT_PUBLIC_URL (Vercel backend)
 * - In SSR/Node: Use NEXT_PUBLIC_URL or localhost fallback
 */
export function getApiUrl(endpoint: string): string {
  // Ensure endpoint starts with /
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;

  // Browser context on web: use relative URL — always matches the deployment origin
  if (typeof window !== 'undefined' && !isElectron()) {
    return cleanEndpoint;
  }

  // Electron or SSR: need absolute URL
  const baseUrl = process.env.NEXT_PUBLIC_URL || 'http://localhost:3000';
  return `${baseUrl}${cleanEndpoint}`;
}

/**
 * Fetch wrapper that automatically uses the correct API URL
 * Drop-in replacement for fetch('/api/...')
 */
export async function apiFetch(endpoint: string, options?: RequestInit): Promise<Response> {
  const url = getApiUrl(endpoint);
  return fetch(url, options);
}
