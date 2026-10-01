import { NextResponse } from 'next/server';
import { authenticate, fail, readJson } from '@/server/http';
import { ApiError } from '@/server/errors';
import { verifyCheckout } from '@/server/billing';
import { reserveOperation } from '@/server/practice';
export const maxDuration = 30;

export async function POST(request: Request) {
  try {
    const user = await authenticate(request);
    const body = await readJson(request, 4_000);
    if (body.userId !== undefined && body.userId !== user.id) throw new ApiError(403, 'Account mismatch.');
    if (typeof body.sessionId !== 'string' || !/^cs_[a-zA-Z0-9_]+$/.test(body.sessionId) || body.sessionId.length > 256) {
      throw new ApiError(400, 'Invalid checkout session.');
    }
    await reserveOperation(user.id, 'verify');
    const subscription = await verifyCheckout(body.sessionId, user.id);
    return NextResponse.json({ success: true, subscription });
  } catch (error) { return fail(error); }
}
