# API Routes Documentation

> Last Updated: 2025-01-05
> Living documentation for all Next.js API routes

---

## Overview

All API routes use Next.js 14 App Router conventions with Route Handlers.
Located in `src/app/api/*/route.ts`.

### Security Features
- CSRF Protection (origin/referer validation)
- Rate Limiting (per-endpoint limits)
- Authentication checks (Supabase Auth)
- Input validation

---

## Authentication & Authorization

### POST /api/auth/callback
**Purpose**: Handle Supabase auth callbacks (OAuth, magic links)
**Security**: None (public callback)
**Response**: Redirects to appropriate page

---

## Interview & Session Management

### POST /api/generate-questions
**Purpose**: Generate AI interview questions using Claude 3.5 Sonnet
**Input**:
```typescript
{
  sessionType: 'job-interview' | 'sales-pitch' | 'presentation',
  context: string  // Job description, product details, or topic
}
```
**Output**:
```typescript
{
  questions: Array<{
    id: string,
    text: string,
    type: 'behavioral' | 'technical' | 'situational'
  }>
}
```
**Security**:
- CSRF Protection
- Rate Limit: 5 requests/hour
**Service**: `generateQuestions()` from `src/services/claude.ts`
**Cost**: ~$0.006 per request

### POST /api/transcribe
**Purpose**: Transcribe audio recordings using OpenAI Whisper
**Input**: FormData
```typescript
{
  audio: File,           // WebM, MP3, MP4, WAV, OGG (max 25MB)
  language?: string,     // Optional language hint
  prompt?: string        // Question text for context
}
```
**Output**:
```typescript
{
  transcript: string,
  duration: number,      // seconds
  language: string,      // detected language
  speechMetrics: {
    wordsPerMinute: number,
    fillerWordCount: number,
    clarityScore: number,      // 0-100
    pacingScore: number        // 0-100
  },
  transcribedAt: string  // ISO timestamp
}
```
**Security**:
- CSRF Protection
- Rate Limit: 10 requests/hour
- File size validation (25MB max)
- MIME type validation
**Service**:
- `transcribeAudio()` from `src/services/whisper.ts`
- `analyzeSpeech()` from `src/services/speechAnalyzer.ts`
**Cost**: ~$0.006 per minute of audio

**IMPORTANT**: Speech metrics are calculated during transcription and returned immediately. The frontend should save these to the database, NOT recalculate them client-side.

### PATCH /api/update-recording
**Purpose**: Update recording with transcript and speech metrics (background job)
**Input**:
```typescript
{
  recordingId: string,
  transcript: string,
  duration: number,
  speechMetrics: {
    wordsPerMinute: number,
    fillerWordCount: number,
    clarityScore: number,
    pacingScore: number
  }
}
```
**Output**: Success/error status
**Security**:
- CSRF Protection
- Auth required (user must own recording)
**Database**: Updates `recordings` table with transcript + metrics

### POST /api/generate-feedback
**Purpose**: Generate AI coaching feedback using Claude 3.5 Sonnet
**Input**:
```typescript
{
  sessionType: string,
  questionText: string,
  transcript: string,
  duration: number,
  speechMetrics: {
    wordsPerMinute: number,
    fillerWordCount: number,
    clarityScore: number,
    pacingScore: number
  },
  videoMetrics?: {
    eyeContactPercentage?: number,
    gazeStability?: number,
    dominantEmotion?: string,
    emotionConfidence?: number,
    presenceScore?: number
  },
  context?: string  // Session context
}
```
**Output**:
```typescript
{
  summary: string,        // Overall assessment
  strengths: string[],    // 2-3 specific strengths
  improvements: string[], // 2-3 actionable improvements
  nextSteps: string[]     // Concrete next actions
}
```
**Security**:
- CSRF Protection
- Rate Limit: 10 requests/hour
**Service**: `generateFeedback()` from `src/services/claude.ts`
**Cost**: ~$0.015 per request

---

## Subscription & Payments

### POST /api/create-checkout-session
**Purpose**: Create Stripe checkout session for subscription
**Input**:
```typescript
{
  priceId: string,  // Stripe price ID (monthly or annual)
  userId: string    // Supabase user ID
}
```
**Output**:
```typescript
{
  sessionId: string  // Stripe checkout session ID
}
```
**Security**:
- CSRF Protection
- Auth required
**Integration**: Stripe Checkout
**Redirect**: Success URL includes session_id for verification

### POST /api/webhooks/stripe
**Purpose**: Handle Stripe webhook events
**Events Handled**:
- `checkout.session.completed` - Create subscription
- `customer.subscription.updated` - Update subscription status
- `customer.subscription.deleted` - Cancel subscription
**Security**:
- Stripe webhook signature verification (REQUIRED)
- No CSRF (webhook endpoint)
**Database**: Updates `subscriptions` table
**CRITICAL**: This is the primary source of truth for subscription status

