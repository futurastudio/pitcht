'use client';

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Lightbulb, Sparkles } from 'lucide-react';
import { useInterview } from '@/context/InterviewContext';
import { useAuth } from '@/context/AuthContext';
import { canUserStartSession } from '@/services/subscriptionManager';
import { apiFetch } from '@/utils/api';
import { trackEvent, AnalyticsEvents } from '@/utils/analytics';
import PaywallModal from './PaywallModal';
import SignupModal from './SignupModal';
import LoginModal from './LoginModal';
import type { SessionType } from '@/types/interview';

interface SessionSetupModalProps {
    isOpen: boolean;
    onClose: () => void;
    sessionType: string;
    sessionTitle: string;
}

export default function SessionSetupModal({ isOpen, onClose, sessionType, sessionTitle }: SessionSetupModalProps) {
    const router = useRouter();
    const { setSessionType, setSessionContext, setQuestions, clearSession } = useInterview();
    const { user, subscriptionStatus } = useAuth();
    const [context, setContext] = useState('');
    const [isGenerating, setIsGenerating] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [showPaywall, setShowPaywall] = useState(false);
    const [paywallReason, setPaywallReason] = useState('');

    // Auth gate: show signup/login when unauthenticated user tries to start
    const [showSignup, setShowSignup] = useState(false);
    const [showLogin, setShowLogin] = useState(false);

    // JD nudge: shown once when user tries to start with an empty textarea
    const [showNudge, setShowNudge] = useState(false);
    const hasShownNudge = useRef(false);

    // Textarea highlight animation: pulses briefly when the modal first opens
    const [textareaHighlight, setTextareaHighlight] = useState(false);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    /**
     * pendingResume: set to true when the user completes signup/login inside
     * this modal. A useEffect watches for the user to appear in AuthContext
     * and then triggers the full start flow — no arbitrary setTimeout needed.
     */
    const pendingResume = useRef(false);

    // When a pending resume is set AND the user lands in AuthContext,
    // run the full start flow (including paywall check).
    useEffect(() => {
        if (pendingResume.current && user) {
            pendingResume.current = false;
            runStart();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user]);

    // Brief ring highlight on the textarea when the modal first opens,
    // drawing the user's eye to the JD field.
    useEffect(() => {
        if (isOpen) {
            hasShownNudge.current = false;
            setShowNudge(false);
            const t = setTimeout(() => setTextareaHighlight(true), 120); // slight delay after zoom-in
            const t2 = setTimeout(() => setTextareaHighlight(false), 1900);
            return () => { clearTimeout(t); clearTimeout(t2); };
        }
    }, [isOpen]);

    /**
     * Core generate-and-navigate logic.
     * Only called once auth + paywall checks have passed.
     */
    const runGenerate = useCallback(async (contextValue: string) => {
        setIsGenerating(true);
        setError(null);

        try {
            const response = await apiFetch('/api/generate-questions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    sessionType: sessionType as SessionType,
                    context: contextValue.trim(),
                    difficulty: 'intermediate',
                }),
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Failed to generate questions');
            }

            clearSession();
            setSessionType(sessionType);
            setSessionContext(contextValue.trim());
            setQuestions(data.questions);
            trackEvent(AnalyticsEvents.SESSION_STARTED, { session_type: sessionType, has_context: !!contextValue.trim() });
            router.push('/interview');

        } catch (err) {
            console.error('Error generating questions:', err);
            setError(err instanceof Error ? err.message : 'An unexpected error occurred');
            setIsGenerating(false);
        }
    }, [sessionType, clearSession, setSessionType, setSessionContext, setQuestions, router]);

    /**
     * Full start flow with auth + paywall checks.
     * Reads from component state directly — always uses current values.
     */
    const runStart = useCallback(async () => {
        // Gate 1: Not authenticated — show signup modal, preserve context state
        if (!user) {
            setShowSignup(true);
            return;
        }

        setIsGenerating(true);
        setError(null);

        // Gate 2: Authenticated but on free tier — check session limit
        if (!subscriptionStatus.isPremium && !subscriptionStatus.isTrialing) {
            const check = await canUserStartSession(user.id);

            if (!check.allowed) {
                setShowPaywall(true);
                setPaywallReason(check.reason || "You've reached your session limit.");
                setIsGenerating(false);
                trackEvent(AnalyticsEvents.PAYWALL_SHOWN, { reason: check.reason || 'session_limit' });
                return;
            }
        }

        await runGenerate(context);
    }, [user, subscriptionStatus, context, runGenerate]);

    /**
     * Called by SignupModal after account creation succeeds.
     * Sets a pending flag — useEffect picks it up once AuthContext has the user.
     */
    const handleSignupComplete = useCallback(() => {
        setShowSignup(false);
        pendingResume.current = true;
        // Note: useEffect on [user] will fire the full runStart once user is set
    }, []);

    /**
     * Called by LoginModal after login succeeds.
     * Same pattern — wait for AuthContext to update, then resume.
     */
    const handleLoginComplete = useCallback(() => {
        setShowLogin(false);
        pendingResume.current = true;
    }, []);

    /**
     * Intercepts "Start Simulation" for job/internship interviews.
     * If the context is empty and we haven't nudged yet this session,
     * show the JD nudge once instead of proceeding immediately.
     */
    const handleStartClick = useCallback(async () => {
        const isInterviewType = sessionType === 'job-interview' || sessionType === 'internship-interview';
        if (!context.trim() && !hasShownNudge.current && isInterviewType) {
            hasShownNudge.current = true;
            setShowNudge(true);
            return;
        }
        setShowNudge(false);
        await runStart();
    }, [context, sessionType, runStart]);

    /** "Continue anyway" in the nudge — bypasses the JD nudge and starts. */
    const handleContinueAnyway = useCallback(async () => {
        setShowNudge(false);
        await runStart();
    }, [runStart]);

    // Early return AFTER all hooks — respects React rules of hooks
    if (!isOpen) return null;

    return (
        <>
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                {/* Backdrop */}
                <div
                    className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity"
                    onClick={isGenerating ? undefined : onClose}
                />

                {/* Modal Content */}
                <div className="relative w-full max-w-lg bg-white/10 backdrop-blur-xl border border-white/20 shadow-2xl rounded-3xl p-8 animate-in fade-in zoom-in duration-200">
                    {isGenerating ? (
                        <div className="flex flex-col items-center justify-center py-12 space-y-6">
                            <div className="relative w-16 h-16">
                                <div className="absolute inset-0 border-4 border-white/20 rounded-full"></div>
                                <div className="absolute inset-0 border-4 border-t-white rounded-full animate-spin"></div>
                            </div>
                            <div className="text-center space-y-3">
                                <h3 className="text-xl font-bold text-white">Generating Questions...</h3>
                                <div className="space-y-1.5 max-w-md mx-auto">
                                    <p className="text-white/70 text-sm">✓ Analyzing {sessionType === 'job-interview' ? 'role requirements' : sessionType === 'internship-interview' ? 'internship requirements' : 'presentation content'}</p>
                                    <p className="text-white/70 text-sm">✓ Planning question flow (warmup → deep-dive)</p>
                                    <p className="text-white/70 text-sm">✓ Creating {sessionType === 'job-interview' ? '5-7 behavioral + technical questions' : sessionType === 'internship-interview' ? '5-7 internship interview questions' : 'presentation prompts + Q&A'}</p>
                                </div>
                            </div>
                        </div>
                    ) : error ? (
                        <div className="flex flex-col items-center justify-center py-8 space-y-6">
                            <div className="w-16 h-16 rounded-full bg-red-500/20 flex items-center justify-center">
                                <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-red-400">
                                    <circle cx="12" cy="12" r="10"></circle>
                                    <line x1="12" y1="8" x2="12" y2="12"></line>
                                    <line x1="12" y1="16" x2="12.01" y2="16"></line>
                                </svg>
                            </div>
                            <div className="text-center space-y-2">
                                <h3 className="text-xl font-bold text-white">Generation Failed</h3>
                                <p className="text-white/60 text-sm max-w-sm">{error}</p>
                            </div>
                            <button
                                onClick={() => setError(null)}
                                className="px-6 py-2 rounded-full text-sm font-bold text-white bg-white/10 hover:bg-white/20 transition-colors"
                            >
                                Try Again
                            </button>
                        </div>
                    ) : (
                        <>
                            <div className="flex justify-between items-center mb-6">
                                <h2 className="text-2xl font-bold text-white">{sessionTitle} Setup</h2>
                                <button
                                    onClick={onClose}
                                    className="text-white/50 hover:text-white transition-colors"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <line x1="18" y1="6" x2="6" y2="18"></line>
                                        <line x1="6" y1="6" x2="18" y2="18"></line>
                                    </svg>
                                </button>
                            </div>

                            <div className="space-y-6">
                                <div>
                                    <label className="block text-sm font-medium text-white/70 mb-2">
                                        {sessionType === 'job-interview' ? 'Job Description' :
                                            sessionType === 'internship-interview' ? 'Internship Description' :
                                                'Presentation Topic'}
                                        <span className="ml-1.5 text-white/35 font-normal">(optional — for tailored questions)</span>
                                    </label>
                                    <textarea
                                        ref={textareaRef}
                                        value={context}
                                        onChange={(e) => { setContext(e.target.value); setShowNudge(false); }}
                                        placeholder={
                                            sessionType === 'job-interview' ? "e.g., 'Software Engineer at Google' or paste the full job posting — the more detail, the better your questions" :
                                                sessionType === 'internship-interview' ? "e.g., 'Marketing Intern at Spotify' or paste the full internship posting — the more detail, the better your questions" :
                                                    "Describe what you're presenting (e.g., marketing strategy, case study, thesis defense) — or leave blank to practice with general prompts."
                                        }
                                        className={`w-full h-32 bg-black/20 border rounded-xl p-4 text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-white/20 resize-none transition-all duration-700 ${
                                            textareaHighlight
                                                ? 'border-white/40 shadow-[0_0_0_3px_rgba(255,255,255,0.12)]'
                                                : 'border-white/10'
                                        }`}
                                    />

                                    {/* Without / With JD comparison — only for interview types */}
                                    {(sessionType === 'job-interview' || sessionType === 'internship-interview') && (
                                        <div className="flex gap-2 mt-2.5">
                                            <div className="flex-1 bg-white/5 rounded-xl p-3 border border-white/8">
                                                <div className="text-[10px] text-white/35 uppercase tracking-wider font-semibold mb-1">Without</div>
                                                <p className="text-[11px] text-white/50 leading-relaxed">General questions that apply to any role</p>
                                            </div>
                                            <div className="flex-1 bg-blue-500/10 rounded-xl p-3 border border-blue-400/20">
                                                <div className="text-[10px] text-blue-300/70 uppercase tracking-wider font-semibold mb-1 inline-flex items-center gap-1">
                                                    With job description
                                                    <Sparkles className="w-2.5 h-2.5" strokeWidth={2} />
                                                </div>
                                                <p className="text-[11px] text-white/70 leading-relaxed">Role-specific questions tailored to the exact skills and responsibilities in the posting</p>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* Unauthenticated nudge */}
                                {!user && (
                                    <p className="text-white/40 text-xs text-center -mt-2">
                                        You&apos;ll create a free account to start your session
                                    </p>
                                )}

                                {showNudge ? (
                                    /* JD nudge — shown once when Start is clicked with empty context */
                                    <div className="space-y-3 animate-in fade-in slide-in-from-bottom-2 duration-200">
                                        <div className="flex items-start gap-3 bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4">
                                            <Lightbulb className="w-4 h-4 mt-0.5 flex-shrink-0 text-amber-300" strokeWidth={1.75} />
                                            <div>
                                                <p className="text-amber-200 text-sm font-semibold mb-0.5">
                                                    Tip: paste a job description for much better questions
                                                </p>
                                                <p className="text-amber-200/65 text-xs leading-relaxed">
                                                    You&apos;ll get role-specific questions tailored to the exact skills and responsibilities in the posting — much better than generic practice.
                                                </p>
                                            </div>
                                        </div>
                                        <div className="flex justify-end items-center gap-3">
                                            <button
                                                onClick={handleContinueAnyway}
                                                className="text-sm text-white/45 hover:text-white/75 transition-colors"
                                            >
                                                Continue anyway
                                            </button>
                                            <button
                                                onClick={() => {
                                                    setShowNudge(false);
                                                    textareaRef.current?.focus();
                                                }}
                                                className="px-6 py-2 rounded-full text-sm font-bold text-black bg-white hover:bg-white/90 transition-colors shadow-lg"
                                            >
                                                Add Job Description
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="flex justify-end space-x-3 pt-2">
                                        <button
                                            onClick={onClose}
                                            className="px-4 py-2 rounded-full text-sm font-medium text-white/70 hover:bg-white/10 transition-colors"
                                        >
                                            Cancel
                                        </button>
                                        <button
                                            onClick={handleStartClick}
                                            className="px-6 py-2 rounded-full text-sm font-bold text-black bg-white hover:bg-white/90 transition-colors shadow-lg"
                                        >
                                            {user ? 'Start Simulation' : 'Continue →'}
                                        </button>
                                    </div>
                                )}
                            </div>
                        </>
                    )}
                </div>

                {/* Paywall Modal */}
                <PaywallModal
                    isOpen={showPaywall}
                    onClose={() => {
                        setShowPaywall(false);
                        onClose();
                    }}
                    reason={paywallReason}
                />
            </div>

            {/* Signup Modal — triggered when unauthenticated user hits Start */}
            <SignupModal
                isOpen={showSignup}
                onClose={() => setShowSignup(false)}
                onLogin={() => {
                    setShowSignup(false);
                    setShowLogin(true);
                }}
                onSignupComplete={handleSignupComplete}
            />

            {/* Login Modal — triggered from "Already have an account?" in SignupModal */}
            <LoginModal
                isOpen={showLogin}
                onClose={() => setShowLogin(false)}
                onSignup={() => {
                    setShowLogin(false);
                    setShowSignup(true);
                }}
                onLoginComplete={handleLoginComplete}
            />
        </>
    );
}
