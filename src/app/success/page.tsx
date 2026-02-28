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
    // Retries up to 5 times with 2-second gaps to handle Stripe webhook lag.
    if (!sessionId || !user) return;

    let cancelled = false;
    const MAX_ATTEMPTS = 5;
    const RETRY_DELAY_MS = 2000;

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
          // Always refresh so AuthContext reflects the new subscription
          if (refreshSubscriptionStatus) {
            await refreshSubscriptionStatus();
          }
          setIsVerifying(false);
        } else {
          console.error(`❌ Verification attempt failed (${attemptsLeft} left):`, data);
          if (attemptsLeft > 1 && !cancelled) {
            setTimeout(() => attempt(attemptsLeft - 1), RETRY_DELAY_MS);
          } else {
            setIsVerifying(false);
            setVerifyError(true);
          }
        }
      } catch (error) {
        console.error('❌ Error verifying subscription:', error);
        if (attemptsLeft > 1 && !cancelled) {
          setTimeout(() => attempt(attemptsLeft - 1), RETRY_DELAY_MS);
        } else {
          setIsVerifying(false);
          setVerifyError(true);
        }
      }
    };

    attempt(MAX_ATTEMPTS);

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, user]);

  if (!user) {
    return (
      <main className="min-h-screen text-white p-8 relative">
        <div className="absolute inset-0 bg-black/80 backdrop-blur-md -z-10" />
        <div className="max-w-2xl mx-auto text-center pt-20">
          <p className="text-white/60">Please log in to view this page.</p>
          <Link href="/" className="text-purple-400 hover:text-purple-300">
            Go to Home
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen text-white p-8 pb-24 relative overflow-hidden">
      {/* Background Gradient Overlay */}
      <div className="absolute inset-0 bg-black/80 backdrop-blur-md -z-10" />

      {/* Confetti Animation (CSS-only) */}
      {showConfetti && (
        <div className="fixed inset-0 pointer-events-none z-50">
          {[...Array(50)].map((_, i) => (
            <div
              key={i}
              className="absolute w-2 h-2 bg-gradient-to-br from-purple-400 to-blue-400 rounded-full animate-confetti"
              style={{
                left: `${Math.random() * 100}%`,
                top: '-10%',
                animationDelay: `${Math.random() * 2}s`,
                animationDuration: `${3 + Math.random() * 2}s`,
              }}
            />
          ))}
        </div>
      )}

      <Header />

      <div className="max-w-3xl mx-auto mt-20 relative z-10">
        {/* Success Card */}
        <div className="bg-gradient-to-br from-purple-500/20 to-blue-500/20 backdrop-blur-xl border border-purple-400/30 rounded-3xl p-12 text-center shadow-2xl">
          {/* Success Icon */}
          <div className="w-24 h-24 mx-auto mb-6 bg-gradient-to-br from-green-400 to-emerald-400 rounded-full flex items-center justify-center">
            <svg
              className="w-12 h-12 text-white"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={3}
                d="M5 13l4 4L19 7"
              />
            </svg>
          </div>

          {/* Success Message */}
          <h1 className="text-4xl font-bold text-white mb-4">
            Welcome to Pitcht Pro!
          </h1>
          <p className="text-xl text-white/80 mb-4">
            Your subscription is now active. Time to level up your practice!
          </p>

          {/* Verification status banner */}
          {isVerifying && (
            <div className="bg-white/10 border border-white/20 rounded-2xl px-4 py-2 mb-6 text-white/70 text-sm">
              Activating your subscription...
            </div>
          )}
          {verifyError && (
            <div className="bg-red-500/20 border border-red-400/30 rounded-2xl px-4 py-3 mb-6 text-red-300 text-sm">
              We had trouble confirming your subscription automatically. It will activate within a few minutes — or contact us at{' '}
              <a href="mailto:contact@pitcht.us" className="underline">contact@pitcht.us</a> if it doesn&apos;t.
            </div>
          )}

          {/* Subscription Details */}
          <div className="bg-white/10 backdrop-blur-lg border border-white/20 rounded-2xl p-6 mb-8">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div>
                <p className="text-white/60 text-sm mb-1">Status</p>
                <p className="text-white font-semibold">
                  {subscriptionStatus.isPremium ? 'Pro Active' : 'Activating...'}
                </p>
              </div>
              <div>
                <p className="text-white/60 text-sm mb-1">Sessions</p>
                <p className="text-white font-semibold">Unlimited</p>
              </div>
              <div>
                <p className="text-white/60 text-sm mb-1">Billing</p>
                <p className="text-white font-semibold">See account settings</p>
              </div>
            </div>
          </div>

          {/* What's Next */}
          <div className="text-left mb-8">
            <h2 className="text-2xl font-bold text-white mb-4 text-center">
              What&apos;s included in Premium
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex items-start gap-3">
                <span className="text-purple-400 mt-1 flex-shrink-0">✓</span>
                <div>
                  <p className="text-white font-medium">Unlimited practice sessions</p>
                  <p className="text-white/60 text-sm">No limits, practice as much as you need</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <span className="text-purple-400 mt-1 flex-shrink-0">✓</span>
                <div>
                  <p className="text-white font-medium">Full session history</p>
                  <p className="text-white/60 text-sm">Review all your past recordings</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <span className="text-purple-400 mt-1 flex-shrink-0">✓</span>
                <div>
                  <p className="text-white font-medium">Progress tracking</p>
                  <p className="text-white/60 text-sm">Charts showing your improvement</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <span className="text-purple-400 mt-1 flex-shrink-0">✓</span>
                <div>
                  <p className="text-white font-medium">Advanced analytics</p>
                  <p className="text-white/60 text-sm">Deep insights into your performance</p>
                </div>
              </div>
            </div>
          </div>

          {/* Call to Action */}
          <div className="space-y-4">
            <Link
              href="/"
              className="block w-full bg-gradient-to-r from-purple-500 to-blue-500 hover:from-purple-600 hover:to-blue-600 transition-all duration-200 py-4 rounded-full font-semibold text-lg shadow-lg"
            >
              Start Practicing Now →
            </Link>
            <Link
              href="/history"
              className="block w-full bg-white/10 hover:bg-white/20 backdrop-blur-lg border border-white/20 transition-all duration-200 py-4 rounded-full font-semibold"
            >
              View Session History
            </Link>
          </div>
        </div>

        {/* Additional Info */}
        <div className="mt-8 text-center">
          <p className="text-white/60 text-sm mb-4">
            Thank you for subscribing to Pitcht Pro!
          </p>
          <p className="text-white/60 text-sm">
            Questions? Contact us at{' '}
            <a href="mailto:contact@pitcht.us" className="text-purple-400 hover:text-purple-300">
              contact@pitcht.us
            </a>
          </p>
        </div>

      </div>

      <style jsx>{`
        @keyframes confetti {
          0% {
            transform: translateY(0) rotate(0deg);
            opacity: 1;
          }
          100% {
            transform: translateY(100vh) rotate(720deg);
            opacity: 0;
          }
        }
        .animate-confetti {
          animation: confetti linear forwards;
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
