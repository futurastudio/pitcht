/**
 * Emotion Analyzer Service
 *
 * Previously called a Python/DeepFace HTTP service on localhost:5001.
 * Now a thin wrapper around the FaceTrackerService — emotion is derived
 * in-process from MediaPipe facial geometry (no external process required).
 *
 * All exported function signatures are preserved so callers need minimal changes.
 */

import faceTracker from './faceTracker';

// ─── Public types (kept for backward-compat) ─────────────────────────────────

export interface EmotionFrame {
  timestamp: number;
  emotion: string;
  confidence: number;
}

export interface EmotionDistribution {
  angry: number;
  disgust: number;
  fear: number;
  happy: number;
  sad: number;
  surprise: number;
  neutral: number;
}

export interface EmotionAnalysisResult {
  timeline: EmotionFrame[];
  dominantEmotion: string;
  confidence: number;
  distribution: EmotionDistribution;
  totalFramesAnalyzed: number;
  videoDuration: number;
}

export interface FrameAnalysisResult {
  dominantEmotion: string;
  confidence: number;
  allEmotions: EmotionDistribution;
  facialArea: { x: number; y: number; w: number; h: number };
}

// ─── Helper: map faceTracker emotion labels to DeepFace distribution shape ───

/**
 * Build a pseudo-distribution from a single dominant label + confidence.
 * Real DeepFace distributions are per-frame; we approximate with a
 * simple spreading scheme so downstream code that reads .distribution
 * still gets sensible numbers.
 */
function buildDistribution(dominantEmotion: string, confidence: number): EmotionDistribution {
  const base: EmotionDistribution = {
    angry: 0,
    disgust: 0,
    fear: 0,
    happy: 0,
    sad: 0,
    surprise: 0,
    neutral: 0,
  };

  // Map our 5-label set to the 7-label DeepFace set
  const labelMap: Record<string, keyof EmotionDistribution> = {
    confident: 'neutral',  // confident maps closest to neutral in DeepFace
    happy: 'happy',
    neutral: 'neutral',
    nervous: 'fear',
    tense: 'angry',
  };

  const key = labelMap[dominantEmotion] ?? 'neutral';
  const remaining = 100 - confidence;
  base[key] = confidence;

  // Spread remainder evenly across the other keys
  const others = (Object.keys(base) as (keyof EmotionDistribution)[]).filter(k => k !== key);
  const share = Math.round(remaining / others.length);
  for (const k of others) {
    base[k] = share;
  }

  return base;
}

// ─── Exported functions ───────────────────────────────────────────────────────

/**
 * Health-check stub — always returns true since there is no external service.
 * Kept so callers that gate on this don't need to be changed in one shot.
 */
export async function checkEmotionService(): Promise<boolean> {
  return true;
}

/**
 * Read the current emotion snapshot from the already-running FaceTrackerService.
 *
 * This replaces the old POST /analyze-frame call. The face tracker is already
 * processing frames in real-time during the recording; we just read its
 * accumulated state.
 */
export async function analyzeFrame(_base64Image: string): Promise<FrameAnalysisResult | null> {
  const metrics = faceTracker.getMetrics();
  const distribution = buildDistribution(metrics.dominantEmotion, metrics.emotionConfidence);

  return {
    dominantEmotion: metrics.dominantEmotion,
    confidence: metrics.emotionConfidence,
    allEmotions: distribution,
    facialArea: { x: 0, y: 0, w: 0, h: 0 }, // not available from landmark-based approach
  };
}

/**
 * Read emotion data from the FaceTrackerService accumulated across the recording.
 *
 * Replaces the old POST /analyze-video-path call (Electron path variant).
 * The videoPath arg is accepted for API compatibility but unused — emotion
 * has already been accumulated live during recording.
 */
export async function analyzeVideoPath(_videoPath: string): Promise<EmotionAnalysisResult | null> {
  const metrics = faceTracker.getMetrics();
  const distribution = buildDistribution(metrics.dominantEmotion, metrics.emotionConfidence);

  return {
    timeline: [], // Live tracking doesn't produce a per-frame timeline
    dominantEmotion: metrics.dominantEmotion,
    confidence: metrics.emotionConfidence,
    distribution,
    totalFramesAnalyzed: metrics.totalFrames,
    videoDuration: 0, // Not tracked here; caller already knows duration
  };
}

/**
 * Read emotion data from the FaceTrackerService (video-blob variant).
 * Replaces the old POST /analyze-video call.
 */
export async function analyzeVideoFile(_videoBlob: Blob): Promise<EmotionAnalysisResult | null> {
  return analyzeVideoPath('');
}

// ─── Pure scoring helpers (unchanged) ────────────────────────────────────────

/**
 * Get emotion score for feedback (higher is better).
 * Extended to cover the faceTracker emotion labels.
 */
export function getEmotionScore(emotion: string, confidence: number): number {
  const emotionScores: Record<string, number> = {
    // FaceTracker labels
    confident: 95,
    happy: 100,
    neutral: 70,
    nervous: 35,
    tense: 25,
    // DeepFace labels (kept for backward compat)
    surprise: 85,
    disgust: 40,
    sad: 35,
    angry: 25,
    fear: 20,
  };

  const baseScore = emotionScores[emotion] ?? 70;
  const confidenceWeight = confidence / 100;
  const neutralScore = 70;

  return Math.round(baseScore * confidenceWeight + neutralScore * (1 - confidenceWeight));
}

/**
 * Get user-friendly emotion description.
 */
export function getEmotionDescription(emotion: string): string {
  const descriptions: Record<string, string> = {
    // FaceTracker labels
    confident: 'Confident and composed',
    happy: 'Positive and enthusiastic',
    neutral: 'Calm and composed',
    nervous: 'Slightly anxious or uncertain',
    tense: 'Tense or under pressure',
    // DeepFace labels
    surprise: 'Engaged and attentive',
    disgust: 'Uncomfortable or skeptical',
    sad: 'Uncertain or hesitant',
    angry: 'Frustrated or tense',
    fear: 'Nervous or anxious',
  };

  return descriptions[emotion] ?? 'Neutral expression';
}

/**
 * Get feedback message for dominant emotion.
 */
export function getEmotionFeedback(emotion: string, confidence: number): string {
  if (confidence < 30) {
    return 'Expression was unclear. Try to be more expressive to convey confidence.';
  }

  const feedback: Record<string, string> = {
    // FaceTracker labels
    confident: 'Great! You projected confidence and authority throughout.',
    happy: 'Excellent! Your positive demeanor projects confidence and enthusiasm.',
    neutral: 'Good composure. Consider adding more facial expressions to show enthusiasm.',
    nervous: 'You seemed a bit anxious. Deep breaths and steady eye contact will help.',
    tense: 'You appeared tense. Relax your jaw and facial muscles and take slow breaths.',
    // DeepFace labels
    surprise: 'Good engagement! You appeared attentive and interested.',
    disgust: 'You appeared uncomfortable. Relax your facial muscles and smile more.',
    sad: 'You seemed uncertain. Work on projecting confidence through your expression.',
    angry: 'You appeared tense. Take deep breaths and relax your facial muscles.',
    fear: 'You seemed nervous. Practice will help you feel more comfortable and confident.',
  };

  return feedback[emotion] ?? 'Maintain a neutral, composed expression.';
}
