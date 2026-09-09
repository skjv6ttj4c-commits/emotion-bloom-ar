import type { NormalizedLandmark } from '@mediapipe/tasks-vision';

export type ExpressionScores = {
  smileLeft: number;
  smileRight: number;
  jawOpen: number;
  cheekSquintLeft: number;
  cheekSquintRight: number;
  mouthDimpleLeft: number;
  mouthDimpleRight: number;
};

export type ExpressionSettings = {
  confidenceThreshold: number;
  smoothingTimeMs: number;
  smileRange: number;
  jawRange: number;
};

export type CalibrationStatus =
  | 'waiting'
  | 'neutral'
  | 'smile-prompt'
  | 'smile-capturing'
  | 'jaw-prompt'
  | 'jaw-capturing'
  | 'ready';

export type ExpressionSignal = {
  accepted: boolean;
  quality: number;
  raw: { smile: number; jawOpen: number };
  smoothed: { smile: number; jawOpen: number };
  normalized: { smile: number; jawOpen: number };
  calibration: {
    status: CalibrationStatus;
    progress: number;
    sampleCount: number;
    neutralSampleAccepted: boolean;
    baseline: { smile: number; jawOpen: number };
    personalPeak: { smile: number; jawOpen: number };
    effectiveRange: { smile: number; jawOpen: number };
  };
};

export const DEFAULT_EXPRESSION_SETTINGS: ExpressionSettings = {
  confidenceThreshold: 0.58,
  smoothingTimeMs: 110,
  smileRange: 0.36,
  jawRange: 0.42,
};

const NEUTRAL_DURATION_MS = 1800;
const EXPRESSION_CAPTURE_MS = 850;
const MIN_NEUTRAL_SAMPLES = 18;
const SMILE_DEAD_ZONE = 0.012;
const JAW_DEAD_ZONE = 0.012;
const MIN_SMILE_RANGE = 0.055;
const MIN_JAW_RANGE = 0.14;

const clamp = (value: number, minimum = 0, maximum = 1) =>
  Math.min(maximum, Math.max(minimum, value));

