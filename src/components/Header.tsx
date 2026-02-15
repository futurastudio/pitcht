'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';
import LoginModal from './LoginModal';
import SignupModal from './SignupModal';

export default function Header() {
  const { user, subscriptionStatus, signOut } = useAuth();
  const [showLogin, setShowLogin] = useState(false);
  const [showSignup, setShowSignup] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);

  return (
    <>
      <header className="absolute top-0 left-0 right-0 z-40 p-6">
        <div className="flex justify-between items-center">
          {/* Logo */}
          <Link href="/" className="text-white font-bold text-xl">
            Pitcht
          </Link>

          <div className="flex items-center gap-4">
            {/* Upgrade CTA for free tier users */}
            {user && !subscriptionStatus.isPremium && (
              <Link
                href="/pricing"
                className="hidden sm:flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-500 to-blue-500 hover:from-purple-600 hover:to-blue-600 transition-all duration-200 rounded-full text-sm font-semibold shadow-lg"
              >
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                </svg>
                Upgrade to Premium
              </Link>
            )}

            {/* User Menu or Sign In Button */}
            {user ? (
            <div className="relative">
              {/* User Button */}
              <button
                onClick={() => setShowUserMenu(!showUserMenu)}
                className="flex items-center gap-2 px-4 py-2 bg-white/10 backdrop-blur-xl border border-white/20 rounded-full text-white hover:bg-white/20 transition-all"
              >
                <div className="w-6 h-6 bg-gradient-to-br from-purple-500 to-pink-500 rounded-full flex items-center justify-center text-xs font-bold">
                  {user.email?.[0]?.toUpperCase() || 'U'}
                </div>
                <span className="text-sm">
                  {subscriptionStatus.isPremium ? 'Premium' : subscriptionStatus.isTrialing ? 'Trial' : 'Free'}
                </span>
              </button>

              {/* Dropdown Menu */}
              {showUserMenu && (
                <>
                  {/* Backdrop to close menu */}
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => setShowUserMenu(false)}
                  />

                  {/* Menu */}
                  <div className="absolute right-0 mt-2 w-64 bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl shadow-2xl overflow-hidden z-50">
                    <div className="p-4 border-b border-white/10">
                      <p className="text-white text-sm font-semibold truncate">{user.email}</p>
                      <p className="text-white/50 text-xs mt-1">
                        {subscriptionStatus.isPremium && 'Premium Member'}
                        {subscriptionStatus.isTrialing && `Trial ends ${subscriptionStatus.trialEndsAt ? new Date(subscriptionStatus.trialEndsAt).toLocaleDateString() : 'soon'}`}
                        {!subscriptionStatus.isPremium && !subscriptionStatus.isTrialing && `${subscriptionStatus.sessionsThisMonth}/1 sessions used`}
                      </p>
                    </div>

                    <div className="p-2">
                      {!subscriptionStatus.isPremium && (
                        <Link
                          href="/pricing"
                          className="block w-full text-left px-4 py-2 text-white hover:bg-white/10 rounded-lg transition-colors"
                        >
                          <span className="text-sm font-semibold">Upgrade to Premium</span>
                        </Link>
                      )}

                      <Link
                        href="/history"
                        className="block w-full text-left px-4 py-2 text-white/80 hover:bg-white/10 rounded-lg transition-colors text-sm"
                      >
                        Session History
                      </Link>

                      <Link
                        href="/settings"
                        className="block w-full text-left px-4 py-2 text-white/80 hover:bg-white/10 rounded-lg transition-colors text-sm"
                      >
                        Account Settings
                      </Link>

                      <button
                        onClick={async () => {
                          try {
                            await signOut();
                            setShowUserMenu(false);
                          } catch (error) {
                            console.error('Sign out error:', error);
                          }
                        }}
                        className="block w-full text-left px-4 py-2 text-red-400 hover:bg-white/10 rounded-lg transition-colors text-sm"
                      >
                        Sign Out
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          ) : (
            <button
              onClick={() => setShowSignup(true)}
              className="px-4 py-2 bg-white/10 backdrop-blur-xl border border-white/20 rounded-full text-white hover:bg-white/20 transition-all text-sm font-medium"
            >
              Start Free Trial
            </button>
            )}
          </div>
        </div>
      </header>

      {/* Modals */}
      <LoginModal
        isOpen={showLogin}
        onClose={() => setShowLogin(false)}
        onSignup={() => {
          setShowLogin(false);
          setShowSignup(true);
        }}
      />

      <SignupModal
        isOpen={showSignup}
        onClose={() => setShowSignup(false)}
        onLogin={() => {
          setShowSignup(false);
          setShowLogin(true);
        }}
      />
    </>
  );
}
