'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { Sparkles, CreditCard, Lock } from 'lucide-react';

interface PaywallModalProps {
  isOpen: boolean;
  onClose: () => void;
  reason?: string;
  sessionsUsed?: number;
}

export default function PaywallModal({ isOpen, onClose, reason, sessionsUsed = 1 }: PaywallModalProps) {
  const router = useRouter();

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-lg bg-white/10 backdrop-blur-xl border border-white/20 shadow-2xl rounded-3xl p-8 animate-in fade-in zoom-in duration-200">
        <div className="text-center">
          {/* Icon */}
          <div className="w-16 h-16 bg-white/10 border border-white/20 rounded-full mx-auto mb-4 flex items-center justify-center">
            <Sparkles className="w-7 h-7 text-white" strokeWidth={1.75} />
          </div>

          {/* Heading */}
          <h2 className="text-2xl font-bold text-white mb-2">Upgrade to Pro</h2>
          <p className="text-white/70 mb-6">
            {reason || "You've used all your free sessions. Upgrade to Pro to keep practicing."}
          </p>

          {/* Pricing Card */}
          <div className="bg-black/20 rounded-2xl p-6 mb-6">
            <div className="flex items-baseline justify-center mb-1">
              <span className="text-4xl font-bold text-white">$14.99</span>
              <span className="text-lg text-white/60 ml-1">/month</span>
            </div>
            <div className="text-white/50 text-sm mb-4">or $12.42/month billed annually — 2 months free</div>

            {/* Features */}
            <ul className="text-left space-y-2.5 text-white/80">
              <li className="flex items-center gap-2">
                <span className="text-green-400">✓</span> <strong>Unlimited</strong> practice sessions
              </li>
              <li className="flex items-center gap-2">
                <span className="text-green-400">✓</span> Full session history with video playback
              </li>
              <li className="flex items-center gap-2">
                <span className="text-green-400">✓</span> Progress trends across all sessions
              </li>
              <li className="flex items-center gap-2">
                <span className="text-green-400">✓</span> Eye contact & speech metrics every session
              </li>
              <li className="flex items-center gap-2">
                <span className="text-green-400">✓</span> AI coaching tailored to your job description
              </li>
            </ul>
          </div>

          {/* CTA Buttons */}
          <button
            onClick={() => {
              router.push('/pricing');
            }}
            className="w-full px-6 py-3 bg-white hover:bg-white/90 text-black font-bold rounded-full transition-all duration-200 shadow-lg mb-3"
          >
            Upgrade to Pro
          </button>

          <button
            onClick={onClose}
            className="text-white/60 text-sm hover:text-white transition-colors"
          >
            Maybe later
          </button>

          {/* Money-back guarantee */}
          <div className="mt-6 flex flex-wrap items-center justify-center gap-x-3 gap-y-1.5 text-white/50 text-xs">
            <span className="inline-flex items-center gap-1.5">
              <CreditCard className="w-3.5 h-3.5" strokeWidth={1.75} />
              Secure payment
            </span>
            <span className="text-white/25">•</span>
            <span className="inline-flex items-center gap-1.5">
              <Lock className="w-3.5 h-3.5" strokeWidth={1.75} />
              Cancel anytime
            </span>
            <span className="text-white/25">•</span>
            <span>30-day money-back guarantee</span>
          </div>
        </div>
      </div>
    </div>
  );
}
