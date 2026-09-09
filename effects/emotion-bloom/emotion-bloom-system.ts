import { Container, Sprite } from 'pixi.js';
import type { HeadCollider } from '@/face/head-collider';
import type { InteractionState } from '@/interaction/expression-state-machine';
import type { QualityLevel } from '../spring-config';
import { EMOTION_BLOOM, type VisualTextureLibrary } from '../visual-theme';

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

type DissolvePetal = {
  sprite: Sprite;
  velocityX: number;
  velocityY: number;
  spin: number;
  delay: number;
};

const SMILE_DURATION = 1.2;
const DISSOLVE_DURATION = 0.85;
const clamp = (value: number) => Math.min(1, Math.max(0, value));

export class EmotionBloomSystem {
  readonly container = new Container();
  private readonly ambientLayer = new Container();
  private readonly smileBackLayer = new Container();
  private readonly smileFrontLayer = new Container();
  private readonly dissolveLayer = new Container();
  private readonly ambientAura: Sprite;
  private readonly auroraSweep: Sprite;
  private readonly smileArc: Sprite;
  private readonly cornerStars: Sprite[] = [];
  private readonly cheekThreads: Sprite[] = [];
  private readonly smilePetals: Sprite[] = [];
  private readonly orbiters: Sprite[] = [];
  private readonly dissolvePetals: DissolvePetal[] = [];
  private state: InteractionState = 'no-face';
  private quality: QualityLevel = 'high';
  private head: HeadCollider | null = null;
  private targetEnergy = 0;
  private energy = 0;
  private intensity = 0;
  private smileAge = SMILE_DURATION;
  private chargeAge = 99;
  private dissolveAge = DISSOLVE_DURATION;

  constructor(textures: VisualTextureLibrary) {
    this.container.addChild(
      this.ambientLayer,
      this.smileBackLayer,
      this.smileFrontLayer,
      this.dissolveLayer,
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
      const orbiter = new Sprite({ texture: textures.softDot, anchor: 0.5 });
      orbiter.tint = [
        EMOTION_BLOOM.cyan,
        EMOTION_BLOOM.hotPink,
        EMOTION_BLOOM.violet,
      ][index];
      orbiter.blendMode = 'add';
      this.ambientLayer.addChild(orbiter);
      this.orbiters.push(orbiter);
    }

    this.smileArc = new Sprite({ texture: textures.arc, anchor: 0.5 });
    this.smileArc.blendMode = 'add';
    this.smileBackLayer.addChild(this.smileArc);

    for (let index = 0; index < 2; index += 1) {
      const thread = new Sprite({ texture: textures.streak, anchor: 0.5 });
      thread.tint = index === 0 ? EMOTION_BLOOM.cyan : EMOTION_BLOOM.hotPink;
      thread.blendMode = 'add';
      this.smileBackLayer.addChild(thread);
      this.cheekThreads.push(thread);

      const star = new Sprite({ texture: textures.star, anchor: 0.5 });
      star.tint = index === 0 ? EMOTION_BLOOM.hotPink : EMOTION_BLOOM.cyan;
      star.blendMode = 'add';
      this.smileFrontLayer.addChild(star);
      this.cornerStars.push(star);
    }

    for (let index = 0; index < 10; index += 1) {
      const petal = new Sprite({ texture: textures.petal, anchor: 0.5 });
      petal.tint = [
        EMOTION_BLOOM.cyan,
        EMOTION_BLOOM.hotPink,
        EMOTION_BLOOM.violet,
        EMOTION_BLOOM.glass,
      ][index % 4];
      petal.blendMode = index % 3 === 0 ? 'add' : 'normal';
      this.smileFrontLayer.addChild(petal);
      this.smilePetals.push(petal);
    }

    for (let index = 0; index < 16; index += 1) {
      const sprite = new Sprite({ texture: textures.petal, anchor: 0.5 });
      sprite.tint = [
        EMOTION_BLOOM.cyan,
        EMOTION_BLOOM.hotPink,
        EMOTION_BLOOM.violet,
      ][index % 3];
      sprite.visible = false;
      this.dissolveLayer.addChild(sprite);
      this.dissolvePetals.push({
        sprite,
        velocityX: 0,
        velocityY: 0,
        spin: 0,
        delay: 0,
      });
    }
  }

  setStoryState(state: InteractionState, energy: number) {
    this.state = state;
    this.targetEnergy = state === 'no-face' ? 0 : clamp(energy);
  }

