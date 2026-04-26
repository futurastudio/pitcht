'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { usePathname } from 'next/navigation';
import { FaceTracker } from '@/services/faceTracker';
import type { EyeTrackingMetrics } from '@/services/faceTracker';
import { useCameraStatus } from '@/context/CameraContext';

type Browser = 'chrome' | 'safari' | 'firefox' | 'other';

function detectBrowser(): Browser {
    if (typeof navigator === 'undefined') return 'other';
    const ua = navigator.userAgent;
    if (/Firefox\/[\d.]+/i.test(ua)) return 'firefox';
    // Safari reports "Version/x.x" and "Safari" but NOT "Chrome"
    if (/Version\/[\d.]+ .*Safari/i.test(ua) && !/Chrome/i.test(ua)) return 'safari';
    if (/Chrome\/[\d.]+/i.test(ua)) return 'chrome';
    return 'other';
}

// ─── Permission Recovery Card ────────────────────────────────────────────────

interface PermissionCardProps {
    browser: Browser;
    onRetry: () => void;
    onSkip: () => void;
    isRetrying: boolean;
}

function PermissionCard({ browser, onRetry, onSkip, isRetrying }: PermissionCardProps) {
    const instructions: Record<Browser, { steps: string[] }> = {
        chrome: {
            steps: [
                'Click the camera icon in your browser\'s address bar',
                'Select "Always allow" for both camera and microphone',
                'Click "Try Again" below — no refresh needed',
            ],
        },
        safari: {
            steps: [
                'Open Safari → Settings (⌘,) → Websites → Camera',
                'Find app.pitcht.us and set it to "Allow"',
                'Do the same under Websites → Microphone',
                'Return here and click "Try Again"',
            ],
        },
        firefox: {
            steps: [
                'Click the camera icon in the address bar',
                'Remove the blocked permission by clicking the × next to it',
                'Click "Try Again" — Firefox will prompt again',
            ],
        },
        other: {
            steps: [
                'Open your browser settings → Site permissions',
                'Find Camera and Microphone → allow this site',
                'Return here and click "Try Again"',
            ],
        },
    };

    const { steps } = instructions[browser];

    return (
        // Full-screen overlay — z-50 at root so it sits above the interview page UI
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 backdrop-blur-sm p-4">
            <div className="w-full max-w-md bg-white/10 backdrop-blur-xl border border-white/20 shadow-2xl rounded-3xl p-8 animate-in fade-in zoom-in duration-200">

                {/* Icon */}
                <div className="flex items-center justify-center w-16 h-16 rounded-full bg-red-500/20 border border-red-500/30 mx-auto mb-6">
                    <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="text-red-400">
                        {/* Camera body */}
                        <path d="M23 7l-7 5 7 5V7z" />
                        <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
                        {/* X slash across camera */}
                        <line x1="1" y1="1" x2="23" y2="23" strokeWidth="2" />
                    </svg>
                </div>

                {/* Heading */}
                <h2 className="text-xl font-bold text-white text-center mb-2">
                    Camera access required
                </h2>
                <p className="text-white/60 text-sm text-center mb-6 leading-relaxed">
                    Pitcht needs your camera and microphone to record your answers and generate AI feedback.
                </p>

                {/* Try Again */}
                <button
                    onClick={onRetry}
                    disabled={isRetrying}
                    className="w-full py-3 rounded-2xl text-sm font-bold text-black bg-white hover:bg-white/90 disabled:opacity-60 disabled:cursor-not-allowed transition-all shadow-lg mb-4 flex items-center justify-center gap-2"
                >
                    {isRetrying ? (
                        <>
                            <div className="w-4 h-4 border-2 border-black/20 border-t-black rounded-full animate-spin" />
                            Requesting access…
                        </>
                    ) : (
                        <>
                            {/* Refresh icon */}
                            <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="23 4 23 10 17 10" />
                                <polyline points="1 20 1 14 7 14" />
                                <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
                            </svg>
                            Try Again
                        </>
                    )}
                </button>

                {/* Browser-specific instructions */}
                <div className="bg-white/5 border border-white/10 rounded-2xl p-4 mb-4">
                    <p className="text-white/50 text-[11px] font-semibold uppercase tracking-wider mb-3">
                        {browser === 'chrome' && 'Chrome instructions'}
                        {browser === 'safari' && 'Safari instructions'}
                        {browser === 'firefox' && 'Firefox instructions'}
                        {browser === 'other' && 'How to allow access'}
                    </p>
                    <ol className="space-y-2">
                        {steps.map((step, i) => (
                            <li key={i} className="flex items-start gap-2.5">
                                <span className="flex-shrink-0 w-5 h-5 rounded-full bg-white/10 text-white/60 text-[11px] font-bold flex items-center justify-center mt-0.5">
                                    {i + 1}
                                </span>
                                <span className="text-white/70 text-sm leading-snug">{step}</span>
                            </li>
                        ))}
                    </ol>
                </div>

                {/* Skip link */}
                <button
                    onClick={onSkip}
                    className="w-full py-2.5 text-sm text-white/40 hover:text-white/70 transition-colors text-center"
                >
                    Skip recording for now →
                </button>
            </div>
        </div>
    );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function VideoFeed() {
    const videoRef = useRef<HTMLVideoElement>(null);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const audioRecorderRef = useRef<MediaRecorder | null>(null);
    const chunksRef = useRef<Blob[]>([]);
    const audioChunksRef = useRef<Blob[]>([]);
    // Track the live stream so we can stop it before each new getUserMedia call
    const streamRef = useRef<MediaStream | null>(null);

    const [tracker] = useState(() => FaceTracker.getInstance());
    const [isTrackerReady, setIsTrackerReady] = useState(false);
    const [isCurrentlyRecording, setIsCurrentlyRecording] = useState(false);
    const [faceTrackingFailed, setFaceTrackingFailed] = useState(false);
    const [isRetrying, setIsRetrying] = useState(false);

    const { cameraStatus, setCameraStatus } = useCameraStatus();
    const pathname = usePathname();

    // Detect browser once (client side only)
    const [browser] = useState<Browser>(() =>
        typeof window !== 'undefined' ? detectBrowser() : 'other'
    );

    // ── Face tracker setup ──────────────────────────────────────────────────
    useEffect(() => {
        if (videoRef.current && !isTrackerReady && cameraStatus === 'ready') {
            tracker.initialize(videoRef.current)
                .then(() => {
                    setIsTrackerReady(true);
                    // Fire a single warmup frame through MediaPipe so the wasm/
                    // model download + first inference cost is paid NOW (while
                    // the user is still reading the question), not on the first
                    // frame of the actual recording. Best-effort, non-blocking.
                    tracker.warmup().catch(() => {
                        // Warmup failures are non-fatal — tracking still works,
                        // it'll just have its usual cold-start hitch.
                    });
                })
                .catch((err: Error) => {
                    console.warn('Face tracker failed to initialize (continuing without eye tracking):', err);
                    setFaceTrackingFailed(true);
                });
        }
    }, [tracker, isTrackerReady, cameraStatus]);

    // ── Eye tracking start/stop ─────────────────────────────────────────────
    useEffect(() => {
        if (!isTrackerReady) return;
        if (isCurrentlyRecording) {
            try { tracker.startTracking(); } catch (err) {
                console.warn('Failed to start eye tracking:', err);
            }
        }
    }, [isCurrentlyRecording, isTrackerReady, tracker]);

    // ── Camera acquisition (also called on retry) ───────────────────────────
    const setupCamera = useCallback(async () => {
        // Stop any existing stream before requesting a new one
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(t => t.stop());
            streamRef.current = null;
        }
        if (videoRef.current) {
            videoRef.current.srcObject = null;
        }

        setIsRetrying(true);
        setCameraStatus('loading');

        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: {
                    width: { ideal: 1280 },
                    height: { ideal: 720 },
                    facingMode: 'user',
                },
                audio: true,
            });

            streamRef.current = stream;
            if (videoRef.current) videoRef.current.srcObject = stream;

            // Video recorder (video + audio for storage/playback)
            const videoOptions: MediaRecorderOptions = {
                mimeType: 'video/webm;codecs=vp8,opus',
                videoBitsPerSecond: 1200000, // 1.2 Mbps
                audioBitsPerSecond: 128000,
            };
            let finalOptions = videoOptions;
            if (!MediaRecorder.isTypeSupported(videoOptions.mimeType!)) {
                console.warn('VP8/Opus not supported, using default codec');
                finalOptions = { videoBitsPerSecond: 1200000, audioBitsPerSecond: 128000 };
            }
            const mediaRecorder = new MediaRecorder(stream, finalOptions);
            mediaRecorder.ondataavailable = (e) => {
                if (e.data.size > 0) chunksRef.current.push(e.data);
            };
            mediaRecorderRef.current = mediaRecorder;

            // Audio-only recorder (smaller files for Whisper transcription)
            const audioStream = new MediaStream(stream.getAudioTracks());
            const audioRecorder = new MediaRecorder(audioStream, { mimeType: 'audio/webm' });
            audioRecorder.ondataavailable = (e) => {
                if (e.data.size > 0) audioChunksRef.current.push(e.data);
            };
            audioRecorderRef.current = audioRecorder;

            setCameraStatus('ready');

            // ── Pre-flush MediaRecorder encoders ────────────────────────────
            //
            // VP8/Opus encoders take ~300-500ms to produce their first frame
            // on a cold start. If the user hits "Record" within that window,
            // the visible recording lags behind reality — the camera looks
            // frozen, then the recording "catches up" a moment later.
            //
            // We work around this by running a tiny throwaway start/stop
            // cycle right after the recorder is constructed, well before
            // the user could possibly press Record. The ondataavailable
            // handler will push warmup chunks into chunksRef.current, but
            // window.startRecording() resets that array to [] before the
            // real recording starts, so warmup data is discarded cleanly.
            //
            // Best-effort. If it throws (some browsers don't allow rapid
            // start/stop), we just continue — the user gets the standard
            // first-frame lag, but everything else still works.
            try {
                if (mediaRecorder.state === 'inactive') {
                    mediaRecorder.start();
                    if (audioRecorder.state === 'inactive') {
                        audioRecorder.start();
                    }
                    setTimeout(() => {
                        try {
                            if (mediaRecorder.state === 'recording') {
                                mediaRecorder.stop();
                            }
                            if (audioRecorder.state === 'recording') {
                                audioRecorder.stop();
                            }
                            // Drop any warmup chunks. window.startRecording()
                            // also clears these, but resetting here keeps the
                            // arrays small in the gap before the user records.
                            chunksRef.current = [];
                            audioChunksRef.current = [];
                        } catch {
                            // Stop call failed — recorder will recover on next start.
                        }
                    }, 150);
                }
            } catch {
                // Pre-flush failed. Non-fatal — proceed without warmup.
            }
        } catch (err) {
            console.error('Camera access denied:', err);
            setCameraStatus('denied');
        } finally {
            setIsRetrying(false);
        }
    // setCameraStatus from useState is stable — safe with empty deps
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [setCameraStatus]);

    // ── Window API + initial camera setup ──────────────────────────────────
    useEffect(() => {
        // @ts-expect-error -- window injection (MVP pattern, shared with interview page)
        window.startRecording = () => {
            if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'inactive') {
                chunksRef.current = [];
                audioChunksRef.current = [];
                mediaRecorderRef.current.start();
                if (audioRecorderRef.current && audioRecorderRef.current.state === 'inactive') {
                    audioRecorderRef.current.start();
                }
                setTimeout(() => setIsCurrentlyRecording(true), 0);
            }
        };

        // @ts-expect-error -- window injection (MVP pattern)
        window.stopRecording = async () => {
            return new Promise<{ blob: Blob; audioBlob: Blob; eyeTracking: EyeTrackingMetrics | null }>((resolve) => {
                if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
                    let videoBlob: Blob | null = null;
                    let audioBlob: Blob | null = null;
                    let eyeTracking: EyeTrackingMetrics | null = null;

                    const checkBothStopped = () => {
                        if (videoBlob !== null && audioBlob !== null) {
                            setTimeout(() => setIsCurrentlyRecording(false), 0);
                            resolve({ blob: videoBlob, audioBlob, eyeTracking });
                        }
                    };

                    mediaRecorderRef.current.onstop = () => {
                        videoBlob = new Blob(chunksRef.current, { type: 'video/webm' });
                        try {
                            const metrics = tracker.getMetrics();
                            if (metrics && metrics.totalFrames > 0) eyeTracking = metrics;
                            tracker.stopTracking();
                        } catch (err) {
                            console.warn('Failed to get eye tracking metrics:', err);
                        }
                        checkBothStopped();
                    };

                    if (audioRecorderRef.current && audioRecorderRef.current.state === 'recording') {
                        audioRecorderRef.current.onstop = () => {
                            audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
                            checkBothStopped();
                        };
                    } else {
                        console.warn('⚠️ Audio recorder not available — using empty audio blob');
                        audioBlob = new Blob([], { type: 'audio/webm' });
                    }

                    if (audioRecorderRef.current && audioRecorderRef.current.state === 'recording') {
                        audioRecorderRef.current.stop();
                    }
                    mediaRecorderRef.current.stop();
                } else {
                    setIsCurrentlyRecording(false);
                    resolve({
                        blob: new Blob([], { type: 'video/webm' }),
                        audioBlob: new Blob([], { type: 'audio/webm' }),
                        eyeTracking: null,
                    });
                }
            });
        };

        setupCamera();

        return () => {
            if (streamRef.current) {
                streamRef.current.getTracks().forEach(t => t.stop());
            }
        };
    }, [setupCamera, tracker]);

    // ── Render ──────────────────────────────────────────────────────────────

    return (
        <>
            {/*
             * The video element is always in the DOM so videoRef.current is always
             * valid — setupCamera() can assign srcObject even while the feed is
             * hidden (e.g. before permissions are granted or after retry).
             */}
            <div
                className="fixed inset-0 z-0 w-full h-full bg-black"
                style={{ visibility: cameraStatus === 'ready' ? 'visible' : 'hidden' }}
            >
                <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className="w-full h-full object-cover transform scale-x-[-1]"
                />
                <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-transparent to-black/30 pointer-events-none" />
                {faceTrackingFailed && (
                    <div className="absolute top-20 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 bg-yellow-500/20 border border-yellow-500/40 backdrop-blur-md px-4 py-2 rounded-full pointer-events-none">
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-yellow-300 flex-shrink-0">
                            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
                            <line x1="12" y1="9" x2="12" y2="13"></line>
                            <line x1="12" y1="17" x2="12.01" y2="17"></line>
                        </svg>
                        <span className="text-yellow-200 text-xs font-medium">
                            Eye contact tracking unavailable — check camera permissions. Eye contact metrics won&apos;t be recorded.
                        </span>
                    </div>
                )}
            </div>

            {/* Dark background when loading, skipped, or denied on non-interview pages */}
            {cameraStatus !== 'ready' && (
                <div className="fixed inset-0 z-0 bg-black" />
            )}

            {/*
             * Permission recovery card — shown on /interview when denied OR
             * while a retry request is in-flight (so the card doesn't flash
             * away during the loading gap between 'denied' → 'loading' → result).
             * z-50 at root level: sits above all interview page UI (z-10 page
             * wrapper, z-20 controls, z-30 nav, z-40 timeout banner).
             */}
            {(cameraStatus === 'denied' || isRetrying) && pathname === '/interview' && (
                <PermissionCard
                    browser={browser}
                    onRetry={setupCamera}
                    onSkip={() => setCameraStatus('skipped')}
                    isRetrying={isRetrying}
                />
            )}
        </>
    );
}
