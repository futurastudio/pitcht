# Services Layer Documentation

> Last Updated: 2025-01-05
> Living documentation for all service modules

---

## Overview

Service layer handles all external integrations and complex business logic.
Located in `src/services/*.ts`.

**Key Principles**:
- Single Responsibility (one service = one integration/domain)
- Error handling with graceful degradation
- TypeScript types for all inputs/outputs
- Environment variable configuration

---

## AI & ML Services

### claude.ts
**Purpose**: Claude 3.5 Sonnet integration for question generation and feedback

#### generateQuestions()
```typescript
function generateQuestions(
  sessionType: SessionType,
  context: string
): Promise<Question[]>
```

**Behavior**:
- Job Interview: Starts with behavioral questions, progresses to technical
- Sales Pitch: Focuses on value proposition, objection handling
- Presentation: Covers structure, audience engagement, Q&A preparation

**Prompts**: Tailored per session type with examples
**Model**: Claude 3.5 Sonnet (claude-sonnet-4-20250514)
**Cost**: ~$0.006 per session
**Error Handling**: Throws error with message for API failures

#### generateFeedback()
```typescript
function generateFeedback(params: {
  sessionType: string,
  questionText: string,
  transcript: string,
  duration: number,
  speechMetrics: SpeechMetrics,
  videoMetrics?: VideoMetrics,
  context?: string
}): Promise<{
  summary: string,
  strengths: string[],
  improvements: string[],
  nextSteps: string[]
}>
```

**Behavior**:
- Analyzes transcript with full context
- Incorporates speech metrics (WPM, filler words, clarity)
- Incorporates video metrics (eye contact, emotion, presence)
- Returns actionable coaching feedback

**Prompt Engineering**:
- Empathetic tone
- Specific examples from transcript
- Actionable improvements
- Balanced (strengths + improvements)

**Model**: Claude 3.5 Sonnet
**Cost**: ~$0.015 per session
**Token Limit**: 4096 tokens for response

---

### whisper.ts
**Purpose**: OpenAI Whisper integration for speech-to-text

#### transcribeAudio()
```typescript
function transcribeAudio(
  audioFile: File,
  options?: {
    language?: string,
    prompt?: string
  }
): Promise<{
  text: string,
  duration?: number,
  language?: string
}>
```

**Behavior**:
- Accepts audio file (WebM, MP3, WAV, etc.)
- Optional prompt for context (improves accuracy by 10-15%)
- Returns transcript + metadata

**Limits**:
- Max file size: 25MB (Whisper API limit)
- Typical recording: ~2MB/minute audio-only WebM
- Processing time: ~5-10 seconds for 5-minute audio

**Model**: Whisper Large V3
**Cost**: $0.006 per minute
**Error Handling**: Throws on file too large, invalid format, API errors

**IMPORTANT**: Always extract audio-only from video before sending. Video files are ~12MB/min and hit the 25MB limit quickly.

---

### speechAnalyzer.ts
**Purpose**: Analyze speech patterns and calculate metrics

#### analyzeSpeech()
```typescript
function analyzeSpeech(
  transcript: string,
  duration?: number
): {
  wordsPerMinute: number,
  fillerWordCount: number,
  fillerWords: Array<{ word: string, count: number }>,
  clarityScore: number,      // 0-100
  pacingScore: number,       // 0-100
  confidence: 'low' | 'medium' | 'high'
}
```

**Algorithm**:

1. **Words Per Minute (WPM)**
   ```typescript
   const wordCount = transcript.split(/\s+/).length
   const wpm = (wordCount / duration) * 60
   ```

2. **Filler Words Detection**
   - Pattern: 25+ common fillers (um, uh, like, you know, etc.)
   - Case-insensitive regex matching
   - Returns count + breakdown by word

3. **Clarity Score** (0-100)
   ```typescript
   const fillerRatio = fillerWordCount / totalWords
   const clarityScore = Math.max(0, 100 - (fillerRatio * 200))
   ```
   - 0% fillers = 100 score
   - 5% fillers = 90 score
   - 10% fillers = 80 score

4. **Pacing Score** (0-100)
   ```typescript
   const optimalMin = 120  // WPM
   const optimalMax = 150  // WPM
   if (wpm >= optimalMin && wpm <= optimalMax) {
     score = 100
   } else {
     // Deduct points based on distance from range
   }
   ```

**Filler Words List**:
um, uh, like, you know, actually, basically, literally, sort of, kind of, I mean, right, okay, so, well, just, really, very, quite, pretty, somewhat, somehow, anyway, obviously, honestly, frankly, clearly, simply

