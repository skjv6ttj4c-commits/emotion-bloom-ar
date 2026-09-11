import { Container, Sprite } from 'pixi.js';
import type { HeadCollider } from '@/face/head-collider';
import type { HandActionTrigger } from '@/hand/use-hand-actions';
import { MonotonicTriggerGate } from '../trigger-gate';
import type { QualityLevel } from '../spring-config';
import type { VisualTextureLibrary } from '../visual-theme';

export type HeartPhase = 'idle' | 'forming' | 'split' | 'orbiting' | 'fading';

export type HeartEffectMetrics = {
  phase: HeartPhase;
  activeHearts: number;
  capacity: number;
  triggerCount: number;
};

export const HEART_EFFECT_CONFIG = {
  duration: 5.35,
  splitAt: 1.02,
  fadeAt: 4.1,
  heartCount: 32,
  tint: 0xff4f9f,
} as const;

const clamp = (value: number) => Math.min(1, Math.max(0, value));
const smoothstep = (value: number) => {
  const t = clamp(value);
  return t * t * (3 - 2 * t);
};
const easeOutBack = (value: number) => {
  const t = clamp(value) - 1;
  return 1 + 2.7 * t * t * t + 1.7 * t * t;
};

export class HeartSystem {
  readonly container = new Container();
  private readonly mainHeart: Sprite;
  private readonly glow: Sprite;
  private readonly pulseRing: Sprite;
  private readonly hearts: Sprite[] = [];
  private readonly triggerGate = new MonotonicTriggerGate();
  private head: HeadCollider | null = null;
  private quality: QualityLevel = 'high';
  private elapsed: number = HEART_EFFECT_CONFIG.duration;
  private originX = 0;
  private originY = 0;
  private triggerCount = 0;

  constructor(textures: VisualTextureLibrary) {
    this.glow = new Sprite({ texture: textures.softDot, anchor: 0.5 });
    this.glow.tint = 0xff2b89;
    this.glow.blendMode = 'add';
    this.pulseRing = new Sprite({ texture: textures.energyRing, anchor: 0.5 });
    this.pulseRing.tint = 0xff70bd;
    this.pulseRing.blendMode = 'add';
    this.mainHeart = new Sprite({ texture: textures.pixelHeart, anchor: 0.5 });
    this.mainHeart.tint = HEART_EFFECT_CONFIG.tint;
    this.mainHeart.blendMode = 'add';
    this.container.addChild(this.glow, this.pulseRing, this.mainHeart);
    for (let index = 0; index < HEART_EFFECT_CONFIG.heartCount; index += 1) {
      const heart = new Sprite({ texture: textures.pixelHeart, anchor: 0.5 });
      heart.tint =
        index % 4 === 0 ? 0xffb0d7 : index % 3 === 0 ? 0xff78bb : 0xff3d91;
      heart.blendMode = 'add';
      heart.visible = false;
      this.hearts.push(heart);
      this.container.addChild(heart);
    }
    this.container.visible = false;
  }

  setHeadCollider(collider: HeadCollider) {
    if (collider.valid) this.head = collider;
  }

  setQuality(level: QualityLevel) {
    this.quality = level;
  }

  trigger(trigger: HandActionTrigger, width: number, height: number) {
    if (!this.triggerGate.accept(trigger.id)) return false;
    const head = this.getHead(width, height);
    this.originX = trigger.x || head.centerX;
    this.originY = trigger.y || head.centerY + head.radiusY * 1.45;
    const insideFace =
      Math.hypot(
        (this.originX - head.centerX) / Math.max(1, head.radiusX),
        (this.originY - head.centerY) / Math.max(1, head.radiusY),
      ) < 1.25;
    if (insideFace) this.originY = head.centerY + head.radiusY * 1.55;
    this.elapsed = 0;
    this.triggerCount += 1;
    this.container.visible = true;
    return true;
  }

  update(deltaSeconds: number, now: number, width: number, height: number) {
    if (this.elapsed >= HEART_EFFECT_CONFIG.duration) {
      this.container.visible = false;
      return;
    }
    this.elapsed = Math.min(
      HEART_EFFECT_CONFIG.duration,
      this.elapsed + deltaSeconds,
    );
    this.container.visible = true;
    const head = this.getHead(width, height);
    const fade =
      1 - smoothstep((this.elapsed - HEART_EFFECT_CONFIG.fadeAt) / 1.25);
    this.updateBottomHeartbeat(now, width, height, fade);
    this.updateMainHeart(head, fade);
    this.updateContourHearts(head, now, fade);
  }

  getMetrics(): HeartEffectMetrics {
    return {
      phase: this.getPhase(),
      activeHearts:
        (this.mainHeart.visible ? 1 : 0) +
        this.hearts.filter((heart) => heart.visible).length,
      capacity: HEART_EFFECT_CONFIG.heartCount + 1,
      triggerCount: this.triggerCount,
    };
  }

