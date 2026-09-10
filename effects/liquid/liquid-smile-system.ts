import { Container, Sprite } from 'pixi.js';
import type { HeadCollider } from '@/face/head-collider';
import type { InteractionState } from '@/interaction/expression-state-machine';
import { resolveMovingEllipseCollision } from '../physics/ellipse-collision';
import type { EmotionBloomMetrics } from '../emotion-bloom/emotion-bloom-system';
import type { QualityLevel } from '../spring-config';
import { EMOTION_BLOOM, type VisualTextureLibrary } from '../visual-theme';

type DropSlot = {
  sprite: Sprite;
  active: boolean;
  velocityX: number;
  velocityY: number;
  life: number;
  baseScale: number;
  squash: number;
  phase: number;
};

type MeltSlot = {
  ripple: Sprite;
  clover: Sprite;
  active: boolean;
  age: number;
  duration: number;
};

const DROP_CAPACITY = 42;
const MELT_CAPACITY = 10;
const clamp = (value: number) => Math.max(0, Math.min(1, value));

export class LiquidSmileSystem {
  readonly container = new Container();
  private readonly backLayer = new Container();
  private readonly dropLayer = new Container();
  private readonly meltLayer = new Container();
  private readonly bottomGlow: Sprite;
  private readonly drops: DropSlot[] = [];
  private readonly melts: MeltSlot[] = [];
  private state: InteractionState = 'no-face';
  private quality: QualityLevel = 'high';
  private head: HeadCollider | null = null;
  private headVelocityX = 0;
  private headVelocityY = 0;
  private targetEnergy = 0;
  private energy = 0;
  private intensity = 0;
  private emissionAccumulator = 0;
  private nextDropIndex = 0;
  private nextMeltIndex = 0;
  private smileAge = 99;
  private dissolveAge = 99;

  constructor(textures: VisualTextureLibrary) {
    this.container.addChild(this.backLayer, this.dropLayer, this.meltLayer);
    this.bottomGlow = new Sprite({ texture: textures.softDot, anchor: 0.5 });
    this.bottomGlow.tint = EMOTION_BLOOM.mint;
    this.bottomGlow.blendMode = 'add';
    this.backLayer.addChild(this.bottomGlow);

    for (let index = 0; index < DROP_CAPACITY; index += 1) {
      const sprite = new Sprite({ texture: textures.liquidDrop, anchor: 0.5 });
      sprite.visible = false;
      sprite.blendMode = index % 4 === 0 ? 'add' : 'normal';
      sprite.tint = [0xffffff, 0xc7efff, 0xb7a6ff, 0xffa4df][index % 4];
      this.dropLayer.addChild(sprite);
      this.drops.push({
        sprite,
        active: false,
        velocityX: 0,
        velocityY: 0,
        life: 0,
        baseScale: 0,
        squash: 0,
        phase: index * 1.47,
      });
    }

    for (let index = 0; index < MELT_CAPACITY; index += 1) {
      const ripple = new Sprite({ texture: textures.liquidRipple, anchor: 0.5 });
      const clover = new Sprite({ texture: textures.liquidClover, anchor: 0.5 });
      ripple.tint = index % 2 === 0 ? EMOTION_BLOOM.mint : EMOTION_BLOOM.cyan;
      clover.tint =
        index % 3 === 0 ? 0xd9ffff : index % 3 === 1 ? 0xb5a6ff : 0xffe26d;
      ripple.blendMode = 'add';
      clover.blendMode = 'add';
      ripple.visible = false;
      clover.visible = false;
      this.meltLayer.addChild(ripple, clover);
      this.melts.push({
        ripple,
        clover,
        active: false,
        age: 0,
        duration: 0.9,
      });
    }
  }

