'use client';

import { apiFetch } from '@/utils/api';
import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useInterview, Recording } from '@/context/InterviewContext';
import { useAuth } from '@/context/AuthContext';
import AccountConversionModal from '@/components/AccountConversionModal';
import TranscriptViewer from '@/components/TranscriptViewer';
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
                        console.log('✅ Loaded existing feedback from database');
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
                                contentScore: data.contentScore,
                                communicationScore: data.communicationScore,
                                deliveryScore: data.deliveryScore,
                                summary: data.summary,
                                communicationPatterns: data.communicationPatterns,
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
