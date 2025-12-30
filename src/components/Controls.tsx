'use client';

import React from 'react';

interface ControlsProps {
    isRecording: boolean;
    onToggleRecording: () => void;
    onNextQuestion: () => void;
    recordingDuration?: number;
    isTranscribing?: boolean; // Disable next button while transcribing
}

export default function Controls({ isRecording, onToggleRecording, onNextQuestion, recordingDuration = 0, isTranscribing = false }: ControlsProps) {
    return (
        <div className="absolute bottom-10 left-1/2 transform -translate-x-1/2 z-20">
            <div className="bg-white/10 backdrop-blur-xl border border-white/20 shadow-xl rounded-full px-6 py-4 flex items-center space-x-6">

                {/* Mute Toggle (Mock) */}
                <button className="bg-white/20 hover:bg-white/30 active:bg-white/40 backdrop-blur-lg border border-white/30 transition-all duration-200 p-4 rounded-full group">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6 text-white group-hover:scale-110 transition-transform">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" />
                    </svg>
                </button>

                {/* Record Button */}
                <button
                    onClick={onToggleRecording}
                    className={`relative p-1 rounded-full border-2 transition-all duration-300 ${isRecording ? 'border-red-500' : 'border-white/50 hover:border-white'}`}
                >
                    <div className={`w-16 h-16 rounded-full transition-all duration-300 flex items-center justify-center ${isRecording ? 'bg-red-500 scale-90 rounded-xl' : 'bg-white hover:scale-105'}`}>
                        {/* Inner icon or shape change handled by css classes above */}
                    </div>
                </button>

                {/* Next Question (Manual Override) */}
                <button
                    onClick={onNextQuestion}
                    disabled={isTranscribing}
                    className={`backdrop-blur-lg border transition-all duration-200 p-4 rounded-full group ${
                        isTranscribing
                            ? 'bg-white/10 border-white/10 cursor-not-allowed opacity-50'
                            : 'bg-white/20 hover:bg-white/30 active:bg-white/40 border-white/30'
                    }`}
                    title={isTranscribing ? 'Please wait for transcription to complete...' : 'Skip to next question'}
                >
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={`w-6 h-6 text-white transition-transform ${!isTranscribing && 'group-hover:scale-110'}`}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 8.688c0-.864.933-1.405 1.683-.977l7.108 4.062a1.125 1.125 0 010 1.953l-7.108 4.062A1.125 1.125 0 013 16.81V8.688zM12.75 8.688c0-.864.933-1.405 1.683-.977l7.108 4.062a1.125 1.125 0 010 1.953l-7.108 4.062a1.125 1.125 0 01-1.683-.977V8.688z" />
                    </svg>
                </button>

            </div>
        </div>
    );
}
