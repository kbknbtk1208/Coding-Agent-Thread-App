import { describe, expect, it } from 'vitest';
import {
  buildDiffFileTreeFromSummaries,
  collectDefaultExpanded,
  flattenDiffFileTree,
} from './build-diff-file-tree';

describe('flattenDiffFileTree', () => {
  const tree = buildDiffFileTreeFromSummaries([
    {
      filePath: 'src/a/aa.ts',
      isDiffFile: true,
      nodeCount: 1,
      diffNodeCount: 1,
      findingCount: 1,
      remoteThreadCount: 0,
    },
    {
      filePath: 'src/a/ab.ts',
      isDiffFile: true,
      nodeCount: 1,
      diffNodeCount: 1,
      findingCount: 0,
      remoteThreadCount: 2,
    },
    {
      filePath: 'src/b/bb.ts',
      isDiffFile: true,
      nodeCount: 1,
      diffNodeCount: 1,
      findingCount: 1,
      remoteThreadCount: 1,
    },
  ]);

  it('returns only top-level rows when no directories are expanded', () => {
    const rows = flattenDiffFileTree(tree, new Set());
    expect(rows.map((row) => row.item.id)).toEqual(['src']);
    expect(rows[0].hasChildren).toBe(true);
    expect(rows[0].level).toBe(0);
  });

  it('expands children of explicitly expanded directories', () => {
    const expanded = new Set(collectDefaultExpanded(tree));
    const rows = flattenDiffFileTree(tree, expanded);
    expect(rows.map((row) => row.item.id)).toEqual([
      'src',
      'src/a',
      'src/a/aa.ts',
      'src/a/ab.ts',
      'src/b',
      'src/b/bb.ts',
    ]);
    expect(rows.map((row) => row.level)).toEqual([0, 1, 2, 2, 1, 2]);
    expect(rows.map((row) => row.hasChildren)).toEqual([true, true, false, false, true, false]);
  });

  it('skips children whose parent dir is collapsed', () => {
    const expanded = new Set(['src', 'src/b']);
    const rows = flattenDiffFileTree(tree, expanded);
    expect(rows.map((row) => row.item.id)).toEqual(['src', 'src/a', 'src/b', 'src/b/bb.ts']);
  });
});
