'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/services/supabase';
import { useAuth } from '@/context/AuthContext';

/**
 * Password recovery landing page.
 *
 * Supabase's `resetPasswordForEmail` sends the user an email containing a
 * verification link. When they click it, Supabase verifies the token and
 * redirects the browser here with a session attached (it fires the
 * `PASSWORD_RECOVERY` auth event). At that point we're allowed to call
 * `supabase.auth.updateUser({ password })` to set the new password.
 *
 * States:
 *   - 'awaiting-session'  → session from the recovery link hasn't arrived yet
 *   - 'ready'             → recovery session is present, show the form
 *   - 'expired'           → no session and we've waited a reasonable amount of time
 *   - 'success'           → password updated, redirect shortly
 */
export default function ResetPasswordPage() {
    const router = useRouter();
    const { updatePassword } = useAuth();

    const [state, setState] = useState<'awaiting-session' | 'ready' | 'expired' | 'success'>('awaiting-session');
    const [password, setPassword] = useState('');
    const [confirm, setConfirm] = useState('');
    const [error, setError] = useState('');
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        // Check if a recovery session is already present (common when landing here
        // directly from the email link), and also subscribe to PASSWORD_RECOVERY.
        let cancelled = false;

        supabase.auth.getSession().then(({ data }) => {
            if (cancelled) return;
            if (data.session) {
                setState('ready');
            }
        });

        const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
            if (event === 'PASSWORD_RECOVERY' || (event === 'SIGNED_IN' && session)) {
                setState('ready');
            }
        });

        // If we're still waiting after 6s, the link is probably stale.
        const t = setTimeout(() => {
            setState((current) => (current === 'awaiting-session' ? 'expired' : current));
        }, 6000);

        return () => {
            cancelled = true;
            clearTimeout(t);
            subscription.unsubscribe();
        };
    }, []);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        if (password.length < 8) {
            setError('Password must be at least 8 characters.');
            return;
        }
        if (password !== confirm) {
            setError('Passwords do not match.');
            return;
        }

        setSubmitting(true);
        try {
            await updatePassword(password);
            setState('success');
            // Small delay so the user sees the success state before we navigate.
            setTimeout(() => router.push('/'), 1500);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to update password.');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <main className="min-h-screen flex items-center justify-center p-6 relative">
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm -z-10" />
            <div className="absolute inset-0 bg-[url('/grid.svg')] opacity-10 -z-10" />

            <div className="relative w-full max-w-md bg-white/10 backdrop-blur-xl border border-white/20 shadow-2xl rounded-3xl p-8">
                <h1 className="text-2xl font-bold text-white mb-2">Set a new password</h1>

                {state === 'awaiting-session' && (
                    <p className="text-white/60 text-sm">Verifying your reset link…</p>
                )}

                {state === 'expired' && (
                    <div className="space-y-4">
                        <p className="text-white/70 text-sm">
                            This reset link looks expired or invalid. Request a new one from the sign-in screen.
                        </p>
                        <Link
                            href="/"
                            className="inline-block px-5 py-2.5 rounded-full text-sm font-bold text-black bg-white hover:bg-white/90 transition-colors"
                        >
                            Back to home
                        </Link>
                    </div>
                )}

                {state === 'ready' && (
                    <>
                        <p className="text-white/60 text-sm mb-6">
                            Choose a new password for your account. At least 8 characters.
                        </p>

                        {error && (
                            <div className="mb-4 p-3 bg-red-500/20 border border-red-500/30 rounded-xl text-red-100 text-sm">
                                {error}
                            </div>
                        )}

                        <form onSubmit={handleSubmit} className="space-y-4">
                            <input
                                type="password"
                                placeholder="New password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="w-full px-4 py-3 bg-black/20 border border-white/10 rounded-xl text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-white/20"
                                required
                                minLength={8}
                                disabled={submitting}
                                autoFocus
                            />
                            <input
                                type="password"
                                placeholder="Confirm new password"
                                value={confirm}
                                onChange={(e) => setConfirm(e.target.value)}
                                className="w-full px-4 py-3 bg-black/20 border border-white/10 rounded-xl text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-white/20"
                                required
                                minLength={8}
                                disabled={submitting}
                            />
                            <button
                                type="submit"
                                disabled={submitting}
                                className="w-full px-4 py-3 bg-white text-black font-bold rounded-xl hover:bg-white/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {submitting ? 'Updating…' : 'Update password'}
                            </button>
                        </form>
                    </>
                )}

                {state === 'success' && (
                    <div className="space-y-2">
                        <p className="text-white text-sm">
                            <span className="text-green-400">✓</span> Password updated. Taking you home…
                        </p>
                    </div>
                )}
            </div>
        </main>
    );
}
