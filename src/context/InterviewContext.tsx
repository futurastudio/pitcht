'use client';

import React, { createContext, useContext, useState, useEffect, useRef, ReactNode } from 'react';
import * as Sentry from '@sentry/nextjs';
import { useAuth } from '@/context/AuthContext';
import { createSession, saveRecording as saveRecordingToSupabase } from '@/services/sessionManager';
import type { RecordingSaveCheckpoint } from '@/services/sessionManager';
import type { User } from '@supabase/supabase-js';
import type { Question, SessionType } from '@/types/interview';
import { readRecovery, writeRecovery, clearRecovery, ACCOUNT_CHANGE_EVENT } from '@/utils/accountRecovery';
import { MAX_TRANSCRIPTION_BYTES } from '@/utils/recordingContract';

export interface Recording {
    questionId: string;
    questionText: string;
    videoPath: string; // Local file path (Electron mode)
    videoUrl?: string; // Supabase storage path (web mode) - CRITICAL for analysis page playback
    recordingId?: string; // Database recording ID - for saving analyses
    saveCheckpoint?: RecordingSaveCheckpoint; // Reserved capture identity, NOT proof the DB row saved.
    timestamp: number;
    transcript?: string; // Transcription from Whisper API
    duration?: number; // Duration in seconds
    videoBlob?: Blob; // Video blob for upload (Sprint 5B)
    audioBlob?: Blob; // In-memory retry only; never serialized as if JSON preserves bytes.
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
    addRecording: (recording: Recording) => Promise<{ recordingId?: string; error?: string }>;
    updateRecording: (recordingId: string, updates: Partial<Recording>) => void;
    discardUnsavedRecording: (captureId: string) => void;
    clearSession: () => void;
    repeatSession: (overrideConfig?: { type: string; context: string; questions: Question[] }) => void;
    questions: Question[];
    setQuestions: (questions: Question[]) => void;
    user: User | null;
    sessionId: string | null;
}

const InterviewContext = createContext<InterviewContextType | undefined>(undefined);

export function InterviewProvider({ children }: { children: ReactNode }) {
    const { user, loading } = useAuth();
    // Remount the entire private view on identity changes, including pending page effects/media.
    return <AccountInterviewProvider key={loading ? 'auth-loading' : user?.id ?? 'signed-out'} user={loading ? null : user}>{children}</AccountInterviewProvider>;
}

