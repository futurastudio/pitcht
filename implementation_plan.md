# Pitcht Implementation Plan - Production Ready

> Last Updated: 2024-11-29

## Current Status
- UI/UX: ✅ Complete (with teleprompter, timer, analysis layout improvements, Liquid Glass design)
- Video Recording: ✅ Complete (auto-save to local + cloud storage)
- AI Integration: ✅ Complete (Sprint 1 ✅ | Sprint 2 ✅ | Sprint 3 ✅ | Sprint 4 ✅)
- Video Analysis: ✅ Complete (Eye tracking + Emotion detection + Live Integration - Sprint 5A ✅)
- Backend: ✅ Complete (Supabase integration - Sprint 5B ✅)
- Auth & Monetization: ✅ Complete (Sprint 6 ✅ - 100%, all bugs fixed)
- **PRODUCTION READY** 🚀 (Security audit recommended before public launch)

## Storage Architecture

### Current (Hybrid: Local + Cloud) ✅
- **Videos**:
  - Local: Saved to `~/Library/Application Support/Electron/recordings/`
  - Cloud: Uploaded to Supabase Storage buckets (automatic after recording)
- **Session Data**:
  - React Context (in-memory for current session)
  - Supabase PostgreSQL (persistent cloud storage)
- **Authentication**: Anonymous auth (no signup required, auto-created on first use)
- **Data Security**: Row Level Security (RLS) policies ensure users only access their own data

### Future (Sprint 6 - Auth & Polish)
- **User Accounts**: Email/password authentication with account conversion
- **Session History**: View and manage past practice sessions
- **Progress Tracking**: Charts showing improvement over time

---

## Technology Stack (FINAL)

### AI Services
| Use Case | Service | Cost | Status |
|----------|---------|------|--------|
| Question Generation | Claude 3.5 Sonnet | $0.006/session | ✅ Complete |
| Speech-to-Text | OpenAI Whisper | $0.006/min | ✅ Complete |
| Eye Tracking | MediaPipe Face Mesh | FREE | ✅ Complete |
| Emotion Detection | DeepFace (Python) | FREE | ✅ Complete |
| Feedback Generation | Claude 3.5 Sonnet | $0.015/session | ✅ Complete |

### Backend (Phase 3)
- **Database**: Supabase (PostgreSQL)
- **Auth**: Supabase Auth
- **Storage**: Supabase Storage (video files)

### Frontend
- **Framework**: Next.js 16 + React 19
- **Desktop**: Electron 39
- **Styling**: Tailwind CSS 4

---

## User Personas

### 1. Job Seekers (60% of users)
- Practice with questions specific to THEIR job description
- Need feedback on technical accuracy + delivery
- Want to see improvement over time

### 2. Executives/Directors (25% of users)
- Practice keynotes, board presentations, all-hands
- Need feedback on executive presence + authority
- Practice handling tough Q&A

### 3. Sales Professionals (15% of users)
- Practice pitches for specific prospects
- Handle objections smoothly
- Master discovery and closing

---

## The 5 Core Use Cases

| # | Use Case | Service | Input | Output |
|---|----------|---------|-------|--------|
| 1 | Question Generation | Claude 3.5 Sonnet | Job desc/topic | 5-7 tailored questions |
| 2 | Speech-to-Text | OpenAI Whisper | WebM recording | Accurate transcript |
| 3 | Eye Tracking | MediaPipe | Live video | Gaze percentage |
| 4 | Emotion Detection | DeepFace | Video frames | Emotion timeline |
| 5 | Feedback Generation | Claude 3.5 Sonnet | All data | Coaching feedback |

---

## 3-Day Sprint Plan

### Day 1 (TODAY): AI Core Pipeline

#### Sprint 1: Question Generation ✅ COMPLETE
```
✅ 1. Create .env.local with API keys (Claude, OpenAI, Supabase)
✅ 2. npm install @anthropic-ai/sdk openai @supabase/supabase-js
✅ 3. Create src/types/interview.ts (TypeScript interfaces)
✅ 4. Create src/services/claude.ts (with intelligent interview flow prompts)
✅ 5. Create src/app/api/generate-questions/route.ts
✅ 6. Update SessionSetupModal.tsx → real Claude API with "AI thinking" indicator
✅ 7. Questions follow real interview structure: behavioral → technical → situational
```

#### Sprint 2: Speech-to-Text ✅ COMPLETE
```
✅ 1. Create src/app/api/transcribe/route.ts (OpenAI Whisper integration)
✅ 2. Add transcript + duration fields to Recording type in InterviewContext
✅ 3. Call Whisper API after recording stops (parallel with video save)
✅ 4. Create src/components/TranscriptViewer.tsx with filler word highlighting
✅ 5. Display transcript in Analysis page with word count + duration
✅ 6. Add transcription status indicator ("Transcribing audio...")
```

