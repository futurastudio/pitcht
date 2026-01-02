/**
 * API Utility Functions
 * Handles API URL construction for hybrid Electron + Vercel architecture
 */

/**
 * Get the base API URL
 * - In Electron production: Uses Vercel backend (NEXT_PUBLIC_URL)
 * - In development: Uses localhost
 */
export function getApiUrl(endpoint: string): string {
  // In development, always use localhost for faster debugging
  // In production, use Vercel cloud backend
  const isDev = process.env.NODE_ENV === 'development';
  const baseUrl = isDev
    ? 'http://localhost:3000'
    : (process.env.NEXT_PUBLIC_URL || 'http://localhost:3000');

  // Ensure endpoint starts with /
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;

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