function AccountInterviewProvider({ children, user }: { children: ReactNode; user: User | null }) {
    const [saved] = useState(() => {
        try { return user && typeof window !== 'undefined' ? readRecovery(localStorage, user.id) : null; }
        catch { return null; }
    });
    const [sessionType, setSessionType] = useState<string | null>(saved?.sessionType ?? null);
    const [sessionContext, setSessionContext] = useState(saved?.sessionContext ?? '');
    const [recordings, setRecordings] = useState<Recording[]>(saved?.recordings ?? []);
    const [questions, setQuestions] = useState<Question[]>(saved?.questions ?? []);
    const [sessionId, setSessionId] = useState<string | null>(saved?.sessionId ?? null);
    const isCreatingSessionRef = useRef(false);

    useEffect(() => {
        if (!user) return;
        try { writeRecovery(localStorage, user.id, { sessionType, sessionContext, recordings, questions, sessionId }); }
        catch { /* Browser storage can be unavailable; captured bytes remain in memory. */ }
    }, [sessionType, sessionContext, recordings, questions, sessionId, user]);

    useEffect(() => {
        const warn = (event: BeforeUnloadEvent) => {
            if (recordings.some(recording => recording.videoBlob instanceof Blob && !recording.recordingId)) {
                event.preventDefault(); event.returnValue = '';
            }
        };
        const preventAccountChange = (event: Event) => {
            if (recordings.some(recording => recording.videoBlob instanceof Blob && !recording.recordingId)) event.preventDefault();
        };
        window.addEventListener('beforeunload', warn);
        window.addEventListener(ACCOUNT_CHANGE_EVENT, preventAccountChange);
        return () => { window.removeEventListener('beforeunload', warn); window.removeEventListener(ACCOUNT_CHANGE_EVENT, preventAccountChange); };
    }, [recordings]);

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
                        sessionType as SessionType,
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

    const addRecording = async (recording: Recording): Promise<{ recordingId?: string; error?: string }> => {
        // Always add to local state first (immediate feedback)
        // Retry the same captured answer without accumulating duplicate local entries.
        const retained = { ...recording, audioBlob: recording.audioBlob && recording.audioBlob.size <= MAX_TRANSCRIPTION_BYTES ? recording.audioBlob : undefined };
        setRecordings(prev => [...prev.filter(rec => rec.timestamp !== recording.timestamp || rec.questionId !== recording.questionId), retained]);

        // Upload to Supabase if we have user, sessionId, and videoBlob
        if (user && sessionId && recording.videoBlob && recording.saveCheckpoint) {
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
                    },
                    recording.saveCheckpoint,
                );

                // CRITICAL: Update the recording with videoUrl AND recordingId for analysis page playback and saving analyses
                setRecordings(prev => prev.map(rec =>
                    rec.questionId === recording.questionId && rec.timestamp === recording.timestamp
                        ? { ...rec, videoUrl: result.videoUrl, recordingId: result.id, videoBlob: undefined }
                        : rec
                ));

                // Return recordingId for async transcript updates
                return { recordingId: result.id };
            } catch (error) {
                console.error('Failed to upload recording:', error);
                // Report to Sentry — this is the exact failure that caused every web user's
                // recordings to vanish silently (Fabiana April 2026). Capture rich context so
                // the next recurrence is detected immediately.
                Sentry.captureException(error, {
                    tags: {
                        area: 'interview',
                        subsystem: 'save-recording',
                        platform: typeof window !== 'undefined' && 'electron' in window ? 'electron' : 'web',
                    },
                    extra: {
                        userId: user.id,
                        sessionId,
                        questionId: recording.questionId,
                        blobSize: recording.videoBlob?.size ?? 0,
                        hasTranscript: Boolean(recording.transcript),
                        duration: recording.duration,
                    },
                });
                // Keep the captured bytes and let the page display the specific save
                // failure persistently beside its download/retry recovery controls.
                return { error: error instanceof Error ? error.message : 'Could not save this answer. Keep this tab open and download the original before leaving.' };
            }
        } else {
            // Tracking gap: we had a user/session but no blob, or not signed in.
            // This branch is usually legitimate (skipped question) but we log a breadcrumb
            // so production traces surface any unexpected drops.
            Sentry.addBreadcrumb({
                category: 'interview',
                level: 'info',
                message: 'addRecording: no DB upload attempted',
                data: {
                    hasUser: Boolean(user),
                    hasSessionId: Boolean(sessionId),
                    hasBlob: Boolean(recording.videoBlob),
                    blobSize: recording.videoBlob?.size ?? 0,
                    questionId: recording.questionId,
                },
            });
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

    const discardUnsavedRecording = (captureId: string) => {
        setRecordings(prev => prev.filter(rec => rec.recordingId || rec.saveCheckpoint?.captureId !== captureId));
    };

    const clearSession = () => {
        setSessionType(null);
        setSessionContext('');
        setRecordings([]);
        setQuestions([]);
        setSessionId(null);
        try { if (user) clearRecovery(localStorage, user.id); } catch { /* Storage may be disabled. */ }
    };

    const repeatSession = (overrideConfig?: { type: string; context: string; questions: Question[] }) => {
        // Use override if provided (history page), otherwise use current context values (analysis page)
        const currentType = overrideConfig?.type ?? sessionType;
        const currentContext = overrideConfig?.context ?? sessionContext;
        const sourceQuestions = overrideConfig?.questions ?? questions;

        // CRITICAL: regenerate fresh UUIDs for each question. Without this,
        // createSession() re-inserts rows with the previous session's question
        // ids and hits a "duplicate key value violates unique constraint
        // questions_pkey" (23505) — which throws, leaves sessionId=null, and
        // silently drops every recording the user makes on the repeat run.
        // This is the second half of Fabiana's "no recordings" bug; the ref
        // reset below was only half the fix.
        const freshQuestions: Question[] = sourceQuestions.map((q) => ({
            ...q,
            id:
                typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
                    ? crypto.randomUUID()
                    : `q-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
        }));

        // Reset the creation guard ref before clearSession. isCreatingSessionRef
        // is set true on first session creation and never reset on success.
        // Without this, initSession skips creating the new DB session.
        isCreatingSessionRef.current = false;

        // Clear all state and localStorage (same as a fresh session)
        clearSession();

        // Immediately repopulate with the same config (but fresh question ids).
        // sessionId is now null → initSession useEffect will fire and create
        // a fresh DB session (the ref reset above ensures it runs).
        if (currentType) setSessionType(currentType);
        setSessionContext(currentContext);
        setQuestions(freshQuestions);
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
            discardUnsavedRecording,
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
