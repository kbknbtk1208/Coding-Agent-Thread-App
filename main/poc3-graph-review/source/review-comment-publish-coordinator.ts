import { randomUUID } from 'crypto';
import type {
  Poc3InlineCommentAnchor,
  Poc3PublishCommentSource,
  Poc3PublishedCommentRecord,
} from '../../../shared/poc3-domain/comment-publish';
import type {
  ReviewRemoteThread,
  ReviewRemoteThreadLocation,
  ReviewRemoteThreadSummary,
  ReviewSourceSnapshot,
} from '../../../shared/poc3-domain/source-snapshot';
import type {
  PublishInlineCommentResult,
  ReplyRemoteCommentResult,
} from '../../../shared/poc3-contracts/graph-review-ipc';
import type { RepositoryProfile } from '../../../shared/poc3-domain/repository';
import type { RepositoryProviderStore } from '../workspace/repository-provider-store';
import type { RepositoryProfileStore } from '../workspace/repository-profile-store';
import type { GraphReviewStore } from '../store/graph-review-store';
import { Poc3AgentReviewStore } from '../agent/store';
import {
  postGitHubInlineComment,
  postGitHubReply,
  postGitLabInlineComment,
  postGitLabReply,
  ProviderRejectedError,
} from './review-comment-client';
import {
  validateCommentBody,
  validateInlineCommentAnchor,
} from './review-comment-anchor-validator';

export interface PublishCoordinatorDeps {
  graphStore: GraphReviewStore;
  providerStore: RepositoryProviderStore;
  profileStore: RepositoryProfileStore;
  agentReviewStore: Poc3AgentReviewStore;
  savePublishedRecord: (record: Poc3PublishedCommentRecord) => void;
  clearWorkspaceCaches: (reviewWorkspaceId: string) => void;
}

export async function publishInlineComment(
  input: {
    reviewWorkspaceId: string;
    revisionId: string;
    body: string;
    anchor: Poc3InlineCommentAnchor;
    source: Poc3PublishCommentSource;
  },
  deps: PublishCoordinatorDeps,
): Promise<PublishInlineCommentResult> {
  const bodyValidation = validateCommentBody(input.body);
  if (!bodyValidation.ok) {
    return { ok: false, reason: 'invalidBody', message: bodyValidation.message };
  }

  if (input.source.kind === 'agent-finding') {
    const localThreadId = input.source.localThreadId;
    if (!localThreadId) {
      return {
        ok: false,
        reason: 'invalidAnchor',
        message: 'Finding thread ID が指定されていません。',
      };
    }
    const thread = deps.agentReviewStore.getThreadDraft(localThreadId);
    if (!thread) {
      return { ok: false, reason: 'invalidAnchor', message: 'Finding thread が見つかりません。' };
    }
    if (thread.revisionId !== input.revisionId) {
      return {
        ok: false,
        reason: 'inactiveRevision',
        message: '最新 revision に切り替えてから投稿してください。',
      };
    }
    if (thread.location.kind !== 'diff') {
      return {
        ok: false,
        reason: 'invalidAnchor',
        message: 'この Finding は現在の diff 上に投稿できません。',
      };
    }
  }

  const resolved = resolveWorkspaceContext(input.reviewWorkspaceId, input.revisionId, deps);
  if (!resolved.ok) {
    return resolved;
  }
  const { sourceSnapshot, profile, token } = resolved;

  const anchorValidation = validateInlineCommentAnchor(input.anchor, sourceSnapshot);
  if (!anchorValidation.ok) {
    return { ok: false, reason: 'invalidAnchor', message: anchorValidation.message };
  }

  try {
    let result: { providerThreadId: string; providerCommentIds: string[] };

    if (profile.resolvedProvider.kind === 'github') {
      const locator = profile.repoLocator;
      if (locator.kind !== 'github') {
        return {
          ok: false,
          reason: 'providerUnavailable',
          message: 'Provider locator が不正です。',
        };
      }
      result = await postGitHubInlineComment({
        kind: 'github',
        baseUrl: profile.resolvedProvider.baseUrl,
        token,
        owner: locator.owner,
        repo: locator.repo,
        pullNumber: sourceSnapshot.reviewId,
        body: input.body,
        anchor: input.anchor,
        sourceSnapshot,
      });
    } else {
      const locator = profile.repoLocator;
      if (locator.kind !== 'gitlab') {
        return {
          ok: false,
          reason: 'providerUnavailable',
          message: 'Provider locator が不正です。',
        };
      }
      result = await postGitLabInlineComment({
        kind: 'gitlab',
        baseUrl: profile.resolvedProvider.baseUrl,
        token,
        projectPathOrId: locator.projectPathOrId,
        mergeRequestIid: sourceSnapshot.reviewId,
        body: input.body,
        anchor: input.anchor,
        sourceSnapshot,
      });
    }

    const published: Poc3PublishedCommentRecord = {
      localPublishId: randomUUID(),
      reviewWorkspaceId: input.reviewWorkspaceId,
      revisionId: input.revisionId,
      source: input.source,
      providerThreadId: result.providerThreadId,
      providerCommentIds: result.providerCommentIds,
      body: input.body,
      anchor: input.anchor,
      createdAt: new Date().toISOString(),
    };
    deps.savePublishedRecord(published);

    const remoteThread = buildRemoteThread(published, input.anchor);
    const updatedSnapshot = mergeThreadIntoSnapshot(sourceSnapshot, remoteThread);
    deps.graphStore.saveSourceSnapshot(updatedSnapshot);
    deps.clearWorkspaceCaches(input.reviewWorkspaceId);

    return { ok: true, published, remoteThread, sourceSnapshot: updatedSnapshot };
  } catch (err) {
    if (err instanceof ProviderRejectedError) {
      return { ok: false, reason: 'providerRejected', message: err.message };
    }
    return {
      ok: false,
      reason: 'providerRejected',
      message: err instanceof Error ? err.message : 'コメントの投稿に失敗しました。',
    };
  }
}