### POST /api/create-portal-session
**Purpose**: Create Stripe customer portal session
**Input**: None (uses authenticated user)
**Output**:
```typescript
{
  url: string  // Stripe portal URL
}
```
**Security**: Auth required
**Use Case**: Manage subscription, update payment method, view invoices

### GET /api/verify-subscription
**Purpose**: Safety net to verify subscription status from Stripe
**Input**: None (uses authenticated user)
**Output**:
```typescript
{
  isActive: boolean,
  subscriptionId?: string,
  status?: string,
  currentPeriodEnd?: string
}
```
**Security**: Auth required
**Use Case**: Manual verification if webhook fails
**NOTE**: Should rarely be needed - webhooks are primary source

---

## User Management

### DELETE /api/delete-account
**Purpose**: Permanently delete user account and all data
**Input**: None (uses authenticated user)
**Security**: Auth required, confirmation dialog on frontend
**Deletes**:
- User's sessions
- User's recordings (videos + metadata)
- User's analyses
- Supabase storage files
- User account
**CRITICAL**: This is irreversible

---

## Health & Monitoring

### GET /api/health
**Purpose**: Health check endpoint for monitoring
**Output**:
```typescript
{
  status: 'ok',
  timestamp: string,
  services: {
    database: 'ok' | 'error',
    storage: 'ok' | 'error'
  }
}
```
**Security**: Public (no auth)
**Use Case**: Uptime monitoring, deployment verification

---

## Rate Limiting Configuration

From `src/middleware/rateLimiter.ts`:

| Endpoint | Limit | Window |
|----------|-------|--------|
| /api/generate-questions | 5 requests | 1 hour |
| /api/transcribe | 10 requests | 1 hour |
| /api/generate-feedback | 10 requests | 1 hour |

Rate limits are per-user (identified by IP or Supabase user ID).

---

## Error Responses

All API routes follow consistent error format:

```typescript
{
  error: string,      // Error type
  message: string,    // Human-readable message
  timestamp?: string  // ISO timestamp
}
```

Common HTTP status codes:
- `400` - Bad request (invalid input)
- `401` - Unauthorized (no auth token)
- `403` - Forbidden (valid token, insufficient permissions)
- `404` - Not found
- `429` - Rate limit exceeded
- `500` - Internal server error

---

## Data Flow Examples

### Recording Flow (Complete Journey)

1. **Start Recording** (Frontend)
   - User clicks record
   - MediaPipe tracks eye contact in real-time
   - Audio + video captured as WebM

2. **Stop Recording** (Frontend → Electron → API)
   - Video saved to local disk via Electron IPC
   - Audio blob sent to `/api/transcribe`
   - Transcription runs in background (5-10 seconds)

3. **Transcription Complete** (API → Database)
   - `/api/transcribe` returns transcript + speech metrics
   - Frontend calls `/api/update-recording` with results
   - Database updated with all metrics

4. **Analysis Page** (Database → Frontend)
   - Read `clarity_score`, `pacing_score`, etc. from database
   - **DO NOT** recalculate from transcript
   - Call `/api/generate-feedback` for AI coaching

5. **History Page** (Database → Frontend)
   - Auto-refresh if metrics are null (background transcription still running)
   - Poll every 3 seconds (max 10 attempts = 30 seconds)
   - Stop polling once metrics populated

---

## Environment Variables Required

```bash
# Claude AI
ANTHROPIC_API_KEY=sk-ant-...

# OpenAI Whisper
OPENAI_API_KEY=sk-...

# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbG...
SUPABASE_SERVICE_ROLE_KEY=eyJhbG...

# Stripe
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_...
STRIPE_SECRET_KEY=sk_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

---

## Testing API Routes

### Using curl:

```bash
# Generate questions
curl -X POST http://localhost:3000/api/generate-questions \
  -H "Content-Type: application/json" \
  -d '{"sessionType":"job-interview","context":"Senior React Developer"}'

# Transcribe audio
curl -X POST http://localhost:3000/api/transcribe \
  -F "audio=@recording.webm" \
  -F "prompt=Tell me about yourself"

# Health check
curl http://localhost:3000/api/health
```

---

## Changelog

### 2025-01-05
- Fixed `/api/transcribe` import path to use correct `speechAnalyzer` service
- Added documentation for `/api/update-recording` endpoint
- Clarified data flow for speech metrics (calculate once, save to DB)

### Previous Changes
- See commit history for full changelog
