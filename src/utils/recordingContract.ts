export const MAX_TRANSCRIPTION_BYTES = 4 * 1024 * 1024;
// Supabase's Free-plan "50 MB" ceiling is 50 * 1024 * 1024 bytes.
// Videos upload directly to Storage, whose global/bucket limits remain authoritative.
export const MAX_VIDEO_BYTES = 50 * 1024 * 1024;
export const STORAGE_RESTRICTED_MESSAGE = 'Pitcht video storage is temporarily restricted. Keep this tab open and download the original to keep your answer. Retry saving when storage is available.';
export const CLIENT_UPGRADE_MESSAGE = 'This tab needs an update. Wait until your recording finishes saving before refreshing, then reopen the saved session from History and retry. If saving failed, keep this tab open and retry the upload first.';

/** Only classify errors from Storage calls; a billing/practice HTTP 402 means something else. */
export function storageUploadRejection(error: unknown): Error | null {
  if (!error || typeof error !== 'object') return null;
  const details = error as { status?: unknown; statusCode?: unknown; code?: unknown; message?: unknown };
  const statuses = [details.status, details.statusCode].map(String);
  if (statuses.includes('402')) return new Error(STORAGE_RESTRICTED_MESSAGE);
  if (statuses.includes('413') || details.code === 'EntityTooLarge' || details.statusCode === 'EntityTooLarge'
    || (typeof details.message === 'string' && details.message.includes('exceeded the maximum allowed size'))) {
    return new Error('The storage service rejected this video as too large. Download the original, then record a shorter answer.');
  }
  return null;
}

export function transcriptionForm(audio: Blob, recordingId: string): FormData {
  if (!recordingId) throw new Error(CLIENT_UPGRADE_MESSAGE);
  if (!audio.size) throw new Error('No audio was captured. Your saved video is still available; retry from History.');
  if (audio.size > MAX_TRANSCRIPTION_BYTES) throw new Error('Audio exceeds 4 MiB. Open the saved answer in History and retry to compress its audio.');
  const mime = audio.type.split(';')[0].toLowerCase();
  const extensions: Record<string, string> = { 'audio/webm': 'webm', 'audio/mp4': 'm4a', 'audio/ogg': 'ogg', 'audio/mpeg': 'mp3', 'audio/wav': 'wav' };
  if (!extensions[mime]) throw new Error('This audio format cannot be sent. Retry using the saved video in History.');
  const form = new FormData();
  form.append('recordingId', recordingId);
  form.append('audio', audio, `answer.${extensions[mime]}`);
  return form;
}

/** JSON stores recovery metadata only. Media bytes stay in memory or private Storage. */
export function recordingMetadata<T extends { videoBlob?: Blob; audioBlob?: Blob }>(recording: T): Omit<T, 'videoBlob' | 'audioBlob'> {
  const metadata = { ...recording };
  delete metadata.videoBlob;
  delete metadata.audioBlob;
  return metadata;
}