  setStoryState(state: InteractionState, energy: number) {
    this.state = state;
    this.targetEnergy = state === 'no-face' ? 0 : clamp(energy);
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
          720,
        );
        this.headVelocityY = clampVelocity(
          (collider.centerY - this.head.centerY) / elapsed,
          720,
        );
      }
    }
    this.head = collider;
  }

  setQuality(level: QualityLevel) {
    this.quality = level;
  }

  triggerSmile() {
    this.smileAge = 0;
    this.dissolveAge = 99;
    this.emissionAccumulator += 2.4;
    return true;
  }

  triggerCharge() {
    return true;
  }

  triggerDissolve() {
    this.dissolveAge = 0;
    return true;
  }

  update(deltaSeconds: number, now: number, width: number, height: number) {
    this.smileAge += deltaSeconds;
    this.dissolveAge += deltaSeconds;
    const smiling =
      this.state === 'smile-entering' || this.state === 'smiling';
    const charging =
      this.state === 'laugh-entering' || this.state === 'laughing';
    const targetIntensity = smiling ? 0.58 + this.targetEnergy * 0.42 : 0;
    const response = targetIntensity > this.intensity ? 0.32 : 0.82;
    this.intensity +=
      (targetIntensity - this.intensity) *
      (1 - Math.exp(-deltaSeconds / response));
    this.energy +=
      (this.targetEnergy - this.energy) * (1 - Math.exp(-deltaSeconds / 0.34));

    const qualityScale =
      this.quality === 'low' ? 0.56 : this.quality === 'medium' ? 0.76 : 1;
    if (smiling) {
      this.emissionAccumulator +=
        deltaSeconds * (4.2 + this.energy * 7.8) * qualityScale;
    }
    while (this.emissionAccumulator >= 1) {
      this.emissionAccumulator -= 1;
      this.spawnDrop(width);
    }

    this.updateGlow(now, width, height, charging);
    this.updateDrops(deltaSeconds, now, width, height, charging);
    this.updateMelts(deltaSeconds);
  }

  getMetrics(): EmotionBloomMetrics {
    let activeElements = this.bottomGlow.alpha > 0.01 ? 1 : 0;
    for (const drop of this.drops) if (drop.active) activeElements += 1;
    for (const melt of this.melts) if (melt.active) activeElements += 2;
    return {
      activeElements,
      capacity: DROP_CAPACITY + MELT_CAPACITY * 2 + 1,
      intensity: this.intensity,
      energy: this.energy,
      stage: this.getStage(),
      dissolving: this.dissolveAge < 1.2,
    };
  }

  destroy() {
    this.drops.length = 0;
    this.melts.length = 0;
  }

  private spawnDrop(width: number) {
    for (let attempt = 0; attempt < DROP_CAPACITY; attempt += 1) {
      const index = (this.nextDropIndex + attempt) % DROP_CAPACITY;
      const drop = this.drops[index];
      if (drop.active) continue;
      this.nextDropIndex = (index + 1) % DROP_CAPACITY;
      drop.active = true;
      drop.sprite.visible = true;
      drop.sprite.x = width * (0.06 + Math.random() * 0.88);
      drop.sprite.y = -48 - Math.random() * 90;
      drop.velocityX = (Math.random() - 0.5) * (16 + this.energy * 12);
      drop.velocityY = 58 + Math.random() * 48 + this.energy * 34;
      drop.life = 10;
      drop.baseScale = 0.23 + Math.random() * 0.25;
      drop.squash = 0;
      drop.sprite.rotation = (Math.random() - 0.5) * 0.58;
      drop.sprite.alpha = 0;
      return;
    }
  }

  private updateGlow(
    now: number,
    width: number,
    height: number,
    charging: boolean,
  ) {
    const pulse = 0.92 + Math.sin(now * 0.0016) * 0.08;
    this.bottomGlow.position.set(width * 0.5, height * 0.98);
    this.bottomGlow.scale.set(width / 150, Math.max(1.1, height / 520));
    this.bottomGlow.alpha =
      (0.06 + this.intensity * 0.14 + (charging ? 0.18 : 0)) * pulse;
    this.bottomGlow.visible = this.bottomGlow.alpha > 0.01;
  }

  private updateDrops(
    deltaSeconds: number,
    now: number,
    width: number,
    height: number,
    charging: boolean,
  ) {
    const collider = this.head;
    const canCollide = collider && now - collider.updatedAt < 320;
    for (const drop of this.drops) {
      if (!drop.active) continue;
      drop.life -= deltaSeconds;
      drop.velocityY += 12 * deltaSeconds;
      drop.velocityX += Math.sin(now * 0.0012 + drop.phase) * deltaSeconds * 4;
      const startX = drop.sprite.x;
      const startY = drop.sprite.y;
      const motionScale = charging ? 0.4 : 1;
      const nextX = startX + drop.velocityX * deltaSeconds * motionScale;
      const nextY = startY + drop.velocityY * deltaSeconds * motionScale;
      if (canCollide) {
        const collision = resolveMovingEllipseCollision(
          startX,
          startY,
          nextX,
          nextY,
          drop.velocityX,
          drop.velocityY,
          deltaSeconds,
          collider,
          this.headVelocityX,
          this.headVelocityY,
          12,
        );
        if (collision) {
          drop.sprite.position.set(collision.x, collision.y);
          drop.velocityX = collision.velocityX * 0.82;
          drop.velocityY = collision.velocityY * 0.72;
          drop.squash = 1;
        } else {
          drop.sprite.position.set(nextX, nextY);
        }
      } else {
        drop.sprite.position.set(nextX, nextY);
      }
      drop.squash = Math.max(0, drop.squash - deltaSeconds * 3.2);
      const breathe = 1 + Math.sin(now * 0.002 + drop.phase) * 0.045;
      drop.sprite.scale.set(
        drop.baseScale * breathe * (1 + drop.squash * 0.22),
        drop.baseScale * breathe * (1 - drop.squash * 0.28),
      );
      drop.sprite.rotation +=
        (drop.velocityX * 0.00035 + Math.sin(drop.phase) * 0.08) *
        deltaSeconds;
      const faceFade = this.isOverFace(drop.sprite.x, drop.sprite.y) ? 0.16 : 1;
      drop.sprite.alpha =
        Math.min(0.94, 0.24 + this.intensity * 0.72) *
        clamp(this.intensity / 0.28) *
        faceFade *
        (charging ? 0.58 : 1);

      if (drop.sprite.y >= height - 42) {
        this.spawnMelt(drop.sprite.x, height - 36);
        this.releaseDrop(drop);
      } else if (
        drop.life <= 0 ||
        drop.sprite.x < -100 ||
        drop.sprite.x > width + 100
      ) {
        this.releaseDrop(drop);
      }
    }
  }

  private spawnMelt(x: number, y: number) {
    const melt = this.melts[this.nextMeltIndex];
    this.nextMeltIndex = (this.nextMeltIndex + 1) % MELT_CAPACITY;
    melt.active = true;
    melt.age = 0;
    melt.duration = 0.78 + Math.random() * 0.34;
    melt.ripple.visible = true;
    melt.clover.visible = true;
    melt.ripple.position.set(x, y);
    melt.clover.position.set(x, y - 8);
    melt.ripple.scale.set(0.18);
    melt.clover.scale.set(0.03);
    melt.ripple.alpha = 0;
    melt.clover.alpha = 0;
  }

  private updateMelts(deltaSeconds: number) {
    for (const melt of this.melts) {
      if (!melt.active) continue;
      melt.age += deltaSeconds;
      const progress = clamp(melt.age / melt.duration);
      const rippleScale = 0.18 + progress * 0.5;
      melt.ripple.scale.set(rippleScale, rippleScale * 0.56);
      melt.ripple.alpha = Math.sin(progress * Math.PI) * 0.58;
      const cloverGrow = clamp((progress - 0.18) / 0.42);
      melt.clover.scale.set(0.08 + cloverGrow * 0.2);
      melt.clover.alpha = Math.sin(cloverGrow * Math.PI) * 0.5;
      if (progress >= 1) {
        melt.active = false;
        melt.ripple.visible = false;
        melt.clover.visible = false;
      }
    }
  }

  private releaseDrop(drop: DropSlot) {
    drop.active = false;
    drop.sprite.visible = false;
    drop.sprite.alpha = 0;
  }

  private isOverFace(x: number, y: number) {
    if (!this.head) return false;
    const dx = (x - this.head.centerX) / (this.head.radiusX * 0.86);
    const dy = (y - this.head.centerY) / (this.head.radiusY * 0.88);
    return dx * dx + dy * dy < 1;
  }

  private getStage(): EmotionBloomMetrics['stage'] {
    if (this.state === 'no-face') return 'idle';
    if (this.state === 'neutral') return 'ambient';
    if (this.state === 'smile-entering') return 'awakening';
    if (this.state === 'smiling') return 'smile';
    if (this.state === 'laugh-entering' || this.state === 'laughing')
      return 'charging';
    return 'afterglow';
  }
}

function clampVelocity(value: number, limit: number) {
  return Math.max(-limit, Math.min(limit, value));
}
