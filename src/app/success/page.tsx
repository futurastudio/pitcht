'use client';

import { apiFetch } from '@/utils/api';
import React, { useEffect, useState, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/services/supabase';
import Header from '@/components/Header';

function SuccessContent() {
  const searchParams = useSearchParams();
  const sessionId = searchParams.get('session_id');
  const { user, subscriptionStatus, refreshSubscriptionStatus } = useAuth();
  const [showConfetti, setShowConfetti] = useState(true);
  const [isVerifying, setIsVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState(false);

  useEffect(() => {
    // Hide confetti after 3 seconds
    const timer = setTimeout(() => setShowConfetti(false), 3000);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    // Verify subscription as safety net in case webhook is delayed.
    // Strategy:
    //   1. Call /api/verify-subscription to ensure the row exists in DB.
    //   2. Poll refreshSubscriptionStatus until isPremium is true (up to 10 attempts).
    //   3. Only show error after all attempts are exhausted.
    if (!sessionId || !user) return;

    let cancelled = false;
    // Phase 1: verify the subscription row exists (up to 6 attempts, 3s apart)
    const MAX_VERIFY_ATTEMPTS = 6;
    const VERIFY_RETRY_MS = 3000;
    // Phase 2: poll AuthContext until isPremium flips (up to 8 attempts, 2s apart)
    const MAX_POLL_ATTEMPTS = 8;
    const POLL_RETRY_MS = 2000;

    const pollUntilPremium = (attemptsLeft: number) => {
      if (cancelled) return;
      refreshSubscriptionStatus().then(() => {
        // subscriptionStatus is read from closure — schedule a re-check via setTimeout
        // so React has time to update the state before we read it again.
        setTimeout(() => {
          if (cancelled) return;
          // Re-read from the context ref via a second refresh; if still not premium, retry.
          if (attemptsLeft > 1) {
            pollUntilPremium(attemptsLeft - 1);
          } else {
            setIsVerifying(false);
            // Don't show error here — the DB row exists, the UI just needs a hard refresh.
            // The user can navigate away and come back to see Pro status.
          }
        }, POLL_RETRY_MS);
      });
    };

    const attempt = async (attemptsLeft: number) => {
      if (cancelled) return;

      setIsVerifying(true);
      setVerifyError(false);

      try {
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        if (sessionError || !session) {
          console.error('No active session for verification:', sessionError);
          setIsVerifying(false);
          return;
        }

        const response = await apiFetch('/api/verify-subscription', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ sessionId, userId: user.id }),
        });

        const data = await response.json();

        if (response.ok) {
          console.log('✅ Subscription verified in DB — polling AuthContext for isPremium');
          // Subscription row confirmed — now poll until AuthContext reflects isPremium
          pollUntilPremium(MAX_POLL_ATTEMPTS);
        } else {
          console.error(`❌ Verification attempt failed (${attemptsLeft} left):`, data);
          if (attemptsLeft > 1 && !cancelled) {
            setTimeout(() => attempt(attemptsLeft - 1), VERIFY_RETRY_MS);
          } else {
            setIsVerifying(false);
            setVerifyError(true);
          }
        }
      } catch (error) {
        console.error('❌ Error verifying subscription:', error);
        if (attemptsLeft > 1 && !cancelled) {
          setTimeout(() => attempt(attemptsLeft - 1), VERIFY_RETRY_MS);
        } else {
          setIsVerifying(false);
          setVerifyError(true);
        }
      }
    };

    attempt(MAX_VERIFY_ATTEMPTS);

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, user]);

  if (!user) {
    return (
      <main className="min-h-screen text-white p-8 relative">
        <div className="absolute inset-0 bg-black/40 backdrop-blur-sm -z-10" />
        <div className="absolute inset-0 bg-[url('/grid.svg')] opacity-10 -z-10" />
        <div className="max-w-2xl mx-auto text-center pt-20">
          <p className="text-white/60">Please log in to view this page.</p>
          <Link href="/" className="text-white/80 hover:text-white underline">
            Go to Home
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen text-white p-8 pb-24 relative overflow-hidden flex flex-col items-center justify-center">
      {/* Same background treatment as home page */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm -z-10" />
      <div className="absolute inset-0 bg-[url('/grid.svg')] opacity-10 -z-10" />

      {/* Confetti Animation (CSS-only) */}
      {showConfetti && (
        <div className="fixed inset-0 pointer-events-none z-50">
          {[...Array(50)].map((_, i) => (
            <div
              key={i}
              className="absolute w-2 h-2 rounded-full"
              style={{
                background: i % 2 === 0 ? 'rgba(255,255,255,0.6)' : 'rgba(255,255,255,0.3)',
                left: `${Math.random() * 100}%`,
                top: '-10%',
                animationDelay: `${Math.random() * 2}s`,
                animationDuration: `${3 + Math.random() * 2}s`,
                animation: 'confetti linear forwards',
              }}
            />
          ))}
        </div>
      )}

      <Header />

      <div className="max-w-2xl w-full relative z-10 mt-8">
        {/* Success Card — liquid glass */}
        <div className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-3xl p-10 text-center shadow-2xl">

          {/* Success Icon */}
          <div className="w-20 h-20 mx-auto mb-6 bg-white/20 backdrop-blur-xl border border-white/30 rounded-full flex items-center justify-center">
            <svg
              className="w-10 h-10 text-white"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2.5}
                d="M5 13l4 4L19 7"
              />
            </svg>
          </div>

          {/* Success Message — the headline now reassures the user that the
              payment itself was successful, even if activation is still
              propagating. "Welcome" alone made it ambiguous when the banner
              below said "Activating..." */}
          <h1 className="text-4xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white via-white/90 to-white/60 mb-3">
            Payment received — welcome to Pitcht Pro!
          </h1>
          <p className="text-white/70 text-lg mb-6">
            {subscriptionStatus.isPremium
              ? 'Your subscription is active. Time to level up your practice!'
              : 'Your card was charged successfully. We\'re finalizing your account now — this usually takes just a few seconds.'}
          </p>

          {/* Verification status banner */}
          {isVerifying && !subscriptionStatus.isPremium && (
            <div
              role="status"
              aria-live="polite"
              className="bg-white/10 backdrop-blur-lg border border-white/20 rounded-2xl px-4 py-3 mb-6 text-white/70 text-sm flex items-center justify-center gap-2"
            >
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
              Finalizing your subscription...
            </div>
          )}
          {subscriptionStatus.isPremium && (
            <div className="bg-white/10 backdrop-blur-lg border border-white/20 rounded-2xl px-4 py-3 mb-6 text-white/80 text-sm flex items-center justify-center gap-2">
              <span className="text-green-400">✓</span> Pro activated
            </div>
          )}
          {verifyError && !subscriptionStatus.isPremium && (
            <div className="bg-white/5 backdrop-blur-lg border border-white/10 rounded-2xl p-5 mb-6 text-left space-y-3">
              <p className="text-white/80 text-sm font-semibold">
                Your payment succeeded, but your account hasn&apos;t flipped to Pro yet.
              </p>
              <p className="text-white/60 text-sm">
                This is almost always a slow webhook and clears up within a couple of minutes.
                Give it a moment and try again, or navigate away and come back — Pro will be
                waiting for you.
              </p>
              <div className="flex flex-wrap items-center gap-3 pt-1">
                <button
                  onClick={() => {
                    // Reload the page rather than just re-polling — this
                    // re-triggers the full verify-subscription flow with a
                    // fresh auth session and avoids any stale React state.
                    window.location.reload();
                  }}
                  className="px-4 py-2 rounded-full text-xs font-semibold text-black bg-white hover:bg-white/90 transition-colors"
                >
                  Try activation again
                </button>
                <a
                  href="mailto:contact@pitcht.us?subject=Pitcht%20Pro%20activation%20issue"
                  className="text-white/70 hover:text-white text-xs underline"
                >
                  Email support
                </a>
              </div>
            </div>
          )}

          {/* Status strip */}
          <div className="bg-white/5 backdrop-blur-lg border border-white/10 rounded-2xl p-5 mb-8">
            <div className="grid grid-cols-3 gap-4 divide-x divide-white/10">
              <div>
                <p className="text-white/50 text-xs uppercase tracking-wide mb-1">Status</p>
                <p className="text-white font-semibold text-sm">
                  {subscriptionStatus.isPremium ? 'Pro ✓' : 'Activating...'}
                </p>
              </div>
              <div className="pl-4">
                <p className="text-white/50 text-xs uppercase tracking-wide mb-1">Sessions</p>
                <p className="text-white font-semibold text-sm">Unlimited</p>
              </div>
              <div className="pl-4">
                <p className="text-white/50 text-xs uppercase tracking-wide mb-1">Billing</p>
                <Link href="/settings" className="text-white font-semibold text-sm hover:text-white/80 transition-colors">
                  Settings →
                </Link>
              </div>
            </div>
          </div>

          {/* What's included */}
          <div className="text-left mb-8">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {[
                ['Unlimited sessions', 'Practice as much as you need'],
                ['Full session history', 'Review all past recordings'],
                ['Progress tracking', 'See improvement over time'],
                ['AI coaching', 'Tailored to every answer'],
              ].map(([title, sub]) => (
                <div key={title} className="flex items-start gap-3 bg-white/5 rounded-2xl p-4">
                  <span className="text-green-400 mt-0.5 flex-shrink-0">✓</span>
                  <div>
                    <p className="text-white font-medium text-sm">{title}</p>
                    <p className="text-white/50 text-xs">{sub}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* CTAs */}
          <div className="space-y-3">
            <Link
              href="/"
              className="block w-full bg-white/10 hover:bg-white/20 active:bg-white/30 backdrop-blur-lg border border-white/20 hover:border-white/40 transition-all duration-200 py-3.5 rounded-full font-semibold text-white"
            >
              Start Practicing Now →
            </Link>
            <Link
              href="/history"
              className="block w-full bg-white/5 hover:bg-white/10 backdrop-blur-lg border border-white/10 transition-all duration-200 py-3.5 rounded-full font-medium text-white/70 hover:text-white"
            >
              View Session History
            </Link>
          </div>
        </div>

        {/* Footer note */}
        <div className="mt-6 text-center space-y-1">
          <p className="text-white/40 text-sm">Thank you for subscribing to Pitcht Pro!</p>
          <p className="text-white/40 text-sm">
            Questions?{' '}
            <a href="mailto:contact@pitcht.us" className="text-white/60 hover:text-white/80 transition-colors">
              contact@pitcht.us
            </a>
          </p>
        </div>
      </div>

      <style jsx>{`
        @keyframes confetti {
          0% { transform: translateY(0) rotate(0deg); opacity: 1; }
          100% { transform: translateY(100vh) rotate(720deg); opacity: 0; }
        }
      `}</style>
    </main>
  );
}

export default function SuccessPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-gray-900 flex items-center justify-center">
        <div className="text-white">Loading...</div>
      </div>
    }>
      <SuccessContent />
    </Suspense>
  );
}
