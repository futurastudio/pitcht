# Pitcht Development Tasks

> Last Updated: 2024-11-29

---

## Summary

| Phase | Status | Progress | Target |
|-------|--------|----------|--------|
| Phase 1: Foundation | ✅ COMPLETE | 100% | Done |
| Phase 2: AI Integration | ✅ COMPLETE | 100% (Sprint 1 ✅, Sprint 2 ✅, Sprint 3 ✅) | Done |
| Phase 3: Video Analysis | ✅ COMPLETE | 100% (Sprint 4 ✅, Sprint 5A ✅) | Done |
| Phase 4: Backend | ✅ COMPLETE | 100% (Sprint 5B ✅) | Done |
| Phase 5: Auth & Monetization | ✅ COMPLETE | 93% (Sprint 6: Phases A-F ✅, G optional) | **PRODUCTION READY** 🚀 |

## Storage Architecture

### Current (Hybrid: Local + Cloud) ✅
- **Videos**:
  - Local: `~/Library/Application Support/Electron/recordings/` (auto-save, no dialogs)
  - Cloud: Supabase Storage buckets (uploaded automatically after recording)
- **Session Data**:
  - React Context (in-memory for current session)
  - Supabase PostgreSQL (persistent cloud storage)
- **Authentication**: Anonymous auth (no signup required)
- **User Accounts**: Sprint 6 - will add email/password auth and account conversion

---

## Phase 1: Foundation ✅ COMPLETE

- [x] Research & Planning
- [x] Project Setup (Electron + Next.js + Tailwind)
- [x] Core UI (Glassmorphism, Video Feed, Controls)
- [x] Dashboard with session selection
- [x] Session Setup Modal with context input
- [x] Interview page with multi-question flow
- [x] Recording & Storage (Electron IPC)
- [x] Analysis page with video playback
- [x] Demo Mode with mock data
- [x] InterviewContext for state management
- [x] localStorage persistence

---

## Phase 2: AI Integration 🔄 TODAY

### Sprint 1: Question Generation ✅ COMPLETE
- [x] **Setup**
  - [x] Create `.env.local` with API keys (Claude, OpenAI, Supabase)
  - [x] Install `@anthropic-ai/sdk`, `openai`, `@supabase/supabase-js` packages
- [x] **TypeScript Types**
  - [x] Create `src/types/interview.ts` with Question, SessionType, Recording interfaces
- [x] **Claude Service**
  - [x] Create `src/services/claude.ts` with intelligent prompts
  - [x] Create `src/app/api/generate-questions/route.ts`
  - [x] Implement prompts for:
    - [x] Job Interview questions (behavioral → technical flow)
    - [x] Sales Pitch questions
    - [x] Presentation questions
- [x] **Frontend Integration**
  - [x] Update `SessionSetupModal.tsx` to call real API
  - [x] Remove `generateMockQuestions()` function
  - [x] Add "AI thinking" progress indicators
  - [x] Add error handling for API failures

### Sprint 2: Speech-to-Text ✅ COMPLETE
- [x] **Whisper Service**
  - [x] Create `src/app/api/transcribe/route.ts` (OpenAI Whisper API)
  - [x] Handle WebM audio input via FormData
  - [x] Pass question text as prompt for better accuracy
- [x] **Integration**
  - [x] Add `transcript` and `duration` fields to Recording type
  - [x] Call Whisper API after recording stops (parallel with video save)
  - [x] Store transcript with recording in InterviewContext
  - [x] Create `src/components/TranscriptViewer.tsx` with filler word highlighting
  - [x] Display transcript in Analysis page with word count
  - [x] Add transcription status indicator ("Transcribing audio...")