**CRITICAL**: This function should be called ONCE during transcription. Results must be saved to database. Never recalculate client-side.

---

## Video Analysis Services

### faceTracker.ts
**Purpose**: MediaPipe Face Mesh integration for eye tracking

#### FaceTrackerService (Singleton)
```typescript
class FaceTrackerService {
  initialize(videoElement: HTMLVideoElement): Promise<void>
  startTracking(): void
  stopTracking(): EyeTrackingMetrics
  cleanup(): void
}
```

**Implementation**:
- Uses MediaPipe Face Mesh (478 facial landmarks)
- Tracks iris landmarks (468, 473) for gaze direction
- Processes frames manually via requestAnimationFrame
- Calculates center gaze threshold (0.15 from center)

**Metrics Calculated**:
```typescript
{
  eyeContactPercentage: number,  // % of frames with center gaze
  gazeStability: number,          // % of frames without rapid movement
  totalFrames: number,
  centerGazeFrames: number,
  stableGazeFrames: number
}
```

**Performance**:
- ~30 FPS processing
- Minimal CPU overhead (runs in browser)
- FREE (no API costs)

**Usage Pattern**:
1. Initialize once when video element ready
2. Start tracking when recording begins
3. Stop tracking when recording ends
4. Metrics returned immediately (no async processing)

---

### emotionAnalyzer.ts
**Purpose**: DeepFace integration for emotion detection

#### checkEmotionService()
```typescript
function checkEmotionService(): Promise<boolean>
```
Ping health endpoint to verify Python service is running.

#### analyzeVideoPath()
```typescript
function analyzeVideoPath(
  videoPath: string
): Promise<{
  dominantEmotion: string,
  confidence: number,
  emotions: Record<string, number>
}>
```

**Behavior**:
- Calls Python Flask service (port 5001)
- Analyzes video file from disk path
- Returns dominant emotion across all frames

**Emotions Detected**:
happy, sad, angry, surprise, fear, disgust, neutral

**Emotion Scoring** (for presence calculation):
- happy: 100
- surprise: 85
- neutral: 70
- sad: 40
- fear: 30
- angry: 20
- disgust: 10

**Processing Time**: ~5-10 seconds for 30-second video
**Cost**: FREE (local Python service)

**CRITICAL**:
- Python service must be running (`python-services/emotion_service.py`)
- Electron starts service automatically on app launch
- Graceful degradation if service unavailable

---

### videoAnalyzer.ts
**Purpose**: Combine metrics into presence score

#### calculatePresenceScore()
```typescript
function calculatePresenceScore(
  eyeContactPercentage: number,
  dominantEmotion: string,
  emotionConfidence: number
): number
```

**Formula**:
```typescript
const emotionScore = EMOTION_SCORES[dominantEmotion] || 70
const weightedEmotionScore = emotionScore * emotionConfidence

const presenceScore = (
  (eyeContactPercentage * 0.6) +
  (weightedEmotionScore * 0.4)
)
```

**Weights**:
- Eye Contact: 60%
- Emotion: 40%

**Rationale**: Eye contact is the primary indicator of presence/engagement. Emotion provides context but can vary widely based on interview style.

---

## Database & Storage Services

### supabase.ts
**Purpose**: Supabase client configuration and helpers

#### supabase (client)
```typescript
const supabase = createClient(url, anonKey)
```
Singleton client for all Supabase operations.

#### uploadVideoToStorage()
```typescript
function uploadVideoToStorage(
  blob: Blob,
  userId: string,
  sessionId: string,
  recordingId: string
): Promise<string>  // Returns storage path
```

**Behavior**:
- Uploads to `interview-videos` bucket
- Path: `${userId}/${sessionId}/${recordingId}.webm`
- Returns public/signed URL

**Storage Policies**:
- Private bucket (RLS enabled)
- Users can only access their own videos
- Authenticated access only

#### downloadVideoFromStorage()
```typescript
function downloadVideoFromStorage(
  storagePath: string
): Promise<Blob>
```

**Behavior**:
- Downloads video blob from storage
- Verifies user has access (RLS)
- Returns blob for playback

---

### sessionManager.ts
**Purpose**: CRUD operations for sessions, recordings, analyses

#### createSession()
```typescript
function createSession(params: {
  userId: string,
  sessionType: string,
  context?: string,
  questions: Question[]
}): Promise<string>  // Returns session ID
```

**Database Operations**:
1. Insert into `sessions` table
2. Insert all questions into `questions` table
3. Return session ID for tracking

**Status**: Created with `status='in_progress'`

#### completeSession()
```typescript
function completeSession(sessionId: string): Promise<void>
```

