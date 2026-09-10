import { Container, Sprite, type Texture } from 'pixi.js';
import type { HeadCollider } from '@/face/head-collider';
import { resolveMovingEllipseCollision } from '../physics/ellipse-collision';
import type {
  FireworkMetrics,
  FireworkPhase,
} from '../fireworks/firework-system';
import type { QualityLevel } from '../spring-config';
import { MonotonicTriggerGate } from '../trigger-gate';
import { EMOTION_BLOOM, type VisualTextureLibrary } from '../visual-theme';

type LiquidKind = 'ring' | 'star' | 'clover' | 'cloud';

type LiquidShape = {
  sprite: Sprite;
  kind: LiquidKind;
  active: boolean;
  velocityX: number;
  velocityY: number;
  life: number;
  maximumLife: number;
  baseScale: number;
  spin: number;
  squash: number;
};

const SEQUENCE_DURATION = 3.4;
const SHAPE_CAPACITY = 32;
const clamp = (value: number) => Math.max(0, Math.min(1, value));

export class LiquidLaughSystem {
  readonly container = new Container();
  private readonly backLayer = new Container();
  private readonly shapeLayer = new Container();
  private readonly bottomGlow: Sprite;
  private readonly orb: Sprite;
  private readonly shapes: LiquidShape[] = [];
  private readonly triggerGate = new MonotonicTriggerGate();
  private head: HeadCollider | null = null;
  private headVelocityX = 0;
  private headVelocityY = 0;
  private quality: QualityLevel = 'high';
  private elapsed = SEQUENCE_DURATION;
  private expressionEnergy = 0;
  private targetExpressionEnergy = 0;
  private wave = 0;
  private originX = 0;
  private originY = 0;
  private activeParticles = 0;
  private triggerCount = 0;
  private collisions = 0;
  private penetrationCorrections = 0;
  private collisionChecks = 0;
  private collisionMs = 0;

  constructor(textures: VisualTextureLibrary) {
    this.container.addChild(this.backLayer, this.shapeLayer);
    this.bottomGlow = new Sprite({ texture: textures.softDot, anchor: 0.5 });
    this.bottomGlow.tint = EMOTION_BLOOM.mint;
    this.bottomGlow.blendMode = 'add';
    this.bottomGlow.visible = false;
    this.orb = new Sprite({ texture: textures.liquidOrb, anchor: 0.5 });
    this.orb.blendMode = 'add';
    this.orb.visible = false;
    this.backLayer.addChild(this.bottomGlow, this.orb);

    const textureMap: Record<LiquidKind, Texture> = {
      ring: textures.liquidRing,
      star: textures.liquidStar,
      clover: textures.liquidClover,
      cloud: textures.liquidCloud,
    };
    const kinds: LiquidKind[] = ['ring', 'star', 'clover', 'cloud'];
    for (let index = 0; index < SHAPE_CAPACITY; index += 1) {
      const kind = kinds[index % kinds.length];
      const sprite = new Sprite({ texture: textureMap[kind], anchor: 0.5 });
      sprite.visible = false;
      sprite.blendMode = index % 3 === 0 ? 'add' : 'normal';
      this.shapeLayer.addChild(sprite);
      this.shapes.push({
        sprite,
        kind,
        active: false,
        velocityX: 0,
        velocityY: 0,
        life: 0,
        maximumLife: 0,
        baseScale: 0,
        spin: 0,
        squash: 0,
      });
    }
  }

  setHeadCollider(collider: HeadCollider) {
    if (!collider.valid) {
      this.head = null;
      this.headVelocityX = 0;
      this.headVelocityY = 0;
      return;
    }
    if (this.head) {
      const elapsed = (collider.updatedAt - this.head.updatedAt) / 1000;
      if (elapsed > 0.008 && elapsed < 0.3) {
        this.headVelocityX = clampVelocity(
          (collider.centerX - this.head.centerX) / elapsed,
          820,
        );
        this.headVelocityY = clampVelocity(
          (collider.centerY - this.head.centerY) / elapsed,
          820,
        );
      }
    }
    this.head = collider;
  }

  setQuality(level: QualityLevel) {
    this.quality = level;
  }

  setExpressionEnergy(energy: number) {
    this.targetExpressionEnergy = clamp(energy);
  }

