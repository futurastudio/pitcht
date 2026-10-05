# Components Documentation

> Last Updated: 2025-01-05
> Living documentation for all React components

---

## Overview

All components follow these conventions:
- TypeScript with strict typing
- Functional components with hooks
- Tailwind CSS for styling (Liquid Glass UI aesthetic)
- Props destructuring with default values

**UI Design System**: Liquid Glass (glassmorphism with blur effects, gradients, transparency)

---

## Layout Components

### Header.tsx
**Purpose**: Main navigation header with user menu

**Props**: None (uses AuthContext internally)

**Features**:
- Logo and brand name
- Navigation links (Practice, History, Settings)
- User menu dropdown
  - Profile info
  - Subscription status badge
  - Settings link
  - Sign out button
- "Upgrade to Premium" button for free users

**Styling**:
- Sticky top position
- Glass effect background (backdrop-blur-xl)
- Gradient border bottom
- Hover animations

**State**:
```typescript
const { user, subscription, signOut } = useAuth()
const [isMenuOpen, setIsMenuOpen] = useState(false)
```

**Usage**:
```tsx
import Header from '@/components/Header'

<Header />
```

---

## Interview Components

### SessionSetupModal.tsx
**Purpose**: Modal for selecting session type and providing context

**Props**:
```typescript
{
  isOpen: boolean
  onClose: () => void
  onStartSession: (type: SessionType, context: string) => void
}
```

**Features**:
- Session type selection (Job Interview, Sales Pitch, Presentation)
- Context input (job description, product details, topic)
- AI question generation with loading state
- Error handling for API failures

**State**:
```typescript
const [sessionType, setSessionType] = useState<SessionType>('job-interview')
const [context, setContext] = useState('')
const [isGenerating, setIsGenerating] = useState(false)
const [error, setError] = useState<string | null>(null)
```

**API Integration**:
```typescript
const response = await apiFetch('/api/generate-questions', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ sessionType, context })
})

const { questions } = await response.json()
onStartSession(sessionType, context, questions)
```

**Styling**: Full-screen modal with glass effect, animated entrance

---

### Prompter.tsx
**Purpose**: Display current question as teleprompter

**Props**:
```typescript
{
  question: string
  isRecording: boolean
  recordingDuration: number  // seconds
}
```

