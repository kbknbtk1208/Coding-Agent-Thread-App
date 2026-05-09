import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import type { CodeGraphSnapshot } from '../../../shared/poc3-domain/graph';
import type { Poc3AgentReviewThread } from '../../../shared/poc3-domain/agent-review';
import type { RevisionContext } from '../../../shared/poc3-domain/revision';
import type { ReviewSourceSnapshot } from '../../../shared/poc3-domain/source-snapshot';
import type { Poc3OutdatedAgentThread } from '../../../shared/poc3-domain/thread-retention';
import type { ReviewWorkspace } from '../../../shared/poc3-domain/review-workspace';
import type { WorkspaceGraphRecord } from '../store/graph-review-store';
import { resolveNodeDetail } from './node-detail-resolver';

const tempDirs: string[] = [];

function createTempWorkspace(): string {
  const worktreePath = fs.mkdtempSync(path.join(os.tmpdir(), 'node-detail-'));
  tempDirs.push(worktreePath);
  fs.mkdirSync(path.join(worktreePath, 'src'), { recursive: true });
  fs.writeFileSync(
    path.join(worktreePath, 'src', 'example.ts'),
    [
      'const before1 = 1;',
      'const before2 = 2;',
      'const before3 = 3;',
      'const before4 = 4;',
      'const before5 = 5;',
      'const before6 = 6;',
      'const before7 = 7;',
      'const before8 = 8;',
      'const inserted = 2;',
      'export function example() {',
      '  return inserted;',
      '  // body 12',
      '  // body 13',
      '  // body 14',
      '  // body 15',
      '  // body 16',
      '  // body 17',
      '  // body 18',
      '  // body 19',
      '}',
      '',
    ].join('\n'),
    'utf8',
  );
  return worktreePath;
}

