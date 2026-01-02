'use client';

import { apiFetch } from '@/utils/api';
import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/services/supabase';
import Header from '@/components/Header';

export default function SettingsPage() {
  const router = useRouter();
  const { user, subscriptionStatus, signOut } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingPortal, setIsLoadingPortal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

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
      const response = await apiFetch(/'api/create-portal-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id }),
      });

      const data = await response.json();

      if (response.ok && data.url) {
        window.location.href = data.url;
      } else {
        console.error('Error creating portal session:', data.error);
        alert('Failed to open billing portal. Please try again.');
        setIsLoadingPortal(false);
      }
    } catch (error) {
      console.error('Error:', error);
      alert('Failed to open billing portal. Please try again.');
      setIsLoadingPortal(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (!user) return;
    if (deleteConfirmText !== 'DELETE') {
      alert('Please type DELETE to confirm account deletion');
      return;
    }

    setIsDeleting(true);
    try {
      // Get current session token from Supabase
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();

      if (sessionError || !session) {
        alert('Authentication error. Please sign in again and try deleting your account.');
        setIsDeleting(false);
        setShowDeleteConfirm(false);
        setDeleteConfirmText('');
        return;
      }

      const token = session.access_token;

      const response = await apiFetch(/'api/delete-account', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
      });

      const data = await response.json();

      if (response.ok) {
        alert('Your account has been permanently deleted. You will be redirected to the home page.');
        // Sign out and redirect
        await signOut();
        router.push('/');
      } else {
        console.error('Delete account error:', data.error);
        alert(data.message || 'Failed to delete account. Please try again or contact support.');
        setIsDeleting(false);
        setShowDeleteConfirm(false);
        setDeleteConfirmText('');
      }
    } catch (error) {
      console.error('Error deleting account:', error);
      alert('An error occurred while deleting your account. Please try again or contact support.');
      setIsDeleting(false);
      setShowDeleteConfirm(false);
      setDeleteConfirmText('');
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
                    <span className="w-2 h-2 bg-purple-400 rounded-full"></span>
                    Premium
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
          <div className="bg-gradient-to-br from-purple-500/20 to-blue-500/20 backdrop-blur-xl border border-purple-400/30 rounded-3xl p-8 mb-6">
            <h2 className="text-2xl font-bold text-white mb-4">Upgrade to Premium</h2>
            <p className="text-white/70 mb-6">
              Get unlimited practice sessions, full session history, and advanced analytics.
            </p>
            <Link
              href="/pricing"
              className="inline-block px-6 py-3 bg-gradient-to-r from-purple-500 to-blue-500 hover:from-purple-600 hover:to-blue-600 transition-all duration-200 rounded-full font-semibold shadow-lg"
            >
              View Pricing Plans
            </Link>
          </div>
        )}

        {subscriptionStatus.isPremium && (
          <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl p-8 mb-6">
            <h2 className="text-2xl font-bold text-white mb-6">Premium Subscription</h2>

            {/* Feature List */}
            <div className="mb-6">
              <h3 className="text-lg font-semibold text-white mb-4">Your Premium Features</h3>
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
