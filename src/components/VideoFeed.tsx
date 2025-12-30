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

    // Initialize MediaPipe face tracker when video is ready
    useEffect(() => {
        if (videoRef.current && !isTrackerReady) {
            tracker.initialize(videoRef.current)
                .then(() => {
                    setIsTrackerReady(true);
                    console.log('Face tracker initialized successfully');
                })
                .catch((err: Error) => {
                    console.warn('Face tracker failed to initialize (continuing without eye tracking):', err);
                    // Don't set error - app continues without eye tracking
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
                console.log('Eye contact tracking started');
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
                console.log('Recording started (video + audio)');
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
                            console.log(`✅ Recording stopped - Video: ${(videoBlob.size / (1024 * 1024)).toFixed(2)}MB, Audio: ${(audioBlob.size / (1024 * 1024)).toFixed(2)}MB`);
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
                            console.log('🔍 Raw metrics from tracker:', metrics);

                            if (metrics && metrics.totalFrames > 0) {
                                eyeTracking = metrics;
                                console.log('✅ Eye tracking metrics:', eyeTracking);
                            } else {
                                console.warn('⚠️ No frames captured! Tracker was running but no face detected.');
                                console.warn('  totalFrames:', metrics?.totalFrames || 0);
                                console.warn('  Possible causes: No face visible, MediaPipe not loaded, camera blocked');
                            }
                            // Now stop the tracker to clean up
                            tracker.stopTracking();
                        } catch (err) {
                            console.warn('❌ Failed to get eye tracking metrics:', err);
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
                        width: { ideal: 1920 },
                        height: { ideal: 1080 },
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
                console.log('✅ Dual recording setup: video/webm (storage) + audio/webm (transcription)');

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
        </div>
    );
}
