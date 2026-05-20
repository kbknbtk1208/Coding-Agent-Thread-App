import { describe, expect, it } from 'vitest';
import type { CodeGraphNode } from '../../../shared/poc3-domain/graph';
import type { Poc3AgentReviewThread } from '../../../shared/poc3-domain/agent-review';
import type { ReviewRemoteThread } from '../../../shared/poc3-domain/source-snapshot';
import {
  buildAgentThreadLookupIndex,
  buildGraphNodeLookupIndex,
  buildRemoteThreadLookupIndex,
  isLineWithinNodeRange,
} from './graph-lookup-index';

function createNode(
  overrides: Partial<CodeGraphNode> & Pick<CodeGraphNode, 'nodeId'>,
): CodeGraphNode {
  return {
    nodeId: overrides.nodeId,
    stableSymbolId: overrides.stableSymbolId ?? overrides.nodeId,
    parentNodeId: overrides.parentNodeId ?? null,
    kind: overrides.kind ?? 'function',
    label: overrides.label ?? overrides.nodeId,
    filePath: overrides.filePath ?? null,
    declarationRange: overrides.declarationRange ?? null,
    diffStatus: overrides.diffStatus ?? 'related',
    isDiffNode: overrides.isDiffNode ?? false,
    changedLineNumbers: overrides.changedLineNumbers ?? [],
    badges: overrides.badges ?? {
      changedLines: 0,
      remoteThreadCount: 0,
      findingCount: 0,
    },
  };
}

function createRemoteThread(overrides: {
  providerThreadId: string;
  location?: ReviewRemoteThread['location'];
  anchorStatus?: ReviewRemoteThread['anchorStatus'];
  isResolved?: boolean | null;
}): ReviewRemoteThread {
  return {
    providerThreadId: overrides.providerThreadId,
    location: overrides.location ?? {
      kind: 'diff',
      filePath: 'src/a.ts',
      oldPath: null,
      startLine: 10,
      endLine: 12,
      side: 'RIGHT',
    },
    anchorStatus: overrides.anchorStatus ?? 'current',
    isResolved: overrides.isResolved ?? false,
    isOutdated: null,
    comments: [],
    providerContext: {
      remoteDiscussionId: 'd',
      remoteCommentIds: [],
      anchorRefs: {},
    },
  };
}

function createAgentThread(overrides: {
  localThreadId: string;
  status?: Poc3AgentReviewThread['status'];
  nodeId?: string | null;
  location?: Poc3AgentReviewThread['location'];
}): Poc3AgentReviewThread {
  return {
    localThreadId: overrides.localThreadId,
    runId: 'run-1',
    reviewWorkspaceId: 'ws-1',
    revisionId: 'rev-1',
    findingId: 'f-1',
    nodeId: overrides.nodeId ?? null,
    severity: 'high',
    category: 'correctness',
    confidence: 'high',
    title: '',
    draftBody: '',
    location: overrides.location ?? {
      kind: 'diff',
      filePath: 'src/a.ts',
      startLine: 10,
      endLine: 12,
      side: 'new',
    },
    status: overrides.status ?? 'open',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  };
}

describe('buildGraphNodeLookupIndex', () => {
  it('indexes nodes by id, file path, and visible set', () => {
    const nodes = [
      createNode({ nodeId: 'a', filePath: 'src/a.ts' }),
      createNode({ nodeId: 'b', filePath: 'src/a.ts' }),
      createNode({ nodeId: 'c', filePath: 'src/c.ts' }),
      createNode({ nodeId: 'd', filePath: null, kind: 'external' }),
    ];
    const index = buildGraphNodeLookupIndex(nodes);
    expect(index.nodeById.get('a')?.nodeId).toBe('a');
    expect(index.nodeById.size).toBe(4);
    expect(index.nodesByFilePath.get('src/a.ts')?.map((n) => n.nodeId)).toEqual(['a', 'b']);
    expect(index.nodesByFilePath.get('src/c.ts')?.map((n) => n.nodeId)).toEqual(['c']);
    expect(index.visibleNodeIds.has('d')).toBe(true);
  });
});

describe('buildRemoteThreadLookupIndex', () => {
  it('only buckets diff-anchored, unresolved current/outdated threads by file path', () => {
    const index = buildRemoteThreadLookupIndex([
      createRemoteThread({ providerThreadId: '1' }),
      createRemoteThread({
        providerThreadId: '2',
        anchorStatus: 'outdated',
        location: {
          kind: 'diff',
          filePath: 'src/a.ts',
          oldPath: null,
          startLine: 5,
          endLine: 5,
          side: 'RIGHT',
        },
      }),
      createRemoteThread({ providerThreadId: '3', isResolved: true }),
      createRemoteThread({ providerThreadId: '4', anchorStatus: 'unanchored' }),
      createRemoteThread({ providerThreadId: '5', location: { kind: 'overview' } }),
    ]);
    expect(
      index.currentDiffThreadsByFilePath.get('src/a.ts')?.map((t) => t.providerThreadId),
    ).toEqual(['1', '2']);
    expect(index.currentDiffThreadsByFilePath.size).toBe(1);
  });
});

describe('buildAgentThreadLookupIndex', () => {
  it('indexes open threads by node id and by diff file path', () => {
    const index = buildAgentThreadLookupIndex([
      createAgentThread({ localThreadId: '1', nodeId: 'node-a' }),
      createAgentThread({ localThreadId: '2', nodeId: 'node-a' }),
      createAgentThread({ localThreadId: '3', nodeId: 'node-b' }),
      createAgentThread({ localThreadId: '4', status: 'resolved', nodeId: 'node-a' }),
      createAgentThread({
        localThreadId: '5',
        nodeId: null,
        location: {
          kind: 'diff',
          filePath: 'src/b.ts',
          startLine: 3,
          endLine: 3,
          side: 'new',
        },
      }),
    ]);
    expect(index.openThreadsByNodeId.get('node-a')?.map((t) => t.localThreadId)).toEqual([
      '1',
      '2',
    ]);
    expect(index.openThreadsByNodeId.get('node-b')?.map((t) => t.localThreadId)).toEqual(['3']);
    expect(index.openDiffThreadsByFilePath.get('src/a.ts')?.length).toBe(3);
    expect(index.openDiffThreadsByFilePath.get('src/b.ts')?.length).toBe(1);
  });
});

describe('isLineWithinNodeRange', () => {
  it('returns true for module/file-scope nodes regardless of line', () => {
    const node = createNode({ nodeId: 'm', kind: 'module' });
    expect(isLineWithinNodeRange(node, null)).toBe(true);
    expect(isLineWithinNodeRange(node, 999)).toBe(true);
  });

  it('returns true when node has no declarationRange and a line', () => {
    const node = createNode({ nodeId: 'f', kind: 'function' });
    expect(isLineWithinNodeRange(node, 5)).toBe(true);
  });

  it('compares with declaration range when available', () => {
    const node = createNode({
      nodeId: 'f',
      kind: 'function',
      declarationRange: {
        filePath: 'src/a.ts',
        startLine: 10,
        startColumn: 0,
        endLine: 20,
        endColumn: 0,
      },
    });
    expect(isLineWithinNodeRange(node, 9)).toBe(false);
    expect(isLineWithinNodeRange(node, 10)).toBe(true);
    expect(isLineWithinNodeRange(node, 20)).toBe(true);
    expect(isLineWithinNodeRange(node, 21)).toBe(false);
    expect(isLineWithinNodeRange(node, null)).toBe(false);
  });
});
