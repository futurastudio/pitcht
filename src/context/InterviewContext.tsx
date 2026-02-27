'use client';

import React, { createContext, useContext, useState, useEffect, useRef, ReactNode } from 'react';
import { toast } from 'sonner';
import { getOrCreateAnonymousUser } from '@/services/auth';
import { createSession, saveRecording as saveRecordingToSupabase } from '@/services/sessionManager';
import type { User } from '@supabase/supabase-js';
import type { Question } from '@/types/interview';

export interface Recording {
    questionId: string;
    questionText: string;
    videoPath: string; // Local file path (Electron mode)
    videoUrl?: string; // Supabase storage path (web mode) - CRITICAL for analysis page playback
    recordingId?: string; // Database recording ID - for saving analyses
    timestamp: number;
    transcript?: string; // Transcription from Whisper API
    duration?: number; // Duration in seconds
    videoBlob?: Blob; // Video blob for upload (Sprint 5B)
    // Speech Analysis Metrics
    wordsPerMinute?: number;
    fillerWordCount?: number;
    clarityScore?: number; // 0-100
    pacingScore?: number; // 0-100
    // Sprint 4: Video Analysis Metrics
    eyeContactPercentage?: number; // 0-100
    gazeStability?: number; // 0-100
    dominantEmotion?: string; // e.g., 'confident', 'neutral', 'nervous'
    emotionConfidence?: number; // 0-100
    presenceScore?: number; // 0-100 (combined eye contact + emotion)
}

interface InterviewContextType {
    sessionType: string | null;
    setSessionType: (type: string | null) => void;
    sessionContext: string; // Job description / presentation topic
    setSessionContext: (context: string) => void;
    recordings: Recording[];
    addRecording: (recording: Recording) => Promise<{ recordingId?: string }>;
    updateRecording: (recordingId: string, updates: Partial<Recording>) => void;
    clearSession: () => void;
    repeatSession: (overrideConfig?: { type: string; context: string; questions: Question[] }) => void;
    questions: Question[];
    setQuestions: (questions: Question[]) => void;
    user: User | null;
    sessionId: string | null;
}

const InterviewContext = createContext<InterviewContextType | undefined>(undefined);

