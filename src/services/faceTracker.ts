/**
 * Face Tracker Service
 * Uses MediaPipe Face Mesh to track eye contact and gaze direction during recording
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
  averageGazeDeviation: number; // Average deviation from center in pixels
}

export interface GazePoint {
  x: number; // -1 to 1, 0 is center
  y: number; // -1 to 1, 0 is center
  timestamp: number;
}

class FaceTrackerService {
  private static instance: FaceTrackerService | null = null;
  private faceMesh: FaceMesh | null = null;
  private isTracking: boolean = false;
  private gazeHistory: GazePoint[] = [];
  private totalFrames: number = 0;
  private lookingAtCameraFrames: number = 0;
  private readonly GAZE_THRESHOLD = 0.15; // Threshold for "looking at camera" (within 15% of center)
  private videoElement: HTMLVideoElement | null = null;
  private animationFrameId: number | null = null;

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
    console.log('🔧 initialize() called', {
      hasExistingFaceMesh: !!this.faceMesh,
      hasExistingVideoElement: !!this.videoElement,
      sameVideoElement: this.videoElement === videoElement
    });

    if (this.faceMesh && this.videoElement === videoElement) {
      console.log('✓ Already initialized, skipping');
      return; // Already initialized
    }

    this.videoElement = videoElement;
    console.log('✓ Video element set');

    // Check if FaceMesh is available (loaded from CDN)
    if (typeof window === 'undefined' || !(window as any).FaceMesh) {
      console.log('❌ MediaPipe FaceMesh NOT found on window object!');
      throw new Error('MediaPipe FaceMesh not loaded. Please ensure the MediaPipe script is included.');
    }

    console.log('✓ MediaPipe FaceMesh found on window');

    const FaceMeshConstructor = (window as any).FaceMesh;
    this.faceMesh = new FaceMeshConstructor({
      locateFile: (file: string) => {
        return `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`;
      },
    });

    if (!this.faceMesh) {
      throw new Error('Failed to create FaceMesh instance');
    }

    console.log('✓ FaceMesh instance created');

    this.faceMesh.setOptions({
      maxNumFaces: 1,
      refineLandmarks: true, // Important: Enables iris tracking
      minDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });

    console.log('✓ FaceMesh options set');

    this.faceMesh.onResults(this.onResults.bind(this));

    console.log('✅ Face tracker fully initialized!');
  }

  /**
   * Start tracking
   */
  async startTracking(): Promise<void> {
    console.log('🚀 startTracking() called!', {
      hasFaceMesh: !!this.faceMesh,
      hasVideoElement: !!this.videoElement
    });

    if (!this.faceMesh || !this.videoElement) {
      console.log('❌ EARLY RETURN: Face tracker not initialized properly', {
        faceMesh: this.faceMesh ? 'exists' : 'NULL',
        videoElement: this.videoElement ? 'exists' : 'NULL'
      });
      return;
    }

    this.isTracking = true;
    this.resetMetrics();

    console.log('👁️ Face tracker: Starting frame processing loop...');

    // Manually process frames using requestAnimationFrame
    const processFrame = async () => {
      if (!this.isTracking || !this.faceMesh || !this.videoElement) {
        return;
      }

      try {
        await this.faceMesh.send({ image: this.videoElement });
      } catch (err) {
        console.warn('Error processing frame:', err);
      }

      // Continue processing frames
      if (this.isTracking) {
        this.animationFrameId = requestAnimationFrame(processFrame);
      }
    };

    // Start the frame processing loop
    processFrame();
  }

  /**
   * Process MediaPipe results
   */
  private onResults(results: Results): void {
    if (!this.isTracking) {
      return;
    }

    // Log first frame detection
    if (this.totalFrames === 0) {
      if (!results.multiFaceLandmarks || results.multiFaceLandmarks.length === 0) {
        console.warn('👁️ MediaPipe: First frame processed, but NO FACE DETECTED');
        console.warn('  Make sure your face is visible to the camera');
      } else {
        console.log('✅ MediaPipe: Face detected! Tracking started...');
      }
    }

    if (!results.multiFaceLandmarks || results.multiFaceLandmarks.length === 0) {
      return;
    }

    this.totalFrames++;

    // Log progress every 30 frames (roughly every second)
    if (this.totalFrames % 30 === 0) {
      console.log(`👁️ Tracking: ${this.totalFrames} frames, ${this.lookingAtCameraFrames} with eye contact`);
    }

    // Get the first face's landmarks
    const landmarks = results.multiFaceLandmarks[0];

    // Calculate gaze direction from iris positions
    const gaze = this.calculateGazeDirection(landmarks);

    if (gaze) {
      this.gazeHistory.push({
        x: gaze.x,
        y: gaze.y,
        timestamp: Date.now(),
      });

      // Check if looking at camera (within threshold of center)
      const distanceFromCenter = Math.sqrt(gaze.x * gaze.x + gaze.y * gaze.y);
      if (distanceFromCenter <= this.GAZE_THRESHOLD) {
        this.lookingAtCameraFrames++;
      }
    }
  }

  /**
   * Calculate gaze direction from facial landmarks
   * Uses iris landmarks to determine where the person is looking
   */
  private calculateGazeDirection(landmarks: NormalizedLandmark[]): { x: number; y: number } | null {
    // Iris landmark indices (from MediaPipe Face Mesh)
    // Left iris: 468-472
    // Right iris: 473-477
    const LEFT_IRIS_CENTER = 468;
    const RIGHT_IRIS_CENTER = 473;

    // Eye corner indices
    const LEFT_EYE_LEFT_CORNER = 33;
    const LEFT_EYE_RIGHT_CORNER = 133;
    const RIGHT_EYE_LEFT_CORNER = 362;
    const RIGHT_EYE_RIGHT_CORNER = 263;

    try {
      // Get iris centers
      const leftIris = landmarks[LEFT_IRIS_CENTER];
      const rightIris = landmarks[RIGHT_IRIS_CENTER];

      // Get eye corners
      const leftEyeLeft = landmarks[LEFT_EYE_LEFT_CORNER];
      const leftEyeRight = landmarks[LEFT_EYE_RIGHT_CORNER];
      const rightEyeLeft = landmarks[RIGHT_EYE_LEFT_CORNER];
      const rightEyeRight = landmarks[RIGHT_EYE_RIGHT_CORNER];

      // Calculate normalized iris position within each eye
      // For left eye
      const leftEyeWidth = Math.abs(leftEyeRight.x - leftEyeLeft.x);
      const leftEyeCenter = (leftEyeRight.x + leftEyeLeft.x) / 2;
      const leftGazeX = (leftIris.x - leftEyeCenter) / (leftEyeWidth / 2);

      // For right eye
      const rightEyeWidth = Math.abs(rightEyeRight.x - rightEyeLeft.x);
      const rightEyeCenter = (rightEyeRight.x + rightEyeLeft.x) / 2;
      const rightGazeX = (rightIris.x - rightEyeCenter) / (rightEyeWidth / 2);

      // Average both eyes
      const gazeX = (leftGazeX + rightGazeX) / 2;

      // Calculate vertical gaze (simplified - using average iris Y position)
      const averageIrisY = (leftIris.y + rightIris.y) / 2;
      const gazeY = (averageIrisY - 0.5) * 2; // Normalize to -1 to 1

      return {
        x: gazeX,
        y: gazeY,
      };
    } catch (error) {
      console.error('Error calculating gaze direction:', error);
      return null;
    }
  }

  /**
   * Stop tracking and return metrics
   */
  stopTracking(): EyeTrackingMetrics {
    this.isTracking = false;

    // Cancel animation frame if running
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
    // Calculate metrics
    const eyeContactPercentage = this.totalFrames > 0
      ? (this.lookingAtCameraFrames / this.totalFrames) * 100
      : 0;

    // Calculate gaze stability (lower deviation = more stable)
    const averageGazeDeviation = this.calculateAverageDeviation();
    const gazeStability = Math.max(0, 100 - (averageGazeDeviation * 200)); // Scale to 0-100

    return {
      eyeContactPercentage: Math.round(eyeContactPercentage),
      gazeStability: Math.round(gazeStability),
      totalFrames: this.totalFrames,
      lookingAtCameraFrames: this.lookingAtCameraFrames,
      averageGazeDeviation,
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
      const deviation = Math.sqrt(gaze.x * gaze.x + gaze.y * gaze.y);
      return sum + deviation;
    }, 0);

    return totalDeviation / this.gazeHistory.length;
  }

  /**
   * Reset metrics for new recording
   */
  private resetMetrics(): void {
    this.gazeHistory = [];
    this.totalFrames = 0;
    this.lookingAtCameraFrames = 0;
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
    if (!currentGaze) {
      return false;
    }

    const distanceFromCenter = Math.sqrt(
      currentGaze.x * currentGaze.x + currentGaze.y * currentGaze.y
    );
    return distanceFromCenter <= this.GAZE_THRESHOLD;
  }

  /**
   * Cleanup resources
   */
  cleanup(): void {
    this.isTracking = false;

    // Cancel animation frame if running
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

// Singleton instance for backward compatibility
const faceTracker = FaceTrackerService.getInstance();

export default faceTracker;

// Export helper functions
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
