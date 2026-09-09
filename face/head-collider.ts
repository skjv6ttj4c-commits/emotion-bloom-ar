import type { NormalizedLandmark } from '@mediapipe/tasks-vision';

export type HeadCollider = {
  valid: boolean;
  centerX: number;
  centerY: number;
  radiusX: number;
  radiusY: number;
  rotation: number;
  updatedAt: number;
};

type FaceConnection = { start: number; end: number };
type Size = { width: number; height: number };

export const EMPTY_HEAD_COLLIDER: HeadCollider = {
  valid: false,
  centerX: 0,
  centerY: 0,
  radiusX: 0,
  radiusY: 0,
  rotation: 0,
  updatedAt: 0,
};

export function projectLandmarkToCover(
  landmark: NormalizedLandmark,
  video: Size,
  viewport: Size,
) {
  const scale = Math.max(
    viewport.width / video.width,
    viewport.height / video.height,
  );
  const renderedWidth = video.width * scale;
  const renderedHeight = video.height * scale;
  const offsetX = (viewport.width - renderedWidth) / 2;
  const offsetY = (viewport.height - renderedHeight) / 2;

  return {
    // The camera video is mirrored with CSS, so reflect the fitted source coordinate here too.
    x: viewport.width - (offsetX + landmark.x * renderedWidth),
    y: offsetY + landmark.y * renderedHeight,
  };
}

function shortestAngleDelta(from: number, to: number) {
  return Math.atan2(Math.sin(to - from), Math.cos(to - from));
}

function invalidCollider(timestampMs: number): HeadCollider {
  return { ...EMPTY_HEAD_COLLIDER, updatedAt: timestampMs };
}

export function createHeadCollider(
  landmarks: NormalizedLandmark[],
  connections: FaceConnection[],
  video: Size,
  viewport: Size,
  timestampMs: number,
  previous: HeadCollider = EMPTY_HEAD_COLLIDER,
): HeadCollider {
  if (
    landmarks.length < 468 ||
    video.width <= 0 ||
    video.height <= 0 ||
    viewport.width <= 0 ||
    viewport.height <= 0
  ) {
    return invalidCollider(timestampMs);
  }

  const uniqueIndices = new Set<number>();
  for (const connection of connections) {
    uniqueIndices.add(connection.start);
    uniqueIndices.add(connection.end);
  }
  const points = Array.from(uniqueIndices, (index) => {
    const landmark = landmarks[index];
    return landmark ? projectLandmarkToCover(landmark, video, viewport) : null;
  }).filter((point): point is { x: number; y: number } => point !== null);

  const forehead = landmarks[10];
  const chin = landmarks[152];
  if (points.length < 8 || !forehead || !chin)
    return invalidCollider(timestampMs);

  const top = projectLandmarkToCover(forehead, video, viewport);
  const bottom = projectLandmarkToCover(chin, video, viewport);
  const rotation = Math.atan2(bottom.y - top.y, bottom.x - top.x) - Math.PI / 2;
  const originX =
    points.reduce((sum, point) => sum + point.x, 0) / points.length;
  const originY =
    points.reduce((sum, point) => sum + point.y, 0) / points.length;
  const cosine = Math.cos(rotation);
  const sine = Math.sin(rotation);
  let minimumX = Number.POSITIVE_INFINITY;
  let maximumX = Number.NEGATIVE_INFINITY;
  let minimumY = Number.POSITIVE_INFINITY;
  let maximumY = Number.NEGATIVE_INFINITY;

  for (const point of points) {
    const deltaX = point.x - originX;
    const deltaY = point.y - originY;
    const localX = deltaX * cosine + deltaY * sine;
    const localY = -deltaX * sine + deltaY * cosine;
    minimumX = Math.min(minimumX, localX);
    maximumX = Math.max(maximumX, localX);
    minimumY = Math.min(minimumY, localY);
    maximumY = Math.max(maximumY, localY);
  }

  const localCenterX = (minimumX + maximumX) / 2;
  const localCenterY = (minimumY + maximumY) / 2;
  const next: HeadCollider = {
    valid: true,
    centerX: originX + localCenterX * cosine - localCenterY * sine,
    centerY: originY + localCenterX * sine + localCenterY * cosine,
    radiusX: Math.max(24, ((maximumX - minimumX) / 2) * 1.05 + 4),
    radiusY: Math.max(30, ((maximumY - minimumY) / 2) * 1.035 + 4),
    rotation,
    updatedAt: timestampMs,
  };

  if (!previous.valid) return next;

  const elapsedMs = Math.min(
    180,
    Math.max(0, timestampMs - previous.updatedAt),
  );
  const alpha = 1 - Math.exp(-elapsedMs / 95);
  return {
    valid: true,
    centerX: previous.centerX + (next.centerX - previous.centerX) * alpha,
    centerY: previous.centerY + (next.centerY - previous.centerY) * alpha,
    radiusX: previous.radiusX + (next.radiusX - previous.radiusX) * alpha,
    radiusY: previous.radiusY + (next.radiusY - previous.radiusY) * alpha,
    rotation:
      previous.rotation +
      shortestAngleDelta(previous.rotation, next.rotation) * alpha,
    updatedAt: timestampMs,
  };
}
