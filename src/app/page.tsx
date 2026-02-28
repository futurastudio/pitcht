'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import SessionSetupModal from '@/components/SessionSetupModal';
import PaywallModal from '@/components/PaywallModal';
import Header from '@/components/Header';

const SESSION_TYPES = [
  {
    id: 'job-interview',
    title: 'Job Interview',
    description: 'Paste a job description. AI generates role-specific questions, analyzes your clarity, pacing, and eye contact — and gives you answer frameworks for every response.',
    icon: '💼',
    color: 'from-blue-500 to-cyan-400',
  },
  {
    id: 'internship-interview',
    title: 'Internship Interview',
    description: 'Behavioral and domain-tailored questions for your field. Instant feedback on your structure, delivery, and presence — with answer frameworks to improve each response.',
    icon: '🎯',
    color: 'from-orange-500 to-red-400',
  },
  {
    id: 'presentation',
    title: 'Presentation',
    description: 'Practice your pitch, case study, or presentation. AI measures your pace, confidence, and audience engagement.',
    icon: '🎤',
    color: 'from-purple-500 to-pink-400',
  },
];

export default function Dashboard() {
  const [selectedSession, setSelectedSession] = useState<{ id: string, title: string } | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [showPaywall, setShowPaywall] = useState(false);

  const { user, subscriptionStatus, refreshSubscriptionStatus } = useAuth();

  // Refresh subscription status on every mount of the home page so the
  // state is always accurate regardless of how the user arrived here:
  // - returning from Stripe after paying → should show Pro
  // - returning from Stripe after cancelling → should still show free tier
  // - completing their free session and navigating back → should show paywall
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (user) {
      refreshSubscriptionStatus();
    }
  }, []);

  const isExhaustedFreeUser = user && !subscriptionStatus.isPremium && !subscriptionStatus.isTrialing && !subscriptionStatus.canStartSession;

  const handleSelectSession = (session: typeof SESSION_TYPES[0]) => {
    // Gate: if free-tier user has used their session, show paywall immediately
    // (don't make them go through the full setup flow only to be blocked)
    if (isExhaustedFreeUser) {
      setShowPaywall(true);
      return;
    }
    setSelectedSession({ id: session.id, title: session.title });
    setIsModalOpen(true);
  };

  return (
    <main className="min-h-screen relative overflow-hidden flex flex-col items-center justify-center p-8">
      {/* Header with Sign In */}
      <Header />

      {/* Glass Overlay over Video Feed */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm -z-10" />

      {/* Grid Pattern Overlay */}
      <div className="absolute inset-0 bg-[url('/grid.svg')] opacity-10 -z-10" />

      <div className="max-w-5xl w-full space-y-12 z-10">
        <div className="text-center space-y-4">
          <h1 className="text-5xl md:text-7xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white via-white/90 to-white/60 tracking-tight drop-shadow-sm">
            Pitcht
          </h1>
          <p className="text-xl text-white/80 max-w-2xl mx-auto font-medium drop-shadow-md">
            {user && subscriptionStatus.isPremium
              ? 'You\'re on Pro. Ready to practice?'
              : user && subscriptionStatus.isTrialing
              ? 'Trial active — make your session count.'
              : 'Your 24/7 interview coach. Practice until you feel ready.'}
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {SESSION_TYPES.map((session) => (
            <button
              key={session.id}
              onClick={() => handleSelectSession(session)}
              className="group relative flex flex-col items-start p-8 rounded-3xl bg-white/10 hover:bg-white/20 border border-white/20 hover:border-white/40 backdrop-blur-xl transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl text-left overflow-hidden"
            >
              {/* Hover Gradient Glow */}
              <div className={`absolute inset-0 bg-gradient-to-br ${session.color} opacity-0 group-hover:opacity-10 transition-opacity duration-500`} />

              {/* Lock badge for exhausted free users */}
              {isExhaustedFreeUser && (
                <span className="absolute top-4 right-4 text-white/30 text-sm">🔒</span>
              )}

              <span className="text-4xl mb-6 block transform group-hover:scale-110 transition-transform duration-300 drop-shadow-md">
                {session.icon}
              </span>

              <h3 className="text-2xl font-semibold text-white mb-2 group-hover:text-white/90 drop-shadow-sm">
                {session.title}
              </h3>

              <p className="text-white/70 group-hover:text-white/90 leading-relaxed text-sm font-medium">
                {session.description}
              </p>

              <div className="mt-8 flex items-center text-sm font-bold text-white/60 group-hover:text-white transition-colors">
                {isExhaustedFreeUser ? 'Upgrade to unlock' : 'Start Session'} <span className="ml-2 group-hover:translate-x-1 transition-transform">→</span>
              </div>
            </button>
          ))}
        </div>
      </div>

      <SessionSetupModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        sessionType={selectedSession?.id || ''}
        sessionTitle={selectedSession?.title || ''}
      />

      <PaywallModal
        isOpen={showPaywall}
        onClose={() => setShowPaywall(false)}
      />

      {/* Footer with Privacy Policy link */}
      <footer className="absolute bottom-4 left-0 right-0 z-10">
        <div className="text-center">
          <a
            href="/privacy"
            className="text-sm text-white/60 hover:text-white/90 transition-colors"
          >
            Privacy Policy
          </a>
        </div>
      </footer>
    </main>
  );
}
