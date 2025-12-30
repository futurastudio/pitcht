'use client';

import React, { useState } from 'react';

interface ContextModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (context: string) => void;
    initialContext: string;
}

export default function ContextModal({ isOpen, onClose, onSave, initialContext }: ContextModalProps) {
    const [context, setContext] = useState(initialContext);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity"
                onClick={onClose}
            />

            {/* Modal Content */}
            <div className="relative w-full max-w-lg bg-white/10 backdrop-blur-xl border border-white/20 shadow-2xl rounded-3xl p-6 md:p-8 animate-in fade-in zoom-in duration-200">
                <div className="flex justify-between items-center mb-6">
                    <h2 className="text-2xl font-bold text-white">Interview Context</h2>
                    <button
                        onClick={onClose}
                        className="text-white/50 hover:text-white transition-colors"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="18" y1="6" x2="6" y2="18"></line>
                            <line x1="6" y1="6" x2="18" y2="18"></line>
                        </svg>
                    </button>
                </div>

                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-white/70 mb-2">
                            Job Description / Topic / Notes
                        </label>
                        <textarea
                            value={context}
                            onChange={(e) => setContext(e.target.value)}
                            placeholder="Paste the job description, presentation topic, or any specific context here..."
                            className="w-full h-40 bg-black/20 border border-white/10 rounded-xl p-4 text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-white/20 resize-none"
                        />
                    </div>

                    <div className="flex justify-end space-x-3 pt-2">
                        <button
                            onClick={onClose}
                            className="px-4 py-2 rounded-full text-sm font-medium text-white/70 hover:bg-white/10 transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={() => {
                                onSave(context);
                                onClose();
                            }}
                            className="px-6 py-2 rounded-full text-sm font-bold text-black bg-white hover:bg-white/90 transition-colors shadow-lg"
                        >
                            Save Context
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
