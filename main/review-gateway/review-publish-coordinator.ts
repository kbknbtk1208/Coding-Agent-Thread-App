import { createHash } from 'crypto';
import {
  deriveAnchorKind,
  type ReviewAnchor,
  type ReviewDiscussionLocation,
  type ReviewSnapshot,
  type ReviewSnapshotFile,
  type ReviewSnapshotThread,
  type ReviewSourceLocator,
} from '../../shared/domain/review';
import type { ReviewLocalThread } from '../../shared/domain/review-draft';
import type {
  ReviewPublishDraft,
  ReviewPublishedRemoteRef,
  ReviewPublishResult,
  ReviewPublishResultItem,
} from '../../shared/domain/review-publish';
import {
  createGitHubReviewClient,
  type GitHubCreatedIssueComment,
  type GitHubCreatedReviewComment,
  type GitHubReviewClient,
} from './clients/github-review-client';
import {
  createGitLabReviewClient,
  type GitLabCreatedDiscussion,
  type GitLabCreateDiscussionPosition,
  type GitLabReviewClient,
} from './clients/gitlab-review-client';
import { ReviewDraftStore } from './review-draft-store';
import { ReviewGatewayError } from './review-gateway-error';
import type { FetchLike } from './request-json';
import { ReviewAnchorValidator } from './review-anchor-validator';
import { ReviewPublishDraftAssembler } from './review-publish-draft-assembler';

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

function cloneDraft(draft: ReviewPublishDraft): ReviewPublishDraft {
  return structuredClone(draft);
}

function cloneDrafts(drafts: ReviewPublishDraft[]): ReviewPublishDraft[] {
  return drafts.map((draft) => cloneDraft(draft));
}

function buildPublishedRemoteRef(
  provider: ReviewSnapshot['provider'],
  thread: ReviewSnapshotThread,
  publishedAt: string,
): ReviewPublishedRemoteRef {
  return {
    provider,
    remoteDiscussionId: thread.providerContext.remoteDiscussionId,
    remoteCommentIds: [...thread.providerContext.remoteCommentIds],
    publishedAt,
  };
}

type DiffLocation = Extract<ReviewPublishDraft['location'], { kind: 'diff' }>;

function isEqualLocation(
  left: ReviewPublishDraft['location'],
  right: ReviewPublishDraft['location'],
): boolean {
  if (left.kind !== right.kind) {
    return false;
  }
  if (left.kind === 'overview') {
    return true;
  }

  const l = left as DiffLocation;
  const r = right as DiffLocation;
  return (
    l.fileId === r.fileId &&
    l.filePath === r.filePath &&
    l.side === r.side &&
    l.startLine === r.startLine &&
    l.endLine === r.endLine
  );
}

function createGitLabLineCode(
  filePath: string,
  oldLine: number | null,
  newLine: number | null,
): string {
  const hash = createHash('sha1').update(filePath).digest('hex');
  return `${hash}_${oldLine ?? 'null'}_${newLine ?? 'null'}`;
}

function findSnapshotFile(
  snapshot: ReviewSnapshot,
  filePath: string | null,
): ReviewSnapshotFile | null {
  if (!filePath) {
    return null;
  }

  return (
    snapshot.files.find((file) => file.filePath === filePath || file.oldFilePath === filePath) ??
    null
  );
}

function adaptPublishedGitHubIssueComment(
  comment: GitHubCreatedIssueComment,
): ReviewSnapshotThread {
  return {
    threadId: `github-issue-comment-${comment.id}`,
    location: {
      kind: 'overview',
    },
    comments: [
      {
        commentId: String(comment.id),
        author: comment.user.login,
        body: comment.body,
        createdAt: comment.created_at,
        position: null,
      },
    ],
    isResolved: false,
    isOutdated: false,
    providerContext: {
      remoteDiscussionId: String(comment.id),
      remoteCommentIds: [String(comment.id)],
      anchorRefs: {
        commentId: comment.id,
        htmlUrl: comment.html_url,
      },
    },
  };
}

