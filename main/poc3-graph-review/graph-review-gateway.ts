import { randomUUID } from 'crypto';
import fs from 'fs';
import path from 'path';
import type {
  AgentReviewRunCommitSnapshot,
  AwaitAgentReviewResultInput,
  AwaitAgentReviewResultResult,
  AwaitAgentReviewThreadReplyResultInput,
  AwaitAgentReviewThreadReplyResultResult,
  BeginAgentReviewThreadReplyInput,
  BeginAgentReviewThreadReplyResult,
  GetAgentReviewRunDetailInput,
  GetAgentReviewRunDetailResult,
  ListAgentReviewRunsInput,
  ListAgentReviewRunsResult,
  ListAgentThreadConversationsInput,
  ListAgentThreadConversationsResult,
  ListOutdatedAgentThreadsInput,
  ListOutdatedAgentThreadsResult,
  LoadAgentThreadConversationInput,
  LoadAgentThreadConversationResult,
  LoadNodeDetailInput,
  LoadNodeDetailResult,
  LoadNodeCompanionDetailInput,
  LoadNodeCompanionDetailResult,
  LoadWorkspaceGraphInput,
  LoadWorkspaceGraphResult,
  LoadWorkspaceRevisionsInput,
  LoadWorkspaceRevisionsResult,
  OpenWorkspaceInEditorInput,
  OpenWorkspaceInEditorResult,
  RemoveReviewWorkspaceInput,
  RemoveReviewWorkspaceResult,
  RefreshWorkspaceRevisionsInput,
  RefreshWorkspaceRevisionsResult,
  StartAgentReviewInput,
  StartAgentReviewResult,
  RetryGraphAnalysisInput,
  RetryGraphAnalysisResult,
  RevisionRefreshEvent,
  SelectWorkspaceRevisionInput,
  SelectWorkspaceRevisionResult,
  PublishInlineCommentInput,
  PublishInlineCommentResult,
  ReplyRemoteCommentInput,
  ReplyRemoteCommentResult,
  ResolveAgentThreadInput,
  ResolveAgentThreadResult,
  ResolveRemoteThreadInput,
  ResolveRemoteThreadResult,
} from '../../shared/poc3-contracts/graph-review-ipc';
import type { AgentEventPayload, RespondPermissionInput } from '../../shared/contracts/agent-ipc';
import type {
  CodeGraphSnapshot,
  CodeCompanionFile,
  GraphAnalysisEvent,
  GraphDiagnostic,
  GraphNodeLayout,
  GraphRenderSnapshot,
  LayoutSnapshot,
} from '../../shared/poc3-domain/graph';
import { INITIAL_GRAPH_SCOPE_KEY } from '../../shared/poc3-domain/graph';
import type {
  Poc3AgentReviewEvent,
  Poc3AgentReviewRun,
  Poc3AgentReviewThread,
} from '../../shared/poc3-domain/agent-review';
import type { Poc3OutdatedAgentThread } from '../../shared/poc3-domain/thread-retention';
import type {
  AwaitResolveJudgementInput,
  AwaitResolveJudgementResult,
  ListResolveJudgementResultsInput,
  ListResolveJudgementResultsResult,
  StartResolveJudgementInput,
  StartResolveJudgementResult,
} from '../../shared/poc3-contracts/graph-review-ipc';
import type { ResolveJudgementEvent } from '../../shared/poc3-domain/resolve-judgement';
import type {
  PublicRepositoryProvider,
  RepositoryProfile,
  RepositoryProfileInput,
  RepositoryProfileValidationResult,
  RepositoryProviderConnectionResult,
  RepositoryProviderSecretInput,
  ResolveRepositoryProviderResult,
} from '../../shared/poc3-domain/repository';
import {
  repositoryLabelFromLocator,
  type ReviewWorkspace,
  type ReviewWorkspaceListItemAnalysisStatus,
  type ReviewWorkspaceListItemSetupStatus,
  type ResolveReviewWorkspaceTargetResult,
  type ReviewWorkspaceCreationJobSnapshot,
  type ReviewWorkspaceListItem,
  type WorkspaceCreationEvent,
} from '../../shared/poc3-domain/review-workspace';
import { apiEndpointForProvider } from './source/repository-url';
import { RepositoryProfileStore } from './workspace/repository-profile-store';
import {
  resolveLocatorForProvider,
  resolveRepositoryProviderCandidates,
} from './workspace/repository-profile-resolver';
import { validateRepositoryProfileInput } from './workspace/repository-profile-validator';
import { RepositoryProviderStore } from './workspace/repository-provider-store';
import { ReviewWorkspaceCreationCoordinator } from './workspace/review-workspace-creation-coordinator';
import { resolveReviewWorkspaceTarget } from './workspace/review-workspace-target-resolver';
import { removeWorktree } from './workspace/worktree-manager';
import { ExternalEditorLauncher } from './workspace/external-editor-launcher';
import { AnalysisCoordinator } from './analysis/analysis-coordinator';
import { Poc3AgentReviewCoordinator } from './agent/coordinator';
import { Poc3AgentReviewStore } from './agent/store';
import {
  Poc3AgentReviewThreadReplyCoordinator,
  Poc3ThreadReplyError,
} from './agent/thread-reply-coordinator';
import { fallbackGridLayout } from './layout/elk-layout-service';
import { resolveNodeDetail } from './node-detail/node-detail-resolver';
import { resolveNodeCompanionDetail } from './node-detail/node-companion-detail-resolver';
import { GraphReviewStore, type WorkspaceGraphRecord } from './store/graph-review-store';
import type { AgentGateway } from '../agent-gateway/agent-gateway';
import { RevisionRefreshCoordinator } from './revision/revision-refresh-coordinator';
import { RevisionViewBuilder } from './revision/revision-view-builder';
import { ThreadRetentionService } from './revision/thread-retention-service';
import {
  publishInlineComment as coordinatePublishInlineComment,
  replyRemoteComment as coordinateReplyRemoteComment,
} from './source/review-comment-publish-coordinator';
import { ResolveJudgementCoordinator } from './resolve-judgement/coordinator';
import { ResolveJudgementStore } from './resolve-judgement/store';
import { PublishedAgentThreadLinkStore } from './published-agent-thread/store';
import { buildPublishedThreadVisibility } from './published-agent-thread/visibility';
import { ThreadResolveCoordinator } from './source/review-thread-resolve-coordinator';

export interface CreateReviewWorkspaceInput {
  reviewUrl: string;
  repositoryProfileId: string;
}

function isForceRecoverableWorktreeRemoveError(message: string): boolean {
  const normalized = message.toLowerCase();
  return (
    normalized.includes('--force') ||
    normalized.includes('use force') ||
    normalized.includes('contains modified or untracked files') ||
    normalized.includes('contains modified files') ||
    normalized.includes('contains untracked files')
  );
}

function isOpenableDirectory(targetPath: string): boolean {
  const normalized = targetPath.trim();
  if (!normalized || !path.isAbsolute(normalized)) {
    return false;
  }
  try {
    return fs.statSync(normalized).isDirectory();
  } catch {
    return false;
  }
}

async function resolveOpenableWorktreePath(worktreePath: string): Promise<
  | { ok: true; path: string }
  | {
      ok: false;
      message: string;
    }
> {
  const normalized = worktreePath.trim();
  if (!normalized || !path.isAbsolute(normalized)) {
    return { ok: false, message: 'worktree が見つかりません。' };
  }
  try {
    const stat = await fs.promises.stat(normalized);
    if (!stat.isDirectory()) {
      return { ok: false, message: 'worktree が見つかりません。' };
    }
    return { ok: true, path: normalized };
  } catch {
    return { ok: false, message: 'worktree が見つかりません。' };
  }
}

export class GraphReviewGateway {
  private readonly providerStore: RepositoryProviderStore;
  private readonly profileStore: RepositoryProfileStore;
  private readonly graphStore: GraphReviewStore;
  private readonly agentReviewStore: Poc3AgentReviewStore;
  private readonly resolveJudgementStore: ResolveJudgementStore;
  private readonly publishedAgentThreadLinkStore: PublishedAgentThreadLinkStore;
  private readonly resolveJudgementCoordinator: ResolveJudgementCoordinator | null;
  private readonly agentReviewCoordinator: Poc3AgentReviewCoordinator | null;
  private readonly threadReplyCoordinator: Poc3AgentReviewThreadReplyCoordinator | null;
  private readonly analysisCoordinator: AnalysisCoordinator;
  private readonly creationCoordinator: ReviewWorkspaceCreationCoordinator;
  private readonly revisionViewBuilder: RevisionViewBuilder;
  private readonly threadRetentionService: ThreadRetentionService;
  private readonly revisionRefreshCoordinator: RevisionRefreshCoordinator;
  private readonly threadResolveCoordinator: ThreadResolveCoordinator;
  private readonly externalEditorLauncher: Pick<ExternalEditorLauncher, 'openWorkspace'>;
  private readonly renderSnapshotCache = new Map<string, GraphRenderSnapshot>();
  private readonly dbOnlyPurgeAllowedWorkspaceIds = new Set<string>();
  private removingWorkspaceId: string | null = null;

