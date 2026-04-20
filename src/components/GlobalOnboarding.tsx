'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import OnboardingModal from './OnboardingModal';

/**
 * Global onboarding trigger.
 *
 * Previously, the onboarding modal was only mounted in src/app/page.tsx, which
 * meant that users who signed up via SessionSetupModal (the most common signup
 * path) never saw it — they were navigated straight to /interview and the home
 * page never mounted.
 *
 * This component is mounted in the root layout so it fires regardless of which
 * route the user lands on post-signup. We intentionally DO NOT skip /interview
 * here: that's the primary signup landing page (SessionSetupModal.tsx pushes
 * users there on signup success), so skipping it would reintroduce the exact
 * bug we're trying to fix. The 500ms delay + modal backdrop let question
 * generation kick off in the background while the user reads the tutorial.
 *
 * Skip list:
 *   - /auth/callback        — transient OAuth redirect, unmounts immediately
 *   - /auth/reset-password  — existing users resetting password, not new signups
 *
 * Trigger rules (unchanged):
 *   - User is authenticated
 *   - Account was created within the last 10 minutes
 *   - `pitcht_onboarding_seen` not yet set in localStorage
 */
const SKIP_PATHS = ['/auth/callback', '/auth/reset-password'];

export default function GlobalOnboarding() {
    const { user } = useAuth();
    const pathname = usePathname();
    const [show, setShow] = useState(false);

    useEffect(() => {
        if (!user) return;
        if (pathname && SKIP_PATHS.some((p) => pathname.startsWith(p))) return;
        if (typeof window === 'undefined') return;
        if (localStorage.getItem('pitcht_onboarding_seen')) return;

        const createdAt = new Date(user.created_at);
        const isNew = Date.now() - createdAt.getTime() < 10 * 60 * 1000;
        if (!isNew) return;

        // Small delay lets any in-flight navigation settle so the modal doesn't
        // flash on a transitional route.
        const t = setTimeout(() => setShow(true), 500);
        return () => clearTimeout(t);
    }, [user, pathname]);

    const handleComplete = () => {
        if (typeof window !== 'undefined') {
            localStorage.setItem('pitcht_onboarding_seen', '1');
        }
        setShow(false);
    };

    return <OnboardingModal isOpen={show} onComplete={handleComplete} />;
}
