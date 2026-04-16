import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Lightweight endpoint for marking sessions as completed.
// Called via navigator.sendBeacon on page unload (beforeunload/visibilitychange).
// Note: No CSRF check here — beacon requests can't set custom headers easily.
// Auth token is passed in the request body (sendBeacon cannot set headers).
// The frontend interview page stores the access token in a ref and includes
// it in every beacon payload — the token is always required.

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { sessionId, token } = body;

        if (!sessionId) {
            return NextResponse.json({ error: 'Missing sessionId' }, { status: 400 });
        }

        // Token is now required — reject unauthenticated beacon calls.
        // Previously the check was guarded by `if (token)` which allowed
        // unauthenticated requests to mark arbitrary sessions as completed.
        if (!token) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const supabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!
        );
        const { data: { user }, error: authError } = await supabase.auth.getUser(token);
        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Use service role to bypass RLS for reliable write on page unload
        const adminClient = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!
        );

        // Server-side guard: only mark the session as completed if it has at least
        // one recording saved. This is a defense-in-depth check — the frontend
        // already blocks the beacon and blocks direct navigation when recordings === 0,
        // but this prevents any edge-case race condition or direct API call from
        // consuming a user's free trial without them ever recording an answer.
        const { count: recordingCount, error: countError } = await adminClient
            .from('recordings')
            .select('*', { count: 'exact', head: true })
            .eq('session_id', sessionId);

        if (countError) {
            console.error('Failed to count recordings for session:', countError);
            // Fail open: if we can't verify, don't mark as completed.
            return NextResponse.json({ success: true, consumed: false });
        }

        if (!recordingCount || recordingCount === 0) {
            // No recordings — leave session as in_progress so it doesn't consume
            // the user's free trial. The client will handle cleanup.
            console.log(`[complete-session] Skipping completion for session ${sessionId}: no recordings found.`);
            return NextResponse.json({ success: true, consumed: false });
        }

        const { error } = await adminClient
            .from('sessions')
            .update({
                status: 'completed',
                completed_at: new Date().toISOString(),
            })
            .eq('id', sessionId)
            .eq('status', 'in_progress'); // Only update if still in_progress

        if (error) {
            console.error('Failed to complete session on unload:', error);
            return NextResponse.json({ error: 'Database error' }, { status: 500 });
        }

        return NextResponse.json({ success: true, consumed: true });
    } catch (error) {
        console.error('complete-session error:', error);
        return NextResponse.json({ error: 'Internal error' }, { status: 500 });
    }
}
