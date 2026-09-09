import type { InteractionState } from '@/interaction/expression-state-machine';
import type { TransitionRecord } from '@/interaction/use-interaction-state';
import type { EmotionBloomSystem } from './emotion-bloom/emotion-bloom-system';
import type { FireworkSystem } from './fireworks/firework-system';
import type { QualityLevel } from './spring-config';

export class EmotionStoryDirector {
  constructor(
    private readonly emotionBloom: EmotionBloomSystem,
    private readonly fireworks: FireworkSystem,
  ) {}

  setStoryState(state: InteractionState, expressionEnergy: number) {
    this.emotionBloom.setStoryState(state, expressionEnergy);
  }

  consumeTransition(
    transition: TransitionRecord,
    width: number,
    height: number,
  ) {
    if (transition.to === 'smile-entering') {
      return this.emotionBloom.triggerSmile();
    }
    if (transition.to === 'laugh-entering') {
      return this.emotionBloom.triggerCharge();
    }
    if (transition.to === 'celebrating') {
      return this.fireworks.trigger(transition.id, width, height);
    }
    if (
      ['smile-entering', 'smiling'].includes(transition.from) &&
      ['neutral', 'no-face'].includes(transition.to)
    ) {
      return this.emotionBloom.triggerDissolve();
    }
    return false;
  }

  setQuality(level: QualityLevel) {
    this.emotionBloom.setQuality(level);
    this.fireworks.setQuality(level);
  }
}
