export type DockAnimationPhase =
  | 'collapsed'
  | 'opening-width'
  | 'opening-height'
  | 'expanded'
  | 'closing-content'
  | 'closing-height'
  | 'closing-width';

export type DockAnimationAction =
  | { type: 'OPEN' }
  | { type: 'CLOSE' }
  | { type: 'CONTENT_FADE_DONE' }
  | { type: 'SIZE_ANIMATION_DONE' };

export interface DockAnimationMetrics {
  triggerWidth: number | string;
  triggerHeight: number | string;
  dockWidth: number | string;
  dockHeight: number | string;
}

export interface DockAnimatedSize {
  width: number | string;
  height: number | string;
}

export interface DockAnimationFlags {
  isCollapsed: boolean;
  isExpanded: boolean;
  isAnimating: boolean;
  canOpen: boolean;
  canClose: boolean;
  contentMounted: boolean;
  contentInteractive: boolean;
  contentOpacity: number;
}

export function dockAnimationReducer(
  phase: DockAnimationPhase,
  action: DockAnimationAction,
): DockAnimationPhase {
  switch (action.type) {
    case 'OPEN':
      if (phase === 'collapsed') return 'opening-width';
      if (phase === 'closing-content') return 'expanded';
      if (phase === 'closing-height') return 'opening-height';
      if (phase === 'closing-width') return 'opening-width';
      return phase;
    case 'CLOSE':
      if (phase === 'expanded') return 'closing-content';
      if (phase === 'opening-width') return 'closing-width';
      if (phase === 'opening-height') return 'closing-height';
      return phase;
    case 'CONTENT_FADE_DONE':
      if (phase === 'closing-content') return 'closing-height';
      return phase;
    case 'SIZE_ANIMATION_DONE':
      if (phase === 'opening-width') return 'opening-height';
      if (phase === 'opening-height') return 'expanded';
      if (phase === 'closing-height') return 'closing-width';
      if (phase === 'closing-width') return 'collapsed';
      return phase;
  }
}

export function getDockAnimatedSize(
  phase: DockAnimationPhase,
  metrics: DockAnimationMetrics,
): DockAnimatedSize {
  const width =
    phase === 'collapsed' || phase === 'closing-width' ? metrics.triggerWidth : metrics.dockWidth;

  const height =
    phase === 'collapsed' ||
    phase === 'opening-width' ||
    phase === 'closing-width' ||
    phase === 'closing-height'
      ? metrics.triggerHeight
      : metrics.dockHeight;

  return { width, height };
}

export function getDockAnimationFlags(phase: DockAnimationPhase): DockAnimationFlags {
  return {
    isCollapsed: phase === 'collapsed',
    isExpanded: phase === 'expanded',
    isAnimating: phase !== 'collapsed' && phase !== 'expanded',
    canOpen: phase === 'collapsed',
    canClose: phase === 'expanded',
    contentMounted: phase !== 'collapsed' && phase !== 'opening-width',
    contentInteractive: phase === 'expanded',
    contentOpacity: phase === 'expanded' ? 1 : 0,
  };
}
