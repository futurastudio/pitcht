import { NextResponse } from 'next/server';
import { authenticate, fail, readJson, requireUuid } from '@/server/http';
import { getAdmin } from '@/server/clients';
import { ApiError } from '@/server/errors';

export async function POST(request: Request) {
  try {
    const body = await readJson(request, 16_000);
    const id = requireUuid(body.sessionId, 'session ID');
    // Existing sendBeacon clients supply a body token; ordinary clients use Bearer auth.
    const headers = new Headers(request.headers);
    if (!headers.has('authorization') && typeof body.token === 'string') headers.set('authorization', 'Bearer ' + body.token);
    const user = await authenticate(new Request(request.url, { headers }));
    const db = getAdmin();
    const { data: session, error: lookupError } = await db.from('sessions').select('id,status')
      .eq('id', id).eq('user_id', user.id).maybeSingle();
    if (lookupError) throw new Error('Session lookup failed');
    if (!session) throw new ApiError(404, 'Session not found.');
    if (session.status === 'completed') return NextResponse.json({ success: true, consumed: true });
    if (session.status !== 'in_progress') throw new ApiError(409, 'Session is not in progress.');
    const { count, error: countError } = await db.from('recordings').select('*', { count:'exact',head:true }).eq('session_id',id);
    if (countError) throw new Error('Recording count failed');
    if (!count) return NextResponse.json({ success:true,consumed:false });
    const { data, error } = await db.from('sessions').update({ status:'completed',completed_at:new Date().toISOString() })
      .eq('id',id).eq('user_id',user.id).eq('status','in_progress').select('id').maybeSingle();
    if (error || data?.id !== id) throw new Error('Session completion did not persist');
    return NextResponse.json({ success:true,consumed:true });
  } catch (error) { return fail(error); }
}
