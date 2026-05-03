'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export type AnimationStage =
  | 'collapsed'
  | 'widthExpanding'
  | 'heightExpanding'
  | 'fullyExpanded'
  | 'contentFadingOut'
  | 'heightCollapsing'
  | 'widthCollapsing';

export const DOCK_GLASS_STYLE = {
  borderRadius: 10,
  background: 'linear-gradient(135deg, rgba(62,62,62,0.52) 0%, rgba(30,30,30,0.44) 100%)',
  backdropFilter: 'blur(36px)',
  WebkitBackdropFilter: 'blur(36px)',
  border: '1px solid rgba(255,255,255,0.06)',
  boxShadow:
    'inset 0 1px 0 rgba(255,255,255,0.08), inset 0 -24px 48px rgba(0,0,0,0.18), 0 8px 32px rgba(0,0,0,0.36)',
};

export const DOCK_SHEEN_STYLE = {
  background:
    'linear-gradient(155deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.015) 40%, rgba(0,0,0,0.1) 100%)',
};

export function useDockAnimationStage() {
  const [stage, setStage] = useState<AnimationStage>('collapsed');
  const timersRef = useRef<number[]>([]);

  const clearTimers = useCallback(() => {
    timersRef.current.forEach(window.clearTimeout);
    timersRef.current = [];
  }, []);

  const expand = useCallback(() => {
    clearTimers();
    setStage('widthExpanding');
    timersRef.current.push(window.setTimeout(() => setStage('heightExpanding'), 400));
    timersRef.current.push(window.setTimeout(() => setStage('fullyExpanded'), 850));
  }, [clearTimers]);

  const collapse = useCallback(() => {
    clearTimers();
    setStage('contentFadingOut');
    timersRef.current.push(window.setTimeout(() => setStage('heightCollapsing'), 250));
    timersRef.current.push(window.setTimeout(() => setStage('widthCollapsing'), 650));
    timersRef.current.push(window.setTimeout(() => setStage('collapsed'), 1050));
  }, [clearTimers]);

  useEffect(() => clearTimers, [clearTimers]);

  return {
    stage,
    isCollapsed: stage === 'collapsed',
    isExpanded: stage === 'fullyExpanded',
    expand,
    collapse,
  };
}