  constructor(
    userDataPath: string,
    private readonly emitWorkspaceCreationEvent: (event: WorkspaceCreationEvent) => void,
    private readonly emitGraphAnalysisEvent: (event: GraphAnalysisEvent) => void = () => undefined,
    private readonly emitAgentReviewEvent: (event: Poc3AgentReviewEvent) => void = () => undefined,
    private readonly emitRevisionRefreshEvent: (event: RevisionRefreshEvent) => void = () =>
      undefined,
    private readonly agentGateway?: Pick<
      AgentGateway,
      | 'startSession'
      | 'awaitSettled'
      | 'listSessions'
      | 'respondPermission'
      | 'continueConversation'
      | 'forkSession'
      | 'sendFollowUp'
    >,
    private readonly emitResolveJudgementEvent: (event: ResolveJudgementEvent) => void = () =>
      undefined,
    externalEditorLauncher: Pick<
      ExternalEditorLauncher,
      'openWorkspace'
    > = new ExternalEditorLauncher(),
  ) {
    this.externalEditorLauncher = externalEditorLauncher;
    this.providerStore = new RepositoryProviderStore(userDataPath);
    this.profileStore = new RepositoryProfileStore(userDataPath);
    this.graphStore = new GraphReviewStore(userDataPath);
    this.agentReviewStore = new Poc3AgentReviewStore(userDataPath);
    this.resolveJudgementStore = new ResolveJudgementStore(userDataPath);
    this.publishedAgentThreadLinkStore = new PublishedAgentThreadLinkStore(userDataPath);
    this.agentReviewCoordinator = this.agentGateway
      ? new Poc3AgentReviewCoordinator({
          agentGateway: this.agentGateway,
          store: this.agentReviewStore,
        })
      : null;
    this.threadReplyCoordinator = this.agentGateway
      ? new Poc3AgentReviewThreadReplyCoordinator({
          agentGateway: this.agentGateway,
          store: this.agentReviewStore,
        })
      : null;
    this.resolveJudgementCoordinator = this.agentGateway
      ? new ResolveJudgementCoordinator({
          graphStore: this.graphStore,
          agentReviewStore: this.agentReviewStore,
          publishedAgentThreadLinkStore: this.publishedAgentThreadLinkStore,
          agentGateway: this.agentGateway,
          resultStore: this.resolveJudgementStore,
        })
      : null;
    this.analysisCoordinator = new AnalysisCoordinator(this.graphStore, (event) => {
      if (event.type === 'graph.ready') {
        const revision = this.graphStore.getRevision(event.revisionId);
        if (revision?.isActive) {
          this.threadRetentionService.evaluate(revision.reviewWorkspaceId, revision.revisionId);
        }
      }
      this.emitGraphAnalysisEvent(event);
    });
    this.revisionViewBuilder = new RevisionViewBuilder(this.graphStore, this.agentReviewStore);
    this.threadRetentionService = new ThreadRetentionService(
      this.graphStore,
      this.agentReviewStore,
    );
    this.revisionRefreshCoordinator = new RevisionRefreshCoordinator({
      graphStore: this.graphStore,
      analysisCoordinator: this.analysisCoordinator,
      viewBuilder: this.revisionViewBuilder,
      threadRetention: this.threadRetentionService,
      markPublishedAgentThreadSyncResult: (input) =>
        this.publishedAgentThreadLinkStore.markSyncResult(input),
      emit: (event) => this.emitRevisionRefreshEvent(event),
      resolveProvider: (workspace) => {
        const profile = this.profileStore.get(workspace.repositoryProfileId);
        return profile ? (this.providerStore.get(profile.repositoryProviderId) ?? null) : null;
      },
      resolveProviderToken: (provider) => this.providerStore.getToken(provider.tokenRef),
      resolveProfile: (workspace) => this.profileStore.get(workspace.repositoryProfileId),
    });
    this.threadResolveCoordinator = new ThreadResolveCoordinator({
      graphStore: this.graphStore,
      agentReviewStore: this.agentReviewStore,
      publishedAgentThreadLinkStore: this.publishedAgentThreadLinkStore,
      profileStore: this.profileStore,
      providerStore: this.providerStore,
      clearWorkspaceCaches: (reviewWorkspaceId) => this.clearWorkspaceCaches(reviewWorkspaceId),
    });
    this.creationCoordinator = new ReviewWorkspaceCreationCoordinator({
      emit: (event) => this.emitWorkspaceCreationEvent(event),
      saveInitialWorkspaceBundle: (bundle) => this.graphStore.saveInitialWorkspaceBundle(bundle),
      runInitialGraphAnalysis: (analysisRunId, revisionId, onProgress) =>
        this.analysisCoordinator.runInitialGraphAnalysisAndWait(
          analysisRunId,
          revisionId,
          onProgress,
        ),
    });
  }

  resolveAgentThread(input: ResolveAgentThreadInput): Promise<ResolveAgentThreadResult> {
    return this.threadResolveCoordinator.resolveAgentThread(input);
  }

  resolveRemoteThread(input: ResolveRemoteThreadInput): Promise<ResolveRemoteThreadResult> {
    return this.threadResolveCoordinator.resolveRemoteThread(input);
  }

  listRepositoryProviders(): PublicRepositoryProvider[] {
    return this.providerStore.list();
  }

  saveRepositoryProvider(input: RepositoryProviderSecretInput): PublicRepositoryProvider {
    return this.providerStore.save(input);
  }

  async testRepositoryProvider(
    input: RepositoryProviderSecretInput,
  ): Promise<RepositoryProviderConnectionResult> {
    let token = input.token?.trim() ?? '';
    if (!token && input.repositoryProviderId) {
      const current = this.providerStore.get(input.repositoryProviderId);
      token = current ? (this.providerStore.getToken(current.tokenRef) ?? '') : '';
    }
    if (!token) {
      return {
        ok: false,
        statusCode: null,
        message: 'Token が入力されていません。',
      };
    }

    let endpoint: string;
    try {
      endpoint = apiEndpointForProvider(input.kind, input.baseUrl);
    } catch (err) {
      return {
        ok: false,
        statusCode: null,
        message: err instanceof Error ? err.message : 'Base URL を解釈できません。',
      };
    }

    const url = input.kind === 'github' ? `${endpoint}/rate_limit` : `${endpoint}/user`;
    try {
      const response = await fetch(url, {
        headers:
          input.kind === 'github'
            ? {
                Accept: 'application/vnd.github+json',
                Authorization: `Bearer ${token}`,
              }
            : {
                'PRIVATE-TOKEN': token,
              },
      });

      return {
        ok: response.ok,
        statusCode: response.status,
        message: response.ok
          ? 'Provider へ接続できました。'
          : `Provider への接続に失敗しました。HTTP ${response.status}`,
      };
    } catch (err) {
      return {
        ok: false,
        statusCode: null,
        message: err instanceof Error ? err.message : 'Provider への接続に失敗しました。',
      };
    }
  }

  listRepositoryProfiles(): RepositoryProfile[] {
    return this.profileStore.list();
  }

  resolveRepositoryProvider(originUrl: string): ResolveRepositoryProviderResult {
    return resolveRepositoryProviderCandidates(originUrl, this.providerStore.listInternal());
  }

  async validateRepositoryProfile(
    input: RepositoryProfileInput,
  ): Promise<RepositoryProfileValidationResult> {
    return validateRepositoryProfileInput(
      input,
      this.providerStore.get(input.repositoryProviderId),
    );
  }

  async saveRepositoryProfile(input: RepositoryProfileInput): Promise<RepositoryProfile> {
    const provider = this.providerStore.get(input.repositoryProviderId);
    const validation = await validateRepositoryProfileInput(input, provider);
    if (!validation.ok || !provider) {
      const message = validation.issues[0]?.message ?? 'Repository Profile を保存できません。';
      throw new Error(message);
    }

    const resolved = resolveLocatorForProvider(input.originUrl, provider);
    return this.profileStore.save({
      ...input,
      originUrl: resolved.normalizedOriginUrl,
      resolvedProvider: {
        kind: provider.kind,
        baseUrl: provider.baseUrl,
        host: resolved.host,
      },
      repoLocator: resolved.repoLocator,
    });
  }

  resolveReviewWorkspaceTarget(reviewUrl: string): ResolveReviewWorkspaceTargetResult {
    return resolveReviewWorkspaceTarget(
      reviewUrl,
      this.providerStore.listInternal(),
      this.profileStore.list(),
    );
  }

  listReviewWorkspaces(): ReviewWorkspaceListItem[] {
    return this.graphStore.listWorkspaces().map((workspace) => this.toListItem(workspace));
  }

