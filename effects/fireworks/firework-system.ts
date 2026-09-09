import {
  Container,
  Particle,
  ParticleContainer,
  Sprite,
  Texture,
} from 'pixi.js';
import type { HeadCollider } from '@/face/head-collider';
import { resolveMovingEllipseCollision } from '../physics/ellipse-collision';
import { MonotonicTriggerGate } from '../trigger-gate';
import {
  QUALITY_PROFILES,
  SPRING_MOTION,
  type QualityLevel,
} from '../spring-config';
import {
  CANDY_BLOOM,
  CANDY_BLOOM_SCALE,
  LAUGH_PALETTE,
  pickColor,
  type VisualTextureLibrary,
} from '../visual-theme';

export const MAX_FIREWORK_PARTICLES = 480;

export type FireworkPhase = 'idle' | 'charge' | 'launch' | 'bloom' | 'settle';

export type FireworkMetrics = {
  activeParticles: number;
  capacity: number;
  triggerCount: number;
  collisions: number;
  penetrationCorrections: number;
  collisionChecks: number;
  collisionMs: number;
  phase: FireworkPhase;
};

type SparkKind = 'dot' | 'streak' | 'star' | 'petal';

type FireworkSlot = {
  particle: Particle;
  kind: SparkKind;
  active: boolean;
  velocityX: number;
  velocityY: number;
  gravity: number;
  drag: number;
  angularVelocity: number;
  life: number;
  maximumLife: number;
  baseAlpha: number;
  collisionCooldownUntil: number;
  collisionFlash: number;
};

const SEQUENCE_DURATION = SPRING_MOTION.flowerFireworkDuration;

export class FireworkSystem {
  readonly container = new Container();
  private readonly batches: Record<SparkKind, ParticleContainer<Particle>>;
  private readonly rings: Sprite[];
  private readonly heroStars: Sprite[];
  private readonly slots: FireworkSlot[] = [];
  private readonly capacity: number;
  private nextPoolIndex = 0;
  private activeParticles = 0;
  private triggerCount = 0;
  private collisions = 0;
  private penetrationCorrections = 0;
  private collisionChecks = 0;
  private collisionMs = 0;
  private headCollider: HeadCollider | null = null;
  private headVelocityX = 0;
  private headVelocityY = 0;
  private readonly maxCollisionChecksPerFrame: number;
  private readonly triggerGate = new MonotonicTriggerGate();
  private sequenceElapsed: number = SEQUENCE_DURATION;
  private mainBurstStage = 0;
  private launchSpawned = false;
  private secondarySpawned = false;
  private sequenceMobile = false;
  private sequenceOriginX = 0;
  private sequenceOriginY = 0;
  private quality: QualityLevel = 'high';

