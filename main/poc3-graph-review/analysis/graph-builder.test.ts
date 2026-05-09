import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import type { ReviewSourceSnapshot } from '../../../shared/poc3-domain/source-snapshot';
import type { DependencyExtractionResult } from './dependency-extractor';
import { buildInitialGraph } from './graph-builder';

const tempDirs: string[] = [];

function createTempWorktree(): string {
  const worktreePath = fs.mkdtempSync(path.join(os.tmpdir(), 'graph-builder-'));
  tempDirs.push(worktreePath);
  fs.mkdirSync(path.join(worktreePath, 'src'), { recursive: true });
  return worktreePath;
}

afterEach(() => {
  for (const tempDir of tempDirs.splice(0)) {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

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
        patch: '@@ -10,2 +10,4 @@',
        hunks: [
          {
            filePath: 'src/App.tsx',
            oldStart: 10,
            oldLines: 2,
            newStart: 10,
            newLines: 4,
            header: '@@ -10,2 +10,4 @@',
            changedNewLines: [11, 12, 13, 14],
            changedOldLines: [11, 12],
          },
        ],
      },
    ],
    remoteThreads: [],
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
        changedLineNumbers: [11, 12, 13, 14],
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
        changedLineNumbers: [],
        changedLines: 0,
      },
    ],
    calls: [
      {
        sourceKey: 'src/App.tsx:App:10',
        targetKey: 'src/useThing.ts:useThing:5',
        kind: 'calls',
        confidence: 'high',
        usage: {
          filePath: 'src/App.tsx',
          range: {
            filePath: 'src/App.tsx',
            startLine: 15,
            startColumn: 10,
            endLine: 15,
            endColumn: 18,
          },
          imported: true,
          importSource: './useThing',
        },
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
  it('module/import edge を通常表示せず function usage の 1-hop を維持する', () => {
    const graph = buildInitialGraph({
      revisionId: 'revision-1',
      sourceSnapshot: createSourceSnapshot(),
      extraction: createExtraction(),
      diagnostics: [],
    });

    expect(graph.nodes.map((node) => node.label)).toEqual(['App', 'useThing']);
    expect(graph.nodes.some((node) => node.kind === 'module')).toBe(false);
    expect(
      graph.edges.map((edge) => edge.kind).sort((left, right) => left.localeCompare(right)),
    ).toEqual(['calls']);
    expect(graph.edges[0]?.usage?.importSource).toBe('./useThing');
  });

  it('関数外変更だけの場合は file-scope fallback node を作り import edge は作らない', () => {
    const sourceSnapshot = createSourceSnapshot();
    sourceSnapshot.changedFiles[0]!.hunks[0]!.changedNewLines = [1, 2, 3, 4];
    const graph = buildInitialGraph({
      revisionId: 'revision-1',
      sourceSnapshot,
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
        changedLineNumbers: node.changedLineNumbers,
      })),
    ).toEqual([
      {
        label: 'App.tsx file scope',
        kind: 'file-scope',
        diffStatus: 'file-scope',
        changedLineNumbers: [1, 2, 3, 4],
      },
    ]);
    expect(graph.edges).toHaveLength(0);
  });

  it('product と test が両方 Diff にある場合は test node を companion として非表示にする', () => {
    const sourceSnapshot = createSourceSnapshot();
    sourceSnapshot.changedFiles.push({
      path: 'src/App.test.tsx',
      oldPath: null,
      status: 'modified',
      additions: 1,
      deletions: 0,
      patch: '@@ -1,1 +1,1 @@',
      hunks: [
        {
          filePath: 'src/App.test.tsx',
          oldStart: 1,
          oldLines: 1,
          newStart: 1,
          newLines: 1,
          header: '@@ -1,1 +1,1 @@',
          changedNewLines: [5],
          changedOldLines: [5],
        },
      ],
    });
    const graph = buildInitialGraph({
      revisionId: 'revision-1',
      sourceSnapshot,
      extraction: {
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
            changedLineNumbers: [11],
            changedLines: 1,
          },
          {
            key: 'src/App.test.tsx:rendersApp:1',
            name: 'rendersApp',
            kind: 'function',
            filePath: 'src/App.test.tsx',
            range: {
              filePath: 'src/App.test.tsx',
              startLine: 1,
              startColumn: 1,
              endLine: 10,
              endColumn: 1,
            },
            isDiffNode: true,
            changedLineNumbers: [5],
            changedLines: 1,
          },
        ],
        calls: [
          {
            sourceKey: 'src/App.test.tsx:rendersApp:1',
            targetKey: 'src/App.tsx:App:10',
            kind: 'calls',
            confidence: 'high',
            usage: {
              filePath: 'src/App.test.tsx',
              range: {
                filePath: 'src/App.test.tsx',
                startLine: 5,
                startColumn: 1,
                endLine: 5,
                endColumn: 10,
              },
              imported: true,
              importSource: './App',
            },
          },
        ],
        imports: [
          {
            sourceFilePath: 'src/App.test.tsx',
            targetModule: './App',
            targetFilePath: 'src/App.tsx',
            confidence: 'medium',
          },
        ],
        diagnostics: [],
      },
      diagnostics: [],
    });

    expect(graph.nodes.map((node) => node.filePath)).toEqual(['src/App.tsx', 'src/App.tsx']);
    expect(graph.nodes.some((node) => node.filePath === 'src/App.test.tsx')).toBe(false);
    expect(graph.edges).toHaveLength(0);
    expect(graph.companionFiles).toHaveLength(1);
    expect(graph.companionFiles?.[0]).toMatchObject({
      ownerFilePath: 'src/App.tsx',
      ownerRole: 'product',
      companionRole: 'test',
      companionFilePath: 'src/App.test.tsx',
      source: 'import',
      displayMode: 'diff',
      existsInDiff: true,
    });
    expect(graph.companionFiles?.[0]?.hiddenNodeIds).toHaveLength(1);
  });

  it('product のみ Diff にある場合は拡張子違いの既存 test file を companion にする', () => {
    const worktreePath = createTempWorktree();
    fs.writeFileSync(
      path.join(worktreePath, 'src', 'App.test.ts'),
      'test("App", () => {});\n',
      'utf8',
    );

    const graph = buildInitialGraph({
      revisionId: 'revision-1',
      worktreePath,
      sourceSnapshot: createSourceSnapshot(),
      extraction: createExtraction(),
      diagnostics: [],
    });

    expect(graph.companionFiles).toEqual([
      expect.objectContaining({
        ownerFilePath: 'src/App.tsx',
        ownerRole: 'product',
        companionRole: 'test',
        companionFilePath: 'src/App.test.ts',
        source: 'filename-heuristic',
        displayMode: 'code',
        existsInWorkspaceHead: true,
        existsInDiff: false,
      }),
    ]);
  });
});
