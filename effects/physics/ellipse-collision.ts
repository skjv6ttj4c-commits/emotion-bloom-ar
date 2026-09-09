import type { HeadCollider } from '@/face/head-collider';

export type EllipseCollisionResult = {
  x: number;
  y: number;
  velocityX: number;
  velocityY: number;
  normalX: number;
  normalY: number;
  penetration: boolean;
};

const EPSILON = 0.000001;
const RESTITUTION = 0.56;
const TANGENT_FRICTION = 0.1;
const SURFACE_GAP = 2;
const MAX_OUTPUT_SPEED = 920;

/**
 * Resolves a moving point against a rotated ellipse. The quadratic segment test
 * prevents fast sparks from tunnelling through the head between rendered frames.
 */
export function resolveMovingEllipseCollision(
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  velocityX: number,
  velocityY: number,
  deltaSeconds: number,
  collider: HeadCollider,
  colliderVelocityX: number,
  colliderVelocityY: number,
  padding = 5,
): EllipseCollisionResult | null {
  if (!collider.valid) return null;

  const radiusX = Math.max(1, collider.radiusX + padding);
  const radiusY = Math.max(1, collider.radiusY + padding);
  const cosine = Math.cos(collider.rotation);
  const sine = Math.sin(collider.rotation);
  const startDeltaX = startX - collider.centerX;
  const startDeltaY = startY - collider.centerY;
  const endDeltaX = endX - collider.centerX;
  const endDeltaY = endY - collider.centerY;
  const localStartX = startDeltaX * cosine + startDeltaY * sine;
  const localStartY = -startDeltaX * sine + startDeltaY * cosine;
  const localEndX = endDeltaX * cosine + endDeltaY * sine;
  const localEndY = -endDeltaX * sine + endDeltaY * cosine;
  const inverseRadiusXSquared = 1 / (radiusX * radiusX);
  const inverseRadiusYSquared = 1 / (radiusY * radiusY);
  const startDistance =
    localStartX * localStartX * inverseRadiusXSquared +
    localStartY * localStartY * inverseRadiusYSquared;
  const penetration = startDistance <= 1;
  let hitTime = 0;
  let hitLocalX = localStartX;
  let hitLocalY = localStartY;

  if (!penetration) {
    const directionX = localEndX - localStartX;
    const directionY = localEndY - localStartY;
    const a =
      directionX * directionX * inverseRadiusXSquared +
      directionY * directionY * inverseRadiusYSquared;
    if (a <= EPSILON) return null;

    const b =
      2 *
      (localStartX * directionX * inverseRadiusXSquared +
        localStartY * directionY * inverseRadiusYSquared);
    const c = startDistance - 1;
    const discriminant = b * b - 4 * a * c;
    if (discriminant < 0) return null;

    hitTime = (-b - Math.sqrt(discriminant)) / (2 * a);
    if (hitTime < 0 || hitTime > 1) return null;
    hitLocalX = localStartX + directionX * hitTime;
    hitLocalY = localStartY + directionY * hitTime;
  } else if (startDistance > EPSILON) {
    const boundaryScale = 1 / Math.sqrt(startDistance);
    hitLocalX = localStartX * boundaryScale;
    hitLocalY = localStartY * boundaryScale;
  } else {
    const relativeVelocityX = velocityX - colliderVelocityX;
    const relativeVelocityY = velocityY - colliderVelocityY;
    const localRelativeX =
      relativeVelocityX * cosine + relativeVelocityY * sine;
    const localRelativeY =
      -relativeVelocityX * sine + relativeVelocityY * cosine;
    const relativeLength = Math.hypot(localRelativeX, localRelativeY);
    if (relativeLength > EPSILON) {
      hitLocalX = (-localRelativeX / relativeLength) * radiusX;
      hitLocalY = (-localRelativeY / relativeLength) * radiusY;
    } else {
      hitLocalY = -radiusY;
    }
  }

  let localNormalX = hitLocalX * inverseRadiusXSquared;
  let localNormalY = hitLocalY * inverseRadiusYSquared;
  const normalLength = Math.hypot(localNormalX, localNormalY);
  if (normalLength <= EPSILON) return null;
  localNormalX /= normalLength;
  localNormalY /= normalLength;
  const normalX = localNormalX * cosine - localNormalY * sine;
  const normalY = localNormalX * sine + localNormalY * cosine;

  let outputVelocityX = velocityX;
  let outputVelocityY = velocityY;
  const relativeVelocityX = velocityX - colliderVelocityX;
  const relativeVelocityY = velocityY - colliderVelocityY;
  const velocityAlongNormal =
    relativeVelocityX * normalX + relativeVelocityY * normalY;

  if (velocityAlongNormal < 0) {
    const tangentX = relativeVelocityX - velocityAlongNormal * normalX;
    const tangentY = relativeVelocityY - velocityAlongNormal * normalY;
    outputVelocityX =
      colliderVelocityX +
      tangentX * (1 - TANGENT_FRICTION) -
      velocityAlongNormal * RESTITUTION * normalX;
    outputVelocityY =
      colliderVelocityY +
      tangentY * (1 - TANGENT_FRICTION) -
      velocityAlongNormal * RESTITUTION * normalY;
  }

  const outputSpeed = Math.hypot(outputVelocityX, outputVelocityY);
  if (outputSpeed > MAX_OUTPUT_SPEED) {
    const speedScale = MAX_OUTPUT_SPEED / outputSpeed;
    outputVelocityX *= speedScale;
    outputVelocityY *= speedScale;
  }

  const boundaryX = collider.centerX + hitLocalX * cosine - hitLocalY * sine;
  const boundaryY = collider.centerY + hitLocalX * sine + hitLocalY * cosine;
  const remainingSeconds = penetration
    ? 0
    : Math.max(0, 1 - hitTime) * deltaSeconds;

  return {
    x: boundaryX + normalX * SURFACE_GAP + outputVelocityX * remainingSeconds,
    y: boundaryY + normalY * SURFACE_GAP + outputVelocityY * remainingSeconds,
    velocityX: outputVelocityX,
    velocityY: outputVelocityY,
    normalX,
    normalY,
    penetration,
  };
}