afterEach(() => {
  for (const tempDir of tempDirs.splice(0)) {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

function createWorkspace(worktreePath: string): ReviewWorkspace {
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
    worktreePath,
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
        nodeId: 'node-file-scope-1',
        stableSymbolId: 'symbol-file-scope-1',
        parentNodeId: null,
        kind: 'file-scope',
        label: 'example.ts file scope',
        filePath: 'src/example.ts',
        declarationRange: {
          filePath: 'src/example.ts',
          startLine: 9,
          startColumn: 1,
          endLine: 9,
          endColumn: 1,
        },
        diffStatus: 'file-scope',
        isDiffNode: true,
        changedLineNumbers: [9],
        badges: {
          changedLines: 1,
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
        changedLineNumbers: [11],
        badges: {
          changedLines: 1,
          remoteThreadCount: 0,
          findingCount: 0,
        },
      },
      {
        nodeId: 'node-related-1',
        stableSymbolId: 'symbol-related-1',
        parentNodeId: null,
        kind: 'function',
        label: 'related',
        filePath: 'src/example.ts',
        declarationRange: {
          filePath: 'src/example.ts',
          startLine: 16,
          startColumn: 1,
          endLine: 19,
          endColumn: 1,
        },
        diffStatus: 'related',
        isDiffNode: false,
        changedLineNumbers: [],
        badges: {
          changedLines: 0,
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
            changedNewLines: [11],
            changedOldLines: [9],
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

function createRemoteThread({
  providerThreadId,
  line,
  anchorStatus = 'current',
  isOutdated = null,
}: {
  providerThreadId: string;
  line: number;
  anchorStatus?: ReviewSourceSnapshot['remoteThreads'][number]['anchorStatus'];
  isOutdated?: boolean | null;
}): ReviewSourceSnapshot['remoteThreads'][number] {
  return {
    providerThreadId,
    location: {
      kind: 'diff',
      filePath: 'src/example.ts',
      oldPath: null,
      startLine: null,
      endLine: line,
      side: 'RIGHT',
    },
    anchorStatus,
    isResolved: false,
    isOutdated,
    comments: [
      {
        providerCommentId: `${providerThreadId}:comment`,
        author: { login: 'alice', displayName: null, avatarUrl: null },
        body: 'remote body',
        url: 'https://example.test/comment',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: null,
      },
    ],
    providerContext: {
      remoteDiscussionId: providerThreadId,
      remoteCommentIds: [`${providerThreadId}:comment`],
      anchorRefs: {},
    },
  };
}

function createAgentThread(overrides: Partial<Poc3AgentReviewThread> = {}): Poc3AgentReviewThread {
  return {
    localThreadId: 'thread-1',
    runId: 'run-1',
    reviewWorkspaceId: 'workspace-1',
    revisionId: 'revision-old',
    findingId: 'finding-1',
    nodeId: 'old-node',
    severity: 'medium',
    category: 'correctness',
    confidence: 'medium',
    title: 'Outdated finding',
    draftBody: 'agent finding body',
    location: {
      kind: 'diff',
      filePath: 'src/example.ts',
      startLine: 12,
      endLine: 12,
      side: 'new',
    },
    status: 'open',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function createOutdatedAgentThread(thread: Poc3AgentReviewThread): Poc3OutdatedAgentThread {
  const sourceRevision = { ...createRevision(), revisionId: thread.revisionId, isActive: false };
  const checkedRevision = createRevision();
  return {
    thread,
    tracking: {
      localThreadId: thread.localThreadId,
      reviewWorkspaceId: thread.reviewWorkspaceId,
      sourceRevisionId: thread.revisionId,
      checkedRevisionId: checkedRevision.revisionId,
      status: 'outdated',
      reason: 'rangeChanged',
      originalNodeId: thread.nodeId,
      trackedNodeId: null,
      originalLocation: thread.location,
      checkedAt: '2026-01-02T00:00:00.000Z',
    },
    sourceRevision,
    checkedRevision,
  };
}

function createRecord(worktreePath: string): WorkspaceGraphRecord {
  return {
    workspace: createWorkspace(worktreePath),
    activeRevision: createRevision(),
    analysis: null,
    graph: createGraph(),
    layout: null,
  };
}

describe('resolveNodeDetail', () => {
  it('file-scope node では hunk 周辺 context と diff summary を返す', () => {
    const worktreePath = createTempWorkspace();
    const sourceSnapshot = createSourceSnapshot();

    const result = resolveNodeDetail({
      workspace: createWorkspace(worktreePath),
      revisionId: 'revision-1',
      scopeKey: 'initial:diff-plus-1-hop:v1',
      nodeId: 'node-file-scope-1',
      record: createRecord(worktreePath),
      sourceSnapshot,
    });

    expect(result.ok).toBe(true);
    expect(result.detail?.primaryView).toBe('file-scope');
    expect(result.detail?.fileContext?.highlightedLineNumbers).toEqual([9]);
    expect(result.detail?.diffSummary.changedLineNumbers).toEqual([9]);
    expect(result.detail?.diffExcerpt?.patch).toBe(sourceSnapshot.changedFiles[0]?.patch ?? null);
    expect(result.detail?.diffExcerpt?.hunkHeaders).toEqual(['@@ -8,6 +8,7 @@']);
  });

  it('companionFiles がない snapshot では product node にテスト未存在 state を返す', () => {
    const worktreePath = createTempWorkspace();

    const result = resolveNodeDetail({
      workspace: createWorkspace(worktreePath),
      revisionId: 'revision-1',
      scopeKey: 'initial:diff-plus-1-hop:v1',
      nodeId: 'node-function-1',
      record: createRecord(worktreePath),
      sourceSnapshot: createSourceSnapshot(),
    });

    expect(result.ok).toBe(true);
    expect(result.detail?.companion).toEqual({
      targetRole: 'test',
      toggleLabel: 'Test',
      emptyMessage: '対応するテストコードが存在しません',
      companions: [],
    });
  });

  it('同一 product file の別 node でも companion state を返す', () => {
    const worktreePath = createTempWorkspace();
    fs.writeFileSync(
      path.join(worktreePath, 'src', 'example.test.ts'),
      'test("example", () => {});\n',
      'utf8',
    );
    const record = createRecord(worktreePath);
    record.graph!.companionFiles = [
      {
        relationId: 'node-file-scope-1::src/example.test.ts',
        ownerNodeId: 'node-file-scope-1',
        ownerFilePath: 'src/example.ts',
        ownerRole: 'product',
        companionRole: 'test',
        companionFilePath: 'src/example.test.ts',
        companionNodeIds: [],
        hiddenNodeIds: [],
        source: 'filename-heuristic',
        displayMode: 'code',
        existsInWorkspaceHead: true,
        existsInDiff: false,
      },
    ];

    const result = resolveNodeDetail({
      workspace: createWorkspace(worktreePath),
      revisionId: 'revision-1',
      scopeKey: 'initial:diff-plus-1-hop:v1',
      nodeId: 'node-function-1',
      record,
      sourceSnapshot: createSourceSnapshot(),
    });

    expect(result.ok).toBe(true);
    expect(result.detail?.companion?.targetRole).toBe('test');
    expect(result.detail?.companion?.companions).toEqual([
      expect.objectContaining({
        relationId: 'node-file-scope-1::src/example.test.ts',
        role: 'test',
        filePath: 'src/example.test.ts',
        unavailableMessage: null,
      }),
    ]);
  });

  it('file-scope node では同一 file の current remote thread を本文付きで返す', () => {
    const worktreePath = createTempWorkspace();
    const sourceSnapshot = createSourceSnapshot();
    sourceSnapshot.remoteThreads = [
      {
        providerThreadId: 'remote-context',
        location: {
          kind: 'diff',
          filePath: 'src/example.ts',
          oldPath: null,
          startLine: null,
          endLine: 12,
          side: 'RIGHT',
        },
        anchorStatus: 'current',
        isResolved: false,
        isOutdated: null,
        comments: [
          {
            providerCommentId: 'remote-comment-1',
            author: { login: 'alice', displayName: null, avatarUrl: null },
            body: 'remote body',
            url: 'https://example.test/comment',
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: null,
          },
        ],
        providerContext: {
          remoteDiscussionId: 'remote-context',
          remoteCommentIds: ['remote-comment-1'],
          anchorRefs: {},
        },
      },
    ];

    const result = resolveNodeDetail({
      workspace: createWorkspace(worktreePath),
      revisionId: 'revision-1',
      scopeKey: 'initial:diff-plus-1-hop:v1',
      nodeId: 'node-file-scope-1',
      record: createRecord(worktreePath),
      sourceSnapshot,
    });

    expect(result.ok).toBe(true);
    expect(result.detail?.threads.remote).toEqual([
      expect.objectContaining({
        providerThreadId: 'remote-context',
        isResolved: false,
        comments: [
          expect.objectContaining({
            providerCommentId: 'remote-comment-1',
            body: 'remote body',
            author: { login: 'alice', displayName: null, avatarUrl: null },
          }),
        ],
      }),
    ]);
  });

  it('file-scope node では同一 file の outdated remote thread も返す', () => {
    const worktreePath = createTempWorkspace();
    const sourceSnapshot = createSourceSnapshot();
    sourceSnapshot.remoteThreads = [
      createRemoteThread({
        providerThreadId: 'remote-outdated',
        line: 12,
        anchorStatus: 'outdated',
        isOutdated: false,
      }),
      createRemoteThread({
        providerThreadId: 'remote-unanchored',
        line: 12,
        anchorStatus: 'unanchored',
      }),
    ];

    const result = resolveNodeDetail({
      workspace: createWorkspace(worktreePath),
      revisionId: 'revision-1',
      scopeKey: 'initial:diff-plus-1-hop:v1',
      nodeId: 'node-file-scope-1',
      record: createRecord(worktreePath),
      sourceSnapshot,
    });

    expect(result.ok).toBe(true);
    expect(result.detail?.threads.remote).toEqual([
      expect.objectContaining({
        providerThreadId: 'remote-outdated',
        anchorStatus: 'outdated',
        isOutdated: true,
      }),
    ]);
  });

  it('file-scope node では同一 file の outdated agent finding も返す', () => {
    const worktreePath = createTempWorkspace();
    const outdatedThread = createAgentThread();

    const result = resolveNodeDetail({
      workspace: createWorkspace(worktreePath),
      revisionId: 'revision-1',
      scopeKey: 'initial:diff-plus-1-hop:v1',
      nodeId: 'node-file-scope-1',
      record: createRecord(worktreePath),
      sourceSnapshot: createSourceSnapshot(),
      outdatedAgentThreads: [createOutdatedAgentThread(outdatedThread)],
    });

    expect(result.ok).toBe(true);
    expect(result.detail?.findings).toEqual([
      expect.objectContaining({
        localThreadId: outdatedThread.localThreadId,
        title: 'Outdated finding',
        isOutdated: true,
        line: 12,
      }),
    ]);
    expect(result.detail?.threads.agent).toEqual([
      expect.objectContaining({
        threadId: outdatedThread.localThreadId,
        line: 12,
      }),
    ]);
  });

  it('diff node では関数全体 code と diff 行 highlight を返す', () => {
    const worktreePath = createTempWorkspace();
    const sourceSnapshot = createSourceSnapshot();

    const result = resolveNodeDetail({
      workspace: createWorkspace(worktreePath),
      revisionId: 'revision-1',
      scopeKey: 'initial:diff-plus-1-hop:v1',
      nodeId: 'node-function-1',
      record: createRecord(worktreePath),
      sourceSnapshot,
    });

    expect(result.ok).toBe(true);
    expect(result.detail?.primaryView).toBe('function');
    expect(result.detail?.functionCode?.startLine).toBe(10);
    expect(result.detail?.functionCode?.endLine).toBe(20);
    expect(result.detail?.functionCode?.highlightedLineNumbers).toEqual([11]);
    expect(result.detail?.diffSummary.changedLineNumbers).toEqual([11]);
    expect(result.detail?.diffExcerpt?.patch?.split('\n')).toHaveLength(7);
  });

  it('viewMode=file では file context を返し、patch がなくても code が読めれば ready になる', () => {
    const worktreePath = createTempWorkspace();

    const result = resolveNodeDetail({
      workspace: createWorkspace(worktreePath),
      revisionId: 'revision-1',
      scopeKey: 'initial:diff-plus-1-hop:v1',
      nodeId: 'node-function-1',
      viewMode: 'file',
      record: createRecord(worktreePath),
      sourceSnapshot: null,
    });

    expect(result.ok).toBe(true);
    expect(result.detail?.status).toBe('ready');
    expect(result.detail?.fileContext?.mode).toBe('file');
    expect(result.detail?.diffSummary.hasDiff).toBe(true);
    expect(result.detail?.diffExcerpt).toBeNull();
  });

  it('同じ file の related node には無関係な diff summary を付けない', () => {
    const worktreePath = createTempWorkspace();

    const result = resolveNodeDetail({
      workspace: createWorkspace(worktreePath),
      revisionId: 'revision-1',
      scopeKey: 'initial:diff-plus-1-hop:v1',
      nodeId: 'node-related-1',
      record: createRecord(worktreePath),
      sourceSnapshot: createSourceSnapshot(),
    });

    expect(result.ok).toBe(true);
    expect(result.detail?.primaryView).toBe('function');
    expect(result.detail?.diffSummary.hasDiff).toBe(false);
    expect(result.detail?.diffSummary.patch).toBeNull();
  });
});
