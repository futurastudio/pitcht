'use client';

import React, { useEffect, useRef, useState } from 'react';
import { FaceTracker } from '@/services/faceTracker';
import type { EyeTrackingMetrics } from '@/services/faceTracker';

export default function VideoFeed() {
    const videoRef = useRef<HTMLVideoElement>(null);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const audioRecorderRef = useRef<MediaRecorder | null>(null); // Separate audio recorder for transcription
    const chunksRef = useRef<Blob[]>([]);
    const audioChunksRef = useRef<Blob[]>([]); // Audio-only chunks
    const [error, setError] = useState<string | null>(null);
    const [tracker] = useState(() => FaceTracker.getInstance());
    const [isTrackerReady, setIsTrackerReady] = useState(false);
    const [isCurrentlyRecording, setIsCurrentlyRecording] = useState(false);
    const [faceTrackingFailed, setFaceTrackingFailed] = useState(false);

    // Initialize MediaPipe face tracker when video is ready
    useEffect(() => {
        if (videoRef.current && !isTrackerReady) {
            tracker.initialize(videoRef.current)
                .then(() => {
                    setIsTrackerReady(true);
                })
                .catch((err: Error) => {
                    console.warn('Face tracker failed to initialize (continuing without eye tracking):', err);
                    setFaceTrackingFailed(true);
                });
        }
    }, [tracker, isTrackerReady]);

    // Start eye contact tracking when recording begins
    // Note: Don't stop tracking here - metrics are retrieved in window.stopRecording()
    useEffect(() => {
        if (!isTrackerReady) return;

        if (isCurrentlyRecording) {
            // Start tracking when recording begins
            try {
                tracker.startTracking();
            } catch (err) {
                console.warn('Failed to start eye tracking:', err);
            }
        }
        // Metrics will be retrieved by window.stopRecording() before tracker is stopped
    }, [isCurrentlyRecording, isTrackerReady, tracker]);

    useEffect(() => {
        // Expose recording methods to window for access by other components (temporary MVP pattern)
        // A better React pattern would be to lift this state up or use a Ref in Context.
        // Let's use the window pattern for simplicity as we moved this to Layout.

        // @ts-ignore
        window.startRecording = () => {
            if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'inactive') {
                chunksRef.current = [];
                audioChunksRef.current = [];
                mediaRecorderRef.current.start();
                // Start audio-only recording for transcription
                if (audioRecorderRef.current && audioRecorderRef.current.state === 'inactive') {
                    audioRecorderRef.current.start();
                }
                // Defer state update to avoid updating during render
                setTimeout(() => setIsCurrentlyRecording(true), 0);
            }
        };

        // @ts-ignore
        window.stopRecording = async () => {
            return new Promise<{ blob: Blob; audioBlob: Blob; eyeTracking: EyeTrackingMetrics | null }>((resolve) => {
                if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
                    let videoBlob: Blob | null = null;
                    let audioBlob: Blob | null = null;
                    let eyeTracking: EyeTrackingMetrics | null = null;

                    // Handler for when BOTH recorders have stopped
                    const checkBothStopped = () => {
                        if (videoBlob !== null && audioBlob !== null) {
                            // Defer state update to avoid updating during render
                            setTimeout(() => setIsCurrentlyRecording(false), 0);
                            resolve({ blob: videoBlob, audioBlob, eyeTracking });
                        }
                    };

                    // CRITICAL: Set up BOTH onstop handlers BEFORE stopping any recorder
                    // This prevents race condition where one recorder stops before the other's handler is set

                    // Set up video recorder stop handler
                    mediaRecorderRef.current.onstop = () => {
                        videoBlob = new Blob(chunksRef.current, { type: 'video/webm' });

                        // Get eye tracking metrics BEFORE stopping tracker
                        try {
                            const metrics = tracker.getMetrics();

                            if (metrics && metrics.totalFrames > 0) {
                                eyeTracking = metrics;
                            }
                            // Now stop the tracker to clean up
                            tracker.stopTracking();
                        } catch (err) {
                            console.warn('Failed to get eye tracking metrics:', err);
                        }

                        checkBothStopped();
                    };

                    // Set up audio recorder stop handler (or fallback to empty blob)
                    if (audioRecorderRef.current && audioRecorderRef.current.state === 'recording') {
                        audioRecorderRef.current.onstop = () => {
                            audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
                            checkBothStopped();
                        };
                    } else {
                        // No audio recorder available, use empty blob and don't wait for it
                        console.warn('⚠️ Audio recorder not available - using empty audio blob');
                        audioBlob = new Blob([], { type: 'audio/webm' });
                    }

                    // NOW stop both recorders (handlers are already set up)
                    if (audioRecorderRef.current && audioRecorderRef.current.state === 'recording') {
                        audioRecorderRef.current.stop();
                    }
                    mediaRecorderRef.current.stop();
                } else {
                    setIsCurrentlyRecording(false);
                    resolve({
                        blob: new Blob([], { type: 'video/webm' }),
                        audioBlob: new Blob([], { type: 'audio/webm' }),
                        eyeTracking: null
                    });
                }
            });
        };

        async function setupCamera() {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({
                    video: {
                        // 720p is sufficient for face tracking and recording quality.
                        // 1080p was causing visible camera stutter due to MediaPipe
                        // processing a full 1920x1080 frame on every animation frame.
                        width: { ideal: 1280 },
                        height: { ideal: 720 },
                        facingMode: 'user',
                    },
                    audio: true,
                });

                if (videoRef.current) {
                    videoRef.current.srcObject = stream;
                }

                // Video recorder (video + audio for storage/playback)
                // Use lower bitrate to keep 5-minute videos under 50MB Supabase limit
                // Bitrate: 1.5 Mbps = ~11.25 MB per minute = ~56MB for 5 minutes (still slightly over)
                // Bitrate: 1.2 Mbps = ~9 MB per minute = ~45MB for 5 minutes (safely under 50MB)
                const videoOptions: MediaRecorderOptions = {
                    mimeType: 'video/webm;codecs=vp8,opus',
                    videoBitsPerSecond: 1200000, // 1.2 Mbps - good quality, smaller files
                    audioBitsPerSecond: 128000,  // 128 kbps - high quality audio
                };

                // Fallback if codecs not supported
                let finalOptions = videoOptions;
                if (!MediaRecorder.isTypeSupported(videoOptions.mimeType!)) {
                    console.warn('VP8/Opus not supported, using default codec');
                    finalOptions = {
                        videoBitsPerSecond: 1200000,
                        audioBitsPerSecond: 128000,
                    };
                }

                const mediaRecorder = new MediaRecorder(stream, finalOptions);
                mediaRecorder.ondataavailable = (e) => {
                    if (e.data.size > 0) {
                        chunksRef.current.push(e.data);
                    }
                };
                mediaRecorderRef.current = mediaRecorder;

                // Audio-only recorder (for efficient transcription - much smaller files)
                // Extract only audio track from stream
                const audioStream = new MediaStream(stream.getAudioTracks());
                const audioRecorder = new MediaRecorder(audioStream, { mimeType: 'audio/webm' });
                audioRecorder.ondataavailable = (e) => {
                    if (e.data.size > 0) {
                        audioChunksRef.current.push(e.data);
                    }
                };
                audioRecorderRef.current = audioRecorder;

            } catch (err) {
                console.error('Error accessing camera:', err);
                setError('Could not access camera/microphone. Please allow permissions.');
            }
        }

        setupCamera();

        return () => {
            if (videoRef.current && videoRef.current.srcObject) {
                const stream = videoRef.current.srcObject as MediaStream;
                stream.getTracks().forEach((track) => track.stop());
            }
        };
    }, []);

    if (error) {
        return (
            <div className="fixed inset-0 z-0 flex items-center justify-center bg-black text-white">
                <p>{error}</p>
            </div>
        );
    }

    return (
        <div className="fixed inset-0 z-0 w-full h-full bg-black">
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
    );
}
