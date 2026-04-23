import path from 'path';
import { randomUUID } from 'crypto';
import type { RepositoryProvider, RepositoryProfile } from '../../../shared/poc3-domain/repository';
import type { AnalysisRunSnapshot } from '../../../shared/poc3-domain/graph';
import type { RevisionContext } from '../../../shared/poc3-domain/revision';
import type { ReviewSourceSnapshot } from '../../../shared/poc3-domain/source-snapshot';
import type {
  ReviewWorkspace,
  ReviewWorkspaceCreationJobSnapshot,
  ReviewWorkspaceTarget,
  WorkspaceCreationEvent,
  WorkspaceCreationPhase,
} from '../../../shared/poc3-domain/review-workspace';
import {
  addWorktree,
  ensureDirectoryExists,
  fetchHeadRef,
  planWorktreePath,
  verifyHeadSha,
} from './worktree-manager';
import { runSetupScript } from './setup-script-runner';
import { fetchReviewSourceSnapshot } from '../source/review-source-gateway';
import { createQueuedInitialAnalysisRun } from '../analysis/analysis-coordinator';
import type { InitialWorkspaceBundle } from '../store/graph-review-store';

const MAX_LOG_LINES = 500;

export interface CreationJobInputs {
  jobId: string;
  reviewUrl: string;
  repositoryProfileId: string;
  target: ReviewWorkspaceTarget;
  provider: RepositoryProvider;
  profile: RepositoryProfile;
  providerToken: string;
}

export interface ReviewWorkspaceCreationCoordinatorDeps {
  emit: (event: WorkspaceCreationEvent) => void;
  saveInitialWorkspaceBundle: (bundle: InitialWorkspaceBundle) => void;
  enqueueInitialGraphAnalysis: (analysisRunId: string, revisionId: string) => void;
}

interface JobState {
  snapshot: ReviewWorkspaceCreationJobSnapshot;
}

function nowIso(): string {
  return new Date().toISOString();
}

function repoNameFromLabel(label: string): string {
  const segments = label.split('/').filter(Boolean);
  return segments[segments.length - 1] ?? label.replace(/[^a-zA-Z0-9._-]/g, '-');
}

export class ReviewWorkspaceCreationCoordinator {
  private readonly jobs: Map<string, JobState> = new Map();

  constructor(private readonly deps: ReviewWorkspaceCreationCoordinatorDeps) {}

  listJobs(): ReviewWorkspaceCreationJobSnapshot[] {
    return Array.from(this.jobs.values())
      .map((job) => job.snapshot)
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }

  getJob(jobId: string): ReviewWorkspaceCreationJobSnapshot | null {
    return this.jobs.get(jobId)?.snapshot ?? null;
  }

