import type {
  AwaitDraftReviewResultInput,
  AwaitDraftReviewResultResult,
  AwaitDraftThreadReplyResultInput,
  AwaitDraftThreadReplyResultResult,
  BeginDraftReviewInput,
  BeginDraftReviewResult,
  BeginDraftThreadReplyInput,
  BeginDraftThreadReplyResult,
  CreateReviewThreadResult,
  HydrateReviewFileResult,
  LoadReviewSourceResult,
  PreparePublishDraftsResult,
  PublishDraftsResult,
  ReplyReviewThreadResult,
  UpdatePublishDraftsResult,
} from '../../shared/contracts/review-ipc';
import type {
  ReviewAnchor,
  ReviewComment,
  ReviewSnapshot,
  ReviewSnapshotFile,
  ReviewSnapshotThread,
  ReviewSourceDraft,
  ReviewSourceLocator,
} from '../../shared/domain/review';
import type {
  ReviewDraftEnvelope,
  ReviewLocalThread,
  ReviewRunRecord,
  ReviewSummaryDraft,
  ReviewThreadReplyRecord,
} from '../../shared/domain/review-draft';
import type { ReviewPublishDraft } from '../../shared/domain/review-publish';
import type { AgentGateway } from '../agent-gateway/agent-gateway';
import { adaptGitHubSnapshot } from './adapters/github-snapshot-adapter';
import { adaptGitLabSnapshot } from './adapters/gitlab-snapshot-adapter';
import { createGitHubReviewClient, type GitHubReviewClient } from './clients/github-review-client';
import { createGitLabReviewClient, type GitLabReviewClient } from './clients/gitlab-review-client';
import { hydrateReviewFileContent } from './file-content-loader';
import type { FetchLike } from './request-json';
import type { ReviewContextAssembler } from './review-context-assembler';
import { ReviewDraftStore } from './review-draft-store';
import {
  ReviewGatewayError,
  type ReviewGatewayErrorCode,
  resolveProviderToken,
} from './review-gateway-error';
import type { ReviewResultNormalizer } from './review-result-normalizer';
import { ReviewRunCoordinator } from './review-run-coordinator';
import { ReviewThreadReplyCoordinator } from './review-thread-reply-coordinator';
import { ReviewAnchorValidator } from './review-anchor-validator';
import { ReviewPublishDraftAssembler } from './review-publish-draft-assembler';
import { ReviewPublishCoordinator } from './review-publish-coordinator';
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
  agentGateway?: Pick<
    AgentGateway,
    'awaitSettled' | 'continueConversation' | 'forkSession' | 'sendFollowUp' | 'startSession'
  >;
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
  contextAssembler?: ReviewContextAssembler;
  draftStore?: ReviewDraftStore;
  resultNormalizer?: ReviewResultNormalizer;
  cwdResolver?: () => string;
  now?: () => string;
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
  private readonly draftStore: ReviewDraftStore;
  private readonly reviewRunCoordinator: ReviewRunCoordinator | null;
  private readonly threadReplyCoordinator: ReviewThreadReplyCoordinator | null;
  private readonly publishCoordinator: ReviewPublishCoordinator;
  private threadIdCounter = 0;
  private commentIdCounter = 0;
  private readonly activeDraftReviews = new Map<string, Promise<ReviewDraftEnvelope>>();
  private readonly activeDraftThreadReplies = new Map<string, Promise<ReviewLocalThread>>();
  private readonly completedDraftThreadReplies = new Map<string, ReviewLocalThread>();
  private readonly draftThreadReplyRecords = new Map<string, ReviewThreadReplyRecord>();

  constructor(dependencies: ReviewGatewayDependencies = {}) {
    this.fetchImpl = dependencies.fetchImpl;
    this.tokenResolver = dependencies.tokenResolver ?? resolveProviderToken;
    this.createGitHubClientFactory = dependencies.createGitHubClient ?? createGitHubReviewClient;
    this.createGitLabClientFactory = dependencies.createGitLabClient ?? createGitLabReviewClient;
    this.hydrateFileContent = dependencies.hydrateFileContent ?? hydrateReviewFileContent;
    this.draftStore = dependencies.draftStore ?? new ReviewDraftStore();
    this.reviewRunCoordinator = dependencies.agentGateway
      ? new ReviewRunCoordinator({
          agentGateway: dependencies.agentGateway,
          contextAssembler: dependencies.contextAssembler,
          draftStore: this.draftStore,
          resultNormalizer: dependencies.resultNormalizer,
          now: dependencies.now,
          cwdResolver: dependencies.cwdResolver,
        })
      : null;
    this.threadReplyCoordinator = dependencies.agentGateway
      ? new ReviewThreadReplyCoordinator({
          agentGateway: dependencies.agentGateway,
          draftStore: this.draftStore,
          now: dependencies.now,
          cwdResolver: dependencies.cwdResolver,
        })
      : null;
    const anchorValidator = new ReviewAnchorValidator();
    const assembler = new ReviewPublishDraftAssembler();
    this.publishCoordinator = new ReviewPublishCoordinator({
      createGitHubClient: dependencies.createGitHubClient,
      createGitLabClient: dependencies.createGitLabClient,
      draftStore: this.draftStore,
      assembler,
      anchorValidator,
      fetchImpl: dependencies.fetchImpl,
      now: dependencies.now,
    });
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

  async beginDraftReview(input: BeginDraftReviewInput): Promise<BeginDraftReviewResult> {
    if (!this.reviewRunCoordinator) {
      throw new ReviewGatewayError(
        'SNAPSHOT_NOT_FOUND',
        'ReviewGateway is not configured with an AgentGateway.',
      );
    }

    const session = this.requireSession(input.snapshotId);
    const hydrateFile = async (fileId: string) => {
      const result = await this.hydrateReviewFile(input.snapshotId, fileId);
      return result.file;
    };
    const begun = await this.reviewRunCoordinator.beginDraftReview({
      snapshot: session.snapshot,
      reviewAgent: input.reviewAgent,
      instructions: input.instructions,
      lensId: input.lensId ?? 'general',
      cwd: input.cwd?.trim() || process.cwd(),
      hydrateFile,
    });
    const resultPromise = this.reviewRunCoordinator.awaitDraftReviewResult({
      snapshot: session.snapshot,
      run: begun.run,
      hydrateFile,
    });
    void resultPromise.catch(() => undefined);
    this.activeDraftReviews.set(begun.run.runId, resultPromise);

    return {
      run: begun.run,
      session: begun.session,
    };
  }

  async awaitDraftReviewResult(
    input: AwaitDraftReviewResultInput,
  ): Promise<AwaitDraftReviewResultResult> {
    const resultPromise = this.activeDraftReviews.get(input.runId);
    if (!resultPromise) {
      const envelope = this.draftStore.getEnvelopeByRunId(input.runId);
      if (envelope) {
        return { result: envelope };
      }
      throw new ReviewGatewayError('SNAPSHOT_NOT_FOUND', `Review run not found: ${input.runId}`);
    }

    try {
      const result = await resultPromise;
      return { result };
    } finally {
      this.activeDraftReviews.delete(input.runId);
    }
  }

  async beginDraftThreadReply(
    input: BeginDraftThreadReplyInput,
  ): Promise<BeginDraftThreadReplyResult> {
    if (!this.threadReplyCoordinator) {
      throw new ReviewGatewayError(
        'SNAPSHOT_NOT_FOUND',
        'ReviewGateway is not configured with an AgentGateway.',
      );
    }

    const session = this.requireSession(input.snapshotId);
    const thread = this.draftStore.getLocalThread(input.snapshotId, input.localThreadId);
    if (!thread) {
      throw new ReviewGatewayError(
        'THREAD_NOT_FOUND',
        `Draft thread not found: ${input.localThreadId}`,
      );
    }

    const run = this.resolveRun(input.snapshotId, thread.runId);
    const summary = this.resolveSummary(run.runId);
    const hydrateFile = async (fileId: string) => {
      const result = await this.hydrateReviewFile(input.snapshotId, fileId);
      return result.file;
    };

    const begun = await this.threadReplyCoordinator.beginDraftThreadReply({
      snapshot: session.snapshot,
      run,
      summary,
      localThreadId: input.localThreadId,
      body: input.body,
      cwd: input.cwd?.trim() || process.cwd(),
      hydrateFile,
    });
    this.draftThreadReplyRecords.set(begun.reply.replyId, structuredClone(begun.reply));
    const resultPromise = this.threadReplyCoordinator
      .awaitDraftThreadReplyResult({
        replyId: begun.reply.replyId,
        snapshotId: begun.reply.snapshotId,
        localThreadId: begun.reply.localThreadId,
        appSessionId: begun.reply.appSessionId,
      })
      .then((resolvedThread) => {
        this.completedDraftThreadReplies.set(begun.reply.replyId, structuredClone(resolvedThread));
        return resolvedThread;
      });
    void resultPromise.catch(() => undefined);
    this.activeDraftThreadReplies.set(begun.reply.replyId, resultPromise);

    return begun;
  }

  async awaitDraftThreadReplyResult(
    input: AwaitDraftThreadReplyResultInput,
  ): Promise<AwaitDraftThreadReplyResultResult> {
    const resultPromise = this.activeDraftThreadReplies.get(input.replyId);
    if (resultPromise) {
      try {
        const thread = await resultPromise;
        return { thread };
      } finally {
        this.activeDraftThreadReplies.delete(input.replyId);
      }
    }

    const completedThread = this.completedDraftThreadReplies.get(input.replyId);
    if (completedThread) {
      return {
        thread: structuredClone(completedThread),
      };
    }

    const replyRecord = this.draftThreadReplyRecords.get(input.replyId);
    if (replyRecord) {
      const thread = this.draftStore.getLocalThread(
        replyRecord.snapshotId,
        replyRecord.localThreadId,
      );
      if (thread) {
        return { thread };
      }
    }

    throw new ReviewGatewayError(
      'THREAD_NOT_FOUND',
      `Draft thread reply not found: ${input.replyId}`,
    );
  }

  preparePublishDrafts(snapshotId: string): PreparePublishDraftsResult {
    const session = this.requireSession(snapshotId);
    const localThreads = this.draftStore.getLocalThreads(snapshotId);
    const drafts = this.publishCoordinator.preparePublishDrafts(snapshotId, localThreads);
    void session;
    return { drafts };
  }

  updatePublishDrafts(snapshotId: string, drafts: ReviewPublishDraft[]): UpdatePublishDraftsResult {
    this.requireSession(snapshotId);
    const updated = this.publishCoordinator.updatePublishDrafts(snapshotId, drafts);
    return { drafts: updated };
  }

  async publishDrafts(snapshotId: string, publishDraftIds: string[]): Promise<PublishDraftsResult> {
    const session = this.requireSession(snapshotId);

    const { result, remoteThreads } = await this.publishCoordinator.publishDrafts(
      {
        snapshotId,
        locator: session.locator,
        snapshot: session.snapshot,
        token: session.token,
      },
      publishDraftIds,
    );

    if (remoteThreads.length > 0) {
      session.snapshot = {
        ...session.snapshot,
        discussions: [...session.snapshot.discussions, ...remoteThreads],
      };
      this.sessions.set(snapshotId, session);
    }

    return { result };
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

  private resolveRun(snapshotId: string, runId: string): ReviewRunRecord {
    const run = this.draftStore.getRuns(snapshotId).find((candidate) => candidate.runId === runId);
    if (!run) {
      throw new ReviewGatewayError('SNAPSHOT_NOT_FOUND', `Review run not found: ${runId}`);
    }
    return run;
  }

  private resolveSummary(runId: string): ReviewSummaryDraft | null {
    const envelope = this.draftStore.getEnvelopeByRunId(runId);
    if (!envelope || envelope.kind !== 'structured') {
      return null;
    }
    return envelope.summary;
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
