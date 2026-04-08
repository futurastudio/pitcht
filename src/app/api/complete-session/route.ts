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

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('complete-session error:', error);
        return NextResponse.json({ error: 'Internal error' }, { status: 500 });
    }
}
