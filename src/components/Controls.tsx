'use client';

import React from 'react';

interface ControlsProps {
    isRecording: boolean;
    onToggleRecording: () => void;
    onPreviousQuestion: () => void;
    onNextQuestion: () => void;
    currentQuestionIndex: number;
    recordingDuration?: number;
    isTranscribing?: boolean; // Disable next button while transcribing
    recordingDisabled?: boolean; // Camera unavailable / skip mode active
}

export default function Controls({ isRecording, onToggleRecording, onPreviousQuestion, onNextQuestion, currentQuestionIndex, recordingDuration = 0, isTranscribing = false, recordingDisabled = false }: ControlsProps) {
    return (
        <div className="absolute bottom-10 left-1/2 transform -translate-x-1/2 z-20">
            <div className="bg-white/10 backdrop-blur-xl border border-white/20 shadow-xl rounded-full px-6 py-4 flex items-center space-x-6">

                {/* Previous Question */}
                <button
                    onClick={onPreviousQuestion}
                    disabled={currentQuestionIndex === 0}
                    className={`backdrop-blur-lg border transition-all duration-200 p-4 rounded-full group ${
                        currentQuestionIndex === 0
                            ? 'bg-white/10 border-white/10 cursor-not-allowed opacity-50'
                            : 'bg-white/20 hover:bg-white/30 active:bg-white/40 border-white/30'
                    }`}
                    title={currentQuestionIndex === 0 ? 'Already at first question' : 'Go to previous question'}
                >
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={`w-6 h-6 text-white transition-transform ${currentQuestionIndex > 0 && 'group-hover:scale-110'}`}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M21 16.811c0 .864-.933 1.405-1.683.977l-7.108-4.062a1.125 1.125 0 010-1.953l7.108-4.062A1.125 1.125 0 0121 8.688v8.123zM11.25 16.811c0 .864-.933 1.405-1.683.977l-7.108-4.062a1.125 1.125 0 010-1.953L9.567 7.71a1.125 1.125 0 011.683.977v8.123z" />
                    </svg>
                </button>

                {/* Record Button */}
                <button
                    onClick={recordingDisabled ? undefined : onToggleRecording}
                    disabled={recordingDisabled}
                    title={recordingDisabled ? 'Enable your camera to record answers' : undefined}
                    className={`relative p-1 rounded-full border-2 transition-all duration-300 ${
                        recordingDisabled
                            ? 'border-white/20 cursor-not-allowed opacity-40'
                            : isRecording
                                ? 'border-red-500'
                                : 'border-white/50 hover:border-white'
                    }`}
                >
                    <div className={`w-16 h-16 rounded-full transition-all duration-300 flex items-center justify-center ${
                        recordingDisabled
                            ? 'bg-white/20'
                            : isRecording
                                ? 'bg-red-500 scale-90 rounded-xl'
                                : 'bg-white hover:scale-105'
                    }`}>
                        {/* Camera-off icon when disabled */}
                        {recordingDisabled && (
                            <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="text-white/50">
                                <path d="M23 7l-7 5 7 5V7z" />
                                <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
                                <line x1="1" y1="1" x2="23" y2="23" />
                            </svg>
                        )}
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
