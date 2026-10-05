import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { getAdmin } from '@/server/clients';
import { deliverPurchaseEvents } from '@/server/billing';
export const maxDuration = 60;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: 'Cron unavailable' }, { status: 503 });
  const supplied = Buffer.from(request.headers.get('authorization') ?? '');
  const expected = Buffer.from('Bearer ' + secret);
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { data, error } = await getAdmin().from('billing_analytics_outbox').select('subscription_id')
    .is('delivered_at', null).order('created_at').limit(10);
  if (error) return NextResponse.json({ error: 'Outbox unavailable' }, { status: 503 });
  for (const id of new Set((data ?? []).map(row => row.subscription_id as string))) await deliverPurchaseEvents(id);
  return NextResponse.json({ attempted: data?.length ?? 0 });
}
