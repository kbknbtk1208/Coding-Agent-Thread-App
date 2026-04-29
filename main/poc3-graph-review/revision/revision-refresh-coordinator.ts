import { randomUUID } from 'crypto';
import type {
  RefreshWorkspaceRevisionsResult,
  RevisionRefreshEvent,
} from '../../../shared/poc3-contracts/graph-review-ipc';
import type { RepositoryProfile, RepositoryProvider } from '../../../shared/poc3-domain/repository';
import type { ReviewWorkspace } from '../../../shared/poc3-domain/review-workspace';
import type { RevisionContext } from '../../../shared/poc3-domain/revision';
import type { ReviewSourceSnapshot } from '../../../shared/poc3-domain/source-snapshot';
import type { RevisionRefreshSnapshot } from '../../../shared/poc3-domain/revision-commit';
import {
  assertCleanWorktree,
  checkoutDetachedHead,
  fetchHeadRef,
  verifyHeadSha,
} from '../workspace/worktree-manager';
import { fetchReviewSourceSnapshot } from '../source/review-source-gateway';
import { createQueuedInitialAnalysisRun } from '../analysis/analysis-coordinator';
import type { AnalysisCoordinator } from '../analysis/analysis-coordinator';
import type { GraphReviewStore } from '../store/graph-review-store';
import { RevisionViewBuilder } from './revision-view-builder';
import { ThreadRetentionService } from './thread-retention-service';

function nowIso(): string {
  return new Date().toISOString();
}

export interface RevisionRefreshCoordinatorDeps {
  graphStore: GraphReviewStore;
  analysisCoordinator: AnalysisCoordinator;
  viewBuilder: RevisionViewBuilder;
  threadRetention: ThreadRetentionService;
  emit: (event: RevisionRefreshEvent) => void;
  resolveProvider(workspace: ReviewWorkspace): RepositoryProvider | null;
  resolveProviderToken(provider: RepositoryProvider): string | null;
  resolveProfile(workspace: ReviewWorkspace): RepositoryProfile | null;
}

export class RevisionRefreshCoordinator {
  private readonly runningWorkspaceIds = new Set<string>();

  constructor(private readonly deps: RevisionRefreshCoordinatorDeps) {}

  isRefreshing(reviewWorkspaceId: string): boolean {
    return this.runningWorkspaceIds.has(reviewWorkspaceId);
  }

