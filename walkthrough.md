# Pitcht Walkthrough (Updated 2024-11-29)

The Pitcht app is an AI-powered interview practice coach built with Electron + Next.js. This walkthrough covers the current features and testing flow.

## Prerequisites
- Node.js installed
- Webcam + microphone available
- API keys configured in `.env.local`:
  - `ANTHROPIC_API_KEY` (Claude for question generation and feedback)
  - `OPENAI_API_KEY` (Whisper for transcription)
  - `NEXT_PUBLIC_SUPABASE_URL` (optional, for future backend)
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY` (optional, for future backend)
- Python 3.8+ (optional, for Sprint 4 emotion detection)
  - Run `cd python-services && ./setup.sh` to install DeepFace dependencies

## Running the App
1. Open terminal in project directory
2. Run `npm run dev`
3. Wait for:
   - Next.js server to start (http://localhost:3000)
   - TypeScript compilation to complete
   - Electron window to launch automatically

## Features to Test

### 1. Dashboard (Landing Page)
**What it does**: Select session type and start practice
**How to test**:
- Launch app → See live camera feed with glassmorphism overlay
- Verify 3 cards: "Job Interview", "Sales Pitch", "Presentation"
- Click "Job Interview" → Opens Session Setup Modal

### 2. Session Setup Modal ✅ AI-POWERED
**What it does**: Generate custom questions using Claude AI
**How to test**:
- Enter a job description (e.g., "Senior Frontend Engineer at Google, React/TypeScript")
- Click "Start Interview"
- Watch "AI thinking" progress indicators (~10-15 seconds)
- Should generate 5-7 tailored questions following real interview flow:
  - Behavioral warmup ("Tell me about yourself")
  - Experience validation ("Tell me about a time...")
  - Technical deep-dive (role-specific questions)
  - Situational/closing questions

### 3. Interview Session ✅ STREAMLINED RECORDING
**What it does**: Record video answers with auto-save
**How to test**:
- **Question Display**: See current question at bottom (teleprompter style, doesn't block face)
- **Recording Timer**: Top-left shows red badge with MM:SS when recording
- **Record Flow**:
  1. Click red record button → Recording starts, timer appears
  2. Answer question
  3. Click stop → Video saves automatically (NO save dialog!)
  4. Transcription happens in background ("Transcribing audio..." indicator)
  5. Auto-advance to next question
- **Navigation**:
  - Back button (top-left) returns to Dashboard
  - Question counter (top-center) shows progress (e.g., "Question 2 / 5")
  - Context button (top-right) opens context modal
  - Next button (bottom controls) skips question without recording

### 4. Analysis Page ✅ REAL AI FEEDBACK & METRICS
**What it does**: Review recordings with AI analysis and coaching
**How to test**:
- **Layout**: 30% sidebar (left) + 70% analysis view (right)
- **Video List Sidebar**:
  - Shows all questions with Q# badges
  - Duration displayed (e.g., "1:23") or "Skipped" if not recorded
  - Click to select question
  - Selected question has green "Selected" indicator
- **Analysis View**:
  - **Video Player** (top) - plays selected recording
  - **Transcript Viewer** (middle) - Whisper-transcribed text with:
    - Word count and duration stats
    - Filler words highlighted in yellow ("um", "uh", "like", etc.)
    - Filler word count displayed
  - **AI Coach Feedback Card** (bottom-left):
    - Auto-generates when recording is selected
    - Shows loading spinner while analyzing
    - Displays personalized Claude feedback:
      - Summary (2-3 sentence overview)
      - Strengths (✓ what you did well)
      - Improvements (→ specific suggestions)
  - **Performance Metrics Card** (bottom-right):
    - **Clarity Score** (0-100%): Based on filler word ratio (green gradient)
    - **Pacing Score** (0-100%): Based on speaking speed (blue gradient)
    - **Eye Contact** (0-100%): Percentage of time looking at camera (purple gradient) ✅ Sprint 4
    - **Overall Presence** (0-100%): Combined score (60% eye contact + 40% emotion) (orange/red gradient) ✅ Sprint 4
    - **Words/Min**: Speaking pace (ideal: 120-150 WPM)
    - **Filler Words**: Total count detected
    - **Dominant Emotion**: Most prevalent emotion displayed as a badge (e.g., "Confident", "Happy") ✅ Sprint 4
- **Demo Mode**: If no real recordings, click "View Demo Analysis"

### 5. Session History & Progress Tracking ✅ NEW
**What it does**: View past sessions, track improvement over time
**How to test**:
- **Header Navigation**: Click "History" button (next to account menu)
- **Session Cards**:
  - Shows all past sessions grouped by date
  - Displays session type, context, date, question/recording counts
  - Click "View Details" → opens session detail page
  - Click trash icon → deletes session with confirmation
- **Progress Metrics** (top of page):
  - Overall Performance Score with trend (↑ improving or ↓ declining)
  - Eye Contact mini-chart (last 5 sessions)
  - Filler Words mini-chart (last 5 sessions)
- **Filtering**:
  - "All Sessions" or filter by type (Job Interview, Sales Pitch, Presentation)

### 6. Pricing & Subscription ✅ NEW
**What it does**: Upgrade to Premium for unlimited sessions
**How to test**:
- **Pricing Page**: Click "Upgrade to Premium" button in header (free users only)
- **Features Displayed**:
  - Free tier: 1 session/month after 7-day trial
  - Premium Monthly: $27/month with unlimited sessions
  - Premium Annual: $259/year (save 20%, equivalent to $21.60/month)
- **Checkout Flow**:
  1. Click "Start Free Trial" on either plan
  2. Redirects to Stripe Checkout
  3. Enter test card: `4242 4242 4242 4242`, any future date, any CVC
  4. Complete payment
  5. Redirects to `/success` with confetti animation
  6. Subscription auto-syncs (webhooks + verification endpoint + auto-refresh)
- **Success Page**:
  - Shows trial status, subscription details, next billing date
  - Lists all Premium features
  - CTA buttons: "Start Practicing Now" and "View Session History"

### 7. Account Settings ✅ NEW
**What it does**: Manage account and subscription
**How to test**:
- **Access**: Click account menu (top-right) → "Account Settings"
- **Account Information Section**:
  - Email address
  - Account type (Free / Trial Active / Premium)
  - Trial end date (if on trial)
  - Sessions used this month (if free tier)
- **Subscription Management**:
  - Free users: "Upgrade to Premium" CTA card
  - Premium users: Link to Stripe Customer Portal for billing management
- **Account Actions**:
  - Sign out button (red danger zone)

### 8. Video Storage Architecture ✅ HYBRID
**Current (Hybrid: Local + Cloud)**:
- **Videos**:
  - Local: `~/Library/Application Support/Electron/recordings/` (auto-save)
  - Cloud: Supabase Storage buckets (uploaded automatically after recording)
  - Security: User-specific folders with RLS policies
  - Access: 1-hour signed URLs (automatic regeneration when viewing)
- **Session Data**:
  - React Context (in-memory for current session)
  - Supabase PostgreSQL (persistent cloud storage)
- **Authentication**:
  - Anonymous auth (no signup required)
  - Can convert to email/password or Google account
- **Database Tables**:
  - sessions, questions, recordings, analyses, subscriptions
  - Full RLS policies for data privacy

## What's Working (All Sprints 1-6 Complete ✅)
- ✅ **AI Question Generation** (Claude): Tailored to job description with intelligent interview flow
- ✅ **Speech-to-Text** (Whisper): 95%+ accuracy transcription
- ✅ **Auto-Save Recording**: Streamlined flow, no interrupting dialogs
- ✅ **Transcript Viewer**: Real-time filler word highlighting (25+ filler words detected)
- ✅ **Speech Analysis**:
  - Filler word detection and counting
  - Words per minute (WPM) calculation
  - Clarity score (based on filler word ratio)
  - Pacing score (optimal range: 120-150 WPM)
- ✅ **Live Video Analysis** (Sprint 4 + 5A):
  - Eye contact tracking with MediaPipe Face Mesh (468 facial landmarks, iris tracking)
  - Gaze direction calculation (0.15 threshold for center detection)
  - Eye contact percentage and gaze stability metrics captured during live recording
  - Emotion detection with DeepFace (7 emotions: happy, sad, angry, fear, surprise, disgust, neutral)
  - Emotion analysis runs automatically after recording stops
  - Emotion scoring system (happy=100, surprise=85, neutral=70, fear=20, etc.)
  - Presence score calculation (60% eye contact + 40% emotion weight)
  - Python emotion service managed by Electron lifecycle
  - Graceful degradation when services unavailable
- ✅ **AI Coaching Feedback** (Claude):
  - Personalized feedback with strengths and improvements
  - Context-aware suggestions based on transcript AND real video metrics
  - Structured feedback (summary, strengths, improvements, next steps)
  - Enhanced prompts include eye contact %, dominant emotion, and presence score
- ✅ **Real Performance Metrics**: Live-calculated scores displayed in Analysis page (no demo data)
- ✅ **Professional UI**: Teleprompter positioning, timer, clean analysis layout, video metrics visualization, Liquid Glass design
- ✅ **Backend & Persistence** (Sprint 5B):
  - Cloud storage for videos (Supabase Storage with RLS policies)
  - Session persistence (PostgreSQL database)
  - Anonymous authentication (auto-created on first use)
  - Graceful degradation with localStorage fallback
- ✅ **Authentication & Accounts** (Sprint 6):
  - Email/password signup and login
  - Google OAuth integration
  - Anonymous to real account conversion
  - Account settings page with subscription management
- ✅ **Session History & Progress** (Sprint 6):
  - View all past sessions with filtering
  - Delete sessions with confirmation
  - Progress charts (Overall Score, Eye Contact, Filler Words)
  - Trend indicators showing improvement over time
- ✅ **Monetization & Subscriptions** (Sprint 6):
  - Stripe payment integration (test mode ready)
  - 7-day free trial for all users
  - Premium plans: $27/month or $259/year (20% savings)
  - Multi-layer subscription sync (webhooks + verification + auto-refresh)
  - Free tier limits (1 session/month after trial)
  - Session limit enforcement with upgrade prompts
  - Stripe Customer Portal for billing management

## What's Complete (All Sprints 1-6 ✅)
- ✅ Supabase backend for session persistence
- ✅ Video upload to cloud storage
- ✅ Session history and progress tracking
- ✅ User authentication (email/password + Google OAuth)
- ✅ Account management and settings
- ✅ Stripe payment integration
- ✅ Premium subscriptions ($27/month, $259/year)
- ✅ 7-day free trial system
- ✅ Multi-layer subscription sync
- ✅ **PRODUCTION READY** 🚀

## Known Issues & Limitations
- **Console Warnings**:
  - `Autofill.enable` errors in Electron console are harmless (Chromium internal)
  - Baseline browser mapping warnings are benign (dependency maintenance)
- **Python Service** (Emotion Detection):
  - Requires Python 3.8+ and DeepFace library installed
  - Gracefully degrades if service is unavailable (app continues working)
  - Run `cd python-services && ./setup.sh` to install dependencies
- **Test Mode**:
  - Stripe is in test mode (use test cards only)
  - Webhooks require `stripe listen` running locally for development
  - Production webhooks will be configured when deploying live
- **Email Reminders**:
  - Phase G (email cron) is optional and not yet implemented
  - Can be added post-launch when user base grows
