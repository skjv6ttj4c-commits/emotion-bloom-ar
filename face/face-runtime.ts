import type { FaceLandmarker } from '@mediapipe/tasks-vision';
import {
  FACE_MODEL_FALLBACK_PATH,
  FACE_MODEL_PATH,
  VISION_ASSET_CACHE,
  VISION_CACHE_SCOPE,
  VISION_CACHE_WORKER_PATH,
  VISION_WASM_PATH,
} from './face-assets';

const EXPECTED_MODEL_BYTES = 3_758_596;
const DOWNLOAD_STALL_TIMEOUT_MS = 12_000;
const MAX_DOWNLOAD_ATTEMPTS = 2;

export type FaceLoadStage =
  | 'idle'
  | 'loading-code'
  | 'downloading'
  | 'preparing-engine'
  | 'initializing'
  | 'ready'
  | 'error';

export type FaceLoadSnapshot = {
  progress: number;
  stage: FaceLoadStage;
  cacheHit: boolean;
  loadedBytes: number;
  totalBytes: number;
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
  loadedBytes: 0,
  totalBytes: EXPECTED_MODEL_BYTES,
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

async function readStreamWithProgress(response: Response) {
  const declaredBytes = Number(response.headers.get('content-length'));
  const totalBytes = response.headers.has('content-encoding')
    ? EXPECTED_MODEL_BYTES
    : declaredBytes || EXPECTED_MODEL_BYTES;
  const reader = response.body?.getReader();
  if (!reader) {
    const buffer = await response.arrayBuffer();
    publish({
      progress: 0.68,
      loadedBytes: buffer.byteLength,
      totalBytes: buffer.byteLength,
    });
    return buffer;
  }

  const chunks: Uint8Array[] = [];
  let loadedBytes = 0;

  while (true) {
    let timeoutId = 0;
    const timeout = new Promise<never>((_, reject) => {
      timeoutId = window.setTimeout(
        () => reject(new Error('Face model download stalled.')),
        DOWNLOAD_STALL_TIMEOUT_MS,
      );
    });
    let next: ReadableStreamReadResult<Uint8Array>;
    try {
      next = await Promise.race([reader.read(), timeout]);
    } catch (error) {
      void reader.cancel().catch(() => undefined);
      throw error;
    } finally {
      window.clearTimeout(timeoutId);
    }
    if (next.done) break;

    chunks.push(next.value);
    loadedBytes += next.value.byteLength;
    const ratio = Math.min(loadedBytes / totalBytes, 0.98);
    publish({
      progress: 0.14 + ratio * 0.54,
      stage: 'downloading',
      loadedBytes,
      totalBytes: Math.max(totalBytes, loadedBytes),
    });
  }

  const combined = new Uint8Array(loadedBytes);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  publish({ progress: 0.68, loadedBytes, totalBytes: loadedBytes });
  return combined.buffer;
}

async function fetchWithTimeout(url: string, cacheMode: RequestCache) {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(
    () => controller.abort(),
    DOWNLOAD_STALL_TIMEOUT_MS,
  );
  try {
    return await fetch(url, { cache: cacheMode, signal: controller.signal });
  } finally {
    window.clearTimeout(timeoutId);
  }
}

async function registerPersistentAssetCache() {
  if (!('serviceWorker' in navigator)) return;
  try {
    await navigator.serviceWorker.register(VISION_CACHE_WORKER_PATH, {
      scope: VISION_CACHE_SCOPE,
    });
  } catch {
    // The runtime still works with the browser's normal HTTP cache.
  }
}

async function readModelBuffer() {
  let cache: Cache | null = null;

  if ('caches' in window) {
    try {
      cache = await caches.open(VISION_ASSET_CACHE);
      const cached = await cache.match(FACE_MODEL_PATH);
      if (cached) {
        publish({
          progress: 0.68,
          stage: 'downloading',
          cacheHit: true,
          loadedBytes: EXPECTED_MODEL_BYTES,
          totalBytes: EXPECTED_MODEL_BYTES,
        });
        return cached.arrayBuffer();
      }
    } catch {
      cache = null;
    }
  }

  let lastError: unknown = null;
  for (let attempt = 0; attempt < MAX_DOWNLOAD_ATTEMPTS; attempt += 1) {
    try {
      const modelUrl =
        attempt === 0 ? FACE_MODEL_PATH : FACE_MODEL_FALLBACK_PATH;
      const response = await fetchWithTimeout(
        modelUrl,
        attempt === 0 ? 'force-cache' : 'reload',
      );
      if (!response.ok) {
        throw new Error(`Face model request failed (${response.status}).`);
      }

      const buffer = await readStreamWithProgress(response);
      if (cache) {
        const cachedResponse = new Response(buffer, {
          headers: { 'content-type': 'application/octet-stream' },
        });
        void cache.put(FACE_MODEL_PATH, cachedResponse).catch(() => undefined);
      }
      return buffer;
    } catch (error) {
      lastError = error;
      publish({ progress: 0.12, loadedBytes: 0, cacheHit: false });
    }
  }
  throw lastError ?? new Error('Face model download failed.');
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

  snapshot = {
    progress: 0.03,
    stage: 'loading-code',
    cacheHit: false,
    loadedBytes: 0,
    totalBytes: EXPECTED_MODEL_BYTES,
  };
  publish(snapshot);

  runtimePromise = (async () => {
    void registerPersistentAssetCache();
    // Start the model transfer immediately. It runs in parallel with loading and
    // compiling the MediaPipe WASM runtime instead of waiting for it to finish.
    const modelBufferPromise = readModelBuffer();
    const vision = await import('@mediapipe/tasks-vision');
    publish({ progress: 0.12, stage: 'downloading' });

    const fileset =
      await vision.FilesetResolver.forVisionTasks(VISION_WASM_PATH);
    const modelBuffer = await modelBufferPromise;
    publish({ progress: 0.72, stage: 'preparing-engine' });

    publish({ progress: 0.86, stage: 'initializing' });
    const isIos =
      /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const reducedDevice =
      window.innerWidth <= 720 || (navigator.hardwareConcurrency ?? 8) <= 4;
    const baseOptions = {
      modelAssetBuffer: new Uint8Array(modelBuffer),
      // Avoid iOS WebKit's expensive failed-GPU-then-CPU startup path.
      delegate: isIos || !reducedDevice ? ('CPU' as const) : ('GPU' as const),
    };
    let instance: FaceLandmarker;
    try {
      instance = await vision.FaceLandmarker.createFromOptions(fileset, {
        baseOptions,
        runningMode: 'VIDEO',
        numFaces: 1,
        outputFaceBlendshapes: true,
        outputFacialTransformationMatrixes: false,
        minFaceDetectionConfidence: 0.5,
        minFacePresenceConfidence: 0.5,
        minTrackingConfidence: 0.5,
      });
    } catch (error) {
      if (baseOptions.delegate !== 'GPU') throw error;
      // Some older mobile WebViews expose WebGL but cannot initialize the
      // MediaPipe GPU delegate. Retry once on CPU instead of leaving entry
      // stuck at the initialization stage.
      instance = await vision.FaceLandmarker.createFromOptions(fileset, {
        baseOptions: { ...baseOptions, delegate: 'CPU' },
        runningMode: 'VIDEO',
        numFaces: 1,
        outputFaceBlendshapes: true,
        outputFacialTransformationMatrixes: false,
        minFaceDetectionConfidence: 0.5,
        minFacePresenceConfidence: 0.5,
        minTrackingConfidence: 0.5,
      });
    }
    preparedRuntime = { instance, runtime: vision.FaceLandmarker };
    publish({ progress: 1, stage: 'ready' });
    return preparedRuntime;
  })().catch((error) => {
    runtimePromise = null;
    snapshot = {
      progress: 0,
      stage: 'error',
      cacheHit: false,
      loadedBytes: 0,
      totalBytes: EXPECTED_MODEL_BYTES,
    };
    listeners.forEach((listener) => listener(snapshot));
    throw error;
  });

  return runtimePromise;
}
