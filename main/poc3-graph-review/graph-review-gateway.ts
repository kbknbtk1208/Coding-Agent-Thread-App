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
  GraphCommentSummary,
  GraphFileSummary,
  GraphViewSummary,
  ListAgentReviewRunsInput,
  ListAgentReviewRunsResult,
  ListAgentThreadConversationsInput,
  ListAgentThreadConversationsResult,
  ListGraphCommentSummariesInput,
  ListGraphCommentSummariesResult,
  ListOutdatedAgentThreadsInput,
  ListOutdatedAgentThreadsResult,
  LoadAgentThreadConversationInput,
  LoadAgentThreadConversationResult,
  LoadNodeDetailInput,
  LoadNodeDetailResult,
  LoadNodeCompanionDetailInput,
  LoadNodeCompanionDetailResult,
  LoadRepositoryLayerProfileInput,
  LoadRepositoryLayerProfileResult,
  LoadWorkspaceGraphFullInput,
  LoadWorkspaceGraphInput,
  LoadWorkspaceGraphResult,
  LoadWorkspaceGraphSummaryInput,
  LoadWorkspaceGraphSummaryResult,
  LoadWorkspaceGraphViewInput,
  LoadWorkspaceGraphViewResult,
  LoadWorkspaceRevisionsInput,
  LoadWorkspaceRevisionsResult,
  OpenWorkspaceInEditorInput,
  OpenWorkspaceInEditorResult,
  RemoveReviewWorkspaceInput,
  RemoveReviewWorkspaceResult,
  RefreshWorkspaceRevisionsInput,
  RefreshWorkspaceRevisionsResult,
  RecomputeWorkspaceLayerLayoutInput,
  RecomputeWorkspaceLayerLayoutResult,
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
  InferRepositoryLayerProfileInput,
  InferRepositoryLayerProfileResult,
  LayerApplicationEvent,
  PreviewRepositoryLayerProfileInput,
  PreviewRepositoryLayerProfileResult,
  SaveRepositoryLayerProfileInput,
  SaveRepositoryLayerProfileResult,
  ValidateRepositoryLayerProfileInput,
  ValidateRepositoryLayerProfileResult,
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
  GraphLayerApplicationSnapshot,
  GraphLayerDiagnostic,
  GraphLayerRenderSnapshot,
  RepositoryLayerProfile,
  RepositoryLayerProfileDraft,
} from '../../shared/poc3-domain/layer-profile';
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
import {
  buildGraphNodeLookupIndex,
  buildRemoteThreadLookupIndex,
  isLineWithinNodeRange,
  type GraphNodeLookupIndex,
  type RemoteThreadLookupIndex,
} from './analysis/graph-lookup-index';
import { Poc3AgentReviewCoordinator } from './agent/coordinator';
import { Poc3AgentReviewStore } from './agent/store';
import {
  Poc3AgentReviewThreadReplyCoordinator,
  Poc3ThreadReplyError,
} from './agent/thread-reply-coordinator';
import { fallbackGridLayout } from './layout/elk-layout-service';
import { resolveNodeDetail } from './node-detail/node-detail-resolver';
import { type GraphRelationIndex } from './node-detail/graph-relation-index';
import { GraphRelationIndexCache } from './node-detail/graph-relation-index-cache';
import { resolveNodeCompanionDetail } from './node-detail/node-companion-detail-resolver';
import { GraphReviewStore, type WorkspaceGraphRecord } from './store/graph-review-store';
import { LayerApplicationCoordinator } from './layers/layer-application-coordinator';
import { LayerPresetInferer } from './layers/layer-preset-inferer';
import { LayerProfileStore } from './layers/layer-profile-store';
import { buildUnclassifiedDirectorySuggestions } from './layers/unclassified-directory-suggester';
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
import type { PublishedAgentThreadLink } from '../../shared/poc3-domain/published-agent-thread';
import type { ReviewSourceSnapshot } from '../../shared/poc3-domain/source-snapshot';
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

interface GraphViewCacheEntry {
  graph: GraphRenderSnapshot;
  summary: GraphViewSummary;
}

