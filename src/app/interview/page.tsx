'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Prompter from '@/components/Prompter';
import Controls from '@/components/Controls';
import ContextModal from '@/components/ContextModal';
import { useInterview } from '@/context/InterviewContext';
import { checkEmotionService, analyzeVideoPath } from '@/services/emotionAnalyzer';
import { calculatePresenceScore } from '@/services/videoAnalyzer';
import { analyzeSpeech } from '@/services/speechAnalyzer';
import type { EyeTrackingMetrics } from '@/services/faceTracker';

export default function InterviewPage() {
    const router = useRouter();
    const { addRecording, sessionType, questions } = useInterview();

    const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
    const [isRecording, setIsRecording] = useState(false);
    const [mounted, setMounted] = useState(false);
    const [isContextModalOpen, setIsContextModalOpen] = useState(false);
    const [interviewContext, setInterviewContext] = useState('');
    const [isTranscribing, setIsTranscribing] = useState(false);
    const [isAnalyzingEmotion, setIsAnalyzingEmotion] = useState(false);
    const [recordingDuration, setRecordingDuration] = useState(0);
    const [countdown, setCountdown] = useState<number | null>(null); // Countdown before recording starts

    useEffect(() => {
        setMounted(true);
        if (!sessionType || questions.length === 0) {
            // Redirect if no session started or no questions generated
            router.push('/');
        }
    }, [sessionType, questions, router]);

    // Recording timer effect
    useEffect(() => {
        let interval: NodeJS.Timeout;
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

    // Helper function with timeout wrapper
    const withTimeout = <T,>(promise: Promise<T>, timeoutMs: number, errorMessage: string): Promise<T> => {
        return Promise.race([
            promise,
            new Promise<T>((_, reject) =>
                setTimeout(() => reject(new Error(errorMessage)), timeoutMs)
            )
        ]);
    };

    // Helper function to transcribe audio
    const transcribeRecording = async (audioBlob: Blob): Promise<{ transcript: string; duration?: number }> => {
        try {
            setIsTranscribing(true);

            // Validate file size (Whisper limit: 25MB)
            const fileSizeMB = audioBlob.size / (1024 * 1024);
            console.log(`📊 Audio file size: ${fileSizeMB.toFixed(2)}MB`);

            if (fileSizeMB > 25) {
                console.error(`❌ Audio file too large: ${fileSizeMB.toFixed(2)}MB (Whisper limit: 25MB)`);
                throw new Error(`Audio file too large (${fileSizeMB.toFixed(2)}MB). Maximum: 25MB. Please record shorter answers.`);
            }

            // Create FormData with the audio-only file
            const formData = new FormData();
            const audioFile = new File([audioBlob], 'audio.webm', { type: 'audio/webm' });
            formData.append('audio', audioFile);

            // Optional: Add context as prompt for better accuracy
            if (currentQuestion) {
                formData.append('prompt', currentQuestion.text);
            }

            // Call transcribe API
            const response = await fetch('/api/transcribe', {
                method: 'POST',
                body: formData,
            });

            if (!response.ok) {
                throw new Error('Failed to transcribe audio');
            }

            const data = await response.json();
            return {
                transcript: data.transcript,
                duration: data.duration,
            };
        } catch (error) {
            console.error('Error transcribing audio:', error);
            return { transcript: '', duration: undefined };
        } finally {
            setIsTranscribing(false);
        }
    };

    const handleToggleRecording = async () => {
        if (isRecording) {
            // Stop Recording
            setIsRecording(false);
            setCountdown(null); // Clear countdown if any
            // @ts-ignore
            if (window.stopRecording) {
                // @ts-ignore
                const { blob, audioBlob, eyeTracking } = await window.stopRecording();
                const buffer = await blob.arrayBuffer();

                // Transcribe audio-only blob (much smaller - ~2MB/min vs ~12MB/min for video)
                const transcriptionPromise = transcribeRecording(audioBlob);

                // Save via Electron
                // @ts-ignore
                if (window.electron) {
                    // @ts-ignore
                    const result = await window.electron.saveVideo(buffer);
                    if (result.success) {
                        console.log('Video saved to:', result.filePath);
                        const videoPath = result.filePath;

                        // Save recording first WITHOUT transcript (immediate, non-blocking)
                        // Transcription will continue in background and update later
                        let savedRecordingId: string | undefined;

                        // Sprint 5A: Analyze emotions from saved video (with 10s timeout)
                        let emotionData = null;
                        const serviceHealthy = await checkEmotionService();

                        if (serviceHealthy && videoPath) {
                            try {
                                setIsAnalyzingEmotion(true);
                                // Add 10-second timeout to prevent hanging
                                emotionData = await withTimeout(
                                    analyzeVideoPath(videoPath),
                                    10000,
                                    'Emotion analysis timed out after 10 seconds'
                                );
                                console.log('Emotion analysis:', emotionData);
                            } catch (error) {
                                console.error('Emotion analysis failed:', error);
                                // Continue without emotion data (graceful degradation)
                            } finally {
                                setIsAnalyzingEmotion(false);
                            }
                        } else {
                            console.log('Emotion service not available, skipping emotion analysis');
                        }

                        // Calculate presence score if we have both metrics
                        let presenceScore = undefined;
                        if (eyeTracking && emotionData) {
                            presenceScore = calculatePresenceScore(
                                eyeTracking.eyeContactPercentage,
                                emotionData.dominantEmotion,
                                emotionData.confidence
                            );
                        }

                        // Add to context with ALL metrics (transcript will be added async)
                        if (currentQuestion) {
                            const recording = await addRecording({
                                questionId: currentQuestion.id,
                                questionText: currentQuestion.text,
                                videoPath: videoPath,
                                timestamp: Date.now(),
                                transcript: undefined, // Will be added asynchronously
                                duration: undefined, // Will be added asynchronously
                                videoBlob: blob, // Sprint 5B: Pass blob for Supabase upload
                                // Speech metrics will be added asynchronously
                                wordsPerMinute: undefined,
                                fillerWordCount: undefined,
                                clarityScore: undefined,
                                pacingScore: undefined,
                                // Sprint 4/5A: Video metrics (REAL data!)
                                eyeContactPercentage: eyeTracking?.eyeContactPercentage,
                                gazeStability: eyeTracking?.gazeStability,
                                dominantEmotion: emotionData?.dominantEmotion,
                                emotionConfidence: emotionData?.confidence,
                                presenceScore: presenceScore,
                            });

                            // Get the saved recording ID from context
                            // The recordingId is populated by InterviewContext after Supabase save
                            savedRecordingId = recording?.recordingId;

                            // Start background transcription (non-blocking)
                            if (savedRecordingId) {
                                setIsTranscribing(false); // Allow user to continue immediately
                                console.log(`🎙️ Starting background transcription for recording ${savedRecordingId}...`);

                                transcriptionPromise.then(async ({ transcript, duration }) => {
                                    if (transcript && duration) {
                                        // Calculate speech metrics
                                        const speechMetrics = analyzeSpeech(transcript, duration);

                                        // Update recording with transcript via API
                                        try {
                                            const response = await fetch('/api/update-recording', {
                                                method: 'PATCH',
                                                headers: { 'Content-Type': 'application/json' },
                                                body: JSON.stringify({
                                                    recordingId: savedRecordingId,
                                                    transcript,
                                                    duration,
                                                    speechMetrics,
                                                }),
                                            });

                                            if (response.ok) {
                                                console.log(`✅ Recording ${savedRecordingId} updated with transcript`);
                                            } else {
                                                console.error('Failed to update recording with transcript');
                                            }
                                        } catch (error) {
                                            console.error('Error updating recording:', error);
                                        }
                                    }
                                }).catch(error => {
                                    console.error('Background transcription failed:', error);
                                });
                            }
                        }

                        // Auto-advance or Finish
                        if (currentQuestionIndex < questions.length - 1) {
                            setCurrentQuestionIndex(prev => prev + 1);
                        } else {
                            router.push('/analysis');
                        }
                    }
                } else {
                    console.warn('Electron API not found');
                    // Fallback for browser dev
                    if (currentQuestionIndex < questions.length - 1) {
                        setCurrentQuestionIndex(prev => prev + 1);
                    } else {
                        router.push('/analysis');
                    }
                }
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

                        // @ts-ignore
                        if (window.startRecording) {
                            // @ts-ignore
                            window.startRecording();
                        }

                        return null;
                    }
                    return prev - 1;
                });
            }, 1000); // 1 second intervals
        }
    };

    const handleNextQuestion = () => {
        // No longer need to wait for transcription - it runs in background
        // User can move to next question immediately after recording stops

        // Skip current question
        if (currentQuestionIndex < questions.length - 1) {
            setCurrentQuestionIndex(prev => prev + 1);
        } else {
            router.push('/analysis');
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

            {/* Navigation & Tools */}
            <div className="absolute top-6 left-6 right-6 z-30 flex justify-between items-start pointer-events-none">
                {/* Left side: Back Button + Recording Timer + Transcribing Indicator */}
                <div className="pointer-events-auto flex items-center gap-3">
                    <Link
                        href="/"
                        className="flex items-center justify-center w-10 h-10 rounded-full bg-white/10 backdrop-blur-xl border border-white/20 text-white hover:bg-white/20 transition-all"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="15 18 9 12 15 6"></polyline>
                        </svg>
                    </Link>

                    {/* Recording Timer */}
                    {isRecording && (
                        <div className="flex items-center gap-2 bg-red-500/20 px-3 py-1.5 rounded-full border border-red-500/30 backdrop-blur-md">
                            <div className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse" />
                            <span className="text-red-100 text-[10px] font-mono font-semibold tracking-wide">
                                {Math.floor(recordingDuration / 60)}:{(recordingDuration % 60).toString().padStart(2, '0')}
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

                    {/* Emotion Analysis Status Indicator */}
                    {isAnalyzingEmotion && (
                        <div className="flex items-center gap-2 bg-purple-500/20 px-3 py-1.5 rounded-full border border-purple-500/30 backdrop-blur-md">
                            <div className="w-3 h-3 border-2 border-purple-300/30 border-t-purple-300 rounded-full animate-spin"></div>
                            <span className="text-purple-100 text-[10px] font-mono font-semibold tracking-wide">
                                Analyzing emotions...
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
                onNextQuestion={handleNextQuestion}
                recordingDuration={recordingDuration}
                isTranscribing={false} // Always false now - transcription runs in background
            />

            <ContextModal
                isOpen={isContextModalOpen}
                onClose={() => setIsContextModalOpen(false)}
                onSave={setInterviewContext}
                initialContext={interviewContext}
            />
        </main>
    );
}