**Features**:
- Large, readable text
- Bottom positioning (doesn't block face)
- Fade-in animation
- Recording state indicator

**Styling**:
```css
position: absolute
bottom: 8rem
left: 50%
transform: translateX(-50%)
font-size: 1.5rem  /* text-2xl */
```

**Usage**:
```tsx
<Prompter
  question="Tell me about a time you led a team"
  isRecording={true}
  recordingDuration={45}
/>
```

---

### VideoFeed.tsx
**Purpose**: Live camera feed with face tracking

**Props**: None (internal state management)

**Features**:
- MediaPipe Face Mesh integration
- Real-time eye tracking
- Canvas overlay for landmarks (debug mode)
- Auto-start camera on mount

**State**:
```typescript
const [stream, setStream] = useState<MediaStream | null>(null)
const [isTracking, setIsTracking] = useState(false)
const videoRef = useRef<HTMLVideoElement>(null)
const canvasRef = useRef<HTMLCanvasElement>(null)
```

**Face Tracking Integration**:
```typescript
useEffect(() => {
  if (videoRef.current && isRecording) {
    faceTracker.initialize(videoRef.current)
    faceTracker.startTracking()
  }

  return () => {
    faceTracker.stopTracking()
  }
}, [isRecording])
```

**CRITICAL**: Face tracker must be singleton. Initialize once, reuse instance.

**Styling**: Full-screen video with rounded corners, glass border

---

### Controls.tsx
**Purpose**: Recording controls (record/stop, next question)

**Props**:
```typescript
{
  isRecording: boolean
  onToggleRecording: () => void
  onNextQuestion: () => void
  recordingDuration: number
  isTranscribing: boolean
}
```

**Features**:
- Record/Stop button (animated, state-dependent)
- Next/Skip button
- Disabled states (during transcription)
- Recording timer display

**Button States**:
- **Not Recording**: Green "Record" button
- **Recording**: Red "Stop" pulsing button
- **Transcribing**: Disabled with spinner

**Styling**: Fixed bottom position, centered, glass effect

**Usage**:
```tsx
<Controls
  isRecording={isRecording}
  onToggleRecording={handleToggleRecording}
  onNextQuestion={handleNextQuestion}
  recordingDuration={recordingDuration}
  isTranscribing={false}
/>
```

---

### ContextModal.tsx
**Purpose**: Edit session context during interview

**Props**:
```typescript
{
  isOpen: boolean
  onClose: () => void
  onSave: (context: string) => void
  initialContext: string
}
```

**Features**:
- Textarea for context editing
- Save/Cancel buttons
- Preserves edits on save

**Use Case**: User wants to add details mid-interview

---

## Analysis Components

### TranscriptViewer.tsx
**Purpose**: Display transcript with filler word highlighting

**Props**:
```typescript
{
  transcript: string
  fillerWords?: Array<{ word: string, count: number }>
}
```

**Features**:
- Syntax highlighting for filler words
- Word count display
- Scrollable container
- Copy to clipboard button

**Filler Word Highlighting**:
```typescript
const highlightFillerWords = (text: string) => {
  const fillerPattern = /\b(um|uh|like|you know|actually)\b/gi
  return text.replace(fillerPattern, '<mark>$1</mark>')
}
```

**Styling**:
- Monospace font for transcript
- Yellow highlight for filler words
- Max height with scroll

**Usage**:
```tsx
<TranscriptViewer
  transcript={recording.transcript}
  fillerWords={recording.fillerWords}
/>
```

---

### ProgressMetrics.tsx
**Purpose**: Display progress charts and trends

**Props**:
```typescript
{
  progressData: RecordingMetric[]
}
```

**Features**:
- Overall performance score
- Trend indicators (↑ improving, ↓ declining)
- Mini line charts (last 5 sessions)
- Metrics:
  - Eye Contact %
  - Filler Words count
  - Clarity Score
  - Pacing Score

**Charts**: Recharts library (LineChart, Area, ResponsiveContainer)

**Calculations**:
```typescript
const calculateOverallScore = (data: RecordingMetric[]) => {
  const latest = data[data.length - 1]
  return (
    (latest.clarity_score || 0) * 0.3 +
    (latest.pacing_score || 0) * 0.3 +
    (latest.eye_contact_percentage || 0) * 0.4
  )
}

const calculateTrend = (current: number, previous: number) => {
  const change = ((current - previous) / previous) * 100
  return change > 5 ? 'up' : change < -5 ? 'down' : 'neutral'
}
```

**Styling**: Grid layout with glass cards, gradient backgrounds

---

### SessionCard.tsx
**Purpose**: Display session summary in History page

**Props**:
```typescript
{
  session: Session
  onView: (sessionId: string) => void
  onDelete: (sessionId: string) => void
}
```

**Features**:
- Session type badge
- Created date (relative time: "2 days ago")
- Status badge (In Progress, Completed)
- Question count
- Recording count
- View/Delete actions

**Status Badge Colors**:
- **In Progress**: Yellow/amber
- **Completed**: Green

**Relative Time**:
```typescript
const formatRelativeTime = (timestamp: string) => {
  const now = new Date()
  const then = new Date(timestamp)
  const diffMs = now - then

  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMins < 60) return `${diffMins} minutes ago`
  if (diffHours < 24) return `${diffHours} hours ago`
  return `${diffDays} days ago`
}
```

**Usage**:
```tsx
<SessionCard
  session={session}
  onView={(id) => router.push(`/session/${id}`)}
  onDelete={handleDeleteSession}
/>
```

---

## Modal Components

### LoginModal.tsx
**Purpose**: Email/password login + Google OAuth

**Props**:
```typescript
{
  isOpen: boolean
  onClose: () => void
}
```

**Features**:
- Email/password form
- Google OAuth button
- "Forgot password" link
- Switch to signup link

**Auth Integration**:
```typescript
const { signIn, signInWithGoogle } = useAuth()

const handleLogin = async (e: FormEvent) => {
  e.preventDefault()
  await signIn(email, password)
}
```

**Styling**: Centered modal with glass effect, form validation

---

### SignupModal.tsx
**Purpose**: Create account with 7-day trial

**Props**:
```typescript
{
  isOpen: boolean
  onClose: () => void
}
```

**Features**:
- Email/password form
- Password strength indicator
- Terms of service checkbox
- Free trial badge (7 days)

**Validation**:
```typescript
const validatePassword = (password: string) => {
  return {
    length: password.length >= 8,
    uppercase: /[A-Z]/.test(password),
    lowercase: /[a-z]/.test(password),
    number: /[0-9]/.test(password)
  }
}
```

---

### PaywallModal.tsx
**Purpose**: Show when user hits free tier limit

**Props**:
```typescript
{
  isOpen: boolean
  onClose: () => void
  onUpgrade: () => void
}
```

**Features**:
- Limit message ("You've used 1/1 free sessions")
- Feature comparison (Free vs Premium)
- "Upgrade Now" CTA button
- Pricing preview

**Trigger**: Called when `canStartSession()` returns false

---

### AccountConversionModal.tsx
**Purpose**: Convert anonymous user to real account

**Props**:
```typescript
{
  isOpen: boolean
  onClose: () => void
}
```

**Features**:
- Explains benefits of account
- Email/password form
- Preserves existing data
- One-time conversion (can't revert to anonymous)

**Use Case**: Anonymous user wants to save progress long-term

---

## Utility Components

### (None currently)

Could add:
- `LoadingSpinner.tsx` - Reusable loading state
- `ErrorBoundary.tsx` - Catch React errors
- `Toast.tsx` - Notification system

---

## Shared Patterns

### Glass Effect Styling
```css
background: rgba(255, 255, 255, 0.1)
backdrop-filter: blur(16px)
border: 1px solid rgba(255, 255, 255, 0.2)
box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1)
```

### Button Variants
```typescript
// Primary (CTA)
bg-gradient-to-r from-blue-500 to-purple-500
hover:from-blue-600 hover:to-purple-600

// Secondary
bg-white/10 hover:bg-white/20

// Danger
bg-red-500/20 hover:bg-red-500/30
```

### Modal Animation
```typescript
// Entry
animate-in fade-in zoom-in-95 duration-200

// Exit
animate-out fade-out zoom-out-95 duration-150
```

---

## Context Integration

All components can access:

### InterviewContext
```typescript
const {
  sessionType,
  questions,
  recordings,
  sessionId,
  addRecording,
  updateRecording,
  clearSession
} = useInterview()
```

### AuthContext
```typescript
const {
  user,
  subscription,
  loading,
  signIn,
  signOut,
  signUp,
  isAnonymous,
  canStartSession
} = useAuth()
```

---

## Accessibility

**Current State**: Basic (needs improvement)

**Improvements Needed**:
- [ ] ARIA labels on buttons
- [ ] Keyboard navigation for modals
- [ ] Focus management (trap focus in modals)
- [ ] Screen reader announcements
- [ ] Color contrast compliance (WCAG AA)

---

## Performance Optimization

### React.memo for Expensive Components
```typescript
export default React.memo(TranscriptViewer)
```

### Debounced Inputs
```typescript
const debouncedSearch = useDebouncedCallback((value) => {
  setSearchQuery(value)
}, 300)
```

### Lazy Loading
```typescript
const SessionSetupModal = lazy(() => import('./SessionSetupModal'))
```

---

## Testing

### Component Testing (Recommended)
```bash
# Install
npm install --save-dev @testing-library/react @testing-library/jest-dom

# Test
npm test
```

### Manual Testing Checklist
- [ ] All buttons clickable
- [ ] Forms validate correctly
- [ ] Modals open/close properly
- [ ] Loading states display
- [ ] Error states handled gracefully

---

## Changelog

### 2025-01-05
- Added documentation for all major components
- Clarified face tracking integration pattern
- Added accessibility and testing sections

### Previous Changes
- See commit history for full changelog
