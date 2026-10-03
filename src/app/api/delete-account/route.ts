import { NextResponse } from 'next/server';
import { authenticate, fail } from '@/server/http';
import { getAdmin, getStripe } from '@/server/clients';
import { ApiError } from '@/server/errors';
import { stripeId } from '@/server/billingPolicy';
import { ACCOUNT_DELETION_ENABLED, ACCOUNT_DELETION_UNAVAILABLE_MESSAGE } from '@/utils/accountDeletion';

export const maxDuration = 60;
const PAGE_SIZE = 100;

/** No local identity/binding is removed until required external cleanup succeeds.
 * Partial cancellation/removal is safe to repeat after a lost response or outage.
 */
export async function POST(request: Request) {
  try {
    const user = await authenticate(request);
    if (!ACCOUNT_DELETION_ENABLED) {
      throw new ApiError(503, ACCOUNT_DELETION_UNAVAILABLE_MESSAGE, 'account_deletion_unavailable');
    }
    const admin = getAdmin();
    const bucket = admin.storage.from('recordings');
    const subscriptions: Array<{ stripe_subscription_id: string; stripe_customer_id: string }> = [];
    const paths = new Set<string>();
    const ownedPath = (value: unknown): string => {
      if (typeof value !== 'string' || !value.startsWith(`${user.id}/`) ||
          value.split('/').some(part => !part || part === '.' || part === '..')) {
        throw new Error('Recording path requires ownership reconciliation');
      }
      return value;
    };
    // Finish inventory before performing any destructive operation. Do not use
    // single(): canonical billing retains canceled subscriptions as history.
    for (let offset = 0; ; offset += PAGE_SIZE) {
      const { data, error } = await admin.from('subscriptions').select('stripe_subscription_id,stripe_customer_id')
        .eq('user_id', user.id).order('id').range(offset, offset + PAGE_SIZE - 1);
      if (error || !data) throw new Error('Billing inventory unavailable');
      for (const row of data) {
        if (!/^sub_[a-zA-Z0-9]+$/.test(row.stripe_subscription_id) || !/^cus_[a-zA-Z0-9]+$/.test(row.stripe_customer_id)) {
          throw new Error('Billing binding requires reconciliation');
        }
        subscriptions.push(row);
      }
      if (data.length < PAGE_SIZE) break;
    }
    for (let offset = 0; ; offset += PAGE_SIZE) {
      const { data, error } = await admin.from('recordings').select('video_url,sessions!inner(user_id)')
        .eq('sessions.user_id', user.id).order('id').range(offset, offset + PAGE_SIZE - 1);
      if (error || !data) throw new Error('Recording inventory unavailable');
      for (const row of data) if (row.video_url) paths.add(ownedPath(row.video_url));
      if (data.length < PAGE_SIZE) break;
    }
    // Include orphaned uploads and nested session/capture folders, beyond the
    // default first Storage page. Enumerate first so deletion cannot shift pages.
    const pending = [user.id];
    while (pending.length) {
      const folder = pending.pop()!;
      for (let offset = 0; ; offset += PAGE_SIZE) {
        const { data, error } = await bucket.list(folder, { limit: PAGE_SIZE, offset, sortBy: { column: 'name', order: 'asc' } });
        if (error || !data) throw new Error('Storage inventory unavailable');
        for (const entry of data) {
          const path = ownedPath(`${folder}/${entry.name}`);
          if (entry.id) paths.add(path); else pending.push(path);
        }
        if (data.length < PAGE_SIZE) break;
      }
    }
    const stripe = subscriptions.length ? getStripe() : null;
    // Validate every canonical binding before cancelling even the first one.
    const verified = [];
    for (const binding of subscriptions) {
      const subscription = await stripe!.subscriptions.retrieve(binding.stripe_subscription_id);
      if (subscription.id !== binding.stripe_subscription_id || stripeId(subscription.customer) !== binding.stripe_customer_id ||
          (subscription.metadata.userId && subscription.metadata.userId !== user.id)) {
        throw new ApiError(409, 'Billing ownership needs support review before deletion.', 'billing_owner_mismatch');
      }
      verified.push(subscription);
    }
    for (const subscription of verified) {
      if (['canceled', 'incomplete_expired'].includes(subscription.status)) continue;
      const canceled = await stripe!.subscriptions.cancel(subscription.id, { invoice_now: false, prorate: false });
      if (canceled.id !== subscription.id || canceled.status !== 'canceled') throw new Error('Cancellation not confirmed');
    }
    const files = [...paths];
    for (let offset = 0; offset < files.length; offset += PAGE_SIZE) {
      const { error } = await bucket.remove(files.slice(offset, offset + PAGE_SIZE));
      if (error) throw new Error('Media removal unavailable');
    }
    // Removing a Storage object is idempotent. A failed/lost response leaves the
    // Auth account and billing bindings available for the next attempt.
    const { error: sessionsError } = await admin.from('sessions').delete().eq('user_id', user.id);
    if (sessionsError) throw new Error('Session removal unavailable');
    // Auth deletion cascades the local billing rows and refresh sessions. Keeping
    // bindings until this final step also handles a failure of the Auth service.
    const { error: userError } = await admin.auth.admin.deleteUser(user.id);
    if (userError) throw new Error('Account removal unavailable');
    return NextResponse.json({ success: true, message: 'Your account and saved recordings have been deleted. Linked subscriptions are canceled.', deletedAt: new Date().toISOString() });
  } catch (error) {
    if (error instanceof ApiError) return fail(error);
    console.error('[delete-account] Cleanup incomplete or unconfirmed');
    return fail(new ApiError(503, 'Deletion could not be completed or confirmed. Please retry or contact support. Some subscriptions may already be canceled and recordings removed.', 'deletion_incomplete'));
  }
}

export async function GET() { return NextResponse.json({ error: 'Use POST.' }, { status: 405 }); }
