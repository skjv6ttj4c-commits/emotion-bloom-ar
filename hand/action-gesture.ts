import type { NormalizedLandmark } from '@mediapipe/tasks-vision';
import { projectLandmarkToCover } from '@/face/head-collider';

type Size = { width: number; height: number };

export type HandActionSample = {
  heartDetected: boolean;
  heartScore: number;
  heartX: number;
  heartY: number;
};

export const EMPTY_HAND_ACTION_SAMPLE: HandActionSample = {
  heartDetected: false,
  heartScore: 0,
  heartX: 0,
  heartY: 0,
};

const clamp = (value: number) => Math.min(1, Math.max(0, value));

function distance(a: NormalizedLandmark, b: NormalizedLandmark) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function midpoint(a: NormalizedLandmark, b: NormalizedLandmark) {
  return {
    x: (a.x + b.x) * 0.5,
    y: (a.y + b.y) * 0.5,
    z: 0,
    visibility: 1,
  };
}

function handScale(hand: NormalizedLandmark[]) {
  const wrist = hand[0];
  const middleMcp = hand[9];
  const indexMcp = hand[5];
  const pinkyMcp = hand[17];
  if (!wrist || !middleMcp || !indexMcp || !pinkyMcp) return 0;
  return Math.max(
    distance(wrist, middleMcp),
    distance(indexMcp, pinkyMcp) * 1.35,
  );
}

function analyzeHeart(
  hands: NormalizedLandmark[][],
  videoSize: Size,
  viewportSize: Size,
) {
  if (hands.length < 2) return EMPTY_HAND_ACTION_SAMPLE;
  const first = hands[0];
  const second = hands[1];
  const firstThumb = first[4];
  const secondThumb = second[4];
  const firstIndex = first[8];
  const secondIndex = second[8];
  const firstPalm = first[9];
  const secondPalm = second[9];
  if (
    !firstThumb ||
    !secondThumb ||
    !firstIndex ||
    !secondIndex ||
    !firstPalm ||
    !secondPalm
  ) {
    return EMPTY_HAND_ACTION_SAMPLE;
  }
  const scale = (handScale(first) + handScale(second)) * 0.5;
  if (scale < 0.025) return EMPTY_HAND_ACTION_SAMPLE;
  const thumbGap = distance(firstThumb, secondThumb) / scale;
  const indexGap = distance(firstIndex, secondIndex) / scale;
  const palmGap = distance(firstPalm, secondPalm) / scale;
  const thumbCenter = midpoint(firstThumb, secondThumb);
  const indexCenter = midpoint(firstIndex, secondIndex);
  const verticalSeparation = (thumbCenter.y - indexCenter.y) / scale;
  const score =
    clamp(1 - thumbGap / 1.05) * 0.34 +
    clamp(1 - indexGap / 1.28) * 0.34 +
    clamp(1 - Math.max(0, palmGap - 1.5) / 2.7) * 0.18 +
    clamp((verticalSeparation + 0.12) / 0.72) * 0.14;
  const center = projectLandmarkToCover(
    midpoint(thumbCenter, indexCenter),
    videoSize,
    viewportSize,
  );
  return {
    ...EMPTY_HAND_ACTION_SAMPLE,
    heartDetected:
      score >= 0.63 &&
      thumbGap <= 0.92 &&
      indexGap <= 1.15 &&
      palmGap <= 4.1 &&
      verticalSeparation >= -0.08,
    heartScore: score,
    heartX: center.x,
    heartY: center.y,
  };
}

export function analyzeHandActions(
  hands: NormalizedLandmark[][],
  videoSize: Size,
  viewportSize: Size,
): HandActionSample {
  if (
    videoSize.width <= 0 ||
    videoSize.height <= 0 ||
    viewportSize.width <= 0 ||
    viewportSize.height <= 0
  ) {
    return EMPTY_HAND_ACTION_SAMPLE;
  }
  return analyzeHeart(hands, videoSize, viewportSize);
}