  destroy() {
    this.hearts.length = 0;
  }

  private updateBottomHeartbeat(
    now: number,
    width: number,
    height: number,
    fade: number,
  ) {
    const entrance = smoothstep(this.elapsed / 0.22);
    const pulse = 0.5 + 0.5 * Math.sin(now * 0.0085);
    const base = Math.min(width, height);
    this.glow.position.set(width * 0.5, height * 0.98);
    this.glow.width = width * (1.05 + pulse * 0.16);
    this.glow.height = base * (0.23 + pulse * 0.06);
    this.glow.alpha = entrance * fade * (0.16 + pulse * 0.13);
    this.glow.visible = this.glow.alpha > 0.01;
    this.pulseRing.position.set(width * 0.5, height * 0.96);
    this.pulseRing.width = width * (0.76 + pulse * 0.18);
    this.pulseRing.height = base * (0.17 + pulse * 0.05);
    this.pulseRing.alpha = entrance * fade * (0.22 + pulse * 0.18);
    this.pulseRing.visible = this.pulseRing.alpha > 0.01;
  }

  private updateMainHeart(head: HeadCollider, fade: number) {
    const forming = easeOutBack(this.elapsed / 0.7);
    const split = smoothstep((this.elapsed - 0.83) / 0.25);
    const targetSize = Math.min(head.radiusX * 2.02, head.radiusY * 1.62, 300);
    this.mainHeart.position.set(this.originX, this.originY);
    this.mainHeart.width = targetSize * forming * (1 + split * 0.18);
    this.mainHeart.height = targetSize * forming * (1 + split * 0.18);
    this.mainHeart.alpha = fade * (1 - split);
    this.mainHeart.visible = this.mainHeart.alpha > 0.01;
  }

  private updateContourHearts(head: HeadCollider, now: number, fade: number) {
    const activeLimit =
      this.quality === 'low' ? 18 : this.quality === 'medium' ? 25 : 32;
    const spread = smoothstep((this.elapsed - 0.92) / 0.64);
    for (let index = 0; index < this.hearts.length; index += 1) {
      const heart = this.hearts[index];
      if (index >= activeLimit || spread <= 0 || fade <= 0) {
        heart.visible = false;
        continue;
      }
      const isFaceArc = index < Math.floor(activeLimit * 0.66);
      const localIndex = isFaceArc
        ? index
        : index - Math.floor(activeLimit * 0.66);
      const localCount = isFaceArc
        ? Math.floor(activeLimit * 0.66)
        : activeLimit - Math.floor(activeLimit * 0.66);
      const phase = localIndex / Math.max(1, localCount - 1);
      const angle = isFaceArc
        ? Math.PI * (0.12 + phase * 1.76)
        : Math.PI * (0.12 + phase * 0.76);
      const targetX = isFaceArc
        ? head.centerX + Math.cos(angle) * head.radiusX * 1.42
        : head.centerX + Math.cos(angle) * head.radiusX * 2.18;
      const targetY = isFaceArc
        ? head.centerY + Math.sin(angle) * head.radiusY * 1.34
        : head.centerY +
          head.radiusY * 1.12 +
          Math.sin(angle) * head.radiusY * 1.03;
      const wobble =
        Math.sin(now * 0.0035 + index * 1.7) * (4 + (index % 3) * 2);
      heart.position.set(
        this.originX + (targetX - this.originX) * spread + wobble,
        this.originY +
          (targetY - this.originY) * spread +
          Math.cos(now * 0.003 + index) * 5,
      );
      const size =
        (index % 7 === 0 ? 34 : 17 + (index % 5) * 3) * (0.45 + spread * 0.55);
      heart.width = size;
      heart.height = size;
      heart.rotation = Math.sin(now * 0.002 + index) * 0.18;
      heart.alpha = fade * spread * (0.62 + (index % 4) * 0.1);
      heart.visible = true;
    }
  }

  private getHead(width: number, height: number): HeadCollider {
    return (
      this.head ?? {
        valid: true,
        centerX: width * 0.5,
        centerY: height * 0.43,
        radiusX: Math.min(width, height) * 0.12,
        radiusY: Math.min(width, height) * 0.16,
        rotation: 0,
        updatedAt: performance.now(),
      }
    );
  }

  private getPhase(): HeartPhase {
    if (this.elapsed >= HEART_EFFECT_CONFIG.duration) return 'idle';
    if (this.elapsed < 0.82) return 'forming';
    if (this.elapsed < 1.38) return 'split';
    if (this.elapsed < HEART_EFFECT_CONFIG.fadeAt) return 'orbiting';
    return 'fading';
  }
}