export function InterviewProvider({ children }: { children: ReactNode }) {
    const [sessionType, setSessionType] = useState<string | null>(null);
    const [sessionContext, setSessionContext] = useState<string>('');
    const [recordings, setRecordings] = useState<Recording[]>([]);
    const [questions, setQuestions] = useState<Question[]>([]);
    const [user, setUser] = useState<User | null>(null);
    const [sessionId, setSessionId] = useState<string | null>(null);
    const isCreatingSessionRef = useRef(false);

    // Get or create anonymous user on mount
    useEffect(() => {
        async function initUser() {
            try {
                const currentUser = await getOrCreateAnonymousUser();
                if (currentUser) {
                    setUser(currentUser);
                }
            } catch (error) {
                console.error('Failed to initialize user:', error);
                // App can still work with localStorage fallback
            }
        }
        initUser();
    }, []);

    // Load from localStorage on mount (fallback)
    useEffect(() => {
        const savedSession = localStorage.getItem('pitcht_session_type');
        const savedContext = localStorage.getItem('pitcht_session_context');
        const savedRecordings = localStorage.getItem('pitcht_recordings');
        const savedQuestions = localStorage.getItem('pitcht_questions');
        const savedSessionId = localStorage.getItem('pitcht_session_id');

        if (savedSession) setSessionType(savedSession);
        if (savedContext) setSessionContext(savedContext);
        if (savedRecordings) setRecordings(JSON.parse(savedRecordings));
        if (savedQuestions) setQuestions(JSON.parse(savedQuestions));
        if (savedSessionId) setSessionId(savedSessionId);
    }, []);

    // Save to localStorage whenever state changes (fallback/backup)
    useEffect(() => {
        if (sessionType) localStorage.setItem('pitcht_session_type', sessionType);
        if (sessionContext) localStorage.setItem('pitcht_session_context', sessionContext);
        localStorage.setItem('pitcht_recordings', JSON.stringify(recordings));
        localStorage.setItem('pitcht_questions', JSON.stringify(questions));
        if (sessionId) localStorage.setItem('pitcht_session_id', sessionId);
    }, [sessionType, sessionContext, recordings, questions, sessionId]);

    // Create Supabase session when questions are generated
    // sessionContext intentionally excluded from deps — captured by closure at call time
    // isCreatingSessionRef guards against duplicate calls while the request is in-flight
    useEffect(() => {
        async function initSession() {
            // Only create if we have: user, sessionType, questions, but no sessionId yet,
            // and no creation already in progress
            if (user && sessionType && questions.length > 0 && !sessionId && !isCreatingSessionRef.current) {
                isCreatingSessionRef.current = true;
                try {
                    const newSessionId = await createSession(
                        user.id,
                        sessionType as any,
                        sessionContext || '',
                        questions
                    );
                    setSessionId(newSessionId);
                } catch (error) {
                    console.error('Failed to create Supabase session:', error);
                    // Reset flag on error so a retry is possible
                    isCreatingSessionRef.current = false;
                    // Continue with localStorage fallback
                }
            }
        }
        initSession();
    }, [user, sessionType, questions, sessionId]); // sessionContext excluded intentionally

    const addRecording = async (recording: Recording): Promise<{ recordingId?: string }> => {
        // Always add to local state first (immediate feedback)
        setRecordings(prev => [...prev, recording]);

        // Upload to Supabase if we have user, sessionId, and videoBlob
        if (user && sessionId && recording.videoBlob) {
            try {
                const result = await saveRecordingToSupabase(
                    user.id,
                    sessionId,
                    recording.questionId,
                    recording.videoBlob,
                    recording.transcript || '',
                    recording.duration || 0,
                    {
                        // Speech metrics (from analyzeSpeech)
                        wordsPerMinute: recording.wordsPerMinute,
                        fillerWordCount: recording.fillerWordCount,
                        clarityScore: recording.clarityScore,
                        pacingScore: recording.pacingScore,
                        // Video metrics
                        eyeContactPercentage: recording.eyeContactPercentage,
                        gazeStability: recording.gazeStability,
                        dominantEmotion: recording.dominantEmotion,
                        emotionConfidence: recording.emotionConfidence,
                        presenceScore: recording.presenceScore,
                    }
                );

                // CRITICAL: Update the recording with videoUrl AND recordingId for analysis page playback and saving analyses
                setRecordings(prev => prev.map(rec =>
                    rec.questionId === recording.questionId
                        ? { ...rec, videoUrl: result.videoUrl, recordingId: result.id }
                        : rec
                ));

                // Return recordingId for async transcript updates
                return { recordingId: result.id };
            } catch (error) {
                console.error('Failed to upload recording:', error);
                toast.error('Recording upload failed', {
                    description: 'Your recording could not be saved. Check your connection — you may need to redo this answer.',
                });
                return {};
            }
        } else {
            return {};
        }
    };

    const updateRecording = (recordingId: string, updates: Partial<Recording>) => {
        setRecordings(prev => prev.map(rec =>
            rec.recordingId === recordingId
                ? { ...rec, ...updates }
                : rec
        ));
    };

    const clearSession = () => {
        setSessionType(null);
        setSessionContext('');
        setRecordings([]);
        setQuestions([]);
        setSessionId(null);
        localStorage.removeItem('pitcht_session_type');
        localStorage.removeItem('pitcht_session_context');
        localStorage.removeItem('pitcht_recordings');
        localStorage.removeItem('pitcht_questions');
        localStorage.removeItem('pitcht_session_id');
    };

    const repeatSession = (overrideConfig?: { type: string; context: string; questions: Question[] }) => {
        // Use override if provided (history page), otherwise use current context values (analysis page)
        const currentType = overrideConfig?.type ?? sessionType;
        const currentContext = overrideConfig?.context ?? sessionContext;
        const currentQuestions = overrideConfig?.questions ?? [...questions];

        // CRITICAL: Reset the creation guard ref before clearSession.
        // isCreatingSessionRef is set true on first session creation and never
        // reset on success. Without this, initSession skips creating the new DB
        // session → recordings save nowhere.
        isCreatingSessionRef.current = false;

        // Clear all state and localStorage (same as a fresh session)
        clearSession();

        // Immediately repopulate with the same config.
        // sessionId is now null → initSession useEffect will fire and create
        // a fresh DB session (the ref reset above ensures it runs).
        if (currentType) setSessionType(currentType);
        setSessionContext(currentContext);
        setQuestions(currentQuestions);
    };

    return (
        <InterviewContext.Provider value={{
            sessionType,
            setSessionType,
            sessionContext,
            setSessionContext,
            recordings,
            addRecording,
            updateRecording,
            clearSession,
            repeatSession,
            questions,
            setQuestions,
            user,
            sessionId,
        }}>
            {children}
        </InterviewContext.Provider>
    );
}

export function useInterview() {
    const context = useContext(InterviewContext);
    if (context === undefined) {
        throw new Error('useInterview must be used within an InterviewProvider');
    }
    return context;
}
