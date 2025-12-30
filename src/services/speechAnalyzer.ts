/**
 * Speech Analyzer Service
 * Analyzes transcripts for filler words, WPM, pauses, and other speech patterns
 */

export interface SpeechMetrics {
  wordsPerMinute: number;
  totalWords: number;
  fillerWordCount: number;
  fillerWords: { word: string; count: number }[];
  speakingTime: number; // in seconds
  averagePauseDuration?: number;
  clarityScore: number; // 0-100
  pacingScore: number; // 0-100
}

// Common filler words and phrases
const FILLER_WORDS = [
  'um', 'uh', 'uhm', 'hmm',
  'like', 'you know', 'kind of', 'sort of',
  'actually', 'basically', 'literally', 'honestly', 'I mean',
  'right', 'okay', 'so', 'well', 'just',
  'really', 'very', 'quite', 'pretty much',
  'you see', 'you know what I mean', 'at the end of the day',
  'to be honest', 'if you will', 'as it were'
];

/**
 * Analyze a transcript for speech metrics
 * @param transcript - The text to analyze
 * @param duration - Duration of speech in seconds (optional, for WPM calculation)
 * @returns Speech metrics
 */
export function analyzeSpeech(transcript: string, duration?: number): SpeechMetrics {
  // Clean the transcript
  const cleanedTranscript = transcript.trim();

  if (!cleanedTranscript) {
    return {
      wordsPerMinute: 0,
      totalWords: 0,
      fillerWordCount: 0,
      fillerWords: [],
      speakingTime: duration || 0,
      clarityScore: 0,
      pacingScore: 0,
    };
  }

  // Calculate total words
  const words = cleanedTranscript.split(/\s+/).filter(w => w.length > 0);
  const totalWords = words.length;

  // Calculate speaking time and WPM
  const speakingTime = duration || estimateSpeakingTime(totalWords);
  const wordsPerMinute = speakingTime > 0 ? Math.round((totalWords / speakingTime) * 60) : 0;

  // Detect filler words
  const { count: fillerWordCount, details: fillerWords } = detectFillerWords(cleanedTranscript);

  // Calculate clarity score (based on filler word ratio)
  const fillerWordRatio = totalWords > 0 ? fillerWordCount / totalWords : 0;
  const clarityScore = calculateClarityScore(fillerWordRatio);

  // Calculate pacing score (based on WPM - ideal is 120-150 WPM)
  const pacingScore = calculatePacingScore(wordsPerMinute);

  return {
    wordsPerMinute,
    totalWords,
    fillerWordCount,
    fillerWords,
    speakingTime,
    clarityScore,
    pacingScore,
  };
}

/**
 * Detect filler words in the transcript
 */
function detectFillerWords(transcript: string): {
  count: number;
  details: { word: string; count: number }[];
} {
  const lowerTranscript = transcript.toLowerCase();
  const fillerWordMap = new Map<string, number>();

  // Check for each filler word/phrase
  for (const filler of FILLER_WORDS) {
    // Use word boundaries to match whole words/phrases
    const regex = new RegExp(`\\b${filler.replace(/\s+/g, '\\s+')}\\b`, 'gi');
    const matches = lowerTranscript.match(regex);
    const count = matches ? matches.length : 0;

    if (count > 0) {
      fillerWordMap.set(filler, count);
    }
  }

  // Convert to array and sort by count (descending)
  const details = Array.from(fillerWordMap.entries())
    .map(([word, count]) => ({ word, count }))
    .sort((a, b) => b.count - a.count);

  const totalCount = details.reduce((sum, item) => sum + item.count, 0);

  return { count: totalCount, details };
}

/**
 * Estimate speaking time based on word count (if duration not provided)
 * Average speaking rate is ~150 words per minute
 */
function estimateSpeakingTime(wordCount: number): number {
  const averageWPM = 150;
  return Math.round((wordCount / averageWPM) * 60); // in seconds
}

/**
 * Calculate clarity score based on filler word ratio
 * 0% filler words = 100 score
 * 10%+ filler words = 0 score
 */
function calculateClarityScore(fillerWordRatio: number): number {
  if (fillerWordRatio <= 0) return 100;
  if (fillerWordRatio >= 0.1) return 0;

  // Linear scale from 100 to 0 as ratio goes from 0 to 0.1
  return Math.round(100 - (fillerWordRatio * 1000));
}

/**
 * Calculate pacing score based on words per minute
 * Ideal range: 120-150 WPM
 * Too slow (< 100) or too fast (> 180) reduces score
 */
function calculatePacingScore(wpm: number): number {
  if (wpm === 0) return 0;

  // Ideal range
  if (wpm >= 120 && wpm <= 150) return 100;

  // Slightly fast or slow (acceptable range)
  if (wpm >= 100 && wpm < 120) {
    // Scale from 80 to 100 as WPM goes from 100 to 120
    return Math.round(80 + ((wpm - 100) / 20) * 20);
  }
  if (wpm > 150 && wpm <= 180) {
    // Scale from 100 to 70 as WPM goes from 150 to 180
    return Math.round(100 - ((wpm - 150) / 30) * 30);
  }

  // Too slow (< 100 WPM)
  if (wpm < 100) {
    return Math.max(0, Math.round((wpm / 100) * 80));
  }

  // Too fast (> 180 WPM)
  if (wpm > 180) {
    return Math.max(0, Math.round(70 - ((wpm - 180) / 60) * 70));
  }

  return 50; // fallback
}

/**
 * Get pacing feedback based on WPM
 */
export function getPacingFeedback(wpm: number): string {
  if (wpm === 0) return 'No speech detected';
  if (wpm < 100) return 'Too slow - try to speak more confidently';
  if (wpm >= 100 && wpm < 120) return 'Slightly slow - good for emphasis';
  if (wpm >= 120 && wpm <= 150) return 'Excellent pacing';
  if (wpm > 150 && wpm <= 180) return 'Slightly fast - ensure clarity';
  return 'Too fast - slow down for better comprehension';
}

/**
 * Get clarity feedback based on filler word count
 */
export function getClarityFeedback(fillerCount: number, totalWords: number): string {
  if (totalWords === 0) return 'No speech detected';

  const ratio = fillerCount / totalWords;

  if (ratio === 0) return 'Excellent - no filler words detected';
  if (ratio < 0.02) return 'Great - very few filler words';
  if (ratio < 0.05) return 'Good - some filler words present';
  if (ratio < 0.08) return 'Fair - work on reducing filler words';
  return 'Needs improvement - too many filler words';
}
