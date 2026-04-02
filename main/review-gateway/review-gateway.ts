import type {
  CreateReviewThreadResult,
  HydrateReviewFileResult,
  LoadReviewSourceResult,
  ReplyReviewThreadResult,
} from '../../shared/contracts/review-ipc';
import type {
  ReviewAnchor,
  ReviewComment,
  ReviewSourceDraft,
  ReviewSourceLocator,
  ReviewSnapshot,
  ReviewSnapshotFile,
  ReviewSnapshotThread,
} from '../../shared/domain/review';
import { adaptGitHubSnapshot } from './adapters/github-snapshot-adapter';
import { adaptGitLabSnapshot } from './adapters/gitlab-snapshot-adapter';
import { createGitHubReviewClient, type GitHubReviewClient } from './clients/github-review-client';
import { createGitLabReviewClient, type GitLabReviewClient } from './clients/gitlab-review-client';
import { hydrateReviewFileContent } from './file-content-loader';
import {
  resolveProviderToken,
  ReviewGatewayError,
  type ReviewGatewayErrorCode,
} from './review-gateway-error';
import type { FetchLike } from './request-json';
import { parseReviewSource } from './source-parser';

interface ReviewSessionContext {
  snapshotId: string;
  source: ReviewSourceDraft;
  locator: ReviewSourceLocator;
  snapshot: ReviewSnapshot;
  token: string;
}

interface ReviewGatewayDependencies {
  fetchImpl?: FetchLike;
  tokenResolver?: typeof resolveProviderToken;
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
  hydrateFileContent?: typeof hydrateReviewFileContent;
}

function nextSnapshotId(locator: ReviewSourceLocator): string {
  const key =
    locator.provider === 'github'
      ? `${locator.owner}/${locator.repo}#${locator.pullNumber}`
      : `${locator.projectPathOrId}!${locator.mergeRequestIid}`;
  return `${locator.provider}:${key}:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 8)}`;
}

function cloneCommentPosition(anchor: ReviewAnchor): ReviewComment['position'] {
  return {
    filePath: anchor.filePath,
    startLine: anchor.startLine,
    endLine: anchor.endLine,
    side: anchor.side,
  };
}

function toLocalThread(
  threadId: string,
  anchor: ReviewAnchor,
  body: string,
  commentId: string,
): ReviewSnapshotThread {
  return {
    threadId,
    location: {
      kind: 'diff',
      fileId: anchor.fileId,
      filePath: anchor.filePath,
      startLine: anchor.startLine,
      endLine: anchor.endLine,
      side: anchor.side,
    },
    comments: [
      {
        commentId,
        author: 'You',
        body,
        createdAt: new Date().toISOString(),
        position: cloneCommentPosition(anchor),
      },
    ],
    isResolved: false,
    isOutdated: false,
    providerContext: {
      remoteCommentIds: [],
      anchorRefs: {
        localOnly: true,
      },
    },
  };
}

function toReplyPosition(thread: ReviewSnapshotThread): ReviewComment['position'] {
  if (thread.location.kind !== 'diff') {
    return null;
  }

  return {
    filePath: thread.location.filePath,
    startLine: thread.location.startLine,
    endLine: thread.location.endLine,
    side: thread.location.side,
  };
}

function mapHttpError(
  code: ReviewGatewayErrorCode,
  message: string,
  status?: number,
): ReviewGatewayError {
  if (code !== 'HTTP_ERROR' || status === undefined) {
    return new ReviewGatewayError(code, message, { status });
  }

  if (status === 401) {
    return new ReviewGatewayError(
      code,
      'Authentication failed (401). Verify the configured review token.',
      {
        status,
      },
    );
  }
  if (status === 403) {
    return new ReviewGatewayError(
      code,
      'Access forbidden (403). The configured review token may be missing required scope.',
      { status },
    );
  }
  if (status === 404) {
    return new ReviewGatewayError(
      code,
      'Review source was not found (404). Confirm the URL, host, and repository visibility.',
      { status },
    );
  }

  return new ReviewGatewayError(code, message, { status });
}

