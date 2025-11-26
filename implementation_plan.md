# Implementation Plan - Pitcht MVP

Pitcht is an AI-powered video interview preparation desktop application. It simulates a live interview by displaying real-time AI-generated questions while recording the user, and provides post-interview analysis on emotional and verbal performance.

## User Review Required

> [!IMPORTANT]
> **API Keys**: This application requires API keys for **OpenAI** (Question Generation) and **Hume AI** (Emotion/Expression Analysis). The user will need to provide these keys in a `.env` file or via a settings UI.

> [!NOTE]
> **Platform**: The app is built using Electron, targeting macOS and Windows. The initial build and verification will be performed on the current environment (macOS).

## Proposed Changes

### Project Structure & Setup
We will initialize a new Electron + Next.js project using a standard boilerplate or manual setup to ensure latest versions.

#### [NEW] [Project Root]
- Initialize `package.json` with `electron`, `next`, `react`, `react-dom`, `typescript`, `tailwindcss`.
- Configure `electron-builder` for packaging.
- Set up Tailwind CSS with custom "Liquid Glass" utilities (backdrop blur, white opacity borders).

### Core Components (Renderer - Next.js)

#### [NEW] `src/renderer/components/VideoFeed.tsx`
- Renders the user's webcam feed using `navigator.mediaDevices.getUserMedia`.
- Full-screen or large central view.

#### [NEW] `src/renderer/components/Prompter.tsx`
- "Liquid Glass" aesthetic: `backdrop-filter: blur(20px)`, `bg-white/10`, `border-white/20`.
- Displays current question.
- Animates transitions between questions.

#### [NEW] `src/renderer/components/Controls.tsx`
- Floating glass bar at the bottom.
- Start/Stop Recording buttons.
- Microphone mute toggle.

#### [NEW] `src/renderer/pages/index.tsx`
- Main interview interface combining VideoFeed, Prompter, and Controls.

#### [NEW] `src/renderer/pages/analysis.tsx`
- Post-interview dashboard.
- **[UPDATE]** Persistent "Liquid Glass" background (VideoFeed).
- **[UPDATE]** Interactive Video Player (using Blob URL or File Path).
- **[UPDATE]** Detailed Metrics: Face Expressions, Intonation, Body Language, Anxiety/Stress.
- **[UPDATE]** AI Advice section.

### Logic & Services

#### [NEW] `src/renderer/context/InterviewContext.tsx`
- Manages global state: `recordedVideoBlob`, `analysisData`.
- Allows sharing video between Interview and Analysis pages.

#### [NEW] `src/renderer/lib/audio.ts`
- Handles `SpeechRecognition` (Web Speech API) for real-time answer listening to trigger next questions.

#### [NEW] `src/renderer/lib/openai.ts`
- Client for OpenAI API.
- Function: `generateNextQuestion(context, previousAnswer)`

#### [NEW] `src/renderer/lib/hume.ts`
- Client for Hume AI API.
- Function: `analyzeVideo(videoBlob)` -> Returns emotion/expression metrics.

### Main Process (Electron)

#### [NEW] `src/main/main.ts`
- Window creation (transparent/vibrancy support for macOS if possible, though CSS glassmorphism is safer for cross-platform).
- IPC handlers for saving video files to disk.

## Verification Plan

### Automated Tests
- **Unit Tests**: Jest/Vitest for utility functions (`openai.ts`, `hume.ts` logic).
- **Component Tests**: React Testing Library for UI components (checking if Prompter renders text).

### Manual Verification
1.  **Start App**: Run `npm run dev`. Verify Electron window opens with "Liquid Glass" UI.
2.  **Camera Permission**: Verify app requests and shows camera feed.
3.  **Interview Flow**:
    - Click "Start Interview".
    - Verify initial question appears in Prompter.
    - Speak an answer. Verify STT picks up speech (log to console) and triggers next question after silence/timeout.
4.  **Recording**:
    - Finish interview.
    - Verify video file is saved locally.
5.  **Analysis (Mocked/Real)**:
    - Go to Analysis page.
    - Verify video plays back.
    - Verify "AI Advice" card appears (can use mock data if API keys aren't set).
