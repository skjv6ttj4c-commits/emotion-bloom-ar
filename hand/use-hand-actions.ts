'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type RefObject,
} from 'react';
import type { HandLandmarker } from '@mediapipe/tasks-vision';
import type { FaceMetrics } from '@/face/use-face-landmarker';
import {
  analyzeHandActions,
  EMPTY_HAND_ACTION_SAMPLE,
  type HandActionSample,
} from './action-gesture';

const WASM_PATH = '/mediapipe/wasm';
const MODEL_PATH = '/mediapipe/models/hand_landmarker.task';
const INFERENCE_INTERVAL_MS = 1000 / 10;

type ActionKind = 'heart' | 'surprise';

export type HandActionTrigger = {
  id: number;
  kind: ActionKind;
  x: number;
  y: number;
  score: number;
  triggeredAt: number;
};

export type HandActionMetrics = HandActionSample & {
  hands: number;
  heartProgress: number;
  surpriseProgress: number;
  inferenceMs: number | null;
  inferenceFps: number;
  heartActive: boolean;
  surpriseActive: boolean;
};

const EMPTY_METRICS: HandActionMetrics = {
  ...EMPTY_HAND_ACTION_SAMPLE,
  hands: 0,
  heartProgress: 0,
  surpriseProgress: 0,
  inferenceMs: null,
  inferenceFps: 0,
  heartActive: false,
  surpriseActive: false,
};

const ENTER_MS: Record<ActionKind, number> = {
  heart: 300,
  surprise: 220,
};

const RELEASE_MS: Record<ActionKind, number> = {
  heart: 520,
  surprise: 380,
};

const COOLDOWN_MS: Record<ActionKind, number> = {
  heart: 5400,
  surprise: 1650,
};

