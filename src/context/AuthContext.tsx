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
    // Check active sessions
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

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
  }, [user]);

  const refreshSubscriptionStatus = async () => {
    if (!user) return;

    try {
      // Check for active OR trialing premium subscription
      const { data: subscriptions, error } = await supabase
        .from('subscriptions')
        .select('*')
        .eq('user_id', user.id)
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

      // Check free trial usage: 1 session lifetime total (not per-month).
      // Trial status comes exclusively from the subscriptions table (managed by Stripe webhooks).
      const { count } = await supabase
        .from('sessions')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id);

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
    // Calculate 5-day trial period
    const trialStart = new Date();
    const trialEnd = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000);

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          trial_start: trialStart.toISOString(),
          trial_end: trialEnd.toISOString(),
        },
      },
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
