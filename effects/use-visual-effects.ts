'use client';

import { useEffect, useRef, useState } from 'react';
import type { HeadCollider } from '@/face/head-collider';
import type { InteractionState } from '@/interaction/expression-state-machine';
import type { TransitionRecord } from '@/interaction/use-interaction-state';
import type { HandActionTrigger } from '@/hand/use-hand-actions';
import type {
  VisualEffectsEngine as VisualEffectsEngineType,
  VisualEffectsMetrics,
} from './visual-effects-engine';

export type VisualEffectsStatus = 'loading' | 'ready' | 'error';

const INITIAL_METRICS: VisualEffectsMetrics = {
  fps: 0,
  quality: 'high',
  bloom: {
    activeElements: 0,
    capacity: 117,
    intensity: 0,
    energy: 0,
    stage: 'idle',
    dissolving: false,
  },
  fireworks: {
    activeParticles: 0,
    capacity: 0,
    triggerCount: 0,
    collisions: 0,
    penetrationCorrections: 0,
    collisionChecks: 0,
    collisionMs: 0,
    phase: 'idle',
  },
  heart: { phase: 'idle', activeHearts: 0, capacity: 33, triggerCount: 0 },
};

export function useVisualEffects(
  state: InteractionState,
  expressionEnergy: number,
  latestTransition: TransitionRecord | undefined,
  headCollider: HeadCollider,
  latestHandTrigger: HandActionTrigger | null,
) {
  const hostRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<VisualEffectsEngineType | null>(null);
  const storyRef = useRef({ state, expressionEnergy });
  const colliderRef = useRef(headCollider);
  const readyRef = useRef(false);
  const lastTransitionIdRef = useRef(0);
  const pendingTransitionsRef = useRef<TransitionRecord[]>([]);
  const lastHandTriggerIdRef = useRef(0);
  const pendingHandTriggersRef = useRef<HandActionTrigger[]>([]);
  const [status, setStatus] = useState<VisualEffectsStatus>('loading');
  const [metrics, setMetrics] = useState<VisualEffectsMetrics>(INITIAL_METRICS);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    storyRef.current = { state, expressionEnergy };
    engineRef.current?.setStoryState(state, expressionEnergy);
  }, [expressionEnergy, state]);

  useEffect(() => {
    if (!latestTransition || latestTransition.id <= lastTransitionIdRef.current)
      return;
    lastTransitionIdRef.current = latestTransition.id;
    if (readyRef.current) engineRef.current?.handleTransition(latestTransition);
    else pendingTransitionsRef.current.push(latestTransition);
  }, [latestTransition]);

  useEffect(() => {
    if (
      !latestHandTrigger ||
      latestHandTrigger.id <= lastHandTriggerIdRef.current
    )
      return;
    lastHandTriggerIdRef.current = latestHandTrigger.id;
    if (readyRef.current)
      engineRef.current?.handleHandAction(latestHandTrigger);
    else pendingHandTriggersRef.current.push(latestHandTrigger);
  }, [latestHandTrigger]);

  useEffect(() => {
    colliderRef.current = headCollider;
    engineRef.current?.setHeadCollider(headCollider);
  }, [headCollider]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let cancelled = false;
    let engine: VisualEffectsEngineType | null = null;

    void import('./visual-effects-engine')
      .then(async ({ VisualEffectsEngine }) => {
        if (cancelled) return;
        engine = new VisualEffectsEngine(host, { onMetrics: setMetrics });
        engineRef.current = engine;
        await engine.init();
        if (cancelled) return;
        engine.setStoryState(
          storyRef.current.state,
          storyRef.current.expressionEnergy,
        );
        engine.setHeadCollider(colliderRef.current);
        readyRef.current = true;
        for (const transition of pendingTransitionsRef.current) {
          engine.handleTransition(transition);
        }
        pendingTransitionsRef.current = [];
        for (const handTrigger of pendingHandTriggersRef.current) {
          engine.handleHandAction(handTrigger);
        }
        pendingHandTriggersRef.current = [];
        setStatus('ready');
      })
      .catch((reason: unknown) => {
        if (cancelled) return;
        engine?.destroy();
        engineRef.current = null;
        setStatus('error');
        setError(
          reason instanceof Error
            ? reason.message
            : 'PixiJS 视觉效果引擎初始化失败。',
        );
      });

    return () => {
      cancelled = true;
      readyRef.current = false;
      engineRef.current = null;
      engine?.destroy();
    };
  }, []);

  return { hostRef, status, metrics, error };
}