  createReviewWorkspace(input: CreateReviewWorkspaceInput): ReviewWorkspaceCreationJobSnapshot {
    if (this.removingWorkspaceId) {
      throw new Error('Workspace の削除処理が進行中です。');
    }

    const resolution = this.resolveReviewWorkspaceTarget(input.reviewUrl);
    if (!resolution.ok || !resolution.target) {
      throw new Error(resolution.message ?? 'Review URL を解決できません。');
    }
    if (resolution.target.repositoryProfileId !== input.repositoryProfileId) {
      throw new Error('指定された Repository Profile が Review URL と一致しません。');
    }

    const provider = this.providerStore.get(resolution.target.repositoryProviderId);
    if (!provider) {
      throw new Error('Repository Provider が見つかりません。');
    }
    const token = this.providerStore.getToken(provider.tokenRef);
    if (!token) {
      throw new Error('Provider token を解決できませんでした。');
    }
    const profile = this.profileStore.get(input.repositoryProfileId);
    if (!profile) {
      throw new Error('Repository Profile が見つかりません。');
    }

    return this.creationCoordinator.startJob({
      jobId: randomUUID(),
      reviewUrl: resolution.target.reviewUrl,
      repositoryProfileId: resolution.target.repositoryProfileId,
      target: resolution.target,
      provider,
      profile,
      providerToken: token,
    });
  }

  async removeReviewWorkspace(
    input: RemoveReviewWorkspaceInput,
  ): Promise<RemoveReviewWorkspaceResult> {
    const reviewWorkspaceId = input.reviewWorkspaceId.trim();
    if (this.removingWorkspaceId) {
      return {
        ok: false,
        reviewWorkspaceId,
        reason: 'gitFailed',
        message: 'Workspace の削除処理が進行中です。',
      };
    }
    if (this.revisionRefreshCoordinator.isRefreshing(reviewWorkspaceId)) {
      return {
        ok: false,
        reviewWorkspaceId,
        reason: 'lockHeld',
        message: 'Revision refresh が進行中のため Workspace を削除できません。',
      };
    }

    const workspace = this.graphStore.getWorkspace(reviewWorkspaceId);
    if (!workspace) {
      return {
        ok: false,
        reviewWorkspaceId,
        reason: 'notFound',
        message: 'Review Workspace が見つかりません。',
      };
    }

    const worktreeExists = fs.existsSync(workspace.worktreePath);
    if (input.purgeDbOnly === true) {
      if (worktreeExists && !this.dbOnlyPurgeAllowedWorkspaceIds.has(reviewWorkspaceId)) {
        return {
          ok: false,
          reviewWorkspaceId,
          reason: 'gitFailed',
          message:
            'DB レコードのみの削除は、孤児 Workspace または直前に git worktree remove が失敗した Workspace に限定されています。',
        };
      }
      this.graphStore.deleteWorkspaceBundle(reviewWorkspaceId);
      this.agentReviewStore.deleteWorkspaceRuns(reviewWorkspaceId);
      this.resolveJudgementStore.deleteWorkspace(reviewWorkspaceId);
      this.publishedAgentThreadLinkStore.deleteWorkspaceLinks(reviewWorkspaceId);
      this.clearWorkspaceCaches(reviewWorkspaceId);
      this.dbOnlyPurgeAllowedWorkspaceIds.delete(reviewWorkspaceId);
      return { ok: true, reviewWorkspaceId };
    }

    const profile = this.profileStore.get(workspace.repositoryProfileId);
    if (!profile) {
      return {
        ok: false,
        reviewWorkspaceId,
        reason: 'notFound',
        message: 'Repository Profile が見つかりません。',
      };
    }

    const force = input.force === true;
    this.removingWorkspaceId = reviewWorkspaceId;
    try {
      await removeWorktree(profile.localClonePath, workspace.worktreePath, force);
      this.graphStore.deleteWorkspaceBundle(reviewWorkspaceId);
      this.agentReviewStore.deleteWorkspaceRuns(reviewWorkspaceId);
      this.resolveJudgementStore.deleteWorkspace(reviewWorkspaceId);
      this.publishedAgentThreadLinkStore.deleteWorkspaceLinks(reviewWorkspaceId);
      this.clearWorkspaceCaches(reviewWorkspaceId);
      this.dbOnlyPurgeAllowedWorkspaceIds.delete(reviewWorkspaceId);
      return { ok: true, reviewWorkspaceId };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'git worktree remove が失敗しました。';
      const reason =
        !force && isForceRecoverableWorktreeRemoveError(message) ? 'forceRequired' : 'lockHeld';
      if (reason === 'lockHeld') {
        this.dbOnlyPurgeAllowedWorkspaceIds.add(reviewWorkspaceId);
      }
      return {
        ok: false,
        reviewWorkspaceId,
        reason,
        message,
      };
    } finally {
      if (this.removingWorkspaceId === reviewWorkspaceId) {
        this.removingWorkspaceId = null;
      }
    }
  }

  async openWorkspaceInEditor(
    input: OpenWorkspaceInEditorInput,
  ): Promise<OpenWorkspaceInEditorResult> {
    if (!input || typeof input.reviewWorkspaceId !== 'string') {
      return {
        ok: false,
        reason: 'workspaceNotFound',
        message: 'Workspace が見つかりません。',
      };
    }
    const reviewWorkspaceId = input.reviewWorkspaceId.trim();
    const workspace = this.graphStore.getWorkspace(reviewWorkspaceId);
    if (!workspace) {
      return {
        ok: false,
        reason: 'workspaceNotFound',
        message: 'Workspace が見つかりません。',
      };
    }
    if (this.removingWorkspaceId === reviewWorkspaceId) {
      return {
        ok: false,
        reason: 'worktreeUnavailable',
        message: 'worktree が見つかりません。',
      };
    }

    const worktree = await resolveOpenableWorktreePath(workspace.worktreePath);
    if (!worktree.ok) {
      return {
        ok: false,
        reason: 'worktreeUnavailable',
        message: worktree.message,
      };
    }

    try {
      const result = await this.externalEditorLauncher.openWorkspace({
        editor: input.editor ?? 'vscode',
        mode: input.mode ?? 'newWindow',
        worktreePath: worktree.path,
      });
      if (result.ok) {
        return { ok: true };
      }
      return result;
    } catch (err) {
      return {
        ok: false,
        reason: 'launchFailed',
        message: err instanceof Error ? err.message : 'VS Code の起動に失敗しました。',
      };
    }
  }

  listWorkspaceCreationJobs(): ReviewWorkspaceCreationJobSnapshot[] {
    return this.creationCoordinator.listJobs();
  }

  loadWorkspaceGraph(input: LoadWorkspaceGraphInput): LoadWorkspaceGraphResult {
    const reviewWorkspaceId = input.reviewWorkspaceId.trim();
    const scopeKey = input.scopeKey ?? INITIAL_GRAPH_SCOPE_KEY;
    const record = this.graphStore.getWorkspaceGraphRecord(reviewWorkspaceId, scopeKey);
    if (!record) {
      return {
        ok: false,
        reason: 'workspaceNotFound',
        message: 'Review Workspace が見つかりません。',
        analysis: null,
      };
    }
    if (!record.activeRevision) {
      return {
        ok: false,
        reason: 'revisionNotFound',
        message: 'Active revision が見つかりません。',
        analysis: null,
        revision: null,
      };
    }
    if (record.analysis?.status === 'failed') {
      return {
        ok: false,
        reason: 'analysisFailed',
        message: record.analysis.errorMessage ?? 'Graph analysis が失敗しました。',
        analysis: record.analysis,
        revision: record.activeRevision,
      };
    }
    if (
      !record.analysis ||
      record.analysis.status === 'queued' ||
      record.analysis.status === 'running'
    ) {
      return {
        ok: false,
        reason: 'graphNotReady',
        message: 'Graph analysis がまだ完了していません。',
        analysis: record.analysis,
        revision: record.activeRevision,
      };
    }
    if (!record.graph) {
      return {
        ok: false,
        reason: 'graphNotReady',
        message: 'Graph snapshot がまだ保存されていません。',
        analysis: record.analysis,
        revision: record.activeRevision,
      };
    }

    const renderSnapshot = this.getRenderSnapshot(reviewWorkspaceId, scopeKey, record);
    return {
      ok: true,
      workspace: this.toListItem(record.workspace),
      revision: record.activeRevision,
      analysis: record.analysis,
      graph: renderSnapshot,
    };
  }

