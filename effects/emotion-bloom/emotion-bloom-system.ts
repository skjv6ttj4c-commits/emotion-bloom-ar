import { Container, Sprite } from 'pixi.js';
import type { HeadCollider } from '@/face/head-collider';
import type { InteractionState } from '@/interaction/expression-state-machine';
import type { QualityLevel } from '../spring-config';
import {
  EMOTION_BLOOM,
  SMILE_PALETTE,
  pickColor,
  type VisualTextureLibrary,
} from '../visual-theme';

export type EmotionBloomStage =
  | 'idle'
  | 'ambient'
  | 'awakening'
  | 'smile'
  | 'charging'
  | 'afterglow';

export type EmotionBloomMetrics = {
  activeElements: number;
  capacity: number;
  intensity: number;
  energy: number;
  stage: EmotionBloomStage;
  dissolving: boolean;
};

type DigitalRainDrop = {
  sprite: Sprite;
  xRatio: number;
  yRatio: number;
  speed: number;
  sway: number;
  phase: number;
  baseScale: number;
  baseAlpha: number;
  depth: number;
  revealDelay: number;
};

const DIGITAL_RAIN_CAPACITY = 112;
const SMILE_REVEAL_DURATION = 0.9;
const DISSOLVE_DURATION = 0.85;
const clamp = (value: number) => Math.min(1, Math.max(0, value));

export class EmotionBloomSystem {
  readonly container = new Container();
  private readonly ambientLayer = new Container();
  private readonly rainBackLayer = new Container();
  private readonly rainMiddleLayer = new Container();
  private readonly rainFrontLayer = new Container();
  private readonly ambientAura: Sprite;
  private readonly auroraSweep: Sprite;
  private readonly orbiters: Sprite[] = [];
  private readonly rainDrops: DigitalRainDrop[] = [];
  private state: InteractionState = 'no-face';
  private quality: QualityLevel = 'high';
  private head: HeadCollider | null = null;
  private targetEnergy = 0;
  private energy = 0;
  private intensity = 0;
  private smileAge = SMILE_REVEAL_DURATION;
  private chargeAge = 99;
  private dissolveAge = DISSOLVE_DURATION;

  constructor(textures: VisualTextureLibrary) {
    this.container.addChild(
      this.ambientLayer,
      this.rainBackLayer,
      this.rainMiddleLayer,
      this.rainFrontLayer,
    );

    this.ambientAura = new Sprite({
      texture: textures.energyRing,
      anchor: 0.5,
    });
    this.ambientAura.tint = EMOTION_BLOOM.violet;
    this.ambientAura.blendMode = 'add';
    this.auroraSweep = new Sprite({ texture: textures.arc, anchor: 0.5 });
    this.auroraSweep.blendMode = 'add';
    this.auroraSweep.tint = EMOTION_BLOOM.cyan;
    this.ambientLayer.addChild(this.ambientAura, this.auroraSweep);

    for (let index = 0; index < 3; index += 1) {
      const orbiter = new Sprite({ texture: textures.pixelDot, anchor: 0.5 });
      orbiter.tint = [
        EMOTION_BLOOM.cyan,
        EMOTION_BLOOM.hotPink,
        EMOTION_BLOOM.violet,
      ][index];
      orbiter.blendMode = 'add';
      this.ambientLayer.addChild(orbiter);
      this.orbiters.push(orbiter);
    }

    for (let index = 0; index < DIGITAL_RAIN_CAPACITY; index += 1) {
      const depth = index % 7 < 2 ? 0 : index % 7 < 6 ? 1 : 2;
      const isDash = index % 5 === 0 || index % 11 === 0;
      const sprite = new Sprite({
        texture: isDash ? textures.pixelDash : textures.pixelDot,
        anchor: 0.5,
      });
      sprite.tint = pickColor(SMILE_PALETTE);
      sprite.blendMode = depth === 2 ? 'add' : 'normal';
      sprite.visible = false;
      const layer =
        depth === 0
          ? this.rainBackLayer
          : depth === 1
            ? this.rainMiddleLayer
            : this.rainFrontLayer;
      layer.addChild(sprite);
      this.rainDrops.push({
        sprite,
        xRatio:
          ((index * 37) % DIGITAL_RAIN_CAPACITY) / DIGITAL_RAIN_CAPACITY,
        yRatio:
          ((index * 53) % DIGITAL_RAIN_CAPACITY) / DIGITAL_RAIN_CAPACITY,
        speed: 0.075 + (index % 13) * 0.0065 + depth * 0.028,
        sway: 2 + (index % 9) * 0.8,
        phase: index * 1.731,
        baseScale:
          (isDash ? 0.27 : 0.31) + (index % 6) * 0.042 + depth * 0.052,
        baseAlpha: 0.56 + (index % 5) * 0.085 + depth * 0.045,
        depth,
        revealDelay:
          ((index * 19) % DIGITAL_RAIN_CAPACITY) / DIGITAL_RAIN_CAPACITY,
      });
    }
  }

