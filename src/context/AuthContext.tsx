'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { supabase } from '@/services/supabase';
import { convertAnonymousToRealAccount } from '@/services/auth';
import type { User } from '@supabase/supabase-js';

interface SubscriptionStatus {
  isPremium: boolean;
  isTrialing: boolean;
  trialEndsAt: Date | null;
  sessionsThisMonth: number;
  canStartSession: boolean;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  subscriptionStatus: SubscriptionStatus;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  /** Sends a password reset email. The link in the email will route the user
   *  to `/auth/reset-password` where they can set a new password. */
  sendPasswordReset: (email: string) => Promise<void>;
  /** Updates the current user's password. Call this on the
   *  `/auth/reset-password` page after Supabase fires PASSWORD_RECOVERY. */
  updatePassword: (newPassword: string) => Promise<void>;
  refreshSubscriptionStatus: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [subscriptionStatus, setSubscriptionStatus] = useState<SubscriptionStatus>({
    isPremium: false,
    isTrialing: false,
    trialEndsAt: null,
    sessionsThisMonth: 0,
    canStartSession: true,
  });

  // Initialize auth state
  useEffect(() => {
    // Check active sessions and set initial state
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });

    // Listen for auth changes.
    // We explicitly handle each event type to avoid spurious logouts:
    // - SIGNED_IN / INITIAL_SESSION: user authenticated, set user
    // - SIGNED_OUT: user explicitly signed out, clear user
    // - TOKEN_REFRESHED: session renewed silently — update user but NEVER clear it
    //   (a failed refresh fires SIGNED_OUT separately, not TOKEN_REFRESHED)
    // - PASSWORD_RECOVERY / USER_UPDATED: update user object
    // Ignoring unknown events prevents a Supabase internal event from
    // unexpectedly logging the user out (e.g. on return from Stripe checkout).
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      console.log('[auth] onAuthStateChange:', event, session?.user?.id ?? 'no user');

      if (event === 'SIGNED_OUT') {
        setUser(null);
        setSubscriptionStatus({
          isPremium: false,
          isTrialing: false,
          trialEndsAt: null,
          sessionsThisMonth: 0,
          canStartSession: true,
        });
      } else if (session?.user) {
        // SIGNED_IN, INITIAL_SESSION, TOKEN_REFRESHED, USER_UPDATED, PASSWORD_RECOVERY
        setUser(session.user);
        // On explicit sign-in or initial session load, immediately fetch the real
        // subscription state from DB using the user ID we have right now —
        // before setUser()'s async state update propagates to refreshSubscriptionStatus().
        if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION') {
          refreshSubscriptionStatus(session.user.id);
        }
      }
      // If TOKEN_REFRESHED but session is somehow null, do NOT clear user.
      // This prevents a mid-flight token refresh from logging the user out visually.
    });

    return () => subscription.unsubscribe();
  }, []);

  // Accept an optional explicit userId so this can be called from onAuthStateChange
  // before the setUser() state update has propagated (React state is async).
  const refreshSubscriptionStatus = async (forUserId?: string) => {
    const uid = forUserId ?? user?.id;
    if (!uid) return;

    try {
      // Check for active OR trialing premium subscription
      const { data: subscriptions, error } = await supabase
        .from('subscriptions')
        .select('*')
        .eq('user_id', uid)
        .in('status', ['active', 'trialing'])
        .order('created_at', { ascending: false })
        .limit(1);

      const subscription = subscriptions?.[0];

      if (subscription) {
        const isTrialing = subscription.status === 'trialing';
        const isActive = subscription.status === 'active';
        setSubscriptionStatus({
          isPremium: isActive,  // Only true for paying subscribers, not trialing
          isTrialing,
          trialEndsAt: isTrialing && subscription.current_period_end
            ? new Date(subscription.current_period_end)
            : null,
          sessionsThisMonth: 0,
          canStartSession: true,
        });
        return;
      }

      // Check free trial usage: 1 completed session lifetime.
      // Only count completed sessions — an abandoned/in-progress session does not
      // consume the trial so users aren't permanently locked out by a refresh or crash.
      // Trial status comes exclusively from the subscriptions table (managed by Stripe webhooks).
      const { count } = await supabase
        .from('sessions')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', uid)
        .eq('status', 'completed');

      const sessionsTotal = count || 0;
      const TRIAL_SESSION_LIMIT = 1;

      setSubscriptionStatus({
        isPremium: false,
        isTrialing: false,
        trialEndsAt: null,
        sessionsThisMonth: sessionsTotal,
        canStartSession: sessionsTotal < TRIAL_SESSION_LIMIT,
      });
    } catch (error) {
      console.error('Error fetching subscription status:', error);
    }
  };

  // Update subscription status when user changes
  useEffect(() => {
    if (user) {
      refreshSubscriptionStatus();
    } else {
      setSubscriptionStatus({
        isPremium: false,
        isTrialing: false,
        trialEndsAt: null,
        sessionsThisMonth: 0,
        canStartSession: true,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const signInWithEmail = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) throw error;
    setUser(data.user);
  };

  const signInWithGoogle = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    if (error) throw error;
  };

  const signUp = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
    });

    if (error) throw error;

    // If there was an anonymous user, convert their data
    const anonymousUserId = localStorage.getItem('pitcht_anonymous_user_id');
    if (anonymousUserId && data.user) {
      try {
        await convertAnonymousToRealAccount(anonymousUserId, data.user.id);
        localStorage.removeItem('pitcht_anonymous_user_id');
      } catch (err) {
        console.error('Error converting anonymous account:', err);
        // Continue anyway - user is signed up
      }
    }

    setUser(data.user);
  };

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    setUser(null);
  };

  const sendPasswordReset = async (email: string) => {
    // Supabase will email the user a link of the form
    //   https://<supabase-project>.supabase.co/auth/v1/verify?token=...&type=recovery&redirect_to=<redirectTo>
    // which, after verification, lands the browser at `redirectTo` with a
    // recovery session. The /auth/reset-password page handles that session.
    const redirectTo =
      typeof window !== 'undefined'
        ? `${window.location.origin}/auth/reset-password`
        : undefined;
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo,
    });
    if (error) throw error;
  };

  const updatePassword = async (newPassword: string) => {
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) throw error;
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        subscriptionStatus,
        signInWithEmail,
        signInWithGoogle,
        signUp,
        signOut,
        sendPasswordReset,
        updatePassword,
        refreshSubscriptionStatus,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
