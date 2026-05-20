import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import type {
  Poc3AgentReviewRun,
  Poc3AgentReviewThread,
} from '../../shared/poc3-domain/agent-review';
import type {
  CodeGraphNode,
  GraphRenderNode,
  GraphRenderSnapshot,
} from '../../shared/poc3-domain/graph';
import type { GraphCommentSummary } from '../../shared/poc3-contracts/graph-review-ipc';
import type { PublishedAgentThreadLink } from '../../shared/poc3-domain/published-agent-thread';
import type {
  ReviewRemoteThread,
  ReviewSourceSnapshot,
} from '../../shared/poc3-domain/source-snapshot';
import type { ReviewWorkspace } from '../../shared/poc3-domain/review-workspace';
import type { Poc3OutdatedAgentThread } from '../../shared/poc3-domain/thread-retention';
import type { WorkspaceGraphRecord } from './store/graph-review-store';
import { resolveNodeDetail } from './node-detail/node-detail-resolver';
import { computeGraphCommentSummaries } from './graph-review-gateway';

const REVIEW_WORKSPACE_ID = 'workspace-1';
const REVISION_ID = 'revision-1';
const GRAPH_SNAPSHOT_ID = 'graph-1';
const SCOPE_KEY = 'initial:diff-plus-1-hop:v1';

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

function createTempWorktree(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'graph-comment-summary-'));
  tempDirs.push(dir);
  return dir;
}

