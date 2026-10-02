'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { supabase } from '@/services/supabase';
import { convertAnonymousToRealAccount } from '@/services/auth';
import { notifyNewSignup } from '@/services/signupNotification';
import { canUserStartSession } from '@/services/subscriptionManager';
import { identifyUser, trackEvent, AnalyticsEvents } from '@/utils/analytics';
import type { User } from '@supabase/supabase-js';

interface SubscriptionStatus {
  isPremium: boolean;
  isTrialing: boolean;
  entitlementSource?: 'stripe' | 'internal_test' | 'free';
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
        trackEvent(AnalyticsEvents.LOGOUT);
      } else if (session?.user) {
        // SIGNED_IN, INITIAL_SESSION, TOKEN_REFRESHED, USER_UPDATED, PASSWORD_RECOVERY
        setUser(session.user);
        identifyUser(session.user.id, { email: session.user.email });
        // On explicit sign-in or initial session load, immediately fetch the real
        // subscription state from DB using the user ID we have right now —
        // before setUser()'s async state update propagates to refreshSubscriptionStatus().
        if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION') {
          refreshSubscriptionStatus(session.user.id);
          // Also covers email confirmation after signUp returned without a session.
          void notifyNewSignup(session);
        }
        if (event === 'SIGNED_IN') {
          trackEvent(AnalyticsEvents.LOGIN_COMPLETED, { method: 'email' });
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
      const access = await canUserStartSession(uid);
      setSubscriptionStatus({
        isPremium: access.isPremium,
        isTrialing: access.isTrialing,
        entitlementSource: access.entitlementSource,
        trialEndsAt: access.trialEndsAt,
        sessionsThisMonth: access.sessionsThisMonth,
        canStartSession: access.allowed,
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

    // Track the signup separately from best-effort welcome delivery.
    if (data.user?.id && data.user?.email) {
      identifyUser(data.user.id, { email: data.user.email, signup_method: 'email' });
      trackEvent(AnalyticsEvents.SIGNUP_COMPLETED, { method: 'email' });
    }
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