#### Additional Improvements ✅ COMPLETE
```
✅ 1. Redesigned Prompter component:
      - Moved from top-1/4 to bottom-32 (teleprompter style)
      - Reduced font size from text-5xl to text-2xl (doesn't block face)
✅ 2. Recording timer implementation:
      - Added recording duration state + useEffect timer
      - Positioned top-left next to back button (clean, non-intrusive)
✅ 3. Analysis page layout redesign:
      - Changed from grid to flex layout (30% sidebar / 70% analysis)
      - Left sidebar: Scrollable video list with Q# badges + duration/skip indicators
      - Right area: Video player + transcript + metrics cards
✅ 4. Auto-save video recording (NO DIALOGS):
      - Created getRecordingsDirectory() helper
      - Videos save silently to ~/Library/Application Support/Electron/recordings/
      - Auto-generated filenames with timestamps
      - Added read-video IPC handler for analysis page playback
✅ 5. Custom scrollbar styling for analysis sidebar
```

#### Sprint 3: Analysis & Feedback ✅ COMPLETE
```
✅ 1. Create src/services/speechAnalyzer.ts (filler words, WPM, clarity/pacing scores)
✅ 2. Implement filler word detection (25+ common filler words/phrases)
✅ 3. Calculate WPM with ideal range scoring (120-150 WPM optimal)
✅ 4. Create src/app/api/generate-feedback/route.ts (Claude + speech metrics)
✅ 5. Update analysis page with real data (auto-generate feedback on recording selection)
✅ 6. Display real metrics (Clarity %, Pacing %, WPM, Filler Word count)
✅ 7. Show AI feedback with strengths and improvement suggestions
```

**End of Sprint 3**: ✅ Full AI pipeline working (questions → recording → transcript → feedback)

#### Sprint 4: Video Analysis ✅ COMPLETE
```
✅ 1. Install @mediapipe/face_mesh @mediapipe/camera_utils @tensorflow/tfjs-core
✅ 2. Create src/services/faceTracker.ts (MediaPipe eye contact tracking)
✅ 3. Track eye contact percentage and gaze stability during recording
✅ 4. Create python-services/emotion_service.py (Flask API for DeepFace)
✅ 5. Set up Python environment with requirements.txt and setup.sh
✅ 6. Create src/services/emotionAnalyzer.ts (DeepFace client + emotion scoring)
✅ 7. Create src/services/videoAnalyzer.ts (presence score calculation)
✅ 8. Add video metrics to TypeScript types (eyeContactPercentage, dominantEmotion, presenceScore)
✅ 9. Update InterviewContext with video metrics fields
✅ 10. Update generate-feedback API to accept and return video metrics
✅ 11. Enhance Claude feedback prompts with video metrics
✅ 12. Update analysis page UI with Eye Contact, Presence Score, and Emotion displays
```

**End of Sprint 4**: ✅ Complete multimodal analysis (speech + video + emotion)

---

### Sprint 5A: Live Video Analysis Integration ✅ COMPLETE

**Goal**: Integrate Sprint 4 services into live recording flow

**See**: `SPRINT_5A_PLAN.md` for detailed implementation plan

**Key Tasks**:
```
✅ 1. Start Python emotion service with Electron
✅ 2. Integrate eye tracking into VideoFeed component
✅ 3. Trigger emotion analysis after recording
✅ 4. Replace demo data with real metrics
✅ 5. Pass video metrics to Claude feedback
✅ 6. Add error handling and graceful degradation
```

**Completed Time**: 8-10 hours (1 full day)

**End of Sprint 5A**: ✅ Users get REAL video metrics during practice

---

### Sprint 5B: Supabase Backend & Persistence ✅ COMPLETE

**Goal**: Add cloud storage, authentication, and session persistence

**See**: `SPRINT_5B_PLAN.md` for detailed implementation plan

**Completed Tasks**:
```
✅ 1. Set up Supabase project and database schema (automated with scripts)
✅ 2. Configure Row Level Security (RLS) for data protection (11 policies)
✅ 3. Create Storage bucket for video files (private bucket with 4 RLS policies)
✅ 4. Implement anonymous authentication (no signup UI needed yet)
✅ 5. Create session management service (CRUD operations in sessionManager.ts)
✅ 6. Integrate Supabase with interview flow (auto-upload recordings)
✅ 7. Add graceful degradation (localStorage fallback)
```

**Time Taken**: ~6 hours (automated scripts saved significant time)

**End of Sprint 5B**: ✅ Cloud persistence working, recordings save automatically

