'use client';

import React, { use, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Loader2, PartyPopper, TrendingUp, XCircle, Clock, ArrowRight } from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────────────────────

type Outcome = 'offer' | 'next_round' | 'rejected' | 'no_response';

type UIState =
  | { kind: 'loading' }
  | { kind: 'choose' }
  | { kind: 'success'; outcome: Outcome }
  | { kind: 'error_used' }
  | { kind: 'error_server' };

// ─── Outcome metadata ────────────────────────────────────────────────────────

const OUTCOME_OPTIONS: {
  value: Outcome;
  label: string;
  emoji: string;
  primary: boolean;
}[] = [
  { value: 'offer',      label: 'I got an offer',     emoji: '🎉', primary: true  },
  { value: 'next_round', label: 'Moved to next round', emoji: '➡️', primary: false },
  { value: 'rejected',   label: 'Got rejected',        emoji: '😔', primary: false },
  { value: 'no_response',label: 'Still waiting',       emoji: '⏳', primary: false },
];

const SUCCESS_COPY: Record<Outcome, { heading: string; sub: string }> = {
  offer:       { heading: 'Thanks. Got it.',  sub: 'Huge. Go celebrate.' },
  next_round:  { heading: 'Thanks. Got it.',  sub: 'Keep momentum. One more practice session?' },
  rejected:    { heading: 'Thanks. Got it.',  sub: 'Onto the next one. The data still helps you.' },
  no_response: { heading: 'Thanks. Got it.',  sub: "Got it. We'll keep your data ready for the next round." },
};

// ─── Submit helper ────────────────────────────────────────────────────────────

