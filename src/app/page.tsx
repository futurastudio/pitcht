'use client';

import React, { useState, useEffect } from 'react';
import VideoFeed from '@/components/VideoFeed';
import Prompter from '@/components/Prompter';
import Controls from '@/components/Controls';

const MOCK_QUESTIONS = [
  "Tell me about a time you had to handle a difficult situation.",
  "What is your greatest strength?",
  "Where do you see yourself in 5 years?",
  "Why do you want to work here?",
];

export default function Home() {
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [isRecording, setIsRecording] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleToggleRecording = () => {
    setIsRecording(!isRecording);
    // TODO: Start/Stop actual media recording logic
  };

  const handleNextQuestion = () => {
    setCurrentQuestionIndex((prev) => (prev + 1) % MOCK_QUESTIONS.length);
  };

  if (!mounted) return null;

  return (
    <main className="relative w-screen h-screen overflow-hidden bg-black">
      {/* Background Video Feed */}
      <VideoFeed />

      {/* Foreground UI Layers */}
      <Prompter
        question={MOCK_QUESTIONS[currentQuestionIndex]}
        isRecording={isRecording}
      />

      <Controls
        isRecording={isRecording}
        onToggleRecording={handleToggleRecording}
        onNextQuestion={handleNextQuestion}
      />
    </main>
  );
}
