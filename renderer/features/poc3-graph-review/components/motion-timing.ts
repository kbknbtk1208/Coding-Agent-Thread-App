export const POC3_MOTION_EASE = {
  standard: [0.4, 0, 0.2, 1],
  easeOut: 'easeOut',
  easeInOut: 'easeInOut',
  linear: 'linear',
} as const;

export const POC3_MOTION_DURATION = {
  menu: 0.16,
  overlay: 0.18,
  fast: 0.2,
  listItem: 0.28,
  commitGroup: 0.3,
  settingsSurface: 0.34,
  workspacePanel: 0.5,
  pulse: 1.8,
  selectedNodeSweep: 2.4,
} as const;

export const POC3_MOTION_DELAY = {
  repositoryListBase: 0.12,
  repositoryListStep: 0.04,
  workspaceItemStep: 0.075,
  commitRowStep: 0.02,
  commitGroupStep: 0.03,
  repositoryListMax: 0.4,
  workspaceItemMax: 0.3,
  commitItemMax: 0.4,
} as const;

export const POC3_MOTION_TIMEOUT_MS = {
  dialogBlurExit: 360,
  commitGraphMeasure: 200,
  repositoryProviderResolve: 650,
} as const;

export const POC3_LAYOUT_TRANSITION = {
  type: 'spring',
  bounce: 0,
  duration: POC3_MOTION_DURATION.workspacePanel,
} as const;

export function getMotionStaggerDelay(
  index: unknown,
  step: number,
  baseDelay = 0,
  maxDelay = Number.POSITIVE_INFINITY,
  reducedMotion = false,
): number {
  return resolveStaggerDelay({
    index: typeof index === 'number' ? index : 0,
    step,
    baseDelay,
    maxDelay,
    reducedMotion,
  });
}

export function resolveStaggerDelay({
  index,
  step,
  maxDelay,
  reducedMotion,
  baseDelay = 0,
}: {
  index: number;
  step: number;
  maxDelay: number;
  reducedMotion: boolean;
  baseDelay?: number;
}): number {
  if (reducedMotion) {
    return 0;
  }
  return Math.min(baseDelay + Math.max(index, 0) * step, maxDelay);
}

export function resolveMotionDuration(
  duration: number,
  reducedMotion: boolean,
  reducedDuration = 0.01,
): number {
  return reducedMotion ? reducedDuration : duration;
}