  trigger(triggerId: number, width: number, height: number) {
    if (!this.triggerGate.accept(triggerId)) return false;
    this.elapsed = 0;
    this.wave = 0;
    this.triggerCount += 1;
    this.originX = this.head?.centerX ?? width * 0.5;
    this.originY = Math.max(
      height * 0.14,
      (this.head?.centerY ?? height * 0.5) -
        (this.head?.radiusY ?? height * 0.13) * 1.48,
    );
    this.orb.visible = true;
    this.bottomGlow.visible = true;
    return true;
  }

  update(deltaSeconds: number, now: number, width: number, height: number) {
    this.expressionEnergy +=
      (this.targetExpressionEnergy - this.expressionEnergy) *
      Math.min(1, deltaSeconds * 7.5);
    if (this.elapsed < SEQUENCE_DURATION) {
      this.elapsed += deltaSeconds;
      this.updateStage(width, height);
      const maxWaves = this.quality === 'low' ? 3 : 4;
      while (
        this.wave < maxWaves &&
        this.elapsed >= 0.5 + this.wave * 0.2
      ) {
        this.spawnWave(this.wave);
        this.wave += 1;
      }
    } else {
      this.orb.visible = false;
      this.bottomGlow.visible = false;
    }
    this.updateShapes(deltaSeconds, now, width, height);
  }

  getMetrics(): FireworkMetrics {
    return {
      activeParticles: this.activeParticles,
      capacity: SHAPE_CAPACITY,
      triggerCount: this.triggerCount,
      collisions: this.collisions,
      penetrationCorrections: this.penetrationCorrections,
      collisionChecks: this.collisionChecks,
      collisionMs: this.collisionMs,
      phase: this.getPhase(),
    };
  }

  destroy() {
    this.shapes.length = 0;
  }

  private updateStage(width: number, height: number) {
    const charge = clamp(this.elapsed / 0.48);
    const settle = clamp((this.elapsed - 2.1) / 1.3);
    const pulse = 0.92 + Math.sin(this.elapsed * 3.2) * 0.08;
    this.bottomGlow.position.set(width * 0.5, height * 0.98);
    this.bottomGlow.scale.set(width / 118, Math.max(1.8, height / 360));
    this.bottomGlow.alpha =
      (0.12 + charge * (0.2 + this.expressionEnergy * 0.16)) *
      (1 - settle) *
      pulse;

    const rise = 1 - Math.pow(1 - charge, 3);
    const startY = height * 0.86;
    this.orb.position.set(this.originX, startY + (this.originY - startY) * rise);
    const compression = Math.sin(charge * Math.PI) * 0.22;
    const orbScale = (0.18 + charge * 0.38) * (1 - settle);
    this.orb.scale.set(orbScale * (1 + compression), orbScale * (1 - compression));
    this.orb.alpha = Math.sin(clamp(this.elapsed / 0.62) * Math.PI) * 0.95;
    this.orb.visible = this.orb.alpha > 0.01;
  }

  private spawnWave(wave: number) {
    const kinds: LiquidKind[] = ['ring', 'star', 'clover', 'cloud'];
    const count = this.quality === 'low' ? 4 : 6;
    for (let index = 0; index < count; index += 1) {
      const kind = kinds[(wave + index) % kinds.length];
      const slot = this.findSlot(kind);
      if (!slot) continue;
      const angle =
        -Math.PI * 0.92 +
        ((wave * count + index) / Math.max(1, count * 3 - 1)) *
          Math.PI *
          1.84 +
        (Math.random() - 0.5) * 0.18;
      const speed =
        (78 + wave * 18 + Math.random() * 88) *
        (0.86 + this.expressionEnergy * 0.3);
      slot.active = true;
      slot.sprite.visible = true;
      slot.sprite.position.set(
        this.originX + (Math.random() - 0.5) * 20,
        this.originY + (Math.random() - 0.5) * 14,
      );
      slot.velocityX = Math.cos(angle) * speed;
      slot.velocityY = Math.sin(angle) * speed * 0.72;
      slot.maximumLife = 2.2 + Math.random() * 0.65;
      slot.life = slot.maximumLife;
      const hero = wave === 0 && index < 4;
      slot.baseScale =
        (kind === 'ring'
          ? (hero ? 0.95 : 0.56) + Math.random() * (hero ? 0.35 : 0.28)
          : kind === 'star'
            ? (hero ? 0.78 : 0.46) + Math.random() * (hero ? 0.32 : 0.28)
            : kind === 'clover'
              ? (hero ? 0.72 : 0.42) + Math.random() * (hero ? 0.3 : 0.28)
              : (hero ? 0.62 : 0.36) + Math.random() * (hero ? 0.32 : 0.26)) *
        (0.92 + this.expressionEnergy * 0.18);
      slot.spin = (Math.random() - 0.5) * (kind === 'ring' ? 0.3 : 0.72);
      slot.squash = 0;
      slot.sprite.rotation = Math.random() * Math.PI * 2;
      slot.sprite.alpha = 0;
      slot.sprite.tint = [
        0xffffff,
        0xc9efff,
        0xb09aff,
        0xff70bc,
        0xffdf52,
      ][(wave + index) % 5];
      this.activeParticles += 1;
    }
  }

