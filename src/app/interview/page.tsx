'use client';

import { apiFetch } from '@/utils/api';
import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Prompter from '@/components/Prompter';
import Controls from '@/components/Controls';
import ContextModal from '@/components/ContextModal';
import { useInterview } from '@/context/InterviewContext';
import { useAuth } from '@/context/AuthContext';
import { useCameraStatus } from '@/context/CameraContext';
import { supabase } from '@/services/supabase';
import { analyzeVideoPath } from '@/services/emotionAnalyzer';
import { calculatePresenceScore } from '@/services/videoAnalyzer';
import { analyzeSpeech, SpeechMetrics } from '@/services/speechAnalyzer';
import { completeSession } from '@/services/sessionManager';
import { toast } from 'sonner';
import * as Sentry from '@sentry/nextjs';

export default function InterviewPage() {
    const router = useRouter();
    const { addRecording, updateRecording, sessionType, sessionContext, questions, sessionId, recordings } = useInterview();
    const { user, loading: authLoading } = useAuth();
    const { cameraStatus } = useCameraStatus();

    const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
    const [isRecording, setIsRecording] = useState(false);
    const [mounted, setMounted] = useState(false);
    const [isContextModalOpen, setIsContextModalOpen] = useState(false);
    const [interviewContext, setInterviewContext] = useState('');
    const [isTranscribing, setIsTranscribing] = useState(false);
    const [recordingDuration, setRecordingDuration] = useState(0);
    const [sessionElapsed, setSessionElapsed] = useState(0); // Total session time in seconds
    const [countdown, setCountdown] = useState<number | null>(null); // Countdown before recording starts
    const [showExitDialog, setShowExitDialog] = useState(false);
    const [pendingExitPath, setPendingExitPath] = useState<string | null>(null);

    // Mirror recordings.length into a ref so it's readable synchronously
    // inside the sendBeacon callback (which fires during page unload).
    const recordingsCountRef = useRef(0);
    useEffect(() => {
        recordingsCountRef.current = recordings.length;
    }, [recordings]);

    // Track in-flight transcription → DB-update pipelines so we can:
    //   1. Warn the user with a beforeunload prompt if they try to close
    //      the tab while answers are still being saved.
    //   2. Await drainage on the FINAL question before navigating to
    //      /analysis, so the analysis page sees fully-hydrated rows.
    //
    // Counter is for the unload guard (synchronous read).
    // Promise array is for the navigation drain (async wait).
    const pendingTranscriptionsRef = useRef(0);
    const pendingDbUpdatesRef = useRef<Promise<void>[]>([]);

    // Keep the Supabase access token available synchronously for the sendBeacon
    // callback — beacon fires during page unload where we cannot await async calls.
    const accessTokenRef = useRef<string | null>(null);

    useEffect(() => {
        // Populate on mount then stay current via onAuthStateChange.
        supabase.auth.getSession().then(({ data: { session } }) => {
            accessTokenRef.current = session?.access_token ?? null;
        });
        const { data: { subscription: tokenSub } } = supabase.auth.onAuthStateChange(
            (_event, session) => { accessTokenRef.current = session?.access_token ?? null; }
        );
        return () => tokenSub.unsubscribe();
    }, []);

    useEffect(() => {
        setMounted(true);
        // Wait for auth to resolve before checking
        if (authLoading) return;
        // Auth guard: must be logged in to access the interview
        if (!user) {
            router.push('/');
            return;
        }
        if (!sessionType || questions.length === 0) {
            // Redirect if no session started or no questions generated
            router.push('/');
        }
    }, [authLoading, user, sessionType, questions, router]);

    // Session elapsed timer — tracks total time on the interview page
    useEffect(() => {
        const sessionTimer = setInterval(() => {
            setSessionElapsed(prev => prev + 1);
        }, 1000);
        return () => clearInterval(sessionTimer);
    }, []);

    // beforeunload guard: warn the user if they try to close the tab while
    // any transcription → DB update is still in-flight. Prevents the
    // exact silent-data-loss pattern Fabiana hit (clicked through fast,
    // closed tab before transcripts were saved → analysis page empty).
    useEffect(() => {
        const handler = (e: BeforeUnloadEvent) => {
            if (pendingTranscriptionsRef.current > 0) {
                e.preventDefault();
                // returnValue is the legacy way to trigger the prompt;
                // some browsers ignore custom strings and show a generic
                // "Leave site?" dialog regardless.
                e.returnValue = '';
                return '';
            }
        };
        window.addEventListener('beforeunload', handler);
        return () => window.removeEventListener('beforeunload', handler);
    }, []);

    // Mark session as completed when user closes/leaves the tab mid-session
    useEffect(() => {
        if (!sessionId) return;

        const sendCompletionBeacon = () => {
            if (!sessionId) return;
            // Guard: only mark as completed if the user actually recorded at least one answer.
            // If they never granted camera permission or skipped everything, the session
            // stays in_progress and does NOT consume their free trial.
            if (recordingsCountRef.current === 0) return;
            // Use sendBeacon for reliable delivery during page unload.
            // sendBeacon cannot set headers, so auth token is passed in the body.
            // accessTokenRef is kept current by the onAuthStateChange effect above.
            const payload = JSON.stringify({ sessionId, token: accessTokenRef.current });
            navigator.sendBeacon('/api/complete-session', new Blob([payload], { type: 'application/json' }));
        };

        // visibilitychange is more reliable than beforeunload on mobile/modern browsers
        const handleVisibilityChange = () => {
            if (document.visibilityState === 'hidden') {
                sendCompletionBeacon();
            }
        };

        const handleBeforeUnload = (e: BeforeUnloadEvent) => {
            if (recordingsCountRef.current === 0) {
                // Nudge the user with the browser's native "Leave site?" dialog.
                // Modern browsers show a generic message regardless of returnValue text.
                e.preventDefault();
                e.returnValue = ''; // Required for Chrome/Edge to show the dialog
            } else {
                sendCompletionBeacon();
            }
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);
        window.addEventListener('beforeunload', handleBeforeUnload);

        return () => {
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            window.removeEventListener('beforeunload', handleBeforeUnload);
        };
    }, [sessionId]);

    // ── Browser back-button interception ────────────────────────────────────
    // Push a sentinel history entry on mount so the first browser-back press
    // fires a popstate event rather than immediately leaving the page.
    // Without this, popstate never fires on the first back-press in a Next.js SPA.
    useEffect(() => {
        window.history.pushState({ pitcht_interview: true }, '');

        const handlePopState = () => {
            if (recordingsCountRef.current === 0) {
                // Re-push the sentinel to keep the user here, then show dialog.
                window.history.pushState({ pitcht_interview: true }, '');
                setShowExitDialog(true);
                setPendingExitPath('/');
            } else {
                // Has recordings — let them go; navigate home cleanly via SPA routing.
                router.push('/');
            }
        };

        window.addEventListener('popstate', handlePopState);
        return () => window.removeEventListener('popstate', handlePopState);
    // router from useRouter() is stable; recordingsCountRef is a ref — safe with []
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Recording timer effect
    useEffect(() => {
        let interval: NodeJS.Timeout | undefined;
        if (isRecording) {
            interval = setInterval(() => {
                setRecordingDuration(prev => prev + 1);
            }, 1000);
        } else {
            setRecordingDuration(0);
        }
        return () => {
            if (interval) clearInterval(interval);
        };
    }, [isRecording]);

    const currentQuestion = questions[currentQuestionIndex];

    // Helper function with retry logic and exponential backoff
    const withRetry = async <T,>(
        operation: () => Promise<T>,
        options: {
            maxAttempts?: number;
            initialDelayMs?: number;
            maxDelayMs?: number;
            onRetry?: (attempt: number, error: Error) => void;
        } = {}
    ): Promise<T> => {
        const {
            maxAttempts = 3,
            initialDelayMs = 2000,
            maxDelayMs = 10000,
            onRetry = () => {},
        } = options;

        let lastError: Error;

        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            try {
                return await operation();
            } catch (error) {
                lastError = error as Error;

                if (attempt < maxAttempts) {
                    // Exponential backoff: 2s, 4s, 8s
                    const delayMs = Math.min(
                        initialDelayMs * Math.pow(2, attempt - 1),
                        maxDelayMs
                    );

                    onRetry(attempt, lastError);

                    await new Promise(resolve => setTimeout(resolve, delayMs));
                }
            }
        }

        throw lastError!;
    };

    // Helper function to transcribe audio
    const transcribeRecording = async (audioBlob: Blob): Promise<{ transcript: string; duration?: number }> => {
        try {
            setIsTranscribing(true);

            // Validate file size (Whisper limit: 25MB)
            const fileSizeMB = audioBlob.size / (1024 * 1024);

            if (fileSizeMB > 25) {
                console.error(`❌ Audio file too large: ${fileSizeMB.toFixed(2)}MB (Whisper limit: 25MB)`);
                throw new Error(`Audio file too large (${fileSizeMB.toFixed(2)}MB). Maximum: 25MB. Please record shorter answers.`);
            }

            // Wrap API call with retry logic
            const result = await withRetry(
                async () => {
                    // Create FormData with the audio-only file
                    const formData = new FormData();
                    const audioFile = new File([audioBlob], 'audio.webm', { type: 'audio/webm' });
                    formData.append('audio', audioFile);

                    // Optional: Add context as prompt for better accuracy
                    if (currentQuestion) {
                        formData.append('prompt', currentQuestion.text);
                    }

                    // Call transcribe API
                    const response = await apiFetch('/api/transcribe', {
                        method: 'POST',
                        body: formData,
                    });

                    if (!response.ok) {
                        const errorData = await response.json();
                        throw new Error(errorData.error || 'Transcription failed');
                    }

                    return await response.json();
                },
                {
                    maxAttempts: 3,
                    initialDelayMs: 2000,
                    onRetry: (attempt, error) => {
                        toast.info(`Retrying transcription... (Attempt ${attempt}/3)`, {
                            description: error.message,
                            duration: 2000,
                        });
                    },
                }
            );

            return {
                transcript: result.transcript,
                duration: result.duration,
            };
        } catch (error) {
            console.error('Error transcribing audio after retries:', error);

            // Show user-friendly error notification
            const errorMessage = error instanceof Error
                ? error.message
                : 'Failed to transcribe audio. Please try again.';

            toast.error('Transcription Failed', {
                description: `All retry attempts exhausted. ${errorMessage}`,
                duration: 7000,
            });

            return { transcript: '', duration: undefined };
        }
        // Note: Don't set isTranscribing(false) here - it's handled in the background promise handler
        // after the database update completes (line 405) or fails (line 448)
    };

    // Helper function to generate AI feedback
    const generateAIFeedback = async (
        recordingId: string,
        questionText: string,
        transcript: string,
        duration: number,
        speechMetrics: SpeechMetrics,
        videoMetrics?: {
            eyeContactPercentage?: number;
            gazeStability?: number;
            dominantEmotion?: string;
            emotionConfidence?: number;
            presenceScore?: number;
        }
    ): Promise<void> => {
        try {
            // Get auth token for the API call
            const { supabase: supabaseClient } = await import('@/services/supabase');
            const { data: { session } } = await supabaseClient.auth.getSession();

            // Call feedback API
            const response = await apiFetch('/api/generate-feedback', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(session?.access_token ? { 'Authorization': `Bearer ${session.access_token}` } : {}),
                },
                body: JSON.stringify({
                    sessionType: sessionType,
                    questionText: questionText,
                    transcript: transcript,
                    context: interviewContext || sessionContext || '',
                    duration: duration,
                    wordsPerMinute: speechMetrics.wordsPerMinute,
                    fillerWordCount: speechMetrics.fillerWordCount,
                    clarityScore: speechMetrics.clarityScore,
                    pacingScore: speechMetrics.pacingScore,
                    eyeContactPercentage: videoMetrics?.eyeContactPercentage,
                    dominantEmotion: videoMetrics?.dominantEmotion,
                    presenceScore: videoMetrics?.presenceScore,
                }),
            });

            if (!response.ok) {
                throw new Error('Failed to generate feedback');
            }

            const feedback = await response.json();

            // Save to analyses table
            const { supabase } = await import('@/services/supabase');
            const { error } = await supabase
                .from('analyses')
                .insert({
                    recording_id: recordingId,
                    overall_score: feedback.overallScore,
                    content_score: feedback.contentScore,
                    communication_score: feedback.communicationScore,
                    delivery_score: feedback.deliveryScore,
                    summary: feedback.summary,
                    communication_patterns: feedback.communicationPatterns,
                    strengths: feedback.strengths,
                    improvements: feedback.improvements,
                    next_steps: feedback.nextSteps,
                });

            if (error) {
                console.error('Failed to save feedback to database:', error);
                throw error;
            }

        } catch (error) {
            console.error('Error generating AI feedback:', error);
            toast.error('Feedback Generation Failed', {
                description: 'Could not generate AI coaching. You can retry from the analysis page.',
                duration: 5000,
            });
            // Don't throw - this is a non-critical enhancement
        }
    };

    const handleToggleRecording = async () => {
        if (isRecording) {
            // Stop Recording
            setIsRecording(false);
            setCountdown(null); // Clear countdown if any
            // @ts-expect-error -- window.stopRecording injected by VideoFeed component
            if (!window.stopRecording) return;

            // @ts-expect-error -- window.stopRecording injected by VideoFeed component
            const { blob, audioBlob, eyeTracking } = await window.stopRecording();

            // Bail early if we didn't actually capture anything (catches
            // fringe cases where MediaRecorder produced zero chunks — the
            // save path below will reject <100KB anyway).
            if (!blob || blob.size === 0) {
                console.warn('Empty video blob — skipping save');
                if (currentQuestionIndex < questions.length - 1) {
                    setCurrentQuestionIndex(prev => prev + 1);
                }
                return;
            }

            // Kick off transcription in parallel — audio blob is already
            // smaller than the video blob (~2MB/min vs ~12MB/min).
            const transcriptionPromise = transcribeRecording(audioBlob);

            // Optional Electron-only side effect: persist a local copy of
            // the video file for offline playback. This is additive — the
            // authoritative copy always goes to Supabase via addRecording.
            let localVideoPath = '';
            // @ts-expect-error -- window.electron injected by Electron preload script
            if (typeof window !== 'undefined' && window.electron?.saveVideo) {
                try {
                    const buffer = await blob.arrayBuffer();
                    // @ts-expect-error -- window.electron injected by Electron preload script
                    const result = await window.electron.saveVideo(buffer);
                    if (result?.success && result.filePath) {
                        localVideoPath = result.filePath;
                    }
                } catch (err) {
                    console.warn('Electron local save failed (non-fatal):', err);
                }
            }

            // Read emotion snapshot from the in-browser FaceTrackerService.
            // Works identically on web and Electron — no external service.
            let emotionData: Awaited<ReturnType<typeof analyzeVideoPath>> = null;
            try {
                emotionData = await analyzeVideoPath(localVideoPath);
            } catch (error) {
                console.error('Emotion read failed:', error);
            }

            // Combine eye-contact + emotion into a single presence score
            let presenceScore: number | undefined;
            if (eyeTracking && emotionData) {
                presenceScore = calculatePresenceScore(
                    eyeTracking.eyeContactPercentage,
                    emotionData.dominantEmotion,
                    emotionData.confidence
                );
            }

            // Persist to Supabase via InterviewContext.addRecording — this
            // uploads the video blob to Storage AND inserts the recordings
            // row. Transcript + speech metrics are filled in below once
            // the /api/transcribe call resolves.
            let savedRecordingId: string | undefined;
            if (currentQuestion) {
                const recording = await addRecording({
                    questionId: currentQuestion.id,
                    questionText: currentQuestion.text,
                    videoPath: localVideoPath,
                    timestamp: Date.now(),
                    transcript: undefined,
                    duration: undefined,
                    videoBlob: blob,
                    wordsPerMinute: undefined,
                    fillerWordCount: undefined,
                    clarityScore: undefined,
                    pacingScore: undefined,
                    eyeContactPercentage: eyeTracking?.eyeContactPercentage,
                    gazeStability: eyeTracking?.gazeStability,
                    dominantEmotion: emotionData?.dominantEmotion,
                    emotionConfidence: emotionData?.confidence,
                    presenceScore,
                });

                savedRecordingId = recording?.recordingId;

                // Background transcription → DB update → AI feedback pipeline.
                // Only runs if we have a DB row to update.
                if (savedRecordingId) {
                    // Capture in a const so TS narrows inside the async callback
                    const recordingIdForPipeline: string = savedRecordingId;
                    pendingTranscriptionsRef.current += 1;
                    const dbUpdatePromise: Promise<void> = transcriptionPromise.then(async ({ transcript, duration }) => {
                        if (!transcript || !duration) return;

                        const speechMetrics = analyzeSpeech(transcript, duration);
                        try {
                            const { supabase: sb } = await import('@/services/supabase');
                            const updateData = {
                                transcript: transcript || null,
                                duration: Math.round(duration),
                                words_per_minute: speechMetrics.wordsPerMinute !== undefined ? Math.max(0, Math.min(400, Math.round(speechMetrics.wordsPerMinute))) : null,
                                filler_word_count: speechMetrics.fillerWordCount !== undefined ? Math.max(0, Math.round(speechMetrics.fillerWordCount)) : null,
                                clarity_score: speechMetrics.clarityScore !== undefined ? Math.max(0, Math.min(100, Math.round(speechMetrics.clarityScore))) : null,
                                pacing_score: speechMetrics.pacingScore !== undefined ? Math.max(0, Math.min(100, Math.round(speechMetrics.pacingScore))) : null,
                            };

                            const { error } = await sb
                                .from('recordings')
                                .update(updateData)
                                .eq('id', recordingIdForPipeline)
                                .select();

                            if (error) throw error;

                            setIsTranscribing(false);

                            updateRecording(recordingIdForPipeline, {
                                transcript,
                                duration,
                                ...speechMetrics,
                            });

                            generateAIFeedback(
                                recordingIdForPipeline,
                                currentQuestion.text,
                                transcript,
                                duration,
                                speechMetrics,
                                {
                                    eyeContactPercentage: eyeTracking?.eyeContactPercentage,
                                    gazeStability: eyeTracking?.gazeStability,
                                    dominantEmotion: emotionData?.dominantEmotion,
                                    emotionConfidence: emotionData?.confidence,
                                    presenceScore,
                                }
                            );
                        } catch (error) {
                            console.error('Error updating recording:', error);
                            Sentry.captureException(error, {
                                tags: { area: 'interview', subsystem: 'transcript-db-update' },
                                extra: { recordingId: recordingIdForPipeline, sessionId },
                            });
                            setIsTranscribing(false);
                            toast.error('Failed to save transcript', {
                                description: 'Your recording was saved but the transcript could not be stored. Try again from the analysis page.',
                                duration: 7000,
                            });
                        }
                    }).catch((error) => {
                        console.error('Background transcription failed:', error);
                        Sentry.captureException(error, {
                            tags: { area: 'interview', subsystem: 'transcription' },
                            extra: { recordingId: savedRecordingId, sessionId },
                        });
                        setIsTranscribing(false);
                        toast.error('Processing Failed', {
                            description: 'Your answer could not be processed. Data has been saved for retry.',
                            duration: 7000,
                        });
                    }).finally(() => {
                        // Decrement the in-flight counter regardless of outcome.
                        // Both the unload guard and the final-question drain rely
                        // on this hitting zero when the pipeline is fully done.
                        pendingTranscriptionsRef.current = Math.max(0, pendingTranscriptionsRef.current - 1);
                    });
                    pendingDbUpdatesRef.current.push(dbUpdatePromise);
                }
            }

            // Auto-advance or finish the session
            if (currentQuestionIndex < questions.length - 1) {
                setCurrentQuestionIndex(prev => prev + 1);
            } else {
                // Final question: drain any in-flight transcription → DB
                // update pipelines before navigating, so /analysis sees
                // fully-hydrated rows. Bounded by a 30s timeout so we
                // never trap the user on this page if Whisper is slow.
                const pending = [...pendingDbUpdatesRef.current];
                if (pending.length > 0 && pendingTranscriptionsRef.current > 0) {
                    toast.info('Saving your answers…', {
                        description: 'Finishing up the last few transcripts before showing your analysis.',
                        duration: 4000,
                    });
                    await Promise.race([
                        Promise.allSettled(pending),
                        new Promise<void>((resolve) => setTimeout(resolve, 30000)),
                    ]);
                }

                if (sessionId) {
                    try {
                        await completeSession(sessionId);
                    } catch (error) {
                        console.error('Failed to complete session:', error);
                        Sentry.captureException(error, {
                            tags: { area: 'interview', subsystem: 'complete-session' },
                            extra: { sessionId },
                        });
                    }
                }
                // Pass sessionId so /analysis can hydrate from the DB
                // instead of relying on volatile React context.
                const target = sessionId ? `/analysis?sessionId=${sessionId}` : '/analysis';
                router.push(target);
            }
        } else {
            // Start Countdown (3, 2, 1)
            setCountdown(3);

            // Countdown timer
            const countdownInterval = setInterval(() => {
                setCountdown(prev => {
                    if (prev === null || prev <= 1) {
                        clearInterval(countdownInterval);

                        // Start actual recording after countdown
                        setIsRecording(true);
                        setCountdown(null);

                        // @ts-expect-error -- window.startRecording injected by VideoFeed component
                        if (window.startRecording) {
                            // @ts-expect-error -- window.startRecording injected by VideoFeed component
                            window.startRecording();
                        }

                        return null;
                    }
                    return prev - 1;
                });
            }, 1000); // 1 second intervals
        }
    };

    const handlePreviousQuestion = () => {
        // Go back to previous question if not on first question
        if (currentQuestionIndex > 0) {
            setCurrentQuestionIndex(prev => prev - 1);
        }
    };

    const handleNextQuestion = async () => {
        // No longer need to wait for transcription - it runs in background
        // User can move to next question immediately after recording stops

        // Skip current question
        if (currentQuestionIndex < questions.length - 1) {
            setCurrentQuestionIndex(prev => prev + 1);
        } else {
            // Guard: if the user reaches the end without recording anything, handle
            // based on whether they're in skip mode or just haven't recorded yet.
            if (recordings.length === 0) {
                if (cameraStatus === 'skipped') {
                    // User intentionally browsed in read-only mode — go home quietly.
                    router.push('/');
                } else {
                    // Show confirmation dialog (session won't be consumed).
                    setShowExitDialog(true);
                    setPendingExitPath('/');
                }
                return;
            }
            // Mark session as completed before navigating
            if (sessionId) {
                try {
                    await completeSession(sessionId);
                } catch (error) {
                    console.error('Failed to complete session:', error);
                    Sentry.captureException(error, {
                        tags: { area: 'interview', subsystem: 'complete-session', path: 'skip-to-end' },
                        extra: { sessionId },
                    });
                    // Don't block navigation on error
                }
            }
            const target = sessionId ? `/analysis?sessionId=${sessionId}` : '/analysis';
            router.push(target);
        }
    };

    const handleBack = () => {
        // In skip mode the user intentionally chose not to record — go home silently.
        // Otherwise show the "no recordings" confirmation if they haven't recorded yet.
        if (recordings.length === 0 && cameraStatus !== 'skipped') {
            setShowExitDialog(true);
            setPendingExitPath('/');
        } else {
            router.push('/');
        }
    };

    if (!mounted || !sessionType || !currentQuestion) return null;

    return (
        <main className="relative w-full h-full min-h-screen overflow-hidden">
            {/* Countdown Overlay */}
            {countdown !== null && (
                <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
                    <div className="text-center">
                        <div className="text-9xl font-bold text-white animate-pulse">
                            {countdown}
                        </div>
                        <p className="text-xl text-white/80 mt-4">Get ready...</p>
                    </div>
                </div>
            )}

            {/* Skip-mode banner — camera permissions were skipped */}
            {cameraStatus === 'skipped' && (
                <div className="absolute top-0 left-0 right-0 z-40 flex items-center justify-center gap-2.5 px-6 py-2.5 bg-blue-500/20 border-b border-blue-500/30 backdrop-blur-md pointer-events-none">
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-blue-300 flex-shrink-0">
                        <circle cx="12" cy="12" r="10" />
                        <line x1="12" y1="8" x2="12" y2="12" />
                        <line x1="12" y1="16" x2="12.01" y2="16" />
                    </svg>
                    <span className="text-blue-100 text-xs font-semibold tracking-wide">
                        Enable your camera to record answers and get AI feedback
                    </span>
                </div>
            )}

            {/* Session Timeout Warning — shown at 25 min, urgent at 30 min */}
            {sessionElapsed >= 1500 && (
                <div className={`absolute top-0 left-0 right-0 z-40 flex items-center justify-center gap-3 px-6 py-2.5 pointer-events-none ${
                    sessionElapsed >= 1800
                        ? 'bg-red-600/40 border-b border-red-500/50'
                        : 'bg-amber-500/30 border-b border-amber-500/40'
                }`}>
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={sessionElapsed >= 1800 ? 'text-red-300' : 'text-amber-300'}>
                        <circle cx="12" cy="12" r="10"></circle>
                        <polyline points="12 6 12 12 16 14"></polyline>
                    </svg>
                    <span className={`text-xs font-semibold tracking-wide ${sessionElapsed >= 1800 ? 'text-red-100' : 'text-amber-100'}`}>
                        {sessionElapsed >= 1800
                            ? 'Session is 30+ minutes — consider wrapping up to avoid upload issues'
                            : 'Session approaching 30 minutes — plan to finish up soon'}
                    </span>
                </div>
            )}

            {/* Navigation & Tools */}
            <div className="absolute top-6 left-6 right-6 z-30 flex justify-between items-start pointer-events-none">
                {/* Left side: Back Button + Recording Timer + Transcribing Indicator */}
                <div className="pointer-events-auto flex items-center gap-3">
                    <button
                        onClick={handleBack}
                        className="flex items-center justify-center w-10 h-10 rounded-full bg-white/10 backdrop-blur-xl border border-white/20 text-white hover:bg-white/20 transition-all"
                        aria-label="Go back"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="15 18 9 12 15 6"></polyline>
                        </svg>
                    </button>

                    {/* Recording Timer */}
                    {isRecording && (
                        <div className="flex items-center gap-2 bg-red-500/20 px-3 py-1.5 rounded-full border border-red-500/30 backdrop-blur-md">
                            <div className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse" />
                            <span className="text-red-100 text-[10px] font-mono font-semibold tracking-wide">
                                {Math.floor(recordingDuration / 60)}:{(recordingDuration % 60).toString().padStart(2, '0')}
                            </span>
                        </div>
                    )}

                    {/* Video Size Warning — 4.5 min soft warning */}
                    {isRecording && recordingDuration >= 270 && recordingDuration < 330 && (
                        <div className="flex items-center gap-2 bg-yellow-500/20 px-3 py-1.5 rounded-full border border-yellow-500/30 backdrop-blur-md">
                            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-yellow-300">
                                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
                                <line x1="12" y1="9" x2="12" y2="13"></line>
                                <line x1="12" y1="17" x2="12.01" y2="17"></line>
                            </svg>
                            <span className="text-yellow-100 text-[10px] font-mono font-semibold tracking-wide">
                                Wrap up soon
                            </span>
                        </div>
                    )}

                    {/* Video Size Warning — 5.5 min hard limit approaching */}
                    {isRecording && recordingDuration >= 330 && (
                        <div className="flex items-center gap-2 bg-red-600/30 px-3 py-1.5 rounded-full border border-red-500/50 backdrop-blur-md animate-pulse">
                            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-red-300">
                                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
                                <line x1="12" y1="9" x2="12" y2="13"></line>
                                <line x1="12" y1="17" x2="12.01" y2="17"></line>
                            </svg>
                            <span className="text-red-200 text-[10px] font-mono font-semibold tracking-wide">
                                Stop now — max length
                            </span>
                        </div>
                    )}

                    {/* Transcription Status Indicator */}
                    {isTranscribing && (
                        <div className="flex items-center gap-2 bg-blue-500/20 px-3 py-1.5 rounded-full border border-blue-500/30 backdrop-blur-md">
                            <div className="w-3 h-3 border-2 border-blue-300/30 border-t-blue-300 rounded-full animate-spin"></div>
                            <span className="text-blue-100 text-[10px] font-mono font-semibold tracking-wide">
                                Transcribing...
                            </span>
                        </div>
                    )}

                </div>

                {/* Question Counter */}
                <div className="pointer-events-auto bg-white/10 backdrop-blur-xl border border-white/20 shadow-xl rounded-full px-4 py-2">
                    <span className="text-white/80 font-medium text-sm">
                        Question {currentQuestionIndex + 1} / {questions.length}
                    </span>
                </div>

                {/* Filters / Context Button */}
                <button
                    onClick={() => setIsContextModalOpen(true)}
                    className="pointer-events-auto flex items-center justify-center w-10 h-10 rounded-full bg-white/10 backdrop-blur-xl border border-white/20 text-white hover:bg-white/20 transition-all"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="4" y1="21" x2="4" y2="14"></line>
                        <line x1="4" y1="10" x2="4" y2="3"></line>
                        <line x1="12" y1="21" x2="12" y2="12"></line>
                        <line x1="12" y1="8" x2="12" y2="3"></line>
                        <line x1="20" y1="21" x2="20" y2="16"></line>
                        <line x1="20" y1="12" x2="20" y2="3"></line>
                        <line x1="1" y1="14" x2="7" y2="14"></line>
                        <line x1="9" y1="8" x2="15" y2="8"></line>
                        <line x1="17" y1="16" x2="23" y2="16"></line>
                    </svg>
                </button>
            </div>

            <Prompter
                question={currentQuestion.text}
                isRecording={isRecording}
                recordingDuration={recordingDuration}
            />

            <Controls
                isRecording={isRecording}
                onToggleRecording={handleToggleRecording}
                onPreviousQuestion={handlePreviousQuestion}
                onNextQuestion={handleNextQuestion}
                currentQuestionIndex={currentQuestionIndex}
                recordingDuration={recordingDuration}
                isTranscribing={false} // Always false now - transcription runs in background
                recordingDisabled={cameraStatus === 'skipped'}
            />

            <ContextModal
                isOpen={isContextModalOpen}
                onClose={() => setIsContextModalOpen(false)}
                onSave={setInterviewContext}
                initialContext={interviewContext}
            />

            {/* Exit Without Recording Dialog */}
            {showExitDialog && (
                <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
                    <div className="relative w-full max-w-md mx-4 bg-white/10 backdrop-blur-xl border border-white/20 shadow-2xl rounded-3xl p-8 animate-in fade-in zoom-in duration-200">
                        {/* Icon */}
                        <div className="flex items-center justify-center w-14 h-14 rounded-full bg-amber-400/20 border border-amber-400/30 mx-auto mb-5">
                            <svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-amber-300">
                                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
                                <line x1="12" y1="9" x2="12" y2="13"></line>
                                <line x1="12" y1="17" x2="12.01" y2="17"></line>
                            </svg>
                        </div>

                        {/* Title */}
                        <h2 className="text-xl font-bold text-white text-center mb-2">
                            Leave without recording?
                        </h2>

                        {/* Body */}
                        <p className="text-white/70 text-sm text-center leading-relaxed mb-7">
                            You haven&apos;t recorded any answers yet. Record at least one answer to get AI feedback on your interview skills.
                        </p>

                        {/* Actions */}
                        <div className="flex flex-col gap-3">
                            <button
                                onClick={() => setShowExitDialog(false)}
                                className="w-full py-3 rounded-2xl text-sm font-bold text-black bg-white hover:bg-white/90 transition-colors shadow-lg"
                            >
                                Go Back &amp; Record
                            </button>
                            <button
                                onClick={() => {
                                    setShowExitDialog(false);
                                    if (pendingExitPath) router.push(pendingExitPath);
                                }}
                                className="w-full py-3 rounded-2xl text-sm font-semibold text-white/70 hover:text-white hover:bg-white/10 transition-colors"
                            >
                                Leave Anyway
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </main>
    );
}
