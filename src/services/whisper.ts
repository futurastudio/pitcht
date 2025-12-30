/**
 * Whisper AI Service
 * Handles speech-to-text transcription using OpenAI Whisper API
 */

import OpenAI from 'openai';

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export interface TranscriptionResult {
  text: string;
  duration?: number;
  language?: string;
}

/**
 * Transcribe audio file to text using Whisper
 * @param audioFile - The audio file to transcribe (WebM, MP3, etc.)
 * @param options - Optional transcription parameters
 * @returns Transcription result with text and metadata
 */
export async function transcribeAudio(
  audioFile: File | Blob,
  options?: {
    language?: string;
    prompt?: string; // Optional context to improve accuracy
  }
): Promise<TranscriptionResult> {
  try {
    // Convert Blob to File if needed
    const file = audioFile instanceof File
      ? audioFile
      : new File([audioFile], 'audio.webm', { type: 'audio/webm' });

    // Call Whisper API
    const transcription = await openai.audio.transcriptions.create({
      file: file,
      model: 'whisper-1',
      language: options?.language, // Optional: specify language code (e.g., 'en')
      prompt: options?.prompt, // Optional: provide context for better accuracy
      response_format: 'verbose_json', // Get detailed response with timestamps
    });

    return {
      text: transcription.text,
      duration: transcription.duration,
      language: transcription.language,
    };
  } catch (error) {
    console.error('Error transcribing audio with Whisper:', error);
    throw new Error('Failed to transcribe audio. Please try again.');
  }
}

/**
 * Transcribe audio from a data URL or base64 string
 * @param audioDataUrl - Base64 encoded audio data
 * @param options - Optional transcription parameters
 * @returns Transcription result
 */
export async function transcribeAudioFromDataUrl(
  audioDataUrl: string,
  options?: {
    language?: string;
    prompt?: string;
  }
): Promise<TranscriptionResult> {
  try {
    // Convert data URL to Blob
    const response = await fetch(audioDataUrl);
    const blob = await response.blob();

    return transcribeAudio(blob, options);
  } catch (error) {
    console.error('Error converting data URL to audio:', error);
    throw new Error('Failed to process audio data.');
  }
}
