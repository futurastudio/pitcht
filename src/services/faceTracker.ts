/**
 * Face Tracker Service
 * Uses MediaPipe Face Mesh to track eye contact, gaze direction, and emotion
 * during recording. Emotion is derived from facial geometry — no external
 * Python service required.
 */

// Define MediaPipe types (loaded dynamically from CDN)
interface NormalizedLandmark {
  x: number;
  y: number;
  z: number;
}

interface Results {
  multiFaceLandmarks?: NormalizedLandmark[][];
  image: HTMLVideoElement | HTMLCanvasElement;
}

interface FaceMeshConfig {
  locateFile: (file: string) => string;
}

interface FaceMeshOptions {
  maxNumFaces: number;
  refineLandmarks: boolean;
  minDetectionConfidence: number;
  minTrackingConfidence: number;
}

interface FaceMesh {
  setOptions(options: FaceMeshOptions): void;
  onResults(callback: (results: Results) => void): void;
  send(inputs: { image: HTMLVideoElement }): Promise<void>;
  close(): void;
}

declare const FaceMesh: {
  new (config: FaceMeshConfig): FaceMesh;
};

export interface EyeTrackingMetrics {
  eyeContactPercentage: number; // Percentage of time looking at camera (0-100)
  gazeStability: number; // How stable the gaze is (0-100, higher is more stable)
  totalFrames: number;
  lookingAtCameraFrames: number;
  averageGazeDeviation: number; // Average deviation from center
  // Emotion fields derived from facial geometry
  dominantEmotion: string; // 'confident' | 'happy' | 'neutral' | 'nervous' | 'tense'
  emotionConfidence: number; // 0-100
}

export interface GazePoint {
  x: number; // -1 to 1, 0 is center
  y: number; // -1 to 1, 0 is center
  timestamp: number;
}

// Accumulated emotion signal across frames
interface EmotionAccumulator {
  mouthCurveSum: number;   // positive = smile, negative = frown
  browRaiseSum: number;    // positive = raised, 0 = neutral, negative = furrowed
  jawOpenSum: number;      // positive = open/engaged
  frameCount: number;
}

class FaceTrackerService {
  private static instance: FaceTrackerService | null = null;
  private faceMesh: FaceMesh | null = null;
  private isTracking: boolean = false;
  private gazeHistory: GazePoint[] = [];
  private totalFrames: number = 0; // Frames where a face was detected
  private totalProcessedFrames: number = 0; // All frames processed (including no-face frames)
  private lookingAtCameraFrames: number = 0;
  private readonly GAZE_THRESHOLD = 0.15; // Threshold for "looking at camera" (within 15% of center)
  private videoElement: HTMLVideoElement | null = null;
  private animationFrameId: number | null = null;
  private emotionAccumulator: EmotionAccumulator = {
    mouthCurveSum: 0,
    browRaiseSum: 0,
    jawOpenSum: 0,
    frameCount: 0,
  };
  // Frame throttle: only send every Nth frame to MediaPipe.
  // 10fps is more than sufficient for eye-contact and emotion metrics.
  // This cuts main-thread CPU usage by ~65% and eliminates the video stutter.
  private readonly PROCESS_EVERY_N_FRAMES = 3;
  private frameSkipCounter: number = 0;

  /**
   * Get singleton instance
   */
  static getInstance(): FaceTrackerService {
    if (!FaceTrackerService.instance) {
      FaceTrackerService.instance = new FaceTrackerService();
    }
    return FaceTrackerService.instance;
  }

  /**
   * Initialize MediaPipe Face Mesh with video element
   */
  async initialize(videoElement: HTMLVideoElement): Promise<void> {
    if (this.faceMesh && this.videoElement === videoElement) {
      return; // Already initialized
    }

    this.videoElement = videoElement;

    // Check if FaceMesh is available (loaded from CDN)
    if (typeof window === 'undefined' || !(window as any).FaceMesh) {
      throw new Error('MediaPipe FaceMesh not loaded. Please ensure the MediaPipe script is included.');
    }

    const FaceMeshConstructor = (window as any).FaceMesh;
    this.faceMesh = new FaceMeshConstructor({
      locateFile: (file: string) => {
        return `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`;
      },
    });

    if (!this.faceMesh) {
      throw new Error('Failed to create FaceMesh instance');
    }

    this.faceMesh.setOptions({
      maxNumFaces: 1,
      refineLandmarks: true, // Enables iris tracking
      minDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });

    this.faceMesh.onResults(this.onResults.bind(this));
  }

