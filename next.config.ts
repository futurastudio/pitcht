import type { NextConfig } from "next";

const isDevelopment = process.env.NODE_ENV === 'development';

const nextConfig: NextConfig = {
  /* config options here */

  // Security headers for production
  async headers() {
    // Development: Minimal headers, let Next.js handle CSP for HMR
    if (isDevelopment) {
      return [
        {
          source: '/:path*',
          headers: [
            {
              key: 'Permissions-Policy',
              value: 'camera=(self), microphone=(self), geolocation=(), interest-cohort=()'
            },
          ],
        },
      ];
    }

    // Production security headers
    return [
      {
        // Apply to all routes
        source: '/:path*',
        headers: [
          {
            key: 'X-DNS-Prefetch-Control',
            value: 'on'
          },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload'
          },
          {
            key: 'X-Frame-Options',
            value: 'SAMEORIGIN'
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff'
          },
          {
            key: 'X-XSS-Protection',
            value: '1; mode=block'
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin'
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=(self), microphone=(self), geolocation=(), interest-cohort=()'
          },
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              // Allow scripts from self and MediaPipe CDN
              // unsafe-eval and wasm-unsafe-eval are required for MediaPipe WebAssembly
              "script-src 'self' 'unsafe-eval' 'wasm-unsafe-eval' 'unsafe-inline' https://cdn.jsdelivr.net blob:",
              // Allow styles from self and inline (needed for Tailwind)
              "style-src 'self' 'unsafe-inline'",
              // Allow images from self, data URIs, and Supabase storage
              "img-src 'self' data: blob: https://*.supabase.co",
              // Allow fonts from self and data URIs
              "font-src 'self' data:",
              // Allow connections to API endpoints and external services
              "connect-src 'self' https://*.supabase.co https://api.anthropic.com https://api.openai.com https://api.stripe.com https://cdn.jsdelivr.net http://localhost:5001 wss://*.supabase.co https://*.posthog.com",
              // Allow media from self and blob (for video recording)
              "media-src 'self' blob: https://*.supabase.co",
              // Allow workers from self and blob
              "worker-src 'self' blob:",
              // Allow frames from Stripe
              "frame-src 'self' https://js.stripe.com https://hooks.stripe.com",
              // Block all plugins
              "object-src 'none'",
              // Block base URIs except self
              "base-uri 'self'",
              // Block form submissions except to self
              "form-action 'self'",
              // Upgrade insecure requests
              "upgrade-insecure-requests"
            ].join('; ')
          }
        ],
      },
    ];
  },
};

export default nextConfig;
