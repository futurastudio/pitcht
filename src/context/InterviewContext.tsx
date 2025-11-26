'use client';

import React, { createContext, useContext, useState, ReactNode } from 'react';

interface InterviewContextType {
    recordedBlob: Blob | null;
    setRecordedBlob: (blob: Blob | null) => void;
    analysisData: any | null;
    setAnalysisData: (data: any | null) => void;
}

const InterviewContext = createContext<InterviewContextType | undefined>(undefined);

export function InterviewProvider({ children }: { children: ReactNode }) {
    const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
    const [analysisData, setAnalysisData] = useState<any | null>(null);

    return (
        <InterviewContext.Provider value={{ recordedBlob, setRecordedBlob, analysisData, setAnalysisData }}>
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
