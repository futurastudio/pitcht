/**
 * Audio Extractor Service
 * Extracts audio track from video blobs for efficient transcription
 *
 * Purpose: Reduce file size for Whisper API transcription
 * - Video blob: ~10-15MB per minute = 50-75MB for 5 minutes
 * - Audio-only: ~2MB per minute = 10MB for 5 minutes
 * - Whisper limit: 25MB
 */

/**
 * Extract audio track from video blob
 * Uses Web Audio API to decode video and re-encode as audio-only
 *
 * @param videoBlob - Video blob (webm format with audio track)
 * @returns Audio-only blob (webm audio format, much smaller)
 */
export async function extractAudioFromVideo(videoBlob: Blob): Promise<Blob> {
  console.log(`🎵 Extracting audio from video (${(videoBlob.size / (1024 * 1024)).toFixed(2)}MB)...`);

  try {
    // Create a video element to load the blob
    const video = document.createElement('video');
    const videoUrl = URL.createObjectURL(videoBlob);
    video.src = videoUrl;

    // Wait for video to load metadata
    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error('Failed to load video'));
    });

    // Create MediaStream from video element
    // @ts-ignore - captureStream is not in TypeScript definitions but exists in browsers
    const stream: MediaStream = video.captureStream ? video.captureStream() : video.mozCaptureStream();

    // Get only the audio track
    const audioTracks = stream.getAudioTracks();
    if (audioTracks.length === 0) {
      throw new Error('No audio track found in video');
    }

    // Create a new MediaStream with only audio
    const audioStream = new MediaStream([audioTracks[0]]);

    // Record audio-only stream
    const mediaRecorder = new MediaRecorder(audioStream, {
      mimeType: 'audio/webm',
    });

    const audioChunks: Blob[] = [];

    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        audioChunks.push(event.data);
      }
    };

    // Start recording and play video (needed to generate audio data)
    const audioBlob = await new Promise<Blob>((resolve, reject) => {
      mediaRecorder.onstop = () => {
        const blob = new Blob(audioChunks, { type: 'audio/webm' });
        resolve(blob);
      };

      mediaRecorder.onerror = (error) => {
        reject(error);
      };

      mediaRecorder.start();
      video.play();

      // Stop recording when video ends
      video.onended = () => {
        mediaRecorder.stop();
        stream.getTracks().forEach(track => track.stop());
        URL.revokeObjectURL(videoUrl);
      };
    });

    console.log(`✅ Audio extracted: ${(audioBlob.size / (1024 * 1024)).toFixed(2)}MB (${Math.round((1 - audioBlob.size / videoBlob.size) * 100)}% size reduction)`);

    return audioBlob;

  } catch (error) {
    console.error('❌ Audio extraction failed:', error);
    console.warn('⚠️  Falling back to full video blob (may exceed Whisper 25MB limit)');
    // Fallback: return original video (will work for short recordings)
    return videoBlob;
  }
}

/**
 * Validate file size for Whisper API
 * Whisper has a 25MB limit for audio files
 *
 * @param blob - Audio/video blob to validate
 * @param maxSizeMB - Maximum allowed size in MB (default: 25)
 * @throws Error if file is too large
 */
export function validateWhisperFileSize(blob: Blob, maxSizeMB: number = 25): void {
  const fileSizeMB = blob.size / (1024 * 1024);

  if (fileSizeMB > maxSizeMB) {
    throw new Error(
      `Audio file too large for transcription (${fileSizeMB.toFixed(2)}MB, max: ${maxSizeMB}MB). ` +
      `This is likely a bug - audio extraction may have failed. Please try recording a shorter answer.`
    );
  }

  console.log(`✅ File size validated: ${fileSizeMB.toFixed(2)}MB (within ${maxSizeMB}MB limit)`);
}

/**
 * Get estimated audio size from video duration
 * Useful for displaying size estimates to users
 *
 * @param durationSeconds - Video duration in seconds
 * @returns Estimated audio file size in MB
 */
export function estimateAudioSize(durationSeconds: number): number {
  // Audio-only WebM: ~2MB per minute on average
  const MB_PER_MINUTE = 2;
  return (durationSeconds / 60) * MB_PER_MINUTE;
}

/**
 * Get estimated video size from duration
 * Useful for displaying size estimates to users
 *
 * @param durationSeconds - Video duration in seconds
 * @returns Estimated video file size in MB
 */
export function estimateVideoSize(durationSeconds: number): number {
  // Video WebM: ~10-15MB per minute, use 12.5 average
  const MB_PER_MINUTE = 12.5;
  return (durationSeconds / 60) * MB_PER_MINUTE;
}
