'use client';

import React, { createContext, useContext, useState, ReactNode } from 'react';

/**
 * Camera status values:
 *   loading  — getUserMedia hasn't resolved yet
 *   ready    — stream acquired, recording available
 *   denied   — permission denied / device not found
 *   skipped  — user chose "Skip recording for now" from the recovery card
 */
export type CameraStatus = 'loading' | 'ready' | 'denied' | 'skipped';

interface CameraContextType {
    cameraStatus: CameraStatus;
    setCameraStatus: (status: CameraStatus) => void;
}

const CameraContext = createContext<CameraContextType | undefined>(undefined);

export function CameraProvider({ children }: { children: ReactNode }) {
    const [cameraStatus, setCameraStatus] = useState<CameraStatus>('loading');

    return (
        <CameraContext.Provider value={{ cameraStatus, setCameraStatus }}>
            {children}
        </CameraContext.Provider>
    );
}

export function useCameraStatus() {
    const ctx = useContext(CameraContext);
    if (!ctx) throw new Error('useCameraStatus must be used within a CameraProvider');
    return ctx;
}
