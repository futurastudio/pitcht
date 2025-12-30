'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useInterview } from '@/context/InterviewContext';
import { useAuth } from '@/context/AuthContext';
import { canUserStartSession } from '@/services/subscriptionManager';
import PaywallModal from './PaywallModal';
import type { SessionType, Question } from '@/types/interview';

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
    const [sessionsUsed, setSessionsUsed] = useState(0);

    if (!isOpen) return null;

    const handleStart = async () => {
        setIsGenerating(true);
        setError(null);

        try {
            // Check session limits for non-premium, non-trial users
            if (user && !subscriptionStatus.isPremium && !subscriptionStatus.isTrialing) {
                const check = await canUserStartSession(user.id);

                if (!check.allowed) {
                    setShowPaywall(true);
                    setPaywallReason(check.reason || "You've reached your session limit.");
                    setSessionsUsed(check.sessionsThisMonth || 0);
                    setIsGenerating(false);
                    return;
                }
            }

            // Call the real API to generate questions
            const response = await fetch('/api/generate-questions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    sessionType: sessionType as SessionType,
                    context: context.trim(),
                    difficulty: 'intermediate', // Default difficulty
                }),
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Failed to generate questions');
            }

            // 1. Clear previous session
            clearSession();

            // 2. Set new session type
            setSessionType(sessionType);

            // 3. Set session context (job description / presentation topic)
            setSessionContext(context.trim());

            // 4. Set AI-generated questions
            setQuestions(data.questions);

            // 5. Navigate to interview
            router.push('/interview');

        } catch (err) {
            console.error('Error generating questions:', err);
            setError(err instanceof Error ? err.message : 'An unexpected error occurred');
            setIsGenerating(false);
        }
    };

    return (
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
                                <p className="text-white/70 text-sm">✓ Analyzing {sessionType === 'job-interview' ? 'role requirements' : sessionType === 'sales-pitch' ? 'target customer' : 'presentation audience'}</p>
                                <p className="text-white/70 text-sm">✓ Planning question flow (warmup → deep-dive)</p>
                                <p className="text-white/70 text-sm">✓ Creating {sessionType === 'job-interview' ? '5-7 behavioral + technical questions' : sessionType === 'sales-pitch' ? 'realistic sales scenarios' : 'presentation prompts + Q&A'}</p>
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
                                    {sessionType === 'job-interview' ? 'Job Description / Role' :
                                        sessionType === 'sales-pitch' ? 'Product / Service Details' :
                                            'Presentation Topic'}
                                </label>
                                <textarea
                                    value={context}
                                    onChange={(e) => setContext(e.target.value)}
                                    placeholder={
                                        sessionType === 'job-interview' ? "Paste the job description or role title here..." :
                                            sessionType === 'sales-pitch' ? "Describe what you are selling and who the customer is..." :
                                                "What is the topic of your presentation?"
                                    }
                                    className="w-full h-32 bg-black/20 border border-white/10 rounded-xl p-4 text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-white/20 resize-none"
                                />
                            </div>

                            <div className="flex justify-end space-x-3 pt-2">
                                <button
                                    onClick={onClose}
                                    className="px-4 py-2 rounded-full text-sm font-medium text-white/70 hover:bg-white/10 transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleStart}
                                    disabled={!context.trim()}
                                    className="px-6 py-2 rounded-full text-sm font-bold text-black bg-white hover:bg-white/90 transition-colors shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    Start Simulation
                                </button>
                            </div>
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
                sessionsUsed={sessionsUsed}
            />
        </div>
    );
}
