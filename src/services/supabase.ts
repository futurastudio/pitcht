/**
 * Supabase Client Service
 * Provides Supabase client and helper functions for video storage
 */

import { createClient } from '@supabase/supabase-js';
import { MAX_VIDEO_BYTES, storageUploadRejection } from '@/utils/recordingContract';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

/**
 * Supabase client (uses anon key + RLS for security)
 * Safe to use on client-side - RLS policies protect data
 *
 * detectSessionInUrl: true — required so Supabase can parse the #access_token=
 * hash that Google OAuth redirects back with. Stripe return URLs use query params
 * (?session_id=, /success, /settings) which do NOT contain access_token, so
 * Supabase will not misfire on them.
 *
 * persistSession: true — keeps the session in localStorage so returning from
 * an external domain (Stripe checkout) does not log the user out.
 *
 * autoRefreshToken: true — silently refreshes the JWT before it expires so
 * users are never kicked out mid-session.
 */
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

export function recordingVideoPath(userId: string, sessionId: string, mime: string, captureId: string): string {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(captureId)) {
    throw new Error('Invalid recording capture ID. Keep this tab open to recover your video.');
  }
  const extensions: Record<string, string> = { 'video/webm': 'webm', 'video/mp4': 'mp4', 'video/quicktime': 'mov', 'video/x-matroska': 'mkv' };
  const extension = extensions[mime.split(';')[0].trim().toLowerCase()];
  if (!extension) throw new Error('Unsupported video format. Download your captured original before recording again.');
  return `${userId}/${sessionId}/${captureId}.${extension}`;
}

async function sameVideoBytes(original: Blob, saved: Blob): Promise<boolean> {
  if (original.size !== saved.size) return false;
  // Bounded comparison buffers: only uncertain uploads incur this authenticated read.
  for (let offset = 0; offset < original.size; offset += 64 * 1024) {
    const [a, b] = await Promise.all([original.slice(offset, offset + 64 * 1024).arrayBuffer(), saved.slice(offset, offset + 64 * 1024).arrayBuffer()]);
    const bytes = new Uint8Array(b);
    if (new Uint8Array(a).some((value, index) => value !== bytes[index])) return false;
  }
  return true;
}

/**
 * Upload video to Supabase Storage
 * @param userId - User ID (for organizing files)
 * @param sessionId - Session ID (for organizing files)
 * @param videoBlob - Video blob to upload
 * @returns Storage path of uploaded video
 */
export async function uploadVideo(
  userId: string,
  sessionId: string,
  videoBlob: Blob,
  captureId: string = crypto.randomUUID(),
): Promise<string> {
  // 1. Validate file type
  const validVideoTypes = [
    'video/webm',
    'video/mp4',
    'video/quicktime', // .mov files
    'video/x-matroska', // .mkv files
  ];

  const contentType = videoBlob.type.split(';')[0].trim().toLowerCase();
  if (!validVideoTypes.includes(contentType)) {
    console.error(`❌ Invalid file type: ${videoBlob.type}`);
    throw new Error(
      `Invalid file type: ${videoBlob.type}. Only video files are allowed (webm, mp4, mov, mkv).`
    );
  }

  // 2. Validate file is not empty
  if (videoBlob.size === 0) {
    console.error('❌ Empty file detected');
    throw new Error('Cannot upload empty video file. Please record a video first.');
  }

  // 3. Check file size
  const MIN_FILE_SIZE = 100 * 1024; // 100KB minimum (prevents corrupted/incomplete videos)
  const fileSizeMB = (videoBlob.size / (1024 * 1024)).toFixed(2);

  if (videoBlob.size < MIN_FILE_SIZE) {
    console.warn(`⚠️  Video file too small: ${fileSizeMB}MB (likely corrupted or incomplete)`);
    throw new Error(
      `Video file is too small (${fileSizeMB}MB). Please ensure the video recorded properly.`
    );
  }

  if (videoBlob.size > MAX_VIDEO_BYTES) {
    throw new Error(
      'This video exceeds the 50 MB upload limit. Keep this tab open and download the original, then record a shorter answer.'
    );
  }

  const fileName = recordingVideoPath(userId, sessionId, contentType, captureId);

  console.log(`📤 Uploading video: ${fileName} (${fileSizeMB}MB)`);

  try {
    const { data, error } = await supabase.storage.from('recordings').upload(fileName, videoBlob, { contentType, upsert: false });
    if (error) throw error;
    if (data?.path !== fileName) throw new Error('Upload confirmation was incomplete.');
  } catch (error) {
    const rejection = storageUploadRejection(error);
    if (rejection) throw rejection;
    // A timeout/duplicate may mean the upload committed. Verify this exact own path
    // and exact bytes; never overwrite it or silently accept a different recording.
    let recoveryError: unknown;
    try {
      const { data, error } = await supabase.storage.from('recordings').download(fileName);
      recoveryError = error;
      if (!error && data && await sameVideoBytes(videoBlob, data)) return fileName;
    } catch (error) {
      recoveryError = error;
      // An uncertain read remains a retryable save failure with the same capture ID.
    }
    throw storageUploadRejection(recoveryError)
      ?? new Error('Could not confirm this video upload. Keep this tab open and retry saving, or download the captured original.');
  }

  return fileName;
}

/**
 * Get signed URL for private video
 * Signed URLs expire after 1 hour for security
 * @param path - Storage path from uploadVideo()
 * @returns Signed URL for video playback
 */
export async function getVideoUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage
    .from('recordings')
    .createSignedUrl(path, 3600); // 1 hour expiry

  if (error) {
    throw new Error(`Failed to get video URL: ${error.message}`);
  }

  return data.signedUrl;
}

/**
 * Delete video from storage
 * @param path - Storage path to delete
 */
export async function deleteVideo(path: string): Promise<void> {
  const { error } = await supabase.storage
    .from('recordings')
    .remove([path]);

  if (error) {
    throw new Error(`Failed to delete video: ${error.message}`);
  }

  console.log(`🗑️  Video deleted: ${path}`);
}

/**
 * Get current user from Supabase Auth
 * Returns null if not authenticated
 */
export async function getCurrentUser() {
  const { data: { user }, error } = await supabase.auth.getUser();

  if (error) {
    console.error('Error getting current user:', error);
    return null;
  }

  return user;
}

/**
 * Check if user is authenticated
 */
export async function isAuthenticated(): Promise<boolean> {
  const user = await getCurrentUser();
  return user !== null;
}