function lowerQuartile(values: number[]) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor((sorted.length - 1) * 0.25)];
}

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
  private calibrationElapsedMs = 0;
  private captureElapsedMs = 0;
  private calibrationSamples = 0;
  private calibrationSmileSamples: number[] = [];
  private calibrationJawSamples: number[] = [];
  private baselineSmile = 0;
  private baselineJaw = 0;
  private peakSmile = 0;
  private peakJaw = 0;
  private neutralSampleAccepted = false;
  private calibrationStatus: CalibrationStatus = 'waiting';

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
    this.calibrationElapsedMs = 0;
    this.captureElapsedMs = 0;
    this.calibrationSamples = 0;
    this.calibrationSmileSamples = [];
    this.calibrationJawSamples = [];
    this.baselineSmile = 0;
    this.baselineJaw = 0;
    this.peakSmile = 0;
    this.peakJaw = 0;
    this.neutralSampleAccepted = false;
    this.calibrationStatus = 'waiting';
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
    this.updateCalibration(rawSmile, rawJaw, deltaMs);
    this.updatePersonalPeaks();
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

  private updateCalibration(rawSmile: number, rawJaw: number, deltaMs: number) {
    if (this.calibrationStatus === 'waiting')
      this.calibrationStatus = 'neutral';

    if (this.calibrationStatus === 'neutral') {
      const hasProvisionalBaseline = this.calibrationSamples >= 5;
      const smileCeiling = hasProvisionalBaseline
        ? this.baselineSmile + 0.15
        : 0.42;
      const jawCeiling = hasProvisionalBaseline
        ? this.baselineJaw + 0.12
        : 0.23;
      this.neutralSampleAccepted =
        rawSmile <= smileCeiling && rawJaw <= jawCeiling;
      if (this.neutralSampleAccepted) {
        this.calibrationElapsedMs += deltaMs;
        this.calibrationSamples += 1;
        this.calibrationSmileSamples.push(rawSmile);
        this.calibrationJawSamples.push(rawJaw);
        this.baselineSmile = lowerQuartile(this.calibrationSmileSamples);
        this.baselineJaw = lowerQuartile(this.calibrationJawSamples);
      }
      if (
        this.calibrationElapsedMs >= NEUTRAL_DURATION_MS &&
        this.calibrationSamples >= MIN_NEUTRAL_SAMPLES
      ) {
        this.peakSmile = this.baselineSmile;
        this.peakJaw = this.baselineJaw;
        this.calibrationStatus = 'smile-prompt';
      }
      return;
    }

    this.neutralSampleAccepted = true;
    if (
      this.calibrationStatus === 'smile-prompt' &&
      this.smoothedSmile >= this.baselineSmile + 0.025 &&
      this.smoothedJaw <= this.baselineJaw + 0.16
    ) {
      this.captureElapsedMs = 0;
      this.calibrationStatus = 'smile-capturing';
    }
    if (this.calibrationStatus === 'smile-capturing') {
      this.captureElapsedMs += deltaMs;
      this.peakSmile = Math.max(this.peakSmile, rawSmile, this.smoothedSmile);
      if (this.captureElapsedMs >= EXPRESSION_CAPTURE_MS) {
        this.captureElapsedMs = 0;
        this.calibrationStatus = 'jaw-prompt';
      }
      return;
    }
    if (
      this.calibrationStatus === 'jaw-prompt' &&
      this.smoothedJaw >= this.baselineJaw + 0.075
    ) {
      this.captureElapsedMs = 0;
      this.calibrationStatus = 'jaw-capturing';
    }
    if (this.calibrationStatus === 'jaw-capturing') {
      this.captureElapsedMs += deltaMs;
      this.peakJaw = Math.max(this.peakJaw, rawJaw, this.smoothedJaw);
      if (this.captureElapsedMs >= EXPRESSION_CAPTURE_MS) {
        this.calibrationStatus = 'ready';
      }
    }
  }

  private updatePersonalPeaks() {
    if (this.calibrationStatus !== 'ready') return;
    if (this.smoothedSmile > this.peakSmile) {
      this.peakSmile += (this.smoothedSmile - this.peakSmile) * 0.18;
    }
    if (this.smoothedJaw > this.peakJaw) {
      this.peakJaw += (this.smoothedJaw - this.peakJaw) * 0.18;
    }
  }

  private getEffectiveRanges() {
    return {
      smile: Math.min(
        this.settings.smileRange,
        Math.max(
          MIN_SMILE_RANGE,
          (this.peakSmile - this.baselineSmile - SMILE_DEAD_ZONE) * 0.9,
        ),
      ),
      jawOpen: Math.min(
        this.settings.jawRange,
        Math.max(
          MIN_JAW_RANGE,
          (this.peakJaw - this.baselineJaw - JAW_DEAD_ZONE) * 0.9,
        ),
      ),
    };
  }

  private getCalibrationProgress() {
    if (this.calibrationStatus === 'ready') return 1;
    if (this.calibrationStatus === 'waiting') return 0;
    if (this.calibrationStatus === 'neutral') {
      return clamp(this.calibrationElapsedMs / NEUTRAL_DURATION_MS) * 0.45;
    }
    if (this.calibrationStatus === 'smile-prompt') return 0.45;
    if (this.calibrationStatus === 'smile-capturing') {
      return 0.45 + clamp(this.captureElapsedMs / EXPRESSION_CAPTURE_MS) * 0.25;
    }
    if (this.calibrationStatus === 'jaw-prompt') return 0.7;
    return 0.7 + clamp(this.captureElapsedMs / EXPRESSION_CAPTURE_MS) * 0.3;
  }

  private snapshot(
    accepted: boolean,
    quality: number,
    rawSmile: number,
    rawJaw: number,
  ): ExpressionSignal {
    const calibrationReady = this.calibrationStatus === 'ready';
    const effectiveRange = this.getEffectiveRanges();
    const normalizedSmile = calibrationReady
      ? clamp(
          (this.smoothedSmile - this.baselineSmile - SMILE_DEAD_ZONE) /
            effectiveRange.smile,
        )
      : 0;
    const normalizedJaw = calibrationReady
      ? clamp(
          (this.smoothedJaw - this.baselineJaw - JAW_DEAD_ZONE) /
            effectiveRange.jawOpen,
        )
      : 0;

    return {
      accepted,
      quality,
      raw: { smile: rawSmile, jawOpen: rawJaw },
      smoothed: { smile: this.smoothedSmile, jawOpen: this.smoothedJaw },
      normalized: { smile: normalizedSmile, jawOpen: normalizedJaw },
      calibration: {
        status: this.calibrationStatus,
        progress: this.getCalibrationProgress(),
        sampleCount: this.calibrationSamples,
        neutralSampleAccepted: this.neutralSampleAccepted,
        baseline: { smile: this.baselineSmile, jawOpen: this.baselineJaw },
        personalPeak: { smile: this.peakSmile, jawOpen: this.peakJaw },
        effectiveRange,
      },
    };
  }
}

export const EMPTY_EXPRESSION_SIGNAL: ExpressionSignal = {
  accepted: false,
  quality: 0,
  raw: { smile: 0, jawOpen: 0 },
  smoothed: { smile: 0, jawOpen: 0 },
  normalized: { smile: 0, jawOpen: 0 },
  calibration: {
    status: 'waiting',
    progress: 0,
    sampleCount: 0,
    neutralSampleAccepted: false,
    baseline: { smile: 0, jawOpen: 0 },
    personalPeak: { smile: 0, jawOpen: 0 },
    effectiveRange: { smile: MIN_SMILE_RANGE, jawOpen: MIN_JAW_RANGE },
  },
};
