'use client';

import { apiFetch } from '@/utils/api';
import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/services/supabase';
import Header from '@/components/Header';
import { toast } from 'sonner';

export default function SettingsPage() {
  const router = useRouter();
  const { user, subscriptionStatus, signOut, refreshSubscriptionStatus } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingPortal, setIsLoadingPortal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  // SMS Accountability Agent state
  const [phoneNumber, setPhoneNumber] = useState('');
  const [smsOptIn, setSmsOptIn] = useState(false);
  const [timezone, setTimezone] = useState('America/New_York');
  const [isSavingSms, setIsSavingSms] = useState(false);
  const [smsLoaded, setSmsLoaded] = useState(false);

  // Pull fresh subscription status when the settings page opens.
  // Without this, the "Premium / Trial / Free" badge can lag behind reality
  // (e.g. a user just completed checkout on another tab, or finished a session
  // and came straight here — AuthContext only auto-refreshes on auth events).
  useEffect(() => {
    if (user) {
      refreshSubscriptionStatus();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // When the window regains focus (user returns from Stripe billing portal),
  // clear the stuck loading state so the button is usable again AND pull a
  // fresh subscription status in case the portal changed their plan.
  useEffect(() => {
    const handleFocus = () => {
      if (isLoadingPortal) setIsLoadingPortal(false);
      if (user) refreshSubscriptionStatus();
    };
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') handleFocus();
    };
    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoadingPortal]);

  // Load existing SMS preferences
  useEffect(() => {
    if (!user) return;
    const loadSmsPrefs = async () => {
      try {
        const { data, error } = await supabase
          .from('sms_preferences')
          .select('phone_number, sms_opt_in, timezone')
          .eq('user_id', user.id)
          .maybeSingle(); // maybeSingle() returns null (not error) when no row exists
        if (error) {
          console.error('Failed to load SMS preferences:', error);
          return;
        }
        if (data) {
          setPhoneNumber(data.phone_number || '');
          setSmsOptIn(data.sms_opt_in || false);
          setTimezone(data.timezone || 'America/New_York');
        }
      } catch (err) {
        console.error('Unexpected error loading SMS preferences:', err);
      } finally {
        setSmsLoaded(true);
      }
    };
    loadSmsPrefs();
  }, [user]);

  if (!user) {
    return (
      <main className="min-h-screen text-white p-8 relative">
        <div className="absolute inset-0 bg-black/80 backdrop-blur-md -z-10" />
        <div className="max-w-2xl mx-auto text-center pt-20">
          <p className="text-white/60">Please log in to view your settings.</p>
          <Link href="/" className="text-purple-400 hover:text-purple-300">
            Go to Home
          </Link>
        </div>
      </main>
    );
  }

  const handleSignOut = async () => {
    setIsLoading(true);
    try {
      await signOut();
      router.push('/');
    } catch (error) {
      console.error('Sign out error:', error);
      setIsLoading(false);
    }
  };

  const handleManageSubscription = async () => {
    if (!user) return;

    setIsLoadingPortal(true);
    try {
      // Get the current session token for authorization
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();

      if (sessionError || !session) {
        console.error('No active session:', sessionError);
        toast.error('Please sign in again to manage your subscription.');
        setIsLoadingPortal(false);
        return;
      }

      const response = await apiFetch('/api/create-portal-session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ userId: user.id, returnOrigin: window.location.origin }),
      });

      const data = await response.json();

      if (response.ok && data.url) {
        window.location.href = data.url;
      } else {
        console.error('Error creating portal session:', data.error);
        if (response.status === 404) {
          toast.error('Unable to access billing portal.', {
            description: 'This can happen when switching Stripe accounts. Contact support or re-subscribe from the Pricing page.',
            duration: 8000,
          });
        } else {
          toast.error('Failed to open billing portal. Please try again.');
        }
        setIsLoadingPortal(false);
      }
    } catch (error) {
      console.error('Error:', error);
      toast.error('Failed to open billing portal. Please try again.');
      setIsLoadingPortal(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (!user) return;
    if (deleteConfirmText !== 'DELETE') {
      toast.error('Please type DELETE to confirm account deletion.');
      return;
    }

    setIsDeleting(true);
    try {
      // Get current session token from Supabase
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();

      if (sessionError || !session) {
        toast.error('Authentication error. Please sign in again and try deleting your account.');
        setIsDeleting(false);
        setShowDeleteConfirm(false);
        setDeleteConfirmText('');
        return;
      }

      const token = session.access_token;

      const response = await apiFetch('/api/delete-account', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
      });

      const data = await response.json();

      if (response.ok) {
        toast.success('Your account has been permanently deleted.');
        // Sign out and redirect
        await signOut();
        router.push('/');
      } else {
        console.error('Delete account error:', data.error);
        toast.error(data.message || 'Failed to delete account. Please try again or contact support.');
        setIsDeleting(false);
        setShowDeleteConfirm(false);
        setDeleteConfirmText('');
      }
    } catch (error) {
      console.error('Error deleting account:', error);
      toast.error('An error occurred while deleting your account. Please try again or contact support.');
      setIsDeleting(false);
      setShowDeleteConfirm(false);
      setDeleteConfirmText('');
    }
  };

  const handleSaveSms = async () => {
    if (!user) return;

    // Strict E.164 US phone validation
    const cleaned = phoneNumber.replace(/\D/g, '');
    if (phoneNumber) {
      // Accept exactly 10 digits (US local) or 11 digits starting with 1 (US with country code)
      const isValid10 = cleaned.length === 10;
      const isValid11 = cleaned.length === 11 && cleaned.startsWith('1');
      if (!isValid10 && !isValid11) {
        toast.error('Please enter a valid 10-digit US phone number (e.g. 555-123-4567).');
        return;
      }
    }
    if (smsOptIn && !phoneNumber) {
      toast.error('Please enter a phone number to enable text reminders.');
      return;
    }

    // Build E.164 from the last 10 digits (works for both 10- and 11-digit inputs)
    const e164 = phoneNumber ? `+1${cleaned.slice(-10)}` : '';

    setIsSavingSms(true);
    try {
      const { error } = await supabase
        .from('sms_preferences')
        .upsert({
          user_id: user.id,
          phone_number: e164 || null,
          sms_opt_in: smsOptIn,
          sms_consent_at: smsOptIn ? new Date().toISOString() : null,
          timezone,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id' });

      if (error) {
        console.error('Failed to save SMS preferences:', error);
        toast.error('Failed to save preferences. Please try again.');
        return;
      }
      toast.success(smsOptIn ? 'Text reminders enabled.' : 'SMS preferences saved.');
    } catch (err) {
      console.error('Unexpected error saving SMS preferences:', err);
      toast.error('Network error. Check your connection and try again.');
    } finally {
      setIsSavingSms(false);
    }
  };

  return (
    <main className="min-h-screen text-white p-8 pb-24 relative">
      {/* Background Gradient Overlay */}
      <div className="absolute inset-0 bg-black/80 backdrop-blur-md -z-10" />

      <Header />

      <div className="max-w-4xl mx-auto mt-20 relative z-10">
        {/* Page Header */}
        <div className="mb-12">
          <h1 className="text-4xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-white/60 mb-2">
            Account Settings
          </h1>
          <p className="text-white/60">Manage your Pitcht account and subscription</p>
        </div>

        {/* Account Information */}
        <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl p-8 mb-6">
          <h2 className="text-2xl font-bold text-white mb-6">Account Information</h2>

          <div className="space-y-4">
            <div>
              <label className="text-white/50 text-sm">Email</label>
              <p className="text-white text-lg">{user.email}</p>
            </div>

            <div>
              <label className="text-white/50 text-sm">Account Type</label>
              <p className="text-white text-lg">
                {subscriptionStatus.isPremium && (
                  <span className="inline-flex items-center gap-2">
                    <span className="w-2 h-2 bg-white/60 rounded-full"></span>
                    Pro
                  </span>
                )}
                {subscriptionStatus.isTrialing && !subscriptionStatus.isPremium && (
                  <span className="inline-flex items-center gap-2">
                    <span className="w-2 h-2 bg-blue-400 rounded-full"></span>
                    Trial Active
                  </span>
                )}
                {!subscriptionStatus.isPremium && !subscriptionStatus.isTrialing && (
                  <span className="inline-flex items-center gap-2">
                    <span className="w-2 h-2 bg-gray-400 rounded-full"></span>
                    Free
                  </span>
                )}
              </p>
            </div>

            {subscriptionStatus.isTrialing && (
              <div>
                <label className="text-white/50 text-sm">Trial Ends</label>
                <p className="text-white text-lg">
                  {subscriptionStatus.trialEndsAt
                    ? new Date(subscriptionStatus.trialEndsAt).toLocaleDateString()
                    : 'Unknown'}
                </p>
              </div>
            )}

            {!subscriptionStatus.isPremium && !subscriptionStatus.isTrialing && (
              <div>
                <label className="text-white/50 text-sm">Sessions This Month</label>
                <p className="text-white text-lg">
                  {subscriptionStatus.sessionsThisMonth} / 1 used
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Subscription Management */}
        {!subscriptionStatus.isPremium && (
          <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl p-8 mb-6">
            <h2 className="text-2xl font-bold text-white mb-4">Upgrade to Pro</h2>
            <p className="text-white/70 mb-6">
              Get unlimited practice sessions, full session history, and advanced analytics.
            </p>
            <Link
              href="/pricing"
              className="inline-block px-6 py-3 bg-white/10 hover:bg-white/20 backdrop-blur-xl border border-white/30 hover:border-white/50 transition-all duration-200 rounded-full font-semibold"
            >
              View Pricing Plans
            </Link>
          </div>
        )}

        {subscriptionStatus.isPremium && (
          <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl p-8 mb-6">
            <h2 className="text-2xl font-bold text-white mb-6">Pro Subscription</h2>

            {/* Feature List */}
            <div className="mb-6">
              <h3 className="text-lg font-semibold text-white mb-4">Your Pro Features</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="flex items-start gap-3">
                  <span className="text-white/80 mt-1 flex-shrink-0">✓</span>
                  <div>
                    <p className="text-white font-medium">Unlimited practice sessions</p>
                    <p className="text-white/60 text-sm">No limits, practice as much as you need</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <span className="text-white/80 mt-1 flex-shrink-0">✓</span>
                  <div>
                    <p className="text-white font-medium">Full session history</p>
                    <p className="text-white/60 text-sm">Review all your past recordings</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <span className="text-white/80 mt-1 flex-shrink-0">✓</span>
                  <div>
                    <p className="text-white font-medium">Progress tracking</p>
                    <p className="text-white/60 text-sm">Charts showing your improvement</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <span className="text-white/80 mt-1 flex-shrink-0">✓</span>
                  <div>
                    <p className="text-white font-medium">Advanced analytics</p>
                    <p className="text-white/60 text-sm">Deep insights into your performance</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Manage Subscription Button */}
            <button
              onClick={handleManageSubscription}
              disabled={isLoadingPortal}
              className="w-full px-6 py-3 bg-white/10 hover:bg-white/20 border border-white/20 transition-all duration-200 rounded-full font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoadingPortal ? 'Opening Billing Portal...' : 'Manage Subscription & Billing'}
            </button>
            <p className="text-white/50 text-sm mt-3 text-center">
              Update payment method, view invoices, or cancel subscription
            </p>
          </div>
        )}

        {/* SMS Accountability Agent */}
        <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl p-8 mb-6">
          <div className="flex items-start justify-between mb-2">
            <h2 className="text-2xl font-bold text-white">Accountability Coach</h2>
            <span className="text-xs bg-purple-500/20 text-purple-300 border border-purple-500/30 px-2 py-1 rounded-full font-medium">
              New
            </span>
          </div>
          <p className="text-white/60 text-sm mb-6">
            Get personalized text reminders based on your actual session data — practice streaks, score trends, and what to work on next.
          </p>

          {!smsLoaded ? (
            <div className="text-white/40 text-sm">Loading...</div>
          ) : (
            <div className="space-y-5">
              {/* Phone number */}
              <div>
                <label className="block text-white/70 text-sm font-medium mb-2">
                  Phone Number <span className="text-white/40 font-normal">(US numbers only)</span>
                </label>
                <input
                  type="tel"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  placeholder="(555) 123-4567"
                  className="w-full max-w-xs px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-white/30 focus:outline-none focus:border-purple-500/50 transition-colors"
                />
              </div>

              {/* Timezone */}
              <div>
                <label className="block text-white/70 text-sm font-medium mb-2">
                  Your Timezone
                </label>
                <select
                  value={timezone}
                  onChange={(e) => setTimezone(e.target.value)}
                  className="w-full max-w-xs px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white focus:outline-none focus:border-purple-500/50 transition-colors appearance-none"
                >
                  <option value="America/New_York">Eastern (ET)</option>
                  <option value="America/Chicago">Central (CT)</option>
                  <option value="America/Denver">Mountain (MT)</option>
                  <option value="America/Los_Angeles">Pacific (PT)</option>
                  <option value="America/Anchorage">Alaska (AKT)</option>
                  <option value="Pacific/Honolulu">Hawaii (HT)</option>
                </select>
              </div>

              {/* What you'll receive */}
              <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
                <p className="text-white/70 text-sm font-medium mb-3">What you&apos;ll receive</p>
                <ul className="space-y-2 text-white/60 text-sm">
                  <li className="flex items-start gap-2">
                    <span className="text-purple-400 mt-0.5">→</span>
                    <span><strong className="text-white/80">Inactivity nudge</strong> — if you haven&apos;t practiced in 5+ days</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-purple-400 mt-0.5">→</span>
                    <span><strong className="text-white/80">Weekly recap</strong> — your scores, trends, and one thing to focus on</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-purple-400 mt-0.5">→</span>
                    <span><strong className="text-white/80">Score alert</strong> — when a key metric drops or hits a personal best</span>
                  </li>
                </ul>
                <p className="text-white/40 text-xs mt-3">Messages sent between 9 AM–8 PM your time. Max 3/week. Reply STOP anytime.</p>
              </div>

              {/* Opt-in consent checkbox */}
              <label className="flex items-start gap-3 cursor-pointer group">
                <div className="relative mt-0.5 flex-shrink-0">
                  <input
                    type="checkbox"
                    checked={smsOptIn}
                    onChange={(e) => setSmsOptIn(e.target.checked)}
                    className="sr-only"
                  />
                  <div className={`w-5 h-5 rounded border-2 transition-all flex items-center justify-center ${smsOptIn ? 'bg-purple-500 border-purple-500' : 'border-white/30 group-hover:border-white/50'}`}>
                    {smsOptIn && (
                      <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </div>
                </div>
                <span className="text-white/60 text-xs leading-relaxed">
                  I agree to receive automated text reminders from Pitcht at the number above.
                  Message frequency varies (max 3/week). Message and data rates may apply.
                  Reply STOP to unsubscribe at any time. Consent is not required to use Pitcht.
                </span>
              </label>

              {/* Save button */}
              <button
                onClick={handleSaveSms}
                disabled={isSavingSms}
                className="px-6 py-3 bg-purple-500/20 hover:bg-purple-500/30 border border-purple-500/40 transition-all duration-200 rounded-full font-semibold text-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSavingSms ? 'Saving...' : 'Save Text Reminders'}
              </button>
            </div>
          )}
        </div>

        {/* Danger Zone */}
        <div className="bg-white/5 backdrop-blur-xl border border-red-500/30 rounded-3xl p-8">
          <h2 className="text-2xl font-bold text-white mb-6">Account Actions</h2>

          <div className="space-y-4">
            {/* Sign Out */}
            <div>
              <button
                onClick={handleSignOut}
                disabled={isLoading}
                className="px-6 py-3 bg-white/10 hover:bg-white/20 border border-white/20 transition-all duration-200 rounded-full font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading ? 'Signing Out...' : 'Sign Out'}
              </button>
            </div>

            {/* Delete Account */}
            <div className="pt-6 border-t border-red-500/30">
              <h3 className="text-lg font-semibold text-red-400 mb-2">Delete Account</h3>
              <p className="text-white/60 text-sm mb-4">
                Permanently delete your account and all associated data. This action cannot be undone.
              </p>
              <button
                onClick={() => setShowDeleteConfirm(true)}
                className="px-6 py-3 bg-red-500/20 hover:bg-red-500/30 border border-red-500/50 transition-all duration-200 rounded-full font-semibold"
              >
                Delete My Account
              </button>
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

      {/* Delete Account Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            onClick={() => {
              if (!isDeleting) {
                setShowDeleteConfirm(false);
                setDeleteConfirmText('');
              }
            }}
          />

          {/* Modal */}
          <div className="relative bg-gradient-to-br from-gray-900 to-gray-800 border border-red-500/30 rounded-3xl p-8 max-w-md w-full shadow-2xl">
            <h3 className="text-2xl font-bold text-red-400 mb-4">Delete Account?</h3>

            <div className="space-y-4 mb-6">
              <p className="text-white/80">
                This will permanently delete:
              </p>
              <ul className="list-disc list-inside space-y-2 text-white/60 text-sm ml-4">
                <li>All your practice sessions and recordings</li>
                <li>All video files and transcripts</li>
                <li>Your subscription and billing history</li>
                <li>Your account and profile data</li>
              </ul>
              <p className="text-red-400 font-semibold">
                ⚠️ This action cannot be undone!
              </p>
            </div>

            <div className="mb-6">
              <label className="block text-white/80 text-sm mb-2">
                Type <span className="font-bold text-red-400">DELETE</span> to confirm:
              </label>
              <input
                type="text"
                value={deleteConfirmText}
                onChange={(e) => setDeleteConfirmText(e.target.value)}
                placeholder="DELETE"
                disabled={isDeleting}
                className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-white/30 focus:outline-none focus:border-red-500/50 disabled:opacity-50"
                autoFocus
              />
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowDeleteConfirm(false);
                  setDeleteConfirmText('');
                }}
                disabled={isDeleting}
                className="flex-1 px-6 py-3 bg-white/10 hover:bg-white/20 border border-white/20 transition-all duration-200 rounded-full font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteAccount}
                disabled={isDeleting || deleteConfirmText !== 'DELETE'}
                className="flex-1 px-6 py-3 bg-red-500/20 hover:bg-red-500/30 border border-red-500/50 transition-all duration-200 rounded-full font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isDeleting ? 'Deleting...' : 'Delete Forever'}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