  loadNodeDetail(input: LoadNodeDetailInput): LoadNodeDetailResult {
    const reviewWorkspaceId = input.reviewWorkspaceId.trim();
    const scopeKey = input.scopeKey ?? INITIAL_GRAPH_SCOPE_KEY;
    const nodeId = input.nodeId.trim();
    if (!nodeId) {
      return {
        ok: false,
        reason: 'nodeNotFound',
        message: 'nodeId が指定されていません。',
        detail: null,
      };
    }
    const record = this.graphStore.getWorkspaceGraphRecord(reviewWorkspaceId, scopeKey);
    if (!record) {
      return {
        ok: false,
        reason: 'workspaceNotFound',
        message: 'Review Workspace が見つかりません。',
        detail: null,
      };
    }
    if (!record.activeRevision) {
      return {
        ok: false,
        reason: 'revisionNotFound',
        message: 'Active revision が見つかりません。',
        detail: null,
      };
    }
    if (!record.graph) {
      return {
        ok: false,
        reason: 'graphNotReady',
        message: 'Graph snapshot がまだ保存されていません。',
        detail: null,
      };
    }
    const renderSnapshot = this.getRenderSnapshot(reviewWorkspaceId, scopeKey, record);
    const sourceSnapshot = this.graphStore.getSourceSnapshotByRevision(
      record.activeRevision.revisionId,
    );
    const agentThreads = this.agentReviewStore.listThreadsForNode({
      reviewWorkspaceId,
      revisionId: record.activeRevision.revisionId,
      nodeId,
    });
    const outdatedAgentThreads = this.threadRetentionService.listOutdated(reviewWorkspaceId);
    const resolved = resolveNodeDetail({
      workspace: record.workspace,
      revisionId: record.activeRevision.revisionId,
      scopeKey,
      nodeId,
      viewMode: input.viewMode,
      record,
      renderSnapshot,
      sourceSnapshot,
      agentThreads,
      outdatedAgentThreads,
      publishedAgentThreadLinks:
        this.publishedAgentThreadLinkStore.listLinksForWorkspace(reviewWorkspaceId),
      runById: new Map(
        this.agentReviewStore.listRuns(reviewWorkspaceId).map((run) => [run.runId, run] as const),
      ),
    });
    if (resolved.ok && resolved.detail) {
      return { ok: true, detail: resolved.detail };
    }
    return {
      ok: false,
      reason: resolved.reason ?? 'detailUnavailable',
      message: resolved.message ?? 'Node detail を解決できませんでした。',
      detail: resolved.detail,
    };
  }

  loadNodeCompanionDetail(input: LoadNodeCompanionDetailInput): LoadNodeCompanionDetailResult {
    const reviewWorkspaceId = input.reviewWorkspaceId.trim();
    const scopeKey = input.scopeKey ?? INITIAL_GRAPH_SCOPE_KEY;
    const ownerNodeId = input.ownerNodeId.trim();
    const relationId = input.relationId.trim();
    const record = this.graphStore.getWorkspaceGraphRecord(reviewWorkspaceId, scopeKey);
    if (!record) {
      return {
        ok: false,
        reason: 'workspaceNotFound',
        message: 'Review Workspace が見つかりません。',
        detail: null,
      };
    }
    if (!record.activeRevision) {
      return {
        ok: false,
        reason: 'revisionNotFound',
        message: 'Active revision が見つかりません。',
        detail: null,
      };
    }
    if (!record.graph) {
      return {
        ok: false,
        reason: 'graphNotReady',
        message: 'Graph snapshot がまだ保存されていません。',
        detail: null,
      };
    }
    const renderSnapshot = this.getRenderSnapshot(reviewWorkspaceId, scopeKey, record);
    const sourceSnapshot = this.graphStore.getSourceSnapshotByRevision(
      record.activeRevision.revisionId,
    );
    const ownerNode = renderSnapshot.nodes.find((node) => node.nodeId === ownerNodeId);
    const companion = (record.graph.companionFiles ?? []).find(
      (item) =>
        item.relationId === relationId &&
        (item.ownerNodeId === ownerNodeId || item.ownerFilePath === ownerNode?.filePath),
    );
    const agentThreads = this.agentReviewStore
      .listThreadsForWorkspace({
        reviewWorkspaceId,
        revisionId: record.activeRevision.revisionId,
      })
      .filter((thread) => {
        if (!companion) return false;
        return (
          companion.hiddenNodeIds.includes(thread.nodeId ?? '') ||
          (thread.location.kind === 'diff' &&
            thread.location.filePath === companion.companionFilePath)
        );
      });
    const resolved = resolveNodeCompanionDetail({
      workspace: record.workspace,
      revisionId: record.activeRevision.revisionId,
      scopeKey,
      ownerNodeId,
      relationId,
      record,
      renderSnapshot,
      sourceSnapshot,
      agentThreads,
      publishedAgentThreadLinks:
        this.publishedAgentThreadLinkStore.listLinksForWorkspace(reviewWorkspaceId),
    });
    if (resolved.ok) {
      return { ok: true, detail: resolved.detail };
    }
    return {
      ok: false,
      reason: resolved.reason,
      message: resolved.message,
      detail: resolved.detail,
    };
  }

  async startAgentReview(input: StartAgentReviewInput): Promise<StartAgentReviewResult> {
    if (!this.agentReviewCoordinator) {
      return {
        ok: false,
        reason: 'agentUnavailable',
        message: 'AgentGateway が設定されていません。',
        run: null,
        session: null,
      };
    }
    const reviewWorkspaceId = input.reviewWorkspaceId.trim();
    const scopeKey = input.scopeKey ?? INITIAL_GRAPH_SCOPE_KEY;
    const record = this.graphStore.getWorkspaceGraphRecord(reviewWorkspaceId, scopeKey);
    if (!record) {
      return {
        ok: false,
        reason: 'workspaceNotFound',
        message: 'Review Workspace が見つかりません。',
        run: null,
        session: null,
      };
    }
    if (!record.activeRevision) {
      return {
        ok: false,
        reason: 'revisionNotFound',
        message: 'Active revision が見つかりません。',
        run: null,
        session: null,
      };
    }
    if (!record.graph) {
      return {
        ok: false,
        reason: 'graphNotReady',
        message: 'Graph snapshot がまだ保存されていません。',
        run: null,
        session: null,
      };
    }

    const { run, session } = await this.agentReviewCoordinator.begin({
      reviewWorkspaceId,
      scopeKey,
      reviewAgent: input.agent,
      instructions: input.instructions,
      lensId: input.lensId,
      codexModel: input.agent === 'codex' ? input.codexModel : undefined,
      codexReasoningEffort: input.agent === 'codex' ? input.codexReasoningEffort : undefined,
      cwd: record.workspace.worktreePath,
      record,
    });
    this.emitAgentReviewEvent({ type: 'agent-review.started', run, session });
    void this.finalizeAgentReviewRun(run.runId);
    return { ok: true, run, session };
  }

  async respondAgentReviewPermission(input: RespondPermissionInput): Promise<void> {
    if (!this.agentGateway) {
      throw new Error('AgentGateway が設定されていません。');
    }
    await this.agentGateway.respondPermission(input);
  }

  handleAgentEvent(event: AgentEventPayload): void {
    if (!this.agentGateway) {
      return;
    }
    const binding = this.agentReviewStore.getBindingByDiscussionSession(event.appSessionId);
    if (binding) {
      const session = this.agentGateway
        .listSessions()
        .find((item) => item.appSessionId === event.appSessionId);
      if (session && this.threadReplyCoordinator) {
        this.emitAgentReviewEvent({
          type: 'agent-review.thread-reply.session',
          reviewWorkspaceId: binding.reviewWorkspaceId,
          revisionId: binding.revisionId,
          localThreadId: binding.localThreadId,
          replyId: this.threadReplyCoordinator.resolveLatestReplyId(binding.localThreadId) ?? '',
          session,
          agentEvent: event,
        });
      }
      return;
    }
    const run = this.agentReviewStore.getRunByAppSessionId(event.appSessionId);
    if (!run) {
      return;
    }
    const updatedRun = this.applyAgentEventToRun(run, event);
    if (updatedRun !== run) {
      this.agentReviewStore.saveRun(updatedRun);
    }
    const session = this.agentGateway
      .listSessions()
      .find((item) => item.appSessionId === event.appSessionId);
    if (session) {
      this.emitAgentReviewEvent({
        type: 'agent-review.session',
        run: updatedRun,
        session,
        agentEvent: event,
      });
    }
  }

  async beginAgentReviewThreadReply(
    input: BeginAgentReviewThreadReplyInput,
  ): Promise<BeginAgentReviewThreadReplyResult> {
    if (!this.threadReplyCoordinator) {
      return {
        ok: false,
        reason: 'agentUnavailable',
        message: 'AgentGateway が設定されていません。',
      };
    }
    const reviewWorkspaceId = input.reviewWorkspaceId.trim();
    const revisionId = input.revisionId.trim();
    const record = this.graphStore.getWorkspaceGraphRecord(
      reviewWorkspaceId,
      INITIAL_GRAPH_SCOPE_KEY,
    );
    if (!record) {
      return {
        ok: false,
        reason: 'workspaceNotFound',
        message: 'Review Workspace が見つかりません。',
      };
    }
    if (!record.activeRevision || record.activeRevision.revisionId !== revisionId) {
      return { ok: false, reason: 'revisionNotFound', message: 'Revision が見つかりません。' };
    }
    const sourceSnapshot = this.graphStore.getSourceSnapshotByRevision(revisionId);
    try {
      const begun = await this.threadReplyCoordinator.begin({
        reviewWorkspaceId,
        revisionId,
        localThreadId: input.localThreadId.trim(),
        body: input.body,
        cwd: record.workspace.worktreePath,
        record,
        sourceSnapshot,
      });
      this.emitAgentReviewEvent({ type: 'agent-review.thread-reply.started', ...begun });
      void this.finalizeThreadReply(begun.reply.replyId);
      return { ok: true, ...begun };
    } catch (error: unknown) {
      return this.toBeginThreadReplyError(error);
    }
  }