---

### Sprint 6: Authentication & Premium Tier ✅ COMPLETE (100% complete)

**Goal**: Add monetization layer with authentication, 7-day trial, premium subscriptions ($27/month)

**See**: `STRIPE_INTEGRATION.md` for detailed Stripe setup documentation

**Completed Tasks (Phases A-F - 26-32 hours)**:
```
✅ Phase A: Authentication Foundation (6-8 hours)
  - AuthContext with user state and subscription logic
  - LoginModal (email + Google OAuth)
  - SignupModal (7-day trial signup)
  - Header component with user menu
  - PaywallModal for session limits
  - AccountConversionModal (anonymous → real account)

✅ Phase B: Subscription Management (3-4 hours)
  - subscriptionManager.ts service
  - Subscriptions database table
  - Free tier limits (1 session/month)
  - Trial period tracking (7 days)
  - Email reminder templates

✅ Phase C: Session Limit Enforcement (2-3 hours)
  - Session limit checks in SessionSetupModal
  - PaywallModal integration when limit exceeded
  - Blurred analysis page for anonymous users
  - AccountConversionModal overlay on analysis

✅ Phase D: Session History Page (4-5 hours)
  - SessionCard component with delete functionality
  - /history page with filtering and date grouping
  - /session/[id] details page with video playback
  - Integration with Supabase backend

✅ Phase E: Progress Tracking Charts (3-4 hours)
  - ProgressMetrics component with 3 metric cards
  - Overall Performance Score with trend indicators
  - Eye Contact improvement mini chart (last 5 sessions)
  - Filler Words reduction mini chart (last 5 sessions)
  - Integrated into History page (simple, practical design)
  - getUserProgressData() function in sessionManager
  - Recharts library for visualizations

✅ Phase F: Stripe Integration (6-8 hours)
  - Stripe account setup with test mode
  - Created pricing products (Monthly: $27, Annual: $259 with 20% savings)
  - /pricing page with Liquid Glass UI and feature comparison
  - /api/create-checkout-session endpoint (7-day trial included)
  - /api/webhooks/stripe endpoint for subscription events
  - /api/verify-subscription endpoint (safety net for webhook failures)
  - /success page with confetti animation and feature overview
  - /settings page with account management and Stripe portal link
  - Multi-layer subscription sync architecture:
    - Layer 1: Stripe webhooks (primary)
    - Layer 2: Verification endpoint on success page (backup)
    - Layer 3: Auto-refresh in AuthContext (UX)
  - Subscriptions table with RLS policies
  - Storage bucket with video upload policies
  - Fixed deprecated Stripe API (redirectToCheckout → URL redirect)
  - Production-ready webhook signature verification
  - Header "Upgrade to Premium" button for free users
  - PaywallModal gradient button styling
  - Full database schema verification
```

**Post-Implementation Bug Fixes (2 hours)**:
```
✅ Critical Bugs Fixed (Production Launch Blockers):
  1. useEffect Infinite Loop Bug
     - Issue: success/page.tsx had `isVerifying` in dependency array
     - Impact: Verification endpoint never called, subscriptions not syncing
     - Fix: Removed from deps, added React.StrictMode handling

  2. RLS Policy Violation
     - Issue: verify-subscription used anon key to insert subscriptions
     - Impact: "row violates row-level security policy" error
     - Fix: Created supabaseAdmin client with service role key

  3. AuthContext Status Filter Bug
     - Issue: Only looked for status='active', missed 'trialing' subscriptions
     - Impact: Users on free trial showed as "Free" instead of "Trial Active"
     - Fix: Changed query to `.in('status', ['active', 'trialing'])`

  4. Duplicate Constraint Error
     - Issue: stripe_customer_id had unwanted unique constraint
     - Impact: Second subscription attempt failed with duplicate key error
     - Fix: Removed constraint via SQL (ALTER TABLE DROP CONSTRAINT)

  5. Broken Customer Portal Link
     - Issue: Hardcoded test URL that didn't work
     - Impact: Users couldn't manage billing
     - Fix: Created /api/create-portal-session endpoint with dynamic session
```

**Optional Future Enhancements (Phase G - 2-3 hours)**:
```
⏳ Phase G: Email Reminder Cron (Optional)
  - Resend.com setup for transactional emails
  - Cron job API route for trial expiry reminders
  - Email templates (Day 3, 6, 8 of trial)
  Note: Can be added post-launch when user base grows
```

**Pricing Strategy**:
- Free: 7-day trial, then 1 session/month
- Premium: $27/month (unlimited sessions + history + charts)
- Annual: $259/year (save 20%, equivalent to $21.60/month)

