'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useInterview } from '@/context/InterviewContext';

export default function Analysis() {
    const { recordedBlob } = useInterview();
    const [videoUrl, setVideoUrl] = useState<string | null>(null);

    useEffect(() => {
        if (recordedBlob) {
            const url = URL.createObjectURL(recordedBlob);
            setVideoUrl(url);
            return () => URL.revokeObjectURL(url);
        }
    }, [recordedBlob]);

    return (
        <main className="min-h-screen text-white p-8 relative overflow-hidden">
            {/* Background Gradient Overlay (Video is behind this from Layout) */}
            <div className="absolute inset-0 bg-black/60 backdrop-blur-md -z-10" />

            <div className="max-w-6xl mx-auto relative z-10">
                <header className="flex justify-between items-center mb-8">
                    <h1 className="text-4xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-white/60">
                        Interview Analysis
                    </h1>
                    <Link href="/" className="bg-white/20 hover:bg-white/30 active:bg-white/40 backdrop-blur-lg border border-white/30 transition-all duration-200 px-6 py-2 rounded-full text-sm font-medium text-white">
                        Start New Session
                    </Link>
                </header>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    {/* Video Playback */}
                    <div className="lg:col-span-2 space-y-8">
                        <div className="bg-white/10 backdrop-blur-xl border border-white/20 shadow-xl rounded-3xl p-1 aspect-video flex items-center justify-center bg-black/40 overflow-hidden">
                            {videoUrl ? (
                                <video
                                    src={videoUrl}
                                    controls
                                    className="w-full h-full object-contain rounded-2xl"
                                />
                            ) : (
                                <div className="text-center">
                                    <p className="text-white/50 mb-2">No Video Recording Found</p>
                                    <p className="text-xs text-white/30">Did you record a session?</p>
                                </div>
                            )}
                        </div>

                        {/* Transcript Analysis */}
                        <div className="bg-white/10 backdrop-blur-xl border border-white/20 shadow-xl rounded-3xl p-8">
                            <h3 className="text-xl font-semibold mb-4 text-white/90">Transcript Highlights</h3>
                            <div className="space-y-4">
                                <div className="p-4 rounded-xl bg-white/5 border border-white/10">
                                    <p className="text-green-400 text-xs font-bold uppercase mb-1">Strength</p>
                                    <p className="text-white/80">"I demonstrated leadership by taking initiative..."</p>
                                </div>
                                <div className="p-4 rounded-xl bg-white/5 border border-white/10">
                                    <p className="text-yellow-400 text-xs font-bold uppercase mb-1">Improvement</p>
                                    <p className="text-white/80">Try to avoid filler words like "um" and "like". (Detected 12 times)</p>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Emotion & Tone Analysis */}
                    <div className="space-y-8">
                        <div className="bg-white/10 backdrop-blur-xl border border-white/20 shadow-xl rounded-3xl p-8">
                            <h3 className="text-xl font-semibold mb-6 text-white/90">Emotional Intelligence</h3>

                            <div className="space-y-6">
                                <div>
                                    <div className="flex justify-between text-sm mb-2">
                                        <span className="text-white/70">Confidence</span>
                                        <span className="text-white font-medium">85%</span>
                                    </div>
                                    <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                                        <div className="h-full bg-blue-500 w-[85%]" />
                                    </div>
                                </div>

                                <div>
                                    <div className="flex justify-between text-sm mb-2">
                                        <span className="text-white/70">Anxiety</span>
                                        <span className="text-white font-medium">15%</span>
                                    </div>
                                    <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                                        <div className="h-full bg-red-500 w-[15%]" />
                                    </div>
                                </div>

                                <div>
                                    <div className="flex justify-between text-sm mb-2">
                                        <span className="text-white/70">Pacing</span>
                                        <span className="text-white font-medium">Too Fast</span>
                                    </div>
                                    <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                                        <div className="h-full bg-yellow-500 w-[70%]" />
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="bg-white/10 backdrop-blur-xl border border-white/20 shadow-xl rounded-3xl p-8">
                            <h3 className="text-xl font-semibold mb-4 text-white/90">AI Coach Feedback</h3>
                            <p className="text-white/70 leading-relaxed">
                                Great job maintaining eye contact! Your answers were structured well using the STAR method. However, you tended to rush through the "Result" section. Next time, emphasize the impact of your actions more clearly.
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </main>
    );
}