function createWorkspace(worktreePath: string): ReviewWorkspace {
  return {
    reviewWorkspaceId: REVIEW_WORKSPACE_ID,
    repositoryProfileId: 'profile-1',
    provider: 'github',
    reviewUrl: 'https://github.com/acme/project/pull/1',
    reviewId: '1',
    title: 'Test PR',
    baseSha: 'a'.repeat(40),
    headSha: 'b'.repeat(40),
    sourceBranchName: 'feature/comment-summary',
    worktreePath,
    setupStatus: 'completed',
    status: 'active',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

function createNode(
  node: Partial<GraphRenderNode> & Pick<GraphRenderNode, 'nodeId' | 'kind'>,
): GraphRenderNode {
  const filePath = node.filePath ?? null;
  const baseNode: CodeGraphNode = {
    nodeId: node.nodeId,
    stableSymbolId: node.stableSymbolId ?? node.nodeId,
    parentNodeId: node.parentNodeId ?? null,
    kind: node.kind,
    label: node.label ?? node.nodeId,
    filePath,
    declarationRange: node.declarationRange ?? null,
    diffStatus: node.diffStatus ?? 'changed',
    isDiffNode: node.isDiffNode ?? true,
    changedLineNumbers: node.changedLineNumbers ?? [],
    badges: node.badges ?? { changedLines: 0, remoteThreadCount: 0, findingCount: 0 },
  };
  return {
    ...baseNode,
    position: { x: 0, y: 0 },
    size: { width: 260, height: 60 },
    extent: null,
  };
}

function createRenderSnapshot(): GraphRenderSnapshot {
  return {
    revisionId: REVISION_ID,
    graphSnapshotId: GRAPH_SNAPSHOT_ID,
    scopeKey: SCOPE_KEY,
    status: 'ready',
    nodes: [
      createNode({
        nodeId: 'node-fs',
        kind: 'file-scope',
        filePath: 'src/example.ts',
        declarationRange: {
          filePath: 'src/example.ts',
          startLine: 1,
          startColumn: 1,
          endLine: 1,
          endColumn: 1,
        },
        diffStatus: 'file-scope',
      }),
      createNode({
        nodeId: 'node-fn',
        kind: 'function',
        filePath: 'src/example.ts',
        declarationRange: {
          filePath: 'src/example.ts',
          startLine: 10,
          startColumn: 1,
          endLine: 20,
          endColumn: 1,
        },
        diffStatus: 'changed',
      }),
      createNode({
        nodeId: 'node-fn2',
        kind: 'function',
        filePath: 'src/example.ts',
        declarationRange: {
          filePath: 'src/example.ts',
          startLine: 30,
          startColumn: 1,
          endLine: 40,
          endColumn: 1,
        },
        diffStatus: 'changed',
      }),
      createNode({
        nodeId: 'node-ext',
        kind: 'external',
        diffStatus: 'external',
        isDiffNode: false,
      }),
    ],
    edges: [],
    viewport: null,
    limits: {
      nodeLimit: 150,
      edgeLimit: 400,
      omittedNodeCount: 0,
      omittedEdgeCount: 0,
      reason: 'none',
    },
    diagnostics: [],
  };
}

function createAgentThread(overrides: Partial<Poc3AgentReviewThread>): Poc3AgentReviewThread {
  return {
    localThreadId: 'thread-1',
    runId: 'run-1',
    reviewWorkspaceId: REVIEW_WORKSPACE_ID,
    revisionId: REVISION_ID,
    findingId: 'finding-1',
    nodeId: null,
    severity: 'medium',
    category: 'correctness',
    confidence: 'medium',
    title: 'Agent finding',
    draftBody: 'body',
    location: {
      kind: 'diff',
      filePath: 'src/example.ts',
      startLine: 15,
      endLine: 15,
      side: 'new',
    },
    status: 'open',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function createOutdatedAgentThread(thread: Poc3AgentReviewThread): Poc3OutdatedAgentThread {
  return {
    thread,
    tracking: {
      localThreadId: thread.localThreadId,
      reviewWorkspaceId: thread.reviewWorkspaceId,
      sourceRevisionId: 'revision-prev',
      checkedRevisionId: REVISION_ID,
      status: 'outdated',
      reason: 'rangeChanged',
      originalNodeId: thread.nodeId,
      trackedNodeId: null,
      originalLocation: thread.location,
      checkedAt: '2026-01-02T00:00:00.000Z',
    },
    sourceRevision: {
      revisionId: 'revision-prev',
      reviewWorkspaceId: REVIEW_WORKSPACE_ID,
      provider: 'github',
      reviewId: '1',
      baseSha: 'a'.repeat(40),
      headSha: 'c'.repeat(40),
      startSha: null,
      sourceBranchName: 'feature/comment-summary',
      diffVersion: null,
      isActive: false,
      status: 'orphaned',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
    checkedRevision: {
      revisionId: REVISION_ID,
      reviewWorkspaceId: REVIEW_WORKSPACE_ID,
      provider: 'github',
      reviewId: '1',
      baseSha: 'a'.repeat(40),
      headSha: 'b'.repeat(40),
      startSha: null,
      sourceBranchName: 'feature/comment-summary',
      diffVersion: null,
      isActive: true,
      status: 'active',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
  };
}

function createRemoteThread(overrides: {
  providerThreadId: string;
  line: number;
  anchorStatus?: 'current' | 'outdated' | 'unanchored' | 'overview';
  isResolved?: boolean | null;
  body?: string;
}): ReviewRemoteThread {
  return {
    providerThreadId: overrides.providerThreadId,
    location: {
      kind: 'diff',
      filePath: 'src/example.ts',
      oldPath: null,
      startLine: overrides.line,
      endLine: overrides.line,
      side: 'RIGHT',
    },
    anchorStatus: overrides.anchorStatus ?? 'current',
    isResolved: overrides.isResolved ?? null,
    isOutdated: overrides.anchorStatus === 'outdated',
    comments: [
      {
        providerCommentId: `${overrides.providerThreadId}:comment`,
        author: { login: 'alice', displayName: null, avatarUrl: null },
        body: overrides.body ?? `${overrides.providerThreadId} body`,
        url: null,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: null,
      },
    ],
    providerContext: {
      remoteDiscussionId: overrides.providerThreadId,
      remoteCommentIds: [`${overrides.providerThreadId}:comment`],
      anchorRefs: {},
    },
  };
}

interface Fixture {
  workspace: ReviewWorkspace;
  renderSnapshot: GraphRenderSnapshot;
  currentAgentThreads: Poc3AgentReviewThread[];
  outdatedAgentThreads: Poc3OutdatedAgentThread[];
  publishedLinks: PublishedAgentThreadLink[];
  sourceSnapshot: ReviewSourceSnapshot;
}

function createFixture(): Fixture {
  const worktreePath = createTempWorktree();
  fs.mkdirSync(path.join(worktreePath, 'src'), { recursive: true });
  fs.writeFileSync(
    path.join(worktreePath, 'src', 'example.ts'),
    Array.from({ length: 50 }, (_, i) => `const line${i + 1} = ${i + 1};`).join('\n'),
    'utf8',
  );

  const currentAgentThreads: Poc3AgentReviewThread[] = [
    createAgentThread({
      localThreadId: 'cur-open-fn',
      title: 'Current open finding on fn',
      location: {
        kind: 'diff',
        filePath: 'src/example.ts',
        startLine: 15,
        endLine: 15,
        side: 'new',
      },
    }),
    createAgentThread({
      localThreadId: 'cur-resolved',
      title: 'Current resolved finding',
      status: 'resolved',
      location: {
        kind: 'diff',
        filePath: 'src/example.ts',
        startLine: 16,
        endLine: 16,
        side: 'new',
      },
    }),
    createAgentThread({
      localThreadId: 'cur-overview',
      title: 'Current overview finding',
      location: { kind: 'overview' },
    }),
  ];

  const outdatedAgentThreads: Poc3OutdatedAgentThread[] = [
    createOutdatedAgentThread(
      createAgentThread({
        localThreadId: 'out-open-fn2',
        title: 'Outdated open finding on fn2',
        revisionId: 'revision-prev',
        location: {
          kind: 'diff',
          filePath: 'src/example.ts',
          startLine: 35,
          endLine: 35,
          side: 'new',
        },
      }),
    ),
    createOutdatedAgentThread(
      createAgentThread({
        localThreadId: 'out-resolved',
        title: 'Outdated resolved finding',
        revisionId: 'revision-prev',
        status: 'resolved',
        location: {
          kind: 'diff',
          filePath: 'src/example.ts',
          startLine: 36,
          endLine: 36,
          side: 'new',
        },
      }),
    ),
    outdatedDuplicateOfCurrent(),
  ];

  function outdatedDuplicateOfCurrent(): Poc3OutdatedAgentThread {
    // Same localThreadId as a current open thread — gateway filter should drop it
    return createOutdatedAgentThread(
      createAgentThread({
        localThreadId: 'cur-open-fn',
        title: 'Stale duplicate (should be filtered)',
        revisionId: 'revision-prev',
        location: {
          kind: 'diff',
          filePath: 'src/example.ts',
          startLine: 15,
          endLine: 15,
          side: 'new',
        },
      }),
    );
  }

  const sourceSnapshot: ReviewSourceSnapshot = {
    sourceSnapshotId: 'source-1',
    revisionId: REVISION_ID,
    provider: 'github',
    reviewId: '1',
    title: 'Test PR',
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
        additions: 1,
        deletions: 0,
        patch: null,
        hunks: [],
      },
    ],
    remoteThreads: [
      createRemoteThread({ providerThreadId: 'rem-open-fn', line: 15 }),
      createRemoteThread({
        providerThreadId: 'rem-outdated-fn2',
        line: 35,
        anchorStatus: 'outdated',
      }),
      createRemoteThread({
        providerThreadId: 'rem-resolved',
        line: 15,
        isResolved: true,
      }),
      createRemoteThread({
        providerThreadId: 'rem-unanchored',
        line: 15,
        anchorStatus: 'unanchored',
      }),
      createRemoteThread({ providerThreadId: 'rem-suppressed', line: 15 }),
    ],
    remoteThreadsSummary: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };

  // Active link makes 'rem-suppressed' published-from cur-open-fn, suppressing it
  // from visible remote threads, and contributing publishedRemoteCount = 1.
  const publishedLinks: PublishedAgentThreadLink[] = [
    {
      linkId: 'link-1',
      reviewWorkspaceId: REVIEW_WORKSPACE_ID,
      localThreadId: 'cur-open-fn',
      sourceRevisionId: REVISION_ID,
      providerThreadId: 'rem-suppressed',
      providerCommentIds: ['rem-suppressed:comment'],
      publishedAt: '2026-01-01T00:00:00.000Z',
      lastSyncedAt: '2026-01-01T00:00:00.000Z',
      status: 'active',
    },
  ];

  return {
    workspace: createWorkspace(worktreePath),
    renderSnapshot: createRenderSnapshot(),
    currentAgentThreads,
    outdatedAgentThreads,
    publishedLinks,
    sourceSnapshot,
  };
}

function applyGatewayOutdatedFilter(
  current: Poc3AgentReviewThread[],
  outdated: Poc3OutdatedAgentThread[],
): Poc3AgentReviewThread[] {
  const currentLocalThreadIds = new Set(current.map((t) => t.localThreadId));
  return outdated
    .filter(
      (item) =>
        item.thread.status === 'open' && !currentLocalThreadIds.has(item.thread.localThreadId),
    )
    .map((item) => item.thread);
}

function computeViaPureHelper(fixture: Fixture): GraphCommentSummary[] {
  return computeGraphCommentSummaries({
    reviewWorkspaceId: REVIEW_WORKSPACE_ID,
    revisionId: REVISION_ID,
    renderSnapshot: fixture.renderSnapshot,
    currentAgentThreads: fixture.currentAgentThreads,
    outdatedAgentThreads: applyGatewayOutdatedFilter(
      fixture.currentAgentThreads,
      fixture.outdatedAgentThreads,
    ),
    publishedLinks: fixture.publishedLinks,
    sourceSnapshot: fixture.sourceSnapshot,
  });
}

function computeViaNodeDetail(fixture: Fixture): GraphCommentSummary[] {
  const record: WorkspaceGraphRecord = {
    workspace: fixture.workspace,
    activeRevision: {
      revisionId: REVISION_ID,
      reviewWorkspaceId: REVIEW_WORKSPACE_ID,
      provider: 'github',
      reviewId: '1',
      baseSha: 'a'.repeat(40),
      headSha: 'b'.repeat(40),
      startSha: null,
      sourceBranchName: 'feature/comment-summary',
      diffVersion: null,
      isActive: true,
      status: 'active',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
    analysis: null,
    graph: {
      graphSnapshotId: GRAPH_SNAPSHOT_ID,
      revisionId: REVISION_ID,
      scopeKey: SCOPE_KEY,
      status: 'ready',
      nodes: fixture.renderSnapshot.nodes.map((node) => ({
        nodeId: node.nodeId,
        stableSymbolId: node.stableSymbolId,
        parentNodeId: node.parentNodeId,
        kind: node.kind,
        label: node.label,
        filePath: node.filePath,
        declarationRange: node.declarationRange,
        diffStatus: node.diffStatus,
        isDiffNode: node.isDiffNode,
        changedLineNumbers: node.changedLineNumbers,
        badges: node.badges,
      })),
      edges: [],
      limits: fixture.renderSnapshot.limits,
      diagnostics: [],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
    layout: null,
  };

  const runById = new Map<string, Poc3AgentReviewRun>();
  const summaryAgentThreads = [
    ...fixture.currentAgentThreads,
    ...applyGatewayOutdatedFilter(fixture.currentAgentThreads, fixture.outdatedAgentThreads),
  ];
  const outdatedLocalIds = new Set(
    applyGatewayOutdatedFilter(fixture.currentAgentThreads, fixture.outdatedAgentThreads).map(
      (t) => t.localThreadId,
    ),
  );

  const items: GraphCommentSummary[] = [];
  const seen = new Set<string>();

  for (const node of fixture.renderSnapshot.nodes) {
    const threadsForThisNode = fixture.currentAgentThreads.filter((thread) =>
      threadMatchesNode(thread, node),
    );
    const result = resolveNodeDetail({
      workspace: fixture.workspace,
      revisionId: REVISION_ID,
      scopeKey: SCOPE_KEY,
      nodeId: node.nodeId,
      record,
      renderSnapshot: fixture.renderSnapshot,
      sourceSnapshot: fixture.sourceSnapshot,
      agentThreads: threadsForThisNode,
      outdatedAgentThreads: fixture.outdatedAgentThreads,
      runById,
      publishedAgentThreadLinks: fixture.publishedLinks,
    });
    if (!result.ok || !result.detail) continue;
    const { detail } = result;

    for (const finding of detail.findings) {
      if (finding.status === 'resolved') continue;
      const key = `agent:${finding.localThreadId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const ownerThread =
        summaryAgentThreads.find((t) => t.localThreadId === finding.localThreadId) ?? null;
      items.push({
        key,
        type: 'agent',
        nodeId: node.nodeId,
        commentKey: {
          reviewWorkspaceId: REVIEW_WORKSPACE_ID,
          revisionId: REVISION_ID,
          commentType: 'agent-thread',
          commentId: finding.localThreadId,
        },
        title: ownerThread?.title ?? finding.title,
        filePath: detail.node.filePath,
        line: ownerThread?.location.kind === 'diff' ? ownerThread.location.startLine : null,
        publishedRemoteCount: finding.publishedRemoteThreads.filter(
          (item) => item.status === 'active' && item.remoteThread,
        ).length,
      });
      // outdatedLocalIds is referenced only to mirror old aggregator semantics
      void outdatedLocalIds;
    }

    for (const thread of detail.threads.remote) {
      if (thread.location.kind !== 'diff' || thread.isResolved === true) continue;
      const { location } = thread;
      const key = `remote:${thread.providerThreadId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      items.push({
        key,
        type: 'remote',
        nodeId: node.nodeId,
        commentKey: {
          reviewWorkspaceId: REVIEW_WORKSPACE_ID,
          revisionId: REVISION_ID,
          commentType: 'remote-thread',
          commentId: thread.providerThreadId,
        },
        title: thread.comments[0]?.body ?? '',
        filePath: location.filePath,
        line: location.startLine,
      });
    }
  }

  return items;
}

function threadMatchesNode(thread: Poc3AgentReviewThread, node: GraphRenderNode): boolean {
  const location = thread.location;
  if (location.kind === 'overview') {
    return node.kind === 'module' || node.kind === 'file-scope';
  }
  const filePath = 'filePath' in location ? location.filePath : null;
  if (!filePath || !node.filePath || filePath !== node.filePath) return false;
  if (node.kind === 'module' || node.kind === 'file-scope') return true;
  const range = node.declarationRange;
  if (!range) return true;
  const line = location.endLine ?? location.startLine;
  return line !== null && line >= range.startLine && line <= range.endLine;
}

function sortItems(items: GraphCommentSummary[]): GraphCommentSummary[] {
  return [...items].sort((a, b) => a.key.localeCompare(b.key));
}

describe('computeGraphCommentSummaries', () => {
  it('現在の open agent thread を返す（resolved は除外）', () => {
    const fixture = createFixture();
    const items = computeViaPureHelper(fixture);
    const agentKeys = items.filter((i) => i.type === 'agent').map((i) => i.key);
    expect(agentKeys).toContain('agent:cur-open-fn');
    expect(agentKeys).toContain('agent:cur-overview');
    expect(agentKeys).not.toContain('agent:cur-resolved');
  });

  it('outdated open agent thread も返す（resolved と current 重複は除外）', () => {
    const fixture = createFixture();
    const items = computeViaPureHelper(fixture);
    const agentKeys = items.filter((i) => i.type === 'agent').map((i) => i.key);
    expect(agentKeys).toContain('agent:out-open-fn2');
    expect(agentKeys).not.toContain('agent:out-resolved');
    // 'cur-open-fn' は current 側で 1 つだけ採用される（outdated 側の重複は捨てる）
    expect(agentKeys.filter((k) => k === 'agent:cur-open-fn').length).toBe(1);
  });

  it('remote thread の resolved / unanchored は除外する', () => {
    const fixture = createFixture();
    const items = computeViaPureHelper(fixture);
    const remoteKeys = items.filter((i) => i.type === 'remote').map((i) => i.key);
    expect(remoteKeys).toContain('remote:rem-open-fn');
    expect(remoteKeys).toContain('remote:rem-outdated-fn2');
    expect(remoteKeys).not.toContain('remote:rem-resolved');
    expect(remoteKeys).not.toContain('remote:rem-unanchored');
  });

  it('published thread visibility により remote を抑制し、agent 側の publishedRemoteCount を 1 にする', () => {
    const fixture = createFixture();
    const items = computeViaPureHelper(fixture);
    const agentItem = items.find((i) => i.key === 'agent:cur-open-fn');
    expect(agentItem?.publishedRemoteCount).toBe(1);
    expect(items.find((i) => i.key === 'remote:rem-suppressed')).toBeUndefined();
  });

  it('ResolveJudgementCommentKey は revisionId / commentType / commentId が contract 通りに埋まる', () => {
    const fixture = createFixture();
    const items = computeViaPureHelper(fixture);
    const agentItem = items.find((i) => i.key === 'agent:cur-open-fn');
    expect(agentItem?.commentKey).toEqual({
      reviewWorkspaceId: REVIEW_WORKSPACE_ID,
      revisionId: REVISION_ID,
      commentType: 'agent-thread',
      commentId: 'cur-open-fn',
    });
    const remoteItem = items.find((i) => i.key === 'remote:rem-open-fn');
    expect(remoteItem?.commentKey).toEqual({
      reviewWorkspaceId: REVIEW_WORKSPACE_ID,
      revisionId: REVISION_ID,
      commentType: 'remote-thread',
      commentId: 'rem-open-fn',
    });
  });

  it('loadNodeDetail 経由の集計と同等の item key 集合を返す', () => {
    const fixture = createFixture();
    const viaHelper = sortItems(computeViaPureHelper(fixture));
    const viaNodeDetail = sortItems(computeViaNodeDetail(fixture));
    expect(viaHelper.map((i) => i.key)).toEqual(viaNodeDetail.map((i) => i.key));
  });

  it('loadNodeDetail 経由の集計と commentKey / publishedRemoteCount が一致する', () => {
    const fixture = createFixture();
    const viaHelper = sortItems(computeViaPureHelper(fixture));
    const viaNodeDetail = sortItems(computeViaNodeDetail(fixture));
    const project = (items: GraphCommentSummary[]) =>
      items.map((item) => ({
        key: item.key,
        type: item.type,
        commentKey: item.commentKey,
        publishedRemoteCount: item.publishedRemoteCount,
        filePath: item.filePath,
        line: item.line,
      }));
    expect(project(viaHelper)).toEqual(project(viaNodeDetail));
  });
});
