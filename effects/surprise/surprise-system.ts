import { Container, Graphics, Sprite } from 'pixi.js';
import type { HeadCollider } from '@/face/head-collider';
import { MonotonicTriggerGate } from '../trigger-gate';
import type { QualityLevel } from '../spring-config';
import { CANDY_BLOOM, type VisualTextureLibrary } from '../visual-theme';

export type SurprisePhase =
  | 'idle'
  | 'flash'
  | 'burst'
  | 'bolts'
  | 'stars'
  | 'collapse';

export const SURPRISE_EFFECT_CONFIG = {
  duration: 1.2,
  polygonColor: CANDY_BLOOM.lavender,
  polygonHighlight: 0xd6b5ff,
  boltColor: 0xffdf22,
  starColor: 0xffffff,
  boltCount: 8,
  starCount: 12,
} as const;

const clamp = (value: number) => Math.min(1, Math.max(0, value));
const smoothstep = (value: number) => {
  const t = clamp(value);
  return t * t * (3 - 2 * t);
};

export class SurpriseSystem {
  readonly container = new Container();
  private readonly edgeFlash = new Graphics();
  private readonly polygon = new Graphics();
  private readonly bolts: Sprite[] = [];
  private readonly stars: Sprite[] = [];
  private readonly triggerGate = new MonotonicTriggerGate();
  private head: HeadCollider | null = null;
  private quality: QualityLevel = 'high';
  private elapsed: number = SURPRISE_EFFECT_CONFIG.duration;
  private triggerCount = 0;

  constructor(textures: VisualTextureLibrary) {
    this.container.addChild(this.edgeFlash, this.polygon);
    for (let index = 0; index < SURPRISE_EFFECT_CONFIG.boltCount; index += 1) {
      const bolt = new Sprite({ texture: textures.pixelBolt, anchor: 0.5 });
      bolt.tint = SURPRISE_EFFECT_CONFIG.boltColor;
      bolt.blendMode = 'add';
      bolt.visible = false;
      this.container.addChild(bolt);
      this.bolts.push(bolt);
    }
    for (let index = 0; index < SURPRISE_EFFECT_CONFIG.starCount; index += 1) {
      const star = new Sprite({ texture: textures.pixelCross, anchor: 0.5 });
      star.tint = SURPRISE_EFFECT_CONFIG.starColor;
      star.blendMode = 'add';
      star.visible = false;
      this.container.addChild(star);
      this.stars.push(star);
    }
    this.container.visible = false;
  }

  setHeadCollider(collider: HeadCollider) {
    if (collider.valid) this.head = collider;
  }

  setQuality(level: QualityLevel) {
    this.quality = level;
  }

  trigger(triggerId: number) {
    if (!this.triggerGate.accept(triggerId)) return false;
    this.begin();
    return true;
  }

  preview() {
    this.begin();
  }

  update(deltaSeconds: number, now: number, width: number, height: number) {
    if (this.elapsed >= SURPRISE_EFFECT_CONFIG.duration) {
      this.container.visible = false;
      return;
    }
    this.elapsed = Math.min(
      SURPRISE_EFFECT_CONFIG.duration,
      this.elapsed + deltaSeconds,
    );
    this.container.visible = true;
    const head = this.getHead(width, height);
    this.drawEdgeFlash(width, height);
    this.drawPolygon(head);
    this.updateBolts(head, now);
    this.updateStars(width, height, now);
  }

  getMetrics() {
    return {
      phase: this.getPhase(),
      triggerCount: this.triggerCount,
      activeElements:
        (this.polygon.visible ? 1 : 0) +
        this.bolts.filter((item) => item.visible).length +
        this.stars.filter((item) => item.visible).length,
    };
  }

  destroy() {
    this.bolts.length = 0;
    this.stars.length = 0;
  }

  private begin() {
    this.elapsed = 0;
    this.triggerCount += 1;
    this.container.visible = true;
  }

  private drawEdgeFlash(width: number, height: number) {
    const alpha = 1 - clamp(this.elapsed / 0.1);
    this.edgeFlash.clear();
    this.edgeFlash.visible = alpha > 0.01;
    if (!this.edgeFlash.visible) return;
    this.edgeFlash.rect(3, 3, width - 6, height - 6).stroke({
      color: 0xffffff,
      width: 7,
      alpha: alpha * 0.82,
    });
  }