  setHeadCollider(collider: HeadCollider) {
    // Keep the last stable pose briefly so a smile can dissolve from the same
    // facial position when tracking drops on the transition frame.
    if (collider.valid) this.head = collider;
  }

  setQuality(level: QualityLevel) {
    this.quality = level;
  }

  triggerSmile() {
    this.smileAge = 0;
    this.dissolveAge = DISSOLVE_DURATION;
    this.hideDissolve();
    return true;
  }

  triggerCharge() {
    this.chargeAge = 0;
    return true;
  }

  triggerDissolve() {
    this.dissolveAge = 0;
    const head = this.getHead(1, 1);
    for (let index = 0; index < this.dissolvePetals.length; index += 1) {
      const item = this.dissolvePetals[index];
      const side = index % 2 === 0 ? -1 : 1;
      const row = Math.floor(index / 2) % 5;
      const point = this.localPoint(
        head,
        side * head.radiusX * (0.52 + row * 0.07),
        -head.radiusY * (0.18 + row * 0.12),
      );
      item.sprite.position.set(point.x, point.y);
      item.sprite.scale.set(0.34 + (index % 4) * 0.08);
      item.sprite.rotation = head.rotation + side * 0.5;
      item.sprite.alpha = 0;
      item.sprite.visible = true;
      item.velocityX = side * (22 + Math.random() * 28);
      item.velocityY = -18 - Math.random() * 28;
      item.spin = side * (0.55 + Math.random() * 1.2);
      item.delay = (index % 6) * 0.035;
    }
    return true;
  }

  update(deltaSeconds: number, now: number, width: number, height: number) {
    this.smileAge += deltaSeconds;
    this.chargeAge += deltaSeconds;
    this.dissolveAge += deltaSeconds;
    const targetIntensity = this.getTargetIntensity();
    const response = targetIntensity > this.intensity ? 0.18 : 0.48;
    this.intensity +=
      (targetIntensity - this.intensity) *
      (1 - Math.exp(-deltaSeconds / response));
    this.energy +=
      (this.targetEnergy - this.energy) * (1 - Math.exp(-deltaSeconds / 0.3));

    const head = this.getHead(width, height);
    this.updateAmbient(head, now);
    this.updateSmile(head, now);
    this.updateDissolve(deltaSeconds);
  }

  getMetrics(): EmotionBloomMetrics {
    let activeElements = 0;
    for (const child of [
      this.ambientAura,
      this.auroraSweep,
      this.smileArc,
      ...this.orbiters,
      ...this.cornerStars,
      ...this.cheekThreads,
      ...this.smilePetals,
      ...this.dissolvePetals.map((item) => item.sprite),
    ]) {
      if (child.visible && child.alpha > 0.01) activeElements += 1;
    }
    return {
      activeElements,
      capacity: 36,
      intensity: this.intensity,
      energy: this.energy,
      stage: this.getStage(),
      dissolving: this.dissolveAge < DISSOLVE_DURATION,
    };
  }

  destroy() {
    this.cornerStars.length = 0;
    this.cheekThreads.length = 0;
    this.smilePetals.length = 0;
    this.orbiters.length = 0;
    this.dissolvePetals.length = 0;
  }

  private getTargetIntensity() {
    if (this.state === 'no-face') return 0;
    if (this.state === 'neutral') return 0.12;
    if (this.state === 'smile-entering') return 0.72;
    if (this.state === 'smiling') return 0.78 + this.targetEnergy * 0.22;
    if (this.state === 'laugh-entering' || this.state === 'laughing') return 1;
    if (this.state === 'celebrating') return 0.92;
    return 0.38;
  }