  /**
   * Start tracking
   */
  async startTracking(): Promise<void> {
    if (!this.faceMesh || !this.videoElement) {
      return;
    }

    this.isTracking = true;
    this.resetMetrics();

    // Manually process frames using requestAnimationFrame.
    // Only send every PROCESS_EVERY_N_FRAMES-th frame to MediaPipe to keep
    // the main thread free for smooth video rendering. 10fps is sufficient
    // for accurate eye-contact and emotion metrics over a recording session.
    const processFrame = async () => {
      if (!this.isTracking || !this.faceMesh || !this.videoElement) {
        return;
      }

      this.frameSkipCounter++;
      if (this.frameSkipCounter >= this.PROCESS_EVERY_N_FRAMES) {
        this.frameSkipCounter = 0;
        try {
          await this.faceMesh.send({ image: this.videoElement });
        } catch (err) {
          // Silently continue on frame errors — individual frame failures are non-fatal
        }
      }

      if (this.isTracking) {
        this.animationFrameId = requestAnimationFrame(processFrame);
      }
    };

    processFrame();
  }

  /**
   * Process MediaPipe results
   */
  private onResults(results: Results): void {
    if (!this.isTracking) {
      return;
    }

    // Count every processed frame regardless of face detection
    this.totalProcessedFrames++;

    if (!results.multiFaceLandmarks || results.multiFaceLandmarks.length === 0) {
      return;
    }

    this.totalFrames++;

    const landmarks = results.multiFaceLandmarks[0];

    // --- Gaze tracking ---
    const gaze = this.calculateGazeDirection(landmarks);
    if (gaze) {
      this.gazeHistory.push({
        x: gaze.x,
        y: gaze.y,
        timestamp: Date.now(),
      });

      const distanceFromCenter = Math.sqrt(gaze.x * gaze.x + gaze.y * gaze.y);
      if (distanceFromCenter <= this.GAZE_THRESHOLD) {
        this.lookingAtCameraFrames++;
      }
    }

    // --- Emotion geometry ---
    this.accumulateEmotionSignals(landmarks);
  }

  /**
   * Calculate gaze direction from facial landmarks
   * Uses iris landmarks to determine where the person is looking
   */
  private calculateGazeDirection(landmarks: NormalizedLandmark[]): { x: number; y: number } | null {
    // Iris landmark indices (MediaPipe Face Mesh with refineLandmarks: true)
    // Left iris center: 468, Right iris center: 473
    const LEFT_IRIS_CENTER = 468;
    const RIGHT_IRIS_CENTER = 473;

    // Eye corner indices
    const LEFT_EYE_LEFT_CORNER = 33;
    const LEFT_EYE_RIGHT_CORNER = 133;
    const RIGHT_EYE_LEFT_CORNER = 362;
    const RIGHT_EYE_RIGHT_CORNER = 263;

    try {
      const leftIris = landmarks[LEFT_IRIS_CENTER];
      const rightIris = landmarks[RIGHT_IRIS_CENTER];
      const leftEyeLeft = landmarks[LEFT_EYE_LEFT_CORNER];
      const leftEyeRight = landmarks[LEFT_EYE_RIGHT_CORNER];
      const rightEyeLeft = landmarks[RIGHT_EYE_LEFT_CORNER];
      const rightEyeRight = landmarks[RIGHT_EYE_RIGHT_CORNER];

      // Normalized iris position within each eye socket
      const leftEyeWidth = Math.abs(leftEyeRight.x - leftEyeLeft.x);
      const leftEyeCenter = (leftEyeRight.x + leftEyeLeft.x) / 2;
      const leftGazeX = leftEyeWidth > 0
        ? (leftIris.x - leftEyeCenter) / (leftEyeWidth / 2)
        : 0;

      const rightEyeWidth = Math.abs(rightEyeRight.x - rightEyeLeft.x);
      const rightEyeCenter = (rightEyeRight.x + rightEyeLeft.x) / 2;
      const rightGazeX = rightEyeWidth > 0
        ? (rightIris.x - rightEyeCenter) / (rightEyeWidth / 2)
        : 0;

      const gazeX = (leftGazeX + rightGazeX) / 2;
      const averageIrisY = (leftIris.y + rightIris.y) / 2;
      const gazeY = (averageIrisY - 0.5) * 2; // Normalize to -1..1

      return { x: gazeX, y: gazeY };
    } catch {
      return null;
    }
  }

