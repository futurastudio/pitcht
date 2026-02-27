'use client';

import { apiFetch } from '@/utils/api';
import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useInterview, Recording } from '@/context/InterviewContext';
import { useAuth } from '@/context/AuthContext';
import AccountConversionModal from '@/components/AccountConversionModal';
import TranscriptViewer from '@/components/TranscriptViewer';
import { saveAnalysis } from '@/services/sessionManager';
import { analyzeSpeech } from '@/services/speechAnalyzer';
import type { GenerateFeedbackResponse } from '@/app/api/generate-feedback/route';

// Sprint 5A: Demo data removed - using real recordings from InterviewContext

export default function Analysis() {
    const { recordings, updateRecording, clearSession, repeatSession, sessionType, sessionContext, questions } = useInterview();
    const { user } = useAuth();
    const [selectedRecording, setSelectedRecording] = useState<Recording | null>(null);
    const [videoSrc, setVideoSrc] = useState<string | null>(null);
    const [feedback, setFeedback] = useState<GenerateFeedbackResponse | null>(null);
    const [isGeneratingFeedback, setIsGeneratingFeedback] = useState(false);
    const [feedbackError, setFeedbackError] = useState<string | null>(null);
    const [showSignupOverlay, setShowSignupOverlay] = useState(false);
    const [openExamples, setOpenExamples] = useState<Record<number, boolean>>({}); // NEW: Track which examples are open
    const [isRetryingTranscription, setIsRetryingTranscription] = useState(false);
    const [retryError, setRetryError] = useState<string | null>(null);
    const [isVideoExpanded, setIsVideoExpanded] = useState(false);

    // Sprint 5A: Use real recordings only
    const hasRecordings = recordings.length > 0;

    // Phase C: Show signup overlay for anonymous users
    useEffect(() => {
        if (!user && hasRecordings) {
            setShowSignupOverlay(true);
        }
    }, [user, hasRecordings]);

    useEffect(() => {
        if (recordings.length > 0 && !selectedRecording) {
            setSelectedRecording(recordings[0]);
        }
    }, [recordings, selectedRecording]);


    useEffect(() => {
        const loadVideo = async () => {
            if (!selectedRecording) {
                setVideoSrc('');
                return;
            }

            try {
                // Check if running in Electron mode
                // @ts-ignore
                const isElectron = typeof window !== 'undefined' && window.electron && window.electron.readVideo;

                if (isElectron) {
                    // Electron mode: Load video from local filesystem
                    // @ts-ignore
                    const result = await window.electron.readVideo(selectedRecording.videoPath);
                    if (result.success) {
                        setVideoSrc(result.data);
                    } else {
                        console.error('Failed to load video from Electron:', result.error);
                    }
                } else {
                    // Web mode: Load video from Supabase Storage using signed URL
                    if (selectedRecording.videoUrl) {
                        // Ownership check: storage path must start with the current user's ID
                        // Defense-in-depth — Supabase RLS also enforces this server-side
                        if (user && !selectedRecording.videoUrl.startsWith(`${user.id}/`)) {
                            console.error('Recording ownership check failed — refusing to generate signed URL');
                            return;
                        }

                        // Import supabase client
                        const { supabase } = await import('@/services/supabase');

                        // Extract the storage path from the video URL
                        // videoUrl format: "user-id/session-id/filename.webm"
                        const { data, error } = await supabase.storage
                            .from('recordings')
                            .createSignedUrl(selectedRecording.videoUrl, 3600); // 1 hour expiry

                        if (error) {
                            console.error('Failed to load video from Supabase:', error);
                        } else if (data) {
                            setVideoSrc(data.signedUrl);
                        }
                    }
                }
            } catch (error) {
                console.error('Error loading video:', error);
            }
        };

        loadVideo();
    }, [selectedRecording]);

    // Load existing feedback from database when recording is selected
    useEffect(() => {
        const loadOrGenerateFeedback = async () => {
            if (!selectedRecording) {
                setFeedback(null);
                setFeedbackError(null);
                return;
            }

            // Only proceed if we have a transcript
            if (!selectedRecording.transcript) {
                setFeedback(null);
                setFeedbackError(null);
                return;
            }

            // First, try to load existing feedback from database
            if (selectedRecording.recordingId) {
                try {
                    const { supabase } = await import('@/services/supabase');
                    const { data: analyses, error } = await supabase
                        .from('analyses')
                        .select('*')
                        .eq('recording_id', selectedRecording.recordingId)
                        .order('created_at', { ascending: false })
                        .limit(1);

                    if (!error && analyses && analyses.length > 0) {
                        // Feedback already exists! Use it instead of regenerating
                        const analysis = analyses[0];
                        setFeedback({
                            overallScore: analysis.overall_score,
                            contentScore: analysis.content_score,
                            communicationScore: analysis.communication_score,
                            deliveryScore: analysis.delivery_score,
                            summary: analysis.summary,
                            communicationPatterns: analysis.communication_patterns,
                            strengths: analysis.strengths,
                            improvements: analysis.improvements,
                            nextSteps: analysis.next_steps,
                            metrics: {
                                wordsPerMinute: selectedRecording.wordsPerMinute || 0,
                                fillerWordCount: selectedRecording.fillerWordCount || 0,
                                clarityScore: selectedRecording.clarityScore || 0,
                                pacingScore: selectedRecording.pacingScore || 0,
                                totalWords: 0,
                                eyeContactPercentage: selectedRecording.eyeContactPercentage,
                                dominantEmotion: selectedRecording.dominantEmotion,
                                presenceScore: selectedRecording.presenceScore,
                            },
                            generatedAt: analysis.created_at,
                        });
                        setFeedbackError(null);
                        return; // Don't generate new feedback
                    }
                } catch (error) {
                    console.warn('Could not load existing feedback:', error);
                    // Continue to generation if load fails
                }
            }

            // No existing feedback found - generate new feedback
            setIsGeneratingFeedback(true);
            setFeedbackError(null);

            try {
                // Get auth token for the API call
                const { supabase: supabaseClient } = await import('@/services/supabase');
                const { data: { session } } = await supabaseClient.auth.getSession();

                const response = await apiFetch('/api/generate-feedback', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        ...(session?.access_token ? { 'Authorization': `Bearer ${session.access_token}` } : {}),
                    },
                    body: JSON.stringify({
                        sessionType: sessionType || 'job-interview',
                        questionText: selectedRecording.questionText,
                        transcript: selectedRecording.transcript,
                        context: sessionContext || '', // ✅ FIXED: Pass job description for personalized examples
                        duration: selectedRecording.duration,
                        // Sprint 5A: Include video metrics
                        eyeContactPercentage: selectedRecording.eyeContactPercentage,
                        dominantEmotion: selectedRecording.dominantEmotion,
                        presenceScore: selectedRecording.presenceScore,
                    }),
                });

                if (response.ok) {
                    const data: GenerateFeedbackResponse = await response.json();
                    setFeedback(data);
                    setFeedbackError(null);

                    // Save analysis to database if we have a recording ID
                    if (selectedRecording.recordingId) {
                        try {
                            await saveAnalysis(selectedRecording.recordingId, {
                                overallScore: data.overallScore,
                                contentScore: data.contentScore,
                                communicationScore: data.communicationScore,
                                deliveryScore: data.deliveryScore,
                                summary: data.summary,
                                communicationPatterns: data.communicationPatterns,
                                strengths: data.strengths,
                                improvements: data.improvements,
                                nextSteps: data.nextSteps,
                            });
                        } catch (analysisError) {
                            console.error('Failed to save analysis to database:', analysisError);
                            // Don't fail the whole operation - user can still see the feedback
                        }
                    } else {
                        console.warn('No recording ID — analysis not saved to database');
                    }
                } else {
                    const errorData = await response.json().catch(() => ({}));
                    const errorMessage = errorData.error || 'Failed to generate feedback. Please try again.';
                    console.error('Failed to generate feedback:', errorMessage);
                    setFeedback(null);
                    setFeedbackError(errorMessage);
                }
            } catch (error) {
                console.error('Error generating feedback:', error);
                const errorMessage = error instanceof Error ? error.message : 'Network error. Please check your connection and try again.';
                setFeedback(null);
                setFeedbackError(errorMessage);
            } finally {
                setIsGeneratingFeedback(false);
            }
        };

        loadOrGenerateFeedback();
    }, [selectedRecording, sessionType, sessionContext]);

    // Retry function for failed feedback generation
    const retryFeedbackGeneration = () => {
        setFeedbackError(null);
        setIsGeneratingFeedback(true);

        // Trigger re-generation by updating a dependency
        // We'll use a timestamp to force the useEffect to run again
        const generateFeedbackForRecording = async () => {
            if (!selectedRecording?.transcript) return;

            setFeedbackError(null);
            setIsGeneratingFeedback(true);

            try {
                const response = await apiFetch('/api/generate-feedback', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        sessionType: sessionType || 'job-interview',
                        questionText: selectedRecording.questionText,
                        transcript: selectedRecording.transcript,
                        context: sessionContext || '',
                        duration: selectedRecording.duration,
                        eyeContactPercentage: selectedRecording.eyeContactPercentage,
                        dominantEmotion: selectedRecording.dominantEmotion,
                        presenceScore: selectedRecording.presenceScore,
                    }),
                });

                if (response.ok) {
                    const data: GenerateFeedbackResponse = await response.json();
                    setFeedback(data);
                    setFeedbackError(null);

                    if (selectedRecording.recordingId) {
                        try {
                            await saveAnalysis(selectedRecording.recordingId, {
                                overallScore: data.overallScore,
                                contentScore: data.contentScore,
                                communicationScore: data.communicationScore,
                                deliveryScore: data.deliveryScore,
                                summary: data.summary,
                                communicationPatterns: data.communicationPatterns,
                                strengths: data.strengths,
                                improvements: data.improvements,
                                nextSteps: data.nextSteps,
                            });
                        } catch (analysisError) {
                            console.error('Failed to save analysis to database:', analysisError);
                        }
                    }
                } else {
                    const errorData = await response.json().catch(() => ({}));
                    const errorMessage = errorData.error || 'Failed to generate feedback. Please try again.';
                    setFeedback(null);
                    setFeedbackError(errorMessage);
                }
            } catch (error) {
                console.error('Error generating feedback:', error);
                const errorMessage = error instanceof Error ? error.message : 'Network error. Please check your connection and try again.';
                setFeedback(null);
                setFeedbackError(errorMessage);
            } finally {
                setIsGeneratingFeedback(false);
            }
        };

        generateFeedbackForRecording();
    };

    // Retry transcription for a recording that failed to transcribe
    const retryTranscription = async (recording: Recording) => {
        if (!recording.recordingId || !recording.videoUrl) {
            setRetryError('Cannot retry — recording data is missing.');
            return;
        }

        setIsRetryingTranscription(true);
        setRetryError(null);

        try {
            // Get a fresh signed URL for the video
            const { supabase } = await import('@/services/supabase');
            const { data: signedData, error: signedError } = await supabase.storage
                .from('recordings')
                .createSignedUrl(recording.videoUrl, 300); // 5 min expiry for download

            if (signedError || !signedData?.signedUrl) {
                throw new Error('Could not access recording file');
            }

            // Download the video blob
            const videoResponse = await fetch(signedData.signedUrl);
            if (!videoResponse.ok) throw new Error('Failed to download recording');
            const videoBlob = await videoResponse.blob();

            // Extract audio (send the video blob — transcribe endpoint handles it)
            const formData = new FormData();
            formData.append('audio', videoBlob, 'recording.webm');
            if (recording.questionText) {
                formData.append('prompt', recording.questionText);
            }

            const { data: { session } } = await supabase.auth.getSession();
            const transcribeResponse = await apiFetch('/api/transcribe', {
                method: 'POST',
                headers: {
                    ...(session?.access_token ? { 'Authorization': `Bearer ${session.access_token}` } : {}),
                },
                body: formData,
            });

            if (!transcribeResponse.ok) {
                const err = await transcribeResponse.json().catch(() => ({}));
                throw new Error(err.error || 'Transcription failed');
            }

            const result = await transcribeResponse.json();
            const { transcript, duration } = result;

            if (!transcript) throw new Error('No transcript returned');

            // Calculate speech metrics
            const speechMetrics = analyzeSpeech(transcript, duration);

            // Update database
            const updateData = {
                transcript,
                duration: duration ? Math.round(duration) : undefined,
                words_per_minute: speechMetrics.wordsPerMinute !== undefined ? Math.max(0, Math.min(400, Math.round(speechMetrics.wordsPerMinute))) : undefined,
                filler_word_count: speechMetrics.fillerWordCount !== undefined ? Math.max(0, Math.round(speechMetrics.fillerWordCount)) : undefined,
                clarity_score: speechMetrics.clarityScore !== undefined ? Math.max(0, Math.min(100, Math.round(speechMetrics.clarityScore))) : undefined,
                pacing_score: speechMetrics.pacingScore !== undefined ? Math.max(0, Math.min(100, Math.round(speechMetrics.pacingScore))) : undefined,
            };

            const { error: dbError } = await supabase
                .from('recordings')
                .update(updateData)
                .eq('id', recording.recordingId);

            if (dbError) throw new Error('Failed to save transcript to database');

            // Update context state
            updateRecording(recording.recordingId, {
                transcript,
                duration,
                ...speechMetrics,
            });

            // Update selected recording so the UI refreshes
            setSelectedRecording(prev => prev ? { ...prev, transcript, duration, ...speechMetrics } : prev);

        } catch (error) {
            console.error('Transcription retry failed:', error);
            setRetryError(error instanceof Error ? error.message : 'Retry failed. Please try again.');
        } finally {
            setIsRetryingTranscription(false);
        }
    };

    return (
        <main className="min-h-screen text-white p-8 pb-24 relative">
            {/* Background Gradient Overlay */}
            <div className="absolute inset-0 bg-black/80 backdrop-blur-md -z-10" />

            {/* Analysis Content - Blurred for anonymous users */}
            <div className={`max-w-7xl mx-auto relative z-10 ${showSignupOverlay ? 'filter blur-md pointer-events-none select-none' : ''}`}>
                <header className="flex justify-between items-center mb-8">
                    <h1 className="text-4xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-white/60">
                        Session Review
                    </h1>
                    <div className="flex gap-4">
                        <Link
                            href="/"
                            onClick={() => { clearSession(); }}
                            className="bg-white/20 hover:bg-white/30 active:bg-white/40 backdrop-blur-lg border border-white/30 transition-all duration-200 px-6 py-2 rounded-full text-sm font-medium text-white"
                        >
                            Start New Session
                        </Link>
                    </div>
                </header>

                <div className="flex gap-6">
                    {/* Left Sidebar: Video List (30%) */}
                    <div className="w-[30%] flex-shrink-0">
                        <div className="bg-white/8 backdrop-blur-2xl border border-white/15 shadow-2xl rounded-2xl p-5 sticky top-6">
                            <h2 className="text-lg font-semibold text-white/90 mb-4 flex items-center gap-2">
                                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="23 7 16 12 23 17 23 7"></polygon><rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect></svg>
                                Recordings
                            </h2>

                            <div className="space-y-2 max-h-[calc(100vh-200px)] overflow-y-auto pr-2 custom-scrollbar">
                                {recordings.map((rec, idx) => (
                                    <button
                                        key={idx}
                                        onClick={() => setSelectedRecording(rec)}
                                        className={`w-full text-left p-3.5 rounded-xl border transition-all duration-200 group ${
                                            selectedRecording === rec
                                                ? 'bg-white/15 border-white/30 shadow-lg ring-1 ring-white/20'
                                                : 'bg-white/5 border-white/10 hover:bg-white/10 hover:border-white/20'
                                        }`}
                                    >
                                        <div className="flex items-start justify-between gap-2 mb-2">
                                            <span className="text-[10px] text-white/50 font-semibold tracking-wider uppercase">Q{idx + 1}</span>
                                            {rec.duration ? (
                                                <span className="text-[10px] text-white/60 font-mono bg-white/10 px-1.5 py-0.5 rounded">
                                                    {Math.floor(rec.duration / 60)}:{Math.floor(rec.duration % 60).toString().padStart(2, '0')}
                                                </span>
                                            ) : (
                                                <span className="text-[10px] text-white/40 italic">Skipped</span>
                                            )}
                                        </div>
                                        <p className="text-xs font-medium text-white/80 line-clamp-3 leading-relaxed">
                                            {rec.questionText}
                                        </p>
                                        {selectedRecording === rec && (
                                            <div className="mt-2 pt-2 border-t border-white/10">
                                                <div className="flex items-center gap-1.5 text-[10px] text-white/70">
                                                    <div className="w-1 h-1 bg-green-400 rounded-full animate-pulse"></div>
                                                    <span>Selected</span>
                                                </div>
                                            </div>
                                        )}
                                    </button>
                                ))}
                                {!hasRecordings && (
                                    <div className="p-8 text-center text-white/30 bg-white/5 rounded-xl border border-white/5">
                                        <p className="text-sm">No recordings found.</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Right Area: Analysis View (70%) */}
                    <div className="flex-1 space-y-6">

                        {/* Question Being Reviewed */}
                        {selectedRecording && (
                            <div className="bg-white/5 border border-white/10 rounded-2xl px-5 py-3">
                                <div className="text-[10px] text-white/40 uppercase tracking-wider mb-1.5">Question</div>
                                <p className="text-white/90 font-medium text-sm leading-relaxed">{selectedRecording.questionText}</p>
                            </div>
                        )}

                        {/* Analysis Metrics */}
                        {selectedRecording && (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                                {/* AI Feedback Card */}
                                <div className="bg-white/10 backdrop-blur-xl border border-white/20 shadow-xl rounded-3xl p-6">
                                    <h3 className="text-lg font-semibold mb-4 text-white/90 flex items-center gap-2">
                                        <span>🤖</span> AI Coach Feedback
                                    </h3>

                                    {isGeneratingFeedback ? (
                                        <div className="flex items-center gap-3 text-white/60">
                                            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                                            <span className="text-sm">Generating personalized feedback...</span>
                                        </div>
                                    ) : feedback ? (
                                        <div className="space-y-4">
                                            {/* #31 Biggest Improvement Callout */}
                                            {feedback.contentScore !== undefined &&
                                             feedback.communicationScore !== undefined &&
                                             feedback.deliveryScore !== undefined && (() => {
                                                const scores = [
                                                    { label: 'Content', score: feedback.contentScore! },
                                                    { label: 'Comms', score: feedback.communicationScore! },
                                                    { label: 'Delivery', score: feedback.deliveryScore! },
                                                ];
                                                const lowest = scores.reduce((a, b) => a.score <= b.score ? a : b);
                                                const allGood = scores.every(s => s.score >= 70);
                                                const borderColor = allGood ? 'border-green-400/50' : lowest.score < 50 ? 'border-red-400/60' : 'border-yellow-400/60';
                                                const textColor = allGood ? 'text-green-300' : lowest.score < 50 ? 'text-red-300' : 'text-yellow-300';
                                                const message = allGood
                                                    ? `Strong session — your lowest was ${lowest.label} (${lowest.score}). Keep going.`
                                                    : lowest.score < 50
                                                        ? (lowest.label === 'Content' ? 'Add a concrete example to anchor your answer.'
                                                            : lowest.label === 'Comms' ? 'Structure before you speak — try the STAR method.'
                                                            : 'Keep practicing — confidence builds with repetition.')
                                                        : (lowest.label === 'Content' ? 'Sharpen with a specific metric or outcome.'
                                                            : lowest.label === 'Comms' ? 'Tighten transitions between your ideas.'
                                                            : 'Reduce filler words and your presence will jump.');
                                                return (
                                                    <div className={`border-l-2 ${borderColor} pl-3 py-0.5`}>
                                                        <p className={`text-xs font-medium ${textColor} leading-relaxed`}>
                                                            {!allGood && <span className="text-white/50 mr-1">Focus on {lowest.label}:</span>}
                                                            {message}
                                                        </p>
                                                    </div>
                                                );
                                            })()}

                                            {/* Score Breakdown */}
                                            {(feedback.contentScore !== undefined || feedback.communicationScore !== undefined || feedback.deliveryScore !== undefined) && (
                                                <div className="grid grid-cols-3 gap-2 mb-4">
                                                    {[
                                                        { label: 'Content', score: feedback.contentScore },
                                                        { label: 'Comms', score: feedback.communicationScore },
                                                        { label: 'Delivery', score: feedback.deliveryScore },
                                                    ].map(({ label, score }) => score !== undefined ? (
                                                        <div key={label} className="bg-white/5 rounded-xl p-3 text-center">
                                                            <div className="text-[10px] text-white/40 uppercase tracking-wide mb-1">{label}</div>
                                                            <div className={`text-xl font-bold ${
                                                                score >= 70 ? 'text-green-400' :
                                                                score >= 50 ? 'text-yellow-400' :
                                                                'text-red-400'
                                                            }`}>{score}</div>
                                                            <div className="text-[10px] text-white/30">/100</div>
                                                            <div className="text-[10px] text-white/40 mt-0.5 leading-tight">
                                                                {label === 'Content' && (score >= 70 ? 'Strong' : score >= 50 ? 'Add examples' : 'Needs depth')}
                                                                {label === 'Comms' && (score >= 70 ? 'Articulate' : score >= 50 ? 'Clarify ideas' : 'Unclear')}
                                                                {label === 'Delivery' && (score >= 70 ? 'Confident' : score >= 50 ? 'Watch pacing' : 'Keep practicing')}
                                                            </div>
                                                        </div>
                                                    ) : null)}
                                                </div>
                                            )}

                                            <p className="text-white/80 text-sm leading-relaxed">{feedback.summary}</p>

                                            {feedback.strengths.length > 0 && (
                                                <div>
                                                    <h4 className="text-green-300 text-xs font-semibold mb-2">✓ Strengths</h4>
                                                    <ul className="space-y-1">
                                                        {feedback.strengths.slice(0, 2).map((strength, idx) => (
                                                            <li key={idx} className="text-white/70 text-xs">• {strength.detail}</li>
                                                        ))}
                                                    </ul>
                                                </div>
                                            )}

                                            {feedback.improvements.length > 0 && (
                                                <div>
                                                    <h4 className="text-yellow-300 text-xs font-semibold mb-2">→ Areas to Improve</h4>
                                                    <ul className="space-y-1">
                                                        {feedback.improvements.slice(0, 2).map((improvement, idx) => (
                                                            <li key={idx} className="text-white/70 text-xs">• {improvement.suggestion}</li>
                                                        ))}
                                                    </ul>
                                                </div>
                                            )}

                                            {/* Show More Details Link */}
                                            {feedback.improvements.length > 0 && (
                                                <button
                                                    onClick={() => {
                                                        const detailsSection = document.getElementById('detailed-feedback');
                                                        detailsSection?.scrollIntoView({ behavior: 'smooth' });
                                                    }}
                                                    className="text-xs text-blue-400 hover:text-blue-300 transition-colors flex items-center gap-1 mt-2"
                                                >
                                                    View Detailed Feedback with Examples
                                                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                                    </svg>
                                                </button>
                                            )}
                                        </div>
                                    ) : feedbackError ? (
                                        <div className="space-y-3">
                                            <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4">
                                                <div className="flex items-start gap-2 mb-2">
                                                    <svg className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                                    </svg>
                                                    <div className="flex-1">
                                                        <p className="text-red-300 text-sm font-medium mb-1">Failed to generate feedback</p>
                                                        <p className="text-red-200/70 text-xs">{feedbackError}</p>
                                                    </div>
                                                </div>
                                                <button
                                                    onClick={retryFeedbackGeneration}
                                                    className="mt-2 w-full bg-red-500/20 hover:bg-red-500/30 text-red-200 text-sm py-2 px-4 rounded-lg transition-colors flex items-center justify-center gap-2"
                                                >
                                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                                    </svg>
                                                    Retry
                                                </button>
                                            </div>
                                        </div>
                                    ) : selectedRecording.transcript ? (
                                        <p className="text-white/50 text-sm">Waiting for feedback generation...</p>
                                    ) : (
                                        <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-4">
                                            <div className="flex items-start gap-2">
                                                <svg className="w-5 h-5 text-yellow-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                                </svg>
                                                <div>
                                                    <p className="text-yellow-300 text-sm font-medium">Transcript unavailable</p>
                                                    <p className="text-yellow-200/70 text-xs mt-1">The recording transcript is still being processed or was not captured. AI feedback requires a transcript.</p>
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* Performance Metrics Card */}
                                <div className="bg-white/10 backdrop-blur-xl border border-white/20 shadow-xl rounded-3xl p-6 space-y-5">
                                    <h3 className="text-lg font-semibold mb-2 text-white/90 flex items-center gap-2">
                                        <span>📊</span> Performance Metrics
                                    </h3>

                                    {(() => {
                                        // Read metrics from database (already calculated during transcription)
                                        const clarityScore = selectedRecording.clarityScore || 0;
                                        const pacingScore = selectedRecording.pacingScore || 0;
                                        const wpm = selectedRecording.wordsPerMinute || 0;
                                        const fillerCount = selectedRecording.fillerWordCount || 0;

                                        // Sprint 5A: Video metrics
                                        const eyeContact = selectedRecording.eyeContactPercentage || 0;
                                        const gazeStability = selectedRecording.gazeStability || 0;
                                        const presenceScore = selectedRecording.presenceScore || 0;
                                        const dominantEmotion = selectedRecording.dominantEmotion || null;
                                        const emotionConfidence = selectedRecording.emotionConfidence || 0;

                                        const hasVideoMetrics = eyeContact > 0 || gazeStability > 0 || presenceScore > 0 || dominantEmotion;

                                        return (
                                            <>
                                                {/* Speech Metrics Section */}
                                                <div className="space-y-4">
                                                    <div className="flex items-center gap-2 mb-1">
                                                        <div className="w-1 h-1 rounded-full bg-blue-400"></div>
                                                        <span className="text-[10px] text-white/40 uppercase tracking-wider font-semibold">Speech Analysis</span>
                                                    </div>

                                                    {/* Clarity Score */}
                                                    <div>
                                                        <div className="flex justify-between text-xs mb-1 text-white/60">
                                                            <span>Clarity</span>
                                                            <span>{clarityScore}%</span>
                                                        </div>
                                                        <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                                                            <div
                                                                className="h-full bg-gradient-to-r from-green-400 to-emerald-300 transition-all duration-1000"
                                                                style={{ width: `${clarityScore}%` }}
                                                            />
                                                        </div>
                                                    </div>

                                                    {/* Pacing Score */}
                                                    <div>
                                                        <div className="flex justify-between text-xs mb-1 text-white/60">
                                                            <span>Pacing</span>
                                                            <span>{pacingScore}%</span>
                                                        </div>
                                                        <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                                                            <div
                                                                className="h-full bg-gradient-to-r from-blue-400 to-cyan-300 transition-all duration-1000"
                                                                style={{ width: `${pacingScore}%` }}
                                                            />
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* Video Metrics Section */}
                                                <div className="space-y-4 pt-4 border-t border-white/10">
                                                    <div className="flex items-center gap-2 mb-1">
                                                        <div className="w-1 h-1 rounded-full bg-purple-400"></div>
                                                        <span className="text-[10px] text-white/40 uppercase tracking-wider font-semibold">Video Analysis</span>
                                                    </div>

                                                    {hasVideoMetrics ? (
                                                        <>
                                                            {/* Eye Contact Score — always shown when video metrics exist, even at 0% */}
                                                            <div>
                                                                <div className="flex justify-between text-xs mb-1 text-white/60">
                                                                    <span>Eye Contact</span>
                                                                    <span>{eyeContact}%</span>
                                                                </div>
                                                                <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                                                                    <div
                                                                        className="h-full bg-gradient-to-r from-purple-400 to-violet-300 transition-all duration-1000"
                                                                        style={{ width: `${eyeContact}%` }}
                                                                    />
                                                                </div>
                                                            </div>

                                                            {/* Gaze Stability — always shown when video metrics exist, even at 0% */}
                                                            <div>
                                                                <div className="flex justify-between text-xs mb-1 text-white/60">
                                                                    <span>Gaze Stability</span>
                                                                    <span>{gazeStability}%</span>
                                                                </div>
                                                                <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                                                                    <div
                                                                        className="h-full bg-gradient-to-r from-pink-400 to-rose-300 transition-all duration-1000"
                                                                        style={{ width: `${gazeStability}%` }}
                                                                    />
                                                                </div>
                                                            </div>

                                                            {/* Presence Score — always shown when video metrics exist, even at 0% */}
                                                            <div>
                                                                <div className="flex justify-between text-xs mb-1 text-white/60">
                                                                    <span>Overall Presence</span>
                                                                    <span>{presenceScore}%</span>
                                                                </div>
                                                                <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                                                                    <div
                                                                        className="h-full bg-gradient-to-r from-orange-400 to-red-400 transition-all duration-1000"
                                                                        style={{ width: `${presenceScore}%` }}
                                                                    />
                                                                </div>
                                                            </div>
                                                        </>
                                                    ) : (
                                                        <div className="bg-white/5 rounded-xl p-3 text-center">
                                                            <p className="text-white/40 text-xs">
                                                                Video metrics not available
                                                            </p>
                                                            <p className="text-white/30 text-[10px] mt-1">
                                                                Camera tracking was not active during this recording
                                                            </p>
                                                        </div>
                                                    )}
                                                </div>

                                                {/* Stats Row */}
                                                <div className="grid grid-cols-2 gap-4 pt-2">
                                                    <div className="bg-white/5 rounded-xl p-3">
                                                        <div className="text-[10px] text-white/50 uppercase tracking-wider mb-1">Words/Min</div>
                                                        <div className={`text-2xl font-bold ${wpm >= 120 && wpm <= 150 ? 'text-green-400' : wpm >= 100 && wpm <= 170 ? 'text-yellow-400' : wpm > 0 ? 'text-red-400' : 'text-white'}`}>{wpm}</div>
                                                        <div className="text-[10px] text-white/30 mt-0.5">ideal: 120–150</div>
                                                    </div>
                                                    <div className="bg-white/5 rounded-xl p-3">
                                                        <div className="text-[10px] text-white/50 uppercase tracking-wider mb-1">Filler Words</div>
                                                        <div className="text-2xl font-bold text-yellow-300">{fillerCount}</div>
                                                        {selectedRecording.duration && selectedRecording.duration > 0 ? (
                                                            <div className="text-[10px] text-white/30 mt-0.5">
                                                                {(fillerCount / selectedRecording.duration * 60).toFixed(1)}/min
                                                            </div>
                                                        ) : null}
                                                    </div>
                                                </div>

                                                {/* Expression coaching */}
                                                {dominantEmotion && (
                                                    <div className="pt-2 border-t border-white/10">
                                                        <div className="text-[10px] text-white/40 uppercase tracking-wider mb-2 flex items-center gap-2">
                                                            <div className="w-1 h-1 rounded-full bg-indigo-400"></div>
                                                            <span className="font-semibold">Expression</span>
                                                        </div>
                                                        <div className="flex flex-col gap-1.5">
                                                            <div className="bg-white/5 border border-white/10 self-start px-3 py-1 rounded-full">
                                                                <span className="text-xs font-medium text-white/80 capitalize">{dominantEmotion}</span>
                                                            </div>
                                                            <p className="text-[11px] text-white/50 leading-relaxed">
                                                                {dominantEmotion === 'confident' && 'Good — you projected authority. Keep it up.'}
                                                                {dominantEmotion === 'happy' && 'Great presence — your enthusiasm comes through.'}
                                                                {dominantEmotion === 'neutral' && 'Try adding vocal energy and micro-smiles on key points.'}
                                                                {dominantEmotion === 'nervous' && 'Take a slow breath before answering to settle nerves.'}
                                                                {dominantEmotion === 'tense' && 'Relax your jaw and pause briefly before responding.'}
                                                            </p>
                                                        </div>
                                                    </div>
                                                )}
                                            </>
                                        );
                                    })()}
                                </div>
                            </div>
                        )}

                        {/* Detailed Feedback Section with Framework Examples */}
                        {feedback && feedback.improvements.length > 0 && (
                            <div id="detailed-feedback" className="space-y-6 mt-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                                {/* Communication Patterns Card */}
                                {feedback.communicationPatterns && (
                                    <div className="bg-white/10 backdrop-blur-xl border border-white/20 shadow-xl rounded-3xl p-6">
                                        <h3 className="text-lg font-semibold mb-4 text-white/90 flex items-center gap-2">
                                            <span>🎯</span> Communication Analysis
                                        </h3>
                                        <div className="grid grid-cols-2 gap-4">
                                            {feedback.communicationPatterns.usedStructure && (
                                                <div className="bg-white/5 rounded-xl p-3">
                                                    <div className="text-xs text-white/50 uppercase mb-1">Structure</div>
                                                    <div className="text-sm text-white capitalize">{feedback.communicationPatterns.usedStructure}</div>
                                                </div>
                                            )}
                                            {feedback.communicationPatterns.clarityLevel && (
                                                <div className="bg-white/5 rounded-xl p-3">
                                                    <div className="text-xs text-white/50 uppercase mb-1">Clarity</div>
                                                    <div className="text-sm text-white capitalize">{feedback.communicationPatterns.clarityLevel}</div>
                                                </div>
                                            )}
                                            {feedback.communicationPatterns.concisenessLevel && (
                                                <div className="bg-white/5 rounded-xl p-3">
                                                    <div className="text-xs text-white/50 uppercase mb-1">Conciseness</div>
                                                    <div className="text-sm text-white capitalize">{feedback.communicationPatterns.concisenessLevel}</div>
                                                </div>
                                            )}
                                            {feedback.communicationPatterns.exampleQuality && (
                                                <div className="bg-white/5 rounded-xl p-3">
                                                    <div className="text-xs text-white/50 uppercase mb-1">Examples</div>
                                                    <div className="text-sm text-white capitalize">{feedback.communicationPatterns.exampleQuality}</div>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}

                                {/* Detailed Improvements with Framework Examples */}
                                <div className="bg-white/10 backdrop-blur-xl border border-white/20 shadow-xl rounded-3xl p-6">
                                    <h3 className="text-lg font-semibold mb-4 text-white/90 flex items-center gap-2">
                                        <span>📚</span> Coaching Framework Examples
                                    </h3>
                                    <div className="space-y-4">
                                        {feedback.improvements.map((improvement, idx) => (
                                                <div key={idx} className={`border-l-4 ${
                                                    improvement.priority === 'high' ? 'border-red-400/50' :
                                                    improvement.priority === 'medium' ? 'border-yellow-400/50' :
                                                    'border-blue-400/50'
                                                } bg-white/5 p-4 rounded-lg`}>
                                                    {/* Priority Badge */}
                                                    <span className={`text-xs px-2 py-1 rounded-full ${
                                                        improvement.priority === 'high' ? 'bg-red-500/20 text-red-300' :
                                                        improvement.priority === 'medium' ? 'bg-yellow-500/20 text-yellow-300' :
                                                        'bg-blue-500/20 text-blue-300'
                                                    }`}>
                                                        {improvement.priority.toUpperCase()}
                                                    </span>

                                                    {/* Area & Detail */}
                                                    <h4 className="text-white font-semibold mt-3 capitalize">{improvement.area}</h4>
                                                    <p className="text-white/70 text-sm mt-1">{improvement.detail}</p>

                                                    {/* Suggestion */}
                                                    <div className="mt-3 bg-white/5 p-3 rounded-lg border border-white/10">
                                                        <p className="text-white/80 text-sm">💡 {improvement.suggestion}</p>
                                                    </div>

                                                    {/* Framework Example (Collapsible) */}
                                                    {improvement.example && (
                                                        <div className="mt-3">
                                                            <button
                                                                onClick={() => setOpenExamples(prev => ({ ...prev, [idx]: !prev[idx] }))}
                                                                className="flex items-center gap-2 text-sm text-blue-400 hover:text-blue-300 transition-colors"
                                                            >
                                                                {openExamples[idx] ? (
                                                                    <>
                                                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                                                        </svg>
                                                                        Hide Framework Example
                                                                    </>
                                                                ) : (
                                                                    <>
                                                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                                                        </svg>
                                                                        Show Framework Example
                                                                    </>
                                                                )}
                                                            </button>

                                                            {openExamples[idx] && (
                                                                <div className="mt-3 bg-blue-500/10 border border-blue-500/30 p-4 rounded-lg animate-in fade-in slide-in-from-top-2 duration-200">
                                                                    <div className="flex items-start gap-2 mb-2">
                                                                        <span className="text-xs text-blue-400/70 uppercase font-semibold">Framework Template:</span>
                                                                        <span className="text-xs text-blue-300/50">(Adapt with your details)</span>
                                                                    </div>
                                                                    <div className="text-white/90 text-sm leading-relaxed whitespace-pre-wrap font-mono bg-black/20 p-3 rounded">
                                                                        {improvement.example}
                                                                    </div>
                                                                </div>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                        ))}
                                    </div>

                                    {/* Next Steps */}
                                    {feedback.nextSteps && feedback.nextSteps.length > 0 && (
                                        <div className="mt-6 pt-6 border-t border-white/10">
                                            <h4 className="text-white font-semibold mb-3 flex items-center gap-2">
                                                <span>🎯</span> Next Steps
                                            </h4>
                                            <ul className="space-y-2">
                                                {feedback.nextSteps.map((step, idx) => (
                                                    <li key={idx} className="flex items-start gap-2 text-white/70 text-sm">
                                                        <span className="text-blue-400 font-bold">{idx + 1}.</span>
                                                        <span>{step}</span>
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* Collapsible Video Player */}
                        {selectedRecording && videoSrc && (
                            <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                                <button
                                    onClick={() => setIsVideoExpanded(prev => !prev)}
                                    className="w-full flex items-center justify-between bg-white/5 hover:bg-white/8 border border-white/10 rounded-2xl px-5 py-3.5 transition-all duration-200 group"
                                >
                                    <div className="flex items-center gap-3">
                                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-white/50">
                                            <polygon points="23 7 16 12 23 17 23 7"></polygon>
                                            <rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect>
                                        </svg>
                                        <span className="text-sm font-medium text-white/70 group-hover:text-white/90 transition-colors">
                                            {isVideoExpanded ? 'Hide Recording' : 'Review Recording'}
                                        </span>
                                    </div>
                                    <svg
                                        className={`w-4 h-4 text-white/40 transition-transform duration-200 ${isVideoExpanded ? 'rotate-180' : ''}`}
                                        fill="none" stroke="currentColor" viewBox="0 0 24 24"
                                    >
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                    </svg>
                                </button>

                                {isVideoExpanded && (
                                    <div className="mt-2 rounded-2xl overflow-hidden border border-white/10 animate-in fade-in slide-in-from-top-2 duration-200">
                                        <video
                                            src={videoSrc}
                                            controls
                                            className="w-full max-h-[360px] bg-black"
                                        />
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Transcript Viewer */}
                        {selectedRecording && selectedRecording.transcript ? (
                            <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                                <TranscriptViewer
                                    transcript={selectedRecording.transcript}
                                    duration={selectedRecording.duration}
                                    highlightFillerWords={true}
                                />
                            </div>
                        ) : selectedRecording && !selectedRecording.transcript && selectedRecording.videoUrl ? (
                            <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6">
                                <div className="flex items-start gap-4">
                                    <div className="w-10 h-10 rounded-full bg-amber-500/20 border border-amber-500/30 flex items-center justify-center flex-shrink-0">
                                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-amber-300">
                                            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
                                            <line x1="12" y1="9" x2="12" y2="13"></line>
                                            <line x1="12" y1="17" x2="12.01" y2="17"></line>
                                        </svg>
                                    </div>
                                    <div className="flex-1">
                                        <p className="text-white/80 font-medium text-sm mb-1">Transcript not available</p>
                                        <p className="text-white/50 text-xs mb-4">
                                            The speech-to-text processing for this recording didn&apos;t complete. You can retry now — it only takes a few seconds.
                                        </p>
                                        {retryError && (
                                            <p className="text-red-300 text-xs mb-3">{retryError}</p>
                                        )}
                                        <button
                                            onClick={() => retryTranscription(selectedRecording)}
                                            disabled={isRetryingTranscription}
                                            className="flex items-center gap-2 bg-white/10 hover:bg-white/20 active:bg-white/30 border border-white/20 transition-all duration-200 px-4 py-2 rounded-full text-sm font-medium text-white disabled:opacity-50 disabled:cursor-not-allowed"
                                        >
                                            {isRetryingTranscription ? (
                                                <>
                                                    <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                                    <span>Processing...</span>
                                                </>
                                            ) : (
                                                <>
                                                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                                        <polyline points="23 4 23 10 17 10"></polyline>
                                                        <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
                                                    </svg>
                                                    <span>Retry Transcription</span>
                                                </>
                                            )}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ) : null}

                        {/* #32 Practice Again */}
                        {sessionType && questions.length > 0 && selectedRecording && (
                            <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 pt-2">
                                <Link
                                    href="/interview"
                                    onClick={() => repeatSession()}
                                    className="w-full flex items-center justify-center gap-3 bg-white/5 hover:bg-white/10 active:bg-white/15 border border-white/10 hover:border-white/20 transition-all duration-200 rounded-2xl px-6 py-4 group"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-white/40 group-hover:text-white/70 transition-colors flex-shrink-0">
                                        <polyline points="23 4 23 10 17 10"></polyline>
                                        <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
                                    </svg>
                                    <div className="text-left">
                                        <div className="text-sm font-medium text-white/70 group-hover:text-white/90 transition-colors">Practice Again</div>
                                        <div className="text-[11px] text-white/35 capitalize">{sessionType.replace(/-/g, ' ')} · Same questions</div>
                                    </div>
                                </Link>
                            </div>
                        )}

                    </div>
                </div>
            </div>

            {/* Signup Overlay for Anonymous Users */}
            {showSignupOverlay && (
                <div className="fixed inset-0 flex items-center justify-center bg-black/40 backdrop-blur-sm z-50">
                    <AccountConversionModal
                        isOpen={showSignupOverlay}
                        onClose={() => setShowSignupOverlay(false)}
                    />
                </div>
            )}
        </main>
    );
}
