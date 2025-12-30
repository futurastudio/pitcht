/**
 * Supabase Client Service
 * Provides Supabase client and helper functions for video storage
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

/**
 * Supabase client (uses anon key + RLS for security)
 * Safe to use on client-side - RLS policies protect data
 */
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

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
  videoBlob: Blob
): Promise<string> {
  // 1. Validate file type
  const validVideoTypes = [
    'video/webm',
    'video/mp4',
    'video/quicktime', // .mov files
    'video/x-matroska', // .mkv files
  ];

  if (!validVideoTypes.includes(videoBlob.type)) {
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
  // NOTE: Supabase Pro plan allows up to 500GB uploads (configurable in Storage Settings)
  // Default is 50MB for Free tier - if you have Pro plan, increase this limit in Supabase dashboard
  // and update MAX_FILE_SIZE constant below to match your configured limit
  const MAX_FILE_SIZE = 200 * 1024 * 1024; // 200MB (adjust based on your Supabase plan)
  const MIN_FILE_SIZE = 100 * 1024; // 100KB minimum (prevents corrupted/incomplete videos)
  const fileSizeMB = (videoBlob.size / (1024 * 1024)).toFixed(2);

  if (videoBlob.size < MIN_FILE_SIZE) {
    console.warn(`⚠️  Video file too small: ${fileSizeMB}MB (likely corrupted or incomplete)`);
    throw new Error(
      `Video file is too small (${fileSizeMB}MB). Please ensure the video recorded properly.`
    );
  }

  if (videoBlob.size > MAX_FILE_SIZE) {
    console.warn(`⚠️  Video file too large: ${fileSizeMB}MB (max: ${MAX_FILE_SIZE / (1024 * 1024)}MB)`);
    console.warn(`💡 Current bitrate supports ~16 minutes of recording with this limit.`);
    console.warn(`   To increase: Go to Supabase Dashboard → Storage Settings → Increase file size limit`);
    throw new Error(
      `Video file is too large (${fileSizeMB}MB, maximum: ${MAX_FILE_SIZE / (1024 * 1024)}MB). ` +
      `Please keep recordings under the configured limit. ` +
      `If you have Supabase Pro plan, you can increase this limit in Storage Settings.`
    );
  }

  const timestamp = Date.now();
  const fileName = `${userId}/${sessionId}/${timestamp}.webm`;

  console.log(`📤 Uploading video: ${fileName} (${fileSizeMB}MB)`);

  const { data, error } = await supabase.storage
    .from('recordings')
    .upload(fileName, videoBlob, {
      contentType: 'video/webm',
      upsert: false,
    });

  if (error) {
    console.error('Video upload error:', error);

    // Provide helpful error messages
    if (error.message.includes('exceeded the maximum allowed size')) {
      throw new Error(`Video file is too large (${fileSizeMB}MB). Please keep recordings under 3 minutes.`);
    }

    throw new Error(`Failed to upload video: ${error.message}`);
  }

  console.log(`✅ Video uploaded: ${data.path}`);
  return data.path;
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