export async function replyRemoteComment(
  input: {
    reviewWorkspaceId: string;
    revisionId: string;
    providerThreadId: string;
    body: string;
  },
  deps: PublishCoordinatorDeps,
): Promise<ReplyRemoteCommentResult> {
  const bodyValidation = validateCommentBody(input.body);
  if (!bodyValidation.ok) {
    return { ok: false, reason: 'invalidBody', message: bodyValidation.message };
  }

  const resolved = resolveWorkspaceContext(input.reviewWorkspaceId, input.revisionId, deps);
  if (!resolved.ok) {
    if (resolved.reason === 'inactiveRevision') {
      return { ok: false, reason: 'revisionNotFound', message: resolved.message };
    }
    return resolved;
  }
  const { sourceSnapshot, profile, token } = resolved;

  const targetThread = sourceSnapshot.remoteThreads.find(
    (t) => t.providerThreadId === input.providerThreadId,
  );
  if (!targetThread) {
    return { ok: false, reason: 'threadNotFound', message: 'コメントスレッドが見つかりません。' };
  }

  try {
    let result: { providerThreadId: string; providerCommentIds: string[] };

    if (profile.resolvedProvider.kind === 'github') {
      const locator = profile.repoLocator;
      if (locator.kind !== 'github') {
        return {
          ok: false,
          reason: 'providerUnavailable',
          message: 'Provider locator が不正です。',
        };
      }
      const threadIdParts = input.providerThreadId.split(':');
      if (threadIdParts[0] !== 'github-review-comment') {
        return {
          ok: false,
          reason: 'threadNotReplyable',
          message:
            'この種類のコメントへの返信は対応していません（issue comment への返信は対象外）。',
        };
      }
      const topLevelCommentId = threadIdParts[1] ?? '';
      result = await postGitHubReply({
        kind: 'github',
        baseUrl: profile.resolvedProvider.baseUrl,
        token,
        owner: locator.owner,
        repo: locator.repo,
        pullNumber: sourceSnapshot.reviewId,
        body: input.body,
        topLevelCommentId,
      });
    } else {
      const locator = profile.repoLocator;
      if (locator.kind !== 'gitlab') {
        return {
          ok: false,
          reason: 'providerUnavailable',
          message: 'Provider locator が不正です。',
        };
      }
      const discussionId = targetThread.providerContext.remoteDiscussionId;
      result = await postGitLabReply({
        kind: 'gitlab',
        baseUrl: profile.resolvedProvider.baseUrl,
        token,
        projectPathOrId: locator.projectPathOrId,
        mergeRequestIid: sourceSnapshot.reviewId,
        body: input.body,
        discussionId,
      });
    }

    const published: Poc3PublishedCommentRecord = {
      localPublishId: randomUUID(),
      reviewWorkspaceId: input.reviewWorkspaceId,
      revisionId: input.revisionId,
      source: { kind: 'remote-thread', providerThreadId: input.providerThreadId },
      providerThreadId: result.providerThreadId,
      providerCommentIds: result.providerCommentIds,
      body: input.body,
      anchor: null,
      createdAt: new Date().toISOString(),
    };
    deps.savePublishedRecord(published);

    const updatedThread: ReviewRemoteThread = {
      ...targetThread,
      comments: [
        ...targetThread.comments,
        {
          providerCommentId: result.providerCommentIds[0] ?? randomUUID(),
          author: { login: 'me', displayName: null, avatarUrl: null },
          body: input.body,
          url: null,
          createdAt: published.createdAt,
          updatedAt: null,
        },
      ],
      providerContext: {
        ...targetThread.providerContext,
        remoteCommentIds: [
          ...targetThread.providerContext.remoteCommentIds,
          ...result.providerCommentIds,
        ],
      },
    };

    const updatedSnapshot = mergeThreadIntoSnapshot(sourceSnapshot, updatedThread);
    deps.graphStore.saveSourceSnapshot(updatedSnapshot);
    deps.clearWorkspaceCaches(input.reviewWorkspaceId);

    return { ok: true, published, remoteThread: updatedThread, sourceSnapshot: updatedSnapshot };
  } catch (err) {
    if (err instanceof ProviderRejectedError) {
      return { ok: false, reason: 'providerRejected', message: err.message };
    }
    return {
      ok: false,
      reason: 'providerRejected',
      message: err instanceof Error ? err.message : '返信の投稿に失敗しました。',
    };
  }
}