### UI/UX Improvements ✅ COMPLETE
- [x] **Prompter Redesign**
  - [x] Moved from `top-1/4` to `bottom-32` (teleprompter style)
  - [x] Reduced font size from `text-5xl` to `text-2xl` (doesn't block face)
- [x] **Recording Timer**
  - [x] Added `recordingDuration` state + useEffect timer in interview page
  - [x] Positioned top-left next to back button (clean, non-intrusive)
  - [x] Red pill badge with pulsing dot + MM:SS format
- [x] **Analysis Page Layout**
  - [x] Changed from grid to flex layout (30% sidebar / 70% analysis)
  - [x] Left sidebar: Scrollable video list with Q# + duration/skip badges
  - [x] Right area: Video player + transcript + metrics
  - [x] Added custom scrollbar styling in `globals.css`
- [x] **Auto-Save Recording Flow**
  - [x] Created `getRecordingsDirectory()` in `electron/main.ts`
  - [x] Videos save silently to `~/Library/Application Support/Electron/recordings/`
  - [x] Auto-generated filenames with timestamps
  - [x] Created `electron/preload.js` to expose IPC handlers
  - [x] Added `read-video` handler for analysis page playback
  - [x] **Eliminated all save dialog interruptions**

### Sprint 3: Speech Analysis & Feedback ✅ COMPLETE
- [x] **Speech Metrics**
  - [x] Create `src/services/speechAnalyzer.ts` with comprehensive analysis
  - [x] Implement filler word detection (25+ common filler words/phrases)
  - [x] Calculate words per minute (WPM) with ideal range scoring
  - [x] Calculate clarity score (based on filler word ratio)
  - [x] Calculate pacing score (120-150 WPM optimal)
- [x] **AI Feedback Generation**
  - [x] Create `src/app/api/generate-feedback/route.ts`
  - [x] Design coaching prompt for Claude (uses existing generateFeedback from claude.ts)
  - [x] Return structured feedback JSON (summary, strengths, improvements, next steps)
  - [x] Integrate speech metrics into Claude feedback
- [x] **Analysis Page Updates**
  - [x] Replace `DEMO_METRICS` with real calculated metrics
  - [x] Auto-generate feedback when recording is selected
  - [x] Display AI coaching feedback with strengths and improvements
  - [x] Show real-time metrics (Clarity %, Pacing %, WPM, Filler Words)
  - [x] Add loading state for feedback generation

---

## Phase 3: Video Analysis ✅ COMPLETE

### Sprint 4: Video Metrics ✅ COMPLETE
- [x] **MediaPipe Integration** (Browser-based, FREE)
  - [x] Install `@mediapipe/face_mesh`, `@mediapipe/camera_utils`, `@tensorflow/tfjs-core`
  - [x] Create `src/services/faceTracker.ts` with singleton service pattern
  - [x] Implement eye contact tracking using iris landmarks (468, 473)
  - [x] Calculate gaze direction vs camera (0.15 threshold for center gaze)
  - [x] Calculate eye contact percentage and gaze stability
- [x] **DeepFace Integration** (Python microservice, FREE)
  - [x] Create `python-services/` directory
  - [x] Create `python-services/emotion_service.py` (Flask API on port 5001)
  - [x] Create `python-services/requirements.txt` (deepface==0.0.79, flask, opencv-python)
  - [x] Create `python-services/setup.sh` for environment setup
  - [x] Implement emotion detection API with 4 endpoints (/health, /analyze-frame, /analyze-video, /analyze-video-path)
  - [x] Create `src/services/emotionAnalyzer.ts` (TypeScript client)
  - [x] Implement emotion scoring (happy=100, surprise=85, neutral=70, etc.)
- [x] **Combined Video Metrics**
  - [x] Create `src/services/videoAnalyzer.ts` for presence score calculation
  - [x] Calculate Presence Score (60% eye contact + 40% emotion weight)
  - [x] Update TypeScript types with video metrics (eyeContactPercentage, dominantEmotion, presenceScore)
  - [x] Update InterviewContext with video metrics fields
  - [x] Integrate video metrics into Claude feedback prompt
  - [x] Update analysis page UI with Eye Contact, Presence Score, and Emotion displays
  - [x] Build and test successfully with no errors

### Sprint 5A: Live Video Analysis Integration ✅ COMPLETE
- [x] **Python Service Lifecycle**
  - [x] Modified `electron/main.ts` to start Python emotion service on app launch
  - [x] Added service cleanup on app quit
  - [x] Added error handling for service failures
- [x] **MediaPipe Live Integration**
  - [x] Integrated face tracker into `VideoFeed.tsx` component
  - [x] Implemented manual frame processing with requestAnimationFrame
  - [x] Loaded MediaPipe from CDN (no build issues)
  - [x] Added face tracker initialization when video element ready
  - [x] Start/stop tracking synchronized with recording state
- [x] **Recording Flow Updates**
  - [x] Modified `interview/page.tsx` to handle eye tracking metrics
  - [x] Added emotion analysis trigger after recording stops
  - [x] Implemented 10-second timeout for emotion analysis
  - [x] Calculate presence score from real metrics
  - [x] Store all metrics with recording
- [x] **Analysis Page Real Data**
  - [x] Removed all demo data (DEMO_RECORDINGS, DEMO_METRICS)
  - [x] Display real eye contact percentage
  - [x] Display real gaze stability
  - [x] Display real dominant emotion with confidence
  - [x] Display real presence score
  - [x] Added sectioned UI (Speech Analysis vs Video Analysis)
- [x] **Critical Bug Fixes**
  - [x] Fixed React closure bug in VideoFeed (stale isTrackerReady state)
  - [x] Fixed MediaPipe FaceMesh import (loaded from window object)
  - [x] Fixed Camera import error (manual frame processing)
  - [x] Added graceful degradation when services unavailable
- [x] **Testing & Validation**
  - [x] Eye tracking working (59% eye contact, 71% gaze stability tested)
  - [x] Metrics displaying in analysis page
  - [x] Build succeeding with no errors
  - [x] App continues working when Python service down

---

## Phase 4: Backend ✅ COMPLETE

### Sprint 5B: Supabase Backend Integration ✅ COMPLETE
- [x] **Database Setup** (automated scripts)
  - [x] Created `scripts/setup-database.js` (creates tables, RLS, indexes)
  - [x] Created `scripts/setup-storage.js` (creates storage bucket)
  - [x] Created `scripts/setup-storage-policies.js` (applies storage RLS)
  - [x] Created `scripts/verify-setup.js` (verifies all configurations)
  - [x] Database tables: sessions, questions, recordings, analyses (with foreign keys)
  - [x] Row Level Security (RLS) enabled on all tables (11 policies)
  - [x] Storage bucket for videos (private, with 4 RLS policies)
  - [x] Indexes for performance (6 indexes on user_id, session_id, etc.)
- [x] **Service Layer**
  - [x] Created `src/services/supabase.ts` (client + upload/download helpers)
  - [x] Created `src/services/sessionManager.ts` (CRUD operations)
  - [x] Created `src/services/auth.ts` (anonymous auth)
- [x] **Authentication** (Anonymous for now)
  - [x] Supabase Auth setup with anonymous sign-in
  - [x] Auto-create anonymous user on app mount
  - [x] No signup/login UI needed yet (Sprint 6)
- [x] **Integration**
  - [x] Integrated sessionManager with InterviewContext
  - [x] Auto-create Supabase session when questions generated
  - [x] Auto-upload recordings to cloud storage
  - [x] Graceful degradation (localStorage fallback if upload fails)
  - [x] All metrics saved to database (speech + video + emotion)

### Sprint 6: Auth & Premium Tier ✅ COMPLETE (93%, Phase G optional)
**See**: `STRIPE_INTEGRATION.md` for detailed Stripe setup documentation

- [x] **Phase A: Authentication Foundation** (6-8 hours) ✅ COMPLETE
  - [x] AuthContext with user state and subscription logic
  - [x] LoginModal (email + Google OAuth)
  - [x] SignupModal (7-day trial signup)
  - [x] Header component with user menu
  - [x] PaywallModal for session limits
  - [x] AccountConversionModal (anonymous → real account)
- [x] **Phase B: Subscription Management** (3-4 hours) ✅ COMPLETE
  - [x] subscriptionManager.ts service
  - [x] Subscriptions database table
  - [x] Free tier limits (1 session/month)
  - [x] Trial period tracking (7 days)
  - [x] Email reminder templates (Day 3, 6, 8)
- [x] **Phase C: Session Limit Enforcement** (2-3 hours) ✅ COMPLETE
  - [x] Check session limits before practice
  - [x] Show PaywallModal when exceeded
  - [x] Blur Analysis page for anonymous users
  - [x] AccountConversionModal on analysis page
- [x] **Phase D: Session History Page** (4-5 hours) ✅ COMPLETE
  - [x] List all past sessions with SessionCard component
  - [x] Filter by session type (All, Job Interview, Sales Pitch, Presentation)
  - [x] View/delete sessions with confirmation
  - [x] Session detail page (/session/[id])
  - [x] Video playback from cloud storage
- [x] **Phase E: Progress Tracking** (3-4 hours) ✅ COMPLETE
  - [x] Install Recharts library
  - [x] Create ProgressMetrics component
  - [x] Overall Performance Score with trend indicators
  - [x] Eye contact improvement mini-chart (last 5 sessions)
  - [x] Filler Words reduction mini-chart (last 5 sessions)
  - [x] getUserProgressData() function in sessionManager
- [x] **Phase F: Stripe Integration** (6-8 hours) ✅ COMPLETE
  - [x] Stripe account setup (test mode)
  - [x] Pricing products created (Monthly $27, Annual $259)
  - [x] /pricing page with Liquid Glass UI
  - [x] /api/create-checkout-session endpoint
  - [x] /api/webhooks/stripe endpoint with signature verification
  - [x] /api/verify-subscription endpoint (safety net)
  - [x] /success page with confetti and feature overview
  - [x] /settings page with account management
  - [x] Subscriptions table with RLS policies
  - [x] Storage bucket setup with video policies
  - [x] Multi-layer subscription sync architecture
  - [x] Header "Upgrade to Premium" button
  - [x] Fixed deprecated Stripe API (redirectToCheckout)
  - [x] Production-ready webhook handling
- [ ] **Phase G: Email Reminder Cron** (2-3 hours) ⏳ OPTIONAL
  - [ ] Resend.com setup for transactional emails
  - [ ] Cron job API route for trial reminders
  - [ ] Email sending (Day 3, 6, 8 of trial)
  - Note: Can be added post-launch when user base grows

---

## Tech Stack (CONFIRMED)

| Category | Tool | Cost | Notes |
|----------|------|------|-------|
| **Question Generation** | Claude 3.5 Sonnet | $0.006/session | Best context understanding |
| **Transcription** | OpenAI Whisper | $0.006/min | 95%+ accuracy, WebM support |
| **Eye Tracking** | MediaPipe | FREE | Browser-based, real-time |
| **Emotion Detection** | DeepFace | FREE | 97% accuracy, 7 emotions |
| **Feedback Generation** | Claude 3.5 Sonnet | $0.015/session | Empathetic coaching |
| **Database** | Supabase | FREE tier | PostgreSQL + Auth + Storage |

---

## API Keys Required

| Service | Status | Get From |
|---------|--------|----------|
| Claude (Anthropic) | ⏳ NEEDED | console.anthropic.com |
| OpenAI (Whisper) | ⏳ NEEDED | platform.openai.com |
| Supabase | ⏳ Later | supabase.com |

---

## Files Created ✅

```
src/
├── services/
│   ├── claude.ts                        # ✅ Claude API client with intelligent prompts
│   ├── whisper.ts                       # ✅ Whisper API client for transcription
│   ├── speechAnalyzer.ts                # ✅ Filler words, WPM, clarity/pacing scores
│   ├── faceTracker.ts                   # ✅ MediaPipe eye contact tracking (Sprint 4)
│   ├── emotionAnalyzer.ts               # ✅ DeepFace client with emotion scoring (Sprint 4)
│   ├── videoAnalyzer.ts                 # ✅ Presence score calculator (Sprint 4)
│   ├── supabase.ts                      # ✅ Supabase client + upload/download helpers (Sprint 5B)
│   ├── sessionManager.ts                # ✅ CRUD operations for sessions/recordings (Sprint 5B)
│   └── auth.ts                          # ✅ Anonymous authentication helper (Sprint 5B)
├── app/
│   └── api/
│       ├── generate-questions/route.ts  # ✅ Question generation endpoint
│       ├── transcribe/route.ts          # ✅ Whisper transcription endpoint
│       └── generate-feedback/route.ts   # ✅ AI coaching feedback with metrics
├── components/
│   └── TranscriptViewer.tsx             # ✅ Transcript display with filler highlights
└── types/
    └── interview.ts                     # ✅ TypeScript interfaces

electron/
└── preload.js                           # ✅ IPC handlers for save-video & read-video

python-services/
├── emotion_service.py                   # ✅ Flask API for DeepFace (Sprint 4)
├── requirements.txt                     # ✅ Python dependencies (Sprint 4)
└── setup.sh                             # ✅ Python environment setup script (Sprint 4)

scripts/
├── setup-database.js                    # ✅ Automated database schema setup (Sprint 5B)
├── setup-storage.js                     # ✅ Automated storage bucket setup (Sprint 5B)
├── setup-storage-policies.js            # ✅ Automated storage RLS policies (Sprint 5B)
└── verify-setup.js                      # ✅ Verify all Supabase configurations (Sprint 5B)
```

---

## Files Modified ✅

| File | Changes |
|------|---------|
| `src/components/SessionSetupModal.tsx` | ✅ Replace mock → Claude API, "AI thinking" indicators, Fix Question import (Sprint 5B) |
| `src/app/interview/page.tsx` | ✅ Add transcription, recording timer, auto-save flow, Pass videoBlob to addRecording (Sprint 5B) |
| `src/app/analysis/page.tsx` | ✅ 30/70 layout, transcript display, video list sidebar, video metrics UI |
| `src/components/Prompter.tsx` | ✅ Teleprompter positioning, font size reduction |
| `src/components/Controls.tsx` | ✅ (No changes needed) |
| `src/context/InterviewContext.tsx` | ✅ Add transcript + duration + video metrics + Supabase integration (Sprint 5B) |
| `src/services/claude.ts` | ✅ Enhanced feedback prompts with video metrics |
| `src/app/api/generate-feedback/route.ts` | ✅ Accept and return video metrics |
| `src/types/interview.ts` | ✅ Add video metrics to Recording interface |
| `src/app/globals.css` | ✅ Custom scrollbar styling |
| `electron/main.ts` | ✅ Auto-save recordings, read-video handler, start Python service |
| `package.json` | ✅ Add @anthropic-ai/sdk, openai, @mediapipe/face_mesh, @tensorflow/tfjs-core, @supabase/supabase-js, pg, dotenv |
| `.env.local` | ✅ Add API keys (Claude, OpenAI, Supabase) |

---

## Cost Per Session (Phase 2)

| Step | Service | Cost |
|------|---------|------|
| Generate 5-7 questions | Claude | $0.006 |
| Transcribe 5 min audio | Whisper | $0.03 |
| Generate feedback | Claude | $0.015 |
| **Total** | | **~$0.05** |

---

## Today's Execution Order

```
1. ⏳ Get API keys (Claude + OpenAI)
2. ⏳ Create .env.local
3. ⏳ npm install @anthropic-ai/sdk openai
4. ⏳ Build Claude service + API route
5. ⏳ Update SessionSetupModal (real questions)
6. ⏳ Build Whisper service + API route
7. ⏳ Update interview page (transcription)
8. ⏳ Build speech analyzer
9. ⏳ Build feedback API route
10. ⏳ Update analysis page (real data)
```

---

## Success Criteria

### Phase 2 Complete ✅
- [x] User enters job description → Gets AI-generated questions (Claude)
- [x] User records answer → Gets accurate transcript (Whisper)
- [x] Recording flow is streamlined (auto-save, no dialogs)
- [x] Transcript displayed in Analysis page with filler word highlighting
- [x] UI is professional and non-intrusive (teleprompter, timer, clean layout)
- [x] User sees real metrics (filler words detected & counted, WPM calculated)
- [x] User gets personalized AI coaching feedback (Claude with full context)
- [x] Analysis page shows real performance scores (Clarity %, Pacing %, WPM, Filler Words)
- [x] Feedback displays strengths and improvement suggestions

### Sprint 4 Complete ✅ (Video Analysis)
- [x] Eye contact tracking service created with MediaPipe Face Mesh
- [x] Emotion detection service created with DeepFace (Python Flask API)
- [x] Presence score calculation (60% eye contact + 40% emotion)
- [x] Video metrics integrated into TypeScript types
- [x] Enhanced AI feedback with video data (eyeContactPercentage, dominantEmotion, presenceScore)
- [x] Analysis page UI updated with Eye Contact, Presence Score, and Emotion badge
- [x] All services tested and building successfully

### Sprint 5B Complete ✅ (Supabase Backend)
- [x] Database schema design (sessions, questions, recordings, analyses)
- [x] Supabase project setup and configuration
- [x] Video upload to Supabase Storage (automatic after recording)
- [x] Session metadata persistence (auto-save when questions generated)
- [x] Anonymous authentication (no login required)
- [x] Graceful degradation (localStorage fallback)

### Sprint 6 Complete ✅ (Auth & Monetization)
- [x] Email/password authentication UI (with Google OAuth)
- [x] Account conversion (anonymous → real account)
- [x] History page to view past sessions (with filtering and progress charts)
- [x] Progress tracking charts (Overall Score, Eye Contact, Filler Words)
- [x] Stripe integration (checkout, webhooks, subscriptions)
- [x] Multi-layer subscription sync
- [x] Settings page with account management
- [x] Free tier limits enforcement
- [x] Premium tier unlocking
- [x] **PRODUCTION READY** 🚀

### Optional Future Enhancements
- [ ] Email reminder cron (Phase G - post-launch)
- [ ] Error boundaries for graceful error handling
- [ ] Production build optimization
- [ ] Advanced analytics dashboard
- [ ] Team/enterprise plans
- [ ] Mobile app version