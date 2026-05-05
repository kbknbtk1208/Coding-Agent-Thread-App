import { describe, expect, it } from 'vitest';
import {
  dockAnimationReducer,
  getDockAnimatedSize,
  getDockAnimationFlags,
  type DockAnimationPhase,
} from './dock-animation-state';

const metrics = {
  triggerWidth: 120,
  triggerHeight: 40,
  dockWidth: 480,
  dockHeight: 560,
};

describe('dockAnimationReducer', () => {
  describe('OPEN action', () => {
    it('collapsed → opening-width', () => {
      expect(dockAnimationReducer('collapsed', { type: 'OPEN' })).toBe('opening-width');
    });
    it('opening-width → no-op', () => {
      expect(dockAnimationReducer('opening-width', { type: 'OPEN' })).toBe('opening-width');
    });
    it('opening-height → no-op', () => {
      expect(dockAnimationReducer('opening-height', { type: 'OPEN' })).toBe('opening-height');
    });
    it('expanded → no-op', () => {
      expect(dockAnimationReducer('expanded', { type: 'OPEN' })).toBe('expanded');
    });
    it('closing-content → expanded (interrupt)', () => {
      expect(dockAnimationReducer('closing-content', { type: 'OPEN' })).toBe('expanded');
    });
    it('closing-height → opening-height (interrupt, no height jump)', () => {
      expect(dockAnimationReducer('closing-height', { type: 'OPEN' })).toBe('opening-height');
    });
    it('closing-width → opening-width (interrupt)', () => {
      expect(dockAnimationReducer('closing-width', { type: 'OPEN' })).toBe('opening-width');
    });
  });

  describe('CLOSE action', () => {
    it('collapsed → no-op', () => {
      expect(dockAnimationReducer('collapsed', { type: 'CLOSE' })).toBe('collapsed');
    });
    it('opening-width → closing-width (interrupt, no height jump)', () => {
      expect(dockAnimationReducer('opening-width', { type: 'CLOSE' })).toBe('closing-width');
    });
    it('opening-height → closing-height (interrupt)', () => {
      expect(dockAnimationReducer('opening-height', { type: 'CLOSE' })).toBe('closing-height');
    });
    it('expanded → closing-content', () => {
      expect(dockAnimationReducer('expanded', { type: 'CLOSE' })).toBe('closing-content');
    });
    it('closing-content → no-op', () => {
      expect(dockAnimationReducer('closing-content', { type: 'CLOSE' })).toBe('closing-content');
    });
    it('closing-height → no-op', () => {
      expect(dockAnimationReducer('closing-height', { type: 'CLOSE' })).toBe('closing-height');
    });
    it('closing-width → no-op', () => {
      expect(dockAnimationReducer('closing-width', { type: 'CLOSE' })).toBe('closing-width');
    });
  });

  describe('CONTENT_FADE_DONE action', () => {
    it('closing-content → closing-height', () => {
      expect(dockAnimationReducer('closing-content', { type: 'CONTENT_FADE_DONE' })).toBe(
        'closing-height',
      );
    });
    it('other phases are no-op', () => {
      const phases: DockAnimationPhase[] = [
        'collapsed',
        'opening-width',
        'opening-height',
        'expanded',
        'closing-height',
        'closing-width',
      ];
      for (const phase of phases) {
        expect(dockAnimationReducer(phase, { type: 'CONTENT_FADE_DONE' })).toBe(phase);
      }
    });
  });

  describe('SIZE_ANIMATION_DONE action', () => {
    it('opening-width → opening-height', () => {
      expect(dockAnimationReducer('opening-width', { type: 'SIZE_ANIMATION_DONE' })).toBe(
        'opening-height',
      );
    });
    it('opening-height → expanded', () => {
      expect(dockAnimationReducer('opening-height', { type: 'SIZE_ANIMATION_DONE' })).toBe(
        'expanded',
      );
    });
    it('closing-height → closing-width', () => {
      expect(dockAnimationReducer('closing-height', { type: 'SIZE_ANIMATION_DONE' })).toBe(
        'closing-width',
      );
    });
    it('closing-width → collapsed', () => {
      expect(dockAnimationReducer('closing-width', { type: 'SIZE_ANIMATION_DONE' })).toBe(
        'collapsed',
      );
    });
    it('non-target phases are no-op (stale completion guard)', () => {
      const phases: DockAnimationPhase[] = ['collapsed', 'expanded', 'closing-content'];
      for (const phase of phases) {
        expect(dockAnimationReducer(phase, { type: 'SIZE_ANIMATION_DONE' })).toBe(phase);
      }
    });
  });

  describe('full open/close cycle', () => {
    it('traverses all phases in order', () => {
      let phase: DockAnimationPhase = 'collapsed';
      phase = dockAnimationReducer(phase, { type: 'OPEN' });
      expect(phase).toBe('opening-width');
      phase = dockAnimationReducer(phase, { type: 'SIZE_ANIMATION_DONE' });
      expect(phase).toBe('opening-height');
      phase = dockAnimationReducer(phase, { type: 'SIZE_ANIMATION_DONE' });
      expect(phase).toBe('expanded');
      phase = dockAnimationReducer(phase, { type: 'CLOSE' });
      expect(phase).toBe('closing-content');
      phase = dockAnimationReducer(phase, { type: 'CONTENT_FADE_DONE' });
      expect(phase).toBe('closing-height');
      phase = dockAnimationReducer(phase, { type: 'SIZE_ANIMATION_DONE' });
      expect(phase).toBe('closing-width');
      phase = dockAnimationReducer(phase, { type: 'SIZE_ANIMATION_DONE' });
      expect(phase).toBe('collapsed');
    });
  });
});

