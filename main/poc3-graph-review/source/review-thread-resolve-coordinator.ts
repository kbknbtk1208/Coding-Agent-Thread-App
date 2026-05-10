import type {
  RemoteThreadResolveItemResult,
  ResolveAgentThreadResult,
  ResolveRemoteThreadResult,
  ThreadResolveFailureReason,
} from '../../../shared/poc3-domain/thread-resolve';
import { isResolvableRemoteThread } from '../../../shared/poc3-domain/thread-resolve';
import type { ReviewSourceSnapshot } from '../../../shared/poc3-domain/source-snapshot';
import type { Poc3AgentReviewStore } from '../agent/store';
import type { PublishedAgentThreadLinkStore } from '../published-agent-thread/store';
import type { GraphReviewStore } from '../store/graph-review-store';
import type { RepositoryProfileStore } from '../workspace/repository-profile-store';
import type { RepositoryProviderStore } from '../workspace/repository-provider-store';
import {
  ReviewThreadResolveClient,
  ThreadNotResolvableError,
} from './review-thread-resolve-client';
import { ProviderRejectedError } from './review-comment-client';

export interface ThreadResolveCoordinatorDeps {
  graphStore: GraphReviewStore;
  agentReviewStore: Poc3AgentReviewStore;
  publishedAgentThreadLinkStore: PublishedAgentThreadLinkStore;
  providerStore: RepositoryProviderStore;
  profileStore: RepositoryProfileStore;
  client?: ReviewThreadResolveClient;
  clearWorkspaceCaches: (reviewWorkspaceId: string) => void;
}

function withDefaultClient(
  deps: ThreadResolveCoordinatorDeps,
): Required<ThreadResolveCoordinatorDeps> {
  return {
    ...deps,
    client: deps.client ?? new ReviewThreadResolveClient(),
  };
}

export class ThreadResolveCoordinator {
  private readonly agentCoordinator: AgentThreadResolveCoordinator;
  private readonly remoteCoordinator: RemoteThreadResolveCoordinator;

  constructor(deps: ThreadResolveCoordinatorDeps) {
    const resolvedDeps = withDefaultClient(deps);
    this.agentCoordinator = new AgentThreadResolveCoordinator(resolvedDeps);
    this.remoteCoordinator = new RemoteThreadResolveCoordinator(resolvedDeps);
  }

  resolveAgentThread(input: {
    reviewWorkspaceId: string;
    revisionId: string;
    localThreadId: string;
  }): Promise<ResolveAgentThreadResult> {
    return this.agentCoordinator.resolve(input);
  }

  resolveRemoteThread(input: {
    reviewWorkspaceId: string;
    revisionId: string;
    providerThreadId: string;
  }): Promise<ResolveRemoteThreadResult> {
    return this.remoteCoordinator.resolve(input);
  }
}

export class RemoteThreadResolveCoordinator {
  constructor(private readonly deps: Required<ThreadResolveCoordinatorDeps>) {}

  async resolve(input: {
    reviewWorkspaceId: string;
    revisionId: string;
    providerThreadId: string;
  }): Promise<ResolveRemoteThreadResult> {
    const reviewWorkspaceId = input.reviewWorkspaceId.trim();
    const revisionId = input.revisionId.trim();
    const providerThreadId = input.providerThreadId.trim();
    const context = this.resolveContext(reviewWorkspaceId, revisionId);
    if (!context.ok) return context;

    const remoteThread = context.sourceSnapshot.remoteThreads.find(
      (thread) => thread.providerThreadId === providerThreadId,
    );
    if (!remoteThread) {
      return { ok: false, reason: 'threadNotFound', message: 'Remote Thread が見つかりません。' };
    }
    if (remoteThread.location.kind !== 'diff') {
      return {
        ok: false,
        reason: 'threadNotResolvable',
        message: 'overview thread は対象外です。',
      };
    }
    if (remoteThread.isResolved === true) {
      return { ok: true, providerThreadId, sourceSnapshot: context.sourceSnapshot };
    }

    const resolvedProvider = this.resolveProviderContext(context.workspace.repositoryProfileId);
    if (!resolvedProvider.ok) return resolvedProvider;

    try {
      await this.deps.client.resolveRemoteThread({
        token: resolvedProvider.token,
        profile: resolvedProvider.profile,
        workspace: context.workspace,
        sourceSnapshot: context.sourceSnapshot,
        remoteThread,
      });
      const updated = this.deps.graphStore.updateRemoteThreadResolved({
        revisionId,
        providerThreadId,
        isResolved: true,
        updatedAt: new Date().toISOString(),
      });
      if (!updated) {
        return {
          ok: false,
          reason: 'localPersistenceFailed',
          message:
            'Provider 側には反映済みの可能性があります。Revision refresh を実行してください。',
        };
      }
      this.deps.clearWorkspaceCaches(reviewWorkspaceId);
      return { ok: true, providerThreadId, sourceSnapshot: updated };
    } catch (err) {
      return providerErrorToResult(err, 'Remote Thread の resolve に失敗しました。');
    }
  }

