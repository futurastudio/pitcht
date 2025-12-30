/**
 * Video Analyzer Service
 * Combines eye contact and emotion metrics to calculate overall presence score
 */

import type { EyeTrackingMetrics } from './faceTracker';
import type { EmotionAnalysisResult } from './emotionAnalyzer';
import { getEmotionScore } from './emotionAnalyzer';

export interface VideoMetrics {
  eyeContactPercentage: number; // 0-100
  gazeStability: number; // 0-100
  dominantEmotion: string;
  emotionConfidence: number; // 0-100
  emotionScore: number; // 0-100 (weighted by positive/negative)
  presenceScore: number; // 0-100 (combined score)
}

/**
 * Calculate presence score from eye contact and emotion data
 * Presence = how engaged and confident the person appears
 *
 * Weight breakdown:
 * - Eye Contact: 60% (most important for virtual interviews)
 * - Emotion: 40% (positive emotions boost score, negative reduce it)
 */
export function calculatePresenceScore(
  eyeContactPercentage: number,
  dominantEmotion: string,
  emotionConfidence: number
): number {
  const EYE_CONTACT_WEIGHT = 0.6;
  const EMOTION_WEIGHT = 0.4;

  // Eye contact contribution (directly use percentage)
  const eyeContactScore = eyeContactPercentage;

  // Emotion contribution (use weighted emotion score)
  const emotionScore = getEmotionScore(dominantEmotion, emotionConfidence);

  // Calculate weighted average
  const presenceScore = (eyeContactScore * EYE_CONTACT_WEIGHT) + (emotionScore * EMOTION_WEIGHT);

  return Math.round(presenceScore);
}

/**
 * Combine eye tracking and emotion analysis into video metrics
 */
export function combineVideoMetrics(
  eyeTracking: EyeTrackingMetrics,
  emotionAnalysis: EmotionAnalysisResult
): VideoMetrics {
  const emotionScore = getEmotionScore(
    emotionAnalysis.dominantEmotion,
    emotionAnalysis.confidence
  );

  const presenceScore = calculatePresenceScore(
    eyeTracking.eyeContactPercentage,
    emotionAnalysis.dominantEmotion,
    emotionAnalysis.confidence
  );

  return {
    eyeContactPercentage: eyeTracking.eyeContactPercentage,
    gazeStability: eyeTracking.gazeStability,
    dominantEmotion: emotionAnalysis.dominantEmotion,
    emotionConfidence: emotionAnalysis.confidence,
    emotionScore,
    presenceScore,
  };
}

/**
 * Get feedback for eye contact performance
 */
export function getEyeContactFeedback(eyeContactPercentage: number): string {
  if (eyeContactPercentage >= 80) {
    return 'Excellent eye contact! You maintained strong camera engagement.';
  } else if (eyeContactPercentage >= 60) {
    return 'Good eye contact. Try to look at the camera more consistently.';
  } else if (eyeContactPercentage >= 40) {
    return 'Fair eye contact. Practice looking directly at the camera more often.';
  } else {
    return 'Needs improvement. Eye contact is crucial - try to look at the camera lens more.';
  }
}

/**
 * Get feedback for gaze stability
 */
export function getGazeStabilityFeedback(gazeStability: number): string {
  if (gazeStability >= 80) {
    return 'Your gaze was very stable and focused.';
  } else if (gazeStability >= 60) {
    return 'Generally stable gaze, with some wandering.';
  } else {
    return 'Your gaze wandered quite a bit. Practice maintaining steady focus.';
  }
}

/**
 * Get feedback for presence score
 */
export function getPresenceFeedback(presenceScore: number): string {
  if (presenceScore >= 85) {
    return 'Outstanding presence! You appeared highly engaged and confident.';
  } else if (presenceScore >= 70) {
    return 'Strong presence. You projected good confidence and engagement.';
  } else if (presenceScore >= 55) {
    return 'Moderate presence. Work on eye contact and emotional expression.';
  } else {
    return 'Presence needs improvement. Focus on camera engagement and positive body language.';
  }
}

/**
 * Get comprehensive video feedback combining all metrics
 */
export function getComprehensiveVideoFeedback(metrics: VideoMetrics): {
  eyeContact: string;
  gazeStability: string;
  presence: string;
  summary: string;
} {
  const eyeContactFeedback = getEyeContactFeedback(metrics.eyeContactPercentage);
  const gazeStabilityFeedback = getGazeStabilityFeedback(metrics.gazeStability);
  const presenceFeedback = getPresenceFeedback(metrics.presenceScore);

  // Generate summary
  let summary = '';
  if (metrics.presenceScore >= 70) {
    summary = `You demonstrated strong presence with ${metrics.eyeContactPercentage}% eye contact and a ${metrics.dominantEmotion} demeanor. `;
  } else {
    summary = `Your presence could be stronger. You maintained ${metrics.eyeContactPercentage}% eye contact. `;
  }

  // Add emotion context
  if (metrics.emotionConfidence >= 50) {
    if (['happy', 'surprise'].includes(metrics.dominantEmotion)) {
      summary += 'Your positive expression reinforced your confidence.';
    } else if (['neutral'].includes(metrics.dominantEmotion)) {
      summary += 'Consider adding more facial expressions to convey enthusiasm.';
    } else {
      summary += 'Work on projecting more confidence through your facial expressions.';
    }
  }

  return {
    eyeContact: eyeContactFeedback,
    gazeStability: gazeStabilityFeedback,
    presence: presenceFeedback,
    summary,
  };
}

/**
 * Check if video metrics are available
 */
export function hasVideoMetrics(metrics: Partial<VideoMetrics>): boolean {
  return (
    typeof metrics.eyeContactPercentage === 'number' &&
    typeof metrics.dominantEmotion === 'string' &&
    typeof metrics.presenceScore === 'number'
  );
}

/**
 * Get ideal ranges for video metrics
 */
export const VIDEO_METRIC_RANGES = {
  eyeContact: {
    excellent: 80,
    good: 60,
    fair: 40,
    poor: 0,
  },
  gazeStability: {
    excellent: 80,
    good: 60,
    fair: 40,
    poor: 0,
  },
  presence: {
    excellent: 85,
    good: 70,
    fair: 55,
    poor: 0,
  },
};

/**
 * Get color for metric based on score
 */
export function getMetricColor(score: number, type: 'eyeContact' | 'gazeStability' | 'presence'): string {
  const ranges = VIDEO_METRIC_RANGES[type];

  if (score >= ranges.excellent) {
    return '#10b981'; // green
  } else if (score >= ranges.good) {
    return '#3b82f6'; // blue
  } else if (score >= ranges.fair) {
    return '#f59e0b'; // amber
  } else {
    return '#ef4444'; // red
  }
}
