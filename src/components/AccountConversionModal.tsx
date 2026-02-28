'use client';

import React, { useState } from 'react';
import { useAuth } from '@/context/AuthContext';

interface AccountConversionModalProps {
  isOpen: boolean;
  onClose?: () => void;
}

export default function AccountConversionModal({ isOpen, onClose }: AccountConversionModalProps) {
  const { signUp, signInWithGoogle } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showLogin, setShowLogin] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      setLoading(false);
      return;
    }

    try {
      await signUp(email, password);
      // Modal will auto-close when user state changes
      if (onClose) onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create account');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    try {
      await signInWithGoogle();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to sign in with Google');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop (blurred analysis in background) */}
      <div className="absolute inset-0 bg-black/40" />

      {/* Modal */}
      <div className="relative w-full max-w-lg bg-white/10 backdrop-blur-xl border border-white/20 shadow-2xl rounded-3xl p-8">
        <div className="text-center mb-6">
          {/* Success Icon */}
          <div className="w-16 h-16 bg-gradient-to-br from-green-500 to-emerald-500 rounded-full mx-auto mb-4 flex items-center justify-center">
            <span className="text-3xl">🎉</span>
          </div>

          <h2 className="text-2xl font-bold text-white mb-2">Session Complete!</h2>
          <p className="text-white/70">
            Sign up free to unlock your analysis and track your progress
          </p>
        </div>

        {/* What's Unlocked */}
        <div className="mb-6 p-4 bg-black/20 rounded-xl">
          <p className="text-white/90 text-sm font-semibold mb-2">Your analysis includes:</p>
          <ul className="space-y-1.5 text-white/70 text-sm">
            <li className="flex items-center gap-2">
              <span className="text-green-400">🎯</span> AI Performance Score
            </li>
            <li className="flex items-center gap-2">
              <span className="text-green-400">💬</span> Speech Analysis (clarity, pacing, filler words)
            </li>
            <li className="flex items-center gap-2">
              <span className="text-green-400">👁️</span> Video Metrics (eye contact, presence)
            </li>
            <li className="flex items-center gap-2">
              <span className="text-green-400">🤖</span> Personalized Coaching Feedback
            </li>
          </ul>
        </div>

        {/* Trial Info */}
        <div className="mb-6 p-3 bg-gradient-to-br from-purple-500/20 to-pink-500/20 border border-white/10 rounded-xl text-center">
          <p className="text-white/90 text-sm font-semibold">
            7-day free trial • No credit card required
          </p>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-500/20 border border-red-500/30 rounded-xl text-red-100 text-sm">
            {error}
          </div>
        )}

        {!showLogin ? (
          <>
            {/* Google OAuth */}
            <button
              onClick={handleGoogleSignIn}
              className="w-full mb-4 px-4 py-3 bg-white text-black font-semibold rounded-xl hover:bg-gray-100 transition-colors flex items-center justify-center gap-3"
            >
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                <path d="M19.6 10.227c0-.709-.064-1.39-.182-2.045H10v3.868h5.382a4.6 4.6 0 01-1.996 3.018v2.51h3.232c1.891-1.742 2.982-4.305 2.982-7.35z" fill="#4285F4"/>
                <path d="M10 20c2.7 0 4.964-.895 6.618-2.423l-3.232-2.509c-.895.6-2.04.955-3.386.955-2.605 0-4.81-1.76-5.595-4.123H1.064v2.59A9.996 9.996 0 0010 20z" fill="#34A853"/>
                <path d="M4.405 11.9c-.2-.6-.314-1.24-.314-1.9 0-.66.114-1.3.314-1.9V5.51H1.064A9.996 9.996 0 000 10c0 1.614.386 3.14 1.064 4.49l3.34-2.59z" fill="#FBBC05"/>
                <path d="M10 3.977c1.468 0 2.786.505 3.823 1.496l2.868-2.868C14.96.99 12.695 0 10 0 6.09 0 2.71 2.24 1.064 5.51l3.34 2.59C5.19 5.736 7.395 3.977 10 3.977z" fill="#EA4335"/>
              </svg>
              Continue with Google
            </button>

            <div className="relative my-4">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-white/20"></div>
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-2 bg-transparent text-white/50">or</span>
              </div>
            </div>

            {/* Email/Password Form */}
            <form onSubmit={handleSubmit} className="space-y-3">
              <input
                type="email"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-3 bg-black/20 border border-white/10 rounded-xl text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-white/20"
                required
                disabled={loading}
              />

              <input
                type="password"
                placeholder="Password (min. 6 characters)"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 bg-black/20 border border-white/10 rounded-xl text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-white/20"
                required
                disabled={loading}
                minLength={6}
              />

              <button
                type="submit"
                disabled={loading}
                className="w-full px-4 py-3 bg-gradient-to-r from-purple-500 to-pink-500 text-white font-bold rounded-xl hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {loading ? 'Creating account...' : 'View My Results →'}
              </button>
            </form>

            <p className="mt-4 text-center text-white/60 text-sm">
              Already have an account?{' '}
              <button
                onClick={() => setShowLogin(true)}
                className="text-white font-semibold hover:underline"
              >
                Sign in
              </button>
            </p>
          </>
        ) : (
          <>
            {/* Login Form */}
            <p className="text-white/80 text-sm mb-4 text-center">Sign in to view your analysis</p>

            <form onSubmit={handleSubmit} className="space-y-3">
              <input
                type="email"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-3 bg-black/20 border border-white/10 rounded-xl text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-white/20"
                required
                disabled={loading}
              />

              <input
                type="password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 bg-black/20 border border-white/10 rounded-xl text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-white/20"
                required
                disabled={loading}
              />

              <button
                type="submit"
                disabled={loading}
                className="w-full px-4 py-3 bg-white text-black font-bold rounded-xl hover:bg-white/90 transition-colors disabled:opacity-50"
              >
                {loading ? 'Signing in...' : 'Sign In'}
              </button>
            </form>

            <p className="mt-4 text-center text-white/60 text-sm">
              Don&apos;t have an account?{' '}
              <button
                onClick={() => setShowLogin(false)}
                className="text-white font-semibold hover:underline"
              >
                Sign up free
              </button>
            </p>
          </>
        )}
      </div>
    </div>
  );
}
