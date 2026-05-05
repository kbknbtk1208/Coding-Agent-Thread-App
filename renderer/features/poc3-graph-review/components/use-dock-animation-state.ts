'use client';

import { useCallback, useEffect, useReducer } from 'react';
import {
  type DockAnimationFlags,
  type DockAnimationPhase,
  dockAnimationReducer,
  getDockAnimationFlags,
} from './dock-animation-state';

const CONTENT_FADE_MS = 250;

export interface UseDockAnimationStateResult {
  phase: DockAnimationPhase;
  flags: DockAnimationFlags;
  open(): void;
  close(): void;
  handleSizeAnimationComplete(): void;
}

export function useDockAnimationState(): UseDockAnimationStateResult {
  const [phase, dispatch] = useReducer(dockAnimationReducer, 'collapsed');

  useEffect(() => {
    if (phase !== 'closing-content') return;
    const timerId = window.setTimeout(() => {
      dispatch({ type: 'CONTENT_FADE_DONE' });
    }, CONTENT_FADE_MS);
    return () => window.clearTimeout(timerId);
  }, [phase]);

  const open = useCallback(() => dispatch({ type: 'OPEN' }), []);
  const close = useCallback(() => dispatch({ type: 'CLOSE' }), []);
  const handleSizeAnimationComplete = useCallback(
    () => dispatch({ type: 'SIZE_ANIMATION_DONE' }),
    [],
  );

  return {
    phase,
    flags: getDockAnimationFlags(phase),
    open,
    close,
    handleSizeAnimationComplete,
  };
}
