/**
 * TranscriptViewer Component
 * Displays transcribed text with highlighted filler words
 */

import { ReactElement } from 'react';

interface TranscriptViewerProps {
    transcript: string;
    duration?: number;
    highlightFillerWords?: boolean;
}

// Common filler words to highlight
const FILLER_WORDS = [
    'um', 'uh', 'uhm', 'like', 'you know', 'kind of', 'sort of',
    'actually', 'basically', 'literally', 'honestly', 'I mean',
    'right', 'okay', 'so', 'well', 'just'
];

export default function TranscriptViewer({
    transcript,
    duration,
    highlightFillerWords = true
}: TranscriptViewerProps) {
    // Function to highlight filler words in the transcript
    const highlightText = (text: string): ReactElement[] => {
        if (!highlightFillerWords) {
            return [<span key="text">{text}</span>];
        }

        const words = text.split(/(\s+)/);
        const elements: ReactElement[] = [];

        words.forEach((word, index) => {
            const cleanWord = word.toLowerCase().replace(/[.,!?;:]/g, '');
            const isFiller = FILLER_WORDS.includes(cleanWord);

            if (isFiller) {
                elements.push(
                    <span
                        key={index}
                        className="bg-yellow-400/30 text-yellow-200 px-1 rounded"
                        title="Filler word"
                    >
                        {word}
                    </span>
                );
            } else {
                elements.push(<span key={index}>{word}</span>);
            }
        });

        return elements;
    };

    // Calculate filler word count
    const countFillerWords = (): number => {
        const words = transcript.toLowerCase().split(/\s+/);
        return words.filter(word => {
            const cleanWord = word.replace(/[.,!?;:]/g, '');
            return FILLER_WORDS.includes(cleanWord);
        }).length;
    };

    const fillerCount = highlightFillerWords ? countFillerWords() : 0;
    const wordCount = transcript.split(/\s+/).filter(w => w.length > 0).length;

    return (
        <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6 shadow-xl">
            {/* Header */}
            <div className="flex items-center justify-between mb-4 pb-4 border-b border-white/10">
                <h3 className="text-white font-semibold text-lg">Transcript</h3>
                <div className="flex items-center gap-4 text-sm">
                    {duration && (
                        <div className="text-white/60">
                            <span className="font-medium text-white/80">{Math.round(duration)}s</span> duration
                        </div>
                    )}
                    <div className="text-white/60">
                        <span className="font-medium text-white/80">{wordCount}</span> words
                    </div>
                    {highlightFillerWords && fillerCount > 0 && (
                        <div className="text-yellow-200/80">
                            <span className="font-medium text-yellow-200">{fillerCount}</span> filler words
                        </div>
                    )}
                </div>
            </div>

            {/* Transcript Text */}
            <div className="text-white/90 leading-relaxed text-base space-y-2">
                {transcript ? (
                    <p className="whitespace-pre-wrap">
                        {highlightText(transcript)}
                    </p>
                ) : (
                    <p className="text-white/50 italic">No transcript available</p>
                )}
            </div>

            {/* Legend for highlighted words */}
            {highlightFillerWords && fillerCount > 0 && (
                <div className="mt-4 pt-4 border-t border-white/10">
                    <div className="flex items-center gap-2 text-sm text-white/60">
                        <div className="w-3 h-3 bg-yellow-400/30 rounded"></div>
                        <span>Highlighted words are common filler words</span>
                    </div>
                </div>
            )}
        </div>
    );
}