  async awaitAgentReviewThreadReplyResult(
    input: AwaitAgentReviewThreadReplyResultInput,
  ): Promise<AwaitAgentReviewThreadReplyResultResult> {
    if (!this.threadReplyCoordinator) {
      return {
        ok: false,
        reason: 'agentUnavailable',
        message: 'AgentGateway が設定されていません。',
      };
    }
    try {
      const conversation = await this.threadReplyCoordinator.awaitResult({
        replyId: input.replyId.trim(),
      });
      return { ok: true, conversation };
    } catch (error: unknown) {
      if (error instanceof Poc3ThreadReplyError && error.code === 'REPLY_NOT_FOUND') {
        return { ok: false, reason: 'replyNotFound', message: error.message };
      }
      return {
        ok: false,
        reason: 'agentFailed',
        message: error instanceof Error ? error.message : 'スレッド返信に失敗しました。',
      };
    }
  }

  loadAgentThreadConversation(
    input: LoadAgentThreadConversationInput,
  ): LoadAgentThreadConversationResult {
    const conversation =
      this.threadReplyCoordinator?.applyOverlay(
        this.agentReviewStore.buildConversation(input.localThreadId.trim()),
      ) ?? this.agentReviewStore.buildConversation(input.localThreadId.trim());
    if (!conversation || conversation.reviewWorkspaceId !== input.reviewWorkspaceId.trim()) {
      return {
        ok: false,
        reason: 'threadNotFound',
        message: 'Finding thread が見つかりません。',
      };
    }
    return { ok: true, conversation };
  }

  listAgentThreadConversations(
    input: ListAgentThreadConversationsInput,
  ): ListAgentThreadConversationsResult {
    return {
      conversations: this.agentReviewStore
        .buildConversationsForWorkspace(input.reviewWorkspaceId.trim(), input.revisionId.trim())
        .map(
          (conversation) => this.threadReplyCoordinator?.applyOverlay(conversation) ?? conversation,
        ),
    };
  }

  async awaitAgentReviewResult(
    input: AwaitAgentReviewResultInput,
  ): Promise<AwaitAgentReviewResultResult> {
    if (!this.agentReviewCoordinator) {
      return {
        ok: false,
        reason: 'agentUnavailable',
        message: 'AgentGateway が設定されていません。',
        envelope: null,
      };
    }
    const run = this.agentReviewStore.getRun(input.runId.trim());
    if (!run) {
      return {
        ok: false,
        reason: 'runNotFound',
        message: 'Agent Review run が見つかりません。',
        envelope: null,
      };
    }
    const existing = this.agentReviewStore.getEnvelope(run.runId);
    if (existing) {
      return { ok: true, envelope: existing };
    }
    const record = this.graphStore.getWorkspaceGraphRecord(run.reviewWorkspaceId, run.scopeKey);
    if (!record) {
      return {
        ok: false,
        reason: 'workspaceNotFound',
        message: 'Review Workspace が見つかりません。',
        envelope: null,
      };
    }
    if (!record.activeRevision) {
      return {
        ok: false,
        reason: 'revisionNotFound',
        message: 'Active revision が見つかりません。',
        envelope: null,
      };
    }
    if (!record.graph) {
      return {
        ok: false,
        reason: 'graphNotReady',
        message: 'Graph snapshot がまだ保存されていません。',
        envelope: null,
      };
    }
    const sourceSnapshot = this.graphStore.getSourceSnapshotByRevision(run.revisionId);
    if (!sourceSnapshot) {
      return {
        ok: false,
        reason: 'sourceSnapshotNotFound',
        message: 'Review source snapshot が見つかりません。',
        envelope: null,
      };
    }
    try {
      const envelope = await this.agentReviewCoordinator.awaitResult({
        run,
        record,
        sourceSnapshot,
      });
      this.clearWorkspaceCaches(run.reviewWorkspaceId);
      this.emitAgentReviewEvent({ type: 'agent-review.completed', envelope });
      return { ok: true, envelope };
    } catch (err) {
      const failedRun = this.agentReviewStore.getRun(run.runId) ?? {
        ...run,
        status: 'failed' as const,
        completedAt: new Date().toISOString(),
      };
      this.emitAgentReviewEvent({
        type: 'agent-review.failed',
        run: failedRun,
        message: err instanceof Error ? err.message : 'Agent Review が失敗しました。',
      });
      return {
        ok: false,
        reason: 'agentFailed',
        message: err instanceof Error ? err.message : 'Agent Review が失敗しました。',
        envelope: null,
      };
    }
  }

  listAgentReviewRuns(input: ListAgentReviewRunsInput): ListAgentReviewRunsResult {
    const runs = this.agentReviewStore.listRuns(input.reviewWorkspaceId.trim());
    return {
      runs: runs.map((run) => ({
        run,
        commit: this.resolveRunCommitSnapshot(run),
      })),
    };
  }

  getAgentReviewRunDetail(input: GetAgentReviewRunDetailInput): GetAgentReviewRunDetailResult {
    const reviewWorkspaceId = input.reviewWorkspaceId.trim();
    const runId = input.runId.trim();

    if (!this.graphStore.getWorkspace(reviewWorkspaceId)) {
      return {
        ok: false,
        reason: 'workspaceNotFound',
        message: 'Review Workspace が見つかりません。',
        detail: null,
      };
    }

    const run = this.agentReviewStore.getRun(runId);
    if (!run || run.reviewWorkspaceId !== reviewWorkspaceId) {
      return {
        ok: false,
        reason: 'runNotFound',
        message: 'Agent Review run が見つかりません。',
        detail: null,
      };
    }

    const envelope = this.agentReviewStore.getEnvelope(runId);
    const commit = this.resolveRunCommitSnapshot(run);
    return { ok: true, detail: { run, envelope, commit } };
  }

  private resolveRunCommitSnapshot(
    run: import('../../shared/poc3-domain/agent-review').Poc3AgentReviewRun,
  ): AgentReviewRunCommitSnapshot | null {
    const revision = this.graphStore.getRevision(run.revisionId);
    if (!revision) {
      return {
        revisionId: run.revisionId,
        headSha: run.revisionId,
        shortSha: run.revisionId.slice(0, 7),
        message: '(commit message unavailable)',
      };
    }

    const commitViews = this.graphStore.getRevisionCommitView(run.reviewWorkspaceId);
    const headCommit =
      commitViews.find((c) => c.revisionId === run.revisionId && c.role === 'head') ??
      commitViews.find((c) => c.sha === revision.headSha) ??
      null;

    if (headCommit) {
      return {
        revisionId: run.revisionId,
        headSha: headCommit.sha,
        shortSha: headCommit.shortSha,
        message: headCommit.message,
      };
    }

    return {
      revisionId: run.revisionId,
      headSha: revision.headSha,
      shortSha: revision.headSha.slice(0, 7),
      message: '(commit message unavailable)',
    };
  }

  private async finalizeAgentReviewRun(runId: string): Promise<void> {
    await this.awaitAgentReviewResult({ runId });
  }

  private async finalizeThreadReply(replyId: string): Promise<void> {
    if (!this.threadReplyCoordinator) {
      return;
    }
    const reply = this.agentReviewStore.getReplyRecord(replyId);
    try {
      const conversation = await this.threadReplyCoordinator.awaitResult({ replyId });
      this.emitAgentReviewEvent({
        type: 'agent-review.thread-reply.completed',
        reviewWorkspaceId: conversation.reviewWorkspaceId,
        revisionId: conversation.revisionId,
        localThreadId: conversation.localThreadId,
        replyId,
        conversation,
      });
    } catch (error: unknown) {
      if (!reply) {
        return;
      }
      this.emitAgentReviewEvent({
        type: 'agent-review.thread-reply.failed',
        reviewWorkspaceId: reply.reviewWorkspaceId,
        revisionId: reply.revisionId,
        localThreadId: reply.localThreadId,
        replyId,
        message: error instanceof Error ? error.message : 'スレッド返信に失敗しました。',
      });
    }
  }

  private toBeginThreadReplyError(error: unknown): BeginAgentReviewThreadReplyResult {
    if (!(error instanceof Poc3ThreadReplyError)) {
      return {
        ok: false,
        reason: 'agentUnavailable',
        message: error instanceof Error ? error.message : 'スレッド返信を開始できませんでした。',
      };
    }
    let reason: Extract<BeginAgentReviewThreadReplyResult, { ok: false }>['reason'];
    switch (error.code) {
      case 'EMPTY_BODY':
        reason = 'emptyBody';
        break;
      case 'REPLY_IN_FLIGHT':
        reason = 'replyAlreadyInFlight';
        break;
      case 'THREAD_NOT_FOUND':
      case 'REPLY_NOT_FOUND':
        reason = 'threadNotFound';
        break;
      case 'RUN_NOT_FOUND':
        reason = 'runNotFound';
        break;
      case 'FALLBACK_NOT_REPLYABLE':
        reason = 'fallbackRunNotReplyable';
        break;
      case 'AGENT_FAILED':
        reason = 'agentUnavailable';
        break;
    }
    return {
      ok: false,
      reason,
      message: error.message,
    };
  }