  startJob(inputs: CreationJobInputs): ReviewWorkspaceCreationJobSnapshot {
    const timestamp = nowIso();
    const initialSnapshot: ReviewWorkspaceCreationJobSnapshot = {
      jobId: inputs.jobId,
      reviewUrl: inputs.target.reviewUrl,
      repositoryProfileId: inputs.target.repositoryProfileId,
      repositoryLabel: inputs.target.repositoryLabel,
      worktreePath: null,
      status: 'queued',
      phase: 'resolveTarget',
      latestLogLine: null,
      logLines: [],
      errorMessage: null,
      reviewWorkspaceId: null,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    this.jobs.set(inputs.jobId, { snapshot: initialSnapshot });
    this.emitSnapshot(inputs.jobId);

    void this.runJob(inputs).catch((err) => {
      this.fail(inputs.jobId, err instanceof Error ? err.message : String(err));
    });

    return initialSnapshot;
  }

  private updateSnapshot(jobId: string, patch: Partial<ReviewWorkspaceCreationJobSnapshot>): void {
    const job = this.jobs.get(jobId);
    if (!job) {
      return;
    }
    job.snapshot = {
      ...job.snapshot,
      ...patch,
      updatedAt: nowIso(),
    };
    this.emitSnapshot(jobId);
  }

  private emitSnapshot(jobId: string): void {
    const job = this.jobs.get(jobId);
    if (!job) {
      return;
    }
    this.deps.emit({ type: 'snapshot', job: job.snapshot });
  }

  private appendLog(jobId: string, line: string): void {
    const job = this.jobs.get(jobId);
    if (!job) {
      return;
    }
    const nextLog = [...job.snapshot.logLines, line];
    if (nextLog.length > MAX_LOG_LINES) {
      nextLog.splice(0, nextLog.length - MAX_LOG_LINES);
    }
    const timestamp = nowIso();
    job.snapshot = {
      ...job.snapshot,
      logLines: nextLog,
      latestLogLine: line,
      updatedAt: timestamp,
    };
    this.deps.emit({ type: 'log', jobId, line, updatedAt: timestamp });
  }

  private setPhase(jobId: string, phase: WorkspaceCreationPhase): void {
    this.updateSnapshot(jobId, { phase, status: 'running' });
  }

  private fail(jobId: string, message: string): void {
    const job = this.jobs.get(jobId);
    if (!job) {
      return;
    }
    this.appendLog(jobId, `[error] ${message}`);
    this.updateSnapshot(jobId, {
      status: 'failed',
      errorMessage: message,
    });
  }

  private async runJob(inputs: CreationJobInputs): Promise<void> {
    const { jobId, target, profile, provider, providerToken } = inputs;
    const onLog = (line: string) => this.appendLog(jobId, line);

    this.updateSnapshot(jobId, { status: 'running', phase: 'resolveTarget' });
    onLog(`[resolveTarget] repository=${target.repositoryLabel} review=${target.reviewId}`);

    this.setPhase(jobId, 'loadSourceSnapshot');
    onLog('[loadSourceSnapshot] fetching review source snapshot...');
    const snapshot = await fetchReviewSourceSnapshot({
      provider: target.provider,
      baseUrl: provider.baseUrl,
      token: providerToken,
      repositoryPath:
        target.provider === 'github'
          ? target.repositoryLabel
          : profile.repoLocator.kind === 'gitlab'
            ? profile.repoLocator.projectPathOrId
            : target.repositoryLabel,
      reviewId: target.reviewId,
    });
    onLog(
      `[loadSourceSnapshot] headSha=${snapshot.headSha} baseSha=${snapshot.baseSha} branch=${snapshot.sourceBranchName ?? '(detached)'}`,
    );

    this.setPhase(jobId, 'fetchSource');
    await fetchHeadRef(profile.localClonePath, snapshot.sourceBranchName, snapshot.headSha, onLog);

    this.setPhase(jobId, 'createWorktree');
    const reviewKind: 'pr' | 'mr' = target.provider === 'github' ? 'pr' : 'mr';
    const { worktreePath } = planWorktreePath({
      worktreeRootPath: profile.worktreeRootPath,
      repoName: repoNameFromLabel(target.repositoryLabel),
      reviewKind,
      reviewId: target.reviewId,
      headSha: snapshot.headSha,
    });
    await ensureDirectoryExists(path.dirname(worktreePath));
    await addWorktree(profile.localClonePath, worktreePath, snapshot.headSha, onLog);
    this.updateSnapshot(jobId, { worktreePath });

    this.setPhase(jobId, 'verifyHead');
    await verifyHeadSha(worktreePath, snapshot.headSha, onLog);

    this.setPhase(jobId, 'runSetupScript');
    if (target.setupScript && target.setupScript.scriptText.trim()) {
      const result = await runSetupScript(
        {
          script: target.setupScript,
          worktreePath,
          worktreeRootPath: profile.worktreeRootPath,
        },
        onLog,
      );
      if (result.code !== 0) {
        throw new Error(`setup script が失敗しました (exit ${result.code})。`);
      }
      onLog('[runSetupScript] setup script completed.');
    } else {
      onLog('[runSetupScript] setup script 未設定。スキップします。');
    }

    this.setPhase(jobId, 'persistWorkspace');
    const reviewWorkspaceId = randomUUID();
    const persistedAt = nowIso();
    const persisted: ReviewWorkspace = {
      reviewWorkspaceId,
      repositoryProfileId: target.repositoryProfileId,
      provider: target.provider,
      reviewUrl: target.reviewUrl,
      reviewId: target.reviewId,
      title: snapshot.title,
      baseSha: snapshot.baseSha,
      headSha: snapshot.headSha,
      sourceBranchName: snapshot.sourceBranchName,
      worktreePath,
      setupStatus:
        target.setupScript && target.setupScript.scriptText.trim() ? 'completed' : 'pending',
      status: 'active',
      createdAt: persistedAt,
      updatedAt: persistedAt,
    };
    const revisionId = randomUUID();
    const revision: RevisionContext = {
      revisionId,
      reviewWorkspaceId,
      provider: target.provider,
      reviewId: target.reviewId,
      baseSha: snapshot.baseSha,
      headSha: snapshot.headSha,
      startSha: snapshot.startSha,
      sourceBranchName: snapshot.sourceBranchName,
      diffVersion: snapshot.diffVersion,
      isActive: true,
      status: 'active',
      createdAt: persistedAt,
      updatedAt: persistedAt,
    };
    const sourceSnapshot: ReviewSourceSnapshot = {
      sourceSnapshotId: randomUUID(),
      revisionId,
      provider: target.provider,
      reviewId: target.reviewId,
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
    const sourceDiagnostics = snapshot.diagnostics;
    const blockingSourceDiagnostic = sourceDiagnostics.find(
      (diagnostic) =>
        diagnostic.code === 'CHANGED_FILES_LIMIT_EXCEEDED' || diagnostic.code === 'DIFF_TRUNCATED',
    );
    const analysisRun: AnalysisRunSnapshot = {
      ...createQueuedInitialAnalysisRun(revisionId),
      status: blockingSourceDiagnostic ? 'failed' : 'queued',
      errorMessage: blockingSourceDiagnostic?.message ?? null,
      completedAt: blockingSourceDiagnostic ? persistedAt : null,
      progress: sourceDiagnostics.length > 0 ? { sourceDiagnostics } : {},
    };
    this.deps.saveInitialWorkspaceBundle({
      workspace: persisted,
      revision,
      sourceSnapshot,
      analysisRun,
    });
    onLog(`[persistWorkspace] reviewWorkspaceId=${reviewWorkspaceId}`);
    this.updateSnapshot(jobId, { reviewWorkspaceId });

    this.setPhase(jobId, 'startAnalysis');
    if (blockingSourceDiagnostic) {
      onLog(`[startAnalysis] graph analysis skipped: ${blockingSourceDiagnostic.code}`);
    } else {
      this.deps.enqueueInitialGraphAnalysis(analysisRun.analysisRunId, revisionId);
      onLog(`[startAnalysis] graph analysis queued: ${analysisRun.analysisRunId}`);
    }

    this.setPhase(jobId, 'done');
    this.updateSnapshot(jobId, { status: 'completed' });
    onLog('[done] Review Workspace を作成しました。');
  }
}
