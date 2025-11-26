'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useInterview } from '@/context/InterviewContext';

// We export a global event bus or similar mechanism if we need to trigger recording from outside.
// But since VideoFeed is now in Layout, we can expose a global window method or use Context to register the recorder.
// For simplicity in this MVP refactor, we'll use a custom event or Context registration.

export default function VideoFeed() {
    const videoRef = useRef<HTMLVideoElement>(null);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const chunksRef = useRef<Blob[]>([]);
    const [error, setError] = useState<string | null>(null);
    const { setRecordedBlob } = useInterview();

    useEffect(() => {
        // Expose recording methods to window for access by other components (temporary MVP pattern)
        // A better React pattern would be to lift this state up or use a Ref in Context.
        // Let's use the window pattern for simplicity as we moved this to Layout.

        // @ts-ignore
        window.startRecording = () => {
            if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'inactive') {
                chunksRef.current = [];
                mediaRecorderRef.current.start();
                console.log('Recording started');
            }
        };

        // @ts-ignore
        window.stopRecording = async () => {
            return new Promise<Blob>((resolve) => {
                if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
                    mediaRecorderRef.current.onstop = () => {
                        const blob = new Blob(chunksRef.current, { type: 'video/webm' });
                        setRecordedBlob(blob); // Save to Context
                        resolve(blob);
                    };
                    mediaRecorderRef.current.stop();
                    console.log('Recording stopped');
                } else {
                    resolve(new Blob([], { type: 'video/webm' }));
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

                const mediaRecorder = new MediaRecorder(stream, { mimeType: 'video/webm' });
                mediaRecorder.ondataavailable = (e) => {
                    if (e.data.size > 0) {
                        chunksRef.current.push(e.data);
                    }
                };
                mediaRecorderRef.current = mediaRecorder;

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
    }, [setRecordedBlob]);

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