function adaptPublishedGitHubReviewComment(
  comment: GitHubCreatedReviewComment,
  file: ReviewSnapshotFile,
): ReviewSnapshotThread {
  const side: 'old' | 'new' = comment.side === 'LEFT' ? 'old' : 'new';
  const startLine = comment.start_line ?? comment.line;
  const endLine = comment.line ?? comment.start_line;

  return {
    threadId: `github-review-comment-${comment.id}`,
    location: {
      kind: 'diff',
      fileId: file.fileId,
      filePath: file.filePath,
      startLine,
      endLine,
      side,
    },
    comments: [
      {
        commentId: String(comment.id),
        author: comment.user.login,
        body: comment.body,
        createdAt: comment.created_at,
        position:
          endLine === null
            ? null
            : {
                filePath: file.filePath,
                startLine,
                endLine,
                side,
              },
      },
    ],
    isResolved: false,
    isOutdated: false,
    providerContext: {
      remoteDiscussionId: String(comment.id),
      remoteCommentIds: [String(comment.id)],
      anchorRefs: {
        path: comment.path,
        line: comment.line,
        start_line: comment.start_line,
        start_side: comment.start_side ?? null,
        side: comment.side,
        commit_id: comment.commit_id,
        original_commit_id: comment.original_commit_id ?? null,
        diff_hunk: comment.diff_hunk,
        htmlUrl: comment.html_url,
      },
    },
  };
}

function adaptPublishedGitLabDiscussion(
  discussion: GitLabCreatedDiscussion,
  snapshot: ReviewSnapshot,
): ReviewSnapshotThread {
  const firstNote = discussion.notes[0];
  const position = firstNote?.position ?? null;
  const file = findSnapshotFile(snapshot, position?.new_path ?? position?.old_path ?? null);
  let location: ReviewDiscussionLocation = {
    kind: 'overview',
  };
  if (position && file) {
    const side: 'old' | 'new' =
      position.line_range?.start.type === 'old' || position.old_line !== null ? 'old' : 'new';
    const diffLocation: Extract<ReviewDiscussionLocation, { kind: 'diff' }> = {
      kind: 'diff',
      fileId: file.fileId,
      filePath: file.filePath,
      startLine: position.line_range
        ? (position.line_range.start.new_line ?? position.line_range.start.old_line)
        : (position.new_line ?? position.old_line),
      endLine: position.line_range
        ? (position.line_range.end.new_line ?? position.line_range.end.old_line)
        : (position.new_line ?? position.old_line),
      side,
    };
    location = diffLocation;
  }

  return {
    threadId: `gitlab-discussion-${discussion.id}`,
    location,
    comments: discussion.notes.map((note) => ({
      commentId: String(note.id),
      author: note.author.username,
      body: note.body,
      createdAt: note.created_at,
      position:
        note.position && file
          ? {
              filePath: file.filePath,
              startLine: note.position.line_range
                ? (note.position.line_range.start.new_line ??
                  note.position.line_range.start.old_line)
                : (note.position.new_line ?? note.position.old_line),
              endLine: note.position.line_range
                ? (note.position.line_range.end.new_line ?? note.position.line_range.end.old_line)
                : (note.position.new_line ?? note.position.old_line),
              side:
                note.position.line_range?.start.type === 'old' || note.position.old_line !== null
                  ? 'old'
                  : 'new',
            }
          : null,
    })),
    isResolved: Boolean(firstNote?.resolved ?? false),
    isOutdated: false,
    providerContext: {
      remoteDiscussionId: discussion.id,
      remoteCommentIds: discussion.notes.map((note) => String(note.id)),
      anchorRefs: {
        notes: discussion.notes.map((note) => ({
          id: note.id,
          position: note.position ?? null,
          resolved: note.resolved ?? false,
        })),
      },
    },
  };
}

interface PublishContext {
  snapshotId: string;
  locator: ReviewSourceLocator;
  snapshot: ReviewSnapshot;
  token: string;
}

interface ReviewPublishCoordinatorDependencies {
  createGitHubClient?: (args: {
    baseUrl: string;
    token: string;
    fetchImpl?: FetchLike;
  }) => GitHubReviewClient;
  createGitLabClient?: (args: {
    baseUrl: string;
    token: string;
    fetchImpl?: FetchLike;
  }) => GitLabReviewClient;
  draftStore: ReviewDraftStore;
  assembler?: ReviewPublishDraftAssembler;
  anchorValidator?: ReviewAnchorValidator;
  fetchImpl?: FetchLike;
  now?: () => string;
}