export function useHandActions(
  videoRef: RefObject<HTMLVideoElement | null>,
  enabled: boolean,
  faceMetrics: FaceMetrics,
) {
  const faceRef = useRef(faceMetrics);
  const [status, setStatus] = useState<
    'idle' | 'loading' | 'running' | 'error'
  >('idle');
  const [metrics, setMetrics] = useState<HandActionMetrics>(EMPTY_METRICS);
  const [trigger, setTrigger] = useState<HandActionTrigger | null>(null);
  const counterRef = useRef(0);

  useEffect(() => {
    faceRef.current = faceMetrics;
  }, [faceMetrics]);

  const triggerTest = useCallback((kind: ActionKind) => {
    counterRef.current += 1;
    setTrigger({
      id: counterRef.current,
      kind,
      x: window.innerWidth * 0.5,
      y: window.innerHeight * (kind === 'heart' ? 0.72 : 0.52),
      score: 1,
      triggeredAt: performance.now(),
    });
  }, []);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    let cancelled = false;
    let animationFrame = 0;
    let landmarker: HandLandmarker | null = null;
    let lastInferenceAt = 0;
    let lastVideoTime = -1;
    const candidateSince: Record<ActionKind, number> = {
      heart: 0,
      surprise: 0,
    };
    const releaseSince: Record<ActionKind, number> = {
      heart: 0,
      surprise: 0,
    };
    const latched: Record<ActionKind, boolean> = {
      heart: false,
      surprise: false,
    };
    const lastTriggeredAt: Record<ActionKind, number> = {
      heart: -COOLDOWN_MS.heart,
      surprise: -COOLDOWN_MS.surprise,
    };
    const smoothed = {
      heartX: 0,
      heartY: 0,
      surpriseX: 0,
      surpriseY: 0,
    };

    function updateAction(
      kind: ActionKind,
      detected: boolean,
      score: number,
      x: number,
      y: number,
      now: number,
    ) {
      if (detected) {
        releaseSince[kind] = 0;
        candidateSince[kind] ||= now;
        const xKey = kind === 'heart' ? 'heartX' : 'surpriseX';
        const yKey = kind === 'heart' ? 'heartY' : 'surpriseY';
        const alpha = smoothed[xKey] === 0 ? 1 : 0.34;
        smoothed[xKey] += (x - smoothed[xKey]) * alpha;
        smoothed[yKey] += (y - smoothed[yKey]) * alpha;
        if (
          !latched[kind] &&
          now - candidateSince[kind] >= ENTER_MS[kind] &&
          now - lastTriggeredAt[kind] >= COOLDOWN_MS[kind]
        ) {
          latched[kind] = true;
          lastTriggeredAt[kind] = now;
          counterRef.current += 1;
          setTrigger({
            id: counterRef.current,
            kind,
            x: smoothed[xKey],
            y: smoothed[yKey],
            score,
            triggeredAt: now,
          });
        }
      } else {
        candidateSince[kind] = 0;
        if (latched[kind]) {
          releaseSince[kind] ||= now;
          if (now - releaseSince[kind] >= RELEASE_MS[kind]) {
            latched[kind] = false;
            releaseSince[kind] = 0;
          }
        }
      }
    }

    async function initialize() {
      setStatus('loading');
      try {
        const { FilesetResolver, HandLandmarker: HandLandmarkerRuntime } =
          await import('@mediapipe/tasks-vision');
        const fileset = await FilesetResolver.forVisionTasks(WASM_PATH);
        const instance = await HandLandmarkerRuntime.createFromOptions(
          fileset,
          {
            baseOptions: { modelAssetPath: MODEL_PATH, delegate: 'CPU' },
            runningMode: 'VIDEO',
            numHands: 2,
            minHandDetectionConfidence: 0.55,
            minHandPresenceConfidence: 0.52,
            minTrackingConfidence: 0.5,
          },
        );
        if (cancelled) {
          instance.close();
          return;
        }
        landmarker = instance;
        animationFrame = requestAnimationFrame(runInference);
      } catch {
        if (!cancelled) setStatus('error');
      }
    }

    function runInference(now: number) {
      if (cancelled) return;
      const video = videoRef.current;
      if (
        video &&
        landmarker &&
        !document.hidden &&
        video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
        video.currentTime !== lastVideoTime &&
        now - lastInferenceAt >= INFERENCE_INTERVAL_MS
      ) {
        const startedAt = performance.now();
        try {
          const result = landmarker.detectForVideo(video, now);
          const completedAt = performance.now();
          const elapsed = lastInferenceAt ? now - lastInferenceAt : 0;
          lastInferenceAt = now;
          lastVideoTime = video.currentTime;
          const sample = analyzeHandActions(
            result.landmarks,
            { width: video.videoWidth, height: video.videoHeight },
            { width: video.clientWidth, height: video.clientHeight },
            faceRef.current,
          );
          updateAction(
            'surprise',
            sample.surpriseDetected,
            sample.surpriseScore,
            sample.surpriseX,
            sample.surpriseY,
            now,
          );
          updateAction(
            'heart',
            sample.heartDetected && !sample.surpriseDetected,
            sample.heartScore,
            sample.heartX,
            sample.heartY,
            now,
          );
          setMetrics({
            ...sample,
            heartX: sample.heartDetected ? smoothed.heartX : sample.heartX,
            heartY: sample.heartDetected ? smoothed.heartY : sample.heartY,
            surpriseX: sample.surpriseDetected
              ? smoothed.surpriseX
              : sample.surpriseX,
            surpriseY: sample.surpriseDetected
              ? smoothed.surpriseY
              : sample.surpriseY,
            hands: result.landmarks.length,
            heartProgress: sample.heartDetected
              ? Math.min(1, (now - candidateSince.heart) / ENTER_MS.heart)
              : 0,
            surpriseProgress: sample.surpriseDetected
              ? Math.min(1, (now - candidateSince.surprise) / ENTER_MS.surprise)
              : 0,
            inferenceMs: completedAt - startedAt,
            inferenceFps: elapsed > 0 ? 1000 / elapsed : 0,
            heartActive: latched.heart,
            surpriseActive: latched.surprise,
          });
          setStatus('running');
        } catch {
          setStatus('error');
          return;
        }
      }
      animationFrame = requestAnimationFrame(runInference);
    }

    void initialize();
    return () => {
      cancelled = true;
      cancelAnimationFrame(animationFrame);
      landmarker?.close();
    };
  }, [enabled, videoRef]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.repeat || event.target instanceof HTMLInputElement) return;
      if (event.key.toLowerCase() === 'h') triggerTest('heart');
      if (event.key.toLowerCase() === 'o') triggerTest('surprise');
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [triggerTest]);

  return {
    status: enabled ? status : ('idle' as const),
    metrics: enabled ? metrics : EMPTY_METRICS,
    trigger,
    triggerTest,
  };
}