export class ReviewGateway {
  private readonly sessions = new Map<string, ReviewSessionContext>();
  private readonly fetchImpl?: FetchLike;
  private readonly tokenResolver: typeof resolveProviderToken;
  private readonly createGitHubClientFactory: NonNullable<
    ReviewGatewayDependencies['createGitHubClient']
  >;
  private readonly createGitLabClientFactory: NonNullable<
    ReviewGatewayDependencies['createGitLabClient']
  >;
  private readonly hydrateFileContent: NonNullable<ReviewGatewayDependencies['hydrateFileContent']>;
  private threadIdCounter = 0;
  private commentIdCounter = 0;

  constructor(dependencies: ReviewGatewayDependencies = {}) {
    this.fetchImpl = dependencies.fetchImpl;
    this.tokenResolver = dependencies.tokenResolver ?? resolveProviderToken;
    this.createGitHubClientFactory = dependencies.createGitHubClient ?? createGitHubReviewClient;
    this.createGitLabClientFactory = dependencies.createGitLabClient ?? createGitLabReviewClient;
    this.hydrateFileContent = dependencies.hydrateFileContent ?? hydrateReviewFileContent;
  }

  async loadReviewSource(source: ReviewSourceDraft): Promise<LoadReviewSourceResult> {
    const locator = parseReviewSource(source);
    const normalizedSource = { ...source, host: locator.host };
    const token = this.tokenResolver(normalizedSource.provider);
    const snapshot = await this.fetchSnapshot(normalizedSource, locator, token);
    const initialSelectedFileId = snapshot.files[0]?.fileId ?? null;

    const session: ReviewSessionContext = {
      snapshotId: snapshot.snapshotId,
      source: normalizedSource,
      locator,
      snapshot,
      token,
    };
    this.sessions.set(session.snapshotId, session);

    if (initialSelectedFileId) {
      const result = await this.hydrateReviewFile(session.snapshotId, initialSelectedFileId);
      session.snapshot = this.replaceSnapshotFile(session.snapshot, result.file);
      this.sessions.set(session.snapshotId, session);
    }

    return {
      snapshot: this.requireSession(session.snapshotId).snapshot,
      initialSelectedFileId,
    };
  }

  async hydrateReviewFile(
    snapshotIdOrInput: string | { snapshotId: string; fileId: string },
    fileIdArg?: string,
  ): Promise<HydrateReviewFileResult> {
    const snapshotId =
      typeof snapshotIdOrInput === 'string' ? snapshotIdOrInput : snapshotIdOrInput.snapshotId;
    const fileId = typeof snapshotIdOrInput === 'string' ? fileIdArg : snapshotIdOrInput.fileId;
    if (!fileId) {
      throw new ReviewGatewayError('FILE_NOT_FOUND', 'File id is required for hydration.');
    }

    const session = this.requireSession(snapshotId);
    const file = session.snapshot.files.find((candidate) => candidate.fileId === fileId);
    if (!file) {
      throw new ReviewGatewayError('FILE_NOT_FOUND', `File not found: ${fileId}`);
    }

    if (file.contentStatus === 'loaded' || file.contentStatus === 'failed') {
      return { file };
    }

    const hydratedFile = await this.hydrateFileContent({
      snapshot: session.snapshot,
      locator: session.locator,
      token: session.token,
      fetchImpl: this.fetchImpl,
      file,
    });

    session.snapshot = this.replaceSnapshotFile(session.snapshot, hydratedFile);
    this.sessions.set(snapshotId, session);
    return { file: hydratedFile };
  }

  createThread(
    snapshotId: string,
    fileId: string,
    anchor: ReviewAnchor,
    body: string,
  ): CreateReviewThreadResult['thread'] {
    this.requireFile(snapshotId, fileId);
    const session = this.requireSession(snapshotId);
    const thread = toLocalThread(
      `local-thread-${++this.threadIdCounter}`,
      anchor,
      body,
      `local-comment-${++this.commentIdCounter}`,
    );

    session.snapshot = {
      ...session.snapshot,
      discussions: [...session.snapshot.discussions, thread],
    };
    this.sessions.set(snapshotId, session);
    return thread;
  }

