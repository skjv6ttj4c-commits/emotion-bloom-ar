export type QualityLevel = 'high' | 'medium' | 'low';

export const SPRING_COLORS = {
  pearl: 0xfff7fb,
  sakura: 0xff91bd,
  blush: 0xffbdd3,
  peach: 0xffaa7a,
  champagne: 0xffd98f,
  plum: 0x5e315f,
  night: 0x100814,
} as const;

export const QUALITY_PROFILES = {
  high: {
    particleScale: 1,
    emissionScale: 1,
    collisionBudgetScale: 1,
    dustScale: 1,
  },
  medium: {
    particleScale: 0.76,
    emissionScale: 0.74,
    collisionBudgetScale: 0.76,
    dustScale: 0.68,
  },
  low: {
    particleScale: 0.56,
    emissionScale: 0.52,
    collisionBudgetScale: 0.54,
    dustScale: 0.42,
  },
} as const;

export const SPRING_MOTION = {
  flowerFireworkDuration: 2,
} as const;
