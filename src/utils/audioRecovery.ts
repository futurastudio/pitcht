import { MAX_TRANSCRIPTION_BYTES } from './recordingContract';

export const MAX_RECOVERY_SECONDS = 10 * 60;
export const AUDIO_BITS_PER_SECOND = 32_000;
const UNSUPPORTED = 'This browser cannot prepare audio from the saved video. Your video is safe. Open this session in a current Chrome, Firefox or Safari browser and retry.';

export function supportedAudioMime(supported: (mime: string) => boolean): string | undefined {
  return ['audio/webm;codecs=opus', 'audio/mp4', 'audio/ogg;codecs=opus'].find(supported);
}

/** Re-encode only the audio track, in real time, without modifying the source video.
 * Call directly from a click: the AudioContext is resumed before resolving a signed URL.
 * An unknown WebM duration is allowed, but playback time and wall time remain bounded.
 */
export function extractRecordingAudio(
  source: () => Promise<string>,
  options: { signal: AbortSignal; onProgress?: (seconds: number, total?: number) => void },
): Promise<Blob> {
  if (typeof AudioContext === 'undefined' || typeof MediaRecorder === 'undefined') return Promise.reject(new Error(UNSUPPORTED));
  const mimeType = supportedAudioMime(mime => MediaRecorder.isTypeSupported(mime));
  if (!mimeType) return Promise.reject(new Error(UNSUPPORTED));
  if (options.signal.aborted) return Promise.reject(new DOMException('Audio preparation cancelled.', 'AbortError'));

  return new Promise<Blob>((resolve, reject) => {
    let context: AudioContext | undefined;
    let media: HTMLVideoElement | undefined;
    let input: MediaElementAudioSourceNode | undefined;
    let destination: MediaStreamAudioDestinationNode | undefined;
    let analyser: AnalyserNode | undefined;
    let recorder: MediaRecorder | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let monitor: ReturnType<typeof setInterval> | undefined;
    let finished = false;
    let bytes = 0;
    let heardAudio = false;
    const chunks: Blob[] = [];
    const cleanup = () => {
      clearTimeout(timer); clearInterval(monitor);
      options.signal.removeEventListener('abort', cancel);
      if (media) {
        media.onloadedmetadata = media.ontimeupdate = media.onended = media.onerror = media.onplaying = media.onwaiting = null;
        media.pause(); media.removeAttribute('src'); media.load(); media.remove();
      }
      if (recorder) {
        recorder.ondataavailable = recorder.onstop = recorder.onerror = null;
        if (recorder.state !== 'inactive') recorder.stop();
      }
      input?.disconnect(); analyser?.disconnect(); destination?.disconnect();
      destination?.stream.getTracks().forEach(track => track.stop());
      void context?.close().catch(() => {});
    };
    const finish = (error?: Error, audio?: Blob) => {
      if (finished) return;
      finished = true;
      cleanup();
      if (error) reject(error); else resolve(audio!);
    };
    const cancel = () => finish(new DOMException('Audio preparation cancelled. Your saved video is unchanged.', 'AbortError'));
    options.signal.addEventListener('abort', cancel, { once: true });
    try {
      context = new AudioContext();
      const ready = context.resume().catch(() => {
        finish(new Error('Audio is paused by your browser. Keep this tab active and click Retry again.'));
      }); // Keep browser user activation, before awaiting source().
      media = document.createElement('video');
      media.crossOrigin = 'anonymous'; media.preload = 'auto'; media.playsInline = true;
      // Playback is routed only to the recorder, never the speakers.
      input = context.createMediaElementSource(media);
      destination = context.createMediaStreamDestination();
      destination.channelCount = 1;
      analyser = context.createAnalyser();
      analyser.fftSize = 2048;
      input.connect(analyser); analyser.connect(destination);
      recorder = new MediaRecorder(destination.stream, { mimeType, audioBitsPerSecond: AUDIO_BITS_PER_SECOND });
      recorder.ondataavailable = ({ data }) => {
        bytes += data.size;
        if (bytes > MAX_TRANSCRIPTION_BYTES) finish(new Error('Compressed audio exceeds 4 MiB. Your original video is unchanged.'));
        else if (data.size) chunks.push(data);
      };
      recorder.onerror = () => finish(new Error('Audio preparation failed. Your saved video is unchanged; try again.'));
      recorder.onstop = () => {
        const audio = new Blob(chunks, { type: recorder!.mimeType || mimeType });
        if (!heardAudio || !audio.size) finish(new Error('No audible audio could be read from this video. Check playback, then retry in another browser.'));
        else finish(undefined, audio);
      };
      media.onloadedmetadata = () => {
        if (Number.isFinite(media!.duration) && media!.duration > MAX_RECOVERY_SECONDS) {
          finish(new Error('Audio recovery supports answers up to 10 minutes. Your full video is still available to play or download.'));
        }
      };
      media.ontimeupdate = () => {
        if (media!.currentTime > MAX_RECOVERY_SECONDS) {
          finish(new Error('This answer exceeds the 10-minute audio recovery limit. Your full video is unchanged.'));
          return;
        }
        options.onProgress?.(media!.currentTime, Number.isFinite(media!.duration) ? media!.duration : undefined);
      };
      media.onplaying = () => {
        if (recorder!.state === 'inactive') recorder!.start(1_000);
        else if (recorder!.state === 'paused') recorder!.resume();
      };
      media.onwaiting = () => { if (recorder!.state === 'recording') recorder!.pause(); };
      media.onended = () => {
        if (recorder!.state !== 'inactive') recorder!.stop();
        else finish(new Error('No audio could be prepared. Your saved video is unchanged.'));
      };
      media.onerror = () => finish(new Error('This browser could not read the saved video. Your video is unchanged; retry in another browser.'));
      const samples = new Float32Array(analyser.fftSize);
      monitor = setInterval(() => {
        analyser!.getFloatTimeDomainData(samples);
        if (samples.some(value => Math.abs(value) > 0.0001)) heardAudio = true;
      }, 100);
      timer = setTimeout(() => finish(new Error('Audio preparation timed out. Keep this tab active and retry. Your video is unchanged.')), (MAX_RECOVERY_SECONDS + 60) * 1_000);
      // Attach rejection handlers immediately to avoid unhandled source/resume failures.
      void Promise.all([ready, source()]).then(async ([, url]) => {
        if (finished) return;
        if (context!.state !== 'running') throw new Error('Audio is paused by your browser. Keep this tab active and click Retry again.');
        media!.src = url;
        await media!.play();
      }).catch(() => finish(new Error('Could not prepare the saved video. Keep this tab active and retry; your video is unchanged.')));
    } catch { finish(new Error(UNSUPPORTED)); }
  });
}
