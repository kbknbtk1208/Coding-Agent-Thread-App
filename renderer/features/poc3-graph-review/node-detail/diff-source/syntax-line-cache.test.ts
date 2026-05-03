import { describe, expect, it } from 'vitest';
import {
  clearSyntaxLineCache,
  getCachedSyntaxLine,
  getSyntaxLineCacheSize,
} from './syntax-line-cache';

describe('syntax-line-cache', () => {
  it('reuses cached syntax line entries for the same key', () => {
    clearSyntaxLineCache();

    const first = getCachedSyntaxLine({
      text: 'const value = 1;',
      filePath: 'src/example.ts',
      language: 'typescript',
    });
    const second = getCachedSyntaxLine({
      text: 'const value = 1;',
      filePath: 'src/example.ts',
      language: 'typescript',
    });

    expect(second).toBe(first);
    expect(getSyntaxLineCacheSize()).toBe(1);
  });

  it('does not cache empty lines', () => {
    clearSyntaxLineCache();

    expect(
      getCachedSyntaxLine({ text: '', filePath: 'src/example.ts', language: 'typescript' }),
    ).toBeNull();
    expect(getSyntaxLineCacheSize()).toBe(0);
  });
});
