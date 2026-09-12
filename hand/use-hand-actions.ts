'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type RefObject,
} from 'react';
import type { HandLandmarker } from '@mediapipe/tasks-vision';
import {
  analyzeHandActions,
  EMPTY_HAND_ACTION_SAMPLE,
  type HandActionSample,
} from './action-gesture';

const PUBLIC_BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? '';
const WASM_PATH = `${PUBLIC_BASE_PATH}/mediapipe/wasm`;
const MODEL_PATH = `${PUBLIC_BASE_PATH}/mediapipe/models/hand_landmarker.task`;
const INFERENCE_INTERVAL_MS = 1000 / 10;

type ActionKind = 'heart';

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
  inferenceMs: number | null;
  inferenceFps: number;
  heartActive: boolean;
};

const EMPTY_METRICS: HandActionMetrics = {
  ...EMPTY_HAND_ACTION_SAMPLE,
  hands: 0,
  heartProgress: 0,
  inferenceMs: null,
  inferenceFps: 0,
  heartActive: false,
};

const ENTER_MS: Record<ActionKind, number> = {
  heart: 300,
};

const RELEASE_MS: Record<ActionKind, number> = {
  heart: 520,
};

const COOLDOWN_MS: Record<ActionKind, number> = {
  heart: 5400,
};

export function useHandActions(
  videoRef: RefObject<HTMLVideoElement | null>,
  enabled: boolean,
) {
  const [status, setStatus] = useState<
    'idle' | 'loading' | 'running' | 'error'
  >('idle');
  const [metrics, setMetrics] = useState<HandActionMetrics>(EMPTY_METRICS);
  const [trigger, setTrigger] = useState<HandActionTrigger | null>(null);
  const counterRef = useRef(0);

  const triggerTest = useCallback((kind: ActionKind) => {
    counterRef.current += 1;
    setTrigger({
      id: counterRef.current,
      kind,
      x: window.innerWidth * 0.5,
      y: window.innerHeight * 0.72,
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
    };
    const releaseSince: Record<ActionKind, number> = {
      heart: 0,
    };
    const latched: Record<ActionKind, boolean> = {
      heart: false,
    };
    const lastTriggeredAt: Record<ActionKind, number> = {
      heart: -COOLDOWN_MS.heart,
    };
    const smoothed = {
      heartX: 0,
      heartY: 0,
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
        const xKey = 'heartX';
        const yKey = 'heartY';
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
          );
          updateAction(
            'heart',
            sample.heartDetected,
            sample.heartScore,
            sample.heartX,
            sample.heartY,
            now,
          );
          setMetrics({
            ...sample,
            heartX: sample.heartDetected ? smoothed.heartX : sample.heartX,
            heartY: sample.heartDetected ? smoothed.heartY : sample.heartY,
            hands: result.landmarks.length,
            heartProgress: sample.heartDetected
              ? Math.min(1, (now - candidateSince.heart) / ENTER_MS.heart)
              : 0,
            inferenceMs: completedAt - startedAt,
            inferenceFps: elapsed > 0 ? 1000 / elapsed : 0,
            heartActive: latched.heart,
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
