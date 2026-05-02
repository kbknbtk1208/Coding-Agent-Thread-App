import { describe, expect, it } from 'vitest';
import type { NodeFunctionCode } from '../../../../shared/poc3-contracts/graph-review-ipc';
import { buildDiffAwareSourceLines } from './diff-aware-source-model';

const baseSource: NodeFunctionCode = {
  filePath: 'src/example.ts',
  language: 'ts',
  declarationRange: {
    filePath: 'src/example.ts',
    startLine: 10,
    startColumn: 1,
    endLine: 13,
    endColumn: 20,
  },
  startLine: 10,
  endLine: 13,
  highlightedLineNumbers: [],
  content: ['const a = 1;', 'const b = 2;', 'const c = 3;', 'return a + b + c;'].join('\n'),
};

describe('buildDiffAwareSourceLines', () => {
  it('returns unchanged lines when no patch is available', () => {
    const lines = buildDiffAwareSourceLines({ source: baseSource });

    expect(lines).toHaveLength(4);
    expect(lines.every((line) => line.kind === 'unchanged')).toBe(true);
    expect(lines.every((line) => !line.selectableForProviderComment)).toBe(true);
  });

  it('marks added, removed, and context lines with provider side metadata', () => {
    const lines = buildDiffAwareSourceLines({
      source: baseSource,
      diffExcerpt: {
        filePath: 'src/example.ts',
        patch: [
          '@@ -10,4 +10,4 @@',
          ' const a = 1;',
          '-const b = 1;',
          '+const b = 2;',
          ' const c = 3;',
        ].join('\n'),
        hunkHeaders: [],
        changedLineNumbers: [11],
      },
    });

    expect(lines.map((line) => line.kind)).toEqual([
      'context',
      'removed',
      'added',
      'context',
      'unchanged',
    ]);
    expect(lines[0]).toMatchObject({ side: 'RIGHT', newLineNumber: 10 });
    expect(lines[1]).toMatchObject({ side: 'LEFT', oldLineNumber: 11 });
    expect(lines[2]).toMatchObject({ side: 'RIGHT', newLineNumber: 11 });
    expect(lines[4]).toMatchObject({
      kind: 'unchanged',
      newLineNumber: 13,
      selectableForProviderComment: false,
    });
  });

  it('places removed lines before the next right-side line in the same hunk', () => {
    const lines = buildDiffAwareSourceLines({
      source: baseSource,
      diffSummary: {
        hasDiff: true,
        changedLineNumbers: [12],
        hunks: [],
        patch: [
          '@@ -11,3 +11,2 @@',
          ' const b = 2;',
          '-const removed = true;',
          ' const c = 3;',
        ].join('\n'),
      },
    });

    const removedIndex = lines.findIndex((line) => line.kind === 'removed');
    const nextContextIndex = lines.findIndex(
      (line) => line.kind === 'context' && line.newLineNumber === 12,
    );

    expect(removedIndex).toBeGreaterThan(-1);
    expect(nextContextIndex).toBeGreaterThan(-1);
    expect(removedIndex).toBeLessThan(nextContextIndex);
  });

  it('keeps delete-only hunks anchored to the nearest source line', () => {
    const lines = buildDiffAwareSourceLines({
      source: baseSource,
      diffSummary: {
        hasDiff: true,
        changedLineNumbers: [],
        hunks: [],
        patch: ['@@ -13,1 +13,0 @@', '-return removed;'].join('\n'),
      },
    });

    expect(lines.map((line) => [line.kind, line.oldLineNumber, line.newLineNumber])).toContainEqual(
      ['removed', 13, null],
    );
  });
});