  /**
   * Accumulate facial geometry signals for emotion inference.
   *
   * Landmark indices used (stable Face Mesh 468-point map):
   *   Mouth corners:     61 (left), 291 (right)
   *   Upper lip center:  13
   *   Lower lip center:  14
   *   Chin:              152
   *   Nose tip:          1
   *   Left inner brow:   55    Right inner brow: 285
   *   Left outer brow:   46    Right outer brow: 276
   *   Left mid-forehead: 103   Right mid-forehead: 332
   *
   * All coordinates are normalized 0..1 (y increases downward in image space).
   */
  private accumulateEmotionSignals(landmarks: NormalizedLandmark[]): void {
    try {
      // --- Mouth curve ---
      // Positive = corners higher than center lip → smile
      // Negative = corners lower → frown / tense
      const leftCorner = landmarks[61];
      const rightCorner = landmarks[291];
      const upperLipCenter = landmarks[13];
      const cornerAvgY = (leftCorner.y + rightCorner.y) / 2;
      // In normalized coords y increases downward, so corner below center = negative curve
      const mouthCurve = upperLipCenter.y - cornerAvgY; // positive = smile

      // --- Brow raise ---
      // Compare inner brow Y to mid-forehead Y; if brow is close to forehead = raised
      const leftInnerBrow = landmarks[55];
      const rightInnerBrow = landmarks[285];
      const leftForehead = landmarks[103];
      const rightForehead = landmarks[332];
      const browY = (leftInnerBrow.y + rightInnerBrow.y) / 2;
      const foreheadY = (leftForehead.y + rightForehead.y) / 2;
      // browY < foreheadY (brow closer to top of frame) = brow raised
      // browY - foreheadY: small positive = raised, larger positive = neutral/furrowed
      const browRaise = foreheadY - browY; // positive = raised

      // --- Jaw openness ---
      // Distance between chin (152) and nose tip (1) relative to face height
      const chinY = landmarks[152].y;
      const noseY = landmarks[1].y;
      const jawOpen = chinY - noseY; // larger = more open / engaged

      this.emotionAccumulator.mouthCurveSum += mouthCurve;
      this.emotionAccumulator.browRaiseSum += browRaise;
      this.emotionAccumulator.jawOpenSum += jawOpen;
      this.emotionAccumulator.frameCount++;
    } catch {
      // Landmark index out of range — skip this frame silently
    }
  }

  /**
   * Derive dominant emotion and confidence from accumulated geometry signals.
   *
   * Strategy: score each emotion archetype against the three signals,
   * pick the highest scorer, confidence = how much it leads the second place.
   *
   * Thresholds calibrated against typical webcam distances:
   *   mouthCurve: >0.01 = noticeable smile, <-0.005 = frown
   *   browRaise:  >0.04 = raised, <0.02 = neutral/furrowed
   *   jawOpen:    >0.28 = open/engaged, <0.22 = closed
   */
  private deriveEmotion(): { dominantEmotion: string; emotionConfidence: number } {
    const { mouthCurveSum, browRaiseSum, jawOpenSum, frameCount } = this.emotionAccumulator;

    if (frameCount === 0) {
      return { dominantEmotion: 'neutral', emotionConfidence: 50 };
    }

    const avgMouth = mouthCurveSum / frameCount;
    const avgBrow = browRaiseSum / frameCount;
    const avgJaw = jawOpenSum / frameCount;

    // Score each emotion (0..1 scale per signal, then weight)
    const scores: Record<string, number> = {
      confident: 0,
      happy: 0,
      neutral: 0,
      nervous: 0,
      tense: 0,
    };

    // confident: slight smile + raised brow + open jaw
    scores.confident =
      this.clamp01((avgMouth - 0.005) / 0.015) * 0.4 +
      this.clamp01((avgBrow - 0.03) / 0.02) * 0.3 +
      this.clamp01((avgJaw - 0.22) / 0.08) * 0.3;

    // happy: clear smile, any brow position
    scores.happy =
      this.clamp01((avgMouth - 0.01) / 0.02) * 0.7 +
      this.clamp01((avgJaw - 0.20) / 0.10) * 0.3;

    // neutral: flat mouth, mid brow, mid jaw
    scores.neutral =
      this.clamp01(1 - Math.abs(avgMouth) / 0.015) * 0.5 +
      this.clamp01(1 - Math.abs(avgBrow - 0.035) / 0.02) * 0.3 +
      this.clamp01(1 - Math.abs(avgJaw - 0.25) / 0.05) * 0.2;

    // nervous: raised brow + tight mouth (low curve) + slightly open jaw
    scores.nervous =
      this.clamp01((avgBrow - 0.04) / 0.02) * 0.5 +
      this.clamp01((0.005 - avgMouth) / 0.01) * 0.3 +
      this.clamp01((avgJaw - 0.22) / 0.06) * 0.2;

    // tense: furrowed brow + flat/downward mouth
    scores.tense =
      this.clamp01((0.025 - avgBrow) / 0.02) * 0.5 +
      this.clamp01((-avgMouth) / 0.01) * 0.5;

    // Pick winner
    let dominant = 'neutral';
    let topScore = -1;
    let secondScore = -1;
    for (const [emotion, score] of Object.entries(scores)) {
      if (score > topScore) {
        secondScore = topScore;
        topScore = score;
        dominant = emotion;
      } else if (score > secondScore) {
        secondScore = score;
      }
    }

    // Confidence: how much the winner leads, mapped to 40-95 range
    const lead = topScore - Math.max(secondScore, 0);
    const confidence = Math.round(40 + this.clamp01(lead / 0.3) * 55);

    return { dominantEmotion: dominant, emotionConfidence: confidence };
  }

