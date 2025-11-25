'use client';

import React, { useEffect, useRef, useState } from 'react';

export default function VideoFeed() {
    const videoRef = useRef<HTMLVideoElement>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        async function setupCamera() {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({
                    video: {
                        width: { ideal: 1920 },
                        height: { ideal: 1080 },
                        facingMode: 'user',
                    },
                    audio: false, // Audio handled separately for STT/Analysis
                });

                if (videoRef.current) {
                    videoRef.current.srcObject = stream;
                }
            } catch (err) {
                console.error('Error accessing camera:', err);
                setError('Could not access camera. Please allow permissions.');
            }
        }

        setupCamera();

        return () => {
            // Cleanup stream
            if (videoRef.current && videoRef.current.srcObject) {
                const stream = videoRef.current.srcObject as MediaStream;
                stream.getTracks().forEach((track) => track.stop());
            }
        };
    }, []);

    if (error) {
        return (
            <div className="flex items-center justify-center h-screen bg-black text-white">
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
                className="w-full h-full object-cover transform scale-x-[-1]" // Mirror effect
            />
            {/* Overlay gradient for better text visibility */}
            <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-transparent to-black/30 pointer-events-none" />
        </div>
    );
}