**Time Taken**: 20-24 hours done, 8-11 hours remaining
**End of Sprint 6**: Users can signup, trial, upgrade to Premium, view history, track progress

---

## Files to Create

### Day 1 Files
```
src/services/
├── claude.ts              # Claude API client
├── whisper.ts             # Whisper API client
└── speechAnalyzer.ts      # Filler words, WPM

src/app/api/
├── generate-questions/route.ts
├── transcribe/route.ts
└── generate-feedback/route.ts

src/components/
└── TranscriptViewer.tsx

src/types/
├── interview.ts
└── analysis.ts
```

### Sprint 4 Files (COMPLETE)
```
src/services/
├── faceTracker.ts         # MediaPipe eye tracking ✅
├── emotionAnalyzer.ts     # DeepFace client ✅
└── videoAnalyzer.ts       # Presence score calculator ✅

python-services/
├── emotion_service.py     # Flask API for DeepFace ✅
├── requirements.txt       # Python dependencies ✅
└── setup.sh              # Python environment setup ✅
```

### Day 3 Files
```
src/services/
└── supabase.ts

src/context/
└── AuthContext.tsx

src/app/
├── login/page.tsx
├── signup/page.tsx
└── history/page.tsx
```

---

## Files to Modify

| File | Day | Changes |
|------|-----|---------|
| `SessionSetupModal.tsx` | 1 | Replace mock → Claude API |
| `interview/page.tsx` | 1 | Add transcription |
| `analysis/page.tsx` | 1 | Real metrics + feedback |
| `InterviewContext.tsx` | 1 | Add transcript field |
| `package.json` | 1 | Add dependencies |
| `VideoFeed.tsx` | 2 | Add MediaPipe tracking |
| `InterviewContext.tsx` | 3 | Add Supabase sync |

---

## Environment Variables

```env
# .env.local

# Day 1 - Required
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...

# Day 3 - Backend
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
```

---

## Cost Summary

### Per Session
| Service | Cost |
|---------|------|
| Claude (questions) | $0.006 |
| Whisper (5 min) | $0.03 |
| MediaPipe | FREE |
| DeepFace | FREE |
| Claude (feedback) | $0.015 |
| **Total** | **~$0.05** |

### Monthly (1000 sessions)
| Service | Cost |
|---------|------|
| Claude | $21 |
| Whisper | $30 |
| Supabase | FREE tier |
| **Total** | **~$51/month** |

---

## Success Criteria

### Day 1 Complete ✅:
- [x] Real questions generated from job description (Claude API)
- [x] Recordings transcribed accurately (Whisper API)
- [x] Auto-save recording flow (no interrupting dialogs)
- [x] Transcript viewer with filler word highlighting
- [x] UI improvements (teleprompter, timer, analysis layout)
- [x] Filler words detected and counted
- [x] WPM calculated with scoring
- [x] AI coaching feedback generated (Claude + metrics)
- [x] Real metrics displayed in analysis page

### Sprint 4 Complete ✅:
- [x] Eye contact tracking service created (MediaPipe)
- [x] Emotion detection service created (DeepFace)
- [x] Presence score calculation implemented
- [x] Video metrics UI in analysis page
- [x] Enhanced feedback with video data
- [x] TypeScript types updated with video metrics
- [x] All services tested and building successfully

### Sprint 5A Complete ✅:
- [x] Python emotion service starts with Electron
- [x] MediaPipe eye tracking integrated into live recording flow
- [x] Eye contact metrics captured during recording (59% eye contact, 71% gaze stability tested)
- [x] Emotion analysis runs after recording stops
- [x] Presence score calculated from real metrics
- [x] Demo data removed, real metrics displayed in analysis page
- [x] Video metrics passed to Claude feedback API
- [x] Graceful degradation when services unavailable
- [x] Fixed React closure bug in VideoFeed component
- [x] All builds successful with no errors

### Sprint 6 Complete ✅:
- [x] User can create account (email/password + Google OAuth)
- [x] Sessions saved to database (auto-sync to Supabase)
- [x] Videos stored in cloud (Supabase Storage with RLS policies)
- [x] History page shows past sessions (with delete, filter, progress charts)
- [x] Stripe integration working (checkout, webhooks, subscriptions)
- [x] Multi-layer subscription sync (webhooks + verification + auto-refresh)
- [x] Settings page with account management
- [x] Premium tier unlocking (7-day trial → $27/month or $259/year)
- [x] Free tier limits enforced (1 session/month after trial)
- [x] **App is production-ready** 🚀

### Optional Future Enhancements:
- [ ] Email reminder cron (Phase G - can add post-launch)
- [ ] Advanced analytics dashboard
- [ ] Team/enterprise plans
- [ ] Mobile app version