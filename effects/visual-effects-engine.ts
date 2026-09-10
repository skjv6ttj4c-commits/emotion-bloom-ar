import { Application, Ticker } from 'pixi.js';
import type { HeadCollider } from '@/face/head-collider';
import type { InteractionState } from '@/interaction/expression-state-machine';
import type { TransitionRecord } from '@/interaction/use-interaction-state';
import {
  FireworkSystem,
  type FireworkMetrics,
} from './fireworks/firework-system';
import {
  EmotionBloomSystem,
  type EmotionBloomMetrics,
} from './emotion-bloom/emotion-bloom-system';
import { PerformanceGovernor } from './performance-governor';
import { EmotionStoryDirector } from './emotion-story-director';
import type { QualityLevel } from './spring-config';
import {
  createVisualTextureLibrary,
  destroyVisualTextureLibrary,
  type VisualTextureLibrary,
} from './visual-theme';

export type VisualEffectsMetrics = {
  fps: number;
  quality: QualityLevel;
  bloom: EmotionBloomMetrics;
  fireworks: FireworkMetrics;
};

type VisualEffectsEngineOptions = {
  onMetrics?: (metrics: VisualEffectsMetrics) => void;
};

const METRICS_INTERVAL_MS = 300;

export class VisualEffectsEngine {
  private readonly app = new Application();
  private readonly host: HTMLElement;
  private readonly onMetrics?: (metrics: VisualEffectsMetrics) => void;
  private emotionBloom: EmotionBloomSystem | null = null;
  private fireworks: FireworkSystem | null = null;
  private storyDirector: EmotionStoryDirector | null = null;
  private performanceGovernor: PerformanceGovernor | null = null;
  private textures: VisualTextureLibrary | null = null;
  private currentQuality: QualityLevel = 'high';
  private lastMetricsAt = 0;
  private initialized = false;
  private disposed = false;
  private impactTimer = 0;

  constructor(host: HTMLElement, options: VisualEffectsEngineOptions = {}) {
    this.host = host;
    this.onMetrics = options.onMetrics;
  }

  async init() {
    const reducedDevice =
      window.innerWidth < 640 || (navigator.hardwareConcurrency ?? 8) <= 4;
    const reducedMotion = window.matchMedia(
      '(prefers-reduced-motion: reduce)',
    ).matches;
    await this.app.init({
      resizeTo: this.host,
      backgroundAlpha: 0,
      antialias: false,
      autoDensity: true,
      resolution: Math.min(
        window.devicePixelRatio || 1,
        reducedDevice ? 1.25 : 1.5,
      ),
      preference: 'webgl',
      powerPreference: 'high-performance',
    });
    this.initialized = true;

    if (this.disposed) {
      this.app.destroy(true, { children: true });
      return;
    }

    this.app.canvas.className = 'effects-canvas';
    this.app.canvas.setAttribute('aria-hidden', 'true');
    this.host.appendChild(this.app.canvas);
    this.performanceGovernor = new PerformanceGovernor(
      reducedDevice,
      reducedMotion,
    );
    this.currentQuality = reducedDevice || reducedMotion ? 'medium' : 'high';
    this.textures = createVisualTextureLibrary();
    this.emotionBloom = new EmotionBloomSystem(this.textures);
    this.fireworks = new FireworkSystem(
      reducedDevice ? 220 : 320,
      this.textures,
    );
    this.storyDirector = new EmotionStoryDirector(
      this.emotionBloom,
      this.fireworks,
    );
    this.storyDirector.setQuality(this.currentQuality);
    this.app.stage.addChild(
      this.emotionBloom.container,
      this.fireworks.container,
    );
    this.app.ticker.add(this.tick);
    document.addEventListener('visibilitychange', this.handleVisibilityChange);
    this.publishMetrics(performance.now());
  }

  setStoryState(state: InteractionState, energy: number) {
    this.storyDirector?.setStoryState(state, energy);
  }

  handleTransition(transition: TransitionRecord) {
    const triggered = this.storyDirector?.consumeTransition(
      transition,
      this.app.screen.width,
      this.app.screen.height,
    );
    if (triggered) {
      this.playImpact(transition.to === 'celebrating' ? 'laugh' : 'smile');
    }
    return triggered;
  }

  setHeadCollider(collider: HeadCollider) {
    this.emotionBloom?.setHeadCollider(collider);
    this.fireworks?.setHeadCollider(collider);
  }

  destroy() {
    if (this.disposed) return;
    this.disposed = true;
    window.clearTimeout(this.impactTimer);
    document.removeEventListener(
      'visibilitychange',
      this.handleVisibilityChange,
    );
    this.host.closest('.stage')?.classList.remove('visual-impact');
    if (!this.initialized) return;
    this.app.ticker.remove(this.tick);
    this.emotionBloom?.destroy();
    this.fireworks?.destroy();
    this.emotionBloom = null;
    this.fireworks = null;
    this.storyDirector = null;
    this.performanceGovernor = null;
    this.app.destroy(true, { children: true });
    if (this.textures) destroyVisualTextureLibrary(this.textures);
    this.textures = null;
  }

  private readonly tick = (ticker: Ticker) => {
    const deltaSeconds = Math.min(ticker.deltaMS, 50) / 1000;
    const now = performance.now();
    const width = this.app.screen.width;
    const height = this.app.screen.height;
    this.emotionBloom?.update(deltaSeconds, now, width, height);
    this.fireworks?.update(deltaSeconds, now, width, height);

    const nextQuality =
      this.performanceGovernor?.sample(this.app.ticker.FPS, now) ??
      this.currentQuality;
    if (nextQuality !== this.currentQuality) {
      this.currentQuality = nextQuality;
      this.storyDirector?.setQuality(nextQuality);
    }
    if (now - this.lastMetricsAt >= METRICS_INTERVAL_MS) {
      this.publishMetrics(now);
    }
  };

  private publishMetrics(now: number) {
    this.lastMetricsAt = now;
    this.onMetrics?.({
      fps: this.app.ticker.FPS,
      quality: this.currentQuality,
      bloom: this.emotionBloom?.getMetrics() ?? {
        activeElements: 0,
        capacity: 118,
        intensity: 0,
        energy: 0,
        stage: 'idle',
        dissolving: false,
      },
      fireworks: this.fireworks?.getMetrics() ?? {
        activeParticles: 0,
        capacity: 0,
        triggerCount: 0,
        collisions: 0,
        penetrationCorrections: 0,
        collisionChecks: 0,
        collisionMs: 0,
        phase: 'idle',
      },
    });
  }

  private readonly handleVisibilityChange = () => {
    if (!this.initialized || this.disposed) return;
    if (document.hidden) this.app.ticker.stop();
    else this.app.ticker.start();
  };

  private playImpact(kind: 'smile' | 'laugh') {
    const stage = this.host.closest<HTMLElement>('.stage');
    if (!stage) return;
    window.clearTimeout(this.impactTimer);
    stage.classList.remove('visual-impact');
    void stage.offsetWidth;
    stage.dataset.impact = kind;
    stage.classList.add('visual-impact');
    this.impactTimer = window.setTimeout(
      () => {
        stage.classList.remove('visual-impact');
        delete stage.dataset.impact;
      },
      kind === 'laugh' ? 900 : 650,
    );
  }
}
