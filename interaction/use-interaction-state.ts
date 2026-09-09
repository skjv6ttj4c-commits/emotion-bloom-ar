'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ExpressionStateMachine,
  type InteractionDiagnostics,
  type InteractionInput,
  type InteractionState,
  type StateTransition,
} from './expression-state-machine';

export type SimulationMode = 'live' | 'neutral' | 'smile' | 'laugh';

export type TransitionRecord = StateTransition & {
  id: number;
  recordedAt: number;
};

const simulatedInputs: Record<
  Exclude<SimulationMode, 'live'>,
  InteractionInput
> = {
  neutral: { smile: 0, jawOpen: 0, valid: true },
  smile: { smile: 0.58, jawOpen: 0.08, valid: true },
  laugh: { smile: 0.86, jawOpen: 0.72, valid: true },
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

function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)
  );
}

export function useInteractionState(liveInput: InteractionInput) {
  const [machine] = useState(() => new ExpressionStateMachine());
  const [state, setState] = useState<InteractionState>('no-face');
  const [simulationMode, setSimulationMode] = useState<SimulationMode>('live');
  const [transitions, setTransitions] = useState<TransitionRecord[]>([]);
  const [diagnostics, setDiagnostics] =
    useState<InteractionDiagnostics>(INITIAL_DIAGNOSTICS);
  const inputRef = useRef(liveInput);
  const simulationModeRef = useRef<SimulationMode>('live');
  const recordIdRef = useRef(0);

  useEffect(() => {
    inputRef.current = liveInput;
  }, [liveInput]);

  useEffect(() => {
    simulationModeRef.current = simulationMode;
  }, [simulationMode]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      const mode = simulationModeRef.current;
      const input = mode === 'live' ? inputRef.current : simulatedInputs[mode];
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

  const changeSimulationMode = useCallback(
    (mode: SimulationMode) => {
      if (simulationModeRef.current === mode) return;
      simulationModeRef.current = mode;
      machine.reset(performance.now());
      setState('no-face');
      setDiagnostics(INITIAL_DIAGNOSTICS);
      setSimulationMode(mode);
    },
    [machine],
  );

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.repeat || isEditableTarget(event.target)) return;
      const key = event.key.toLowerCase();
      if (key === 's') changeSimulationMode('smile');
      if (key === 'l') changeSimulationMode('laugh');
      if (key === 'n') changeSimulationMode('neutral');
      if (key === 'escape') changeSimulationMode('live');
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [changeSimulationMode]);

  const clearTransitions = useCallback(() => setTransitions([]), []);
  const effectiveInput =
    simulationMode === 'live' ? liveInput : simulatedInputs[simulationMode];

  return {
    state,
    simulationMode,
    setSimulationMode: changeSimulationMode,
    transitions,
    clearTransitions,
    effectiveInput,
    diagnostics,
  };
}
