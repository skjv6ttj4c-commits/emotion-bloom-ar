'use client';

import { useEffect, useRef, useState } from 'react';
import {
  ExpressionStateMachine,
  type InteractionDiagnostics,
  type InteractionInput,
  type InteractionState,
  type StateTransition,
} from './expression-state-machine';

export type TransitionRecord = StateTransition & {
  id: number;
  recordedAt: number;
};

const INITIAL_DIAGNOSTICS: InteractionDiagnostics = {
  laughPath: null,
  laughSignalScore: 0,
  laughCandidateProgress: 0,
  smileCandidateProgress: 0,
  expressionEnergy: 0,
  blocker: '等待有效实时输入',
  cooldownRemainingMs: 0,
};

export function useInteractionState(liveInput: InteractionInput) {
  const [machine] = useState(() => new ExpressionStateMachine());
  const [state, setState] = useState<InteractionState>('no-face');
  const [transitions, setTransitions] = useState<TransitionRecord[]>([]);
  const [diagnostics, setDiagnostics] =
    useState<InteractionDiagnostics>(INITIAL_DIAGNOSTICS);
  const inputRef = useRef(liveInput);
  const recordIdRef = useRef(0);

  useEffect(() => {
    inputRef.current = liveInput;
  }, [liveInput]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      const input = inputRef.current;
      const now = performance.now();
      const transition = machine.update(input, now);
      const nextDiagnostics = machine.getDiagnostics(input, now);
      setDiagnostics((current) =>
        current.laughPath === nextDiagnostics.laughPath &&
        current.laughSignalScore === nextDiagnostics.laughSignalScore &&
        current.laughCandidateProgress ===
          nextDiagnostics.laughCandidateProgress &&
        current.smileCandidateProgress ===
          nextDiagnostics.smileCandidateProgress &&
        current.expressionEnergy === nextDiagnostics.expressionEnergy &&
        current.blocker === nextDiagnostics.blocker &&
        current.cooldownRemainingMs === nextDiagnostics.cooldownRemainingMs
          ? current
          : nextDiagnostics,
      );
      if (!transition) return;

      recordIdRef.current += 1;
      setState(transition.to);
      setTransitions((current) =>
        [
          { ...transition, id: recordIdRef.current, recordedAt: Date.now() },
          ...current,
        ].slice(0, 12),
      );
    }, 50);

    return () => window.clearInterval(timer);
  }, [machine]);

  return {
    state,
    transitions,
    diagnostics,
  };
}
