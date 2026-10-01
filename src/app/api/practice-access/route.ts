import { NextResponse } from 'next/server';
import { authenticate, fail } from '@/server/http';
import { getPracticeAccess } from '@/server/practice';
export async function GET(request: Request) {
  try {
    const user = await authenticate(request);
    return NextResponse.json({ userId: user.id, ...await getPracticeAccess(user.id) }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) { return fail(error); }
}