describe('getDockAnimatedSize', () => {
  it('collapsed → triggerWidth, triggerHeight', () => {
    const size = getDockAnimatedSize('collapsed', metrics);
    expect(size.width).toBe(metrics.triggerWidth);
    expect(size.height).toBe(metrics.triggerHeight);
  });
  it('opening-width → dockWidth, triggerHeight', () => {
    const size = getDockAnimatedSize('opening-width', metrics);
    expect(size.width).toBe(metrics.dockWidth);
    expect(size.height).toBe(metrics.triggerHeight);
  });
  it('opening-height → dockWidth, dockHeight', () => {
    const size = getDockAnimatedSize('opening-height', metrics);
    expect(size.width).toBe(metrics.dockWidth);
    expect(size.height).toBe(metrics.dockHeight);
  });
  it('expanded → dockWidth, dockHeight', () => {
    const size = getDockAnimatedSize('expanded', metrics);
    expect(size.width).toBe(metrics.dockWidth);
    expect(size.height).toBe(metrics.dockHeight);
  });
  it('closing-content → dockWidth, dockHeight', () => {
    const size = getDockAnimatedSize('closing-content', metrics);
    expect(size.width).toBe(metrics.dockWidth);
    expect(size.height).toBe(metrics.dockHeight);
  });
  it('closing-height → dockWidth, triggerHeight', () => {
    const size = getDockAnimatedSize('closing-height', metrics);
    expect(size.width).toBe(metrics.dockWidth);
    expect(size.height).toBe(metrics.triggerHeight);
  });
  it('closing-width → triggerWidth, triggerHeight', () => {
    const size = getDockAnimatedSize('closing-width', metrics);
    expect(size.width).toBe(metrics.triggerWidth);
    expect(size.height).toBe(metrics.triggerHeight);
  });
});

describe('getDockAnimationFlags', () => {
  it('collapsed: isCollapsed=true, canOpen=true, contentMounted=false', () => {
    const flags = getDockAnimationFlags('collapsed');
    expect(flags.isCollapsed).toBe(true);
    expect(flags.isExpanded).toBe(false);
    expect(flags.isAnimating).toBe(false);
    expect(flags.canOpen).toBe(true);
    expect(flags.canClose).toBe(false);
    expect(flags.contentMounted).toBe(false);
    expect(flags.contentInteractive).toBe(false);
    expect(flags.contentOpacity).toBe(0);
  });
  it('expanded: isExpanded=true, canClose=true, contentInteractive=true, contentOpacity=1', () => {
    const flags = getDockAnimationFlags('expanded');
    expect(flags.isCollapsed).toBe(false);
    expect(flags.isExpanded).toBe(true);
    expect(flags.isAnimating).toBe(false);
    expect(flags.canOpen).toBe(false);
    expect(flags.canClose).toBe(true);
    expect(flags.contentMounted).toBe(true);
    expect(flags.contentInteractive).toBe(true);
    expect(flags.contentOpacity).toBe(1);
  });
  it('contentInteractive is only true for expanded', () => {
    const phases: DockAnimationPhase[] = [
      'collapsed',
      'opening-width',
      'opening-height',
      'closing-content',
      'closing-height',
      'closing-width',
    ];
    for (const phase of phases) {
      expect(getDockAnimationFlags(phase).contentInteractive).toBe(false);
    }
  });
  it('opening-width: contentMounted=false', () => {
    expect(getDockAnimationFlags('opening-width').contentMounted).toBe(false);
  });
  it('opening-height: contentMounted=true', () => {
    expect(getDockAnimationFlags('opening-height').contentMounted).toBe(true);
  });
  it('isAnimating is true for all non-stable phases', () => {
    const animatingPhases: DockAnimationPhase[] = [
      'opening-width',
      'opening-height',
      'closing-content',
      'closing-height',
      'closing-width',
    ];
    for (const phase of animatingPhases) {
      expect(getDockAnimationFlags(phase).isAnimating).toBe(true);
    }
    expect(getDockAnimationFlags('collapsed').isAnimating).toBe(false);
    expect(getDockAnimationFlags('expanded').isAnimating).toBe(false);
  });
});
