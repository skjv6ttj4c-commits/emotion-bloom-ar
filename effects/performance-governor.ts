import { QUALITY_PROFILES, type QualityLevel } from './spring-config';

export class PerformanceGovernor {
  private level: QualityLevel;
  private smoothedFps = 60;
  private lastChangeAt = 0;
  private lowFpsSince: number | null = null;
  private highFpsSince: number | null = null;

  constructor(reducedDevice: boolean, reducedMotion: boolean) {
    this.level = reducedMotion || reducedDevice ? 'medium' : 'high';
  }

  sample(fps: number, now: number) {
    if (!Number.isFinite(fps) || fps <= 0) return this.level;
    this.smoothedFps += (fps - this.smoothedFps) * 0.08;
    if (this.smoothedFps < 27) {
      this.lowFpsSince ??= now;
      this.highFpsSince = null;
      if (now - this.lowFpsSince > 1800) this.lower(now);
    } else if (this.smoothedFps < 43) {
      this.lowFpsSince ??= now;
      this.highFpsSince = null;
      if (now - this.lowFpsSince > 2600) this.lower(now);
    } else if (this.smoothedFps > 55) {
      this.highFpsSince ??= now;
      this.lowFpsSince = null;
      if (now - this.highFpsSince > 6500) this.raise(now);
    } else {
      this.lowFpsSince = null;
      this.highFpsSince = null;
    }
    return this.level;
  }

  getLevel() {
    return this.level;
  }

  getProfile() {
    return QUALITY_PROFILES[this.level];
  }

  private lower(now: number) {
    if (now - this.lastChangeAt < 3500) return;
    this.level = this.level === 'high' ? 'medium' : 'low';
    this.lastChangeAt = now;
    this.lowFpsSince = null;
  }

  private raise(now: number) {
    if (now - this.lastChangeAt < 6500) return;
    this.level = this.level === 'low' ? 'medium' : 'high';
    this.lastChangeAt = now;
    this.highFpsSince = null;
  }
}