export class GraphReviewGateway {
  private readonly providerStore: RepositoryProviderStore;
  private readonly profileStore: RepositoryProfileStore;
  private readonly graphStore: GraphReviewStore;
  private readonly layerProfileStore: LayerProfileStore;
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
  private readonly layerApplicationCoordinator: LayerApplicationCoordinator;
  private readonly layerPresetInferer: LayerPresetInferer;
  private readonly externalEditorLauncher: Pick<ExternalEditorLauncher, 'openWorkspace'>;
  private readonly renderSnapshotCache = new Map<string, GraphRenderSnapshot>();
  private readonly relationIndexCache = new GraphRelationIndexCache();
  private readonly graphViewCache = new Map<string, GraphViewCacheEntry>();
  private readonly graphSummaryCache = new Map<string, GraphViewSummary>();
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
    private readonly emitLayerApplicationEvent: (event: LayerApplicationEvent) => void = () =>
      undefined,
  ) {
    this.externalEditorLauncher = externalEditorLauncher;
    this.providerStore = new RepositoryProviderStore(userDataPath);
    this.profileStore = new RepositoryProfileStore(userDataPath);
    this.graphStore = new GraphReviewStore(userDataPath);
    this.layerProfileStore = new LayerProfileStore(userDataPath);
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
    this.layerApplicationCoordinator = new LayerApplicationCoordinator({
      graphStore: this.graphStore,
      layerProfileStore: this.layerProfileStore,
      emit: (event) => this.emitLayerApplicationEvent(event),
    });
    this.layerPresetInferer = new LayerPresetInferer(this.layerProfileStore);
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

  loadRepositoryLayerProfile(
    input: LoadRepositoryLayerProfileInput,
  ): LoadRepositoryLayerProfileResult {
    const repositoryProfileId = input.repositoryProfileId.trim();
    const repositoryProfile = this.profileStore.get(repositoryProfileId);
    if (!repositoryProfile) {
      return {
        ok: false,
        reason: 'repositoryProfileNotFound',
        message: 'Repository Profile が見つかりません。',
        profile: null,
        reusableProfile: null,
        diagnostics: [],
      };
    }
    try {
      const current = this.layerProfileStore.readByRepositoryProfileId(repositoryProfileId);
      return {
        ok: true,
        profile: current.profile,
        reusableProfile:
          this.layerProfileStore.findLatestReusableProfileForRepository(repositoryProfile),
      };
    } catch (err) {
      return {
        ok: false,
        reason: 'profileReadFailed',
        message: err instanceof Error ? err.message : 'Layer profile を読み込めませんでした。',
        profile: null,
        reusableProfile: null,
        diagnostics: [],
      };
    }
  }

  inferRepositoryLayerProfile(
    input: InferRepositoryLayerProfileInput,
  ): InferRepositoryLayerProfileResult {
    const repositoryProfile = this.profileStore.get(input.repositoryProfileId.trim());
    if (!repositoryProfile) {
      return {
        ok: false,
        reason: 'repositoryProfileNotFound',
        message: 'Repository Profile が見つかりません。',
        draft: null,
        source: null,
        diagnostics: [],
      };
    }
    try {
      const inferred = this.layerPresetInferer.infer(repositoryProfile);
      return { ok: true, ...inferred };
    } catch (err) {
      return {
        ok: false,
        reason: 'inferFailed',
        message: err instanceof Error ? err.message : 'Layer preset を推論できませんでした。',
        draft: null,
        source: null,
        diagnostics: [],
      };
    }
  }

  validateRepositoryLayerProfile(
    input: ValidateRepositoryLayerProfileInput,
  ): ValidateRepositoryLayerProfileResult {
    const issues = this.layerProfileStore.validateDraft(input.draft);
    if (issues.some((issue) => issue.severity === 'error')) {
      return {
        ok: false,
        reason: 'invalidProfile',
        message: 'Layer profile に修正が必要です。',
        issues,
      };
    }
    return { ok: true, issues };
  }

  saveRepositoryLayerProfile(
    input: SaveRepositoryLayerProfileInput,
  ): SaveRepositoryLayerProfileResult {
    const repositoryProfile = this.profileStore.get(input.draft.repositoryProfileId.trim());
    if (!repositoryProfile) {
      return {
        ok: false,
        reason: 'repositoryProfileNotFound',
        message: 'Repository Profile が見つかりません。',
        profile: null,
        recomputeQueued: false,
        diagnostics: [],
      };
    }
    const diagnostics = this.layerProfileStore.validateDraft(input.draft);
    if (diagnostics.some((diagnostic) => diagnostic.severity === 'error')) {
      return {
        ok: false,
        reason: 'invalidProfile',
        message: 'Layer profile に修正が必要です。',
        profile: null,
        recomputeQueued: false,
        diagnostics,
      };
    }
    try {
      const profile = this.layerProfileStore.save({
        draft: input.draft,
        repositoryProfile,
      });
      this.clearRepositoryProfileCaches(profile.repositoryProfileId);
      return { ok: true, profile, recomputeQueued: false };
    } catch (err) {
      return {
        ok: false,
        reason: 'saveFailed',
        message: err instanceof Error ? err.message : 'Layer profile を保存できませんでした。',
        profile: null,
        recomputeQueued: false,
        diagnostics,
      };
    }
  }

  previewRepositoryLayerProfile(
    input: PreviewRepositoryLayerProfileInput,
  ): PreviewRepositoryLayerProfileResult {
    const diagnostics = this.layerProfileStore.validateDraft(input.draft);
    if (diagnostics.some((diagnostic) => diagnostic.severity === 'error')) {
      return {
        ok: false,
        reason: 'invalidProfile',
        message: 'Layer profile に修正が必要です。',
        diagnostics,
      };
    }
    return this.layerApplicationCoordinator.preview({
      reviewWorkspaceId: input.reviewWorkspaceId,
      scopeKey: input.scopeKey,
      profile: materializeLayerProfileDraft(input.draft),
    });
  }

  async recomputeWorkspaceLayerLayout(
    input: RecomputeWorkspaceLayerLayoutInput,
  ): Promise<RecomputeWorkspaceLayerLayoutResult> {
    const result = await this.layerApplicationCoordinator.recompute(input);
    this.clearWorkspaceCaches(input.reviewWorkspaceId.trim());
    return result;
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
    const includeLayers = input.includeLayers ?? true;
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

    const renderSnapshot = this.getRenderSnapshot(reviewWorkspaceId, scopeKey, record, {
      includeLayers,
    });
    return {
      ok: true,
      workspace: this.toListItem(record.workspace),
      revision: record.activeRevision,
      analysis: record.analysis,
      graph: renderSnapshot,
    };
  }

  loadWorkspaceGraphFull(input: LoadWorkspaceGraphFullInput): LoadWorkspaceGraphResult {
    return this.loadWorkspaceGraph(input);
  }

  loadWorkspaceGraphSummary(
    input: LoadWorkspaceGraphSummaryInput,
  ): LoadWorkspaceGraphSummaryResult {
    const prepared = this.prepareGraphView(input);
    if (!prepared.ok) {
      return prepared.failure;
    }
    const { renderSnapshot, renderCacheKey, workspace, revision, analysis } = prepared;
    const summaryKey = `${renderCacheKey}::summary`;
    let summary = this.graphSummaryCache.get(summaryKey);
    if (!summary) {
      summary = buildGraphViewSummary(renderSnapshot, renderSnapshot);
      this.graphSummaryCache.set(summaryKey, summary);
    }
    return {
      ok: true,
      workspace,
      revision,
      analysis,
      summary,
    };
  }

  loadWorkspaceGraphView(input: LoadWorkspaceGraphViewInput): LoadWorkspaceGraphViewResult {
    const prepared = this.prepareGraphView(input);
    if (!prepared.ok) {
      return prepared.failure;
    }
    const { renderSnapshot, renderCacheKey, workspace, revision, analysis } = prepared;
    const mode = input.mode ?? 'initial';
    const sortedRevealed = (input.revealedNodeIds ?? []).slice().sort().join('|');
    const viewKey = `${renderCacheKey}::view::${mode}::${sortedRevealed}`;
    let entry = this.graphViewCache.get(viewKey);
    if (!entry) {
      const graph = buildGraphViewSnapshot(renderSnapshot, {
        mode,
        revealedNodeIds: input.revealedNodeIds ?? [],
      });
      const summary = buildGraphViewSummary(renderSnapshot, graph);
      entry = { graph, summary };
      this.graphViewCache.set(viewKey, entry);
    }
    return {
      ok: true,
      workspace,
      revision,
      analysis,
      graph: entry.graph,
      summary: entry.summary,
    };
  }

  private prepareGraphView(input: LoadWorkspaceGraphInput):
    | {
        ok: true;
        renderSnapshot: GraphRenderSnapshot;
        renderCacheKey: string;
        workspace: ReviewWorkspaceListItem;
        revision: NonNullable<Extract<LoadWorkspaceGraphResult, { ok: true }>['revision']>;
        analysis: NonNullable<Extract<LoadWorkspaceGraphResult, { ok: true }>['analysis']>;
      }
    | { ok: false; failure: Extract<LoadWorkspaceGraphResult, { ok: false }> } {
    const reviewWorkspaceId = input.reviewWorkspaceId.trim();
    const scopeKey = input.scopeKey ?? INITIAL_GRAPH_SCOPE_KEY;
    const includeLayers = input.includeLayers ?? true;
    const record = this.graphStore.getWorkspaceGraphRecord(reviewWorkspaceId, scopeKey);
    if (!record) {
      return {
        ok: false,
        failure: {
          ok: false,
          reason: 'workspaceNotFound',
          message: 'Review Workspace が見つかりません。',
          analysis: null,
        },
      };
    }
    if (!record.activeRevision) {
      return {
        ok: false,
        failure: {
          ok: false,
          reason: 'revisionNotFound',
          message: 'Active revision が見つかりません。',
          analysis: null,
          revision: null,
        },
      };
    }
    if (record.analysis?.status === 'failed') {
      return {
        ok: false,
        failure: {
          ok: false,
          reason: 'analysisFailed',
          message: record.analysis.errorMessage ?? 'Graph analysis が失敗しました。',
          analysis: record.analysis,
          revision: record.activeRevision,
        },
      };
    }
    if (
      !record.analysis ||
      record.analysis.status === 'queued' ||
      record.analysis.status === 'running'
    ) {
      return {
        ok: false,
        failure: {
          ok: false,
          reason: 'graphNotReady',
          message: 'Graph analysis がまだ完了していません。',
          analysis: record.analysis,
          revision: record.activeRevision,
        },
      };
    }
    if (!record.graph) {
      return {
        ok: false,
        failure: {
          ok: false,
          reason: 'graphNotReady',
          message: 'Graph snapshot がまだ保存されていません。',
          analysis: record.analysis,
          revision: record.activeRevision,
        },
      };
    }
    const renderResult = this.getRenderSnapshotWithKey(reviewWorkspaceId, scopeKey, record, {
      includeLayers,
    });
    return {
      ok: true,
      renderSnapshot: renderResult.snapshot,
      renderCacheKey: renderResult.cacheKey,
      workspace: this.toListItem(record.workspace),
      revision: record.activeRevision,
      analysis: record.analysis,
    };
  }

  listGraphCommentSummaries(
    input: ListGraphCommentSummariesInput,
  ): ListGraphCommentSummariesResult {
    const reviewWorkspaceId = input.reviewWorkspaceId.trim();
    const scopeKey = input.scopeKey ?? INITIAL_GRAPH_SCOPE_KEY;
    const record = this.graphStore.getWorkspaceGraphRecord(reviewWorkspaceId, scopeKey);
    if (!record) {
      return {
        ok: false,
        reason: 'workspaceNotFound',
        message: 'Review Workspace が見つかりません。',
        revisionId: null,
        items: [],
      };
    }
    if (!record.activeRevision) {
      return {
        ok: false,
        reason: 'revisionNotFound',
        message: 'Active revision が見つかりません。',
        revisionId: null,
        items: [],
      };
    }
    if (!record.graph) {
      return {
        ok: false,
        reason: 'graphNotReady',
        message: 'Graph snapshot がまだ保存されていません。',
        revisionId: null,
        items: [],
      };
    }
    const renderSnapshot = this.getRenderSnapshot(reviewWorkspaceId, scopeKey, record);
    if (input.graphSnapshotId && input.graphSnapshotId !== renderSnapshot.graphSnapshotId) {
      return { ok: true, revisionId: record.activeRevision.revisionId, items: [] };
    }
    const currentAgentThreads = this.agentReviewStore.listThreadsForWorkspace({
      reviewWorkspaceId,
      revisionId: record.activeRevision.revisionId,
    });
    const currentLocalThreadIds = new Set(
      currentAgentThreads.map((thread) => thread.localThreadId),
    );
    const outdatedAgentThreads = this.threadRetentionService
      .listOutdated(reviewWorkspaceId)
      .filter(
        (item) =>
          item.thread.status === 'open' && !currentLocalThreadIds.has(item.thread.localThreadId),
      );
    const publishedLinks =
      this.publishedAgentThreadLinkStore.listLinksForWorkspace(reviewWorkspaceId);
    const sourceSnapshot = this.graphStore.getSourceSnapshotByRevision(
      record.activeRevision.revisionId,
    );
    const items = computeGraphCommentSummaries({
      reviewWorkspaceId,
      revisionId: record.activeRevision.revisionId,
      renderSnapshot,
      currentAgentThreads,
      outdatedAgentThreads: outdatedAgentThreads.map((item) => item.thread),
      publishedLinks,
      sourceSnapshot,
    });
    return { ok: true, revisionId: record.activeRevision.revisionId, items };
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
      relationIndex: this.getRelationIndex(reviewWorkspaceId, renderSnapshot),
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
    this.relationIndexCache.clear();
    this.graphViewCache.clear();
    this.graphSummaryCache.clear();
    this.providerStore.close();
    this.profileStore.close();
    this.graphStore.close();
    this.layerProfileStore.close();
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
      repositoryProfileId: workspace.repositoryProfileId,
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
    options: { includeLayers?: boolean } = {},
  ): GraphRenderSnapshot {
    return this.getRenderSnapshotWithKey(reviewWorkspaceId, scopeKey, record, options).snapshot;
  }

  private getRenderSnapshotWithKey(
    reviewWorkspaceId: string,
    scopeKey: string,
    record: WorkspaceGraphRecord,
    options: { includeLayers?: boolean } = {},
  ): { snapshot: GraphRenderSnapshot; cacheKey: string } {
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
    const includeLayers = options.includeLayers ?? true;
    const layerProfileRead = includeLayers
      ? this.layerProfileStore.readByRepositoryProfileId(record.workspace.repositoryProfileId)
      : { profile: null, diagnostics: [] };
    const layerProfile = layerProfileRead.profile;
    const layerApplication =
      includeLayers && layerProfile
        ? this.graphStore.getGraphLayerApplication({
            graphSnapshotId,
            layerProfileId: layerProfile.layerProfileId,
            profileVersion: layerProfile.profileVersion,
          })
        : null;
    const staleLayerApplication =
      includeLayers && layerProfile && !layerApplication
        ? this.graphStore.getLatestGraphLayerApplication({
            graphSnapshotId,
            layerProfileId: layerProfile.layerProfileId,
          })
        : null;
    const layerCacheKey = layerProfile
      ? `${layerProfile.layerProfileId}:${layerProfile.profileVersion}:${layerProfile.updatedAt}:${layerApplication?.updatedAt ?? staleLayerApplication?.updatedAt ?? 'pending'}:${layerProfileRead.diagnostics.map((diagnostic) => diagnostic.code).join(',')}`
      : 'no-layer-profile';
    const cacheKey = `${reviewWorkspaceId}::${scopeKey}::${graphSnapshotId}::${sourceSnapshot?.updatedAt ?? ''}::${outdatedAgentThreadsKey}::${companionKey}::${includeLayers ? 'layers-on' : 'layers-off'}::${layerCacheKey}`;
    const cached = this.renderSnapshotCache.get(cacheKey);
    if (cached) {
      return { snapshot: cached, cacheKey };
    }

    const prefix = `${reviewWorkspaceId}::${scopeKey}::`;
    for (const existingKey of Array.from(this.renderSnapshotCache.keys())) {
      if (existingKey.startsWith(prefix) && existingKey !== cacheKey) {
        this.renderSnapshotCache.delete(existingKey);
      }
    }
    for (const existingKey of Array.from(this.graphViewCache.keys())) {
      if (existingKey.startsWith(prefix)) {
        this.graphViewCache.delete(existingKey);
      }
    }
    for (const existingKey of Array.from(this.graphSummaryCache.keys())) {
      if (existingKey.startsWith(prefix)) {
        this.graphSummaryCache.delete(existingKey);
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
      buildLayerRenderSnapshot({
        profile: layerProfile,
        application: layerApplication,
        staleApplication: staleLayerApplication,
        diagnostics: layerProfileRead.diagnostics,
      }),
      layerApplication,
    );
    this.renderSnapshotCache.set(cacheKey, renderSnapshot);
    return { snapshot: renderSnapshot, cacheKey };
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
    this.relationIndexCache.clearForWorkspace(reviewWorkspaceId);
    for (const cacheKey of Array.from(this.graphViewCache.keys())) {
      if (cacheKey.startsWith(prefix)) {
        this.graphViewCache.delete(cacheKey);
      }
    }
    for (const cacheKey of Array.from(this.graphSummaryCache.keys())) {
      if (cacheKey.startsWith(prefix)) {
        this.graphSummaryCache.delete(cacheKey);
      }
    }
  }

  private getRelationIndex(
    reviewWorkspaceId: string,
    renderSnapshot: GraphRenderSnapshot,
  ): GraphRelationIndex {
    return this.relationIndexCache.get(reviewWorkspaceId, renderSnapshot);
  }

  private clearRepositoryProfileCaches(repositoryProfileId: string): void {
    for (const workspace of this.graphStore.listWorkspaces()) {
      if (workspace.repositoryProfileId === repositoryProfileId) {
        this.clearWorkspaceCaches(workspace.reviewWorkspaceId);
      }
    }
  }
}

function materializeLayerProfileDraft(draft: RepositoryLayerProfileDraft): RepositoryLayerProfile {
  const timestamp = new Date().toISOString();
  return {
    layerProfileId: draft.layerProfileId ?? `preview:${randomUUID()}`,
    repositoryProfileId: draft.repositoryProfileId,
    repositoryIdentityKey: draft.repositoryIdentityKey ?? draft.repositoryProfileId,
    schemaVersion: draft.schemaVersion ?? 1,
    profileVersion: draft.profileVersion ?? 0,
    displayName: draft.displayName,
    layoutDirection: draft.layoutDirection,
    dependencyDirection: draft.dependencyDirection,
    layoutStrategy: draft.layoutStrategy,
    rules: draft.rules.map((rule) => ({
      ...rule,
      layerRuleId: rule.layerRuleId ?? `preview-rule:${randomUUID()}`,
    })),
    ignoredPatterns: draft.ignoredPatterns.map((pattern) => ({
      ...pattern,
      ignorePatternId: pattern.ignorePatternId ?? `preview-ignore:${randomUUID()}`,
    })),
    createdAt: timestamp,
    updatedAt: timestamp,
    lastAppliedAt: null,
  };
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

function emptyLayerSummary(): GraphLayerRenderSnapshot['unclassifiedSummary'] {
  return { nodeCount: 0, fileCount: 0, directories: [] };
}

function buildLayerRenderSnapshot(input: {
  profile: RepositoryLayerProfile | null;
  application: GraphLayerApplicationSnapshot | null;
  staleApplication: GraphLayerApplicationSnapshot | null;
  diagnostics: GraphLayerDiagnostic[];
}): GraphLayerRenderSnapshot | null {
  if (!input.profile) {
    return null;
  }
  const base = {
    layerProfileId: input.profile.layerProfileId,
    profileVersion: input.profile.profileVersion,
    enabled: true,
  };
  if (input.application) {
    const ignoredNodeIds = new Set(
      Object.values(input.application.nodeClassifications)
        .filter((classification) => classification.status === 'ignored')
        .map((classification) => classification.nodeId),
    );
    const ignoredFiles = new Set(
      Object.values(input.application.nodeClassifications)
        .filter(
          (classification) =>
            classification.status === 'ignored' && classification.normalizedFilePath,
        )
        .map((classification) => classification.normalizedFilePath as string),
    );
    return {
      ...base,
      appliedAt: input.application.appliedAt,
      status: 'ready',
      lanes: input.application.lanes,
      groups: input.application.groups,
      unclassifiedSummary: buildUnclassifiedDirectorySuggestions({
        classifications: Object.values(input.application.nodeClassifications),
      }),
      ignoredSummary: {
        nodeCount: ignoredNodeIds.size,
        fileCount: ignoredFiles.size,
      },
      violationEdgeIds: Object.values(input.application.edgeClassifications)
        .filter((classification) => classification.isArchitectureViolation)
        .map((classification) => classification.edgeId),
      diagnostics: input.application.diagnostics,
    };
  }
  if (input.staleApplication) {
    return {
      ...base,
      appliedAt: input.staleApplication.appliedAt,
      status: 'stale',
      lanes: [],
      groups: [],
      unclassifiedSummary: emptyLayerSummary(),
      ignoredSummary: { nodeCount: 0, fileCount: 0 },
      violationEdgeIds: [],
      diagnostics: [
        ...input.diagnostics,
        {
          code: 'LAYER_APPLICATION_STALE',
          severity: 'warning',
          message: 'Layer application is stale for the current profile version.',
        },
      ],
    };
  }
  return {
    ...base,
    appliedAt: input.profile.lastAppliedAt ?? input.profile.updatedAt,
    status: input.diagnostics.some((diagnostic) => diagnostic.severity === 'error')
      ? 'failed'
      : 'pending',
    lanes: [],
    groups: [],
    unclassifiedSummary: emptyLayerSummary(),
    ignoredSummary: { nodeCount: 0, fileCount: 0 },
    violationEdgeIds: [],
    diagnostics: input.diagnostics.length
      ? input.diagnostics
      : [
          {
            code: 'LAYER_APPLICATION_PENDING',
            severity: 'info',
            message: 'Layer application has not been generated yet.',
          },
        ],
  };
}

function toRenderSnapshot(
  graph: CodeGraphSnapshot,
  layout: LayoutSnapshot | null,
  agentFindingCounts: Map<string, number> = new Map(),
  remoteThreadCounts: Map<string, number> = new Map(),
  companionOwnerNodeIds: Set<string> = new Set(),
  layers: GraphLayerRenderSnapshot | null = null,
  layerApplication: GraphLayerApplicationSnapshot | null = null,
): GraphRenderSnapshot {
  const diagnostics: GraphDiagnostic[] = [...graph.diagnostics];
  const positions: Record<string, GraphNodeLayout> =
    layers?.status === 'ready' && layerApplication
      ? layerApplication.positions
      : (layout?.positions ?? fallbackGridLayout(graph));
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
        layer: layerApplication?.nodeClassifications[node.nodeId] ?? null,
      };
    }),
    edges: graph.edges.map((edge) => ({
      ...edge,
      label: edge.kind === 'calls' ? null : edge.kind,
      layer: layerApplication?.edgeClassifications[edge.edgeId] ?? null,
    })),
    viewport: layout?.viewport ?? null,
    limits: graph.limits,
    diagnostics,
    layers,
  };
}

