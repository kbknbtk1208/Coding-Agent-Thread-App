import { describe, expect, it } from 'vitest';
import { createMarkdownBodyState } from './markdown-body';

describe('createMarkdownBodyState', () => {
  it('leaves short markdown bodies uncollapsed', () => {
    const state = createMarkdownBodyState('short body');

    expect(state.longBody).toBe(false);
    expect(state.preview).toBe('short body');
  });

  it('creates a bounded preview for long markdown bodies', () => {
    const body = Array.from({ length: 45 }, (_, index) => `line ${index}`).join('\n');
    const state = createMarkdownBodyState(body);

    expect(state.longBody).toBe(true);
    expect(state.preview.split('\n').length).toBeLessThanOrEqual(22);
    expect(state.preview).toContain('...');
  });
});
