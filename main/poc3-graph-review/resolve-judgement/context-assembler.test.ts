import { describe, expect, it } from 'vitest';
import type { ReviewWorkspace } from '../../../shared/poc3-domain/review-workspace';
import type { RevisionContext } from '../../../shared/poc3-domain/revision';
import type {
  ReviewRemoteThread,
  ReviewSourceSnapshot,
} from '../../../shared/poc3-domain/source-snapshot';
import type { Poc3AgentReviewStore } from '../agent/store';
import type { WorkspaceGraphRecord } from '../store/graph-review-store';
import { ResolveJudgementContextAssembler } from './context-assembler';

const NOW = '2026-01-01T00:00:00.000Z';

function createRecord(): WorkspaceGraphRecord {
  const workspace: ReviewWorkspace = {
    reviewWorkspaceId: 'workspace-1',
    repositoryProfileId: 'profile-1',
    provider: 'github',
    reviewUrl: 'https://github.com/owner/repo/pull/1',
    reviewId: '1',
    title: 'PR title',
    baseSha: 'base',
    headSha: 'head',
    sourceBranchName: null,
    worktreePath: 'C:/repo',
    setupStatus: 'completed',
    status: 'active',
    createdAt: NOW,
    updatedAt: NOW,
  };
  const activeRevision: RevisionContext = {
    revisionId: 'revision-1',
    reviewWorkspaceId: 'workspace-1',
    provider: 'github',
    reviewId: '1',
    baseSha: 'base',
    headSha: 'head',
    startSha: null,
    sourceBranchName: null,
    diffVersion: null,
    isActive: true,
    status: 'active',
    createdAt: NOW,
    updatedAt: NOW,
  };
  return {
    workspace,
    activeRevision,
    analysis: null,
    graph: null,
    layout: null,
  };
}

function createSourceSnapshot(remoteThreads: ReviewRemoteThread[]): ReviewSourceSnapshot {
  return {
    sourceSnapshotId: 'source-1',
    revisionId: 'revision-1',
    provider: 'github',
    reviewId: '1',
    title: 'PR title',
    description: '',
    baseSha: 'base',
    headSha: 'head',
    startSha: null,
    diffVersion: null,
    changedFiles: [],
    remoteThreads,
    remoteThreadsSummary: [],
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function createRemoteThread(
  providerThreadId: string,
  isResolved: boolean | null,
): ReviewRemoteThread {
  return {
    providerThreadId,
    location: {
      kind: 'diff',
      filePath: 'src/example.ts',
      oldPath: null,
      startLine: 10,
      endLine: 10,
      side: 'RIGHT',
    },
    anchorStatus: 'current',
    isResolved,
    isOutdated: null,
    comments: [
      {
        providerCommentId: `${providerThreadId}:comment`,
        author: { login: 'reviewer', displayName: null, avatarUrl: null },
        body: `body ${providerThreadId}`,
        url: null,
        createdAt: NOW,
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

function createAgentReviewStore(): Poc3AgentReviewStore {
  return {
    listThreadsForWorkspace: () => [],
    buildConversation: () => null,
  } as unknown as Poc3AgentReviewStore;
}

describe('ResolveJudgementContextAssembler', () => {
  it('isResolved が null の GitHub remote thread も判定対象に含める', () => {
    const assembler = new ResolveJudgementContextAssembler();

    const result = assembler.collect({
      reviewWorkspaceId: 'workspace-1',
      revisionId: 'revision-1',
      record: createRecord(),
      sourceSnapshot: createSourceSnapshot([
        createRemoteThread('remote-null', null),
        createRemoteThread('remote-open', false),
        createRemoteThread('remote-resolved', true),
      ]),
      agentReviewStore: createAgentReviewStore(),
      publishedAgentThreadLinks: [],
    });

    expect(result.targets.map((target) => target.key.commentId)).toEqual([
      'remote-null',
      'remote-open',
    ]);
  });
});
