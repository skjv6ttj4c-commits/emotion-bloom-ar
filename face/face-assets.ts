const PUBLIC_BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? '';

export const FACE_ASSET_VERSION = '2026-09-14.2';
export const FACE_MODEL_PATH = `${PUBLIC_BASE_PATH}/mediapipe/models/face_landmarker.task?v=${FACE_ASSET_VERSION}`;
export const FACE_MODEL_FALLBACK_PATH =
  'https://cdn.jsdelivr.net/gh/skjv6ttj4c-commits/emotion-bloom-ar@00d02c5/public/mediapipe/models/face_landmarker.task';
export const VISION_WASM_PATH = `${PUBLIC_BASE_PATH}/mediapipe/wasm`;
export const VISION_CACHE_WORKER_PATH = `${PUBLIC_BASE_PATH}/vision-cache-sw.js?v=${FACE_ASSET_VERSION}`;
export const VISION_CACHE_SCOPE = `${PUBLIC_BASE_PATH || ''}/`;
export const VISION_ASSET_CACHE = `pixel-live-vision-${FACE_ASSET_VERSION}`;