  constructor(capacity: number, textures: VisualTextureLibrary) {
    this.capacity = Math.max(120, Math.min(MAX_FIREWORK_PARTICLES, capacity));
    this.maxCollisionChecksPerFrame = this.capacity <= 300 ? 220 : 360;
    this.batches = {
      dot: this.createBatch(textures.softDot),
      streak: this.createBatch(textures.streak),
      star: this.createBatch(textures.star),
      petal: this.createBatch(textures.petal),
    };
    this.rings = [0, 1, 2].map((index) => {
      const ring = new Sprite({
        texture: textures.energyRing,
        anchor: 0.5,
      });
      ring.visible = false;
      ring.alpha = 0;
      ring.tint =
        index === 0
          ? CANDY_BLOOM.ice
          : index === 1
            ? CANDY_BLOOM.pink
            : CANDY_BLOOM.gold;
      ring.blendMode = 'add';
      return ring;
    });
    this.heroStars = [0, 1, 2, 3, 4].map((index) => {
      const star = new Sprite({ texture: textures.blossom, anchor: 0.5 });
      star.visible = false;
      star.alpha = 0;
      star.tint = [
        CANDY_BLOOM.pink,
        CANDY_BLOOM.gold,
        CANDY_BLOOM.ice,
        CANDY_BLOOM.lavender,
        CANDY_BLOOM.pink,
      ][index];
      star.blendMode = 'add';
      return star;
    });
    this.container.addChild(...this.rings, ...this.heroStars);
    this.container.addChild(
      this.batches.dot,
      this.batches.streak,
      this.batches.star,
      this.batches.petal,
    );

    const dotEnd = Math.floor(this.capacity * 0.2);
    const streakEnd = Math.floor(this.capacity * 0.34);
    const starEnd = Math.floor(this.capacity * 0.48);
    for (let index = 0; index < this.capacity; index += 1) {
      const kind: SparkKind =
        index < dotEnd
          ? 'dot'
          : index < streakEnd
            ? 'streak'
            : index < starEnd
              ? 'star'
              : 'petal';
      const scale =
        (kind === 'dot'
          ? 0.3 + Math.random() * 0.32
          : kind === 'streak'
            ? 0.36 + Math.random() * 0.24
            : kind === 'star'
              ? 0.32 + Math.random() * 0.24
              : 0.48 + Math.random() * 0.42) * CANDY_BLOOM_SCALE.firework;
      const particle = new Particle({
        texture:
          textures[
            kind === 'dot' ? 'softDot' : kind === 'star' ? 'star' : kind
          ],
        x: -100,
        y: -100,
        scaleX: scale,
        scaleY: scale,
        anchorX: 0.5,
        anchorY: 0.5,
        alpha: 0,
      });
      this.batches[kind].addParticle(particle);
      this.slots.push({
        particle,
        kind,
        active: false,
        velocityX: 0,
        velocityY: 0,
        gravity: 300,
        drag: 0.72,
        angularVelocity: 0,
        life: 0,
        maximumLife: 0,
        baseAlpha: 1,
        collisionCooldownUntil: 0,
        collisionFlash: 0,
      });
    }
    for (const batch of Object.values(this.batches)) batch.update();
  }

  setHeadCollider(collider: HeadCollider) {
    if (!collider.valid) {
      this.headCollider = null;
      this.headVelocityX = 0;
      this.headVelocityY = 0;
      return;
    }

    const previous = this.headCollider;
    if (previous) {
      const elapsedSeconds = (collider.updatedAt - previous.updatedAt) / 1000;
      if (elapsedSeconds > 0.008 && elapsedSeconds < 0.3) {
        const rawVelocityX =
          (collider.centerX - previous.centerX) / elapsedSeconds;
        const rawVelocityY =
          (collider.centerY - previous.centerY) / elapsedSeconds;
        const rawSpeed = Math.hypot(rawVelocityX, rawVelocityY);
        const velocityScale = rawSpeed > 850 ? 850 / rawSpeed : 1;
        this.headVelocityX =
          this.headVelocityX * 0.35 + rawVelocityX * velocityScale * 0.65;
        this.headVelocityY =
          this.headVelocityY * 0.35 + rawVelocityY * velocityScale * 0.65;
      }
    }
    this.headCollider = collider;
  }

  setQuality(level: QualityLevel) {
    this.quality = level;
  }

  trigger(triggerId: number, width: number, height: number) {
    if (!this.triggerGate.accept(triggerId)) return false;
    this.triggerCount += 1;
    this.sequenceElapsed = 0;
    this.mainBurstStage = 0;
    this.launchSpawned = false;
    this.secondarySpawned = false;
    this.sequenceMobile = width < 640;
    const collider = this.headCollider;
    this.sequenceOriginX = collider?.centerX ?? width * 0.5;
    this.sequenceOriginY = collider?.centerY ?? height * 0.52;
    for (const ring of this.rings) {
      ring.visible = true;
      ring.alpha = 0;
      ring.x = this.sequenceOriginX;
      ring.y = this.sequenceOriginY;
    }
    for (const star of this.heroStars) {
      star.visible = false;
      star.alpha = 0;
    }
    return true;
  }

