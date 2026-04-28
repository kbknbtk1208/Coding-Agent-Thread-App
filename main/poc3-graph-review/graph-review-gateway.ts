import { randomUUID } from 'crypto';
import type {
  AwaitAgentReviewResultInput,
  AwaitAgentReviewResultResult,
  ListAgentReviewRunsInput,
  ListAgentReviewRunsResult,
  LoadNodeDetailInput,
  LoadNodeDetailResult,
  LoadWorkspaceGraphInput,
  LoadWorkspaceGraphResult,
  RemoveReviewWorkspaceInput,
  RemoveReviewWorkspaceResult,
  StartAgentReviewInput,
  StartAgentReviewResult,
  RetryGraphAnalysisInput,
  RetryGraphAnalysisResult,
} from '../../shared/poc3-contracts/graph-review-ipc';
import type { AgentEventPayload, RespondPermissionInput } from '../../shared/contracts/agent-ipc';
import type {
  CodeGraphSnapshot,
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
} from '../../shared/poc3-domain/agent-review';
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
import { AnalysisCoordinator } from './analysis/analysis-coordinator';
import { Poc3AgentReviewCoordinator } from './agent/coordinator';
import { Poc3AgentReviewStore } from './agent/store';
import { fallbackGridLayout } from './layout/elk-layout-service';
import { resolveNodeDetail } from './node-detail/node-detail-resolver';
import { GraphReviewStore, type WorkspaceGraphRecord } from './store/graph-review-store';
import type { AgentGateway } from '../agent-gateway/agent-gateway';

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

export class GraphReviewGateway {
  private readonly providerStore: RepositoryProviderStore;
  private readonly profileStore: RepositoryProfileStore;
  private readonly graphStore: GraphReviewStore;
  private readonly agentReviewStore: Poc3AgentReviewStore;
  private readonly agentReviewCoordinator: Poc3AgentReviewCoordinator | null;
  private readonly analysisCoordinator: AnalysisCoordinator;
  private readonly creationCoordinator: ReviewWorkspaceCreationCoordinator;
  private readonly renderSnapshotCache = new Map<string, GraphRenderSnapshot>();
  private removingWorkspaceId: string | null = null;

  constructor(
    userDataPath: string,
    private readonly emitWorkspaceCreationEvent: (event: WorkspaceCreationEvent) => void,
    private readonly emitGraphAnalysisEvent: (event: GraphAnalysisEvent) => void = () => undefined,
    private readonly emitAgentReviewEvent: (event: Poc3AgentReviewEvent) => void = () => undefined,
    private readonly agentGateway?: Pick<
      AgentGateway,
      'startSession' | 'awaitSettled' | 'listSessions' | 'respondPermission'
    >,
  ) {
    this.providerStore = new RepositoryProviderStore(userDataPath);
    this.profileStore = new RepositoryProfileStore(userDataPath);
    this.graphStore = new GraphReviewStore(userDataPath);
    this.agentReviewStore = new Poc3AgentReviewStore(userDataPath);
    this.agentReviewCoordinator = this.agentGateway
      ? new Poc3AgentReviewCoordinator({
          agentGateway: this.agentGateway,
          store: this.agentReviewStore,
        })
      : null;
    this.analysisCoordinator = new AnalysisCoordinator(this.graphStore, (event) =>
      this.emitGraphAnalysisEvent(event),
    );
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
    const profilesById = new Map(
      this.profileStore.list().map((profile) => [profile.repositoryProfileId, profile] as const),
    );

    return this.graphStore
      .listWorkspaces()
      .filter((workspace) => this.isWorkspaceSelectable(workspace.reviewWorkspaceId))
      .map((workspace) => {
        const profile = profilesById.get(workspace.repositoryProfileId);

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
        };
      });
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

    const workspace = this.graphStore.getWorkspace(reviewWorkspaceId);
    if (!workspace) {
      return {
        ok: false,
        reviewWorkspaceId,
        reason: 'notFound',
        message: 'Review Workspace が見つかりません。',
      };
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
      this.clearWorkspaceCaches(reviewWorkspaceId);
      return { ok: true, reviewWorkspaceId };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'git worktree remove が失敗しました。';
      return {
        ok: false,
        reviewWorkspaceId,
        reason:
          !force && isForceRecoverableWorktreeRemoveError(message) ? 'forceRequired' : 'gitFailed',
        message,
      };
    } finally {
      if (this.removingWorkspaceId === reviewWorkspaceId) {
        this.removingWorkspaceId = null;
      }
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
    return {
      runs: this.agentReviewStore.listRuns(input.reviewWorkspaceId.trim()),
    };
  }

  private async finalizeAgentReviewRun(runId: string): Promise<void> {
    await this.awaitAgentReviewResult({ runId });
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

  dispose(): void {
    this.renderSnapshotCache.clear();
    this.providerStore.close();
    this.profileStore.close();
    this.graphStore.close();
    this.agentReviewStore.close();
  }

  private toListItem(workspace: ReviewWorkspace): ReviewWorkspaceListItem {
    const profile = this.profileStore.get(workspace.repositoryProfileId);
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
    };
  }

  private isWorkspaceSelectable(reviewWorkspaceId: string): boolean {
    const record = this.graphStore.getWorkspaceGraphRecord(
      reviewWorkspaceId,
      INITIAL_GRAPH_SCOPE_KEY,
    );
    return Boolean(
      record?.activeRevision && record.analysis?.status === 'completed' && record.graph,
    );
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
    const cacheKey = `${reviewWorkspaceId}::${scopeKey}::${graphSnapshotId}`;
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

    const agentFindingCounts = new Map<string, number>();
    if (record.activeRevision) {
      for (const thread of this.agentReviewStore.listThreadsForWorkspace({
        reviewWorkspaceId,
        revisionId: record.activeRevision.revisionId,
      })) {
        if (thread.nodeId) {
          agentFindingCounts.set(thread.nodeId, (agentFindingCounts.get(thread.nodeId) ?? 0) + 1);
        }
      }
    }

    const renderSnapshot = toRenderSnapshot(record.graph, record.layout, agentFindingCounts);
    this.renderSnapshotCache.set(cacheKey, renderSnapshot);
    return renderSnapshot;
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
      return {
        ...node,
        badges: {
          ...node.badges,
          findingCount,
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