  private applyAgentEventToRun(
    run: Poc3AgentReviewRun,
    event: AgentEventPayload,
  ): Poc3AgentReviewRun {
    if (event.type !== 'status.changed') {
      return run;
    }
    const status =
      event.status === 'starting' ||
      event.status === 'running' ||
      event.status === 'waiting_permission' ||
      event.status === 'completed' ||
      event.status === 'failed'
        ? event.status
        : run.status;
    if (status === run.status) {
      return run;
    }
    return {
      ...run,
      status,
      completedAt:
        status === 'completed' || status === 'failed'
          ? (run.completedAt ?? new Date().toISOString())
          : run.completedAt,
    };
  }

  retryGraphAnalysis(input: RetryGraphAnalysisInput): RetryGraphAnalysisResult {
    const record = this.graphStore.getWorkspaceGraphRecord(
      input.reviewWorkspaceId.trim(),
      input.scopeKey ?? INITIAL_GRAPH_SCOPE_KEY,
    );
    if (!record) {
      return {
        ok: false,
        reason: 'workspaceNotFound',
        message: 'Review Workspace が見つかりません。',
        analysis: null,
      };
    }
    if (!record.activeRevision) {
      return {
        ok: false,
        reason: 'revisionNotFound',
        message: 'Active revision が見つかりません。',
        analysis: null,
      };
    }
    const sourceDiagnostics = record.analysis?.progress.sourceDiagnostics;
    const hasBlockingSourceDiagnostic =
      Array.isArray(sourceDiagnostics) &&
      sourceDiagnostics.some(
        (diagnostic) =>
          typeof diagnostic === 'object' &&
          diagnostic !== null &&
          'code' in diagnostic &&
          (diagnostic.code === 'CHANGED_FILES_LIMIT_EXCEEDED' ||
            diagnostic.code === 'DIFF_TRUNCATED'),
      );
    if (hasBlockingSourceDiagnostic) {
      return {
        ok: false,
        reason: 'enqueueFailed',
        message: '不完全な diff snapshot のため retry できません。',
        analysis: record.analysis,
      };
    }
    try {
      return {
        ok: true,
        analysis: this.analysisCoordinator.retryInitialGraphAnalysis(
          record.activeRevision.revisionId,
        ),
      };
    } catch (err) {
      return {
        ok: false,
        reason: 'enqueueFailed',
        message: err instanceof Error ? err.message : 'Graph analysis retry に失敗しました。',
        analysis: record.analysis,
      };
    }
  }

  loadWorkspaceRevisions(input: LoadWorkspaceRevisionsInput): LoadWorkspaceRevisionsResult {
    const view = this.revisionViewBuilder.build(input.reviewWorkspaceId.trim());
    if (!view) {
      return {
        ok: false,
        reason: 'workspaceNotFound',
        message: 'Review Workspace が見つかりません。',
        view: null,
      };
    }
    return { ok: true, view };
  }

  async refreshWorkspaceRevisions(
    input: RefreshWorkspaceRevisionsInput,
  ): Promise<RefreshWorkspaceRevisionsResult> {
    const reviewWorkspaceId = input.reviewWorkspaceId.trim();
    const result = await this.revisionRefreshCoordinator.refresh(reviewWorkspaceId);
    if (result.ok) {
      this.clearWorkspaceCaches(reviewWorkspaceId);
    }
    return result;
  }

  selectWorkspaceRevision(input: SelectWorkspaceRevisionInput): SelectWorkspaceRevisionResult {
    const reviewWorkspaceId = input.reviewWorkspaceId.trim();
    const revision = this.graphStore.getRevision(input.revisionId.trim());
    if (!this.graphStore.getWorkspace(reviewWorkspaceId)) {
      return {
        ok: false,
        reason: 'workspaceNotFound',
        message: 'Review Workspace が見つかりません。',
      };
    }
    if (!revision || revision.reviewWorkspaceId !== reviewWorkspaceId) {
      return {
        ok: false,
        reason: 'revisionNotFound',
        message: 'Revision が見つかりません。',
      };
    }
    const workspace = this.graphStore.getWorkspace(reviewWorkspaceId);
    if (!workspace) {
      return {
        ok: false,
        reason: 'workspaceNotFound',
        message: 'Review Workspace が見つかりません。',
      };
    }
    if (workspace.headSha !== revision.headSha) {
      return {
        ok: false,
        reason: 'analysisUnavailable',
        message:
          '過去 revision の worktree 同期は未対応です。最新 revision へ refresh してから表示してください。',
      };
    }
    this.graphStore.setActiveRevision(reviewWorkspaceId, revision.revisionId);
    this.clearWorkspaceCaches(reviewWorkspaceId);
    const graph = this.loadWorkspaceGraph({ reviewWorkspaceId });
    if (!graph.ok && graph.reason === 'graphNotReady') {
      return {
        ok: false,
        reason: 'analysisUnavailable',
        message: graph.message,
      };
    }
    const view = this.revisionViewBuilder.build(reviewWorkspaceId);
    if (!view) {
      return {
        ok: false,
        reason: 'workspaceNotFound',
        message: 'Review Workspace が見つかりません。',
      };
    }
    return { ok: true, view, graph };
  }

  listOutdatedAgentThreads(input: ListOutdatedAgentThreadsInput): ListOutdatedAgentThreadsResult {
    return {
      threads: this.threadRetentionService.listOutdated(input.reviewWorkspaceId.trim()),
    };
  }

  startResolveJudgement(input: StartResolveJudgementInput): StartResolveJudgementResult {
    if (!this.resolveJudgementCoordinator) {
      return {
        ok: false,
        reason: 'agentUnavailable',
        message: 'AgentGateway が設定されていません。',
        run: null,
      };
    }
    const result = this.resolveJudgementCoordinator.start({
      reviewWorkspaceId: input.reviewWorkspaceId,
      scopeKey: input.scopeKey,
      agent: input.agent,
      codexModel: input.codexModel,
      codexReasoningEffort: input.codexReasoningEffort,
    });
    if (!result.ok) {
      return result;
    }
    if (!result.reusedRunningRun && result.run.status !== 'completed') {
      this.emitResolveJudgementEvent({ type: 'resolve-judgement.started', run: result.run });
      void this.finalizeResolveJudgementRun(result.run.runId);
    }
    return { ok: true, run: result.run, reusedRunningRun: result.reusedRunningRun };
  }

  async awaitResolveJudgementResult(
    input: AwaitResolveJudgementInput,
  ): Promise<AwaitResolveJudgementResult> {
    if (!this.resolveJudgementCoordinator) {
      return {
        ok: false,
        reason: 'agentFailed',
        message: 'AgentGateway が設定されていません。',
        run: null,
        results: [],
      };
    }
    return this.resolveJudgementCoordinator.awaitResult({ runId: input.runId });
  }

  listResolveJudgementResults(
    input: ListResolveJudgementResultsInput,
  ): ListResolveJudgementResultsResult {
    if (!this.resolveJudgementCoordinator) {
      return { results: [], runningRun: null };
    }
    return this.resolveJudgementCoordinator.listResults({
      reviewWorkspaceId: input.reviewWorkspaceId,
      revisionId: input.revisionId,
    });
  }

  private async finalizeResolveJudgementRun(runId: string): Promise<void> {
    if (!this.resolveJudgementCoordinator) return;
    const outcome = await this.resolveJudgementCoordinator.awaitResult({ runId });
    if (outcome.ok) {
      this.emitResolveJudgementEvent({
        type: 'resolve-judgement.completed',
        run: outcome.run,
        results: outcome.results,
      });
    } else if (outcome.run) {
      this.emitResolveJudgementEvent({
        type: 'resolve-judgement.failed',
        run: outcome.run,
        message: outcome.message,
      });
    }
  }

  dispose(): void {
    this.renderSnapshotCache.clear();
    this.providerStore.close();
    this.profileStore.close();
    this.graphStore.close();
    this.agentReviewStore.close();
    this.resolveJudgementStore.close();
  }

  private toListItem(workspace: ReviewWorkspace): ReviewWorkspaceListItem {
    const profile = this.profileStore.get(workspace.repositoryProfileId);
    const record = this.graphStore.getWorkspaceGraphRecord(
      workspace.reviewWorkspaceId,
      INITIAL_GRAPH_SCOPE_KEY,
    );
    const worktreeExists = fs.existsSync(workspace.worktreePath);
    const setupStatus = this.toListItemSetupStatus(workspace, worktreeExists);
    return {
      reviewWorkspaceId: workspace.reviewWorkspaceId,
      repositoryLabel: profile
        ? repositoryLabelFromLocator(profile.repoLocator)
        : workspace.repositoryProfileId,
      provider: workspace.provider,
      reviewId: workspace.reviewId,
      title: workspace.title,
      createdAt: workspace.createdAt,
      updatedAt: workspace.updatedAt,
      setupStatus,
      analysisStatus: this.toListItemAnalysisStatus(record),
      worktreeExists,
      canOpenInEditor:
        setupStatus === 'completed' &&
        this.removingWorkspaceId !== workspace.reviewWorkspaceId &&
        isOpenableDirectory(workspace.worktreePath),
    };
  }

