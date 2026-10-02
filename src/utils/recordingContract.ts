export const MAX_TRANSCRIPTION_BYTES = 4 * 1024 * 1024;
export const CLIENT_UPGRADE_MESSAGE = 'This tab needs an update. Wait until your recording finishes saving before refreshing, then reopen the saved session from History and retry. If saving failed, keep this tab open and retry the upload first.';

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