export class ReviewPublishCoordinator {
  private readonly createGitHubClient;
  private readonly createGitLabClient;
  private readonly draftStore: ReviewDraftStore;
  private readonly assembler: ReviewPublishDraftAssembler;
  private readonly anchorValidator: ReviewAnchorValidator;
  private readonly fetchImpl?: FetchLike;
  private readonly now: () => string;

  constructor(dependencies: ReviewPublishCoordinatorDependencies) {
    this.createGitHubClient = dependencies.createGitHubClient ?? createGitHubReviewClient;
    this.createGitLabClient = dependencies.createGitLabClient ?? createGitLabReviewClient;
    this.draftStore = dependencies.draftStore;
    this.assembler = dependencies.assembler ?? new ReviewPublishDraftAssembler();
    this.anchorValidator = dependencies.anchorValidator ?? new ReviewAnchorValidator();
    this.fetchImpl = dependencies.fetchImpl;
    this.now = dependencies.now ?? (() => new Date().toISOString());
  }

  preparePublishDrafts(
    snapshotId: string,
    localThreads: ReviewLocalThread[],
  ): ReviewPublishDraft[] {
    const drafts = this.assembler.seed(
      snapshotId,
      localThreads,
      this.draftStore.getPublishDrafts(snapshotId),
      this.now,
    );
    this.draftStore.savePublishDrafts(snapshotId, drafts);
    return cloneDrafts(drafts);
  }

  updatePublishDrafts(snapshotId: string, drafts: ReviewPublishDraft[]): ReviewPublishDraft[] {
    const currentById = new Map(
      this.draftStore.getPublishDrafts(snapshotId).map((draft) => [draft.publishDraftId, draft]),
    );

    const nextDrafts: ReviewPublishDraft[] = drafts.map((draft): ReviewPublishDraft => {
      const current = currentById.get(draft.publishDraftId);
      if (!current) {
        return {
          ...cloneDraft(draft),
          state: draft.state === 'published' ? 'published' : 'ready',
          updatedAt: this.now(),
        };
      }

      const hasBodyChanged = draft.body !== current.originalBody;
      const hasLocationChanged = !isEqualLocation(draft.location, current.location);
      const hasEdited = hasBodyChanged || hasLocationChanged;
      const shouldKeepFailed = current.state === 'failed' && !hasEdited;

      return {
        ...cloneDraft(draft),
        state:
          current.state === 'published'
            ? 'published'
            : shouldKeepFailed
              ? 'failed'
              : hasEdited
                ? 'edited'
                : 'ready',
        lastError: shouldKeepFailed ? current.lastError : null,
        updatedAt: this.now(),
      };
    }) as ReviewPublishDraft[];

    this.draftStore.savePublishDrafts(snapshotId, nextDrafts);
    return cloneDrafts(nextDrafts);
  }

