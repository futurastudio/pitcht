/**
 * Type definitions for interview/presentation sessions
 */

export type SessionType = 'job-interview' | 'internship-interview' | 'presentation';

export type QuestionType = 'technical' | 'behavioral' | 'situational' | 'challenge' | 'opening' | 'closing';

export type DifficultyLevel = 'beginner' | 'intermediate' | 'advanced';

export interface Question {
  id: string;
  text: string;
  type: QuestionType;
  difficulty: number; // 1-5
  followUpHints?: string[]; // For AI to ask follow-ups
}

export interface SessionContext {
  sessionType: SessionType;
  context: string; // Full job description, presentation topic, or sales scenario
  difficulty?: DifficultyLevel;
  focusAreas?: string[]; // e.g., ['technical', 'behavioral', 'leadership']
  additionalInfo?: string; // Any extra context
}

export interface GenerateQuestionsRequest extends SessionContext {}

export interface GenerateQuestionsResponse {
  questions: Question[];
  sessionType: SessionType;
  generatedAt: string;
}

export interface Recording {
  id: string;
  questionId: string;
  videoBlob?: Blob;
  videoUrl?: string;
  video_url?: string; // Database field (snake_case)
  transcript?: string;
  duration?: number; // seconds
  recordingId?: string; // ID after save to database
  // Speech Analysis Metrics (database snake_case fields)
  words_per_minute?: number;
  filler_word_count?: number;
  clarity_score?: number; // 0-100
  pacing_score?: number; // 0-100
  // Sprint 4: Video Analysis Metrics (database snake_case fields)
  eye_contact_percentage?: number; // 0-100
  gaze_stability?: number; // 0-100
  dominant_emotion?: string; // e.g., 'confident', 'neutral', 'nervous'
  emotion_confidence?: number; // 0-100
  presence_score?: number; // 0-100 (combined eye contact + emotion)
  // JavaScript camelCase versions (for backwards compatibility with context)
  wordsPerMinute?: number;
  fillerWordCount?: number;
  clarityScore?: number;
  pacingScore?: number;
  eyeContactPercentage?: number;
  gazeStability?: number;
  dominantEmotion?: string;
  emotionConfidence?: number;
  presenceScore?: number;
  createdAt: string;
  created_at?: string; // Database field
}

export interface Session {
  id: string;
  userId?: string;
  type: SessionType;
  context: string;
  questions: Question[];
  recordings?: Recording[];
  createdAt: string;
  status: 'in_progress' | 'completed' | 'abandoned';
}

// Communication Coaching: Enhanced Feedback Types
export interface CommunicationPatterns {
  usedStructure?: 'STAR method' | 'chronological' | 'unstructured' | 'problem-solution' | 'pyramid principle';
  clarityLevel?: 'crystal clear' | 'mostly clear' | 'somewhat unclear' | 'confusing';
  concisenessLevel?: 'concise' | 'appropriate' | 'verbose' | 'rambling';
  exampleQuality?: 'specific examples' | 'vague examples' | 'no examples';
}

export interface FeedbackImprovement {
  area: string;
  detail: string;
  suggestion: string;
  example?: string; // Framework-based example with [PLACEHOLDERS]
  priority: 'high' | 'medium' | 'low';
}

export interface FeedbackStrength {
  area: string;
  detail: string;
}

export interface FeedbackResponse {
  overallScore: number;
  contentScore?: number;          // NEW: Did they answer the question correctly?
  communicationScore?: number;    // NEW: How well did they communicate?
  deliveryScore?: number;         // Existing: Pace, presence, eye contact
  summary: string;
  communicationPatterns?: CommunicationPatterns; // NEW: Identify communication patterns
  strengths: FeedbackStrength[];
  improvements: FeedbackImprovement[];
  nextSteps: string[];
}