  update(deltaSeconds: number, now: number, width: number, height: number) {
    this.updateSequence(deltaSeconds, width, height);
    const collisionStart = performance.now();
    let collisionChecks = 0;
    const collider = this.headCollider;
    const canCollide = collider !== null && now - collider.updatedAt <= 300;

    for (const slot of this.slots) {
      if (!slot.active) continue;
      slot.life -= deltaSeconds;
      if (slot.life <= 0) {
        this.release(slot);
        continue;
      }

      const drag = Math.exp(-slot.drag * deltaSeconds);
      slot.velocityX *= drag;
      slot.velocityY = slot.velocityY * drag + slot.gravity * deltaSeconds;
      const startX = slot.particle.x;
      const startY = slot.particle.y;
      const nextX = startX + slot.velocityX * deltaSeconds;
      const nextY = startY + slot.velocityY * deltaSeconds;
      const shouldCheckCollision =
        canCollide &&
        now >= slot.collisionCooldownUntil &&
        collisionChecks <
          this.maxCollisionChecksPerFrame *
            QUALITY_PROFILES[this.quality].collisionBudgetScale;

      if (shouldCheckCollision) {
        collisionChecks += 1;
        const collision = resolveMovingEllipseCollision(
          startX,
          startY,
          nextX,
          nextY,
          slot.velocityX,
          slot.velocityY,
          deltaSeconds,
          collider!,
          this.headVelocityX,
          this.headVelocityY,
          8,
        );
        if (collision) {
          slot.particle.x = collision.x;
          slot.particle.y = collision.y;
          slot.velocityX = collision.velocityX;
          slot.velocityY = collision.velocityY;
          slot.collisionCooldownUntil = now + 60;
          slot.collisionFlash = 0.09;
          slot.angularVelocity +=
            (Math.random() - 0.5) * 6 +
            Math.hypot(this.headVelocityX, this.headVelocityY) * 0.004;
          if (
            Math.hypot(this.headVelocityX, this.headVelocityY) > 260 &&
            Math.random() < 0.16
          ) {
            this.spawnSpark(
              'dot',
              collision.x,
              collision.y,
              collision.normalX * (90 + Math.random() * 80),
              collision.normalY * (90 + Math.random() * 80) - 24,
              CANDY_BLOOM.gold,
              0.42,
              80,
              1.8,
            );
          }
          this.collisions += 1;
          if (collision.penetration) this.penetrationCorrections += 1;
        } else {
          slot.particle.x = nextX;
          slot.particle.y = nextY;
        }
      } else {
        slot.particle.x = nextX;
        slot.particle.y = nextY;
      }

      if (slot.kind === 'streak') {
        slot.particle.rotation =
          Math.atan2(slot.velocityY, slot.velocityX) - Math.PI / 2;
      } else {
        slot.particle.rotation += slot.angularVelocity * deltaSeconds;
      }
      slot.collisionFlash = Math.max(0, slot.collisionFlash - deltaSeconds);
      const lifeRatio = slot.life / slot.maximumLife;
      const fadeIn = Math.min(1, (1 - lifeRatio) * 8);
      const flash = slot.collisionFlash > 0 ? 1.18 : 1;
      slot.particle.alpha =
        slot.baseAlpha * Math.min(1, lifeRatio * 1.9) * fadeIn * flash;

      if (
        slot.particle.x < -80 ||
        slot.particle.x > width + 80 ||
        slot.particle.y < -100 ||
        slot.particle.y > height + 100
      ) {
        this.release(slot);
      }
    }
    this.collisionChecks = collisionChecks;
    this.collisionMs = canCollide ? performance.now() - collisionStart : 0;
  }

  getMetrics(): FireworkMetrics {
    return {
      activeParticles: this.activeParticles,
      capacity: this.capacity,
      triggerCount: this.triggerCount,
      collisions: this.collisions,
      penetrationCorrections: this.penetrationCorrections,
      collisionChecks: this.collisionChecks,
      collisionMs: this.collisionMs,
      phase: this.getPhase(),
    };
  }

  destroy() {
    this.slots.length = 0;
  }

  private createBatch(texture: Texture) {
    return new ParticleContainer<Particle>({
      texture,
      dynamicProperties: {
        position: true,
        color: true,
        rotation: true,
        vertex: false,
        uvs: false,
      },
    });
  }

