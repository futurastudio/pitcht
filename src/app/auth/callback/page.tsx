'use client';

/**
 * OAuth Callback Page
 *
 * Handles the PKCE redirect from Supabase OAuth (Google, etc.).
 * The server-side route.ts was removed because it stored the session
 * in cookies (SSR-only), which the client-side Supabase client cannot
 * read — it stores sessions in localStorage.
 *
 * This client-side page calls exchangeCodeForSession() directly so the
 * session is stored in localStorage and the user is properly signed in.
 */

import { Suspense, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/services/supabase';
import { identifyUser, trackEvent, AnalyticsEvents } from '@/utils/analytics';

function CallbackHandler() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const code = searchParams.get('code');
    const next = searchParams.get('next') || '/';
    const errorParam = searchParams.get('error');
    const errorDescription = searchParams.get('error_description');

    // OAuth error from provider
    if (errorParam) {
      console.error('OAuth error:', errorParam, errorDescription);
      router.push(`/?error=auth_failed&reason=${encodeURIComponent(errorParam)}`);
      return;
    }

    if (!code) {
      // No code and no error — just redirect home
      router.push(next);
      return;
    }

    // Exchange the PKCE code for a session, stored in localStorage
    supabase.auth.exchangeCodeForSession(code).then(({ data, error }) => {
      if (error) {
        console.error('OAuth code exchange error:', error.message);
        router.push('/?error=auth_failed');
      } else {
        // Notify on new Google signup
        if (data.user?.id && data.user?.email) {
          // Only notify if this is a truly new user (created_at ~= now)
          const createdAt = new Date(data.user.created_at);
          const now = new Date();
          const minutesSinceCreation = (now.getTime() - createdAt.getTime()) / 1000 / 60;
          if (minutesSinceCreation < 5) {
            fetch('/api/notify-signup', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                userId: data.user.id,
                email: data.user.email,
                signupMethod: 'google',
              }),
            }).catch((err) => console.error('[auth-callback] Signup notification failed:', err));

            identifyUser(data.user.id, { email: data.user.email, signup_method: 'google' });
            trackEvent(AnalyticsEvents.SIGNUP_COMPLETED, { method: 'google' });
          }
        }
        router.push(next);
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex min-h-screen items-center justify-center bg-black">
      <div className="text-center">
        <div className="w-10 h-10 border-2 border-white/20 border-t-white rounded-full animate-spin mx-auto mb-4" />
        <p className="text-white/60 text-sm">Signing you in...</p>
      </div>
    </div>
  );
}

export default function AuthCallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-black">
          <div className="text-center">
            <div className="w-10 h-10 border-2 border-white/20 border-t-white rounded-full animate-spin mx-auto mb-4" />
            <p className="text-white/60 text-sm">Signing you in...</p>
          </div>
        </div>
      }
    >
      <CallbackHandler />
    </Suspense>
  );
}
