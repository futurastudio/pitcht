import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

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
              // PostHog loads recorder/surveys from us-assets.i.posthog.com
              "script-src 'self' 'unsafe-eval' 'wasm-unsafe-eval' 'unsafe-inline' https://cdn.jsdelivr.net https://*.posthog.com blob:",
              // Allow styles from self and inline (needed for Tailwind)
              "style-src 'self' 'unsafe-inline'",
              // Allow images from self, data URIs, and Supabase storage
              "img-src 'self' data: blob: https://*.supabase.co",
              // Allow fonts from self and data URIs
              "font-src 'self' data:",
              // Allow connections to API endpoints and external services.
              // *.sentry.io is REQUIRED for browser error reporting — without it
              // the CSP blocks every Sentry envelope and client-side monitoring
              // goes dark even though the DSN is configured (audit finding L1).
              "connect-src 'self' https://*.supabase.co https://api.anthropic.com https://api.openai.com https://api.stripe.com https://cdn.jsdelivr.net http://localhost:5001 wss://*.supabase.co https://*.posthog.com https://*.sentry.io",
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

// Wrap with Sentry so production source maps are uploaded (readable stack
// traces) and the client bundle is instrumented. Source-map upload only runs
// when SENTRY_AUTH_TOKEN + org/project are present in the environment (Vercel);
// when they're absent it silently no-ops, so local builds are unaffected
// (audit finding L2).
export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: true,
  widenClientFileUpload: true,
  disableLogger: true,
});
