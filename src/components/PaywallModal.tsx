'use client';

import React from 'react';
import { useRouter } from 'next/navigation';

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
          <div className="w-16 h-16 bg-gradient-to-br from-purple-500 to-pink-500 rounded-full mx-auto mb-4 flex items-center justify-center">
            <span className="text-3xl">🚀</span>
          </div>

          {/* Heading */}
          <h2 className="text-2xl font-bold text-white mb-2">Upgrade to Premium</h2>
          <p className="text-white/70 mb-6">
            {reason || `You've used your ${sessionsUsed} free session this month. Upgrade to continue practicing.`}
          </p>

          {/* Pricing Card */}
          <div className="bg-black/20 rounded-2xl p-6 mb-6">
            <div className="flex items-baseline justify-center mb-1">
              <span className="text-4xl font-bold text-white">$27</span>
              <span className="text-lg text-white/60 ml-1">/month</span>
            </div>
            <div className="text-white/50 text-sm mb-4">or $21.60/month billed annually (save 20%)</div>

            {/* Features */}
            <ul className="text-left space-y-2.5 text-white/80">
              <li className="flex items-center gap-2">
                <span className="text-green-400">✓</span> <strong>Unlimited</strong> practice sessions
              </li>
              <li className="flex items-center gap-2">
                <span className="text-green-400">✓</span> Full session history
              </li>
              <li className="flex items-center gap-2">
                <span className="text-green-400">✓</span> Progress tracking & charts
              </li>
              <li className="flex items-center gap-2">
                <span className="text-green-400">✓</span> Eye contact & speech trends
              </li>
              <li className="flex items-center gap-2">
                <span className="text-green-400">✓</span> Export reports to PDF
              </li>
              <li className="flex items-center gap-2">
                <span className="text-green-400">✓</span> Priority AI processing
              </li>
            </ul>
          </div>

          {/* CTA Buttons */}
          <button
            onClick={() => {
              router.push('/pricing');
            }}
            className="w-full px-6 py-3 bg-gradient-to-r from-purple-500 to-blue-500 hover:from-purple-600 hover:to-blue-600 text-white font-bold rounded-full transition-all duration-200 shadow-lg mb-3"
          >
            Upgrade Now
          </button>

          <button
            onClick={onClose}
            className="text-white/60 text-sm hover:text-white transition-colors"
          >
            Maybe later
          </button>

          {/* Money-back guarantee */}
          <p className="mt-6 text-white/50 text-xs">
            💳 Secure payment • 🔒 Cancel anytime • 30-day money-back guarantee
          </p>
        </div>
      </div>
    </div>
  );
}