  private updateAmbient(head: HeadCollider, now: number) {
    const ambient = this.state === 'no-face' ? 0 : 1;
    const smileLift = this.intensity * 0.08;
    this.ambientAura.position.set(head.centerX, head.centerY);
    this.ambientAura.rotation = head.rotation + now * 0.00008;
    this.ambientAura.scale.set(
      (head.radiusX * 2.48) / 128,
      (head.radiusY * 2.28) / 128,
    );
    this.ambientAura.alpha = ambient * (0.055 + smileLift);
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
    this.auroraSweep.alpha =
      ambient * (0.028 + Math.sin(sweep * Math.PI) * 0.055);
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
      orbiter.scale.set(0.24 + index * 0.07 + this.intensity * 0.08);
      orbiter.alpha = ambient * (0.11 + this.intensity * 0.15);
      orbiter.visible = ambient > 0;
    }
  }

  private updateSmile(head: HeadCollider, now: number) {
    const smileVisible = this.intensity > 0.16;
    const timeline = clamp(this.smileAge / SMILE_DURATION);
    const charging =
      this.state === 'laugh-entering' || this.state === 'laughing';
    const charge = charging ? clamp(this.chargeAge / 0.38) : 0;
    const mouthY = head.radiusY * 0.36;
    const mouthOffset = head.radiusX * 0.34;

    for (let index = 0; index < 2; index += 1) {
      const side = index === 0 ? -1 : 1;
      const mouth = this.localPoint(head, side * mouthOffset, mouthY);
      const eye = this.localPoint(
        head,
        side * head.radiusX * 0.58,
        -head.radiusY * 0.22,
      );
      const star = this.cornerStars[index];
      const starPulse =
        this.smileAge < 0.3
          ? Math.sin(clamp(this.smileAge / 0.3) * Math.PI)
          : 0.18 + Math.sin(now * 0.003 + index * 1.8) * 0.06;
      star.position.set(mouth.x, mouth.y);
      star.rotation = now * 0.0015 * side;
      star.scale.set((0.5 + charge * 0.3) * starPulse);
      star.alpha = smileVisible ? starPulse * this.intensity : 0;
      star.visible = smileVisible;

      const thread = this.cheekThreads[index];
      const threadReveal = clamp((timeline - 0.125) / 0.21);
      const dx = eye.x - mouth.x;
      const dy = eye.y - mouth.y;
      thread.position.set(mouth.x + dx * 0.5, mouth.y + dy * 0.5);
      thread.rotation = Math.atan2(dy, dx) + Math.PI / 2;
      thread.scale.set(0.52, (Math.hypot(dx, dy) / 42) * threadReveal);
      thread.alpha = smileVisible ? threadReveal * this.intensity * 0.68 : 0;
      thread.visible = smileVisible;
    }

    const activePetals =
      this.quality === 'low' ? 6 : this.quality === 'medium' ? 8 : 10;
    const petalReveal = clamp((timeline - 0.33) / 0.34);
    for (let index = 0; index < this.smilePetals.length; index += 1) {
      const petal = this.smilePetals[index];
      if (index >= activePetals || !smileVisible) {
        petal.visible = false;
        continue;
      }
      const side = index % 2 === 0 ? -1 : 1;
      const row = Math.floor(index / 2);
      const spread = 1 + charge * (0.34 + row * 0.035);
      const point = this.localPoint(
        head,
        side * head.radiusX * (0.62 + row * 0.095) * spread,
        -head.radiusY * (0.18 + row * 0.13) * spread,
      );
      const breathe = 1 + Math.sin(now * 0.0024 + index * 0.72) * 0.09;
      petal.position.set(point.x, point.y);
      petal.rotation =
        head.rotation + side * (0.52 + row * 0.12) + now * 0.00016 * side;
      petal.scale.set((0.31 + row * 0.055) * breathe * petalReveal);
      petal.alpha = petalReveal * this.intensity * (0.62 + (index % 3) * 0.11);
      petal.visible = true;
    }

    const arcReveal = clamp((timeline - 0.66) / 0.34);
    this.smileArc.position.set(
      head.centerX,
      head.centerY - head.radiusY * 0.04,
    );
    this.smileArc.rotation = head.rotation - 0.28 - charge * 0.1;
    this.smileArc.scale.set(
      (head.radiusX * (2.55 + charge * 0.58)) / 256,
      (head.radiusY * (2.22 + charge * 0.44)) / 256,
    );
    this.smileArc.alpha = smileVisible ? arcReveal * this.intensity * 0.72 : 0;
    this.smileArc.visible = smileVisible;
  }

  private updateDissolve(deltaSeconds: number) {
    if (this.dissolveAge >= DISSOLVE_DURATION) {
      this.hideDissolve();
      return;
    }
    for (const item of this.dissolvePetals) {
      const progress = clamp(
        (this.dissolveAge - item.delay) /
          Math.max(0.1, DISSOLVE_DURATION - item.delay),
      );
      item.sprite.x += item.velocityX * deltaSeconds;
      item.sprite.y += item.velocityY * deltaSeconds;
      item.velocityY += 28 * deltaSeconds;
      item.sprite.rotation += item.spin * deltaSeconds;
      item.sprite.alpha = Math.sin(progress * Math.PI) * 0.64;
      item.sprite.visible = progress < 1;
    }
  }

  private hideDissolve() {
    for (const item of this.dissolvePetals) item.sprite.visible = false;
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