  private updateSequence(deltaSeconds: number, width: number, height: number) {
    if (this.sequenceElapsed >= SEQUENCE_DURATION) return;
    this.sequenceElapsed += deltaSeconds;
    this.updateRings();
    this.updateHeroStars(width, height);

    if (!this.launchSpawned && this.sequenceElapsed >= 0.12) {
      this.launchSpawned = true;
      this.spawnLaunchTrails(width, height);
    }

    const baseBurstCount = 3;
    const burstCount = Math.max(
      2,
      Math.round(baseBurstCount * QUALITY_PROFILES[this.quality].particleScale),
    );
    while (
      this.mainBurstStage < burstCount &&
      this.sequenceElapsed >= 0.36 + this.mainBurstStage * 0.16
    ) {
      this.spawnMainBurst(this.mainBurstStage, burstCount, width, height);
      this.mainBurstStage += 1;
    }

    if (!this.secondarySpawned && this.sequenceElapsed >= 0.88) {
      this.secondarySpawned = true;
      this.spawnSecondaryBloom(width, height);
    }

    if (this.sequenceElapsed >= SEQUENCE_DURATION) {
      for (const ring of this.rings) {
        ring.alpha = 0;
        ring.visible = false;
      }
      for (const star of this.heroStars) star.visible = false;
    }
  }

  private updateHeroStars(width: number, height: number) {
    const collider = this.headCollider;
    const centerX = collider?.centerX ?? this.sequenceOriginX;
    const centerY = collider?.centerY ?? this.sequenceOriginY;
    const radiusX = collider?.radiusX ?? Math.min(width, height) * 0.1;
    const radiusY = collider?.radiusY ?? Math.min(width, height) * 0.13;
    const baseBurstCount = 3;
    const burstCount = Math.max(
      2,
      Math.round(baseBurstCount * QUALITY_PROFILES[this.quality].particleScale),
    );
    for (let index = 0; index < this.heroStars.length; index += 1) {
      const star = this.heroStars[index];
      if (index >= burstCount) {
        star.visible = false;
        continue;
      }
      const start = 0.36 + index * 0.16;
      const progress = Math.max(
        0,
        Math.min(1, (this.sequenceElapsed - start) / 0.68),
      );
      if (progress <= 0 || progress >= 1) {
        star.visible = false;
        continue;
      }
      const normalized = index / Math.max(1, burstCount - 1) - 0.5;
      const centerLift =
        index === Math.floor(burstCount / 2) ? 0.95 : 0.34 + (index % 2) * 0.34;
      const entrance = Math.min(1, progress * 4.8);
      const eased =
        1 +
        2.70158 * Math.pow(entrance - 1, 3) +
        1.70158 * Math.pow(entrance - 1, 2);
      star.visible = true;
      star.x = Math.max(
        42,
        Math.min(
          width - 42,
          centerX + normalized * Math.max(radiusX * 3.2, width * 0.48),
        ),
      );
      star.y = Math.max(
        54,
        Math.min(height * 0.52, centerY - radiusY * (1.06 + centerLift)),
      );
      star.rotation = this.sequenceElapsed * (index % 2 ? 1.3 : -1.1);
      star.scale.set(
        (0.46 + (index === Math.floor(burstCount / 2) ? 0.18 : 0)) *
          eased *
          CANDY_BLOOM_SCALE.firework,
      );
      star.alpha = Math.sin(progress * Math.PI) * 0.94;
    }
  }

  private updateRings() {
    const collider = this.headCollider;
    const centerX = collider?.centerX ?? this.sequenceOriginX;
    const centerY = collider?.centerY ?? this.sequenceOriginY;
    const radiusX = collider?.radiusX ?? 72;
    const radiusY = collider?.radiusY ?? 94;
    for (let index = 0; index < this.rings.length; index += 1) {
      const ring = this.rings[index];
      const offset = index * 0.06;
      const progress = Math.max(
        0,
        Math.min(1, (this.sequenceElapsed - offset) / 0.42),
      );
      const pulse = Math.sin(progress * Math.PI);
      const expansion = 0.74 + progress * (0.48 + index * 0.12);
      ring.x = centerX;
      ring.y = centerY;
      ring.rotation = (collider?.rotation ?? 0) + index * 0.12;
      ring.scale.set(
        (radiusX * 2.72 * expansion * CANDY_BLOOM_SCALE.energyRing) / 128,
        (radiusY * 2.5 * expansion * CANDY_BLOOM_SCALE.energyRing) / 128,
      );
      ring.alpha = pulse * (index === 0 ? 0.82 : index === 1 ? 0.58 : 0.4);
      ring.visible = progress < 1;
    }
  }

