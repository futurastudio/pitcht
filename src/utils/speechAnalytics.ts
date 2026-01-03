/**
 * Speech Analytics Utilities
 * Analyze transcripts for speech metrics like filler words, pacing, clarity
 */

// Common filler words (matches TranscriptViewer)
const FILLER_WORDS = [
  'um', 'uh', 'uhm', 'like', 'you know', 'kind of', 'sort of',
  'actually', 'basically', 'literally', 'honestly', 'I mean',
  'right', 'okay', 'so', 'well', 'just'
];

export interface SpeechMetrics {
  wordsPerMinute: number;
  fillerWordCount: number;
  clarityScore: number;
  pacingScore: number;
}

/**
 * Count filler words in a transcript
 */
export function countFillerWords(transcript: string): number {
  const words = transcript.toLowerCase().split(/\s+/);
  return words.filter(word => {
    const cleanWord = word.replace(/[.,!?;:]/g, '');
    return FILLER_WORDS.includes(cleanWord);
  }).length;
}

/**
 * Calculate words per minute
 */
export function calculateWPM(transcript: string, durationSeconds: number): number {
  if (durationSeconds === 0) return 0;
  const wordCount = transcript.split(/\s+/).filter(w => w.length > 0).length;
  return Math.round((wordCount / durationSeconds) * 60);
}

/**
 * Calculate clarity score (0-100)
 * Based on filler word ratio - fewer filler words = higher clarity
 */
export function calculateClarityScore(transcript: string): number {
  const words = transcript.split(/\s+/).filter(w => w.length > 0);
  if (words.length === 0) return 0;

  const fillerCount = countFillerWords(transcript);
  const fillerRatio = fillerCount / words.length;

  // Score formula:
  // 0% filler = 100 score
  // 5% filler = 75 score
  // 10% filler = 50 score
  // 20%+ filler = 0 score
  const score = Math.max(0, Math.min(100, 100 - (fillerRatio * 500)));
  return Math.round(score);
}

/**
 * Calculate pacing score (0-100)
 * Based on words per minute - optimal range is 120-150 WPM
 */
export function calculatePacingScore(wpm: number): number {
  // Optimal range: 120-150 WPM
  // Too slow: < 100 WPM
  // Too fast: > 180 WPM

  if (wpm >= 120 && wpm <= 150) {
    return 100; // Perfect pacing
  } else if (wpm >= 100 && wpm < 120) {
    // Slightly slow: linear scale from 70-100
    return Math.round(70 + ((wpm - 100) / 20) * 30);
  } else if (wpm > 150 && wpm <= 180) {
    // Slightly fast: linear scale from 100-70
    return Math.round(100 - ((wpm - 150) / 30) * 30);
  } else if (wpm < 100) {
    // Very slow: linear scale from 0-70
    return Math.round(Math.max(0, (wpm / 100) * 70));
  } else {
    // Very fast (> 180): linear scale from 70-0
    return Math.round(Math.max(0, 70 - ((wpm - 180) / 60) * 70));
  }
}

/**
 * Analyze transcript and return all speech metrics
 */
export function analyzeSpeech(transcript: string, durationSeconds: number): SpeechMetrics {
  const fillerWordCount = countFillerWords(transcript);
  const wordsPerMinute = calculateWPM(transcript, durationSeconds);
  const clarityScore = calculateClarityScore(transcript);
  const pacingScore = calculatePacingScore(wordsPerMinute);

  return {
    wordsPerMinute,
    fillerWordCount,
    clarityScore,
    pacingScore,
  };
}
