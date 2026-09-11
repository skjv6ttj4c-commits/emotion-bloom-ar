import type { NormalizedLandmark } from '@mediapipe/tasks-vision';
import { projectLandmarkToCover } from '@/face/head-collider';
import type { FaceMetrics } from '@/face/use-face-landmarker';

type Size = { width: number; height: number };

export type HandActionSample = {
  heartDetected: boolean;
  heartScore: number;
  heartX: number;
  heartY: number;
  surpriseDetected: boolean;
  surpriseScore: number;
  surpriseX: number;
  surpriseY: number;
};

export const EMPTY_HAND_ACTION_SAMPLE: HandActionSample = {
  heartDetected: false,
  heartScore: 0,
  heartX: 0,
  heartY: 0,
  surpriseDetected: false,
  surpriseScore: 0,
  surpriseX: 0,
  surpriseY: 0,
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

function palmCenter(hand: NormalizedLandmark[]) {
  const indices = [0, 5, 9, 13, 17];
  const points = indices.map((index) => hand[index]).filter(Boolean);
  if (points.length !== indices.length) return null;
  return {
    x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
    y: points.reduce((sum, point) => sum + point.y, 0) / points.length,
    z: 0,
    visibility: 1,
  };
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

function analyzeSurprise(
  hands: NormalizedLandmark[][],
  videoSize: Size,
  viewportSize: Size,
  face: FaceMetrics,
) {
  const mouth = face.mouthRegion;
  if (!mouth.valid || hands.length === 0) return EMPTY_HAND_ACTION_SAMPLE;
  let bestProximity = 0;
  let bestX = mouth.centerX;
  let bestY = mouth.centerY;
  for (const hand of hands) {
    const center = palmCenter(hand);
    if (!center) continue;
    const projected = projectLandmarkToCover(center, videoSize, viewportSize);
    const dx = (projected.x - mouth.centerX) / Math.max(1, mouth.radiusX);
    const dy = (projected.y - mouth.centerY) / Math.max(1, mouth.radiusY);
    const normalizedDistance = Math.hypot(dx, dy);
    const proximity = clamp(1 - normalizedDistance / 2.15);
    if (proximity > bestProximity) {
      bestProximity = proximity;
      bestX = projected.x;
      bestY = projected.y;
    }
  }
  const expressions = face.expressions;
  const eyeWide = (expressions.eyeWideLeft + expressions.eyeWideRight) * 0.5;
  const faceSurprise = clamp(
    expressions.jawOpen * 0.5 + expressions.browInnerUp * 0.3 + eyeWide * 0.2,
  );
  const score = bestProximity * 0.64 + faceSurprise * 0.36;
  const expressive =
    expressions.jawOpen >= 0.2 ||
    expressions.browInnerUp >= 0.2 ||
    eyeWide >= 0.18;
  return {
    ...EMPTY_HAND_ACTION_SAMPLE,
    surpriseDetected: bestProximity >= 0.52 && expressive && score >= 0.5,
    surpriseScore: score,
    surpriseX: bestX,
    surpriseY: bestY,
  };
}

export function analyzeHandActions(
  hands: NormalizedLandmark[][],
  videoSize: Size,
  viewportSize: Size,
  face: FaceMetrics,
): HandActionSample {
  if (
    videoSize.width <= 0 ||
    videoSize.height <= 0 ||
    viewportSize.width <= 0 ||
    viewportSize.height <= 0
  ) {
    return EMPTY_HAND_ACTION_SAMPLE;
  }
  const heart = analyzeHeart(hands, videoSize, viewportSize);
  const surprise = analyzeSurprise(hands, videoSize, viewportSize, face);
  return {
    heartDetected: heart.heartDetected,
    heartScore: heart.heartScore,
    heartX: heart.heartX,
    heartY: heart.heartY,
    surpriseDetected: surprise.surpriseDetected,
    surpriseScore: surprise.surpriseScore,
    surpriseX: surprise.surpriseX,
    surpriseY: surprise.surpriseY,
  };
}
