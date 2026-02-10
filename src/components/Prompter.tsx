'use client';

import React from 'react';

interface PrompterProps {
    question: string;
    isRecording: boolean;
    recordingDuration?: number;
}

// Helper to format seconds as MM:SS
const formatDuration = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
};

export default function Prompter({ question, isRecording, recordingDuration = 0 }: PrompterProps) {
    return (
        <div className="absolute bottom-32 left-1/2 transform -translate-x-1/2 w-11/12 max-w-3xl z-10 transition-all duration-500 ease-in-out">
            <div className="relative bg-white/8 backdrop-blur-2xl border border-white/15 shadow-2xl rounded-2xl px-8 py-5 text-center overflow-hidden">
                {/* Question Text - Compact Size */}
                <h2 className="text-base md:text-lg font-medium leading-relaxed tracking-normal text-white/95 drop-shadow-lg max-w-2xl mx-auto">
                    "{question}"
                </h2>

                {/* Subtle glass reflection effect */}
                <div className="absolute top-0 left-0 w-full h-1/3 bg-gradient-to-b from-white/5 to-transparent pointer-events-none rounded-t-2xl" />

                {/* Bottom glow for depth */}
                <div className="absolute bottom-0 left-1/2 transform -translate-x-1/2 w-1/2 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />
            </div>
        </div>
    );
}