type WorkspaceContextError =
  | { ok: false; reason: 'workspaceNotFound'; message: string }
  | { ok: false; reason: 'revisionNotFound'; message: string }
  | { ok: false; reason: 'sourceSnapshotNotFound'; message: string }
  | { ok: false; reason: 'inactiveRevision'; message: string }
  | { ok: false; reason: 'providerUnavailable'; message: string }
  | { ok: false; reason: 'tokenNotFound'; message: string };

type WorkspaceContextOk = {
  ok: true;
  sourceSnapshot: ReviewSourceSnapshot;
  profile: RepositoryProfile;
  token: string;
};

function resolveWorkspaceContext(
  reviewWorkspaceId: string,
  revisionId: string,
  deps: PublishCoordinatorDeps,
): WorkspaceContextOk | WorkspaceContextError {
  const workspace = deps.graphStore.getWorkspace(reviewWorkspaceId);
  if (!workspace) {
    return {
      ok: false,
      reason: 'workspaceNotFound',
      message: 'Review Workspace が見つかりません。',
    };
  }

  const revision = deps.graphStore.getRevision(revisionId);
  if (!revision || revision.reviewWorkspaceId !== reviewWorkspaceId) {
    return { ok: false, reason: 'revisionNotFound', message: 'Revision が見つかりません。' };
  }
  if (!revision.isActive) {
    return {
      ok: false,
      reason: 'inactiveRevision',
      message: '投稿対象は active revision に限定されます。',
    };
  }

  const sourceSnapshot = deps.graphStore.getSourceSnapshotByRevision(revisionId);
  if (!sourceSnapshot) {
    return {
      ok: false,
      reason: 'sourceSnapshotNotFound',
      message: 'Source snapshot が見つかりません。',
    };
  }

  const profile = deps.profileStore.get(workspace.repositoryProfileId);
  if (!profile) {
    return {
      ok: false,
      reason: 'providerUnavailable',
      message: 'Repository Profile が見つかりません。',
    };
  }

  const provider = deps.providerStore.get(profile.repositoryProviderId);
  if (!provider) {
    return {
      ok: false,
      reason: 'providerUnavailable',
      message: 'Repository Provider が見つかりません。',
    };
  }

  const token = deps.providerStore.getToken(provider.tokenRef);
  if (!token) {
    return { ok: false, reason: 'tokenNotFound', message: 'Provider token が見つかりません。' };
  }

  return { ok: true, sourceSnapshot, profile, token };
}

function buildRemoteThread(
  published: Poc3PublishedCommentRecord,
  anchor: Poc3InlineCommentAnchor,
): ReviewRemoteThread {
  const commentId = published.providerCommentIds[0] ?? published.localPublishId;
  const location: ReviewRemoteThreadLocation = {
    kind: 'diff',
    filePath: anchor.filePath,
    oldPath: anchor.oldPath,
    startLine: anchor.startLine,
    endLine: anchor.endLine,
    side: anchor.side,
  };

  return {
    providerThreadId: published.providerThreadId,
    location,
    anchorStatus: 'current',
    isResolved: false,
    isOutdated: false,
    comments: [
      {
        providerCommentId: commentId,
        author: { login: 'me', displayName: null, avatarUrl: null },
        body: published.body,
        url: null,
        createdAt: published.createdAt,
        updatedAt: null,
      },
    ],
    providerContext: {
      remoteDiscussionId: extractDiscussionId(published.providerThreadId),
      remoteCommentIds: published.providerCommentIds,
      anchorRefs: {},
    },
  };
}

function extractDiscussionId(providerThreadId: string): string {
  const colonIdx = providerThreadId.indexOf(':');
  return colonIdx >= 0 ? providerThreadId.slice(colonIdx + 1) : providerThreadId;
}

function mergeThreadIntoSnapshot(
  snapshot: ReviewSourceSnapshot,
  thread: ReviewRemoteThread,
): ReviewSourceSnapshot {
  const existingIdx = snapshot.remoteThreads.findIndex(
    (t) => t.providerThreadId === thread.providerThreadId,
  );

  let remoteThreads: ReviewRemoteThread[];
  if (existingIdx >= 0) {
    remoteThreads = snapshot.remoteThreads.map((t, i) => (i === existingIdx ? thread : t));
  } else {
    remoteThreads = [...snapshot.remoteThreads, thread];
  }

  const remoteThreadsSummary: ReviewRemoteThreadSummary[] = remoteThreads.map((t) => ({
    providerThreadId: t.providerThreadId,
    filePath: t.location.kind === 'diff' ? t.location.filePath : null,
    line: t.location.kind === 'diff' ? (t.location.endLine ?? t.location.startLine) : null,
    side: t.location.kind === 'diff' ? t.location.side : null,
    isResolved: t.isResolved,
    commentCount: t.comments.length,
  }));

  return {
    ...snapshot,
    remoteThreads,
    remoteThreadsSummary,
    updatedAt: new Date().toISOString(),
  };
}