  async publishDrafts(
    context: PublishContext,
    publishDraftIds: string[],
  ): Promise<{
    result: ReviewPublishResult;
    remoteThreads: ReviewSnapshotThread[];
  }> {
    if (publishDraftIds.length === 0) {
      return {
        result: {
          snapshotId: context.snapshotId,
          attemptedCount: 0,
          publishedCount: 0,
          failedCount: 0,
          items: [],
        },
        remoteThreads: [],
      };
    }

    const drafts = this.draftStore.getPublishDrafts(context.snapshotId);
    const draftOrder = drafts.map((draft) => draft.publishDraftId);
    const draftById = new Map(drafts.map((draft) => [draft.publishDraftId, cloneDraft(draft)]));

    for (const publishDraftId of publishDraftIds) {
      if (!draftById.has(publishDraftId)) {
        throw new ReviewGatewayError(
          'THREAD_NOT_FOUND',
          `Publish draft not found: ${publishDraftId}`,
        );
      }
    }

    const saveDrafts = () => {
      this.draftStore.savePublishDrafts(
        context.snapshotId,
        draftOrder.map((publishDraftId) => cloneDraft(draftById.get(publishDraftId)!)),
      );
    };

    const items: ReviewPublishResultItem[] = [];
    const remoteThreads: ReviewSnapshotThread[] = [];
    let workingSnapshot = context.snapshot;

    for (const publishDraftId of publishDraftIds) {
      const currentDraft = draftById.get(publishDraftId)!;
      const publishingDraft: ReviewPublishDraft = {
        ...currentDraft,
        state: 'publishing',
        lastError: null,
        updatedAt: this.now(),
      };
      draftById.set(publishDraftId, publishingDraft);
      saveDrafts();

      try {
        const prepared = this.prepareDraftForPublish(workingSnapshot, publishingDraft);
        const remoteThread =
          context.locator.provider === 'github'
            ? await this.publishGitHubDraft(context, prepared.draft, prepared.file)
            : await this.publishGitLabDraft(context, prepared.draft, prepared.file);
        const publishedAt = this.now();

        const publishedDraft: ReviewPublishDraft = {
          ...prepared.draft,
          state: 'published',
          lastError: null,
          publishedRemote: buildPublishedRemoteRef(
            workingSnapshot.provider,
            remoteThread,
            publishedAt,
          ),
          updatedAt: publishedAt,
        };
        draftById.set(publishDraftId, publishedDraft);
        saveDrafts();

        remoteThreads.push(remoteThread);
        items.push({
          publishDraftId,
          localThreadId: publishingDraft.localThreadId,
          status: 'published',
          remoteThread,
        });
      } catch (error: unknown) {
        const errorMessage = toErrorMessage(error);
        draftById.set(publishDraftId, {
          ...publishingDraft,
          state: 'failed',
          lastError: errorMessage,
          updatedAt: this.now(),
        });
        saveDrafts();

        items.push({
          publishDraftId,
          localThreadId: publishingDraft.localThreadId,
          status: 'failed',
          errorMessage,
        });
      }
    }

    return {
      result: {
        snapshotId: context.snapshotId,
        attemptedCount: publishDraftIds.length,
        publishedCount: items.filter((item) => item.status === 'published').length,
        failedCount: items.filter((item) => item.status === 'failed').length,
        items,
      },
      remoteThreads,
    };
  }

  private prepareDraftForPublish(
    snapshot: ReviewSnapshot,
    draft: ReviewPublishDraft,
  ): {
    draft: ReviewPublishDraft;
    file: ReviewSnapshotFile | null;
  } {
    const location = draft.location;
    const bodyValidation = this.anchorValidator.validateBody(draft.body);
    if (!bodyValidation.ok) {
      throw new ReviewGatewayError('REQUEST_FAILED', bodyValidation.message);
    }

    if (location.kind === 'overview') {
      return {
        draft: {
          ...draft,
          body: draft.body.trim(),
          anchor: null,
        },
        file: null,
      };
    }

    const diffLocation = location as Extract<ReviewDiscussionLocation, { kind: 'diff' }>;
    const file = snapshot.files.find((candidate) => candidate.fileId === diffLocation.fileId);
    if (!file) {
      throw new ReviewGatewayError(
        'FILE_NOT_FOUND',
        `File not found for publish draft: ${diffLocation.fileId}`,
      );
    }

    const anchor: ReviewAnchor = {
      fileId: file.fileId,
      filePath: file.filePath,
      startLine: diffLocation.startLine,
      endLine: diffLocation.endLine,
      side: diffLocation.side,
      kind: deriveAnchorKind(diffLocation.startLine, diffLocation.endLine),
    };
    const anchorValidation = this.anchorValidator.validateDiffAnchor(anchor, file);
    if (!anchorValidation.ok) {
      throw new ReviewGatewayError('REQUEST_FAILED', anchorValidation.message);
    }

    return {
      draft: {
        ...draft,
        body: draft.body.trim(),
        location: {
          kind: 'diff',
          fileId: file.fileId,
          filePath: file.filePath,
          startLine: anchor.startLine,
          endLine: anchor.endLine,
          side: anchor.side,
        },
        anchor,
      },
      file,
    };
  }