  private clamp01(v: number): number {
    return Math.max(0, Math.min(1, v));
  }

  /**
   * Stop tracking and return metrics (including emotion)
   */
  stopTracking(): EyeTrackingMetrics {
    this.isTracking = false;

    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }

    return this.getMetrics();
  }

  /**
   * Get current tracking metrics without stopping
   */
  getMetrics(): EyeTrackingMetrics {
    // Eye contact — use totalProcessedFrames so frames where face isn't
    // visible count against the score (not inflated by detection-only frames)
    const eyeContactPercentage = this.totalProcessedFrames > 0
      ? (this.lookingAtCameraFrames / this.totalProcessedFrames) * 100
      : 0;

    const averageGazeDeviation = this.calculateAverageDeviation();
    const gazeStability = Math.max(0, 100 - (averageGazeDeviation * 100));

    const { dominantEmotion, emotionConfidence } = this.deriveEmotion();

    return {
      eyeContactPercentage: Math.round(eyeContactPercentage),
      gazeStability: Math.round(gazeStability),
      totalFrames: this.totalFrames,
      lookingAtCameraFrames: this.lookingAtCameraFrames,
      averageGazeDeviation,
      dominantEmotion,
      emotionConfidence,
    };
  }

  /**
   * Calculate average deviation from center gaze
   */
  private calculateAverageDeviation(): number {
    if (this.gazeHistory.length === 0) {
      return 0;
    }

    const totalDeviation = this.gazeHistory.reduce((sum, gaze) => {
      return sum + Math.sqrt(gaze.x * gaze.x + gaze.y * gaze.y);
    }, 0);

    return totalDeviation / this.gazeHistory.length;
  }

  /**
   * Reset metrics for a new recording
   */
  private resetMetrics(): void {
    this.gazeHistory = [];
    this.totalFrames = 0;
    this.totalProcessedFrames = 0;
    this.lookingAtCameraFrames = 0;
    this.frameSkipCounter = 0;
    this.emotionAccumulator = {
      mouthCurveSum: 0,
      browRaiseSum: 0,
      jawOpenSum: 0,
      frameCount: 0,
    };
  }

  /**
   * Get current gaze direction (for real-time feedback)
   */
  getCurrentGaze(): GazePoint | null {
    if (this.gazeHistory.length === 0) {
      return null;
    }
    return this.gazeHistory[this.gazeHistory.length - 1];
  }

  /**
   * Check if currently looking at camera
   */
  isLookingAtCamera(): boolean {
    const currentGaze = this.getCurrentGaze();
    if (!currentGaze) return false;
    const dist = Math.sqrt(currentGaze.x * currentGaze.x + currentGaze.y * currentGaze.y);
    return dist <= this.GAZE_THRESHOLD;
  }

  /**
   * Cleanup resources
   */
  cleanup(): void {
    this.isTracking = false;

    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }

    if (this.faceMesh) {
      this.faceMesh.close();
      this.faceMesh = null;
    }
    this.resetMetrics();
  }
}

// Export the class
export { FaceTrackerService as FaceTracker };

// Singleton instance
const faceTracker = FaceTrackerService.getInstance();

export default faceTracker;

// Export helper functions (unchanged API)
export async function initializeFaceTracker(videoElement: HTMLVideoElement): Promise<void> {
  return faceTracker.initialize(videoElement);
}

export async function startTracking(): Promise<void> {
  return faceTracker.startTracking();
}

export function stopTracking(): EyeTrackingMetrics {
  return faceTracker.stopTracking();
}

export function getCurrentGaze(): GazePoint | null {
  return faceTracker.getCurrentGaze();
}

export function isLookingAtCamera(): boolean {
  return faceTracker.isLookingAtCamera();
}

export function cleanupFaceTracker(): void {
  return faceTracker.cleanup();
}