  private spawnLaunchTrails(width: number, height: number) {
    const collider = this.headCollider;
    const centerX = collider?.centerX ?? this.sequenceOriginX;
    const centerY = collider?.centerY ?? this.sequenceOriginY;
    const radiusX = collider?.radiusX ?? Math.min(width, height) * 0.09;
    const radiusY = collider?.radiusY ?? Math.min(width, height) * 0.12;
    const launcherCount = 2;
    const particlesPerLauncher = Math.round(
      (this.sequenceMobile ? 6 : 8) *
        QUALITY_PROFILES[this.quality].emissionScale,
    );
    for (let launcher = 0; launcher < launcherCount; launcher += 1) {
      const direction =
        launcherCount === 2 ? (launcher === 0 ? -1 : 1) : launcher - 1;
      const originX = centerX + direction * radiusX * 1.22;
      const originY =
        direction === 0 ? centerY - radiusY * 1.14 : centerY + radiusY * 0.3;
      for (let index = 0; index < particlesPerLauncher; index += 1) {
        const velocityX = direction * 78 + (Math.random() - 0.5) * 38;
        const velocityY = -360 - Math.random() * 210;
        this.spawnSpark(
          'streak',
          originX + (Math.random() - 0.5) * 9,
          originY + Math.random() * 12,
          velocityX,
          velocityY,
          pickColor(LAUGH_PALETTE),
          0.44 + Math.random() * 0.24,
          90,
          0.9,
        );
      }
    }
  }

  private spawnMainBurst(
    stage: number,
    burstCount: number,
    width: number,
    height: number,
  ) {
    const collider = this.headCollider;
    const centerX = collider?.centerX ?? this.sequenceOriginX;
    const centerY = collider?.centerY ?? this.sequenceOriginY;
    const radiusX = collider?.radiusX ?? Math.min(width, height) * 0.09;
    const radiusY = collider?.radiusY ?? Math.min(width, height) * 0.12;
    const normalized = stage / Math.max(1, burstCount - 1) - 0.5;
    const burstX = Math.max(
      42,
      Math.min(
        width - 42,
        centerX + normalized * Math.max(radiusX * 3.2, width * 0.48),
      ),
    );
    const centerLift =
      stage === Math.floor(burstCount / 2) ? 0.95 : 0.34 + (stage % 2) * 0.34;
    const burstY = Math.max(
      54,
      Math.min(height * 0.52, centerY - radiusY * (1.06 + centerLift)),
    );
    const count = Math.max(
      24,
      Math.round(
        (this.sequenceMobile ? 26 : 32) *
          QUALITY_PROFILES[this.quality].particleScale,
      ),
    );
    const phase = Math.random() * Math.PI * 2;
    for (let index = 0; index < count; index += 1) {
      const angle =
        phase + (index / count) * Math.PI * 2 + (Math.random() - 0.5) * 0.1;
      const flowerShape =
        0.88 + Math.pow(Math.abs(Math.cos(angle * 5 + stage)), 1.8) * 0.34;
      const speed = (180 + Math.random() * 300) * flowerShape;
      const kind = this.pickBurstKind();
      this.spawnSpark(
        kind,
        burstX,
        burstY,
        Math.cos(angle) * speed,
        Math.sin(angle) * speed,
        pickColor(LAUGH_PALETTE),
        kind === 'petal'
          ? 1.7 + Math.random() * 0.9
          : 0.82 + Math.random() * 0.58,
        kind === 'petal' ? 115 : 275,
        kind === 'petal' ? 0.82 : 0.72,
      );
    }
    for (let index = 0; index < 3; index += 1) {
      this.spawnSpark(
        'dot',
        burstX,
        burstY,
        (Math.random() - 0.5) * 45,
        (Math.random() - 0.5) * 45,
        index === 0 ? CANDY_BLOOM.gold : CANDY_BLOOM.white,
        0.3 + index * 0.06,
        0,
        2.2,
      );
    }
    const goldDustCount = Math.round(
      9 * QUALITY_PROFILES[this.quality].dustScale,
    );
    for (let index = 0; index < goldDustCount; index += 1) {
      const dustAngle = phase + (index / goldDustCount) * Math.PI * 2;
      const dustSpeed = 70 + Math.random() * 210;
      this.spawnSpark(
        'dot',
        burstX,
        burstY,
        Math.cos(dustAngle) * dustSpeed,
        Math.sin(dustAngle) * dustSpeed,
        CANDY_BLOOM.gold,
        0.55 + Math.random() * 0.46,
        110,
        1.4,
      );
    }
  }