**Database Operations**:
```sql
UPDATE sessions
SET status = 'completed',
    completed_at = NOW()
WHERE id = sessionId
```

**CRITICAL**: Must be called when interview ends. Two call sites:
1. When recording stops on last question
2. When user skips to end via "Next Question"

#### addRecording()
```typescript
function addRecording(params: {
  sessionId: string,
  questionId: string,
  videoPath: string,
  videoBlob: Blob,
  transcript?: string,
  duration?: number,
  speechMetrics?: SpeechMetrics,
  videoMetrics?: VideoMetrics
}): Promise<string>  // Returns recording ID
```

**Database Operations**:
1. Upload video to Supabase Storage
2. Insert into `recordings` table with all metrics
3. Return recording ID

**Metrics Saved**:
- Speech: WPM, filler words, clarity, pacing
- Video: Eye contact, gaze stability, emotion, presence

#### updateRecording()
```typescript
function updateRecording(
  recordingId: string,
  updates: Partial<Recording>
): Promise<void>
```

**Use Case**: Background transcription completion
- Update transcript field
- Update speech metrics (WPM, filler words, clarity, pacing)

#### getUserSessions()
```typescript
function getUserSessions(userId: string): Promise<Session[]>
```

Returns all sessions for a user, ordered by most recent.

#### getUserProgressData()
```typescript
function getUserProgressData(userId: string): Promise<RecordingMetric[]>
```

Returns recording metrics for progress charts:
- Clarity score over time
- Pacing score over time
- Eye contact over time
- Filler words over time

---

### auth.ts
**Purpose**: Supabase authentication helpers

#### ensureAnonymousUser()
```typescript
function ensureAnonymousUser(): Promise<User>
```

**Behavior**:
- Checks if user is already authenticated
- If not, creates anonymous user
- Returns user object

**Use Case**: Auto-create user on app mount (no signup required)

---

## Environment Variables

```bash
# Required for services to work
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbG...
SUPABASE_SERVICE_ROLE_KEY=eyJhbG...  # Server-side only
```

---

## Service Dependencies

```
sessionManager.ts
├── supabase.ts (database)
├── auth.ts (user context)
└── uploadVideoToStorage() (storage)

claude.ts
└── @anthropic-ai/sdk

whisper.ts
└── openai

speechAnalyzer.ts
└── (no external deps)

faceTracker.ts
├── @mediapipe/face_mesh
└── @tensorflow/tfjs-core

emotionAnalyzer.ts
└── fetch (Python service on localhost:5001)

videoAnalyzer.ts
└── (no external deps)
```

---

## Error Handling Patterns

### API Services (claude, whisper)
```typescript
try {
  const result = await apiCall()
  return result
} catch (error) {
  console.error('Service error:', error)
  throw new Error('User-friendly message')
}
```

### Video Services (faceTracker, emotionAnalyzer)
```typescript
// Graceful degradation
try {
  const metrics = await analyzeVideo()
  return metrics
} catch (error) {
  console.error('Analysis failed:', error)
  return null  // Continue without metrics
}
```

### Database Services (sessionManager)
```typescript
const { data, error } = await supabase.from('table').insert(...)
if (error) {
  console.error('Database error:', error)
  throw new Error(`Failed to save: ${error.message}`)
}
return data
```

---

## Testing Services

### Mock Data
For development without API keys:
```typescript
// claude.ts
if (process.env.NODE_ENV === 'development' && !process.env.ANTHROPIC_API_KEY) {
  return MOCK_QUESTIONS
}
```

### Service Health Checks
```typescript
// Check if services are available
const claudeHealth = await testClaudeConnection()
const emotionHealth = await checkEmotionService()
const dbHealth = await supabase.from('sessions').select('count')
```

---

## Performance Optimization

### Caching
- **Face Tracker**: Singleton instance (initialize once)
- **Supabase Client**: Singleton (reuse connection)
- **MediaPipe Models**: Loaded from CDN, cached by browser

### Async Patterns
- **Transcription**: Non-blocking (runs in background)
- **Emotion Analysis**: Timeout wrapper (10s max)
- **Database Writes**: Fire-and-forget where appropriate

### Cost Optimization
- **Audio-only transcription**: ~2MB/min vs ~12MB/min for video
- **Batch operations**: Upload video + save metadata together
- **Rate limiting**: Prevent excessive API calls

---

## Changelog

### 2025-01-05
- Fixed `speechAnalyzer.ts` import path in transcribe API
- Added documentation for `completeSession()` call sites
- Clarified speech metrics should be calculated once and saved (not recalculated)

### Previous Changes
- See commit history for full changelog
