/**
 * Emotion Analyzer Service
 * Client for the Python DeepFace emotion detection service
 */

const EMOTION_SERVICE_URL = 'http://localhost:5001';

export interface EmotionFrame {
  timestamp: number; // Time in video (seconds)
  emotion: string; // Dominant emotion at this point
  confidence: number; // Confidence score (0-100)
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
  facialArea: {
    x: number;
    y: number;
    w: number;
    h: number;
  };
}

/**
 * Check if emotion service is running
 */
export async function checkEmotionService(): Promise<boolean> {
  try {
    const response = await fetch(`${EMOTION_SERVICE_URL}/health`, {
      method: 'GET',
    });
    return response.ok;
  } catch (error) {
    console.error('Emotion service not available:', error);
    return false;
  }
}

/**
 * Analyze emotions in a single frame (base64 image)
 */
export async function analyzeFrame(base64Image: string): Promise<FrameAnalysisResult | null> {
  try {
    const response = await fetch(`${EMOTION_SERVICE_URL}/analyze-frame`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        image: base64Image,
      }),
    });

    if (!response.ok) {
      throw new Error(`Failed to analyze frame: ${response.statusText}`);
    }

    const data = await response.json();

    if (!data.success) {
      throw new Error(data.error || 'Unknown error');
    }

    return {
      dominantEmotion: data.result.dominant_emotion,
      confidence: data.result.confidence,
      allEmotions: data.result.all_emotions,
      facialArea: data.result.facial_area,
    };
  } catch (error) {
    console.error('Error analyzing frame:', error);
    return null;
  }
}

/**
 * Analyze emotions throughout an entire video file
 */
export async function analyzeVideoFile(videoBlob: Blob): Promise<EmotionAnalysisResult | null> {
  try {
    const formData = new FormData();
    formData.append('video', videoBlob, 'recording.webm');

    const response = await fetch(`${EMOTION_SERVICE_URL}/analyze-video`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`Failed to analyze video: ${response.statusText}`);
    }

    const data = await response.json();

    if (!data.success) {
      throw new Error(data.error || 'Unknown error');
    }

    return {
      timeline: data.timeline.map((frame: any) => ({
        timestamp: frame.timestamp,
        emotion: frame.emotion,
        confidence: frame.confidence,
      })),
      dominantEmotion: data.dominant_emotion,
      confidence: data.confidence,
      distribution: data.distribution,
      totalFramesAnalyzed: data.total_frames_analyzed,
      videoDuration: data.video_duration,
    };
  } catch (error) {
    console.error('Error analyzing video file:', error);
    return null;
  }
}

/**
 * Analyze emotions from a video file path (Electron only)
 */
export async function analyzeVideoPath(videoPath: string): Promise<EmotionAnalysisResult | null> {
  try {
    const response = await fetch(`${EMOTION_SERVICE_URL}/analyze-video-path`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        path: videoPath,
      }),
    });

    if (!response.ok) {
      throw new Error(`Failed to analyze video: ${response.statusText}`);
    }

    const data = await response.json();

    if (!data.success) {
      throw new Error(data.error || 'Unknown error');
    }

    return {
      timeline: data.timeline.map((frame: any) => ({
        timestamp: frame.timestamp,
        emotion: frame.emotion,
        confidence: frame.confidence,
      })),
      dominantEmotion: data.dominant_emotion,
      confidence: data.confidence,
      distribution: data.distribution,
      totalFramesAnalyzed: data.total_frames_analyzed,
      videoDuration: data.video_duration,
    };
  } catch (error) {
    console.error('Error analyzing video path:', error);
    return null;
  }
}

/**
 * Get emotion score for feedback (higher is better)
 * Positive emotions (happy, surprise) score higher
 * Negative emotions (angry, fear, sad) score lower
 * Neutral is middle
 */
export function getEmotionScore(emotion: string, confidence: number): number {
  const emotionScores: Record<string, number> = {
    happy: 100,
    surprise: 85,
    neutral: 70,
    disgust: 40,
    sad: 35,
    angry: 25,
    fear: 20,
  };

  const baseScore = emotionScores[emotion] || 70;

  // Weight by confidence (higher confidence = closer to base score)
  const confidenceWeight = confidence / 100;
  const neutralScore = 70; // Fallback to neutral if low confidence

  return Math.round(baseScore * confidenceWeight + neutralScore * (1 - confidenceWeight));
}

/**
 * Get user-friendly emotion description
 */
export function getEmotionDescription(emotion: string): string {
  const descriptions: Record<string, string> = {
    happy: 'Confident and positive',
    surprise: 'Engaged and attentive',
    neutral: 'Calm and composed',
    disgust: 'Uncomfortable or skeptical',
    sad: 'Uncertain or hesitant',
    angry: 'Frustrated or tense',
    fear: 'Nervous or anxious',
  };

  return descriptions[emotion] || 'Neutral expression';
}

/**
 * Get feedback message for dominant emotion
 */
export function getEmotionFeedback(emotion: string, confidence: number): string {
  if (confidence < 30) {
    return 'Expression was unclear. Try to be more expressive to convey confidence.';
  }

  const feedback: Record<string, string> = {
    happy: 'Excellent! Your positive demeanor projects confidence and enthusiasm.',
    surprise: 'Good engagement! You appeared attentive and interested.',
    neutral: 'Good composure. Consider adding more facial expressions to show enthusiasm.',
    disgust: 'You appeared uncomfortable. Relax your facial muscles and smile more.',
    sad: 'You seemed uncertain. Work on projecting confidence through your expression.',
    angry: 'You appeared tense. Take deep breaths and relax your facial muscles.',
    fear: 'You seemed nervous. Practice will help you feel more comfortable and confident.',
  };

  return feedback[emotion] || 'Maintain a neutral, composed expression.';
}