  private toListItemSetupStatus(
    workspace: ReviewWorkspace,
    worktreeExists: boolean,
  ): ReviewWorkspaceListItemSetupStatus {
    if (!worktreeExists) {
      return 'orphan';
    }
    if (workspace.setupStatus === 'running') {
      return 'pending';
    }
    return workspace.setupStatus;
  }

  private toListItemAnalysisStatus(
    record: WorkspaceGraphRecord | null,
  ): ReviewWorkspaceListItemAnalysisStatus {
    if (!record?.activeRevision) {
      return 'missing';
    }
    return record.analysis?.status ?? 'missing';
  }

  private getRenderSnapshot(
    reviewWorkspaceId: string,
    scopeKey: string,
    record: WorkspaceGraphRecord,
  ): GraphRenderSnapshot {
    if (!record.graph) {
      throw new Error('Graph snapshot が存在しないため render snapshot を作成できません。');
    }
    const graphSnapshotId = record.graph.graphSnapshotId;
    const sourceSnapshot = record.activeRevision
      ? this.graphStore.getSourceSnapshotByRevision(record.activeRevision.revisionId)
      : null;
    const outdatedAgentThreads = record.activeRevision
      ? this.threadRetentionService.listOutdated(reviewWorkspaceId)
      : [];
    const outdatedAgentThreadsKey = outdatedAgentThreads
      .map((item) => `${item.thread.localThreadId}:${item.tracking.checkedAt}`)
      .join('|');
    const companionKey = (record.graph.companionFiles ?? [])
      .map((item) => `${item.relationId}:${item.existsInWorkspaceHead}:${item.existsInDiff}`)
      .join('|');
    const cacheKey = `${reviewWorkspaceId}::${scopeKey}::${graphSnapshotId}::${sourceSnapshot?.updatedAt ?? ''}::${outdatedAgentThreadsKey}::${companionKey}`;
    const cached = this.renderSnapshotCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const prefix = `${reviewWorkspaceId}::${scopeKey}::`;
    for (const existingKey of Array.from(this.renderSnapshotCache.keys())) {
      if (existingKey.startsWith(prefix) && existingKey !== cacheKey) {
        this.renderSnapshotCache.delete(existingKey);
      }
    }

    const companionRedirectIndex = buildCompanionThreadRedirectIndex(
      record.graph.companionFiles ?? [],
    );
    const visibleNodeIds = new Set(record.graph.nodes.map((node) => node.nodeId));
    const agentFindingCounts = new Map<string, number>();
    const countedAgentFindings = new Map<string, Set<string>>();
    const addAgentFindingCount = (nodeId: string, localThreadId: string): void => {
      const counted = countedAgentFindings.get(nodeId) ?? new Set<string>();
      if (counted.has(localThreadId)) return;
      counted.add(localThreadId);
      countedAgentFindings.set(nodeId, counted);
      agentFindingCounts.set(nodeId, (agentFindingCounts.get(nodeId) ?? 0) + 1);
    };
    let currentAgentThreads: Poc3AgentReviewThread[] = [];
    if (record.activeRevision) {
      currentAgentThreads = this.agentReviewStore.listThreadsForWorkspace({
        reviewWorkspaceId,
        revisionId: record.activeRevision.revisionId,
      });
      for (const thread of currentAgentThreads) {
        if (thread.status !== 'open') {
          continue;
        }
        if (thread.nodeId && visibleNodeIds.has(thread.nodeId)) {
          addAgentFindingCount(thread.nodeId, thread.localThreadId);
        } else if (thread.nodeId) {
          const ownerNodeId = companionRedirectIndex.hiddenNodeIdToOwnerNodeId.get(thread.nodeId);
          if (ownerNodeId) {
            addAgentFindingCount(ownerNodeId, thread.localThreadId);
          }
        }
        if (thread.location.kind === 'diff' && thread.location.filePath) {
          const ownerNodeIds =
            companionRedirectIndex.companionFilePathToOwnerNodeIds.get(thread.location.filePath) ??
            [];
          for (const ownerNodeId of ownerNodeIds) {
            addAgentFindingCount(ownerNodeId, thread.localThreadId);
          }
        }
      }
    }
    const outdatedAgentFindingCounts = buildOutdatedAgentFindingCountByNode(
      record.graph.nodes,
      outdatedAgentThreads,
      currentAgentThreads,
      companionRedirectIndex,
    );
    outdatedAgentFindingCounts.forEach((count, nodeId) => {
      agentFindingCounts.set(nodeId, (agentFindingCounts.get(nodeId) ?? 0) + count);
    });

    const remoteThreadCounts = sourceSnapshot
      ? buildRemoteThreadCountByNode(
          record.graph.nodes,
          buildPublishedThreadVisibility({
            reviewWorkspaceId,
            agentThreads: [
              ...currentAgentThreads,
              ...outdatedAgentThreads.map((item) => item.thread),
            ],
            remoteThreads: sourceSnapshot.remoteThreads,
            links: this.publishedAgentThreadLinkStore.listLinksForWorkspace(reviewWorkspaceId),
          }).visibleRemoteThreads,
          companionRedirectIndex,
        )
      : new Map<string, number>();

    const companionOwnerNodeIds = new Set(
      (record.graph.companionFiles ?? []).flatMap((item) => {
        const ownerFilePath = item.ownerFilePath;
        const nodeIdsInOwnerFile = record.graph?.nodes
          .filter((node) => node.filePath === ownerFilePath)
          .map((node) => node.nodeId);
        return nodeIdsInOwnerFile && nodeIdsInOwnerFile.length > 0
          ? nodeIdsInOwnerFile
          : [item.ownerNodeId];
      }),
    );
    const renderSnapshot = toRenderSnapshot(
      record.graph,
      record.layout,
      agentFindingCounts,
      remoteThreadCounts,
      companionOwnerNodeIds,
    );
    this.renderSnapshotCache.set(cacheKey, renderSnapshot);
    return renderSnapshot;
  }

  listArchivedRemoteThreads(input: {
    reviewWorkspaceId: string;
  }): import('../../shared/poc3-contracts/graph-review-ipc').ListArchivedRemoteThreadsResult {
    const reviewWorkspaceId = input.reviewWorkspaceId.trim();
    const revision = this.graphStore.getActiveRevision(reviewWorkspaceId);
    if (!revision) {
      return { threads: [] };
    }
    const sourceSnapshot = this.graphStore.getSourceSnapshotByRevision(revision.revisionId);
    if (!sourceSnapshot) {
      return { threads: [] };
    }
    const links = this.publishedAgentThreadLinkStore.listLinksForWorkspace(reviewWorkspaceId);
    const suppressedProviderThreadIds = new Set(
      links
        .filter((link) => this.agentReviewStore.getThreadDraft(link.localThreadId))
        .map((link) => link.providerThreadId),
    );
    const archived = sourceSnapshot.remoteThreads.filter(
      (t) =>
        t.anchorStatus === 'unanchored' && !suppressedProviderThreadIds.has(t.providerThreadId),
    );
    return {
      threads: archived.map((thread) => ({
        reviewWorkspaceId,
        revisionId: revision.revisionId,
        headSha: revision.headSha,
        thread,
      })),
    };
  }

  async publishInlineComment(
    input: PublishInlineCommentInput,
  ): Promise<PublishInlineCommentResult> {
    return coordinatePublishInlineComment(
      {
        reviewWorkspaceId: input.reviewWorkspaceId.trim(),
        revisionId: input.revisionId.trim(),
        body: input.body,
        anchor: input.anchor,
        source: input.source,
      },
      {
        graphStore: this.graphStore,
        providerStore: this.providerStore,
        profileStore: this.profileStore,
        agentReviewStore: this.agentReviewStore,
        savePublishedAgentThreadLink: (link) => this.publishedAgentThreadLinkStore.saveLink(link),
        markPublishedAgentThreadSyncResult: (syncInput) =>
          this.publishedAgentThreadLinkStore.markSyncResult(syncInput),
        savePublishedRecord: (record) => this.graphStore.savePublishedCommentRecord(record),
        clearWorkspaceCaches: (id) => this.clearWorkspaceCaches(id),
      },
    );
  }

  async replyRemoteComment(input: ReplyRemoteCommentInput): Promise<ReplyRemoteCommentResult> {
    return coordinateReplyRemoteComment(
      {
        reviewWorkspaceId: input.reviewWorkspaceId.trim(),
        revisionId: input.revisionId.trim(),
        providerThreadId: input.providerThreadId.trim(),
        body: input.body,
      },
      {
        graphStore: this.graphStore,
        providerStore: this.providerStore,
        profileStore: this.profileStore,
        agentReviewStore: this.agentReviewStore,
        savePublishedAgentThreadLink: (link) => this.publishedAgentThreadLinkStore.saveLink(link),
        markPublishedAgentThreadSyncResult: (syncInput) =>
          this.publishedAgentThreadLinkStore.markSyncResult(syncInput),
        savePublishedRecord: (record) => this.graphStore.savePublishedCommentRecord(record),
        clearWorkspaceCaches: (id) => this.clearWorkspaceCaches(id),
      },
    );
  }

