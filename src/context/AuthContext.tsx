'use client';

import React, { createContext, useContext, useState, useEffect, useRef, useCallback, ReactNode } from 'react';
import { supabase } from '@/services/supabase';
import { notifyNewSignup } from '@/services/signupNotification';
import { canUserStartSession } from '@/services/subscriptionManager';
import { identifyUser, resetUser, trackEvent, AnalyticsEvents } from '@/utils/analytics';
import { toast } from 'sonner';
import { clearOtherRecovery, ACCOUNT_CHANGE_EVENT, UNSAVED_ACCOUNT_MESSAGE } from '@/utils/accountRecovery';
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

  const ownerRef = useRef<string | null | undefined>(undefined);
  const identityEpoch = useRef(0);

  const applyUser = (next: User | null) => {
    const nextOwner = next?.id ?? null;
    if (ownerRef.current !== nextOwner) {
      ownerRef.current = nextOwner;
      identityEpoch.current++;
      try { clearOtherRecovery(localStorage, nextOwner); } catch { /* Storage may be disabled. */ }
      resetUser();
      if (next) identifyUser(next.id, { email: next.email });
      setSubscriptionStatus({ isPremium: false, isTrialing: false, trialEndsAt: null, sessionsThisMonth: 0, canStartSession: true });
    }
    setUser(next);
    setLoading(false);
  };

  // A spontaneous sign-out must clear private state immediately. Explicit account
  // changes first give unsaved capture owners a chance to save/download/discard.
  const ensureAccountChange = () => {
    if (!window.dispatchEvent(new Event(ACCOUNT_CHANGE_EVENT, { cancelable: true }))) {
      toast.error(UNSAVED_ACCOUNT_MESSAGE);
      throw new Error(UNSAVED_ACCOUNT_MESSAGE);
    }
  };

  useEffect(() => {
    let active = true;
    let observedEvent = false;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active) return;
      observedEvent = true;
      if (event === 'SIGNED_OUT' || (event === 'INITIAL_SESSION' && !session)) {
        if (event === 'SIGNED_OUT') trackEvent(AnalyticsEvents.LOGOUT);
        applyUser(null);
      } else if (session?.user) {
        applyUser(session.user);
        if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION') void notifyNewSignup(session);
        if (event === 'SIGNED_IN') trackEvent(AnalyticsEvents.LOGIN_COMPLETED, { method: 'email' });
      }
    });
    void supabase.auth.getSession().then(({ data: { session } }) => {
      if (active && !observedEvent) applyUser(session?.user ?? null);
    });
    return () => { active = false; subscription.unsubscribe(); };
  }, []);

  // Accept an optional explicit userId so this can be called from onAuthStateChange
  // before the setUser() state update has propagated (React state is async).
  const refreshSubscriptionStatus = useCallback(async (forUserId?: string) => {
    const uid = forUserId ?? ownerRef.current;
    if (!uid) return;
    const epoch = identityEpoch.current;

    try {
      const access = await canUserStartSession(uid);
      if (ownerRef.current !== uid || identityEpoch.current !== epoch) return;
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
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- network fetch commits only after await and identity check
    if (user) void refreshSubscriptionStatus();
  }, [user, refreshSubscriptionStatus]);

  const signInWithEmail = async (email: string, password: string) => {
    ensureAccountChange();
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) throw error;
  };

  const signInWithGoogle = async () => {
    ensureAccountChange();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    if (error) throw error;
  };

  const signUp = async (email: string, password: string) => {
    ensureAccountChange();
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
    });

    if (error) throw error;

    // Track the signup separately from best-effort welcome delivery.
    if (data.user?.id && data.user?.email) {
      trackEvent(AnalyticsEvents.SIGNUP_COMPLETED, { method: 'email' });
    }
  };

  const signOut = async () => {
    ensureAccountChange();
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    applyUser(null);
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