  async refresh(reviewWorkspaceId: string): Promise<RefreshWorkspaceRevisionsResult> {
    if (this.runningWorkspaceIds.has(reviewWorkspaceId)) {
      const view = this.deps.viewBuilder.build(reviewWorkspaceId);
      return {
        ok: false,
        reason: 'sourceFetchFailed',
        message: 'この Workspace は refresh 実行中です。',
        refresh: null,
        view,
      };
    }

    const workspace = this.deps.graphStore.getWorkspace(reviewWorkspaceId);
    if (!workspace) {
      return {
        ok: false,
        reason: 'workspaceNotFound',
        message: 'Review Workspace が見つかりません。',
        refresh: null,
        view: null,
      };
    }
    const previousActive = this.deps.graphStore.getActiveRevision(reviewWorkspaceId);
    const refresh = this.saveAndEmit({
      refreshId: randomUUID(),
      reviewWorkspaceId,
      status: 'refreshing',
      previousHeadSha: previousActive?.headSha ?? workspace.headSha,
      latestHeadSha: null,
      createdRevisionId: null,
      message: 'Provider から最新 revision を取得しています。',
      startedAt: nowIso(),
      completedAt: null,
    });

    this.runningWorkspaceIds.add(reviewWorkspaceId);
    try {
      const provider = this.deps.resolveProvider(workspace);
      if (!provider) {
        return this.fail('providerUnavailable', refresh, 'Repository Provider が見つかりません。');
      }
      const token = this.deps.resolveProviderToken(provider);
      if (!token) {
        return this.fail('tokenNotFound', refresh, 'Provider token を解決できませんでした。');
      }
      const profile = this.deps.resolveProfile(workspace);
      if (!profile) {
        return this.fail('providerUnavailable', refresh, 'Repository Profile が見つかりません。');
      }

      let snapshot: Awaited<ReturnType<typeof fetchReviewSourceSnapshot>>;
      try {
        snapshot = await fetchReviewSourceSnapshot({
          provider: workspace.provider,
          baseUrl: provider.baseUrl,
          token,
          repositoryPath:
            workspace.provider === 'github'
              ? this.repositoryPathForProfile(profile)
              : profile.repoLocator.kind === 'gitlab'
                ? profile.repoLocator.projectPathOrId
                : this.repositoryPathForProfile(profile),
          reviewId: workspace.reviewId,
        });
      } catch (err) {
        return this.fail(
          'sourceFetchFailed',
          refresh,
          err instanceof Error ? err.message : 'Review source の取得に失敗しました。',
        );
      }

      const existing = this.deps.graphStore.getRevisionByIdentity({
        reviewWorkspaceId,
        provider: workspace.provider,
        reviewId: workspace.reviewId,
        baseSha: snapshot.baseSha,
        startSha: snapshot.startSha,
        headSha: snapshot.headSha,
        diffVersion: snapshot.diffVersion,
      });

      if (existing && previousActive?.revisionId === existing.revisionId) {
        this.deps.graphStore.saveRevisionCommits({
          reviewWorkspaceId,
          provider: workspace.provider,
          reviewId: workspace.reviewId,
          revisionId: existing.revisionId,
          activeHeadSha: existing.headSha,
          commits: snapshot.commits,
        });
        const completed = this.saveAndEmit({
          ...refresh,
          status: 'completed',
          latestHeadSha: snapshot.headSha,
          message: '最新 revision は取得済みです。',
          completedAt: nowIso(),
        });
        return {
          ok: true,
          refresh: completed,
          view: this.deps.viewBuilder.build(reviewWorkspaceId)!,
          graphAnalysis: null,
        };
      }

      try {
        await assertCleanWorktree(workspace.worktreePath);
        await fetchHeadRef(
          profile.localClonePath,
          snapshot.sourceBranchName,
          snapshot.headSha,
          (line) => this.emitLog(refresh.refreshId, line),
        );
        await checkoutDetachedHead(workspace.worktreePath, snapshot.headSha, (line) =>
          this.emitLog(refresh.refreshId, line),
        );
        await verifyHeadSha(workspace.worktreePath, snapshot.headSha, (line) =>
          this.emitLog(refresh.refreshId, line),
        );
      } catch (err) {
        return this.fail(
          'worktreeUpdateFailed',
          refresh,
          err instanceof Error ? err.message : 'worktree の更新に失敗しました。',
        );
      }

      const persistedAt = nowIso();
      if (!this.deps.graphStore.getWorkspace(reviewWorkspaceId)) {
        return this.fail(
          'workspaceNotFound',
          refresh,
          'Refresh 中に Review Workspace が削除されました。',
        );
      }
      const revisionId = existing?.revisionId ?? randomUUID();
      const revision: RevisionContext = {
        revisionId,
        reviewWorkspaceId,
        provider: workspace.provider,
        reviewId: workspace.reviewId,
        baseSha: snapshot.baseSha,
        headSha: snapshot.headSha,
        startSha: snapshot.startSha,
        sourceBranchName: snapshot.sourceBranchName,
        diffVersion: snapshot.diffVersion,
        isActive: true,
        status: 'active',
        createdAt: existing?.createdAt ?? persistedAt,
        updatedAt: persistedAt,
      };
      const nextWorkspace: ReviewWorkspace = {
        ...workspace,
        title: snapshot.title,
        baseSha: snapshot.baseSha,
        headSha: snapshot.headSha,
        sourceBranchName: snapshot.sourceBranchName,
        updatedAt: persistedAt,
      };
      const sourceSnapshot: ReviewSourceSnapshot = {
        sourceSnapshotId: randomUUID(),
        revisionId,
        provider: workspace.provider,
        reviewId: workspace.reviewId,
        title: snapshot.title,
        description: snapshot.description,
        baseSha: snapshot.baseSha,
        headSha: snapshot.headSha,
        startSha: snapshot.startSha,
        diffVersion: snapshot.diffVersion,
        changedFiles: snapshot.changedFiles,
        remoteThreadsSummary: [],
        createdAt: persistedAt,
        updatedAt: persistedAt,
      };
      const blockingDiagnostic = snapshot.diagnostics.find(
        (diagnostic) =>
          diagnostic.code === 'CHANGED_FILES_LIMIT_EXCEEDED' ||
          diagnostic.code === 'DIFF_TRUNCATED',
      );
      const analysisRun = {
        ...createQueuedInitialAnalysisRun(revisionId),
        status: blockingDiagnostic ? ('failed' as const) : ('queued' as const),
        errorMessage: blockingDiagnostic?.message ?? null,
        completedAt: blockingDiagnostic ? persistedAt : null,
        progress:
          snapshot.diagnostics.length > 0 ? { sourceDiagnostics: snapshot.diagnostics } : {},
      };
      this.deps.graphStore.saveRevisionBundle({
        workspace: nextWorkspace,
        previousActiveRevisionId: previousActive?.revisionId ?? null,
        revision,
        sourceSnapshot,
        analysisRun,
        commits: snapshot.commits,
      });

      const knownHeadShas = new Set(snapshot.commits.map((commit) => commit.sha));
      this.deps.graphStore.markRevisionsOrphaned({
        reviewWorkspaceId,
        missingHeadShas: this.deps.graphStore
          .listRevisions(reviewWorkspaceId)
          .filter((item) => !item.isActive && !knownHeadShas.has(item.headSha))
          .map((item) => item.headSha),
      });

      let graphAnalysis = analysisRun;
      if (blockingDiagnostic) {
        graphAnalysis = analysisRun;
      } else {
        try {
          this.deps.analysisCoordinator.enqueueInitialGraphAnalysis(
            analysisRun.analysisRunId,
            revisionId,
          );
        } catch (err) {
          return this.fail(
            'analysisEnqueueFailed',
            refresh,
            err instanceof Error ? err.message : 'Graph analysis の開始に失敗しました。',
          );
        }
      }
      const completed = this.saveAndEmit({
        ...refresh,
        status: blockingDiagnostic ? 'failed' : 'analysisQueued',
        latestHeadSha: snapshot.headSha,
        createdRevisionId: revisionId,
        message: blockingDiagnostic?.message ?? '新しい revision を保存しました。',
        completedAt: nowIso(),
      });
      return {
        ok: true,
        refresh: completed,
        view: this.deps.viewBuilder.build(reviewWorkspaceId)!,
        graphAnalysis,
      };
    } finally {
      this.runningWorkspaceIds.delete(reviewWorkspaceId);
    }
  }