  private resolveContext(reviewWorkspaceId: string, revisionId: string) {
    const workspace = this.deps.graphStore.getWorkspace(reviewWorkspaceId);
    if (!workspace) {
      return {
        ok: false as const,
        reason: 'workspaceNotFound' as const,
        message: 'Review Workspace が見つかりません。',
      };
    }
    const revision = this.deps.graphStore.getRevision(revisionId);
    if (!revision || revision.reviewWorkspaceId !== reviewWorkspaceId) {
      return {
        ok: false as const,
        reason: 'revisionNotFound' as const,
        message: 'Revision が見つかりません。',
      };
    }
    const sourceSnapshot = this.deps.graphStore.getSourceSnapshotByRevision(revisionId);
    if (!sourceSnapshot) {
      return {
        ok: false as const,
        reason: 'sourceSnapshotNotFound' as const,
        message: 'Source snapshot が見つかりません。',
      };
    }
    return { ok: true as const, workspace, revision, sourceSnapshot };
  }

  private resolveProviderContext(repositoryProfileId: string) {
    const profile = this.deps.profileStore.get(repositoryProfileId);
    if (!profile) {
      return {
        ok: false as const,
        reason: 'providerUnavailable' as const,
        message: 'Repository Profile が見つかりません。',
      };
    }
    const provider = this.deps.providerStore.get(profile.repositoryProviderId);
    if (!provider) {
      return {
        ok: false as const,
        reason: 'providerUnavailable' as const,
        message: 'Repository Provider が見つかりません。',
      };
    }
    const token = this.deps.providerStore.getToken(provider.tokenRef);
    if (!token) {
      return {
        ok: false as const,
        reason: 'tokenNotFound' as const,
        message: 'Provider token が見つかりません。',
      };
    }
    return { ok: true as const, profile, token };
  }
}

export class AgentThreadResolveCoordinator {
  constructor(private readonly deps: Required<ThreadResolveCoordinatorDeps>) {}

  async resolve(input: {
    reviewWorkspaceId: string;
    revisionId: string;
    localThreadId: string;
  }): Promise<ResolveAgentThreadResult> {
    const reviewWorkspaceId = input.reviewWorkspaceId.trim();
    const revisionId = input.revisionId.trim();
    const localThreadId = input.localThreadId.trim();

    const workspace = this.deps.graphStore.getWorkspace(reviewWorkspaceId);
    if (!workspace) {
      return {
        ok: false,
        reason: 'workspaceNotFound',
        message: 'Review Workspace が見つかりません。',
      };
    }
    const revision = this.deps.graphStore.getRevision(revisionId);
    if (!revision || revision.reviewWorkspaceId !== reviewWorkspaceId) {
      return { ok: false, reason: 'revisionNotFound', message: 'Revision が見つかりません。' };
    }
    const thread = this.deps.agentReviewStore.getThreadDraft(localThreadId);
    if (!thread || thread.reviewWorkspaceId !== reviewWorkspaceId) {
      return { ok: false, reason: 'threadNotFound', message: 'Agent Thread が見つかりません。' };
    }
    if (thread.location.kind === 'overview') {
      return {
        ok: false,
        reason: 'threadNotResolvable',
        message: 'overview thread は対象外です。',
      };
    }

    const resolvedAt = new Date().toISOString();
    const updatedThread = this.deps.agentReviewStore.resolveThread({
      reviewWorkspaceId,
      localThreadId,
      resolvedAt,
    });
    if (!updatedThread) {
      return {
        ok: false,
        reason: 'localPersistenceFailed',
        message: 'Agent Thread の保存に失敗しました。',
      };
    }

    const sourceLookup = this.findLinkedSourceSnapshot({
      reviewWorkspaceId,
      inputRevisionId: revisionId,
      threadRevisionId: thread.revisionId,
    });
    const remoteResults: RemoteThreadResolveItemResult[] = [];
    const links = this.deps.publishedAgentThreadLinkStore.listLinksForLocalThreads({
      reviewWorkspaceId,
      localThreadIds: [localThreadId],
    });
    const uniqueProviderThreadIds = new Set<string>();
    const providerThreadIdsToPersistByRevisionId = new Map<string, string[]>();

    for (const link of links) {
      if (uniqueProviderThreadIds.has(link.providerThreadId)) continue;
      uniqueProviderThreadIds.add(link.providerThreadId);
      if (link.status === 'missingRemote') {
        remoteResults.push({
          providerThreadId: link.providerThreadId,
          status: 'skipped',
          reason: 'missingRemote',
        });
        continue;
      }
      const snapshot = sourceLookup(link.providerThreadId);
      const remoteThread = snapshot?.remoteThreads.find(
        (item) => item.providerThreadId === link.providerThreadId,
      );
      if (!snapshot || !remoteThread) {
        remoteResults.push({
          providerThreadId: link.providerThreadId,
          status: 'skipped',
          reason: 'missingRemote',
        });
        continue;
      }
      if (remoteThread.location.kind !== 'diff') {
        remoteResults.push({
          providerThreadId: link.providerThreadId,
          status: 'skipped',
          reason: 'overview',
        });
        continue;
      }
      if (remoteThread.isResolved === true) {
        remoteResults.push({
          providerThreadId: link.providerThreadId,
          status: 'skipped',
          reason: 'alreadyResolved',
        });
        continue;
      }
      if (!isResolvableRemoteThread(remoteThread)) {
        remoteResults.push({
          providerThreadId: link.providerThreadId,
          status: 'failed',
          reason: 'threadNotResolvable',
        });
        continue;
      }
      const provider = this.resolveProviderContext(workspace.repositoryProfileId);
      if (!provider.ok) {
        remoteResults.push({
          providerThreadId: link.providerThreadId,
          status: 'failed',
          reason: provider.reason,
          message: provider.message,
        });
        continue;
      }
      try {
        await this.deps.client.resolveRemoteThread({
          token: provider.token,
          profile: provider.profile,
          workspace,
          sourceSnapshot: snapshot,
          remoteThread,
        });
        remoteResults.push({ providerThreadId: link.providerThreadId, status: 'resolved' });
        const ids = providerThreadIdsToPersistByRevisionId.get(snapshot.revisionId) ?? [];
        ids.push(link.providerThreadId);
        providerThreadIdsToPersistByRevisionId.set(snapshot.revisionId, ids);
      } catch (err) {
        const failure = providerErrorToItemResult(link.providerThreadId, err);
        remoteResults.push(failure);
      }
    }

    let sourceSnapshot: ReviewSourceSnapshot | null = null;
    if (providerThreadIdsToPersistByRevisionId.size > 0) {
      for (const [targetRevisionId, providerThreadIds] of Array.from(
        providerThreadIdsToPersistByRevisionId,
      )) {
        const updated = this.deps.graphStore.updateRemoteThreadsResolved({
          revisionId: targetRevisionId,
          providerThreadIds,
          isResolved: true,
          updatedAt: new Date().toISOString(),
        });
        if (targetRevisionId === revisionId || !sourceSnapshot) {
          sourceSnapshot = updated ?? sourceSnapshot;
        }
      }
    } else {
      sourceSnapshot = this.deps.graphStore.getSourceSnapshotByRevision(revisionId);
    }

    this.deps.clearWorkspaceCaches(reviewWorkspaceId);
    return {
      ok: true,
      localThreadId,
      agentThreadStatus: 'resolved',
      sourceSnapshot,
      remoteResults,
    };
  }

