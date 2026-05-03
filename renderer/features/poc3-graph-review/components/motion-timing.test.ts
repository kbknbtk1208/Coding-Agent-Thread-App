import { describe, expect, it } from 'vitest';
import {
  POC3_LAYOUT_TRANSITION,
  POC3_MOTION_DELAY,
  POC3_MOTION_DURATION,
  POC3_MOTION_EASE,
  POC3_MOTION_TIMEOUT_MS,
  getMotionStaggerDelay,
} from './motion-timing';

describe('poc3 motion timing', () => {
  it('keeps shared timing tokens stable', () => {
    expect(POC3_MOTION_EASE.standard).toEqual([0.4, 0, 0.2, 1]);
    expect(POC3_MOTION_DURATION.workspacePanel).toBe(0.5);
    expect(POC3_MOTION_DELAY.repositoryListBase).toBe(0.12);
    expect(POC3_MOTION_TIMEOUT_MS.repositoryProviderResolve).toBe(650);
  });

  it('builds stagger delays from optional numeric indices', () => {
    expect(getMotionStaggerDelay(3, 0.04, 0.33)).toBeCloseTo(0.45);
    expect(getMotionStaggerDelay(0, 0.075)).toBe(0);
    expect(getMotionStaggerDelay(-1, 0.075)).toBe(0);
    expect(getMotionStaggerDelay('2', 0.075, 0.1)).toBe(0.1);
    expect(getMotionStaggerDelay(100, 0.075, 0, 0.3)).toBe(0.3);
    expect(getMotionStaggerDelay(3, 0.075, 0, 0.3, true)).toBe(0);
  });

  it('exposes the default PoC3 layout spring transition', () => {
    expect(POC3_LAYOUT_TRANSITION).toEqual({
      type: 'spring',
      bounce: 0,
      duration: POC3_MOTION_DURATION.workspacePanel,
    });
  });
});
