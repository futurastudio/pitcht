import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync, existsSync } from 'node:fs';
import { chromium } from 'playwright';
import ts from 'typescript';

// Entirely offline: synthetic video/audio, no app server, credentials, providers or database.
// CI without the optional browser gets an explicit skip, not a fabricated browser pass.
test('browser audio recovery compresses a large saved video, preserves audio, and releases resources on success/cancel/error', { skip: !existsSync(chromium.executablePath()), timeout: 60_000 }, async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.route('**/*', route => route.abort());
    await page.setContent('<button id="recover">Prepare saved audio</button>');
    // tsx preserves class names with this small helper in serialized evaluate callbacks.
    await page.addScriptTag({ content: 'globalThis.__name = (value) => value;' });
    const compile = (path: string) => ts.transpileModule(readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    const modules = { contract: compile('src/utils/recordingContract.ts'), recovery: compile('src/utils/audioRecovery.ts') };
    const result = await page.evaluate(async ({ contract, recovery }) => {
      const contractExports = {};
      new Function('exports', contract)(contractExports);
      const exports: { extractRecordingAudio?: (source: () => Promise<string>, options: { signal: AbortSignal; onProgress?: (seconds: number) => void }) => Promise<Blob> } = {};
      new Function('exports', 'require', recovery)(exports, () => contractExports);
      const extract = exports.extractRecordingAudio!;
      // Create a real video with a known tone, then recover only its audio.
      const original = new AudioContext(); await original.resume();
      const tone = original.createOscillator(); tone.frequency.value = 440;
      const destination = original.createMediaStreamDestination(); tone.connect(destination); tone.start();
      const canvas = document.createElement('canvas'); canvas.width = 640; canvas.height = 360;
      const ctx = canvas.getContext('2d')!;
      const pixels = ctx.createImageData(canvas.width, canvas.height);
      const draw = setInterval(() => {
        for (let i = 0; i < pixels.data.length; i += 4) {
          pixels.data[i] = Math.random() * 256; pixels.data[i + 1] = Math.random() * 256; pixels.data[i + 2] = Math.random() * 256; pixels.data[i + 3] = 255;
        }
        ctx.putImageData(pixels, 0, 0);
      }, 20);
      const stream = canvas.captureStream(50); destination.stream.getAudioTracks().forEach(track => stream.addTrack(track));
      const chunks: Blob[] = [];
      const recorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp8,opus', videoBitsPerSecond: 12_000_000 });
      recorder.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
      recorder.start(1_000);
      await new Promise(resolve => setTimeout(resolve, 6_000));
      const stopped = new Promise<void>(resolve => { recorder.onstop = () => resolve(); }); recorder.stop(); await stopped;
      let mp4: Blob | undefined;
      if (MediaRecorder.isTypeSupported('video/mp4')) {
        const mp4Chunks: Blob[] = [];
        const mp4Recorder = new MediaRecorder(stream, { mimeType: 'video/mp4' });
        mp4Recorder.ondataavailable = event => { if (event.data.size) mp4Chunks.push(event.data); };
        mp4Recorder.start();
        await new Promise(resolve => setTimeout(resolve, 2_000));
        const mp4Stopped = new Promise<void>(resolve => { mp4Recorder.onstop = () => resolve(); });
        mp4Recorder.stop(); await mp4Stopped;
        mp4 = new Blob(mp4Chunks, { type: mp4Recorder.mimeType });
      }
      clearInterval(draw); tone.stop(); stream.getTracks().forEach(track => track.stop()); await original.close();
      const video = new Blob(chunks, { type: recorder.mimeType });
      const videoUrl = URL.createObjectURL(video);
      let contextsCreated = 0; let contextsClosed = 0; let tracksStopped = 0; let progress = 0;
      const NativeAudioContext = window.AudioContext;
      class TrackedAudioContext extends NativeAudioContext {
        constructor() { super(); contextsCreated++; }
        override close() { contextsClosed++; return super.close(); }
        override createMediaStreamDestination() {
          const dest = super.createMediaStreamDestination();
          for (const track of dest.stream.getTracks()) { const stop = track.stop.bind(track); track.stop = () => { tracksStopped++; stop(); }; }
          return dest;
        }
      }
      window.AudioContext = TrackedAudioContext;
      try {
        const audio = await extract(async () => videoUrl, { signal: new AbortController().signal, onProgress: seconds => { progress = seconds; } });
        const decoder = new NativeAudioContext();
        const decoded = await decoder.decodeAudioData(await audio.arrayBuffer());
        const samples = decoded.getChannelData(0); let energy = 0;
        for (const value of samples) energy += value * value;
        const decodedSeconds = decoded.duration; await decoder.close();
        let mp4Evidence: { sourceBytes: number; audioBytes: number; seconds: number; audible: boolean } | undefined;
        if (mp4) {
          const url = URL.createObjectURL(mp4);
          try {
            const result = await extract(async () => url, { signal: new AbortController().signal });
            const decoder = new NativeAudioContext();
            const decoded = await decoder.decodeAudioData(await result.arrayBuffer());
            mp4Evidence = { sourceBytes: mp4.size, audioBytes: result.size, seconds: decoded.duration, audible: decoded.getChannelData(0).some(value => Math.abs(value) > 0.05) };
            await decoder.close();
          } finally { URL.revokeObjectURL(url); }
        }
        const abort = new AbortController();
        const cancelled = extract(async () => videoUrl, { signal: abort.signal });
        setTimeout(() => abort.abort(), 200);
        let cancelledName = ''; try { await cancelled; } catch (error) { cancelledName = (error as Error).name; }
        const brokenUrl = URL.createObjectURL(new Blob(['invalid video'], { type: 'video/webm' }));
        let brokenRejected = false;
        try { await extract(async () => brokenUrl, { signal: new AbortController().signal }); } catch { brokenRejected = true; }
        finally { URL.revokeObjectURL(brokenUrl); }
        const Recorder = window.MediaRecorder;
        // Fault-inject an encoder ignoring the requested bitrate, while retaining real playback.
        class OversizedRecorder extends Recorder {
          override start() {
            super.start();
            this.dispatchEvent(new BlobEvent('dataavailable', { data: new Blob([new Uint8Array(4 * 1024 * 1024 + 1)]) }));
          }
        }
        window.MediaRecorder = OversizedRecorder;
        let oversizedRejected = false;
        try { await extract(async () => videoUrl, { signal: new AbortController().signal }); } catch (error) { oversizedRejected = /4 MiB/.test((error as Error).message); }
        finally { window.MediaRecorder = Recorder; }
        return { mp4Evidence, videoBytes: video.size, audioBytes: audio.size, mime: audio.type, decodedSeconds, rms: Math.sqrt(energy / samples.length), progress, cancelledName, brokenRejected, oversizedRejected, contextsCreated, contextsClosed, tracksStopped };
      } finally { window.AudioContext = NativeAudioContext; URL.revokeObjectURL(videoUrl); }
    }, modules);
    assert.ok(result.videoBytes > 4 * 1024 * 1024, JSON.stringify(result));
    assert.ok(result.audioBytes > 0 && result.audioBytes < 100_000, JSON.stringify(result));
    assert.match(result.mime, /^audio\//);
    assert.ok(result.decodedSeconds > 5 && result.decodedSeconds < 8, JSON.stringify(result));
    assert.ok(result.rms > 0.05, 'recovered audio must contain the original tone, not silence');
    assert.ok(result.progress > 4);
    if (result.mp4Evidence) {
      assert.ok(result.mp4Evidence.audioBytes > 0 && result.mp4Evidence.audioBytes < 30_000);
      assert.ok(result.mp4Evidence.seconds > 1.5 && result.mp4Evidence.seconds < 3);
      assert.equal(result.mp4Evidence.audible, true);
    }
    assert.equal(result.cancelledName, 'AbortError');
    assert.equal(result.brokenRejected, true); assert.equal(result.oversizedRejected, true);
    assert.equal(result.contextsClosed, result.contextsCreated);
    assert.equal(result.tracksStopped, result.contextsCreated);
    console.log('Offline media evidence:', JSON.stringify(result));
  } finally { await browser.close(); }
});
