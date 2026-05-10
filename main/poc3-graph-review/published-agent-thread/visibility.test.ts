import { describe, expect, it } from 'vitest';
import type { Poc3AgentReviewThread } from '../../../shared/poc3-domain/agent-review';
import type { PublishedAgentThreadLink } from '../../../shared/poc3-domain/published-agent-thread';
import type { ReviewRemoteThread } from '../../../shared/poc3-domain/source-snapshot';
import { buildPublishedThreadVisibility } from './visibility';

function createAgentThread(localThreadId: string): Poc3AgentReviewThread {
  return {
    localThreadId,
    runId: 'run-1',
    reviewWorkspaceId: 'workspace-1',
    revisionId: 'revision-1',
    findingId: `finding-${localThreadId}`,
    nodeId: 'node-1',
    severity: 'medium',
    category: 'correctness',
    confidence: 'medium',
    title: 'Finding',
    draftBody: 'Body',
    location: {
      kind: 'diff',
      filePath: 'src/example.ts',
      startLine: 10,
      endLine: 10,
      side: 'new',
    },
    status: 'open',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

function createResolvedAgentThread(localThreadId: string): Poc3AgentReviewThread {
  return {
    ...createAgentThread(localThreadId),
    status: 'resolved',
  };
}

function createRemoteThread(providerThreadId: string): ReviewRemoteThread {
  return {
    providerThreadId,
    location: {
      kind: 'diff',
      filePath: 'src/example.ts',
      oldPath: null,
      startLine: null,
      endLine: 10,
      side: 'RIGHT',
    },
    anchorStatus: 'current',
    isResolved: false,
    isOutdated: null,
    comments: [],
    providerContext: {
      remoteDiscussionId: providerThreadId,
      remoteCommentIds: [],
      anchorRefs: {},
    },
  };
}

function createLink(
  localThreadId: string,
  providerThreadId: string,
  overrides: Partial<PublishedAgentThreadLink> = {},
): PublishedAgentThreadLink {
  return {
    linkId: `link-${localThreadId}-${providerThreadId}`,
    reviewWorkspaceId: 'workspace-1',
    localThreadId,
    sourceRevisionId: 'revision-1',
    providerThreadId,
    providerCommentIds: [`comment-${providerThreadId}`],
    publishedAt: '2026-01-01T00:00:00.000Z',
    lastSyncedAt: '2026-01-01T00:00:00.000Z',
    status: 'active',
    ...overrides,
  };
}

describe('buildPublishedThreadVisibility', () => {
  it('表示対象 Agent Thread に紐づく Remote Thread を単独表示から除外する', () => {
    const linkedRemote = createRemoteThread('remote-linked');
    const standaloneRemote = createRemoteThread('remote-standalone');

    const result = buildPublishedThreadVisibility({
      reviewWorkspaceId: 'workspace-1',
      agentThreads: [createAgentThread('thread-1')],
      remoteThreads: [linkedRemote, standaloneRemote],
      links: [createLink('thread-1', 'remote-linked')],
    });

    expect(result.visibleRemoteThreads).toEqual([standaloneRemote]);
    expect(result.suppressedProviderThreadIds).toEqual(new Set(['remote-linked']));
    expect(result.publishedRemoteByLocalThreadId.get('thread-1')).toEqual([
      {
        link: createLink('thread-1', 'remote-linked'),
        remoteThread: linkedRemote,
      },
    ]);
  });

  it('Agent Thread が表示対象にない場合は Remote Thread を除外しない', () => {
    const linkedRemote = createRemoteThread('remote-linked');

    const result = buildPublishedThreadVisibility({
      reviewWorkspaceId: 'workspace-1',
      agentThreads: [],
      remoteThreads: [linkedRemote],
      links: [createLink('thread-1', 'remote-linked')],
    });

    expect(result.visibleRemoteThreads).toEqual([linkedRemote]);
    expect(result.suppressedProviderThreadIds.size).toBe(0);
    expect(result.publishedRemoteByLocalThreadId.size).toBe(0);
  });

  it('snapshot にない link は remoteThread null として保持する', () => {
    const result = buildPublishedThreadVisibility({
      reviewWorkspaceId: 'workspace-1',
      agentThreads: [createAgentThread('thread-1')],
      remoteThreads: [],
      links: [createLink('thread-1', 'remote-missing', { status: 'missingRemote' })],
    });

    expect(result.visibleRemoteThreads).toEqual([]);
    expect(result.suppressedProviderThreadIds.size).toBe(0);
    expect(result.publishedRemoteByLocalThreadId.get('thread-1')).toEqual([
      {
        link: createLink('thread-1', 'remote-missing', { status: 'missingRemote' }),
        remoteThread: null,
      },
    ]);
  });

  it('1 つの Agent Thread に複数 Remote Thread を紐づけられる', () => {
    const remoteA = createRemoteThread('remote-a');
    const remoteB = createRemoteThread('remote-b');

    const result = buildPublishedThreadVisibility({
      reviewWorkspaceId: 'workspace-1',
      agentThreads: [createAgentThread('thread-1')],
      remoteThreads: [remoteA, remoteB],
      links: [createLink('thread-1', 'remote-a'), createLink('thread-1', 'remote-b')],
    });

    expect(result.visibleRemoteThreads).toEqual([]);
    expect(result.suppressedProviderThreadIds).toEqual(new Set(['remote-a', 'remote-b']));
    expect(result.publishedRemoteByLocalThreadId.get('thread-1')).toHaveLength(2);
  });

  it('resolved Agent Thread に紐づく未解決 Remote Thread は単独表示に残す', () => {
    const linkedRemote = createRemoteThread('remote-linked');

    const result = buildPublishedThreadVisibility({
      reviewWorkspaceId: 'workspace-1',
      agentThreads: [createResolvedAgentThread('thread-1')],
      remoteThreads: [linkedRemote],
      links: [createLink('thread-1', 'remote-linked')],
    });

    expect(result.visibleRemoteThreads).toEqual([linkedRemote]);
    expect(result.suppressedProviderThreadIds.size).toBe(0);
    expect(result.publishedRemoteByLocalThreadId.get('thread-1')).toEqual([
      {
        link: createLink('thread-1', 'remote-linked'),
        remoteThread: linkedRemote,
      },
    ]);
  });
});