async function postOutcome(
  token: string,
  outcome: Outcome,
): Promise<{ ok: true } | { ok: false; status: number }> {
  try {
    const res = await fetch('/api/log-outcome', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, outcome }),
    });
    return res.ok ? { ok: true } : { ok: false, status: res.status };
  } catch {
    return { ok: false, status: 0 };
  }
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function OutcomePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = use(params);
  const searchParams = useSearchParams();
  const responseParam = searchParams.get('response') as Outcome | null;

  const [uiState, setUIState] = useState<UIState>({ kind: 'loading' });

  // On mount: if ?response= is a valid outcome, auto-submit immediately.
  // Otherwise, show the choice screen.
  useEffect(() => {
    const validOutcomes: Outcome[] = ['offer', 'next_round', 'rejected', 'no_response'];

    if (responseParam && validOutcomes.includes(responseParam)) {
      // Auto-submit — user already chose from the email link
      void (async () => {
        const result = await postOutcome(token, responseParam);
        if (result.ok) {
          setUIState({ kind: 'success', outcome: responseParam });
        } else if (result.status === 404) {
          setUIState({ kind: 'error_used' });
        } else {
          setUIState({ kind: 'error_server' });
        }
      })();
    } else {
      // No valid param — show the manual choice buttons
      setUIState({ kind: 'choose' });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Manual submit when user taps a button on the choose screen
  async function handleChoose(outcome: Outcome) {
    setUIState({ kind: 'loading' });
    const result = await postOutcome(token, outcome);
    if (result.ok) {
      setUIState({ kind: 'success', outcome });
    } else if (result.status === 404) {
      setUIState({ kind: 'error_used' });
    } else {
      setUIState({ kind: 'error_server' });
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <main className="min-h-screen text-white flex items-center justify-center px-4 py-16 relative">
      {/* Dark background — same overlay used across the app */}
      <div className="absolute inset-0 bg-black/80 backdrop-blur-md -z-10" />

      <div className="w-full max-w-[480px]">
        {uiState.kind === 'loading' && <LoadingState />}
        {uiState.kind === 'choose'  && <ChooseState onChoose={handleChoose} />}
        {uiState.kind === 'success' && <SuccessState outcome={uiState.outcome} />}
        {uiState.kind === 'error_used'   && <ErrorUsedState />}
        {uiState.kind === 'error_server' && <ErrorServerState />}
      </div>
    </main>
  );
}

// ─── Sub-states ───────────────────────────────────────────────────────────────

function LoadingState() {
  return (
    <div className="flex flex-col items-center gap-4 py-16">
      <Loader2 className="w-10 h-10 text-white/60 animate-spin" strokeWidth={1.5} />
      <p className="text-white/60 text-sm">Recording your outcome…</p>
    </div>
  );
}

function ChooseState({ onChoose }: { onChoose: (o: Outcome) => void }) {
  return (
    <div className="bg-white/10 backdrop-blur-xl border border-white/20 shadow-xl rounded-2xl p-8">
      {/* Header */}
      <div className="mb-8 text-center">
        <h1 className="text-2xl font-bold text-white">How did your interview go?</h1>
        <p className="text-white/50 text-sm mt-2">One tap. Helps us coach you better.</p>
      </div>

      {/* 2×2 grid on ≥640 px, stacked on mobile */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {OUTCOME_OPTIONS.map(({ value, label, emoji, primary }) =>
          primary ? (
            // "I got an offer" — white bg, black text (celebration CTA)
            <button
              key={value}
              onClick={() => onChoose(value)}
              className="flex items-center justify-center gap-2 w-full rounded-lg px-4 py-4 text-sm font-semibold bg-white text-black hover:bg-white/90 active:bg-white/80 transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
            >
              <span>{emoji}</span>
              <span>{label}</span>
            </button>
          ) : (
            // All other options — dark bg with border
            <button
              key={value}
              onClick={() => onChoose(value)}
              className="flex items-center justify-center gap-2 w-full rounded-lg px-4 py-4 text-sm font-semibold bg-white/5 border border-white/20 text-white hover:bg-white/10 hover:border-white/30 active:bg-white/15 transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
            >
              <span>{emoji}</span>
              <span>{label}</span>
            </button>
          ),
        )}
      </div>
    </div>
  );
}

function SuccessState({ outcome }: { outcome: Outcome }) {
  const { heading, sub } = SUCCESS_COPY[outcome];

  const Icon =
    outcome === 'offer'
      ? PartyPopper
      : outcome === 'next_round'
      ? TrendingUp
      : outcome === 'rejected'
      ? XCircle
      : Clock;

  return (
    <div className="bg-white/10 backdrop-blur-xl border border-white/20 shadow-xl rounded-2xl p-8 text-center">
      <div className="flex items-center justify-center mb-6">
        <div className="w-14 h-14 rounded-full bg-white/10 border border-white/20 flex items-center justify-center">
          <Icon className="w-6 h-6 text-white/80" strokeWidth={1.5} />
        </div>
      </div>

      <h1 className="text-2xl font-bold text-white mb-2">{heading}</h1>
      <p className="text-white/60 text-sm mb-8">{sub}</p>

      <a
        href="https://app.pitcht.us/interview"
        className="inline-flex items-center gap-2 w-full justify-center rounded-lg px-6 py-3 text-sm font-semibold bg-white text-black hover:bg-white/90 active:bg-white/80 transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
      >
        Practice another session
        <ArrowRight className="w-4 h-4" strokeWidth={2} />
      </a>
    </div>
  );
}

function ErrorUsedState() {
  return (
    <div className="bg-white/10 backdrop-blur-xl border border-white/20 shadow-xl rounded-2xl p-8 text-center">
      <h1 className="text-2xl font-bold text-white mb-3">
        This link has already been used or has expired.
      </h1>
      <p className="text-white/50 text-sm mb-8">
        No worries — your previous response is already recorded. Want to keep practicing?
      </p>

      <a
        href="https://app.pitcht.us/interview"
        className="inline-flex items-center gap-2 w-full justify-center rounded-lg px-6 py-3 text-sm font-semibold bg-white text-black hover:bg-white/90 active:bg-white/80 transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
      >
        Practice another session
        <ArrowRight className="w-4 h-4" strokeWidth={2} />
      </a>
    </div>
  );
}

function ErrorServerState() {
  return (
    <div className="bg-white/10 backdrop-blur-xl border border-white/20 shadow-xl rounded-2xl p-8 text-center">
      <h1 className="text-2xl font-bold text-white mb-3">Something went wrong.</h1>
      <p className="text-white/50 text-sm">
        Please try the link again or reply to the email and Jose will sort it out.
      </p>
    </div>
  );
}