  private repositoryPathForProfile(profile: RepositoryProfile): string {
    if (profile.repoLocator.kind === 'github') {
      return `${profile.repoLocator.owner}/${profile.repoLocator.repo}`;
    }
    return profile.originUrl;
  }

  private fail(
    reason: Exclude<RefreshWorkspaceRevisionsResult, { ok: true }>['reason'],
    refresh: RevisionRefreshSnapshot,
    message: string,
  ): Exclude<RefreshWorkspaceRevisionsResult, { ok: true }> {
    const failed = this.saveAndEmit({
      ...refresh,
      status: 'failed',
      message,
      completedAt: nowIso(),
    });
    return {
      ok: false,
      reason,
      message,
      refresh: failed,
      view: this.deps.viewBuilder.build(refresh.reviewWorkspaceId),
    };
  }

  private saveAndEmit(snapshot: RevisionRefreshSnapshot): RevisionRefreshSnapshot {
    const saved = this.deps.graphStore.saveRevisionRefreshRun(snapshot);
    this.deps.emit({ type: 'revision.refresh.snapshot', refresh: saved });
    return saved;
  }

  private emitLog(refreshId: string, line: string): void {
    this.deps.emit({ type: 'revision.refresh.log', refreshId, line, updatedAt: nowIso() });
  }
}
