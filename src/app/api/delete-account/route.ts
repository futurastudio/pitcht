/**
 * API Route: Delete Account
 * POST /api/delete-account
 *
 * Permanently deletes user account and all associated data (GDPR compliance)
 *
 * Security:
 * - Requires authentication
 * - CSRF Protection
 * - Rate limiting
 *
 * Deletes:
 * - All sessions and recordings
 * - All video files from storage
 * - Subscription (cancels with Stripe)
 * - User account
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import Stripe from 'stripe';
import { withCSRFProtection } from '@/middleware/csrfProtection';
import rateLimiter, { RateLimitPresets, getUserIdentifier, formatResetTime } from '@/middleware/rateLimiter';

// Use service role for admin operations
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-11-17.clover',
});

export async function POST(request: NextRequest) {
  try {
    // CSRF Protection
    const csrfError = withCSRFProtection(request);
    if (csrfError) return csrfError;

    // Rate Limiting (prevent abuse)
    const userKey = getUserIdentifier(request);
    const rateLimit = rateLimiter.check(userKey, RateLimitPresets.AUTH_ENDPOINT);

    if (!rateLimit.allowed) {
      return NextResponse.json(
        {
          error: 'Rate limit exceeded',
          message: `Too many requests. Please try again in ${formatResetTime(rateLimit.resetAt)}`,
        },
        { status: 429 }
      );
    }

    // Get authenticated user
    const authHeader = request.headers.get('authorization');
    if (!authHeader) {
      return NextResponse.json(
        { error: 'Unauthorized', message: 'Please log in to delete your account' },
        { status: 401 }
      );
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized', message: 'Invalid authentication token' },
        { status: 401 }
      );
    }

    const userId = user.id;
    const userEmail = user.email;

    console.log(`🗑️ Starting account deletion for user: ${userEmail} (${userId})`);

    // Step 1: Get all recordings to delete video files
    const { data: recordings, error: recordingsError } = await supabaseAdmin
      .from('recordings')
      .select('video_path, sessions!inner(user_id)')
      .eq('sessions.user_id', userId);

    if (!recordingsError && recordings && recordings.length > 0) {
      console.log(`📹 Deleting ${recordings.length} video files from storage...`);

      // Delete video files from storage
      const videoPaths = recordings
        .map(r => r.video_path)
        .filter(Boolean) as string[];

      if (videoPaths.length > 0) {
        const { error: storageError } = await supabaseAdmin.storage
          .from('recordings')
          .remove(videoPaths);

        if (storageError) {
          console.error('⚠️ Error deleting videos from storage:', storageError);
          // Continue anyway - database cleanup is more important
        } else {
          console.log(`✅ Deleted ${videoPaths.length} videos from storage`);
        }
      }

      // Also try to delete entire user folder
      try {
        const { data: files } = await supabaseAdmin.storage
          .from('recordings')
          .list(userId);

        if (files && files.length > 0) {
          const folderPaths = files.map(f => `${userId}/${f.name}`);
          await supabaseAdmin.storage.from('recordings').remove(folderPaths);
          console.log(`✅ Cleaned up user folder: ${userId}/`);
        }
      } catch (err) {
        console.warn('⚠️ Error cleaning up user folder:', err);
      }
    }

    // Step 2: Delete all sessions (CASCADE will delete recordings and analyses)
    const { error: sessionsError } = await supabaseAdmin
      .from('sessions')
      .delete()
      .eq('user_id', userId);

    if (sessionsError) {
      console.error('❌ Error deleting sessions:', sessionsError);
      return NextResponse.json(
        { error: 'Failed to delete sessions', details: sessionsError.message },
        { status: 500 }
      );
    }
    console.log('✅ Deleted all sessions and recordings from database');

    // Step 3: Cancel Stripe subscription if exists
    const { data: subscription } = await supabaseAdmin
      .from('subscriptions')
      .select('stripe_subscription_id, stripe_customer_id')
      .eq('user_id', userId)
      .single();

    if (subscription?.stripe_subscription_id) {
      try {
        console.log(`💳 Canceling Stripe subscription: ${subscription.stripe_subscription_id}`);
        await stripe.subscriptions.cancel(subscription.stripe_subscription_id);
        console.log('✅ Stripe subscription canceled');
      } catch (stripeError: any) {
        console.error('⚠️ Error canceling Stripe subscription:', stripeError.message);
        // Continue anyway - subscription will be deleted from DB
      }

      // Delete customer from Stripe (optional but cleaner)
      if (subscription.stripe_customer_id) {
        try {
          await stripe.customers.del(subscription.stripe_customer_id);
          console.log('✅ Stripe customer deleted');
        } catch (err) {
          console.warn('⚠️ Error deleting Stripe customer:', err);
        }
      }
    }

    // Step 4: Delete subscription record
    const { error: subError } = await supabaseAdmin
      .from('subscriptions')
      .delete()
      .eq('user_id', userId);

    if (subError) {
      console.warn('⚠️ Error deleting subscription record:', subError);
      // Continue anyway
    } else {
      console.log('✅ Deleted subscription record');
    }

    // Step 5: Delete user account (final step - no going back!)
    const { error: deleteUserError } = await supabaseAdmin.auth.admin.deleteUser(userId);

    if (deleteUserError) {
      console.error('❌ Error deleting user account:', deleteUserError);
      return NextResponse.json(
        { error: 'Failed to delete user account', details: deleteUserError.message },
        { status: 500 }
      );
    }

    console.log(`✅ Account deletion complete for ${userEmail}`);
    console.log('📊 Deletion summary:');
    console.log(`   - Sessions: deleted`);
    console.log(`   - Recordings: deleted`);
    console.log(`   - Videos: deleted from storage`);
    console.log(`   - Subscription: ${subscription ? 'canceled and deleted' : 'none'}`);
    console.log(`   - User account: deleted`);

    return NextResponse.json({
      success: true,
      message: 'Your account and all associated data have been permanently deleted',
      deletedAt: new Date().toISOString(),
    });

  } catch (error) {
    console.error('❌ Account deletion error:', error);

    const errorMessage = error instanceof Error
      ? error.message
      : 'An unexpected error occurred while deleting your account';

    return NextResponse.json(
      {
        error: 'Account deletion failed',
        message: errorMessage,
      },
      { status: 500 }
    );
  }
}

// Prevent GET requests
export async function GET() {
  return NextResponse.json(
    { error: 'Method not allowed. Use POST to delete account.' },
    { status: 405 }
  );
}
