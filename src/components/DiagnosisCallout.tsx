'use client';

/**
 * DiagnosisCallout
 *
 * The "one thing to fix" block. Surfaces a single, observable pattern that
 * most hurt this answer (e.g. buried lede, missing metric, hedge cascade)
 * with the exact transcript quote as evidence and a single drill CTA.
 *
 * Renders nothing if `diagnosis` is undefined — Claude omits it when the
 * answer was strong enough that no pattern clearly applies.
 *
 * Aesthetic notes (must stay aligned with the rest of /analysis):
 *   - Same glass card treatment used elsewhere on the page
 *     (bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl)
 *   - Amber accent for the eyebrow label — signals "the one thing"
 *     without competing with the green/yellow/red score colors below
 *   - Drill CTA reuses the same white pill style as the page's primary
 *     "Practice Again" buttons so it doesn't look bolted on
 */

import { Target, ArrowRight } from 'lucide-react';
import type { Diagnosis } from '@/utils/diagnosisTaxonomy';

interface DiagnosisCalloutProps {
    diagnosis?: Diagnosis;
    onPracticeClick?: () => void;
}

export default function DiagnosisCallout({ diagnosis, onPracticeClick }: DiagnosisCalloutProps) {
    if (!diagnosis) return null;

    return (
        <div className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl p-5 sm:p-6 mb-4 shadow-xl">
            {/* Eyebrow */}
            <div className="flex items-center gap-2 mb-3">
                <Target className="w-4 h-4 text-amber-400" strokeWidth={2.25} />
                <span className="text-[11px] uppercase tracking-[0.14em] text-amber-400 font-semibold">
                    The one thing to fix
                </span>
            </div>

            {/* Pattern title + fix */}
            <h3 className="text-xl sm:text-2xl font-bold text-white leading-tight">
                {diagnosis.patternLabel}
            </h3>
            <p className="text-white/80 text-sm sm:text-base leading-relaxed mt-2">
                {diagnosis.oneLineFix}
            </p>

            {/* Evidence quote */}
            {diagnosis.evidenceQuote && (
                <blockquote className="border-l-2 border-white/20 pl-4 my-4 text-white/60 text-sm italic">
                    &ldquo;{diagnosis.evidenceQuote}&rdquo;
                    {typeof diagnosis.evidenceTimestamp === 'number' && (
                        <span className="not-italic text-white/40 text-xs ml-2">
                            (~{Math.floor(diagnosis.evidenceTimestamp / 60)}:
                            {String(Math.floor(diagnosis.evidenceTimestamp % 60)).padStart(2, '0')})
                        </span>
                    )}
                </blockquote>
            )}

            {/* Drill */}
            <div className="bg-white/5 rounded-xl p-4 mt-4">
                <div className="flex items-baseline justify-between gap-2 mb-2">
                    <h4 className="text-white text-sm font-semibold">{diagnosis.drill.title}</h4>
                    <span className="text-[11px] text-white/40 whitespace-nowrap">
                        {diagnosis.drill.durationMinutes} min drill
                    </span>
                </div>
                <p className="text-white/60 text-xs leading-relaxed mb-3">
                    {diagnosis.drill.instructions}
                </p>
                {onPracticeClick && (
                    <button
                        onClick={onPracticeClick}
                        className="inline-flex items-center gap-1.5 bg-white text-black text-xs font-semibold px-4 py-2 rounded-lg hover:bg-white/90 transition-colors"
                    >
                        Run another session
                        <ArrowRight className="w-3.5 h-3.5" strokeWidth={2.5} />
                    </button>
                )}
            </div>
        </div>
    );
}