  private clearWorkspaceCaches(reviewWorkspaceId: string): void {
    const prefix = `${reviewWorkspaceId}::`;
    for (const cacheKey of Array.from(this.renderSnapshotCache.keys())) {
      if (cacheKey.startsWith(prefix)) {
        this.renderSnapshotCache.delete(cacheKey);
      }
    }
  }
}

function nodeSize(node: CodeGraphSnapshot['nodes'][number]): { width: number; height: number } {
  if (node.kind === 'module') {
    return { width: 320, height: 72 };
  }
  if (node.kind === 'external') {
    return { width: 220, height: 52 };
  }
  return { width: 260, height: 60 };
}

function toRenderSnapshot(
  graph: CodeGraphSnapshot,
  layout: LayoutSnapshot | null,
  agentFindingCounts: Map<string, number> = new Map(),
  remoteThreadCounts: Map<string, number> = new Map(),
  companionOwnerNodeIds: Set<string> = new Set(),
): GraphRenderSnapshot {
  const diagnostics: GraphDiagnostic[] = [...graph.diagnostics];
  const positions: Record<string, GraphNodeLayout> = layout?.positions ?? fallbackGridLayout(graph);
  if (!layout) {
    diagnostics.push({
      code: 'LAYOUT_MISSING_FALLBACK_GRID',
      message: 'Layout snapshot がないため fallback layout を使用しました。',
      severity: 'warning',
    });
  }
  return {
    revisionId: graph.revisionId,
    graphSnapshotId: graph.graphSnapshotId,
    scopeKey: graph.scopeKey,
    status: graph.status,
    nodes: graph.nodes.map((node) => {
      const position = positions[node.nodeId] ?? { x: 0, y: 0, ...nodeSize(node) };
      const findingCount = node.badges.findingCount + (agentFindingCounts.get(node.nodeId) ?? 0);
      const remoteThreadCount =
        remoteThreadCounts.get(node.nodeId) ?? node.badges.remoteThreadCount;
      return {
        ...node,
        badges: {
          ...node.badges,
          findingCount,
          remoteThreadCount,
          hasCompanionCode:
            node.badges.hasCompanionCode === true || companionOwnerNodeIds.has(node.nodeId),
        },
        position: { x: position.x, y: position.y },
        size: { width: position.width, height: position.height },
        extent: null,
      };
    }),
    edges: graph.edges.map((edge) => ({
      ...edge,
      label: edge.kind === 'calls' ? null : edge.kind,
    })),
    viewport: layout?.viewport ?? null,
    limits: graph.limits,
    diagnostics,
  };
}

export function buildRemoteThreadCountByNode(
  nodes: CodeGraphSnapshot['nodes'],
  remoteThreads: import('../../shared/poc3-domain/source-snapshot').ReviewRemoteThread[],
  companionRedirectIndex: CompanionRedirectIndex = createEmptyCompanionRedirectIndex(),
): Map<string, number> {
  const counts = new Map<string, number>();
  const countedByNode = new Map<string, Set<string>>();
  const addCount = (nodeId: string, providerThreadId: string): void => {
    const counted = countedByNode.get(nodeId) ?? new Set<string>();
    if (counted.has(providerThreadId)) return;
    counted.add(providerThreadId);
    countedByNode.set(nodeId, counted);
    counts.set(nodeId, (counts.get(nodeId) ?? 0) + 1);
  };
  const currentThreads = remoteThreads.filter(
    (t) =>
      (t.anchorStatus === 'current' || t.anchorStatus === 'outdated') &&
      t.location.kind === 'diff' &&
      t.isResolved !== true,
  );
  for (const node of nodes) {
    if (!node.filePath) {
      continue;
    }
    let count = 0;
    for (const thread of currentThreads) {
      if (thread.location.kind !== 'diff') {
        continue;
      }
      if (thread.location.filePath !== node.filePath) {
        continue;
      }
      if (node.kind === 'module' || node.kind === 'file-scope') {
        count += 1;
        continue;
      }
      const range = node.declarationRange;
      if (!range) {
        count += 1;
        continue;
      }
      const line = thread.location.endLine ?? thread.location.startLine;
      if (line !== null && line >= range.startLine && line <= range.endLine) {
        count += 1;
      }
    }
    if (count > 0) {
      counts.set(node.nodeId, count);
    }
  }
  for (const thread of currentThreads) {
    if (thread.location.kind !== 'diff') continue;
    const ownerNodeIds =
      companionRedirectIndex.companionFilePathToOwnerNodeIds.get(thread.location.filePath) ?? [];
    for (const ownerNodeId of ownerNodeIds) {
      addCount(ownerNodeId, thread.providerThreadId);
    }
  }
  return counts;
}

export function buildOutdatedAgentFindingCountByNode(
  nodes: CodeGraphSnapshot['nodes'],
  outdatedThreads: Poc3OutdatedAgentThread[],
  currentThreads: Poc3AgentReviewThread[] = [],
  companionRedirectIndex: CompanionRedirectIndex = createEmptyCompanionRedirectIndex(),
): Map<string, number> {
  const counts = new Map<string, number>();
  const currentLocalThreadIds = new Set(currentThreads.map((thread) => thread.localThreadId));
  const visibleNodeIds = new Set(nodes.map((node) => node.nodeId));
  const addCount = (nodeId: string): void => {
    counts.set(nodeId, (counts.get(nodeId) ?? 0) + 1);
  };
  const redirectedLocalThreadIdsByNode = new Map<string, Set<string>>();
  const addRedirectedCount = (nodeId: string, localThreadId: string): void => {
    const counted = redirectedLocalThreadIdsByNode.get(nodeId) ?? new Set<string>();
    if (counted.has(localThreadId)) return;
    counted.add(localThreadId);
    redirectedLocalThreadIdsByNode.set(nodeId, counted);
    addCount(nodeId);
  };
  for (const node of nodes) {
    let count = 0;
    for (const item of outdatedThreads) {
      if (item.thread.status !== 'open') {
        continue;
      }
      if (currentLocalThreadIds.has(item.thread.localThreadId)) {
        continue;
      }
      if (matchesAgentThreadToGraphNode(item.thread, node)) {
        count += 1;
      }
    }
    if (count > 0) {
      counts.set(node.nodeId, count);
    }
  }
  for (const item of outdatedThreads) {
    if (item.thread.status !== 'open') {
      continue;
    }
    if (currentLocalThreadIds.has(item.thread.localThreadId)) {
      continue;
    }
    if (item.thread.nodeId && !visibleNodeIds.has(item.thread.nodeId)) {
      const ownerNodeId = companionRedirectIndex.hiddenNodeIdToOwnerNodeId.get(item.thread.nodeId);
      if (ownerNodeId) {
        addRedirectedCount(ownerNodeId, item.thread.localThreadId);
      }
    }
    if (item.thread.location.kind === 'diff' && item.thread.location.filePath) {
      const ownerNodeIds =
        companionRedirectIndex.companionFilePathToOwnerNodeIds.get(item.thread.location.filePath) ??
        [];
      for (const ownerNodeId of ownerNodeIds) {
        addRedirectedCount(ownerNodeId, item.thread.localThreadId);
      }
    }
  }
  return counts;
}

interface CompanionRedirectIndex {
  hiddenNodeIdToOwnerNodeId: Map<string, string>;
  companionFilePathToOwnerNodeIds: Map<string, string[]>;
}

function createEmptyCompanionRedirectIndex(): CompanionRedirectIndex {
  return {
    hiddenNodeIdToOwnerNodeId: new Map(),
    companionFilePathToOwnerNodeIds: new Map(),
  };
}

export function buildCompanionThreadRedirectIndex(
  companionFiles: CodeCompanionFile[],
): CompanionRedirectIndex {
  const index = createEmptyCompanionRedirectIndex();
  for (const companion of companionFiles) {
    for (const hiddenNodeId of companion.hiddenNodeIds) {
      index.hiddenNodeIdToOwnerNodeId.set(hiddenNodeId, companion.ownerNodeId);
    }
    const ownerNodeIds =
      index.companionFilePathToOwnerNodeIds.get(companion.companionFilePath) ?? [];
    if (!ownerNodeIds.includes(companion.ownerNodeId)) {
      ownerNodeIds.push(companion.ownerNodeId);
      index.companionFilePathToOwnerNodeIds.set(companion.companionFilePath, ownerNodeIds);
    }
  }
  return index;
}

function matchesAgentThreadToGraphNode(
  thread: Poc3AgentReviewThread,
  node: CodeGraphSnapshot['nodes'][number],
): boolean {
  const location = thread.location;
  if (location.kind === 'overview') {
    return node.kind === 'module' || node.kind === 'file-scope';
  }
  const filePath = location.filePath;
  if (!filePath || !node.filePath || filePath !== node.filePath) {
    return false;
  }
  if (node.kind === 'module' || node.kind === 'file-scope') {
    return true;
  }
  const range = node.declarationRange;
  if (!range) {
    return true;
  }
  const line = location.endLine ?? location.startLine;
  return line !== null && line >= range.startLine && line <= range.endLine;
}