  replyThread(
    snapshotId: string,
    threadId: string,
    body: string,
  ): ReplyReviewThreadResult['thread'] {
    const session = this.requireSession(snapshotId);
    const thread = session.snapshot.discussions.find(
      (candidate) => candidate.threadId === threadId,
    );
    if (!thread) {
      throw new ReviewGatewayError('THREAD_NOT_FOUND', `Thread not found: ${threadId}`);
    }

    const nextComment: ReviewComment = {
      commentId: `local-comment-${++this.commentIdCounter}`,
      author: 'You',
      body,
      createdAt: new Date().toISOString(),
      position: toReplyPosition(thread),
    };

    const updatedThread: ReviewSnapshotThread = {
      ...thread,
      comments: [...thread.comments, nextComment],
    };

    session.snapshot = {
      ...session.snapshot,
      discussions: session.snapshot.discussions.map((candidate) =>
        candidate.threadId === threadId ? updatedThread : candidate,
      ),
    };
    this.sessions.set(snapshotId, session);
    return updatedThread;
  }

  private requireSession(snapshotId: string): ReviewSessionContext {
    const session = this.sessions.get(snapshotId);
    if (!session) {
      throw new ReviewGatewayError(
        'SNAPSHOT_NOT_FOUND',
        `Snapshot not found: ${snapshotId}. Call loadReviewSource first.`,
      );
    }
    return session;
  }

  private requireFile(snapshotId: string, fileId: string): ReviewSnapshotFile {
    const session = this.requireSession(snapshotId);
    const file = session.snapshot.files.find((candidate) => candidate.fileId === fileId);
    if (!file) {
      throw new ReviewGatewayError('FILE_NOT_FOUND', `File not found: ${fileId}`);
    }
    return file;
  }

  private replaceSnapshotFile(snapshot: ReviewSnapshot, file: ReviewSnapshotFile): ReviewSnapshot {
    return {
      ...snapshot,
      files: snapshot.files.map((candidate) =>
        candidate.fileId === file.fileId ? file : candidate,
      ),
    };
  }

  private async fetchSnapshot(
    source: ReviewSourceDraft,
    locator: ReviewSourceLocator,
    token: string,
  ): Promise<ReviewSnapshot> {
    try {
      if (locator.provider === 'github') {
        return this.fetchGitHubSnapshot(source, locator, token);
      }
      return this.fetchGitLabSnapshot(source, locator, token);
    } catch (err: unknown) {
      if (err instanceof ReviewGatewayError) {
        throw mapHttpError(err.code, err.message, err.status);
      }
      throw err;
    }
  }

  private async fetchGitHubSnapshot(
    source: ReviewSourceDraft,
    locator: Extract<ReviewSourceLocator, { provider: 'github' }>,
    token: string,
  ): Promise<ReviewSnapshot> {
    const client = this.createGitHubClientFactory({
      baseUrl: locator.host,
      token,
      fetchImpl: this.fetchImpl,
    });
    const [detail, files, reviewComments, issueComments] = await Promise.all([
      client.fetchPullRequestDetail(locator.owner, locator.repo, locator.pullNumber),
      client.fetchPullRequestFiles(locator.owner, locator.repo, locator.pullNumber),
      client.fetchPullRequestComments(locator.owner, locator.repo, locator.pullNumber),
      client.fetchIssueComments(locator.owner, locator.repo, locator.pullNumber),
    ]);

    return adaptGitHubSnapshot({
      snapshotId: nextSnapshotId(locator),
      source,
      locator,
      detail,
      files,
      reviewComments,
      issueComments,
    });
  }

  private async fetchGitLabSnapshot(
    source: ReviewSourceDraft,
    locator: Extract<ReviewSourceLocator, { provider: 'gitlab' }>,
    token: string,
  ): Promise<ReviewSnapshot> {
    const client = this.createGitLabClientFactory({
      baseUrl: locator.host,
      token,
      fetchImpl: this.fetchImpl,
    });
    const [detail, diffs, discussions] = await Promise.all([
      client.fetchMergeRequestDetail(locator.projectPathOrId, locator.mergeRequestIid),
      client.fetchMergeRequestDiffs(locator.projectPathOrId, locator.mergeRequestIid),
      client.fetchMergeRequestDiscussions(locator.projectPathOrId, locator.mergeRequestIid),
    ]);

    return adaptGitLabSnapshot({
      snapshotId: nextSnapshotId(locator),
      source,
      locator,
      detail,
      diffs,
      discussions,
    });
  }
}
