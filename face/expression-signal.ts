import type { NormalizedLandmark } from '@mediapipe/tasks-vision';

export type ExpressionScores = {
  smileLeft: number;
  smileRight: number;
  jawOpen: number;
  cheekSquintLeft: number;
  cheekSquintRight: number;
  mouthDimpleLeft: number;
  mouthDimpleRight: number;
  browInnerUp: number;
  eyeWideLeft: number;
  eyeWideRight: number;
};

export type ExpressionSettings = {
  confidenceThreshold: number;
  smoothingTimeMs: number;
  smileRange: number;
  jawRange: number;
};

export type ExpressionSignal = {
  accepted: boolean;
  quality: number;
  raw: { smile: number; jawOpen: number };
  smoothed: { smile: number; jawOpen: number };
  normalized: { smile: number; jawOpen: number };
};

export const DEFAULT_EXPRESSION_SETTINGS: ExpressionSettings = {
  confidenceThreshold: 0.58,
  smoothingTimeMs: 110,
  smileRange: 0.36,
  jawRange: 0.42,
};

const STANDARD_SMILE_FLOOR = 0.06;
const STANDARD_JAW_FLOOR = 0.025;

const clamp = (value: number, minimum = 0, maximum = 1) =>
  Math.min(maximum, Math.max(minimum, value));

function smileEvidence(expressions: ExpressionScores) {
  const mouthCornerLift = (expressions.smileLeft + expressions.smileRight) / 2;
  const cheekLift =
    (expressions.cheekSquintLeft + expressions.cheekSquintRight) / 2;
  const mouthDimple =
    (expressions.mouthDimpleLeft + expressions.mouthDimpleRight) / 2;
  return Math.max(mouthCornerLift, cheekLift * 0.82, mouthDimple * 0.72);
}

function faceGeometryQuality(landmarks: NormalizedLandmark[]) {
  if (landmarks.length < 468) return 0;
  const forehead = landmarks[10];
  const chin = landmarks[152];
  const left = landmarks[234];
  const right = landmarks[454];
  if (!forehead || !chin || !left || !right) return 0;

  let inFrame = 0;
  for (const landmark of landmarks) {
    if (
      landmark.x >= 0.01 &&
      landmark.x <= 0.99 &&
      landmark.y >= 0.01 &&
      landmark.y <= 0.99
    ) {
      inFrame += 1;
    }
  }
  const pointQuality = clamp(landmarks.length / 478);
  const framingQuality = inFrame / landmarks.length;
  const faceWidth = Math.abs(right.x - left.x);
  const faceHeight = Math.abs(chin.y - forehead.y);
  const sizeQuality = clamp((Math.min(faceWidth, faceHeight) - 0.08) / 0.14);
  return clamp(pointQuality * 0.25 + framingQuality * 0.5 + sizeQuality * 0.25);
}

export class ExpressionSignalProcessor {
  private settings: ExpressionSettings;
  private initialized = false;
  private lastAcceptedAt: number | null = null;
  private smoothedSmile = 0;
  private smoothedJaw = 0;

  constructor(settings: ExpressionSettings = DEFAULT_EXPRESSION_SETTINGS) {
    this.settings = settings;
  }

  setSettings(settings: ExpressionSettings) {
    this.settings = settings;
  }

  reset() {
    this.initialized = false;
    this.lastAcceptedAt = null;
    this.smoothedSmile = 0;
    this.smoothedJaw = 0;
    return this.snapshot(false, 0, 0, 0);
  }

  process(
    expressions: ExpressionScores,
    landmarks: NormalizedLandmark[],
    timestampMs: number,
  ) {
    const rawSmile = smileEvidence(expressions);
    const rawJaw = expressions.jawOpen;
    const quality = faceGeometryQuality(landmarks);
    const accepted = quality >= this.settings.confidenceThreshold;
    if (!accepted) return this.snapshot(false, quality, rawSmile, rawJaw);

    const deltaMs =
      this.lastAcceptedAt === null
        ? 0
        : clamp(timestampMs - this.lastAcceptedAt, 0, 120);
    this.lastAcceptedAt = timestampMs;
    this.updateSmoothing(rawSmile, rawJaw, deltaMs);
    return this.snapshot(true, quality, rawSmile, rawJaw);
  }

  private updateSmoothing(rawSmile: number, rawJaw: number, deltaMs: number) {
    if (!this.initialized) {
      this.smoothedSmile = rawSmile;
      this.smoothedJaw = rawJaw;
      this.initialized = true;
      return;
    }
    const smoothingTime = Math.max(16, this.settings.smoothingTimeMs);
    const alpha = 1 - Math.exp(-deltaMs / smoothingTime);
    this.smoothedSmile += (rawSmile - this.smoothedSmile) * alpha;
    this.smoothedJaw += (rawJaw - this.smoothedJaw) * alpha;
  }

  private snapshot(
    accepted: boolean,
    quality: number,
    rawSmile: number,
    rawJaw: number,
  ): ExpressionSignal {
    const normalizedSmile = clamp(
      (this.smoothedSmile - STANDARD_SMILE_FLOOR) /
        Math.max(0.12, this.settings.smileRange),
    );
    const normalizedJaw = clamp(
      (this.smoothedJaw - STANDARD_JAW_FLOOR) /
        Math.max(0.16, this.settings.jawRange),
    );

    return {
      accepted,
      quality,
      raw: { smile: rawSmile, jawOpen: rawJaw },
      smoothed: { smile: this.smoothedSmile, jawOpen: this.smoothedJaw },
      normalized: { smile: normalizedSmile, jawOpen: normalizedJaw },
    };
  }
}

export const EMPTY_EXPRESSION_SIGNAL: ExpressionSignal = {
  accepted: false,
  quality: 0,
  raw: { smile: 0, jawOpen: 0 },
  smoothed: { smile: 0, jawOpen: 0 },
  normalized: { smile: 0, jawOpen: 0 },
};