  private spawnSecondaryBloom(width: number, height: number) {
    const collider = this.headCollider;
    const centerX = collider?.centerX ?? this.sequenceOriginX;
    const centerY = collider?.centerY ?? this.sequenceOriginY;
    const radiusX = collider?.radiusX ?? Math.min(width, height) * 0.09;
    const radiusY = collider?.radiusY ?? Math.min(width, height) * 0.12;
    const count = Math.max(
      18,
      Math.round(
        (this.sequenceMobile ? 18 : 24) *
          QUALITY_PROFILES[this.quality].particleScale,
      ),
    );
    for (let index = 0; index < count; index += 1) {
      const side = index % 2 === 0 ? -1 : 1;
      const angle = Math.random() * Math.PI * 2;
      const speed = 95 + Math.random() * 190;
      const kind: SparkKind = Math.random() < 0.58 ? 'star' : 'petal';
      this.spawnSpark(
        kind,
        centerX + side * radiusX * (0.65 + Math.random() * 0.45),
        centerY - radiusY * (0.85 + Math.random() * 0.5),
        Math.cos(angle) * speed,
        Math.sin(angle) * speed - 30,
        Math.random() < 0.34 ? CANDY_BLOOM.gold : pickColor(LAUGH_PALETTE),
        0.74 + Math.random() * 0.52,
        kind === 'petal' ? 150 : 245,
        1.15,
      );
    }
  }

  private pickBurstKind(): SparkKind {
    const value = Math.random();
    if (value < 0.62) return 'petal';
    if (value < 0.78) return 'dot';
    if (value < 0.9) return 'streak';
    return 'star';
  }

  private spawnSpark(
    kind: SparkKind,
    x: number,
    y: number,
    velocityX: number,
    velocityY: number,
    tint: number,
    lifetime: number,
    gravity: number,
    drag: number,
  ) {
    if (this.activeParticles >= this.capacity) return;
    const slot = this.findAvailableSlot(kind);
    if (!slot) return;
    slot.active = true;
    slot.velocityX = velocityX;
    slot.velocityY = velocityY;
    slot.gravity = gravity;
    slot.drag = drag;
    slot.angularVelocity = kind === 'streak' ? 0 : (Math.random() - 0.5) * 5.5;
    slot.life = lifetime;
    slot.maximumLife = lifetime;
    slot.baseAlpha = 0.8 + Math.random() * 0.2;
    slot.collisionCooldownUntil = 0;
    slot.collisionFlash = 0;
    slot.particle.x = x;
    slot.particle.y = y;
    slot.particle.tint = tint;
    slot.particle.alpha = 0;
    slot.particle.rotation =
      kind === 'streak'
        ? Math.atan2(velocityY, velocityX) - Math.PI / 2
        : Math.random() * Math.PI * 2;
    this.activeParticles += 1;
  }

  private findAvailableSlot(kind: SparkKind) {
    for (let pass = 0; pass < 2; pass += 1) {
      for (let attempt = 0; attempt < this.capacity; attempt += 1) {
        const index = (this.nextPoolIndex + attempt) % this.capacity;
        const slot = this.slots[index];
        if (slot.active || (pass === 0 && slot.kind !== kind)) continue;
        this.nextPoolIndex = (index + 1) % this.capacity;
        return slot;
      }
    }
    return null;
  }

  private release(slot: FireworkSlot) {
    slot.active = false;
    slot.particle.alpha = 0;
    slot.particle.x = -100;
    slot.particle.y = -100;
    this.activeParticles -= 1;
  }

  private getPhase(): FireworkPhase {
    if (this.sequenceElapsed >= SEQUENCE_DURATION) return 'idle';
    if (this.sequenceElapsed < 0.16) return 'charge';
    if (this.sequenceElapsed < 0.38) return 'launch';
    if (this.sequenceElapsed < 1.42) return 'bloom';
    return 'settle';
  }
}