export function buildGraphViewSnapshot(
  fullGraph: GraphRenderSnapshot,
  options: { mode: 'initial' | 'revealed'; revealedNodeIds: string[] },
): GraphRenderSnapshot {
  const visibleNodeIds = new Set<string>();
  for (const node of fullGraph.nodes) {
    if (node.isDiffNode || node.badges.findingCount > 0 || node.badges.remoteThreadCount > 0) {
      visibleNodeIds.add(node.nodeId);
    }
  }
  if (options.mode === 'revealed') {
    for (const nodeId of options.revealedNodeIds) {
      visibleNodeIds.add(nodeId);
    }
  }
  const nodes = fullGraph.nodes.filter((node) => visibleNodeIds.has(node.nodeId));
  const edges = fullGraph.edges.filter(
    (edge) => visibleNodeIds.has(edge.sourceNodeId) && visibleNodeIds.has(edge.targetNodeId),
  );

  return {
    ...fullGraph,
    nodes,
    edges,
    layers: buildGraphViewLayerSnapshot(fullGraph.layers, nodes, edges),
    viewport: null,
  };
}

function buildGraphViewLayerSnapshot(
  layers: GraphLayerRenderSnapshot | null | undefined,
  nodes: GraphRenderSnapshot['nodes'],
  edges: GraphRenderSnapshot['edges'],
): GraphLayerRenderSnapshot | null | undefined {
  if (!layers) {
    return layers;
  }

  const nodeById = new Map(nodes.map((node) => [node.nodeId, node]));
  const visibleEdgeIds = new Set(edges.map((edge) => edge.edgeId));
  const nodeClassifications = nodes
    .map((node) => node.layer)
    .filter((classification) => classification != null);
  const lanes = layers.lanes
    .map((lane) => {
      const nodeIds = lane.nodeIds.filter((nodeId) => nodeById.has(nodeId));
      if (nodeIds.length === 0) {
        return null;
      }
      const laneNodes = nodeIds.map((nodeId) => nodeById.get(nodeId)!);
      return {
        ...lane,
        nodeIds,
        bounds: buildLayerBounds(laneNodes),
      };
    })
    .filter((lane): lane is GraphLayerRenderSnapshot['lanes'][number] => lane != null);
  const laneById = new Map(lanes.map((lane) => [lane.laneId, lane]));
  const groups = layers.groups
    .map((group) => {
      const childLaneIds = group.childLaneIds.filter((laneId) => laneById.has(laneId));
      if (childLaneIds.length === 0) {
        return null;
      }
      return {
        ...group,
        childLaneIds,
        bounds: buildBoundsFromLayerBounds(
          childLaneIds.map((laneId) => laneById.get(laneId)!.bounds),
        ),
      };
    })
    .filter((group): group is GraphLayerRenderSnapshot['groups'][number] => group != null);

  return {
    ...layers,
    lanes,
    groups,
    unclassifiedSummary: buildUnclassifiedDirectorySuggestions({
      classifications: nodeClassifications,
    }),
    ignoredSummary: buildLayerIgnoredSummary(nodeClassifications),
    violationEdgeIds: layers.violationEdgeIds.filter((edgeId) => visibleEdgeIds.has(edgeId)),
  };
}

