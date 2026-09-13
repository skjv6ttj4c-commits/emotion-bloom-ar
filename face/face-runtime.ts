import type { FaceLandmarker } from '@mediapipe/tasks-vision';

const PUBLIC_BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? '';
const WASM_PATH = `${PUBLIC_BASE_PATH}/mediapipe/wasm`;
const MODEL_PATH = `${PUBLIC_BASE_PATH}/mediapipe/models/face_landmarker.task`;
const MODEL_CACHE = 'pixel-live-face-model-v1';

export type FaceLoadStage =
  | 'idle'
  | 'downloading'
  | 'initializing'
  | 'ready'
  | 'error';

export type FaceLoadSnapshot = {
  progress: number;
  stage: FaceLoadStage;
  cacheHit: boolean;
};

export type PreparedFaceRuntime = {
  instance: FaceLandmarker;
  runtime: typeof FaceLandmarker;
};

let preparedRuntime: PreparedFaceRuntime | null = null;
let runtimePromise: Promise<PreparedFaceRuntime> | null = null;
let snapshot: FaceLoadSnapshot = {
  progress: 0,
  stage: 'idle',
  cacheHit: false,
};
const listeners = new Set<(next: FaceLoadSnapshot) => void>();

function publish(next: Partial<FaceLoadSnapshot>) {
  snapshot = {
    ...snapshot,
    ...next,
    progress: Math.max(snapshot.progress, next.progress ?? 0),
  };
  listeners.forEach((listener) => listener(snapshot));
}

async function readModelBuffer() {
  let cache: Cache | null = null;

  if ('caches' in window) {
    try {
      cache = await caches.open(MODEL_CACHE);
      const cached = await cache.match(MODEL_PATH);
      if (cached) {
        publish({ progress: 0.62, stage: 'downloading', cacheHit: true });
        return cached.arrayBuffer();
      }
    } catch {
      cache = null;
    }
  }

  const response = await fetch(MODEL_PATH, { cache: 'force-cache' });
  if (!response.ok) {
    throw new Error(`Face model request failed (${response.status}).`);
  }

  const cacheCopy = response.clone();
  const buffer = await response.arrayBuffer();
  publish({ progress: 0.62, stage: 'downloading', cacheHit: false });

  if (cache) {
    void cache.put(MODEL_PATH, cacheCopy).catch(() => undefined);
  }

  return buffer;
}

export function getFaceLoadSnapshot() {
  return snapshot;
}

export function subscribeToFaceLoad(
  listener: (next: FaceLoadSnapshot) => void,
) {
  listeners.add(listener);
  listener(snapshot);
  return () => listeners.delete(listener);
}

export function preloadFaceRuntime(): Promise<PreparedFaceRuntime> {
  if (preparedRuntime) return Promise.resolve(preparedRuntime);
  if (runtimePromise) return runtimePromise;

  snapshot = { progress: 0.04, stage: 'downloading', cacheHit: false };
  publish(snapshot);

  runtimePromise = (async () => {
    // Start the model transfer immediately. It runs in parallel with loading and
    // compiling the MediaPipe WASM runtime instead of waiting for it to finish.
    const modelBufferPromise = readModelBuffer();
    const vision = await import('@mediapipe/tasks-vision');
    publish({ progress: 0.18, stage: 'downloading' });

    const [fileset, modelBuffer] = await Promise.all([
      vision.FilesetResolver.forVisionTasks(WASM_PATH),
      modelBufferPromise,
    ]);
    publish({ progress: 0.78, stage: 'initializing' });

    const instance = await vision.FaceLandmarker.createFromOptions(fileset, {
      baseOptions: {
        modelAssetBuffer: new Uint8Array(modelBuffer),
        delegate: 'CPU',
      },
      runningMode: 'VIDEO',
      numFaces: 1,
      outputFaceBlendshapes: true,
      outputFacialTransformationMatrixes: false,
      minFaceDetectionConfidence: 0.5,
      minFacePresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });

    preparedRuntime = { instance, runtime: vision.FaceLandmarker };
    publish({ progress: 1, stage: 'ready' });
    return preparedRuntime;
  })().catch((error) => {
    runtimePromise = null;
    snapshot = { progress: 0, stage: 'error', cacheHit: false };
    listeners.forEach((listener) => listener(snapshot));
    throw error;
  });

  return runtimePromise;
}
