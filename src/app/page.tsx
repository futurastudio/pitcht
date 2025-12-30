'use client';

import React, { useState } from 'react';
import { useInterview } from '@/context/InterviewContext';
import SessionSetupModal from '@/components/SessionSetupModal';
import Header from '@/components/Header';

const SESSION_TYPES = [
  {
    id: 'job-interview',
    title: 'Job Interview',
    description: 'Practice common interview questions for your dream job.',
    icon: '💼',
    color: 'from-blue-500 to-cyan-400',
  },
  {
    id: 'sales-pitch',
    title: 'Sales Pitch',
    description: 'Refine your pitch and objection handling skills.',
    icon: '🚀',
    color: 'from-orange-500 to-red-400',
  },
  {
    id: 'presentation',
    title: 'Presentation',
    description: 'Prepare for a keynote or class presentation.',
    icon: '🎤',
    color: 'from-purple-500 to-pink-400',
  },
];

export default function Dashboard() {
  const [selectedSession, setSelectedSession] = useState<{ id: string, title: string } | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const handleSelectSession = (session: typeof SESSION_TYPES[0]) => {
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
            Master your communication skills with AI-powered video analysis.
            Choose a session type to begin.
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
                Start Session <span className="ml-2 group-hover:translate-x-1 transition-transform">→</span>
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
