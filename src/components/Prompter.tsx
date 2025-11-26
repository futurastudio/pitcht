'use client';

import React from 'react';

interface PrompterProps {
    question: string;
    isRecording: boolean;
}

export default function Prompter({ question, isRecording }: PrompterProps) {
    return (
        <div className="absolute top-1/4 left-1/2 transform -translate-x-1/2 w-3/4 max-w-4xl z-10 transition-all duration-500 ease-in-out">
            <div className="bg-white/10 backdrop-blur-xl border border-white/20 shadow-xl rounded-3xl p-8 md:p-12 text-center relative overflow-hidden">
                {/* Live Indicator */}
                {isRecording && (
                    <div className="absolute top-4 right-6 flex items-center space-x-2 bg-red-500/20 px-3 py-1 rounded-full border border-red-500/30 backdrop-blur-md">
                        <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                        <span className="text-red-100 text-xs font-medium tracking-wider uppercase">Live Interview</span>
                    </div>
                )}

                {/* Question Text */}
                <h2 className="text-3xl md:text-5xl font-medium leading-tight tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-white to-white/70 drop-shadow-sm">
                    "{question}"
                </h2>

                {/* Subtle reflection effect */}
                <div className="absolute top-0 left-0 w-full h-1/2 bg-gradient-to-b from-white/5 to-transparent pointer-events-none" />
            </div>
        </div>
    );
}
