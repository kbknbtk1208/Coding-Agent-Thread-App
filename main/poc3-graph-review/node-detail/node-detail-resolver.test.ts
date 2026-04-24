import { describe, expect, it } from 'vitest';
import type { CodeGraphSnapshot } from '../../../shared/poc3-domain/graph';
import type { RevisionContext } from '../../../shared/poc3-domain/revision';
import type { ReviewSourceSnapshot } from '../../../shared/poc3-domain/source-snapshot';
import type { ReviewWorkspace } from '../../../shared/poc3-domain/review-workspace';
import type { WorkspaceGraphRecord } from '../store/graph-review-store';
import { resolveNodeDetail } from './node-detail-resolver';

function createWorkspace(): ReviewWorkspace {
  return {
    reviewWorkspaceId: 'workspace-1',
    repositoryProfileId: 'profile-1',
    provider: 'github',
    reviewUrl: 'https://github.com/acme/project/pull/123',
    reviewId: '123',
    title: 'Review workspace',
    baseSha: 'a'.repeat(40),
    headSha: 'b'.repeat(40),
    sourceBranchName: 'feature/node-detail',
    worktreePath: 'C:\\worktrees\\project-pr-123',
    setupStatus: 'completed',
    status: 'active',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

function createRevision(): RevisionContext {
  return {
    revisionId: 'revision-1',
    reviewWorkspaceId: 'workspace-1',
    provider: 'github',
    reviewId: '123',
    baseSha: 'a'.repeat(40),
    headSha: 'b'.repeat(40),
    startSha: null,
    sourceBranchName: 'feature/node-detail',
    diffVersion: null,
    isActive: true,
    status: 'active',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

function createGraph(): CodeGraphSnapshot {
  return {
    graphSnapshotId: 'graph-1',
    revisionId: 'revision-1',
    scopeKey: 'initial:diff-plus-1-hop:v1',
    status: 'ready',
    nodes: [
      {
        nodeId: 'node-module-1',
        stableSymbolId: 'symbol-module-1',
        parentNodeId: null,
        kind: 'module',
        label: 'example.ts',
        filePath: 'src/example.ts',
        declarationRange: {
          filePath: 'src/example.ts',
          startLine: 1,
          startColumn: 1,
          endLine: 1,
          endColumn: 1,
        },
        diffStatus: 'module',
        isDiffNode: false,
        badges: {
          changedLines: 3,
          remoteThreadCount: 0,
          findingCount: 0,
        },
      },
      {
        nodeId: 'node-function-1',
        stableSymbolId: 'symbol-function-1',
        parentNodeId: 'node-module-1',
        kind: 'function',
        label: 'example',
        filePath: 'src/example.ts',
        declarationRange: {
          filePath: 'src/example.ts',
          startLine: 10,
          startColumn: 1,
          endLine: 20,
          endColumn: 1,
        },
        diffStatus: 'changed',
        isDiffNode: true,
        badges: {
          changedLines: 3,
          remoteThreadCount: 0,
          findingCount: 0,
        },
      },
    ],
    edges: [],
    limits: {
      nodeLimit: 150,
      edgeLimit: 400,
      omittedNodeCount: 0,
      omittedEdgeCount: 0,
      reason: 'none',
    },
    diagnostics: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

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
        path: 'src/example.ts',
        oldPath: null,
        status: 'modified',
        additions: 3,
        deletions: 1,
        patch: [
          '@@ -8,6 +8,7 @@',
          ' const before = 1;',
          '-const removed = 2;',
          '+const inserted = 2;',
          ' export function example() {',
          '   return inserted;',
          ' }',
        ].join('\n'),
        hunks: [
          {
            filePath: 'src/example.ts',
            oldStart: 8,
            oldLines: 6,
            newStart: 8,
            newLines: 7,
            header: 'export function example() {',
            changedNewLines: [9],
            changedOldLines: [9],
          },
        ],
      },
    ],
    remoteThreadsSummary: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

function createRecord(): WorkspaceGraphRecord {
  return {
    workspace: createWorkspace(),
    activeRevision: createRevision(),
    analysis: null,
    graph: createGraph(),
    layout: null,
  };
}

describe('resolveNodeDetail', () => {
  it('module node では file patch 全量を返し、壊れた hunk header を補正する', () => {
    const sourceSnapshot = createSourceSnapshot();

    const result = resolveNodeDetail({
      workspace: createWorkspace(),
      revisionId: 'revision-1',
      scopeKey: 'initial:diff-plus-1-hop:v1',
      nodeId: 'node-module-1',
      record: createRecord(),
      sourceSnapshot,
    });

    expect(result.ok).toBe(true);
    expect(result.detail?.primaryView).toBe('diff');
    expect(result.detail?.diffExcerpt?.patch).toBe(sourceSnapshot.changedFiles[0]?.patch ?? null);
    expect(result.detail?.diffExcerpt?.hunkHeaders).toEqual(['@@ -8,6 +8,7 @@']);
  });

  it('diff node でも intersect する hunk があれば file patch 全量を返す', () => {
    const sourceSnapshot = createSourceSnapshot();

    const result = resolveNodeDetail({
      workspace: createWorkspace(),
      revisionId: 'revision-1',
      scopeKey: 'initial:diff-plus-1-hop:v1',
      nodeId: 'node-function-1',
      record: createRecord(),
      sourceSnapshot,
    });

    expect(result.ok).toBe(true);
    expect(result.detail?.primaryView).toBe('diff');
    expect(result.detail?.diffExcerpt?.patch?.split('\n')).toHaveLength(7);
  });
});