  private findLinkedSourceSnapshot(input: {
    reviewWorkspaceId: string;
    inputRevisionId: string;
    threadRevisionId: string;
  }): (providerThreadId: string) => ReviewSourceSnapshot | null {
    const activeRevision = this.deps.graphStore.getActiveRevision(input.reviewWorkspaceId);
    const candidates = [
      input.inputRevisionId,
      activeRevision?.revisionId ?? null,
      input.threadRevisionId,
    ].filter((id, index, self): id is string => Boolean(id) && self.indexOf(id) === index);
    const snapshots = candidates
      .map((revisionId) => this.deps.graphStore.getSourceSnapshotByRevision(revisionId))
      .filter((snapshot): snapshot is ReviewSourceSnapshot => Boolean(snapshot));
    return (providerThreadId: string) =>
      snapshots.find((snapshot) =>
        snapshot.remoteThreads.some((thread) => thread.providerThreadId === providerThreadId),
      ) ?? null;
  }

  private resolveProviderContext(repositoryProfileId: string) {
    const profile = this.deps.profileStore.get(repositoryProfileId);
    if (!profile) {
      return {
        ok: false as const,
        reason: 'providerUnavailable' as const,
        message: 'Repository Profile が見つかりません。',
      };
    }
    const provider = this.deps.providerStore.get(profile.repositoryProviderId);
    if (!provider) {
      return {
        ok: false as const,
        reason: 'providerUnavailable' as const,
        message: 'Repository Provider が見つかりません。',
      };
    }
    const token = this.deps.providerStore.getToken(provider.tokenRef);
    if (!token) {
      return {
        ok: false as const,
        reason: 'tokenNotFound' as const,
        message: 'Provider token が見つかりません。',
      };
    }
    return { ok: true as const, profile, token };
  }
}

function providerErrorToResult(
  err: unknown,
  fallbackMessage: string,
): Extract<ResolveRemoteThreadResult, { ok: false }> {
  if (err instanceof ThreadNotResolvableError) {
    return { ok: false, reason: 'threadNotResolvable', message: err.message };
  }
  if (err instanceof ProviderRejectedError) {
    return { ok: false, reason: 'providerRejected', message: err.message };
  }
  return {
    ok: false,
    reason: 'providerRejected',
    message: err instanceof Error ? err.message : fallbackMessage,
  };
}

function providerErrorToItemResult(
  providerThreadId: string,
  err: unknown,
): RemoteThreadResolveItemResult {
  const reason: ThreadResolveFailureReason =
    err instanceof ThreadNotResolvableError ? 'threadNotResolvable' : 'providerRejected';
  const message = err instanceof Error ? err.message : 'Remote Thread の resolve に失敗しました。';
  return { providerThreadId, status: 'failed', reason, message };
}
