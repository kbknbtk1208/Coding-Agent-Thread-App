import { describe, expect, it } from 'vitest';
import { parseUnifiedDiffHunks } from './unified-diff-parser';

describe('parseUnifiedDiffHunks', () => {
  it('hunk header に trailing text ではなく @@ ヘッダ全文を保存する', () => {
    const patch = [
      '@@ -10,3 +10,4 @@ export function example() {',
      ' const value = 1;',
      '+const next = 2;',
      ' return value;',
      ' }',
    ].join('\n');

    const hunks = parseUnifiedDiffHunks('src/example.ts', patch);

    expect(hunks).toHaveLength(1);
    expect(hunks[0]?.header).toBe('@@ -10,3 +10,4 @@ export function example() {');
    expect(hunks[0]?.changedNewLines).toEqual([11]);
  });
});
