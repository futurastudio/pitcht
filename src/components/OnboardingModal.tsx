'use client';

import React, { useState } from 'react';

interface OnboardingModalProps {
    isOpen: boolean;
    onComplete: () => void;
}

const STEPS = [
    {
        title: 'Pick Your Interview Type',
        subtitle: 'Choose the type of practice you want — job interview, internship, or presentation.',
    },
    {
        title: 'Add a Job Description',
        subtitle: 'Paste a job posting and our AI generates questions tailored to the exact role. The more detail, the better.',
    },
    {
        title: 'Record & Get AI Feedback',
        subtitle: 'Answer on camera. Our AI analyzes your clarity, confidence, eye contact, and pace — then coaches you on how to improve.',
    },
];

function StepOne() {
    return (
        <div className="grid grid-cols-3 gap-2 my-5">
            {[
                { icon: '💼', label: 'Job Interview', color: 'from-blue-500/20 to-cyan-400/20' },
                { icon: '🎯', label: 'Internship', color: 'from-orange-500/20 to-red-400/20' },
                { icon: '🎤', label: 'Presentation', color: 'from-purple-500/20 to-pink-400/20' },
            ].map((s) => (
                <div key={s.label} className={`bg-gradient-to-br ${s.color} border border-white/15 rounded-2xl p-4 text-center`}>
                    <div className="text-3xl mb-1.5">{s.icon}</div>
                    <div className="text-[11px] text-white/70 font-medium leading-tight">{s.label}</div>
                </div>
            ))}
        </div>
    );
}

function StepTwo() {
    return (
        <div className="my-5 bg-black/30 border border-white/10 rounded-2xl p-4">
            <div className="text-[10px] text-white/35 uppercase tracking-wider font-semibold mb-2">Job Description</div>
            <p className="text-xs text-white/55 leading-relaxed">
                &ldquo;Software Engineer · Google &mdash; We&apos;re looking for an engineer to work on distributed systems and developer tools. Strong CS fundamentals required...&rdquo;
            </p>
            <div className="mt-4 flex justify-end">
                <div className="px-4 py-1.5 bg-white/75 rounded-full text-[11px] font-bold text-black/80 pointer-events-none select-none">
                    Generate Questions →
                </div>
            </div>
        </div>
    );
}

function StepThree() {
    return (
        <div className="my-5 space-y-3">
            <div className="flex items-stretch gap-2">
                {[
                    { icon: '🎬', label: 'Record answer' },
                    { icon: '🤖', label: 'AI analyzes' },
                    { icon: '📊', label: 'Get coached' },
                ].map((item, idx) => (
                    <React.Fragment key={item.label}>
                        <div className="flex-1 flex flex-col items-center justify-center bg-white/5 border border-white/10 rounded-xl py-3 px-2">
                            <span className="text-2xl mb-1">{item.icon}</span>
                            <span className="text-[11px] text-white/60 font-medium text-center leading-tight">{item.label}</span>
                        </div>
                        {idx < 2 && (
                            <div className="flex items-center text-white/25 text-lg self-center">›</div>
                        )}
                    </React.Fragment>
                ))}
            </div>
            <div className="flex flex-wrap gap-1.5 justify-center pt-1">
                {['Clarity', 'Eye Contact', 'Confidence', 'Pace'].map((m) => (
                    <span key={m} className="px-2.5 py-1 bg-white/8 border border-white/10 rounded-full text-[11px] text-white/55">
                        {m}
                    </span>
                ))}
            </div>
        </div>
    );
}

const STEP_CONTENT = [StepOne, StepTwo, StepThree];

export default function OnboardingModal({ isOpen, onComplete }: OnboardingModalProps) {
    const [step, setStep] = useState(0);
    const isLast = step === STEPS.length - 1;

    const handleComplete = () => {
        setStep(0); // reset for next time (unlikely, but clean)
        onComplete();
    };

    if (!isOpen) return null;

    const StepVisual = STEP_CONTENT[step];

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/70 backdrop-blur-sm"
                onClick={handleComplete}
            />

            {/* Modal */}
            <div className="relative w-full max-w-md bg-white/10 backdrop-blur-xl border border-white/20 shadow-2xl rounded-3xl p-8 animate-in fade-in zoom-in duration-200">

                {/* Skip */}
                <button
                    onClick={handleComplete}
                    className="absolute top-5 right-6 text-xs text-white/30 hover:text-white/60 transition-colors"
                >
                    Skip
                </button>

                {/* Step content — keyed so fade-in fires on each transition */}
                <div key={step} className="animate-in fade-in duration-150">
                    <h2 className="text-xl font-bold text-white mb-1.5 pr-10">
                        {STEPS[step].title}
                    </h2>
                    <p className="text-sm text-white/60 leading-relaxed">
                        {STEPS[step].subtitle}
                    </p>

                    <StepVisual />
                </div>

                {/* Dot indicator */}
                <div className="flex justify-center gap-1.5 mb-6">
                    {STEPS.map((_, i) => (
                        <div
                            key={i}
                            className={`rounded-full transition-all duration-300 ${
                                i === step
                                    ? 'w-5 h-1.5 bg-white'
                                    : 'w-1.5 h-1.5 bg-white/25'
                            }`}
                        />
                    ))}
                </div>

                {/* Navigation */}
                <div className="flex items-center justify-between">
                    <button
                        onClick={() => setStep((s) => s - 1)}
                        className={`text-sm text-white/45 hover:text-white/80 transition-colors ${step === 0 ? 'invisible' : ''}`}
                    >
                        ← Back
                    </button>

                    {isLast ? (
                        <button
                            onClick={handleComplete}
                            className="px-6 py-2 rounded-full text-sm font-bold text-black bg-white hover:bg-white/90 transition-colors shadow-lg"
                        >
                            Start Your Free Session
                        </button>
                    ) : (
                        <button
                            onClick={() => setStep((s) => s + 1)}
                            className="px-6 py-2 rounded-full text-sm font-bold text-black bg-white hover:bg-white/90 transition-colors shadow-lg"
                        >
                            Next →
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
