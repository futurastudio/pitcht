'use client';

import React, { useState } from 'react';
import { useAuth } from '@/context/AuthContext';

interface SignupModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLogin: () => void;
  /** Called after signup succeeds — use to resume a pending flow (e.g. start session) */
  onSignupComplete?: () => void;
}

export default function SignupModal({ isOpen, onClose, onLogin, onSignupComplete }: SignupModalProps) {
  const { signUp, signInWithGoogle } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    // Basic password validation
    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      setLoading(false);
      return;
    }

    try {
      await signUp(email, password);
      if (onSignupComplete) {
        onSignupComplete();
      } else {
        onClose();
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create account');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    try {
      await signInWithGoogle();
      // OAuth will redirect, no need to close modal
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to sign in with Google');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-md bg-white/10 backdrop-blur-xl border border-white/20 shadow-2xl rounded-3xl p-8 animate-in fade-in zoom-in duration-200">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-6 right-6 text-white/50 hover:text-white transition-colors"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>

        <h2 className="text-2xl font-bold text-white mb-2">Create Your Free Account</h2>
        <p className="text-white/60 text-sm mb-6">1 free session included · no credit card required</p>

        {error && (
          <div className="mb-4 p-3 bg-red-500/20 border border-red-500/30 rounded-xl text-red-100 text-sm">
            {error}
          </div>
        )}

        {/* Free session benefits */}
        <div className="mb-6 p-4 bg-white/5 border border-white/10 rounded-xl">
          <p className="text-white/90 text-sm font-semibold mb-2">Your free session includes:</p>
          <ul className="space-y-1.5 text-white/70 text-sm">
            <li className="flex items-center gap-2">
              <span className="text-green-400">✓</span> 1 full practice session
            </li>
            <li className="flex items-center gap-2">
              <span className="text-green-400">✓</span> AI-powered feedback
            </li>
            <li className="flex items-center gap-2">
              <span className="text-green-400">✓</span> Video &amp; speech analysis
            </li>
            <li className="flex items-center gap-2">
              <span className="text-green-400">✓</span> Progress tracking
            </li>
          </ul>
        </div>

        {/* Google OAuth Button */}
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

        <div className="relative my-6">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-white/20"></div>
          </div>
          <div className="relative flex justify-center text-sm">
            <span className="px-2 bg-transparent text-white/50">or</span>
          </div>
        </div>

        {/* Email/Password Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-3 bg-black/20 border border-white/10 rounded-xl text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-white/20"
              required
              disabled={loading}
            />
          </div>

          <div>
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
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full px-4 py-3 bg-white text-black font-bold rounded-xl hover:bg-white/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Creating account...' : 'Create Free Account'}
          </button>
        </form>

        <p className="mt-4 text-center text-white/50 text-xs">
          No credit card required
        </p>

        <p className="mt-6 text-center text-white/60 text-sm">
          Already have an account?{' '}
          <button
            onClick={() => {
              onClose();
              onLogin();
            }}
            className="text-white font-semibold hover:underline"
          >
            Sign in
          </button>
        </p>
      </div>
    </div>
  );
}
