'use client';

import posthog from 'posthog-js';
import { PostHogProvider as PHProvider } from 'posthog-js/react';
import { useEffect } from 'react';

export function PostHogProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
    const host = process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com';

    if (!key) {
      console.warn('[PostHog] NEXT_PUBLIC_POSTHOG_KEY not set — analytics disabled');
      return;
    }

    posthog.init(key, {
      api_host: host,
      capture_pageview: false, // We capture manually to avoid double-counting with Vercel Analytics
      capture_pageleave: true,
      autocapture: true,
      person_profiles: 'identified_only',
      loaded: (posthog) => {
        if (process.env.NODE_ENV === 'development') posthog.debug();
      },
    });
  }, []);

  return <PHProvider client={posthog}>{children}</PHProvider>;
}
