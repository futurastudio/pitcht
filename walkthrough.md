# Pitcht MVP Walkthrough

The Pitcht MVP prototype is now running. This walkthrough guides you through the current features and how to test them.

## Prerequisites
- Node.js installed
- Webcam available

## Running the App
1.  Open a terminal in the project directory.
2.  Run `npm run dev`.
3.  The Next.js server will start, followed by the Electron window.

## Features to Verify

### 1. Video Feed
- **Goal**: Ensure the user can see themselves.
- **Verification**: Upon launch, the background should display your webcam feed. It is mirrored for a natural feel.
- **Troubleshooting**: If the screen is black, check camera permissions in your OS settings.

### 2. Prompter (Liquid Glass UI)
- **Goal**: Verify the "Liquid Glass" aesthetic and question display.
- **Verification**:
    - A central glass panel displays the current interview question.
    - The text should be readable against the video background.
    - The panel should have a blur effect (`backdrop-blur`).

### 3. Controls & Recording
- **Goal**: Test interactive elements and recording flow.
- **Verification**:
    - **Record Button**: Click the large circle button. It should toggle to a red square (indicating recording state).
    - **Question Counter**: Verify the counter (e.g., "Question 1 / 4") appears in the top-left.
    - **Next Question**: Click the right arrow button. The question text in the prompter should change.
    - **Stop Recording**: Click the red square button.
    - **Save Dialog**: A system save dialog should appear. Save the file (e.g., `interview.webm`).
    - **Navigation**: After saving, the app should automatically navigate to the **Analysis Page**.

### 4. Analysis Page
- **Goal**: View post-interview feedback.
- **Verification**:
    - Verify the page displays a "Video Recording Saved" placeholder.
    - Check the "Transcript Highlights" and "Emotional Intelligence" mock data.
    - Click "Start New Session" to return to the main screen.

## Known Issues / Next Steps
- **Linter Warnings**: You may see warnings about `@apply` in CSS. These are benign in the current Tailwind v4 setup but can be silenced in VS Code settings.
- **Console Errors**: `Autofill` errors in the Electron console are harmless dev-tools artifacts.
- **Video Playback**: The analysis page currently shows a placeholder for the video.
