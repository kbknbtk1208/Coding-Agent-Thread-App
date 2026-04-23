import { describe, expect, it } from 'vitest';
import type { ReviewSourceSnapshot } from '../../../shared/poc3-domain/source-snapshot';
import type { DependencyExtractionResult } from './dependency-extractor';
import { buildInitialGraph } from './graph-builder';

function createSourceSnapshot(): ReviewSourceSnapshot {
  return {
    sourceSnapshotId: 'source-1',
    revisionId: 'revision-1',
    provider: 'github',
    reviewId: '123',
    title: 'Review workspace',
    description: 'description',
    baseSha: 'a'.repeat(40),
    headSha: 'b'.repeat(40),
    startSha: null,
    diffVersion: null,
    changedFiles: [
      {
        path: 'src/App.tsx',
        oldPath: null,
        status: 'modified',
        additions: 4,
        deletions: 0,
        patch: '@@ -1,2 +1,4 @@',
        hunks: [
          {
            filePath: 'src/App.tsx',
            oldStart: 1,
            oldLines: 2,
            newStart: 1,
            newLines: 4,
            header: '@@ -1,2 +1,4 @@',
            changedNewLines: [1, 2, 3, 4],
            changedOldLines: [1, 2],
          },
        ],
      },
    ],
    remoteThreadsSummary: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

function createExtraction(): DependencyExtractionResult {
  return {
    symbols: [
      {
        key: 'src/App.tsx:App:10',
        name: 'App',
        kind: 'component',
        filePath: 'src/App.tsx',
        range: {
          filePath: 'src/App.tsx',
          startLine: 10,
          startColumn: 1,
          endLine: 30,
          endColumn: 1,
        },
        isDiffNode: true,
        changedLines: 4,
      },
      {
        key: 'src/useThing.ts:useThing:5',
        name: 'useThing',
        kind: 'hook',
        filePath: 'src/useThing.ts',
        range: {
          filePath: 'src/useThing.ts',
          startLine: 5,
          startColumn: 1,
          endLine: 20,
          endColumn: 1,
        },
        isDiffNode: false,
        changedLines: 0,
      },
    ],
    calls: [
      {
        sourceKey: 'src/App.tsx:App:10',
        targetKey: 'src/useThing.ts:useThing:5',
        confidence: 'high',
      },
    ],
    imports: [
      {
        sourceFilePath: 'src/App.tsx',
        targetModule: 'react',
        targetFilePath: null,
        confidence: 'high',
      },
      {
        sourceFilePath: 'src/App.tsx',
        targetModule: 'motion/react',
        targetFilePath: null,
        confidence: 'high',
      },
      {
        sourceFilePath: 'src/App.tsx',
        targetModule: './useThing',
        targetFilePath: 'src/useThing.ts',
        confidence: 'medium',
      },
    ],
    diagnostics: [],
  };
}

describe('buildInitialGraph', () => {
  it('外部ライブラリ由来の import node を含めず local import の 1-hop を維持する', () => {
    const graph = buildInitialGraph({
      revisionId: 'revision-1',
      sourceSnapshot: createSourceSnapshot(),
      extraction: createExtraction(),
      diagnostics: [],
    });

    expect(graph.nodes.map((node) => node.label)).toEqual([
      'App.tsx',
      'useThing.ts',
      'App',
      'useThing',
    ]);
    expect(graph.nodes.some((node) => node.kind === 'external')).toBe(false);
    expect(
      graph.edges.map((edge) => edge.kind).sort((left, right) => left.localeCompare(right)),
    ).toEqual(['calls', 'imports']);
  });

  it('import 行だけ変更された diff でも local module の依存グラフが孤立しない', () => {
    const graph = buildInitialGraph({
      revisionId: 'revision-1',
      sourceSnapshot: createSourceSnapshot(),
      extraction: {
        symbols: [],
        calls: [],
        imports: [
          {
            sourceFilePath: 'src/App.tsx',
            targetModule: 'react',
            targetFilePath: null,
            confidence: 'high',
          },
          {
            sourceFilePath: 'src/App.tsx',
            targetModule: './useThing',
            targetFilePath: 'src/useThing.ts',
            confidence: 'medium',
          },
        ],
        diagnostics: [],
      },
      diagnostics: [],
    });

    expect(
      graph.nodes.map((node) => ({
        label: node.label,
        kind: node.kind,
        diffStatus: node.diffStatus,
      })),
    ).toEqual([
      { label: 'App.tsx', kind: 'module', diffStatus: 'module' },
      { label: 'useThing.ts', kind: 'module', diffStatus: 'related' },
    ]);
    expect(graph.edges).toHaveLength(1);
    expect(graph.edges[0]?.kind).toBe('imports');
  });
});