  private async publishGitHubDraft(
    context: PublishContext,
    draft: ReviewPublishDraft,
    file: ReviewSnapshotFile | null,
  ): Promise<ReviewSnapshotThread> {
    const locator = context.locator as Extract<ReviewSourceLocator, { provider: 'github' }>;
    const client = this.createGitHubClient({
      baseUrl: locator.host,
      token: context.token,
      fetchImpl: this.fetchImpl,
    });

    if (draft.location.kind === 'overview') {
      const comment = await client.createIssueComment(
        locator.owner,
        locator.repo,
        locator.pullNumber,
        {
          body: draft.body,
        },
      );
      return adaptPublishedGitHubIssueComment(comment);
    }

    if (!file) {
      throw new ReviewGatewayError('FILE_NOT_FOUND', 'Publish draft file metadata is missing.');
    }

    const payload: Parameters<GitHubReviewClient['createReviewComment']>[3] = {
      body: draft.body,
      commit_id: context.snapshot.headSha,
      path: file.providerContext.remotePath,
      line: draft.location.endLine ?? draft.location.startLine ?? 1,
      side: draft.location.side === 'old' ? 'LEFT' : 'RIGHT',
    };
    if (
      draft.location.startLine !== null &&
      draft.location.endLine !== null &&
      draft.location.startLine !== draft.location.endLine
    ) {
      payload.start_line = draft.location.startLine;
      payload.start_side = draft.location.side === 'old' ? 'LEFT' : 'RIGHT';
    }

    const comment = await client.createReviewComment(
      locator.owner,
      locator.repo,
      locator.pullNumber,
      payload,
    );
    return adaptPublishedGitHubReviewComment(comment, file);
  }

  private async publishGitLabDraft(
    context: PublishContext,
    draft: ReviewPublishDraft,
    file: ReviewSnapshotFile | null,
  ): Promise<ReviewSnapshotThread> {
    const locator = context.locator as Extract<ReviewSourceLocator, { provider: 'gitlab' }>;
    const client = this.createGitLabClient({
      baseUrl: locator.host,
      token: context.token,
      fetchImpl: this.fetchImpl,
    });

    if (draft.location.kind === 'overview') {
      const discussion = await client.createMergeRequestDiscussion(
        locator.projectPathOrId,
        locator.mergeRequestIid,
        { body: draft.body },
      );
      return adaptPublishedGitLabDiscussion(discussion, context.snapshot);
    }

    if (!file) {
      throw new ReviewGatewayError('FILE_NOT_FOUND', 'Publish draft file metadata is missing.');
    }

    const startShaValue = context.snapshot.providerContext.anchorRefs['start_sha'];
    if (typeof startShaValue !== 'string' || !startShaValue.trim()) {
      throw new ReviewGatewayError(
        'REQUEST_FAILED',
        'GitLab diff publish requires start_sha, but it was not available in the snapshot.',
      );
    }

    const basePosition: Omit<
      GitLabCreateDiscussionPosition,
      'new_line' | 'old_line' | 'line_range'
    > = {
      position_type: 'text' as const,
      base_sha: context.snapshot.baseSha,
      head_sha: context.snapshot.headSha,
      start_sha: startShaValue,
      old_path: file.providerContext.oldRemotePath ?? file.providerContext.remotePath,
      new_path: file.providerContext.remotePath,
    };
    const line = draft.location.endLine ?? draft.location.startLine;
    if (line === null) {
      throw new ReviewGatewayError(
        'REQUEST_FAILED',
        'GitLab diff publish requires a concrete line number.',
      );
    }

    let position: GitLabCreateDiscussionPosition =
      draft.location.side === 'old'
        ? {
            ...basePosition,
            old_line: line,
          }
        : {
            ...basePosition,
            new_line: line,
          };
    if (
      draft.location.startLine !== null &&
      draft.location.endLine !== null &&
      draft.location.startLine !== draft.location.endLine
    ) {
      position = {
        ...position,
        position_type: 'text' as const,
        line_range: {
          start: {
            line_code: createGitLabLineCode(
              file.providerContext.remotePath,
              draft.location.side === 'old' ? draft.location.startLine : null,
              draft.location.side === 'new' ? draft.location.startLine : null,
            ),
            type: draft.location.side,
          },
          end: {
            line_code: createGitLabLineCode(
              file.providerContext.remotePath,
              draft.location.side === 'old' ? draft.location.endLine : null,
              draft.location.side === 'new' ? draft.location.endLine : null,
            ),
            type: draft.location.side,
          },
        },
      };
    }
    const payload: Parameters<GitLabReviewClient['createMergeRequestDiscussion']>[2] = {
      body: draft.body,
      position,
    };

    const discussion = await client.createMergeRequestDiscussion(
      locator.projectPathOrId,
      locator.mergeRequestIid,
      payload,
    );
    return adaptPublishedGitLabDiscussion(discussion, context.snapshot);
  }
}
