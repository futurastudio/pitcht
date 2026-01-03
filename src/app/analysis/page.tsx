'use client';

import { apiFetch } from '@/utils/api';
import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useInterview, Recording } from '@/context/InterviewContext';
import { useAuth } from '@/context/AuthContext';
import AccountConversionModal from '@/components/AccountConversionModal';
import TranscriptViewer from '@/components/TranscriptViewer';
import { analyzeSpeech } from '@/services/speechAnalyzer';
import { saveAnalysis } from '@/services/sessionManager';
import type { GenerateFeedbackResponse } from '@/app/api/generate-feedback/route';

// Sprint 5A: Demo data removed - using real recordings from InterviewContext

export default function Analysis() {
    const { recordings, clearSession, sessionType, sessionContext } = useInterview();
    const { user } = useAuth();
    const [selectedRecording, setSelectedRecording] = useState<Recording | null>(null);
    const [videoSrc, setVideoSrc] = useState<string | null>(null);
    const [feedback, setFeedback] = useState<GenerateFeedbackResponse | null>(null);
    const [isGeneratingFeedback, setIsGeneratingFeedback] = useState(false);
    const [feedbackError, setFeedbackError] = useState<string | null>(null);
    const [showSignupOverlay, setShowSignupOverlay] = useState(false);
    const [openExamples, setOpenExamples] = useState<Record<number, boolean>>({}); // NEW: Track which examples are open
    const [showDemoData, setShowDemoData] = useState(false); // Toggle demo mockup section

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

    // Debug: Log video metrics when recording is selected
    useEffect(() => {
        if (selectedRecording) {
            console.log('📊 Selected Recording Metrics:', {
                questionText: selectedRecording.questionText,
                transcript: selectedRecording.transcript ? '✓ Available' : '✗ Missing',
                eyeContactPercentage: selectedRecording.eyeContactPercentage || 'Not captured',
                gazeStability: selectedRecording.gazeStability || 'Not captured',
                dominantEmotion: selectedRecording.dominantEmotion || 'Not captured',
                emotionConfidence: selectedRecording.emotionConfidence || 'Not captured',
                presenceScore: selectedRecording.presenceScore || 'Not captured',
            });
        }
    }, [selectedRecording]);

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
                    } else {
                        console.warn('No video URL available for recording');
                    }
                }
            } catch (error) {
                console.error('Error loading video:', error);
            }
        };

        loadVideo();
    }, [selectedRecording]);

    // Generate feedback when recording is selected
    useEffect(() => {
        const generateFeedbackForRecording = async () => {
            if (!selectedRecording) {
                setFeedback(null);
                setFeedbackError(null);
                return;
            }

            // Only generate feedback if we have a transcript
            if (!selectedRecording.transcript) {
                setFeedback(null);
                setFeedbackError(null);
                return;
            }

            setIsGeneratingFeedback(true);
            setFeedbackError(null);

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
                                summary: data.summary,
                                strengths: data.strengths,
                                improvements: data.improvements,
                                nextSteps: data.nextSteps,
                            });
                            console.log('✅ Analysis saved to database for recording:', selectedRecording.recordingId);
                        } catch (analysisError) {
                            console.error('Failed to save analysis to database:', analysisError);
                            // Don't fail the whole operation - user can still see the feedback
                        }
                    } else {
                        console.warn('⚠️  No recording ID available - analysis not saved to database');
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

        generateFeedbackForRecording();
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
                                summary: data.summary,
                                strengths: data.strengths,
                                improvements: data.improvements,
                                nextSteps: data.nextSteps,
                            });
                            console.log('✅ Analysis saved to database for recording:', selectedRecording.recordingId);
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

    return (
        <main className="min-h-screen text-white p-8 pb-24 relative">
            {/* Background Gradient Overlay */}
            <div className="absolute inset-0 bg-black/80 backdrop-blur-md -z-10" />

            {/* Analysis Content - Blurred for anonymous users */}
            <div className={`max-w-7xl mx-auto relative z-10 ${showSignupOverlay ? 'filter blur-md pointer-events-none select-none' : ''}`}>
                <header className="flex justify-between items-center mb-8">
                    <h1 className="text-4xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-white/60">
                        Session Analysis
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
                                                    {Math.floor(rec.duration / 60)}:{(rec.duration % 60).toString().padStart(2, '0')}
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
                        {/* Video Player */}
                        <div className="bg-white/10 backdrop-blur-xl border border-white/20 shadow-xl rounded-3xl p-1 aspect-video flex items-center justify-center bg-black/40 overflow-hidden relative">
                            {videoSrc ? (
                                <video
                                    src={videoSrc}
                                    controls
                                    autoPlay
                                    className="w-full h-full object-contain rounded-2xl"
                                />
                            ) : (
                                <div className="text-center p-8">
                                    <p className="text-white/50 mb-2">Select a question to view recording</p>
                                </div>
                            )}
                        </div>

                        {/* Transcript Viewer */}
                        {selectedRecording && selectedRecording.transcript && (
                            <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                                <TranscriptViewer
                                    transcript={selectedRecording.transcript}
                                    duration={selectedRecording.duration}
                                    highlightFillerWords={true}
                                />
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
                                            {/* Score Breakdown */}
                                            {(feedback.contentScore !== undefined || feedback.communicationScore !== undefined || feedback.deliveryScore !== undefined) && (
                                                <div className="grid grid-cols-3 gap-3 mb-4">
                                                    {feedback.contentScore !== undefined && (
                                                        <div className="bg-white/5 rounded-xl p-3 text-center">
                                                            <div className="text-xs text-white/50 uppercase mb-1">Content</div>
                                                            <div className="text-xl font-bold text-white">{feedback.contentScore}</div>
                                                        </div>
                                                    )}
                                                    {feedback.communicationScore !== undefined && (
                                                        <div className="bg-blue-500/10 border border-blue-500/30 rounded-xl p-4 text-center">
                                                            <div className="text-[11px] text-blue-300/70 uppercase mb-1.5 whitespace-nowrap">Communication</div>
                                                            <div className="text-xl font-bold text-blue-200">{feedback.communicationScore}</div>
                                                        </div>
                                                    )}
                                                    {feedback.deliveryScore !== undefined && (
                                                        <div className="bg-white/5 rounded-xl p-3 text-center">
                                                            <div className="text-xs text-white/50 uppercase mb-1">Delivery</div>
                                                            <div className="text-xl font-bold text-white">{feedback.deliveryScore}</div>
                                                        </div>
                                                    )}
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
                                        // Calculate real metrics from transcript
                                        const metrics = selectedRecording.transcript
                                            ? analyzeSpeech(selectedRecording.transcript, selectedRecording.duration)
                                            : null;

                                        const clarityScore = metrics?.clarityScore || 0;
                                        const pacingScore = metrics?.pacingScore || 0;
                                        const wpm = metrics?.wordsPerMinute || 0;
                                        const fillerCount = metrics?.fillerWordCount || 0;

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
                                                            {/* Eye Contact Score */}
                                                            {eyeContact > 0 && (
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
                                                            )}

                                                            {/* Gaze Stability */}
                                                            {gazeStability > 0 && (
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
                                                            )}

                                                            {/* Presence Score */}
                                                            {presenceScore > 0 && (
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
                                                            )}
                                                        </>
                                                    ) : (
                                                        <div className="bg-white/5 rounded-xl p-3 text-center">
                                                            <p className="text-white/40 text-xs">
                                                                Video metrics not available
                                                            </p>
                                                            <p className="text-white/30 text-[10px] mt-1">
                                                                Ensure the emotion service is running
                                                            </p>
                                                        </div>
                                                    )}
                                                </div>

                                                {/* Stats Row */}
                                                <div className="grid grid-cols-2 gap-4 pt-2">
                                                    <div className="bg-white/5 rounded-xl p-3">
                                                        <div className="text-[10px] text-white/50 uppercase tracking-wider mb-1">Words/Min</div>
                                                        <div className="text-2xl font-bold text-white">{wpm}</div>
                                                    </div>
                                                    <div className="bg-white/5 rounded-xl p-3">
                                                        <div className="text-[10px] text-white/50 uppercase tracking-wider mb-1">Filler Words</div>
                                                        <div className="text-2xl font-bold text-yellow-300">{fillerCount}</div>
                                                    </div>
                                                </div>

                                                {/* Sprint 5A: Dominant Emotion Badge */}
                                                {dominantEmotion && (
                                                    <div className="pt-2 border-t border-white/10">
                                                        <div className="text-[10px] text-white/40 uppercase tracking-wider mb-2 flex items-center gap-2">
                                                            <div className="w-1 h-1 rounded-full bg-indigo-400"></div>
                                                            <span className="font-semibold">Detected Emotion</span>
                                                        </div>
                                                        <div className="flex items-center gap-3">
                                                            <div className="inline-block bg-gradient-to-r from-indigo-500/20 to-purple-500/20 border border-indigo-400/30 px-4 py-2 rounded-full">
                                                                <span className="text-sm font-medium text-indigo-200 capitalize">{dominantEmotion}</span>
                                                            </div>
                                                            {emotionConfidence > 0 && (
                                                                <div className="text-[10px] text-white/50">
                                                                    <span className="font-mono">{Math.round(emotionConfidence)}%</span>
                                                                    <span className="ml-1">confidence</span>
                                                                </div>
                                                            )}
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

                        {/* DEMO SHOWCASE: Interactive Demo Section */}
                        <div className="space-y-6 mt-12 pb-12">
                            {/* Demo Toggle Button */}
                            <div className="text-center">
                                <button
                                    onClick={() => setShowDemoData(!showDemoData)}
                                    className="group relative inline-flex items-center gap-3 bg-gradient-to-r from-purple-500/20 to-blue-500/20 hover:from-purple-500/30 hover:to-blue-500/30 border border-purple-400/30 hover:border-purple-400/50 px-8 py-4 rounded-2xl transition-all duration-300 shadow-lg hover:shadow-xl"
                                >
                                    <div className="w-10 h-10 rounded-xl bg-purple-500/20 flex items-center justify-center group-hover:scale-110 transition-transform">
                                        <span className="text-2xl">{showDemoData ? '👁️' : '🎯'}</span>
                                    </div>
                                    <div className="text-left">
                                        <div className="text-white font-bold text-lg">
                                            {showDemoData ? 'Hide Demo Dashboard' : 'View Full Demo Dashboard'}
                                        </div>
                                        <div className="text-white/60 text-sm">
                                            {showDemoData ? 'Close preview' : 'See complete platform capabilities with sample data'}
                                        </div>
                                    </div>
                                    <svg
                                        className={`w-5 h-5 text-purple-300 transition-transform duration-300 ${showDemoData ? 'rotate-180' : ''}`}
                                        fill="none"
                                        stroke="currentColor"
                                        viewBox="0 0 24 24"
                                    >
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                    </svg>
                                </button>
                            </div>

                            {/* Demo Content - Collapsible */}
                            {showDemoData && (
                                <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                                    {/* Section Header */}
                                    <div className="text-center mb-8">
                                        <div className="inline-flex items-center gap-2 bg-gradient-to-r from-purple-500/20 to-blue-500/20 border border-purple-400/30 px-4 py-2 rounded-full mb-3">
                                            <span className="text-xs text-purple-300 uppercase font-semibold tracking-wider">Demo Preview</span>
                                        </div>
                                        <h2 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-white/60 mb-2">
                                            Your Personalized Dashboard
                                        </h2>
                                        <p className="text-white/50 text-sm">Context-aware analysis • Framework mastery • Real-time progress tracking</p>
                                    </div>

                            {/* Context Banner - Shows what user is preparing for */}
                            <div className="bg-gradient-to-r from-blue-500/15 to-purple-500/15 border border-blue-400/30 rounded-2xl p-6 backdrop-blur-xl">
                                <div className="flex items-start justify-between gap-4">
                                    <div className="flex items-start gap-4 flex-1">
                                        <div className="w-12 h-12 rounded-xl bg-blue-500/20 flex items-center justify-center flex-shrink-0">
                                            <span className="text-2xl">🎯</span>
                                        </div>
                                        <div className="flex-1">
                                            <h3 className="text-white font-bold text-lg mb-1">Preparing for: Senior Product Manager at Google</h3>
                                            <p className="text-white/70 text-sm mb-3">Technical & Behavioral Interview • Leadership Level</p>
                                            <div className="flex items-center gap-4 text-xs">
                                                <div className="flex items-center gap-2">
                                                    <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse"></div>
                                                    <span className="text-white/60">Interview in <span className="text-green-400 font-semibold">5 days</span></span>
                                                </div>
                                                <div className="w-1 h-1 rounded-full bg-white/30"></div>
                                                <span className="text-white/60">8 practice sessions completed</span>
                                                <div className="w-1 h-1 rounded-full bg-white/30"></div>
                                                <span className="text-white/60">Last session: 2 hours ago</span>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="bg-green-500/20 border border-green-400/30 rounded-xl px-4 py-2 flex-shrink-0">
                                        <div className="text-xs text-green-300 uppercase font-semibold mb-1">Readiness</div>
                                        <div className="text-2xl font-bold text-green-400">82%</div>
                                    </div>
                                </div>
                            </div>

                            {/* Progress Over Time */}
                            <div className="bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-xl border border-white/20 shadow-2xl rounded-3xl p-8">
                                <h3 className="text-2xl font-bold mb-6 text-white/90 flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-green-400/20 to-emerald-500/20 flex items-center justify-center">
                                        <span className="text-xl">📈</span>
                                    </div>
                                    Progress Tracking & Trends
                                </h3>

                                {/* Trend Cards */}
                                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                                    <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-5 hover:bg-white/8 transition-all duration-300 group">
                                        <div className="flex items-center justify-between mb-3">
                                            <span className="text-xs text-white/50 uppercase font-semibold">Overall Score</span>
                                            <div className="flex items-center gap-1 text-green-400 text-xs">
                                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
                                                </svg>
                                                <span>+12%</span>
                                            </div>
                                        </div>
                                        <div className="text-4xl font-bold text-white mb-1">8.2</div>
                                        <div className="text-xs text-white/40 mb-2">from 7.3 last week</div>
                                        <div className="opacity-0 group-hover:opacity-100 transition-opacity text-[10px] text-green-400 bg-green-500/10 rounded px-2 py-1">
                                            Top 15% for PM roles
                                        </div>
                                    </div>

                                    <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-5 hover:bg-white/8 transition-all duration-300 group">
                                        <div className="flex items-center justify-between mb-3">
                                            <span className="text-xs text-white/50 uppercase font-semibold">Eye Contact</span>
                                            <div className="flex items-center gap-1 text-green-400 text-xs">
                                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
                                                </svg>
                                                <span>+18%</span>
                                            </div>
                                        </div>
                                        <div className="text-4xl font-bold text-purple-300 mb-1">78%</div>
                                        <div className="text-xs text-white/40 mb-2">improved significantly</div>
                                        <div className="opacity-0 group-hover:opacity-100 transition-opacity text-[10px] text-blue-400 bg-blue-500/10 rounded px-2 py-1">
                                            Interviewers will notice ✓
                                        </div>
                                    </div>

                                    <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-5 hover:bg-white/8 transition-all duration-300 group">
                                        <div className="flex items-center justify-between mb-3">
                                            <span className="text-xs text-white/50 uppercase font-semibold">Filler Words</span>
                                            <div className="flex items-center gap-1 text-green-400 text-xs">
                                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                                                </svg>
                                                <span>-45%</span>
                                            </div>
                                        </div>
                                        <div className="text-4xl font-bold text-yellow-300 mb-1">12</div>
                                        <div className="text-xs text-white/40 mb-2">down from 22 avg</div>
                                        <div className="opacity-0 group-hover:opacity-100 transition-opacity text-[10px] text-green-400 bg-green-500/10 rounded px-2 py-1">
                                            Below avg for leadership (15)
                                        </div>
                                    </div>

                                    <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-5 hover:bg-white/8 transition-all duration-300">
                                        <div className="flex items-center justify-between mb-3">
                                            <span className="text-xs text-white/50 uppercase font-semibold">Sessions</span>
                                            <div className="flex items-center gap-1 text-blue-400 text-xs">
                                                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                                                    <path d="M9 1v2H4v2h1v14a2 2 0 002 2h10a2 2 0 002-2V5h1V3h-5V1H9zm2 4h2v10h-2V5z"/>
                                                </svg>
                                                <span>24 total</span>
                                            </div>
                                        </div>
                                        <div className="text-4xl font-bold text-blue-300 mb-1">8</div>
                                        <div className="text-xs text-white/40">this week</div>
                                    </div>
                                </div>

                                {/* Visual Progress Chart Mockup */}
                                <div className="bg-black/20 border border-white/10 rounded-2xl p-6">
                                    <div className="flex items-center justify-between mb-4">
                                        <h4 className="text-white/80 font-semibold">Performance Over Time</h4>
                                        <div className="flex gap-4 text-xs">
                                            <div className="flex items-center gap-2">
                                                <div className="w-3 h-3 rounded-full bg-gradient-to-r from-green-400 to-emerald-400"></div>
                                                <span className="text-white/60">Content</span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <div className="w-3 h-3 rounded-full bg-gradient-to-r from-blue-400 to-cyan-400"></div>
                                                <span className="text-white/60">Delivery</span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <div className="w-3 h-3 rounded-full bg-gradient-to-r from-purple-400 to-pink-400"></div>
                                                <span className="text-white/60">Presence</span>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="relative h-56 flex items-end justify-between gap-3 px-2">
                                        {[
                                            { content: 65, delivery: 60, presence: 55 },
                                            { content: 68, delivery: 65, presence: 62 },
                                            { content: 72, delivery: 70, presence: 68 },
                                            { content: 75, delivery: 72, presence: 70 },
                                            { content: 78, delivery: 76, presence: 74 },
                                            { content: 81, delivery: 79, presence: 77 },
                                            { content: 82, delivery: 80, presence: 79 },
                                            { content: 85, delivery: 83, presence: 82 }
                                        ].map((week, idx) => (
                                            <div key={idx} className="flex-1 flex flex-col items-center gap-2">
                                                <div className="w-full flex items-end justify-center gap-0.5 group relative" style={{ height: '180px' }}>
                                                    {/* Content Bar */}
                                                    <div
                                                        className="w-full bg-gradient-to-t from-green-500/70 to-green-400/40 rounded-t hover:from-green-500/90 hover:to-green-400/60 transition-all cursor-pointer"
                                                        style={{ height: `${week.content}%` }}
                                                        title={`Content: ${week.content}%`}
                                                    />
                                                    {/* Delivery Bar */}
                                                    <div
                                                        className="w-full bg-gradient-to-t from-blue-500/70 to-cyan-400/40 rounded-t hover:from-blue-500/90 hover:to-cyan-400/60 transition-all cursor-pointer"
                                                        style={{ height: `${week.delivery}%` }}
                                                        title={`Delivery: ${week.delivery}%`}
                                                    />
                                                    {/* Presence Bar */}
                                                    <div
                                                        className="w-full bg-gradient-to-t from-purple-500/70 to-pink-400/40 rounded-t hover:from-purple-500/90 hover:to-pink-400/60 transition-all cursor-pointer"
                                                        style={{ height: `${week.presence}%` }}
                                                        title={`Presence: ${week.presence}%`}
                                                    />
                                                    {/* Hover tooltip */}
                                                    <div className="opacity-0 group-hover:opacity-100 absolute -top-12 left-1/2 -translate-x-1/2 bg-black/90 px-3 py-2 rounded-lg text-xs text-white whitespace-nowrap transition-opacity pointer-events-none z-10 shadow-xl border border-white/10">
                                                        <div className="space-y-0.5">
                                                            <div className="flex items-center gap-2">
                                                                <div className="w-2 h-2 rounded-full bg-green-400"></div>
                                                                <span>Content: {week.content}%</span>
                                                            </div>
                                                            <div className="flex items-center gap-2">
                                                                <div className="w-2 h-2 rounded-full bg-blue-400"></div>
                                                                <span>Delivery: {week.delivery}%</span>
                                                            </div>
                                                            <div className="flex items-center gap-2">
                                                                <div className="w-2 h-2 rounded-full bg-purple-400"></div>
                                                                <span>Presence: {week.presence}%</span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                                <span className="text-[10px] text-white/40 font-medium">W{idx + 1}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            {/* Framework Mastery Dashboard */}
                            <div className="bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-xl border border-white/20 shadow-2xl rounded-3xl p-8">
                                <h3 className="text-2xl font-bold mb-6 text-white/90 flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-400/20 to-cyan-500/20 flex items-center justify-center">
                                        <span className="text-xl">🎓</span>
                                    </div>
                                    Communication Framework Mastery
                                </h3>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    {/* STAR Method */}
                                    <div className="bg-white/5 border border-white/10 rounded-2xl p-6 hover:bg-white/8 transition-all duration-300">
                                        <div className="flex items-center justify-between mb-4">
                                            <h4 className="text-lg font-semibold text-white">STAR Method</h4>
                                            <div className="flex items-center gap-2">
                                                <div className="text-2xl font-bold text-green-400">85%</div>
                                                <div className="text-xs text-white/50">mastery</div>
                                            </div>
                                        </div>
                                        <div className="space-y-2 mb-4">
                                            <div className="flex justify-between text-xs text-white/60">
                                                <span><strong className="text-green-300">S</strong>ituation</span>
                                                <span className="text-green-400">90%</span>
                                            </div>
                                            <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                                                <div className="h-full bg-gradient-to-r from-green-500 to-emerald-400 rounded-full" style={{ width: '90%' }} />
                                            </div>

                                            <div className="flex justify-between text-xs text-white/60 pt-2">
                                                <span><strong className="text-yellow-300">T</strong>ask</span>
                                                <span className="text-yellow-400">82%</span>
                                            </div>
                                            <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                                                <div className="h-full bg-gradient-to-r from-yellow-500 to-amber-400 rounded-full" style={{ width: '82%' }} />
                                            </div>

                                            <div className="flex justify-between text-xs text-white/60 pt-2">
                                                <span><strong className="text-blue-300">A</strong>ction</span>
                                                <span className="text-blue-400">78%</span>
                                            </div>
                                            <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                                                <div className="h-full bg-gradient-to-r from-blue-500 to-cyan-400 rounded-full" style={{ width: '78%' }} />
                                            </div>

                                            <div className="flex justify-between text-xs text-white/60 pt-2">
                                                <span><strong className="text-purple-300">R</strong>esult</span>
                                                <span className="text-purple-400">88%</span>
                                            </div>
                                            <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                                                <div className="h-full bg-gradient-to-r from-purple-500 to-pink-400 rounded-full" style={{ width: '88%' }} />
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2 text-xs text-green-400 bg-green-500/10 border border-green-500/30 rounded-lg px-3 py-2">
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                            </svg>
                                            <span>Strong foundation - focus on Actions</span>
                                        </div>
                                    </div>

                                    {/* CARL Method */}
                                    <div className="bg-white/5 border border-white/10 rounded-2xl p-6 hover:bg-white/8 transition-all duration-300">
                                        <div className="flex items-center justify-between mb-4">
                                            <h4 className="text-lg font-semibold text-white">CARL Framework</h4>
                                            <div className="flex items-center gap-2">
                                                <div className="text-2xl font-bold text-yellow-400">72%</div>
                                                <div className="text-xs text-white/50">mastery</div>
                                            </div>
                                        </div>
                                        <div className="space-y-2 mb-4">
                                            <div className="flex justify-between text-xs text-white/60">
                                                <span><strong className="text-cyan-300">C</strong>ontext</span>
                                                <span className="text-cyan-400">80%</span>
                                            </div>
                                            <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                                                <div className="h-full bg-gradient-to-r from-cyan-500 to-blue-400 rounded-full" style={{ width: '80%' }} />
                                            </div>

                                            <div className="flex justify-between text-xs text-white/60 pt-2">
                                                <span><strong className="text-orange-300">A</strong>ction</span>
                                                <span className="text-orange-400">68%</span>
                                            </div>
                                            <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                                                <div className="h-full bg-gradient-to-r from-orange-500 to-red-400 rounded-full" style={{ width: '68%' }} />
                                            </div>

                                            <div className="flex justify-between text-xs text-white/60 pt-2">
                                                <span><strong className="text-pink-300">R</strong>esult</span>
                                                <span className="text-pink-400">70%</span>
                                            </div>
                                            <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                                                <div className="h-full bg-gradient-to-r from-pink-500 to-rose-400 rounded-full" style={{ width: '70%' }} />
                                            </div>

                                            <div className="flex justify-between text-xs text-white/60 pt-2">
                                                <span><strong className="text-indigo-300">L</strong>earning</span>
                                                <span className="text-indigo-400">72%</span>
                                            </div>
                                            <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                                                <div className="h-full bg-gradient-to-r from-indigo-500 to-purple-400 rounded-full" style={{ width: '72%' }} />
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2 text-xs text-yellow-400 bg-yellow-500/10 border border-yellow-500/30 rounded-lg px-3 py-2">
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                                            </svg>
                                            <span>Practice more with Action details</span>
                                        </div>
                                    </div>

                                    {/* CAR Method */}
                                    <div className="bg-white/5 border border-white/10 rounded-2xl p-6 hover:bg-white/8 transition-all duration-300">
                                        <div className="flex items-center justify-between mb-4">
                                            <h4 className="text-lg font-semibold text-white">CAR Method</h4>
                                            <div className="flex items-center gap-2">
                                                <div className="text-2xl font-bold text-blue-400">78%</div>
                                                <div className="text-xs text-white/50">mastery</div>
                                            </div>
                                        </div>
                                        <div className="space-y-2 mb-4">
                                            <div className="flex justify-between text-xs text-white/60">
                                                <span><strong className="text-teal-300">C</strong>hallenge</span>
                                                <span className="text-teal-400">75%</span>
                                            </div>
                                            <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                                                <div className="h-full bg-gradient-to-r from-teal-500 to-cyan-400 rounded-full" style={{ width: '75%' }} />
                                            </div>

                                            <div className="flex justify-between text-xs text-white/60 pt-2">
                                                <span><strong className="text-violet-300">A</strong>ction</span>
                                                <span className="text-violet-400">80%</span>
                                            </div>
                                            <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                                                <div className="h-full bg-gradient-to-r from-violet-500 to-purple-400 rounded-full" style={{ width: '80%' }} />
                                            </div>

                                            <div className="flex justify-between text-xs text-white/60 pt-2">
                                                <span><strong className="text-emerald-300">R</strong>esult</span>
                                                <span className="text-emerald-400">78%</span>
                                            </div>
                                            <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                                                <div className="h-full bg-gradient-to-r from-emerald-500 to-green-400 rounded-full" style={{ width: '78%' }} />
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2 text-xs text-blue-400 bg-blue-500/10 border border-blue-500/30 rounded-lg px-3 py-2">
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                                            </svg>
                                            <span>Well balanced across all components</span>
                                        </div>
                                    </div>

                                    {/* Conciseness Score */}
                                    <div className="bg-white/5 border border-white/10 rounded-2xl p-6 hover:bg-white/8 transition-all duration-300">
                                        <div className="flex items-center justify-between mb-4">
                                            <h4 className="text-lg font-semibold text-white">Conciseness</h4>
                                            <div className="flex items-center gap-2">
                                                <div className="text-2xl font-bold text-orange-400">68%</div>
                                                <div className="text-xs text-white/50">efficiency</div>
                                            </div>
                                        </div>
                                        <div className="space-y-3">
                                            <div className="flex items-center justify-between text-sm">
                                                <span className="text-white/70">Avg Response Time</span>
                                                <span className="text-white font-mono">2m 15s</span>
                                            </div>
                                            <div className="flex items-center justify-between text-sm">
                                                <span className="text-white/70">Words per Answer</span>
                                                <span className="text-white font-mono">156</span>
                                            </div>
                                            <div className="flex items-center justify-between text-sm">
                                                <span className="text-white/70">Rambling Index</span>
                                                <span className="text-yellow-400 font-mono">Medium</span>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2 text-xs text-orange-400 bg-orange-500/10 border border-orange-500/30 rounded-lg px-3 py-2 mt-4">
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                            </svg>
                                            <span>Aim for under 2 minutes</span>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Personalized Action Plan */}
                            <div className="bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-xl border border-white/20 shadow-2xl rounded-3xl p-8">
                                <h3 className="text-2xl font-bold mb-6 text-white/90 flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-400/20 to-red-500/20 flex items-center justify-center">
                                        <span className="text-xl">🎯</span>
                                    </div>
                                    Your Personalized Action Plan
                                </h3>

                                <div className="space-y-4">
                                    {/* This Week */}
                                    <div className="bg-gradient-to-r from-purple-500/10 to-blue-500/10 border border-purple-400/30 rounded-2xl p-6">
                                        <div className="flex items-center gap-3 mb-4">
                                            <div className="w-8 h-8 rounded-full bg-purple-500/20 flex items-center justify-center">
                                                <span className="text-sm">📅</span>
                                            </div>
                                            <h4 className="text-lg font-semibold text-white">This Week's Focus</h4>
                                        </div>
                                        <div className="grid gap-3">
                                            <div className="flex items-start gap-3 bg-white/5 rounded-xl p-4">
                                                <div className="w-6 h-6 rounded-lg bg-green-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                                                    <span className="text-xs">1</span>
                                                </div>
                                                <div className="flex-1">
                                                    <h5 className="text-white font-medium mb-1">Reduce filler words by 30%</h5>
                                                    <p className="text-white/60 text-sm">Practice pause-before-speak technique. Target: &lt;8 fillers per response</p>
                                                    <div className="mt-2 bg-blue-500/10 border border-blue-500/20 rounded-lg p-2 text-xs text-blue-300">
                                                        💡 Google PM interviews: Clarity matters more than speed
                                                    </div>
                                                    <div className="mt-2 flex items-center gap-2">
                                                        <div className="flex-1 h-1.5 bg-white/10 rounded-full overflow-hidden">
                                                            <div className="h-full bg-gradient-to-r from-green-500 to-emerald-400 rounded-full" style={{ width: '65%' }} />
                                                        </div>
                                                        <span className="text-xs text-white/50">65%</span>
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="flex items-start gap-3 bg-white/5 rounded-xl p-4">
                                                <div className="w-6 h-6 rounded-lg bg-blue-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                                                    <span className="text-xs">2</span>
                                                </div>
                                                <div className="flex-1">
                                                    <h5 className="text-white font-medium mb-1">Improve eye contact consistency</h5>
                                                    <p className="text-white/60 text-sm">Maintain 80%+ eye contact throughout answers. Use the camera confidence drill</p>
                                                    <div className="mt-2 bg-purple-500/10 border border-purple-500/20 rounded-lg p-2 text-xs text-purple-300">
                                                        🎯 Critical for leadership roles - shows executive presence
                                                    </div>
                                                    <div className="mt-2 flex items-center gap-2">
                                                        <div className="flex-1 h-1.5 bg-white/10 rounded-full overflow-hidden">
                                                            <div className="h-full bg-gradient-to-r from-blue-500 to-cyan-400 rounded-full" style={{ width: '45%' }} />
                                                        </div>
                                                        <span className="text-xs text-white/50">45%</span>
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="flex items-start gap-3 bg-white/5 rounded-xl p-4">
                                                <div className="w-6 h-6 rounded-lg bg-yellow-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                                                    <span className="text-xs">3</span>
                                                </div>
                                                <div className="flex-1">
                                                    <h5 className="text-white font-medium mb-1">Master CARL framework examples</h5>
                                                    <p className="text-white/60 text-sm">Practice 3 CARL responses this week focusing on Learning component</p>
                                                    <div className="mt-2 bg-orange-500/10 border border-orange-500/20 rounded-lg p-2 text-xs text-orange-300">
                                                        ⚡ High priority: Google values growth mindset & learning
                                                    </div>
                                                    <div className="mt-2 flex items-center gap-2">
                                                        <div className="flex-1 h-1.5 bg-white/10 rounded-full overflow-hidden">
                                                            <div className="h-full bg-gradient-to-r from-yellow-500 to-orange-400 rounded-full" style={{ width: '20%' }} />
                                                        </div>
                                                        <span className="text-xs text-white/50">20%</span>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Practice Recommendations */}
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
                                            <div className="flex items-center gap-2 mb-3">
                                                <span className="text-lg">💪</span>
                                                <h5 className="text-white font-semibold">Practice Drills</h5>
                                            </div>
                                            <ul className="space-y-2 text-sm text-white/70">
                                                <li className="flex items-start gap-2">
                                                    <span className="text-blue-400 mt-0.5">•</span>
                                                    <span>30-second elevator pitch (3x daily)</span>
                                                </li>
                                                <li className="flex items-start gap-2">
                                                    <span className="text-blue-400 mt-0.5">•</span>
                                                    <span>Mirror practice for eye contact (5 min)</span>
                                                </li>
                                                <li className="flex items-start gap-2">
                                                    <span className="text-blue-400 mt-0.5">•</span>
                                                    <span>Record & review daily progress</span>
                                                </li>
                                            </ul>
                                        </div>

                                        <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
                                            <div className="flex items-center gap-2 mb-3">
                                                <span className="text-lg">📚</span>
                                                <h5 className="text-white font-semibold">Resources</h5>
                                            </div>
                                            <ul className="space-y-2 text-sm text-white/70">
                                                <li className="flex items-start gap-2">
                                                    <span className="text-purple-400 mt-0.5">•</span>
                                                    <span>Framework guide: STAR vs CARL vs CAR</span>
                                                </li>
                                                <li className="flex items-start gap-2">
                                                    <span className="text-purple-400 mt-0.5">•</span>
                                                    <span>Video library: Top performers analysis</span>
                                                </li>
                                                <li className="flex items-start gap-2">
                                                    <span className="text-purple-400 mt-0.5">•</span>
                                                    <span>Industry-specific question bank</span>
                                                </li>
                                            </ul>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Advanced Analytics */}
                            <div className="bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-xl border border-white/20 shadow-2xl rounded-3xl p-8">
                                <h3 className="text-2xl font-bold mb-6 text-white/90 flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-400/20 to-blue-500/20 flex items-center justify-center">
                                        <span className="text-xl">⚡</span>
                                    </div>
                                    Advanced Performance Analytics
                                </h3>

                                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                    {/* Emotional Intelligence */}
                                    <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
                                        <h4 className="text-white font-semibold mb-4 flex items-center gap-2">
                                            <span>😊</span> Emotional Range
                                        </h4>
                                        <div className="space-y-3">
                                            <div>
                                                <div className="flex justify-between text-xs mb-1">
                                                    <span className="text-white/60">Confidence</span>
                                                    <span className="text-green-400">High</span>
                                                </div>
                                                <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                                                    <div className="h-full bg-gradient-to-r from-green-500 to-emerald-400 rounded-full" style={{ width: '82%' }} />
                                                </div>
                                            </div>
                                            <div>
                                                <div className="flex justify-between text-xs mb-1">
                                                    <span className="text-white/60">Enthusiasm</span>
                                                    <span className="text-blue-400">Good</span>
                                                </div>
                                                <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                                                    <div className="h-full bg-gradient-to-r from-blue-500 to-cyan-400 rounded-full" style={{ width: '75%' }} />
                                                </div>
                                            </div>
                                            <div>
                                                <div className="flex justify-between text-xs mb-1">
                                                    <span className="text-white/60">Calmness</span>
                                                    <span className="text-purple-400">Moderate</span>
                                                </div>
                                                <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                                                    <div className="h-full bg-gradient-to-r from-purple-500 to-pink-400 rounded-full" style={{ width: '68%' }} />
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Voice Analysis */}
                                    <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
                                        <h4 className="text-white font-semibold mb-4 flex items-center gap-2">
                                            <span>🎤</span> Voice Dynamics
                                        </h4>
                                        <div className="space-y-3">
                                            <div className="flex justify-between items-center">
                                                <span className="text-sm text-white/60">Pace Variety</span>
                                                <div className="flex items-center gap-1">
                                                    {[1,2,3,4].map(i => (
                                                        <div key={i} className="w-2 h-2 rounded-full bg-green-400"></div>
                                                    ))}
                                                    <div className="w-2 h-2 rounded-full bg-white/20"></div>
                                                </div>
                                            </div>
                                            <div className="flex justify-between items-center">
                                                <span className="text-sm text-white/60">Volume Control</span>
                                                <div className="flex items-center gap-1">
                                                    {[1,2,3,4,5].map(i => (
                                                        <div key={i} className="w-2 h-2 rounded-full bg-blue-400"></div>
                                                    ))}
                                                </div>
                                            </div>
                                            <div className="flex justify-between items-center">
                                                <span className="text-sm text-white/60">Clarity</span>
                                                <div className="flex items-center gap-1">
                                                    {[1,2,3].map(i => (
                                                        <div key={i} className="w-2 h-2 rounded-full bg-yellow-400"></div>
                                                    ))}
                                                    {[1,2].map(i => (
                                                        <div key={i} className="w-2 h-2 rounded-full bg-white/20"></div>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Body Language */}
                                    <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
                                        <h4 className="text-white font-semibold mb-4 flex items-center gap-2">
                                            <span>👁️</span> Presence Score
                                        </h4>
                                        <div className="space-y-3">
                                            <div className="flex justify-between text-sm">
                                                <span className="text-white/60">Posture</span>
                                                <span className="text-green-400 font-mono">Excellent</span>
                                            </div>
                                            <div className="flex justify-between text-sm">
                                                <span className="text-white/60">Gestures</span>
                                                <span className="text-blue-400 font-mono">Natural</span>
                                            </div>
                                            <div className="flex justify-between text-sm">
                                                <span className="text-white/60">Engagement</span>
                                                <span className="text-purple-400 font-mono">High</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Success Stories & Social Proof */}
                            <div className="bg-gradient-to-br from-green-500/10 to-emerald-500/10 border border-green-400/30 rounded-2xl p-6">
                                <div className="flex items-center gap-3 mb-4">
                                    <div className="w-10 h-10 rounded-full bg-green-500/20 flex items-center justify-center">
                                        <span className="text-xl">🎉</span>
                                    </div>
                                    <div>
                                        <h4 className="text-white font-semibold">You're on Track!</h4>
                                        <p className="text-white/60 text-sm">Users with similar progress</p>
                                    </div>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    <div className="bg-white/5 rounded-xl p-4 text-center">
                                        <div className="text-3xl font-bold text-green-400 mb-1">87%</div>
                                        <p className="text-xs text-white/60">improved interview confidence</p>
                                    </div>
                                    <div className="bg-white/5 rounded-xl p-4 text-center">
                                        <div className="text-3xl font-bold text-blue-400 mb-1">2.3x</div>
                                        <p className="text-xs text-white/60">more likely to advance to final rounds</p>
                                    </div>
                                    <div className="bg-white/5 rounded-xl p-4 text-center">
                                        <div className="text-3xl font-bold text-purple-400 mb-1">92%</div>
                                        <p className="text-xs text-white/60">would recommend to a friend</p>
                                    </div>
                                </div>
                            </div>

                            {/* Example Answer & AI Coaching Section */}
                            <div className="bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-xl border border-white/20 shadow-2xl rounded-3xl p-8">
                                <h3 className="text-2xl font-bold mb-6 text-white/90 flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-400/20 to-purple-500/20 flex items-center justify-center">
                                        <span className="text-xl">💬</span>
                                    </div>
                                    Example Answer with AI Coach Feedback
                                </h3>

                                {/* Question Example */}
                                <div className="bg-blue-500/10 border border-blue-400/30 rounded-2xl p-5 mb-6">
                                    <div className="flex items-start gap-3 mb-3">
                                        <div className="w-8 h-8 rounded-lg bg-blue-500/20 flex items-center justify-center flex-shrink-0 mt-1">
                                            <span className="font-bold text-blue-300">Q3</span>
                                        </div>
                                        <div className="flex-1">
                                            <div className="text-xs text-blue-300 uppercase font-semibold mb-2">Behavioral Question</div>
                                            <p className="text-white font-medium text-lg">
                                                "Tell me about a time you had to influence a team without direct authority. How did you approach it?"
                                            </p>
                                        </div>
                                    </div>
                                </div>

                                {/* User's Answer Transcript */}
                                <div className="bg-white/5 border border-white/10 rounded-2xl p-5 mb-6">
                                    <h4 className="text-white/90 font-semibold mb-3 flex items-center gap-2">
                                        <span>📝</span> Your Answer (Transcript)
                                    </h4>
                                    <div className="text-white/80 text-sm leading-relaxed space-y-2">
                                        <p>
                                            "So, <span className="bg-yellow-400/30 text-yellow-200 px-1 rounded">um</span>, at my last company, we had this cross-functional project where I needed to get buy-in from engineering, design, and marketing teams. <span className="bg-yellow-400/30 text-yellow-200 px-1 rounded">Like</span>, nobody reported to me, <span className="bg-yellow-400/30 text-yellow-200 px-1 rounded">you know</span>?"
                                        </p>
                                        <p>
                                            "I started by understanding each team's priorities and pain points. The engineering team was worried about technical debt, design wanted more time for user research, and marketing needed faster iterations. I created a shared roadmap that addressed everyone's concerns while keeping us aligned on the product vision."
                                        </p>
                                        <p>
                                            "The result was pretty successful - we launched the feature 2 weeks early, got 94% positive user feedback, and the collaboration actually improved team morale. <span className="bg-yellow-400/30 text-yellow-200 px-1 rounded">Actually</span>, it became a model for how we ran other projects."
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-4 mt-4 pt-4 border-t border-white/10 text-xs text-white/50">
                                        <span>Duration: 1:45</span>
                                        <span>•</span>
                                        <span>Words: 127</span>
                                        <span>•</span>
                                        <span className="text-yellow-400">Filler words: 4</span>
                                    </div>
                                </div>

                                {/* AI Coach Feedback for This Answer */}
                                <div className="space-y-4">
                                    {/* Overall Score */}
                                    <div className="bg-gradient-to-r from-green-500/15 to-emerald-500/15 border border-green-400/30 rounded-2xl p-5">
                                        <div className="flex items-center justify-between mb-4">
                                            <h4 className="text-white font-semibold flex items-center gap-2">
                                                <span>🎯</span> AI Coach Assessment
                                            </h4>
                                            <div className="flex items-center gap-3">
                                                <div className="text-right">
                                                    <div className="text-xs text-white/50 uppercase">Overall Score</div>
                                                    <div className="text-2xl font-bold text-green-400">8.5/10</div>
                                                </div>
                                            </div>
                                        </div>
                                        <p className="text-white/80 text-sm leading-relaxed">
                                            <strong className="text-green-400">Strong STAR structure</strong> with clear situation, action, and result. You demonstrated leadership without authority effectively. Your answer shows strategic thinking and stakeholder management skills Google values highly for Senior PM roles.
                                        </p>
                                    </div>

                                    {/* Detailed Breakdown */}
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                        {/* Content Score */}
                                        <div className="bg-white/5 border border-white/10 rounded-xl p-4">
                                            <div className="flex items-center justify-between mb-2">
                                                <span className="text-xs text-white/50 uppercase">Content</span>
                                                <span className="text-xl font-bold text-green-400">9/10</span>
                                            </div>
                                            <div className="h-2 bg-white/10 rounded-full overflow-hidden mb-3">
                                                <div className="h-full bg-gradient-to-r from-green-500 to-emerald-400 rounded-full" style={{ width: '90%' }} />
                                            </div>
                                            <p className="text-xs text-white/70">Excellent use of specific metrics (94% feedback, 2 weeks early). Shows business impact.</p>
                                        </div>

                                        {/* Communication Score */}
                                        <div className="bg-white/5 border border-white/10 rounded-xl p-4">
                                            <div className="flex items-center justify-between mb-2">
                                                <span className="text-xs text-white/50 uppercase">Communication</span>
                                                <span className="text-xl font-bold text-yellow-400">7/10</span>
                                            </div>
                                            <div className="h-2 bg-white/10 rounded-full overflow-hidden mb-3">
                                                <div className="h-full bg-gradient-to-r from-yellow-500 to-orange-400 rounded-full" style={{ width: '70%' }} />
                                            </div>
                                            <p className="text-xs text-white/70">Clear structure, but 4 filler words hurt executive presence. Aim for &lt;2 at this level.</p>
                                        </div>

                                        {/* Delivery Score */}
                                        <div className="bg-white/5 border border-white/10 rounded-xl p-4">
                                            <div className="flex items-center justify-between mb-2">
                                                <span className="text-xs text-white/50 uppercase">Delivery</span>
                                                <span className="text-xl font-bold text-blue-400">8/10</span>
                                            </div>
                                            <div className="h-2 bg-white/10 rounded-full overflow-hidden mb-3">
                                                <div className="h-full bg-gradient-to-r from-blue-500 to-cyan-400 rounded-full" style={{ width: '80%' }} />
                                            </div>
                                            <p className="text-xs text-white/70">Good eye contact (82%), confident tone. Slightly fast pacing at 0:45-1:00.</p>
                                        </div>
                                    </div>

                                    {/* Strengths */}
                                    <div className="bg-green-500/10 border border-green-400/30 rounded-2xl p-5">
                                        <h5 className="text-green-300 font-semibold mb-3 flex items-center gap-2">
                                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                            </svg>
                                            What Worked Really Well
                                        </h5>
                                        <ul className="space-y-2">
                                            <li className="flex items-start gap-2 text-white/80 text-sm">
                                                <span className="text-green-400 mt-0.5">•</span>
                                                <div>
                                                    <strong>Quantified results:</strong> "94% positive feedback, 2 weeks early" - Specific metrics show impact and credibility.
                                                </div>
                                            </li>
                                            <li className="flex items-start gap-2 text-white/80 text-sm">
                                                <span className="text-green-400 mt-0.5">•</span>
                                                <div>
                                                    <strong>Stakeholder empathy:</strong> You identified each team's concerns before proposing solutions - shows strategic PM thinking.
                                                </div>
                                            </li>
                                            <li className="flex items-start gap-2 text-white/80 text-sm">
                                                <span className="text-green-400 mt-0.5">•</span>
                                                <div>
                                                    <strong>Broader impact:</strong> Mentioned "became a model for other projects" - demonstrates lasting organizational value.
                                                </div>
                                            </li>
                                        </ul>
                                    </div>

                                    {/* Areas to Improve */}
                                    <div className="bg-yellow-500/10 border border-yellow-400/30 rounded-2xl p-5">
                                        <h5 className="text-yellow-300 font-semibold mb-3 flex items-center gap-2">
                                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                                            </svg>
                                            How to Make This Even Stronger
                                        </h5>
                                        <div className="space-y-4">
                                            <div className="border-l-2 border-yellow-400/50 pl-4">
                                                <div className="flex items-start gap-2 mb-2">
                                                    <span className="text-xs bg-yellow-500/20 text-yellow-300 px-2 py-0.5 rounded-full uppercase font-semibold">High Priority</span>
                                                </div>
                                                <p className="text-white/80 text-sm mb-2">
                                                    <strong>Eliminate filler words</strong> - You used "um," "like," "you know," and "actually." For leadership roles at Google, aim for zero filler words. Shows polish and executive presence.
                                                </p>
                                                <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3 mt-2">
                                                    <div className="text-xs text-blue-300 uppercase font-semibold mb-1">Better Version:</div>
                                                    <p className="text-white/80 text-sm italic">
                                                        "At my last company, we had a cross-functional project..." <span className="text-green-400">[pause]</span> "...where I needed buy-in from engineering, design, and marketing. None reported to me."
                                                    </p>
                                                </div>
                                            </div>

                                            <div className="border-l-2 border-blue-400/50 pl-4">
                                                <div className="flex items-start gap-2 mb-2">
                                                    <span className="text-xs bg-blue-500/20 text-blue-300 px-2 py-0.5 rounded-full uppercase font-semibold">Medium Priority</span>
                                                </div>
                                                <p className="text-white/80 text-sm mb-2">
                                                    <strong>Add the "Task" component</strong> - You jumped from situation to action. Clarify what the goal/challenge was: "My task was to align three teams with competing priorities around a shared product vision within a 6-week timeline."
                                                </p>
                                            </div>

                                            <div className="border-l-2 border-green-400/50 pl-4">
                                                <div className="flex items-start gap-2 mb-2">
                                                    <span className="text-xs bg-green-500/20 text-green-300 px-2 py-0.5 rounded-full uppercase font-semibold">Polish</span>
                                                </div>
                                                <p className="text-white/80 text-sm">
                                                    <strong>Slow down at 0:45-1:00</strong> - You rushed through the stakeholder analysis section. That's the most important part showing your PM skills. Pause after each team's concern for emphasis.
                                                </p>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Framework Analysis */}
                                    <div className="bg-purple-500/10 border border-purple-400/30 rounded-2xl p-5">
                                        <h5 className="text-purple-300 font-semibold mb-3 flex items-center gap-2">
                                            <span>📚</span> STAR Framework Analysis
                                        </h5>
                                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                            <div className="bg-white/5 rounded-lg p-3 text-center">
                                                <div className="text-xs text-white/50 uppercase mb-1">Situation</div>
                                                <div className="text-2xl font-bold text-green-400 mb-1">✓</div>
                                                <div className="text-[10px] text-white/60">Clear context</div>
                                            </div>
                                            <div className="bg-white/5 rounded-lg p-3 text-center">
                                                <div className="text-xs text-white/50 uppercase mb-1">Task</div>
                                                <div className="text-2xl font-bold text-yellow-400 mb-1">△</div>
                                                <div className="text-[10px] text-white/60">Could be clearer</div>
                                            </div>
                                            <div className="bg-white/5 rounded-lg p-3 text-center">
                                                <div className="text-xs text-white/50 uppercase mb-1">Action</div>
                                                <div className="text-2xl font-bold text-green-400 mb-1">✓✓</div>
                                                <div className="text-[10px] text-white/60">Excellent detail</div>
                                            </div>
                                            <div className="bg-white/5 rounded-lg p-3 text-center">
                                                <div className="text-xs text-white/50 uppercase mb-1">Result</div>
                                                <div className="text-2xl font-bold text-green-400 mb-1">✓✓</div>
                                                <div className="text-[10px] text-white/60">Quantified well</div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Next Steps */}
                                    <div className="bg-gradient-to-r from-indigo-500/15 to-purple-500/15 border border-indigo-400/30 rounded-2xl p-5">
                                        <h5 className="text-white font-semibold mb-3 flex items-center gap-2">
                                            <span>🎯</span> Practice This Next
                                        </h5>
                                        <ol className="space-y-2">
                                            <li className="flex items-start gap-3 text-white/80 text-sm">
                                                <span className="text-indigo-400 font-bold">1.</span>
                                                <span>Re-record this answer with the "Task" clarification and zero filler words</span>
                                            </li>
                                            <li className="flex items-start gap-3 text-white/80 text-sm">
                                                <span className="text-indigo-400 font-bold">2.</span>
                                                <span>Practice pausing instead of using "um" - silence shows confidence at senior levels</span>
                                            </li>
                                            <li className="flex items-start gap-3 text-white/80 text-sm">
                                                <span className="text-indigo-400 font-bold">3.</span>
                                                <span>Prepare 2 more "influence without authority" examples - Google loves to probe deeper</span>
                                            </li>
                                        </ol>
                                    </div>
                                </div>
                            </div>

                            {/* Demo Footer */}
                            <div className="text-center pt-8 border-t border-white/10">
                                <p className="text-white/40 text-sm mb-3">This demo showcases Pitcht's complete capability set</p>
                                <div className="flex items-center justify-center gap-6 text-xs text-white/30 mb-4">
                                    <span>✓ Context-Aware AI</span>
                                    <span>✓ Video & Speech Analysis</span>
                                    <span>✓ Framework Coaching</span>
                                    <span>✓ Real-Time Progress</span>
                                </div>
                                <div className="inline-flex items-center gap-2 bg-white/5 border border-white/10 rounded-full px-4 py-2 text-xs text-white/60">
                                    <svg className="w-4 h-4 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                                    </svg>
                                    <span>Your data is private and never shared</span>
                                </div>
                            </div>
                                </div>
                            )}
                        </div>
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
