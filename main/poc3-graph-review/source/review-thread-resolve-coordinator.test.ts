import { describe, expect, it, vi } from 'vitest';
import type { RepositoryProfile } from '../../../shared/poc3-domain/repository';
import type { ReviewWorkspace } from '../../../shared/poc3-domain/review-workspace';
import type {
  ReviewRemoteThread,
  ReviewSourceSnapshot,
} from '../../../shared/poc3-domain/source-snapshot';
import { ThreadResolveCoordinator } from './review-thread-resolve-coordinator';

const workspace: ReviewWorkspace = {
  reviewWorkspaceId: 'workspace-1',
  repositoryProfileId: 'profile-1',
  provider: 'github',
  reviewUrl: 'https://github.com/acme/project/pull/1',
  reviewId: '1',
  title: 'Review',
  baseSha: 'a'.repeat(40),
  headSha: 'b'.repeat(40),
  sourceBranchName: 'feature',
  worktreePath: 'C:\\repo',
  setupStatus: 'completed',
  status: 'active',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const profile: RepositoryProfile = {
  repositoryProfileId: 'profile-1',
  repositoryProviderId: 'provider-1',
  originUrl: 'https://github.com/acme/project.git',
  resolvedProvider: { kind: 'github', baseUrl: 'https://github.com', host: 'github.com' },
  repoLocator: { kind: 'github', owner: 'acme', repo: 'project' },
  localClonePath: 'C:\\repo',
  worktreeRootPath: 'C:\\worktrees',
  setupScript: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

function createRemoteThread(overrides: Partial<ReviewRemoteThread> = {}): ReviewRemoteThread {
  return {
    providerThreadId: 'github-review-comment:10',
    location: {
      kind: 'diff',
      filePath: 'src/app.ts',
      oldPath: null,
      startLine: null,
      endLine: 10,
      side: 'RIGHT',
    },
    anchorStatus: 'current',
    isResolved: false,
    isOutdated: false,
    comments: [],
    providerContext: {
      remoteDiscussionId: '10',
      remoteCommentIds: ['10'],
      anchorRefs: {},
      resolve: { githubReviewThreadNodeId: 'thread-node-1' },
    },
    ...overrides,
  };
}

function createSourceSnapshot(remoteThreads: ReviewRemoteThread[]): ReviewSourceSnapshot {
  return {
    sourceSnapshotId: 'snapshot-1',
    revisionId: 'revision-1',
    provider: 'github',
    reviewId: '1',
    title: 'Review',
    description: '',
    baseSha: workspace.baseSha,
    headSha: workspace.headSha,
    startSha: null,
    diffVersion: null,
    changedFiles: [],
    remoteThreads,
    remoteThreadsSummary: remoteThreads.map((thread) => ({
      providerThreadId: thread.providerThreadId,
      filePath: thread.location.kind === 'diff' ? thread.location.filePath : null,
      line: thread.location.kind === 'diff' ? thread.location.endLine : null,
      side: thread.location.kind === 'diff' ? thread.location.side : null,
      isResolved: thread.isResolved,
      commentCount: thread.comments.length,
    })),
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

function createCoordinator(options: {
  snapshot: ReviewSourceSnapshot;
  resolveThread?: () => unknown;
  links?: Array<{ providerThreadId: string; status: 'active' | 'missingRemote' }>;
}) {
  const updatedSnapshot = {
    ...options.snapshot,
    remoteThreads: options.snapshot.remoteThreads.map((thread) => ({
      ...thread,
      isResolved: true,
    })),
  };
  const client = { resolveRemoteThread: vi.fn().mockResolvedValue({ isResolved: true }) };
  const graphStore = {
    getWorkspace: vi.fn().mockReturnValue(workspace),
    getRevision: vi
      .fn()
      .mockReturnValue({ revisionId: 'revision-1', reviewWorkspaceId: 'workspace-1' }),
    getActiveRevision: vi.fn().mockReturnValue({ revisionId: 'revision-1' }),
    getSourceSnapshotByRevision: vi.fn().mockReturnValue(options.snapshot),
    updateRemoteThreadResolved: vi.fn().mockReturnValue(updatedSnapshot),
    updateRemoteThreadsResolved: vi.fn().mockReturnValue(updatedSnapshot),
  };
  const coordinator = new ThreadResolveCoordinator({
    graphStore: graphStore as never,
    agentReviewStore: {
      getThreadDraft: vi.fn().mockReturnValue({
        localThreadId: 'local-1',
        reviewWorkspaceId: 'workspace-1',
        revisionId: 'revision-1',
        location: {
          kind: 'diff',
          filePath: 'src/app.ts',
          startLine: null,
          endLine: 10,
          side: 'new',
        },
        status: 'open',
      }),
      resolveThread: vi.fn(options.resolveThread ?? (() => ({ status: 'resolved' }))),
    } as never,
    publishedAgentThreadLinkStore: {
      listLinksForLocalThreads: vi.fn().mockReturnValue(
        options.links?.map((link, index) => ({
          linkId: `link-${index}`,
          reviewWorkspaceId: 'workspace-1',
          localThreadId: 'local-1',
          sourceRevisionId: 'revision-1',
          providerThreadId: link.providerThreadId,
          providerCommentIds: [],
          publishedAt: '2026-01-01T00:00:00.000Z',
          lastSyncedAt: '2026-01-01T00:00:00.000Z',
          status: link.status,
        })) ?? [],
      ),
    } as never,
    providerStore: {
      get: vi.fn().mockReturnValue({ repositoryProviderId: 'provider-1', tokenRef: 'token-1' }),
      getToken: vi.fn().mockReturnValue('token'),
    } as never,
    profileStore: { get: vi.fn().mockReturnValue(profile) } as never,
    client: client as never,
    clearWorkspaceCaches: vi.fn(),
  });
  return { coordinator, client, graphStore };
}

describe('ThreadResolveCoordinator', () => {
  it('resolves a remote thread through provider and snapshot persistence', async () => {
    const snapshot = createSourceSnapshot([createRemoteThread()]);
    const { coordinator, client, graphStore } = createCoordinator({ snapshot });

    const result = await coordinator.resolveRemoteThread({
      reviewWorkspaceId: 'workspace-1',
      revisionId: 'revision-1',
      providerThreadId: 'github-review-comment:10',
    });

    expect(result.ok).toBe(true);
    expect(client.resolveRemoteThread).toHaveBeenCalledTimes(1);
    expect(graphStore.updateRemoteThreadResolved).toHaveBeenCalledWith(
      expect.objectContaining({ providerThreadId: 'github-review-comment:10', isResolved: true }),
    );
  });

  it('keeps agent thread resolved when linked remote provider resolution partially fails', async () => {
    const snapshot = createSourceSnapshot([
      createRemoteThread({ providerThreadId: 'github-review-comment:10' }),
      createRemoteThread({ providerThreadId: 'github-review-comment:11' }),
    ]);
    const { coordinator, client, graphStore } = createCoordinator({
      snapshot,
      links: [
        { providerThreadId: 'github-review-comment:10', status: 'active' },
        { providerThreadId: 'github-review-comment:11', status: 'active' },
      ],
    });
    client.resolveRemoteThread
      .mockResolvedValueOnce({ isResolved: true })
      .mockRejectedValueOnce(new Error('provider failed'));

    const result = await coordinator.resolveAgentThread({
      reviewWorkspaceId: 'workspace-1',
      revisionId: 'revision-1',
      localThreadId: 'local-1',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.agentThreadStatus).toBe('resolved');
    expect(result.remoteResults).toEqual([
      { providerThreadId: 'github-review-comment:10', status: 'resolved' },
      {
        providerThreadId: 'github-review-comment:11',
        status: 'failed',
        reason: 'providerRejected',
        message: 'provider failed',
      },
    ]);
    expect(graphStore.updateRemoteThreadsResolved).toHaveBeenCalledWith(
      expect.objectContaining({ providerThreadIds: ['github-review-comment:10'] }),
    );
  });
});