function buildLayerIgnoredSummary(
  classifications: NonNullable<GraphRenderSnapshot['nodes'][number]['layer']>[],
): GraphLayerRenderSnapshot['ignoredSummary'] {
  const ignored = classifications.filter((classification) => classification.status === 'ignored');
  return {
    nodeCount: ignored.length,
    fileCount: new Set(
      ignored
        .map((classification) => classification.normalizedFilePath)
        .filter((filePath): filePath is string => filePath != null),
    ).size,
  };
}

function buildLayerBounds(
  nodes: GraphRenderSnapshot['nodes'],
): GraphLayerRenderSnapshot['lanes'][number]['bounds'] {
  const nodeBounds = nodes.map((node) => ({
    x: node.position.x,
    y: node.position.y,
    width: node.size.width,
    height: node.size.height,
  }));
  return padLayerBounds(buildBoundsFromLayerBounds(nodeBounds));
}

function buildBoundsFromLayerBounds(
  bounds: GraphLayerRenderSnapshot['lanes'][number]['bounds'][],
): GraphLayerRenderSnapshot['lanes'][number]['bounds'] {
  const minX = Math.min(...bounds.map((item) => item.x));
  const minY = Math.min(...bounds.map((item) => item.y));
  const maxX = Math.max(...bounds.map((item) => item.x + item.width));
  const maxY = Math.max(...bounds.map((item) => item.y + item.height));
  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

function padLayerBounds(
  bounds: GraphLayerRenderSnapshot['lanes'][number]['bounds'],
): GraphLayerRenderSnapshot['lanes'][number]['bounds'] {
  const paddingX = 64;
  const paddingY = 72;
  const width = Math.max(360, bounds.width + paddingX * 2);
  const height = Math.max(240, bounds.height + paddingY * 2);
  return {
    x: bounds.x - paddingX,
    y: bounds.y - paddingY,
    width,
    height,
  };
}

function buildGraphViewSummary(
  fullGraph: GraphRenderSnapshot,
  renderedGraph: GraphRenderSnapshot,
): GraphViewSummary {
  let diffNodeCount = 0;
  let agentFindingCount = 0;
  let remoteThreadCount = 0;
  const fileMap = new Map<string, GraphFileSummary>();
  for (const node of fullGraph.nodes) {
    if (node.isDiffNode) {
      diffNodeCount += 1;
    }
    agentFindingCount += node.badges.findingCount;
    remoteThreadCount += node.badges.remoteThreadCount;
    if (!node.filePath) {
      continue;
    }
    const current =
      fileMap.get(node.filePath) ??
      ({
        filePath: node.filePath,
        isDiffFile: false,
        nodeCount: 0,
        diffNodeCount: 0,
        findingCount: 0,
        remoteThreadCount: 0,
      } satisfies GraphFileSummary);
    current.nodeCount += 1;
    current.diffNodeCount += node.isDiffNode ? 1 : 0;
    current.isDiffFile = current.isDiffFile || node.isDiffNode;
    current.findingCount += node.badges.findingCount;
    current.remoteThreadCount += node.badges.remoteThreadCount;
    fileMap.set(node.filePath, current);
  }
  const omittedNodeCount = Math.max(fullGraph.nodes.length - renderedGraph.nodes.length, 0);
  const omittedEdgeCount = Math.max(fullGraph.edges.length - renderedGraph.edges.length, 0);
  return {
    revisionId: fullGraph.revisionId,
    graphSnapshotId: fullGraph.graphSnapshotId,
    scopeKey: fullGraph.scopeKey,
    totalNodeCount: fullGraph.nodes.length,
    totalEdgeCount: fullGraph.edges.length,
    renderedNodeCount: renderedGraph.nodes.length,
    renderedEdgeCount: renderedGraph.edges.length,
    diffNodeCount,
    omittedNodeCount,
    omittedEdgeCount,
    limits: fullGraph.limits,
    files: Array.from(fileMap.values()).sort((a, b) => a.filePath.localeCompare(b.filePath)),
    commentCounts: {
      agentFindingCount,
      remoteThreadCount,
    },
    denseRecommended: renderedGraph.nodes.length >= 80 || renderedGraph.edges.length >= 250,
  };
}

export interface ComputeGraphCommentSummariesInput {
  reviewWorkspaceId: string;
  revisionId: string;
  renderSnapshot: GraphRenderSnapshot;
  currentAgentThreads: Poc3AgentReviewThread[];
  outdatedAgentThreads: Poc3AgentReviewThread[];
  publishedLinks: PublishedAgentThreadLink[];
  sourceSnapshot: ReviewSourceSnapshot | null;
}

export function computeGraphCommentSummaries(
  input: ComputeGraphCommentSummariesInput,
): GraphCommentSummary[] {
  const {
    reviewWorkspaceId,
    revisionId,
    renderSnapshot,
    currentAgentThreads,
    outdatedAgentThreads,
    publishedLinks,
    sourceSnapshot,
  } = input;
  const nodeIndex = buildGraphNodeLookupIndex(renderSnapshot.nodes);
  const items: GraphCommentSummary[] = [];
  const seen = new Set<string>();
  const summaryAgentThreads = [...currentAgentThreads, ...outdatedAgentThreads];
  const publishedActiveCountByLocalThreadId = new Map<string, number>();
  for (const link of publishedLinks) {
    if (link.status !== 'active') continue;
    publishedActiveCountByLocalThreadId.set(
      link.localThreadId,
      (publishedActiveCountByLocalThreadId.get(link.localThreadId) ?? 0) + 1,
    );
  }
  for (const thread of summaryAgentThreads) {
    if (thread.status === 'resolved') continue;
    const node = resolveThreadNode(thread, nodeIndex);
    if (!node) continue;
    const key = `agent:${thread.localThreadId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    items.push({
      key,
      type: 'agent',
      nodeId: node.nodeId,
      commentKey: {
        reviewWorkspaceId,
        revisionId,
        commentType: 'agent-thread',
        commentId: thread.localThreadId,
      },
      title: thread.title,
      filePath: node.filePath,
      line: thread.location.kind === 'diff' ? thread.location.startLine : null,
      publishedRemoteCount: publishedActiveCountByLocalThreadId.get(thread.localThreadId) ?? 0,
    });
  }

  if (sourceSnapshot) {
    const visibleRemoteThreads = buildPublishedThreadVisibility({
      reviewWorkspaceId,
      agentThreads: summaryAgentThreads,
      remoteThreads: sourceSnapshot.remoteThreads,
      links: publishedLinks,
    }).visibleRemoteThreads;
    for (const thread of visibleRemoteThreads) {
      if (
        thread.isResolved === true ||
        thread.location.kind !== 'diff' ||
        (thread.anchorStatus !== 'current' && thread.anchorStatus !== 'outdated')
      ) {
        continue;
      }
      const candidates = nodeIndex.nodesByFilePath.get(thread.location.filePath) ?? [];
      const node = candidates.find((candidate) =>
        matchesRemoteThreadToRenderNode(thread, candidate),
      );
      if (!node) continue;
      const key = `remote:${thread.providerThreadId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      items.push({
        key,
        type: 'remote',
        nodeId: node.nodeId,
        commentKey: {
          reviewWorkspaceId,
          revisionId,
          commentType: 'remote-thread',
          commentId: thread.providerThreadId,
        },
        title: thread.comments[0]?.body ?? '',
        filePath: thread.location.filePath,
        line: thread.location.startLine,
      });
    }
  }

  return items;
}

function resolveThreadNode(
  thread: Poc3AgentReviewThread,
  index: GraphNodeLookupIndex<GraphRenderSnapshot['nodes'][number]>,
): GraphRenderSnapshot['nodes'][number] | null {
  if (thread.nodeId) {
    const byId = index.nodeById.get(thread.nodeId);
    if (byId) {
      return byId;
    }
  }
  const location = thread.location;
  if (location.kind === 'overview') {
    for (const node of Array.from(index.nodeById.values())) {
      if (node.kind === 'module' || node.kind === 'file-scope') {
        return node;
      }
    }
    return null;
  }
  const filePath = location.filePath;
  if (!filePath) return null;
  const candidates = index.nodesByFilePath.get(filePath) ?? [];
  const line = location.endLine ?? location.startLine;
  return candidates.find((node) => isLineWithinNodeRange(node, line)) ?? null;
}

function matchesRemoteThreadToRenderNode(
  thread: import('../../shared/poc3-domain/source-snapshot').ReviewRemoteThread,
  node: GraphRenderSnapshot['nodes'][number],
): boolean {
  if (thread.location.kind !== 'diff') {
    return false;
  }
  if (thread.location.filePath !== node.filePath) {
    return false;
  }
  const line = thread.location.endLine ?? thread.location.startLine;
  return isLineWithinNodeRange(node, line);
}

export function buildRemoteThreadCountByNode(
  nodes: CodeGraphSnapshot['nodes'],
  remoteThreads: import('../../shared/poc3-domain/source-snapshot').ReviewRemoteThread[],
  companionRedirectIndex: CompanionRedirectIndex = createEmptyCompanionRedirectIndex(),
  nodeIndex?: GraphNodeLookupIndex<CodeGraphSnapshot['nodes'][number]>,
  remoteThreadIndex?: RemoteThreadLookupIndex,
): Map<string, number> {
  const index = nodeIndex ?? buildGraphNodeLookupIndex(nodes);
  const threadIndex = remoteThreadIndex ?? buildRemoteThreadLookupIndex(remoteThreads);
  const counts = new Map<string, number>();
  const countedByNode = new Map<string, Set<string>>();
  const addCount = (nodeId: string, providerThreadId: string): void => {
    const counted = countedByNode.get(nodeId) ?? new Set<string>();
    if (counted.has(providerThreadId)) return;
    counted.add(providerThreadId);
    countedByNode.set(nodeId, counted);
    counts.set(nodeId, (counts.get(nodeId) ?? 0) + 1);
  };
  for (const [filePath, threadsForFile] of Array.from(
    threadIndex.currentDiffThreadsByFilePath.entries(),
  )) {
    const candidates = index.nodesByFilePath.get(filePath) ?? [];
    for (const node of candidates) {
      let count = 0;
      for (const thread of threadsForFile) {
        if (thread.location.kind !== 'diff') continue;
        const line = thread.location.endLine ?? thread.location.startLine;
        if (isLineWithinNodeRange(node, line)) {
          count += 1;
        }
      }
      if (count > 0) {
        counts.set(node.nodeId, (counts.get(node.nodeId) ?? 0) + count);
      }
    }
    const ownerNodeIds = companionRedirectIndex.companionFilePathToOwnerNodeIds.get(filePath) ?? [];
    if (ownerNodeIds.length === 0) continue;
    for (const thread of threadsForFile) {
      for (const ownerNodeId of ownerNodeIds) {
        addCount(ownerNodeId, thread.providerThreadId);
      }
    }
  }
  return counts;
}

export function buildOutdatedAgentFindingCountByNode(
  nodes: CodeGraphSnapshot['nodes'],
  outdatedThreads: Poc3OutdatedAgentThread[],
  currentThreads: Poc3AgentReviewThread[] = [],
  companionRedirectIndex: CompanionRedirectIndex = createEmptyCompanionRedirectIndex(),
  nodeIndex?: GraphNodeLookupIndex<CodeGraphSnapshot['nodes'][number]>,
): Map<string, number> {
  const index = nodeIndex ?? buildGraphNodeLookupIndex(nodes);
  const counts = new Map<string, number>();
  const currentLocalThreadIds = new Set(currentThreads.map((thread) => thread.localThreadId));
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
  const eligibleOutdated = outdatedThreads.filter(
    (item) =>
      item.thread.status === 'open' && !currentLocalThreadIds.has(item.thread.localThreadId),
  );
  for (const item of eligibleOutdated) {
    const thread = item.thread;
    const location = thread.location;
    if (location.kind === 'overview') {
      for (const node of Array.from(index.nodeById.values())) {
        if (node.kind === 'module' || node.kind === 'file-scope') {
          counts.set(node.nodeId, (counts.get(node.nodeId) ?? 0) + 1);
        }
      }
      continue;
    }
    const filePath = location.filePath;
    if (!filePath) continue;
    const candidates = index.nodesByFilePath.get(filePath) ?? [];
    const line = location.endLine ?? location.startLine;
    for (const node of candidates) {
      if (isLineWithinNodeRange(node, line)) {
        counts.set(node.nodeId, (counts.get(node.nodeId) ?? 0) + 1);
      }
    }
  }
  for (const item of eligibleOutdated) {
    const thread = item.thread;
    if (thread.nodeId && !index.visibleNodeIds.has(thread.nodeId)) {
      const ownerNodeId = companionRedirectIndex.hiddenNodeIdToOwnerNodeId.get(thread.nodeId);
      if (ownerNodeId) {
        addRedirectedCount(ownerNodeId, thread.localThreadId);
      }
    }
    if (thread.location.kind === 'diff' && thread.location.filePath) {
      const ownerNodeIds =
        companionRedirectIndex.companionFilePathToOwnerNodeIds.get(thread.location.filePath) ?? [];
      for (const ownerNodeId of ownerNodeIds) {
        addRedirectedCount(ownerNodeId, thread.localThreadId);
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