  setStoryState(state: InteractionState, energy: number) {
    this.state = state;
    this.targetEnergy = state === 'no-face' ? 0 : clamp(energy);
  }

  setHeadCollider(collider: HeadCollider) {
    if (collider.valid) this.head = collider;
  }

  setQuality(level: QualityLevel) {
    this.quality = level;
  }

  triggerSmile() {
    this.smileAge = 0;
    this.dissolveAge = DISSOLVE_DURATION;
    return true;
  }

  triggerCharge() {
    this.chargeAge = 0;
    return true;
  }

  triggerDissolve() {
    this.dissolveAge = 0;
    return true;
  }

  update(deltaSeconds: number, now: number, width: number, height: number) {
    this.smileAge += deltaSeconds;
    this.chargeAge += deltaSeconds;
    this.dissolveAge += deltaSeconds;
    const targetIntensity = this.getTargetIntensity();
    const response = targetIntensity > this.intensity ? 0.2 : 0.58;
    this.intensity +=
      (targetIntensity - this.intensity) *
      (1 - Math.exp(-deltaSeconds / response));
    this.energy +=
      (this.targetEnergy - this.energy) * (1 - Math.exp(-deltaSeconds / 0.3));

    const head = this.getHead(width, height);
    this.updateAmbient(head, now);
    this.updateDigitalRain(deltaSeconds, now, width, height, head);
  }

  getMetrics(): EmotionBloomMetrics {
    let activeElements = 0;
    if (this.ambientAura.visible && this.ambientAura.alpha > 0.01)
      activeElements += 1;
    if (this.auroraSweep.visible && this.auroraSweep.alpha > 0.01)
      activeElements += 1;
    for (const orbiter of this.orbiters) {
      if (orbiter.visible && orbiter.alpha > 0.01) activeElements += 1;
    }
    for (const drop of this.rainDrops) {
      if (drop.sprite.visible && drop.sprite.alpha > 0.01) activeElements += 1;
    }
    return {
      activeElements,
      capacity: DIGITAL_RAIN_CAPACITY + 5,
      intensity: this.intensity,
      energy: this.energy,
      stage: this.getStage(),
      dissolving: this.dissolveAge < DISSOLVE_DURATION,
    };
  }

  destroy() {
    this.orbiters.length = 0;
    this.rainDrops.length = 0;
  }

  private getTargetIntensity() {
    if (this.state === 'no-face') return 0;
    if (this.state === 'neutral') return 0.08;
    if (this.state === 'smile-entering') return 0.56;
    if (this.state === 'smiling') return 0.62 + this.targetEnergy * 0.38;
    if (this.state === 'laugh-entering' || this.state === 'laughing') return 1;
    if (this.state === 'celebrating') return 0.58;
    return 0.28;
  }

  private updateAmbient(head: HeadCollider, now: number) {
    const ambient = this.state === 'no-face' ? 0 : 1;
    this.ambientAura.position.set(head.centerX, head.centerY);
    this.ambientAura.rotation = head.rotation + now * 0.00008;
    this.ambientAura.scale.set(
      (head.radiusX * 2.48) / 128,
      (head.radiusY * 2.28) / 128,
    );
    this.ambientAura.alpha = ambient * (0.035 + this.intensity * 0.045);
    this.ambientAura.visible = ambient > 0;

    const sweep = (now % 4000) / 4000;
    this.auroraSweep.position.set(
      head.centerX + (sweep - 0.5) * head.radiusX * 0.7,
      head.centerY - head.radiusY * 0.08,
    );
    this.auroraSweep.rotation = head.rotation - 0.28 + sweep * 0.5;
    this.auroraSweep.scale.set(
      (head.radiusX * 2.86) / 256,
      (head.radiusY * 2.34) / 256,
    );
    this.auroraSweep.alpha = ambient * 0.025;
    this.auroraSweep.visible = ambient > 0;

    for (let index = 0; index < this.orbiters.length; index += 1) {
      const orbiter = this.orbiters[index];
      const angle = now * (0.00024 + index * 0.000035) + index * 2.08;
      const point = this.localPoint(
        head,
        Math.cos(angle) * head.radiusX * 1.22,
        Math.sin(angle) * head.radiusY * 1.08,
      );
      orbiter.position.set(point.x, point.y);
      orbiter.scale.set(0.18 + index * 0.045 + this.intensity * 0.06);
      orbiter.alpha = ambient * (0.08 + this.intensity * 0.1);
      orbiter.visible = ambient > 0;
    }
  }