  private drawPolygon(head: HeadCollider) {
    const appear = smoothstep((this.elapsed - 0.08) / 0.18);
    const collapse = smoothstep((this.elapsed - 0.98) / 0.2);
    const pulseScale = 0.72 + appear * 0.5 - collapse * 0.34;
    const alpha = appear * (1 - collapse);
    const centerX = head.centerX;
    const centerY = head.centerY + head.radiusY * 0.58;
    const radiusX = head.radiusX * 2.22 * pulseScale;
    const radiusY = head.radiusY * 2.12 * pulseScale;
    this.polygon.clear();
    this.polygon.visible = alpha > 0.01;
    if (!this.polygon.visible) return;
    const pointCount = 20;
    for (let index = 0; index <= pointCount; index += 1) {
      const step = index % pointCount;
      const angle = -Math.PI / 2 + (step / pointCount) * Math.PI * 2;
      const spike = step % 2 === 0 ? 1 : 0.82;
      const x = centerX + Math.cos(angle) * radiusX * spike;
      const y = centerY + Math.sin(angle) * radiusY * spike;
      if (index === 0) this.polygon.moveTo(x, y);
      else this.polygon.lineTo(x, y);
    }
    this.polygon.stroke({
      color: 0x161022,
      width: 16,
      alpha: alpha * 0.78,
      join: 'miter',
    });
    this.polygon.stroke({
      color: SURPRISE_EFFECT_CONFIG.polygonColor,
      width: 10,
      alpha: alpha * 0.96,
      join: 'miter',
    });
    this.polygon.stroke({
      color: SURPRISE_EFFECT_CONFIG.polygonHighlight,
      width: 2,
      alpha,
      join: 'miter',
    });
  }

  private updateBolts(head: HeadCollider, now: number) {
    const activeLimit = this.quality === 'low' ? 6 : 8;
    const fade = 1 - smoothstep((this.elapsed - 0.78) / 0.22);
    const centerX = head.centerX;
    const centerY = head.centerY + head.radiusY * 0.58;
    for (let index = 0; index < this.bolts.length; index += 1) {
      const bolt = this.bolts[index];
      const reveal = smoothstep((this.elapsed - 0.18 - index * 0.027) / 0.1);
      if (index >= activeLimit || reveal <= 0 || fade <= 0) {
        bolt.visible = false;
        continue;
      }
      const angle =
        -Math.PI * 0.92 +
        (index / Math.max(1, activeLimit - 1)) * Math.PI * 1.84;
      const edgeX = Math.cos(angle) * head.radiusX * 2.68;
      const edgeY = Math.sin(angle) * head.radiusY * 2.55;
      const outward = 25 + (index % 3) * 11;
      bolt.position.set(
        centerX + edgeX + Math.cos(angle) * outward,
        centerY + edgeY + Math.sin(angle) * outward,
      );
      bolt.rotation = angle + Math.PI / 2;
      bolt.scale.set(0.42 + (index % 3) * 0.09);
      const flicker = Math.sin(now * 0.045 + index * 2.7) > -0.35 ? 1 : 0.38;
      bolt.alpha = reveal * fade * flicker;
      bolt.visible = true;
    }
  }

  private updateStars(width: number, height: number, now: number) {
    const activeLimit = this.quality === 'low' ? 8 : 12;
    const reveal = smoothstep((this.elapsed - 0.38) / 0.12);
    const fade = 1 - smoothstep((this.elapsed - 0.78) / 0.2);
    for (let index = 0; index < this.stars.length; index += 1) {
      const star = this.stars[index];
      if (index >= activeLimit || reveal <= 0 || fade <= 0) {
        star.visible = false;
        continue;
      }
      const side = index % 4;
      const along = 0.12 + ((index * 37) % 76) / 100;
      if (side === 0) star.position.set(width * along, height * 0.07);
      if (side === 1) star.position.set(width * 0.94, height * along);
      if (side === 2) star.position.set(width * along, height * 0.93);
      if (side === 3) star.position.set(width * 0.06, height * along);
      star.scale.set(0.16 + (index % 4) * 0.035);
      star.rotation = index % 2 === 0 ? 0 : Math.PI / 4;
      star.alpha =
        reveal * fade * (0.72 + Math.sin(now * 0.025 + index * 1.7) * 0.28);
      star.visible = true;
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

  private getPhase(): SurprisePhase {
    if (this.elapsed >= SURPRISE_EFFECT_CONFIG.duration) return 'idle';
    if (this.elapsed < 0.1) return 'flash';
    if (this.elapsed < 0.2) return 'burst';
    if (this.elapsed < 0.4) return 'bolts';
    if (this.elapsed < 1) return 'stars';
    return 'collapse';
  }
}