  private updateShapes(
    deltaSeconds: number,
    now: number,
    width: number,
    height: number,
  ) {
    const collisionStart = performance.now();
    let checks = 0;
    const collider = this.head;
    const canCollide = collider && now - collider.updatedAt < 320;
    for (const shape of this.shapes) {
      if (!shape.active) continue;
      shape.life -= deltaSeconds;
      if (shape.life <= 0) {
        this.release(shape);
        continue;
      }
      const drag = Math.exp(-0.58 * deltaSeconds);
      shape.velocityX *= drag;
      shape.velocityY = shape.velocityY * drag + 7 * deltaSeconds;
      const startX = shape.sprite.x;
      const startY = shape.sprite.y;
      const nextX = startX + shape.velocityX * deltaSeconds;
      const nextY = startY + shape.velocityY * deltaSeconds;
      if (canCollide) {
        checks += 1;
        const collision = resolveMovingEllipseCollision(
          startX,
          startY,
          nextX,
          nextY,
          shape.velocityX,
          shape.velocityY,
          deltaSeconds,
          collider,
          this.headVelocityX,
          this.headVelocityY,
          18,
        );
        if (collision) {
          shape.sprite.position.set(collision.x, collision.y);
          shape.velocityX = collision.velocityX * 0.74;
          shape.velocityY = collision.velocityY * 0.68;
          shape.spin += (Math.random() - 0.5) * 0.48;
          shape.squash = 1;
          this.collisions += 1;
          if (collision.penetration) this.penetrationCorrections += 1;
        } else {
          shape.sprite.position.set(nextX, nextY);
        }
      } else {
        shape.sprite.position.set(nextX, nextY);
      }

      shape.squash = Math.max(0, shape.squash - deltaSeconds * 2.6);
      const lifeRatio = shape.life / shape.maximumLife;
      const appear = Math.min(1, (1 - lifeRatio) * 5.5);
      const melt = clamp(lifeRatio / 0.34);
      const breathe = 1 + Math.sin(now * 0.0018 + shape.maximumLife) * 0.045;
      const faceFade = this.getFaceFade(shape.sprite.x, shape.sprite.y);
      shape.sprite.scale.set(
        shape.baseScale * breathe * (1 + shape.squash * 0.24),
        shape.baseScale * breathe * (1 - shape.squash * 0.3) * melt,
      );
      shape.sprite.rotation += shape.spin * deltaSeconds;
      shape.sprite.alpha =
        appear * Math.min(1, lifeRatio * 2.4) * 0.78 * faceFade;

      if (
        shape.sprite.x < -180 ||
        shape.sprite.x > width + 180 ||
        shape.sprite.y < -180 ||
        shape.sprite.y > height + 180
      ) {
        this.release(shape);
      }
    }
    this.collisionChecks = checks;
    this.collisionMs = canCollide ? performance.now() - collisionStart : 0;
  }

  private findSlot(kind: LiquidKind) {
    for (const shape of this.shapes) {
      if (!shape.active && shape.kind === kind) return shape;
    }
    return null;
  }

  private release(shape: LiquidShape) {
    shape.active = false;
    shape.sprite.visible = false;
    shape.sprite.alpha = 0;
    this.activeParticles -= 1;
  }

  private getFaceFade(x: number, y: number) {
    if (!this.head) return 1;
    const dx = (x - this.head.centerX) / (this.head.radiusX * 1.42);
    const dy = (y - this.head.centerY) / (this.head.radiusY * 1.32);
    return dx * dx + dy * dy < 1 ? 0.18 : 1;
  }

  private getPhase(): FireworkPhase {
    if (this.elapsed >= SEQUENCE_DURATION) return 'idle';
    if (this.elapsed < 0.34) return 'charge';
    if (this.elapsed < 0.58) return 'launch';
    if (this.elapsed < 2.15) return 'bloom';
    return 'settle';
  }
}

function clampVelocity(value: number, limit: number) {
  return Math.max(-limit, Math.min(limit, value));
}
