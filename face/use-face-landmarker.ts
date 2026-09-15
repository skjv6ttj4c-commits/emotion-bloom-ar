'use client';

import {
  useEffect,
  useRef,
  useState,
  type RefObject,
} from 'react';
import type {
  Category,
  FaceLandmarker,
  FaceLandmarkerResult,
} from '@mediapipe/tasks-vision';
import {
  DEFAULT_EXPRESSION_SETTINGS,
  EMPTY_EXPRESSION_SIGNAL,
  ExpressionSignalProcessor,
  type ExpressionScores,
} from './expression-signal';
import {
  createHeadCollider,
  EMPTY_HEAD_COLLIDER,
  type HeadCollider,
} from './head-collider';
import {
  getFaceLoadSnapshot,
  preloadFaceRuntime,
  subscribeToFaceLoad,
  type FaceLoadStage,
} from './face-runtime';

const DESKTOP_INFERENCE_INTERVAL_MS = 1000 / 15;
const MOBILE_INFERENCE_INTERVAL_MS = 1000 / 12;
const FACE_CHANGE_RESET_MS = 1400;

function describeFaceError(error: unknown) {
  const detail = error instanceof Error ? error.message : String(error);
  if (/dynamically imported module|failed to fetch|load failed/i.test(detail)) {
    return '人脸识别资源未能加载。请确认本地预览正在运行，然后刷新页面。';
  }
  return '人脸模型初始化失败。请刷新页面后重试。';
}

export type FaceStatus = 'idle' | 'loading' | 'ready' | 'running' | 'error';

export type FaceSafeRegion = {
  valid: boolean;
  centerX: number;
  centerY: number;
  radiusX: number;
  radiusY: number;
};

export type FaceMetrics = {
  hasFace: boolean;
  landmarkCount: number;
  inferenceMs: number | null;
  inferenceFps: number;
  expressions: ExpressionScores;
  signal: typeof EMPTY_EXPRESSION_SIGNAL;
  headCollider: HeadCollider;
  mouthRegion: FaceSafeRegion;
};

const emptyMetrics: FaceMetrics = {
  hasFace: false,
  landmarkCount: 0,
  inferenceMs: null,
  inferenceFps: 0,
  expressions: {
    smileLeft: 0,
    smileRight: 0,
    jawOpen: 0,
    cheekSquintLeft: 0,
    cheekSquintRight: 0,
    mouthDimpleLeft: 0,
    mouthDimpleRight: 0,
    browInnerUp: 0,
    eyeWideLeft: 0,
    eyeWideRight: 0,
  },
  signal: EMPTY_EXPRESSION_SIGNAL,
  headCollider: EMPTY_HEAD_COLLIDER,
  mouthRegion: {
    valid: false,
    centerX: 0,
    centerY: 0,
    radiusX: 0,
    radiusY: 0,
  },
};

function scoreOf(categories: Category[], name: string) {
  return (
    categories.find((category) => category.categoryName === name)?.score ?? 0
  );
}

function readMetrics(
  result: FaceLandmarkerResult,
  inferenceMs: number,
  inferenceFps: number,
  processor: ExpressionSignalProcessor,
  timestampMs: number,
  headCollider: HeadCollider,
): FaceMetrics {
  const landmarks = result.faceLandmarks[0] ?? [];
  const categories = result.faceBlendshapes[0]?.categories ?? [];
  const expressions = {
    smileLeft: scoreOf(categories, 'mouthSmileLeft'),
    smileRight: scoreOf(categories, 'mouthSmileRight'),
    jawOpen: scoreOf(categories, 'jawOpen'),
    cheekSquintLeft: scoreOf(categories, 'cheekSquintLeft'),
    cheekSquintRight: scoreOf(categories, 'cheekSquintRight'),
    mouthDimpleLeft: scoreOf(categories, 'mouthDimpleLeft'),
    mouthDimpleRight: scoreOf(categories, 'mouthDimpleRight'),
    browInnerUp: scoreOf(categories, 'browInnerUp'),
    eyeWideLeft: scoreOf(categories, 'eyeWideLeft'),
    eyeWideRight: scoreOf(categories, 'eyeWideRight'),
  };

  const signal = processor.process(expressions, landmarks, timestampMs);
  return {
    hasFace: landmarks.length > 0,
    landmarkCount: landmarks.length,
    inferenceMs,
    inferenceFps,
    expressions,
    signal,
    headCollider: {
      ...headCollider,
      valid: headCollider.valid && signal.accepted,
    },
    mouthRegion: {
      valid: headCollider.valid && signal.accepted,
      centerX: headCollider.centerX,
      centerY: headCollider.centerY + headCollider.radiusY * 0.38,
      radiusX: headCollider.radiusX * 0.62,
      radiusY: headCollider.radiusY * 0.42,
    },
  };
}