  private updateDigitalRain(
    deltaSeconds: number,
    now: number,
    width: number,
    height: number,
    head: HeadCollider,
  ) {
    const activeLimit =
      this.quality === 'low'
        ? 48
        : this.quality === 'medium'
          ? 76
          : 104;
    const reveal = clamp(this.smileAge / SMILE_REVEAL_DURATION);
    const isChargeState =
      this.state === 'laugh-entering' || this.state === 'laughing';
    const isCelebrating = this.state === 'celebrating';
    const charge =
      isChargeState || isCelebrating ? clamp(this.chargeAge / 0.42) : 0;
    const storyVisible = !['no-face', 'neutral'].includes(this.state);
    const dissolveFade =
      this.dissolveAge < DISSOLVE_DURATION
        ? 1 - clamp(this.dissolveAge / DISSOLVE_DURATION)
        : 1;
    const celebrationFade = isCelebrating
      ? 1 - clamp((this.chargeAge - 0.58) / 0.4)
      : 1;

    for (let index = 0; index < this.rainDrops.length; index += 1) {
      const drop = this.rainDrops[index];
      const available =
        index < activeLimit &&
        (storyVisible || this.dissolveAge < DISSOLVE_DURATION) &&
        reveal >= drop.revealDelay * 0.84;
      if (!available) {
        drop.sprite.visible = false;
        continue;
      }

      const speedScale = isChargeState ? 0.24 : isCelebrating ? 0.16 : 1;
      drop.yRatio +=
        deltaSeconds *
        drop.speed *
        speedScale *
        (0.78 + this.energy * 0.72);
      if (drop.yRatio > 1.12) {
        drop.yRatio = -0.12 - (index % 9) * 0.016;
        drop.xRatio = ((index * 31 + Math.floor(now / 1000)) % 109) / 109;
      }

      const fallX =
        drop.xRatio * width +
        Math.sin(now * 0.00075 + drop.phase) * drop.sway;
      const fallY = drop.yRatio * height;
      const x = fallX;
      const y = fallY;
      const normalizedX = (x - head.centerX) / (head.radiusX * 1.18);
      const normalizedY = (y - head.centerY) / (head.radiusY * 1.12);
      const overFace = normalizedX * normalizedX + normalizedY * normalizedY < 1;
      const depthScale =
        drop.depth === 0 ? 0.82 : drop.depth === 2 ? 1.46 : 1;
      const pulse = 0.88 + Math.sin(now * 0.003 + drop.phase) * 0.12;
      const chargeFade = 1 - charge * 0.72;

      drop.sprite.position.set(x, y);
      drop.sprite.rotation = 0;
      drop.sprite.scale.set(
        drop.baseScale * depthScale,
      );
      drop.sprite.alpha =
        drop.baseAlpha *
        this.intensity *
        pulse *
        chargeFade *
        dissolveFade *
        celebrationFade *
        (overFace ? 0.12 : 1);
      drop.sprite.visible = drop.sprite.alpha > 0.01;
    }
  }

  private getHead(width: number, height: number): HeadCollider {
    return (
      this.head ?? {
        valid: false,
        centerX: width * 0.5,
        centerY: height * 0.48,
        radiusX: Math.min(width, height) * 0.11,
        radiusY: Math.min(width, height) * 0.145,
        rotation: 0,
        updatedAt: 0,
      }
    );
  }

  private localPoint(head: HeadCollider, localX: number, localY: number) {
    const cosine = Math.cos(head.rotation);
    const sine = Math.sin(head.rotation);
    return {
      x: head.centerX + localX * cosine - localY * sine,
      y: head.centerY + localX * sine + localY * cosine,
    };
  }

  private getStage(): EmotionBloomStage {
    if (this.state === 'no-face') return 'idle';
    if (this.dissolveAge < DISSOLVE_DURATION) return 'afterglow';
    if (this.state === 'neutral') return 'ambient';
    if (this.state === 'smile-entering') return 'awakening';
    if (this.state === 'smiling') return 'smile';
    if (this.state === 'laugh-entering' || this.state === 'laughing')
      return 'charging';
    return 'afterglow';
  }
}
