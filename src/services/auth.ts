/**
 * Authentication Helper Service
 * Handles anonymous auth for now (will add email/password later)
 */

import { supabase } from './supabase';

/**
 * Get or create an anonymous user
 * This allows the app to work without requiring signup
 * Later we'll add proper email/password auth
 */
export async function getOrCreateAnonymousUser() {
  try {
    // Check if there's already a session
    const { data: { session } } = await supabase.auth.getSession();

    if (session) {
      console.log('✅ Existing session found:', session.user.id);
      return session.user;
    }

    // No session - create anonymous user
    console.log('🔓 Creating anonymous user...');
    const { data, error } = await supabase.auth.signInAnonymously();

    if (error) {
      console.error('Anonymous auth error:', error);

      // Provide helpful error message for common issues
      if (error.message?.includes('Anonymous sign-ins are disabled')) {
        console.error('\n❌ CONFIGURATION ERROR: Anonymous authentication is disabled in Supabase');
        console.error('📝 To fix this:');
        console.error('   1. Go to https://supabase.com/dashboard');
        console.error('   2. Select your project');
        console.error('   3. Navigate to Authentication → Providers');
        console.error('   4. Enable "Anonymous Sign-In"');
        console.error('   5. Refresh this page\n');
      }

      throw error;
    }

    if (data.user) {
      console.log('✅ Anonymous user created:', data.user.id);
      return data.user;
    }

    throw new Error('Failed to create anonymous user');

  } catch (error) {
    console.error('Failed to get/create user:', error);
    throw error;
  }
}

/**
 * Get current user (anonymous or authenticated)
 */
export async function getCurrentUser() {
  const { data: { user }, error } = await supabase.auth.getUser();

  if (error) {
    console.error('Error getting user:', error);
    return null;
  }

  return user;
}

/**
 * Sign out (clear session)
 */
export async function signOut() {
  const { error } = await supabase.auth.signOut();

  if (error) {
    console.error('Sign out error:', error);
    throw error;
  }

  console.log('✅ Signed out');
}

/**
 * Convert anonymous user's data to real account
 * Transfers all sessions, recordings, and analyses to the new user
 */
export async function convertAnonymousToRealAccount(
  anonymousUserId: string,
  newUserId: string
): Promise<void> {
  try {
    console.log('🔄 Converting anonymous account to real account...');
    console.log('  Anonymous user:', anonymousUserId);
    console.log('  New user:', newUserId);

    // Transfer all sessions from anonymous user to new user
    const { error: sessionsError } = await supabase
      .from('sessions')
      .update({ user_id: newUserId })
      .eq('user_id', anonymousUserId);

    if (sessionsError) {
      console.error('Error transferring sessions:', sessionsError);
      throw sessionsError;
    }

    console.log('✅ Anonymous account converted successfully');
  } catch (error) {
    console.error('Failed to convert anonymous account:', error);
    throw error;
  }
}