export function useFaceLandmarker(
  videoRef: RefObject<HTMLVideoElement | null>,
  cameraActive: boolean,
) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [processor] = useState(
    () => new ExpressionSignalProcessor(DEFAULT_EXPRESSION_SETTINGS),
  );
  const [status, setStatus] = useState<FaceStatus>('idle');
  const [metrics, setMetrics] = useState<FaceMetrics>(emptyMetrics);
  const [error, setError] = useState<string | null>(null);
  const [loadProgress, setLoadProgress] = useState(
    () => getFaceLoadSnapshot().progress,
  );
  const [loadStage, setLoadStage] = useState<FaceLoadStage>(
    () => getFaceLoadSnapshot().stage,
  );
  const [modelCacheHit, setModelCacheHit] = useState(
    () => getFaceLoadSnapshot().cacheHit,
  );

  useEffect(() => {
    let cancelled = false;
    const unsubscribe = subscribeToFaceLoad((next) => {
      if (cancelled) return;
      setLoadProgress(next.progress);
      setLoadStage(next.stage);
      setModelCacheHit(next.cacheHit);
    });

    // Warm up the complete face runtime while the visitor reads the cover.
    // This does not request camera permission or process any user imagery.
    void preloadFaceRuntime()
      .then(() => {
        if (!cancelled) {
          setStatus('ready');
          setError(null);
        }
      })
      .catch((caughtError) => {
        if (!cancelled) {
          setStatus('error');
          setError(describeFaceError(caughtError));
        }
      });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!cameraActive) {
      processor.reset();
      const canvas = canvasRef.current;
      const context = canvas?.getContext('2d');
      if (canvas && context)
        context.clearRect(0, 0, canvas.width, canvas.height);
      return;
    }

    let cancelled = false;
    let animationFrame = 0;
    let faceLandmarker: FaceLandmarker | null = null;
    let faceLandmarkerClass: typeof FaceLandmarker | null = null;
    let lastInferenceAt = 0;
    let lastVideoTime = -1;
    let lastHeadCollider = EMPTY_HEAD_COLLIDER;
    let faceMissingSince = 0;
    const baseInferenceInterval =
      window.innerWidth <= 720
        ? MOBILE_INFERENCE_INTERVAL_MS
        : DESKTOP_INFERENCE_INTERVAL_MS;
    let inferenceInterval = baseInferenceInterval;

    async function initialize() {
      setStatus(getFaceLoadSnapshot().stage === 'ready' ? 'ready' : 'loading');
      setError(null);
      setMetrics(emptyMetrics);

      try {
        const prepared = await preloadFaceRuntime();

        if (cancelled) return;

        faceLandmarker = prepared.instance;
        faceLandmarkerClass = prepared.runtime;
        setStatus('ready');
        animationFrame = requestAnimationFrame(runInference);
      } catch (caughtError) {
        if (cancelled) return;
        setStatus('error');
        setError(describeFaceError(caughtError));
      }
    }

    function runInference(now: number) {
      if (cancelled) return;
      const video = videoRef.current;
      const canvas = canvasRef.current;

      if (
        video &&
        canvas &&
        faceLandmarker &&
        faceLandmarkerClass &&
        !document.hidden &&
        video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
        video.currentTime !== lastVideoTime &&
        now - lastInferenceAt >= inferenceInterval
      ) {
        const startedAt = performance.now();
        try {
          const result = faceLandmarker.detectForVideo(video, now);
          const completedAt = performance.now();
          inferenceInterval = Math.min(
            160,
            Math.max(baseInferenceInterval, (completedAt - startedAt) * 1.25),
          );
          const elapsedSinceLastRun = lastInferenceAt
            ? now - lastInferenceAt
            : 0;
          const inferenceFps =
            elapsedSinceLastRun > 0 ? 1000 / elapsedSinceLastRun : 0;
          lastInferenceAt = now;
          lastVideoTime = video.currentTime;
          if ((result.faceLandmarks[0]?.length ?? 0) === 0) {
            faceMissingSince ||= now;
            if (now - faceMissingSince >= FACE_CHANGE_RESET_MS) {
              processor.reset();
            }
          } else {
            faceMissingSince = 0;
          }
          const headCollider = createHeadCollider(
            result.faceLandmarks[0] ?? [],
            faceLandmarkerClass.FACE_LANDMARKS_FACE_OVAL,
            { width: video.videoWidth, height: video.videoHeight },
            { width: canvas.clientWidth, height: canvas.clientHeight },
            now,
            lastHeadCollider,
          );
          const nextMetrics = readMetrics(
            result,
            completedAt - startedAt,
            inferenceFps,
            processor,
            now,
            headCollider,
          );
          lastHeadCollider = nextMetrics.headCollider;
          setMetrics(nextMetrics);
          setStatus('running');
        } catch (caughtError) {
          setStatus('error');
          setError(describeFaceError(caughtError));
          return;
        }
      }

      animationFrame = requestAnimationFrame(runInference);
    }

    void initialize();

    return () => {
      cancelled = true;
      cancelAnimationFrame(animationFrame);
    };
  }, [cameraActive, processor, videoRef]);

  return {
    canvasRef,
    status: cameraActive ? status : 'idle',
    metrics: cameraActive ? metrics : emptyMetrics,
    error,
    loadProgress,
    loadStage,
    modelCacheHit,
    loadedBytes: getFaceLoadSnapshot().loadedBytes,
    totalBytes: getFaceLoadSnapshot().totalBytes,
  };
}
