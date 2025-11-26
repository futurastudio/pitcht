'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Prompter from '@/components/Prompter';
import Controls from '@/components/Controls';
import { useInterview } from '@/context/InterviewContext';

const MOCK_QUESTIONS = [
  "Tell me about a time you had to handle a difficult situation.",
  "What is your greatest strength?",
  "Where do you see yourself in 5 years?",
  "Why do you want to work here?",
];

export default function Home() {
  const router = useRouter();
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [isRecording, setIsRecording] = useState(false);
  const [mounted, setMounted] = useState(false);
  const { setRecordedBlob } = useInterview();

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleToggleRecording = async () => {
    if (isRecording) {
      // Stop Recording
      setIsRecording(false);
      // @ts-ignore
      if (window.stopRecording) {
        // @ts-ignore
        const blob = await window.stopRecording();
        setRecordedBlob(blob); // Save to Context

        const buffer = await blob.arrayBuffer();

        // Save via Electron
        // @ts-ignore
        if (window.electron) {
          // @ts-ignore
          const result = await window.electron.saveVideo(buffer);
          if (result.success) {
            console.log('Video saved to:', result.filePath);
            router.push('/analysis');
          }
        } else {
          console.warn('Electron API not found (running in browser?)');
          router.push('/analysis');
        }
      }
    } else {
      // Start Recording
      setIsRecording(true);
      // @ts-ignore
      if (window.startRecording) {
        // @ts-ignore
        window.startRecording();
      }
    }
  };

  const handleNextQuestion = () => {
    setCurrentQuestionIndex((prev) => (prev + 1) % MOCK_QUESTIONS.length);
  };

  if (!mounted) return null;

  return (
    <main className="relative w-full h-full min-h-screen">
      {/* VideoFeed is now in Layout, providing persistent background */}

      {/* Foreground UI Layers */}
      <Prompter
        question={MOCK_QUESTIONS[currentQuestionIndex]}
        isRecording={isRecording}
      />

      {/* Question Counter */}
      <div className="absolute top-6 left-6 z-20 bg-white/10 backdrop-blur-xl border border-white/20 shadow-xl rounded-full px-4 py-2">
        <span className="text-white/80 font-medium text-sm">
          Question {currentQuestionIndex + 1} / {MOCK_QUESTIONS.length}
        </span>
      </div>

      <Controls
        isRecording={isRecording}
        onToggleRecording={handleToggleRecording}
        onNextQuestion={handleNextQuestion}
      />
    </main>
  );
}
