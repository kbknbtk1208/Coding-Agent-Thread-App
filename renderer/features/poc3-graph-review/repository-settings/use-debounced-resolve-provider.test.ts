import { describe, expect, it } from 'vitest';
import { resolveProviderOriginForDebounce } from './use-debounced-resolve-provider';

describe('resolveProviderOriginForDebounce', () => {
  it('does not resolve empty origins', () => {
    expect(resolveProviderOriginForDebounce({ originUrl: '   ', isEditing: true })).toBeNull();
  });

  it('does not resolve when the draft is not editing', () => {
    expect(
      resolveProviderOriginForDebounce({
        originUrl: 'https://github.com/acme/project',
        isEditing: false,
      }),
    ).toBeNull();
  });

  it('trims the origin captured by the debounce hook', () => {
    expect(
      resolveProviderOriginForDebounce({
        originUrl: ' https://github.com/acme/project ',
        isEditing: true,
      }),
    ).toBe('https://github.com/acme/project');
  });
});
