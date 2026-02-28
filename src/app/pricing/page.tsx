'use client';

import { apiFetch } from '@/utils/api';
import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/services/supabase';
import Header from '@/components/Header';
import { toast } from 'sonner';

export default function PricingPage() {
  const router = useRouter();
  const { user, subscriptionStatus } = useAuth();
  const [isLoading, setIsLoading] = useState<string | null>(null);

  const handleSubscribe = async (priceId: string, _planName: string) => {
    if (!user) {
      // Redirect to home to sign up first
      router.push('/?signup=true');
      return;
    }

    setIsLoading(priceId);

    try {
      // Get the current session token for authorization
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();

      if (sessionError || !session) {
        console.error('No active session:', sessionError);
        toast.error('Please sign in again to subscribe.');
        setIsLoading(null);
        return;
      }

      // Create Stripe checkout session
      const response = await apiFetch('/api/create-checkout-session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          priceId,
          userId: user.id,
        }),
      });

      const data = await response.json();

      if (data.error) {
        console.error('Checkout error:', data.error);
        toast.error(data.error);
        setIsLoading(null);
        return;
      }

      // Redirect to Stripe Checkout using the URL
      if (data.url) {
        window.location.href = data.url;
      } else {
        throw new Error('No checkout URL received');
      }
    } catch (error) {
      console.error('Error creating checkout session:', error);
      toast.error('Failed to start checkout. Please try again.');
      setIsLoading(null);
    }
  };

  return (
    <main className="min-h-screen text-white p-8 pb-24 relative">
      {/* Background Gradient Overlay */}
      <div className="absolute inset-0 bg-black/80 backdrop-blur-md -z-10" />

      <Header />

      <div className="max-w-6xl mx-auto mt-20 relative z-10">
        {/* Page Header */}
        <div className="text-center mb-12">
          <h1 className="text-5xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-white/60 mb-4">
            Simple, Transparent Pricing
          </h1>
          <p className="text-white/60 text-lg max-w-2xl mx-auto">
            Start with a 5-day free trial. No credit card required. Cancel anytime.
          </p>
        </div>

        {/* Pricing Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-5xl mx-auto">
          {/* Free Tier */}
          <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl p-8 relative">
            <div className="text-center mb-6">
              <h3 className="text-2xl font-bold text-white mb-2">Free</h3>
              <div className="text-5xl font-bold text-white mb-4">
                $0<span className="text-xl text-white/50">/month</span>
              </div>
              <p className="text-white/60 text-sm">Perfect for trying out Pitcht</p>
            </div>

            <div className="space-y-4 mb-8">
              <div className="flex items-start gap-3">
                <span className="text-green-400 mt-1">✓</span>
                <div>
                  <p className="text-white font-medium">5-day trial</p>
                  <p className="text-white/50 text-sm">Full access to all features</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <span className="text-green-400 mt-1">✓</span>
                <div>
                  <p className="text-white font-medium">1 session included</p>
                  <p className="text-white/50 text-sm">Use it anytime during your trial</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <span className="text-green-400 mt-1">✓</span>
                <div>
                  <p className="text-white font-medium">AI-powered feedback</p>
                  <p className="text-white/50 text-sm">Speech + video analysis</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <span className="text-green-400 mt-1">✓</span>
                <div>
                  <p className="text-white font-medium">Basic analytics</p>
                  <p className="text-white/50 text-sm">Performance metrics</p>
                </div>
              </div>
            </div>

            {!user ? (
              <Link
                href="/?signup=true"
                className="block w-full bg-white/10 hover:bg-white/20 active:bg-white/30 backdrop-blur-lg border border-white/20 transition-all duration-200 py-3 rounded-full text-center font-semibold"
              >
                Start Free Trial
              </Link>
            ) : subscriptionStatus.isTrialing ? (
              <div className="w-full bg-white/5 border border-white/10 py-3 rounded-full text-center text-white/50">
                Current Plan (Trial Active)
              </div>
            ) : !subscriptionStatus.isPremium ? (
              <div className="w-full bg-white/5 border border-white/10 py-3 rounded-full text-center text-white/50">
                Current Plan
              </div>
            ) : null}
          </div>

          {/* Premium Monthly */}
          <div className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-3xl p-8 relative shadow-2xl">
            {/* Popular Badge */}
            <div className="absolute -top-4 left-1/2 transform -translate-x-1/2">
              <span className="bg-white/20 backdrop-blur-sm border border-white/30 text-white px-4 py-1 rounded-full text-sm font-semibold">
                Most Popular
              </span>
            </div>

            <div className="text-center mb-6">
              <h3 className="text-2xl font-bold text-white mb-2">Pro</h3>
              <div className="text-5xl font-bold text-white mb-4">
                $14.99<span className="text-xl text-white/50">/month</span>
              </div>
              <p className="text-white/60 text-sm">Unlimited practice & insights</p>
            </div>

            <div className="space-y-4 mb-8">
              <div className="flex items-start gap-3">
                <span className="text-green-400 mt-1">✓</span>
                <div>
                  <p className="text-white font-medium">Unlimited sessions</p>
                  <p className="text-white/50 text-sm">Practice as much as you need</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <span className="text-green-400 mt-1">✓</span>
                <div>
                  <p className="text-white font-medium">Full session history</p>
                  <p className="text-white/50 text-sm">Review all past recordings</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <span className="text-green-400 mt-1">✓</span>
                <div>
                  <p className="text-white font-medium">Progress tracking</p>
                  <p className="text-white/50 text-sm">See improvement trends over time</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <span className="text-green-400 mt-1">✓</span>
                <div>
                  <p className="text-white font-medium">Eye contact & speech metrics</p>
                  <p className="text-white/50 text-sm">Every session, every answer</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <span className="text-green-400 mt-1">✓</span>
                <div>
                  <p className="text-white font-medium">AI coaching on your answers</p>
                  <p className="text-white/50 text-sm">Tailored to your job description</p>
                </div>
              </div>
            </div>

            {subscriptionStatus.isPremium ? (
              <div className="w-full bg-white/10 border border-white/20 py-3 rounded-full text-center text-white font-semibold">
                Current Plan ✓
              </div>
            ) : (
              <button
                onClick={() =>
                  handleSubscribe(
                    process.env.NEXT_PUBLIC_STRIPE_PRICE_MONTHLY!,
                    'Pro Monthly'
                  )
                }
                disabled={isLoading === process.env.NEXT_PUBLIC_STRIPE_PRICE_MONTHLY}
                className="w-full bg-white text-black hover:bg-white/90 active:bg-white/80 transition-all duration-200 py-3 rounded-full font-bold shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading === process.env.NEXT_PUBLIC_STRIPE_PRICE_MONTHLY
                  ? 'Loading...'
                  : !user
                  ? 'Start 5-Day Free Trial'
                  : subscriptionStatus.isTrialing
                  ? 'Upgrade to Pro'
                  : 'Get Pro'}
              </button>
            )}
          </div>
        </div>

        {/* Annual Plan */}
        <div className="max-w-5xl mx-auto mt-8">
          <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl p-6 relative">
            <div className="flex flex-col md:flex-row items-center justify-between gap-6">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2">
                  <h3 className="text-2xl font-bold text-white">Annual Plan</h3>
                  <span className="bg-green-500/20 text-green-400 px-3 py-1 rounded-full text-sm font-semibold">
                    2 Months Free
                  </span>
                </div>
                <p className="text-white/60 mb-2">
                  Get Pro for <span className="text-white font-bold">$149/year</span>
                </p>
                <p className="text-white/50 text-sm">
                  That&apos;s only <span className="text-green-400 font-semibold">$12.42/month</span> — 2 months free!
                </p>
              </div>
              <div className="flex-shrink-0">
                {subscriptionStatus.isPremium && !subscriptionStatus.isTrialing ? (
                  <div className="px-8 py-3 bg-white/5 border border-white/10 rounded-full text-white/50">
                    Current Plan ✓
                  </div>
                ) : (
                  <button
                    onClick={() =>
                      handleSubscribe(
                        process.env.NEXT_PUBLIC_STRIPE_PRICE_ANNUAL!,
                        'Pro Annual'
                      )
                    }
                    disabled={isLoading === process.env.NEXT_PUBLIC_STRIPE_PRICE_ANNUAL}
                    className="px-8 py-3 bg-white text-black hover:bg-white/90 active:bg-white/80 transition-all duration-200 rounded-full font-bold shadow-lg disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                  >
                    {isLoading === process.env.NEXT_PUBLIC_STRIPE_PRICE_ANNUAL
                      ? 'Loading...'
                      : 'Subscribe Annually'}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* FAQ / Additional Info */}
        <div className="max-w-3xl mx-auto mt-16 text-center">
          <h2 className="text-2xl font-bold text-white mb-6">Frequently Asked Questions</h2>
          <div className="space-y-4 text-left">
            <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6">
              <h3 className="text-white font-semibold mb-2">Can I cancel anytime?</h3>
              <p className="text-white/60 text-sm">
                Yes! You can cancel your subscription at any time. You&apos;ll continue to have access until the end of your current billing period.
              </p>
            </div>
            <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6">
              <h3 className="text-white font-semibold mb-2">What happens after the trial?</h3>
              <p className="text-white/60 text-sm">
                Your trial session stays in your history. You can upgrade anytime to keep practicing. Your data is never deleted.
              </p>
            </div>
            <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6">
              <h3 className="text-white font-semibold mb-2">Do you offer refunds?</h3>
              <p className="text-white/60 text-sm">
                Yes! We offer a 30-day money-back guarantee. If you&apos;re not satisfied, contact us for a full refund.
              </p>
            </div>
          </div>
        </div>

        {/* Back to Home */}
        <div className="text-center mt-12">
          <Link
            href="/"
            className="inline-block text-white/60 hover:text-white transition-colors"
          >
            ← Back to Home
          </Link>
        </div>
      </div>
    </main>
  );
}
